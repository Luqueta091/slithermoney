# ADR-030 - Deployment strategy

Date: 2026-01-01
Status: accepted

## Context

We need a repeatable local stack for development and a simple strategy to deploy the services
(API, game-server, worker, backoffice, and web client) across environments. The system depends
on Postgres and uses Prisma migrations to evolve the schema.

## Decision

- Local development uses Docker Compose with a Postgres container.
- Environment configuration is provided via env vars and documented in `.env.example`.
- Migrations are applied explicitly (`npm run db:migrate`) as part of deployment.
- Rollbacks are handled by forward-fix migrations (no automatic down migrations).
- Each service is deployed independently, but must share the same `DATABASE_URL`.

## Consequences

- Any developer can bootstrap a local stack with one command.
- Production deploys require a migration step before/with application rollout.
- Schema changes are reversible by creating a new migration rather than rolling back state.
