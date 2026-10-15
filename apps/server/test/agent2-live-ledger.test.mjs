import test from 'node:test';
import assert from 'node:assert/strict';
import {recordInstalledAppPackageVersions} from '../src/seeders/registry.mjs';
import {applyDeveloperAppGrants} from '../src/seeders/apps.mjs';

const catalog={packages:[{
  appKey:'crm',version:'1.0.0',
  objects:[{apiName:'Lead',fields:[{apiName:'Name'}]}],pages:[{apiName:'CRM_Home'}],
  apps:[{apiName:'CRM'}],flows:[{apiName:'CRM_Activate'}]
}]};
const baseTenant=()=>({
  objects:[{apiName:'Lead'}],pages:[{apiName:'CRM_Home'}],
  apps:[{apiName:'CRM'}],flows:[{apiName:'CRM_Activate'}],
  records:{Connector_App__c:[{AppKey__c:'crm',Installed__c:true,LicenceStatus__c:'Licensed'}],
    Lead:[{Id:'customer-record'}]},
  accessControl:{permissionSets:[{id:'oneengine-tenant-developer',objectPermissions:{Lead:{read:false}}}]}
});
const fake=()=>{const statements=[];const client={query:async(sql,args)=>{
  statements.push({sql,args});
  return {rows:[]};
}};return {client,statements};};

test('agent2: live package ledger is tenant-scoped and leaves business data unmodified',async()=>{
  const tenant=baseTenant();
  const original=structuredClone(tenant);
  const {client,statements}=fake();
  await recordInstalledAppPackageVersions(client,{tenants:{'tenant-a':tenant}},catalog);
  const write=statements.find(x=>x.sql.startsWith('INSERT INTO md_seed_package_versions'));
  assert.deepEqual(write.args.slice(0,4),['tenant-a','app','crm','1.0.0']);
  assert.deepEqual(tenant,original);
});
test('agent2: an uninstalled, unlicensed or incomplete app does not enter the ledger',async()=>{
 for(const change of [
  t=>{t.records.Connector_App__c[0].Installed__c=false;},
  t=>{t.records.Connector_App__c[0].LicenceStatus__c='Expired';},
  t=>{t.pages=[];}
 ]){
  const tenant=baseTenant();change(tenant);
  const {client,statements}=fake();
  await recordInstalledAppPackageVersions(client,{tenants:{t:tenant}},catalog);
  assert.equal(statements.some(x=>x.sql.startsWith('INSERT INTO md_seed_package_versions')),false);
 }
});
test('agent2: cross-tenant package versions never mix',async()=>{
 const {client,statements}=fake();
 await recordInstalledAppPackageVersions(client,{tenants:{a:baseTenant(),b:baseTenant()}},catalog);
 const insert=statements.filter(x=>x.sql.startsWith('INSERT INTO md_seed_package_versions'));
 assert.deepEqual(insert.map(x=>x.args[0]),['a','b']);
});

test('agent2: freshly introduced installed app gets initial OneEngine developer metadata grants',()=>{
 const base=baseTenant();
 base.objects=[];base.pages=[];base.apps=[];base.flows=[];
 base.accessControl.permissionSets[0].objectPermissions={};
 base.accessControl.permissionSets[0].fieldPermissions={};
 const after=baseTenant();
 after.objects=[{apiName:'Lead',fields:[{apiName:'Name'}]}];
 after.accessControl=structuredClone(base.accessControl);
 const merged=applyDeveloperAppGrants(base,after,catalog.packages);
 const policy=merged.accessControl.permissionSets[0];
 assert.equal(policy.objectPermissions.Lead.modifyAll,true);
 assert.deepEqual(policy.fieldPermissions['Lead.Name'],{read:true,edit:true});
 assert.equal(policy.appPermissions.CRM,true);
});
test('agent2: reinstall does not overwrite edited OneEngine permissions',()=>{
 const tenant=baseTenant();
 tenant.objects=[{apiName:'Lead',fields:[{apiName:'Name'}]}];
 tenant.accessControl.permissionSets[0].objectPermissions.Lead={read:false};
 tenant.accessControl.permissionSets[0].fieldPermissions={'Lead.Name':{read:false,edit:false}};
 const merged=applyDeveloperAppGrants(tenant,structuredClone(tenant),catalog.packages);
 assert.deepEqual(merged,tenant);
});
