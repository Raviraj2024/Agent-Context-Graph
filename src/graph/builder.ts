import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import type { AgentContextGraphConfig } from "../config/defaultConfig.js";
import { loadConfig } from "../config/loadConfig.js";
import { adapterForPath } from "../parsers/index.js";
import { containsEdge, contentHash, makeNode, stableId } from "../parsers/shared.js";
import { assertInsideProject } from "../security/pathSafety.js";
import type { GraphEdge, GraphNode, GraphSnapshot } from "./schema.js";
import { writeSnapshot } from "./snapshot.js";
import { GraphStore } from "./store.js";
import { loadKnowledgeBase } from "../knowledgeBase/loader.js";

export interface BuildResult {
  snapshot: GraphSnapshot;
  warnings: string[];
}

function normalizeRel(projectRoot: string, path: string): string {
  return relative(projectRoot, path).replace(/\\/g, "/");
}

function shouldExclude(relativePath: string, config: AgentContextGraphConfig): boolean {
  const parts = relativePath.split("/");
  return (
    parts.some((part) => config.excludeDirectories.includes(part)) ||
    config.excludeFiles.includes(parts.at(-1) ?? "") ||
    relativePath.startsWith(".agent-context-graph/")
  );
}

function isLikelyBinary(path: string): boolean {
  const binaryExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".wasm", ".sqlite"]);
  return binaryExts.has(extname(path).toLowerCase());
}

export function listIndexableFiles(projectRoot: string, config = loadConfig(projectRoot)): string[] {
  const root = assertInsideProject(projectRoot, projectRoot);
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = normalizeRel(root, full);
      if (shouldExclude(rel, config)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || isLikelyBinary(full)) {
        continue;
      }
      const stat = statSync(full);
      if (stat.size <= config.maxFileBytes && adapterForPath(full)) {
        files.push(full);
      }
    }
  }

  walk(root);
  return files.sort();
}

function addDirectoryNodes(projectRoot: string, nodes: GraphNode[], edges: GraphEdge[], indexedAt: string): void {
  const root = nodes[0];
  const directories = new Map<string, GraphNode>();

  for (const fileNode of nodes.filter((node) => node.type === "file" && node.filePath)) {
    const dir = dirname(fileNode.filePath ?? "").replace(/\\/g, "/");
    if (dir === ".") {
      edges.push(containsEdge(root.id, fileNode.id));
      continue;
    }

    const parts = dir.split("/");
    let current = "";
    let parent = root;
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      let dirNode = directories.get(current);
      if (!dirNode) {
        dirNode = makeNode({
          type: "directory",
          name: part,
          qualifiedName: current,
          filePath: current,
          language: null,
          startLine: null,
          endLine: null,
          indexedAt
        });
        directories.set(current, dirNode);
        edges.push(containsEdge(parent.id, dirNode.id));
      }
      parent = dirNode;
    }
    edges.push(containsEdge(parent.id, fileNode.id));
  }

  nodes.push(...directories.values());
}

function resolveImport(projectFiles: GraphNode[], fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = dirname(fromPath).replace(/\\/g, "/");
  const candidate = `${base}/${specifier}`.replace(/\/\.\//g, "/");
  const normalized = candidate.split("/").reduce<string[]>((acc, part) => {
    if (!part || part === ".") return acc;
    if (part === "..") acc.pop();
    else acc.push(part);
    return acc;
  }, []).join("/");
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}.py`,
    `${normalized}/index.ts`,
    `${normalized}/index.js`
  ];
  return projectFiles.find((node) => candidates.includes(node.filePath ?? ""))?.id ?? null;
}

export function buildGraph(projectRoot: string): BuildResult {
  const root = assertInsideProject(projectRoot, projectRoot);
  const indexedAt = new Date().toISOString();
  const rootNode = makeNode({
    type: "root",
    name: "project",
    qualifiedName: ".",
    filePath: null,
    language: null,
    startLine: null,
    endLine: null,
    indexedAt
  });
  const nodes: GraphNode[] = [rootNode];
  const edges: GraphEdge[] = [];
  const warnings: string[] = [];
  const importsByFile = new Map<string, string[]>();

  for (const fullPath of listIndexableFiles(root)) {
    const adapter = adapterForPath(fullPath);
    if (!adapter) {
      continue;
    }
    const relativePath = normalizeRel(root, fullPath);
    try {
      const source = readFileSync(fullPath, "utf8");
      const parsed = adapter.parseFile({ projectRoot: root, filePath: fullPath, relativePath, source, indexedAt });
      nodes.push(...parsed.nodes);
      edges.push(...parsed.edges.filter((edge) => edge.relation !== "imports"));
      importsByFile.set(relativePath, parsed.imports);
    } catch (error) {
      warnings.push(`Failed to parse ${relativePath}: ${(error as Error).message}`);
      nodes.push(
        makeNode({
          type: "file",
          name: relativePath.split("/").pop() ?? relativePath,
          qualifiedName: relativePath,
          filePath: relativePath,
          language: adapter.language,
          startLine: null,
          endLine: null,
          docstring: `Parse warning: ${(error as Error).message}`,
          sourceSlice: contentHash(relativePath),
          tags: ["parse-warning"],
          indexedAt
        })
      );
    }
  }

  addDirectoryNodes(root, nodes, edges, indexedAt);
  const fileNodes = nodes.filter((node) => node.type === "file");
  for (const [filePath, imports] of importsByFile.entries()) {
    const sourceNode = fileNodes.find((node) => node.filePath === filePath);
    if (!sourceNode) continue;
    for (const specifier of imports) {
      const targetId = resolveImport(fileNodes, filePath, specifier);
      edges.push({
        id: stableId(sourceNode.id, "imports", targetId ?? specifier),
        sourceId: sourceNode.id,
        targetId: targetId ?? stableId("external", specifier),
        relation: "imports",
        confidence: targetId ? "static" : "inferred",
        reason: targetId ? null : `External or unresolved import '${specifier}'.`
      });
    }
  }

  const kb = loadKnowledgeBase(indexedAt);
  nodes.push(...kb.nodes);
  edges.push(...kb.edges.map((edge) => (edge.sourceId === "ROOT" ? { ...edge, sourceId: rootNode.id } : edge)));

  return { snapshot: { nodes, edges }, warnings };
}

export function buildAndPersistGraph(projectRoot: string): BuildResult {
  const result = buildGraph(projectRoot);
  writeSnapshot(projectRoot, result.snapshot);
  const store = new GraphStore(projectRoot);
  try {
    store.replaceAll(result.snapshot.nodes, result.snapshot.edges);
  } finally {
    store.close();
  }
  return result;
}

export function fileHash(path: string): string | null {
  return existsSync(path) ? contentHash(readFileSync(path, "utf8")) : null;
}
