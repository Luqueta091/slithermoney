# ADR-012 - Prisma migrations

Date: 2025-12-31
Status: accepted

## Context

We need schema management and migrations for a hosted Postgres database. The team wants a single workflow that works with cloud Postgres and local development.

## Decision

Adopt Prisma for schema management and migrations.

- `prisma/schema.prisma` is the source of truth.
- `prisma.config.ts` provides the datasource URL for Prisma CLI.
- Migrations live in `prisma/migrations/`.
- Database URL is provided via `DATABASE_URL`.

## Consequences

- Migration commands use `prisma migrate`.
- Legacy node-pg-migrate scripts are removed.
