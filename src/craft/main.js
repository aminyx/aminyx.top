/* Вход страницы /craft: тема, язык, ленивая инициализация виньеток. */
import { initFailover, initFec, initCongestion, initKillswitch, initTypeLab } from './vignettes.js';

var docEl = document.documentElement;

/* ---------- язык (компактная версия applyLang главной) ---------- */

function applyLang(lang) {
  var dict = window.I18N && window.I18N[lang];
  if (!dict) return;
  docEl.dataset.lang = lang;
  docEl.lang = lang;
  try { localStorage.setItem('lang', lang); } catch (e) {}
  if (dict['craft.title']) document.title = dict['craft.title'];
  /* описание страницы /craft тоже локализуем (иначе в EN/TG оставалось русским) */
  var setMeta = function (sel, val) { var m = document.querySelector(sel); if (m && val) m.setAttribute('content', val); };
  if (dict['craft.desc']) {
    setMeta('meta[name="description"]', dict['craft.desc']);
    setMeta('meta[property="og:description"]', dict['craft.desc']);
  }
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var v = dict[el.dataset.i18n];
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    var v = dict[el.dataset.i18nAria];
    if (v) el.setAttribute('aria-label', v);
  });
  document.querySelectorAll('.lang-switch button').forEach(function (btn) {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });
}

document.querySelectorAll('.lang-switch button').forEach(function (btn) {
  btn.addEventListener('click', function () { applyLang(btn.dataset.lang); });
});
/* в prod-сборке Vite поднимает модуль в head — словари (defer) исполняются
   позже; DOMContentLoaded гарантирует наличие window.I18N */
if (window.I18N) applyLang(docEl.dataset.lang || 'ru');
else document.addEventListener('DOMContentLoaded', function () { applyLang(docEl.dataset.lang || 'ru'); });

/* ---------- тема ---------- */

var themeBtn = document.getElementById('theme-toggle');
function syncThemeBtn() {
  themeBtn.setAttribute('aria-pressed', String(docEl.dataset.theme === 'light'));
}
syncThemeBtn();
themeBtn.addEventListener('click', function () {
  var next = docEl.dataset.theme === 'dark' ? 'light' : 'dark';
  docEl.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) {}
  syncThemeBtn();
  if (window.__setThemeColor) window.__setThemeColor(next);
  window.dispatchEvent(new Event('craft-theme'));
});

/* ---------- виньетки ---------- */

var INITS = {
  failover: initFailover,
  fec: initFec,
  congestion: initCongestion,
  killswitch: initKillswitch,
};

document.querySelectorAll('.craft-card[data-vignette]').forEach(function (card) {
  var kind = card.dataset.vignette;
  if (kind === 'type') { initTypeLab(); return; }
  var canvas = card.querySelector('canvas');
  if (canvas && INITS[kind]) INITS[kind](canvas);
});
