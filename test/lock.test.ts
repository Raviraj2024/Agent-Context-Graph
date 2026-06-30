import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireCacheLock, CacheLockError, lockPath } from "../src/graph/store.js";

describe("cache lock", () => {
  it("clears stale locks and rejects live locks", () => {
    const root = mkdtempSync(join(tmpdir(), "acg-lock-"));
    mkdirSync(join(root, ".agent-context-graph"), { recursive: true });
    writeFileSync(lockPath(root), JSON.stringify({ pid: 99999999, timestamp: new Date().toISOString() }));
    const release = acquireCacheLock(root);
    expect(() => acquireCacheLock(root)).toThrow(CacheLockError);
    release();
    rmSync(root, { recursive: true, force: true });
  });
});
