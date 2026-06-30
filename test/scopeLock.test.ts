import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../src/graph/schema.js";
import { GraphStore } from "../src/graph/store.js";
import { stableId } from "../src/parsers/shared.js";
import { classifyChange, createTaskScope } from "../src/scopeLock/engine.js";

function node(id: string, filePath: string, tags: string[] = []): GraphNode {
  return {
    id,
    type: "file",
    name: filePath,
    qualifiedName: filePath,
    filePath,
    language: "typescript",
    startLine: 1,
    endLine: 1,
    signature: null,
    docstring: null,
    contentHash: "hash",
    tags,
    lastIndexedAt: new Date().toISOString()
  };
}

describe("scope lock classification", () => {
  it("covers hard stop, declared, child, adjacent, and fallback precedence", () => {
    const root = mkdtempSync(join(tmpdir(), "acg-scope-"));
    const store = new GraphStore(root);
    const parent = node("parent", "src/feature.ts");
    const child = { ...node("child", "src/feature.ts"), type: "function" as const, qualifiedName: "src/feature.ts::run" };
    const adjacent = node("adjacent", "src/helper.ts");
    const hard = node("hard", "src/auth/session.ts");
    const publicApi = node("public", "src/public.ts", ["public-api"]);
    const edges: GraphEdge[] = [
      { id: stableId("parent", "contains", "child"), sourceId: "parent", targetId: "child", relation: "contains", confidence: "static", reason: null },
      { id: stableId("parent", "imports", "adjacent"), sourceId: "parent", targetId: "adjacent", relation: "imports", confidence: "static", reason: null }
    ];
    store.replaceAll([parent, child, adjacent, hard, publicApi], edges);
    const scope = createTaskScope("session", "edit feature", ["parent"]);

    expect(classifyChange(root, store, scope, "src/auth/session.ts").classification).toBe("hard_stop");
    expect(classifyChange(root, store, scope, "src/public.ts").classification).toBe("hard_stop");
    expect(classifyChange(root, store, scope, "src/feature.ts").classification).toBe("auto_allowed");
    expect(classifyChange(root, store, scope, "src/feature.ts::run").classification).toBe("auto_allowed");
    expect(classifyChange(root, store, scope, "src/helper.ts").classification).toBe("needs_approval");
    expect(classifyChange(root, store, scope, "src/other.ts").classification).toBe("needs_approval");
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
});
