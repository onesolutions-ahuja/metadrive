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
  assert.equal(page.components[0].type,'Custom:TillSalesWorkspace');
  assert.equal(page.components[0].properties.objectApiName,'Product');
  assert.equal(page.components[0].properties.basketSide,'right');
  assert.equal(page.components[0].properties.basketWidthPercent,35);
  assert.equal(page.components[0].properties.actionFlows.checkout.flowApiName,'POS_CASH_SETTLE');
  assert.equal(first.flows.find(f=>f.apiName==='POS_CASH_SETTLE').status,'Active');
  assert.equal(first.flows.find(f=>f.apiName==='POS_CASH_SETTLE').elements.find(e=>e.label==='Record sale as cash').config.fieldValues.find(v=>v.field==='Tender_Method__c').value,'Cash');
  assert(first.flows.some(f=>f.apiName==='KIOSK_CART_ADD'));
  assert(first.accessControl.profiles.some(p=>p.id==='pos-user'));
});
test('POS component is trusted, editable, and registered once',()=>{
 const tenant=applyInstallableAppPackages(baseTenant(),catalog);
 const root=new URL('../../web/src/custom-components/',import.meta.url).pathname;
 const components=ensureBundledAppComponents([],tenant,catalog,root);
 assert.equal(components.length,1);
 assert.equal(components[0].apiName,'TillSalesWorkspace');
 assert.equal(components[0].trustedBundled,true);
 assert.match(components[0].compiledJs,/TillSalesWorkspace/);
});
test('No POS metadata is installed without tenant entitlement',()=>{
 const t=baseTenant();t.records.Connector_App__c[0].Installed__c=false;
 assert.equal(applyInstallableAppPackages(t,catalog).apps.length,0);
});
