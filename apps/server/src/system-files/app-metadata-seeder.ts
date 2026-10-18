import type {PoolClient} from 'pg';

/** Reusable transactional contract invoked by each independently packaged app seeder. */
export type AppFieldSeed={apiName:string;label:string;dataType:'text'|'number'|'boolean'|'date'|'datetime'|'reference';relatedObject?:string;maxLength?:number;required?:boolean};
export type AppObjectSeed={apiName:string;label:string;fields:readonly AppFieldSeed[]};
export type AppSimpleSeed={apiName:string;label:string};
export type AppSeedDefinition={
  objects?:readonly AppObjectSeed[];
  components?:readonly {apiName:string;rendererKey:string}[];
  pages?:readonly {apiName:string;title:string}[];
  flows?:readonly {apiName:string;label:string;version:number;flowType?:string}[];
  actions?:readonly AppSimpleSeed[];
};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
const operations=['read','create','edit','delete'] as const;
function valid(name:string){if(!safe.test(name))throw new Error('Invalid app metadata name: '+name);}
function unique(values:readonly string[],kind:string){
 if(new Set(values).size!==values.length)throw new Error('Duplicate '+kind+' in app seeder');
}
async function grant(client:PoolClient,tenantId:string,permissionSetId:string,resource:string){
 for(const action of operations)await client.query(
  "INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,'allow') ON CONFLICT DO NOTHING",
  [tenantId,permissionSetId,resource,action]);
}
/** Must be called in the AppExchange installation transaction AFTER entitlement validation.
 * Pre-existing metadata is never overwritten, and incompatible field definitions fail closed.
 */
export async function seedIndependentAppMetadata(client:PoolClient,tenantId:string,seed:AppSeedDefinition){
 const objects=seed.objects??[],components=seed.components??[],pages=seed.pages??[],flows=seed.flows??[],actions=seed.actions??[];
 for(const [kind,items] of Object.entries({objects,components,pages,flows,actions}))
  unique(items.map(x=>x.apiName),kind);
 for(const obj of objects){
  valid(obj.apiName);unique(obj.fields.map(f=>f.apiName),obj.apiName+' fields');
  for(const f of obj.fields){valid(f.apiName);if(f.relatedObject)valid(f.relatedObject);}
 }
 const {rows:sets}=await client.query<{id:string}>(
  "SELECT id FROM md_permission_sets WHERE tenant_id=$1 AND api_name='OneEngineDeveloper' FOR UPDATE",[tenantId]);
 if(!sets[0])throw new Error('OneEngine Developer permission set is missing');
 const setId=sets[0].id;
 // All Objects must exist before creating lookup fields, including dependencies.
 for(const obj of objects){
  const {rows}=await client.query<{id:string}>(
   'SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',[tenantId,obj.apiName]);
  if(!rows.length)await client.query(
   'INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system) VALUES($1,$2,$3,false)',
   [tenantId,obj.apiName,obj.label]);
  await grant(client,tenantId,setId,obj.apiName);
 }
 for(const obj of objects)for(const field of obj.fields){
  const {rows}=await client.query<{data_type:string;related_object:string|null;max_length:number|null;required:boolean}>(
   'SELECT data_type,related_object,max_length,required FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 FOR UPDATE',
   [tenantId,obj.apiName,field.apiName]);
  const related=field.relatedObject??null;
  const max=field.maxLength??null;
  if(field.dataType==='reference'&&!related)throw new Error('Lookup target missing: '+obj.apiName+'.'+field.apiName);
  if(rows.length){
   const current=rows[0];
   if(current.data_type!==field.dataType||current.related_object!==related||
      (max!==null&&current.max_length!==max)||(field.required===true&&!current.required))
    throw new Error('Incompatible existing field: '+obj.apiName+'.'+field.apiName);
  }else{
   await client.query(
    'INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object,max_length,required) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [tenantId,obj.apiName,field.apiName,field.label,field.dataType,related,max,field.required??false]);
  }
  await grant(client,tenantId,setId,obj.apiName+'.'+field.apiName);
 }
 for(const c of components){
  valid(c.apiName);if(!c.rendererKey.trim())throw new Error('Renderer key required');
  const {rows}=await client.query<{renderer_key:string}>(
   'SELECT renderer_key FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',
   [tenantId,c.apiName]);
  if(rows.length&&rows[0].renderer_key!==c.rendererKey)throw new Error('Incompatible component: '+c.apiName);
  if(!rows.length)await client.query(
   'INSERT INTO md_component_definitions(tenant_id,api_name,renderer_key) VALUES($1,$2,$3)',
   [tenantId,c.apiName,c.rendererKey]);
  await grant(client,tenantId,setId,'ComponentDefinition:'+c.apiName);
 }
 for(const p of pages){
  valid(p.apiName);
  const {rows}=await client.query<{id:string}>(
   'SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',
   [tenantId,p.apiName]);
  if(!rows.length)await client.query(
   'INSERT INTO md_page_definitions(tenant_id,api_name,title) VALUES($1,$2,$3)',
   [tenantId,p.apiName,p.title]);
  await grant(client,tenantId,setId,'PageDefinition:'+p.apiName);
 }
 for(const f of flows){
  valid(f.apiName);
  if(!Number.isInteger(f.version)||f.version<1)throw new Error('Invalid Flow version');
  const {rows}=await client.query<{id:string}>(
   'SELECT id FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND version=$3 FOR UPDATE',
   [tenantId,f.apiName,f.version]);
  if(!rows.length)await client.query(
   'INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active) VALUES($1,$2,$3,$4,$5,false)',
   [tenantId,f.apiName,f.label,f.flowType??'Autolaunched Flow',f.version]);
  await grant(client,tenantId,setId,'FlowDefinition:'+f.apiName);
  await client.query("INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,'execute','allow') ON CONFLICT DO NOTHING",[tenantId,setId,'Flow:'+f.apiName]);
 }
 for(const a of actions){valid(a.apiName);await grant(client,tenantId,setId,'Action:'+a.apiName);}
}
