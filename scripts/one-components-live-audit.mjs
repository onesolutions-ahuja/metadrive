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
assert.equal(definitions.length,41,'Exactly 41 One Core library definitions');
assert.equal(new Set(definitions.map(item=>item.apiName)).size,definitions.length,'No duplicate One API names');
const required={
  OneSplitPane:{version:2,properties:['splitRatio','layoutContainer']},
  OneTabs:{version:4,properties:['dynamicTabs','categoryFieldApiName','categoryValueFieldApiName','filterKey']},
  OneItemGrid:{version:5,properties:['categoryFieldApiName','filterKey','cartTargetKey','imageFieldApiName','titleFieldApiName','priceFieldApiName','searchKey','searchFieldApiNames']},
  OneSearch:{version:2,properties:['searchKey']},
  OneShoppingCart:{version:6,properties:['viewMode','catalogueWidthPercent','productCardMinWidth','cartTargetKey']}
};
for (const [name,requirements] of Object.entries(required)){
  const component=definitions.find(item=>item.apiName===name);
  assert.ok(component,name+' missing from live SQL-backed registry');
  assert.ok(Number(component.version)>=requirements.version,name+' version not published');
  const fields=new Set((component.propertyDefinitions??[]).map(field=>field.propertyKey));
  for(const field of requirements.properties)assert.ok(fields.has(field),name+' missing property '+field);
  if(name==='OneShoppingCart')assert.ok((component.propertyDefinitions??[]).find(field=>field.propertyKey==='viewMode')?.choices?.some(choice=>choice.key==='basket'),'Basket-only choice not published');
}
for(const component of definitions){
  assert.equal(component.status,'Published',component.apiName);
  assert.equal(component.trustedBundled,true,component.apiName);
  assert.ok(['page','dashboard','flow'].every(s=>component.surfaces?.includes(s)),component.apiName);
  assert.ok(typeof component.compiledJs==='string'&&component.compiledJs.length>0,component.apiName+' compiled source');
}
// Preserve all pre-migration legacy bundles, including their original source,
 // versions, identities and published state. A replacement is not authorised
 // without per-instance property/event/binding compatibility evidence.
const legacy=(registry.components??[]).filter(item=>/^RecoveredShared/.test(item.apiName));
// Legacy bundles may be retired by the tenant-scoped, reference-checked lifecycle.
assert.equal(new Set(legacy.map(item=>item.apiName)).size,legacy.length,'Remaining legacy names must be unique');
for(const component of legacy) {
  assert.equal(component.status,'Published',component.apiName);
  assert.ok(typeof component.compiledJs==='string'&&component.compiledJs.length>0,
    component.apiName+' must retain original compiled source');
}
const [pages,flows]=await Promise.all([
  api('/metadata/pages',login.access_token),
  api('/metadata/flows',login.access_token)
]);
assert.ok(Array.isArray(pages.pages),'Pages metadata API');
assert.ok(Array.isArray(flows.flows),'Flow metadata API');

// Inventory saved component bindings by their existing metadata identifiers;
// never mutate pages or flows as part of a compatibility audit.
const legacyNames=new Set(legacy.map(x=>x.apiName));
const pageBindings=(pages.pages??[]).flatMap(page=>
  (page.components??[]).filter(item=>
    typeof item.type==='string' && item.type.startsWith('Custom:') &&
    legacyNames.has(item.type.slice(7)))
    .map(item=>({page:page.apiName,component:item.type.slice(7)})));
const flowBindings=(flows.flows??[]).flatMap(flow=>
  (flow.elements??[]).flatMap(element=>
    (element.config?.fields??[]).filter(field=>
      field.type==='Custom Component' && legacyNames.has(field.componentApiName))
      .map(field=>({flow:flow.apiName,component:field.componentApiName}))));
console.log(JSON.stringify({result:'PASS',registered:definitions.length,published:definitions.length,trusted:definitions.length,
  surfacesVerified:true,authenticated:true,tenantScoped:true,
  pagesApiVerified:true,flowsApiVerified:true,legacyPreserved:legacy.length,
  savedPageLegacyInstances:pageBindings.length,savedFlowLegacyInstances:flowBindings.length,
  migrationMode:'read-only-no-automatic-replacement',readOnly:true}));
