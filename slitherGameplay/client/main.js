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
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
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
    state.lastServerNow = msg.now || 0;

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
      const prev = state.snakes.get(s.id);
      const pts = Array.isArray(s.p) ? s.p : [];
      if (!prev) {
        state.snakes.set(s.id, {
          id: s.id,
          n: s.n || '',
          h: s.h || 0,
          x: s.x, y: s.y,
          a: s.a || 0,
          b: !!s.b,
          m: s.m || 0,
          r: s.r || 10,
          p: pts,
          last: performance.now(),
        });
      } else {
        prev.n = s.n || prev.n;
        prev.h = s.h ?? prev.h;
        prev.x = s.x; prev.y = s.y;
        prev.a = s.a ?? prev.a;
        prev.b = !!s.b;
        prev.m = s.m ?? prev.m;
        prev.r = s.r ?? prev.r;
        prev.p = pts;
        prev.last = performance.now();
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
    state.drawSnakes.sort((a, b) => a.m - b.m);
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
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;

    stepInput();
    draw();
    maybeRenderLeaderboard(now);

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

  // ============= Rendering ============
  function draw() {
    // camera: segue você
    const me = state.snakes.get(state.you);
    if (me) {
      // suavização simples
      view.camX += (me.x - view.camX) * 0.15;
      view.camY += (me.y - view.camY) * 0.15;

      // zoom dinâmico (quanto maior, mais zoom out)
      const dyn = clamp(1 / (1 + (me.m / 260)), 0.35, 1.0);
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
    drawSnakes();

    // HUD overlay (minimap)
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawMinimap();
  }

  function drawWorldBorder() {
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

  function drawSnakes() {
    // desenha maiores por trás
    const arr = state.drawSnakes;
    for (let i = 0; i < arr.length; i++) {
      drawSnake(arr[i]);
    }
  }

  function drawSnake(s) {
    const pts = s.p;
    if (!pts || pts.length < 4) return;

    // corpo
    ctx.strokeStyle = `hsl(${s.h}, 90%, 58%)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s.r * 2;

    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.stroke();

    // cabeça (último ponto)
    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];

    ctx.fillStyle = `hsl(${s.h}, 90%, 62%)`;
    ctx.beginPath();
    ctx.arc(hx, hy, s.r * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // olhos
    const ang = s.a || 0;
    const ex = Math.cos(ang);
    const ey = Math.sin(ang);
    const px = -ey;
    const py = ex;

    const eyeOff = s.r * 0.55;
    const eyeFwd = s.r * 0.55;
    const e1x = hx + ex * eyeFwd + px * eyeOff;
    const e1y = hy + ey * eyeFwd + py * eyeOff;
    const e2x = hx + ex * eyeFwd - px * eyeOff;
    const e2y = hy + ey * eyeFwd - py * eyeOff;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(e1x, e1y, s.r * 0.18, 0, Math.PI * 2);
    ctx.arc(e2x, e2y, s.r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // nome (só se for você ou se estiver perto)
    if (s.id === state.you) {
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale,
        view.dpr * (view.vw / 2 - view.camX * view.scale),
        view.dpr * (view.vh / 2 - view.camY * view.scale)
      );
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(s.n || 'you', hx, hy - s.r * 2.2);
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
