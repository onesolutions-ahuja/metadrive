import type {PoolClient} from 'pg';

type FlowScalar=string|number|boolean|null;
type FlowResource={name:string;type:string;dataType:string};
const scalar=(value:unknown):value is FlowScalar=>value===null||typeof value==='string'
 ||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);

export async function persistFlowInterviewPause(client:PoolClient,tenantId:string,runId:string,
 currentElement:number,history:number[],stepCount:number,loopIndexes:Map<number,number>,
 vars:Record<string,unknown>,resources:FlowResource[]){
 for(const [key,value] of Object.entries(vars)){
  if(key.startsWith('$Flow.')||resources.some(resource=>resource.name===key
    &&['Formula','Constant','Choice','Text Template'].includes(resource.type))
    ||!scalar(value))continue;
  const type=value===null?'null':typeof value==='string'?'string':typeof value;
  await client.query(`INSERT INTO md_flow_interview_values(tenant_id,run_id,api_name,value_text,data_type)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,run_id,api_name)
   DO UPDATE SET value_text=EXCLUDED.value_text,data_type=EXCLUDED.data_type`,
  [tenantId,runId,key,value===null?null:String(value),type]);
 }
 await client.query('DELETE FROM md_flow_interview_loop_state WHERE tenant_id=$1 AND run_id=$2',
  [tenantId,runId]);
 for(const [elementId,nextIndex] of loopIndexes)
  await client.query(`INSERT INTO md_flow_interview_loop_state
   (tenant_id,run_id,element_id,next_index) VALUES($1,$2,$3,$4)`,
  [tenantId,runId,elementId,nextIndex]);
 await client.query('DELETE FROM md_flow_interview_records WHERE tenant_id=$1 AND run_id=$2',
  [tenantId,runId]);
 for(const [name,value] of Object.entries(vars)){
  const collection=Array.isArray(value);
  if(!collection&&(!value||typeof value!=='object'||!Object.hasOwn(value,'Id')))continue;
  const objectApi=resources.find(resource=>resource.name===name)?.dataType;
  if(!objectApi||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi))
   throw new Error('Flow record resource has no Object type: '+name);
  const records=collection?value as Array<Record<string,unknown>>:[value as Record<string,unknown>];
  for(const [sortOrder,item] of (collection&&!records.length?[{}]:records).entries()){
   const recordId=item.Id;
   if(recordId!==null&&recordId!==undefined
    &&(typeof recordId!=='string'||!/^[0-9a-f-]{36}$/i.test(recordId)))
    throw new Error('Invalid Flow record resource');
   await client.query(`INSERT INTO md_flow_interview_records
    (tenant_id,run_id,api_name,object_api,sort_order,record_id,is_collection)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
   [tenantId,runId,name,objectApi,sortOrder,recordId??null,collection]);
   for(const [field,value] of Object.entries(item)){
    if(field==='Id')continue;
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field)||!scalar(value))
     throw new Error('Invalid Flow record field value');
    const type=value===null?'null':typeof value==='string'?'string':typeof value;
    await client.query(`INSERT INTO md_flow_interview_record_fields
     (tenant_id,run_id,api_name,sort_order,field_api,value_text,data_type)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId,runId,name,sortOrder,field,value===null?null:String(value),type]);
   }
  }
 }
 await client.query(`UPDATE md_flow_interview_state SET current_element=$3,
  history_elements=$4,step_count=$5,updated_at=now() WHERE tenant_id=$1 AND run_id=$2`,
 [tenantId,runId,currentElement,history,stepCount]);
}
