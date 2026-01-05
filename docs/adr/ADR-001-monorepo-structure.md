# ADR-001 - Monorepo structure

Date: 2025-12-31
Status: accepted

## Context

The project has multiple deployable services (api, game-server, worker, backoffice) and shared packages (core, contracts, shared). We need clear dependency boundaries and a predictable layout.

## Decision

Adopt a monorepo with:

- `apps/` for deployable services
- `packages/` for shared libraries

Dependency rules:

- `packages/` never depend on `apps/`
- `apps/` can depend on `packages/` only
- no `app -> app` dependencies

## Consequences

- Clear boundaries reduce circular dependencies.
- Shared code stays in `packages/` and can be versioned.
- Build tooling can target each workspace independently.
