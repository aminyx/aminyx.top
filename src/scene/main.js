// сцены грузим после первой отрисовки. фолбэк: WebGL2 -> canvas2d-глобус (hero) -> скриншоты
const stages = Array.from(document.querySelectorAll('.stage[data-scene]'));

// three 0.185 создаёт только WebGL2-контекст
function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch (e) {
    return false;
  }
}

// экономия трафика: на Save-Data и 2G three не грузим
function liteConnection() {
  const c = navigator.connection;
  return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
}

function whenIdle(fn) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 200);
}

function fallback(list) {
  list.forEach((s) => s.classList.add('no-gl'));
  const hero = list.find((s) => s.dataset.scene === 'globe');
  if (hero) {
    hero.classList.remove('no-gl');
    import('./globe2d.js').then((m) => m.mountGlobe2d(hero)).catch(() => hero.classList.add('no-gl'));
  }
}

if (stages.length) {
  whenIdle(() => {
    if (!hasWebGL2() || liteConnection()) { fallback(stages); return; }
    import('./engine.js')
      .then((m) => m.boot(stages, {
        onFail: (stage) => { if (stage.dataset.scene === 'globe') fallback([stage]); },
      }))
      .catch((err) => { console.warn('[scene] WebGL недоступен, фолбэк', err); fallback(stages); });
  });
}
