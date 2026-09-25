/* canvas2d-фолбэк глобуса для устройств без WebGL2 и режима Save-Data:
   та же симуляция и тот же пульт терминала, простая перспективная проекция. */
import { createNetSim, exposeSystem, heroHud, arcPoint } from './sim.js';
import { sfxKill } from './sfx.js';

export function mountGlobe2d(stage) {
  const canvas = stage.querySelector('.stage-gl');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) { stage.classList.add('no-gl'); return; }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const sim = createNetSim({ n: isMobile ? 90 : 140, pmax: isMobile ? 30 : 50, reduced });
  exposeSystem(sim);
  const hud = heroHud(sim);
  stage.classList.add('gl-on');

  let W = 0, H = 0, dpr = 1, yaw = -0.6, raf = 0, last = 0, colors = null;
  const pitch = 0.22, dist = 5.4, f = 1 / Math.tan((30 * Math.PI) / 360);

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = {
      line: cs.getPropertyValue('--gl-line').trim(),
      node: cs.getPropertyValue('--gl-node').trim(),
      hot: cs.getPropertyValue('--gl-hot').trim(),
      core: cs.getPropertyValue('--gl-core').trim(),
      danger: cs.getPropertyValue('--gl-danger').trim(),
    };
  }
  readColors();

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    draw();
  }

  /* поворот (рысканье, затем тангаж) и перспектива; z > 0 — к зрителю */
  function proj(p, out) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
    const s = f / (dist - z2) * (Math.min(W, H) / 2);
    out[0] = W / 2 + x1 * s;
    out[1] = H / 2 - y2 * s;
    out[2] = z2;
    return out;
  }

  const a = [0, 0, 0], b = [0, 0, 0], q = [0, 0, 0], q2 = [0, 0, 0];
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const R = f / dist * (Math.min(W, H) / 2) * 1.02;
    ctx.fillStyle = colors.core;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 0.985, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1;
    for (let e = 0; e < sim.edges.length; e++) {
      const ed = sim.edges[e];
      const na = sim.nodes[ed.a], nb = sim.nodes[ed.b];
      proj(na.p, q); proj(nb.p, q2);
      if (q[2] < 0.05 || q2[2] < 0.05) continue;
      const h = Math.min(na.health, nb.health);
      ctx.globalAlpha = 0.18 + 0.3 * h + sim.heat[e] * 0.4;
      ctx.strokeStyle = sim.heat[e] > 0.3 ? colors.hot : colors.line;
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) {
        arcPoint(na.p, nb.p, s / 6, ed.lift, a);
        proj(a, b);
        if (s === 0) ctx.moveTo(b[0], b[1]); else ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
    for (let i = 0; i < sim.N; i++) {
      const nd = sim.nodes[i];
      proj(nd.p, q);
      if (q[2] < 0.05) continue;
      ctx.globalAlpha = 0.3 + 0.6 * nd.health;
      ctx.fillStyle = nd.health < 0.5 ? colors.danger : colors.node;
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = colors.hot;
    for (let i = 0; i < sim.packets.length; i++) {
      const p = sim.packets[i], ed = sim.edges[p.e];
      arcPoint(sim.nodes[ed.a].p, sim.nodes[ed.b].p, p.t, ed.lift, a);
      proj(a, q);
      if (q[2] < 0.05) continue;
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(now - last, 50) : 16;
    last = now;
    yaw += dt * 0.00007;
    sim.step(dt);
    hud(dt / 1000);
    draw();
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  let visible = true;
  new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (visible && !raf && !reduced) { last = 0; raf = requestAnimationFrame(frame); }
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && visible && !raf && !reduced) { last = 0; raf = requestAnimationFrame(frame); }
  });
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('themechange', () => { readColors(); draw(); });

  canvas.addEventListener('click', (ev) => {
    if (reduced) return;
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = -1, bd = 34 * 34;
    for (let i = 0; i < sim.N; i++) {
      proj(sim.nodes[i].p, q);
      if (q[2] < 0.1 || sim.nodes[i].health < 0.5) continue;
      const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && sim.killNode(best)) sfxKill();
  });

  resize();
  if (!reduced) raf = requestAnimationFrame(frame);
}
