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
    if (!document.startViewTransition || reduceMotion) apply();
    else document.startViewTransition(apply);
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
