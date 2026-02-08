import { SpatialHash } from './spatial-hash';
import { PointRing } from './point-ring';
import { PelletPool } from './pellet-pool';
import type { Vector2 } from '../types';

type SlitherConfig = {
  worldRadius: number;
  tickRate: number;
  segmentDistance: number;
  maxSnakePoints: number;
  maxSendPoints: number;
  baseSpeed: number;
  boostMultiplier: number;
  boostCost: number;
  massPerPellet: number;
  baseTurnRate: number;
  turnPenalty: number;
  snakeRadius: number;
  pelletTarget: number;
  maxPellets: number;
  pelletCellSize: number;
  bodyCellSize: number;
  boostDropSpacing: number;
  deathPelletTarget: number;
  pelletRadius: number;
  pelletValueMin: number;
  pelletValueMax: number;
};

export type SlitherSnapshotPlayer = {
  id: string;
  name?: string;
  x: number;
  y: number;
  angle: number;
  boost: boolean;
  mass: number;
  radius: number;
  hue: number;
  segments: Vector2[];
};

export type SlitherPellet = {
  id: number;
  x: number;
  y: number;
  radius: number;
  value: number;
  hue: number;
};

export type SlitherPelletEvent =
  | { type: 'spawn'; pellet: SlitherPellet }
  | { type: 'delete'; id: number };

export type SlitherElimination = {
  playerId: string;
  reason: 'wall' | 'collision';
  mass: number;
};

type BotState = {
  thinkAt: number;
  desiredAngle: number;
  wiggle: number;
};

type SnakeState = {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  boost: boolean;
  mass: number;
  radius: number;
  points: PointRing;
  hue: number;
  alive: boolean;
  respawnAt: number;
  isBot: boolean;
  ai?: BotState;
  boostDropAcc: number;
  lastPointX: number;
  lastPointY: number;
  deathReason?: 'wall' | 'collision';
};

const DEFAULT_CONFIG: SlitherConfig = {
  worldRadius: 3000,
  tickRate: 30,
  segmentDistance: 12,
  maxSnakePoints: 900,
  maxSendPoints: 140,
  baseSpeed: 140,
  boostMultiplier: 1.75,
  boostCost: 14,
  massPerPellet: 1.0,
  baseTurnRate: 2.8,
  turnPenalty: 0.008,
  snakeRadius: 10,
  pelletTarget: 1260,
  maxPellets: 7000,
  pelletCellSize: 90,
  bodyCellSize: 90,
  boostDropSpacing: 26,
  deathPelletTarget: 16,
  pelletRadius: 3.0,
  pelletValueMin: 1,
  pelletValueMax: 1,
};

export class SlitherEngine {
  readonly worldRadius: number;
  readonly tickRate: number;
  readonly maxSendPoints: number;

  private readonly segmentDistance: number;
  private readonly maxSnakePoints: number;
  private readonly baseSpeed: number;
  private readonly boostMultiplier: number;
  private readonly boostCost: number;
  private readonly massPerPellet: number;
  private readonly baseTurnRate: number;
  private readonly turnPenalty: number;
  private readonly snakeRadius: number;
  private readonly headCollisionRadius: number;
  private readonly pelletTarget: number;
  private readonly pelletRadius: number;
  private readonly pelletValueMin: number;
  private readonly pelletValueMax: number;
  private readonly boostDropSpacing: number;
  private readonly deathPelletTarget: number;

  private readonly pellets: PelletPool;
  private readonly pelletHash: SpatialHash<number>;
  private readonly bodyHash: SpatialHash<{ snakeId: string; index: number }>;
  private readonly snakes = new Map<string, SnakeState>();

  private pelletEvents: SlitherPelletEvent[] = [];
  private now = Date.now();
  private readonly botNames = [
    'Ana Souza',
    'Bruno Almeida',
    'Carla Oliveira',
    'Diego Santos',
    'Eduardo Pereira',
    'Fernanda Lima',
    'Gabriel Costa',
    'Helena Araujo',
    'Igor Rodrigues',
    'Juliana Martins',
    'Lucas Ferreira',
    'Mariana Alves',
    'Nicolas Carvalho',
    'Paula Ribeiro',
    'Rafael Gomes',
    'Sofia Barbosa',
    'Thiago Teixeira',
    'Vanessa Cardoso',
    'Wesley Nogueira',
    'Yasmin Rocha',
    'Andre Silva',
    'Bianca Moreira',
    'Camila Castro',
    'Daniela Dias',
    'Felipe Azevedo',
    'Gustavo Freitas',
    'Isabela Farias',
    'Joao Batista',
    'Karen Monteiro',
    'Leandro Moura',
    'Marcela Pinto',
    'Pedro Lacerda',
    'Renata Lopes',
    'Sergio Vieira',
    'Tatiana Cunha',
    'Vitor Aguiar',
  ];
  private botNameIndex = 0;

  constructor(options: Partial<SlitherConfig> = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };
    this.worldRadius = config.worldRadius;
    this.tickRate = config.tickRate;
    this.segmentDistance = config.segmentDistance;
    this.maxSnakePoints = config.maxSnakePoints;
    this.maxSendPoints = config.maxSendPoints;
    this.baseSpeed = config.baseSpeed;
    this.boostMultiplier = config.boostMultiplier;
    this.boostCost = config.boostCost;
    this.massPerPellet = config.massPerPellet;
    this.baseTurnRate = config.baseTurnRate;
    this.turnPenalty = config.turnPenalty;
    this.snakeRadius = config.snakeRadius;
    this.headCollisionRadius = this.snakeRadius * 1.2;
    this.pelletTarget = config.pelletTarget;
    this.pelletRadius = config.pelletRadius;
    this.pelletValueMin = config.pelletValueMin;
    this.pelletValueMax = config.pelletValueMax;
    this.boostDropSpacing = config.boostDropSpacing;
    this.deathPelletTarget = config.deathPelletTarget;

    this.pellets = new PelletPool(config.maxPellets);
    this.pelletHash = new SpatialHash(config.pelletCellSize, this.worldRadius);
    this.bodyHash = new SpatialHash(config.bodyCellSize, this.worldRadius);

    this.seedPellets();
  }

  addPlayer(playerId: string, desiredSkin?: string): { x: number; y: number } {
    const { hue } = resolveSkin(desiredSkin);
    return this.createSnake(playerId, hue, false, 'anon');
  }

  addBot(botId?: string): string {
    const id = botId ?? `bot-${Math.random().toString(36).slice(2, 8)}`;
    const hue = randInt(0, 360);
    const name = this.nextBotName();
    this.createSnake(id, hue, true, name);
    return id;
  }

  ensureBots(targetCount: number): void {
    const safeTarget = Math.max(0, targetCount);
    const missing = safeTarget - this.countBots();
    for (let i = 0; i < missing; i += 1) {
      this.addBot();
    }
  }

  getBotCount(): number {
    return this.countBots();
  }

  removePlayer(playerId: string): void {
    this.snakes.delete(playerId);
  }

  handleInput(playerId: string, direction?: Vector2, boost?: boolean): void {
    const snake = this.snakes.get(playerId);
    if (!snake || !snake.alive || snake.isBot) {
      return;
    }
    if (direction && (direction.x !== 0 || direction.y !== 0)) {
      snake.targetAngle = Math.atan2(direction.y, direction.x);
    }
    if (typeof boost === 'boolean') {
      snake.boost = boost;
    }
  }

  update(dt: number): { eliminations: SlitherElimination[] } {
    this.now = Date.now();
    const eliminations: SlitherElimination[] = [];

    const dieSnake = (snake: SnakeState, reason: 'wall' | 'collision'): void => {
      if (!snake.alive) {
        return;
      }
      snake.alive = false;
      snake.boost = false;
      snake.respawnAt = this.now + 1200;
      snake.deathReason = reason;
      this.spawnDeathPellets(snake);
      if (!snake.isBot) {
        eliminations.push({ playerId: snake.id, reason, mass: snake.mass });
      }
    };

    for (const snake of this.snakes.values()) {
      if (!snake.alive && snake.respawnAt && this.now >= snake.respawnAt) {
        this.respawnSnake(snake);
      }
    }

    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        continue;
      }

      if (snake.isBot) {
        this.botThink(snake);
      }
      const targetAngle = snake.isBot && snake.ai ? snake.ai.desiredAngle : snake.targetAngle;
      const turnRate = this.baseTurnRate / (1 + snake.mass * this.turnPenalty);
      snake.angle = moveAngleTowards(snake.angle, targetAngle, turnRate * dt);

      const speed = this.baseSpeed * (snake.boost ? this.boostMultiplier : 1);
      const nx = snake.x + Math.cos(snake.angle) * speed * dt;
      const ny = snake.y + Math.sin(snake.angle) * speed * dt;

      const maxR = this.worldRadius * 0.985;
      if (nx * nx + ny * ny > maxR * maxR) {
        dieSnake(snake, 'wall');
        continue;
      }

      snake.x = nx;
      snake.y = ny;

      const d2p = dist2(snake.x, snake.y, snake.lastPointX, snake.lastPointY);
      if (d2p >= this.segmentDistance * this.segmentDistance) {
        snake.points.push(snake.x, snake.y);
        snake.lastPointX = snake.x;
        snake.lastPointY = snake.y;
      }

      const desiredPoints = this.massToPoints(snake.mass);
      while (snake.points.size() > desiredPoints) {
        snake.points.popFront();
      }

      if (snake.boost && snake.mass > 12) {
        snake.mass = Math.max(12, snake.mass - this.boostCost * dt);
        snake.boostDropAcc += speed * dt;
        while (snake.boostDropAcc >= this.boostDropSpacing) {
          snake.boostDropAcc -= this.boostDropSpacing;
          const bx = snake.x - Math.cos(snake.angle) * (snake.radius * 1.2);
          const by = snake.y - Math.sin(snake.angle) * (snake.radius * 1.2);
          this.spawnPelletAt(bx, by, 3.2, 1.0, snake.hue, true);
        }
      } else {
        snake.boostDropAcc = 0;
      }
    }

    this.rebuildBodyHash();
    this.resolvePelletEats();
    this.resolveSnakeCollisions(dieSnake);

    return { eliminations };
  }

  getSnapshotPlayers(maxPoints?: number): SlitherSnapshotPlayer[] {
    const pointsLimit = clamp(
      Math.floor(maxPoints ?? this.maxSendPoints),
      24,
      this.maxSnakePoints,
    );
    const players: SlitherSnapshotPlayer[] = [];
    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        continue;
      }
      players.push({
        id: snake.id,
        name: snake.name,
        x: snake.x,
        y: snake.y,
        angle: snake.angle,
        boost: snake.boost,
        mass: snake.mass,
        radius: snake.radius,
        hue: snake.hue,
        segments: flatToVectors(snake.points.sample(pointsLimit)),
      });
    }
    return players;
  }

  getPlayerMass(playerId: string): number | null {
    const snake = this.snakes.get(playerId);
    if (!snake || !snake.alive) {
      return null;
    }
    return snake.mass;
  }

  getActivePellets(): SlitherPellet[] {
    const pellets: SlitherPellet[] = [];
    for (let i = 0; i < this.pellets.max; i += 1) {
      if (this.pellets.active[i] === 0) {
        continue;
      }
      pellets.push({
        id: i,
        x: this.pellets.x[i],
        y: this.pellets.y[i],
        radius: this.pellets.r[i],
        value: this.pellets.v[i],
        hue: this.pellets.h[i],
      });
    }
    return pellets;
  }

  flushPelletEvents(): SlitherPelletEvent[] {
    if (this.pelletEvents.length === 0) {
      return [];
    }
    const events = this.pelletEvents;
    this.pelletEvents = [];
    return events;
  }

  private seedPellets(): void {
    for (let i = 0; i < this.pelletTarget; i += 1) {
      this.spawnPelletRandom(false);
    }
  }

  private spawnPelletRandom(
    recordEvent = true,
    hue: number = randInt(0, 360),
    value = 1.0,
    radius = 3.0,
  ): number {
    const [x, y] = this.randomPointInWorld();
    return this.spawnPelletAt(x, y, radius, value, hue, recordEvent);
  }

  private spawnPelletAt(
    x: number,
    y: number,
    radius: number,
    value: number,
    hue: number,
    recordEvent = true,
  ): number {
    const id = this.pellets.spawn(x, y, radius, value, hue);
    if (id >= 0) {
      this.pelletHash.insert(x, y, id);
      if (recordEvent) {
        this.pelletEvents.push({
          type: 'spawn',
          pellet: { id, x, y, radius, value, hue },
        });
      }
    }
    return id;
  }

  private killPellet(id: number): boolean {
    if (this.pellets.kill(id)) {
      this.pelletEvents.push({ type: 'delete', id });
      return true;
    }
    return false;
  }

  private randomPointInWorld(): [number, number] {
    const angle = randf(0, Math.PI * 2);
    const rr = Math.sqrt(Math.random()) * (this.worldRadius * 0.96);
    return [Math.cos(angle) * rr, Math.sin(angle) * rr];
  }

  private massToPoints(mass: number): number {
    const base = 10;
    const k = 1.6;
    return clamp(Math.floor(base + mass * k), base, this.maxSnakePoints);
  }

  private rebuildBodyHash(): void {
    this.bodyHash.clear();
    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        continue;
      }
      const n = snake.points.size();
      const skipHead = 6;
      const maxIndex = Math.max(0, n - skipHead);
      for (let i = 0; i < maxIndex; i += 1) {
        const [px, py] = snake.points.get(i);
        this.bodyHash.insert(px, py, { snakeId: snake.id, index: i });
      }
    }
  }

  private resolvePelletEats(): void {
    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        continue;
      }

      const eatR = snake.radius + 4.8;
      const eatR2 = eatR * eatR;
      let eaten = 0;
      for (const pid of this.pelletHash.queryNeighbors(snake.x, snake.y, 1)) {
        if (this.pellets.active[pid] === 0) {
          continue;
        }
        const px = this.pellets.x[pid];
        const py = this.pellets.y[pid];
        if (dist2(snake.x, snake.y, px, py) <= eatR2) {
          const value = this.pellets.v[pid];
          this.killPellet(pid);
          snake.mass += value * this.massPerPellet;
          this.spawnPelletRandom(true);
          eaten += 1;
          if (eaten >= 6) {
            break;
          }
        }
      }
    }
  }

  private resolveSnakeCollisions(
    dieSnake: (snake: SnakeState, reason: 'wall' | 'collision') => void,
  ): void {
    const snakesArr = Array.from(this.snakes.values()).filter((snake) => snake.alive);
    for (let i = 0; i < snakesArr.length; i += 1) {
      const a = snakesArr[i];
      if (!a.alive) {
        continue;
      }
      for (let j = i + 1; j < snakesArr.length; j += 1) {
        const b = snakesArr[j];
        if (!b.alive) {
          continue;
        }
        const r = this.headCollisionRadius + this.headCollisionRadius;
        if (dist2(a.x, a.y, b.x, b.y) <= r * r) {
          dieSnake(a, 'collision');
          dieSnake(b, 'collision');
        }
      }
    }

    const hitR = this.snakeRadius * 1.15;
    const hitR2 = hitR * hitR;
    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        continue;
      }
      for (const packed of this.bodyHash.queryNeighbors(snake.x, snake.y, 1)) {
        if (packed.snakeId === snake.id) {
          continue;
        }
        const other = this.snakes.get(packed.snakeId);
        if (!other || !other.alive) {
          continue;
        }
        const [px, py] = other.points.get(packed.index);
        if (dist2(snake.x, snake.y, px, py) <= hitR2) {
          dieSnake(snake, 'collision');
          break;
        }
      }
    }
  }

  private spawnDeathPellets(snake: SnakeState): void {
    const n = snake.points.size();
    const effectiveTarget = Math.max(1, Math.floor(this.deathPelletTarget * 0.3));
    const step = Math.max(1, Math.floor(n / effectiveTarget));
    for (let i = 0; i < n; i += step) {
      const [px, py] = snake.points.get(i);
      this.spawnPelletAt(px, py, 4.6, 2.2, snake.hue, true);
    }
    snake.points.clear();
  }

  private createSnake(
    playerId: string,
    hue: number,
    isBot: boolean,
    name: string,
  ): { x: number; y: number } {
    const [x, y] = this.randomPointInWorld();
    const angle = randf(0, Math.PI * 2);
    const points = new PointRing(this.maxSnakePoints);
    const baseMass = 6;
    const basePoints = this.massToPoints(baseMass);
    for (let i = 0; i < basePoints; i += 1) {
      const t = (basePoints - 1 - i) * this.segmentDistance;
      points.push(x - Math.cos(angle) * t, y - Math.sin(angle) * t);
    }

    const snake: SnakeState = {
      id: playerId,
      name: String(name || 'anon').slice(0, 16),
      x,
      y,
      angle,
      targetAngle: angle,
      boost: false,
      mass: baseMass,
      radius: this.snakeRadius,
      points,
      hue,
      alive: true,
      respawnAt: 0,
      isBot,
      ai: isBot
        ? {
            thinkAt: 0,
            desiredAngle: angle,
            wiggle: randf(0.3, 0.8),
          }
        : undefined,
      boostDropAcc: 0,
      lastPointX: x,
      lastPointY: y,
    };

    this.snakes.set(playerId, snake);
    return { x, y };
  }

  private respawnSnake(snake: SnakeState): void {
    const [x, y] = this.randomPointInWorld();
    const angle = randf(0, Math.PI * 2);
    snake.x = x;
    snake.y = y;
    snake.angle = angle;
    snake.targetAngle = angle;
    snake.mass = 6;
    snake.boost = false;
    snake.alive = true;
    snake.deathReason = undefined;
    snake.radius = this.snakeRadius;
    snake.points.clear();
    const basePoints = this.massToPoints(snake.mass);
    for (let i = 0; i < basePoints; i += 1) {
      const t = (basePoints - 1 - i) * this.segmentDistance;
      snake.points.push(x - Math.cos(angle) * t, y - Math.sin(angle) * t);
    }
    snake.boostDropAcc = 0;
    snake.lastPointX = x;
    snake.lastPointY = y;
    if (snake.isBot && snake.ai) {
      snake.ai.desiredAngle = angle;
      snake.ai.thinkAt = 0;
      snake.ai.wiggle = randf(0.3, 0.8);
    }
  }

  private botThink(snake: SnakeState): void {
    if (!snake.ai) {
      return;
    }
    if (this.now < snake.ai.thinkAt) {
      return;
    }

    snake.ai.thinkAt = this.now + randInt(200, 360);

    const distanceFromCenter = Math.sqrt(snake.x * snake.x + snake.y * snake.y);
    if (distanceFromCenter > this.worldRadius * 0.82) {
      snake.ai.desiredAngle = Math.atan2(-snake.y, -snake.x) + randf(-0.5, 0.5);
      snake.boost = false;
      return;
    }

    const target = this.pickTargetSnake(snake);
    if (target) {
      const dx = target.x - snake.x;
      const dy = target.y - snake.y;
      const distance = Math.hypot(dx, dy);
      const lead = clamp(distance * 0.25, 60, 200);
      const tx = target.x + Math.cos(target.angle) * lead;
      const ty = target.y + Math.sin(target.angle) * lead;
      snake.ai.desiredAngle = Math.atan2(ty - snake.y, tx - snake.x) + randf(-0.08, 0.08);
      if (distance < 700 && snake.mass > 24) {
        snake.boost = Math.random() < 0.35;
      } else if (snake.mass > 40) {
        snake.boost = Math.random() < 0.08;
      } else {
        snake.boost = false;
      }
      return;
    }

    let best: [number, number] | null = null;
    let bestScore = 0;
    let sampled = 0;
    for (const pid of this.pelletHash.queryNeighbors(snake.x, snake.y, 2)) {
      if (this.pellets.active[pid] === 0) {
        continue;
      }
      const px = this.pellets.x[pid];
      const py = this.pellets.y[pid];
      const dd2 = dist2(snake.x, snake.y, px, py);
      if (dd2 <= 1e-6) {
        continue;
      }
      const score = (this.pellets.v[pid] + 0.2) / dd2;
      if (score > bestScore) {
        bestScore = score;
        best = [px, py];
      }
      if (++sampled > 40) {
        break;
      }
    }

    if (best) {
      snake.ai.desiredAngle = Math.atan2(best[1] - snake.y, best[0] - snake.x) + randf(-0.08, 0.08);
      snake.boost = Math.random() < 0.05 && snake.mass > 35;
    } else {
      snake.ai.desiredAngle =
        snake.ai.desiredAngle + randf(-snake.ai.wiggle, snake.ai.wiggle) * 0.25;
      snake.boost = false;
    }
  }

  private countBots(): number {
    let count = 0;
    for (const snake of this.snakes.values()) {
      if (snake.isBot) {
        count += 1;
      }
    }
    return count;
  }

  private pickTargetSnake(current: SnakeState): SnakeState | null {
    let target: SnakeState | null = null;
    let bestScore = -Infinity;
    for (const snake of this.snakes.values()) {
      if (!snake.alive || snake.id === current.id || snake.isBot) {
        continue;
      }
      const dx = snake.x - current.x;
      const dy = snake.y - current.y;
      const dist2 = dx * dx + dy * dy;
      const score = -dist2;
      if (score > bestScore) {
        bestScore = score;
        target = snake;
      }
    }
    return target;
  }

  private nextBotName(): string {
    if (this.botNames.length === 0) {
      return 'Bot';
    }
    const name = this.botNames[this.botNameIndex % this.botNames.length];
    this.botNameIndex += 1;
    return name;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randf(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  }
  if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

function moveAngleTowards(current: number, target: number, maxDelta: number): number {
  const delta = angleDiff(current, target);
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

function resolveSkin(desiredSkin?: string): { hue: number } {
  if (desiredSkin && /^#[0-9a-fA-F]{6}$/.test(desiredSkin)) {
    const rgb = hexToRgb(desiredSkin);
    if (rgb) {
      return { hue: rgbToHue(rgb.r, rgb.g, rgb.b) };
    }
  }
  return { hue: randInt(0, 360) };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return null;
  }
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) {
    return null;
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  let hue = 0;
  if (max === rn) {
    hue = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    hue = (bn - rn) / delta + 2;
  } else {
    hue = (rn - gn) / delta + 4;
  }
  return Math.round((hue * 60 + 360) % 360);
}

function flatToVectors(points: number[]): Vector2[] {
  if (!points || points.length === 0) {
    return [];
  }
  const out: Vector2[] = [];
  for (let i = 0; i < points.length; i += 2) {
    out.push({ x: points[i], y: points[i + 1] });
  }
  return out;
}
