import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

/** Add only a missing Flow to tenants which actually installed AceKiosk.
 * Never overwrite tenant-authored Flow versions, grant RBAC, or seed business products.
 */
export async function seedAceKioskMenuForTenant(client:PoolClient,tenantId:string):Promise<boolean>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':flow:AceKioskLoadMenu']);
   // App-specific OneEngine permission set. Assignment is explicit, never inferred
   // from a landing page or app installation.
   await client.query(`INSERT INTO md_permission_sets
      (tenant_id,api_name,label,description,navigation_default_access)
      VALUES($1,'AceKioskUser','AceKiosk User',
        'Authorised kiosk menu records and menu Flow','Deny')
      ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
   await client.query(`
      INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
      SELECT $1,p.id,rights.resource,rights.action,'allow'
      FROM md_permission_sets p CROSS JOIN (VALUES
        ('App:AceKiosk','read'),('Flow:AceKioskLoadMenu','execute'),
        ('Flow:AceKioskProductOptions','execute'),
        ('MealChoiceGroup','read'),('MealChoiceOption','read'),
        ('MealChoiceGroup.Name','read'),('MealChoiceGroup.ParentProduct','read'),
        ('MealChoiceGroup.MinimumChoices','read'),('MealChoiceGroup.DisplayOrder','read'),
        ('MealChoiceOption.Name','read'),('MealChoiceOption.ChoiceGroup','read'),
        ('MealChoiceOption.ChoiceProduct','read'),('MealChoiceOption.AdditionalPrice','read'),
        ('Product','read'),('MenuCategory','read'),
        ('Product.Name','read'),('Product.Price','read'),
        ('Product.UnitPrice','read'),('Product.SalePrice','read'),
        ('Product.Description','read'),('Product.ImageUrl','read'),
        ('Product.MenuCategory','read'),('Product.Active','read'),
        ('Product.Category','read'),('Product.DisplayOrder','read'),
        ('MenuCategory.Name','read'),('MenuCategory.DisplayOrder','read'),
        ('MenuCategory.Active','read')
      ) rights(resource,action)
      WHERE p.tenant_id=$1 AND p.api_name='AceKioskUser'
      ON CONFLICT DO NOTHING`,[tenantId]);
   const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 LIMIT 1',[tenantId,'AceKioskLoadMenu']);
   if(existing.rowCount)return false; // Never change or activate an existing tenant-customised Flow.
   // Only the installed application's missing schema is provisioned.
   await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
      VALUES($1,'MenuCategory','Menu Category',false) ON CONFLICT DO NOTHING`,[tenantId]);
   for(const item of [
      {api:'Name',label:'Name',type:'text'},
      {api:'DisplayOrder',label:'Display Order',type:'number'},
      {api:'Active',label:'Active',type:'boolean'}
   ])await client.query(`INSERT INTO md_field_definitions
      (tenant_id,object_api,api_name,label,data_type)
      VALUES($1,'MenuCategory',$2,$3,$4) ON CONFLICT DO NOTHING`,
      [tenantId,item.api,item.label,item.type]);
   const products=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[tenantId,'Product']);
   const categories=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[tenantId,'MenuCategory']);
   if(!products.rowCount||!categories.rowCount)return false; // Object seeder is independently managed.
   const {rows}=await client.query<{id:string}>(`
     INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
     VALUES($1,'AceKioskLoadMenu','AceKiosk - Load Menu','Autolaunched Flow',1,true)
     RETURNING id`,[tenantId]);
   const graph={
    apiName:'AceKioskLoadMenu',label:'AceKiosk - Load Menu',appApiName:'AceKiosk',
    flowType:'Autolaunched Flow',status:'Active',version:1,
    elements:[
     {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
     {id:2,type:'Get Records',label:'Products',config:{object:'Product',recordLimit:'all',outputVariable:'products'}},
     {id:3,type:'Get Records',label:'Categories',config:{object:'MenuCategory',recordLimit:'all',outputVariable:'categories'}},
     {id:4,type:'End',label:'End',config:{}}
    ],
    connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'},{from:3,to:4,kind:'normal',label:'Next'}],
    resources:[
     {name:'products',type:'Record Collection',dataType:'Product',availableForOutput:true},
     {name:'categories',type:'Record Collection',dataType:'MenuCategory',availableForOutput:true}
    ],tests:[]
   };
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',entries);
   for(const item of entries)await client.query(`
      INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
      VALUES($1,$2,$3,$4,$5)`,[tenantId,rows[0].id,item.path,item.kind,item.text]);
   return true;
}

/** Backfill only installed, active, licensed tenant apps after SQL bootstrap. */
export async function seedAceKioskMenuFlows(db:SqlPersistence):Promise<number>{
 const {rows}=await db.query<{tenant_id:string}>(`
   SELECT DISTINCT i.tenant_id FROM md_app_installations i
   JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceKiosk' AND a.enabled=true
   JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=i.tenant_id
   WHERE e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let seeded=0;
 for(const {tenant_id} of rows){
   if(await db.transaction(client=>seedAceKioskMenuForTenant(client,tenant_id)))seeded++;
 }
 return seeded;
}

/** Install an optional read-only personalisation Flow from existing Objects only.
 * No demo products, choices, records or tenant permissions are fabricated.
 */
export async function seedAceKioskProductOptions(db:SqlPersistence):Promise<number>{
 const {rows:tenants}=await db.query<{tenant_id:string}>(`
   SELECT i.tenant_id FROM md_app_installations i
   JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceKiosk' AND a.enabled
   JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=i.tenant_id
   WHERE e.active AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let count=0;
 for(const tenant of tenants){
  const installed=await db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenant.tenant_id+':flow:AceKioskProductOptions']);
   const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
     [tenant.tenant_id,'AceKioskProductOptions']);
   if(existing.rowCount)return false;
   const objects=await client.query<{api_name:string}>(`
     SELECT api_name FROM md_object_definitions
     WHERE tenant_id=$1 AND api_name IN ('MealChoiceGroup','MealChoiceOption')`,[tenant.tenant_id]);
   if(objects.rows.length!==2)return false;
   const {rows:flow}=await client.query<{id:string}>(`
     INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
     VALUES($1,'AceKioskProductOptions','AceKiosk - Product Options','Autolaunched Flow',1,true)
     RETURNING id`,[tenant.tenant_id]);
   const graph={
    apiName:'AceKioskProductOptions',label:'AceKiosk - Product Options',appApiName:'AceKiosk',
    flowType:'Autolaunched Flow',status:'Active',version:1,
    elements:[
      {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
      {id:2,type:'Get Records',label:'Choice Groups',config:{object:'MealChoiceGroup',recordLimit:'all',outputVariable:'choiceGroups'}},
      {id:3,type:'Get Records',label:'Choice Options',config:{object:'MealChoiceOption',recordLimit:'all',outputVariable:'choiceOptions'}},
      {id:4,type:'End',label:'End',config:{}}
    ],
    connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'},{from:3,to:4,kind:'normal',label:'Next'}],
    resources:[
     {name:'choiceGroups',type:'Record Collection',dataType:'MealChoiceGroup',availableForOutput:true},
     {name:'choiceOptions',type:'Record Collection',dataType:'MealChoiceOption',availableForOutput:true}
    ],tests:[]
   };
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',entries);
   for(const entry of entries)await client.query(`
     INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
     VALUES($1,$2,$3,$4,$5)`,[tenant.tenant_id,flow[0].id,entry.path,entry.kind,entry.text]);
   return true;
  });
  if(installed)count++;
 }
 return count;
}
