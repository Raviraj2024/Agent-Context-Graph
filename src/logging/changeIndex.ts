import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ChangeSummary {
  timestamp: string;
  scopeId: string | null;
  filePath: string | null;
  action: string;
  summary: string;
  reasoning: string;
  approvedBy: "auto" | "user" | null;
}

export function changeIndexPath(projectRoot: string): string {
  return join(projectRoot, ".agent-context-graph", "change-index.json");
}

export function appendChangeIndex(projectRoot: string, identifier: string, change: ChangeSummary): void {
  const path = changeIndexPath(projectRoot);
  mkdirSync(join(projectRoot, ".agent-context-graph"), { recursive: true });
  const index = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, ChangeSummary[]>) : {};
  index[identifier] = [...(index[identifier] ?? []), change].slice(-50);
  writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function getChangeHistory(projectRoot: string, identifier: string): ChangeSummary[] {
  const path = changeIndexPath(projectRoot);
  if (!existsSync(path)) {
    return [];
  }
  const index = JSON.parse(readFileSync(path, "utf8")) as Record<string, ChangeSummary[]>;
  return index[identifier] ?? [];
}
