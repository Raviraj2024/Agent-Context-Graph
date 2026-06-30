import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { typescriptAdapter } from "../src/parsers/typescriptAdapter.js";
import { pythonAdapter } from "../src/parsers/pythonAdapter.js";

describe("language adapters", () => {
  it("extracts TypeScript functions, exports, and imports", () => {
    const file = join(process.cwd(), "test/fixtures/sample-ts-project/src/index.ts");
    const parsed = typescriptAdapter.parseFile({
      projectRoot: process.cwd(),
      filePath: file,
      relativePath: "src/index.ts",
      source: readFileSync(file, "utf8"),
      indexedAt: new Date().toISOString()
    });
    expect(parsed.nodes.some((node) => node.qualifiedName === "src/index.ts::main")).toBe(true);
    expect(parsed.imports).toContain("./util");
  });

  it("extracts Python functions and imports", () => {
    const file = join(process.cwd(), "test/fixtures/sample-py-project/app/main.py");
    const parsed = pythonAdapter.parseFile({
      projectRoot: process.cwd(),
      filePath: file,
      relativePath: "app/main.py",
      source: readFileSync(file, "utf8"),
      indexedAt: new Date().toISOString()
    });
    expect(parsed.nodes.some((node) => node.qualifiedName === "app/main.py::main")).toBe(true);
    expect(parsed.imports).toContain("app.util");
  });
});
