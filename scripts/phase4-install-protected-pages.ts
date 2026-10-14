/** Idempotent protected system-page seeder through OneEngine RBAC-protected APIs.
 * Never writes SQL, activates drafts, grants privileges or overwrites tenant changes.
 */
import {createSystemPageDrafts} from '../apps/web/src/platformSystemPageDrafts.ts';
const origin=(process.env.METADRIVE_API_URL??'').replace(/\/$/,'').replace(/\/api$/,'');
const email=process.env.METADRIVE_ADMIN_EMAIL;
const password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!/^https:\/\//.test(origin)||!email||!password)throw Error('HTTPS endpoint and authorised credentials required');
async function call(path,token,method='GET',body){
 const response=await fetch(origin+'/api'+path,{method,
  headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(path+' returned HTTP '+response.status);
 return response.json();
}
const login=await call('/auth/login',undefined,'POST',{email,password});
const token=login.access_token;
if(!token)throw Error('OneEngine session unavailable');
const tenant=login.user?.tenantId;
if(!tenant||tenant!==process.env.METADRIVE_EXPECTED_TENANT_ID)
 throw Error('Tenant binding differs from approved deployment');
await call('/platform/policies',token); // Enforce central platform:superadmin before any mutation.
const registry=(await call('/component-library',token)).components;
if(!Array.isArray(registry)||!registry.some(c=>c.apiName==='SystemPanel'
  &&c.status==='Published'&&Array.isArray(c.surfaces)&&c.surfaces.includes('page')))
 throw Error('Published registered SystemPanel component is required before page installation');
const initial=(await call('/metadata/pages',token)).pages;
if(!Array.isArray(initial))throw Error('Page registry unavailable');
const drafts=createSystemPageDrafts(initial);
let created=0;
for(const page of drafts){
 if(page.status!=='Draft')throw Error('System seeder must never activate pages');
 await call('/metadata/pages/'+encodeURIComponent(page.apiName),token,'PUT',page);
 created++;
}
const final=(await call('/metadata/pages',token)).pages;
for(const page of drafts){
 const stored=final.find(p=>p.apiName===page.apiName);
 if(!stored||stored.status!=='Draft'||stored.components.length!==page.components.length)
  throw Error('Secured system page publication not confirmed');
}
console.log(JSON.stringify({result:'PASS',tenantVerified:true,platformRbacVerified:true,
 existing:initial.length,created,verified:drafts.length,mode:'draft-only'}));
