# Security Checklist

## Input Validation
Validate untrusted input at process boundaries and again before persistence when shape or type matters.

## Injection
Use parameterized database operations and structured command APIs. Avoid string-built commands for untrusted data.

## Secrets
Never log secrets, tokens, private keys, or raw credentials. Redact before writing diagnostic or reasoning logs.

## Dependencies
Keep dependencies minimal, pinned by lockfile, and reviewed when they add native code or runtime network behavior.
