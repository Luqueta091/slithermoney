# Gameplay Fidelity - SlitherMoney

## Fonte da verdade
- `slitherGameplay/server/game.js` (engine de referencia)
- `slitherGameplay/server/spatial-hash.js` e `slitherGameplay/server/game.js` (constantes/ordem de loop)

## Ordem do loop (igual a referencia)
1. Respawn de cobras mortas.
2. Movimento (angulo -> velocidade -> posicao).
3. Atualizacao do corpo (segmentDist, mass->points).
4. Boost: consumo de massa e drop de pellets.
5. Rebuild do hash do corpo.
6. Resolucao de pellets.
7. Resolucao de colisoes (head-head, head-body).

## Parametros e regras (valores da referencia)
- Tick rate: 30.
- worldRadius: 3000 (borda circular, morte ao ultrapassar 0.985 * worldRadius).
- segmentDist: 12.
- maxSnakePoints: 900.
- maxSendPoints: 140.
- baseSpeed: 140.
- boostMult: 1.75.
- boostCost: 14 (massa por segundo).
- massPerPellet: 1.0.
- baseTurnRate: 2.8.
- turnPenalty: 0.008 (reduz curva conforme massa).
- snakeRadius: 10.
- headCollisionRadius: snakeRadius * 1.2.
- head-body hit radius: snakeRadius * 1.15.
- pelletTarget: 4200.
- maxPellets: 7000.
- pelletCellSize: 90.
- bodyCellSize: 90.
- pelletRadius: 3.0.
- pelletValue: 1.0.
- eat radius: snakeRadius + 4.8.
- max pellets eaten por tick: 6.
- boost min mass: 12.
- boostDropSpacing: 26.
- boost pellet radius/value: 3.2 / 1.0.
- deathPelletTarget: 80 (step = max(1, floor(n / 80))).
- death pellet radius/value: 4.6 / 2.2.
- respawn delay: 1200 ms.
- mass->points: base 24, k 1.9 (clamp em maxSnakePoints).
- skipHead no body hash: 6 pontos (evita auto-colisao perto da cabeca).
- head-head: ambos morrem.

## Confirmacao de equivalencia
- `apps/game-server/src/modules/realtime/slither/engine.ts` replica o mesmo loop, constantes e regras da engine referencia.
- `apps/game-server/src/modules/realtime/slither/point-ring.ts`, `pellet-pool.ts` e `spatial-hash.ts` espelham as estruturas da referencia.
- A integracao de apostas/cashout e eventos ocorre fora da engine (adapter layer em `apps/game-server/src/main.ts` e `apps/game-server/src/modules/realtime/run-events.ts`).
