import type {PoolClient} from 'pg';

/** Transactional, non-destructive materialisation of published SQL application templates.
 * Only this tenant's chosen package is inspected; nothing app-specific runs at startup.
 */
export async function seedPublishedAppPackage(
  client:PoolClient,tenantId:string,appId:string,version:number
):Promise<void> {
  const created=async(kind:'Object'|'Field'|'Component'|'App Page'|'Page Component',
    parent:string,key:string,sql:string,args:unknown[])=>{
    const {rows:receipts}=await client.query<{resource_type:string}>(`
      SELECT resource_type FROM md_app_package_seed_receipts
      WHERE tenant_id=$1 AND app_id=$2 AND resource_type=$3 AND parent_api=$4 AND api_name=$5
    `,[tenantId,appId,kind,parent,key]);
    if(receipts.length)return; // Preserve tenant-edited metadata across upgrades and reinstalls.
    const result=await client.query(sql,args);
    if(!result.rowCount)throw new Error('App package metadata conflict: '+kind+' '+(parent?parent+'.':'')+key);
    await client.query(`
      INSERT INTO md_app_package_seed_receipts
        (tenant_id,app_id,resource_type,parent_api,api_name)
      VALUES($1,$2,$3,$4,$5)
    `,[tenantId,appId,kind,parent,key]);
  };

  const {rows:objects}=await client.query<{api_name:string;label:string}>(`
    SELECT api_name,label FROM md_app_package_object_templates
    WHERE app_id=$1 AND version=$2 ORDER BY api_name
  `,[appId,version]);
  for(const item of objects)await created('Object','',item.api_name,`
    INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
    VALUES($1,$2,$3,false) ON CONFLICT DO NOTHING
  `,[tenantId,item.api_name,item.label]);

  const {rows:fields}=await client.query<{
    object_api:string;api_name:string;label:string;data_type:string;
    related_object:string|null;max_length:number|null;required:boolean
  }>(`
    SELECT object_api,api_name,label,data_type,related_object,max_length,required
    FROM md_app_package_field_templates
    WHERE app_id=$1 AND version=$2 ORDER BY object_api,api_name
  `,[appId,version]);
  for(const item of fields)await created('Field',item.object_api,item.api_name,`
    INSERT INTO md_field_definitions
      (tenant_id,object_api,api_name,label,data_type,related_object,max_length,required)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING
  `,[tenantId,item.object_api,item.api_name,item.label,item.data_type,
    item.related_object,item.max_length,item.required]);

  const {rows:components}=await client.query<{api_name:string;renderer_key:string}>(`
    SELECT api_name,renderer_key FROM md_app_package_component_templates
    WHERE app_id=$1 AND version=$2 ORDER BY api_name
  `,[appId,version]);
  for(const item of components)await created('Component','',item.api_name,`
    INSERT INTO md_component_definitions(tenant_id,api_name,renderer_key,enabled)
    VALUES($1,$2,$3,true) ON CONFLICT DO NOTHING
  `,[tenantId,item.api_name,item.renderer_key]);

  const {rows:pages}=await client.query<{api_name:string;title:string}>(`
    SELECT api_name,title FROM md_app_package_page_templates
    WHERE app_id=$1 AND version=$2 ORDER BY api_name
  `,[appId,version]);
  for(const item of pages)await created('App Page','',item.api_name,`
    INSERT INTO md_page_definitions(tenant_id,api_name,title,enabled)
    VALUES($1,$2,$3,true) ON CONFLICT DO NOTHING
  `,[tenantId,item.api_name,item.title]);

  const {rows:pageParts}=await client.query<{
    page_api:string;component_api:string;slot:string;sort_order:number
  }>(`
    SELECT page_api,component_api,slot,sort_order
    FROM md_app_package_page_component_templates
    WHERE app_id=$1 AND version=$2 ORDER BY page_api,sort_order,component_api
  `,[appId,version]);
  for(const item of pageParts){
    const {rows:page}=await client.query<{id:string}>(`
      SELECT id FROM md_page_definitions
      WHERE tenant_id=$1 AND api_name=$2 AND enabled=true
    `,[tenantId,item.page_api]);
    const {rows:component}=await client.query<{api_name:string}>(`
      SELECT api_name FROM md_component_definitions
      WHERE tenant_id=$1 AND api_name=$2 AND enabled=true
    `,[tenantId,item.component_api]);
    if(!page.length||!component.length)
      throw new Error('App package Page Component dependency missing');
    const key=item.component_api+'@'+item.slot+'#'+item.sort_order;
    await created('Page Component',item.page_api,key,`
      INSERT INTO md_page_components(tenant_id,page_id,component_api,slot,sort_order)
      VALUES($1,$2,$3,$4,$5)
    `,[tenantId,page[0].id,item.component_api,item.slot,item.sort_order]);
  }
}
