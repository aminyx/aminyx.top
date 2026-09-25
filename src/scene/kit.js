// общее для сцен: палитра из CSS, материалы точек и линий, орбита, спрайты, HUD-чипы
import {
  Color, ShaderMaterial, CustomBlending, AddEquation, SrcAlphaFactor, OneFactor,
  OneMinusSrcAlphaFactor, CanvasTexture, SpriteMaterial, Sprite, SRGBColorSpace, Vector3,
} from 'three';

const TOKENS = ['node', 'line', 'core', 'cool', 'hot', 'danger', 'body', 'ok'];

export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const light = document.documentElement.dataset.theme === 'light';
  const th = { light };
  TOKENS.forEach((k) => {
    const v = cs.getPropertyValue('--gl-' + k).trim() || '#888888';
    th[k] = new Color(v);
    th[k + 'Css'] = v;
  });
  th.text = new Color(cs.getPropertyValue('--text-1').trim() || '#ffffff');
  th.textCss = cs.getPropertyValue('--text-1').trim();
  th.text3Css = cs.getPropertyValue('--text-3').trim();
  th.bgCss = cs.getPropertyValue('--stage-bg').trim();
  return th;
}

export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// цвета в атрибутах линейные, в шейдере переводим в выходное пространство.
// тёмная тема: цвет складываем (свечение), альфу кладём поверх, чтобы копия в 2D не теряла свечение. светлая: обычный over, сложение на белом не видно

export function setGlowBlend(mat, light) {
  mat.blending = CustomBlending;
  mat.blendEquation = AddEquation;
  mat.blendSrc = SrcAlphaFactor;
  mat.blendDst = light ? OneMinusSrcAlphaFactor : OneFactor;
  mat.blendSrcAlpha = OneFactor;
  mat.blendDstAlpha = OneMinusSrcAlphaFactor;
  mat.needsUpdate = true;
}

const FACING = /* glsl */`
  uniform float uFacing;
  uniform vec3 uCenter;
  float facingK(vec3 wp) {
    if (uFacing < 0.5) return 1.0;
    vec3 n = normalize(wp - uCenter);
    vec3 v = normalize(cameraPosition - wp);
    return mix(0.0, 1.0, smoothstep(-0.05, 0.28, dot(n, v)));
  }
`;

export function pointsMaterial({ light = false, facing = false, soft = 0.6 } = {}) {
  const mat = new ShaderMaterial({
    uniforms: {
      uScale: { value: 400 },
      uFacing: { value: facing ? 1 : 0 },
      uCenter: { value: new Vector3() },
      uSoft: { value: soft },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute vec4 aColor;
      uniform float uScale;
      uniform float uFade;
      varying vec4 vColor;
      ${FACING}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(aSize * uScale / -mv.z, 0.0);
        vColor = vec4(aColor.rgb, aColor.a * facingK(wp.xyz) * uFade);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uSoft;
      varying vec4 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.72, d);
        float glow = pow(max(1.0 - d, 0.0), 1.8);
        float a = vColor.a * mix(disc, glow, uSoft);
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor.rgb, a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  setGlowBlend(mat, light);
  return mat;
}

export function linesMaterial({ light = false, facing = false, glow = false } = {}) {
  const mat = new ShaderMaterial({
    uniforms: {
      uFacing: { value: facing ? 1 : 0 },
      uCenter: { value: new Vector3() },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec4 aColor;
      uniform float uFade;
      varying vec4 vColor;
      ${FACING}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
        vColor = vec4(aColor.rgb, aColor.a * facingK(wp.xyz) * uFade);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec4 vColor;
      void main() {
        if (vColor.a < 0.003) discard;
        gl_FragColor = vColor;
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  if (glow) setGlowBlend(mat, light);
  return mat;
}

// френель-оболочка: стекло туннеля и воронки
export function fresnelMaterial({ color, power = 2.2, intensity = 1, base = 0.0, light = false, side } = {}) {
  const mat = new ShaderMaterial({
    uniforms: {
      uColor: { value: color ? color.clone() : new Color('#86a8ff') },
      uPower: { value: power },
      uIntensity: { value: intensity },
      uBase: { value: base },
    },
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      uniform float uBase;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        float a = clamp(uBase + f * uIntensity, 0.0, 1.0);
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  if (side !== undefined) mat.side = side;
  setGlowBlend(mat, light);
  return mat;
}

// запись цвета в RGBA-атрибут
export function putColor(arr, i, c, a) {
  const o = i * 4;
  arr[o] = c.r; arr[o + 1] = c.g; arr[o + 2] = c.b; arr[o + 3] = a;
}

export function textSprite(text, { color = '#ffffff', size = 0.22, weight = 500 } = {}) {
  const canvas = document.createElement('canvas');
  const mat = new SpriteMaterial({ transparent: true, depthWrite: false });
  const sprite = new Sprite(mat);
  sprite.userData.set = (txt, col) => {
    const px = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = `${weight} ${px}px "JetBrains Mono", ui-monospace, monospace`;
    const w = Math.ceil(ctx.measureText(txt).width) + px * 0.8;
    canvas.width = w;
    canvas.height = Math.ceil(px * 1.5);
    ctx.font = `${weight} ${px}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = col;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(txt, w / 2, canvas.height / 2);
    // r185 выделяет неизменяемое хранилище текстуры: при новом размере
    // канваса старую текстуру нельзя перезалить, создаём новую
    if (mat.map) mat.map.dispose();
    mat.map = new CanvasTexture(canvas);
    mat.map.colorSpace = SRGBColorSpace;
    mat.needsUpdate = true;
    sprite.scale.set(size * (w / canvas.height), size, 1);
  };
  sprite.userData.set(text, color);
  return sprite;
}

export function hudChip(container) {
  const el = document.createElement('span');
  el.className = 'hud-chip';
  const dot = document.createElement('i');
  const label = document.createElement('span');
  const val = document.createElement('b');
  el.append(dot, label, val);
  container.appendChild(el);
  let last = '';
  return {
    el,
    set(labelText, valueText, state) {
      const key = labelText + '|' + valueText + '|' + state;
      if (key === last) return;
      last = key;
      label.textContent = labelText;
      val.textContent = valueText == null ? '' : String(valueText);
      val.hidden = valueText == null || valueText === '';
      // только класс состояния, дополнительные (is-chat) не трогаем
      el.classList.remove('is-ok', 'is-hot', 'is-bad');
      if (state) el.classList.add('is-' + state);
    },
    show(on) { el.hidden = !on; },
  };
}

// орбита: горизонтальный драг наш, вертикальный на таче отдаём скроллу (pan-y).
// тап -> onTap, удержание -> onHold, колесо зумит только в полноэкранном режиме

export function orbit(ctx, target, opts = {}) {
  const canvas = ctx.canvas;
  const st = {
    yaw: opts.yaw || 0,
    pitch: opts.pitch || 0,
    vYaw: 0,
    vPitch: 0,
    auto: opts.auto == null ? 0.08 : opts.auto,
    minPitch: opts.minPitch == null ? -0.6 : opts.minPitch,
    maxPitch: opts.maxPitch == null ? 0.6 : opts.maxPitch,
    minYaw: opts.minYaw == null ? -Infinity : opts.minYaw,
    maxYaw: opts.maxYaw == null ? Infinity : opts.maxYaw,
    zoom: 1,
    zoomTarget: 1,
    tiltX: 0,
    tiltY: 0,
    hoverX: 0,
    hoverY: 0,
    hovering: false,
    dragging: false,
    idle: 0,
  };
  const k = opts.speed || 0.0065;
  let down = null, holdTimer = 0, held = false, lastMoveT = 0;

  const rel = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  function onDown(e) {
    if (e.button !== 0 || e.isPrimary === false) return;
    const p = rel(e);
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, px: p.x, py: p.y, t: performance.now(), id: e.pointerId, moved: false };
    held = false;
    st.vYaw = st.vPitch = 0;
    clearTimeout(holdTimer);
    // захват сразу, иначе быстрый выход за край уносит pointerup мимо канваса
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {} // указатель уже ушёл
    if (opts.onHold) {
      holdTimer = setTimeout(() => {
        if (down && !down.moved) { held = true; opts.onHold(down.px, down.py); ctx.invalidate(); }
      }, 560);
    }
  }
  function onMove(e) {
    const p = rel(e);
    st.hoverX = p.x / p.w * 2 - 1;
    st.hoverY = p.y / p.h * 2 - 1;
    if (e.pointerType === 'mouse') {
      st.hovering = true;
      if (opts.onHover && !st.dragging) opts.onHover(p.x, p.y);
    }
    if (!down || e.pointerId !== down.id) return;
    // кнопка отпущена вне канваса, драг закончился
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { onCancel(); return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.abs(dx) + Math.abs(dy) > 5) {
      down.moved = true;
      down.lx = e.clientX; down.ly = e.clientY;
      st.dragging = true;
      clearTimeout(holdTimer);
    }
    if (!st.dragging) return;
    const now = performance.now();
    // дельта от прошлого события: movementX на таче в Safari нулевой
    const ddx = e.clientX - down.lx, ddy = e.clientY - down.ly;
    down.lx = e.clientX; down.ly = e.clientY;
    st.yaw = clamp(st.yaw + ddx * k, st.minYaw, st.maxYaw);
    st.pitch = clamp(st.pitch + ddy * k, st.minPitch, st.maxPitch);
    const dt = Math.max(8, now - lastMoveT) / 1000;
    st.vYaw = (ddx * k) / dt;
    st.vPitch = (ddy * k) / dt;
    lastMoveT = now;
    st.idle = 0;
    ctx.invalidate();
  }
  function onUp(e) {
    clearTimeout(holdTimer);
    if (!down || e.pointerId !== down.id) return;
    const wasDrag = st.dragging;
    st.dragging = false;
    const quick = performance.now() - down.t < 450;
    const p = rel(e);
    if (!wasDrag && !held && quick && opts.onTap) opts.onTap(p.x, p.y);
    if (performance.now() - lastMoveT > 90) { st.vYaw = st.vPitch = 0; }
    down = null;
    ctx.invalidate();
  }
  function onCancel() {
    clearTimeout(holdTimer);
    down = null;
    st.dragging = false;
  }
  function onLeave(e) {
    if (e.pointerType === 'mouse') {
      st.hovering = false;
      if (opts.onLeave) opts.onLeave();
    }
  }
  function onWheel(e) {
    if (!canvas.closest('dialog')) return;
    e.preventDefault();
    st.zoomTarget = clamp(st.zoomTarget * Math.exp(e.deltaY * 0.0012), 0.55, 1.8);
    ctx.invalidate();
  }
  function onKey(e) {
    const step = 0.18;
    let used = true;
    if (e.key === 'ArrowLeft') st.yaw = clamp(st.yaw - step, st.minYaw, st.maxYaw);
    else if (e.key === 'ArrowRight') st.yaw = clamp(st.yaw + step, st.minYaw, st.maxYaw);
    else if (e.key === 'ArrowUp') st.pitch = clamp(st.pitch - step, st.minPitch, st.maxPitch);
    else if (e.key === 'ArrowDown') st.pitch = clamp(st.pitch + step, st.minPitch, st.maxPitch);
    else if ((e.key === 'Enter' || e.key === ' ') && opts.onKey) opts.onKey();
    else if ((e.key === '+' || e.key === '=') && canvas.closest('dialog')) st.zoomTarget = clamp(st.zoomTarget * 0.85, 0.55, 1.8);
    else if (e.key === '-' && canvas.closest('dialog')) st.zoomTarget = clamp(st.zoomTarget / 0.85, 0.55, 1.8);
    else used = false;
    if (used) { e.preventDefault(); st.idle = 0; ctx.invalidate(); }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  // захват отобран (канвас переехал в диалог и т. п.), сбросить драг
  canvas.addEventListener('lostpointercapture', (e) => { if (down && e.pointerId === down.id) onCancel(); });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('explore', (e) => { if (!e.detail) st.zoomTarget = 1; });

  st.update = (dt) => {
    st.idle += dt;
    if (!st.dragging) {
      if (Math.abs(st.vYaw) > 0.0005 || Math.abs(st.vPitch) > 0.0005) {
        st.yaw = clamp(st.yaw + st.vYaw * dt, st.minYaw, st.maxYaw);
        st.pitch = clamp(st.pitch + st.vPitch * dt, st.minPitch, st.maxPitch);
        const f = Math.exp(-3.2 * dt);
        st.vYaw *= f; st.vPitch *= f;
      }
      if (!ctx.reduced && st.idle > 1.2) {
        if (Number.isFinite(st.minYaw)) {
          // рыскань ограничен: покачиваем около середины диапазона
          st.yaw = damp(st.yaw, (st.minYaw + st.maxYaw) / 2 + Math.sin(st.idle * 0.35) * (st.maxYaw - st.minYaw) * 0.18, 0.8, dt);
        } else {
          st.yaw += st.auto * dt;
        }
        if (opts.pitchHome != null) st.pitch = damp(st.pitch, opts.pitchHome, 0.6, dt);
      }
    }
    // лёгкий наклон к курсору
    const tx = st.hovering && !ctx.reduced ? st.hoverX : 0;
    const ty = st.hovering && !ctx.reduced ? st.hoverY : 0;
    st.tiltX = damp(st.tiltX, tx, 3, dt);
    st.tiltY = damp(st.tiltY, ty, 3, dt);
    st.zoom = ctx.reduced ? st.zoomTarget : damp(st.zoom, st.zoomTarget, 6, dt);
    if (target) {
      target.rotation.set(st.pitch + st.tiltY * (opts.tilt || 0.08), st.yaw + st.tiltX * (opts.tilt || 0.08), 0, 'YXZ');
    }
    return st;
  };
  return st;
}

// перевод координат указателя (CSS px канваса) в NDC
export function toNdc(x, y, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: (x / r.width) * 2 - 1, y: -(y / r.height) * 2 + 1 };
}

// дистанция камеры, при которой прямоугольник halfW × halfH целиком
// помещается в кадр при текущем aspect (4:3 слот, квадрат на телефоне,
// полноэкранный режим)
export function fitDistance(camera, halfW, halfH, margin = 1.08) {
  const tanH = Math.tan((camera.fov * Math.PI) / 360);
  return Math.max(halfH / tanH, halfW / (tanH * Math.max(camera.aspect, 0.2))) * margin;
}

// свет по умолчанию для твёрдых объектов: ключевой + заполняющий
export function studioLights(scene, THREE) {
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight('#9db4ff', 0.7);
  rim.position.set(-4, 2, -3);
  const amb = new THREE.HemisphereLight('#ffffff', '#1a1d24', 0.55);
  scene.add(key, rim, amb);
  return { key, rim, amb };
}
