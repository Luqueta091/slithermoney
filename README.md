# SlitherMoney

Monorepo for the Skill Betting Arena project (slither-style realtime game, Pix BRL, wallet/ledger, jobs, and backoffice).

## Structure

- `apps/api` - public API (wallet, ledger, Pix, runs, identity)
- `apps/game-server` - realtime authoritative server
- `apps/worker` - background jobs and processors
- `apps/backoffice` - admin UI placeholder
- `packages/core` - domain logic (pure)
- `packages/contracts` - shared DTOs and events
- `packages/shared` - generic utilities only
- `docs/adr` - architecture decision records
- `docs/arquitetura` - architecture docs

## Rules of dependency

- `packages/` never depend on `apps/`
- `apps/` can depend on `packages/` only
- no `app -> app` dependencies
- keep `packages/shared` generic (no domain rules)

## Quick start

```bash
npm install
./infra/dev-up.sh
cp .env.example .env
npm run db:migrate
npm run dev:api
```

Other dev commands:

```bash
npm run dev:all
npm run dev:api
npm run dev:game
npm run dev:worker
npm run dev:backoffice
npm run dev:mobile
```

## Standard scripts

```bash
npm run build
npm run typecheck
npm run test
npm run lint
npm run format
```

## Database (Prisma)

Copy `.env.example` to `.env` and set `DATABASE_URL`.

```bash
npm run db:migrate
```

## Local infra

```bash
./infra/dev-up.sh
./infra/dev-down.sh
```

## Web client (mobile-first)

Copy `apps/mobile/.env.example` to `apps/mobile/.env` if you need to change the API URL.

```bash
npm run dev:mobile
```

## ADRs

- `docs/adr/ADR-001-monorepo-structure.md`
- `docs/adr/ADR-002-naming-conventions.md`
- `docs/adr/ADR-003-error-handling.md`
- `docs/adr/ADR-004-observability-basics.md`
- `docs/adr/ADR-005-tooling.md`
- `docs/adr/ADR-012-prisma-migrations.md`

## Architecture docs

- `docs/arquitetura/exemplo-modulo.md`
