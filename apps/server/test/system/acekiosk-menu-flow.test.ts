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

test('Kiosk payment Flows atomically write financial invoices and kitchen orders',()=>{
 const graphs=JSON.parse(readFileSync(new URL('../../../acekiosk/flows/payment-flows.v1.json',import.meta.url),'utf8'));
 for(const method of ['Cash','Card']){
  const flow=graphs['AceKioskPayment'+method];
  const byId=new Map(flow.elements.map((e)=>[e.id,e]));
  assert.equal(byId.get(12).config.object,'Order');
  assert.equal(byId.get(15).config.object,'OrderLine');
  assert.equal(byId.get(24).config.object,'Invoice');
  assert.equal(byId.get(25).config.object,'InvoiceLine');
  const invoice=byId.get(24).config.fieldValues;
  assert.ok(invoice.some(v=>v.field==='Order'&&v.value==='{!record12.Id}'));
  assert.ok(invoice.some(v=>v.field==='Total'&&v.value==='{!validatedTotal}'));
  assert.ok(invoice.some(v=>v.field==='Checkout_Request_ID__c'&&v.value==='{!requestId}'));
  const line=byId.get(25).config.fieldValues;
  assert.ok(line.some(v=>v.field==='Invoice'&&v.value==='{!record24.Id}'));
  assert.ok(line.some(v=>v.field==='UnitPrice'&&v.value==='{!currentProduct.Price}'));
  assert.ok(line.some(v=>v.field==='LineTotal'&&v.value==='{!saveLineAmount}'));
  for(const [from,to] of [[12,24],[24,20],[15,25],[25,21],[22,26],[26,16]])
    assert.ok(flow.connectors.some(c=>c.from===from&&c.to===to),method+': missing '+from+' -> '+to);
  assert.ok(flow.resources.some(v=>v.name==='invoiceId'&&v.availableForOutput));
 }
 const source=readFileSync(new URL('../../src/app-seeders/acekiosk-payment-flows.ts',import.meta.url),'utf8');
 assert.match(source,/versions\.length!==1\|\|versions\[0\]\.version!==1/);
 assert.match(source,/stable\(\{\.\.\.current,status:'Draft'\}\)!==stable\(baseline\)/);
 assert.match(source,/md_flow_definitions SET active=false/);
 assert.match(source,/VALUES\(\$1,\$2,\$3,'Autolaunched Flow',2,\$4\)/);
 assert.match(source,/InvoiceLine\.Invoice/);
 assert.doesNotMatch(source,/DELETE FROM md_records|TRUNCATE md_records/);
});
