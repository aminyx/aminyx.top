// PDF-резюме из scripts/cv/cv-ru.html → public/cv/aminjon-azizov-cv-ru.pdf (кнопка «Скачать резюме» на сайте)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const src = resolve(import.meta.dirname, 'cv/cv-ru.html');
const out = resolve(import.meta.dirname, '../public/cv/aminjon-azizov-cv-ru.pdf');
mkdirSync(resolve(out, '..'), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('written', out);
} finally {
  await browser.close();
}
