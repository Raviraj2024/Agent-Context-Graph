# Testing Strategy

## Unit Tests
Cover small deterministic logic, especially classification, parsing, path safety, and redaction.

## Integration Tests
Exercise the graph build and MCP tool flows against fixture projects with realistic file layouts.

## Runtime Verification
Before handing work back, run the exact command the user is expected to use. For a game or web demo, start the server or app entrypoint and confirm missing dependencies, path issues, and port errors are resolved or reported.

## Dependency Checks
If a generated run command depends on a tool such as uvicorn, vite, flask, or pytest, make sure it is present in the project dependencies or choose a command that works with the dependencies already installed.

## Edge Cases
Test empty projects, malformed files, circular imports, stale cache state, and unsafe paths.
