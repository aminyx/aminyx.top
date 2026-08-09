/* aminyx.top — «живая система»: распределённая сеть с multipath-трафиком
   и failover-каскадами. Рукописный WebGL без библиотек; фолбэк canvas2d.
   Сцена предметна: это механика Aminyx Link, а не орнамент. */
(function () {
  'use strict';

  var canvas = document.getElementById('system-canvas');
  if (!canvas) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var docEl = document.documentElement;

  /* ---------- параметры ---------- */
  var isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  var N = isMobile ? 84 : 176;           /* узлы */
  var K = 3;                             /* рёбер на узел (k-ближайших) */
  var PMAX = isMobile ? 30 : 64;         /* пакеты */
  var DPR_CAP = 1.75;

  /* ---------- состояние ---------- */
  var nodes = [];   /* {x,y,z, ph, health} — базовые координаты в [-1..1] */
  var edges = [];   /* {a,b} индексы */
  var heat = null;  /* «нагрев» ребра проходящим трафиком: маршрут светится и остывает */
  var adj = [];     /* смежность: adj[i] = [edgeIdx...] */
  var packets = []; /* {e, t, dir, speed} */
  var fail = { active: false, cx: 0, cy: 0, r: 0.5, until: 0, next: 4000 };
  var W = 0, H = 0, dpr = 1, aspect = 1;
  var running = false, rafId = 0, lastT = 0, time = 0;
  var intensity = 1;         /* от скролла: hero 1 → середина 0.3 → контакт 0.85 */
  var pointer = { x: 0, y: 0 };
  var scrollPar = 0;
  var theme = {
    line: [1, 1, 1], node: [1, 1, 1], packet: [1, .7, .25],
    lineA: .1, nodeA: .5,
    lineCss: '#93a0b4', nodeCss: '#93a0b4', packetCss: '#e8ac3f'
  };
  var maxScroll = 1;

  /* ---------- граф ---------- */
  function buildGraph() {
    nodes = [];
    var i, j;
    /* 55% узлов — равномерное поле, 45% — кластер в правой части сцены:
       у системы появляется композиционный центр тяжести */
    for (i = 0; i < N; i++) {
      var clustered = Math.random() < 0.45;
      var x, y;
      if (clustered) {
        x = 0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.55;
        y = -0.02 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.5;
      } else {
        x = (Math.random() * 2 - 1) * 1.15;
        y = (Math.random() * 2 - 1) * 1.05;
      }
      nodes.push({
        x: x,
        y: y,
        z: Math.random(),
        ph: Math.random() * Math.PI * 2,
        health: 1
      });
    }
    /* k-ближайших соседей, без дублей */
    var seen = {};
    edges = [];
    adj = [];
    for (i = 0; i < N; i++) adj.push([]);
    for (i = 0; i < N; i++) {
      var d = [];
      for (j = 0; j < N; j++) {
        if (i === j) continue;
        var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, dz = (nodes[i].z - nodes[j].z) * 0.6;
        d.push([dx * dx + dy * dy + dz * dz, j]);
      }
      d.sort(function (a, b) { return a[0] - b[0]; });
      for (j = 0; j < K; j++) {
        var b = d[j][1];
        var key = i < b ? i + '_' + b : b + '_' + i;
        if (seen[key]) continue;
        seen[key] = 1;
        adj[i].push(edges.length);
        adj[b].push(edges.length);
        edges.push({ a: i, b: b });
      }
    }
    heat = new Float32Array(edges.length);
  }

  /* позиция узла с дрейфом и параллаксом (в clip-координатах) */
  function nodePos(n, out) {
    var drift = 0.018;
    var px = n.x + Math.sin(time * 0.00021 + n.ph) * drift;
    var py = n.y + Math.cos(time * 0.00017 + n.ph * 1.7) * drift;
    /* глубина: дальние (z→1) сжимаются к центру и вверх при скролле слабее */
    var depth = 0.55 + (1 - n.z) * 0.45;
    px = px * depth + pointer.x * 0.03 * (1 - n.z);
    py = py * depth + pointer.y * 0.03 * (1 - n.z) + scrollPar * (0.22 + n.z * 0.3);
    /* узкие экраны: растягиваем по ширине (края обрезаются красиво);
       широкие: не даём сцене сжаться в центральную треть */
    out[0] = px / (aspect < 1 ? aspect : Math.min(aspect, 1.25));
    out[1] = py;
    out[2] = n.z;
  }

  function spawnPacket() {
    if (!edges.length) return;
    for (var tries = 0; tries < 6; tries++) {
      var e = (Math.random() * edges.length) | 0;
      var ed = edges[e];
      if (nodes[ed.a].health > 0.5 && nodes[ed.b].health > 0.5) {
        packets.push({ e: e, t: 0, dir: Math.random() < 0.5 ? 1 : -1, speed: 0.35 + Math.random() * 0.5 });
        return;
      }
    }
  }

  function step(dt) {
    time += dt;
    /* failover-каскад: регион гаснет, трафик перетекает */
    if (!fail.active && time > fail.next) {
      fail.active = true;
      fail.cx = (Math.random() * 2 - 1) * 0.8;
      fail.cy = (Math.random() * 2 - 1) * 0.7;
      fail.until = time + 2600;
      fail.r = 0.38 + Math.random() * 0.2;
    }
    if (fail.active && time > fail.until) {
      fail.active = false;
      fail.next = time + 4200 + Math.random() * 3800;
    }
    var i;
    for (i = 0; i < N; i++) {
      var n = nodes[i];
      var dead = false;
      if (fail.active) {
        var dx = n.x - fail.cx, dy = n.y - fail.cy;
        dead = dx * dx + dy * dy < fail.r * fail.r;
      }
      var target = dead ? 0.08 : 1;
      n.health += (target - n.health) * Math.min(dt * 0.004, 1);
    }
    /* остывание маршрутов */
    var cool = Math.pow(0.5, dt / 650);
    for (i = 0; i < heat.length; i++) heat[i] *= cool;
    /* пакеты: движение и хопы через живые узлы */
    var want = Math.round(PMAX * (0.35 + 0.65 * intensity));
    if (packets.length < want && Math.random() < 0.35) spawnPacket();
    for (i = packets.length - 1; i >= 0; i--) {
      var p = packets[i];
      heat[p.e] = 1;
      var ed = edges[p.e];
      if (nodes[ed.a].health < 0.4 || nodes[ed.b].health < 0.4) { packets.splice(i, 1); continue; }
      p.t += p.speed * dt * 0.001 * p.dir;
      if (p.t > 1 || p.t < 0) {
        /* хоп: продолжаем с достигнутого узла по случайному живому ребру */
        var at = p.t > 1 ? ed.b : ed.a;
        var options = adj[at];
        var next = options[(Math.random() * options.length) | 0];
        var ne = edges[next];
        if (nodes[ne.a].health < 0.5 || nodes[ne.b].health < 0.5 || Math.random() < 0.18) {
          packets.splice(i, 1);
          continue;
        }
        p.e = next;
        p.dir = ne.a === at ? 1 : -1;
        p.t = p.dir === 1 ? 0 : 1;
      }
    }
  }

  /* ---------- WebGL ---------- */
  var gl = null, prog = null, buf = null, loc = {};
  var VERT =
    'attribute vec4 aData;' +           /* x, y, size, alpha */
    'attribute vec4 aColor;' +
    'varying vec4 vColor;' +
    'void main(){' +
    '  gl_Position = vec4(aData.xy, 0.0, 1.0);' +
    '  gl_PointSize = aData.z;' +
    '  vColor = vec4(aColor.rgb, aColor.a * aData.w);' +
    '}';
  var FRAG =
    'precision mediump float;' +
    'varying vec4 vColor;' +
    'uniform float uPoint;' +
    'void main(){' +
    '  float a = vColor.a;' +
    '  if (uPoint > 0.5) {' +
    '    vec2 c = gl_PointCoord - vec2(0.5);' +
    '    float d = length(c) * 2.0;' +
    '    a *= smoothstep(1.0, 0.55, d);' +
    '  }' +
    '  gl_FragColor = vec4(vColor.rgb, a);' +
    '}';

  function makeGL() {
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return false;
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    buf = gl.createBuffer();
    loc.aData = gl.getAttribLocation(prog, 'aData');
    loc.aColor = gl.getAttribLocation(prog, 'aColor');
    loc.uPoint = gl.getUniformLocation(prog, 'uPoint');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  /* один общий interleaved-буфер: [x,y,size,alpha, r,g,b,a] × verts */
  var scratch = null;
  function drawGL() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var needed = (edges.length * 2 + N + packets.length * 4) * 8;
    if (!scratch || scratch.length < needed) scratch = new Float32Array(needed);
    var v = scratch, o = 0;
    var pa = [0, 0, 0], pb = [0, 0, 0];
    var i, e, h;

    /* рёбра: базовая ткань + светящиеся активные маршруты (heat) */
    var la = theme.lineA * (0.35 + 0.65 * intensity);
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      h = Math.min(nodes[e.a].health, nodes[e.b].health);
      var hp = heat[i];
      nodePos(nodes[e.a], pa);
      nodePos(nodes[e.b], pb);
      var depthA = 1 - (pa[2] + pb[2]) * 0.35;
      var al = la * (0.25 + h * 0.75) * depthA + hp * 0.38 * h;
      var mr = theme.line[0] + (theme.packet[0] - theme.line[0]) * hp * 0.9;
      var mg = theme.line[1] + (theme.packet[1] - theme.line[1]) * hp * 0.9;
      var mb = theme.line[2] + (theme.packet[2] - theme.line[2]) * hp * 0.9;
      v[o++] = pa[0]; v[o++] = pa[1]; v[o++] = 1; v[o++] = al;
      v[o++] = mr; v[o++] = mg; v[o++] = mb; v[o++] = 1;
      v[o++] = pb[0]; v[o++] = pb[1]; v[o++] = 1; v[o++] = al;
      v[o++] = mr; v[o++] = mg; v[o++] = mb; v[o++] = 1;
    }
    var lineVerts = edges.length * 2;

    /* узлы */
    var na = theme.nodeA * (0.4 + 0.6 * intensity);
    for (i = 0; i < N; i++) {
      var n = nodes[i];
      nodePos(n, pa);
      var size = (2.6 + (1 - n.z) * 4.2) * dpr;
      var al2 = na * (0.25 + n.health * 0.75) * (1 - n.z * 0.55);
      v[o++] = pa[0]; v[o++] = pa[1]; v[o++] = size; v[o++] = al2;
      v[o++] = theme.node[0]; v[o++] = theme.node[1]; v[o++] = theme.node[2]; v[o++] = 1;
    }

    /* пакеты с коротким хвостом */
    for (i = 0; i < packets.length; i++) {
      var p = packets[i];
      e = edges[p.e];
      nodePos(nodes[e.a], pa);
      nodePos(nodes[e.b], pb);
      for (var s = 3; s >= 0; s--) {
        var t = Math.min(1, Math.max(0, p.t - p.dir * s * 0.045));
        var x = pa[0] + (pb[0] - pa[0]) * t;
        var y = pa[1] + (pb[1] - pa[1]) * t;
        var al3 = (s === 0 ? 0.95 : 0.4 - s * 0.09) * (0.45 + 0.55 * intensity);
        v[o++] = x; v[o++] = y; v[o++] = (s === 0 ? 4.4 : 2.9) * dpr; v[o++] = al3;
        v[o++] = theme.packet[0]; v[o++] = theme.packet[1]; v[o++] = theme.packet[2]; v[o++] = 1;
      }
    }
    var pointVerts = N + packets.length * 4;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, v.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.aData);
    gl.enableVertexAttribArray(loc.aColor);
    gl.vertexAttribPointer(loc.aData, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(loc.aColor, 4, gl.FLOAT, false, 32, 16);

    gl.uniform1f(loc.uPoint, 0);
    gl.drawArrays(gl.LINES, 0, lineVerts);
    gl.uniform1f(loc.uPoint, 1);
    gl.drawArrays(gl.POINTS, lineVerts, pointVerts);
  }

  /* ---------- canvas2d фолбэк ---------- */
  var ctx2d = null;
  function draw2D() {
    var c = ctx2d;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    var pa = [0, 0, 0], pb = [0, 0, 0];
    function sx(p) { return (p[0] * aspect * 0.5 + 0.5) * W; }
    function sy(p) { return (0.5 - p[1] * 0.5) * H; }
    var i, e;
    c.lineWidth = 1;
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      nodePos(nodes[e.a], pa); nodePos(nodes[e.b], pb);
      var h = Math.min(nodes[e.a].health, nodes[e.b].health);
      c.globalAlpha = theme.lineA * (0.25 + h * 0.75) * (0.35 + 0.65 * intensity);
      c.strokeStyle = theme.lineCss;
      c.beginPath(); c.moveTo(sx(pa), sy(pa)); c.lineTo(sx(pb), sy(pb)); c.stroke();
    }
    for (i = 0; i < N; i++) {
      var n = nodes[i];
      nodePos(n, pa);
      c.globalAlpha = theme.nodeA * (0.25 + n.health * 0.75) * (1 - n.z * 0.55) * (0.4 + 0.6 * intensity);
      c.fillStyle = theme.nodeCss;
      c.beginPath(); c.arc(sx(pa), sy(pa), 1.1 + (1 - n.z) * 1.7, 0, Math.PI * 2); c.fill();
    }
    for (i = 0; i < packets.length; i++) {
      var p = packets[i];
      e = edges[p.e];
      nodePos(nodes[e.a], pa); nodePos(nodes[e.b], pb);
      var x = sx(pa) + (sx(pb) - sx(pa)) * p.t;
      var y = sy(pa) + (sy(pb) - sy(pa)) * p.t;
      c.globalAlpha = 0.9 * (0.45 + 0.55 * intensity);
      c.fillStyle = theme.packetCss;
      c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  /* ---------- каркас ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = window.innerWidth;
    H = window.innerHeight;
    aspect = W / H;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    maxScroll = Math.max(1, document.body.scrollHeight - H);
    if (reduceMotion) frame(lastT || 16, true);
  }

  function hexToRgb(s) {
    s = s.trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function refreshTheme() {
    var cs = getComputedStyle(docEl);
    var isLight = docEl.dataset.theme === 'light';
    var accent = cs.getPropertyValue('--accent').trim() || '#e8ac3f';
    var base = isLight ? '#31404f' : '#93a0b4';
    theme.packet = hexToRgb(accent);
    theme.line = hexToRgb(base);
    theme.node = hexToRgb(base);
    theme.lineA = isLight ? 0.5 : 0.48;
    theme.nodeA = isLight ? 0.65 : 0.75;
    theme.lineCss = base;
    theme.nodeCss = base;
    theme.packetCss = accent;
    if (reduceMotion && lastT) frame(lastT, true);
  }

  function frame(now, force) {
    var dt = lastT ? Math.min(now - lastT, 50) : 16;
    lastT = now;
    onScrollState();
    step(dt);
    if (gl) drawGL(); else if (ctx2d) draw2D();
    if (running && !force) rafId = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    if (reduceMotion) return;
    if (on && !running) { running = true; lastT = 0; rafId = requestAnimationFrame(frame); }
    else if (!on && running) { running = false; cancelAnimationFrame(rafId); }
  }

  /* интенсивность и параллакс от скролла; вызывается из rAF-кадра,
     scrollHeight кэширован в resize — без layout-чтений на скролл-событиях */
  function onScrollState() {
    var p = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    /* hero 1 → середина 0.42 → финал 0.85 */
    var mid = 0.42, tail = 0.85;
    intensity = p < 0.28
      ? 1 - (1 - mid) * (p / 0.28)
      : p > 0.8 ? mid + (tail - mid) * ((p - 0.8) / 0.2) : mid;
    scrollPar = p * 0.35;
  }

  /* ---------- init ---------- */
  buildGraph();
  if (!makeGL()) {
    gl = null;
    ctx2d = canvas.getContext('2d');
  }
  refreshTheme();
  resize();
  onScrollState();

  window.addEventListener('resize', resize);
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', function (ev) {
      pointer.x = (ev.clientX / W) * 2 - 1;
      pointer.y = 1 - (ev.clientY / H) * 2;
    }, { passive: true });
  }
  document.addEventListener('visibilitychange', function () {
    setRunning(!document.hidden);
  });

  /* тема меняется из main.js */
  window.__sceneRefreshTheme = refreshTheme;

  if (reduceMotion) {
    /* статичный кадр: система видна, но не движется */
    for (var w = 0; w < 40; w++) step(33);
    frame(16, true);
  } else {
    setRunning(!document.hidden);
  }
})();
