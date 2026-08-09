/* aminyx.top: язык, тема, навигация, scroll-spy, reveal, canvas в hero. */
(function () {
  'use strict';

  var docEl = document.documentElement;

  /* localStorage может быть заблокирован настройками браузера */
  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
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
  }

  document.querySelectorAll('.lang-switch button').forEach(function (btn) {
    btn.addEventListener('click', function () { applyLang(btn.dataset.lang); });
  });

  applyLang(docEl.dataset.lang || 'ru');

  /* ---------- Тема ---------- */

  var themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', function () {
    var next = docEl.dataset.theme === 'dark' ? 'light' : 'dark';
    docEl.dataset.theme = next;
    store('theme', next);
    if (window.__setThemeColor) window.__setThemeColor(next);
    refreshCanvasColors();
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
  /* при открытом оверлее фон не должен получать фокус */
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

  /* ---------- Scroll-spy: активный якорь ---------- */

  var spyLinks = {};
  navLinks.querySelectorAll('a[href^="#"]').forEach(function (a) {
    spyLinks[a.getAttribute('href').slice(1)] = a;
  });
  var spyEls = Object.keys(spyLinks)
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  if ('IntersectionObserver' in window && spyEls.length) {
    /* активен последний раздел, чья верхняя граница выше середины экрана;
       пересчёт по фактической геометрии на каждое событие observer */
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
    var spy = new IntersectionObserver(updateSpy, {
      rootMargin: '-50% 0px -50% 0px'
    });
    spyEls.forEach(function (el) { spy.observe(el); });
    updateSpy();
  }

  /* ---------- Reveal (отказоустойчивый) ---------- */

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = document.querySelectorAll('.reveal');

  function revealAll() {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

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
    /* страховка: что бы ни случилось с observer, контент становится видимым */
    setTimeout(function () {
      revealEls.forEach(function (el) {
        if (!el.classList.contains('in')) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
        }
      });
    }, 1200);
  } else {
    revealAll();
  }

  /* ---------- Canvas: multipath-визуализация ----------
     Четыре пути между двумя узлами. Пакеты с хвостами идут по живым путям;
     периодически один путь «падает», трафик перетекает на остальные.
     Отсылка к multipath-failover из Aminyx Link. */

  var canvas = document.getElementById('net-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, dpr = 1;
  var colors = {};
  var running = false;
  var visible = false;
  var rafId = 0;

  function refreshCanvasColors() {
    var cs = getComputedStyle(docEl);
    colors.accent = cs.getPropertyValue('--accent').trim();
    colors.dim = cs.getPropertyValue('--text-3').trim();
    if (reduceMotion) drawStatic();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduceMotion) drawStatic();
  }

  function pathPoints() {
    var ax = W * 0.07, ay = H * 0.52;
    var bx = W * 0.93, by = H * 0.48;
    return [
      { a: [ax, ay], c1: [W * 0.28, H * 0.06], c2: [W * 0.68, H * 0.04], b: [bx, by] },
      { a: [ax, ay], c1: [W * 0.34, H * 0.34], c2: [W * 0.62, H * 0.26], b: [bx, by] },
      { a: [ax, ay], c1: [W * 0.36, H * 0.70], c2: [W * 0.60, H * 0.76], b: [bx, by] },
      { a: [ax, ay], c1: [W * 0.28, H * 0.98], c2: [W * 0.68, H * 0.96], b: [bx, by] }
    ];
  }

  function bezier(p, t) {
    var mt = 1 - t;
    var x = mt * mt * mt * p.a[0] + 3 * mt * mt * t * p.c1[0] + 3 * mt * t * t * p.c2[0] + t * t * t * p.b[0];
    var y = mt * mt * mt * p.a[1] + 3 * mt * mt * t * p.c1[1] + 3 * mt * t * t * p.c2[1] + t * t * t * p.b[1];
    return [x, y];
  }

  /* health: 1 = живой, 0 = упал (плавно затухает) */
  var paths = [{ health: 1 }, { health: 1 }, { health: 1 }, { health: 1 }];
  var packets = [];
  var lastFail = 0;
  var failIdx = -1;
  var failUntil = 0;
  var lastSpawn = 0;
  var lastT = 0;

  function alivePaths() {
    var out = [];
    for (var i = 0; i < paths.length; i++) if (paths[i].health > 0.6) out.push(i);
    return out;
  }

  function spawn(now) {
    var alive = alivePaths();
    if (!alive.length) return;
    var idx = alive[Math.floor(Math.random() * alive.length)];
    packets.push({ path: idx, t: 0, speed: 0.26 + Math.random() * 0.2 });
    lastSpawn = now;
  }

  function drawNode(x, y, pulse) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = colors.accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 11 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = colors.dim;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawFrame(now) {
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    ctx.clearRect(0, 0, W, H);
    var pts = pathPoints();

    /* отказ и восстановление путей */
    if (failIdx === -1 && now - lastFail > 5200) {
      failIdx = Math.floor(Math.random() * paths.length);
      failUntil = now + 2800;
    }
    if (failIdx !== -1 && now > failUntil) {
      lastFail = now;
      failIdx = -1;
    }
    for (var i = 0; i < paths.length; i++) {
      var target = i === failIdx ? 0 : 1;
      paths[i].health += (target - paths[i].health) * Math.min(dt * 4, 1);
    }

    /* линии путей: нейтральная база + янтарь поверх живых */
    for (i = 0; i < pts.length; i++) {
      var h = paths[i].health;
      ctx.beginPath();
      ctx.moveTo(pts[i].a[0], pts[i].a[1]);
      ctx.bezierCurveTo(pts[i].c1[0], pts[i].c1[1], pts[i].c2[0], pts[i].c2[1], pts[i].b[0], pts[i].b[1]);
      ctx.strokeStyle = colors.dim;
      ctx.globalAlpha = 0.22 + h * 0.3;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (h > 0.3) {
        ctx.strokeStyle = colors.accent;
        ctx.globalAlpha = h * 0.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* пакеты с хвостами */
    if (now - lastSpawn > 300 && packets.length < 22) spawn(now);
    for (i = packets.length - 1; i >= 0; i--) {
      var pk = packets[i];
      pk.t += pk.speed * dt;
      if (pk.t >= 1) { packets.splice(i, 1); continue; }
      var alpha = paths[pk.path].health;
      if (alpha < 0.15) { packets.splice(i, 1); continue; }
      var p = pts[pk.path];
      /* хвост: 5 затухающих сегментов позади пакета */
      for (var s = 5; s >= 1; s--) {
        var tt = pk.t - s * 0.018;
        if (tt <= 0) continue;
        var tp = bezier(p, tt);
        ctx.beginPath();
        ctx.arc(tp[0], tp[1], 2.4 - s * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = colors.accent;
        ctx.globalAlpha = alpha * (0.4 - s * 0.065);
        ctx.fill();
      }
      var pos = bezier(p, pk.t);
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 2.8, 0, Math.PI * 2);
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    var pulse = (Math.sin(now / 600) + 1) / 2;
    drawNode(W * 0.07, H * 0.52, pulse);
    drawNode(W * 0.93, H * 0.48, 1 - pulse);

    if (running) rafId = requestAnimationFrame(drawFrame);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    var pts = pathPoints();
    for (var i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i].a[0], pts[i].a[1]);
      ctx.bezierCurveTo(pts[i].c1[0], pts[i].c1[1], pts[i].c2[0], pts[i].c2[1], pts[i].b[0], pts[i].b[1]);
      ctx.strokeStyle = colors.dim;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (var t = 0.2; t < 1; t += 0.3) {
        var pos = bezier(pts[i], t);
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], 2.6, 0, Math.PI * 2);
        ctx.fillStyle = colors.accent;
        ctx.fill();
      }
    }
    drawNode(W * 0.07, H * 0.52, 0.5);
    drawNode(W * 0.93, H * 0.48, 0.5);
  }

  function setRunning(on) {
    if (reduceMotion) { drawStatic(); return; }
    if (on && !running) {
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(drawFrame);
    } else if (!on && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  }

  refreshCanvasColors();
  resize();
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(canvas);
  }

  /* смена монитора с другим devicePixelRatio не даёт ResizeObserver-события */
  var dprMq;
  function watchDpr() {
    if (dprMq) dprMq.removeEventListener('change', onDprChange);
    dprMq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    dprMq.addEventListener('change', onDprChange);
  }
  function onDprChange() { resize(); watchDpr(); }
  if (window.matchMedia) watchDpr();

  new IntersectionObserver(function (entries) {
    var last = entries[entries.length - 1];
    visible = last.isIntersecting;
    setRunning(visible && !document.hidden);
  }).observe(canvas);

  document.addEventListener('visibilitychange', function () {
    setRunning(visible && !document.hidden);
  });
})();
