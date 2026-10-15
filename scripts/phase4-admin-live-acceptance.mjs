/** Phase 4 protected administration Page Builder live acceptance (read only). */
import assert from 'node:assert/strict';
import {protectedWorkspacePageDescriptors,protectedWorkspacePageSlots,protectedAdministrationPage,protectedPageApiName} from '../apps/server/src/modules/metadata/platform-admin-pages.mjs';
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
const grants=new Set(Array.isArray(login.user?.permissions)?login.user.permissions:[]);
const expected=protectedWorkspacePageDescriptors.filter(d=>grants.has(d.permission));
assert.ok(expected.length>=3,'Production acceptance account lacks administration read permissions');
let visible=[];let lastError='';
for(let attempt=0;attempt<24;attempt++){
 try {
  const payload=await api('/metadata/pages',login.access_token);
  visible=Array.isArray(payload.pages)?payload.pages:[];
  const essentials=expected.map(d=>protectedPageApiName(d.workspace));
  const ready=expected.every(descriptor=>{
   const page=visible.find(p=>p.apiName===protectedPageApiName(descriptor.workspace));
   if(!page)return false;
   const version=protectedAdministrationPage(descriptor).definitionVersion;
   return page.updatedAt!=='2026-10-14T00:00:00.000Z'||page.definitionVersion===version;
  });
  if(essentials.every(name=>visible.some(p=>p.apiName===name))&&ready){lastError='';break;}
  lastError='Protected administration metadata deployment or pristine upgrade pending';
 }catch(e){lastError=e instanceof Error?e.message:'Unable to fetch pages';}
 await pause(15000);
}
if(lastError)throw Error(lastError);
let count=0;
for(const descriptor of expected){
 const page=visible.find(p=>p.apiName===protectedPageApiName(descriptor.workspace));
 assert.ok(page,'Granted administration page is absent: '+descriptor.workspace);
 assert.equal(page.scope,'platform-system');
 assert.equal(page.ownerNamespace,'MetaDrive');
 assert.equal(page.status,'Active');
 const expectedVersion=protectedAdministrationPage(descriptor).definitionVersion;
 if(page.updatedAt==='2026-10-14T00:00:00.000Z')assert.equal(page.definitionVersion,expectedVersion,'Unmodified system page upgrade missing');
 else assert.ok(page.definitionVersion>=2&&page.definitionVersion<=expectedVersion,'Invalid version for customised administration page');
 assert.deepEqual(page.requiredPermissions,[descriptor.permission]);
 const slots=protectedWorkspacePageSlots[descriptor.workspace]??[];
 const actual=page.components.filter(item=>item.properties?.platformSlotKey).map(item=>item.properties.platformSlotKey);
 assert.equal(new Set(actual).size,actual.length,'Duplicate admin slot identity');
 assert.ok(actual.every(key=>slots.includes(key)),'Unknown protected admin slot identity');
 count++;
}
assert.equal(count,expected.length,'All centrally authorised system pages must be deployed');
assert.equal(new Set(visible.map(page=>page.apiName)).size,visible.length,'Duplicate page registration');
console.log(JSON.stringify({result:'PASS',readOnly:true,tenantVerified:true,protectedPagesAccessible:count,protectedPagesExpected:expected.length,totalProtectedDefinitions:protectedWorkspacePageDescriptors.length,rbacFiltered:true}));
