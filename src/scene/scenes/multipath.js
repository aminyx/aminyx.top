// Aminyx Link: 4 транспорта (TCP, QUIC, HTTP/3, UDP), каждый 5-й пакет FEC-чётность, клик рвёт путь
import * as THREE from 'three';
import { orbit, hudChip, textSprite, fitDistance, studioLights, damp, pointsMaterial, putColor, setGlowBlend } from '../kit.js';
import { sfxKill, sfxHeal } from '../sfx.js';

const NAMES = ['TCP', 'QUIC', 'HTTP/3', 'UDP'];
const CTRL = [
  [new THREE.Vector3(-0.9, 1.5, 0.1), new THREE.Vector3(0.9, 1.45, 0.1)],
  [new THREE.Vector3(-0.9, 0.5, 1.2), new THREE.Vector3(0.9, 0.5, 1.15)],
  [new THREE.Vector3(-0.9, -0.5, -1.15), new THREE.Vector3(0.9, -0.55, -1.2)],
  [new THREE.Vector3(-0.9, -1.45, 0.2), new THREE.Vector3(0.9, -1.4, 0.15)],
];
const MAXP = 90;

export function create(ctx) {
  const { reduced } = ctx;
  let th = ctx.theme;
  const scene = new THREE.Scene();
  scene.environment = ctx.env();
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 60);
  studioLights(scene, THREE);
  const root = new THREE.Group();
  scene.add(root);

  const A = new THREE.Vector3(-2.5, 0, 0), B = new THREE.Vector3(2.5, 0, 0);

  // конечные точки: икосаэдры с рёбрами и светящимся ядром
  const endMat = new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.35, flatShading: true, envMapIntensity: 0.8 });
  const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 });
  const ends = [A, B].map((p) => {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.34, 0);
    g.add(new THREE.Mesh(geo, endMat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
    g.position.copy(p);
    root.add(g);
    return g;
  });

  // кольцо гибридного обмена ключами X25519 + ML-KEM-768
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.008, 8, 96), ringMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.005, 8, 96), ringMat);
  ring.position.copy(A); ring2.position.copy(A);
  root.add(ring, ring2);
  const keyMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const keys = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), keyMat); root.add(m); return m; });

  // пути: тонкая светящаяся трубка + невидимая толстая для клика
  const paths = CTRL.map((c, i) => {
    const curve = new THREE.CubicBezierCurve3(A.clone().add(new THREE.Vector3(0.3, 0, 0)), c[0], c[1], B.clone().add(new THREE.Vector3(-0.3, 0, 0)));
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.016, 6), mat);
    const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.2, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.path = i;
    const label = textSprite(NAMES[i], { size: 0.2 });
    label.position.copy(curve.getPointAt(0.5)).add(new THREE.Vector3(0, 0.2, 0));
    root.add(tube, hit, label);
    return { curve, mat, tube, hit, label, cut: 0, speed: [0.34, 0.46, 0.42, 0.52][i], cutFlash: 0 };
  });

  // пакеты: данные (холодные кубы) и FEC-чётность (янтарные октаэдры)
  const dataMat = new THREE.MeshStandardMaterial({ roughness: 0.3, toneMapped: false });
  const fecMat = new THREE.MeshStandardMaterial({ roughness: 0.3, toneMapped: false });
  const dataMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), dataMat, MAXP);
  const fecMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.065), fecMat, MAXP);
  dataMesh.frustumCulled = fecMesh.frustumCulled = false;
  root.add(dataMesh, fecMesh);
  const packets = [];

  // искры гибнущих пакетов
  const SPK = 120;
  const spPos = new Float32Array(SPK * 3), spSize = new Float32Array(SPK), spCol = new Float32Array(SPK * 4);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aSize', new THREE.BufferAttribute(spSize, 1));
  spGeo.setAttribute('aColor', new THREE.BufferAttribute(spCol, 4));
  const spMat = pointsMaterial({ light: th.light, soft: 0.8 });
  const sparks = new THREE.Points(spGeo, spMat);
  sparks.frustumCulled = false;
  root.add(sparks);
  const sparkList = [];

  const st = { seq: 0, spawn: 0, rr: 0, fec: 0, retx: 0, autoCut: 5, lastCut: -1 };
  const chips = ctx.hud ? { paths: hudChip(ctx.hud), fec: hudChip(ctx.hud), retx: hudChip(ctx.hud) } : null;
  function renderHud() {
    if (!chips) return;
    const alive = paths.filter((p) => p.cut <= 0).length;
    chips.paths.set(ctx.t('hud.paths'), alive + '/4', alive === 4 ? 'ok' : 'bad');
    chips.fec.set(ctx.t('hud.fec'), st.fec, st.fec ? 'hot' : '');
    chips.retx.set(ctx.t('hud.retx'), st.retx, 'ok');
  }

  function cut(i, dur) {
    const p = paths[i];
    if (!p || p.cut > 0) return;
    // последний живой путь не рвём
    if (paths.filter((q) => q.cut <= 0).length <= 1) return;
    p.cut = dur || 4.5;
    p.cutFlash = 1;
    st.lastCut = i;
    for (let k = packets.length - 1; k >= 0; k--) {
      const pk = packets[k];
      if (pk.path !== i) continue;
      burst(p.curve.getPointAt(Math.min(pk.u, 1)), pk.fec);
      packets.splice(k, 1);
      // потерю данных закрывает чётность своей группы, без ретрансляции
      if (!pk.fec) st.fec++;
    }
    sfxKill();
    ctx.invalidate();
  }
  function burst(at, hot) {
    if (reduced) return;
    for (let n = 0; n < 8 && sparkList.length < SPK; n++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(1.6);
      sparkList.push({ p: at.clone(), v, life: 1, hot });
    }
  }

  const ray = new THREE.Raycaster();
  const hits = paths.map((p) => p.hit);
  function pickPath(x, y) {
    const r = ctx.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), camera);
    const h = ray.intersectObjects(hits, false)[0];
    return h ? h.object.userData.path : -1;
  }

  const ctl = orbit(ctx, root, {
    yaw: -0.3, pitch: 0.38, minYaw: -0.9, maxYaw: 0.6, minPitch: -0.4, maxPitch: 0.8, pitchHome: 0.38, tilt: 0.06,
    onTap: (x, y) => {
      const i = pickPath(x, y);
      if (i >= 0) { if (paths[i].cut > 0) { paths[i].cut = 0; sfxHeal(); } else cut(i, 6); }
    },
    onHover: (x, y) => { ctx.canvas.classList.toggle('pick', pickPath(x, y) >= 0); },
    onLeave: () => ctx.canvas.classList.remove('pick'),
    onKey: () => {
      const alive = paths.map((p, i) => (p.cut <= 0 ? i : -1)).filter((i) => i >= 0);
      cut(alive[(Math.random() * alive.length) | 0], 5);
    },
  });

  function setTheme(t) {
    th = t;
    endMat.color.copy(t.body);
    endMat.emissive.copy(t.cool); endMat.emissiveIntensity = t.light ? 0.08 : 0.18;
    edgeMat.color.copy(t.cool);
    ringMat.color.copy(t.hot);
    keyMat.color.copy(t.hot);
    dataMat.color.copy(t.cool); dataMat.emissive.copy(t.cool); dataMat.emissiveIntensity = 0.5;
    fecMat.color.copy(t.hot); fecMat.emissive.copy(t.hot); fecMat.emissiveIntensity = 0.6;
    paths.forEach((p, i) => p.label.userData.set(NAMES[i], t.text3Css));
    setGlowBlend(spMat, t.light);
  }
  setTheme(th);

  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const cutCol = new THREE.Color();
  function update(dt, time) {
    ctl.update(dt);
    camera.position.set(0, 0.45, 1).normalize().multiplyScalar(fitDistance(camera, 3.05, 1.75) * ctl.zoom);
    camera.lookAt(0, 0, 0);

    ends.forEach((g, i) => { g.rotation.y += dt * (i ? -0.4 : 0.4); g.rotation.x += dt * 0.15; });
    ring.rotation.set(Math.PI / 2 + Math.sin(time * 0.6) * 0.3, time * 0.8, 0);
    ring2.rotation.set(Math.PI / 2.4, -time * 0.5, Math.cos(time * 0.4) * 0.3);
    keys.forEach((k, i) => {
      const a = time * (i ? -1.3 : 1.1) + i * Math.PI;
      k.position.set(A.x + Math.cos(a) * 0.67, A.y + Math.sin(a) * 0.67 * Math.cos(time * 0.3), A.z + Math.sin(a) * 0.3);
    });

    // авто-обрыв для демонстрации
    st.autoCut -= dt;
    if (st.autoCut <= 0 && !reduced) {
      st.autoCut = 6 + Math.random() * 3;
      let i = (Math.random() * 4) | 0;
      if (i === st.lastCut) i = (i + 1) % 4;
      cut(i, 3.4);
    }
    paths.forEach((p) => {
      if (p.cut > 0) { p.cut -= dt; if (p.cut <= 0) sfxHeal(); }
      p.cutFlash = damp(p.cutFlash, 0, 3, dt || 1);
      const dead = p.cut > 0;
      cutCol.copy(dead ? th.danger : th.cool).lerp(th.hot, p.cutFlash * 0.4);
      p.mat.color.copy(cutCol);
      p.mat.opacity = dead ? 0.22 + 0.2 * Math.abs(Math.sin(time * 5)) : 0.75;
    });

    // планировщик: round-robin по живым путям, каждый пятый пакет FEC-чётность
    st.spawn -= dt;
    if (st.spawn <= 0 && !reduced && packets.length < MAXP) {
      st.spawn = 0.09;
      const alive = paths.map((p, i) => (p.cut <= 0 ? i : -1)).filter((i) => i >= 0);
      if (alive.length) {
        const path = alive[st.rr++ % alive.length];
        packets.push({ path, u: 0, fec: st.seq++ % 5 === 4, spin: Math.random() * 6 });
      }
    }
    let nd = 0, nf = 0;
    for (let k = packets.length - 1; k >= 0; k--) {
      const pk = packets[k];
      pk.u += paths[pk.path].speed * dt;
      pk.spin += dt * 2;
      if (pk.u >= 1) { packets.splice(k, 1); continue; }
    }
    for (const pk of packets) {
      paths[pk.path].curve.getPointAt(pk.u, tmp);
      dummy.position.copy(tmp);
      dummy.rotation.set(pk.spin, pk.spin * 0.6, 0);
      dummy.scale.setScalar(Math.min(1, pk.u * 14, (1 - pk.u) * 14));
      dummy.updateMatrix();
      if (pk.fec) fecMesh.setMatrixAt(nf++, dummy.matrix); else dataMesh.setMatrixAt(nd++, dummy.matrix);
    }
    dataMesh.count = nd; fecMesh.count = nf;
    dataMesh.instanceMatrix.needsUpdate = true;
    fecMesh.instanceMatrix.needsUpdate = true;

    let sv = 0;
    for (let k = sparkList.length - 1; k >= 0; k--) {
      const s = sparkList[k];
      s.life -= dt * 1.4;
      if (s.life <= 0) { sparkList.splice(k, 1); continue; }
      s.v.multiplyScalar(Math.exp(-2 * dt));
      s.p.addScaledVector(s.v, dt);
    }
    for (const s of sparkList) {
      spPos[sv * 3] = s.p.x; spPos[sv * 3 + 1] = s.p.y; spPos[sv * 3 + 2] = s.p.z;
      spSize[sv] = 0.05;
      putColor(spCol, sv, s.hot ? th.hot : th.danger, s.life);
      sv++;
    }
    spGeo.setDrawRange(0, sv);
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.aSize.needsUpdate = true;
    spGeo.attributes.aColor.needsUpdate = true;
    renderHud();
  }
  function resize(w, h) {
    spMat.uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  if (reduced) {
    paths[2].cut = 1;
    st.fec = 3;
    for (let i = 0; i < 24; i++) {
      const path = [0, 1, 3][i % 3];
      packets.push({ path, u: 0.04 + (i / 24) * 0.92, fec: i % 5 === 4, spin: i });
    }
    paths.forEach((p) => { p.speed = 0; });
  }
  update(0, 0);
  return { scene, camera, update, resize, setTheme, setLang: renderHud };
}
