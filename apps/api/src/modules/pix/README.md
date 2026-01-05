# Modulo Pix

Gerencia cobrancas e transacoes Pix.

## Endpoints

- `POST /pix/deposits`
- `POST /pix/webhook`
- `POST /pix/withdrawals`

## Operacoes internas

- Criar cobranca Pix com idempotencia
- Confirmar deposito via webhook e creditar carteira
- Solicitar saque com bloqueio de saldo e ledger
