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

test('administrator grant update removes only stale object and field references before central RBAC validation',()=>{
 const code=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 const adminUpdate=code.slice(code.indexOf('// Seed the existing OneEngine administrator profile'),code.indexOf('// Prepare a limited OneEngine permission set'));
 assert.match(adminUpdate,/profiles:\(access\.profiles\?\?\[\]\)\.map\(profile=>scrub\(/);
 assert.match(adminUpdate,/permissionSets:\(access\.permissionSets\?\?\[\]\)\.map\(scrub\)/);
 assert.match(adminUpdate,/permissionSetGroups:\(access\.permissionSetGroups\?\?\[\]\)\.map\(scrub\)/);
 assert.match(code,/const knownFields=new Map\(objectList\.map/);
 assert.match(code,/const keepKnown=/);
});
