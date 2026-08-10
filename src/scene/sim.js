/* aminyx.top — симуляция «живой системы»: распределённая сеть с multipath-
   трафиком и failover-каскадами. Механика Aminyx Link, а не орнамент.
   Модуль не знает о рендерере: его читают и WebGL-слой (R3F), и canvas2d-фолбэк. */
import { setSfx, sfxEnabled, sfxKill, sfxHeal, sfxStorm } from './sfx.js';

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
    /* интерактив: посетитель — chaos-инженер */
    killed: null,          /* Float64Array: время, до которого узел убит вручную */
    hoverIdx: -1,          /* узел под зондом курсора (подсветка) */
    probe: { x: 0, y: 0, active: false },
    manualPulse: 0,        /* 0..1: вспышка Bloom после ручного отказа, затухает */
    chaos: false,          /* Konami: непрерывные случайные отказы */
    chaosNext: 0,
    storm: { until: 0, nextKill: 0 },
    stats: { kills: 0, recoveries: 0 },
    debris: [],            /* осколки убитых узлов: баллистика без физдвижка */
    zoom: 1,               /* «камера»: наезд по мере скролла */
    rot: 0,                /* …и лёгкий поворот субстрата */
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
    nearestNode: nearestNode,
    killAt: killAt,
    killRandom: killRandom,
    heal: heal,
    stormNow: stormNow,
    setChaos: setChaos,
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
    sim.killed = new Float64Array(N);
  }

  /* ---------- интерактив: посетитель испытывает систему ---------- */

  /* ближайший живой узел к точке в clip-координатах экрана */
  function nearestNode(cx, cy, maxDist) {
    var out = [0, 0, 0];
    var best = -1, bestD = (maxDist || 0.14) * (maxDist || 0.14);
    for (var i = 0; i < N; i++) {
      nodePos(sim.nodes[i], out);
      var dx = out[0] - cx, dy = out[1] - cy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function killNode(i, ms) {
    if (i < 0 || i >= N) return false;
    sim.killed[i] = sim.time + (ms || 2600);
    sim.stats.kills++;
    sim.manualPulse = 1;
    spawnDebris(i);
    return true;
  }

  /* узел раскалывается: 10 осколков разлетаются и гаснут под «гравитацией» */
  function spawnDebris(i) {
    if (sim.reduceMotion || sim.debris.length > 36) return;
    var out = [0, 0, 0];
    nodePos(sim.nodes[i], out);
    for (var k = 0; k < 10; k++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 0.00012 + Math.random() * 0.00035;
      sim.debris.push({
        x: out[0], y: out[1],
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 0.00012,
        life: 900,
        size: 1.2 + Math.random() * 1.8,
        spark: Math.random() < 0.25,
      });
    }
  }

  function killAt(cx, cy) {
    var i = nearestNode(cx, cy, 0.16);
    if (i < 0 || sim.nodes[i].health < 0.5) return -1;
    return killNode(i) ? i : -1;
  }

  function killRandom(n) {
    var count = 0;
    for (var t = 0; t < (n || 1) * 6 && count < (n || 1); t++) {
      var i = (Math.random() * N) | 0;
      if (sim.nodes[i].health > 0.5) { killNode(i, 1600 + Math.random() * 1200); count++; }
    }
    return count;
  }

  function heal() {
    if (sim.killed) sim.killed.fill(0);
    sim.fail.active = false;
    sim.fail.next = sim.time + 5000;
    sim.storm.until = 0;
    sim.stats.recoveries++;
  }

  function stormNow() {
    sim.storm.until = sim.time + 2800;
    sim.storm.nextKill = 0;
    sim.manualPulse = 1;
  }

  function setChaos(on) {
    sim.chaos = !!on;
    sim.chaosNext = sim.time;
    if (!on) heal();
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
    /* «камера»: наезд и лёгкий поворот по мере чтения страницы */
    if (sim.zoom !== 1 || sim.rot !== 0) {
      var cr = Math.cos(sim.rot), sr = Math.sin(sim.rot);
      var rx = (px * cr - py * sr) * sim.zoom;
      py = (px * sr + py * cr) * sim.zoom;
      px = rx;
    }
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
    /* зонд: узлы мягко расступаются вокруг курсора */
    if (sim.probe.active) {
      var rdx = out[0] - sim.probe.x, rdy = out[1] - sim.probe.y;
      var rd = Math.sqrt(rdx * rdx + rdy * rdy);
      if (rd < 0.16 && rd > 0.0001) {
        var push = (0.16 - rd) * 0.22;
        out[0] += (rdx / rd) * push;
        out[1] += (rdy / rd) * push;
      }
    }
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
    /* шторм от долгого нажатия: серия быстрых отказов */
    if (sim.storm.until > sim.time && sim.time > sim.storm.nextKill) {
      killRandom(1);
      sim.storm.nextKill = sim.time + 160 + Math.random() * 220;
    }
    /* CHAOS MODE (Konami): система живёт под непрерывным обстрелом */
    if (sim.chaos && sim.time > sim.chaosNext) {
      killRandom(1 + (Math.random() < 0.4 ? 1 : 0));
      sim.chaosNext = sim.time + 1600 + Math.random() * 1400;
    }
    sim.manualPulse *= Math.pow(0.5, dt / 700);
    /* осколки: баллистика + затухание */
    for (i = sim.debris.length - 1; i >= 0; i--) {
      var db = sim.debris[i];
      db.life -= dt;
      if (db.life <= 0) { sim.debris.splice(i, 1); continue; }
      db.vy -= dt * 0.0000009;
      db.x += db.vx * dt;
      db.y += db.vy * dt;
    }
    var i;
    for (i = 0; i < N; i++) {
      var n = sim.nodes[i];
      var dead = sim.killed[i] > sim.time;
      if (!dead && fail.active) {
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
    /* «камера»-рассказчик: медленный наезд и поворот ~4° за страницу */
    sim.zoom = sim.reduceMotion ? 1 : 1 + p * 0.14;
    sim.rot = sim.reduceMotion ? 0 : p * 0.07;
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
    /* светлая тема — «чертёж»: линии тонкие и тихие; тёмный сланец на белом
       при равной альфе читается вдвое громче, чем серо-голубой на чёрном */
    t.lineA = isLight ? 0.2 : 0.48;
    t.nodeA = isLight ? 0.38 : 0.75;
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

/* Общая обвязка ввода: указатель, resize, тема, интерактив chaos-инженера.
   Возвращает detach. */
export function attachInput(sim, onThemeChange) {
  function onResize() {
    sim.refreshScrollBounds();
    if (onThemeChange) onThemeChange();
  }
  window.addEventListener('resize', onResize);

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var onMove = null;
  if (finePointer) {
    onMove = function (ev) {
      sim.pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
      sim.pointer.y = 1 - (ev.clientY / window.innerHeight) * 2;
      sim.probe.x = sim.pointer.x;
      sim.probe.y = sim.pointer.y;
      sim.probe.active = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
  }

  /* ---------- посетитель как chaos-инженер ---------- */

  var hint = document.getElementById('scene-hint');
  var hinted = false;
  try { hinted = localStorage.getItem('hinted') === '1'; } catch (e) {}
  var hintTimer = 0;
  if (hint && !hinted && !sim.reduceMotion) {
    hintTimer = setTimeout(function () { hint.classList.add('on'); }, 2600);
  }
  function dismissHint() {
    if (!hint) return;
    hint.classList.remove('on');
    try { localStorage.setItem('hinted', '1'); } catch (e) {}
  }

  function isInteractive(el) {
    return el && el.closest && el.closest('a, button, input, textarea, select, summary, label, .sys-terminal');
  }
  function toClip(ev) {
    return {
      x: (ev.clientX / window.innerWidth) * 2 - 1,
      y: 1 - (ev.clientY / window.innerHeight) * 2,
    };
  }

  var downAt = 0, downX = 0, downY = 0, stormFired = false, holdTimer = 0;

  function onDown(ev) {
    if (sim.reduceMotion || isInteractive(ev.target)) return;
    downAt = performance.now();
    downX = ev.clientX; downY = ev.clientY;
    stormFired = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      stormFired = true;
      sim.stormNow();
      sfxStorm();
      dismissHint();
    }, 600);
  }
  function onUp(ev) {
    clearTimeout(holdTimer);
    if (sim.reduceMotion || stormFired || isInteractive(ev.target)) return;
    if (performance.now() - downAt > 500) return;
    if (Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 14) return;
    if (String(window.getSelection && window.getSelection())) return;
    var p = toClip(ev);
    if (sim.killAt(p.x, p.y) >= 0) {
      sfxKill();
      dismissHint();
    }
  }
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('pointercancel', function () { clearTimeout(holdTimer); }, { passive: true });

  /* пульт для терминала и Konami (main.js) */
  window.__system = {
    kill: function (n) { var c = sim.killRandom(n || 1); sfxKill(); return c; },
    heal: function () { sim.heal(); sfxHeal(); },
    storm: function () { sim.stormNow(); sfxStorm(); },
    chaos: function (on) { sim.setChaos(on); if (on) sfxStorm(); else sfxHeal(); },
    sfx: function (on) { setSfx(on); },
    sfxOn: sfxEnabled,
    stats: function () {
      var alive = 0;
      for (var i = 0; i < sim.N; i++) if (sim.nodes[i].health > 0.5) alive++;
      return {
        nodes: sim.N, alive: alive, edges: sim.edges.length,
        packets: sim.packets.length, kills: sim.stats.kills,
        chaos: sim.chaos, intensity: Math.round(sim.intensity * 100) / 100,
      };
    },
  };

  /* тема меняется из main.js */
  window.__sceneRefreshTheme = function () {
    sim.refreshTheme();
    if (onThemeChange) onThemeChange();
  };
  return function detach() {
    window.removeEventListener('resize', onResize);
    if (onMove) window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerup', onUp);
    clearTimeout(hintTimer);
    clearTimeout(holdTimer);
    if (window.__sceneRefreshTheme) delete window.__sceneRefreshTheme;
    if (window.__system) delete window.__system;
  };
}
