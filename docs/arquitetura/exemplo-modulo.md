# Exemplo de modulo (api)

This document shows a minimal module layout inside `apps/api/src/modules/`.

```
apps/api/src/modules/carteiras/
├── controllers/
│   └── saldo.controller.ts
├── services/
│   ├── creditar.service.ts
│   └── debitar.service.ts
├── repository/
│   ├── carteiras.repository.ts
│   └── carteiras.repository.impl.ts
├── domain/
│   ├── carteira.entity.ts
│   └── rules/
│       └── nao-permitir-saldo-negativo.rule.ts
├── dtos/
│   └── saldo.dto.ts
├── events/
│   └── saldo-atualizado.event.ts
└── index.ts
```

Notes:

- Each module owns its domain rules and data access.
- `shared/` is for generic helpers only.
- Avoid cross-module imports that create circular dependencies.
