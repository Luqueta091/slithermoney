# Infra local

## Subir Postgres

```bash
./infra/dev-up.sh
```

## Derrubar Postgres

```bash
./infra/dev-down.sh
```

## Variaveis

Copie `infra/.env.example` para `infra/.env` se quiser mudar portas/credenciais.

A string do banco local deve ficar assim (exemplo):

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/slithermoney?sslmode=disable
```
