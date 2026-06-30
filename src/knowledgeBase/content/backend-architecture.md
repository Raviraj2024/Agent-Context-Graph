# Backend Architecture

## Boundaries
Keep domain logic behind small service boundaries. Entry points should translate transport concerns into domain calls, then return typed outcomes.

## Dependencies
Prefer inward dependencies. Domain modules should not import CLI, HTTP, or persistence adapters directly.

## Configuration
Load configuration once, validate it, and pass typed values to modules that need them.
