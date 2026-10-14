import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyInstallableAppPackages } from '../src/installable-app-packages.mjs';
import { ensureBundledAppComponents } from '../src/bundled-app-components.mjs';
const catalog = JSON.parse(readFileSync(new URL('../data/installable-app-packages.json', import.meta.url), 'utf8'));
const pos = catalog.packages.find(p => p.appKey === 'pos');
const baseTenant = () => ({
  objects:[{apiName:'Product',label:'Existing Product',kind:'Standard Object',fields:[{apiName:'Name',label:'Name',dataType:'Text',required:true}]}],
  flows:[],apps:[],pages:[],
  accessControl:{profiles:[{id:'standard-user',label:'Standard',apiName:'Standard_User',systemPermissions:[],objectPermissions:{},fieldPermissions:{},appPermissions:{},tabPermissions:{}}]},
  records:{Connector_App__c:[{AppKey__c:'pos',Installed__c:true,LicenceStatus__c:'Licensed'}]}
});
test('POS package installs once and preserves the tenant core Product object', () => {
  assert(pos);
  const first=applyInstallableAppPackages(baseTenant(),catalog);
  const second=applyInstallableAppPackages(first,catalog);
  assert.deepEqual(second,first);
  assert.equal(first.objects.filter(o => o.apiName === 'Product').length,1);
  assert.equal(first.objects.find(o => o.apiName === 'Product').label,'Existing Product');
  assert.equal(first.objects.filter(o => o.apiName === 'Sale__c').length,1);
  assert.equal(first.objects.filter(o => o.apiName === 'SaleItem__c').length,1);
  assert.equal(first.apps.filter(a => a.apiName === 'POSApp').length,1);
  const page=first.pages.find(p=>p.apiName==='UNE_POS');
  assert.equal(page.status,'Active');
  assert(page.components.length >= 10,'POS screen must use individual editable layers');
  assert.equal(page.components.some(c=>c.type==='Custom:TillSalesWorkspace'),false);
  assert.equal(page.components.find(c=>c.id==='pos-products').properties.objectApiName,'Product');
  assert.equal(page.components.find(c=>c.id==='pos-cash').properties.actionFlows.click.flowApiName,'POS_CASH_SETTLE');
  assert.equal(page.components.find(c=>c.id==='pos-card').properties.actionFlows.click.inputs.PaymentMethod,'card');
  assert.equal(page.components.find(c=>c.id==='pos-cart').properties.cartObjectApiName,'CartLine__c');
  assert(page.components.every(c=>c.position && c.properties.libraryComponentId));
  assert.equal(first.flows.find(f=>f.apiName==='POS_CASH_SETTLE').status,'Active');
  assert.equal(first.flows.find(f=>f.apiName==='POS_CASH_SETTLE').elements.find(e=>e.label==='Record sale as cash').config.fieldValues.find(v=>v.field==='Tender_Method__c').value,'Cash');
  assert(first.flows.some(f=>f.apiName==='KIOSK_CART_ADD'));
  assert(first.accessControl.profiles.some(p=>p.id==='pos-user'));
});
test('POS component is trusted, editable, and registered once',()=>{
 const tenant=applyInstallableAppPackages(baseTenant(),catalog);
 const root=new URL('../../web/src/custom-components/',import.meta.url).pathname;
 const components=ensureBundledAppComponents([],tenant,catalog,root);
 assert(components.length >= 7);
 assert(components.every(c=>c.trustedBundled===true));
 assert(components.some(c=>c.apiName==='KioskCart'));
 assert(components.some(c=>c.apiName==='KioskButton'));
});
test('No POS metadata is installed without tenant entitlement',()=>{
 const t=baseTenant();t.records.Connector_App__c[0].Installed__c=false;
 assert.equal(applyInstallableAppPackages(t,catalog).apps.length,0);
});

test('Installed POS provisions editable landing page before licence activation',()=>{
 const tenant=baseTenant();
 tenant.records.Connector_App__c[0].LicenceStatus__c='Not Activated';
 const installed=applyInstallableAppPackages(tenant,catalog);
 assert.equal(installed.pages.find(p=>p.apiName==='UNE_POS')?.status,'Active');
 assert.equal(installed.apps.find(a=>a.apiName==='POSApp')?.navigationPageApiNames?.includes('UNE_POS'),true);
 assert.deepEqual(applyInstallableAppPackages(installed,catalog),installed);
});

test('upgrades an installed legacy POS workspace to independently editable layers',()=>{
 const tenant=baseTenant();
 const first=applyInstallableAppPackages(tenant,catalog);
 const legacy={...first,pages:first.pages.map(page=>page.apiName==='UNE_POS'?{...page,components:[{id:'pos-sales-workspace',type:'Custom:TillSalesWorkspace',properties:{libraryComponentId:'TillSalesWorkspace'},position:{x:0,y:0,width:1440,height:900}}]}:page)};
 const repaired=applyInstallableAppPackages(legacy,catalog);
 assert(repaired.pages.find(p=>p.apiName==='UNE_POS').components.length >=10);
 assert.deepEqual(applyInstallableAppPackages(repaired,catalog),repaired);
});
