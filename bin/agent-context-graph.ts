#!/usr/bin/env node
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildAndPersistGraph } from "../src/graph/builder.js";
import { readSnapshotSync } from "../src/graph/snapshot.js";
import { cachePath, GraphStore } from "../src/graph/store.js";
import { initOrRefreshGraph } from "../src/graph/updater.js";
import { writeDefaultConfig } from "../src/config/loadConfig.js";
import { connectCodex } from "../src/connectors/codex.js";
import { connectClaudeCode } from "../src/connectors/claudeCode.js";
import { connectCursor } from "../src/connectors/cursor.js";
import { serve } from "../src/server/mcpServer.js";

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const [command = "serve", arg] = process.argv.slice(2);

  if (command === "init") {
    writeDefaultConfig(projectRoot);
    const result = buildAndPersistGraph(projectRoot);
    console.log(
      JSON.stringify(
        {
          initialized: true,
          nodes: result.snapshot.nodes.length,
          edges: result.snapshot.edges.length,
          warnings: result.warnings
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "connect") {
    if (arg === "codex") {
      console.log(JSON.stringify({ client: arg, configPath: connectCodex(projectRoot) }, null, 2));
      return;
    }
    if (arg === "claude-code") {
      console.log(JSON.stringify({ client: arg, configPath: connectClaudeCode(projectRoot) }, null, 2));
      return;
    }
    if (arg === "cursor") {
      console.log(JSON.stringify({ client: arg, configPath: connectCursor(projectRoot) }, null, 2));
      return;
    }
    throw new Error("Usage: agent-context-graph connect <codex|claude-code|cursor>");
  }

  if (command === "serve") {
    await serve(projectRoot);
    return;
  }

  if (command === "status") {
    const snapshot = readSnapshotSync(projectRoot);
    const store = new GraphStore(projectRoot);
    try {
      console.log(
        JSON.stringify(
          {
            snapshot: { nodes: snapshot.nodes.length, edges: snapshot.edges.length },
            cache: store.counts(),
            lastBuildAt: store.getMeta("lastBuildAt"),
            cacheExists: existsSync(cachePath(projectRoot)),
            lockExists: existsSync(join(projectRoot, ".agent-context-graph", ".lock"))
          },
          null,
          2
        )
      );
    } finally {
      store.close();
    }
    return;
  }

  if (command === "reset") {
    rmSync(cachePath(projectRoot), { force: true });
    const result = initOrRefreshGraph(projectRoot);
    console.log(JSON.stringify({ reset: true, ...result }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
