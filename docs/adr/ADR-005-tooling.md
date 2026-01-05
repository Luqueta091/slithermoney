# ADR-005 - Tooling

Date: 2025-12-31
Status: accepted

## Context

We need a standard toolchain for linting, formatting, typechecking, and tests across a monorepo.

## Decision

- Language: TypeScript (Node 20+).
- Workspaces: npm workspaces.
- Lint: ESLint with `@typescript-eslint`.
- Format: Prettier.
- Tests: Vitest.
- Dev runtime: `tsx` for local runs.
- DB migrations: Prisma.
- CI: GitHub Actions.

## Consequences

- Single toolchain across apps and packages.
- Consistent scripts in the root `package.json`.
