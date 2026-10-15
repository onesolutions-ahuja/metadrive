/** Read-only, authenticated production One Core registry acceptance. */
import assert from 'node:assert/strict';

const base=(process.env.METADRIVE_API_BASE || 'https://metadrive-production.up.railway.app').replace(/\/$/,'');
const email=process.env.METADRIVE_TEST_EMAIL;
const password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Live acceptance requires CI credentials');
if(!/^https:\/\//.test(base))throw Error('HTTPS endpoint required');

async function api(path,token,method='GET',payload){
  const response=await fetch(base+'/api'+path,{
    method,signal:AbortSignal.timeout(30000),
    headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
      ...(payload?{'content-type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
  if(!response.ok)throw Error(method+' '+path+': HTTP '+response.status);
  return response.json();
}
const login=await api('/auth/login',null,'POST',{email,password});
assert.equal(typeof login.access_token,'string','Authentication must return access token');
assert.ok(login.user?.tenantId,'Tenant-scoped user required');
const registry=await api('/component-library',login.access_token);
const definitions=(registry.components??[]).filter(item=>/^One[A-Za-z]+$/.test(item.apiName));
assert.equal(definitions.length,40,'Exactly 40 One Core library definitions');
assert.equal(new Set(definitions.map(item=>item.apiName)).size,40,'No duplicate One API names');
for(const component of definitions){
  assert.equal(component.status,'Published',component.apiName);
  assert.equal(component.trustedBundled,true,component.apiName);
  assert.ok(['page','dashboard','flow'].every(s=>component.surfaces?.includes(s)),component.apiName);
  assert.ok(typeof component.compiledJs==='string'&&component.compiledJs.length>0,component.apiName+' compiled source');
}
const [pages,flows]=await Promise.all([
  api('/metadata/pages',login.access_token),
  api('/metadata/flows',login.access_token)
]);
assert.ok(Array.isArray(pages.pages),'Pages metadata API');
assert.ok(Array.isArray(flows.flows),'Flow metadata API');
console.log(JSON.stringify({result:'PASS',registered:40,published:40,trusted:40,
  surfacesVerified:true,authenticated:true,tenantScoped:true,
  pagesApiVerified:true,flowsApiVerified:true,readOnly:true}));
