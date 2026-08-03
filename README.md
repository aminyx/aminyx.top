# aminyx.top

Личный сайт: разработка продуктов под заказ и собственные проекты.

Чистый HTML, CSS и JavaScript. Без фреймворка, без сборки, без зависимостей.

## Структура

- `index.html` — единственная страница
- `css/style.css` — стили, две темы (тёмная и светлая) на CSS-переменных
- `js/i18n.js` — словари трёх языков: русский, тоҷикӣ, English
- `js/main.js` — переключение языка и темы, reveal-анимации, canvas в hero
- `assets/fonts/` — Onest и JetBrains Mono, самохостинг (woff2, latin + cyrillic-ext)
- `assets/img/` — скриншоты проектов (WebP)

## Хостинг

GitHub Pages, ветка `main`, корень. Домен: `aminyx.top` (файл `CNAME`).

## Локальный запуск

Любой статический сервер, например:

```bash
python -m http.server 8080
```
