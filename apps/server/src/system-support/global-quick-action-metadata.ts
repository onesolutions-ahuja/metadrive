import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';

const identifier=/^[A-Za-z][A-Za-z0-9_]*$/;
const actionIdPattern=/^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export type GlobalQuickAction={
 id:string;label:string;behavior:'Create Record'|'Run Flow'|'Send Email';enabled:boolean;
 targetObjectApi?:string;flowApiName?:string;credentialId?:string;fromEmail?:string
};
const validate=(input:unknown):GlobalQuickAction[]=>{
 if(!Array.isArray(input)||input.length>100)throw new Error('Invalid global actions');
 const names=new Set<string>(),labels=new Set<string>();
 return input.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid global action');
  const item=value as Record<string,unknown>;
  if(typeof item.id!=='string'||!actionIdPattern.test(item.id)
    ||typeof item.label!=='string'||!item.label.trim()||item.label.length>80
    ||typeof item.enabled!=='boolean'
    ||!['Create Record','Run Flow','Send Email'].includes(String(item.behavior)))
    throw new Error('Invalid global action');
  if(names.has(item.id.toLowerCase())||labels.has(item.label.trim().toLowerCase()))
   throw new Error('Duplicate global action');
  names.add(item.id.toLowerCase());labels.add(item.label.trim().toLowerCase());
  const common={id:item.id,label:item.label.trim(),enabled:item.enabled};
  if(item.behavior==='Create Record'){
   if(typeof item.targetObjectApi!=='string'||!identifier.test(item.targetObjectApi))
    throw new Error('Global create action requires a target Object');
   return {...common,behavior:'Create Record' as const,targetObjectApi:item.targetObjectApi};
  }
  if(item.behavior==='Run Flow'){
   if(typeof item.flowApiName!=='string'||!identifier.test(item.flowApiName))
    throw new Error('Global Flow action requires a Flow');
   return {...common,behavior:'Run Flow' as const,flowApiName:item.flowApiName};
  }
  if(typeof item.credentialId!=='string'||!uuid.test(item.credentialId)
    ||typeof item.fromEmail!=='string'||item.fromEmail.length>254||!email.test(item.fromEmail))
   throw new Error('Global email action requires a valid SMTP sender and credential');
  return {...common,behavior:'Send Email' as const,
   credentialId:item.credentialId,fromEmail:item.fromEmail};
 });
};

export class GlobalQuickActionMetadataService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 async list(tenantId:string,userId:string){
  await this.rbac.require(tenantId,userId,'ObjectDefinition','read');
  const {rows}=await this.db.query<{
   action_id:string;label:string;behavior:GlobalQuickAction['behavior'];enabled:boolean;
   target_object_api:string|null;flow_api_name:string|null;credential_id:string|null;from_email:string|null
  }>(`SELECT action_id,label,behavior,enabled,target_object_api,flow_api_name,
    credential_id,from_email FROM md_global_quick_actions
    WHERE tenant_id=$1 ORDER BY sort_order,action_id`,[tenantId]);
  return {actions:rows.map(r=>({
   id:r.action_id,label:r.label,behavior:r.behavior,enabled:r.enabled,
   ...(r.target_object_api?{targetObjectApi:r.target_object_api}:{}),
   ...(r.flow_api_name?{flowApiName:r.flow_api_name}:{}),
   ...(r.credential_id?{credentialId:r.credential_id}:{}),
   ...(r.from_email?{fromEmail:r.from_email}:{})
  }))};
 }
 async save(tenantId:string,userId:string,input:unknown){
  await this.rbac.require(tenantId,userId,'ObjectDefinition','manage');
  const actions=validate(input);
  await this.db.transaction(async client=>{
   for(const action of actions){
    if(action.behavior==='Create Record'){
     const result=await client.query(`SELECT 1 FROM md_object_definitions
       WHERE tenant_id=$1 AND api_name=$2`,[tenantId,action.targetObjectApi]);
     if(!result.rowCount)throw new Error('Target Object is unavailable');
    }else if(action.behavior==='Run Flow'){
     const result=await client.query(`SELECT 1 FROM md_flow_definitions
       WHERE tenant_id=$1 AND api_name=$2 AND archived=false`,[tenantId,action.flowApiName]);
     if(!result.rowCount)throw new Error('Flow is unavailable');
    }else{
     const result=await client.query(`SELECT 1 FROM md_named_credentials
       WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true`,
      [tenantId,action.credentialId]);
     if(!result.rowCount)throw new Error('SMTP credential is unavailable');
    }
   }
   await client.query('DELETE FROM md_global_quick_actions WHERE tenant_id=$1',[tenantId]);
   for(const [index,a] of actions.entries())await client.query(`
     INSERT INTO md_global_quick_actions
      (tenant_id,action_id,label,behavior,enabled,target_object_api,flow_api_name,
       credential_id,from_email,sort_order)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
     [tenantId,a.id,a.label,a.behavior,a.enabled,a.targetObjectApi??null,
      a.flowApiName??null,a.credentialId??null,a.fromEmail??null,index]);
  });
  return {actions};
 }
}
