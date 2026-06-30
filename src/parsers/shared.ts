import { createHash } from "node:crypto";
import type { GraphEdge, GraphNode, GraphNodeType } from "../graph/schema.js";
import { scrubSecrets } from "../logging/secretScrub.js";

export function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24);
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function lineRange(source: string, startIndex: number, endIndex: number): { startLine: number; endLine: number } {
  const before = source.slice(0, startIndex);
  const segment = source.slice(startIndex, endIndex);
  return {
    startLine: before.split(/\r?\n/).length,
    endLine: before.split(/\r?\n/).length + Math.max(0, segment.split(/\r?\n/).length - 1)
  };
}

export function makeNode(input: {
  type: GraphNodeType;
  name: string;
  qualifiedName: string;
  filePath: string | null;
  language: string | null;
  startLine: number | null;
  endLine: number | null;
  signature?: string | null;
  docstring?: string | null;
  sourceSlice?: string | null;
  tags?: string[];
  indexedAt: string;
}): GraphNode {
  return {
    id: stableId(input.filePath ?? "virtual", input.qualifiedName),
    type: input.type,
    name: input.name,
    qualifiedName: input.qualifiedName,
    filePath: input.filePath,
    language: input.language,
    startLine: input.startLine,
    endLine: input.endLine,
    signature: scrubSecrets(input.signature ?? null),
    docstring: scrubSecrets(input.docstring ?? null),
    contentHash: input.sourceSlice ? contentHash(input.sourceSlice) : null,
    tags: input.tags ?? [],
    lastIndexedAt: input.indexedAt
  };
}

export function containsEdge(sourceId: string, targetId: string): GraphEdge {
  return {
    id: stableId(sourceId, "contains", targetId),
    sourceId,
    targetId,
    relation: "contains",
    confidence: "static",
    reason: null
  };
}

export function importEdge(sourceId: string, targetId: string, reason: string | null = null): GraphEdge {
  return {
    id: stableId(sourceId, "imports", targetId),
    sourceId,
    targetId,
    relation: "imports",
    confidence: reason ? "inferred" : "static",
    reason
  };
}

export function extractLeadingDocstring(lines: string[], startLine: number): string | null {
  const previous = lines.slice(Math.max(0, startLine - 4), startLine - 1).join("\n").trim();
  const block = previous.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (block) {
    return block[1].replace(/^\s*\*\s?/gm, "").trim();
  }
  const commentLines = previous
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("//") || line.trim().startsWith("#"))
    .map((line) => line.replace(/^\s*(\/\/|#)\s?/, ""));
  return commentLines.length ? commentLines.join("\n").trim() : null;
}
