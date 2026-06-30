import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionLogger } from "../src/logging/logger.js";
import { scrubSecrets } from "../src/logging/secretScrub.js";

describe("secret scrubbing", () => {
  it("redacts common secret patterns", () => {
    const scrubbed = scrubSecrets("api_key = abc123 token: xyz AKIA1234567890ABCDEF eyJabc.def.ghi -----BEGIN PRIVATE KEY-----");
    expect(scrubbed).not.toContain("abc123");
    expect(scrubbed).not.toContain("AKIA1234567890ABCDEF");
    expect(scrubbed).not.toContain("eyJabc.def.ghi");
    expect(scrubbed).toContain("[REDACTED");
  });

  it("writes scrubbed JSONL logs", () => {
    const root = mkdtempSync(join(tmpdir(), "acg-log-"));
    const logger = new SessionLogger(root, "session");
    logger.write({
      scopeId: "scope",
      action: "file_modified",
      filePath: "src/file.ts",
      summary: "Changed api_key = abc123",
      reasoning: "Removed token: xyz",
      approvedBy: "auto"
    });
    const log = readFileSync(logger.logFile, "utf8");
    expect(log).not.toContain("abc123");
    expect(log).not.toContain("xyz");
    rmSync(root, { recursive: true, force: true });
  });
});
