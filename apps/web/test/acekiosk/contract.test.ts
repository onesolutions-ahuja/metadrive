import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {ACEKIOSK_STANDALONE_ENTRY} from '../../../acekiosk/src/standalone-entry.ts';

test('AceKiosk is an independent entry using shared auth',()=>{
 assert.equal(ACEKIOSK_STANDALONE_ENTRY.slug,'acekiosk');
 assert.equal(ACEKIOSK_STANDALONE_ENTRY.appId,'AceKiosk');
});
test('business data is provided by Flows, not a new API, SQL or component renderer',()=>{
 const ui=readFileSync(new URL('../../../acekiosk/src/AceKiosk.tsx',import.meta.url),'utf8');
 assert.match(ui,/AceKioskLoadMenu/);
 assert.match(ui,/AceKioskCheckout/);
 assert.match(ui,/\/flows\//);
 assert.doesNotMatch(ui,/\/records\/|\/metadata\/objects|OneShoppingCart|OneItemGrid/);
 assert.doesNotMatch(ui,/status='complete'/);
 assert.doesNotMatch(ui,/\/metadata\/apps/); // install/licence/RBAC belongs to the central gate
});
test('package registration does not automatically license or install tenants',()=>{
 const sql=readFileSync(new URL('../../../acekiosk/sql/register.sql',import.meta.url),'utf8');
 assert.match(sql,/md_app_package_versions/);
 assert.doesNotMatch(sql,/INSERT INTO md_app_installations|INSERT INTO md_app_entitlements/);
});

test('AceKiosk routing and entitlement remain in MetaDrive, not a SQL Home Page',()=>{
 const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
 const index=readFileSync(new URL('../../../web/public/acekiosk/index.html',import.meta.url),'utf8');
 assert.match(app,/AceKioskAccessGate/);
 assert.match(app,/\/metadata\/apps\/AceKiosk\/access/);
 assert.match(app,/standaloneEntry\.slug==='acekiosk'/);
 assert.match(index,/<title>AceKiosk/);
 assert.match(index,/\/\?__spa=/);
 const kiosk=readFileSync(new URL('../../../acekiosk/src/AceKiosk.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(kiosk,/md_page_definitions|md_app_home_pages|\/metadata\/apps|PageBuilder/);
});
