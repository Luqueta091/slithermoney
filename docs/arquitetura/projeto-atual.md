# Projeto Atual - SlitherMoney

## Visao geral
Projeto em monorepo Node/TypeScript com 5 apps e 3 packages. O jogo e realtime (WebSocket) e a camada financeira roda em API HTTP + worker.

## Estrutura do monorepo
- apps/api: API HTTP (identidade, carteira, ledger, Pix, runs, stakes)
- apps/game-server: servidor realtime (WebSocket) + health/metrics HTTP
- apps/worker: jobs Pix (saques, expiracao, reconciliacao)
- apps/backoffice: API admin (dashboard, usuarios, pix, ledger, runs)
- apps/mobile: web app (React + Vite) para o jogador
- packages/contracts: tipos de contratos (realtime, eventos de run)
- packages/shared: utilitarios (env, logger, request context)
- packages/core: placeholder (nao usado no momento)
- prisma/: schema e migracoes
- slitherGameplay/: referencia do gameplay base (cliente/servidor)

## Fluxos principais (alto nivel)
- Deposito Pix:
  1) POST /pix/deposits (idempotente) cria transacao
  2) POST /pix/webhook confirma e credita carteira + ledger
- Saque Pix:
  1) POST /pix/withdrawals (idempotente) bloqueia saldo e cria transacao
  2) Worker processa e finaliza o saque (paid/failed)
- Run do jogo:
  1) POST /runs/start reserva stake na carteira
  2) Cliente conecta no game-server (WebSocket) e joga
  3) Game-server envia eventos de eliminacao/cashout para API

## API HTTP (apps/api)
Base: http://localhost:3000
Auth: header `x-user-id` (UUID) obrigatorio na maioria dos endpoints.
Idempotencia: header `x-idempotency-key` (ou `idempotency-key`) em Pix.
Webhooks: `x-pix-webhook-key` e `x-game-server-key` se configurados.

Endpoints:
- GET `/` -> health simples
- GET `/health` -> status + versao
- GET `/metrics` -> metricas
- POST `/identity` -> cria/atualiza identidade (cpf/pix)
- GET `/identity/me` -> identidade do usuario
- GET `/wallet/me` -> saldo agregado
- GET `/ledger/me` -> extrato (com query string)
- POST `/pix/deposits` -> cria cobranca Pix
- POST `/pix/webhook` -> confirma deposito Pix
- POST `/pix/withdrawals` -> solicita saque Pix
- GET `/pix/transactions/me` -> lista transacoes Pix
- GET `/stakes` -> lista stakes disponiveis
- POST `/runs/start` -> inicia run (reserva stake)
- GET `/runs/me` -> lista runs do usuario
- POST `/runs/events/eliminated` -> game-server envia eliminacao
- POST `/runs/events/cashout` -> game-server envia cashout

## Game-server (apps/game-server)
HTTP:
- GET `/` -> health simples
- GET `/health` -> status + versao
- GET `/metrics` -> players online, rooms, tick lag

WebSocket (ws://localhost:4000):
- HELLO -> WELCOME
- JOIN -> JOINED + SNAPSHOT inicial
- INPUT -> INPUT_ACK
- SNAPSHOT (tick, players, pellets, pellet_events, world_radius)
- CASHOUT_REQUEST -> CASHOUT_HOLD -> CASHOUT_RESULT
- ELIMINATED
- ERROR

Contratos: `packages/contracts/src/realtime.ts` (REALTIME_PROTOCOL_VERSION = 3).
NPCs: controlado por `NPC_ONLY` e `BOT_COUNT`.

## Worker (apps/worker)
HTTP:
- GET `/health`
- GET `/metrics`

Jobs:
- Pix withdrawals processor (paga/atualiza saques)
- Pix deposit expiration (expira pendentes)
- Pix reconciliation (reprocessa confirmacoes)

## Backoffice (apps/backoffice)
Base: http://localhost:3001 (configuravel)
Endpoints:
- GET `/` e `/health`
- GET `/dashboard`
- GET `/users`
- POST `/users/ban`
- POST `/users/unban`
- GET `/pix/transactions`
- POST `/pix/transactions/reprocess`
- GET `/ledger`
- POST `/wallet/adjust`
- GET `/runs`
- PATCH `/config/stakes`
- POST `/fraud/flags/resolve`

## Banco de dados (prisma)
Principais tabelas:
- accounts, identity_profiles
- wallets, ledger_entries
- pix_transactions
- runs, arenas
- stakes, size_multipliers
- admin_audit_logs, fraud_flags

## Observabilidade e seguranca
- Logs estruturados com request_id/trace_id
- Rate limit por rota na API
- Chaves opcionais para webhooks Pix e eventos do game-server

## Referencias internas
- `docs/arquitetura/realtime.md` (handshake e fluxo realtime)
- `docs/arquitetura/fluxo-financeiro.md` (fluxo de dinheiro)
