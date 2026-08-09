/* Точка входа сцены: определяет возможности устройства и лениво грузит
   нужный рендерер ПОСЛЕ первой отрисовки страницы (три-стек тяжёлый,
   контент его не ждёт). Фолбэки:
   WebGL (R3F) → canvas2d → чистый фон. */
const root = document.getElementById('system-root');

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

function whenIdle(fn) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 200);
}

if (root) {
  whenIdle(() => {
    if (hasWebGL()) {
      import('./mount.jsx').then((m) => m.mount(root));
    } else {
      import('./scene2d.js').then((m) => m.mount2d(root));
    }
  });
}
