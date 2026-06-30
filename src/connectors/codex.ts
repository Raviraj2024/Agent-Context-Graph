import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function connectCodex(projectRoot: string, command = "agent-context-graph"): string {
  const configDir = join(projectRoot, ".codex");
  const configPath = join(configDir, "config.toml");
  mkdirSync(configDir, { recursive: true });
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const block = `[mcp_servers.agent-context-graph]\ncommand = "${command}"\nargs = ["serve"]\ncwd = "${projectRoot.replace(/\\/g, "\\\\")}"\n`;
  const next = existing.includes("[mcp_servers.agent-context-graph]")
    ? existing.replace(/\[mcp_servers\.agent-context-graph\][\s\S]*?(?=\n\[|$)/, block.trim())
    : `${existing.trim()}\n\n${block}`.trimStart();
  writeFileSync(configPath, `${next.trim()}\n`, "utf8");
  return configPath;
}
