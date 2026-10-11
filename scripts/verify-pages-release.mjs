import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const dist = resolve('apps/web/dist');
const origin = 'https://onesolutions-ahuja.github.io';
const base = '/metadrive/';
const live = process.argv.includes('--live');
const sha = process.env.GITHUB_SHA || 'manual';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
async function read(assetPath) {
  return readFile(resolve(dist, assetPath));
}
const html = (await read('index.html')).toString('utf8');
const jsMatch = html.match(/src="(\/metadrive\/assets\/[^"]+\.js)"/);
const cssMatch = html.match(/href="(\/metadrive\/assets\/[^"]+\.css)"/);
assert(jsMatch && cssMatch, 'Built Pages HTML must load versioned scripts and styles from /metadrive/assets');
const js = (await read(jsMatch[1].slice(base.length))).toString('utf8');
const css = (await read(cssMatch[1].slice(base.length))).toString('utf8');
assert(js.includes('header-records-link'), 'Built app is missing the global Records navigation');
assert(js.includes('auth-brand-logo') && js.includes('brand-logo'), 'Built app is missing UNE Solutions branding');
assert(css.includes('.setup-sidebar') && css.includes('overflow-y:auto') && css.includes('position:sticky'),
  'Built CSS is missing sticky header or scrolling Setup navigation');
const logo = await read('une-solutions-logo.webp');
assert(logo.length > 1000 && logo.toString('ascii', 0, 4) === 'RIFF', 'Transparent logo asset missing or invalid');
assert((await read('404.html')).toString('utf8').includes('__spa='), 'Client-side deep-link fallback missing');
console.log('Pages artifact contains logo, Records navigation, sticky header, scrolling sidebar and deep-link fallback.');

if (live) {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const query = '?release_check=' + encodeURIComponent(sha) + '-' + attempt;
      const get = async (path) => {
        const response = await fetch(origin + path + query, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        assert(response.ok, 'Published ' + path + ' returned HTTP ' + response.status);
        return response;
      };
      const publishedHtml = await (await get(base)).text();
      assert(publishedHtml.includes(jsMatch[1]) && publishedHtml.includes(cssMatch[1]),
        'Live Pages HTML does not point to this commit\'s compiled JS/CSS assets');
      const publishedLogo = Buffer.from(await (await get(base + 'une-solutions-logo.webp')).arrayBuffer());
      assert(sha256(publishedLogo) === sha256(logo), 'Live Pages is serving an old UNE Solutions logo');
      const publishedJs = await (await get(jsMatch[1])).text();
      assert(publishedJs.includes('header-records-link'), 'Live Records navigation is missing');
      const publishedCss = await (await get(cssMatch[1])).text();
      assert(publishedCss.includes('.setup-sidebar') && publishedCss.includes('position:sticky'),
        'Live sticky header/sidebar styling missing');
      console.log('Live GitHub Pages matches the exact deployed UI and branding build: ' + sha);
      process.exit(0);
    } catch (error) {
      lastError = error;
      console.warn('Live Pages verification attempt ' + attempt + '/20: ' + (error?.message || error));
      if (attempt < 20) await new Promise((done) => setTimeout(done, 6000));
    }
  }
  throw lastError;
}
