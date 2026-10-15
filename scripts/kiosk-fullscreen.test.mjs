import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {commerceComponents} from './kiosk-phase4-components.mjs';
import {commercePages,obsoleteCommercePages} from './kiosk-phase4-pages.mjs';

test('recreated menu retains three individually editable registered components',()=>{
 const menu=commercePages.find(page=>page.apiName==='MD_Commerce_Menu');
 assert.equal(menu.template,'header-main-sidebar');
 assert.equal(menu.components.length,3);
 assert.equal(menu.components[0].properties.presentationLayout,'rail-checkout');
 assert.equal(menu.components[0].properties.objectApiName,'ProductCategory__c');
 assert.equal(menu.components[1].properties.objectApiName,'Product__c');
 assert.equal(menu.components[2].properties.iframeMinHeight,84);
 for(const page of commercePages)for(const block of page.components)
  assert.ok(commerceComponents.some(component=>block.type==='Custom:'+component.apiName));
});
test('Page Builder and runtime share the same metadata-selected region renderer',()=>{
 const source=readFileSync(new URL('../apps/web/src/BuilderTemplatePreviewLayout.tsx',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../apps/web/src/TemplatePageRuntimeLayout.tsx',import.meta.url),'utf8');
 const builder=readFileSync(new URL('../apps/web/src/pageBuilderView.tsx',import.meta.url),'utf8');
 assert.match(source,/TemplatePageRuntimeLayout/);
 assert.match(builder,/BuilderTemplatePreviewLayout/);
 assert.match(runtime,/layoutVariant === 'rail-checkout'/);
 assert.doesNotMatch(runtime,/MD_Commerce|KFC|Kiosk/);
});
test('safe replace-and-retire flow keeps old commerce Flows, Actions and metadata permissions',()=>{
 const install=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.ok(obsoleteCommercePages.includes('MD_Commerce_Basket'));
 assert.match(install,/const previousPages=new Map/);
 assert.match(install,/for\(const name of updates.reverse\(\)\)/);
 assert.match(install,/api\('\/metadata\/pages\/'.*'DELETE'/);
 assert.match(install,/await updateSecurity/);
});
