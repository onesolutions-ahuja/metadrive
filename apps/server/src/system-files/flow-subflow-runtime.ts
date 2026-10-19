import type {PoolClient} from 'pg';
import type {RbacEngine} from './rbac-engine.js';
import {decodeMetadataValues,type MetadataValueRow} from './component-runtime.js';

type Scalar=string|number|boolean|null;
type Resource={name:string;type?:string;dataType?:string;
 availableForInput?:boolean;availableForOutput?:boolean};
const apiName=/^[A-Za-z][A-Za-z0-9_]*$/;
const scalar=(value:unknown):value is Scalar=>value===null||typeof value==='string'
 ||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);

function mappings(value:unknown):Array<[string,string]> {
 if(typeof value!=='string'||value.length>8192)throw new Error('Invalid Subflow resource mappings');
 const result:Array<[string,string]>=[];
 for(const line of value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean)){
  const separator=line.indexOf('=');
  if(separator<1)throw new Error('Invalid Subflow resource mapping');
  const source=line.slice(0,separator).trim(),target=line.slice(separator+1).trim();
  if(!apiName.test(source)||!target||target.length>4096||result.some(([name])=>name===source))
   throw new Error('Invalid Subflow resource mapping');
  result.push([source,target]);
 }
 return result;
}

export async function executeFlowSubflow(context:{
 client:PoolClient;tenantId:string;userId:string;config:Record<string,unknown>;
 rbac:RbacEngine;callStack:string[];evaluate:(value:unknown)=>unknown;
 set:(name:unknown,value:Scalar)=>void;
 advance:(runId:string,callStack:string[])=>
  Promise<{status?:string;outputs?:Record<string,unknown>}>;
}) {
 const {client,tenantId,userId,config,rbac,callStack,evaluate,set,advance}=context;
 const flowApiName=String(config.flowApiName??'');
 if(!apiName.test(flowApiName))throw new Error('Subflow requires an active Autolaunched Flow');
 if(callStack.includes(flowApiName))throw new Error('Recursive Subflow invocation is not allowed');
 if(callStack.length>=16)throw new Error('Subflow nesting limit exceeded');
 await rbac.require(tenantId,userId,'Flow:'+flowApiName,'execute');
 const {rows:definitions}=await client.query<{id:string;flow_type:string}>(`
  SELECT id,flow_type FROM md_flow_definitions
  WHERE tenant_id=$1 AND api_name=$2 AND active=true AND archived=false
  ORDER BY version DESC LIMIT 1
 `,[tenantId,flowApiName]);
 const definition=definitions[0];
 if(!definition||definition.flow_type!=='Autolaunched Flow')
  throw new Error('Subflow must reference an active Autolaunched Flow');
 const {rows:metadata}=await client.query<MetadataValueRow>(`
  SELECT property_path,value_kind,value_text FROM md_flow_editor_values
  WHERE tenant_id=$1 AND flow_id=$2
 `,[tenantId,definition.id]);
 const graph=decodeMetadataValues(metadata).builder as
  {elements?:Array<{id:number;type:string}>;resources?:Resource[]}|undefined;
 if(!graph||!Array.isArray(graph.elements)||!Array.isArray(graph.resources))
  throw new Error('Subflow definition has no executable Builder graph');
 const starts=graph.elements.filter(element=>element.type==='Start');
 if(starts.length!==1)throw new Error('Subflow definition has an invalid Start element');
 const inputs=new Map(graph.resources.filter(resource=>resource.availableForInput)
  .map(resource=>[resource.name,resource]));
 const outputs=new Map(graph.resources.filter(resource=>resource.availableForOutput)
  .map(resource=>[resource.name,resource]));
 const inputValues=new Map<string,Scalar>();
 for(const [childName,parentExpression] of mappings(config.inputValues??'')){
  if(!inputs.has(childName))throw new Error('Subflow input is not enabled: '+childName);
  const value=evaluate(parentExpression);
  if(!scalar(value))throw new Error('Subflow inputs must be scalar');
  inputValues.set(childName,value);
 }
 const outputValues=mappings(config.outputValues??'');
 for(const [childName,parentName] of outputValues){
  if(!outputs.has(childName)||!apiName.test(parentName))
   throw new Error('Subflow output mapping is invalid: '+childName);
 }
 const {rows:runs}=await client.query<{id:string}>(`
  INSERT INTO md_flow_runs(tenant_id,flow_id,started_by,status)
  VALUES($1,$2,$3,'pending') RETURNING id
 `,[tenantId,definition.id,userId]);
 const runId=runs[0]?.id;
 if(!runId)throw new Error('Unable to create Subflow interview');
 for(const [name,value] of inputValues)
  await client.query(`
   INSERT INTO md_flow_run_inputs(tenant_id,run_id,api_name,value_text,data_type)
   VALUES($1,$2,$3,$4,$5)
  `,[tenantId,runId,name,value===null?null:String(value),value===null?'null':typeof value]);
 await client.query(`
  INSERT INTO md_flow_interview_state(tenant_id,run_id,current_element)
  VALUES($1,$2,$3)
 `,[tenantId,runId,starts[0].id]);
 const result=await advance(runId,[...callStack,flowApiName]);
 if(result.status!=='completed'||!result.outputs)
  throw new Error('Subflow did not complete synchronously');
 for(const [childName,parentName] of outputValues){
  if(!Object.hasOwn(result.outputs,childName)||!scalar(result.outputs[childName]))
   throw new Error('Subflow output is missing or non-scalar: '+childName);
  set(parentName,result.outputs[childName]);
 }
}
