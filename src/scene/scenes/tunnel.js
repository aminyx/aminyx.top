/* SomonVPN — Smart Connect. Телефон шлёт пакеты по стеклянному туннелю
   к серверу через DPI-фильтр. Когда DPI начинает резать WireGuard, пакеты
   разбиваются о стену; после нескольких потерь клиент сам переключается
   на VLESS Reality (пакеты-«октаэдры» проходят) и запоминает конфигурацию. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { orbit, hudChip, fresnelMaterial, textSprite, fitDistance, studioLights, damp, setGlowBlend } from '../kit.js';
import { sfxKill, sfxHeal } from '../sfx.js';

const MAXP = 44;

export function create(ctx) {
  const { reduced } = ctx;
  let th = ctx.theme;
  const scene = new THREE.Scene();
  scene.environment = ctx.env();
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 60);
  studioLights(scene, THREE);
  const root = new THREE.Group();
  scene.add(root);

  /* ---------- телефон ---------- */
  const bodyMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.32, envMapIntensity: 0.9 });
  const phone = new THREE.Group();
  const phoneBody = new THREE.Mesh(new RoundedBoxGeometry(0.92, 1.8, 0.1, 4, 0.13), bodyMat);
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256; screenCanvas.height = 512;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.66), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = 0.0515;
  phone.add(phoneBody, screen);
  phone.position.set(-2.2, 0, 0.1);
  phone.rotation.y = 0.5;
  root.add(phone);

  let screenState = '';
  function drawScreen(state) {
    if (state === screenState) return;
    screenState = state;
    const c = screenCanvas.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#111827');
    g.addColorStop(1, '#0a0e17');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 512);
    const col = state === 'ok' ? th.okCss : state === 'switch' ? th.hotCss : th.dangerCss;
    /* статус-бар */
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(24, 26, 36, 8);
    c.fillRect(196, 26, 36, 8);
    /* кнопка подключения с ореолом */
    const glow = c.createRadialGradient(128, 230, 20, 128, 230, 120);
    glow.addColorStop(0, col + '66');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 100, 256, 260);
    c.lineWidth = 10;
    c.strokeStyle = col;
    c.beginPath(); c.arc(128, 230, 62, 0, Math.PI * 2); c.stroke();
    /* щит */
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(128, 196); c.lineTo(156, 208); c.lineTo(156, 232);
    c.quadraticCurveTo(156, 258, 128, 270); c.quadraticCurveTo(100, 258, 100, 232);
    c.lineTo(100, 208); c.closePath(); c.fill();
    /* «список серверов» — абстрактные строки */
    for (let i = 0; i < 3; i++) {
      c.fillStyle = 'rgba(255,255,255,' + (i === 0 ? 0.16 : 0.08) + ')';
      c.beginPath();
      c.roundRect ? c.roundRect(28, 360 + i * 44, 200, 32, 10) : c.rect(28, 360 + i * 44, 200, 32);
      c.fill();
    }
    c.fillStyle = col;
    c.beginPath(); c.arc(48, 376, 6, 0, Math.PI * 2); c.fill();
    screenTex.needsUpdate = true;
  }

  /* ---------- сервер ---------- */
  const server = new THREE.Group();
  const unitGeo = new RoundedBoxGeometry(1.15, 0.3, 0.9, 3, 0.05);
  for (let i = 0; i < 3; i++) {
    const u = new THREE.Mesh(unitGeo, bodyMat);
    u.position.y = (i - 1) * 0.37;
    server.add(u);
  }
  const ledGeo = new THREE.BoxGeometry(0.07, 0.035, 0.02);
  const ledMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, 9);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 9; i++) {
    m4.makeTranslation(-0.38 + (i % 3) * 0.12, (Math.floor(i / 3) - 1) * 0.37, 0.455);
    leds.setMatrixAt(i, m4);
  }
  server.add(leds);
  const ledHeat = new Float32Array(9);
  server.position.set(2.2, -0.05, -0.1);
  server.rotation.y = -0.45;
  root.add(server);

  /* ---------- DPI-стена ---------- */
  const wall = new THREE.Group();
  const wallMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uHit: { value: 0 }, uOn: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uHit; uniform float uOn;
      varying vec2 vUv;
      void main() {
        vec2 g = abs(fract(vUv * vec2(9.0, 10.0)) - 0.5);
        float grid = smoothstep(0.47, 0.5, max(g.x, g.y));
        float band = smoothstep(0.1, 0.0, abs(fract(vUv.y - uTime * 0.25) - 0.5) - 0.02);
        float edge = smoothstep(0.08, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        float a = 0.05 + grid * (0.18 + 0.25 * uOn) + band * 0.22 * uOn + uHit * 0.35 + edge * 0.25;
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.9));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.3), wallMat);
  panel.rotation.y = Math.PI / 2;
  const frameMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 });
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.06, 2.3, 2.0)), frameMat);
  const dpiLabel = textSprite('DPI', { size: 0.2 });
  dpiLabel.position.set(0, 1.42, 0);
  wall.add(panel, frame, dpiLabel);
  wall.position.set(0, 0.05, 0.05);
  root.add(wall);

  /* ---------- туннель ---------- */
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.95, 0.05, 0.3),
    new THREE.Vector3(-1.0, 0.26, 0.32),
    new THREE.Vector3(0, 0.3, 0.2),
    new THREE.Vector3(0.95, 0.24, 0.06),
    new THREE.Vector3(1.62, 0.02, 0.05),
  ]);
  const coreMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, toneMapped: false });
  const coreTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.012, 6), coreMat);
  const glassMat = fresnelMaterial({ power: 2.4, intensity: 0.8, base: 0.02, light: th.light });
  const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.17, 28), glassMat);
  root.add(coreTube, glass);

  /* ---------- пакеты ---------- */
  const wgMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2, toneMapped: false });
  const rlMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.3, toneMapped: false });
  const wgMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), wgMat, MAXP);
  const rlMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07), rlMat, MAXP);
  wgMesh.frustumCulled = rlMesh.frustumCulled = false;
  root.add(wgMesh, rlMesh);
  const packets = [];

  /* ---------- состояние Smart Connect ---------- */
  const st = { proto: 'wg', dpi: false, lost: 0, remembered: false, phase: 'clear', t: 0, switchAt: 0, spawn: 0, hit: 0 };

  const chips = ctx.hud ? {
    proto: hudChip(ctx.hud), dpi: hudChip(ctx.hud), lost: hudChip(ctx.hud), mem: hudChip(ctx.hud),
  } : null;
  function renderHud() {
    if (!chips) return;
    const switching = st.switchAt > 0;
    chips.proto.set(st.proto === 'wg' ? 'WireGuard' : 'VLESS Reality', null, switching ? 'bad' : st.proto === 'wg' ? 'ok' : 'hot');
    chips.dpi.set(st.dpi ? ctx.t('hud.dpiOn') : ctx.t('hud.dpiOff'), null, st.dpi ? 'bad' : 'ok');
    chips.lost.show(st.lost > 0);
    chips.lost.set(ctx.t('hud.lost'), st.lost, 'bad');
    chips.mem.show(st.remembered);
    chips.mem.set(ctx.t('hud.remember'), null, 'hot');
  }

  function setPhase(p) { st.phase = p; st.t = 0; }
  function blockOn() {
    st.dpi = true;
    setPhase('blocked');
  }
  function toggle() {
    if (!st.dpi) blockOn();
    else if (st.proto === 'reality') { st.dpi = false; setPhase('calm'); sfxHeal(); }
    ctx.invalidate();
  }

  const ctl = orbit(ctx, root, {
    yaw: -0.22, pitch: 0.16, minYaw: -0.8, maxYaw: 0.3, minPitch: -0.1, maxPitch: 0.5, pitchHome: 0.16, tilt: 0.06,
    onTap: toggle, onKey: toggle,
  });

  /* ---------- палитра ---------- */
  function setTheme(t) {
    th = t;
    bodyMat.color.copy(t.body);
    ledMat.color.set('#ffffff');
    wgMat.color.copy(t.cool); wgMat.emissive.copy(t.cool); wgMat.emissiveIntensity = 0.55;
    rlMat.color.copy(t.hot); rlMat.emissive.copy(t.hot); rlMat.emissiveIntensity = 0.6;
    coreMat.color.copy(t.line);
    glassMat.uniforms.uColor.value.copy(t.cool);
    glassMat.uniforms.uIntensity.value = t.light ? 0.5 : 0.8;
    frameMat.color.copy(t.line);
    dpiLabel.userData.set('DPI', t.text3Css);
    screenState = '';
    setGlowBlend(glassMat, t.light);
  }
  setTheme(th);
  const tmpC = new THREE.Color();

  /* ---------- кадр ---------- */
  const dummy = new THREE.Object3D();
  const pos = new THREE.Vector3();
  function update(dt, time) {
    ctl.update(dt);
    camera.position.set(0, 0.55, 1).normalize().multiplyScalar(fitDistance(camera, 3.0, 1.5) * ctl.zoom);
    camera.lookAt(0, 0.05, 0);

    st.t += dt;
    /* автосценарий демонстрации */
    if (st.phase === 'clear' && st.t > 4.2 && st.proto === 'wg') blockOn();
    if (st.phase === 'blocked' && st.proto === 'wg' && st.lost >= 3 && !st.switchAt) st.switchAt = time + 0.7;
    if (st.switchAt && time > st.switchAt) {
      st.switchAt = 0;
      st.proto = 'reality';
      st.remembered = true;
      setPhase('reality');
      sfxHeal();
    }
    if (st.phase === 'reality' && st.t > 6.5) { st.dpi = false; setPhase('calm'); }
    if (st.phase === 'calm' && st.t > 5) {
      /* новая сессия демонстрации */
      st.proto = 'wg'; st.remembered = false; st.lost = 0;
      setPhase('clear');
    }

    /* поток пакетов */
    st.spawn -= dt;
    if (st.spawn <= 0 && !reduced) {
      st.spawn = 0.24;
      if (packets.length < MAXP) packets.push({ u: 0, speed: 0.26 + Math.random() * 0.06, proto: st.proto, fall: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 1, spin: Math.random() * 6 });
    }
    st.hit = damp(st.hit, 0, 5, dt);
    for (let i = packets.length - 1; i >= 0; i--) {
      const pk = packets[i];
      pk.spin += dt * 2.4;
      if (!pk.fall) {
        const prevU = pk.u;
        pk.u += pk.speed * dt;
        /* режется только пакет, пересекающий стену в этот кадр:
           уже прошедшие DPI до включения фильтра долетают */
        if (st.dpi && pk.proto === 'wg' && prevU < 0.49 && pk.u >= 0.49) {
          pk.fall = true;
          curve.getPointAt(0.49, pk.p);
          pk.v.set(-0.5 - Math.random() * 0.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4);
          st.lost++;
          st.hit = 1;
          sfxKill();
          continue;
        }
        if (pk.u >= 1) {
          packets.splice(i, 1);
          const led = (Math.random() * 9) | 0;
          ledHeat[led] = 1;
          continue;
        }
      } else {
        pk.v.y -= 3.2 * dt;
        pk.p.addScaledVector(pk.v, dt);
        pk.life -= dt * 1.1;
        if (pk.life <= 0) { packets.splice(i, 1); continue; }
      }
    }

    let nw = 0, nr = 0;
    for (const pk of packets) {
      if (pk.fall) pos.copy(pk.p); else curve.getPointAt(Math.min(pk.u, 1), pos);
      dummy.position.copy(pos);
      dummy.rotation.set(pk.spin, pk.spin * 0.7, 0);
      const s = pk.fall ? Math.max(0.01, pk.life) : Math.min(1, pk.u * 12) * Math.min(1, (1 - pk.u) * 12);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      if (pk.proto === 'wg') wgMesh.setMatrixAt(nw++, dummy.matrix); else rlMesh.setMatrixAt(nr++, dummy.matrix);
    }
    wgMesh.count = nw; rlMesh.count = nr;
    wgMesh.instanceMatrix.needsUpdate = true;
    rlMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 9; i++) {
      ledHeat[i] = Math.max(0, ledHeat[i] - dt * 2.5);
      tmpC.copy(th.body).lerp(i % 3 === 0 ? th.ok : th.hot, 0.25 + 0.75 * ledHeat[i]);
      leds.setColorAt(i, tmpC);
    }
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;

    wallMat.uniforms.uTime.value = time;
    wallMat.uniforms.uHit.value = st.hit;
    wallMat.uniforms.uOn.value = damp(wallMat.uniforms.uOn.value, st.dpi ? 1 : 0, 6, dt || 1);
    wallMat.uniforms.uColor.value.copy(st.dpi ? th.danger : th.cool);
    frameMat.color.copy(st.dpi ? th.danger : th.line);

    drawScreen(st.switchAt ? 'switch' : st.dpi && st.proto === 'wg' ? 'bad' : 'ok');
    renderHud();
  }

  if (reduced) {
    /* статичный кадр: момент после переключения — видны обе механики */
    st.dpi = true; st.proto = 'reality'; st.remembered = true; st.lost = 3; st.phase = 'reality';
    for (let i = 0; i < 8; i++) packets.push({ u: 0.06 + i * 0.12, speed: 0, proto: 'reality', fall: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 1, spin: i });
  }
  update(0, 0);
  return { scene, camera, update, setTheme, setLang: renderHud };
}
