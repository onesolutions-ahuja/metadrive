import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {commerceComponents} from './kiosk-phase4-components.mjs';
import {commercePages} from './kiosk-phase4-pages.mjs';

test('full-screen ordering retains separately editable component instances',()=>{
 const menu=commercePages.find(p=>p.apiName==='MD_Commerce_Menu');
 assert.equal(menu.template,'header-main-sidebar');
 assert.equal(menu.components.length,3);
 assert.ok(menu.components.some(x=>x.properties?.standalonePresentation===true));
 for(const p of commercePages)for(const block of p.components){
  assert.ok(commerceComponents.some(c=>block.type==='Custom:'+c.apiName));
 }
 assert.ok(commerceComponents.every(c=>c.propertyDefinitions.length>=3));
 assert.ok(commerceComponents.every(c=>c.jsxSource.includes('export default function')));
});
test('standalone template presentation is generic and preserves the builder',()=>{
 const app=readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
 const presentation=readFileSync(new URL('../apps/web/src/pageRuntimePresentation.ts',import.meta.url),'utf8');
 assert.match(app,/fullscreenLayout = isStandaloneRuntime && page.layoutMode === 'template'/);
 assert.match(presentation,/page.components.some/);
 assert.doesNotMatch(presentation,/Commerce|Kiosk|KFC|UNE/);
});
test('installed v1 components are upgraded without overwriting custom block layouts',()=>{
 const install=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(install,/newById\.get\(block.id\)/);
 assert.match(install,/\.\.\.block,\s*type:target.type/);
 assert.match(install,/\.\.\.block.properties/);
});
