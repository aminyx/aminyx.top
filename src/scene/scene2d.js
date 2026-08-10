/* canvas2d-фолбэк «живой системы» для устройств без WebGL:
   та же симуляция, упрощённая отрисовка. */
import { createSim, attachInput } from './sim.js';

export function mount2d(rootEl) {
  var sim = createSim();
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  rootEl.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) return; /* нет и canvas2d — остаётся чистый фон */

  var W = 0, H = 0, dpr = 1;
  var running = false, rafId = 0, lastT = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = window.innerWidth;
    H = window.innerHeight;
    sim.aspect = W / H;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (sim.reduceMotion) frame(lastT || 16, true);
  }

  function draw() {
    var c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    var pa = [0, 0, 0], pb = [0, 0, 0];
    function sx(p) { return (p[0] * 0.5 + 0.5) * W; }
    function sy(p) { return (0.5 - p[1] * 0.5) * H; }
    var i, e, th = sim.theme;
    c.lineWidth = 1;
    for (i = 0; i < sim.edges.length; i++) {
      e = sim.edges[i];
      sim.nodePos(sim.nodes[e.a], pa); sim.nodePos(sim.nodes[e.b], pb);
      var h = Math.min(sim.nodes[e.a].health, sim.nodes[e.b].health);
      c.globalAlpha = th.lineA * (0.25 + h * 0.75) * (0.35 + 0.65 * sim.intensity);
      c.strokeStyle = th.lineCss;
      c.beginPath(); c.moveTo(sx(pa), sy(pa)); c.lineTo(sx(pb), sy(pb)); c.stroke();
    }
    for (i = 0; i < sim.N; i++) {
      var n = sim.nodes[i];
      sim.nodePos(n, pa);
      var hov = i === sim.hoverIdx;
      c.globalAlpha = hov ? 0.95 : th.nodeA * (0.25 + n.health * 0.75) * (1 - n.z * 0.55) * (0.4 + 0.6 * sim.intensity);
      c.fillStyle = hov ? th.packetCss : th.nodeCss;
      c.beginPath(); c.arc(sx(pa), sy(pa), (1.1 + (1 - n.z) * 1.7) * (hov ? 1.9 : 1), 0, Math.PI * 2); c.fill();
    }
    for (i = 0; i < sim.packets.length; i++) {
      var p = sim.packets[i];
      e = sim.edges[p.e];
      sim.nodePos(sim.nodes[e.a], pa); sim.nodePos(sim.nodes[e.b], pb);
      var x = sx(pa) + (sx(pb) - sx(pa)) * p.t;
      var y = sy(pa) + (sy(pb) - sy(pa)) * p.t;
      c.globalAlpha = 0.9 * (0.45 + 0.55 * sim.intensity);
      c.fillStyle = th.packetCss;
      c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
    }
    /* осколки убитых узлов */
    for (i = 0; i < sim.debris.length; i++) {
      var db = sim.debris[i];
      c.globalAlpha = (db.life / 900) * 0.85;
      c.fillStyle = db.spark ? th.packetCss : th.nodeCss;
      c.beginPath();
      c.arc((db.x * 0.5 + 0.5) * W, (0.5 - db.y * 0.5) * H, db.size, 0, Math.PI * 2);
      c.fill();
    }
    /* узел-фокус за CTA в финале */
    if (sim.converge > 0.01) {
      var ax = sim.aspect < 1 ? sim.aspect : Math.min(sim.aspect, 1.25);
      var fp = [sim.focal.x / ax, sim.focal.y, 0];
      c.globalAlpha = 0.95 * sim.converge;
      c.fillStyle = th.packetCss;
      c.beginPath(); c.arc(sx(fp), sy(fp), 2.6 * sim.converge + 0.6, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  function frame(now, force) {
    var dt = lastT ? Math.min(now - lastT, 50) : 16;
    lastT = now;
    sim.onScrollState();
    sim.step(dt);
    sim.hoverIdx = sim.probe.active && !sim.reduceMotion
      ? sim.nearestNode(sim.probe.x, sim.probe.y, 0.09)
      : -1;
    draw();
    if (running && !force) rafId = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    if (sim.reduceMotion) return;
    if (on && !running) { running = true; lastT = 0; rafId = requestAnimationFrame(frame); }
    else if (!on && running) { running = false; cancelAnimationFrame(rafId); }
  }

  attachInput(sim, function () { if (sim.reduceMotion) frame(lastT || 16, true); });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { setRunning(!document.hidden); });
  resize();

  if (sim.reduceMotion) {
    /* статичный кадр: система видна, но не движется */
    for (var w = 0; w < 40; w++) sim.step(33);
    frame(16, true);
  } else {
    setRunning(!document.hidden);
  }
}
