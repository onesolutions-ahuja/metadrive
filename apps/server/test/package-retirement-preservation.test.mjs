import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  applyInstallableAppPackages, retireUninstalledPackageMetadata,
  repairHistoricPackageRecordAudits
} from '../src/installable-app-packages.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';

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

test('UK off-licence POS installs its shared Flow, component metadata and least-privilege cashier profile',()=>{
  const metadata=JSON.parse(readFileSync(new URL('../data/platform-metadata.json',import.meta.url),'utf8'));
  const baseObjects=metadata.objects.filter(object=>['Product','Invoice','InvoiceItem'].includes(object.apiName));
  const tenant={
    objects:baseObjects,apps:[],pages:[],flows:[],
    records:{Connector_App__c:[{AppKey__c:'uk-offlicence-pos',Installed__c:true,LicenceStatus__c:'Trial'}]},
    accessControl:{profiles:[
      {id:'standard-user',apiName:'Standard_User',label:'Standard User',systemPermissions:[],objectPermissions:{},fieldPermissions:{},appPermissions:{},tabPermissions:{}},
      {id:'system-administrator',apiName:'System_Administrator',label:'Administrator',systemPermissions:[],objectPermissions:{},fieldPermissions:{},appPermissions:{},tabPermissions:{}}
    ],permissionSets:[]}
  };
  const installed=applyInstallableAppPackages(tenant,catalog,'tenant-pos-test');
  const flow=installed.flows.find(item=>item.apiName==='UK_OFFLICENCE_POS_CHECKOUT');
  const cashier=installed.accessControl.profiles.find(item=>item.id==='uk-offlicence-cashier');
  assert(flow);
  assert.equal(flow.status,'Active');
  assert.equal(flow.resources.find(item=>item.name==='StandardVatRate').availableForInput,false);
  assert.match(flow.resources.find(item=>item.name==='StandardVatRate').value,/\$CompanySettings\.StandardVatRate/);
  assert(flow.elements.some(item=>item.label==='Challenge 25 verification'));
  assert(flow.elements.some(item=>item.label==='Payment'));
  assert.equal(cashier.objectPermissions.Product.read,true);
  assert.equal(cashier.objectPermissions.Product.viewAll,true);
  assert.equal(cashier.objectPermissions.Product.edit,false);
  assert.equal(cashier.objectPermissions.Invoice.create,true);
  assert.equal(cashier.objectPermissions.Invoice.delete,false);
  assert.equal(cashier.objectPermissions.InvoiceItem.create,true);
  assert.equal(cashier.objectPermissions.InvoiceItem.delete,false);
  const root=fileURLToPath(new URL('../../web/src/custom-components/',import.meta.url));
  const components=ensureBundledAppComponents([],installed,catalog,root);
  assert.deepEqual(components.map(item=>item.apiName),['RecordCatalogCart','CustomerBasketDisplay']);
  assert(components.every(item=>item.propertyDefinitions?.length));
  const manifest=JSON.parse(readFileSync(new URL('../../web/src/custom-components/manifest.json',import.meta.url),'utf8'));
  assert(!manifest.some(item=>['RecordCatalogCart','CustomerBasketDisplay'].includes(item.apiName)));
  assert.deepEqual(applyInstallableAppPackages(installed,catalog,'tenant-pos-test'),installed);
});

test('existing WhatsApp Flow receives only safe additive credential scope metadata',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
  const pkg=catalog.packages.find(item=>item.appKey==='whatsapp');
  const existing={apiName:'CHATTER_SEND_MESSAGE',status:'Active',elements:[{id:2,type:'HTTP Callout',config:{namedCredentialResource:'{!AuthorisedCredentialId}',method:'POST'}}]};
  const tenant={apps:[],pages:[],objects:[],flows:[existing],records:{Connector_App__c:[{AppKey__c:'whatsapp',Installed__c:true,LicenceStatus__c:'Trial'}]},accessControl:{profiles:[],permissionSets:[]}};
  const result=applyInstallableAppPackages(tenant,{packages:[pkg],retiredPackages:[]});
  const config=result.flows.find(flow=>flow.apiName==='CHATTER_SEND_MESSAGE').elements[0].config;
  assert.deepEqual(config.allowedCredentialAppKeys,['whatsapp']);
  assert.equal(config.method,'POST');
  assert.strictEqual(applyInstallableAppPackages(result,{packages:[pkg],retiredPackages:[]}),result);
  const customised=structuredClone(tenant);
  customised.flows[0].elements[0].config.namedCredentialResource='{!CustomCredential}';
  const leftAlone=applyInstallableAppPackages(customised,{packages:[pkg],retiredPackages:[]});
  assert.equal(leftAlone.flows[0].elements[0].config.allowedCredentialAppKeys,undefined);
});
