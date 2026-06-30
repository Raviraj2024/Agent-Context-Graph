import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { GraphEdge, GraphNode, GraphSnapshot } from "./schema.js";
import { scrubObject } from "../logging/secretScrub.js";

export function graphDir(projectRoot: string): string {
  return join(projectRoot, ".agent-context-graph", "graph");
}

export function nodesPath(projectRoot: string): string {
  return join(graphDir(projectRoot), "nodes.jsonl");
}

export function edgesPath(projectRoot: string): string {
  return join(graphDir(projectRoot), "edges.jsonl");
}

export function writeSnapshot(projectRoot: string, snapshot: GraphSnapshot): void {
  mkdirSync(graphDir(projectRoot), { recursive: true });
  const nodes = snapshot.nodes.map((node) => JSON.stringify(scrubObject(node))).join("\n");
  const edges = snapshot.edges.map((edge) => JSON.stringify(scrubObject(edge))).join("\n");
  writeFileSync(nodesPath(projectRoot), nodes ? `${nodes}\n` : "", "utf8");
  writeFileSync(edgesPath(projectRoot), edges ? `${edges}\n` : "", "utf8");
}

export function readSnapshotSync(projectRoot: string): GraphSnapshot {
  const nodeFile = nodesPath(projectRoot);
  const edgeFile = edgesPath(projectRoot);
  const nodes = existsSync(nodeFile)
    ? readFileSync(nodeFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as GraphNode)
    : [];
  const edges = existsSync(edgeFile)
    ? readFileSync(edgeFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as GraphEdge)
    : [];
  return { nodes, edges };
}

export async function readSnapshot(projectRoot: string): Promise<GraphSnapshot> {
  async function readJsonl<T>(path: string): Promise<T[]> {
    if (!existsSync(path)) {
      return [];
    }
    const items: T[] = [];
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.trim()) {
        items.push(JSON.parse(line) as T);
      }
    }
    return items;
  }

  return {
    nodes: await readJsonl<GraphNode>(nodesPath(projectRoot)),
    edges: await readJsonl<GraphEdge>(edgesPath(projectRoot))
  };
}
