/* Движок сцен: ОДИН WebGL-контекст на всю страницу рисует любое число
   3D-сцен, каждую — в свой <canvas> в потоке документа.

   Почему не один fixed-канвас с ножницами (drei View): такой слой всегда
   на кадр отстаёт от прокрутки, не умеет скругления и перекрывает меню.
   Здесь сцена рендерится в общий невидимый буфер, и готовый кадр копируется
   drawImage в 2D-канвас слота — GPU→GPU. Слот живёт в DOM: прокручивается
   без задержки, обрезается border-radius, уходит под навигацию и диалоги,
   а статичный кадр (reduced-motion) просто остаётся на месте.

   Кадры рисуются только у видимых сцен; модуль сцены грузится лениво,
   когда слот подъезжает к экрану; при просадке FPS снижается DPR. */
import { WebGLRenderer, NeutralToneMapping, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { readTheme } from './kit.js';

const SCENES = {
  globe: () => import('./scenes/globe.js'),
  tunnel: () => import('./scenes/tunnel.js'),
  multipath: () => import('./scenes/multipath.js'),
  spiral: () => import('./scenes/spiral.js'),
  bars: () => import('./scenes/bars.js'),
  helix: () => import('./scenes/helix.js'),
  funnel: () => import('./scenes/funnel.js'),
};

export function boot(stages, { onFail } = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const glCanvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.autoClear = false;

  let envTex = null;
  const env = () => {
    if (!envTex) {
      const pm = new PMREMGenerator(renderer);
      envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    return envTex;
  };

  const views = [];
  let theme = readTheme();
  let focusCanvas = null;
  let raf = 0, last = 0, lost = false;
  let bufW = 0, bufH = 0;
  let quality = isMobile ? 0.85 : 1;
  let slowFor = 0, fastFor = 0, ema = 16;

  function ensureBuffer(w, h) {
    if (w <= bufW && h <= bufH) return;
    bufW = Math.max(bufW, w);
    bufH = Math.max(bufH, h);
    renderer.setSize(bufW, bufH, false);
  }

  function kick() {
    if (!raf && !lost && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function sizeView(v) {
    const r = v.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { v.w = 0; return; }
    const inDialog = !!v.canvas.closest('dialog');
    const cap = inDialog ? 1.5 : (v.inst && v.inst.dprCap) || 1.75;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * quality;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    v.cssW = r.width;
    v.cssH = r.height;
    if (w !== v.canvas.width || h !== v.canvas.height) {
      v.canvas.width = w;
      v.canvas.height = h;
    }
    v.w = w;
    v.h = h;
    if (v.inst && v.inst.resize) v.inst.resize(w, h, r.width, r.height);
    v.dirty = true;
  }

  function isActive(v) {
    if (!v.inst || !v.w) return false;
    if (focusCanvas) return v.canvas === focusCanvas;
    return v.visible && v.stage.dataset.mode !== 'shot';
  }

  function renderView(v) {
    ensureBuffer(v.w, v.h);
    const cam = v.inst.camera;
    const aspect = v.w / v.h;
    if (Math.abs(cam.aspect - aspect) > 1e-4) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    renderer.setViewport(0, 0, v.w, v.h);
    renderer.setScissor(0, 0, v.w, v.h);
    renderer.setScissorTest(true);
    renderer.clear(true, true, true);
    renderer.render(v.inst.scene, cam);
    v.ctx.clearRect(0, 0, v.w, v.h);
    /* WebGL-буфер растёт от левого нижнего угла, 2D — от левого верхнего */
    v.ctx.drawImage(glCanvas, 0, bufH - v.h, v.w, v.h, 0, 0, v.w, v.h);
  }

  function frame(now) {
    raf = 0;
    const dtMs = last ? Math.min(now - last, 60) : 16;
    last = now;
    const active = views.filter(isActive);
    if (!active.length) { last = 0; return; }
    const dt = dtMs / 1000;
    const t = now / 1000;
    for (const v of active) {
      if (!reduced || v.dirty) v.inst.update(reduced ? 0 : dt, t);
    }
    for (const v of active) {
      if (reduced && !v.dirty) continue;
      renderView(v);
      v.dirty = false;
    }
    adapt(dtMs, active);
    if (!reduced) kick();
  }

  /* адаптивное качество с гистерезисом: вниз на устойчивой просадке,
     вверх — только после долгой ровной работы */
  function adapt(dtMs, active) {
    if (reduced) return;
    ema = ema * 0.92 + dtMs * 0.08;
    if (ema > 26) { slowFor += dtMs; fastFor = 0; } else if (ema < 17.5) { fastFor += dtMs; slowFor = 0; } else { slowFor = fastFor = 0; }
    if (slowFor > 1500 && quality > 0.55) {
      quality = Math.max(0.55, quality * 0.82);
      slowFor = 0;
      views.forEach(sizeView);
    } else if (fastFor > 8000 && quality < 1) {
      quality = Math.min(1, quality * 1.12);
      fastFor = 0;
      views.forEach(sizeView);
    }
  }

  function makeCtx(v) {
    return {
      canvas: v.canvas,
      stage: v.stage,
      renderer,
      reduced,
      isMobile,
      theme,
      env,
      hud: v.stage.querySelector('.stage-hud'),
      t: (k) => (window.__t ? window.__t(k) : k),
      invalidate: () => { v.dirty = true; kick(); },
      size: () => ({ w: v.w, h: v.h, cssW: v.cssW, cssH: v.cssH }),
    };
  }

  function load(v) {
    if (v.loading || v.inst) return;
    v.loading = true;
    const loader = SCENES[v.key];
    if (!loader) return;
    loader().then((m) => {
      v.inst = m.create(makeCtx(v));
      v.stage.classList.add('gl-on');
      sizeView(v);
      kick();
    }).catch((err) => {
      v.loading = false;
      console.warn('[scene]', v.key, err);
      v.stage.classList.add('no-gl');
      if (onFail) onFail(v.stage, err);
    });
  }

  const nearIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) load(e.target.__view); });
  }, { rootMargin: '900px 0px' });
  const visIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target.__view;
      v.visible = e.isIntersecting;
      if (v.visible) { v.dirty = true; kick(); }
    });
  }, { rootMargin: '40px 0px' });
  const ro = new ResizeObserver((entries) => {
    entries.forEach((e) => sizeView(e.target.__view));
    kick();
  });

  stages.forEach((stage) => {
    const canvas = stage.querySelector('.stage-gl');
    if (!canvas) return;
    const v = {
      stage, canvas, key: stage.dataset.scene,
      ctx: canvas.getContext('2d'),
      inst: null, loading: false, visible: false, dirty: true,
      w: 0, h: 0, cssW: 0, cssH: 0,
    };
    if (!v.ctx) return;
    canvas.__view = v;
    views.push(v);
    nearIO.observe(canvas);
    visIO.observe(canvas);
    ro.observe(canvas);
  });

  /* смена темы / языка: сцены перечитывают палитру и подписи */
  window.addEventListener('themechange', () => {
    theme = readTheme();
    views.forEach((v) => {
      if (v.inst && v.inst.setTheme) v.inst.setTheme(theme);
      v.dirty = true;
    });
    kick();
  });
  window.addEventListener('langchange', () => {
    views.forEach((v) => {
      if (v.inst && v.inst.setLang) v.inst.setLang();
      v.dirty = true;
    });
    kick();
  });
  /* смена режима «3D / скриншот» */
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.stage-modes')) setTimeout(() => { views.forEach((v) => { v.dirty = true; }); kick(); }, 0);
  });
  document.addEventListener('visibilitychange', () => { last = 0; if (!document.hidden) kick(); });
  window.addEventListener('resize', () => { views.forEach((v) => { v.dirty = true; }); kick(); });

  glCanvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
  });
  glCanvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    bufW = bufH = 0;
    views.forEach((v) => { v.dirty = true; });
    kick();
  });

  window.__gl = {
    focus(canvas) {
      focusCanvas = canvas;
      views.forEach((v) => { v.dirty = true; });
      /* после переезда канваса размеры меняются — пересчитать сразу */
      requestAnimationFrame(() => { views.forEach(sizeView); kick(); });
    },
    stats: () => ({ views: views.length, loaded: views.filter((v) => v.inst).length, quality, buffer: [bufW, bufH] }),
  };

  kick();
  return window.__gl;
}
