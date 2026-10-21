import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=(path:string)=>fileURLToPath(new URL(path, import.meta.url));
test('Acetill is a separate document, not the UNE workspace router',()=>{
 const html=readFileSync(file('../../web/acetill/index.html'),'utf8');
 const entry=readFileSync(file('../../web/src/core/workspace/Standalone/acetillEntry.tsx'),'utf8');
 const vite=readFileSync(file('../../web/vite.config.ts'),'utf8');
 assert.match(html,/Acetill \| Point of Sale/);
 assert.match(html,/src="\/src\/core\/workspace\/Standalone\/acetillEntry\.tsx"/);
 assert.match(entry,/import App from/);
 assert.doesNotMatch(entry,/MarketingSite|SetupApp|AcetillShell/);
 assert.match(vite,/acetill\/index\.html/);
 assert.equal(existsSync(file('../../web/public/acetill/index.html')),false,
   'public Acetill redirect would shadow the separately built entrypoint');
});
test('Legacy navigation transfers to the real Acetill document',()=>{
 const main=readFileSync(file('../../web/src/main.tsx'),'utf8');
 const setup=readFileSync(file('../../web/src/core/workspace/SetupShell/setupAppShell.tsx'),'utf8');
 assert.match(main,/window\.location\.replace\('\/acetill\/'\)/);
 assert.match(setup,/standaloneEntryForAppId/);
 assert.match(setup,/window\.location\.assign\(target\.pathname\+target\.search\)/);
});
