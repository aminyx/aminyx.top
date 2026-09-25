/* Smoke-тест собранного сайта: три языковые версии, /craft, /privacy, 404.
   Падает с ненулевым кодом при любом несоответствии — гейт для CI.
   Сцена считается живой, когда hero-слот получил класс gl-on: это делает
   и WebGL-движок, и canvas2d-фолбэк (на раннерах без GPU). */
import { preview } from 'vite';
import { chromium } from 'playwright';

/* locale контекста имитирует браузер посетителя: на / автодетект должен
   дать ru при ru-RU; на /tg/ префикс пути обязан победить en-US-детекцию */
const EXPECT = {
  '/': { lang: 'ru', locale: 'ru-RU', title: 'Aminyx | Разработка продуктов: бэкенд, Android, веб, безопасность', h1: 'Собираю продукты' },
  '/en/': { lang: 'en', locale: 'en-US', title: 'Aminyx | Product development: backend, Android, web, security', h1: 'I build products' },
  '/tg/': { lang: 'tg', locale: 'en-US', title: 'Aminyx | Таҳияи маҳсулот: бэкенд, Android, веб, амният', h1: 'Маҳсулотро' },
};

const server = await preview({ preview: { port: 4599, strictPort: true } });
const base = 'http://localhost:4599';
/* CHROMIUM_PATH — для окружений с предустановленным браузером */
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

try {
  for (const [path, exp] of Object.entries(EXPECT)) {
    const ctx = await browser.newContext({ locale: exp.locale, viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
    await page.goto(base + path, { waitUntil: 'networkidle' });

    const title = await page.title();
    if (title !== exp.title) errors.push(`${path}: title «${title}» ≠ «${exp.title}»`);
    const lang = await page.evaluate(() => document.documentElement.lang);
    if (lang !== exp.lang) errors.push(`${path}: html lang «${lang}» ≠ «${exp.lang}»`);
    const h1 = (await page.textContent('#hero-h1')) || '';
    if (!h1.includes(exp.h1)) errors.push(`${path}: h1 «${h1.trim()}» не содержит «${exp.h1}»`);
    if (!(await page.$('a.btn-primary[href^="https://t.me/"]'))) errors.push(`${path}: нет CTA-ссылки на Telegram`);

    try {
      await page.waitForSelector('#hero-stage.gl-on', { timeout: 20000 });
      await page.waitForSelector('#hero-hud:not([hidden])', { timeout: 5000 });
    } catch {
      errors.push(`${path}: сцена hero не смонтировалась за 20с`);
    }

    if (path === '/') {
      /* сцена проекта поднимается лениво при подъезде слота к экрану */
      await page.locator('#p-somonvpn .case-stage').scrollIntoViewIfNeeded();
      try {
        await page.waitForFunction(() => {
          const s = document.querySelector('#p-somonvpn .case-stage');
          return s.classList.contains('gl-on') || s.classList.contains('no-gl');
        }, null, { timeout: 20000 });
      } catch {
        errors.push('/: 3D-сцена SomonVPN не загрузилась и не ушла в фолбэк');
      }
      /* командная палитра: Ctrl+K открывает, поиск фильтрует */
      await page.keyboard.press('Control+k');
      const open = await page.evaluate(() => document.getElementById('cmdk').open);
      if (!open) errors.push('/: Ctrl+K не открыл палитру');
      await page.keyboard.type('somon');
      const items = await page.$$eval('#cmdk-list [role="option"]', (els) => els.map((e) => e.textContent));
      if (!items.some((t) => t.includes('SomonVPN'))) errors.push('/: палитра не нашла SomonVPN');
      await page.keyboard.press('Escape');
      /* бриф собирает сообщение из отмеченного */
      await page.locator('#brief').scrollIntoViewIfNeeded();
      await page.check('#brief input[value="bot"]');
      const preview = await page.textContent('#brief-preview');
      if (!preview.includes('Telegram-боты')) errors.push('/: бриф не отразил выбранную услугу');
    }

    if (pageErrors.length) errors.push(`${path}: ${pageErrors.join('; ')}`);
    await ctx.close();
  }

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  let resp = await page.goto(base + '/privacy/', { waitUntil: 'domcontentloaded' });
  if (!resp.ok()) errors.push(`/privacy/: HTTP ${resp.status()}`);
  const ph1 = await page.textContent('h1');
  if (!ph1 || !ph1.includes('Конфиденциальность')) errors.push('/privacy/: нет заголовка');

  resp = await page.goto(base + '/craft/', { waitUntil: 'networkidle' });
  if (!resp.ok()) errors.push(`/craft/: HTTP ${resp.status()}`);
  if ((await page.$$('.craft-card canvas')).length !== 4) errors.push('/craft/: ожидалось 4 канваса виньеток');

  resp = await page.goto(base + '/404.html', { waitUntil: 'domcontentloaded' });
  if (!(await page.$('.nf-code'))) errors.push('/404.html: нет разметки 404');

  if (pageErrors.length) errors.push(`subpages: ${pageErrors.join('; ')}`);
  await page.close();
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (errors.length) {
  console.error('SMOKE FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('SMOKE OK: /, /en/, /tg/, /craft/, /privacy/, 404');
