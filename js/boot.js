/* Выполняется до отрисовки: класс js, тема, язык, цвет браузерной панели.
   Вынесен из инлайна ради строгой CSP (script-src 'self'). */
(function () {
  var d = document.documentElement;
  d.classList.add('js');

  var t = null, l = null;
  try {
    t = localStorage.getItem('theme');
    l = localStorage.getItem('lang');
  } catch (e) {}

  if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  d.dataset.theme = t;

  if (!l) {
    var langs = (navigator.languages || [navigator.language || 'ru']).join(',').toLowerCase();
    l = langs.indexOf('tg') !== -1 ? 'tg' : (langs.indexOf('ru') !== -1 ? 'ru' : 'en');
  }
  d.dataset.lang = l;
  if (l !== 'ru') d.lang = l;

  window.__setThemeColor = function (theme) {
    var color = theme === 'light' ? '#f7f8fa' : '#0b0c0f';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', color);
  };
  window.__setThemeColor(t);
})();
