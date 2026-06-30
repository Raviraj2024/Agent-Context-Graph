# BUILD PROMPT — paste this entire document into Codex CLI as your first message

You are building a complete, production-quality, open-source backend tool from
scratch. Read this entire spec before writing any code. Do not ask me
clarifying questions — every decision has already been made below. Where a
genuine ambiguity comes up during implementation, make the most sensible
choice yourself, implement it, and document the decision and reasoning in
README.md under a "Design Decisions" section. Proceed directly to building.
There is no frontend for this project. The only human-facing artifact is
README.md.

---

## 1. WHAT THIS PROJECT IS

Project codename: **`agent-context-graph`** (the user may rename the package
later — use this as the npm package name, repo name, and binary name for now).

This is a **local MCP (Model Context Protocol) server** that any AI coding
agent (Claude Code, Codex CLI, Cursor, or any other MCP-compatible client)
connects to when working inside a codebase. It gives the agent three
capabilities it does not have natively:

1. **A persistent, queryable knowledge graph of the codebase**, built for
   machine consumption (token-efficient, structured, not prose), with the
   project root as the root node and folders/files/classes/functions/exports
   as child nodes, connected by typed edges (imports, calls, inherits,
   implements, tested_by, depends_on, configures). The graph lets an agent ask
   "what is the minimal set of files I need to touch to make this change?"
   instead of reading the whole repository.
2. **A scope-lock system.** Before doing any work, the agent must declare what
   it intends to change. Every subsequent file edit is checked against that
   declaration. Edits strictly within the declared scope are auto-allowed.
   Edits that spill into adjacent code require explicit human approval before
   they happen. Edits touching security-sensitive areas (auth, payments,
   schema migrations, CI/CD, public API contracts) always require approval,
   regardless of scope.
3. **A permanent, structured reasoning log**, stored inside the project
   directory and version-controlled with the project, recording what changed,
   why, under what declared scope, and whether it was auto-approved or
   human-approved. This means an agent working on the repo six months from
   now (or a completely different person who clones the repo) inherits the
   full history of *why* the code looks the way it does — not just the git
   diff, but the reasoning.

### Hard constraint — this is non-negotiable and must be true of every line of
code you write:

> **Everything runs 100% locally on the user's machine. There is no backend
> service, no SaaS component, no telemetry, no analytics, no external API
> calls of any kind at runtime.** The only network activity that is ever
> allowed in this entire project is `npm install` fetching dependencies at
> install time. After install, the tool must be able to run with network
> access fully disabled. Do not add usage tracking, crash reporting, update
> checking, or "phone home" of any kind, even disabled-by-default. If you ever
> find yourself importing `fetch`, `axios`, `http`, or `https` anywhere in the
> source (outside of test fixtures), stop and reconsider — it almost
> certainly should not be there.

"GitHub integration" in this project means exactly two things, and nothing
more:
- The tool itself is built to be pushed to GitHub as an open-source repo
  (MIT-licensed) that anyone can clone and run.
- Inside a *target* project the tool is installed into, it reads local `.git`
  metadata (current branch, remote name, commit hash) purely from the local
  `.git` directory on disk, to tag log entries with branch/commit context. It
  never calls the GitHub API, never authenticates with GitHub, never pushes
  or pulls anything on the user's behalf.

---

## 2. TECH STACK (locked — do not substitute)

- **Language/runtime:** TypeScript, compiled to ESM, running on Node.js (target Node 20+).
- **MCP transport:** `@modelcontextprotocol/sdk` (official TypeScript SDK), stdio transport only. This is what lets Claude Code, Codex CLI, and Cursor all spawn this as a local subprocess with zero per-client code.
- **Parsing:** `web-tree-sitter` (WASM grammars), NOT native tree-sitter bindings. Reason: WASM avoids native compilation/toolchain requirements on the user's machine, so `npx agent-context-graph init` works identically on macOS/Linux/Windows with no build step.
  - Ship WASM grammars for: TypeScript, JavaScript (TSX/JSX included), and Python at launch.
  - Architect the parser layer behind a `LanguageAdapter` interface so more grammars can be added later without touching core logic.
- **Local graph cache (ephemeral, rebuildable):** `better-sqlite3`, synchronous, file-based, stored at `.agent-context-graph/cache.sqlite`. This file is `.gitignore`d — it is a derived artifact, rebuilt from the canonical JSONL graph on first run after a clone.
- **Canonical graph storage (committed to git):** Plain JSONL files at `.agent-context-graph/graph/nodes.jsonl` and `.agent-context-graph/graph/edges.jsonl`. Reason: JSON Lines is line-diffable in git, human-readable, and means a fresh `git clone` already contains the full graph — no rebuild needed unless files have changed since the snapshot (detected via content hashes).
- **Logs (committed to git):** One append-only JSONL file per session under `.agent-context-graph/logs/<ISO8601-timestamp>__<session-id>.jsonl`. Never one shared file that multiple sessions append to — this avoids git merge conflicts entirely, since each session writes its own uniquely-named file.
- **Testing:** Vitest.
- **Package manager:** npm (use a plain `package.json`, no monorepo tooling needed for v1).
- **License:** MIT, for the whole repo.

---

## 3. REPOSITORY STRUCTURE

Create exactly this structure:

```
agent-context-graph/
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── .gitignore
├── bin/
│   └── agent-context-graph.ts        # CLI entrypoint, see section 7
├── src/
│   ├── server/
│   │   ├── mcpServer.ts              # MCP server bootstrap + tool registration
│   │   └── instructions.ts           # server-wide MCP "instructions" string, see section 6
│   ├── graph/
│   │   ├── schema.ts                 # Node/Edge TypeScript types
│   │   ├── store.ts                  # SQLite cache read/write layer
│   │   ├── snapshot.ts               # JSONL export/import (canonical storage)
│   │   ├── builder.ts                # full repo scan -> graph build
│   │   └── updater.ts                # incremental single-file re-index
│   ├── parsers/
│   │   ├── LanguageAdapter.ts        # interface
│   │   ├── typescriptAdapter.ts
│   │   ├── pythonAdapter.ts
│   │   └── index.ts                  # adapter registry, file-extension routing
│   ├── scopeLock/
│   │   ├── types.ts                  # Scope, ApprovalDecision types
│   │   ├── engine.ts                 # classification logic, see section 6
│   │   └── hardStopPatterns.ts       # default sensitive-path patterns
│   ├── logging/
│   │   ├── logger.ts                 # JSONL session log writer
│   │   ├── secretScrub.ts            # regex-based redaction before any write
│   │   └── changeIndex.ts            # per-node compacted summary index
│   ├── knowledgeBase/
│   │   ├── content/                  # bundled markdown best-practices, see section 8
│   │   └── loader.ts                 # loads KB into graph as a "standards" subtree
│   ├── config/
│   │   ├── defaultConfig.ts
│   │   └── loadConfig.ts             # reads .agent-context-graph/config.json
│   ├── security/
│   │   └── pathSafety.ts             # path traversal / symlink-escape guards
│   └── connectors/
│       ├── codex.ts                  # writes .codex/config.toml entry
│       ├── claudeCode.ts             # writes Claude Code MCP config entry
│       └── cursor.ts                 # writes Cursor mcp.json entry
├── test/
│   ├── fixtures/
│   │   ├── sample-ts-project/
│   │   └── sample-py-project/
│   └── *.test.ts                     # see section 10
└── .agent-context-graph/             # created at runtime inside whatever
                                       # project this tool is installed into,
                                       # NOT inside this repo itself
```

---

## 4. DATA MODEL

### Node
```ts
interface GraphNode {
  id: string;                // stable hash of (filePath + qualifiedName)
  type: "root" | "directory" | "file" | "class" | "function" |
        "method" | "variable_export" | "standard";  // "standard" = KB entry
  name: string;
  qualifiedName: string;     // e.g. "src/auth/session.ts::validateToken"
  filePath: string | null;   // null for root/standard nodes
  language: string | null;
  startLine: number | null;
  endLine: number | null;
  signature: string | null;  // function/method signature only, never full body
  docstring: string | null;
  contentHash: string | null; // hash of the node's exact source slice, for staleness detection
  tags: string[];             // e.g. ["auth", "public-api", "security-sensitive"]
  lastIndexedAt: string;      // ISO8601
}
```

### Edge
```ts
interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: "imports" | "calls" | "inherits" | "implements" |
            "tested_by" | "depends_on" | "configures" | "contains";
  confidence: "static" | "inferred"; // "inferred" = could not be statically
                                      // resolved (dynamic dispatch, reflection,
                                      // string-based imports) — agent must be
                                      // told to verify before trusting these
  reason: string | null;      // short human/agent-readable note for "inferred" edges
}
```

Critical rule: **never store full file contents or full function bodies in
the graph.** Only signatures, docstrings, line ranges, and hashes. This keeps
the graph small, keeps it token-cheap for the agent to consume, and prevents
secrets that might live in code from ever being persisted into a separate
store.

### Scope
```ts
interface TaskScope {
  scopeId: string;
  sessionId: string;
  createdAt: string;
  taskDescription: string;
  declaredNodeIds: string[];
  status: "active" | "completed" | "abandoned";
  decisions: ScopeDecision[];
}

interface ScopeDecision {
  nodeOrPath: string;
  classification: "auto_allowed" | "needs_approval" | "hard_stop";
  reason: string;
  resolvedAt: string | null;
  approved: boolean | null;   // null until the human responds
}
```

### Log entry (one JSON object per line in a session log file)
```ts
interface LogEntry {
  timestamp: string;          // ISO8601, always include
  sessionId: string;
  scopeId: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  action: "scope_declared" | "scope_decision" | "file_created" |
          "file_modified" | "file_deleted" | "graph_updated";
  filePath: string | null;
  summary: string;            // short, what happened
  reasoning: string;          // why — this is the field future agents query
  approvedBy: "auto" | "user" | null;
}
```

---

## 5. MCP TOOL SURFACE

Register exactly these tools on the MCP server. Each must have a strict JSON
schema for input/output — agents rely on structured, predictable responses,
not prose.

1. **`get_project_overview`** — returns root node, detected tech stack,
   entry points, and counts of nodes/edges. Call this first in any session.
2. **`init_or_refresh_graph`** — full build if no graph exists yet;
   otherwise diffs file content hashes against the last snapshot and
   incrementally re-indexes only changed files.
3. **`get_node_context(identifier)`** — accepts a node id, file path, or
   qualified name. Returns the node plus its immediate (1-hop) edges in both
   directions, with signatures and docstrings, no full source.
4. **`get_blast_radius(identifier, maxDepth)`** — returns every node
   reachable within `maxDepth` hops via `calls`/`imports`/`inherits` edges,
   clearly separating `confidence: "static"` results from `confidence:
   "inferred"` ones, with a note instructing the agent to verify inferred
   edges before relying on them.
5. **`get_definitive_path(identifier, changeType)`** — given an intended
   change ("rename", "change_signature", "delete", "modify_logic"), returns
   the minimal ordered list of files/nodes that must be touched, derived from
   blast radius plus relation type (e.g. a signature change must also touch
   every `calls` edge target).
6. **`query_best_practices(domain)`** — returns the relevant best-practices
   knowledge nodes for a domain (see section 8). Must be called before the
   agent starts implementing anything in that domain.
7. **`declare_task_scope(taskDescription, targetIdentifiers[])`** — creates
   and returns a new `TaskScope`. Must be called once per discrete task,
   before any file is touched.
8. **`check_scope(scopeId, proposedChanges[])`** — for each proposed file
   path or node id, returns a `ScopeDecision`. This is the enforcement point:
   the agent must call this before writing any file and must respect
   `needs_approval`/`hard_stop` results by surfacing the question to the
   human and waiting, rather than proceeding.
9. **`record_change(scopeId, filePath, action, summary, reasoning)`** — must
   be called immediately after every actual file create/modify/delete. Writes
   to the session log and updates the per-node change index.
10. **`get_node_history(identifier)`** — returns the compacted history of
    past `record_change` entries for a given node, pulled from the change
    index, so an agent can see prior reasoning before editing something again.

### Server instructions (critical mechanism)

Set the MCP server's `instructions` field (read automatically by Codex,
Claude Code, and Cursor at session start) to something equivalent to the
following. Keep the first ~500 characters self-contained per Codex's
guidance, since clients may truncate display of long instructions:

> This server provides a local knowledge graph and change-control system for
> this codebase. Mandatory workflow: (1) call get_project_overview and
> init_or_refresh_graph at session start, (2) call query_best_practices for
> any relevant domain before writing new code, (3) call declare_task_scope
> before making any edit, (4) call check_scope before every file write and
> stop to ask the user if the result is needs_approval or hard_stop, (5) call
> record_change immediately after every file create/modify/delete. Do not
> make changes beyond the declared scope without explicit user approval.

Implement this as a constant string in `src/server/instructions.ts` and pass
it into the MCP server constructor.

---

## 6. SCOPE-LOCK CLASSIFICATION LOGIC

In `src/scopeLock/engine.ts`, implement classification with this precedence
(check in this order, first match wins):

1. **`hard_stop`** if the target path/node matches any pattern in
   `hardStopPatterns.ts` (defaults below) — regardless of declared scope.
2. **`auto_allowed`** if the target node id is in `declaredNodeIds`.
3. **`auto_allowed`** if the target node is a direct child (e.g. a function
   inside a file that was declared at the file level).
4. **`needs_approval`** if the target node is within 1 hop of any declared
   node via `calls`/`imports`/`inherits` (i.e., adjacent but not declared).
5. **`needs_approval`** as the default fallback for anything else not yet
   classified.

Default `hardStopPatterns` (path or tag based, configurable per project via
`.agent-context-graph/config.json`):
- paths containing: `auth`, `session`, `permission`, `rbac`, `payment`,
  `billing`, `migrations`, `schema`, `.env`, `secrets`
- CI/CD config files: `.github/workflows/**`, `Dockerfile`, `docker-compose*`
- any node tagged `public-api` (exported route handlers / public SDK exports)

When a tool call returns `needs_approval` or `hard_stop`, the response object
must include a clear, structured `reason` string — the calling agent's job is
to surface this as a question to the human before proceeding. Do not attempt
to implement your own blocking UI/prompt inside the MCP server; rely on the
structured response plus the server instructions to make the host agent ask.

---

## 7. CLI COMMANDS (`bin/agent-context-graph.ts`)

- `npx agent-context-graph init` — scans the current project, builds the
  initial graph (full build), loads the knowledge base, writes
  `.agent-context-graph/config.json` with defaults, writes the JSONL
  snapshot, prints a summary.
- `npx agent-context-graph connect <codex|claude-code|cursor>` — writes or
  updates the appropriate local MCP config file so that client launches this
  tool as a stdio server scoped to the current project. Never touches global
  config destructively — always merge into existing config files, never
  overwrite wholesale.
- `npx agent-context-graph serve` — starts the MCP stdio server. This is also
  the default behavior when the binary is invoked with no subcommand, since
  this is what the host CLIs will actually spawn per their MCP config.
- `npx agent-context-graph status` — prints node/edge counts, last build
  time, any active (incomplete) scopes, and whether the cache is stale
  relative to the JSONL snapshot.
- `npx agent-context-graph reset` — deletes `cache.sqlite` only (never
  touches `graph/*.jsonl` or `logs/*`) and rebuilds the cache from the
  snapshot plus a fresh diff against current file hashes.

---

## 8. BEST-PRACTICES KNOWLEDGE BASE

Under `src/knowledgeBase/content/`, write original markdown files (do not
copy text from any external source) covering, at minimum:

- `backend-architecture.md`
- `api-design.md` (REST + GraphQL conventions)
- `auth-and-rbac.md`
- `security-checklist.md` (OWASP-style: input validation, injection,
  authn/authz, secrets handling, dependency hygiene)
- `testing-strategy.md` (unit/integration/e2e pyramid, edge-case checklists)
- `error-handling-and-observability.md`
- `data-modeling.md`

Each file should be concise, practical, and structured with clear headers, so
`loader.ts` can chunk it into individual `standard` nodes (one node per
major heading) tagged by domain, attached under a virtual `standards` child of
the root node. `query_best_practices(domain)` filters and returns these
nodes.

---

## 9. SECURITY & EDGE CASES (must implement, not optional)

- **Path safety:** every file path argument passed into any tool must be
  canonicalized and verified to resolve inside the project root before any
  read/write. Reject `..` traversal and symlinks that resolve outside root.
- **Exclusions:** never index `node_modules`, `.git`, build/dist output
  directories, binary files, or files above a configurable size limit
  (default 1MB).
- **Secret scrubbing:** before any log entry or node docstring is written to
  disk, run it through `secretScrub.ts`, which redacts patterns matching AWS
  keys, generic `api[_-]?key`/`secret`/`token` assignments, JWTs, and
  PEM-style private key headers.
- **Never persist full file contents** in the SQLite cache or JSONL graph —
  enforced at the schema level (no `content` or `body` field exists at all).
- **Graceful parse failures:** if a file fails to parse, log a warning node
  and continue indexing the rest of the repo — never let one bad file abort
  the whole build.
- **Cycle safety:** all graph traversal (blast radius, definitive path) must
  use a visited-set to avoid infinite loops on circular imports.
- **Concurrency:** use a lock file at `.agent-context-graph/.lock` (containing
  PID + timestamp) during any write to `cache.sqlite` to prevent two
  simultaneous sessions from corrupting it. If a stale lock is detected (PID
  no longer running), remove it automatically and proceed.
- **Staleness detection:** every node carries a `contentHash`; before trusting
  any graph query result, the tool layer should be able to cheaply verify the
  relevant file's current hash still matches, and trigger an incremental
  re-index if not.
- **Zero network calls at runtime** — add a test (see below) that statically
  greps the compiled output for forbidden network APIs and fails the build if
  found outside test files.

---

## 10. TESTING REQUIREMENTS (Vitest)

- Parser correctness tests for each `LanguageAdapter` against the fixture
  projects in `test/fixtures/`.
- Full-build and incremental-update tests: build a graph, modify a fixture
  file, confirm only the affected nodes/edges are re-indexed.
- Scope-lock classification matrix test: cover all five precedence cases in
  section 6 with explicit test cases.
- Secret-scrubbing test: feed in strings containing fake AWS keys, JWTs, and
  generic secrets, assert they are redacted in the written log.
- Path-safety test: assert traversal attempts and out-of-root symlinks are
  rejected.
- Lock file test: simulate a stale lock (dead PID) and confirm it's cleared
  automatically; simulate a live lock and confirm a second process waits or
  errors cleanly.
- "No network calls" static check test, as described above.

---

## 11. README.md REQUIREMENTS

Since this is the only human-facing artifact, README.md must include:

1. One-paragraph project description and the core problem it solves.
2. An architecture diagram (use a Mermaid code block — renders natively on
   GitHub) showing: target project → MCP server (this tool) → graph store +
   scope-lock + logs, and how Claude Code/Codex/Cursor each connect to it.
3. Explicit "Privacy & Local-First Guarantee" section stating plainly that
   nothing leaves the user's machine, with a one-line pointer to the
   "no network calls" test as proof.
4. Installation and setup instructions per client: Codex CLI, Claude Code,
   Cursor (using the `connect` command from section 7).
5. Full list of MCP tools from section 5 with a one-line description of each.
6. Explanation of the `.agent-context-graph/` directory layout that appears
   inside any project this tool is used on, and what should/shouldn't be
   committed to git (graph snapshot + logs: yes; sqlite cache + lock file:
   no — provide the exact `.gitignore` lines for a *target* project to add).
7. A "Design Decisions" section documenting any judgment calls you made while
   building, as instructed at the top of this prompt.
8. Contribution guidelines (how to add a new `LanguageAdapter`) and License
   section (MIT).

---

## 12. BUILD ORDER

Work in this order so the project is runnable and testable at each stage:

1. Scaffold repo, `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`.
2. Implement `src/security/pathSafety.ts` and its tests first — everything
   else depends on it.
3. Implement graph schema + SQLite store + JSONL snapshot read/write.
4. Implement `LanguageAdapter` interface and the TypeScript adapter, then the
   Python adapter, with fixture tests.
5. Implement `builder.ts` (full scan) and `updater.ts` (incremental).
6. Implement the knowledge base content + loader.
7. Implement scope-lock engine + tests.
8. Implement logger + secret scrubbing + change index.
9. Implement the MCP server and register all 10 tools, wired to the modules
   above, with the `instructions` field set.
10. Implement the CLI (`init`, `serve`, `connect`, `status`, `reset`) and the
    three connector modules.
11. Write the remaining integration tests, including the "no network calls"
    static check.
12. Write README.md per section 11.
13. Do a final pass: run the full test suite, run `init` and `serve` against
    one of the fixture projects end-to-end, and fix anything that doesn't
    work before considering the build done.

---

## 13. DEFINITION OF DONE

- `npm install && npm run build && npm test` passes cleanly with no network
  access.
- `npx agent-context-graph init` run inside a sample project produces a
  populated `.agent-context-graph/graph/*.jsonl`, a `config.json`, and a
  knowledge-base subtree in the graph.
- `npx agent-context-graph connect codex` (and `claude-code`, `cursor`)
  correctly writes a working local MCP config entry without disturbing any
  existing entries in that file.
- All 10 MCP tools are callable and return schema-valid responses.
- Scope-lock correctly classifies edits per the five-tier logic with test
  coverage proving it.
- Every file mutation produces a corresponding log entry with redacted
  secrets.
- README.md is complete per section 11.

Begin building now, starting with step 1 of the build order.