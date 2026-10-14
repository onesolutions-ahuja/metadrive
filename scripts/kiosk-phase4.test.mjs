import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {commerceComponents} from './kiosk-phase4-components.mjs';
import {commerceFlows} from './kiosk-phase4-flows.mjs';
import {commercePages,commerceApp} from './kiosk-phase4-pages.mjs';

test('Page Builder uses separate published, resizable registered building blocks',()=>{
 assert.equal(commerceComponents.length,4);
 assert.equal(new Set(commerceComponents.map(c=>c.apiName)).size,commerceComponents.length);
 for(const component of commerceComponents){
  assert.deepEqual(component.surfaces,['page']);
  assert.equal(component.publicationStatus,'Published');
  assert.ok(component.jsxSource.includes('export default function'));
  assert.ok(component.resize.defaultWidth>=component.resize.minWidth);
  assert.ok(component.resize.defaultHeight>=component.resize.minHeight);
  assert.ok(component.propertyDefinitions.length>=3);
  assert.equal(new Set(component.propertyDefinitions.map(p=>p.propertyKey)).size,component.propertyDefinitions.length);
  assert.ok(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\s*\(/.test(component.jsxSource));
 }
 assert.ok(commerceComponents.some(c=>c.jsxSource.includes('records=[]')));
 assert.ok(commerceComponents.some(c=>c.jsxSource.includes('onAction')));
});
test('declarative action events reference only installed active flows and pages',()=>{
 const flows=new Set(commerceFlows.map(x=>x.apiName));
 const pages=new Set(commercePages.map(x=>x.apiName));
 const blocks=new Set(commerceComponents.map(x=>x.apiName));
 assert.equal(commercePages.length,3);
 for(const page of commercePages){
  assert.equal(page.pageType,'App Page');
  assert.equal(page.status,'Active');
  assert.ok(page.devices.includes('Desktop')&&page.devices.includes('Phone'));
  for(const component of page.components){
   assert.ok(blocks.has(component.type.slice('Custom:'.length)));
   const handlers=Object.values(component.properties.actionFlows??{});
   for(const handler of handlers){
    if(handler.actionType==='Flow'){
     assert.ok(flows.has(handler.flowApiName),handler.flowApiName);
     for(const val of Object.values(handler.inputs??{}))
      assert.ok(typeof val==='string'&&val.startsWith('$'));
    }else{
     assert.equal(handler.actionType,'Navigate');
     assert.ok(pages.has(handler.navigationPageApiName));
     assert.equal(handler.navigationAppId,commerceApp.apiName);
    }
   }
  }
 }
 assert.deepEqual(new Set(commerceApp.navigationPageApiNames),pages);
 assert.equal(commerceApp.navigationOrder.length,commerceApp.navigationItems.length+pages.size);
});
test('all Flow graphs are valid DAGs apart from supported loops, guard modifiers and execute through core Objects',()=>{
 const names=new Set(commerceFlows.map(f=>f.apiName));
 assert.equal(names.size,commerceFlows.length);
 for(const flow of commerceFlows){
  assert.equal(flow.flowType,'Autolaunched Flow');
  assert.equal(flow.status,'Active');
  const ids=new Set(flow.elements.map(e=>e.id));
  assert.equal(ids.size,flow.elements.length);
  assert.equal(flow.elements.filter(e=>e.type==='Start').length,1);
  const edgeIds=new Set();
  for(const e of flow.connectors){
   assert.ok(ids.has(e.from)&&ids.has(e.to),flow.apiName);
   assert.ok(!edgeIds.has(e.id));edgeIds.add(e.id);
  }
  const resources=new Set(flow.resources.map(r=>r.name));
  assert.equal(resources.size,flow.resources.length);
  for(const e of flow.elements){
   if(['Get Records','Create Records','Update Records','Delete Records'].includes(e.type)){
    assert.match(e.config.object,/^[A-Za-z][A-Za-z0-9_]*__c$/);
   }
   if(e.type==='Assignment')assert.ok(resources.has(e.config.variable));
   if(e.type==='Loop')assert.ok(resources.has(e.config.collection)&&resources.has(e.config.loopVariable));
  }
 }
 const add=commerceFlows.find(f=>f.apiName==='MD_Commerce_AddProduct');
 assert.ok(add);
 for(const type of ['Collection Filter','Loop','Decision','Get Records','Create Records','Update Records'])
  assert.ok(add.elements.some(e=>e.type===type),'missing '+type);
 assert.ok(add.elements.some(e=>e.type==='Create Records'&&e.config.object==='OrderLineModifier__c'));
 const product=add.elements.find(e=>e.label==='Find active product');
 assert.ok(product.config.conditions.some(c=>c.field==='IsActive'&&c.value===true));
 assert.ok(add.elements.some(e=>e.label==='Enforce modifier minimum and maximum'));
 assert.ok(commerceFlows.some(f=>f.apiName==='MD_Commerce_SubmitBasket'
  && f.elements.some(e=>e.type==='Update Records'&&e.config.fieldValues.some(x=>x.field==='Status'&&x.value==='Submitted'))));
});
test('live installer remains dry-run without explicit approval',()=>{
 const result=spawnSync(process.execPath,['scripts/install-kiosk-phase4.mjs'],{
  env:{...process.env,METADRIVE_PHASE4_INSTALL_APPROVED:'false'},encoding:'utf8'
 });
 assert.equal(result.status,0,result.stderr);
 const body=JSON.parse(result.stdout);
 assert.equal(body.mode,'dry-run');
 assert.equal(body.expected.components.length,4);
 assert.equal(body.expected.flows.length,5);
 assert.equal(body.expected.pages.length,3);
});
test('approved demo images are explicitly allowlisted without enabling network fetches',()=>{
 const source=readFileSync(new URL('../apps/web/src/ComponentSandbox.tsx',import.meta.url),'utf8');
 assert.match(source,/img-src data: https:\/\/images\.unsplash\.com/);
 assert.match(source,/connect-src 'none'/);
 assert.match(source,/referrerPolicy="no-referrer"/);
});

test('tenant-scoped metadata installer preserves valid RBAC and discards deleted Object references',()=>{
 const installer=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(installer,/const knownFields=new Map\(objectList\.map/);
 assert.match(installer,/fieldPermissions:keepKnown\(entry\.fieldPermissions,knownField\)/);
 assert.match(installer,/permissionSetGroups:\(access\.permissionSetGroups\?\?\[\]\)\.map\(scrub\)/);
 assert.match(installer,/refreshed\.user\?\.tenantId!==expectTenant/);
});

test('SQL writer conflicts re-read current permissions before bounded retries',()=>{
 const installer=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(installer,/for\(let attempt=0;attempt<6;attempt\+\+\)/);
 assert.match(installer,/const current=await api\('\/metadata\/permissions'\)/);
 assert.match(installer,/const proposed=prepare\(current\)/);
 assert.match(installer,/HTTP \(409\|502\|503\|504\)/);
 assert.match(installer,/await updateSecurity\(access=>/);
});

test('component registration retries only on transient SQL failures after readback',()=>{
 const source=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(source,/const existing=available\.find\(x=>x\.apiName===component\.apiName\)/);
 assert.match(source,/if\(!retryableWriterError\(error\)\|\|attempt===5\)/);
 assert.match(source,/if\(await installRegisteredComponent\(component\)\)installedComponents\+\+/);
 assert.match(source,/Concurrent writer detected/);
});

test('component lifecycle uses secured draft creation and dedicated publish endpoint',()=>{
 const source=readFileSync(new URL('./install-kiosk-phase4.mjs',import.meta.url),'utf8');
 assert.match(source,/publicationStatus:'Draft'/);
 assert.match(source,/\+'\/publish','POST'\)/);
 assert.match(source,/existing\.status==='Published'/);
 assert.match(source,/existing\.trustedBundled/);
 assert.match(source,/existing\.status!=='Draft'/);
});
