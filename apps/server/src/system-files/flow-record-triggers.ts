import type {PoolClient} from 'pg';
import type {RbacEngine} from './rbac-engine.js';
import type {FlowRuntime} from './flow-runtime.js';
import {decodeMetadataValues,type MetadataValueRow} from './component-runtime.js';
import {evaluateFlowDecisionOutcome} from './flow-decision-runtime.js';

type TriggerOperation='created'|'updated'|'deleted';
type TriggerPhase='before-save'|'after-save';
type Snapshot=Record<string,unknown>;
type Candidate={id:string;api_name:string};
type TriggerDocument={
 flowType?:string;triggerObject?:string;
 startConfig?:Record<string,unknown>;
 elements?:Array<{id:number;type:string;config:Record<string,unknown>}>;
 resources?:unknown[];connectors?:unknown[];
};
const scalar=(value:unknown):value is string|number|boolean|null=>
 value===null||typeof value==='string'||typeof value==='boolean'
 ||typeof value==='number'&&Number.isFinite(value);
const asString=(value:unknown)=>typeof value==='string'?value:'';

function conditionValue(value:unknown,actual:unknown):unknown {
 if(typeof actual==='number'&&typeof value==='string'&&value.trim()){
  const parsed=Number(value);
  if(Number.isFinite(parsed))return parsed;
 }
 if(typeof actual==='boolean'&&(value==='true'||value==='false'))return value==='true';
 return value;
}

export class FlowRecordTriggers {
 constructor(private readonly rbac:RbacEngine,private readonly flows:FlowRuntime){}

 async execute(client:PoolClient,tenantId:string,userId:string,objectApi:string,
   operation:TriggerOperation,record:Snapshot|null,prior:Snapshot|null,
   phase:TriggerPhase='after-save'):Promise<Snapshot|void> {
  const {rows}=await client.query<Candidate>(`
   SELECT id,api_name FROM md_flow_definitions
   WHERE tenant_id=$1 AND active=true AND archived=false AND flow_type='Record-Triggered Flow'
   ORDER BY api_name
  `,[tenantId]);
  const ready:Array<{flow:Candidate;graph:TriggerDocument;start:NonNullable<TriggerDocument['elements']>[number];order:number}>=[];
  let current=record?{...record}:null;
  for(const flow of rows){
   const {rows:values}=await client.query<MetadataValueRow>(`
    SELECT property_path,value_kind,value_text FROM md_flow_editor_values
    WHERE tenant_id=$1 AND flow_id=$2
   `,[tenantId,flow.id]);
   const graph=decodeMetadataValues(values).builder as TriggerDocument|undefined;
   if(!graph||!Array.isArray(graph.elements))throw new Error('Invalid active Record-Triggered Flow graph');
   const start=graph.elements.find(element=>element.type==='Start');
   if(!start)throw new Error('Record-Triggered Flow has no Start element');
   const config=start.config;
   if(config.object!==objectApi||(config.runWhen??'after-save')!==phase)continue;
   if(phase==='before-save'&&operation==='deleted')continue;
   const trigger=String(config.trigger??'created-or-updated');
   if(!(trigger==='created-or-updated'
     ||operation==='created'&&trigger==='created'
     ||operation==='updated'&&trigger==='updated'
     ||operation==='deleted'&&trigger==='deleted'))continue;
   const order=Number(config.triggerOrder??1000);
   if(!Number.isSafeInteger(order)||order<1||order>2000)
    throw new Error('Invalid active Record-Triggered Flow order');
   const conditions=Array.isArray(config.entryConditions)
     ?config.entryConditions as Array<Record<string,unknown>>:[];
   const matches=(subject:Snapshot|null,previous:Snapshot|null)=>conditions.length===0
     ||Boolean(subject)&&evaluateFlowDecisionOutcome(conditions.map(condition=>{
       const field=asString(condition.field);
       const actual=subject?.[field];
       return {...condition,field:actual,
        value:conditionValue(condition.value,actual),
        priorValue:previous?.[field]};
      }),typeof config.conditionLogic==='string'?config.conditionLogic:undefined,
      value=>value,value=>value!==undefined);
   const currentMatches=matches(current??prior,prior);
   if(!currentMatches)continue;
   if(operation==='updated'&&config.updatedRecordBehavior==='transition'
     &&matches(prior,null))continue;
   ready.push({flow,graph,start,order});
  }
  ready.sort((left,right)=>left.order-right.order
   ||left.flow.api_name.localeCompare(right.flow.api_name));
  for(const item of ready){
   await this.rbac.require(tenantId,userId,'Flow:'+item.flow.api_name,'execute');
   const {rows:runRows}=await client.query<{id:string}>(`
    INSERT INTO md_flow_runs(tenant_id,flow_id,started_by,status)
    VALUES($1,$2,$3,'pending') RETURNING id
   `,[tenantId,item.flow.id,userId]);
   const runId=runRows[0]?.id;
   if(!runId)throw new Error('Unable to create Record-Triggered Flow run');
   await client.query(`
    INSERT INTO md_flow_interview_state(tenant_id,run_id,current_element)
    VALUES($1,$2,$3)
   `,[tenantId,runId,item.start.id]);
   await this.persistRecord(client,tenantId,runId,'$Record',objectApi,current??prior,
    operation==='deleted'?null:(current??prior)?.Id);
   await this.persistRecord(client,tenantId,runId,'$Record__Prior',objectApi,prior,
    operation==='deleted'?null:prior?.Id);
   const result=await this.flows.advanceInterview(tenantId,userId,runId,{},client);
   if(!('status' in result)||result.status!=='completed')
    throw new Error('Record-Triggered Flow did not complete synchronously');
   if(phase==='before-save'&&'record' in result&&result.record
     &&typeof result.record==='object'&&!Array.isArray(result.record))
    current={...current,...result.record as Snapshot};
  }
  return phase==='before-save'?current??undefined:undefined;
 }

 private async persistRecord(client:PoolClient,tenantId:string,runId:string,name:string,
   objectApi:string,record:Snapshot|null,recordId:unknown) {
  if(!record&&name!=='$Record__Prior')return;
  const id=typeof recordId==='string'&&/^[0-9a-f-]{36}$/i.test(recordId)?recordId:null;
  await client.query(`
   INSERT INTO md_flow_interview_records
    (tenant_id,run_id,api_name,object_api,sort_order,record_id,is_collection)
   VALUES($1,$2,$3,$4,0,$5,false)
  `,[tenantId,runId,name,objectApi,id]);
  const fields=Object.entries(record??{}).filter((entry):entry is [string,string|number|boolean|null]=>
   entry[0]!=='Id'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(entry[0])&&scalar(entry[1]));
  if(record&&typeof record.Id==='string'&&id===null&&scalar(record.Id))
   fields.push(['Id',record.Id]);
  for(const [field,value] of fields)
   await client.query(`
    INSERT INTO md_flow_interview_record_fields
     (tenant_id,run_id,api_name,sort_order,field_api,value_text,data_type)
    VALUES($1,$2,$3,0,$4,$5,$6)
   `,[tenantId,runId,name,field,value===null?null:String(value),
    value===null?'null':typeof value]);
 }
}
