/** Phase 3 read-only live acceptance: existing OneEngine registry and RBAC. */
import assert from 'node:assert/strict';
import {replacementDefinitions} from '../apps/server/src/modules/metadata/phase2-replacement-definitions.mjs';
const origin=(process.env.METADRIVE_API_URL??'').replace(/\/$/,'').replace(/\/api$/,'');
if(!/^https:\/\//.test(origin))throw Error('HTTPS MetaDrive endpoint required');
const email=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!email||!password)throw Error('Admin credentials required via CI secrets');
async function request(path,token,method='GET',body){
 const r=await fetch(origin+'/api'+path,{method,signal:AbortSignal.timeout(30000),headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error(path+': HTTP '+r.status);
 return r.json();
}
const login=await request('/auth/login',undefined,'POST',{email,password});
assert.ok(login.access_token,'Authenticated session required');
assert.equal(login.user?.tenantId,process.env.METADRIVE_EXPECTED_TENANT_ID,'Wrong tenant');
const registry=await request('/component-library',login.access_token);
assert.equal(registry.canManage,true,'Central OneEngine components:manage RBAC required');
const components=registry.components??[];
const expected=replacementDefinitions();
assert.equal(expected.length,39);
const names=new Set();
for(const definition of expected){
 const component=components.find(c=>c.apiName===definition.apiName);
 assert.ok(component,'Missing '+definition.apiName);
 assert.equal(component.status,'Published',definition.apiName);
 assert.equal(component.trustedBundled,false,definition.apiName);
 assert.ok(['page','dashboard','flow'].every(s=>component.surfaces.includes(s)),definition.apiName);
 assert.ok(Array.isArray(component.propertyDefinitions)&&component.propertyDefinitions.length>0,definition.apiName);
 assert.ok(typeof component.compiledJs==='string'&&component.compiledJs.length>0,definition.apiName);
 assert.ok(!names.has(component.apiName),'Duplicate component identity');
 names.add(component.apiName);
}
const pages=await request('/metadata/pages',login.access_token);
assert.ok(Array.isArray(pages.pages),'Pages metadata API');
console.log(JSON.stringify({result:'PASS',tenantVerified:true,rbacVerified:true,published:39,propertyMetadataVerified:39,surfaces:['page','dashboard','flow'],pagesApiVerified:true}));
