import assert from 'node:assert/strict';
import {test} from 'node:test';
import {commerceComponents,kioskPresentationComponents} from './kiosk-phase4-components.mjs';
import {commercePages} from './kiosk-phase4-pages.mjs';
import {readFileSync} from 'node:fs';

test('portrait kiosk layout uses separate category, grid, and checkout blocks',()=>{
 const menu=commercePages.find(page=>page.apiName==='MD_Commerce_Menu');
 assert.equal(menu.canvasWidth,1080);
 assert.equal(menu.canvasHeight,1920);
 assert.equal(menu.components.length,3);
 assert.equal(menu.components[0].properties.presentationLayout,'rail-checkout');
 assert.equal(menu.components[0].properties.objectApiName,'ProductCategory__c');
 assert.equal(menu.components[1].properties.objectApiName,'Product__c');
 assert.deepEqual(menu.components.map(c=>c.type),[
  'Custom:MD_CommerceNavigationV2',
  'Custom:MD_CommerceProductGridV2',
  'Custom:MD_CommerceBasketPanelV2'
 ]);
 assert.ok(kioskPresentationComponents.every(c=>c.jsxSource.includes('export default function')));
 assert.ok(kioskPresentationComponents.every(c=>c.propertyDefinitions.length>=3));
 assert.deepEqual(kioskPresentationComponents.map(c=>c.apiName),commerceComponents.map(c=>c.apiName));
 assert.ok(kioskPresentationComponents.slice(0,3).every(c=>c.propertyDefinitions.some(p=>p.propertyKey==='presentationVariant')));
 assert.ok(kioskPresentationComponents[0].jsxSource.includes('OriginalCommerceNav'));
 assert.ok(kioskPresentationComponents[0].jsxSource.includes('AlternateCommerceNav'));
 assert.ok(kioskPresentationComponents[2].jsxSource.includes('OriginalCommerceBasketPanel'));
});
test('template engine uses metadata for rail-checkout, not app-specific logic',()=>{
 const runtime=readFileSync(new URL('../apps/web/src/TemplatePageRuntimeLayout.tsx',import.meta.url),'utf8');
 assert.match(runtime,/layoutVariant === 'rail-checkout'/);
 assert.doesNotMatch(runtime,/MD_Commerce|KFC|Kiosk/);
});
test('installer upgrades versioned components while respecting existing page properties',()=>{
 const installer=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(installer,/kioskPresentationComponents as commerceComponents/);
 assert.match(installer,/block\.properties/);
 assert.match(installer,/component-library.*PUT/);
 assert.match(installer,/matchesBaseline/);
 assert.match(installer,/obsoleteCommercePages/);
});
