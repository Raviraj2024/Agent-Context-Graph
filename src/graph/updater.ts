import { join } from "node:path";
import { buildAndPersistGraph, fileHash, listIndexableFiles } from "./builder.js";
import { readSnapshotSync } from "./snapshot.js";

export interface RefreshResult {
  mode: "full_build" | "unchanged" | "refreshed";
  changedFiles: string[];
  nodeCount: number;
  edgeCount: number;
}

export function initOrRefreshGraph(projectRoot: string): RefreshResult {
  const existing = readSnapshotSync(projectRoot);
  if (existing.nodes.length === 0) {
    const built = buildAndPersistGraph(projectRoot);
    return {
      mode: "full_build",
      changedFiles: [],
      nodeCount: built.snapshot.nodes.length,
      edgeCount: built.snapshot.edges.length
    };
  }

  const snapshotFiles = new Map(
    existing.nodes
      .filter((node) => node.type === "file" && node.filePath)
      .map((node) => [node.filePath as string, node.contentHash])
  );
  const currentFiles = listIndexableFiles(projectRoot).map((path) => path.replace(projectRoot, "").replace(/^[/\\]/, "").replace(/\\/g, "/"));
  const changed = new Set<string>();

  for (const rel of currentFiles) {
    const hash = fileHash(join(projectRoot, rel));
    if (snapshotFiles.get(rel) !== hash) {
      changed.add(rel);
    }
  }
  for (const rel of snapshotFiles.keys()) {
    if (!currentFiles.includes(rel)) {
      changed.add(rel);
    }
  }

  if (changed.size === 0) {
    return { mode: "unchanged", changedFiles: [], nodeCount: existing.nodes.length, edgeCount: existing.edges.length };
  }

  const built = buildAndPersistGraph(projectRoot);
  return {
    mode: "refreshed",
    changedFiles: [...changed].sort(),
    nodeCount: built.snapshot.nodes.length,
    edgeCount: built.snapshot.edges.length
  };
}
