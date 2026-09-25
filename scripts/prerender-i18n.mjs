import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { load } from 'cheerio';
import { I18N } from '../src/i18n.js';

const html = readFileSync('dist/index.html', 'utf-8');

const LOCALES = { ru: 'ru_RU', tg: 'tg_TJ', en: 'en_US' };

for (const lang of ['en', 'tg']) {
  const dict = I18N[lang];
  const $ = load(html);

  $('html').attr('lang', lang).attr('data-lang', lang);
  $('title').text(dict['meta.title']);
  $('meta[name="description"]').attr('content', dict['meta.desc']);

  $('[data-i18n]').each((_, el) => {
    const v = dict[$(el).attr('data-i18n')];
    if (v) $(el).text(v);
  });
  $('[data-i18n-aria]').each((_, el) => {
    const v = dict[$(el).attr('data-i18n-aria')];
    if (v) $(el).attr('aria-label', v);
  });
  $('[data-i18n-alt]').each((_, el) => {
    const v = dict[$(el).attr('data-i18n-alt')];
    if (v) $(el).attr('alt', v);
  });
  $('[data-i18n-ph]').each((_, el) => {
    const v = dict[$(el).attr('data-i18n-ph')];
    if (v) $(el).attr('placeholder', v);
  });
  $('.contact-cta a[href^="mailto:"]').attr('href', 'mailto:itsaminyx@gmail.com?subject=' + encodeURIComponent(dict['brief.subject']));

  const url = `https://aminyx.top/${lang}/`;
  $('link[rel="canonical"]').attr('href', url);
  $('meta[property="og:url"]').attr('content', url);
  $('meta[property="og:title"]').attr('content', dict['meta.title']);
  $('meta[property="og:description"]').attr('content', dict['meta.desc']);
  $('meta[property="og:image:alt"]').attr('content', dict['meta.ogAlt']);
  $('meta[property="og:image"]').attr('content', `https://aminyx.top/assets/img/og-${lang}.png`);
  $('meta[property="og:locale"]').attr('content', LOCALES[lang]);
  $('meta[property="og:locale:alternate"]').remove();
  const ogLocale = $('meta[property="og:locale"]');
  for (const alt of Object.keys(LOCALES).filter((l) => l !== lang)) {
    ogLocale.after(`\n  <meta property="og:locale:alternate" content="${LOCALES[alt]}">`);
  }

  mkdirSync(`dist/${lang}`, { recursive: true });
  writeFileSync(`dist/${lang}/index.html`, $.html());
  console.log(`dist/${lang}/index.html written (${dict['meta.title']})`);
}
