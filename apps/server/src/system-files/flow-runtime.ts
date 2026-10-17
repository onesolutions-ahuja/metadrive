import type { SqlPersistence } from './sql-persistence.js';
import type { RbacEngine } from './rbac-engine.js';
import type { RecordEngine } from './record-engine.js';
type NodeRow={id:string;api_name:string;node_type:string};
type EdgeRow={source_api:string;target_api:string;outcome:string};
type PropRow={node_id:string;api_name:string;value_text:string|null;data_type:string};
type Scalar=string|number|boolean|null;
type NodeProperty={value_text:string|null;data_type:string};
const namePattern=/^[A-Za-z][A-Za-z0-9_.]*$/;
function scalar(value:unknown):value is Scalar {
  return value===null||typeof value==='string'||
    typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value));
}
function scalarText(value:Scalar):{text:string|null;type:string}{
  if(value===null)return{text:null,type:'null'};
  return{text:String(value),type:typeof value};
}
function scalarFrom(text:string|null,type:string):Scalar {
  if(type==='null')return null;
  if(type==='boolean')return text==='true';
  if(type==='number') {
    const parsed=Number(text);if(!Number.isFinite(parsed))throw new Error('Invalid Flow number');
    return parsed;
  }
  if(type==='text'||type==='string')return text??'';
  throw new Error('Unsupported Flow property type');
}
/** Atomic, bounded SQL Flow executor. Unsupported or dangerous actions fail closed. */
export class FlowRuntime {
  constructor(private readonly db:SqlPersistence,private readonly rbac?:RbacEngine,private readonly records?:RecordEngine) {}
  async list(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string;version:number;active:boolean}>(
      'SELECT api_name,version,active FROM md_flow_definitions WHERE tenant_id=$1 ORDER BY api_name,version DESC LIMIT 100',
      [tenantId]);
    return rows.map(row=>({apiName:row.api_name,versionNumber:row.version,status:row.active?'Active':'Draft'}));
  }
  async loadActive(tenantId:string,apiName:string) {
    const {rows}=await this.db.query<{id:string;version:number}>(
      'SELECT id,version FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND active=true ORDER BY version DESC LIMIT 1',
      [tenantId,apiName]);
    if(!rows[0])throw new Error('Active flow not found');
    return rows[0];
  }
  async start(tenantId:string,flowApi:string,userId:string,inputs:Record<string,unknown>={}) {
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'Flow:'+flowApi,'execute');
    if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.keys(inputs).length>100)
      throw new Error('Invalid Flow inputs');
    const normalized=new Map<string,Scalar>();
    for(const [name,value] of Object.entries(inputs)) {
      if(!namePattern.test(name)||!scalar(value)||typeof value==='string'&&value.length>4096)
        throw new Error('Invalid Flow input: '+name);
      normalized.set(name,value);
    }
    const flow=await this.loadActive(tenantId,flowApi);
    return this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>(
        "INSERT INTO md_flow_runs (tenant_id,flow_id,started_by,status) VALUES ($1,$2,$3,'pending') RETURNING id",
        [tenantId,flow.id,userId]);
      const id=rows[0].id;
      for(const [name,value] of normalized) {
        const encoded=scalarText(value);
        await client.query(
          'INSERT INTO md_flow_run_inputs (tenant_id,run_id,api_name,value_text,data_type) VALUES ($1,$2,$3,$4,$5)',
          [tenantId,id,name,encoded.text,encoded.type]);
      }
      return id;
    });
  }
  async execute(tenantId:string,flowApi:string,userId:string,inputs:Record<string,unknown>={}) {
    const id=await this.start(tenantId,flowApi,userId,inputs);
    return this.run(tenantId,id,userId);
  }
  async run(tenantId:string,runId:string,userId:string) {
    if(!this.rbac||!this.records)throw new Error('Flow executor not configured');
    try {
      const outcome=await this.db.transaction(async client=>{
        const row=await client.query<{flow_id:string;started_by:string;status:string;api_name:string}>(
          "SELECT r.flow_id,r.started_by,r.status,f.api_name FROM md_flow_runs r JOIN md_flow_definitions f ON f.id=r.flow_id AND f.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r",
          [tenantId,runId]);
        const run=row.rows[0];
        if(!run||run.status!=='pending'||run.started_by!==userId)throw new Error('Invalid Flow run');
        await this.rbac!.require(tenantId,userId,'Flow:'+run.api_name,'execute');
        const [nodeResults,edgeResults,propResults,inputResults]=await Promise.all([
          client.query<NodeRow>('SELECT id,api_name,node_type FROM md_flow_nodes WHERE tenant_id=$1 AND flow_id=$2 ORDER BY sort_order,id',[tenantId,run.flow_id]),
          client.query<EdgeRow>('SELECT source_api,target_api,outcome FROM md_flow_edges WHERE tenant_id=$1 AND flow_id=$2',[tenantId,run.flow_id]),
          client.query<PropRow>('SELECT p.node_id,p.api_name,p.value_text,p.data_type FROM md_flow_node_properties p JOIN md_flow_nodes n ON n.id=p.node_id AND n.tenant_id=p.tenant_id WHERE n.tenant_id=$1 AND n.flow_id=$2',[tenantId,run.flow_id]),
          client.query<{api_name:string;value_text:string|null;data_type:string}>(
            'SELECT api_name,value_text,data_type FROM md_flow_run_inputs WHERE tenant_id=$1 AND run_id=$2',[tenantId,runId])
        ]);
        const nodes=new Map(nodeResults.rows.map(node=>[node.api_name,node]));
        const starts=nodeResults.rows.filter(node=>node.node_type==='Start');
        if(starts.length!==1)throw new Error('Invalid Flow: exactly one Start required');
        if(nodes.size!==nodeResults.rows.length)throw new Error('Invalid Flow duplicate node');
        const edges=edgeResults.rows;
        if(edges.some(e=>!nodes.has(e.source_api)||!nodes.has(e.target_api)))
          throw new Error('Invalid Flow graph target');
        const props=new Map<string,Map<string,NodeProperty>>();
        for(const prop of propResults.rows) {
          const map=props.get(prop.node_id)??new Map<string,NodeProperty>();
          map.set(prop.api_name,{value_text:prop.value_text,data_type:prop.data_type});
          props.set(prop.node_id,map);
        }
        const vars=new Map<string,Scalar>();
        for(const input of inputResults.rows)vars.set(input.api_name,scalarFrom(input.value_text,input.data_type));
        const resolve=(value:NodeProperty|undefined):Scalar=>{
          if(!value)throw new Error('Missing Flow property');
          if(value.value_text?.startsWith('@')) {
            const name=value.value_text.slice(1);
            if(!namePattern.test(name)||!vars.has(name))throw new Error('Unknown Flow resource');
            return vars.get(name)!;
          }
          return scalarFrom(value.value_text,value.data_type);
        };
        const property=(node:NodeRow,key:string)=>props.get(node.id)?.get(key);
        const requireText=(value:Scalar)=>{
          if(typeof value!=='string'||!namePattern.test(value))throw new Error('Invalid Flow API name');
          return value;
        };
        let current=starts[0].api_name;
        for(let step=0;step<200;step++) {
          const node=nodes.get(current)!;
          let result='default';
          switch(node.node_type) {
            case 'Start': break;
            case 'Assignment': {
              const dest=requireText(resolve(property(node,'variable')));
              vars.set(dest,resolve(property(node,'value')));
              break;
            }
            case 'Decision': {
              const left=resolve(property(node,'actual'));
              const right=resolve(property(node,'expected'));
              const operator=property(node,'operator')?.value_text??'equals';
              let matches=false;
              if(operator==='equals')matches=left===right;
              else if(operator==='notEquals')matches=left!==right;
              else if(operator==='greater')matches=typeof left==='number'&&typeof right==='number'&&left>right;
              else if(operator==='less')matches=typeof left==='number'&&typeof right==='number'&&left<right;
              else throw new Error('Unsupported Flow comparison');
              result=matches?'true':'false';
              break;
            }
            case 'CreateRecord': {
              const objectApi=requireText(resolve(property(node,'objectApi')));
              const fields:Record<string,unknown>={};
              for(const [key,value] of props.get(node.id)??new Map<string,NodeProperty>()) {
                if(key.startsWith('field.')) {
                  const fieldName=key.slice(6);
                  if(!namePattern.test(fieldName)||fieldName.includes('.'))throw new Error('Invalid Flow field');
                  fields[fieldName]=resolve(value);
                }
              }
              const recordId=await this.records!.createInTransaction(client,tenantId,userId,objectApi,fields);
              const output=property(node,'resultVariable');
              if(output)vars.set(requireText(resolve(output)),recordId);
              break;
            }
            case 'End': {
              await client.query(
                "UPDATE md_flow_runs SET status='completed',finished_at=now() WHERE tenant_id=$1 AND id=$2",
                [tenantId,runId]);
              return {id:runId,status:'completed' as const};
            }
            default:throw new Error('Unsupported Flow element: '+node.node_type);
          }
          const next=edges.find(e=>e.source_api===current&&e.outcome===result);
          if(!next)throw new Error('Invalid Flow: no outgoing path');
          current=next.target_api;
        }
        throw new Error('Flow exceeded maximum element limit');
      });
      return outcome;
    } catch(error) {
      // Mutations within the transaction were rolled back. The run is durable and failed.
      const message=error instanceof Error?error.message:'Unknown Flow failure';
      await this.db.query(
        "UPDATE md_flow_runs SET status='failed',error_code=$3,finished_at=now() WHERE tenant_id=$1 AND id=$2 AND status='pending'",
        [tenantId,runId,message.slice(0,200)]);
      throw error;
    }
  }
}
