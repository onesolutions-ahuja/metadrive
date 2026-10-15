import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {commercePages} from './kiosk-phase4-pages.mjs';

test('commerce pages bind to the registered Product__c object',()=>{
 const menu=commercePages.find(page=>page.apiName==='MD_Commerce_Menu');
 assert.equal(menu.targetObject,'Product__c');
 const product=menu.components.find(component=>component.id==='menu-products');
 assert.equal(product.properties.objectApiName,'Product__c');
});
test('installer seeds existing OneEngine administrator without overriding saved decisions',()=>{
 const code=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(code,/id==='system-administrator'/);
 assert.match(code,/missingObjects/);
 assert.match(code,/missingFields/);
 assert.match(code,/hasOwnProperty\.call\(admin\.objectPermissions/);
 assert.match(code,/hasOwnProperty\.call\(admin\.fieldPermissions/);
 assert.match(code,/await updateSecurity\(access=>/);
});
