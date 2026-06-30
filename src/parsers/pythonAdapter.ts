import type { LanguageAdapter, ParsedFile } from "./LanguageAdapter.js";
import type { GraphEdge } from "../graph/schema.js";
import { containsEdge, extractLeadingDocstring, importEdge, lineRange, makeNode, stableId } from "./shared.js";

const IMPORT_RE = /^(?:from\s+([\w.]+)\s+import\s+.+|import\s+([\w.]+))/gm;
const CLASS_RE = /^\s*class\s+([A-Za-z_]\w*)(?:\(([^)]*)\))?:/gm;
const FUNCTION_RE = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?:/gm;

export const pythonAdapter: LanguageAdapter = {
  language: "python",
  extensions: [".py"],
  parseFile({ relativePath, source, indexedAt }): ParsedFile {
    const lines = source.split(/\r?\n/);
    const fileNode = makeNode({
      type: "file",
      name: relativePath.split("/").pop() ?? relativePath,
      qualifiedName: relativePath,
      filePath: relativePath,
      language: "python",
      startLine: 1,
      endLine: lines.length,
      sourceSlice: source,
      indexedAt
    });
    const nodes = [fileNode];
    const edges: GraphEdge[] = [];
    const imports: string[] = [];

    for (const match of source.matchAll(IMPORT_RE)) {
      imports.push(match[1] ?? match[2]);
    }

    for (const match of source.matchAll(CLASS_RE)) {
      const range = lineRange(source, match.index ?? 0, (match.index ?? 0) + match[0].length);
      const classNode = makeNode({
        type: "class",
        name: match[1],
        qualifiedName: `${relativePath}::${match[1]}`,
        filePath: relativePath,
        language: "python",
        startLine: range.startLine,
        endLine: range.endLine,
        signature: match[0],
        docstring: extractLeadingDocstring(lines, range.startLine),
        sourceSlice: match[0],
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
          reason: `Base class '${match[2]}' is resolved by name only.`
        });
      }
    }

    for (const match of source.matchAll(FUNCTION_RE)) {
      const range = lineRange(source, match.index ?? 0, (match.index ?? 0) + match[0].length);
      const fnNode = makeNode({
        type: "function",
        name: match[1],
        qualifiedName: `${relativePath}::${match[1]}`,
        filePath: relativePath,
        language: "python",
        startLine: range.startLine,
        endLine: range.endLine,
        signature: match[0],
        docstring: extractLeadingDocstring(lines, range.startLine),
        sourceSlice: match[0],
        indexedAt
      });
      nodes.push(fnNode);
      edges.push(containsEdge(fileNode.id, fnNode.id));
    }

    for (const imported of imports) {
      edges.push(importEdge(fileNode.id, stableId("import", imported), `Import target '${imported}' is resolved during graph build when possible.`));
    }

    return { nodes, edges, imports };
  }
};
