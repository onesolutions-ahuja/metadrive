import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAppSeedCatalog} from '../../apps/server/src/seeders/catalog.mjs';
import {applyInstallableAppPackages} from '../../apps/server/src/installable-app-packages.mjs';
import {createCoreRecordAccess} from '../../apps/server/src/core/security/record-access.js';

const catalog=loadAppSeedCatalog();
const whatsapp=catalog.packages.find(pkg=>pkg.appKey==='whatsapp');
const chatter=whatsapp?.apps?.find(app=>app.apiName==='ChatterApp');

test('Chatter is an editable App Page packaged by the existing WhatsApp lifecycle',()=>{
 assert.ok(whatsapp);
 assert.ok(chatter);
 assert.equal(whatsapp.installation.defaultAppApiName,'ChatterApp');
 assert.ok(chatter.navigationPageApiNames.includes('UNE_CHATTER_APP'));
 const page=whatsapp.pages.find(page=>page.apiName==='UNE_CHATTER_APP');
 assert.equal(page?.pageType,'App Page');
 assert.equal(page?.status,'Active');
 assert.ok(page?.components.some(component=>component.type==='Custom:OneConversation' &&
   component.properties?.recordPresenterApiName==='CommunicationThread' &&
   component.properties?.actionFlows?.send?.flowApiName==='CHATTER_SEND_MESSAGE'));
 assert.ok(whatsapp.pages.some(page=>page.apiName==='UNE_CHATTER' &&
   page.pageType==='Record Page'), 'legacy record page remains untouched');
});

function installedTenant(installed:boolean) {
 return {objects:[],pages:[],apps:[],flows:[],records:{
   Connector_App__c:[{AppKey__c:'whatsapp',Installed__c:installed,LicenceStatus__c:'Not Activated'}]
 },accessControl:{profiles:[],permissionSets:[],permissionSetGroups:[],users:[]}};
}
test('Chatter installation is idempotent and preserves metadata and business records',()=>{
 const selected={packages:[{appKey:'whatsapp',installation:{allowInstalledMetadataWithoutLicence:true},
   apps:[chatter],pages:[whatsapp.pages.find(page=>page.apiName==='UNE_CHATTER_APP')]}]};
 const tenant=installedTenant(true);
 const first=applyInstallableAppPackages(tenant,selected,'t1');
 assert.equal(first.apps.length,1);
 assert.equal(first.apps[0].installationAppKey,'whatsapp');
 assert.equal(first.pages.length,1);
 const edited={...first,apps:[{...first.apps[0],label:'Tenant customised Chatter'}],
   records:{...first.records,Communication_Records__c:[{Id:'existing',Body__c:'saved'}]}};
 const second=applyInstallableAppPackages(edited,selected,'t1');
 assert.equal(second.apps[0].label,'Tenant customised Chatter');
 assert.equal(second.apps.length,1);
 assert.equal(second.pages.length,1);
 assert.deepEqual(second.records.Communication_Records__c,edited.records.Communication_Records__c);
});

test('package apps disappear from authorised navigation after uninstall without record deletion',()=>{
 const user={id:'u',role:'administrator',permissionSetIds:[],permissionSetGroupIds:[]};
 const principal={userId:'u',tenantId:'t',permissions:[]};
 const access=createCoreRecordAccess({principalUser:()=>user as never});
 const tenant={apps:[{apiName:'ChatterApp',installationAppKey:'whatsapp'},{apiName:'Records'}],
   records:{Connector_App__c:[{AppKey__c:'whatsapp',Installed__c:true}]},
   accessControl:{users:[{id:'u',profileId:'p',permissionSetIds:[],permissionSetGroupIds:[]}],
    profiles:[{id:'p',navigationDefaultAccess:'Allow',appPermissions:{},tabPermissions:{}}],
    permissionSets:[],permissionSetGroups:[]}} as never;
 assert.equal(access.canOpenApp(principal as never,tenant,'ChatterApp'),true);
 assert.equal(access.canOpenApp(principal as never,tenant,'Records'),true);
 (tenant as any).records.Connector_App__c[0].Installed__c=false;
 assert.equal(access.canOpenApp(principal as never,tenant,'ChatterApp'),false);
 assert.equal(access.canOpenApp(principal as never,tenant,'Records'),true);
 (tenant as any).records.Connector_App__c[0].Installed__c=true;
 (tenant as any).records.Connector_App__c.push({AppKey__c:'whatsapp',Installed__c:true});
 assert.equal(access.canOpenApp(principal as never,tenant,'ChatterApp'),false);
});
