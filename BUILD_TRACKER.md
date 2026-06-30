# agent-context-graph Build Tracker

This file tracks the implementation against `Build.md` so the project stays aligned across the conversation.

## Status

- [x] Read `Build.md`
- [x] Scaffold package, TypeScript config, license, ignore files
- [x] Implement path safety
- [x] Implement graph schema, store, snapshot
- [x] Implement parser adapters
- [x] Implement graph builder and updater
- [x] Implement knowledge base
- [x] Implement scope lock
- [x] Implement logging and change index
- [x] Implement MCP server tools
- [x] Implement CLI and connectors
- [x] Add tests
- [x] Complete README
- [x] Run build and tests

## Decisions

- Incremental refresh reports changed files, then rebuilds the full snapshot to keep cross-file edges deterministic.
- Parser extraction is behind `LanguageAdapter`; current extraction is conservative syntax scanning with the required `web-tree-sitter` dependency present for future WASM grammar-backed adapters.
- Client connector commands write project-local config and merge the `agent-context-graph` entry only.

## Verification Log

- `npm install` initially failed with `better-sqlite3@11` on Node 24 due missing prebuild/ClangCL; bumped to `better-sqlite3@12.11.1`.
- `npm install` passed after dependency bump.
- `npm run build` passed.
- `npm test` passed: 7 test files, 10 tests.
- Built CLI `init` smoke test passed against a temporary copy of `sample-ts-project`; it produced graph JSONL files and config.
- Built CLI `serve` smoke test passed; the stdio server stayed alive until stopped.
- Built CLI connector smoke test passed for Codex, Claude Code, and Cursor config files.
