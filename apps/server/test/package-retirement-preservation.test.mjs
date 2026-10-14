import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  applyInstallableAppPackages, retireUninstalledPackageMetadata,
  repairHistoricPackageRecordAudits
} from '../src/installable-app-packages.mjs';

const catalog=JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
const retired=catalog.retiredPackages;
const retiredApps=retired.flatMap(pkg=>pkg.apps??[]);
const retiredPages=retired.flatMap(pkg=>pkg.pages??[]);
const retiredFlows=retired.flatMap(pkg=>pkg.flows??[]);
const fixture=()=>({
  apps:[...retiredApps.map(apiName=>({apiName})),{
    apiName:'ServiceApp',navigationItems:[retiredPages[0],'Account'],
    navigationPageApiNames:[retiredPages[0],'Dashboard'],
    navigationOrder:[{type:'Page',apiName:retiredPages[0]},{type:'Object',apiName:'Account'}]
  }],
  pages:[...retiredPages.map(apiName=>({apiName})),{
    apiName:'Dashboard',activationAssignments:[
      {appId:retiredApps[0]},{appId:'ServiceApp'}
    ]
  }],
  flows:[...retiredFlows.map(apiName=>({apiName})),{apiName:'KEEP_FLOW'}],
  objects:[{apiName:'Sale__c',fields:[]},{apiName:'Product',fields:[]}],
  records:{Connector_App__c:[
    ...retired.map(pkg=>({AppKey__c:pkg.appKey,Installed__c:true})),
    {AppKey__c:'whatsapp',Installed__c:true}
  ],Sale__c:[{Id:'order1'}],Product:[{Id:'item1'}]},
  accessControl:{
    profiles:[{id:'admin',appPermissions:Object.fromEntries(retiredApps.map(id=>[id,true]).concat([['ServiceApp',true]]))}],
    permissionSets:[{id:'staff',appPermissions:Object.fromEntries(retiredApps.map(id=>[id,true]))}]
  }
});

test('the trusted catalog has no current installation of a retired package',()=>{
  const active=new Set(catalog.packages.map(pkg=>pkg.appKey));
  for(const pkg of retired) assert.equal(active.has(pkg.appKey),false);
});

test('removes only retired package metadata, navigation and permissions while retaining business records',()=>{
  const before=fixture(),result=retireUninstalledPackageMetadata(before,catalog);
  assert.deepEqual(result.apps.map(x=>x.apiName),['ServiceApp']);
  assert.deepEqual(result.apps[0].navigationItems,['Account']);
  assert.deepEqual(result.apps[0].navigationPageApiNames,['Dashboard']);
  assert.deepEqual(result.apps[0].navigationOrder,[{type:'Object',apiName:'Account'}]);
  assert.deepEqual(result.pages.map(x=>x.apiName),['Dashboard']);
  assert.deepEqual(result.pages[0].activationAssignments,[{appId:'ServiceApp'}]);
  assert.deepEqual(result.flows,[{apiName:'KEEP_FLOW'}]);
  assert.deepEqual(result.records.Connector_App__c,[{AppKey__c:'whatsapp',Installed__c:true}]);
  assert.deepEqual(result.records.Sale__c,[{Id:'order1'}]);
  assert.deepEqual(result.records.Product,[{Id:'item1'}]);
  assert.deepEqual(result.objects,before.objects);
  assert.deepEqual(result.accessControl.profiles[0].appPermissions,{ServiceApp:true});
  assert.deepEqual(result.accessControl.permissionSets[0].appPermissions,{});
  assert.equal(before.apps.length>result.apps.length,true);
});

test('a new app with a previously retired API name survives after one-time cleanup',()=>{
  const cleaned=applyInstallableAppPackages(fixture(),catalog);
  const redesigned={...cleaned,apps:[...cleaned.apps,{apiName:retiredApps[0],label:'Redesigned'}]};
  assert.strictEqual(retireUninstalledPackageMetadata(redesigned,catalog),redesigned);
  assert.deepEqual(applyInstallableAppPackages(redesigned,catalog),redesigned);
});

test('manual tenant apps are preserved without a matching original installation record',()=>{
  const before=fixture();
  before.records.Connector_App__c=[{AppKey__c:'whatsapp'}];
  assert.strictEqual(retireUninstalledPackageMetadata(before,catalog),before);
});

test('a newly registered package with a reused key overrides historic retirement',()=>{
  const before=fixture();
  const current={...catalog,packages:[{appKey:retired[0].appKey}]};
  const after=retireUninstalledPackageMetadata(before,current);
  assert(after.apps.some(app=>app.apiName===retired[0].apps[0]));
});

test('historical audit repair modifies only explicitly listed signed seed IDs',()=>{
  const knownId=retired.flatMap(pkg=>pkg.auditRecordIds?.Product??[])[0];
  assert(knownId);
  const raw={tenants:{a:{records:{Product:[
    {Id:knownId,Name:'Legacy metadata'},
    {Id:'customer-record',Name:'Keep'}
  ]}}}};
  assert.equal(repairHistoricPackageRecordAudits(raw,catalog),true);
  assert.match(raw.tenants.a.records.Product[0].CreatedDate,/^\d{4}-/);
  assert.match(raw.tenants.a.records.Product[0].LastModifiedDate,/^\d{4}-/);
  assert.equal(raw.tenants.a.records.Product[1].CreatedDate,undefined);
  assert.equal(repairHistoricPackageRecordAudits(raw,catalog),false);
});
