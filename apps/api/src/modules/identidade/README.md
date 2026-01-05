# Modulo Identidade

Responsavel por registrar e validar nome, CPF e chave Pix.

## Endpoints

- `POST /identity`
- `GET /identity/me`

## Regras

- CPF deve ser valido.
- Chave Pix deve ser valida para o tipo informado.
- Saque so permitido se status da identidade for `complete`.
