import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('AceKiosk menu metadata stays tenant scoped, user context, idempotent and Flow-driven',()=>{
 const s=readFileSync(new URL('../../src/app-seeders/acekiosk-menu-flow.ts',import.meta.url),'utf8');
 assert.match(s,/md_app_installations/);
 assert.match(s,/md_app_entitlements/);
 assert.match(s,/if\(existing\.rowCount\)return false/);
 assert.match(s,/Get Records/);
 assert.match(s,/kind:'normal'/);
 assert.match(s,/executionContext:'User'/);
 assert.doesNotMatch(s,/INSERT INTO md_records|INSERT INTO md_permission_assignments/);
});

test('AceKiosk modifier Flow is tenant-scoped and only uses existing meal metadata',()=>{
 const source=readFileSync(new URL('../../src/app-seeders/acekiosk-menu-flow.ts',import.meta.url),'utf8');
 assert.match(source,/seedAceKioskProductOptions/);
 assert.match(source,/MealChoiceGroup/);
 assert.match(source,/MealChoiceOption/);
 assert.match(source,/appApiName:'AceKiosk'/);
 assert.match(source,/availableForOutput:true/);
 assert.doesNotMatch(source,/INSERT INTO md_records|INSERT INTO md_permission_assignments/);
});

test('AceKiosk menu navigation Flows are metadata-only and idempotent',()=>{
 const file=readFileSync(new URL('../../src/app-seeders/acekiosk-navigation-flows.ts',import.meta.url),'utf8');
 assert.match(file,/AceKioskStartSession/);
 assert.match(file,/AceKioskFilterMenu/);
 assert.match(file,/recordLimit:'all'/);
 assert.match(file,/executionContext:'User'/);
 assert.match(file,/if\(exists\.rowCount\)continue/);
 assert.doesNotMatch(file,/INSERT INTO md_records|INSERT INTO md_permission_assignments|INSERT INTO md_orders/);
});

test('AceKiosk Cash/Card templates use Acetill payment contract without auto-activating',()=>{
 const templates=JSON.parse(readFileSync(new URL('../../../acekiosk/flows/payment-flows.v1.json',import.meta.url),'utf8'));
 for(const method of ['Cash','Card']){
  const flow=templates['AceKioskPayment'+method];
  assert.equal(flow.appApiName,'AceKiosk');
  assert.equal(flow.status,'Draft');
  assert.ok(flow.elements.some((element)=>element.type==='Create Records'&&element.config.object==='Order'));
  assert.ok(flow.elements.some((element)=>element.type==='Create Records'&&element.config.object==='OrderLine'));
  assert.ok(flow.resources.some((resource)=>resource.name==='orderId'&&resource.availableForOutput));
 }
 const seeder=readFileSync(new URL('../../src/app-seeders/acekiosk-payment-flows.ts',import.meta.url),'utf8');
 assert.match(seeder,/md_app_installations/);
 assert.match(seeder,/ON CONFLICT DO NOTHING/);
 assert.match(seeder,/1,false/);
 assert.doesNotMatch(seeder,/md_permission_assignments/);
});
