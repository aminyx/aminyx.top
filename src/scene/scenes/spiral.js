import * as THREE from 'three';
import { orbit, hudChip, fitDistance, studioLights, damp, pointsMaterial, putColor, setGlowBlend } from '../kit.js';
import { sfxHeal } from '../sfx.js';

const DAYS = 270, EXAMS = 6, PROJECTS = 10;
const R = 1.3, TURNS = 4.2, Y0 = -1.35, Y1 = 1.25;

function helixPoint(d, r, out) {
  const t = d / (DAYS - 1);
  const a = t * TURNS * Math.PI * 2;
  out.set(Math.cos(a) * r, Y0 + (Y1 - Y0) * t, Math.sin(a) * r);
  return a;
}

export function create(ctx) {
  const { reduced } = ctx;
  let th = ctx.theme;
  const scene = new THREE.Scene();
  scene.environment = ctx.env();
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 60);
  studioLights(scene, THREE);
  const root = new THREE.Group();
  scene.add(root);

  const isExam = (d) => (d + 1) % (DAYS / EXAMS) === 0;

  // ступени-дни
  const stepMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25, envMapIntensity: 0.8 });
  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), stepMat, DAYS);
  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3();
  for (let d = 0; d < DAYS; d++) {
    const a = helixPoint(d, R, p);
    dummy.position.copy(p);
    dummy.rotation.set(0, -a, 0);
    const s = isExam(d) ? 1.9 : 1;
    dummy.scale.set(s, isExam(d) ? 2.4 : 1, s);
    dummy.updateMatrix();
    steps.setMatrixAt(d, dummy.matrix);
    steps.setColorAt(d, new THREE.Color('#ffffff'));
  }
  root.add(steps);

  // центральная ось и направляющая спирали
  const guideMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
  const gpts = [];
  for (let d = 0; d < DAYS; d += 2) { helixPoint(d, R * 0.82, p); gpts.push(p.clone()); }
  const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(gpts), guideMat);
  const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, Y0 - 0.2, 0), new THREE.Vector3(0, Y1 + 0.55, 0)]), guideMat);
  root.add(guide, axis);

  // портфолио-проекты
  const crystalMat = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.4, flatShading: true, toneMapped: false });
  const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.075), crystalMat, PROJECTS);
  const crystalDay = [];
  for (let i = 0; i < PROJECTS; i++) crystalDay.push(Math.round(((i + 0.5) / PROJECTS) * (DAYS - 1)));
  root.add(crystals);

  // флаг CTF на вершине оси
  const flagGroup = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8), poleMat);
  pole.position.y = 0.31;
  const flagGeo = new THREE.PlaneGeometry(0.42, 0.26, 12, 4);
  flagGeo.translate(0.21, 0, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, toneMapped: false });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.012, 0.48, 0);
  flagGroup.add(pole, flag);
  flagGroup.position.y = Y1 + 0.02;
  root.add(flagGroup);

  // огонёк прогресса + искры на финише
  const SP = 90;
  const spPos = new Float32Array(SP * 3), spSize = new Float32Array(SP), spCol = new Float32Array(SP * 4);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aSize', new THREE.BufferAttribute(spSize, 1));
  spGeo.setAttribute('aColor', new THREE.BufferAttribute(spCol, 4));
  const spMat = pointsMaterial({ light: th.light, soft: 0.85 });
  const sparks = new THREE.Points(spGeo, spMat);
  sparks.frustumCulled = false;
  root.add(sparks);
  const confetti = [];

  const st = { day: reduced ? 170 : 0, target: null, won: false, hold: 0 };
  const chips = ctx.hud ? { day: hudChip(ctx.hud), exam: hudChip(ctx.hud), flag: hudChip(ctx.hud) } : null;
  function renderHud() {
    if (!chips) return;
    const d = Math.min(DAYS, Math.floor(st.day) + 1);
    chips.day.set(ctx.t('hud.day'), d + '/' + DAYS, 'ok');
    chips.exam.set(ctx.t('hud.exam'), Math.min(EXAMS, Math.floor(d / (DAYS / EXAMS))) + '/' + EXAMS, 'hot');
    chips.flag.show(st.won);
    chips.flag.set(ctx.t('hud.done'), 'SHA-256 ✓', 'hot');
  }

  function nextExam() {
    const per = DAYS / EXAMS;
    const k = Math.min(EXAMS, Math.floor((st.day + 1) / per) + 1);
    st.target = Math.min(DAYS - 1, k * per - 1);
    ctx.invalidate();
  }
  const ctl = orbit(ctx, root, { yaw: 0.4, pitch: 0.18, minPitch: -0.3, maxPitch: 0.7, pitchHome: 0.18, auto: 0.16, tilt: 0.06, onTap: nextExam, onKey: nextExam });

  const cOff = new THREE.Color(), cOn = new THREE.Color(), tmpC = new THREE.Color();
  function setTheme(t) {
    th = t;
    stepMat.color.set('#ffffff');
    guideMat.color.copy(t.line);
    crystalMat.color.copy(t.cool); crystalMat.emissive.copy(t.cool); crystalMat.emissiveIntensity = 0.45;
    poleMat.color.copy(t.body);
    flagMat.color.copy(t.hot); flagMat.emissive.copy(t.hot); flagMat.emissiveIntensity = 0.35;
    cOff.copy(t.body).lerp(t.line, 0.35);
    cOn.copy(t.cool);
    setGlowBlend(spMat, t.light);
    lastLit = -1;
  }
  let lastLit = -1;
  setTheme(th);

  function update(dt, time) {
    ctl.update(dt);
    camera.position.set(0, 0.35, 1).normalize().multiplyScalar(fitDistance(camera, 1.8, 2.05) * ctl.zoom);
    camera.lookAt(0, 0.12, 0);

    if (st.target != null && reduced) {
      st.day = st.target;
      st.target = null;
    } else if (st.target != null) {
      st.day = damp(st.day, st.target, 3.2, dt || 1);
      if (Math.abs(st.day - st.target) < 0.5) { st.day = st.target; st.target = null; }
    } else if (!reduced) {
      if (st.won) {
        st.hold += dt;
        if (st.hold > 3.2) { st.won = false; st.hold = 0; st.day = 0; lastLit = -1; }
      } else {
        st.day += dt * 16;
      }
    }
    if (!st.won && st.day >= DAYS - 1) {
      st.day = DAYS - 1;
      st.won = true;
      st.target = null;
      sfxHeal();
      for (let i = 0; i < 60; i++) {
        confetti.push({ p: new THREE.Vector3(0.2, Y1 + 0.5, 0), v: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.8, (Math.random() - 0.5) * 2), life: 1, hot: Math.random() < 0.6 });
      }
    }

    // подсветка пройденных ступеней: холодный -> янтарь к вершине
    const lit = Math.floor(st.day);
    if (lit !== lastLit) {
      for (let d = 0; d < DAYS; d++) {
        if (d <= lit) tmpC.copy(cOn).lerp(th.hot, isExam(d) ? 1 : (d / DAYS) * 0.55);
        else tmpC.copy(isExam(d) ? th.hot : cOff).multiplyScalar(isExam(d) ? 0.55 : 1);
        steps.setColorAt(d, tmpC);
      }
      steps.instanceColor.needsUpdate = true;
      lastLit = lit;
    }
    for (let i = 0; i < PROJECTS; i++) {
      helixPoint(crystalDay[i], R + 0.32, p);
      dummy.position.copy(p);
      dummy.position.y += Math.sin(time * 1.6 + i) * 0.04;
      dummy.rotation.set(0, time * 1.2 + i, 0.3);
      dummy.scale.setScalar(crystalDay[i] <= lit ? 1.25 : 0.8);
      dummy.updateMatrix();
      crystals.setMatrixAt(i, dummy.matrix);
    }
    crystals.instanceMatrix.needsUpdate = true;

    const pos = flagGeo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = flagBase[i];
      pos[i + 2] = Math.sin(x * 9 - time * 5) * 0.03 * (x / 0.42);
    }
    flagGeo.attributes.position.needsUpdate = true;
    flagGeo.computeVertexNormals();
    flag.scale.setScalar(st.won ? 1.25 : 1);

    let sv = 0;
    const head = new THREE.Vector3();
    helixPoint(Math.min(DAYS - 1, st.day), R, head);
    spPos[0] = head.x; spPos[1] = head.y + 0.06; spPos[2] = head.z;
    spSize[0] = 0.16; putColor(spCol, 0, th.hot, 1);
    sv = 1;
    for (let k = confetti.length - 1; k >= 0; k--) {
      const c = confetti[k];
      c.life -= dt * 0.6;
      if (c.life <= 0) { confetti.splice(k, 1); continue; }
      c.v.y -= 1.6 * dt;
      c.p.addScaledVector(c.v, dt);
    }
    for (const c of confetti) {
      if (sv >= SP) break;
      spPos[sv * 3] = c.p.x; spPos[sv * 3 + 1] = c.p.y; spPos[sv * 3 + 2] = c.p.z;
      spSize[sv] = 0.045;
      putColor(spCol, sv, c.hot ? th.hot : th.cool, c.life);
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
  update(0, 0);
  return { scene, camera, update, resize, setTheme, setLang: renderHud };
}
