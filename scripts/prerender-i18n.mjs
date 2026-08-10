/* Прегенерация языковых версий из dist/index.html: dist/en/ и dist/tg/.
   Словари берутся из public/js/i18n.js (единственный источник переводов),
   поэтому статические страницы никогда не расходятся с клиентским i18n.
   Кластер hreflang прописан в исходном index.html и копируется как есть. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { load } from 'cheerio';

const dictsSrc = readFileSync('public/js/i18n.js', 'utf-8');
const win = {};
new Function('window', dictsSrc)(win);
const I18N = win.I18N;

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

  const url = `https://aminyx.top/${lang}/`;
  $('link[rel="canonical"]').attr('href', url);
  $('meta[property="og:url"]').attr('content', url);
  $('meta[property="og:title"]').attr('content', dict['meta.title']);
  $('meta[property="og:description"]').attr('content', dict['meta.desc']);
  $('meta[property="og:image:alt"]').attr('content', dict['meta.title']);
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
