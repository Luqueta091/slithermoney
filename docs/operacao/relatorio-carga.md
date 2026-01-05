# Relatorio de carga (template)

Use este arquivo para registrar os resultados de carga de API e game-server.

## Ambiente

- data:
- commit (GIT_SHA):
- hardware:
- api_base_url:
- game_url:
- banco:

## Cenarios e resultados

### API - deposito (criar + confirmar)

Comando:
```
LOAD_MODE=deposit LOAD_API_URL=http://localhost:3000 LOAD_ACCOUNT_ID=<uuid> LOAD_AMOUNT_CENTS=100 \
  LOAD_ITERATIONS=50 LOAD_CONCURRENCY=5 node scripts/load-test-api.js
```

Resultado (cole o JSON):
```
TBD
```

### API - saque (request)

Comando:
```
LOAD_MODE=withdrawal LOAD_API_URL=http://localhost:3000 LOAD_ACCOUNT_ID=<uuid> \
  LOAD_FULL_NAME="Nome" LOAD_CPF="00000000000" LOAD_PIX_KEY="email@exemplo.com" \
  LOAD_PIX_KEY_TYPE=email LOAD_AMOUNT_CENTS=100 LOAD_ITERATIONS=50 LOAD_CONCURRENCY=5 \
  node scripts/load-test-api.js
```

Resultado:
```
TBD
```

### API - start run

Comando:
```
LOAD_MODE=run LOAD_API_URL=http://localhost:3000 LOAD_ACCOUNT_ID=<uuid> \
  LOAD_STAKE_CENTS=100 LOAD_ITERATIONS=50 LOAD_CONCURRENCY=5 node scripts/load-test-api.js
```

Resultado:
```
TBD
```

### Game-server - players/tick

Comando:
```
LOAD_GAME_URL=ws://localhost:4000 LOAD_CLIENTS=50 LOAD_DURATION_MS=10000 \
  LOAD_INPUT_INTERVAL_MS=100 node scripts/load-test-game.js
```

Resultado:
```
TBD
```

## Limites atuais e recomendacoes

- TBD: registrar limites observados (p95, erros, saturacao) e recomendacoes.
