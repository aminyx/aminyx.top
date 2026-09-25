// hero: глобус поверх sim.js. клик по узлу = отказ, удержание = шторм
import {
  Scene, PerspectiveCamera, Group, Mesh, SphereGeometry, RingGeometry,
  BufferGeometry, BufferAttribute, Points, LineSegments, LineLoop, LineBasicMaterial,
  MeshBasicMaterial, ShaderMaterial, Vector3, Color, DoubleSide, AdditiveBlending, NormalBlending,
} from 'three';
import { pointsMaterial, linesMaterial, setGlowBlend, putColor, orbit, toNdc, damp } from '../kit.js';
import { createNetSim, exposeSystem, heroHud, arcPoint } from '../sim.js';
import { sfxKill, sfxStorm } from '../sfx.js';

const SEG = 10;

export function create(ctx) {
  const { reduced, isMobile } = ctx;
  let th = ctx.theme;
  const sim = createNetSim({ n: isMobile ? 120 : 190, pmax: isMobile ? 44 : 76, reduced });
  exposeSystem(sim);
  const hud = heroHud(sim);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 5.4);
  const root = new Group();
  scene.add(root);

  // ядро: матовая сфера с холодным ободком, закрывает обратную сторону
  const coreMat = new ShaderMaterial({
    uniforms: { uCore: { value: new Color() }, uRim: { value: new Color() }, uRimK: { value: 0.5 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore; uniform vec3 uRim; uniform float uRimK;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
        gl_FragColor = vec4(mix(uCore, uRim, f * uRimK), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const core = new Mesh(new SphereGeometry(0.985, 72, 48), coreMat);
  core.renderOrder = 0;
  root.add(core);

  // пыль на поверхности, сфера Фибоначчи
  const DUST = isMobile ? 1100 : 2200;
  const dustPos = new Float32Array(DUST * 3), dustSize = new Float32Array(DUST), dustCol = new Float32Array(DUST * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < DUST; i++) {
    const y = 1 - (i / (DUST - 1)) * 2, r = Math.sqrt(1 - y * y), a = golden * i;
    dustPos[i * 3] = Math.cos(a) * r * 1.001;
    dustPos[i * 3 + 1] = y * 1.001;
    dustPos[i * 3 + 2] = Math.sin(a) * r * 1.001;
    dustSize[i] = 0.007 + Math.random() * 0.006;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aSize', new BufferAttribute(dustSize, 1));
  dustGeo.setAttribute('aColor', new BufferAttribute(dustCol, 4));
  const dustMat = pointsMaterial({ light: th.light, facing: true, soft: 0 });
  const dust = new Points(dustGeo, dustMat);
  dust.renderOrder = 2;
  root.add(dust);

  // дуги маршрутов: геометрия статична, цвет пишется каждый кадр
  const E = sim.edges.length;
  const linePos = new Float32Array(E * SEG * 2 * 3);
  const lineCol = new Float32Array(E * SEG * 2 * 4);
  const tmpA = [0, 0, 0], tmpB = [0, 0, 0];
  sim.edges.forEach((ed, e) => {
    const a = sim.nodes[ed.a].p, b = sim.nodes[ed.b].p;
    for (let s = 0; s < SEG; s++) {
      arcPoint(a, b, s / SEG, ed.lift, tmpA);
      arcPoint(a, b, (s + 1) / SEG, ed.lift, tmpB);
      const o = (e * SEG + s) * 6;
      linePos.set(tmpA, o);
      linePos.set(tmpB, o + 3);
    }
  });
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(linePos, 3));
  lineGeo.setAttribute('aColor', new BufferAttribute(lineCol, 4));
  const lineMat = linesMaterial({ light: th.light, glow: true, facing: true });
  const lines = new LineSegments(lineGeo, lineMat);
  lines.renderOrder = 3;
  lines.frustumCulled = false;
  root.add(lines);

  const N = sim.N;
  const nodePos = new Float32Array(N * 3), nodeSize = new Float32Array(N), nodeCol = new Float32Array(N * 4);
  sim.nodes.forEach((nd, i) => nodePos.set([nd.p[0] * nd.alt, nd.p[1] * nd.alt, nd.p[2] * nd.alt], i * 3));
  const nodeGeo = new BufferGeometry();
  nodeGeo.setAttribute('position', new BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('aSize', new BufferAttribute(nodeSize, 1));
  nodeGeo.setAttribute('aColor', new BufferAttribute(nodeCol, 4));
  const nodeMat = pointsMaterial({ light: th.light, facing: true, soft: 0.45 });
  const nodes = new Points(nodeGeo, nodeMat);
  nodes.renderOrder = 4;
  nodes.frustumCulled = false;
  root.add(nodes);

  // пакеты со шлейфом и осколки
  const P = sim.PMAX * 4 + 80;
  const pkPos = new Float32Array(P * 3), pkSize = new Float32Array(P), pkCol = new Float32Array(P * 4);
  const pkGeo = new BufferGeometry();
  pkGeo.setAttribute('position', new BufferAttribute(pkPos, 3));
  pkGeo.setAttribute('aSize', new BufferAttribute(pkSize, 1));
  pkGeo.setAttribute('aColor', new BufferAttribute(pkCol, 4));
  const pkMat = pointsMaterial({ light: th.light, facing: true, soft: 0.85 });
  const packets = new Points(pkGeo, pkMat);
  packets.renderOrder = 5;
  packets.frustumCulled = false;
  root.add(packets);

  const RING = 96;
  const ringGeo = new BufferGeometry();
  ringGeo.setAttribute('position', new BufferAttribute(new Float32Array(RING * 3), 3));
  const ringMat = new LineBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const failRing = new LineLoop(ringGeo, ringMat);
  failRing.renderOrder = 6;
  root.add(failRing);
  let ringFor = -1;
  function buildRing() {
    const f = sim.fail, c = new Vector3(...f.c);
    const u = new Vector3(0, 1, 0).cross(c);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0).cross(c);
    u.normalize();
    const v = new Vector3().crossVectors(c, u);
    const ang = Math.acos(f.cosR), s = Math.sin(ang) * 1.012, k = Math.cos(ang) * 1.012;
    const arr = ringGeo.attributes.position.array;
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      arr[i * 3] = c.x * k + (u.x * Math.cos(a) + v.x * Math.sin(a)) * s;
      arr[i * 3 + 1] = c.y * k + (u.y * Math.cos(a) + v.y * Math.sin(a)) * s;
      arr[i * 3 + 2] = c.z * k + (u.z * Math.cos(a) + v.z * Math.sin(a)) * s;
    }
    ringGeo.attributes.position.needsUpdate = true;
    ringGeo.computeBoundingSphere();
  }

  // ударные волны ручных отказов
  const waves = [];
  for (let i = 0; i < 5; i++) {
    const m = new Mesh(new RingGeometry(0.9, 1, 48), new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide, opacity: 0 }));
    m.visible = false;
    m.userData.life = 0;
    m.renderOrder = 7;
    root.add(m);
    waves.push(m);
  }
  function wave(i) {
    const w = waves.find((m) => m.userData.life <= 0) || waves[0];
    const p = sim.nodes[i].p;
    w.position.set(p[0] * 1.012, p[1] * 1.012, p[2] * 1.012);
    w.lookAt(p[0] * 3, p[1] * 3, p[2] * 3);
    w.userData.life = 1;
    w.visible = true;
  }

  let C = {};
  function setTheme(t) {
    th = t;
    C = { line: t.line.clone(), hot: t.hot.clone(), node: t.node.clone(), danger: t.danger.clone(), cool: t.cool.clone(), tmp: new Color() };
    coreMat.uniforms.uCore.value.copy(t.core);
    coreMat.uniforms.uRim.value.copy(t.cool);
    coreMat.uniforms.uRimK.value = t.light ? 0.12 : 0.22;
    [dustMat, nodeMat, pkMat, lineMat].forEach((m) => setGlowBlend(m, t.light));
    ringMat.color.copy(t.danger);
    waves.forEach((w) => { w.material.color.copy(t.danger); w.material.blending = t.light ? NormalBlending : AdditiveBlending; w.material.needsUpdate = true; });
    for (let i = 0; i < DUST; i++) putColor(dustCol, i, t.line, t.light ? 0.5 : 0.42);
    dustGeo.attributes.aColor.needsUpdate = true;
  }
  setTheme(th);

  const tip = document.getElementById('globe-tip');
  let hoverIdx = -1;
  const wv = new Vector3();
  function project(i, out) {
    const nd = sim.nodes[i];
    wv.set(nd.p[0] * nd.alt, nd.p[1] * nd.alt, nd.p[2] * nd.alt).applyMatrix4(root.matrixWorld);
    const facing = wv.clone().normalize().dot(camera.position.clone().sub(wv).normalize());
    wv.project(camera);
    out.x = wv.x; out.y = wv.y; out.f = facing;
    return out;
  }
  function pick(x, y, radiusPx) {
    const { cssW, cssH } = ctx.size();
    if (!cssW) return -1;
    const ndc = toNdc(x, y, ctx.canvas);
    const o = {};
    let best = -1, bestD = radiusPx * radiusPx;
    for (let i = 0; i < sim.N; i++) {
      if (sim.nodes[i].health < 0.5) continue;
      project(i, o);
      if (o.f < 0.12) continue;
      const dx = (o.x - ndc.x) * cssW / 2, dy = (o.y - ndc.y) * cssH / 2;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function kill(i) {
    if (i < 0 || !sim.killNode(i)) return;
    wave(i);
    sfxKill();
    ctx.invalidate();
  }
  function showTip(i) {
    if (!tip) return;
    if (i < 0) { tip.hidden = true; return; }
    const o = project(i, {});
    const { cssW, cssH } = ctx.size();
    const stageR = ctx.stage.getBoundingClientRect(), canR = ctx.canvas.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = ((o.x + 1) / 2 * cssW + canR.left - stageR.left) + 'px';
    tip.style.top = ((1 - o.y) / 2 * cssH + canR.top - stageR.top) + 'px';
    const nd = sim.nodes[i];
    tip.textContent = '';
    const b = document.createElement('b');
    b.textContent = ctx.t('tip.node') + ' ' + String(i).padStart(3, '0');
    tip.append(b, document.createTextNode(` · ${nd.deg} ${ctx.t('tip.paths')} · ${ctx.t('tip.kill')}`));
  }

  const ctl = orbit(ctx, root, {
    auto: 0.07, yaw: -0.6, pitch: 0.22, minPitch: -0.9, maxPitch: 0.9, pitchHome: 0.22, tilt: 0.1,
    onTap: (x, y) => {
      if (reduced) return;
      const i = pick(x, y, 34);
      if (i >= 0) kill(i);
    },
    onHold: () => { if (!reduced) { sim.stormNow(); sfxStorm(); } },
    onHover: (x, y) => {
      if (reduced) return;
      hoverIdx = pick(x, y, 18);
      ctx.canvas.classList.toggle('probe', hoverIdx >= 0);
      showTip(hoverIdx);
    },
    onLeave: () => { hoverIdx = -1; ctx.canvas.classList.remove('probe'); showTip(-1); },
    onKey: () => {
      if (reduced) return;
      const cands = [];
      const o = {};
      for (let i = 0; i < sim.N; i++) if (sim.nodes[i].health > 0.5 && project(i, o).f > 0.4) cands.push(i);
      if (cands.length) kill(cands[(Math.random() * cands.length) | 0]);
    },
  });

  const pa = [0, 0, 0], pb = [0, 0, 0];
  function update(dt) {
    ctl.update(dt);
    if (!reduced) sim.step(dt * 1000);
    hud(dt || 0.3);
    const intro = sim.intro;
    const e3 = 1 - Math.pow(1 - intro, 3);
    root.scale.setScalar(0.86 + 0.14 * e3);
    camera.position.z = 5.4 * ctl.zoom;
    camera.lookAt(0, 0, 0);
    [dustMat, nodeMat, pkMat, lineMat].forEach((m) => { m.uniforms.uFade.value = e3; });
    root.updateMatrixWorld();

    // дуги: тепло трафика -> янтарь, мёртвые красноватые и тусклые
    const baseA = th.light ? 0.3 : 0.4;
    for (let e = 0; e < sim.edges.length; e++) {
      const ed = sim.edges[e];
      const h = Math.min(sim.nodes[ed.a].health, sim.nodes[ed.b].health);
      const heat = sim.heat[e];
      const c = C.tmp.copy(C.line).lerp(C.hot, Math.min(1, heat * 0.95));
      if (h < 0.6) c.lerp(C.danger, (0.6 - h) * 0.9);
      const a = baseA * (0.2 + 0.8 * h) + heat * (th.light ? 0.45 : 0.55) * h;
      for (let s = 0; s < SEG * 2; s++) putColor(lineCol, e * SEG * 2 + s, c, a);
    }
    lineGeo.attributes.aColor.needsUpdate = true;

    for (let i = 0; i < sim.N; i++) {
      const nd = sim.nodes[i];
      const hov = i === hoverIdx;
      const boot = Math.min(1, Math.max(0, (intro - nd.boot * 0.7) / 0.3));
      const c = hov ? C.hot : nd.health < 0.5 ? C.tmp.copy(C.node).lerp(C.danger, 0.8) : C.node;
      nodeSize[i] = (hov ? 0.075 : 0.03 + (nd.deg - 2) * 0.004) * (0.4 + 0.6 * boot);
      putColor(nodeCol, i, c, (hov ? 1 : 0.35 + 0.6 * nd.health) * boot);
    }
    nodeGeo.attributes.aSize.needsUpdate = true;
    nodeGeo.attributes.aColor.needsUpdate = true;

    let pv = 0;
    for (let i = 0; i < sim.packets.length; i++) {
      const p = sim.packets[i], ed = sim.edges[p.e];
      const a = sim.nodes[ed.a].p, b = sim.nodes[ed.b].p;
      for (let s = 3; s >= 0; s--) {
        const tt = Math.min(1, Math.max(0, p.t - p.dir * s * 0.05));
        arcPoint(a, b, tt, ed.lift, pa);
        pkPos[pv * 3] = pa[0]; pkPos[pv * 3 + 1] = pa[1]; pkPos[pv * 3 + 2] = pa[2];
        pkSize[pv] = s === 0 ? 0.05 : 0.03 - s * 0.004;
        putColor(pkCol, pv, C.hot, s === 0 ? 1 : 0.5 - s * 0.12);
        pv++;
      }
    }
    for (let i = 0; i < sim.debris.length && pv < P; i++) {
      const d = sim.debris[i];
      pkPos[pv * 3] = d.p[0]; pkPos[pv * 3 + 1] = d.p[1]; pkPos[pv * 3 + 2] = d.p[2];
      pkSize[pv] = 0.022 * d.size;
      putColor(pkCol, pv, d.spark ? C.hot : C.danger, d.life * 0.95);
      pv++;
    }
    pkGeo.setDrawRange(0, pv);
    pkGeo.attributes.position.needsUpdate = true;
    pkGeo.attributes.aSize.needsUpdate = true;
    pkGeo.attributes.aColor.needsUpdate = true;

    // зона отказа: кольцо вспыхивает и гаснет вместе с каскадом
    const f = sim.fail;
    if (f.active && ringFor !== f.t0) { buildRing(); ringFor = f.t0; }
    const tgt = f.active ? 0.85 * Math.min(1, (sim.time - f.t0) / 300) * (0.75 + 0.25 * Math.sin(sim.time * 0.012)) : 0;
    ringMat.opacity = reduced ? tgt : damp(ringMat.opacity, tgt, 8, dt);
    failRing.visible = ringMat.opacity > 0.01;

    waves.forEach((w) => {
      if (w.userData.life <= 0) { w.visible = false; return; }
      w.userData.life -= dt / 0.9;
      const k = 1 - Math.max(0, w.userData.life);
      w.scale.setScalar(0.02 + k * 0.28);
      w.material.opacity = Math.max(0, w.userData.life) * 0.9;
    });

    if (hoverIdx >= 0 && tip && !tip.hidden) showTip(hoverIdx);
  }

  function resize(w, h) {
    const scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    [dustMat, nodeMat, pkMat].forEach((m) => { m.uniforms.uScale.value = scale; });
  }

  update(0);
  return { scene, camera, update, resize, setTheme, dprCap: 1.5 };
}
