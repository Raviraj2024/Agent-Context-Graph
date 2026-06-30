# Data Modeling

## Identifiers
Use stable identifiers derived from logical identity, not from incidental ordering.

## Storage
Separate canonical committed state from local caches. Caches can be rebuilt; logs and snapshots are history.

## Migrations
Make schema changes explicit and review them as sensitive changes because they can affect persisted user data.
