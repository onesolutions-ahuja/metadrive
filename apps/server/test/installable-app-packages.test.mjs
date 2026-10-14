import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {applyInstallableAppPackages} from '../src/installable-app-packages.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';
import {kioskDeviceIdentity,prepareKioskDevice} from '../src/kiosk-device-provision.mjs';
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
  assert.equal(first.length,entry.components.length);
  assert.equal(first[0].trustedBundled,true);
  assert.equal(first[0].status,'Published');
  assert.match(first[0].compiledJs,/KioskOrderingExperience/);
  assert.equal(ensureBundledAppComponents(first,working,catalog,root).length,entry.components.length);
});

test('kiosk virtual device seeder requires a licensed installation and restricted profile',()=>{
  const id=kioskDeviceIdentity('demo-tenant',1);
  assert.equal(id,'kiosk1@demo-tenant.invalid');
  assert.throws(()=>kioskDeviceIdentity('tenant',0));
  assert.throws(()=>prepareKioskDevice(tenant(),id,'user-a','2026-10-13T00:00:00Z'));
  const installed=applyInstallableAppPackages(tenant(),catalog);
  const seeded=prepareKioskDevice(installed,id,'user-a','2026-10-13T00:00:00Z');
  const user=seeded.accessControl.users.find(u=>u.id==='user-a');
  assert.ok(user);
  assert.equal(user.profileId,'kiosk-user');
  const profile=seeded.accessControl.profiles.find(p=>p.id==='kiosk-user');
  assert.equal(profile.navigationDefaultAccess,'Deny');
  assert.ok(profile.systemPermissions.includes('metadata:read'));
  assert.ok(profile.systemPermissions.includes('flows:run'));
  assert.equal(profile.appPermissions.KioskApp,true);
  assert.equal(profile.tabPermissions.Product,true);
  assert.equal(user.username,id);
  assert.deepEqual(user.permissionSetIds,[]);
  assert.throws(()=>prepareKioskDevice(seeded,id,'user-b','2026-10-13T00:00:00Z'));
  assert.equal(seeded.pages.find(p=>p.apiName==='UNE_KIOSK_CANVAS').activationAssignments
    .some(a=>a.appId==='KioskApp' && a.scope==='App Default'),true);
});

test('legacy kiosk seed is a published Home Page eligible for repaired app fallback',()=>{
  const installed=applyInstallableAppPackages(tenant(),catalog);
  const page=installed.pages.find(p=>p.apiName==='UNE_KIOSK');
  assert.equal(page.pageType,'Home Page');
  assert.equal(page.status,'Active');
  assert.ok(page.devices.includes('Desktop'));
  assert.equal(page.layoutMode,'free-canvas');
  assert.equal(installed.apps.find(a=>a.apiName==='KioskApp')?.apiName,'KioskApp');
});

test('licensed kiosk metadata can be repaired idempotently without replacing tenant custom pages', () => {
  const installed=applyInstallableAppPackages(tenant(),catalog);
  const kiosk=installed.pages.find(p=>p.apiName==='UNE_KIOSK');
  const broken={...installed,
    pages:[{...kiosk,activationAssignments:[],
      components:kiosk.components.map(c=>({...c,properties:{...c.properties,
        accentColor:'#ffca26',categoryObjectApiName:undefined}}))}]};
  const fixed=applyInstallableAppPackages(broken,catalog);
  const page=fixed.pages.find(p=>p.apiName==='UNE_KIOSK');
  assert.equal(page.pageType,'Home Page');
  assert.equal(page.status,'Active');
  assert.equal(fixed.pages.find(p=>p.apiName==='UNE_KIOSK_CANVAS').activationAssignments.some(a=>a.appId==='KioskApp' && a.scope==='App Default'),true);
  assert.equal(page.components[0].properties.categoryObjectApiName,'ProductCategory');
  assert.equal(page.components[0].properties.accentColor,'#d71e28');
  assert.deepEqual(applyInstallableAppPackages(fixed,catalog),fixed);
});
test('trusted bundled KFC-style kiosk upgrades without overwriting tenant-owned components', () => {
  const working=applyInstallableAppPackages(tenant(),catalog);
  const root=new URL('../../web/src/custom-components/',import.meta.url).pathname;
  const first=ensureBundledAppComponents([],working,catalog,root);
  assert.equal(first[0].version,3);
  assert.match(first[0].compiledJs,/mdk-products/);
  assert.match(first[0].cssSource,/mdk-categories/);
  const older=[{...first[0],version:1,publishedVersion:1,compiledJs:'old markup'}];
  const upgraded=ensureBundledAppComponents(older,working,catalog,root);
  assert.equal(upgraded[0].version,3);
  assert.match(upgraded[0].compiledJs,/mdk-products/);
  const tenantOwned=[{...older[0],trustedBundled:false,compiledJs:'tenant code'}];
  assert.equal(ensureBundledAppComponents(tenantOwned,working,catalog,root)[0].compiledJs,'tenant code');
});

test('editable kiosk canvas installs independent components and preserves legacy page', () => {
  const installed=applyInstallableAppPackages(tenant(),catalog);
  const canvas=installed.pages.find(p=>p.apiName==='UNE_KIOSK_CANVAS');
  assert.ok(canvas);
  assert.equal(canvas.layoutMode,'free-canvas');
  assert.ok(installed.pages.some(p=>p.apiName==='UNE_KIOSK'));
  assert.ok(canvas.components.length>=10);
  assert.equal(new Set(canvas.components.map(c=>c.id)).size,canvas.components.length);
  assert.ok(!canvas.components.some(c=>c.type==='Custom:KioskOrderingExperience'));
  const registry=new Set(entry.components.map(c=>c.apiName));
  assert.ok(canvas.components.every(c=>registry.has(c.type.replace(/^Custom:/,''))));
  assert.equal(canvas.components.find(c=>c.id==='kiosk-products').properties.actionFlows.add.flowApiName,'KIOSK_CART_ADD');
  assert.equal(canvas.components.find(c=>c.id==='kiosk-cart').properties.actionFlows.remove.flowApiName,'KIOSK_CART_REMOVE');
  assert.equal(canvas.components.find(c=>c.id==='kiosk-clear').properties.actionFlows.click.flowApiName,'KIOSK_CART_RESET');
  for (const [id,orderType] of [['kiosk-eat-in','eat-in'],['kiosk-takeaway','takeaway']]) {
    const checkout=canvas.components.find(c=>c.id===id).properties.actionFlows.click;
    assert.equal(checkout.flowApiName,'KIOSK_CHECKOUT');
    assert.equal(checkout.inputs.OrderType,orderType);
  }
  assert.ok(installed.apps.find(a=>a.apiName==='KioskApp').navigationPageApiNames.includes('UNE_KIOSK_CANVAS'));
  const customized={...installed,pages:installed.pages.map(p=>p.apiName===canvas.apiName?{...p,label:'Tenant Custom Canvas'}:p)};
  const rerun=applyInstallableAppPackages(customized,catalog);
  assert.equal(rerun.pages.find(p=>p.apiName===canvas.apiName).label,'Tenant Custom Canvas');
});

test('package upgrade makes editable canvas discoverable and preserves tenant-owned assignments', () => {
  const latest=applyInstallableAppPackages(tenant(),catalog);
  const legacy=latest.pages.find(page=>page.apiName==='UNE_KIOSK');
  const oldTenant={...latest,
    pages:[{...legacy,activationAssignments:[
      {id:'package-kiosk-app-default',scope:'App Default',appId:'KioskApp',profileId:null,recordTypeId:null,formFactors:['Desktop','Phone']},
      {id:'tenant-custom',scope:'App and Profile',appId:'AnotherApp',profileId:'standard-user',recordTypeId:null,formFactors:['Desktop']}
    ]}],
    apps:latest.apps.map(app=>app.apiName==='KioskApp'
      ? {...app,navigationPageApiNames:[],navigationOrder:[{type:'Object',apiName:'Product'}]}
      : app)
  };
  const upgraded=applyInstallableAppPackages(oldTenant,catalog);
  const canvas=upgraded.pages.find(page=>page.apiName==='UNE_KIOSK_CANVAS');
  const old=upgraded.pages.find(page=>page.apiName==='UNE_KIOSK');
  assert.ok(canvas.activationAssignments.some(a=>a.id==='package-kiosk-app-default'));
  assert.ok(old.activationAssignments.some(a=>a.id==='tenant-custom'));
  assert.equal(old.activationAssignments.some(a=>a.id==='package-kiosk-app-default'),false);
  const app=upgraded.apps.find(x=>x.apiName==='KioskApp');
  assert.ok(app.navigationPageApiNames.includes(canvas.apiName));
  assert.ok(app.navigationOrder.some(x=>x.type==='Page'&&x.apiName===canvas.apiName));
  assert.deepEqual(applyInstallableAppPackages(upgraded,catalog),upgraded);
});
