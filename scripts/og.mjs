// og-картинки 1200×630 для /, /en/, /tg/. запускать после npm run build
import { preview } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';

const server = await preview({ preview: { port: 4623, strictPort: true } });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-rasterization', '--disable-gpu-compositing'],
});
const css = `
  .nav, .hero-cta, .hud, .hero-hint { display: none !important; }
  .hero { min-height: 630px !important; height: 630px; padding: 0 !important; align-items: center !important; }
  .hero .hero-stage { width: 760px !important; right: -60px !important; top: 50% !important; transform: translateY(-50%) !important; }
  .hero-copy { max-width: 640px !important; }
  .h1 { font-size: 76px !important; }
  .hero-sub { font-size: 20px !important; max-width: 560px !important; }
`;
for (const [path, file] of [['/', 'og.png'], ['/en/', 'og-en.png'], ['/tg/', 'og-tg.png']]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'dark', bypassCSP: true, locale: path === '/' ? 'ru-RU' : 'en-US' });
  await page.goto('http://localhost:4623' + path, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: css });
  await page.waitForSelector('#hero-stage.gl-on');
  await page.waitForTimeout(8000); // глобус должен успеть собраться
  await sharp(await page.screenshot({ type: 'png' })).png({ compressionLevel: 9 }).toFile('public/assets/img/' + file);
  await page.close();
}
await browser.close();
server.httpServer.close();
