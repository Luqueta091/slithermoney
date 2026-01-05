# ADR-023 - Run elimination settlement

Date: 2026-01-01
Status: accepted

## Context

When a run ends due to elimination or disconnect, the reserved stake must be settled deterministically. We need a rule that keeps wallet and ledger consistent and prevents replays from duplicating effects.

## Decision

- On elimination, the reserved stake is forfeited (not returned to available balance).
- The wallet decreases `in_game_balance_cents` by the stake amount.
- The ledger records a `STAKE_LOST` entry referencing the run.
- Elimination events are idempotent: if the run is already ended, the handler returns without additional changes.

## Consequences

- Players lose their reserved stake on elimination.
- Support can trace losses via `STAKE_LOST` in the ledger.
- Runs can be safely re-sent from the game-server without double effects.
