import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {RecordEngine} from '../system-files/record-engine.js';
import type {FlowRuntime} from '../system-files/flow-runtime.js';
import type {RecordCollaborationService} from './record-collaboration-service.js';

const objectName=/^[A-Za-z][A-Za-z0-9_]*$/;
const actionName=/^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Actor={tenant_id:string;user_id:string};
type ActionRow={behavior:string;field_api:string|null;value_text:string|null;
 target_object_api:string|null;relationship_field_api:string|null;flow_api_name:string|null};

/** One server-side entrypoint for metadata-configured object quick actions. */
export class ObjectQuickActionRuntime {
 constructor(
  private readonly db:SqlPersistence,
  private readonly rbac:RbacEngine,
  private readonly records:RecordEngine,
  private readonly collaboration:RecordCollaborationService,
  private readonly flows:FlowRuntime
 ){}

 async execute(actor:Actor,objectApi:string,recordId:string,actionId:string,input:unknown){
  if(!objectName.test(objectApi)||!actionName.test(actionId)||!uuid.test(recordId))
   throw new Error('Invalid quick action request');
  if(input===null||typeof input!=='object'||Array.isArray(input))
   throw new Error('Invalid quick action input');
  const values=input as Record<string,unknown>;
  if(Object.keys(values).length>100)throw new Error('Quick action input too large');
  const tenantId=actor.tenant_id,userId=actor.user_id;
  await this.rbac.require(tenantId,userId,objectApi,'read');
  await this.rbac.requireRecord(tenantId,userId,objectApi,recordId,'read');
  await this.rbac.require(tenantId,userId,'Action:'+objectApi+'.'+actionId,'execute');
  const {rows}=await this.db.query<ActionRow>(`
    SELECT behavior,field_api,value_text,target_object_api,relationship_field_api,flow_api_name
    FROM md_object_actions WHERE tenant_id=$1 AND object_api=$2 AND action_id=$3
      AND enabled=true AND action_type='Custom'`,[tenantId,objectApi,actionId]);
  const action=rows[0];
  if(!action)throw new Error('Quick action is unavailable');
  if(action.behavior==='Set Field Value'){
   if(Object.keys(values).length)throw new Error('This action accepts no user input');
   if(!action.field_api||action.value_text===null)throw new Error('Quick action configuration is invalid');
   await this.records.update(tenantId,userId,objectApi,recordId,{[action.field_api]:action.value_text});
   return {status:'completed',recordId};
  }
  if(action.behavior==='Log Call'){
   const subject=values.subject??action.value_text??'Call';
   const description=values.description??'';
   if(Object.keys(values).some(key=>!['subject','description'].includes(key)))
    throw new Error('Invalid call input');
   const {activity}=await this.collaboration.addActivity(actor,objectApi,recordId,{
    kind:'Call',subject,description,status:'Completed'});
   return {status:'completed',activity};
  }
  if(action.behavior==='Create Related'){
   const childObject=action.target_object_api,relationshipField=action.relationship_field_api;
   if(!childObject||!relationshipField)throw new Error('Quick action relationship is not configured');
   if(!objectName.test(childObject)||!objectName.test(relationshipField)
      ||Object.hasOwn(values,relationshipField))
    throw new Error('Invalid related-record values');
   const relation=await this.db.query(`
     SELECT 1 FROM md_field_definitions
     WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 AND related_object=$4
       AND data_type='reference' AND deleted_at IS NULL`,
     [tenantId,childObject,relationshipField,objectApi]);
   if(!relation.rowCount)throw new Error('Configured relationship is no longer available');
   const id=await this.records.create(tenantId,userId,childObject,{
    ...values,[relationshipField]:recordId});
   return {status:'completed',recordId:id,objectApiName:childObject};
  }
  if(action.behavior==='Run Flow'){
   if(!action.flow_api_name||!objectName.test(action.flow_api_name))
    throw new Error('Quick action Flow is not configured');
   if(Object.keys(values).length)throw new Error('Flow action accepts no user input');
   const result=await this.flows.execute(tenantId,action.flow_api_name,userId,{
    recordId,objectApiName:objectApi});
   return {status:'started',result};
  }
  throw new Error('Unsupported quick action behavior');
 }
}
