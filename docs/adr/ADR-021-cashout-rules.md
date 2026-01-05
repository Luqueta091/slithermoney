# ADR-021 - Cashout rules

Date: 2026-01-01
Status: accepted

## Context

Cashout allows a player to end a run early and receive a prize based on the current multiplier. We need deterministic rules for hold time, fee, and rounding.

## Decision

- Hold time: 1500ms between request and confirmation.
- Prize calculation: `prize_cents = floor(stake_cents * multiplier)`.
- House fee: `fee_cents = floor(prize_cents * fee_bps / 10000)`.
- Wallet settlement:
  - Decrease `in_game_balance_cents` by the stake.
  - Increase `available_balance_cents` by `prize_cents - fee_cents`.
- Ledger entries:
  - `PRIZE` (credit) for `prize_cents`.
  - `HOUSE_FEE` (debit) for `fee_cents`.
- Idempotency: repeated cashout events for the same run do not change state.

## Consequences

- Cashout net gain is deterministic and auditable.
- Fee is applied only on cashout.
- Run settlement can be safely retried without double credit.
