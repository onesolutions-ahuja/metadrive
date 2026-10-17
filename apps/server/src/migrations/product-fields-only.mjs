/** Owner-approved fields-only migration to canonical Product__c.
 * Standard Product business rows are intentionally not copied.
 * Invoke inside the verified normalized state transaction, never as raw SQL edits.
 */
const legacy='Product',canonical='Product__c';
const identityKeys=new Set(['object','objectApiName','targetObject','triggerObject',
 'relatedObject','childObjectApiName','primaryObjectApiName','rootObjectApiName',
 'recordObject','parentObject','dataType','objectName','objectApiNames',
 'navigationItems','targetObjectApiName','apiName']);
function rewrite(value,key=''){
 if(typeof value==='string'){
  if(value==='Lookup(Product)')return 'Lookup(Product__c)';
  if(value===legacy&&identityKeys.has(key))return canonical;
  if(value.startsWith('@Product.'))return '@Product__c.'+value.slice(9);
  if(value.startsWith('{!Product.'))return '{!Product__c.'+value.slice(10);
  return value;
 }
 if(Array.isArray(value))return value.map(item=>rewrite(item,key));
 if(!value||typeof value!=='object')return value;
 const output=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,k)]));
 if(value.type==='Object'&&output.apiName===legacy)output.apiName=canonical;
 return output;
}
function transferPermissions(tenant){
 const members=[...(tenant.accessControl?.profiles??[]),
  ...(tenant.accessControl?.permissionSets??[]),
  ...(tenant.accessControl?.permissionSetGroups??[])];
 for(const entry of members){
  for(const name of ['objectPermissions','mutedObjectPermissions','tabPermissions']){
   const map=entry[name];if(!map)continue;
   if(map[legacy]!==undefined&&map[canonical]===undefined)map[canonical]=map[legacy];
   delete map[legacy];
  }
  for(const name of ['fieldPermissions','mutedFieldPermissions','recordTypePermissions']){
   const map=entry[name];if(!map)continue;
   for(const k of Object.keys(map)){
    if(!k.startsWith(legacy+'.'))continue;
    const next=canonical+k.slice(legacy.length);
    if(map[next]===undefined)map[next]=map[k];
    delete map[k];
   }
  }
 }
}
export function migrateProductFieldsOnly(tenant){
 const from=tenant.objects.find(o=>o.apiName===legacy);
 const to=tenant.objects.find(o=>o.apiName===canonical);
 if(!from)return {alreadyDone:true,added:0,discardedRecords:0};
 if(!to||from.kind!=='Standard Object'||to.kind!=='Custom Object')
  throw Error('Unexpected Product metadata; refusing unsafe retirement');
 const oldRecords=tenant.records?.[legacy]??[];
 const oldIds=new Set(oldRecords.map(r=>String(r.Id)));
 // Do not leave any surviving foreign record pointing to a deleted Product ID.
 for(const object of tenant.objects.filter(o=>o.apiName!==legacy)){
  for(const field of object.fields.filter(f=>f.relationship?.targetObject===legacy)){
   for(const record of tenant.records?.[object.apiName]??[])
    if(oldIds.has(String(record[field.apiName]??'')))
     throw Error('Old Product record referenced by '+object.apiName+'.'+field.apiName);
  }
 }
 let added=0;
 for(const field of from.fields){
  if(to.fields.some(f=>f.apiName===field.apiName))continue;
  const copy=structuredClone(field);
  // No record values are copied, so new fields must be optional for existing rows.
  copy.required=false;
  if(copy.relationship?.targetObject===legacy){
   copy.relationship.targetObject=canonical;
   if(copy.dataType==='Lookup(Product)')copy.dataType='Lookup(Product__c)';
  }
  if(copy.relationship&&!tenant.objects.some(o=>o.apiName===copy.relationship.targetObject)){
   // A retired lookup target cannot be saved as a new relationship.
   // Preserve the field identity as text, rather than invent a target object.
   copy.dataType='Text(255)';delete copy.relationship;
  }
  if(['Picklist','Multi-Select Picklist'].includes(copy.dataType)
    &&!(copy.picklistValues??[]).length){
   const observed=[...new Set(oldRecords.flatMap(r=>
    String(r[copy.apiName]??'').split(';').map(x=>x.trim()).filter(Boolean)))];
   if(observed.length)copy.picklistValues=observed;
   else{
    copy.dataType='Text(255)';delete copy.picklistValues;
    delete copy.picklistRestricted;delete copy.controllerFieldApiName;
    delete copy.valueSettings;
   }
  }
  to.fields.push(copy);added++;
 }
 for(const object of tenant.objects)if(object.apiName!==legacy){
  for(const field of object.fields){
   if(field.relationship?.targetObject===legacy)field.relationship.targetObject=canonical;
   if(field.dataType==='Lookup(Product)')field.dataType='Lookup(Product__c)';
  }
 }
 tenant.objects=tenant.objects.filter(o=>o.apiName!==legacy).map(rewrite);
 for(const bucket of ['apps','pages','reports','dashboards','approvalProcesses',
  'emailAlerts','platformEvents']){
  if(Array.isArray(tenant[bucket]))tenant[bucket]=tenant[bucket].map(v=>rewrite(v));
 }
 if(Array.isArray(tenant.flows))tenant.flows=tenant.flows.map(flow=>{
  const next={...flow,startConfig:rewrite(flow.startConfig),
   triggerObject:rewrite(flow.triggerObject,'triggerObject'),
   elements:rewrite(flow.elements),resources:rewrite(flow.resources),
   connectors:rewrite(flow.connectors)};
  // Preserve archived versions and publish a new version of changed active Flows.
  if(JSON.stringify([next.startConfig,next.triggerObject,next.elements,next.resources,next.connectors])===
    JSON.stringify([flow.startConfig,flow.triggerObject,flow.elements,flow.resources,flow.connectors]))return flow;
  const now=new Date().toISOString();
  const snapshot={versionNumber:flow.versionNumber,status:flow.status,savedAt:now,
    label:flow.label,description:flow.description,flowType:flow.flowType,
    triggerObject:flow.triggerObject,startConfig:flow.startConfig,elements:flow.elements,
    connectors:flow.connectors,resources:flow.resources,tests:flow.tests??[]};
  const histories=new Map((flow.versions??[]).map(v=>[v.versionNumber,v]));
  histories.set(flow.versionNumber,snapshot);
  const number=Math.max(flow.versionNumber??0,...histories.keys())+1;
  next.versionNumber=number;
  next.activeVersion=flow.activeVersion==null?null:number;
  next.lastModifiedAt=now;
  next.versions=[...histories.values()].map(v=>v.status==='Active'?{...v,status:'Obsolete'}:v);
  if(next.activeVersion!=null)next.versions.push({...snapshot,versionNumber:number,status:'Active',
    triggerObject:next.triggerObject,startConfig:next.startConfig,
    elements:next.elements,connectors:next.connectors,resources:next.resources});
  return next;
 });
 transferPermissions(tenant);
 if(tenant.accessControl?.sharingRules)
  tenant.accessControl.sharingRules=tenant.accessControl.sharingRules.map(rewrite);
 if(tenant.sharingSettings){
  if(tenant.sharingSettings[legacy]&&!tenant.sharingSettings[canonical])
   tenant.sharingSettings[canonical]=tenant.sharingSettings[legacy];
  delete tenant.sharingSettings[legacy];
 }
 delete tenant.records[legacy];
 const consumers=JSON.stringify([tenant.objects,tenant.apps,tenant.pages,tenant.flows.map(f=>({
   startConfig:f.startConfig,triggerObject:f.triggerObject,elements:f.elements,
   connectors:f.connectors,resources:f.resources})),tenant.reports,tenant.dashboards]);
 if(/"(?:targetObject|object|objectApiName|triggerObject|dataType)":"(?:Product|Lookup\\(Product\\))"/.test(consumers))
  throw Error('Unresolved Product references in live metadata');
 tenant.fieldHistory=(tenant.fieldHistory??[]).filter(r=>r.objectApiName!==legacy);
 tenant.recordShares=(tenant.recordShares??[]).filter(r=>r.objectApiName!==legacy);
 return {alreadyDone:false,added,discardedRecords:oldRecords.length};
}
