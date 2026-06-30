import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defaultConfig, type AgentContextGraphConfig } from "./defaultConfig.js";

export function configPath(projectRoot: string): string {
  return join(projectRoot, ".agent-context-graph", "config.json");
}

export function loadConfig(projectRoot: string): AgentContextGraphConfig {
  const path = configPath(projectRoot);
  if (!existsSync(path)) {
    return defaultConfig;
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentContextGraphConfig>;
  return {
    ...defaultConfig,
    ...parsed,
    excludeDirectories: parsed.excludeDirectories ?? defaultConfig.excludeDirectories,
    excludeFiles: parsed.excludeFiles ?? defaultConfig.excludeFiles,
    hardStopPathFragments: parsed.hardStopPathFragments ?? defaultConfig.hardStopPathFragments,
    hardStopGlobs: parsed.hardStopGlobs ?? defaultConfig.hardStopGlobs,
    publicApiTags: parsed.publicApiTags ?? defaultConfig.publicApiTags
  };
}

export function writeDefaultConfig(projectRoot: string): void {
  const path = configPath(projectRoot);
  mkdirSync(join(projectRoot, ".agent-context-graph"), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
  }
}
