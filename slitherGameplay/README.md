# Slither-like (clone didático) — foco em desempenho + jogabilidade

> Implementação **original** (não é o código do Slither.io) inspirada no loop de jogo do gênero “snake arena”.
> Serve como base para você evoluir: otimização de rede, matchmaking, persistência, anti-cheat etc.

## Requisitos
- Node.js 18+ (recomendado)

## Rodar
```bash
npm install
npm start
```

Depois abra: http://localhost:3000

### NPCs (bots)
Por enquanto o jogo roda **sem jogadores reais**: você joga e o resto são NPCs.

Configurar quantidade de bots (padrão: 20):
```bash
BOT_COUNT=20 npm start
```

Exemplo (mais bots):
```bash
BOT_COUNT=40 npm start
```

## Controles
- Mover: mouse (direção)
- Boost: segurar **Espaço** ou **botão esquerdo do mouse**
- Zoom: roda do mouse

## O que está implementado
- Mapa circular com borda
- Pellets (com spawn e respawn)
- Boost que consome massa e deixa pellets no rastro
- Colisão cabeça vs corpo (morte e drop de massa)
- Leaderboard + minimapa
- Bots simples (opcional, configurável no servidor)

## Estrutura
- `server/` — servidor autoritativo + simulação
- `client/` — renderização Canvas + input + HUD
