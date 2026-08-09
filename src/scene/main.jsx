/* Точка входа сцены: определяет возможности устройства и лениво грузит
   нужный рендерер ПОСЛЕ первой отрисовки страницы (три-стек тяжёлый,
   контент его не ждёт). Фолбэки:
   WebGL (R3F) → canvas2d → чистый фон. */
const root = document.getElementById('system-root');

/* three 0.185 создаёт только WebGL2-контекст — WebGL1-устройства должны
   уходить в canvas2d, иначе получат пустой субстрат */
function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (e) {
    return false;
  }
}

/* экономия трафика: на Save-Data и 2G не тянем 319 КБ three-чанка
   ради фоновой сцены — canvas2d выглядит достойно и весит 3 КБ */
function liteConnection() {
  const c = navigator.connection;
  return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
}

function whenIdle(fn) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 200);
}

if (root) {
  whenIdle(() => {
    const to2d = () => import('./scene2d.js').then((m) => m.mount2d(root));
    if (hasWebGL2() && !liteConnection()) {
      import('./mount.jsx').then((m) => m.mount(root)).catch(to2d);
    } else {
      to2d();
    }
  });
}
