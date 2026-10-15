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
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const retryableWriterError=error=>/Concurrent writer detected|Concurrent SQL write|HTTP (502|503|504)/i.test(String(error));
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
const login=await api('/auth/login','POST',{email,password});
if(login.user?.tenantId!==expectTenant)throw Error('Tenant mismatch, refusing installation');
token=login.access_token;
if(!token)throw Error('No authenticated token returned');
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
// Security updates are full snapshots. On optimistic-writer contention,
// READ THE LATEST grants before retrying so concurrent RBAC edits are preserved.
async function updateSecurity(prepare){
 for(let attempt=0;attempt<6;attempt++){
  const current=await api('/metadata/permissions');
  const proposed=prepare(current);
  if(!proposed)return false;
  try { await api('/metadata/permissions','PUT',proposed);return true; }
  catch(error){
   if(!/HTTP (409|502|503|504)/.test(String(error))||attempt===5)throw error;
   await new Promise(resolve=>setTimeout(resolve,Math.min(12000,1200*2**attempt)));
  }
 }
 throw Error('Unable to commit security metadata without concurrent overwrite');
}
// Only stale Object/field grants are removed. All valid tenant RBAC is retained.
const knownFields=new Map(objectList.map(object=>[
 object.apiName,new Set(object.fields.map(field=>field.apiName))
]));
const keepKnown=(grants,valid)=>Object.fromEntries(
 Object.entries(grants??{}).filter(([key])=>valid(key))
);
const knownField=(key)=>{
 const dot=key.indexOf('.');
 return dot>0 && knownFields.get(key.slice(0,dot))?.has(key.slice(dot+1));
};
const scrub=(entry)=>({
 ...entry,
 objectPermissions:keepKnown(entry.objectPermissions,name=>knownFields.has(name)),
 fieldPermissions:keepKnown(entry.fieldPermissions,knownField),
 ...(entry.mutedObjectPermissions?{mutedObjectPermissions:
  keepKnown(entry.mutedObjectPermissions,name=>knownFields.has(name))}:{}),
 ...(entry.mutedFieldPermissions?{mutedFieldPermissions:
  keepKnown(entry.mutedFieldPermissions,knownField)}:{})
});
const installerSetId='md-commerce-metadata-installer';
const requiredCapabilities=['metadata:read','metadata:write','components:manage','flows:manage','pages:manage'];
const installerChanged=await updateSecurity(access=>{
 const installer=(access.users??[]).find(u=>u.id===login.user?.id)
  ??(access.users??[]).find(u=>String(u.username??u.email??'').toLowerCase()===email.toLowerCase());
 if(!installer)throw Error('Phase 4 installer identity is absent from tenant RBAC');
 const profile=(access.profiles??[]).find(p=>p.id===installer.profileId);
 if(!profile)throw Error('Phase 4 installer profile is missing');
 const existing=(access.permissionSets??[]).find(p=>p.id===installerSetId);
 if(installer.permissionSetIds?.includes(installerSetId)
  &&requiredCapabilities.every(p=>existing?.systemPermissions?.includes(p)))return null;
 const grant={...(existing??{
  id:installerSetId,label:'Commerce Metadata Installer',apiName:'MD_Commerce_Metadata_Installer',
  license:profile.license,description:'Restricted metadata installation service role',
  objectPermissions:{},fieldPermissions:{},recordTypePermissions:{},
  appPermissions:{},tabPermissions:{}
 }),systemPermissions:[...new Set([...(existing?.systemPermissions??[]),...requiredCapabilities])]};
 return {
  ...access,
  profiles:(access.profiles??[]).map(scrub),
  permissionSets:[...(access.permissionSets??[]).filter(p=>p.id!==installerSetId),grant].map(scrub),
  permissionSetGroups:(access.permissionSetGroups??[]).map(scrub),
  users:(access.users??[]).map(u=>u.id===installer.id
   ?{...u,permissionSetIds:[...new Set([...(u.permissionSetIds??[]),installerSetId])]}:u)
 };
});
if(installerChanged){
 const refreshed=await api('/auth/login','POST',{email,password});
 if(refreshed.user?.tenantId!==expectTenant||!refreshed.access_token)
  throw Error('Phase 4 RBAC refresh failed, refusing metadata writes');
 token=refreshed.access_token;
}

// Component registry is the sole source of executable JSX. Do not embed code in Pages.
async function installRegisteredComponent(component){
 let created=false;
 for(let attempt=0;attempt<6;attempt++){
  // Registry owns publishing. Never bypass draft validation or publish a bundled asset.
  const available=(await api('/component-library')).components;
  const existing=available.find(x=>x.apiName===component.apiName);
  if(existing){
   if(existing.tenantId!==expectTenant && existing.tenantId!==undefined)
    throw Error('A component API name belongs to another tenant: '+component.apiName);
   if(existing.trustedBundled)throw Error('Refusing to overwrite a bundled component: '+component.apiName);
   if(!existing.surfaces?.includes('page'))
    throw Error('Existing component is not available to Page Builder: '+component.apiName);
   if(existing.status==='Published')return created;
   if(existing.status!=='Draft')
    throw Error('Unexpected component publication state: '+component.apiName);
  }
  try{
   if(!existing){
    await api('/component-library','POST',{...component,publicationStatus:'Draft'});
    created=true;
   }else{
    await api('/component-library/'+encodeURIComponent(component.apiName)+'/publish','POST');
   }
  }catch(error){
   if(!retryableWriterError(error)||attempt===5)
    throw Error('Component '+component.apiName+' lifecycle failed: '+String(error));
   await sleep(Math.min(12000,1200*2**attempt));
  }
 }
 throw Error('Component could not be published after bounded retries: '+component.apiName);
}
let installedComponents=0;
for(const component of commerceComponents){
 if(await installRegisteredComponent(component))installedComponents++;
}
let libraries=(await api('/component-library')).components;
for(const name of expected.components)if(!libraries.some(x=>x.apiName===name&&x.status==='Published'))
 throw Error('Published UI component missing: '+name);

// Flows use the built-in versioned Flow Builder. Never overwrite user-edited versions.
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
let apps=(await api('/metadata/apps')).apps;
let installedApp=0;
if(!apps.some(a=>a.apiName===commerceApp.apiName)){
 await api('/metadata/apps','POST',{...commerceApp,navigationPageApiNames:[],
  navigationOrder:[{type:'Object',apiName:'Product__c'}]});
 installedApp=1;
}
let pages=(await api('/metadata/pages')).pages;
let installedPages=0;
for(const page of commercePages){
 const existing=pages.find(p=>p.apiName===page.apiName);
 if(existing){
  if(existing.pageType!=='App Page'||existing.status!=='Active')
   throw Error('Existing commerce Page is not active: '+page.apiName);
  // Upgrade only our known v1 blocks; preserve editor-adjusted position, bindings,
  // visibility and styles. Other/custom blocks are never touched.
  const newById=new Map(page.components.map(block=>[block.id,block]));
  const upgrades=existing.components.map(block=>{
   const target=newById.get(block.id);
   if(!target || !/^Custom:MD_Commerce(?:Navigation|ProductGrid|BasketPanel|Status)$/.test(block.type))
    return block;
   return {...block,type:target.type,properties:{...block.properties,
    ...(block.properties?.accentColor==='#103e51'?{accentColor:'#e4002b'}:{}),
    ...(target.properties?.standalonePresentation?{standalonePresentation:true}:{}),
    ...(block.properties?.title==='Order kiosk'?{title:'ORDER NOW'}:{})}};
  });
  if(upgrades.some((block,i)=>JSON.stringify(block)!==JSON.stringify(existing.components[i]))){
   await api('/metadata/pages/'+encodeURIComponent(page.apiName),'PUT',{
    ...existing,components:upgrades,canvasWidth:existing.canvasWidth,canvasHeight:existing.canvasHeight
   });
   installedPages++;
  }
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
// Seed the existing OneEngine administrator profile, not a parallel user role.
// Only fill absent grants: administrator edits to existing grants are retained.
const fullObject={read:true,create:true,edit:true,delete:true,viewAll:true,modifyAll:true};
await updateSecurity(access=>{
 const admin=(access.profiles??[]).find(p=>p.id==='system-administrator');
 if(!admin)throw Error('Existing OneEngine administrator profile not found');
 const missingObjects=Object.fromEntries(usedObjects.filter(name=>
  !Object.prototype.hasOwnProperty.call(admin.objectPermissions??{},name)).map(name=>[name,fullObject]));
 const missingFields=Object.fromEntries(usedObjects.flatMap(name=>objectMap.get(name).fields.map(f=>name+'.'+f.apiName))
  .filter(name=>!Object.prototype.hasOwnProperty.call(admin.fieldPermissions??{},name))
  .map(name=>[name,{read:true,edit:true}]));
 const hasApp=Object.prototype.hasOwnProperty.call(admin.appPermissions??{},commerceApp.apiName);
 const hasTab=Object.prototype.hasOwnProperty.call(admin.tabPermissions??{},'Product__c');
 if(!Object.keys(missingObjects).length&&!Object.keys(missingFields).length&&hasApp&&hasTab)return null;
 return {...access,profiles:(access.profiles??[]).map(profile=>profile.id!==admin.id?profile:{
  ...profile,
  objectPermissions:{...profile.objectPermissions,...missingObjects},
  fieldPermissions:{...profile.fieldPermissions,...missingFields},
  appPermissions:{...profile.appPermissions,...(!hasApp?{[commerceApp.apiName]:true}:{})},
  tabPermissions:{...profile.tabPermissions,...(!hasTab?{Product__c:true}:{})}
 })};
});
// Prepare a limited OneEngine permission set. No user is automatically assigned.
const readOnly={read:true,create:false,edit:false,delete:false,viewAll:false,modifyAll:false};
const transaction={read:true,create:true,edit:true,delete:true,viewAll:false,modifyAll:false};
const grants=Object.fromEntries(usedObjects.map(name=>[name,
 ['Order__c','OrderLine__c','OrderLineModifier__c'].includes(name)
  ?{...transaction,delete:name!=='Order__c'}:readOnly]));
const fields=Object.fromEntries(usedObjects.flatMap(name=>objectMap.get(name).fields.map(f=>
 [name+'.'+f.apiName,{read:true,edit:['Order__c','OrderLine__c','OrderLineModifier__c'].includes(name)}])));
const id='md-commerce-kiosk-operator';
await updateSecurity(access=>{
 const existingSet=(access.permissionSets??[]).find(p=>p.id===id);
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
 if(JSON.stringify(existingSet??{})===JSON.stringify(operator))return null;
 return {...access,
  profiles:(access.profiles??[]).map(scrub),
  permissionSets:[...(access.permissionSets??[]).filter(s=>s.id!==id),operator].map(scrub),
  permissionSetGroups:(access.permissionSetGroups??[]).map(scrub)
 };
});
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
