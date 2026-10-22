import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

/** Install only once per installed tenant. Preserve tenant-authored versions. */
export async function seedAcetillLockFlowForTenant(client:PoolClient,tenantId:string){
 const installed=await client.query(`SELECT 1 FROM md_app_installations i
 JOIN md_apps a ON a.id=i.app_id
 WHERE i.tenant_id=$1 AND a.api_name='Acetill' LIMIT 1`,[tenantId]);
 if(!installed.rowCount)return false;
 const existing=await client.query(`SELECT 1 FROM md_flow_definitions
 WHERE tenant_id=$1 AND api_name='AcetillVerifyUserPin' LIMIT 1`,[tenantId]);
 if(existing.rowCount)return false;
 const {rows}=await client.query<{id:string}>(`INSERT INTO md_flow_definitions
 (tenant_id,api_name,label,flow_type,version,active)
 VALUES($1,'AcetillVerifyUserPin','Verify current user till PIN','Autolaunched Flow',1,true) RETURNING id`,[tenantId]);
 const document={
  apiName:'AcetillVerifyUserPin',appApiName:'Acetill',flowType:'Autolaunched Flow',
  startConfig:{executionContext:'User',securityOperation:'VerifyCurrentUserTillPin'},
  elements:[{id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'End',label:'End',config:{}}],
  connectors:[{id:'1',from:1,to:2,kind:'normal',label:'Next'}],
  resources:[{name:'pin',type:'Variable',dataType:'Text',availableForInput:true},
   {name:'verified',type:'Variable',dataType:'Boolean',availableForOutput:true}],
  tests:[],versions:[],status:'Active'
 };
 const encoded:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(document,'/builder',encoded);
 for(const e of encoded)await client.query(`INSERT INTO md_flow_editor_values
 (tenant_id,flow_id,property_path,value_kind,value_text) VALUES($1,$2,$3,$4,$5)`,
 [tenantId,rows[0].id,e.path,e.kind,e.text]);
 return true;
}

export async function seedAcetillLockFlows(db:SqlPersistence):Promise<number>{
 const {rows}=await db.query<{tenant_id:string}>(`SELECT DISTINCT i.tenant_id
 FROM md_app_installations i JOIN md_apps a ON a.id=i.app_id AND a.api_name='Acetill' AND a.enabled=true
 JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=i.tenant_id
 WHERE e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let count=0;
 for(const row of rows)if(await db.transaction(async client=>{
  // Metadata signals PIN setup availability only; the secret is held exclusively in md_users.till_pin_hash.
  await client.query(`INSERT INTO md_field_definitions
    (tenant_id,object_api,api_name,label,data_type,required)
    VALUES($1,'User','UserPin','Till PIN configured','boolean',false)
    ON CONFLICT (tenant_id,object_api,api_name) DO NOTHING`,[row.tenant_id]);
  return seedAcetillLockFlowForTenant(client,row.tenant_id);
 }))count++;
 return count;
}
