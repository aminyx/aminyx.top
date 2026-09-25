import { I18N } from '../i18n.js';

const docEl = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function store(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {} // приватный режим
}

const lang = () => (I18N[docEl.dataset.lang] ? docEl.dataset.lang : 'ru');
function t(key) {
  const d = I18N[lang()];
  return (d && d[key]) || I18N.ru[key] || key;
}
window.__t = t;

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

  renderBrief();
  window.dispatchEvent(new CustomEvent('langchange', { detail: next }));
}

// прерванный VT реджектит ready/finished (InvalidStateError), глушим
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

function syncThemeBtn() {
  $$('.theme-toggle').forEach((b) => b.setAttribute('aria-pressed', String(docEl.dataset.theme === 'light')));
}
function setTheme(next) {
  if (next === docEl.dataset.theme) return;
  docEl.dataset.theme = next;
  store('theme', next);
  syncThemeBtn();
  if (window.__setThemeColor) window.__setThemeColor(next);
  window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
}
const toggleTheme = () => setTheme(docEl.dataset.theme === 'dark' ? 'light' : 'dark');
syncThemeBtn();
$$('.theme-toggle').forEach((b) => b.addEventListener('click', () => toggleTheme()));

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

// запасной путь для браузеров без Clipboard API или с отказом в доступе
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
// резолвится в true/false, тост об успехе только если копирование прошло
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

// scroll-spy: активна секция, пересёкшая середину экрана
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


$$('.stage-modes').forEach((group) => {
  const stage = group.closest('.stage');
  $$('button', group).forEach((btn) => {
    btn.addEventListener('click', () => {
      stage.dataset.mode = btn.dataset.mode;
      $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });
});

const explore = $('#explore');
const exploreBody = $('#explore-body');
let exploreBack = null;
function openExplore(stage) {
  if (!explore || !explore.showModal || !stage.classList.contains('gl-on')) return;
  const canvas = $('.stage-gl', stage);
  const hud = $('.stage-hud', stage);
  const caseEl = stage.closest('.case');
  const title = caseEl ? $('.h3-case', caseEl).textContent : 'Aminyx Link';
  const hint = document.getElementById(canvas.getAttribute('aria-describedby')) || $('#hero-hint');
  $('#explore-h').textContent = title;
  $('#explore-hint').textContent = t('explore.hint') + (hint ? '. ' + hint.textContent.trim() : '');
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
    // window.open синхронно в click, иначе съест попап-блокер
    window.open('https://t.me/itsaminyx?text=' + encodeURIComponent(text), '_blank', 'noopener');
  });
  $('#brief-mail').addEventListener('click', () => {
    const b = composeBrief();
    location.href = 'mailto:itsaminyx@gmail.com?subject=' + encodeURIComponent(t('brief.subject')) +
      '&body=' + encodeURIComponent(b.empty ? t('brief.hello') : b.text);
  });
  $('#brief-copy').addEventListener('click', () => copy(composeBrief().text));
}

const sys = () => window.__system || null;
function toggleSfx() {
  if (!sys()) return;
  const on = !sys().sfxOn();
  sys().sfx(on);
  toast(t(on ? 'toast.sfxOn' : 'toast.sfxOff'));
}

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

const SECTIONS = { top: '#top', work: '#work', code: '#oss', oss: '#oss', services: '#services', faq: '#faq', contact: '#contact', brief: '#brief' };
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
  const warm = () => termPrint('network not loaded yet, scroll up to the globe');
  switch (cmd) {
    case 'help':
      termPrint('network: status, kill [n], heal, storm, chaos on|off, sfx on|off');
      termPrint('site:    goto <section>, open <project>, projects, theme dark|light, lang ru|tg|en');
      termPrint('misc:    whoami, contact, palette, clear, exit');
      break;
    case 'status': {
      if (!s) { warm(); break; }
      const st = s.stats();
      termPrint(`nodes ${st.alive}/${st.nodes} alive, ${st.edges} edges, ${st.packets} packets in flight`, 'ok');
      termPrint(`failovers ${st.failovers}, manual kills ${st.kills}, chaos ${st.chaos ? 'on' : 'off'}, sfx ${s.sfxOn() ? 'on' : 'off'}`);
      break;
    }
    case 'kill': {
      if (!s) { warm(); break; }
      const n = Math.min(parseInt(arg, 10) || 1, 12);
      termPrint(`killed ${s.kill(n)} node(s)`, 'ok');
      break;
    }
    case 'heal':
      if (!s) { warm(); break; }
      s.heal(); termPrint('healing all nodes', 'ok');
      break;
    case 'storm':
      if (!s) { warm(); break; }
      s.storm(); termPrint('storm started', 'ok');
      break;
    case 'chaos':
      if (!s) { warm(); break; }
      s.chaos(arg !== 'off');
      termPrint('chaos ' + (arg !== 'off' ? 'on' : 'off'), 'ok');
      break;
    case 'sfx':
      if (!s) { warm(); break; }
      s.sfx(arg === 'on'); termPrint('sfx ' + (arg === 'on' ? 'on' : 'off'), 'ok');
      break;
    case 'theme':
      if (arg === 'dark' || arg === 'light') { setTheme(arg); termPrint('theme: ' + arg, 'ok'); }
      else termPrint('usage: theme dark|light');
      break;
    case 'lang':
      if (I18N[arg]) { applyLang(arg); termPrint('lang: ' + arg, 'ok'); }
      else termPrint('usage: lang ru|tg|en');
      break;
    case 'goto': case 'cd':
      if (SECTIONS[arg]) { go(SECTIONS[arg]); termPrint('→ ' + arg, 'ok'); }
      else termPrint('sections: ' + Object.keys(SECTIONS).join(' '));
      break;
    case 'open':
      if (PROJECTS[arg]) { go(PROJECTS[arg]); termPrint('→ ' + arg, 'ok'); }
      else termPrint('projects: ' + Object.keys(PROJECTS).join(' '));
      break;
    case 'projects': case 'ls':
      termPrint('somonvpn  link  cybersec  tracker  maryam  hunter');
      break;
    case 'whoami':
      termPrint('Aminjon Azizov (aminyx), developer. Go, Rust, Kotlin, Python, TypeScript', 'ok');
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
    default:
      termPrint(`${cmd}: command not found`);
  }
}

function buildTerm() {
  term = document.createElement('div');
  term.className = 'sys-terminal';
  term.setAttribute('role', 'dialog');
  term.setAttribute('aria-label', 'Terminal');
  const chrome = document.createElement('div');
  chrome.className = 'sys-chrome';
  chrome.textContent = 'terminal';
  termLog = document.createElement('div');
  termLog.className = 'sys-log';
  termLog.setAttribute('aria-live', 'polite');
  const line = document.createElement('form');
  line.className = 'sys-line';
  termInput = document.createElement('input');
  termInput.type = 'text';
  termInput.setAttribute('aria-label', 'Command');
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
  termPrint('controls the network globe at the top of the page', 'ok');
  termPrint('type help for commands', 'dim');
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

const cmdk = $('#cmdk');
const cmdkInput = $('#cmdk-input');
const cmdkList = $('#cmdk-list');
let cmdkItems = [], cmdkActive = 0, cmdkPrevFocus = null;

function commands() {
  const out = [];
  const add = (group, label, run, kw) => out.push({ group, label, run, kw: kw || '' });
  add('cmdk.gNav', t('nav.work'), () => go('#work'), 'work работы корҳо portfolio');
  add('cmdk.gNav', t('nav.oss'), () => go('#oss'), 'open source github код рамз');
  add('cmdk.gNav', t('nav.services'), () => go('#services'), 'services услуги хизмат');
  add('cmdk.gNav', t('cmdk.faq'), () => go('#faq'), 'faq вопросы саволҳо questions');
  add('cmdk.gNav', t('nav.contact'), () => go('#contact'), 'contact контакты тамос');
  add('cmdk.gNav', t('footer.top'), () => go('#top'), 'top hero наверх');
  add('cmdk.gNav', t('cmdk.craft'), () => { location.href = '/craft/'; }, 'craft схемы схемаҳо diagrams');
  [['SomonVPN', '#p-somonvpn', 'vpn'], ['Aminyx Link', '#p-link', 'rust multipath'], ['Cybersec', '#course', 'курс course ctf'],
    ['Somoni Tracker', '#p-tracker', 'tracker трекер telegram'], ['maryam.best', '#p-maryam', 'maryam dna'], ['Username Hunter', '#p-hunter', 'hunter mtproto']]
    .forEach(([name, hash, kw]) => add('cmdk.gProjects', name, () => go(hash), kw));
  add('cmdk.gActions', t('cmdk.tg'), () => window.open('https://t.me/itsaminyx', '_blank', 'noopener'), 'telegram написать');
  add('cmdk.gActions', t('cmdk.mail'), () => { location.href = 'mailto:itsaminyx@gmail.com?subject=' + encodeURIComponent(t('brief.subject')); }, 'email почта mail');
  add('cmdk.gActions', t('cmdk.brief'), () => { go('#brief'); setTimeout(() => { const f = $('#brief input'); if (f) f.focus({ preventScroll: true }); }, reduceMotion ? 0 : 600); }, 'brief бриф заказ order');
  add('cmdk.gActions', t('cmdk.copyEmail'), () => copy('itsaminyx@gmail.com', t('toast.email')), 'copy email');
  add('cmdk.gActions', t('a11y.copyNick'), () => copy('@itsaminyx'), 'copy nick telegram');
  add('cmdk.gActions', t('cmdk.copyLink'), () => copy('https://aminyx.top/', t('toast.link')), 'copy link url');
  add('cmdk.gActions', t('a11y.theme'), () => toggleTheme(), 'theme тема dark light мавзӯъ реҷа торик равшан');
  [['ru', 'Русский'], ['tg', 'Тоҷикӣ'], ['en', 'English']].forEach(([code, name]) => {
    if (code !== lang()) add('cmdk.gActions', t('a11y.lang') + ': ' + name, () => withTransition(() => applyLang(code)), 'language язык забон ' + code);
  });
  if (navigator.share) add('cmdk.gActions', t('contact.share'), share, 'share');
  add('cmdk.gSystem', t('cmdk.terminal'), () => toggleTerm(true), 'terminal console терминал');
  add('cmdk.gSystem', t('cmdk.storm'), () => { if (sys()) { sys().storm(); go('#top'); } }, 'storm шторм chaos');
  add('cmdk.gSystem', t('cmdk.heal'), () => { if (sys()) { sys().heal(); sys().chaos(false); toast(t('toast.healed')); } }, 'heal восстановить');
  add('cmdk.gSystem', t('cmdk.sfx'), toggleSfx, 'sound sfx звук');
  add('cmdk.gLinks', 'GitHub', () => window.open('https://github.com/aminyx', '_blank', 'noopener'), 'github');
  add('cmdk.gLinks', 'X', () => window.open('https://x.com/itsaminyx', '_blank', 'noopener'), 'twitter x');
  add('cmdk.gLinks', t('contact.channel'), () => window.open('https://t.me/isaminyx', '_blank', 'noopener'), 'channel канал');
  add('cmdk.gLinks', t('footer.privacy'), () => { location.href = '/privacy/'; }, 'privacy');
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
    const label = document.createElement('span');
    label.className = 'ci-label';
    label.textContent = c.label;
    li.append(label);
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
  // клик по подложке закрывает
  cmdk.addEventListener('click', (e) => { if (e.target === cmdk) cmdk.close(); });
  cmdk.addEventListener('close', () => {
    if (cmdkPrevFocus && document.contains(cmdkPrevFocus) && document.activeElement === document.body) cmdkPrevFocus.focus({ preventScroll: true });
  });
  $('#cmdk-open').addEventListener('click', openPalette);
}
$$('.kbd-mod').forEach((k) => { k.textContent = isMac ? '⌘' : 'Ctrl'; });

document.addEventListener('keydown', (e) => {
  const tEl = e.target;
  const typing = tEl && (tEl.tagName === 'INPUT' || tEl.tagName === 'TEXTAREA' || tEl.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л' || e.code === 'KeyK')) {
    e.preventDefault();
    if (cmdk && cmdk.open) cmdk.close(); else openPalette();
    return;
  }
  const anyDialog = (cmdk && cmdk.open) || (explore && explore.open);
  // та же физическая клавиша на русской и таджикской раскладке даёт ё
  const termKey = e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё' || e.code === 'Backquote';
  if (termKey && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && !anyDialog) {
    e.preventDefault();
    toggleTerm(!termOpen);
    return;
  }
  if (e.key === 'Escape' && termOpen) { toggleTerm(false); return; }
  if (e.key === '/' && !typing && !anyDialog && !termOpen) { e.preventDefault(); openPalette(); }
});

applyLang(lang());
