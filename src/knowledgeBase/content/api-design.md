# API Design

## REST
Use nouns for resources, stable status codes, idempotent methods where expected, and explicit pagination for collections.

## GraphQL
Keep resolvers thin. Put authorization and business rules in shared services so REST and GraphQL behavior does not drift.

## Contracts
Treat exported routes, SDK functions, and schemas as public API. Version or migrate them deliberately.
