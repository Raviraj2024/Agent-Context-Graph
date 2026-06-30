import type { LanguageAdapter, ParsedFile } from "./LanguageAdapter.js";
import type { GraphEdge } from "../graph/schema.js";
import { containsEdge, extractLeadingDocstring, importEdge, lineRange, makeNode, stableId } from "./shared.js";

const IMPORT_RE = /import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']|export\s+[^'"]+\s+from\s+["']([^"']+)["']|require\(["']([^"']+)["']\)/g;
const CLASS_RE = /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
const FUNCTION_RE = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
const ARROW_RE = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
const EXPORT_RE = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;

export const typescriptAdapter: LanguageAdapter = {
  language: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  parseFile({ relativePath, source, indexedAt }): ParsedFile {
    const lines = source.split(/\r?\n/);
    const fileNode = makeNode({
      type: "file",
      name: relativePath.split("/").pop() ?? relativePath,
      qualifiedName: relativePath,
      filePath: relativePath,
      language: "typescript",
      startLine: 1,
      endLine: lines.length,
      sourceSlice: source,
      indexedAt
    });
    const nodes = [fileNode];
    const edges: GraphEdge[] = [];
    const imports: string[] = [];

    for (const match of source.matchAll(IMPORT_RE)) {
      imports.push(match[1] ?? match[2] ?? match[3]);
    }

    for (const match of source.matchAll(CLASS_RE)) {
      const range = lineRange(source, match.index ?? 0, (match.index ?? 0) + match[0].length);
      const classNode = makeNode({
        type: "class",
        name: match[1],
        qualifiedName: `${relativePath}::${match[1]}`,
        filePath: relativePath,
        language: "typescript",
        startLine: range.startLine,
        endLine: range.endLine,
        signature: match[0],
        docstring: extractLeadingDocstring(lines, range.startLine),
        sourceSlice: match[0],
        tags: source.includes(`export class ${match[1]}`) ? ["public-api"] : [],
        indexedAt
      });
      nodes.push(classNode);
      edges.push(containsEdge(fileNode.id, classNode.id));
      if (match[2]) {
        edges.push({
          id: stableId(classNode.id, "inherits", match[2]),
          sourceId: classNode.id,
          targetId: stableId(relativePath, match[2]),
          relation: "inherits",
          confidence: "inferred",
          reason: `Extends ${match[2]}, resolved by name only.`
        });
      }
    }

    for (const re of [FUNCTION_RE, ARROW_RE]) {
      for (const match of source.matchAll(re)) {
        const range = lineRange(source, match.index ?? 0, (match.index ?? 0) + match[0].length);
        const fnNode = makeNode({
          type: "function",
          name: match[1],
          qualifiedName: `${relativePath}::${match[1]}`,
          filePath: relativePath,
          language: "typescript",
          startLine: range.startLine,
          endLine: range.endLine,
          signature: match[0],
          docstring: extractLeadingDocstring(lines, range.startLine),
          sourceSlice: match[0],
          tags: match[0].startsWith("export") ? ["public-api"] : [],
          indexedAt
        });
        nodes.push(fnNode);
        edges.push(containsEdge(fileNode.id, fnNode.id));
      }
    }

    for (const match of source.matchAll(EXPORT_RE)) {
      if (nodes.some((node) => node.name === match[1] && node.type === "function")) {
        continue;
      }
      const range = lineRange(source, match.index ?? 0, (match.index ?? 0) + match[0].length);
      const exportNode = makeNode({
        type: "variable_export",
        name: match[1],
        qualifiedName: `${relativePath}::${match[1]}`,
        filePath: relativePath,
        language: "typescript",
        startLine: range.startLine,
        endLine: range.endLine,
        signature: match[0],
        sourceSlice: match[0],
        tags: ["public-api"],
        indexedAt
      });
      nodes.push(exportNode);
      edges.push(containsEdge(fileNode.id, exportNode.id));
    }

    for (const imported of imports) {
      edges.push(importEdge(fileNode.id, stableId("import", imported), `Import target '${imported}' is resolved during graph build when possible.`));
    }

    return { nodes, edges, imports };
  }
};
