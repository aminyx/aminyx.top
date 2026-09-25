# aminyx.top

Мой сайт: https://aminyx.top

Статичный HTML, сборка Vite, 3D на three.js без фреймворка. Тексты на трёх языках лежат в src/i18n.js, русский ещё и прямо в index.html. Из словаря при сборке получаются /en/ и /tg/.

Все сцены рисует один WebGL-контекст. Почему так, написано в начале src/scene/engine.js. Без WebGL2 или с Save-Data глобус рисуется на canvas2d, у проектов остаются скриншоты. С prefers-reduced-motion сцены стоят на месте. Без JS остаётся обычная страница.

Причины нескольких решений записаны в docs/decisions.md.

На главной клавиша `` ` `` открывает терминал (команды по help), Ctrl/⌘+K открывает палитру.

    npm ci
    npm run dev
    npm run build          # dist/ вместе с /en/ и /tg/
    npm run smoke          # проверка сборки в Chromium, свой браузер: CHROMIUM_PATH=...
    npm run og             # og-картинки, после build

Деплой на GitHub Pages экшеном при пуше в main, домен в public/CNAME.
