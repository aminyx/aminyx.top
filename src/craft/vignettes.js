/* Виньетки лаборатории /craft: предметные механики на canvas2d.
   Общий каркас: DPR-скейл, rAF с паузой вне вьюпорта, цвета из CSS-токенов,
   reduced-motion — статичный кадр, клики перерисовывают один кадр. */

var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cssColors() {
  var cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue('--accent').trim() || '#e8ac3f',
    accentText: cs.getPropertyValue('--accent-text').trim() || '#f0b855',
    packet: document.documentElement.dataset.theme === 'light'
      ? (cs.getPropertyValue('--accent-text').trim() || '#8a5a08')
      : (cs.getPropertyValue('--accent').trim() || '#e8ac3f'),
    text1: cs.getPropertyValue('--text-1').trim(),
    text3: cs.getPropertyValue('--text-3').trim(),
    line: cs.getPropertyValue('--line-strong').trim(),
    base: document.documentElement.dataset.theme === 'light' ? '#5d6572' : '#8a93a1',
  };
}

function scaffold(canvas, drawFn, clickFn) {
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, dpr = 1, running = false, rafId = 0, lastT = 0, visible = false;
  var v = {
    time: 0,
    colors: cssColors(),
    redraw: function () { frame(lastT || 16, true); },
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    if (r.width < 4) return;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    v.W = W; v.H = H;
    if (reduceMotion) v.redraw();
  }

  function frame(now, force) {
    var dt = lastT ? Math.min(now - lastT, 50) : 16;
    lastT = now;
    if (!reduceMotion || force) v.time += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawFn(ctx, v, dt);
    if (running && !force && !reduceMotion) rafId = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    if (reduceMotion) return;
    if (on && !running) { running = true; lastT = 0; rafId = requestAnimationFrame(frame); }
    else if (!on && running) { running = false; cancelAnimationFrame(rafId); }
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(function (es) {
    visible = es[es.length - 1].isIntersecting;
    setRunning(visible && !document.hidden);
    if (reduceMotion && visible) v.redraw();
  }, { rootMargin: '80px' }).observe(canvas);
  document.addEventListener('visibilitychange', function () { setRunning(visible && !document.hidden); });
  window.addEventListener('craft-theme', function () { v.colors = cssColors(); if (reduceMotion) v.redraw(); });

  if (clickFn) {
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('click', function (ev) {
      var r = canvas.getBoundingClientRect();
      clickFn(ev.clientX - r.left, ev.clientY - r.top, v);
      if (reduceMotion) v.redraw();
    });
  }
  resize();
  return v;
}

function mono(ctx, size) {
  ctx.font = '500 ' + size + 'px "JetBrains Mono", monospace';
}

/* ---------- 01 Multipath failover ---------- */

export function initFailover(canvas) {
  var paths = [
    { dy: -0.26, cutUntil: 0 },
    { dy: 0, cutUntil: 0 },
    { dy: 0.26, cutUntil: 0 },
  ];
  var active = 1, packets = [], lost = 0, reroutes = 0, spawnAt = 0, flash = 0;

  function pt(p, t, v) {
    var x0 = v.W * 0.09, x1 = v.W * 0.91, ym = v.H * 0.5;
    var cx = v.W * 0.5, cy = ym + v.H * p.dy * 2;
    var it = 1 - t;
    return {
      x: it * it * x0 + 2 * it * t * cx + t * t * x1,
      y: it * it * ym + 2 * it * t * cy + t * t * ym,
    };
  }

  function alivePath() {
    for (var i = 0; i < 3; i++) if (paths[i].cutUntil < performance.now()) return i;
    return -1;
  }

  var v = scaffold(canvas, function (ctx, v, dt) {
    var now = performance.now();
    flash = Math.max(0, flash - dt * 0.004);
    if (paths[active].cutUntil > now) {
      var next = alivePath();
      if (next >= 0 && next !== active) { active = next; reroutes++; flash = 1; }
    }
    if (v.time > spawnAt && paths[active].cutUntil < now) {
      packets.push({ t: 0, p: active });
      spawnAt = v.time + 260;
    }
    for (var i = packets.length - 1; i >= 0; i--) {
      var pk = packets[i];
      pk.t += dt * 0.00042;
      if (paths[pk.p].cutUntil > now && pk.t < 0.9) {
        pk.dead = (pk.dead || 0) + dt;
        if (pk.dead > 350) { packets.splice(i, 1); lost++; continue; }
      }
      if (pk.t >= 1) packets.splice(i, 1);
    }

    for (var j = 0; j < 3; j++) {
      var p = paths[j], cut = p.cutUntil > now;
      ctx.beginPath();
      for (var s = 0; s <= 40; s++) {
        var q = pt(p, s / 40, v);
        if (s === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = j === active && !cut ? v.colors.accentText : v.colors.base;
      ctx.globalAlpha = cut ? 0.12 : j === active ? 0.85 : 0.3;
      ctx.setLineDash(cut ? [3, 7] : []);
      ctx.lineWidth = j === active && !cut ? 1.6 : 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (var k = 0; k < packets.length; k++) {
      var pk2 = packets[k], q2 = pt(paths[pk2.p], Math.min(pk2.t, 1), v);
      ctx.globalAlpha = pk2.dead ? Math.max(0, 1 - pk2.dead / 350) : 0.95;
      ctx.fillStyle = v.colors.packet;
      ctx.beginPath(); ctx.arc(q2.x, q2.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = v.colors.text1;
    for (var e = 0; e < 2; e++) {
      ctx.beginPath(); ctx.arc(e ? v.W * 0.91 : v.W * 0.09, v.H * 0.5, 5 + flash * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = v.colors.text3;
    mono(ctx, 10);
    ctx.fillText('reroutes: ' + reroutes + '   in-flight lost: ' + lost, v.W * 0.09, v.H - 12);
    ctx.globalAlpha = 1;
  }, function (x, y, v) {
    var best = -1, bestD = 24;
    for (var j = 0; j < 3; j++) {
      if (paths[j].cutUntil > performance.now()) continue;
      for (var s = 0; s <= 24; s++) {
        var q = pt(paths[j], s / 24, v);
        var d = Math.abs(q.x - x) + Math.abs(q.y - y);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
    if (best >= 0) paths[best].cutUntil = performance.now() + 3200;
  });
  return v;
}

/* ---------- 02 Reed-Solomon FEC ---------- */

export function initFec(canvas) {
  var K = 8, M = 4;
  var batch = null, phase = 'fly', phaseAt = 0, recovered = 0, failed = 0;

  function newBatch() {
    batch = [];
    for (var i = 0; i < K + M; i++) {
      batch.push({
        i: i,
        parity: i >= K,
        /* под reduced-motion блоки не летят — ставим их сразу в раскладку
           прибытия, клики продолжают работать */
        x: reduceMotion ? 0.86 - (K + M - 1 - i) * 0.052 : -0.08 - i * 0.045,
        knocked: false,
        drop: 0,
      });
    }
    phase = 'fly';
  }

  var v = scaffold(canvas, function (ctx, v, dt) {
    if (!batch) newBatch();
    var size = Math.min(v.W * 0.05, 26);
    var y = v.H * 0.42;

    if (phase === 'fly') {
      var allIn = true;
      for (var i = 0; i < batch.length; i++) {
        var b = batch[i];
        if (b.knocked) { b.drop += dt; continue; }
        b.x += dt * 0.00018;
        if (b.x < 0.86) allIn = false;
      }
      if (allIn) {
        phase = 'check';
        phaseAt = v.time;
        var lostN = batch.filter(function (b) { return b.knocked; }).length;
        if (lostN > 0 && lostN <= M) recovered++; else if (lostN > M) failed++;
      }
    } else if (v.time - phaseAt > 2200) {
      newBatch();
    }

    var lostNow = batch.filter(function (b) { return b.knocked; }).length;
    var ok = lostNow <= M;

    for (var j = 0; j < batch.length; j++) {
      var b2 = batch[j];
      var px = (phase === 'fly' ? b2.x : 0.86 - (batch.length - 1 - j) * 0.052) * v.W;
      var py = y + (b2.knocked ? Math.min(b2.drop * b2.drop * 0.00001, v.H * 0.4) : 0);
      if (px < -size) continue;
      var rec = phase === 'check' && b2.knocked && ok;
      ctx.globalAlpha = b2.knocked && !rec ? Math.max(0.15, 1 - b2.drop / 900) : 0.9;
      if (rec) {
        var pulse = 0.5 + 0.5 * Math.sin((v.time - phaseAt) * 0.008);
        ctx.strokeStyle = v.colors.accentText;
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.strokeRect(px, y, size, size);
        ctx.globalAlpha = 0.35 * pulse;
        ctx.fillStyle = v.colors.accent;
        ctx.fillRect(px, y, size, size);
      } else {
        ctx.fillStyle = b2.parity ? v.colors.packet : v.colors.base;
        ctx.globalAlpha *= b2.parity ? 0.75 : 0.55;
        ctx.fillRect(px, b2.knocked ? py : y, size, size);
      }
    }

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = v.colors.text3;
    mono(ctx, 10);
    var st = phase === 'check'
      ? (ok ? 'lost ' + lostNow + ' ≤ ' + M + ' parity → RECOVERED' : 'lost ' + lostNow + ' > ' + M + ' → retransmit')
      : K + ' data + ' + M + ' parity';
    ctx.fillText(st, v.W * 0.06, v.H - 12);
    ctx.fillText('recovered: ' + recovered + '  retries: ' + failed, v.W * 0.06, 20);
    ctx.globalAlpha = 1;
  }, function (x, y, v) {
    if (!batch || phase !== 'fly') return;
    var size = Math.min(v.W * 0.05, 26);
    for (var i = 0; i < batch.length; i++) {
      var b = batch[i];
      var px = b.x * v.W, py = v.H * 0.42;
      if (!b.knocked && x > px - 8 && x < px + size + 8 && y > py - 10 && y < py + size + 10) {
        b.knocked = true;
        if (reduceMotion) b.drop = 700;
        return;
      }
    }
  });
  return v;
}

/* ---------- 03 Congestion control ---------- */

export function initCongestion(canvas) {
  var ALGS = ['RENO', 'CUBIC', 'BBR'];
  var alg = 0, cwnd = 4, wmax = 42, tSinceLoss = 0, hist = [];
  /* под reduced-motion график не накапливается — предзаполняем пилу Reno */
  if (reduceMotion) {
    var cw = 4;
    for (var hI = 0; hI < 240; hI++) {
      cw += cw < 12 ? 0.19 : 0.064;
      if (hI === 90 || hI === 170) cw /= 2;
      hist.push(Math.min(cw, 56));
    }
  }

  var v = scaffold(canvas, function (ctx, v, dt) {
    tSinceLoss += dt * 0.001;
    if (alg === 0) {
      cwnd += (cwnd < 12 ? dt * 0.012 : dt * 0.004);
    } else if (alg === 1) {
      var t = tSinceLoss - Math.cbrt(wmax * 0.3 / 0.4);
      cwnd = Math.max(3, wmax * 0.7 + 0.4 * t * t * t);
    } else {
      cwnd = 34 + Math.sin(v.time * 0.0011) * 3 + (Math.sin(v.time * 0.00023) > 0.93 ? 8 : 0);
    }
    cwnd = Math.min(cwnd, 56);
    hist.push(cwnd);
    if (hist.length > 240) hist.shift();

    var x0 = v.W * 0.07, x1 = v.W * 0.95, y0 = v.H * 0.82, sc = (v.H * 0.6) / 60;
    ctx.strokeStyle = v.colors.line;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();

    ctx.beginPath();
    for (var i = 0; i < hist.length; i++) {
      var x = x0 + (i / 239) * (x1 - x0), y = y0 - hist[i] * sc;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = v.colors.accentText;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;

    mono(ctx, 10);
    for (var a = 0; a < 3; a++) {
      var ax = x0 + a * 64;
      ctx.globalAlpha = a === alg ? 1 : 0.45;
      ctx.fillStyle = a === alg ? v.colors.accentText : v.colors.text3;
      ctx.fillText('[' + ALGS[a] + ']', ax, 22);
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = v.colors.text3;
    ctx.fillText('cwnd ' + Math.round(cwnd) + '  ·  click = packet loss', x0, v.H - 12);
    ctx.globalAlpha = 1;
  }, function (x, y, v) {
    if (y < 34) {
      var idx = Math.floor((x - v.W * 0.07) / 64);
      if (idx >= 0 && idx < 3) { alg = idx; tSinceLoss = 0; wmax = Math.max(cwnd, 20); if (alg === 0) cwnd = 4; return; }
    }
    wmax = cwnd;
    tSinceLoss = 0;
    if (alg === 0) cwnd = Math.max(3, cwnd / 2);
    else if (alg === 1) cwnd = Math.max(3, cwnd * 0.7);
    /* BBR — модельно loss-agnostic: окно почти не проседает */
    else cwnd = Math.max(3, cwnd * 0.96);
  });
  return v;
}

/* ---------- 04 Kill switch ---------- */

export function initKillswitch(canvas) {
  var downUntil = 0, packets = [], spawnAt = 0, leaked = 0, blocked = 0, gate = 0;

  var v = scaffold(canvas, function (ctx, v, dt) {
    var now = performance.now();
    var down = downUntil > now;
    if (reduceMotion) gate = down ? 1 : 0;
    else gate += ((down ? 1 : 0) - gate) * Math.min(dt * 0.02, 1);

    if (v.time > spawnAt) { packets.push({ x: 0.1 }); spawnAt = v.time + 300; }

    var gateX = v.W * 0.3;
    for (var i = packets.length - 1; i >= 0; i--) {
      var p = packets[i];
      var pxk = p.x * v.W;
      var atGate = gate > 0.5 && pxk >= gateX - 6 && pxk <= gateX + 2;
      if (!atGate) p.x += dt * 0.00022;
      if (p.x > 0.92) packets.splice(i, 1);
      if (atGate && p.x * v.W > gateX - 8) { p.x = (gateX - 8) / v.W - (i % 5) * 0.02; if (!p.counted) { p.counted = true; blocked++; } }
    }

    var y = v.H * 0.5;
    /* туннель */
    ctx.globalAlpha = down ? 0.1 : 0.35;
    ctx.strokeStyle = v.colors.base;
    ctx.setLineDash(down ? [3, 7] : []);
    ctx.strokeRect(v.W * 0.28, y - 18, v.W * 0.5, 36);
    ctx.setLineDash([]);
    /* заслонка */
    if (gate > 0.02) {
      ctx.globalAlpha = 0.9 * gate;
      ctx.fillStyle = v.colors.text1;
      ctx.fillRect(gateX - 2, y - 26 * gate, 4, 52 * gate);
    }
    /* пакеты */
    for (var k = 0; k < packets.length; k++) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = v.colors.packet;
      ctx.beginPath(); ctx.arc(packets[k].x * v.W, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    /* узлы app / net */
    ctx.fillStyle = v.colors.text1;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(v.W * 0.08, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(v.W * 0.94, y, 5, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = v.colors.text3;
    mono(ctx, 10);
    ctx.fillText((down ? 'VPN DOWN — gate closed' : 'VPN up') + '   leaked: ' + leaked + '   blocked: ' + blocked, v.W * 0.08, v.H - 12);
    ctx.globalAlpha = 1;
  }, function () {
    if (downUntil < performance.now()) downUntil = performance.now() + 2600;
  });
  return v;
}

/* ---------- 05 Вариативная ось (DOM) ---------- */

export function initTypeLab() {
  var sample = document.getElementById('type-sample');
  var range = document.getElementById('type-wght');
  var out = document.getElementById('type-out');
  if (!sample || !range) return;
  function apply() {
    sample.style.fontVariationSettings = '"wght" ' + range.value;
    if (out) out.value = range.value;
  }
  range.addEventListener('input', apply);
  apply();
}
