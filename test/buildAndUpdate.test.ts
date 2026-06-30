import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAndPersistGraph } from "../src/graph/builder.js";
import { initOrRefreshGraph } from "../src/graph/updater.js";

describe("graph build and refresh", () => {
  it("builds a graph and reports changed files on refresh", () => {
    const root = mkdtempSync(join(tmpdir(), "acg-build-"));
    cpSync(join(process.cwd(), "test/fixtures/sample-ts-project"), root, { recursive: true });
    const built = buildAndPersistGraph(root);
    expect(built.snapshot.nodes.some((node) => node.qualifiedName === "src/util.ts::greet")).toBe(true);

    const utilPath = join(root, "src/util.ts");
    writeFileSync(utilPath, `${readFileSync(utilPath, "utf8")}\nexport const extra = 1;\n`);
    const refreshed = initOrRefreshGraph(root);
    expect(refreshed.mode).toBe("refreshed");
    expect(refreshed.changedFiles).toContain("src/util.ts");
    rmSync(root, { recursive: true, force: true });
  });
});
