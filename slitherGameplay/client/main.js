(() => {
  'use strict';

  const $ = (q) => document.querySelector(q);

  const canvas = $('#c');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const uiStatus = $('#status');
  const uiJoin = $('#join');
  const uiName = $('#name');
  const uiPlay = $('#play');
  const uiLb = $('#lb');

  // ===== Performance knobs =====
  // Se estiver com poucos frames, comece mexendo aqui.
  const PERF = {
    maxDpr: 1.5,        // 1.0 = mais rápido, 2.0 = mais nítido
    leaderboardHz: 4,   // DOM é caro: não atualize a 60fps
    minimapHz: 20,      // minimapa não precisa rodar a 60fps
  };
  const PERF_DEBUG = false; // true para logs periódicos de fps/draw/parse

  const NET = {
    interpDelayMs: 100, // atraso de render para interpolar snapshots
    maxExtrapMs: 80,    // extrapolação curta pra reduzir tremida em jitter de rede
  };

  // Prealoca itens do leaderboard (evita criar/remover DOM toda atualização)
  const LB_MAX = 10;
  const lbItems = Array.from({ length: LB_MAX }, () => {
    const li = document.createElement('li');
    li.hidden = true;
    uiLb.appendChild(li);
    return li;
  });

  const mini = $('#minimap');
  const mctx = mini.getContext('2d');

  const state = {
    connected: false,
    joined: false,
    you: 0,
    worldRadius: 3000,
    cfg: { segmentDist: 12, baseSpeed: 140, boostMult: 1.75 },
    snakes: new Map(), // id -> snake
    drawSnakes: [], // cache de draw-order (evita allocations por frame)
    pellets: new Map(), // id -> pellet
    leaderboard: [],
    lastServerNow: 0,
    snapshotRate: 30,
    debug: {
      drawMsAcc: 0,
      parseMsAcc: 0,
      frames: 0,
      snapshots: 0,
      lastLogAt: performance.now(),
    },
  };

  // ===== Leaderboard (DOM) =====
  // Atualizar DOM a cada tick derruba FPS. A gente faz throttle.
  let lbLastRender = 0;
  let lbKeyRendered = '';
  let lbKeyLatest = '';

  function computeLbKey(lb) {
    let out = '';
    for (let i = 0; i < lb.length; i++) {
      const row = lb[i];
      out += (row.n || '') + ':' + (row.m || 0) + '|';
    }
    return out;
  }

  function maybeRenderLeaderboard(now) {
    if (lbKeyLatest === lbKeyRendered) return;
    const minInterval = 1000 / PERF.leaderboardHz;
    if (now - lbLastRender < minInterval) return;
    lbKeyRendered = lbKeyLatest;
    lbLastRender = now;
    renderLeaderboard();
  }

  const input = {
    mouseX: 0,
    mouseY: 0,
    angle: 0,
    boost: false,
    zoom: 1.0,
    lastSent: { a: 0, b: false },
  };

  const view = {
    vw: 0,
    vh: 0,
    dpr: 1,
    camX: 0,
    camY: 0,
    scale: 1,
  };

  // ============= Sprites / patterns ============
  const bgPattern = makeGridPattern();
  const pelletSprites = makePelletSprites(12);

  function makeGridPattern() {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0f14';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(c.width, 0);
    g.moveTo(0, 0); g.lineTo(0, c.height);
    g.moveTo(0, c.height / 2); g.lineTo(c.width, c.height / 2);
    g.moveTo(c.width / 2, 0); g.lineTo(c.width / 2, c.height);
    g.stroke();
    return ctx.createPattern(c, 'repeat');
  }

  function makePelletSprites(buckets) {
    const sprites = [];
    for (let i = 0; i < buckets; i++) {
      const hue = Math.floor((i / buckets) * 360);
      const c = document.createElement('canvas');
      c.width = 26; c.height = 26;
      const g = c.getContext('2d');
      const cx = c.width / 2, cy = c.height / 2;
      const grad = g.createRadialGradient(cx, cy, 1, cx, cy, 13);
      grad.addColorStop(0.0, `hsla(${hue}, 90%, 70%, 0.95)`);
      grad.addColorStop(0.6, `hsla(${hue}, 90%, 60%, 0.40)`);
      grad.addColorStop(1.0, `hsla(${hue}, 90%, 60%, 0.00)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, 13, 0, Math.PI * 2);
      g.fill();
      sprites.push(c);
    }
    return sprites;
  }

  function pelletSpriteForHue(h) {
    const b = pelletSprites.length;
    const idx = Math.max(0, Math.min(b - 1, Math.floor((h / 360) * b)));
    return pelletSprites[idx];
  }

  // ============= Resize ============
  function resize() {
    view.vw = window.innerWidth;
    view.vh = window.innerHeight;
    view.dpr = Math.min(PERF.maxDpr, window.devicePixelRatio || 1);
    canvas.width = Math.floor(view.vw * view.dpr);
    canvas.height = Math.floor(view.vh * view.dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ============= Input ============
  window.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.boost = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.boost = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') input.boost = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') input.boost = false;
  });

  window.addEventListener('wheel', (e) => {
    const z = input.zoom;
    const delta = Math.sign(e.deltaY);
    input.zoom = clamp(z * (delta > 0 ? 0.9 : 1.1), 0.45, 1.65);
  }, { passive: true });

  // ============= Network ============
  let ws = null;

  function connect() {
    const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      state.connected = true;
      uiStatus.textContent = 'conectado';
    };
    ws.onclose = () => {
      state.connected = false;
      state.joined = false;
      uiStatus.textContent = 'desconectado';
      uiJoin.style.display = 'block';
      // tentar reconectar em alguns segundos
      setTimeout(connect, 1000);
    };
    ws.onerror = () => {
      uiStatus.textContent = 'erro';
    };
    ws.onmessage = (ev) => {
      const parseStart = PERF_DEBUG ? performance.now() : 0;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (PERF_DEBUG) {
        state.debug.parseMsAcc += (performance.now() - parseStart);
        state.debug.snapshots += 1;
      }
      if (msg.t === 'init') onInit(msg);
      else if (msg.t === 'state') onState(msg);
    };
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function onInit(msg) {
    state.joined = true;
    state.you = msg.you;
    state.worldRadius = msg.world?.r ?? state.worldRadius;
    state.cfg = msg.cfg ?? state.cfg;

    // pellets full
    state.pellets.clear();
    for (const p of msg.pellets || []) {
      state.pellets.set(p[0], { id: p[0], x: p[1], y: p[2], r: p[3], v: p[4], h: p[5] });
    }

    // primeiro state
    if (msg.state) onState(msg.state);

    uiJoin.style.display = 'none';
    uiStatus.textContent = `jogando (id ${state.you})`;
  }

  function onState(msg) {
    const snapNow = msg.now || Date.now();
    state.lastServerNow = snapNow;
    if (typeof msg.sr === 'number' && msg.sr > 0) {
      state.snapshotRate = msg.sr;
      NET.interpDelayMs = Math.max(90, Math.round((1000 / msg.sr) * 1.6));
    }

    // pellet events
    if (Array.isArray(msg.pe)) {
      for (const ev of msg.pe) {
        if (!ev || ev.length === 0) continue;
        if (ev[0] === 's') {
          state.pellets.set(ev[1], { id: ev[1], x: ev[2], y: ev[3], r: ev[4], v: ev[5], h: ev[6] });
        } else if (ev[0] === 'd') {
          state.pellets.delete(ev[1]);
        }
      }
    }

    // snakes
    const seen = new Set();
    for (const s of msg.snakes || []) {
      seen.add(s.id);
      const entry = state.snakes.get(s.id);
      const pts = Array.isArray(s.p) && s.p.length >= 4 ? s.p : null;
      const snap = {
        t: snapNow,
        x: s.x,
        y: s.y,
        a: s.a || 0,
        b: !!s.b,
        m: s.m || 0,
        r: s.r || 10,
        p: pts,
      };

      if (!entry) {
        const seedPoints = pts || [s.x, s.y, s.x, s.y];
        if (!snap.p) snap.p = seedPoints;
        state.snakes.set(s.id, {
          id: s.id,
          n: s.n || '',
          h: s.h || 0,
          x: s.x,
          y: s.y,
          a: snap.a,
          b: snap.b,
          m: snap.m,
          r: snap.r,
          prevSnap: snap,
          nextSnap: snap,
          lastFullPoints: seedPoints,
          lastFullX: snap.x,
          lastFullY: snap.y,
          renderPoints: null,
          rp: pts,
          rx: snap.x,
          ry: snap.y,
          ra: snap.a,
          rr: snap.r,
          rm: snap.m,
          last: performance.now(),
        });
      } else {
        entry.n = s.n || entry.n;
        entry.h = s.h ?? entry.h;
        entry.x = s.x;
        entry.y = s.y;
        entry.a = snap.a;
        entry.b = snap.b;
        entry.m = snap.m;
        entry.r = snap.r;
        entry.prevSnap = entry.nextSnap || snap;
        entry.nextSnap = snap;
        if (pts) {
          entry.lastFullPoints = pts;
          entry.lastFullX = snap.x;
          entry.lastFullY = snap.y;
        }
        entry.last = performance.now();
      }
    }

    // remove snakes sumidas
    for (const id of state.snakes.keys()) {
      if (!seen.has(id)) state.snakes.delete(id);
    }

    // leaderboard (throttle: DOM é caro)
    state.leaderboard = msg.lb || [];
    lbKeyLatest = computeLbKey(state.leaderboard);

    // cache draw order pra render (evita criar arrays no draw())
    state.drawSnakes.length = 0;
    for (const s of state.snakes.values()) state.drawSnakes.push(s);
    state.drawSnakes.sort((a, b) => (a.nextSnap?.m || a.m || 0) - (b.nextSnap?.m || b.m || 0));
  }

  function renderLeaderboard() {
    const lb = state.leaderboard;
    for (let i = 0; i < LB_MAX; i++) {
      const row = lb[i];
      const li = lbItems[i];
      if (!row) {
        li.hidden = true;
        li.textContent = '';
        continue;
      }
      li.hidden = false;
      li.textContent = `${row.n || 'anon'} — ${row.m || 0}`;
    }
  }

  // ============= Join UI ============
  uiPlay.addEventListener('click', () => {
    const name = (uiName.value || 'anon').trim().slice(0, 16);
    send({ t: 'join', n: name });
  });
  uiName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') uiPlay.click();
  });

  connect();

  // ============= Game loop ============
  let lastFrame = performance.now();
  let frameNow = lastFrame;

  function loop(now) {
    frameNow = now;
    lastFrame = now;

    stepInput();
    const drawStart = PERF_DEBUG ? performance.now() : 0;
    draw();
    if (PERF_DEBUG) {
      state.debug.drawMsAcc += (performance.now() - drawStart);
    }
    maybeRenderLeaderboard(now);
    if (PERF_DEBUG) state.debug.frames += 1;

    if (PERF_DEBUG && now - state.debug.lastLogAt >= 2000) {
      const elapsed = now - state.debug.lastLogAt;
      const fps = (state.debug.frames * 1000) / Math.max(1, elapsed);
      const avgDraw = state.debug.drawMsAcc / Math.max(1, state.debug.frames);
      const avgParse = state.debug.parseMsAcc / Math.max(1, state.debug.snapshots);
      console.log(
        `[perf] fps=${fps.toFixed(1)} draw=${avgDraw.toFixed(2)}ms parse=${avgParse.toFixed(2)}ms ` +
        `snaps=${state.debug.snapshots} pel=${state.pellets.size} snakes=${state.snakes.size}`
      );
      state.debug.frames = 0;
      state.debug.drawMsAcc = 0;
      state.debug.parseMsAcc = 0;
      state.debug.snapshots = 0;
      state.debug.lastLogAt = now;
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Enviar input com throttling e "deadzone"
  let inputAcc = 0;
  function stepInput() {
    if (!state.joined) return;

    // ângulo: mouse relativo ao centro da tela
    const dx = input.mouseX - view.vw / 2;
    const dy = input.mouseY - view.vh / 2;
    input.angle = Math.atan2(dy, dx);

    inputAcc += 1;
    // ~30 fps de input
    if (inputAcc % 2 !== 0) return;

    const da = angleDiff(input.lastSent.a, input.angle);
    const boostChanged = input.lastSent.b !== input.boost;
    if (Math.abs(da) > 0.01 || boostChanged) {
      input.lastSent.a = input.angle;
      input.lastSent.b = input.boost;
      send({ t: 'input', a: input.angle, b: input.boost });
    }
  }

  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) { return a + angleDiff(a, b) * t; }

  function ensureRenderPointBuffer(snake, len) {
    if (!snake.renderPoints || snake.renderPoints.length !== len) {
      snake.renderPoints = new Array(len);
    }
    return snake.renderPoints;
  }

  function getInterpolatedSnake(snake, renderServerNow) {
    const prev = snake.prevSnap;
    const next = snake.nextSnap;
    if (!prev || !next) return null;

    let t = 1;
    if (next.t > prev.t) {
      t = (renderServerNow - prev.t) / (next.t - prev.t);
    }

    const maxExtrapT = next.t > prev.t ? NET.maxExtrapMs / (next.t - prev.t) : 0;
    t = clamp(t, 0, 1 + maxExtrapT);

    const x = lerp(prev.x, next.x, t);
    const y = lerp(prev.y, next.y, t);
    const a = lerpAngle(prev.a || 0, next.a || 0, t);
    const m = lerp(prev.m || 0, next.m || 0, t);
    const r = lerp(prev.r || 10, next.r || 10, t);

    const prevP = Array.isArray(prev.p) ? prev.p : null;
    const nextP = Array.isArray(next.p) ? next.p : null;
    let points = null;

    if (prevP && nextP && prevP.length >= 4 && prevP.length === nextP.length) {
      const out = ensureRenderPointBuffer(snake, prevP.length);
      for (let i = 0; i < prevP.length; i++) {
        out[i] = lerp(prevP[i], nextP[i], t);
      }
      points = out;
    } else {
      const src = (nextP && nextP.length >= 4)
        ? nextP
        : (prevP && prevP.length >= 4)
          ? prevP
          : snake.lastFullPoints;
      if (!src || src.length < 4) return null;

      const out = ensureRenderPointBuffer(snake, src.length);
      const refX = (src === nextP) ? next.x : (src === prevP) ? prev.x : (snake.lastFullX ?? x);
      const refY = (src === nextP) ? next.y : (src === prevP) ? prev.y : (snake.lastFullY ?? y);
      const dx = x - refX;
      const dy = y - refY;

      for (let i = 0; i < src.length; i += 2) {
        out[i] = src[i] + dx;
        out[i + 1] = src[i + 1] + dy;
      }
      points = out;
    }

    snake.rx = x;
    snake.ry = y;
    snake.ra = a;
    snake.rm = m;
    snake.rr = r;
    snake.rp = points;
    return snake;
  }

  // ============= Rendering ============
  function draw() {
    const renderServerNow = Date.now() - NET.interpDelayMs;

    // camera: segue você
    const me = state.snakes.get(state.you);
    const meInterp = me ? getInterpolatedSnake(me, renderServerNow) : null;
    if (meInterp) {
      // suavização simples
      view.camX += (meInterp.rx - view.camX) * 0.15;
      view.camY += (meInterp.ry - view.camY) * 0.15;

      // zoom dinâmico (quanto maior, mais zoom out)
      const dyn = clamp(1 / (1 + (meInterp.rm / 260)), 0.35, 1.0);
      view.scale = dyn * input.zoom;
    } else {
      view.scale = input.zoom;
    }

    // fundo
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, view.vw, view.vh);

    // mundo (transform world->screen)
    const s = view.scale;
    ctx.setTransform(view.dpr * s, 0, 0, view.dpr * s,
      view.dpr * (view.vw / 2 - view.camX * s),
      view.dpr * (view.vh / 2 - view.camY * s)
    );

    // grid pattern (world coords)
    ctx.fillStyle = bgPattern;
    const w = view.vw / s;
    const h = view.vh / s;
    ctx.fillRect(view.camX - w, view.camY - h, w * 2, h * 2);

    // borda do mapa
    drawWorldBorder();

    // pellets (culling simples)
    drawPelletsCulled();

    // snakes
    drawSnakes(renderServerNow);

    // HUD overlay (minimap)
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawMinimap();
  }

  function drawWorldBorder() {
    const halfW = (view.vw / 2) / view.scale;
    const halfH = (view.vh / 2) / view.scale;
    const visibleR = Math.hypot(halfW, halfH) + 30;
    const camDist = Math.hypot(view.camX, view.camY);
    if (camDist + visibleR < state.worldRadius - 40) return;

    const r = state.worldRadius;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPelletsCulled() {
    const s = view.scale;
    const halfW = (view.vw / 2) / s;
    const halfH = (view.vh / 2) / s;
    const minX = view.camX - halfW - 50;
    const maxX = view.camX + halfW + 50;
    const minY = view.camY - halfH - 50;
    const maxY = view.camY + halfH + 50;

    // LOD: quando dá zoom out, o número de pellets visíveis explode.
    // A gente reduz draw-calls de forma determinística (máscara no id).
    let mask = 0;
    let minR = 0;
    if (s < 0.55) { mask = 3; minR = 2.2; }      // ~1/4 dos pellets
    else if (s < 0.75) { mask = 1; minR = 1.6; } // ~1/2 dos pellets

    const base = (s < 0.65) ? 8 : 10;

    for (const p of state.pellets.values()) {
      const x = p.x, y = p.y;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (minR && p.r < minR) continue;
      if (mask && (((p.id | 0) & mask) !== 0)) continue;

      const spr = pelletSpriteForHue(p.h);
      const sz = base + p.r * 2.4;
      ctx.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz);
    }
  }

  function drawSnakes(renderServerNow) {
    // desenha maiores por trás
    const arr = state.drawSnakes;
    for (let i = 0; i < arr.length; i++) {
      drawSnake(arr[i], renderServerNow);
    }
  }

  function drawSnake(s, renderServerNow) {
    const rs = getInterpolatedSnake(s, renderServerNow);
    if (!rs) return;

    const pts = rs.rp;
    if (!pts || pts.length < 4) return;

    // corpo
    ctx.strokeStyle = `hsl(${rs.h}, 90%, 58%)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = rs.rr * 2;

    const dxCam = rs.rx - view.camX;
    const dyCam = rs.ry - view.camY;
    const dist2Cam = dxCam * dxCam + dyCam * dyCam;
    let pointStep = 1;
    if (view.scale < 0.75 && pts.length > 140) pointStep = 2;
    if (view.scale < 0.55 || dist2Cam > 1800 * 1800) pointStep = Math.max(pointStep, 3);
    if (view.scale < 0.45 || dist2Cam > 2500 * 2500) pointStep = Math.max(pointStep, 4);

    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2 * pointStep) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.stroke();

    // cabeça (último ponto)
    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];

    ctx.fillStyle = `hsl(${rs.h}, 90%, 62%)`;
    ctx.beginPath();
    ctx.arc(hx, hy, rs.rr * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // olhos
    const ang = rs.ra || 0;
    const ex = Math.cos(ang);
    const ey = Math.sin(ang);
    const px = -ey;
    const py = ex;

    const eyeOff = rs.rr * 0.55;
    const eyeFwd = rs.rr * 0.55;
    const e1x = hx + ex * eyeFwd + px * eyeOff;
    const e1y = hy + ey * eyeFwd + py * eyeOff;
    const e2x = hx + ex * eyeFwd - px * eyeOff;
    const e2y = hy + ey * eyeFwd - py * eyeOff;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(e1x, e1y, rs.rr * 0.18, 0, Math.PI * 2);
    ctx.arc(e2x, e2y, rs.rr * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // nome (só se for você ou se estiver perto)
    if (rs.id === state.you) {
      const fontPx = 14 / Math.max(0.45, view.scale);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `${fontPx}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(rs.n || 'you', hx, hy - rs.rr * 2.2);
    }
  }

  let miniLastRender = 0;

  function drawMinimap() {
    const minInterval = 1000 / PERF.minimapHz;
    if (frameNow - miniLastRender < minInterval) return;
    miniLastRender = frameNow;

    const r = state.worldRadius;
    const w = mini.width, h = mini.height;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, w, h);

    // fundo
    mctx.fillStyle = 'rgba(0,0,0,0.20)';
    mctx.beginPath();
    mctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    mctx.fill();

    // borda
    mctx.strokeStyle = 'rgba(255,255,255,0.20)';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    mctx.stroke();

    // dots
    for (const s of state.snakes.values()) {
      const x = (s.x / r) * (w / 2 - 6);
      const y = (s.y / r) * (h / 2 - 6);
      const cx = w / 2 + x;
      const cy = h / 2 + y;
      mctx.fillStyle = (s.id === state.you) ? 'rgba(255,255,255,0.9)' : `hsla(${s.h}, 90%, 60%, 0.7)`;
      mctx.beginPath();
      mctx.arc(cx, cy, (s.id === state.you) ? 3 : 2, 0, Math.PI * 2);
      mctx.fill();
    }
  }
})();
