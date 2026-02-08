'use strict';

const { SpatialHash } = require('./spatial-hash');

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function randf(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return (a + Math.floor(Math.random() * (b - a + 1))); }

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function angleDiff(a, b) {
  // retorna diff em [-PI, PI]
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function moveAngleTowards(a, target, maxDelta) {
  const d = angleDiff(a, target);
  if (Math.abs(d) <= maxDelta) return target;
  return a + Math.sign(d) * maxDelta;
}

class PointRing {
  constructor(capacityPoints) {
    this.cap = Math.max(16, capacityPoints | 0);
    this.buf = new Float32Array(this.cap * 2);
    this.start = 0; // índice do elemento mais antigo (tail)
    this.count = 0; // quantos pontos ativos
  }

  clear() {
    this.start = 0;
    this.count = 0;
  }

  size() { return this.count; }

  push(x, y) {
    let idx;
    if (this.count < this.cap) {
      idx = (this.start + this.count) % this.cap;
      this.count++;
    } else {
      // overwrite oldest
      this.start = (this.start + 1) % this.cap;
      idx = (this.start + this.count - 1) % this.cap;
    }
    const bi = idx * 2;
    this.buf[bi] = x;
    this.buf[bi + 1] = y;
  }

  popFront() {
    if (this.count <= 0) return;
    this.start = (this.start + 1) % this.cap;
    this.count--;
  }

  get(i) {
    // i: 0..count-1, 0 = oldest (tail), last = head
    const idx = (this.start + i) % this.cap;
    const bi = idx * 2;
    return [this.buf[bi], this.buf[bi + 1]];
  }

  getHead() {
    if (this.count <= 0) return [0, 0];
    return this.get(this.count - 1);
  }

  forEach(cb) {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.start + i) % this.cap;
      const bi = idx * 2;
      cb(this.buf[bi], this.buf[bi + 1], i);
    }
  }

  sample(maxPoints) {
    const n = this.count;
    if (n <= 0) return [];
    const out = [];
    if (n <= maxPoints) {
      out.length = n * 2;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const idx = (this.start + i) % this.cap;
        const bi = idx * 2;
        out[k++] = this.buf[bi];
        out[k++] = this.buf[bi + 1];
      }
      return out;
    }

    // downsample uniforme (tail->head)
    const step = n / maxPoints;
    out.length = maxPoints * 2;
    let k = 0;
    for (let i = 0; i < maxPoints; i++) {
      const src = Math.floor(i * step);
      const idx = (this.start + src) % this.cap;
      const bi = idx * 2;
      out[k++] = this.buf[bi];
      out[k++] = this.buf[bi + 1];
    }
    return out;
  }
}

class PelletPool {
  constructor(maxPellets) {
    this.max = maxPellets | 0;
    this.x = new Float32Array(this.max);
    this.y = new Float32Array(this.max);
    this.r = new Float32Array(this.max);
    this.v = new Float32Array(this.max);
    this.h = new Uint16Array(this.max);
    this.active = new Uint8Array(this.max);
    this.free = [];
    for (let i = 0; i < this.max; i++) this.free.push(i);
  }

  spawn(x, y, r, v, h) {
    if (this.free.length <= 0) return -1;
    const id = this.free.pop();
    this.x[id] = x; this.y[id] = y;
    this.r[id] = r; this.v[id] = v;
    this.h[id] = h;
    this.active[id] = 1;
    return id;
  }

  kill(id) {
    if (id < 0 || id >= this.max) return false;
    if (this.active[id] === 0) return false;
    this.active[id] = 0;
    this.free.push(id);
    return true;
  }
}

class Game {
  constructor(opts) {
    this.worldRadius = opts.worldRadius ?? 3000;
    this.tickRate = opts.tickRate ?? 30;

    this.segmentDist = opts.segmentDist ?? 12;
    this.maxSnakePoints = opts.maxSnakePoints ?? 900;
    this.maxSendPoints = opts.maxSendPoints ?? 140;

    this.baseSpeed = opts.baseSpeed ?? 140; // world units / s
    this.boostMult = opts.boostMult ?? 1.75;
    this.boostCost = opts.boostCost ?? 14; // mass per second
    this.massPerPellet = opts.massPerPellet ?? 1.0;

    this.baseTurnRate = opts.baseTurnRate ?? 2.8; // rad/s (snake pequeno)
    this.turnPenalty = opts.turnPenalty ?? 0.008; // cresce com massa -> menos curva

    this.snakeRadius = opts.snakeRadius ?? 10;
    this.headCollisionRadius = this.snakeRadius * 1.2;

    this.pelletTarget = opts.pelletTarget ?? 4200;
    this.maxPellets = opts.maxPellets ?? 7000;

    this.pellets = new PelletPool(this.maxPellets);
    this.pelletHash = new SpatialHash(opts.pelletCellSize ?? 90, this.worldRadius);
    this.bodyHash = new SpatialHash(opts.bodyCellSize ?? 90, this.worldRadius);

    this.snakes = new Map(); // id -> snake
    this._nextId = 1;

    this.pelletEvents = []; // eventos desde o último snapshot
    this._now = Date.now();

    this._initPellets();
  }

  _initPellets() {
    for (let i = 0; i < this.pelletTarget; i++) {
      this._spawnPelletRandom(false);
    }
  }

  _randomPointInWorld() {
    // uniforme em área: r = sqrt(u)
    const a = randf(0, Math.PI * 2);
    const rr = Math.sqrt(Math.random()) * (this.worldRadius * 0.96);
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  }

  _spawnPelletRandom(recordEvent = true, hue = randInt(0, 360), v = 1.0, r = 3.0) {
    const [x, y] = this._randomPointInWorld();
    return this._spawnPelletAt(x, y, r, v, hue, recordEvent);
  }

  _spawnPelletAt(x, y, r, v, hue, recordEvent = true) {
    const id = this.pellets.spawn(x, y, r, v, hue);
    if (id >= 0) {
      this.pelletHash.insert(x, y, id);
      if (recordEvent) this.pelletEvents.push(['s', id, x, y, r, v, hue]);
    }
    return id;
  }

  _killPellet(id) {
    if (this.pellets.kill(id)) {
      this.pelletEvents.push(['d', id]);
      return true;
    }
    return false;
  }

  addPlayer(name = 'anon') {
    const id = this._nextId++;
    const snake = this._createSnake(id, name, false);
    this.snakes.set(id, snake);
    return id;
  }

  addBot(name = 'bot') {
    const id = this._nextId++;
    const snake = this._createSnake(id, name, true);
    this.snakes.set(id, snake);
    return id;
  }

  removePlayer(id) {
    this.snakes.delete(id);
  }

  handleInput(id, input) {
    const s = this.snakes.get(id);
    if (!s || !s.alive || s.isBot) return;
    if (typeof input.a === 'number') s.targetAngle = input.a;
    if (typeof input.b === 'boolean') s.boost = input.b;
  }

  _createSnake(id, name, isBot) {
    const hue = randInt(0, 360);
    const [x, y] = this._randomPointInWorld();
    const angle = randf(0, Math.PI * 2);
    const points = new PointRing(this.maxSnakePoints);
    // corpo inicial (uma linha)
    const baseMass = 20;
    const basePoints = this._massToPoints(baseMass);
    for (let i = 0; i < basePoints; i++) {
      const t = (basePoints - 1 - i) * this.segmentDist;
      points.push(x - Math.cos(angle) * t, y - Math.sin(angle) * t);
    }

    return {
      id,
      name: String(name || 'anon').slice(0, 16),
      hue,
      x, y,
      angle,
      targetAngle: angle,
      boost: false,
      mass: baseMass,
      radius: this.snakeRadius,
      points,
      alive: true,
      respawnAt: 0,
      isBot,
      ai: {
        thinkAt: 0,
        desiredAngle: angle,
        wiggle: randf(0.3, 0.8),
      },
      boostDropAcc: 0,
      lastPointX: x,
      lastPointY: y,
    };
  }

  _massToPoints(mass) {
    // curva suave: começa com um mínimo e cresce com massa
    const base = 24;
    const k = 1.9;
    return clamp(Math.floor(base + mass * k), base, this.maxSnakePoints);
  }

  _rebuildBodyHash() {
    this.bodyHash.clear();
    for (const s of this.snakes.values()) {
      if (!s.alive) continue;

      const n = s.points.size();
      // evitar colisão "instantânea" com os últimos pontos (perto da cabeça)
      const skipTail = 0;
      const skipHead = 6;

      const maxI = Math.max(0, n - skipHead);
      for (let i = skipTail; i < maxI; i++) {
        const [px, py] = s.points.get(i);
        // item compacto: [snakeId, pointIndex]
        this.bodyHash.insert(px, py, (s.id << 16) | (i & 0xffff));
      }
    }
  }

  _dieSnake(s) {
    if (!s.alive) return;
    s.alive = false;
    s.boost = false;
    s.respawnAt = this._now + 1200;

    // drop de massa: pellets maiores ao longo do corpo
    const n = s.points.size();
    const step = Math.max(1, Math.floor(n / 80)); // no máximo ~80 drops
    for (let i = 0; i < n; i += step) {
      const [px, py] = s.points.get(i);
      const v = 2.2;
      const r = 4.6;
      this._spawnPelletAt(px, py, r, v, s.hue, true);
    }

    // limpar corpo (sumir da tela rápido)
    s.points.clear();
  }

  _respawnSnake(s) {
    const [x, y] = this._randomPointInWorld();
    const angle = randf(0, Math.PI * 2);
    s.x = x; s.y = y;
    s.angle = angle;
    s.targetAngle = angle;
    s.mass = 20;
    s.boost = false;
    s.alive = true;

    s.points.clear();
    const basePoints = this._massToPoints(s.mass);
    for (let i = 0; i < basePoints; i++) {
      const t = (basePoints - 1 - i) * this.segmentDist;
      s.points.push(x - Math.cos(angle) * t, y - Math.sin(angle) * t);
    }

    s.boostDropAcc = 0;
    s.lastPointX = x;
    s.lastPointY = y;
  }

  _botThink(s) {
    // AI bem simples: evita borda e "puxa" pra pellets próximos
    const now = this._now;
    if (now < s.ai.thinkAt) return;

    s.ai.thinkAt = now + randInt(120, 260);

    // 1) evitar borda
    const d = Math.sqrt(s.x * s.x + s.y * s.y);
    if (d > this.worldRadius * 0.82) {
      s.ai.desiredAngle = Math.atan2(-s.y, -s.x) + randf(-0.5, 0.5);
      s.boost = false;
      return;
    }

    // 2) buscar pellet mais "atrativo" perto (amostra pequena)
    let best = null;
    let bestScore = 0;

    let sampled = 0;
    for (const pid of this.pelletHash.queryNeighbors(s.x, s.y, 2)) {
      if (this.pellets.active[pid] === 0) continue;
      const px = this.pellets.x[pid], py = this.pellets.y[pid];
      const dd2 = dist2(s.x, s.y, px, py);
      if (dd2 <= 1e-6) continue;
      const score = (this.pellets.v[pid] + 0.2) / dd2; // maior valor e mais perto
      if (score > bestScore) {
        bestScore = score;
        best = [px, py];
      }
      if (++sampled > 40) break;
    }

    if (best) {
      s.ai.desiredAngle = Math.atan2(best[1] - s.y, best[0] - s.x) + randf(-0.08, 0.08);
      s.boost = (Math.random() < 0.08 && s.mass > 35);
    } else {
      // passeio aleatório controlado
      s.ai.desiredAngle = s.ai.desiredAngle + randf(-s.ai.wiggle, s.ai.wiggle) * 0.25;
      s.boost = false;
    }
  }

  update(dt) {
    this._now = Date.now();

    // respawns
    for (const s of this.snakes.values()) {
      if (!s.alive && s.respawnAt && this._now >= s.respawnAt) {
        this._respawnSnake(s);
      }
    }

    // simulação de movimento
    for (const s of this.snakes.values()) {
      if (!s.alive) continue;

      if (s.isBot) this._botThink(s);

      const desired = s.isBot ? s.ai.desiredAngle : s.targetAngle;
      const turnRate = this.baseTurnRate / (1 + s.mass * this.turnPenalty);
      s.angle = moveAngleTowards(s.angle, desired, turnRate * dt);

      const speed = this.baseSpeed * (s.boost ? this.boostMult : 1);
      const vx = Math.cos(s.angle) * speed;
      const vy = Math.sin(s.angle) * speed;

      const nx = s.x + vx * dt;
      const ny = s.y + vy * dt;

      // borda circular: morrer se bater
      const rr2 = nx * nx + ny * ny;
      const maxR = this.worldRadius * 0.985;
      if (rr2 > maxR * maxR) {
        this._dieSnake(s);
        continue;
      }

      s.x = nx; s.y = ny;

      // update do "spine": adiciona ponto quando dist > segmentDist
      const d2p = dist2(s.x, s.y, s.lastPointX, s.lastPointY);
      if (d2p >= this.segmentDist * this.segmentDist) {
        s.points.push(s.x, s.y);
        s.lastPointX = s.x;
        s.lastPointY = s.y;
      }

      // tamanho do corpo baseado em massa
      const desiredPoints = this._massToPoints(s.mass);
      while (s.points.size() > desiredPoints) s.points.popFront();

      // boost: consome massa e deixa pellets
      if (s.boost && s.mass > 12) {
        s.mass = Math.max(12, s.mass - this.boostCost * dt);

        // drop de pellets em intervalos de distância
        s.boostDropAcc += speed * dt;
        const dropSpacing = 26;
        while (s.boostDropAcc >= dropSpacing) {
          s.boostDropAcc -= dropSpacing;
          const bx = s.x - Math.cos(s.angle) * (s.radius * 1.2);
          const by = s.y - Math.sin(s.angle) * (s.radius * 1.2);
          this._spawnPelletAt(bx, by, 3.2, 1.0, s.hue, true);
        }
      } else {
        s.boostDropAcc = 0;
      }
    }

    // colisões
    this._rebuildBodyHash();
    this._resolvePelletEats();
    this._resolveSnakeCollisions();
  }

  _resolvePelletEats() {
    for (const s of this.snakes.values()) {
      if (!s.alive) continue;

      const eatR = s.radius + 4.8;
      const eatR2 = eatR * eatR;

      let eaten = 0;
      for (const pid of this.pelletHash.queryNeighbors(s.x, s.y, 1)) {
        if (this.pellets.active[pid] === 0) continue;
        const px = this.pellets.x[pid], py = this.pellets.y[pid];
        if (dist2(s.x, s.y, px, py) <= eatR2) {
          const val = this.pellets.v[pid];
          this._killPellet(pid);
          s.mass += val * this.massPerPellet;
          eaten++;
          // manter densidade
          this._spawnPelletRandom(true);
          if (eaten >= 6) break; // limite por tick para evitar bursts
        }
      }
    }
  }

  _resolveSnakeCollisions() {
    const snakesArr = Array.from(this.snakes.values()).filter(s => s.alive);

    // head-head: simples e determinístico -> ambos morrem
    for (let i = 0; i < snakesArr.length; i++) {
      const a = snakesArr[i];
      for (let j = i + 1; j < snakesArr.length; j++) {
        const b = snakesArr[j];
        const r = this.headCollisionRadius + this.headCollisionRadius;
        if (dist2(a.x, a.y, b.x, b.y) <= r * r) {
          this._dieSnake(a);
          this._dieSnake(b);
        }
      }
    }

    // head-body: consulta via spatial hash
    const hitR = this.snakeRadius * 1.15;
    const hitR2 = hitR * hitR;

    for (const s of this.snakes.values()) {
      if (!s.alive) continue;

      for (const packed of this.bodyHash.queryNeighbors(s.x, s.y, 1)) {
        const otherId = packed >>> 16;
        const pi = packed & 0xffff;
        if (otherId === s.id) continue;

        const other = this.snakes.get(otherId);
        if (!other || !other.alive) continue;

        const [px, py] = other.points.get(pi);
        if (dist2(s.x, s.y, px, py) <= hitR2) {
          this._dieSnake(s);
          break;
        }
      }
    }
  }

  buildInitPayload(forId) {
    // pellets ativos (envio uma vez)
    const pellets = [];
    pellets.length = 0;
    for (let i = 0; i < this.pellets.max; i++) {
      if (this.pellets.active[i] === 0) continue;
      pellets.push([i, this.pellets.x[i], this.pellets.y[i], this.pellets.r[i], this.pellets.v[i], this.pellets.h[i]]);
    }

    return {
      t: 'init',
      you: forId,
      world: { r: this.worldRadius },
      cfg: {
        segmentDist: this.segmentDist,
        baseSpeed: this.baseSpeed,
        boostMult: this.boostMult,
      },
      pellets,
      state: this.buildStatePayload({
        viewerId: forId,
        includePoints: true,
        snapshotSeq: 0,
        snapshotRate: this.snapshotRate ?? this.tickRate,
        pelletEvents: [],
      })
    };
  }

  _maxPointsForViewerSnake(viewer, snake, opts) {
    const baseMax = Math.max(24, opts.baseMaxPoints ?? this.maxSendPoints);
    if (!viewer || !viewer.alive) return baseMax;

    const nearDist = opts.nearDist ?? 900;
    const farDist = opts.farDist ?? 1900;
    const nearMax = Math.max(24, Math.min(baseMax, opts.nearMaxPoints ?? 120));
    const midMax = Math.max(24, Math.min(baseMax, opts.midMaxPoints ?? 80));
    const farMax = Math.max(24, Math.min(baseMax, opts.farMaxPoints ?? 40));

    const d2 = dist2(viewer.x, viewer.y, snake.x, snake.y);
    if (d2 <= nearDist * nearDist) return nearMax;
    if (d2 <= farDist * farDist) return midMax;
    return farMax;
  }

  buildStatePayload(options = {}) {
    const includePoints = options.includePoints !== false;
    const viewer = options.viewerId ? this.snakes.get(options.viewerId) : null;
    const snakes = [];
    for (const s of this.snakes.values()) {
      if (!s.alive) continue;

      const row = {
        id: s.id,
        n: s.name,
        h: s.hue,
        x: s.x,
        y: s.y,
        a: s.angle,
        b: !!s.boost,
        m: s.mass,
        r: s.radius,
      };

      if (includePoints) {
        const maxPoints = this._maxPointsForViewerSnake(viewer, s, options);
        row.p = s.points.sample(maxPoints);
      }

      snakes.push(row);
    }

    // leaderboard (top 10)
    snakes.sort((a, b) => b.m - a.m);
    const lb = snakes.slice(0, 10).map(s => ({ n: s.n, m: Math.floor(s.m) }));

    const pelletEvents = Array.isArray(options.pelletEvents) ? options.pelletEvents : this._flushPelletEvents();

    return {
      t: 'state',
      now: this._now,
      si: options.snapshotSeq ?? 0,
      fp: includePoints ? 1 : 0,
      sr: options.snapshotRate ?? this.tickRate,
      snakes,
      lb,
      pe: pelletEvents
    };
  }

  _flushPelletEvents() {
    if (this.pelletEvents.length === 0) return [];
    const out = this.pelletEvents;
    this.pelletEvents = [];
    return out;
  }
}

module.exports = { Game };
