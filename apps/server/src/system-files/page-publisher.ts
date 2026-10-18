import type {PoolClient} from 'pg';
import {flattenAppProperties} from './app-page-seeder.js';
type PageComponent={id:string;type:string;region?:string;properties:Record<string,unknown>;visible:boolean};
type PageDraft={apiName:string;label:string;status:string;components:PageComponent[];targetObject?:string;definitionVersion?:number};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
/** Publish validated user-edited Pages using stable SQL Component IDs and immutable version snapshots. */
export async function publishPageDefinition(client:PoolClient,tenantId:string,apiName:string,value:unknown):Promise<PageDraft>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Page definition');
 const page=value as PageDraft;
 if(page.apiName!==apiName||!safe.test(apiName)||typeof page.label!=='string'||!page.label.trim()
  ||!Array.isArray(page.components)||!page.components.length||page.components.length>300)
  throw Error('Invalid Page publication');
 const ids=new Set<string>(),prepared:Array<{component:PageComponent;props:ReturnType<typeof flattenAppProperties>} >=[];
 for(const c of page.components){
  if(!c||typeof c.id!=='string'||c.id.length>120||!c.id
   ||!safe.test(c.type)||ids.has(c.id)
   ||!c.properties||typeof c.properties!=='object'||Array.isArray(c.properties)
   ||!['header','main','sidebar',undefined].includes(c.region))
   throw Error('Invalid Page component');
  ids.add(c.id);
  prepared.push({component:c,props:flattenAppProperties(c.properties)});
 }
 const seeded=await client.query(`
  SELECT 1 FROM md_page_definitions p JOIN md_app_seed_pages s
   ON s.tenant_id=p.tenant_id AND s.page_id=p.id
   WHERE p.tenant_id=$1 AND p.api_name=$2 LIMIT 1`,[tenantId,apiName]);
 if(seeded.rowCount)throw Error('App-owned Page requires app seeder publication');
 const registry=await client.query<{api_name:string;renderer_key:string}>(`
  SELECT api_name,renderer_key FROM md_component_definitions WHERE tenant_id=$1 AND enabled=true
   AND (api_name=ANY($2::text[]) OR renderer_key=ANY($2::text[]))`,
  [tenantId,prepared.map(x=>x.component.type)]);
 const apiByType=new Map<string,string>();
 for(const {component} of prepared){
  const exact=registry.rows.find(x=>x.api_name===component.type);
  const candidates=exact?[exact]:registry.rows.filter(x=>x.renderer_key===component.type);
  if(candidates.length!==1)throw Error('Unregistered or ambiguous Page component: '+component.type);
  apiByType.set(component.type,candidates[0].api_name);
 }
 const existing=await client.query<{id:string}>(
  'SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',
  [tenantId,apiName]);
 let pageId=existing.rows[0]?.id;
 if(!pageId){
  const inserted=await client.query<{id:string}>(
   'INSERT INTO md_page_definitions(tenant_id,api_name,title,enabled) VALUES($1,$2,$3,false) RETURNING id',
   [tenantId,apiName,page.label]);
  pageId=inserted.rows[0].id;
 }
 for(let i=0;i<prepared.length;i++){
  const {component:c,props}=prepared[i];
  const created=await client.query<{id:string}>(`
   INSERT INTO md_page_components(tenant_id,page_id,component_api,slot,sort_order,editor_key)
   VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(tenant_id,page_id,editor_key) WHERE editor_key IS NOT NULL
   DO UPDATE SET component_api=EXCLUDED.component_api,slot=EXCLUDED.slot,sort_order=EXCLUDED.sort_order
   RETURNING id`,[tenantId,pageId,apiByType.get(c.type),c.region??'main',i,c.id]);
  const componentId=created.rows[0].id;
  await client.query('DELETE FROM md_page_component_properties WHERE tenant_id=$1 AND component_id=$2',
   [tenantId,componentId]);
  for(const p of props)await client.query(`
   INSERT INTO md_page_component_properties
    (tenant_id,component_id,property_path,value_text,data_type,object_id,field_id,flow_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
   [tenantId,componentId,p.path,p.text,p.type,p.objectId,p.fieldId,p.flowId]);
 }
 await client.query(`DELETE FROM md_page_components
  WHERE tenant_id=$1 AND page_id=$2 AND (editor_key IS NULL OR NOT(editor_key=ANY($3::text[])))`,
  [tenantId,pageId,[...ids]]);
 const prior=await client.query<{version:number}>(`
  SELECT version FROM md_page_publications WHERE tenant_id=$1 AND page_id=$2
  ORDER BY version DESC LIMIT 1 FOR UPDATE`,[tenantId,pageId]);
 const version=(prior.rows[0]?.version??0)+1;
 const published={...page,status:'Active',definitionVersion:version};
 await client.query(`
  INSERT INTO md_page_publications(tenant_id,page_id,version,definition)
  VALUES($1,$2,$3,$4::jsonb)`,[tenantId,pageId,version,JSON.stringify(published)]);
 await client.query('UPDATE md_page_definitions SET title=$3,enabled=true WHERE tenant_id=$1 AND id=$2',
  [tenantId,pageId,page.label]);
 await client.query(`INSERT INTO md_builder_drafts(tenant_id,kind,api_name,definition,published)
  VALUES($1,'page',$2,$3::jsonb,true)
  ON CONFLICT(tenant_id,kind,api_name) DO UPDATE SET
  definition=EXCLUDED.definition,published=true,revision=md_builder_drafts.revision+1,updated_at=now()`,
  [tenantId,apiName,JSON.stringify(published)]);
 return published;
}
