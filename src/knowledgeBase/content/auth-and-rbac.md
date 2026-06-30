# Auth And RBAC

## Authentication
Verify identity at the boundary and avoid trusting caller-provided user ids without server-side validation.

## Authorization
Check permissions close to the protected action. Prefer explicit allow rules over broad role assumptions.

## Sessions
Rotate sensitive credentials, constrain token lifetime, and store only necessary session state.
