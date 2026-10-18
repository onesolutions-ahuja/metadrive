import type {PoolClient} from 'pg';

type Element={id:number;type:string;label:string;config:Record<string,unknown>};
type Connector={from:number;to:number;kind:string;label?:string};
type Published={apiName:string;label:string;flowType:string;status:string;versionNumber:number;elements:Element[];connectors:Connector[]};

/** Only compile elements supported by the shared SQL interpreter.
 * Reject unknown nodes rather than publishing a flow that cannot execute.
 */
export async function publishSimpleFlow(
 client:PoolClient,tenantId:string,apiName:string,payload:unknown):Promise<Published>{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid Flow definition');
 const flow=payload as Record<string,unknown>;
 if(flow.apiName!==apiName||typeof flow.label!=='string'||!flow.label.trim()
    ||!['Screen Flow','Autolaunched Flow'].includes(String(flow.flowType))
    ||!Array.isArray(flow.elements)||!Array.isArray(flow.connectors)
    ||flow.elements.length<2||flow.elements.length>200||flow.connectors.length>500)
  throw Error('Invalid Flow publication');
 const elements=flow.elements as Element[],edges=flow.connectors as Connector[];
 const nodes=new Map<number,Element>();
 for(const e of elements){
  if(!e||!Number.isSafeInteger(e.id)||e.id<0||!['Start','Screen','End'].includes(e.type)
    ||typeof e.label!=='string'||!e.label.trim()||nodes.has(e.id))
   throw Error('Unsupported or duplicate Flow element');
  // Properties/configuration for Screens must be rendered by a registered component.
  if(e.type==='Screen'&&flow.flowType!=='Screen Flow')throw Error('Screen elements require a Screen Flow');
  nodes.set(e.id,e);
 }
 const starts=elements.filter(x=>x.type==='Start'),ends=elements.filter(x=>x.type==='End');
 if(starts.length!==1||!ends.length)throw Error('Flow requires exactly one Start and an End');
 const adjacency=new Map<number,number[]>();
 for(const edge of edges){
  if(!edge||edge.kind!=='normal'||!nodes.has(edge.from)||!nodes.has(edge.to)
     ||nodes.get(edge.from)?.type==='End')throw Error('Invalid Flow connector');
  const targets=adjacency.get(edge.from)??[];
  targets.push(edge.to);adjacency.set(edge.from,targets);
 }
 // This compiler handles deterministic paths only; decisions require the shared condition runtime.
 for(const element of elements){
  const count=(adjacency.get(element.id)??[]).length;
  if(element.type==='End'?count!==0:count!==1)throw Error('Unsupported branching or incomplete Flow path');
 }
 const reachable=new Set<number>();
 let current=starts[0].id;
 while(!reachable.has(current)){
  reachable.add(current);
  const next=adjacency.get(current)?.[0];
  if(next===undefined)break;
  current=next;
 }
 if(reachable.size!==nodes.size||!ends.some(e=>reachable.has(e.id))||nodes.get(current)?.type!=='End')
  throw Error('Flow has disconnected elements or cycles');
 const {rows:versions}=await client.query<{version:number}>(
  'SELECT version FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE',
  [tenantId,apiName]);
 const version=(versions[0]?.version??0)+1;
 const {rows:created}=await client.query<{id:string}>(`
  INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
  VALUES($1,$2,$3,$4,$5,false) RETURNING id`,
  [tenantId,apiName,flow.label,flow.flowType,version]);
 const flowId=created[0].id;
 for(let i=0;i<elements.length;i++){
  const e=elements[i];
  await client.query(`INSERT INTO md_flow_nodes(tenant_id,flow_id,api_name,node_type,sort_order)
   VALUES($1,$2,$3,$4,$5)`,[tenantId,flowId,'Node_'+e.id,e.type,i]);
 }
 for(const edge of edges)await client.query(`INSERT INTO md_flow_edges(tenant_id,flow_id,source_api,target_api,outcome)
  VALUES($1,$2,$3,$4,'default')`,
  [tenantId,flowId,'Node_'+edge.from,'Node_'+edge.to]);
 await client.query('UPDATE md_flow_definitions SET active=false WHERE tenant_id=$1 AND api_name=$2 AND active=true',
  [tenantId,apiName]);
 await client.query('UPDATE md_flow_definitions SET active=true WHERE tenant_id=$1 AND id=$2',[tenantId,flowId]);
 return {apiName,label:flow.label,flowType:String(flow.flowType),status:'Active',versionNumber:version,elements,connectors:edges};
}
