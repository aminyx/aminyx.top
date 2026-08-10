# aminyx.top

Личный сайт: разработка продуктов под заказ и собственные проекты.

Контентное ядро — чистый HTML, CSS и JavaScript без фреймворка. Поверх него — WebGL-субстрат «живая система» (симуляция multipath-сети Aminyx Link: узлы, маршруты, пакеты, failover-каскады) на React Three Fiber с постобработкой. Собирается Vite; тяжёлый three-чанк грузится лениво после первой отрисовки и не влияет на скорость контента.

## Структура

- `index.html` — единственная страница (Vite-entry)
- `public/css/style.css` — стили, две темы (тёмная и светлая) на CSS-переменных
- `public/js/boot.js` — тема и язык до первой отрисовки (без FOUC)
- `public/js/i18n.js` — словари трёх языков: русский, тоҷикӣ, English
- `public/js/main.js` — навигация, reveal-анимации, счётчики, матрица тестов
- `src/scene/` — «живая система»: `main.jsx` (вход: проба WebGL2/Save-Data, ленивая загрузка рендерера), `sim.js` (симуляция), `mount.jsx` + `SystemScene.jsx` (React Three Fiber + EffectComposer), `scene2d.js` (canvas2d-фолбэк)
- `public/assets/fonts/` — Onest и JetBrains Mono, вариативные woff2, самохостинг
- `public/assets/img/` — скриншоты проектов (WebP), зерно `noise.svg`, OG-картинка

Фолбэки сцены: prefers-reduced-motion — статичный кадр; нет WebGL2 или включён Save-Data — canvas2d; нет canvas — чистый фон.

## Хостинг

GitHub Pages через GitHub Actions: `.github/workflows/deploy.yml` собирает Vite и публикует `dist`. Домен: `aminyx.top` (файл `public/CNAME`).

## Локальный запуск

```bash
npm ci
npm run dev       # dev-сервер
npm run build     # сборка в dist/
npm run preview   # предпросмотр сборки
```
