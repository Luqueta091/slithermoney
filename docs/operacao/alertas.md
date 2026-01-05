# Alertas e metricas

Este documento lista os sinais minimos para operar o ambiente em producao.

## Endpoints

- API: `GET /metrics`
- Game-server: `GET /metrics`
- Worker: `GET /metrics`

## Metricas principais

API (Pix + HTTP):
- `http.request.duration_ms` (p95)
- `http.requests.total`, `http.requests.4xx_total`, `http.requests.5xx_total`
- `pix.deposit.created_total`, `pix.deposit.confirmed_total`, `pix.deposit.confirmation_ms`
- `pix.withdrawal.requested_total`

Worker (jobs, Pix, ledger):
- `worker.jobs.pending.withdrawals`, `worker.jobs.pending.deposits`
- `worker.jobs.retry_errors_total`, `worker.jobs.dead_letter_total`
- `pix.deposit.failed_total`
- `pix.withdrawal.paid_total`, `pix.withdrawal.failed_total`, `pix.withdrawal.processing_ms`
- `ledger.divergence.detected_total`, `ledger.divergence.repaired_total`

Game-server:
- `tickLagMs`, `playersOnline`, `roomsActive`
- `disconnectsPerMinute`

## Alertas sugeridos

- Pix falhando: `pix.deposit.failed_total` ou `pix.withdrawal.failed_total` > 0 em 10m.
- Backlog alto: `worker.jobs.pending.withdrawals` ou `worker.jobs.pending.deposits` acima do limite por 10m.
- Divergencia de ledger: aumento de `ledger.divergence.detected_total` em 1h.
- Game tick degradado: `tickLagMs` acima do limite por 2m ou `disconnectsPerMinute` alto.
