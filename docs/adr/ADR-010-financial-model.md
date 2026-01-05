# ADR-010 - Financial model

Date: 2025-12-31
Status: accepted

## Context

The platform handles money flows (Pix deposits/withdrawals, wallet balances, game runs, and cash-out). We need clear invariants to avoid double credits, negative balances, and unaudited movements.

## Decision

Separate wallet and ledger responsibilities:

- Wallet = aggregated balances for fast reads and constraints.
- Ledger = immutable, append-only record of every money movement.

Movement types:

- DEPOSIT
- STAKE_RESERVED
- STAKE_RELEASED
- STAKE_LOST
- PRIZE
- HOUSE_FEE
- WITHDRAW_REQUEST
- WITHDRAW_PAID
- WITHDRAW_FAILED
- ADMIN_ADJUST

Idempotency:

- Pix deposit/withdraw flows require idempotency keys.
- Ledger entries include external references when applicable (Pix txid/e2e).
- Webhooks and async consumers must be idempotent.

Balance rules:

- Wallet balances never go negative.
- Stakes are reserved before a run starts.
- Cash-out creates PRIZE and HOUSE_FEE entries and credits wallet.

## Consequences

- Wallet is a derived view; ledger is the source of truth.
- Any financial action must write to the ledger.
- Support and reconciliation can trace every cent.
