import { setSfx, sfxEnabled, sfxKill, sfxHeal, sfxStorm } from './sfx.js';

const TAU = Math.PI * 2;

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

// точка на дуге a -> b (единичные векторы) с подъёмом над поверхностью
export function arcPoint(a, b, t, lift, out) {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const om = Math.acos(d);
  let s0, s1;
  if (om < 1e-4) { s0 = 1 - t; s1 = t; } else {
    const so = Math.sin(om);
    s0 = Math.sin((1 - t) * om) / so;
    s1 = Math.sin(t * om) / so;
  }
  const r = 1 + lift * Math.sin(Math.PI * t);
  out[0] = (a[0] * s0 + b[0] * s1) * r;
  out[1] = (a[1] * s0 + b[1] * s1) * r;
  out[2] = (a[2] * s0 + b[2] * s1) * r;
  return out;
}

export function createNetSim({ n = 180, k = 3, pmax = 70, reduced = false } = {}) {
  const sim = {
    N: n, PMAX: pmax, reduced,
    nodes: [], edges: [], adj: [], heat: null, packets: [], debris: [],
    killed: new Float64Array(n),
    fail: { active: false, c: [0, 0, 1], cosR: 0.9, until: 0, next: 3500, t0: 0 },
    storm: { until: 0, nextKill: 0 },
    chaos: false, chaosNext: 0,
    manualPulse: 0,
    stats: { kills: 0, failovers: 0, recoveries: 0 },
    time: 0,
    intro: reduced ? 1 : 0,
  };

  // узлы: сфера Фибоначчи с джиттером, чтобы не читалась сетка
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const p = norm([
      Math.cos(th) * r + (Math.random() - 0.5) * 0.09,
      y + (Math.random() - 0.5) * 0.09,
      Math.sin(th) * r + (Math.random() - 0.5) * 0.09,
    ]);
    sim.nodes.push({ p, alt: 1 + Math.random() * 0.025, ph: Math.random() * TAU, health: 1, deg: 0, boot: Math.random() });
  }

  // рёбра: k ближайших соседей без дублей
  const seen = new Set();
  for (let i = 0; i < n; i++) sim.adj.push([]);
  for (let i = 0; i < n; i++) {
    const a = sim.nodes[i].p;
    const d = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = sim.nodes[j].p;
      d.push([(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2, j]);
    }
    d.sort((x, y) => x[0] - y[0]);
    for (let m = 0; m < k; m++) {
      const j = d[m][1];
      const key = i < j ? i * 10000 + j : j * 10000 + i;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = sim.nodes[j].p;
      const ang = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      sim.adj[i].push(sim.edges.length);
      sim.adj[j].push(sim.edges.length);
      sim.edges.push({ a: i, b: j, lift: 0.02 + ang * 0.2 });
    }
  }
  sim.nodes.forEach((nd, i) => { nd.deg = sim.adj[i].length; });
  sim.heat = new Float32Array(sim.edges.length);

  const alive = (i) => sim.nodes[i].health > 0.5;

  function spawnPacket() {
    for (let tries = 0; tries < 6; tries++) {
      const e = (Math.random() * sim.edges.length) | 0;
      const ed = sim.edges[e];
      if (alive(ed.a) && alive(ed.b)) {
        sim.packets.push({ e, t: Math.random() < 0.5 ? 0 : 1, dir: 0, speed: 0.32 + Math.random() * 0.45 });
        const p = sim.packets[sim.packets.length - 1];
        p.dir = p.t === 0 ? 1 : -1;
        return;
      }
    }
  }

  function spawnDebris(i) {
    if (sim.reduced || sim.debris.length > 60) return;
    const nd = sim.nodes[i];
    for (let m = 0; m < 12; m++) {
      const rnd = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
      const sp = 0.25 + Math.random() * 0.55;
      sim.debris.push({
        p: [nd.p[0] * nd.alt, nd.p[1] * nd.alt, nd.p[2] * nd.alt],
        v: [(nd.p[0] * 0.8 + rnd[0]) * sp, (nd.p[1] * 0.8 + rnd[1]) * sp, (nd.p[2] * 0.8 + rnd[2]) * sp],
        life: 1, size: 0.6 + Math.random() * 1.1, spark: Math.random() < 0.35,
      });
    }
  }

  sim.killNode = (i, ms) => {
    if (i < 0 || i >= n || !alive(i)) return false;
    sim.killed[i] = sim.time + (ms || 2800);
    sim.stats.kills++;
    sim.manualPulse = 1;
    spawnDebris(i);
    return true;
  };
  sim.killRandom = (count) => {
    let c = 0;
    for (let tr = 0; tr < (count || 1) * 8 && c < (count || 1); tr++) {
      const i = (Math.random() * n) | 0;
      if (sim.killNode(i, 1600 + Math.random() * 1400)) c++;
    }
    return c;
  };
  sim.heal = () => {
    sim.killed.fill(0);
    sim.fail.active = false;
    sim.fail.next = sim.time + 5000;
    sim.storm.until = 0;
    sim.stats.recoveries++;
  };
  sim.stormNow = () => {
    sim.storm.until = sim.time + 2800;
    sim.storm.nextKill = 0;
    sim.manualPulse = 1;
  };
  sim.setChaos = (on) => {
    sim.chaos = !!on;
    sim.chaosNext = sim.time;
    if (!on) sim.heal();
  };
  sim.aliveCount = () => { let c = 0; for (let i = 0; i < n; i++) if (alive(i)) c++; return c; };

  // dt в миллисекундах
  sim.step = (dt) => {
    sim.time += dt;
    if (sim.intro < 1) sim.intro = Math.min(1, sim.intro + dt / 1800);
    const f = sim.fail;
    if (!f.active && sim.time > f.next) {
      f.active = true;
      f.c = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
      f.cosR = Math.cos(0.32 + Math.random() * 0.22);
      f.until = sim.time + 2700;
      f.t0 = sim.time;
      sim.stats.failovers++;
    }
    if (f.active && sim.time > f.until) {
      f.active = false;
      f.next = sim.time + 4500 + Math.random() * 4000;
    }
    if (sim.storm.until > sim.time && sim.time > sim.storm.nextKill) {
      sim.killRandom(1);
      sim.storm.nextKill = sim.time + 150 + Math.random() * 200;
    }
    if (sim.chaos && sim.time > sim.chaosNext) {
      sim.killRandom(1 + (Math.random() < 0.4 ? 1 : 0));
      sim.chaosNext = sim.time + 1500 + Math.random() * 1300;
    }
    sim.manualPulse *= Math.pow(0.5, dt / 700);

    for (let i = sim.debris.length - 1; i >= 0; i--) {
      const d = sim.debris[i];
      d.life -= dt / 1100;
      if (d.life <= 0) { sim.debris.splice(i, 1); continue; }
      const s = dt / 1000;
      d.p[0] += d.v[0] * s; d.p[1] += d.v[1] * s; d.p[2] += d.v[2] * s;
      const drag = Math.exp(-2.4 * s);
      d.v[0] *= drag; d.v[1] *= drag; d.v[2] *= drag;
    }

    for (let i = 0; i < n; i++) {
      const nd = sim.nodes[i];
      let dead = sim.killed[i] > sim.time;
      if (!dead && f.active) {
        dead = nd.p[0] * f.c[0] + nd.p[1] * f.c[1] + nd.p[2] * f.c[2] > f.cosR;
      }
      nd.health += ((dead ? 0.06 : 1) - nd.health) * Math.min(dt * 0.005, 1);
    }

    const cool = Math.pow(0.5, dt / 700);
    for (let i = 0; i < sim.heat.length; i++) sim.heat[i] *= cool;

    if (sim.packets.length < pmax * (0.4 + 0.6 * sim.intro) && Math.random() < 0.4) spawnPacket();
    for (let i = sim.packets.length - 1; i >= 0; i--) {
      const p = sim.packets[i];
      const ed = sim.edges[p.e];
      sim.heat[p.e] = 1;
      if (sim.nodes[ed.a].health < 0.4 || sim.nodes[ed.b].health < 0.4) { sim.packets.splice(i, 1); continue; }
      p.t += p.speed * dt * 0.001 * p.dir;
      if (p.t > 1 || p.t < 0) {
        const at = p.t > 1 ? ed.b : ed.a;
        const opts = sim.adj[at];
        const next = opts[(Math.random() * opts.length) | 0];
        const ne = sim.edges[next];
        if (!alive(ne.a) || !alive(ne.b) || Math.random() < 0.14) { sim.packets.splice(i, 1); continue; }
        p.e = next;
        p.dir = ne.a === at ? 1 : -1;
        p.t = p.dir === 1 ? 0 : 1;
      }
    }
  };

  if (reduced) for (let w = 0; w < 60; w++) sim.step(33);
  return sim;
}

// пульт для терминала и палитры (src/ui/main.js)
export function exposeSystem(sim) {
  window.__system = {
    kill: (count) => { const c = sim.killRandom(count || 1); sfxKill(); return c; },
    heal: () => { sim.heal(); sfxHeal(); },
    storm: () => { sim.stormNow(); sfxStorm(); },
    chaos: (on) => { sim.setChaos(on); if (on) sfxStorm(); else sfxHeal(); },
    sfx: (on) => setSfx(on),
    sfxOn: sfxEnabled,
    stats: () => ({
      nodes: sim.N, alive: sim.aliveCount(), edges: sim.edges.length,
      packets: sim.packets.length, kills: sim.stats.kills, failovers: sim.stats.failovers,
      chaos: sim.chaos,
    }),
  };
  return window.__system;
}

// HUD героя: 4 Гц, без перерисовки layout на каждом кадре
export function heroHud(sim) {
  const hud = document.getElementById('hero-hud');
  if (!hud) return () => {};
  hud.hidden = false;
  const f = {};
  hud.querySelectorAll('[data-hud]').forEach((el) => { f[el.dataset.hud] = el; });
  let acc = 1;
  const last = {};
  const set = (k, v) => { if (f[k] && last[k] !== v) { f[k].textContent = String(v); last[k] = v; } };
  return (dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    set('alive', sim.aliveCount());
    set('nodes', sim.N);
    set('packets', sim.packets.length);
    set('failovers', sim.stats.failovers);
    set('kills', sim.stats.kills);
  };
}
