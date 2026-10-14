// Repeat-safe Phase 4 installation via MetaDrive's authenticated metadata APIs.
// Run: METADRIVE_PHASE4_INSTALL_APPROVED=true METADRIVE_API_URL=https://... etc
import {commerceComponents} from './kiosk-phase4-components.mjs';
import {commerceFlows} from './kiosk-phase4-flows.mjs';
import {commercePages,commerceApp} from './kiosk-phase4-pages.mjs';

const approved=process.env.METADRIVE_PHASE4_INSTALL_APPROVED==='true';
const expectTenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
const origin=(process.env.METADRIVE_API_URL||'').replace(/\/$/,'').replace(/\/api$/,'');
const expected={components:commerceComponents.map(x=>x.apiName),
  flows:commerceFlows.map(x=>x.apiName),pages:commercePages.map(x=>x.apiName),app:commerceApp.apiName};
if(!approved){console.log(JSON.stringify({mode:'dry-run',expected}));process.exit(0)}
if(!/^https:\/\//i.test(origin))throw Error('HTTPS METADRIVE_API_URL is required for approved live installation');
const email=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!email||!password||!expectTenant)throw Error('Admin credentials and expected tenant ID are required');
let token='';
async function api(path,method='GET',body){
 const response=await fetch(origin+'/api'+path,{
  method,headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)
 });
 const raw=await response.text();
 let data;try{data=JSON.parse(raw)}catch{data={error:raw.slice(0,400)}}
 if(!response.ok)throw Error(method+' '+path+' HTTP '+response.status+': '+JSON.stringify(data).slice(0,1500));
 return data;
}
console.log('PHASE4_STEP:authentication');
const login=await api('/auth/login','POST',{email,password});
if(login.user?.tenantId!==expectTenant)throw Error('Tenant mismatch, refusing installation');
token=login.access_token;
if(!token)throw Error('No authenticated token returned');
console.log('PHASE4_STEP:object-contract');
const objectList=(await api('/metadata/objects')).objects;
const objectMap=new Map(objectList.map(o=>[o.apiName,o]));
const usedObjects=['Product__c','ProductCategory__c','ModifierGroup__c','ModifierOption__c',
 'ProductModifierGroup__c','Order__c','OrderLine__c','OrderLineModifier__c'];
for(const name of usedObjects)if(!objectMap.has(name))throw Error('Missing commerce Object: '+name);
for(const [name,fields] of Object.entries({
 Order__c:['BasketSessionKey','Status','Subtotal','TaxAmount','Total'],
 OrderLine__c:['OrderId','ProductId','Quantity','UnitPrice','LineTotal','ModifierTotal'],
 ModifierOption__c:['GroupId','PriceAdjustment','IsActive'],
 ProductModifierGroup__c:['ProductId','GroupId']
})){
 const found=new Set(objectMap.get(name).fields.map(f=>f.apiName));
 for(const field of fields)if(!found.has(field))throw Error('Missing commerce field: '+name+'.'+field);
}
// Component registry is the sole source of executable JSX. Do not embed code in Pages.
console.log('PHASE4_STEP:component-registry');
let libraries=(await api('/component-library')).components;
let installedComponents=0;
for(const component of commerceComponents){
 if(libraries.some(x=>x.apiName===component.apiName)){
  const existing=libraries.find(x=>x.apiName===component.apiName);
  if(existing.tenantId!==expectTenant && existing.tenantId!==undefined)
   throw Error('A component API name belongs to another tenant: '+component.apiName);
  if(!existing.surfaces?.includes('page')||existing.status==='Draft')
   throw Error('Existing component is unavailable to Page Builder: '+component.apiName);
  continue;
 }
 await api('/component-library','POST',component);
 installedComponents++;
}
libraries=(await api('/component-library')).components;
for(const name of expected.components)if(!libraries.some(x=>x.apiName===name&&x.status==='Published'))
 throw Error('Published UI component missing: '+name);

// Flows use the built-in versioned Flow Builder. Never overwrite user-edited versions.
console.log('PHASE4_STEP:flow-registration');
let flows=(await api('/metadata/flows')).flows;
let installedFlows=0;
for(const definition of commerceFlows){
 const existing=flows.find(x=>x.apiName===definition.apiName);
 if(existing){
  if(existing.status!=='Active')throw Error('Existing commerce Flow is not active: '+definition.apiName);
  continue;
 }
 await api('/metadata/flows/'+encodeURIComponent(definition.apiName),'PUT',definition);
 installedFlows++;
}
flows=(await api('/metadata/flows')).flows;
for(const name of expected.flows)if(!flows.some(f=>f.apiName===name&&f.status==='Active'))
 throw Error('Active commerce Flow missing: '+name);

// App must exist before scoped Page activation can reference it.
console.log('PHASE4_STEP:app-registration');
let apps=(await api('/metadata/apps')).apps;
let installedApp=0;
if(!apps.some(a=>a.apiName===commerceApp.apiName)){
 await api('/metadata/apps','POST',{...commerceApp,navigationPageApiNames:[],
  navigationOrder:[{type:'Object',apiName:'Product__c'}]});
 installedApp=1;
}
console.log('PHASE4_STEP:page-registration');
let pages=(await api('/metadata/pages')).pages;
let installedPages=0;
for(const page of commercePages){
 const existing=pages.find(p=>p.apiName===page.apiName);
 if(existing){
  if(existing.pageType!=='App Page'||existing.status!=='Active')
   throw Error('Existing commerce Page is not active: '+page.apiName);
  continue;
 }
 await api('/metadata/pages/'+encodeURIComponent(page.apiName),'PUT',page);
 installedPages++;
}
pages=(await api('/metadata/pages')).pages;
for(const expectedPage of commercePages){
 const installed=pages.find(p=>p.apiName===expectedPage.apiName);
 if(!installed||installed.status!=='Active'||installed.pageType!=='App Page')
  throw Error('Page not active: '+expectedPage.apiName);
 for(const block of expectedPage.components){
  if(!installed.components.some(c=>c.id===block.id))throw Error('Missing editable page block: '+block.id);
 }
}
apps=(await api('/metadata/apps')).apps;
const currentApp=apps.find(a=>a.apiName===commerceApp.apiName);
if(!currentApp)throw Error('Kiosk app not readable after creation');
if(expected.pages.some(x=>!currentApp.navigationPageApiNames?.includes(x))){
 await api('/metadata/apps/'+commerceApp.apiName,'PUT',{
  ...currentApp,navigationPageApiNames:[...new Set([...(currentApp.navigationPageApiNames??[]),...expected.pages])],
  navigationOrder:[],navigationItems:[...new Set([...(currentApp.navigationItems??[]),'Product__c'])]
 });
}
// Prepare a limited OneEngine permission set. No user is automatically assigned.
console.log('PHASE4_STEP:security-permissions');
const access=await api('/metadata/permissions');
const readOnly={read:true,create:false,edit:false,delete:false,viewAll:false,modifyAll:false};
const transaction={read:true,create:true,edit:true,delete:true,viewAll:false,modifyAll:false};
const grants=Object.fromEntries(usedObjects.map(name=>[name,
 ['Order__c','OrderLine__c','OrderLineModifier__c'].includes(name)
  ?{...transaction,delete:name!=='Order__c'}:readOnly]));
const fields=Object.fromEntries(usedObjects.flatMap(name=>objectMap.get(name).fields.map(f=>
 [name+'.'+f.apiName,{read:true,edit:['Order__c','OrderLine__c','OrderLineModifier__c'].includes(name)}])));
const id='md-commerce-kiosk-operator';
const existingSet=access.permissionSets.find(p=>p.id===id);
const operator={
 ...(existingSet??{id,label:'Kiosk Operator',apiName:'MD_Commerce_Kiosk_Operator',
  license:access.profiles.find(p=>p.id==='system-administrator')?.license??'MetaDrive',
  description:'Least-privilege role for the metadata-driven commerce kiosk'}),
 systemPermissions:[...new Set([...(existingSet?.systemPermissions??[]),'flows:run','metadata:read'])],
 objectPermissions:{...(existingSet?.objectPermissions??{}),...grants},
 fieldPermissions:{...(existingSet?.fieldPermissions??{}),...fields},
 recordTypePermissions:existingSet?.recordTypePermissions??{},
 appPermissions:{...(existingSet?.appPermissions??{}),[commerceApp.apiName]:true},
 tabPermissions:{...(existingSet?.tabPermissions??{}),Product__c:true}
};
if(JSON.stringify(existingSet??{})!==JSON.stringify(operator)){
 await api('/metadata/permissions','PUT',{...access,
  permissionSets:[...access.permissionSets.filter(s=>s.id!==id),operator]});
}
console.log('PHASE4_STEP:final-verification');
const verifiedApps=(await api('/metadata/apps')).apps;
if(!verifiedApps.some(app=>app.apiName===commerceApp.apiName
 && expected.pages.every(name=>app.navigationPageApiNames?.includes(name))))
 throw Error('App navigation did not persist');
const verifiedPermissions=(await api('/metadata/permissions')).permissionSets;
if(!verifiedPermissions.some(set=>set.id===id&&set.appPermissions?.[commerceApp.apiName]===true))
 throw Error('Kiosk Operator RBAC seed missing');
console.log(JSON.stringify({installed:true,tenant:expectTenant,
 created:{components:installedComponents,flows:installedFlows,pages:installedPages,apps:installedApp},
 verified:expected,permissionSet:'MD_Commerce_Kiosk_Operator',
 sampleUrl:'/une/apps/'+commerceApp.apiName+'/pages/MD_Commerce_Menu'}));
