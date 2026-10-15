import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const dist = resolve('apps/web/dist');
const origin = 'https://unesolutions.co.uk';
const base = '/';
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
const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
assert(jsMatch && cssMatch, 'Built Pages HTML must load versioned scripts and styles from /assets on the custom domain');
const js = (await read(jsMatch[1].slice(base.length))).toString('utf8');
const css = (await read(cssMatch[1].slice(base.length))).toString('utf8');
const assetNames = await readdir(resolve(dist, 'assets'));
const jsAssets = await Promise.all(assetNames.filter(name => name.endsWith('.js')).map(async name => ({
  name, content: (await read('assets/' + name)).toString('utf8')
})));
const cssAssets = await Promise.all(assetNames.filter(name => name.endsWith('.css')).map(async name => ({
  name, content: (await read('assets/' + name)).toString('utf8')
})));
const appJs = jsAssets.find(asset => asset.content.includes('header-records-link'));
const appCss = cssAssets.find(asset => asset.content.includes('.setup-sidebar') && asset.content.includes('position:sticky'));
assert(appJs, 'Built app chunk is missing the global Records navigation');
// Ensure the shipped frontend contains the list-first Page Builder workspace.
assert(jsAssets.some(asset => asset.content.includes('page-manager-view') && asset.content.includes('All objects')), 'Built frontend is missing the Page Builder pages list');
const setupShell = (await readFile(resolve('apps/web/src/setupAppShell.tsx'))).toString('utf8');
assert(/nextWorkspace === 'page-builder'\\s*\\? \\{ kind: 'setup', workspace: nextWorkspace \\}/.test(setupShell), 'App Builder menu must open the pages list, not a selected page');
assert(js.includes('Software that makes') && js.includes('Client login'), 'Built Pages is missing the public UNE Solutions marketing homepage');
assert(html.includes('Une Solutions | Smart Software for Growing Businesses'), 'Built Pages has the wrong public title');
assert(appJs.content.includes('auth-brand-logo') && appJs.content.includes('brand-logo'), 'Built app is missing UNE Solutions branding');
assert(css.includes('.une-marketing'), 'Built CSS is missing public marketing design');
assert(appCss && appCss.content.includes('overflow-y:auto'),
  'Built CSS is missing sticky header or scrolling Setup navigation');
const logo = await read('une-solutions-logo.webp');
assert(logo.length > 1000 && logo.toString('ascii', 0, 4) === 'RIFF', 'Transparent logo asset missing or invalid');
// GitHub Pages serves existing /login/ files ahead of its 404 fallback.
// The branded entry must route into our own SPA rather than navigating to Render.
const loginHtml = (await read('login/index.html')).toString('utf8');
assert(loginHtml.includes("window.location.replace('/?__spa='"), 'Branded login handoff missing');
assert(!loginHtml.includes('metadrive.onrender.com'), 'Public login must not redirect to Render');
const fallback = (await read('404.html')).toString('utf8');
assert(fallback.includes("window.location.replace('/?__spa='"), 'Custom-domain client-side deep-link fallback missing');
assert(html.includes('window.history.replaceState({}, \'\', restored)'), 'Custom-domain route restoration is missing');
assert(!html.includes("'/metadrive' + restored"), 'Custom-domain route restoration uses the old GitHub project prefix');
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
      const fallbackResponse = await fetch(origin + '/une/setup/home?release_check=' + encodeURIComponent(sha), {
        cache: 'no-store', signal: AbortSignal.timeout(15000)
      });
      const publishedFallback = await fallbackResponse.text();
      const fallbackWorks = (fallbackResponse.status === 404 || fallbackResponse.ok)
        && publishedFallback.includes("window.location.replace('/?__spa='");
      const directSpaWorks = fallbackResponse.ok && publishedFallback.includes('id="root"')
        && publishedFallback.includes('Une Solutions | Smart Software for Growing Businesses');
      if (!fallbackWorks && !directSpaWorks) console.warn('Deep-link response status=' + fallbackResponse.status
        + ' content-type=' + fallbackResponse.headers.get('content-type')
        + ' preview=' + publishedFallback.slice(0, 180).replace(/\\s+/g, ' '));
      assert(fallbackWorks || directSpaWorks, 'Published custom-domain deep link does not serve the SPA');
      const publishedLogin = await (await get('/login/')).text();
      assert(publishedLogin.includes("window.location.replace('/?__spa='")
        && !publishedLogin.includes('metadrive.onrender.com'), 'Live login redirects away from the branded domain');
      assert(publishedHtml.includes(jsMatch[1]) && publishedHtml.includes(cssMatch[1]),
        'Live Pages HTML does not point to this commit\'s compiled JS/CSS assets');
      const publishedLogo = Buffer.from(await (await get(base + 'une-solutions-logo.webp')).arrayBuffer());
      assert(sha256(publishedLogo) === sha256(logo), 'Live Pages is serving an old UNE Solutions logo');
      const publishedJs = await (await get(jsMatch[1])).text();
      assert(publishedJs.includes('Software that makes'), 'Live marketing JavaScript missing');
      const publishedApp = await (await get('/assets/' + appJs.name)).text();
      assert(publishedApp.includes('header-records-link'), 'Live workspace chunk is missing');
      const publishedWorkspaceCss = await (await get('/assets/' + appCss.name)).text();
      assert(publishedWorkspaceCss.includes('.setup-sidebar'), 'Live workspace styles are missing');
      assert(publishedJs.includes('Software that makes') && publishedJs.includes('Client login'), 'Live UNE marketing site is missing');
      const publishedCss = await (await get(cssMatch[1])).text();
      assert(publishedCss.includes('.une-marketing'), 'Live marketing styles missing');
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
