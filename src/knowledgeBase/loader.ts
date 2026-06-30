import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphEdge, GraphNode } from "../graph/schema.js";
import { containsEdge, makeNode } from "../parsers/shared.js";

export interface KnowledgeBaseLoad {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function contentDir(): string {
  const compiled = join(dirname(fileURLToPath(import.meta.url)), "content");
  if (existsSync(compiled)) {
    return compiled;
  }
  return join(process.cwd(), "src", "knowledgeBase", "content");
}

function domainFromFile(file: string): string {
  return file.replace(/\.md$/, "");
}

export function loadKnowledgeBase(indexedAt: string): KnowledgeBaseLoad {
  const standardsRoot = makeNode({
    type: "standard",
    name: "standards",
    qualifiedName: "standards",
    filePath: null,
    language: "markdown",
    startLine: null,
    endLine: null,
    tags: ["standards"],
    indexedAt
  });
  const nodes: GraphNode[] = [standardsRoot];
  const edges: GraphEdge[] = [{ ...containsEdge("ROOT", standardsRoot.id), sourceId: "ROOT" }];

  let files: string[] = [];
  try {
    files = readdirSync(contentDir()).filter((file) => file.endsWith(".md"));
  } catch {
    return { nodes, edges };
  }

  for (const file of files) {
    const domain = domainFromFile(file);
    const raw = readFileSync(join(contentDir(), file), "utf8");
    const sections = raw.split(/^##\s+/m);
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed || trimmed.startsWith("# ")) {
        continue;
      }
      const [headingLine, ...bodyLines] = trimmed.split(/\r?\n/);
      const heading = headingLine.trim();
      const body = bodyLines.join("\n").trim();
      const node = makeNode({
        type: "standard",
        name: heading,
        qualifiedName: `standards/${domain}::${heading}`,
        filePath: null,
        language: "markdown",
        startLine: null,
        endLine: null,
        docstring: body,
        tags: ["standards", domain],
        indexedAt
      });
      nodes.push(node);
      edges.push(containsEdge(standardsRoot.id, node.id));
    }
  }

  return { nodes, edges };
}
