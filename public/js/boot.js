/* до первой отрисовки: .js, тема, язык, theme-color. отдельным файлом из-за CSP */
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
    /* /en/ и /tg/ в пути важнее языка браузера */
    var path = location.pathname;
    if (path.indexOf('/en/') === 0) l = 'en';
    else if (path.indexOf('/tg/') === 0) l = 'tg';
  }
  if (!l) {
    /* только первичный субтег: fr-TG это Того, не таджикский */
    var tags = (navigator.languages || [navigator.language || 'ru']).map(function (s) {
      return String(s).toLowerCase().split('-')[0];
    });
    l = tags.indexOf('tg') !== -1 ? 'tg' : (tags.indexOf('ru') !== -1 ? 'ru' : 'en');
  }
  d.dataset.lang = l;
  if (l !== 'ru') d.lang = l;

  window.__setThemeColor = function (theme) {
    var color = theme === 'light' ? '#f5f4f0' : '#0f1012';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', color);
  };
  window.__setThemeColor(t);
})();
