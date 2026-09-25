// Username Hunter: генератор (~13 тыс./с на дев-машине), офлайн-скоринг отсекает 99 %, остаток проверяем через MTProto. по клику поток ненадолго ускоряется вчетверо
import * as THREE from 'three';
import { orbit, hudChip, fitDistance, studioLights, pointsMaterial, putColor, setGlowBlend, fresnelMaterial } from '../kit.js';

const TOP = 1.35, MID = 0.1, NECK = -0.55, BOTTOM = -1.0;
const MAX = 1500;

// профиль воронки: радиус от высоты
function radiusAt(y) {
  if (y >= MID) return 0.34 + (1.5 - 0.34) * Math.pow((y - MID) / (TOP - MID), 1.35);
  if (y >= NECK) return 0.16 + (0.34 - 0.16) * ((y - NECK) / (MID - NECK));
  return 0.16;
}

export function create(ctx) {
  const { reduced } = ctx;
  let th = ctx.theme;
  const scene = new THREE.Scene();
  scene.environment = ctx.env();
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 60);
  studioLights(scene, THREE);
  const root = new THREE.Group();
  scene.add(root);

  // каркас воронки: кольца + образующие
  const pts = [];
  const RINGS = 9, RAYS = 20, SEGR = 64;
  for (let r = 0; r < RINGS; r++) {
    const y = BOTTOM + ((TOP - BOTTOM) * r) / (RINGS - 1);
    const rad = radiusAt(y);
    for (let s = 0; s < SEGR; s++) {
      const a0 = (s / SEGR) * Math.PI * 2, a1 = ((s + 1) / SEGR) * Math.PI * 2;
      pts.push(Math.cos(a0) * rad, y, Math.sin(a0) * rad, Math.cos(a1) * rad, y, Math.sin(a1) * rad);
    }
  }
  for (let k = 0; k < RAYS; k++) {
    const a = (k / RAYS) * Math.PI * 2;
    for (let i = 0; i < 24; i++) {
      const y0 = BOTTOM + ((TOP - BOTTOM) * i) / 24, y1 = BOTTOM + ((TOP - BOTTOM) * (i + 1)) / 24;
      pts.push(Math.cos(a) * radiusAt(y0), y0, Math.sin(a) * radiusAt(y0), Math.cos(a) * radiusAt(y1), y1, Math.sin(a) * radiusAt(y1));
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const wireMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false });
  root.add(new THREE.LineSegments(wireGeo, wireMat));

  // стеклянная оболочка
  const profile = [];
  for (let i = 0; i <= 40; i++) {
    const y = BOTTOM + ((TOP - BOTTOM) * i) / 40;
    profile.push(new THREE.Vector2(radiusAt(y), y));
  }
  const shellMat = fresnelMaterial({ power: 2.0, intensity: 0.45, base: 0.02, light: th.light, side: THREE.DoubleSide });
  root.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 64), shellMat));

  // кольцо скоринга на середине и кольцо MTProto под горлышком
  const gateMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, toneMapped: false });
  const gate = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(MID) + 0.02, 0.012, 8, 96), gateMat);
  gate.rotation.x = Math.PI / 2;
  gate.position.y = MID;
  const mtMat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.3, toneMapped: false });
  const mt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 16, 96), mtMat);
  mt.rotation.x = Math.PI / 2;
  mt.position.y = BOTTOM - 0.38;
  root.add(gate, mt);

  // частицы-кандидаты
  const pos = new Float32Array(MAX * 3), size = new Float32Array(MAX), col = new Float32Array(MAX * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  const pMat = pointsMaterial({ light: th.light, soft: 0.7 });
  const points = new THREE.Points(geo, pMat);
  points.frustumCulled = false;
  root.add(points);

  const parts = [];
  const st = { rate: 150, burst: 0, passed: 0, free: 0 };
  function spawn() {
    const best = Math.random() < 0.01;
    parts.push({ y: TOP + 0.05, a: Math.random() * Math.PI * 2, w: 0.6 + Math.random() * 0.6, best, fade: 1, stage: 0, out: null, free: Math.random() < 0.35 });
  }

  const chips = ctx.hud ? { top: hudChip(ctx.hud), free: hudChip(ctx.hud) } : null;
  function renderHud() {
    if (!chips) return;
    chips.top.set(ctx.t('hud.top'), st.passed, 'hot');
    chips.free.set(ctx.t('hud.free'), st.free, 'ok');
  }
  const burst = () => { st.burst = 1.2; ctx.invalidate(); };
  const ctl = orbit(ctx, root, { yaw: 0.2, pitch: 0.42, minPitch: 0.1, maxPitch: 0.9, pitchHome: 0.42, auto: 0.12, tilt: 0.05, onTap: burst, onKey: burst });

  function setTheme(t) {
    th = t;
    wireMat.color.copy(t.line);
    shellMat.uniforms.uColor.value.copy(t.cool);
    setGlowBlend(shellMat, t.light);
    setGlowBlend(pMat, t.light);
    gateMat.color.copy(t.hot);
    mtMat.color.copy(t.body); mtMat.emissive.copy(t.cool); mtMat.emissiveIntensity = t.light ? 0.1 : 0.3;
  }
  setTheme(th);

  let acc = 0;
  const outV = new THREE.Vector3();
  function update(dt) {
    ctl.update(dt);
    camera.position.set(0, 0.25, 1).normalize().multiplyScalar(fitDistance(camera, 1.95, 1.95) * ctl.zoom);
    camera.lookAt(0, 0.1, 0);

    if (!reduced) {
      st.burst = Math.max(0, st.burst - dt);
      acc += dt * st.rate * (st.burst > 0 ? 4 : 1);
      while (acc >= 1 && parts.length < MAX) { spawn(); acc -= 1; }
      if (acc >= 1) acc = 0;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.stage === 0) {
        const r = radiusAt(p.y);
        p.y -= dt * (0.35 + 0.5 / (r + 0.3));
        p.a += dt * p.w * (1.2 / (r + 0.15));
        if (p.y < MID) {
          if (!p.best) { p.fade -= dt * 3.5; if (p.fade <= 0) { parts.splice(i, 1); continue; } }
          if (p.y < NECK) { p.stage = 1; }
        }
      } else if (p.stage === 1) {
        p.y -= dt * 0.9;
        p.a += dt * 3;
        if (p.y < BOTTOM - 0.38) {
          p.stage = 2;
          st.passed++;
          const ang = Math.random() * Math.PI * 2;
          p.out = new THREE.Vector3(Math.cos(ang) * 0.5, BOTTOM - 0.38, Math.sin(ang) * 0.5);
          p.v = new THREE.Vector3(Math.cos(ang) * 0.7, p.free ? 0.9 : -0.2, Math.sin(ang) * 0.7);
          if (p.free) st.free++;
        }
      } else {
        p.v.y -= dt * (p.free ? 0.2 : 1.5);
        p.out.addScaledVector(p.v, dt);
        p.fade -= dt * 0.6;
        if (p.fade <= 0) { parts.splice(i, 1); continue; }
      }
    }
    let n = 0;
    for (const p of parts) {
      if (p.stage === 2) outV.copy(p.out);
      else {
        const r = radiusAt(p.y) * (p.stage === 0 ? 0.92 : 0.5);
        outV.set(Math.cos(p.a) * r, p.y, Math.sin(p.a) * r);
      }
      pos[n * 3] = outV.x; pos[n * 3 + 1] = outV.y; pos[n * 3 + 2] = outV.z;
      const c = p.stage === 2 ? (p.free ? th.ok : th.line) : p.best && p.y < MID + 0.3 ? th.hot : th.cool;
      size[n] = p.best ? 0.07 : 0.035;
      putColor(col, n, c, (p.best ? 1 : 0.65) * Math.max(0, p.fade));
      n++;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    mt.rotation.z += dt * 0.6;
    renderHud();
  }
  function resize(w, h) {
    pMat.uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  if (reduced) {
    // статичный кадр: поток заранее прогнан симуляцией
    for (let k = 0; k < 400; k++) {
      acc += 0.033 * st.rate;
      while (acc >= 1 && parts.length < MAX) { spawn(); acc -= 1; }
      update(0.033);
    }
  }
  update(0, 0);
  return { scene, camera, update, resize, setTheme, setLang: renderHud };
}
