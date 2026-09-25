// /craft: язык, тема, виньетки
import { initFailover, initFec, initCongestion, initKillswitch } from './vignettes.js';
import { I18N } from '../i18n.js';

var docEl = document.documentElement;

function applyLang(lang) {
  var dict = I18N[lang];
  if (!dict) return;
  docEl.dataset.lang = lang;
  docEl.lang = lang;
  try { localStorage.setItem('lang', lang); } catch (e) {}
  if (dict['craft.title']) document.title = dict['craft.title'];
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
applyLang(docEl.dataset.lang || 'ru');

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

var INITS = {
  failover: initFailover,
  fec: initFec,
  congestion: initCongestion,
  killswitch: initKillswitch,
};

document.querySelectorAll('.craft-card[data-vignette]').forEach(function (card) {
  var kind = card.dataset.vignette;
  var canvas = card.querySelector('canvas');
  if (canvas && INITS[kind]) INITS[kind](canvas);
});
