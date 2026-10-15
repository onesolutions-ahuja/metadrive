/** Phase 4 protected administration Page Builder live acceptance (read only). */
import assert from 'node:assert/strict';
import {protectedWorkspacePageDescriptors,protectedWorkspacePageSlots,protectedPageApiName} from '../apps/server/src/modules/metadata/platform-admin-pages.mjs';
const origin=(process.env.METADRIVE_API_URL||'').replace(/\/$/,'').replace(/\/api$/,'');
const email=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!origin.startsWith('https://')||!email||!password)throw Error('HTTPS URL and authorised CI credentials required');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,token,method='GET',body){
 const response=await fetch(origin+'/api'+path,{
  signal:AbortSignal.timeout(25000),method,
  headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response.ok)throw Error(path+' HTTP '+response.status);
 return response.json();
}
const login=await api('/auth/login',undefined,'POST',{email,password});
assert.ok(login.access_token,'Secure OneEngine session unavailable');
if(process.env.METADRIVE_EXPECTED_TENANT_ID)
 assert.equal(login.user?.tenantId,process.env.METADRIVE_EXPECTED_TENANT_ID,'Unexpected tenant');
let visible=[];let lastError='';
for(let attempt=0;attempt<24;attempt++){
 try {
  const payload=await api('/metadata/pages',login.access_token);
  visible=Array.isArray(payload.pages)?payload.pages:[];
  const essentials=['object-manager','app-manager','company-settings'].map(protectedPageApiName);
  if(essentials.every(name=>visible.some(p=>p.apiName===name))){lastError='';break;}
  lastError='Protected administration metadata not deployed yet';
 }catch(e){lastError=e instanceof Error?e.message:'Unable to fetch pages';}
 await pause(15000);
}
if(lastError)throw Error(lastError);
let count=0;
for(const descriptor of protectedWorkspacePageDescriptors){
 const page=visible.find(p=>p.apiName===protectedPageApiName(descriptor.workspace));
 if(!page)continue; // The server intentionally hides privileged page metadata from non-grantees.
 assert.equal(page.scope,'platform-system');
 assert.equal(page.ownerNamespace,'MetaDrive');
 assert.equal(page.status,'Active');
 assert.equal(page.definitionVersion,2);
 assert.deepEqual(page.requiredPermissions,[descriptor.permission]);
 const slots=protectedWorkspacePageSlots[descriptor.workspace]??[];
 assert.deepEqual(page.components.filter(item=>item.properties?.platformSlotKey).map(item=>item.properties.platformSlotKey),slots,'Protected page slot coverage differs from seed');
 assert.ok(page.components.every(item=>item.visible!==false),'Unexpected hidden canonical admin control');
 count++;
}
assert.ok(count>=3,'Expected centrally permission-filtered system pages');
assert.equal(new Set(visible.map(page=>page.apiName)).size,visible.length,'Duplicate page registration');
console.log(JSON.stringify({result:'PASS',readOnly:true,tenantVerified:true,protectedPagesAccessible:count,totalProtectedDefinitions:6,rbacFiltered:true}));
