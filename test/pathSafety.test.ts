import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertInsideProject, PathSafetyError } from "../src/security/pathSafety.js";

describe("path safety", () => {
  it("rejects traversal outside the project root", () => {
    const root = mkdtempSync(join(tmpdir(), "acg-path-"));
    expect(() => assertInsideProject(root, "../outside.txt")).toThrow(PathSafetyError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects symlink escape when the platform allows creating the link", () => {
    const root = mkdtempSync(join(tmpdir(), "acg-link-"));
    const outside = mkdtempSync(join(tmpdir(), "acg-outside-"));
    const target = join(outside, "secret.txt");
    writeFileSync(target, "secret");
    try {
      symlinkSync(target, join(root, "link.txt"));
      expect(() => assertInsideProject(root, "link.txt")).toThrow(PathSafetyError);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") {
        throw error;
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
