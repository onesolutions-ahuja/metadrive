import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {applyInstallableAppPackages} from '../src/installable-app-packages.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';
const catalog=JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
const entry=catalog.packages.find(p=>p.appKey==='kiosk');
const tenant=(status='Trial')=>({
  objects:[{apiName:'Product',label:'Existing Product',pluralLabel:'Existing Products',kind:'Standard Object',description:'Tenant customised',fields:[{apiName:'Name',label:'Product Name',dataType:'Text(255)',required:true}]}],
  pages:[],apps:[],flows:[],
  accessControl:{profiles:[{id:'standard-user',label:'Standard',apiName:'Standard_User',systemPermissions:[],objectPermissions:{},fieldPermissions:{},appPermissions:{},tabPermissions:{}}]},
  records:{Connector_App__c:[{AppKey__c:'kiosk',Installed__c:true,LicenceStatus__c:status}]}
});
test('Kiosk installation is generic and never duplicates or overrides tenant objects',()=>{
  const first=applyInstallableAppPackages(tenant(),catalog);
  const second=applyInstallableAppPackages(first,catalog);
  assert.equal(first.objects.find(x=>x.apiName==='Product').label,'Existing Product');
  assert.equal(first.objects.filter(x=>x.apiName==='Product').length,1);
  assert.equal(second.objects.filter(x=>x.apiName==='SaleItem__c').length,1);
  assert.equal(second.pages.filter(x=>x.apiName==='UNE_KIOSK').length,1);
  assert.equal(second.apps.filter(x=>x.apiName==='KioskApp').length,1);
  assert.equal(second.flows.filter(x=>x.apiName==='KIOSK_CHECKOUT').length,1);
  assert.equal(second.flows.find(x=>x.apiName==='KIOSK_CHECKOUT').status,'Draft');
  assert.ok(second.accessControl.profiles.some(x=>x.id==='kiosk-user'));
  assert.equal(second.pages.find(x=>x.apiName==='UNE_KIOSK').components[0].properties.objectApiName,'Product');
});
test('Kiosk content is not provisioned before a valid app entitlement',()=>{
  assert.equal(applyInstallableAppPackages(tenant('Not Activated'),catalog).pages.length,0);
});
test('bundled components register once from trusted signed local assets',()=>{
  const working=applyInstallableAppPackages(tenant(),catalog);
  const root=new URL('../../web/src/custom-components/',import.meta.url).pathname;
  const first=ensureBundledAppComponents([],working,catalog,root);
  assert.equal(first.length,1);
  assert.equal(first[0].trustedBundled,true);
  assert.equal(first[0].status,'Published');
  assert.match(first[0].compiledJs,/KioskOrderingExperience/);
  assert.equal(ensureBundledAppComponents(first,working,catalog,root).length,1);
});
