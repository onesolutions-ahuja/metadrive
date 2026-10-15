import assert from 'node:assert/strict';
import {test} from 'node:test';
import {referenceComponents} from './kiosk-reference-components.mjs';
import {commercePages} from './kiosk-phase4-pages.mjs';
import {readFileSync} from 'node:fs';

test('portrait kiosk layout uses separate category, grid, and checkout blocks',()=>{
 const menu=commercePages.find(page=>page.apiName==='MD_Commerce_Menu');
 assert.equal(menu.canvasWidth,1080);
 assert.equal(menu.canvasHeight,1920);
 assert.equal(menu.components.length,3);
 assert.equal(menu.components[0].properties.presentationLayout,'rail-checkout');
 assert.deepEqual(menu.components.map(c=>c.type),[
  'Custom:MD_CommerceNavigationV3',
  'Custom:MD_CommerceProductGridV3',
  'Custom:MD_CommerceCheckoutBarV3'
 ]);
 assert.ok(referenceComponents.every(c=>c.jsxSource.includes('export default function')));
 assert.ok(referenceComponents.every(c=>c.propertyDefinitions.length>=3));
});
test('template engine uses metadata for rail-checkout, not app-specific logic',()=>{
 const runtime=readFileSync(new URL('../apps/web/src/TemplatePageRuntimeLayout.tsx',import.meta.url),'utf8');
 assert.match(runtime,/layoutVariant === 'rail-checkout'/);
 assert.doesNotMatch(runtime,/MD_Commerce|KFC|Kiosk/);
});
test('installer upgrades versioned components while respecting existing page properties',()=>{
 const installer=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(installer,/referenceComponents as commerceComponents/);
 assert.match(installer,/block\.properties/);
 assert.match(installer,/CheckoutBar/);
});
