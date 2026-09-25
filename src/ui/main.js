/* aminyx.top v3 — интерфейс: язык, тема, навигация, reveal, счётчики,
   матрица тестов, прожектор карточек, режимы сцен и полноэкранное 3D,
   командная палитра (Ctrl/⌘+K), терминал (`), Konami, бриф-конструктор. */
import { I18N } from '../i18n.js';

const docEl = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function store(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* приватный режим */ }
}

/* ---------- i18n ---------- */

window.I18N = I18N;
const lang = () => (I18N[docEl.dataset.lang] ? docEl.dataset.lang : 'ru');
function t(key) {
  const d = I18N[lang()];
  return (d && d[key]) || I18N.ru[key] || key;
}
window.__t = t;

function stageH1() {
  const h1 = document.getElementById('hero-h1');
  if (!h1 || reduceMotion) return;
  h1.classList.remove('staged');
  let i = 0;
  $$('[data-i18n]', h1).forEach((part) => {
    const words = part.textContent.trim().split(/\s+/);
    part.textContent = '';
    words.forEach((w, n) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.style.transitionDelay = (90 + i++ * 85) + 'ms';
      s.textContent = w;
      part.appendChild(s);
      if (n < words.length - 1) part.appendChild(document.createTextNode(' '));
    });
  });
  requestAnimationFrame(() => requestAnimationFrame(() => h1.classList.add('staged')));
}

function applyLang(next) {
  const dict = I18N[next];
  if (!dict) return;
  docEl.dataset.lang = next;
  docEl.lang = next;
  store('lang', next);

  document.title = dict['meta.title'];
  const setMeta = (sel, val) => { const m = $(sel); if (m && val) m.setAttribute('content', val); };
  setMeta('meta[name="description"]', dict['meta.desc']);
  setMeta('meta[property="og:title"]', dict['meta.title']);
  setMeta('meta[property="og:description"]', dict['meta.desc']);
  setMeta('meta[property="og:image:alt"]', dict['meta.ogAlt']);

  $$('[data-i18n]').forEach((el) => { const v = dict[el.dataset.i18n]; if (v) el.textContent = v; });
  $$('[data-i18n-aria]').forEach((el) => { const v = dict[el.dataset.i18nAria]; if (v) el.setAttribute('aria-label', v); });
  $$('[data-i18n-alt]').forEach((el) => { const v = dict[el.dataset.i18nAlt]; if (v) el.setAttribute('alt', v); });
  $$('[data-i18n-ph]').forEach((el) => { const v = dict[el.dataset.i18nPh]; if (v) el.setAttribute('placeholder', v); });
  $$('.lang-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));

  const mail = $('.contact-cta a[href^="mailto:"]');
  if (mail) mail.href = 'mailto:itsaminyx@gmail.com?subject=' + encodeURIComponent(t('brief.subject'));

  stageH1();
  renderBrief();
  window.dispatchEvent(new CustomEvent('langchange', { detail: next }));
}

/* View Transition: смена языка — короткий кросс-фейд; без API и под
   reduced-motion — мгновенно. Прерванный переход отклоняет промисы
   с InvalidStateError — это ожидаемо, гасим. */
function withTransition(apply) {
  if (!document.startViewTransition || reduceMotion) { apply(); return null; }
  const vt = document.startViewTransition(apply);
  vt.ready.catch(() => {});
  vt.finished.catch(() => {});
  return vt;
}

$$('.lang-switch button').forEach((btn) => {
  btn.addEventListener('click', () => withTransition(() => applyLang(btn.dataset.lang)));
});

/* ---------- Тема: круг раскрывается от кнопки ---------- */

const themeBtn = $('#theme-toggle');
function syncThemeBtn() {
  $$('.theme-toggle').forEach((b) => b.setAttribute('aria-pressed', String(docEl.dataset.theme === 'light')));
}
function setTheme(next, origin) {
  if (next === docEl.dataset.theme) return;
  const apply = () => {
    docEl.dataset.theme = next;
    store('theme', next);
    syncThemeBtn();
    if (window.__setThemeColor) window.__setThemeColor(next);
    window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    drawMatrix(matrixProgress);
  };
  if (!document.startViewTransition || reduceMotion) { apply(); return; }
  const r = origin ? origin.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : window.innerWidth - 40;
  const y = r ? r.top + r.height / 2 : 40;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  docEl.classList.add('vt-theme');
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    docEl.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
    );
  }).catch(() => {});
  vt.finished.catch(() => {}).then(() => docEl.classList.remove('vt-theme'));
}
const toggleTheme = (origin) => setTheme(docEl.dataset.theme === 'dark' ? 'light' : 'dark', origin);
syncThemeBtn();
$$('.theme-toggle').forEach((b) => b.addEventListener('click', () => toggleTheme(b)));

/* ---------- Тосты ---------- */

const toasts = $('#toasts');
function toast(msg, bad) {
  if (!toasts || !msg) return;
  const el = document.createElement('div');
  el.className = bad ? 'toast is-bad' : 'toast';
  el.textContent = msg;
  toasts.appendChild(el);
  while (toasts.childElementCount > 3) toasts.firstElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2400);
}

/* запасной путь для браузеров без Clipboard API или с отказом в доступе */
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}
/* резолвится в true/false; «Скопировано» показываем только при успехе */
function copy(text, msg) {
  const report = (ok) => {
    toast(ok ? (msg || t('contact.copied')) : t('toast.copyFail'), !ok);
    return ok;
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => report(true), () => report(legacyCopy(text)));
  }
  return Promise.resolve(report(legacyCopy(text)));
}

/* ---------- Контакты: ник, шаринг ---------- */

const nick = $('#nick-copy');
if (nick) {
  nick.addEventListener('click', () => {
    copy('@itsaminyx').then((ok) => {
      if (!ok) return;
      nick.textContent = t('contact.copied');
      nick.classList.add('copied');
      setTimeout(() => { nick.textContent = '@itsaminyx'; nick.classList.remove('copied'); }, 1400);
    });
  });
}
function share() {
  if (navigator.share) {
    navigator.share({ title: document.title, url: location.origin + location.pathname }).catch(() => {});
  } else {
    copy('https://aminyx.top/', t('toast.link'));
  }
}
const shareLi = $('#share-li');
if (shareLi && navigator.share) {
  shareLi.hidden = false;
  $('#share-btn').addEventListener('click', share);
}

/* ---------- Навигация ---------- */

const nav = $('#nav');
const sentinel = document.createElement('div');
sentinel.setAttribute('aria-hidden', 'true');
sentinel.style.cssText = 'position:absolute;top:0;left:0;height:24px;width:1px;pointer-events:none;';
document.body.prepend(sentinel);
new IntersectionObserver((entries) => {
  nav.classList.toggle('scrolled', !entries[entries.length - 1].isIntersecting);
}).observe(sentinel);

const burger = $('#burger');
const navLinks = $('#nav-links');
function setInert(on) {
  ['main', 'footer'].forEach((sel) => {
    const el = $(sel);
    if (el) el.inert = on;
  });
}
function closeMenu() {
  navLinks.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  setInert(false);
}
burger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  setInert(open);
});
$$('a', navLinks).forEach((a) => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navLinks.classList.contains('open')) { closeMenu(); burger.focus(); }
});
window.matchMedia('(max-width: 960px)').addEventListener('change', (e) => {
  if (!e.matches && navLinks.classList.contains('open')) closeMenu();
});
const wm = $('.nav .wordmark');
if (wm) wm.addEventListener('click', closeMenu);

/* scroll-spy: активна секция, пересёкшая середину экрана */
const spyLinks = {};
$$('a[href^="#"]', navLinks).forEach((a) => { spyLinks[a.getAttribute('href').slice(1)] = a; });
const spyEls = Object.keys(spyLinks).map((id) => document.getElementById(id)).filter(Boolean);
if (spyEls.length) {
  const updateSpy = () => {
    const mid = window.innerHeight * 0.5;
    let activeId = null, best = -Infinity;
    spyEls.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      if (top <= mid && top > best) { best = top; activeId = el.id; }
    });
    spyEls.forEach((el) => spyLinks[el.id].classList.toggle('active', el.id === activeId));
  };
  const spy = new IntersectionObserver(updateSpy, { rootMargin: '-50% 0px -50% 0px' });
  spyEls.forEach((el) => spy.observe(el));
  updateSpy();
}

/* ---------- Reveal ---------- */

const revealEls = $$('.reveal');
if (!reduceMotion && 'IntersectionObserver' in window) {
  const ro = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); ro.unobserve(entry.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px 60px 0px' });
  revealEls.forEach((el) => ro.observe(el));
  /* страховка: всё, что уже на экране, но не получило callback */
  setTimeout(() => {
    revealEls.forEach((el) => {
      if (el.classList.contains('in')) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
    });
  }, 1200);
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

/* ---------- Счётчики ---------- */

function animateCount(el) {
  const target = parseInt(el.dataset.count, 10);
  if (!target || reduceMotion) { el.textContent = String(el.dataset.count); return; }
  const t0 = performance.now(), dur = 1200;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if ('IntersectionObserver' in window && !reduceMotion) {
  const co = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { animateCount(entry.target); co.unobserve(entry.target); }
    });
  }, { threshold: 0.6 });
  $$('.count').forEach((el) => co.observe(el));
}

/* ---------- Матрица 731 теста: 43 × 17 = 731 ---------- */

const matrix = $('#test-matrix');
const mctx = matrix ? matrix.getContext('2d') : null;
let matrixProgress = reduceMotion ? 1 : 0;
const COLS = 43, ROWS = 17, TOTAL = 731;

function drawMatrix(progress) {
  if (!mctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = matrix.getBoundingClientRect();
  if (rect.width < 4) return;
  matrix.width = Math.round(rect.width * dpr);
  matrix.height = Math.round(rect.height * dpr);
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height, gap = 2.2;
  const cw = (W - gap * (COLS - 1)) / COLS;
  const ch = (H - gap * (ROWS - 1)) / ROWS;
  const cs = getComputedStyle(docEl);
  const accent = cs.getPropertyValue('--accent').trim();
  const dim = cs.getPropertyValue('--line-3').trim();
  const lit = Math.round(TOTAL * progress);
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (n >= TOTAL) break;
      if (n < lit) {
        mctx.fillStyle = accent;
        mctx.globalAlpha = 0.35 + 0.4 * Math.min(1, (lit - n) / 80);
      } else {
        mctx.fillStyle = dim;
        mctx.globalAlpha = 0.55;
      }
      const x = c * (cw + gap), y = r * (ch + gap), rad = Math.min(cw, ch) * 0.22;
      mctx.beginPath();
      if (mctx.roundRect) mctx.roundRect(x, y, cw, ch, rad); else mctx.rect(x, y, cw, ch);
      mctx.fill();
      n++;
    }
  }
  mctx.globalAlpha = 1;
}
function fillMatrix() {
  if (reduceMotion) { matrixProgress = 1; drawMatrix(1); return; }
  const t0 = performance.now(), dur = 1800;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    matrixProgress = 1 - Math.pow(1 - p, 2);
    drawMatrix(matrixProgress);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if (matrix) {
  if (reduceMotion || !('IntersectionObserver' in window)) {
    drawMatrix(1);
  } else {
    const mo = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1].isIntersecting) { fillMatrix(); mo.disconnect(); }
    }, { threshold: 0.35 });
    mo.observe(matrix);
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => drawMatrix(matrixProgress)).observe(matrix);
}

/* ---------- Прожектор карточек (только точный указатель) ---------- */

if (finePointer && !reduceMotion) {
  /* не чаще кадра: чтение геометрии и запись свойств в одном rAF */
  let pending = null;
  document.addEventListener('pointermove', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('.spot') : null;
    if (!el) return;
    const first = !pending;
    pending = { el, x: e.clientX, y: e.clientY };
    if (!first) return;
    requestAnimationFrame(() => {
      const { el: target, x, y } = pending;
      pending = null;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', (x - r.left).toFixed(0) + 'px');
      target.style.setProperty('--my', (y - r.top).toFixed(0) + 'px');
    });
  }, { passive: true });
}

/* ---------- Сцены: режим 3D / скриншот ---------- */

$$('.stage-modes').forEach((group) => {
  const stage = group.closest('.stage');
  $$('button', group).forEach((btn) => {
    btn.addEventListener('click', () => {
      stage.dataset.mode = btn.dataset.mode;
      $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });
});

/* ---------- 3D на весь экран: канвас переезжает в диалог и обратно ---------- */

const explore = $('#explore');
const exploreBody = $('#explore-body');
let exploreBack = null;
function openExplore(stage) {
  if (!explore || !explore.showModal || !stage.classList.contains('gl-on')) return;
  const canvas = $('.stage-gl', stage);
  const hud = $('.stage-hud', stage);
  const caseEl = stage.closest('.case');
  const title = caseEl ? $('.h3-case', caseEl).textContent : 'Aminyx Link';
  const hint = $('.stage-hint', stage) || $('#hero-hint');
  $('#explore-h').textContent = title;
  $('#explore-hint').textContent = t('explore.hint') + (hint ? ' · ' + hint.textContent.trim() : '');
  const marks = [canvas, hud].filter(Boolean).map((el) => {
    const mark = document.createComment('explore');
    el.replaceWith(mark);
    exploreBody.appendChild(el);
    return [el, mark];
  });
  exploreBack = () => marks.forEach(([el, mark]) => mark.replaceWith(el));
  explore.showModal();
  canvas.focus({ preventScroll: true });
  if (window.__gl) window.__gl.focus(canvas);
  canvas.dispatchEvent(new CustomEvent('explore', { detail: true }));
  exploreBack.canvas = canvas;
  exploreBack.stage = stage;
}
function closeExplore() {
  if (!exploreBack) return;
  const { canvas, stage } = exploreBack;
  exploreBack();
  exploreBack = null;
  if (window.__gl) window.__gl.focus(null);
  canvas.dispatchEvent(new CustomEvent('explore', { detail: false }));
  const btn = $('.stage-expand', stage);
  if (btn) btn.focus({ preventScroll: true });
}
if (explore) {
  $('#explore-close').addEventListener('click', () => explore.close());
  explore.addEventListener('close', closeExplore);
}
$$('.stage-expand').forEach((btn) => btn.addEventListener('click', () => openExplore(btn.closest('.stage'))));

/* ---------- Бриф-конструктор ---------- */

const brief = $('#brief');
const briefText = $('#brief-text');
const briefPreview = $('#brief-preview');
function composeBrief() {
  if (!brief) return { text: '', empty: true };
  const label = (input) => input.nextElementSibling.textContent.trim();
  const what = $$('input[name="what"]:checked', brief).map(label);
  const when = $('input[name="when"]:checked', brief);
  const about = briefText.value.trim();
  const lines = [t('brief.hello')];
  if (what.length) lines.push(t('brief.needL') + ': ' + what.join(', '));
  if (when) lines.push(t('brief.when') + ': ' + label(when));
  if (about) lines.push(t('brief.aboutL') + ': ' + about);
  return { text: lines.join('\n'), empty: !what.length && !when && !about };
}
function renderBrief() {
  if (!briefPreview) return;
  const b = composeBrief();
  briefPreview.textContent = b.empty ? t('brief.empty') : b.text;
  briefPreview.classList.toggle('is-empty', b.empty);
}
if (brief) {
  brief.addEventListener('change', renderBrief);
  briefText.addEventListener('input', renderBrief);
  $('#brief-tg').addEventListener('click', () => {
    const b = composeBrief();
    const text = b.empty ? t('brief.hello') : b.text;
    copy(text, t('toast.briefTg'));
    /* окно открываем синхронно в обработчике клика — иначе блокировщик
       попапов съест его после асинхронного clipboard */
    window.open('https://t.me/itsaminyx?text=' + encodeURIComponent(text), '_blank', 'noopener');
  });
  $('#brief-mail').addEventListener('click', () => {
    const b = composeBrief();
    location.href = 'mailto:itsaminyx@gmail.com?subject=' + encodeURIComponent(t('brief.subject')) +
      '&body=' + encodeURIComponent(b.empty ? t('brief.hello') : b.text);
  });
  $('#brief-copy').addEventListener('click', () => copy(composeBrief().text));
}

/* ---------- Живая сеть: пульт сцены ---------- */

const sys = () => window.__system || null;
const chaosHud = $('#chaos-hud');
let chaosOn = false;
function setChaosMode(on, silent) {
  if (on && !sys()) return false;
  chaosOn = on;
  if (sys()) sys().chaos(on);
  if (chaosHud) chaosHud.hidden = !on;
  if (!silent) toast(t(on ? 'toast.chaosOn' : 'toast.chaosOff'));
  return true;
}
function toggleSfx() {
  if (!sys()) return;
  const on = !sys().sfxOn();
  sys().sfx(on);
  toast(t(on ? 'toast.sfxOn' : 'toast.sfxOff'));
}

/* ---------- Терминал (клавиша `) ---------- */

let term = null, termLog = null, termInput = null, termOpen = false, termPrevFocus = null;
const termHistory = [];
let histPos = 0;

function termPrint(text, cls) {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  termLog.appendChild(line);
  while (termLog.childElementCount > 60) termLog.removeChild(termLog.firstChild);
  termLog.scrollTop = termLog.scrollHeight;
}

const SECTIONS = { top: '#top', services: '#services', work: '#work', code: '#oss', oss: '#oss', process: '#process', faq: '#faq', contact: '#contact', brief: '#brief', proof: '#proof' };
const PROJECTS = { somonvpn: '#p-somonvpn', link: '#p-link', cybersec: '#course', tracker: '#p-tracker', maryam: '#p-maryam', hunter: '#p-hunter' };

function go(hash) {
  const el = $(hash);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  if (window.history.replaceState) window.history.replaceState(null, '', hash);
}

function runCommand(raw) {
  const parts = raw.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase(), arg = (parts[1] || '').toLowerCase();
  if (!cmd) return;
  termPrint('❯ ' + raw, 'dim');
  const s = sys();
  const warm = () => termPrint('system: warming up… (scroll to the top to wake the network)');
  switch (cmd) {
    case 'help':
      termPrint('network  status · kill [n] · heal · storm · chaos on|off · sfx on|off');
      termPrint('site     goto <section> · open <project> · projects · theme dark|light · lang ru|tg|en');
      termPrint('misc     whoami · contact · palette · clear · exit');
      break;
    case 'status': {
      if (!s) { warm(); break; }
      const st = s.stats();
      termPrint(`nodes ${st.alive}/${st.nodes} alive · edges ${st.edges} · packets in flight ${st.packets}`, 'ok');
      termPrint(`failovers ${st.failovers} · manual kills ${st.kills} · chaos ${st.chaos ? 'ON' : 'off'} · sfx ${s.sfxOn() ? 'on' : 'off'}`);
      break;
    }
    case 'kill': {
      if (!s) { warm(); break; }
      const n = Math.min(parseInt(arg, 10) || 1, 12);
      termPrint(`killed ${s.kill(n)} node(s) — watch the failover`, 'ok');
      break;
    }
    case 'heal':
      if (!s) { warm(); break; }
      s.heal(); termPrint('all nodes healing', 'ok');
      break;
    case 'storm':
      if (!s) { warm(); break; }
      s.storm(); termPrint('storm injected — the system will survive', 'ok');
      break;
    case 'chaos':
      if (!s) { warm(); break; }
      setChaosMode(arg !== 'off', true);
      termPrint('chaos mode ' + (arg !== 'off' ? 'ENGAGED' : 'off'), 'ok');
      break;
    case 'sfx':
      if (!s) { warm(); break; }
      s.sfx(arg === 'on'); termPrint('sfx ' + (arg === 'on' ? 'on' : 'off'), 'ok');
      break;
    case 'theme':
      if (arg === 'dark' || arg === 'light') { setTheme(arg, themeBtn); termPrint('theme: ' + arg, 'ok'); }
      else termPrint('usage: theme dark|light');
      break;
    case 'lang':
      if (I18N[arg]) { applyLang(arg); termPrint('lang: ' + arg, 'ok'); }
      else termPrint('usage: lang ru|tg|en');
      break;
    case 'goto': case 'cd':
      if (SECTIONS[arg]) { go(SECTIONS[arg]); termPrint('→ ' + arg, 'ok'); }
      else termPrint('sections: ' + Object.keys(SECTIONS).join(' · '));
      break;
    case 'open':
      if (PROJECTS[arg]) { go(PROJECTS[arg]); termPrint('→ ' + arg, 'ok'); }
      else termPrint('projects: ' + Object.keys(PROJECTS).join(' · '));
      break;
    case 'projects': case 'ls':
      termPrint('somonvpn  link  cybersec  tracker  maryam  hunter   — open <name>');
      break;
    case 'whoami':
      termPrint('Aminjon Azizov (aminyx) — full-stack & security engineer. Go · Rust · Kotlin · Python · TypeScript', 'ok');
      break;
    case 'contact':
      termPrint('telegram  https://t.me/itsaminyx');
      termPrint('email     itsaminyx@gmail.com');
      break;
    case 'palette':
      toggleTerm(false); openPalette();
      break;
    case 'clear':
      termLog.textContent = '';
      break;
    case 'exit': case 'q':
      toggleTerm(false);
      break;
    case 'sudo':
      termPrint('nice try. permission is granted by the owner, not the shell.');
      break;
    default:
      termPrint(`unknown command: ${cmd} — try help`);
  }
}

function buildTerm() {
  term = document.createElement('div');
  term.className = 'sys-terminal';
  term.setAttribute('role', 'dialog');
  term.setAttribute('aria-label', 'System terminal');
  const chrome = document.createElement('div');
  chrome.className = 'sys-chrome';
  chrome.innerHTML = '<i></i><i></i><i></i><span>aminyx — system terminal</span>';
  termLog = document.createElement('div');
  termLog.className = 'sys-log';
  termLog.setAttribute('aria-live', 'polite');
  const line = document.createElement('form');
  line.className = 'sys-line';
  termInput = document.createElement('input');
  termInput.type = 'text';
  termInput.setAttribute('aria-label', 'terminal command');
  termInput.setAttribute('autocomplete', 'off');
  termInput.setAttribute('autocapitalize', 'off');
  termInput.setAttribute('spellcheck', 'false');
  line.appendChild(termInput);
  term.append(chrome, termLog, line);
  document.body.appendChild(term);
  line.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = termInput.value;
    if (v.trim()) { termHistory.push(v); histPos = termHistory.length; }
    runCommand(v);
    termInput.value = '';
  });
  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && histPos > 0) { termInput.value = termHistory[--histPos]; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { histPos = Math.min(termHistory.length, histPos + 1); termInput.value = termHistory[histPos] || ''; e.preventDefault(); }
  });
  termPrint('aminyx system terminal — drives the real simulation behind the hero', 'ok');
  termPrint('type help to list commands', 'dim');
}

function toggleTerm(open) {
  if (open && !term) buildTerm();
  if (!term) return;
  termOpen = open;
  term.hidden = !open;
  if (open) {
    termPrevFocus = document.activeElement;
    termInput.focus();
  } else if (termPrevFocus && document.contains(termPrevFocus)) {
    termPrevFocus.focus();
    termPrevFocus = null;
  }
}

/* ---------- Командная палитра ---------- */

const cmdk = $('#cmdk');
const cmdkInput = $('#cmdk-input');
const cmdkList = $('#cmdk-list');
let cmdkItems = [], cmdkActive = 0, cmdkPrevFocus = null;

function commands() {
  const out = [];
  const add = (group, ico, label, run, kw) => out.push({ group, ico, label, run, kw: kw || '' });
  add('cmdk.gNav', '§', t('nav.services'), () => go('#services'), 'services услуги хизмат');
  add('cmdk.gNav', '§', t('nav.work'), () => go('#work'), 'work работы корҳо portfolio');
  add('cmdk.gNav', '§', t('nav.oss'), () => go('#oss'), 'open source github код рамз');
  add('cmdk.gNav', '§', t('nav.process'), () => go('#process'), 'process процесс раванд');
  add('cmdk.gNav', '§', t('cmdk.faq'), () => go('#faq'), 'faq вопросы саволҳо questions');
  add('cmdk.gNav', '§', t('nav.contact'), () => go('#contact'), 'contact контакты тамос');
  add('cmdk.gNav', '↑', t('footer.top'), () => go('#top'), 'top hero наверх');
  add('cmdk.gNav', '⚗', t('cmdk.craft'), () => { location.href = '/craft/'; }, 'craft lab лаборатория');
  [['SomonVPN', '#p-somonvpn', 'vpn'], ['Aminyx Link', '#p-link', 'rust multipath'], ['Cybersec', '#course', 'курс course ctf'],
    ['Somoni Tracker', '#p-tracker', 'tracker трекер telegram'], ['maryam.best', '#p-maryam', 'maryam dna'], ['Username Hunter', '#p-hunter', 'hunter mtproto']]
    .forEach(([name, hash, kw]) => add('cmdk.gProjects', '◆', name, () => go(hash), kw));
  add('cmdk.gActions', '✈', t('cmdk.tg'), () => window.open('https://t.me/itsaminyx', '_blank', 'noopener'), 'telegram написать');
  add('cmdk.gActions', '@', t('cmdk.mail'), () => { location.href = 'mailto:itsaminyx@gmail.com?subject=' + encodeURIComponent(t('brief.subject')); }, 'email почта mail');
  add('cmdk.gActions', '✎', t('cmdk.brief'), () => { go('#brief'); setTimeout(() => { const f = $('#brief input'); if (f) f.focus({ preventScroll: true }); }, reduceMotion ? 0 : 600); }, 'brief бриф заказ order');
  add('cmdk.gActions', '⧉', t('cmdk.copyEmail'), () => copy('itsaminyx@gmail.com', t('toast.email')), 'copy email');
  add('cmdk.gActions', '⧉', t('a11y.copyNick'), () => copy('@itsaminyx'), 'copy nick telegram');
  add('cmdk.gActions', '⧉', t('cmdk.copyLink'), () => copy('https://aminyx.top/', t('toast.link')), 'copy link url');
  add('cmdk.gActions', '◐', t('a11y.theme'), () => toggleTheme(themeBtn), 'theme тема dark light мавзӯъ');
  [['ru', 'Русский'], ['tg', 'Тоҷикӣ'], ['en', 'English']].forEach(([code, name]) => {
    if (code !== lang()) add('cmdk.gActions', code.toUpperCase(), t('a11y.lang') + ': ' + name, () => withTransition(() => applyLang(code)), 'language язык забон ' + code);
  });
  if (navigator.share) add('cmdk.gActions', '↗', t('contact.share'), share, 'share');
  add('cmdk.gSystem', '❯', t('cmdk.terminal'), () => toggleTerm(true), 'terminal console терминал');
  add('cmdk.gSystem', '✺', t('cmdk.storm'), () => { if (sys()) { sys().storm(); go('#top'); } }, 'storm шторм chaos');
  add('cmdk.gSystem', '⚠', t('cmdk.chaos'), () => { if (setChaosMode(!chaosOn)) go('#top'); }, 'chaos хаос konami');
  add('cmdk.gSystem', '✚', t('cmdk.heal'), () => { if (sys()) { sys().heal(); setChaosMode(false, true); toast(t('toast.healed')); } }, 'heal лечить');
  add('cmdk.gSystem', '♪', t('cmdk.sfx'), toggleSfx, 'sound sfx звук');
  add('cmdk.gLinks', '↗', 'GitHub', () => window.open('https://github.com/aminyx', '_blank', 'noopener'), 'github');
  add('cmdk.gLinks', '↗', 'X', () => window.open('https://x.com/itsaminyx', '_blank', 'noopener'), 'twitter x');
  add('cmdk.gLinks', '↗', t('contact.channel'), () => window.open('https://t.me/isaminyx', '_blank', 'noopener'), 'channel канал');
  add('cmdk.gLinks', '§', t('footer.privacy'), () => { location.href = '/privacy/'; }, 'privacy');
  return out;
}

function norm(s) { return s.toLowerCase().replace(/ё/g, 'е'); }
function renderPalette() {
  const q = norm(cmdkInput.value.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  cmdkItems = commands().filter((c) => {
    const hay = norm(c.label + ' ' + c.kw + ' ' + t(c.group));
    return terms.every((w) => hay.includes(w));
  });
  cmdkList.textContent = '';
  if (!cmdkItems.length) {
    const li = document.createElement('li');
    li.className = 'cmdk-empty';
    li.setAttribute('role', 'presentation');
    li.textContent = t('cmdk.empty');
    cmdkList.appendChild(li);
    cmdkInput.removeAttribute('aria-activedescendant');
    return;
  }
  let lastGroup = null;
  cmdkItems.forEach((c, i) => {
    if (c.group !== lastGroup) {
      lastGroup = c.group;
      const g = document.createElement('li');
      g.className = 'cmdk-group';
      g.setAttribute('role', 'presentation');
      g.textContent = t(c.group);
      cmdkList.appendChild(g);
    }
    const li = document.createElement('li');
    li.className = 'cmdk-item';
    li.id = 'cmdk-opt-' + i;
    li.setAttribute('role', 'option');
    const ico = document.createElement('span');
    ico.className = 'ci-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = c.ico;
    const label = document.createElement('span');
    label.className = 'ci-label';
    label.textContent = c.label;
    li.append(ico, label);
    li.addEventListener('pointermove', () => setActive(i, false));
    li.addEventListener('click', () => runItem(i));
    cmdkList.appendChild(li);
  });
  setActive(Math.min(cmdkActive, cmdkItems.length - 1), true);
}
function setActive(i, scroll) {
  cmdkActive = i;
  $$('.cmdk-item', cmdkList).forEach((el, n) => el.setAttribute('aria-selected', String(n === i)));
  const el = document.getElementById('cmdk-opt-' + i);
  if (el) {
    cmdkInput.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }
}
function runItem(i) {
  const c = cmdkItems[i];
  if (!c) return;
  cmdk.close();
  c.run();
}
function openPalette() {
  if (!cmdk || !cmdk.showModal || cmdk.open) return;
  if (navLinks.classList.contains('open')) closeMenu();
  cmdkPrevFocus = document.activeElement;
  cmdkInput.value = '';
  cmdkActive = 0;
  renderPalette();
  cmdk.showModal();
  cmdkInput.focus();
}
if (cmdk) {
  cmdkInput.addEventListener('input', () => { cmdkActive = 0; renderPalette(); });
  cmdkInput.addEventListener('keydown', (e) => {
    const n = cmdkItems.length;
    if (e.key === 'ArrowDown' && n) { setActive((cmdkActive + 1) % n, true); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && n) { setActive((cmdkActive - 1 + n) % n, true); e.preventDefault(); }
    else if (e.key === 'Home' && n) { setActive(0, true); e.preventDefault(); }
    else if (e.key === 'End' && n) { setActive(n - 1, true); e.preventDefault(); }
    else if (e.key === 'Enter') { runItem(cmdkActive); e.preventDefault(); }
  });
  /* клик по подложке закрывает */
  cmdk.addEventListener('click', (e) => { if (e.target === cmdk) cmdk.close(); });
  cmdk.addEventListener('close', () => {
    if (cmdkPrevFocus && document.contains(cmdkPrevFocus) && document.activeElement === document.body) cmdkPrevFocus.focus({ preventScroll: true });
  });
  $('#cmdk-open').addEventListener('click', openPalette);
}
$$('.kbd-mod').forEach((k) => { k.textContent = isMac ? '⌘' : 'Ctrl'; });

/* ---------- Горячие клавиши ---------- */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let kPos = 0;
document.addEventListener('keydown', (e) => {
  const tEl = e.target;
  const typing = tEl && (tEl.tagName === 'INPUT' || tEl.tagName === 'TEXTAREA' || tEl.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л' || e.code === 'KeyK')) {
    e.preventDefault();
    if (cmdk && cmdk.open) cmdk.close(); else openPalette();
    return;
  }
  const anyDialog = (cmdk && cmdk.open) || (explore && explore.open);
  /* та же физическая клавиша на русской/таджикской раскладке даёт «ё» */
  const termKey = e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё' || e.code === 'Backquote';
  if (termKey && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && !anyDialog) {
    e.preventDefault();
    toggleTerm(!termOpen);
    return;
  }
  if (e.key === 'Escape' && termOpen) { toggleTerm(false); return; }
  if (e.key === '/' && !typing && !anyDialog && !termOpen) { e.preventDefault(); openPalette(); return; }
  if (!typing) {
    const key = e.key || '';
    kPos = (key === KONAMI[kPos] || key.toLowerCase() === KONAMI[kPos]) ? kPos + 1 : (key === KONAMI[0] ? 1 : 0);
    if (kPos === KONAMI.length) { kPos = 0; setChaosMode(!chaosOn); }
  }
});

/* ---------- Старт ---------- */

applyLang(lang());
window.__ui = { toast, t, applyLang, setTheme, openPalette, toggleTerm };

try {
  console.log(
    '%caminyx.%c\n\nГлобус в hero — настоящая симуляция multipath-failover, все сцены — один WebGL-контекст.\nCtrl/⌘+K — палитра, ` — терминал. Или сразу: https://t.me/itsaminyx',
    'font: 800 28px Onest, sans-serif; color: #e8ac3f;',
    'font: 12px JetBrains Mono, monospace; color: #808998;'
  );
} catch (e) { /* консоль недоступна */ }
