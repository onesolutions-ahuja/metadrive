// Project page, dashboard and Flow canvas instances through a shared adapter.
// This is a lossless staging projection; canonical state stays in existing engine
// until migration parity, permissions and SQL transaction tests are complete.
import {splitComponentProperties,mergeComponentProperties} from './component-property-hybrid.mjs';
const supported=['pages','dashboards','flows'];
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function projectCanvasComponentInstances(state){
 const output=[];
 for(const [tenantId,tenant] of Object.entries(state.tenants??{})){
  for(const collection of supported){
   for(const page of tenant[collection]??[]){
    if(!Array.isArray(page.components))continue;
    for(const [position,instance] of page.components.entries()){
     if(!isObject(instance.properties))throw Error('Invalid component properties: '+instance.id);
     const {fixed,additional_properties}=splitComponentProperties(instance.properties);
     output.push({tenant_id:tenantId,surface:collection,
      page_api_name:page.apiName,instance_id:instance.id,component_api_name:instance.type,
      region:instance.region??'main',position,visible:instance.visible!==false,
      ...fixed,additional_properties});
    }
   }
  }
 }
 return output;
}
export function assertCanvasComponentParity(state,rows){
 const expected=projectCanvasComponentInstances(state);
 if(expected.length!==rows.length)throw Error('Component instance count mismatch');
 for(let i=0;i<expected.length;i++){
  const a=expected[i],b=rows[i];
  for(const key of ['tenant_id','surface','page_api_name','instance_id','component_api_name','position','region','visible'])
   if(a[key]!==b[key])throw Error('Component identity mismatch '+key+' at '+i);
  const current=mergeComponentProperties(a),stored=mergeComponentProperties(b);
  if(JSON.stringify(current)!==JSON.stringify(stored))
   throw Error('Component metadata mismatch at '+a.page_api_name+'/'+a.instance_id);
 }
 return true;
}
