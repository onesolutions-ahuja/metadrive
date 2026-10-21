import type {SqlPersistence} from '../system-files/sql-persistence.js';

export const ACEASSIST_APP={
  apiName:'AceAssist',
  label:'Ace Assist',
  version:1,
  description:'Independent appointments frontend using shared MetaDrive Objects and Flows',
  brandColor:'#147D74',
  homePageApi:'AceAssist_Calendar'
} as const;

/** Catalog discovery only: no automatic installation, licensing or permission grant. */
export async function seedAceAssistCatalog(db:SqlPersistence):Promise<void>{
  await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:app-catalog:AceAssist']);
    await tx.query(`INSERT INTO md_apps(api_name,label,enabled,tenant_owner_id)
      VALUES($1,$2,true,NULL) ON CONFLICT(api_name) DO NOTHING`,
      [ACEASSIST_APP.apiName,ACEASSIST_APP.label]);
    const {rows}=await tx.query<{id:string}>(`SELECT id FROM md_apps
      WHERE api_name=$1 AND enabled=true AND tenant_owner_id IS NULL`,[ACEASSIST_APP.apiName]);
    if(!rows[0])throw Error('Ace Assist catalog registration conflict');
    await tx.query(`INSERT INTO md_app_package_versions
      (app_id,version,published,description,brand_color)
      VALUES($1,$2,true,$3,$4) ON CONFLICT(app_id,version) DO NOTHING`,
      [rows[0].id,ACEASSIST_APP.version,ACEASSIST_APP.description,ACEASSIST_APP.brandColor]);
  });
}

/** Only used after explicit, licensed AppExchange installation. All screen content is SQL
 * Page Runtime metadata and stays editable in the Page Builder. Never insert demo bookings.
 * Reruns do not overwrite tenant-customised page definitions or properties.
 */
export async function seedAceAssistInstalledHome(db:SqlPersistence,tenantId:string):Promise<void>{
  await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':aceassist-home']);
    const {rows:appRows}=await tx.query<{id:string}>(`SELECT a.id FROM md_apps a
      JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
      JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())
      JOIN md_tenant_app_metadata m ON m.tenant_id=$1 AND m.app_id=a.id AND m.api_name=$2
      WHERE a.enabled=true AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)`,
      [tenantId,ACEASSIST_APP.apiName]);
    const appId=appRows[0]?.id;
    if(!appId)throw Error('Ace Assist must be installed and licensed for this tenant');

    const {rows:created}=await tx.query<{id:string}>(`INSERT INTO md_page_definitions
      (tenant_id,api_name,title,enabled) VALUES($1,$2,'Appointments Calendar',true)
      ON CONFLICT(tenant_id,api_name) DO NOTHING RETURNING id`,
      [tenantId,ACEASSIST_APP.homePageApi]);
    const {rows:pageRows}=await tx.query<{id:string}>(`SELECT id FROM md_page_definitions
      WHERE tenant_id=$1 AND api_name=$2 AND enabled=true`,
      [tenantId,ACEASSIST_APP.homePageApi]);
    const pageId=pageRows[0]?.id;
    if(!pageId)throw Error('Ace Assist landing page unavailable');
    if(created.length){
      await tx.query(`INSERT INTO md_lightning_page_details
        (tenant_id,page_id,page_type,target_object,layout_mode,template,canvas_width,canvas_height,status,devices,revision)
        VALUES($1,$2,'App Page','','template','main-sidebar',1280,900,'Active',ARRAY['Desktop','Phone'],1)`,[tenantId,pageId]);
      await tx.query(`INSERT INTO md_lightning_page_activation
        (tenant_id,page_id,assignment_id,scope,app_api,desktop,phone,sort_order)
        VALUES($1,$2,'aceassist-default','App Default',$3,true,true,0)`,
        [tenantId,pageId,ACEASSIST_APP.apiName]);
      for(const [i,node] of ([
        {key:'welcome',type:'Custom:OneText',label:'Ace Assist heading',region:'header',props:{text:'Welcome to Ace Assist',fontSize:28}},
        {key:'hint',type:'Custom:OneText',label:'Booking status',region:'header',
          props:{text:'Your calendar is ready. Appointment data will appear when booking Objects and Flows are configured in MetaDrive.',fontSize:14}},
        {key:'calendar',type:'Custom:OneCalendar',label:'Appointments Calendar',region:'main',props:{kind:'Calendar',view:'month'}}
      ] as const).entries()){
        const componentApi=node.type.slice('Custom:'.length);
        const {rows:components}=await tx.query<{api_name:string}>(`SELECT api_name
          FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true`,
          [tenantId,componentApi]);
        if(!components[0])throw Error('Ace Assist shared component unavailable: '+componentApi);
        await tx.query(`INSERT INTO md_lightning_page_nodes
          (tenant_id,page_id,component_key,component_type,label,region,visible,sort_order)
          VALUES($1,$2,$3,$4,$5,$6,true,$7)`,
          [tenantId,pageId,node.key,node.type,node.label,node.region,i]);
        const properties: Array<{path:string;kind:string;value:string|null}>=[
          {path:'/props',kind:'object',value:null},{path:'/extra',kind:'object',value:null},
          ...Object.entries(node.props).map(([key,value])=>({path:'/props/'+key,
            kind:typeof value==='number'?'number':'string',value:String(value)}))
        ];
        for(const item of properties)await tx.query(`INSERT INTO md_lightning_page_node_properties
          (tenant_id,page_id,component_key,property_path,value_kind,value_text)
          VALUES($1,$2,$3,$4,$5,$6)`,
          [tenantId,pageId,node.key,item.path,item.kind,item.value]);
      }
    }else{
      // Never annex someone else's same-name page, or silently republish a draft.
      const {rows}=await tx.query<{allowed:boolean}>(`SELECT EXISTS(
        SELECT 1 FROM md_lightning_page_details d
        JOIN md_lightning_page_activation a ON a.tenant_id=d.tenant_id AND a.page_id=d.page_id
        WHERE d.tenant_id=$1 AND d.page_id=$2 AND d.page_type='App Page'
          AND a.app_api=$3) AS allowed`,[tenantId,pageId,ACEASSIST_APP.apiName]);
      if(!rows[0]?.allowed)throw Error('Ace Assist landing page name conflicts with existing tenant metadata');
    }
    await tx.query(`INSERT INTO md_tenant_app_navigation(tenant_id,app_id,entry_type,api_name,sort_order)
      VALUES($1,$2,'App Page',$3,0) ON CONFLICT(tenant_id,app_id,entry_type,api_name) DO NOTHING`,
      [tenantId,appId,ACEASSIST_APP.homePageApi]);
    for(const formFactor of ['desktop','phone','tablet'])await tx.query(`INSERT INTO md_app_home_pages
      (tenant_id,app_id,form_factor,page_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(tenant_id,app_id,form_factor) DO NOTHING`,[tenantId,appId,formFactor,pageId]);

    // Assignable, least-privileged policy; no users auto-enrolled.
    await tx.query(`INSERT INTO md_permission_sets(tenant_id,api_name,label,description,navigation_default_access)
      VALUES($1,'AceAssistUser','Ace Assist User','Ace Assist app and published metadata access','Deny')
      ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
    await tx.query(`INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
      SELECT $1,s.id,permission.resource,'read','allow' FROM md_permission_sets s
      CROSS JOIN (VALUES ('App:AceAssist'),('ObjectDefinition'),('PageDefinition'),('ComponentDefinition'))
        AS permission(resource)
      WHERE s.tenant_id=$1 AND s.api_name='AceAssistUser' ON CONFLICT DO NOTHING`,[tenantId]);
  });
}
