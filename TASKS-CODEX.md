# Plano de Execução — Tasks do Projeto (para Codex)

> Objetivo: sair do zero até entrega do **Skill Betting Arena (mobile-first, BRL Pix, jogo realtime estilo slither)** com **depósito/saque**, **carteira + ledger**, **runs**, **taxa no cash-out**, **jobs operacionais** e **backoffice mínimo**.

---

## Como usar este documento
- Cada task tem um **ID** (`Txx`) e pode ser executada em ordem.
- Onde houver decisões de tecnologia/infra, crie um **ADR** em `docs/adr/` e só depois implemente.
- Sempre que finalizar uma task, garanta o **DoD** (Definition of Done) local e os **Quality Gates** globais.

---

## Quality Gates globais (obrigatórios)
- [ ] **Build passa** em CI (lint + testes + typecheck + build)
- [ ] **Sem dependência circular** entre módulos/apps
- [ ] **Sem “shared virando lixão”** (shared só utilitários genéricos; regra de negócio fica no módulo)
- [ ] **Idempotência** nas integrações Pix e nos consumers
- [ ] **Ledger auditável**: todo movimento financeiro deve ter trilha (referência e origem)
- [ ] **Observabilidade mínima**: logs estruturados + correlação de request + métricas essenciais
- [ ] **Segurança básica**: segredos fora do repo, autenticação, rate limit, validação de payload

---

## Milestones
- **M0 — Fundacional**: repo + CI + docs + ADRs + esqueleto apps/packages
- **M1 — Dinheiro**: identidade + carteira + ledger + Pix (deposit/withdraw) + jobs
- **M2 — Jogo**: game-server realtime + runs + cash-out + integração API↔game
- **M3 — Operação**: backoffice + auditoria + antifraude básico + monitoramento
- **M4 — Mobile**: fluxo completo do jogador (depositar → jogar → cash-out → sacar)
- **M5 — Entrega**: deploy staging/prod + runbooks + testes de carga + handoff

---

# M0 — Fundacional (repo, padrões, docs, ambiente)

## T01 — Criar monorepo e estrutura base
**Objetivo:** criar a árvore `apps/` e `packages/` e pastas `docs/` e `infra/`.

**Steps**
- [ ] Criar diretórios:
  - `apps/api`, `apps/game-server`, `apps/worker`, `apps/backoffice`
  - `packages/core`, `packages/contracts`, `packages/shared`
  - `docs/arquitetura`, `docs/adr`, `infra`
- [ ] Criar `README.md` raiz com visão geral + comandos
- [ ] Criar `.gitignore`, `.editorconfig`

**DoD**
- [ ] Repo compila/roda “hello world” em cada app (mesmo que mínimo)
- [ ] Imports entre apps **não existem** (apps não dependem de apps)

---

## T02 — Definir convenções e padrões (ADR obrigatório)
**Objetivo:** padronizar nomes, módulos, camadas, commits, branching, versionamento.

**Steps**
- [ ] Criar ADRs:
  - `ADR-001-monorepo-structure.md`
  - `ADR-002-naming-conventions.md`
  - `ADR-003-error-handling.md`
  - `ADR-004-observability-basics.md`
- [ ] Definir convenções:
  - pastas em `kebab-case`
  - sufixos: `.controller`, `.service`, `.repository`, `.entity`, `.dto`, `.event`
  - profundidade máxima recomendada (ex: 4 níveis)
- [ ] Definir padrão de erros (códigos, mensagens, rastreabilidade)

**DoD**
- [ ] ADRs revisados e referenciados no README
- [ ] Exemplo de módulo com camadas aparece em `docs/arquitetura/`

---

## T03 — Setup de qualidade (lint, format, typecheck, testes)
**Objetivo:** criar pipeline local e CI.

**Steps**
- [ ] Escolher ferramentas (via ADR `ADR-005-tooling.md`)
- [ ] Configurar:
  - lint
  - format
  - typecheck
  - test runner
- [ ] Criar scripts padrão: `dev`, `build`, `test`, `lint`, `format`
- [ ] Criar pipeline CI (GitHub Actions ou equivalente)

**DoD**
- [ ] CI executa e falha corretamente ao quebrar lint/test
- [ ] `make`/`task`/`npm scripts` (ou equivalente) documentado no README

---

## T04 — Esqueleto de observabilidade e configuração
**Objetivo:** padronizar config + logs + request-id/correlation-id.

**Steps**
- [ ] Criar `apps/*/src/shared/config/` (env vars, schema, validação)
- [ ] Criar logger estruturado (JSON) com:
  - `service_name`
  - `request_id`/`trace_id`
  - `user_id` quando aplicável
- [ ] Criar middleware de request-id na API
- [ ] Criar healthcheck endpoints (API e game-server)

**DoD**
- [ ] Logs têm correlação e contexto mínimo
- [ ] Healthcheck responde com status + versão

---

# M1 — Dinheiro (Pix + Wallet/Ledger + Identidade)

## T05 — Modelagem do domínio financeiro (ADR + docs)
**Objetivo:** definir conceitos e invariantes: carteira, ledger, house fee, estados.

**Steps**
- [ ] Criar ADR `ADR-010-financial-model.md` contendo:
  - diferença **carteira vs ledger**
  - movimentos possíveis (depósito, stake reservado, prêmio, taxa, saque, ajuste admin)
  - idempotência e referências externas (Pix)
  - regras de saldo (nunca negativo, bloqueios)
- [ ] Criar `docs/arquitetura/fluxo-financeiro.md` com diagramas (Mermaid)

**DoD**
- [ ] Invariantes descritos e aceitos (sem ambiguidades)
- [ ] Diagramas de fluxo: depósito, saque, cash-out

---

## T06 — Banco de dados: schema inicial + migrações
**Objetivo:** criar tabelas essenciais e migrações.

**Steps**
- [ ] Definir DB (ADR `ADR-011-database-choice.md`)
- [ ] Criar migrações iniciais:
  - `accounts`
  - `identity_profiles` (nome/cpf/chave_pix)
  - `wallets` (saldo_disponivel, saldo_em_jogo, saldo_bloqueado)
  - `ledger_entries` (imutável)
  - `pix_transactions` (cobrança/depósito/saque)
  - `runs` (estado + stake + resultados financeiros)
  - `arenas` (servidores/health/region)
  - `admin_audit_logs`
  - `fraud_flags`
- [ ] Criar índices:
  - por `account_id`, `created_at`, `external_reference`, `status`
- [ ] Criar seeds mínimos (ex: configs default de stake)

**DoD**
- [ ] Migrações sobem/descem sem erro
- [ ] Índices cobrem queries mais comuns (saldo, extrato, status pix, runs)

---

## T07 — Módulo Identidade (CPF + Pix Key)
**Objetivo:** permitir registrar/atualizar identidade e validar aptidão de saque.

**Endpoints sugeridos**
- `POST /identity` (registrar/atualizar)
- `GET /identity/me`

**Steps**
- [ ] Criar módulo `apps/api/src/modules/identidade/` com:
  - controller + dtos
  - service(s)
  - repository + interface
  - value objects (cpf, pix key)
- [ ] Validações:
  - CPF válido (algoritmo)
  - Pix key válida (por tipo)
- [ ] Regras:
  - saque só permitido se identidade “completa”

**DoD**
- [ ] Testes unitários de CPF e pix-key
- [ ] Rotas documentadas (OpenAPI ou equivalente)

---

## T08 — Módulo Carteiras (saldo agregado)
**Objetivo:** gerir saldos agregados e operações internas (creditar/debitar/bloquear/desbloquear).

**Steps**
- [ ] Criar módulo `carteiras/` com:
  - operações com transação DB
  - validação de saldo suficiente
- [ ] Expor endpoints:
  - `GET /wallet/me`
- [ ] Criar “service helpers” internos para consumo por Pix/Runs

**DoD**
- [ ] Não permite saldo negativo
- [ ] Teste de concorrência básico (duas debitações simultâneas)

---

## T09 — Módulo Ledger (extrato auditável)
**Objetivo:** registrar movimentos imutáveis, correlacionados com eventos/ações.

**Steps**
- [ ] Criar `ledger/` com:
  - `registrar-movimento` (service)
  - `extrato` (query)
  - tipagem do movimento (`DEPOSIT`, `STAKE_RESERVED`, `PRIZE`, `HOUSE_FEE`, `WITHDRAW_REQUEST`, `WITHDRAW_PAID`, `ADMIN_ADJUST`, etc.)
- [ ] Garantir:
  - entrada sempre append-only
  - referência externa quando aplicável (Pix e2e, txid)

**DoD**
- [ ] Todo fluxo financeiro cria ledger entry
- [ ] Extrato retorna paginação, ordenação, filtros por tipo/data

---

## T10 — Integração Pix: criar cobrança (depósito)
**Objetivo:** gerar cobrança Pix e armazenar transação com idempotência.

**Steps**
- [ ] Criar módulo `pix/` e interface `PixGateway`
- [ ] Implementar `criar-cobranca`:
  - gerar idempotency-key por request (ou aceitar do cliente)
  - persistir `pix_transaction` com status inicial
- [ ] Expor endpoint:
  - `POST /pix/deposits` → retorna payload (QR/txid/etc.)

**DoD**
- [ ] Requisições repetidas com mesma idempotency-key não criam duplicado
- [ ] Teste de idempotência (mesmo payload)

---

## T11 — Pix webhook/confirmador de depósito
**Objetivo:** confirmar depósito via webhook (e/ou polling), creditar carteira e registrar ledger.

**Steps**
- [ ] Endpoint:
  - `POST /pix/webhook` (validar assinatura/segredo)
- [ ] Fluxo:
  - validar payload
  - localizar `pix_transaction`
  - aplicar idempotência (não processar duas vezes)
  - registrar `ledger: DEPOSIT`
  - creditar carteira (saldo_disponivel)
- [ ] Emitir evento interno `deposito-confirmado`

**DoD**
- [ ] Webhook duplicado não duplica crédito
- [ ] Logs registram external reference + account_id

---

## T12 — Saque Pix (request + processamento)
**Objetivo:** criar pedido de saque e processar async via worker.

**Steps**
- [ ] Endpoint:
  - `POST /pix/withdrawals` (requer identidade completa)
- [ ] Regras:
  - validar saldo disponível
  - criar transação de saque com status `REQUESTED`
  - registrar ledger `WITHDRAW_REQUEST`
  - bloquear saldo (ex: mover para `saldo_bloqueado`)
  - publicar job/evento `processar-saque-pix`
- [ ] Worker executa payout via PSP e atualiza status:
  - `PAID` → ledger `WITHDRAW_PAID` + desbloqueio final (se aplicável)
  - `FAILED` → rollback do bloqueio + ledger `WITHDRAW_FAILED`

**DoD**
- [ ] Saque é idempotente por request_id
- [ ] Worker tem retry/backoff e DLQ (ADR)

---

## T13 — Jobs operacionais Pix + conciliação
**Objetivo:** automatizar rotinas do operador.

**Jobs**
- [ ] expirar cobranças pendentes
- [ ] reprocessar webhooks perdidos (fallback)
- [ ] conciliar ledger vs PSP (alertar divergências)
- [ ] reconciliação diária / relatórios simples

**DoD**
- [ ] Rotina de conciliação gera relatório e flags
- [ ] Sem duplicar efeitos (idempotência em consumers)

---

# M2 — Jogo (Realtime + Runs + Cash-out)

## T14 — ADR do realtime e authoritative server
**Objetivo:** definir protocolo e garantias do game loop.

**Steps**
- [ ] Criar ADR `ADR-020-realtime-protocol.md`:
  - protocolo (WebSocket/UDP/etc.) e justificativa
  - tick rate
  - snapshot/inputs
  - regras anti-lag e desconexão
- [ ] Criar `docs/arquitetura/realtime.md` com diagramas:
  - handshake
  - join arena
  - start run
  - cash-out request

**DoD**
- [ ] Fluxos realtime documentados e reproduzíveis em teste

---

## T15 — Game-server: base do loop + rooms/arenas
**Objetivo:** levantar servidor realtime com arenas (rooms) e broadcast de estado.

**Steps**
- [ ] Implementar:
  - start/stop server
  - criação e gerenciamento de rooms
  - tick loop
  - registro de players e inputs
- [ ] Health/metrics:
  - players online
  - rooms ativas
  - tick lag

**DoD**
- [ ] Uma arena suporta N jogadores (config) sem crash
- [ ] Logs de conexão/desconexão + motivo

---

## T16 — Runs: reserva de stake → spawn → estado da run
**Objetivo:** integrar API com game-server para criar run e reservar stake.

**API Steps**
- [ ] Endpoint `POST /runs/start`:
  - validar stake (quick pick ou custom)
  - bloquear valor na carteira (mover para `saldo_em_jogo` ou `bloqueado`)
  - criar `run` com estado `PREPARING`
  - retornar dados para conexão/join (arena/room/token)

**Game-server Steps**
- [ ] Receber player, validar token, spawnar worm
- [ ] Atualizar estado `IN_GAME`

**DoD**
- [ ] Stake fica reservado antes de spawn
- [ ] Run criada e sincronizada com game-server

---

## T17 — Multiplicador por faixas (tamanho_score)
**Objetivo:** aplicar tabela de multiplicador configurável.

**Steps**
- [ ] Criar tabela/config (`configuracoes` ou `stakes`)
  - faixas: `min_size`, `max_size`, `multiplier`
- [ ] Game-server atualiza `tamanho_score` e calcula `multiplier_atual`
- [ ] Expor no HUD/estado (contract em `packages/contracts`)

**DoD**
- [ ] Multiplicador consistente e testável (determinístico)
- [ ] Mudança de configuração não quebra runs ativas (definir regra em ADR)

---

## T18 — Eliminação e encerramento de run
**Objetivo:** finalizar run ao morrer/desconectar e liquidar corretamente.

**Steps**
- [ ] Game-server emite evento `run-eliminada` com:
  - account_id, run_id, tamanho_final, motivo
- [ ] API consome evento e:
  - marca run `ELIMINATED`
  - libera/reseta stake conforme regra (geralmente stake perdida para house/poço — decidir em ADR)
  - registra ledger correspondentes

**DoD**
- [ ] Estado final da run é consistente mesmo com desconexão
- [ ] Nenhuma run fica “pendurada” (job de limpeza + timeout)

---

## T19 — Cash-out (hold + taxa da casa)
**Objetivo:** permitir cash-out com “hold time” e aplicar fee no cash-out.

**Steps**
- [ ] Definir ADR `ADR-021-cashout-rules.md`:
  - hold time
  - taxa (%)
  - arredondamento
  - limites (ex: mínimo de size)
- [ ] Game-server:
  - receber pedido de cash-out do jogador
  - iniciar `cashout_hold` (se morrer durante hold, cancela)
  - ao finalizar hold, emite evento `run-cashout`
- [ ] API:
  - calcular prêmio = stake * multiplier_atual
  - calcular taxa = prêmio * fee%
  - registrar ledger: `PRIZE` e `HOUSE_FEE`
  - creditar carteira (saldo_disponivel)

**DoD**
- [ ] Taxa é aplicada somente no cash-out (como regra)
- [ ] Cash-out é idempotente por `run_id`
- [ ] Se morrer durante hold: não paga (regra clara)

---

## T20 — Contratos e compatibilidade API↔game
**Objetivo:** garantir que contratos sejam versionados e testados.

**Steps**
- [ ] Definir eventos e payloads em `packages/contracts/realtime`
- [ ] Criar testes de contrato (snapshot) entre API e game-server
- [ ] Criar versionamento simples (ex: `v1`)

**DoD**
- [ ] Mudança em contrato quebra build sem atualização coordenada
- [ ] Documentação dos eventos atualizada

---

# M3 — Operação (Backoffice, auditoria, antifraude, suporte)

## T21 — Backoffice mínimo (dashboard e consultas)
**Objetivo:** permitir operação do produto sem acessar DB manualmente.

**Features**
- [ ] Dashboard: métricas básicas (depósitos, saques, runs, receita fee)
- [ ] Usuários: buscar por cpf/id, ver status, ver saldo e flags
- [ ] Pix: listar transações, status, detalhes
- [ ] Ledger: extrato por usuário, filtros
- [ ] Runs: listar runs, status, resultados

**DoD**
- [ ] Perfis de acesso (admin/suporte) (ADR)
- [ ] Tudo auditado (quem fez o quê)

---

## T22 — Auditoria de ações administrativas
**Objetivo:** registrar ações do backoffice.

**Steps**
- [ ] Tabela `admin_audit_logs` + service de registro
- [ ] Auditar:
  - ban/unban
  - ajuste de saldo (se existir)
  - mudança de configuração (stakes/fee)
  - reprocessamentos Pix

**DoD**
- [ ] Toda ação admin cria audit log com before/after

---

## T23 — Antifraude básico (flags e políticas)
**Objetivo:** detectar abuso e permitir mitigação.

**Sinais iniciais**
- [ ] múltiplas contas por dispositivo/CPF
- [ ] padrões de cash-out muito acima da média
- [ ] tentativas repetidas de webhook inválido
- [ ] saques sequenciais suspeitos
- [ ] inputs impossíveis (teleport, speed) (do game-server)

**DoD**
- [ ] Flags persistidas em `fraud_flags`
- [ ] Backoffice exibe flags e permite ações

---

# M4 — Mobile (fluxo do jogador)

## T24 — Onboarding e autenticação
**Objetivo:** login/cadastro e sessão.

**Steps**
- [ ] Tela de cadastro/login
- [ ] Persistência de token
- [ ] Fluxo de completar identidade (nome/cpf/pix key)

**DoD**
- [ ] Usuário consegue chegar no lobby autenticado

---

## T25 — Depósito Pix (UX completa)
**Objetivo:** depositar em BRL via Pix.

**Steps**
- [ ] Tela “Depositar”
- [ ] Criar cobrança via API
- [ ] Exibir QR/“copia e cola”
- [ ] Polling de status (fallback) até confirmar
- [ ] Atualizar saldo + mostrar confirmação

**DoD**
- [ ] Depósito confirmado reflete saldo sem recarregar app
- [ ] Tratamento de erro (expirado, falhou, tempo limite)

---

## T26 — Lobby e seleção de stake (quick picks + custom)
**Objetivo:** permitir escolher aposta de forma rápida.

**Steps**
- [ ] UI com quick picks (chips/botões)
- [ ] Input de valor custom com validação e limites
- [ ] Mostrar saldo disponível e aviso de “valor será reservado”

**DoD**
- [ ] Não permite stake inválido
- [ ] Integra com `POST /runs/start`

---

## T27 — Gameplay realtime + HUD (size e multiplier)
**Objetivo:** entrar na arena e jogar.

**Steps**
- [ ] Conectar no game-server usando dados de `/runs/start`
- [ ] Renderizar estado e inputs (movimento/boost)
- [ ] HUD: tamanho_score + multiplicador atual
- [ ] Botão cash-out (com indicação de hold)

**DoD**
- [ ] Reconecta/retorna ao lobby em caso de queda
- [ ] Telemetria mínima do client (crash/latência)

---

## T28 — Histórico e saque (UX)
**Objetivo:** permitir ver histórico e sacar via Pix.

**Steps**
- [ ] Tela “Histórico” (runs + depósitos + saques)
- [ ] Tela “Sacar”:
  - valida identidade
  - solicita saque
  - acompanha status

**DoD**
- [ ] Saque exibe status e mensagens claras
- [ ] Erros comuns tratados (saldo insuficiente, identidade incompleta)

---

# M5 — Entrega (infra, deploy, testes, runbooks)

## T29 — Infra local + ambientes (staging/prod)
**Objetivo:** padronizar ambientes e provisionamento.

**Steps**
- [ ] Definir ADR `ADR-030-deployment-strategy.md`
- [ ] Criar `infra/` com:
  - DB
  - fila/redis (se aplicável)
  - variáveis por ambiente
- [ ] Criar scripts para subir stack local

**DoD**
- [ ] Um dev novo consegue subir o projeto do zero (documentado)

---

## T30 — CI/CD e deploy automatizado
**Objetivo:** build, testes e deploy.

**Steps**
- [ ] Pipeline de build por app
- [ ] Deploy staging automático em merge
- [ ] Deploy prod com aprovação/manual gate
- [ ] Migrações automatizadas (com rollback strategy definida)

**DoD**
- [ ] Deploy staging com smoke tests
- [ ] Versão/commit aparece em healthcheck

---

## T31 — Observabilidade em produção (logs, métricas, alertas)
**Objetivo:** operar sem “chutar no escuro”.

**Métricas mínimas**
- [ ] API: latência p95, erros 4xx/5xx, throughput
- [ ] Pix: taxa de sucesso, tempo de confirmação, falhas
- [ ] Ledger: divergências na conciliação
- [ ] Game-server: tick lag, players online, disconnect rate
- [ ] Worker: jobs pendentes, retries, DLQ

**DoD**
- [ ] Alertas para: falha Pix, backlog alto, divergência ledger, game tick degradado

---

## T32 — Testes (unit, integração, contrato, carga)
**Objetivo:** garantir qualidade e capacidade.

**Steps**
- [ ] Unit tests:
  - CPF/pix key
  - cálculo de prêmio/taxa/arredondamento
  - regras de saldo
- [ ] Integração:
  - depósito webhook idempotente
  - saque async com retries
  - start run → cashout → crédito
- [ ] Contrato:
  - API↔game-server events
- [ ] Carga:
  - API (depósito/saque/start run)
  - game-server (players/room/tick)

**DoD**
- [ ] Relatório de carga com limites atuais + recomendações
- [ ] Gates em CI para testes críticos

---

## T33 — Segurança e compliance básica (BR)
**Objetivo:** reduzir risco operacional.

**Steps**
- [ ] Segredos e chaves fora do repo (vault/secret manager)
- [ ] Rate limit em rotas críticas (login, pix, runs)
- [ ] Proteção de webhook (assinatura/allowlist)
- [ ] Logs sem vazar PII (CPF mascarado; pix key com cuidado)
- [ ] Termos/consentimento no app (quando aplicável)

**DoD**
- [ ] Checklist de segurança assinado em `docs/`
- [ ] Pentest básico/scan de dependências (automático)

---

## T34 — Documentação de entrega (runbooks + handoff)
**Objetivo:** permitir operação e evolução.

**Artifacts**
- [ ] `docs/arquitetura/`:
  - Macro arquitetura (C4 + módulos + fluxos)
  - Micro (por módulo: pastas, interfaces, casos de uso, eventos)
  - Arquitetura do banco (ERD + índices + estratégia)
- [ ] `docs/runbooks/`:
  - “Como investigar depósito não confirmado”
  - “Como investigar divergência de saldo”
  - “Como lidar com saque falho”
  - “Como lidar com degradação do game-server”
- [ ] `CHANGELOG.md` e versão `v1.0.0`

**DoD**
- [ ] Um operador consegue resolver incidentes comuns só com runbook
- [ ] Projeto publicado/entregue com instruções de deploy e rollback

---

# Anexos — Checklist de entrega rápida (MVP V1)
- [ ] Cadastro/login
- [ ] Perfil Pix (nome/cpf/chave)
- [ ] Depósito Pix (gera + confirma)
- [ ] Carteira + ledger
- [ ] Lobby: quick picks + valor custom
- [ ] Run: reserva aposta → spawn → jogo realtime
- [ ] Multiplicador por faixas
- [ ] Cash-out hold + taxa
- [ ] Saque Pix + status
- [ ] Backoffice mínimo + auditoria
