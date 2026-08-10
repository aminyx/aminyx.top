/* aminyx.top — симуляция «живой системы»: распределённая сеть с multipath-
   трафиком и failover-каскадами. Механика Aminyx Link, а не орнамент.
   Модуль не знает о рендерере: его читают и WebGL-слой (R3F), и canvas2d-фолбэк. */

export function createSim() {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var docEl = document.documentElement;

  var isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  var N = isMobile ? 84 : 176;           /* узлы */
  var K = 3;                             /* рёбер на узел (k-ближайших) */
  var PMAX = isMobile ? 30 : 64;         /* пакеты */

  var sim = {
    reduceMotion: reduceMotion,
    isMobile: isMobile,
    N: N,
    PMAX: PMAX,
    nodes: [],   /* {x,y,z, ph, health} — базовые координаты в [-1..1] */
    edges: [],   /* {a,b} индексы */
    heat: null,  /* «нагрев» ребра трафиком: маршрут светится и остывает */
    adj: [],     /* смежность: adj[i] = [edgeIdx...] */
    packets: [], /* {e, t, dir, speed} */
    fail: { active: false, cx: 0, cy: 0, r: 0.5, until: 0, next: 4000 },
    time: 0,
    aspect: 1,
    intensity: 1,          /* от скролла: hero 1 → середина 0.42 → контакт 0.85 */
    converge: 0,           /* финал: система сходится к узлу за CTA (DIRECTION v2) */
    focal: { x: 0, y: -0.24 },  /* clip-координаты CTA контакта (~62% высоты) */
    pointer: { x: 0, y: 0 },
    scrollPar: 0,
    maxScroll: 1,
    nodePos: nodePos,
    step: step,
    onScrollState: onScrollState,
    refreshTheme: refreshTheme,
    refreshScrollBounds: refreshScrollBounds,
    theme: {
      line: [1, 1, 1], node: [1, 1, 1], packet: [1, .7, .25],
      lineA: .1, nodeA: .5,
      lineCss: '#93a0b4', nodeCss: '#93a0b4', packetCss: '#e8ac3f'
    }
  };

  /* ---------- граф ---------- */
  function buildGraph() {
    sim.nodes = [];
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
      sim.nodes.push({ x: x, y: y, z: Math.random(), ph: Math.random() * Math.PI * 2, health: 1 });
    }
    /* k-ближайших соседей, без дублей */
    var seen = {};
    sim.edges = [];
    sim.adj = [];
    for (i = 0; i < N; i++) sim.adj.push([]);
    for (i = 0; i < N; i++) {
      var d = [];
      for (j = 0; j < N; j++) {
        if (i === j) continue;
        var dx = sim.nodes[i].x - sim.nodes[j].x, dy = sim.nodes[i].y - sim.nodes[j].y, dz = (sim.nodes[i].z - sim.nodes[j].z) * 0.6;
        d.push([dx * dx + dy * dy + dz * dz, j]);
      }
      d.sort(function (a, b) { return a[0] - b[0]; });
      for (j = 0; j < K; j++) {
        var b = d[j][1];
        var key = i < b ? i + '_' + b : b + '_' + i;
        if (seen[key]) continue;
        seen[key] = 1;
        sim.adj[i].push(sim.edges.length);
        sim.adj[b].push(sim.edges.length);
        sim.edges.push({ a: i, b: b });
      }
    }
    sim.heat = new Float32Array(sim.edges.length);
  }

  /* позиция узла с дрейфом и параллаксом (в clip-координатах) */
  function nodePos(n, out) {
    var drift = 0.018;
    var px = n.x + Math.sin(sim.time * 0.00021 + n.ph) * drift;
    var py = n.y + Math.cos(sim.time * 0.00017 + n.ph * 1.7) * drift;
    /* глубина: дальние (z→1) сжимаются к центру и вверх при скролле слабее */
    var depth = 0.55 + (1 - n.z) * 0.45;
    px = px * depth + sim.pointer.x * 0.03 * (1 - n.z);
    py = py * depth + sim.pointer.y * 0.03 * (1 - n.z) + sim.scrollPar * (0.22 + n.z * 0.3);
    /* финал страницы: узлы стягиваются к точке за CTA — частично,
       чтобы система сходилась, но не схлопывалась в пятно */
    if (sim.converge > 0) {
      var cv = sim.converge * (0.45 + 0.3 * (1 - n.z));
      px += (sim.focal.x - px) * cv;
      py += (sim.focal.y - py) * cv;
    }
    /* узкие экраны: растягиваем по ширине (края обрезаются красиво);
       широкие: не даём сцене сжаться в центральную треть */
    out[0] = px / (sim.aspect < 1 ? sim.aspect : Math.min(sim.aspect, 1.25));
    out[1] = py;
    out[2] = n.z;
  };

  function spawnPacket() {
    if (!sim.edges.length) return;
    for (var tries = 0; tries < 6; tries++) {
      var e = (Math.random() * sim.edges.length) | 0;
      var ed = sim.edges[e];
      if (sim.nodes[ed.a].health > 0.5 && sim.nodes[ed.b].health > 0.5) {
        sim.packets.push({ e: e, t: 0, dir: Math.random() < 0.5 ? 1 : -1, speed: 0.35 + Math.random() * 0.5 });
        return;
      }
    }
  }

  function step(dt) {
    sim.time += dt;
    var fail = sim.fail;
    /* failover-каскад: регион гаснет, трафик перетекает */
    if (!fail.active && sim.time > fail.next) {
      fail.active = true;
      fail.cx = (Math.random() * 2 - 1) * 0.8;
      fail.cy = (Math.random() * 2 - 1) * 0.7;
      fail.until = sim.time + 2600;
      fail.r = 0.38 + Math.random() * 0.2;
    }
    if (fail.active && sim.time > fail.until) {
      fail.active = false;
      fail.next = sim.time + 4200 + Math.random() * 3800;
    }
    var i;
    for (i = 0; i < N; i++) {
      var n = sim.nodes[i];
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
    for (i = 0; i < sim.heat.length; i++) sim.heat[i] *= cool;
    /* пакеты: движение и хопы через живые узлы */
    var want = Math.round(PMAX * (0.35 + 0.65 * sim.intensity));
    if (sim.packets.length < want && Math.random() < 0.35) spawnPacket();
    for (i = sim.packets.length - 1; i >= 0; i--) {
      var p = sim.packets[i];
      sim.heat[p.e] = 1;
      var ed = sim.edges[p.e];
      if (sim.nodes[ed.a].health < 0.4 || sim.nodes[ed.b].health < 0.4) { sim.packets.splice(i, 1); continue; }
      p.t += p.speed * dt * 0.001 * p.dir;
      if (p.t > 1 || p.t < 0) {
        /* хоп: продолжаем с достигнутого узла по случайному живому ребру */
        var at = p.t > 1 ? ed.b : ed.a;
        var options = sim.adj[at];
        var next = options[(Math.random() * options.length) | 0];
        var ne = sim.edges[next];
        if (sim.nodes[ne.a].health < 0.5 || sim.nodes[ne.b].health < 0.5 || Math.random() < 0.18) {
          sim.packets.splice(i, 1);
          continue;
        }
        p.e = next;
        p.dir = ne.a === at ? 1 : -1;
        p.t = p.dir === 1 ? 0 : 1;
      }
    }
  };

  /* интенсивность и параллакс от скролла; maxScroll кэширован в resize —
     без layout-чтений внутри кадра */
  function onScrollState() {
    var p = Math.min(1, Math.max(0, window.scrollY / sim.maxScroll));
    var mid = 0.42, tail = 0.85;
    sim.intensity = p < 0.28
      ? 1 - (1 - mid) * (p / 0.28)
      : p > 0.8 ? mid + (tail - mid) * ((p - 0.8) / 0.2) : mid;
    sim.scrollPar = p * 0.35;
    /* smoothstep на последних ~20% скролла; под reduced-motion схождение
       выключено: единственный статичный кадр не должен заморозить финал
       (кадр перерисовывается по смене темы в любой точке скролла) */
    var c = (p - 0.8) / 0.2;
    c = c < 0 ? 0 : c > 1 ? 1 : c;
    sim.converge = sim.reduceMotion ? 0 : c * c * (3 - 2 * c);
  };

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
    var t = sim.theme;
    t.packet = hexToRgb(accent);
    t.line = hexToRgb(base);
    t.node = hexToRgb(base);
    t.lineA = isLight ? 0.5 : 0.48;
    t.nodeA = isLight ? 0.65 : 0.75;
    t.lineCss = base;
    t.nodeCss = base;
    t.packetCss = accent;
  };

  function refreshScrollBounds() {
    sim.maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
  };

  buildGraph();
  sim.refreshTheme();
  sim.refreshScrollBounds();
  sim.onScrollState();
  return sim;
}

/* Общая обвязка ввода: указатель, resize, тема. Возвращает detach. */
export function attachInput(sim, onThemeChange) {
  function onResize() {
    sim.refreshScrollBounds();
    if (onThemeChange) onThemeChange();
  }
  window.addEventListener('resize', onResize);
  var onMove = null;
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    onMove = function (ev) {
      sim.pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
      sim.pointer.y = 1 - (ev.clientY / window.innerHeight) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
  }
  /* тема меняется из main.js */
  window.__sceneRefreshTheme = function () {
    sim.refreshTheme();
    if (onThemeChange) onThemeChange();
  };
  return function detach() {
    window.removeEventListener('resize', onResize);
    if (onMove) window.removeEventListener('pointermove', onMove);
    if (window.__sceneRefreshTheme) delete window.__sceneRefreshTheme;
  };
}
