# Чек-лист владельца — действия, которые нельзя сделать без твоих аккаунтов

Всё остальное уже сделано и в проде. Здесь каждое действие доведено до состояния
«скопировать и вставить». Проверено 2026-08-10: регистратор — **Spaceship, Inc.**,
DNS — launch1/launch2.spaceship.net, домен оплачен до **2027-08-03**,
записей SPF / DMARC / MX / CAA **нет вообще**.

## 1. DNS: анти-спуфинг почты + контроль сертификатов (15 минут, бесплатно)

Spaceship → Domain → aminyx.top → Advanced DNS. Добавить четыре записи:

| Тип | Host | Значение | Зачем |
|---|---|---|---|
| TXT | `@` | `v=spf1 -all` | домен не шлёт почту — запретить всем |
| TXT | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s` | письма «от aminyx.top» — в отказ |
| MX | `@` | приоритет `0`, значение `.` | null MX (RFC 7505): почты нет |
| CAA | `@` | `0 issue "letsencrypt.org"` | сертификаты только Let's Encrypt (их использует GitHub Pages) |

Проверка после: https://mxtoolbox.com/SuperTool.aspx → SPF/DMARC lookup.
Если позже переедешь на Cloudflare-проксирование — в CAA добавить их CA
(pki.goog, digicert.com) по их актуальной документации.

## 2. Аналитика KPI: GoatCounter (10 минут, бесплатно для личных сайтов)

Клик «Обсудить проект» — единственный KPI сайта, и он не измеряется.

1. Зарегистрировать https://www.goatcounter.com → сайт `aminyx` (получится aminyx.goatcounter.com).
2. Скачать https://gc.zgo.at/count.js → положить в `public/js/count.js` (self-host, script-src остаётся 'self').
3. В `index.html`: перед `</body>` добавить
   `<script data-goatcounter="https://aminyx.goatcounter.com/count" async src="/js/count.js"></script>`
   и в CSP-мету добавить `; connect-src 'self' https://aminyx.goatcounter.com`.
4. События на CTA (в main.js): на каждый клик по `a[href^="https://t.me/itsaminyx"]` вызвать
   `window.goatcounter && goatcounter.count({ path: 'cta-telegram', event: true })`
   (аналогично `cta-email`, `nick-copy`). Скажи мне — внесу этот код за один заход.

## 3. Поисковые консоли (по 5 минут каждая)

Верификация через DNS TXT (Spaceship), чтобы не плодить файлы:

- **Google Search Console** → добавить property `aminyx.top` (Domain) → TXT-запись → после верификации скормить `https://aminyx.top/sitemap.xml`.
- **Bing Webmaster Tools** → импорт из GSC одной кнопкой (или отдельная верификация). IndexNow уже настроен и пингуется.
- **Яндекс Вебмастер** (важен для RU/TJ-аудитории) → тоже DNS-верификация → sitemap.

## 4. Cloudflare Free перед Pages (полчаса, опционально, но даёт настоящие заголовки)

1. Cloudflare → Add site → aminyx.top → Free.
2. Сменить NS у Spaceship на выданные Cloudflare.
3. DNS-записи: CNAME `@` → `aminyx.github.io` (proxied), CNAME `www` → `aminyx.github.io` (proxied).
4. SSL/TLS → **Full (strict)**; в GitHub Pages оставить Enforce HTTPS.
5. Rules → Transform Rules → Response Header: добавить `Content-Security-Policy` (текущее значение из index.html + `frame-ancestors 'none'`), `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
6. Бонусом: HTTP/3, brotli, Cloudflare Web Analytics (без cookies) — альтернатива п.2.

## 5. Зеркало на Codeberg (bus-factor, 10 минут)

Workflow `.github/workflows/mirror.yml` уже в репозитории и ждёт токен:

1. Codeberg → создать пустой репозиторий `aminyx/aminyx.top`.
2. Codeberg → Settings → Applications → Access token с правом `write:repository`.
3. GitHub → repo Settings → Secrets and variables → Actions → новый секрет `CODEBERG_TOKEN`.
4. Готово: каждый пуш в main зеркалируется автоматически.

Туда же: проверь, что включён 2FA на GitHub и recovery-коды сохранены офлайн —
блокировка аккаунта сейчас кладёт и сайт, и деплой.

## 6. Контент — пришли тексты, остальное сделаю я

- **FAQ перед контактами** (5–6 вопросов): реальные ответы про цены/модель оплаты, сроки, NDA и передачу кода, поддержку после релиза. Каркас (details name= без JS, FAQPage-schema, три языка) соберу за один заход.
- **Кейс-страницы** (/case/somonvpn и др.): нужен расширенный рассказ по каждому кейсу (что было, решения, грабли, цифры) — без него страницы будут тонкими и SEO навредят. Из них же соберём статьи на Хабр.
- **WhatsApp-дубль CTA**: если есть рабочий номер — добавлю wa.me-кнопку рядом с Telegram (t.me блокируется в РФ, троттлится в TJ; ник-фолбэк уже сделан).

## Ежемесячно само (уже работает, вмешательство не нужно)

- security.txt: Expires продлевается автоматически.
- Срок домена: issue за 35 дней до истечения (RDAP).
- Домены-двойники: dnstwist-скан, issue при новых регистрациях.
- Аптайм: ежечасная проба, issue при падении.
