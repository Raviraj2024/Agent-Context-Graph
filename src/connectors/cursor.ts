import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function connectCursor(projectRoot: string, command = "agent-context-graph"): string {
  const configDir = join(projectRoot, ".cursor");
  const configPath = join(configDir, "mcp.json");
  mkdirSync(configDir, { recursive: true });
  const existing = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const next = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      "agent-context-graph": {
        command,
        args: ["serve"],
        cwd: projectRoot
      }
    }
  };
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return configPath;
}
