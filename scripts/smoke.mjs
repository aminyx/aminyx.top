/* Smoke-тест собранного сайта: три языковые версии + privacy.
   Падает с ненулевым кодом при любом несоответствии — гейт для CI. */
import { preview } from 'vite';
import { chromium } from 'playwright';

/* locale контекста имитирует браузер посетителя: на / автодетект должен
   дать ru при ru-RU; на /tg/ префикс пути обязан победить en-US-детекцию */
const EXPECT = {
  '/': { lang: 'ru', locale: 'ru-RU', title: 'Aminyx | Разработка продуктов: бэкенд, Android, веб, безопасность' },
  '/en/': { lang: 'en', locale: 'en-US', title: 'Aminyx | Product development: backend, Android, web, security' },
  '/tg/': { lang: 'tg', locale: 'en-US', title: 'Aminyx | Таҳияи маҳсулот: бэкенд, Android, веб, амният' },
};

const server = await preview({ preview: { port: 4599, strictPort: true } });
const base = `http://localhost:4599`;
const browser = await chromium.launch();
const errors = [];

try {
  for (const [path, exp] of Object.entries(EXPECT)) {
    const ctx = await browser.newContext({ locale: exp.locale });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(base + path, { waitUntil: 'networkidle' });

    const title = await page.title();
    if (title !== exp.title) errors.push(`${path}: title «${title}» ≠ «${exp.title}»`);

    const lang = await page.evaluate(() => document.documentElement.lang);
    if (lang !== exp.lang) errors.push(`${path}: html lang «${lang}» ≠ «${exp.lang}»`);

    const cta = await page.$('a.btn-primary[href^="https://t.me/"]');
    if (!cta) errors.push(`${path}: нет CTA-ссылки на Telegram`);

    try {
      await page.waitForSelector('#system-root canvas', { timeout: 15000 });
    } catch {
      errors.push(`${path}: WebGL/2d-сцена не смонтировалась за 15с`);
    }

    if (pageErrors.length) errors.push(`${path}: pageerror: ${pageErrors.join('; ')}`);
    await ctx.close();
  }

  const page = await browser.newPage();
  const resp = await page.goto(base + '/privacy/', { waitUntil: 'domcontentloaded' });
  if (!resp.ok()) errors.push(`/privacy/: HTTP ${resp.status()}`);
  const h1 = await page.textContent('h1');
  if (!h1 || !h1.includes('Конфиденциальность')) errors.push('/privacy/: нет заголовка');
  await page.close();
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (errors.length) {
  console.error('SMOKE FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('SMOKE OK: /, /en/, /tg/, /privacy/');
