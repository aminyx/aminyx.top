// Somoni Tracker: строка из чата -> блок траты, каркасы = те же прошедшие дни прошлого месяца
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { orbit, hudChip, textSprite, fitDistance, studioLights, damp } from '../kit.js';
import { sfxHeal } from '../sfx.js';

const DAYS = 7, GAP = 0.62, W = 0.36, MAXB = 64;
const colX = (d) => (d - (DAYS - 1) / 2) * GAP;
const heightOf = (amount) => 0.09 + Math.sqrt(amount / 1200) * 0.52;

export function create(ctx) {
  const { reduced } = ctx;
  let th = ctx.theme;
  const scene = new THREE.Scene();
  scene.environment = ctx.env();
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 60);
  studioLights(scene, THREE);
  const root = new THREE.Group();
  scene.add(root);

  const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
  const plate = new THREE.Mesh(new RoundedBoxGeometry(DAYS * GAP + 0.3, 0.06, 1.55, 3, 0.03), plateMat);
  plate.position.set(0, -0.035, -0.15);
  root.add(plate);

  const blockMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, envMapIntensity: 0.7 });
  const blockGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  const blocks = new THREE.InstancedMesh(blockGeo, blockMat, MAXB);
  blocks.frustumCulled = false;
  root.add(blocks);

  // каркасы прошлого месяца
  const ghostMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 });
  const ghostFillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false });
  const unitEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const ghosts = [];
  for (let d = 0; d < DAYS; d++) {
    const g = new THREE.Group();
    g.add(new THREE.LineSegments(unitEdges, ghostMat), new THREE.Mesh(unitBox, ghostFillMat));
    g.position.set(colX(d), 0, -0.46);
    root.add(g);
    ghosts.push(g);
  }
  const labels = [];
  for (let d = 0; d < DAYS; d++) {
    const s = textSprite(String(d + 1), { size: 0.14 });
    // перед передней кромкой плиты, иначе её перекрывает глубина
    s.position.set(colX(d), 0.02, 0.76);
    root.add(s);
    labels.push(s);
  }

  // демо-строки из словаря, формат: кофе 350|Кафе;...
  let demo = [];
  let cats = [];
  function parseDemo() {
    demo = String(ctx.t('tracker.demo')).split(';').map((row) => {
      const [text, cat] = row.split('|');
      const amount = parseInt((text.match(/\d+/) || ['100'])[0], 10);
      return { text, cat, amount };
    });
    cats = [...new Set(demo.map((d) => d.cat))];
  }
  parseDemo();
  const catColor = [];
  function setCatColors() {
    catColor.length = 0;
    catColor.push(th.hot.clone(), th.cool.clone(), th.ok.clone(), th.danger.clone().lerp(th.hot, 0.25), th.cool.clone().lerp(th.danger, 0.5));
  }

  const list = [];
  const lastMonth = Array.from({ length: DAYS }, () => 260 + Math.random() * 700);
  const st = { today: 3, spendsToday: 0, chatT: 0, chat: null, next: 1.2, di: 0, reset: 0 };

  function stackTop(day) {
    let y = 0;
    for (const b of list) if (b.day === day && !b.dying) y = Math.max(y, b.base + b.h);
    return y;
  }
  function addBlock(day, item, instant) {
    if (list.length >= MAXB) return;
    const h = heightOf(item.amount);
    const base = stackTop(day);
    list.push({ day, h, base, amount: item.amount, cat: Math.max(0, cats.indexOf(item.cat)), y: instant ? base : base + 1.6, vy: 0, s: instant ? 1 : 0.6, dying: false });
  }
  function seedWeek() {
    list.length = 0;
    for (let d = 0; d < st.today; d++) {
      const n = 1 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) addBlock(d, demo[(Math.random() * demo.length) | 0], true);
    }
  }
  seedWeek();

  const chips = ctx.hud ? { chat: hudChip(ctx.hud), vs: hudChip(ctx.hud) } : null;
  if (chips) chips.chat.el.classList.add('is-chat');
  function renderHud() {
    if (!chips) return;
    if (st.chat) {
      const shown = st.chat.text.slice(0, Math.floor(st.chatT * 18));
      const done = shown.length >= st.chat.text.length;
      chips.chat.set(shown + (done ? '' : '▍'), done ? '→ ' + st.chat.cat : '', done ? 'hot' : '');
    } else {
      chips.chat.set('…', '', '');
    }
    let cur = 0, prev = 0;
    for (const b of list) if (!b.dying) cur += b.amount;
    const last = Math.min(st.today, DAYS - 1);
    for (let d = 0; d <= last; d++) prev += lastMonth[d];
    const pct = Math.round((cur / prev - 1) * 100);
    const n = last + 1;
    chips.vs.set(ctx.t('hud.vs').replace('{n}', n), (pct > 0 ? '+' : pct < 0 ? '−' : '') + Math.abs(pct) + ' %', pct > 0 ? 'bad' : 'ok');
  }

  function spend() {
    if (st.reset || st.today >= DAYS) return;
    const item = demo[st.di++ % demo.length];
    st.chat = item;
    if (reduced) {
      // без анимации: сообщение сразу целиком, блок сразу в столбце
      st.chatT = 99;
      addBlock(st.today, item, true);
    } else {
      st.chatT = 0;
      st.pending = item;
    }
    ctx.invalidate();
  }
  const ctl = orbit(ctx, root, {
    yaw: -0.3, pitch: 0.3, minYaw: -0.9, maxYaw: 0.5, minPitch: 0.05, maxPitch: 0.8, pitchHome: 0.3, tilt: 0.06,
    onTap: spend, onKey: spend,
  });

  function setTheme(t) {
    th = t;
    plateMat.color.copy(t.body);
    blockMat.color.set('#ffffff');
    ghostMat.color.copy(t.line);
    ghostFillMat.color.copy(t.line);
    labels.forEach((s, d) => s.userData.set(String(d + 1), t.text3Css));
    setCatColors();
  }
  setTheme(th);

  const dummy = new THREE.Object3D();
  const tmpC = new THREE.Color();
  function update(dt) {
    ctl.update(dt);
    camera.position.set(0.1, 0.5, 1).normalize().multiplyScalar(fitDistance(camera, 2.35, 1.15) * ctl.zoom);
    camera.lookAt(0, 0.35, -0.1);

    if (!reduced) {
      st.next -= dt;
      if (st.next <= 0 && !st.pending && !st.reset) { st.next = 2.4; spend(); }
      if (st.chat) st.chatT += dt;
      // сообщение допечатано: бот ставит категорию, блок падает
      if (st.pending && st.chatT * 18 >= st.pending.text.length + 6) {
        addBlock(st.today, st.pending, false);
        st.pending = null;
        st.spendsToday++;
        if (st.spendsToday >= 3) {
          st.spendsToday = 0;
          st.today++;
          if (st.today >= DAYS) { st.reset = 1.2; }
        }
      }
      if (st.reset) {
        st.reset -= dt;
        list.forEach((b) => { b.dying = true; });
        if (st.reset <= 0) {
          st.reset = 0;
          st.today = 3;
          lastMonth.forEach((_, i) => { lastMonth[i] = 260 + Math.random() * 700; });
          seedWeek();
          sfxHeal();
        }
      }
    }

    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.dying) {
        b.s = damp(b.s, 0, 6, dt || 1);
        if (b.s < 0.02) { list.splice(i, 1); continue; }
      } else if (b.y > b.base) {
        b.vy -= 9 * dt;
        b.y += b.vy * dt;
        if (b.y <= b.base) { b.y = b.base; b.vy = 0; }
        b.s = damp(b.s, 1, 8, dt || 1);
      } else {
        b.s = damp(b.s, 1, 8, dt || 1);
      }
    }
    for (const b of list) {
      dummy.position.set(colX(b.day), b.y + b.h / 2, 0);
      dummy.scale.set(W * b.s, Math.max(0.001, b.h - 0.012) * b.s, W * b.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      blocks.setMatrixAt(n, dummy.matrix);
      tmpC.copy(catColor[b.cat % catColor.length]);
      blocks.setColorAt(n, tmpC);
      n++;
    }
    blocks.count = n;
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;

    ghosts.forEach((g, d) => {
      const on = d <= st.today && !st.reset;
      // высота сопоставима со стопкой: итог дня как две траты
      const h = 2 * heightOf(lastMonth[d] / 2);
      g.visible = on || g.scale.y > 0.02;
      const sy = on ? h : 0.001;
      g.scale.set(W * 0.92, reduced ? sy : damp(g.scale.y, sy, 5, dt || 1), W * 0.92);
      g.position.y = g.scale.y / 2;
    });
    labels.forEach((s, d) => { s.material.opacity = d <= st.today ? 1 : 0.35; });
    renderHud();
  }

  if (reduced) {
    st.chat = demo[0];
    st.chatT = 99;
    addBlock(st.today, demo[0], true);
  }
  update(0, 0);
  return {
    scene, camera, update, setTheme,
    setLang: () => { parseDemo(); st.chat = st.chat ? demo[(st.di + demo.length - 1) % demo.length] : null; renderHud(); },
  };
}
