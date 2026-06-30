# Error Handling And Observability

## Errors
Return structured errors with actionable reasons. Avoid hiding partial failures during indexing.

## Logs
Keep logs compact, append-only, scrubbed, and tied to session and scope identifiers.

## Recovery
Prefer rebuildable caches and canonical committed artifacts so a damaged local cache can be recreated.
