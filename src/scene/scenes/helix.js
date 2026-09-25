// maryam.best: окно со скриншотом + ДНК, клик раскручивает спираль
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { orbit, fitDistance, studioLights, damp } from '../kit.js';

const PAIRS = 26;

export function create(ctx) {
  const { reduced } = ctx;
  let th = ctx.theme;
  const scene = new THREE.Scene();
  scene.environment = ctx.env();
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 60);
  studioLights(scene, THREE);
  const root = new THREE.Group();
  scene.add(root);

  const win = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.35, envMapIntensity: 0.8 });
  const frame = new THREE.Mesh(new RoundedBoxGeometry(3.2, 2.12, 0.08, 4, 0.06), frameMat);
  win.add(frame);
  const barMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.08, 0.2), barMat);
  bar.position.set(0, 0.93, 0.041);
  win.add(bar);
  const dotGeo = new THREE.CircleGeometry(0.028, 20);
  ['#ff6b6b', '#e8ac3f', '#5fd0a0'].forEach((c, i) => {
    const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    d.position.set(-1.43 + i * 0.09, 0.93, 0.043);
    win.add(d);
  });
  const urlMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
  const url = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.1), urlMat);
  url.position.set(0, 0.93, 0.043);
  win.add(url);
  const shotMat = new THREE.MeshBasicMaterial({ toneMapped: false, color: 0x222222 });
  const shot = new THREE.Mesh(new THREE.PlaneGeometry(3.08, 3.08 / (1200 / 684)), shotMat);
  shot.position.set(0, -0.09, 0.042);
  win.add(shot);
  new THREE.TextureLoader().load('/assets/img/maryam.webp', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    shotMat.map = tex;
    shotMat.color.set('#ffffff');
    shotMat.needsUpdate = true;
    ctx.invalidate();
  });
  win.position.set(-0.45, 0.02, 0);
  root.add(win);

  function drawUrl() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = th.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, 512, 48, 24); else g.rect(0, 0, 512, 48);
    g.fill();
    g.fillStyle = th.text3Css;
    g.font = '500 24px "JetBrains Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('maryam.best', 256, 25);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (urlMat.map) urlMat.map.dispose();
    urlMat.map = tex;
    urlMat.needsUpdate = true;
  }

  const dna = new THREE.Group();
  const baseGeo = new THREE.SphereGeometry(0.075, 18, 14);
  const aMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.2, toneMapped: false });
  const bMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.2, toneMapped: false });
  const rungMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
  const strandA = new THREE.InstancedMesh(baseGeo, aMat, PAIRS);
  const strandB = new THREE.InstancedMesh(baseGeo, bMat, PAIRS);
  const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), rungMat, PAIRS);
  dna.add(strandA, strandB, rungs);
  dna.position.set(1.75, 0, 0.55);
  dna.rotation.z = -0.18;
  root.add(dna);
  const H = 2.8, RAD = 0.42;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function layoutDna(phase) {
    for (let i = 0; i < PAIRS; i++) {
      const y = -H / 2 + (i / (PAIRS - 1)) * H;
      const a = phase + i * 0.42;
      pa.set(Math.cos(a) * RAD, y, Math.sin(a) * RAD);
      pb.set(Math.cos(a + Math.PI) * RAD, y, Math.sin(a + Math.PI) * RAD);
      m.makeTranslation(pa.x, pa.y, pa.z); strandA.setMatrixAt(i, m);
      m.makeTranslation(pb.x, pb.y, pb.z); strandB.setMatrixAt(i, m);
      mid.addVectors(pa, pb).multiplyScalar(0.5);
      dir.subVectors(pb, pa);
      s.set(1, dir.length() - 0.12, 1);
      q.setFromUnitVectors(up, dir.normalize());
      m.compose(mid, q, s);
      rungs.setMatrixAt(i, m);
    }
    strandA.instanceMatrix.needsUpdate = true;
    strandB.instanceMatrix.needsUpdate = true;
    rungs.instanceMatrix.needsUpdate = true;
  }

  const st = { phase: 0, spin: 0.5, float: 0 };
  const boost = () => { st.spin = 6; ctx.invalidate(); };
  const ctl = orbit(ctx, root, {
    yaw: 0.28, pitch: 0.06, minYaw: -0.45, maxYaw: 0.75, minPitch: -0.3, maxPitch: 0.4, pitchHome: 0.06, tilt: 0.22,
    onTap: boost, onKey: boost,
  });

  function setTheme(t) {
    th = t;
    frameMat.color.copy(t.body);
    barMat.color.copy(t.body).lerp(t.text, t.light ? 0.04 : 0.06);
    aMat.color.copy(t.cool); aMat.emissive.copy(t.cool); aMat.emissiveIntensity = 0.35;
    bMat.color.copy(t.hot); bMat.emissive.copy(t.hot); bMat.emissiveIntensity = 0.35;
    rungMat.color.copy(t.body).lerp(t.line, 0.6);
    drawUrl();
  }
  setTheme(th);

  function update(dt, time) {
    ctl.update(dt);
    camera.position.set(0, 0.2, 1).normalize().multiplyScalar(fitDistance(camera, 2.45, 1.55) * ctl.zoom);
    camera.lookAt(0.1, 0, 0);
    st.spin = damp(st.spin, 0.5, 1.2, dt || 1);
    st.phase += st.spin * dt;
    layoutDna(st.phase);
    if (!reduced) {
      win.position.y = 0.02 + Math.sin(time * 0.8) * 0.04;
      dna.position.y = Math.sin(time * 0.6 + 1) * 0.06;
    }
  }
  update(0, 0);
  return { scene, camera, update, setTheme };
}
