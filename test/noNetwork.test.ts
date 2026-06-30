import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

describe("runtime network ban", () => {
  it("does not emit forbidden network API usage in compiled output", () => {
    const compiled = files(join(process.cwd(), "dist")).filter((file) => file.endsWith(".js"));
    const haystack = compiled.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(haystack).not.toMatch(/\bfrom ["']node:(http|https)["']/);
    expect(haystack).not.toMatch(/\bfrom ["'](http|https|axios)["']/);
    expect(haystack).not.toMatch(/\bfetch\s*\(/);
  });
});
