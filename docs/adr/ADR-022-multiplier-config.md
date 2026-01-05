# ADR-022 - Multiplier ranges config

Date: 2026-01-01
Status: accepted

## Context

Multiplier ranges depend on player size and must be deterministic during a run. We need a rule that allows updating the ranges without breaking runs already in progress.

## Decision

- Multiplier ranges are versioned via configuration stored in `size_multipliers`.
- The game-server loads ranges at process start and does not hot-reload them.
- Changes in ranges only apply to new runs after a server restart (or a controlled rollout).

## Consequences

- Active runs keep consistent multipliers for their entire lifecycle.
- Operational changes require a controlled deploy to apply new ranges.
- Future work can add live reload with per-run config snapshots if needed.
