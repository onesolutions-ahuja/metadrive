// Explicit owner-approved commerce Object/Flow migration via generic metadata APIs.
// Dry run is default. No direct SQL registry edits, deletes, or RBAC bypasses.
import {customisationObjectExtensions,basketObjectExtensions} from './kiosk-commerce-capabilities.mjs';
import {commerceFlows} from './kiosk-phase4-flows.mjs';
import {commercePages} from './kiosk-phase4-pages.mjs';

const approved=process.env.METADRIVE_COMMERCE_MIGRATION_APPROVED==='true';
const expectedTenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
const origin=(process.env.METADRIVE_API_URL??'').replace(/\/$/,'').replace(/\/api$/,'');
const retired=new Set(['ModifierGroup__c','ModifierOption__c','ProductCategory__c','SaleItem__c','OrderLineModifier__c']);
const definitions={...customisationObjectExtensions,...basketObjectExtensions};
if(!approved){
 console.log(JSON.stringify({mode:'dry-run',objects:Object.keys(definitions),
  flows:commerceFlows.map(f=>f.apiName),pages:commercePages.map(p=>p.apiName)}));
 process.exit(0);
}
if(!/^https:\/\//.test(origin)||!expectedTenant||
 !process.env.METADRIVE_ADMIN_EMAIL||!process.env.METADRIVE_ADMIN_PASSWORD)
 throw Error('HTTPS API, tenant ID and admin credentials required');
let token='';
async function api(path,method='GET',body){
 const response=await fetch(origin+'/api'+path,{method,headers:{
  accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
  ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok)throw Error(method+' '+path+' '+response.status+': '+JSON.stringify(result).slice(0,900));
 return result;
}
const login=await api('/auth/login','POST',{email:process.env.METADRIVE_ADMIN_EMAIL,
 password:process.env.METADRIVE_ADMIN_PASSWORD});
if(login.user?.tenantId!==expectedTenant||!login.access_token)
 throw Error('Tenant identity mismatch; nothing changed');
token=login.access_token;
const objects=(await api('/metadata/objects')).objects;
const current=new Map(objects.map(o=>[o.apiName,o]));
for(const name of Object.keys(definitions))if(!current.has(name))
 throw Error('Missing replacement Object: '+name);
// Preflight ALL Object changes before any mutation.
const patches=[];
for(const [name,fields] of Object.entries(definitions)){
 const object=current.get(name),byName=new Map(object.fields.map(f=>[f.apiName,f]));
 const changed=new Map();
 for(const field of fields){
  const old=byName.get(field.apiName);
  if(!old){changed.set(field.apiName,field);continue;}
  if(old.dataType===field.dataType &&
     (!field.relationship||old.relationship?.targetObject===field.relationship.targetObject))continue;
  // Only the exact requested category reparenting can change a live field.
  if(name!=='Product__c'||field.apiName!=='CategoryId'||
     old.relationship?.targetObject!=='ProductCategory__c')
   throw Error('Unexpected incompatible metadata field: '+name+'.'+field.apiName);
  changed.set(field.apiName,{...old,dataType:field.dataType,relationship:field.relationship});
 }
 if(name==='ProductModifierGroup__c'&&byName.has('GroupId')){
  const group=byName.get('GroupId');
  if(group.relationship?.targetObject!=='ModifierGroup__c')
   throw Error('Unexpected product group relationship; refusing deletion');
 }
 const nextFields=object.fields.filter(f=>!(name==='ProductModifierGroup__c'&&f.apiName==='GroupId'))
  .map(f=>changed.get(f.apiName)??f);
 for(const field of fields)if(!byName.has(field.apiName))nextFields.push(field);
 if(JSON.stringify(nextFields)!==JSON.stringify(object.fields))
  patches.push({name,before:object,after:{...object,fields:nextFields}});
}
const knownFlows=(await api('/metadata/flows')).flows;
for(const desired of commerceFlows){
 const old=knownFlows.find(f=>f.apiName===desired.apiName);
 if(old&&!old.description?.startsWith('MetaDrive Commerce Phase 4:'))
  throw Error('Flow may be tenant-customised, refusing replacement: '+desired.apiName);
}
const knownPages=(await api('/metadata/pages')).pages;
for(const desired of commercePages){
 const old=knownPages.find(p=>p.apiName===desired.apiName);
 if(old&&(old.pageType!==desired.pageType||old.targetObject!==desired.targetObject))
  throw Error('Page may be tenant-customised: '+desired.apiName);
}
for(const patch of patches){
 await api('/metadata/objects/'+encodeURIComponent(patch.name),'PUT',patch.after);
 const verified=(await api('/metadata/objects')).objects.find(x=>x.apiName===patch.name);
 if(!verified||JSON.stringify(verified.fields.map(f=>[f.apiName,f.dataType,f.relationship?.targetObject??'']))!==
   JSON.stringify(patch.after.fields.map(f=>[f.apiName,f.dataType,f.relationship?.targetObject??''])))
  throw Error('Object write not verified: '+patch.name);
}
for(const desired of commerceFlows){
 await api('/metadata/flows/'+encodeURIComponent(desired.apiName),'PUT',desired);
 const verified=(await api('/metadata/flows')).flows.find(f=>f.apiName===desired.apiName);
 if(!verified||JSON.stringify(verified.elements)!==JSON.stringify(desired.elements))
  throw Error('Flow update not verified: '+desired.apiName);
}
for(const desired of commercePages){
 await api('/metadata/pages/'+encodeURIComponent(desired.apiName),'PUT',desired);
 const verified=(await api('/metadata/pages')).pages.find(p=>p.apiName===desired.apiName);
 if(!verified||JSON.stringify(verified.components)!==JSON.stringify(desired.components))
  throw Error('Page update not verified: '+desired.apiName);
}
const output={objectPatches:patches.map(p=>p.name),flows:commerceFlows.length,
 pages:commercePages.length,retiredObjects:[...retired]};
console.log(JSON.stringify({mode:'applied',...output,
// These are not deleted automatically. Owner must retire them via Object Manager.
 deletionReady:false,reason:'Requires live dependency scan, Flow Check and rollback verification.'}));
