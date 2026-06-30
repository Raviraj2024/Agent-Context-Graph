import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { appendChangeIndex } from "./changeIndex.js";
import { scrubObject } from "./secretScrub.js";

export interface LogEntry {
  timestamp: string;
  sessionId: string;
  scopeId: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  action: "scope_declared" | "scope_decision" | "file_created" | "file_modified" | "file_deleted" | "graph_updated";
  filePath: string | null;
  summary: string;
  reasoning: string;
  approvedBy: "auto" | "user" | null;
}

export function newSessionId(): string {
  return randomUUID();
}

function logsDir(projectRoot: string): string {
  return join(projectRoot, ".agent-context-graph", "logs");
}

export function getGitContext(projectRoot: string): { gitBranch: string | null; gitCommit: string | null } {
  const gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) {
    return { gitBranch: null, gitCommit: null };
  }
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5);
      const refPath = join(gitDir, ...ref.split("/"));
      const commit = existsSync(refPath) ? readFileSync(refPath, "utf8").trim() : null;
      return { gitBranch: ref.replace("refs/heads/", ""), gitCommit: commit };
    }
    return { gitBranch: null, gitCommit: head };
  } catch {
    return { gitBranch: null, gitCommit: null };
  }
}

export class SessionLogger {
  readonly sessionId: string;
  readonly logFile: string;

  constructor(readonly projectRoot: string, sessionId = newSessionId()) {
    this.sessionId = sessionId;
    mkdirSync(logsDir(projectRoot), { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logFile = join(logsDir(projectRoot), `${timestamp}__${sessionId}.jsonl`);
  }

  write(entry: Omit<LogEntry, "timestamp" | "sessionId" | "gitBranch" | "gitCommit">): LogEntry {
    const git = getGitContext(this.projectRoot);
    const full: LogEntry = scrubObject({
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      gitBranch: git.gitBranch,
      gitCommit: git.gitCommit,
      ...entry
    });
    appendFileSync(this.logFile, `${JSON.stringify(full)}\n`, "utf8");
    if (entry.filePath) {
      appendChangeIndex(this.projectRoot, entry.filePath, {
        timestamp: full.timestamp,
        scopeId: full.scopeId,
        filePath: full.filePath,
        action: full.action,
        summary: full.summary,
        reasoning: full.reasoning,
        approvedBy: full.approvedBy
      });
    }
    return full;
  }
}
