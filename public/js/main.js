/* aminyx.top: язык, тема, навигация, scroll-spy, reveal, счётчики, матрица тестов. */
(function () {
  'use strict';

  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  /* ---------- hero H1: пословная материализация ---------- */

  function stageH1() {
    var h1 = document.getElementById('hero-h1');
    if (!h1 || reduceMotion || !docEl.classList.contains('js')) return;
    /* без снятия staged повторный вызов (смена языка) рисует спаны
       сразу в конечном состоянии — анимация не переигрывается */
    h1.classList.remove('staged');
    var words = h1.textContent.split(' ');
    h1.textContent = '';
    words.forEach(function (w, i) {
      var s = document.createElement('span');
      s.className = 'w';
      s.style.transitionDelay = (80 + i * 90) + 'ms';
      s.textContent = w;
      h1.appendChild(s);
      if (i < words.length - 1) h1.appendChild(document.createTextNode(' '));
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { h1.classList.add('staged'); });
    });
  }

  /* ---------- i18n ---------- */

  function applyLang(lang) {
    var dict = window.I18N && window.I18N[lang];
    if (!dict) return;
    docEl.dataset.lang = lang;
    docEl.lang = lang;
    store('lang', lang);

    document.title = dict['meta.title'];
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', dict['meta.desc']);
    /* og:* тоже держим в актуальном языке при клиентском переключении */
    var setOg = function (prop, val) {
      var m = document.querySelector('meta[property="' + prop + '"]');
      if (m && val) m.setAttribute('content', val);
    };
    setOg('og:title', dict['meta.title']);
    setOg('og:description', dict['meta.desc']);
    setOg('og:image:alt', dict['meta.ogAlt']);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = dict[el.dataset.i18n];
      if (v) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var v = dict[el.dataset.i18nAria];
      if (v) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var v = dict[el.dataset.i18nAlt];
      if (v) el.setAttribute('alt', v);
    });
    document.querySelectorAll('.lang-switch button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
    });
    stageH1();
  }

  /* View Transition (Baseline 2025): смена языка перерисовывает десятки
     узлов — короткий кросс-фейд вместо скачка; без API и под
     reduced-motion — мгновенно, как раньше */
  function withTransition(apply) {
    if (!document.startViewTransition || reduceMotion) { apply(); return; }
    var t = document.startViewTransition(apply);
    /* пропущенный/прерванный переход (быстрое переключение языка, уход со страницы)
       отклоняет .ready/.finished с InvalidStateError — это ожидаемо, гасим промис,
       чтобы не сыпать «Uncaught (in promise)» в консоль */
    if (t && t.ready && t.ready.catch) t.ready.catch(function () {});
    if (t && t.finished && t.finished.catch) t.finished.catch(function () {});
  }

  document.querySelectorAll('.lang-switch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      withTransition(function () { applyLang(btn.dataset.lang); });
    });
  });

  applyLang(docEl.dataset.lang || 'ru');

  /* ---------- Тема ---------- */

  var themeBtn = document.getElementById('theme-toggle');
  function syncThemeBtn() {
    themeBtn.setAttribute('aria-pressed', String(docEl.dataset.theme === 'light'));
  }
  syncThemeBtn();
  themeBtn.addEventListener('click', function () {
    withTransition(function () {
      var next = docEl.dataset.theme === 'dark' ? 'light' : 'dark';
      docEl.dataset.theme = next;
      store('theme', next);
      syncThemeBtn();
      if (window.__setThemeColor) window.__setThemeColor(next);
      if (window.__sceneRefreshTheme) window.__sceneRefreshTheme();
      drawMatrix(matrixProgress);
    });
  });

  /* ---------- Копирование ника: фолбэк, когда t.me заблокирован ---------- */

  var nick = document.getElementById('nick-copy');
  if (nick && navigator.clipboard) {
    nick.addEventListener('click', function () {
      navigator.clipboard.writeText('@itsaminyx').then(function () {
        var dict = window.I18N && window.I18N[docEl.dataset.lang];
        nick.textContent = (dict && dict['contact.copied']) || 'Скопировано';
        nick.classList.add('copied');
        setTimeout(function () {
          nick.textContent = '@itsaminyx';
          nick.classList.remove('copied');
        }, 1400);
      });
    });
  }

  /* ---------- Web Share: кнопка живёт только там, где API есть ---------- */

  var shareLi = document.getElementById('share-li');
  var shareBtn = document.getElementById('share-btn');
  if (shareLi && shareBtn && navigator.share) {
    shareLi.hidden = false;
    shareBtn.addEventListener('click', function () {
      navigator.share({ title: document.title, url: 'https://aminyx.top/' })
        .catch(function () { /* отмена шаринга — не ошибка */ });
    });
  }

  /* ---------- Системный терминал (клавиша `) ---------- */

  var term = null, termLog = null, termInput = null;

  function termPrint(text, ok) {
    var line = document.createElement('div');
    if (ok) line.className = 'ok';
    line.textContent = text;
    termLog.appendChild(line);
    while (termLog.childElementCount > 40) termLog.removeChild(termLog.firstChild);
    termLog.scrollTop = termLog.scrollHeight;
  }

  function sys() { return window.__system || null; }

  function runCommand(raw) {
    var parts = raw.trim().split(/\s+/);
    var cmd = (parts[0] || '').toLowerCase(), arg = (parts[1] || '').toLowerCase();
    if (!cmd) return;
    termPrint('❯ ' + raw);
    switch (cmd) {
      case 'help':
        termPrint('commands: status · kill [n] · heal · storm · chaos on|off · sfx on|off · theme dark|light · lang ru|tg|en · clear · exit');
        break;
      case 'status': {
        var s = sys();
        if (!s) { termPrint('system: warming up…'); break; }
        var st = s.stats();
        termPrint('nodes ' + st.alive + '/' + st.nodes + ' alive · edges ' + st.edges + ' · packets in flight ' + st.packets, true);
        termPrint('manual kills ' + st.kills + ' · chaos ' + (st.chaos ? 'ON' : 'off') + ' · intensity ' + st.intensity + ' · sfx ' + (s.sfxOn() ? 'on' : 'off'));
        break;
      }
      case 'kill': {
        var s2 = sys();
        if (!s2) { termPrint('system: warming up…'); break; }
        var n = Math.min(parseInt(arg, 10) || 1, 8);
        termPrint('killed ' + s2.kill(n) + ' node(s) — watch the failover', true);
        break;
      }
      case 'heal':
        if (sys()) { sys().heal(); termPrint('all nodes healing', true); } else termPrint('system: warming up…');
        break;
      case 'storm':
        if (sys()) { sys().storm(); termPrint('storm injected — system will survive', true); } else termPrint('system: warming up…');
        break;
      case 'chaos':
        if (!sys()) { termPrint('system: warming up…'); break; }
        setChaosMode(arg !== 'off');
        termPrint('chaos mode ' + (arg !== 'off' ? 'ENGAGED' : 'off'), true);
        break;
      case 'sfx':
        if (sys()) { sys().sfx(arg === 'on'); termPrint('sfx ' + (arg === 'on' ? 'on' : 'off'), true); } else termPrint('system: warming up…');
        break;
      case 'theme':
        if (arg === 'dark' || arg === 'light') {
          if (docEl.dataset.theme !== arg) themeBtn.click();
          termPrint('theme: ' + arg, true);
        } else termPrint('usage: theme dark|light');
        break;
      case 'lang':
        if (window.I18N && window.I18N[arg]) { applyLang(arg); termPrint('lang: ' + arg, true); }
        else termPrint('usage: lang ru|tg|en');
        break;
      case 'clear':
        termLog.textContent = '';
        break;
      case 'exit':
        toggleTerm(false);
        break;
      default:
        termPrint('unknown command: ' + cmd + ' — try help');
    }
  }

  function buildTerm() {
    term = document.createElement('div');
    term.className = 'sys-terminal';
    term.setAttribute('role', 'dialog');
    term.setAttribute('aria-label', 'System terminal');
    termLog = document.createElement('div');
    termLog.className = 'sys-log';
    var line = document.createElement('form');
    line.className = 'sys-line';
    termInput = document.createElement('input');
    termInput.type = 'text';
    termInput.setAttribute('aria-label', 'terminal command');
    termInput.setAttribute('autocomplete', 'off');
    termInput.setAttribute('spellcheck', 'false');
    line.appendChild(termInput);
    term.appendChild(termLog);
    term.appendChild(line);
    document.body.appendChild(term);
    line.addEventListener('submit', function (e) {
      e.preventDefault();
      runCommand(termInput.value);
      termInput.value = '';
    });
    termPrint('aminyx system terminal — this console drives the real simulation behind the page');
    termPrint('type help to list commands');
  }

  var termOpen = false, termPrevFocus = null;
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

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    /* та же физическая клавиша на русской/таджикской раскладке даёт «ё»;
       внутри полей ввода не перехватываем — закрытие только по Escape */
    var termKey = e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё' || e.code === 'Backquote';
    if (termKey && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
      e.preventDefault();
      toggleTerm(!termOpen);
    } else if (e.key === 'Escape' && termOpen) {
      toggleTerm(false);
    }
  });

  /* ---------- Konami → CHAOS MODE ---------- */

  var chaosHud = document.getElementById('chaos-hud');
  var chaosOn = false;
  function setChaosMode(on) {
    /* без загруженной сцены HUD не включаем — не рассинхронизируем состояние */
    if (on && !sys()) return;
    chaosOn = on;
    if (sys()) sys().chaos(on);
    if (chaosHud) chaosHud.hidden = !on;
  }

  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var kPos = 0;
  document.addEventListener('keydown', function (e) {
    kPos = (e.key === KONAMI[kPos] || e.key.toLowerCase() === KONAMI[kPos]) ? kPos + 1 : 0;
    if (kPos === KONAMI.length) {
      kPos = 0;
      setChaosMode(!chaosOn);
    }
  });

  /* ---------- Навигация: фон при скролле ---------- */

  var nav = document.getElementById('nav');
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:0;height:16px;width:1px;pointer-events:none;';
  document.body.prepend(sentinel);
  new IntersectionObserver(function (entries) {
    var last = entries[entries.length - 1];
    nav.classList.toggle('scrolled', !last.isIntersecting);
  }).observe(sentinel);

  /* ---------- Мобильное меню ---------- */

  var burger = document.getElementById('burger');
  var navLinks = document.getElementById('nav-links');
  function setInert(on) {
    ['main', 'footer'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }
  function closeMenu() {
    navLinks.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setInert(false);
  }
  burger.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    setInert(open);
  });
  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMenu();
      burger.focus();
    }
  });
  /* оверлей живёт только ≤900px: при выходе за брейкпоинт (поворот планшета)
     иначе остаются scroll-lock и inert без видимого меню */
  var menuMq = window.matchMedia('(max-width: 900px)');
  menuMq.addEventListener('change', function (e) {
    if (!e.matches && navLinks.classList.contains('open')) closeMenu();
  });
  /* wordmark ведёт на #top поверх открытого оверлея — без закрытия кажется,
     что клик «не сработал» */
  var wm = document.querySelector('.nav .wordmark');
  if (wm) wm.addEventListener('click', closeMenu);

  /* ---------- Scroll-spy ---------- */

  var spyLinks = {};
  navLinks.querySelectorAll('a[href^="#"]').forEach(function (a) {
    spyLinks[a.getAttribute('href').slice(1)] = a;
  });
  var spyEls = Object.keys(spyLinks)
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  if ('IntersectionObserver' in window && spyEls.length) {
    var updateSpy = function () {
      var mid = window.innerHeight * 0.5;
      var activeId = null;
      var best = -Infinity;
      spyEls.forEach(function (el) {
        var top = el.getBoundingClientRect().top;
        if (top <= mid && top > best) { best = top; activeId = el.id; }
      });
      spyEls.forEach(function (el) {
        spyLinks[el.id].classList.toggle('active', el.id === activeId);
      });
    };
    var spy = new IntersectionObserver(updateSpy, { rootMargin: '-50% 0px -50% 0px' });
    spyEls.forEach(function (el) { spy.observe(el); });
    updateSpy();
  }

  /* ---------- Reveal (отказоустойчивый) ---------- */

  var revealEls = document.querySelectorAll('.reveal');

  if (!reduceMotion && 'IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          ro.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px 80px 0px' });
    revealEls.forEach(function (el) { ro.observe(el); });
    setTimeout(function () {
      revealEls.forEach(function (el) {
        if (!el.classList.contains('in')) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
        }
      });
    }, 1200);
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Счётчики чисел ---------- */

  function animateCount(el) {
    var target = parseInt(el.dataset.count, 10);
    if (!target || reduceMotion) { el.textContent = String(el.dataset.count); return; }
    var t0 = performance.now();
    var dur = 1100;
    function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * e));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var counters = document.querySelectorAll('.count');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          co.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---------- Матрица 731 теста: 43 × 17 = 731, каждая клетка — тест ---------- */

  var matrix = document.getElementById('test-matrix');
  var mctx = matrix ? matrix.getContext('2d') : null;
  var matrixProgress = reduceMotion ? 1 : 0;
  var COLS = 43, ROWS = 17, TOTAL = 731;

  function drawMatrix(progress) {
    if (!mctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = matrix.getBoundingClientRect();
    if (rect.width < 4) return;
    matrix.width = Math.round(rect.width * dpr);
    matrix.height = Math.round(rect.height * dpr);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = rect.width, H = rect.height;
    var gap = 2;
    var cw = (W - gap * (COLS - 1)) / COLS;
    var ch = (H - gap * (ROWS - 1)) / ROWS;
    var cs = getComputedStyle(docEl);
    var accent = cs.getPropertyValue('--accent').trim();
    var dim = cs.getPropertyValue('--line-strong').trim();
    var lit = Math.round(TOTAL * progress);
    var n = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (n >= TOTAL) break;
        var x = c * (cw + gap), y = r * (ch + gap);
        if (n < lit) {
          /* поле ~55% насыщенности: плита-доказательство не перекрикивает CTA */
          mctx.fillStyle = accent;
          mctx.globalAlpha = 0.32 + 0.23 * Math.min(1, (lit - n) / 60);
        } else {
          mctx.fillStyle = dim;
          mctx.globalAlpha = 0.5;
        }
        mctx.fillRect(x, y, cw, ch);
        n++;
      }
    }
    mctx.globalAlpha = 1;
  }

  function fillMatrix() {
    if (reduceMotion) { matrixProgress = 1; drawMatrix(1); return; }
    var t0 = performance.now();
    var dur = 1700;
    function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      matrixProgress = 1 - Math.pow(1 - p, 2);
      drawMatrix(matrixProgress);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- для тех, кто открыл DevTools ---------- */

  try {
    console.log(
      '%caminyx.%c\n\nСцена за этой страницей — настоящая симуляция multipath-failover.\nНажми ` — там терминал. Или сразу: https://t.me/itsaminyx',
      'font: 700 28px Onest, sans-serif; color: #e8ac3f;',
      'font: 12px JetBrains Mono, monospace; color: #8a93a1;'
    );
  } catch (e) {}

  if (matrix) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      matrixProgress = 1;
      drawMatrix(1);
    } else {
      var mo = new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) {
          fillMatrix();
          mo.disconnect();
        }
      }, { threshold: 0.4 });
      mo.observe(matrix);
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { drawMatrix(matrixProgress); }).observe(matrix);
    }
  }
})();
