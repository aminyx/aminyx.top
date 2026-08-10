# Чек-лист владельца — действия, которые нельзя сделать без твоих аккаунтов

Всё остальное уже сделано и в проде. Здесь каждое действие доведено до состояния
«скопировать и вставить». Проверено 2026-08-10: регистратор — **Spaceship, Inc.**,
домен оплачен до **2027-08-03**.

**DNS переехал на Cloudflare (10.08.2026).** NS теперь `annalise.ns.cloudflare.com` +
`zod.ns.cloudflare.com`. Зона проксируется через Cloudflare; сайт живёт по HTTPS с
HTTP/3, http→https принудительно. Настоящие security-заголовки (HSTS с preload,
X-Content-Type-Options, X-Frame-Options, Permissions-Policy) отдаются Transform Rule —
проверено `curl`. **DNSSEC включён и валидируется** (DS `2371 / 13 ECDSAP256SHA256 / 2`
опубликован в реестре .top, резолверы отдают `AD: true`, SERVFAIL нет). Null MX
(RFC 7505) добавлен. Осталось из DNS — только SPF/DMARC (п.1) как контентные записи.

## 1. DNS: анти-спуфинг почты (5 минут, бесплатно) — теперь в Cloudflare

Cloudflare → aminyx.top → DNS → Records. Добавить две TXT-записи (null MX уже стоит):

| Тип | Host | Значение | Зачем |
|---|---|---|---|
| TXT | `@` | `v=spf1 -all` | домен не шлёт почту — запретить всем |
| TXT | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s` | письма «от aminyx.top» — в отказ |

Проверка после: https://mxtoolbox.com/SuperTool.aspx → SPF/DMARC lookup.

**CAA намеренно не добавляли.** Зона проксируется Cloudflare, сертификат
выдаёт и продлевает сам Cloudflare (Universal SSL, CA — Google Trust / Let's
Encrypt / SSL.com, набор меняется). Жёсткий CAA на проксированной зоне рискует
заблокировать автопродление при смене CA у Cloudflare. Если захочешь CAA —
бери актуальный список CA из их документации, не фиксируй один центр.

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

## 4. Cloudflare Free перед Pages — ✅ СДЕЛАНО (10.08.2026)

Оставлено как запись о том, что именно настроено:

1. ✅ Зона `aminyx.top` создана на Cloudflare Free, NS переключены у Spaceship.
2. ✅ Проксирование включено; сайт отдаётся через Cloudflare с HTTP/3.
3. ✅ Always Use HTTPS (http→https), HSTS с `preload`.
4. ⚠️ SSL/TLS выбран **Full**, не Full (strict) — сознательно: origin —
   GitHub Pages за прокси, Full (strict) создаёт дедлок при ACME-продлении
   сертификата Pages. Full закрывает канал «клиент↔Cloudflare» полноценным TLS.
5. ✅ Transform Rule «Security headers» (Active): HSTS `max-age=31536000; includeSubDomains; preload`,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.
   CSP оставлен в `<meta>` страниц (там ему удобнее правиться вместе с разметкой).
6. ✅ DNSSEC включён на Cloudflare, DS опубликован в реестре .top — валидируется.
7. Бонус на будущее: Cloudflare Web Analytics (без cookies) как альтернатива п.2 —
   включается в дашборде одним тумблером, если захочешь.

Ещё три домена переехали на Cloudflare тем же заходом: **maryam.best**,
**yosaminvpn.online** (Spaceship) и **virexpro.me** (Namecheap). У доменов с VPS-сайтами
записи стоят DNS-only, чтобы не ломать прямой доступ. DNSSEC на них не включали —
делали флагман aminyx.top; при желании повторить те же шаги.

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
