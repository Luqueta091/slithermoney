# Modulo Runs

Gerencia o ciclo de runs (inicio e reserva de stake).

## Endpoints

- `POST /runs/start`
- `POST /runs/events/eliminated`
- `POST /runs/events/cashout`

## Operacoes internas

- Reservar stake na carteira
- Criar run com status `PREPARING`
- Liquidar run eliminada ou cashout
