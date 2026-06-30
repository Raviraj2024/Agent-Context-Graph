import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/loadConfig.js";
import type { GraphNode } from "../graph/schema.js";
import { GraphStore } from "../graph/store.js";
import type { ScopeDecision, TaskScope } from "./types.js";

function globMatch(path: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(path);
}

function isHardStop(projectRoot: string, nodeOrPath: string, node: GraphNode | null): string | null {
  const config = loadConfig(projectRoot);
  const lowered = nodeOrPath.toLowerCase();
  const nodePath = node?.filePath?.toLowerCase() ?? lowered;

  if (config.hardStopPathFragments.some((fragment) => nodePath.includes(fragment.toLowerCase()))) {
    return "Target matches a configured security-sensitive path fragment.";
  }
  if (config.hardStopGlobs.some((glob) => globMatch(nodePath, glob.toLowerCase()))) {
    return "Target matches a configured security-sensitive path pattern.";
  }
  if (node?.tags.some((tag) => config.publicApiTags.includes(tag))) {
    return "Target is tagged as a public API contract.";
  }
  return null;
}

export function createTaskScope(sessionId: string, taskDescription: string, declaredNodeIds: string[]): TaskScope {
  return {
    scopeId: randomUUID(),
    sessionId,
    createdAt: new Date().toISOString(),
    taskDescription,
    declaredNodeIds,
    status: "active",
    decisions: []
  };
}

export function classifyChange(projectRoot: string, store: GraphStore, scope: TaskScope, nodeOrPath: string): ScopeDecision {
  const node = store.getNode(nodeOrPath);
  const hardStopReason = isHardStop(projectRoot, nodeOrPath, node);
  if (hardStopReason) {
    return {
      nodeOrPath,
      classification: "hard_stop",
      reason: hardStopReason,
      resolvedAt: null,
      approved: null
    };
  }

  if (node && scope.declaredNodeIds.includes(node.id)) {
    return {
      nodeOrPath,
      classification: "auto_allowed",
      reason: "Target node is explicitly declared in the active task scope.",
      resolvedAt: new Date().toISOString(),
      approved: true
    };
  }

  if (node) {
    for (const declared of scope.declaredNodeIds) {
      const contains = store
        .edgesForNode(declared)
        .some((edge) => edge.relation === "contains" && edge.sourceId === declared && edge.targetId === node.id);
      if (contains) {
        return {
          nodeOrPath,
          classification: "auto_allowed",
          reason: "Target node is a direct child of a declared node.",
          resolvedAt: new Date().toISOString(),
          approved: true
        };
      }
    }

    for (const declared of scope.declaredNodeIds) {
      const adjacent = store
        .adjacent(declared, ["calls", "imports", "inherits"])
        .some((edge) => edge.sourceId === node.id || edge.targetId === node.id);
      if (adjacent) {
        return {
          nodeOrPath,
          classification: "needs_approval",
          reason: "Target is adjacent to the declared scope via calls/imports/inherits but was not declared.",
          resolvedAt: null,
          approved: null
        };
      }
    }
  }

  return {
    nodeOrPath,
    classification: "needs_approval",
    reason: "Target is outside the declared task scope.",
    resolvedAt: null,
    approved: null
  };
}

export function classifyChanges(
  projectRoot: string,
  store: GraphStore,
  scope: TaskScope,
  nodeOrPaths: string[]
): ScopeDecision[] {
  const decisions = nodeOrPaths.map((item) => classifyChange(projectRoot, store, scope, item));
  scope.decisions.push(...decisions);
  return decisions;
}
