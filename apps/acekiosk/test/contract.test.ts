import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {ACEKIOSK_STANDALONE_ENTRY} from '../src/standalone-entry.ts';

test('AceKiosk is an independent entry using shared auth',()=>{
 assert.equal(ACEKIOSK_STANDALONE_ENTRY.slug,'acekiosk');
 assert.equal(ACEKIOSK_STANDALONE_ENTRY.appId,'AceKiosk');
});
test('business data is provided by Flows, not a new API, SQL or component renderer',()=>{
 const ui=readFileSync(new URL('../src/AceKiosk.tsx',import.meta.url),'utf8');
 assert.match(ui,/AceKioskLoadMenu/);
 assert.match(ui,/AceKioskCheckout/);
 assert.match(ui,/\/flows\//);
 assert.doesNotMatch(ui,/\/records\/|\/metadata\/objects|OneShoppingCart|OneItemGrid/);
 assert.doesNotMatch(ui,/status='complete'/);
});
test('package registration does not automatically license or install tenants',()=>{
 const sql=readFileSync(new URL('../sql/register.sql',import.meta.url),'utf8');
 assert.match(sql,/md_app_package_versions/);
 assert.doesNotMatch(sql,/INSERT INTO md_app_installations|INSERT INTO md_app_entitlements/);
});
