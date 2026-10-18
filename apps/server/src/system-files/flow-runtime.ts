import type { SqlPersistence } from './sql-persistence.js';
import {encodeMetadataValue,decodeMetadataValues,type MetadataValueRow} from './component-runtime.js';
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
  constructor(private readonly db:SqlPersistence,private readonly rbac?:RbacEngine,
    private readonly records?:RecordEngine,
    private readonly httpCallout?:(tenantId:string,userId:string,config:Record<string,unknown>,
      variables:Record<string,Scalar>,idempotencyKey:string)=>Promise<{status:number;body:string}>) {}
  /** Builder drafts are checked against executable SQL Flow capabilities, never assumed executable. */
  async validateDraft(tenantId:string,userId:string,apiName:string,draft:unknown){
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','manage');
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid Flow name');
    if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('Invalid Flow draft');
    const data=draft as Record<string,unknown>;
    const errors:string[]=[],warnings:string[]=[];
    if(data.apiName!==apiName)errors.push('Flow API name must match the requested definition');
    if(!['Autolaunched Flow','Screen Flow'].includes(String(data.flowType)))errors.push('This SQL runtime supports Autolaunched Flow and Screen Flow');
    if(!Array.isArray(data.elements)||!Array.isArray(data.connectors)){
      return {valid:false,errors:['Flow must contain elements and connectors'],warnings};
    }
    const nodes=data.elements as unknown[],links=data.connectors as unknown[];
    if(nodes.length>250||links.length>500)errors.push('Flow graph exceeds allowed size');
    const ids=new Set<number>(),types=new Map<number,string>();
    for(const item of nodes){
      if(!item||typeof item!=='object'||Array.isArray(item)){errors.push('Invalid Flow element');continue;}
      const node=item as Record<string,unknown>;
      if(typeof node.id!=='number'||!Number.isSafeInteger(node.id)||ids.has(node.id)){
        errors.push('Flow element identifiers must be unique integers');continue;
      }
      ids.add(node.id);
      const type=String(node.type??'');
      types.set(node.id,type);
      if(!['Start','Assignment','Decision','Create Records','CreateRecord','HTTP Callout','End',
        ...(data.flowType==='Screen Flow'?['Screen']:[])].includes(type)){
        errors.push('Unsupported SQL Flow element: '+type);
      }
    }
    if([...types.values()].filter(x=>x==='Start').length!==1)errors.push('Flow must contain exactly one Start');
    if(![...types.values()].includes('End'))errors.push('Flow must contain an End');
    const outgoing=new Map<number,number[]>();
    for(const link of links){
      if(!link||typeof link!=='object'||Array.isArray(link)){errors.push('Invalid Flow connector');continue;}
      const edge=link as Record<string,unknown>;
      if(typeof edge.from!=='number'||typeof edge.to!=='number'||!ids.has(edge.from)||!ids.has(edge.to)){
        errors.push('Flow connector references an unknown element');continue;
      }
      if(edge.kind!==undefined&&!['normal','fault'].includes(String(edge.kind)))errors.push('Unsupported SQL Flow connector type');
      outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge.to]);
    }
    const start=[...types].find(([,type])=>type==='Start')?.[0];
    if(start!==undefined){
      const visited=new Set<number>(),stack=[start];
      while(stack.length){
        const id=stack.pop()!;
        if(visited.has(id))continue;
        visited.add(id);
        stack.push(...(outgoing.get(id)??[]));
      }
      if(![...visited].some(id=>types.get(id)==='End'))errors.push('No reachable End element');
      for(const id of ids)if(!visited.has(id))warnings.push('Disconnected Flow element: '+id);
    }
    return {valid:errors.length===0,errors,warnings};
  }
  /** Complete metadata Editor contract: one latest definition per API name. */
  async loadEditor(tenantId:string,apiName:string) {
    const {rows}=await this.db.query<{id:string;api_name:string;label:string|null;flow_type:string;version:number;active:boolean}>(`
      SELECT id,api_name,label,flow_type,version,active FROM md_flow_definitions
      WHERE tenant_id=$1 AND api_name=$2 AND archived=false ORDER BY version DESC LIMIT 1
    `,[tenantId,apiName]);
    const record=rows[0];
    if(!record)throw new Error('Flow not found');
    const [data,history]=await Promise.all([
      this.db.query<MetadataValueRow>(
        'SELECT property_path,value_kind,value_text FROM md_flow_editor_values WHERE tenant_id=$1 AND flow_id=$2',
        [tenantId,record.id]),
      this.db.query<{version:number;active:boolean}>(
        'SELECT version,active FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 AND archived=false ORDER BY version',
        [tenantId,apiName])
    ]);
    let document=decodeMetadataValues(data.rows).builder as Record<string,unknown>|undefined;
    if(!document){
      // Pre-Builder SQL definitions remain visible and editable, without fabricating stored actions.
      const [nodes,edges]=await Promise.all([
        this.db.query<{api_name:string;node_type:string}>(
          'SELECT api_name,node_type FROM md_flow_nodes WHERE tenant_id=$1 AND flow_id=$2 ORDER BY sort_order',
          [tenantId,record.id]),
        this.db.query<{source_api:string;target_api:string;outcome:string}>(
          'SELECT source_api,target_api,outcome FROM md_flow_edges WHERE tenant_id=$1 AND flow_id=$2',
          [tenantId,record.id])
      ]);
      const ids=new Map(nodes.rows.map((node,index)=>[node.api_name,index+1]));
      document={
        elements:nodes.rows.map((node,index)=>({id:index+1,type:node.node_type,label:node.node_type,config:{}})),
        connectors:edges.rows.filter(edge=>ids.has(edge.source_api)&&ids.has(edge.target_api))
          .map((edge,index)=>({id:'edge-'+index,from:ids.get(edge.source_api),to:ids.get(edge.target_api),
            kind:'normal',label:edge.outcome})),
        resources:[],startConfig:{},tests:[]
      };
    }
    return {...document,apiName:record.api_name,label:record.label??record.api_name,
      flowType:record.flow_type,versionNumber:record.version,status:record.active?'Active':'Draft',
      activeVersion:history.rows.find(item=>item.active)?.version??null,
      elements:Array.isArray(document.elements)?document.elements:[],
      connectors:Array.isArray(document.connectors)?document.connectors:[],
      resources:Array.isArray(document.resources)?document.resources:[],
      versions:history.rows.map(item=>({versionNumber:item.version,status:item.active?'Active':'Obsolete',
        savedAt:''}))};
  }
  async list(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string}>(`
      SELECT DISTINCT api_name FROM md_flow_definitions
      WHERE tenant_id=$1 AND archived=false ORDER BY api_name LIMIT 500
    `,[tenantId]);
    return Promise.all(rows.map(row=>this.loadEditor(tenantId,row.api_name)));
  }
  async listPage(tenantId:string,page:unknown=1,search:unknown='') {
    const index=Number(page);
    if(!Number.isSafeInteger(index)||index<1||index>100000||typeof search!=='string'||search.length>100)
      throw new Error('Invalid Flow list query');
    const query='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
    const {rows}=await this.db.query<{api_name:string;total:string}>(`
      SELECT names.api_name,(SELECT count(DISTINCT api_name)::text FROM md_flow_definitions
        WHERE tenant_id=$1 AND archived=false AND (api_name ILIKE $2 ESCAPE '\\'
          OR label ILIKE $2 ESCAPE '\\')) AS total
      FROM (SELECT DISTINCT api_name FROM md_flow_definitions
        WHERE tenant_id=$1 AND archived=false AND (api_name ILIKE $2 ESCAPE '\\'
          OR label ILIKE $2 ESCAPE '\\')
        ORDER BY api_name LIMIT 50 OFFSET $3) names
    `,[tenantId,query,(index-1)*50]);
    const flows=await Promise.all(rows.map(row=>this.loadEditor(tenantId,row.api_name)));
    // A page past the last result still needs the true count.
    const total=rows[0]?.total ?? (await this.db.query<{total:string}>(`
      SELECT count(DISTINCT api_name)::text AS total FROM md_flow_definitions
      WHERE tenant_id=$1 AND archived=false AND (api_name ILIKE $2 ESCAPE '\\'
        OR label ILIKE $2 ESCAPE '\\')`,[tenantId,query])).rows[0]?.total??'0';
    return {flows,total:Number(total),page:index,pageSize:50};
  }
  async saveEditor(tenantId:string,userId:string,apiName:string,raw:unknown) {
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','manage');
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!raw||typeof raw!=='object'||Array.isArray(raw))
      throw new Error('Invalid Flow metadata');
    const input=raw as Record<string,unknown>;
    if(input.apiName!==apiName||typeof input.label!=='string'||!input.label.trim()||input.label.length>200
      ||!['Screen Flow','Record-Triggered Flow','Autolaunched Flow','Flow Orchestration',
        'Schedule-Triggered Flow','Platform Event-Triggered Flow'].includes(String(input.flowType))
      ||!['Draft','Active'].includes(String(input.status))
      ||!Array.isArray(input.elements)||input.elements.length>250
      ||!Array.isArray(input.connectors)||input.connectors.length>500
      ||!Array.isArray(input.resources??[])||!Array.isArray(input.tests??[]))
      throw new Error('Invalid Flow metadata');
    const ids=new Set<number>();
    for(const item of input.elements as unknown[]) {
      if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid Flow element');
      const el=item as Record<string,unknown>;
      if(!Number.isSafeInteger(el.id)||ids.has(Number(el.id))||typeof el.type!=='string'||
        typeof el.label!=='string'||!el.config||typeof el.config!=='object'||Array.isArray(el.config))
        throw new Error('Invalid Flow element');
      ids.add(Number(el.id));
    }
    for(const item of input.connectors as unknown[]) {
      if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid Flow connector');
      const edge=item as Record<string,unknown>;
      if(!ids.has(Number(edge.from))||!ids.has(Number(edge.to)))throw new Error('Invalid Flow connector');
    }
    if(input.status==='Active'){
      const validation=await this.validateDraft(tenantId,userId,apiName,input);
      if(!validation.valid)throw new Error('Flow cannot activate: '+validation.errors.join('; '));
    }
    const scalarRows:Array<{path:string;kind:string;text:string|null}>=[];
    // Preserve the entire editable graph as relational path/value rows; never JSONB.
    encodeMetadataValue(input,'/builder',scalarRows);
    if(scalarRows.some(row=>row.path.length>1024))throw new Error('Invalid Flow metadata path');
    await this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        [tenantId+':flow:'+apiName]);
      const latest=await client.query<{id:string;version:number;active:boolean}>(`
        SELECT id,version,active FROM md_flow_definitions
        WHERE tenant_id=$1 AND api_name=$2 AND archived=false ORDER BY version DESC LIMIT 1 FOR UPDATE
      `,[tenantId,apiName]);
      const last=latest.rows[0];
      let id:string;
      if(last&&!last.active){
        id=last.id;
        await client.query(`UPDATE md_flow_definitions SET label=$3,flow_type=$4,active=$5
          WHERE tenant_id=$1 AND id=$2`,[tenantId,id,input.label,input.flowType,input.status==='Active']);
      }else{
        const inserted=await client.query<{id:string}>(`
          INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id
        `,[tenantId,apiName,input.label,input.flowType,(last?.version??0)+1,input.status==='Active']);
        id=inserted.rows[0].id;
      }
      if(input.status==='Active')await client.query(`
        UPDATE md_flow_definitions SET active=false
        WHERE tenant_id=$1 AND api_name=$2 AND id<>$3 AND active=true`,[tenantId,apiName,id]);
      await client.query('DELETE FROM md_flow_editor_values WHERE tenant_id=$1 AND flow_id=$2',[tenantId,id]);
      for(const row of scalarRows)await client.query(`
        INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
        VALUES($1,$2,$3,$4,$5)`,[tenantId,id,row.path,row.kind,row.text]);
      await client.query('DELETE FROM md_flow_edges WHERE tenant_id=$1 AND flow_id=$2',[tenantId,id]);
      await client.query('DELETE FROM md_flow_nodes WHERE tenant_id=$1 AND flow_id=$2',[tenantId,id]);
      // Screen Flows run their versioned, normalized editor graph directly. The
      // legacy scalar graph index is used only by the Autolaunched SQL executor.
      if(input.status==='Active' && input.flowType==='Autolaunched Flow'){
        const nodes=new Map<number,string>();
        for(const [position,el] of (input.elements as Array<Record<string,unknown>>).entries()){
          const name='step_'+String(el.id);
          nodes.set(Number(el.id),name);
          const node=await client.query<{id:string}>(`
            INSERT INTO md_flow_nodes(tenant_id,flow_id,api_name,node_type,sort_order)
            VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [tenantId,id,name,el.type,position]);
          for(const [key,value] of Object.entries(el.config as Record<string,unknown>)){
            if(!scalar(value))continue;
            const encoded=scalarText(value);
            await client.query(`
              INSERT INTO md_flow_node_properties(tenant_id,node_id,api_name,value_text,data_type)
              VALUES($1,$2,$3,$4,$5)`,[tenantId,node.rows[0].id,key,encoded.text,encoded.type]);
          }
        }
        for(const edge of input.connectors as Array<Record<string,unknown>>){
          const from=nodes.get(Number(edge.from))!,to=nodes.get(Number(edge.to))!;
          const outcome=String(edge.label??'default').toLowerCase();
          await client.query(`
            INSERT INTO md_flow_edges(tenant_id,flow_id,source_api,target_api,outcome)
            VALUES($1,$2,$3,$4,$5)`,[tenantId,id,from,to,
              outcome==='true'||outcome==='false'?outcome:'default']);
        }
      }
    });
    return this.loadEditor(tenantId,apiName);
  }
  async deleteEditor(tenantId:string,userId:string,apiName:string) {
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','manage');
    const {rowCount}=await this.db.query(`
      UPDATE md_flow_definitions SET archived=true,active=false
      WHERE tenant_id=$1 AND api_name=$2 AND archived=false`,[tenantId,apiName]);
    if(!rowCount)throw new Error('Flow not found');
  }
  /** Durable run telemetry from shared SQL Flow run records, tenant scoped. */
  async failedLogs(tenantId:string,userId:string) {
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','read');
    const {rows}=await this.db.query<{
      id:string;api_name:string;label:string|null;started_by:string;finished_at:Date|null;
      started_at:Date;error_code:string|null
    }>(`
      SELECT r.id,f.api_name,f.label,r.started_by,r.finished_at,r.started_at,r.error_code
      FROM md_flow_runs r JOIN md_flow_definitions f ON f.id=r.flow_id AND f.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.status='failed'
      ORDER BY r.started_at DESC LIMIT 100
    `,[tenantId]);
    return {logs:rows.map(r=>({
      id:r.id,flowApiName:r.api_name,flowLabel:r.label??r.api_name,
      trigger:'Manual' as const,failedAt:new Date(r.finished_at??r.started_at).toISOString(),
      error:r.error_code??'Execution failed',userId:r.started_by
    }))};
  }
  async pendingInterviews(tenantId:string,userId:string) {
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','read');
    const {rows}=await this.db.query<{
      id:string;api_name:string;label:string|null;version:number;flow_type:string;
      started_by:string;email:string;started_at:Date
    }>(`
      SELECT r.id,f.api_name,f.label,f.version,f.flow_type,r.started_by,u.email,r.started_at
      FROM md_flow_runs r JOIN md_flow_definitions f ON f.id=r.flow_id AND f.tenant_id=r.tenant_id
      JOIN md_users u ON u.id=r.started_by AND u.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.status='pending'
      ORDER BY r.started_at DESC LIMIT 100
    `,[tenantId]);
    return {interviews:rows.map(r=>({
      id:r.id,flowApiName:r.api_name,flowLabel:r.label??r.api_name,
      versionNumber:r.version,kind:r.flow_type==='Screen Flow'?'screen' as const:'wait' as const,
      userId:r.started_by,userName:r.email,screenLabel:null,recordId:null,
      createdAt:new Date(r.started_at).toISOString(),
      expiresAt:new Date(new Date(r.started_at).getTime()+86400000).toISOString(),
      waitUntil:null,retryAt:null,attempts:0
    }))};
  }
  /** Cancel a durable pending interview without deleting its execution history. */
  async cancelInterview(tenantId:string,userId:string,interviewId:string){
    if(!this.rbac)throw new Error('Flow permissions not configured');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(interviewId))
      throw new Error('Invalid interview ID');
    await this.rbac.require(tenantId,userId,'FlowDefinition','manage');
    const result=await this.db.query(
      "UPDATE md_flow_runs SET status='cancelled',finished_at=now(),error_code=NULL WHERE tenant_id=$1 AND id=$2 AND status='pending' RETURNING id",
      [tenantId,interviewId]);
    if(!result.rowCount)throw new Error('Pending interview not found');
    return {cancelled:true};
  }
  async deactivate(tenantId:string,userId:string,apiName:string) {
    if(!this.rbac)throw new Error('Flow permissions not configured');
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid Flow name');
    await this.rbac.require(tenantId,userId,'FlowDefinition','manage');
    const {rowCount}=await this.db.query(
      'UPDATE md_flow_definitions SET active=false WHERE tenant_id=$1 AND api_name=$2 AND active=true',
      [tenantId,apiName]);
    if(!rowCount)throw new Error('Active flow not found');
    return {flow:await this.loadEditor(tenantId,apiName)};
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
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'Flow:'+flowApi,'execute');
    const definition=await this.loadActive(tenantId,flowApi);
    const {rows}=await this.db.query<{flow_type:string;has_editor:boolean}>(`
      SELECT flow_type,EXISTS(SELECT 1 FROM md_flow_editor_values x
        WHERE x.tenant_id=f.tenant_id AND x.flow_id=f.id) AS has_editor
      FROM md_flow_definitions f WHERE f.tenant_id=$1 AND f.id=$2`,[tenantId,definition.id]);
    const id=await this.start(tenantId,flowApi,userId,inputs);
    // Authored Screen/Autolaunched Flows both use the one normalized action engine.
    // SQL-only definitions from before the Builder migration retain their legacy adapter.
    return rows[0]?.has_editor?this.advanceInterview(tenantId,userId,id,{})
      :this.run(tenantId,id,userId);
  }

  /** Resume a Screen Flow from durable SQL state. The caller must own the interview. */
  async advanceInterview(tenantId:string,userId:string,runId:string,
    request:{action?:unknown;outcome?:unknown;values?:unknown}) {
    if(!this.rbac||!this.records)throw new Error('Flow executor not configured');
    if(!/^[0-9a-f-]{36}$/i.test(runId)||!request||typeof request!=='object')
      throw new Error('Invalid Flow interview request');
    return this.db.transaction(async client=>{
      const {rows}=await client.query<{
        flow_id:string;api_name:string;flow_type:string;started_by:string;status:string
      }>(`SELECT r.flow_id,f.api_name,f.flow_type,r.started_by,r.status FROM md_flow_runs r
        JOIN md_flow_definitions f ON f.tenant_id=r.tenant_id AND f.id=r.flow_id
        WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r`,[tenantId,runId]);
      const active=rows[0];
      if(!active||active.status!=='pending'||active.started_by!==userId
        ||!['Screen Flow','Autolaunched Flow'].includes(active.flow_type))
        throw new Error('Pending Flow interview not found');
      await this.rbac!.require(tenantId,userId,'Flow:'+active.api_name,'execute');
      const doc=await client.query<MetadataValueRow>(
        'SELECT property_path,value_kind,value_text FROM md_flow_editor_values WHERE tenant_id=$1 AND flow_id=$2',
        [tenantId,active.flow_id]);
      const graph=decodeMetadataValues(doc.rows).builder as Record<string,unknown>|undefined;
      if(!graph||!Array.isArray(graph.elements)||!Array.isArray(graph.connectors))
        throw new Error('Missing published Screen Flow graph');
      const elements=graph.elements as Array<{id:number;type:string;label:string;config:Record<string,unknown>}>;
      const connectors=graph.connectors as Array<{from:number;to:number;label:string;kind:string}>;
      const byId=new Map(elements.map(element=>[element.id,element]));
      const start=elements.filter(element=>element.type==='Start');
      if(start.length!==1||byId.size!==elements.length)throw new Error('Invalid Screen Flow graph');
      const persisted=await client.query<{current_element:number;history_elements:number[];step_count:number}>(
        'SELECT current_element,history_elements,step_count FROM md_flow_interview_state WHERE tenant_id=$1 AND run_id=$2 FOR UPDATE',
        [tenantId,runId]);
      if(!persisted.rows[0])await client.query(
        'INSERT INTO md_flow_interview_state(tenant_id,run_id,current_element) VALUES($1,$2,$3)',
        [tenantId,runId,start[0].id]);
      const state=persisted.rows[0]??{current_element:start[0].id,history_elements:[],step_count:0};
      const prior=await client.query<{api_name:string;value_text:string|null;data_type:string}>(
        'SELECT api_name,value_text,data_type FROM md_flow_run_inputs WHERE tenant_id=$1 AND run_id=$2',
        [tenantId,runId]);
      const stored=await client.query<{api_name:string;value_text:string|null;data_type:string}>(
        'SELECT api_name,value_text,data_type FROM md_flow_interview_values WHERE tenant_id=$1 AND run_id=$2',
        [tenantId,runId]);
      const vars:Record<string,Scalar>=Object.create(null) as Record<string,Scalar>;
      for(const row of [...prior.rows,...stored.rows])
        vars[row.api_name]=scalarFrom(row.value_text,row.data_type);
      const evaluate=(value:unknown):Scalar=>{
        if(!scalar(value))throw new Error('Unsupported Flow expression value');
        if(typeof value!=='string')return value;
        const name=value.match(/^\{!([A-Za-z][A-Za-z0-9_]*)\}$/)?.[1]
          ??value.match(/^@([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
        if(!name)return value;
        if(!Object.hasOwn(vars,name))throw new Error('Unknown Flow resource');
        return vars[name];
      };
      const set=(key:unknown,value:Scalar)=>{
        if(typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(key))
          throw new Error('Invalid Flow variable name');
        vars[key]=value;
      };
      let current=state.current_element;
      let history=[...state.history_elements];
      let steps=state.step_count;
      if(request.action==='back'){
        if(!history.length)throw new Error('No previous Screen');
        current=history.pop()!;
        await client.query(`UPDATE md_flow_interview_state SET current_element=$3,history_elements=$4,
          updated_at=now() WHERE tenant_id=$1 AND run_id=$2`,[tenantId,runId,current,history]);
        const screen=byId.get(current);
        if(!screen||screen.type!=='Screen')throw new Error('Invalid Screen history');
        const fields=Array.isArray(screen.config.fields)?screen.config.fields as Array<Record<string,unknown>>:[];
        return {interviewId:runId,screen,outcomes:this.screenOutcomes(screen),
          canGoBack:history.length>0,
          values:Object.fromEntries(fields.filter(f=>typeof f.apiName==='string'&&Object.hasOwn(vars,f.apiName))
            .map(f=>[f.apiName,vars[String(f.apiName)]]))};
      }
      const visible=byId.get(current);
      const values=request.values??{};
      if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid Screen values');
      if(visible?.type==='Screen'&&persisted.rows[0]){
        const fields=Array.isArray(visible.config.fields)?visible.config.fields as Array<Record<string,unknown>>:[];
        const allowed=new Set(fields.map(field=>field.apiName).filter((key):key is string=>typeof key==='string'));
        for(const [key,value] of Object.entries(values)){
          if(!allowed.has(key)){
            // The UI may echo previously returned Flow resource values; never let
            // a Screen silently overwrite variables it does not own.
            if(Object.hasOwn(vars,key)&&vars[key]===value)continue;
            throw new Error('Invalid Screen field: '+key);
          }
          if(!scalar(value)||typeof value==='string'&&value.length>4096)
            throw new Error('Invalid Screen field: '+key);
          set(key,value);
        }
        for(const field of fields){
          const key=field.apiName;
          if(typeof key==='string'&&field.required===true
            &&(vars[key]===undefined||vars[key]===null||vars[key]===''))
            throw new Error('Required Screen field: '+key);
        }
        history.push(current);
        if(history.length>25)throw new Error('Screen history exceeded limit');
        const choices=this.screenOutcomes(visible);
        if(request.outcome!==undefined && !choices.some(choice=>
          choice.name===request.outcome||choice.label===request.outcome))
          throw new Error('Invalid Screen outcome');
        const option=choices.find(choice=>choice.name===request.outcome||choice.label===request.outcome);
        const next=connectors.find(edge=>edge.from===current&&edge.kind==='normal'
          &&(edge.label===option?.label||edge.label===option?.name
          ||(!option&&(!edge.label||edge.label==='Default'||edge.label==='Next'))));
        if(!next)throw new Error('Screen outcome is not connected');
        current=next.to;
      }
      for(;steps<200;steps++){
        const node=byId.get(current);
        if(!node)throw new Error('Invalid Flow graph target');
        let selected:string|undefined;
        if(node.type==='Screen'){
          // A Screen suspends execution without committing a business record.
          for(const [key,value] of Object.entries(vars)){
            const encoded=scalarText(value);
            await client.query(`INSERT INTO md_flow_interview_values(tenant_id,run_id,api_name,value_text,data_type)
              VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,run_id,api_name)
              DO UPDATE SET value_text=EXCLUDED.value_text,data_type=EXCLUDED.data_type`,
              [tenantId,runId,key,encoded.text,encoded.type==='text'?'string':encoded.type]);
          }
          await client.query(`UPDATE md_flow_interview_state SET current_element=$3,
            history_elements=$4,step_count=$5,updated_at=now() WHERE tenant_id=$1 AND run_id=$2`,
            [tenantId,runId,current,history,steps+1]);
          const fields=Array.isArray(node.config.fields)?node.config.fields as Array<Record<string,unknown>>:[];
          return {interviewId:runId,screen:node,outcomes:this.screenOutcomes(node),
            canGoBack:history.length>0,
            values:Object.fromEntries(fields.filter(f=>typeof f.apiName==='string'&&Object.hasOwn(vars,f.apiName))
              .map(f=>[f.apiName,vars[String(f.apiName)]]))};
        }
        if(node.type==='End'){
          await client.query("UPDATE md_flow_runs SET status='completed',finished_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,runId]);
          const resources=Array.isArray(graph.resources)?graph.resources as Array<{name:string;availableForOutput:boolean}>:[];
          const outputs:Record<string,Scalar>={};
          for(const resource of resources)
            if(resource.availableForOutput&&Object.hasOwn(vars,resource.name))outputs[resource.name]=vars[resource.name];
          return {id:runId,status:'completed' as const,completed:true,outputs};
        }
        if(node.type==='Assignment'){
          set(node.config.variable,evaluate(node.config.value??null));
        }else if(node.type==='Decision'){
          const outcomes=Array.isArray(node.config.outcomes)?node.config.outcomes as Array<Record<string,unknown>>:[];
          const matches=(o:Record<string,unknown>)=>{
            if(!Array.isArray(o.conditions)||!o.conditions.length)return false;
            const found=o.conditions.map(row=>{
              const c=row as Record<string,unknown>,actual=evaluate(c.field),expected=evaluate(c.value??null);
              if(c.operator==='Equals')return actual===expected;
              if(c.operator==='Not Equals')return actual!==expected;
              if(c.operator==='Greater Than')return typeof actual==='number'&&typeof expected==='number'&&actual>expected;
              if(c.operator==='Less Than')return typeof actual==='number'&&typeof expected==='number'&&actual<expected;
              throw new Error('Unsupported Decision operator');
            });
            if(o.conditionLogic==='Any')return found.some(Boolean);
            if(o.conditionLogic&&o.conditionLogic!=='All')throw new Error('Unsupported Decision condition logic');
            return found.every(Boolean);
          };
          const selectedOutcome=outcomes.find(o=>o.name!=='Default'&&matches(o));
          selected=String(selectedOutcome?.label??selectedOutcome?.name??'Default');
        }else if(node.type==='Create Records'||node.type==='CreateRecord'){
          if(!this.records)throw new Error('Flow record engine unavailable');
          if(node.config.recordSource==='collection')throw new Error('Collection create is not supported');
          const object=String(node.config.object??node.config.objectApi??'');
          if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(object))throw new Error('Invalid Flow Object');
          const fields:Record<string,unknown>={};
          for(const item of (Array.isArray(node.config.fieldValues)?node.config.fieldValues:[]) as Array<Record<string,unknown>>){
            const field=String(item.field??item.apiName??'');
            if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))throw new Error('Invalid Flow Field');
            fields[field]=evaluate(item.value??null);
          }
          const id=await this.records.createInTransaction(client,tenantId,userId,object,fields);
          if(typeof node.config.resultVariable==='string'&&node.config.resultVariable)
            set(node.config.resultVariable,id);
          history=[]; // Back must not replay side effects.
        }else if(node.type==='HTTP Callout'){
          if(!this.httpCallout)throw new Error('HTTP Callout transport is unavailable');
          const stableKey=runId+'-'+node.id;
          try {
            const response=await this.httpCallout(tenantId,userId,node.config,vars,stableKey);
            if(node.config.statusVariable)set(node.config.statusVariable,response.status);
            if(node.config.responseVariable)set(node.config.responseVariable,response.body);
          }catch(error){
            if(node.config.onError==='FAULT_PATH'){
              const fault=connectors.find(edge=>edge.from===current&&edge.kind==='fault');
              if(fault){current=fault.to;history=[];continue;}
            }
            if(node.config.onError!=='CONTINUE')throw error;
          }
          history=[];
        }else if(node.type!=='Start'){
          throw new Error('Unsupported Screen Flow action: '+node.type);
        }
        const available=connectors.filter(edge=>edge.from===current&&edge.kind==='normal');
        const next=selected
          ?available.find(edge=>edge.label===selected||edge.label==='Default')
          :available.find(edge=>!edge.label||edge.label==='Default'||edge.label==='Next')??(available.length===1?available[0]:undefined);
        if(!next)throw new Error('Flow element has no supported outgoing connector');
        current=next.to;
      }
      throw new Error('Screen Flow exceeded maximum steps');
    });
  }

  /** Server-side read-only debugger: never writes SQL, executes a callout or creates a record. */
  async debugGraph(tenantId:string,userId:string,apiName:string,inputs:unknown,
    recordTriggered=false){
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','read');
    await this.rbac.require(tenantId,userId,'Flow:'+apiName,'execute');
    if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))
      throw new Error('Invalid Flow debug inputs');
    if(Object.keys(inputs).length>100)throw new Error('Too many Flow debug inputs');
    const version=await this.loadActive(tenantId,apiName);
    const {rows}=await this.db.query<MetadataValueRow>(
      'SELECT property_path,value_kind,value_text FROM md_flow_editor_values WHERE tenant_id=$1 AND flow_id=$2',
      [tenantId,version.id]);
    let doc=decodeMetadataValues(rows).builder as Record<string,unknown>|undefined;
    if(!doc||!Array.isArray(doc.elements)||!Array.isArray(doc.connectors)){
      // Legacy SQL-only definitions share the same debugger, without a parallel executor.
      const [oldNodes,oldEdges]=await Promise.all([
        this.db.query<{api_name:string;node_type:string}>(`
          SELECT api_name,node_type FROM md_flow_nodes
          WHERE tenant_id=$1 AND flow_id=$2 ORDER BY sort_order,id`,[tenantId,version.id]),
        this.db.query<EdgeRow>(`
          SELECT source_api,target_api,outcome FROM md_flow_edges
          WHERE tenant_id=$1 AND flow_id=$2`,[tenantId,version.id])
      ]);
      const idOf=new Map(oldNodes.rows.map((node,index)=>[node.api_name,index+1]));
      doc={
        flowType:'Autolaunched Flow',
        elements:oldNodes.rows.map((node,index)=>({
          id:index+1,type:node.node_type,label:node.api_name,config:{}
        })),
        connectors:oldEdges.rows.filter(edge=>idOf.has(edge.source_api)&&idOf.has(edge.target_api))
          .map((edge,index)=>({
            id:'edge-'+index,from:idOf.get(edge.source_api),to:idOf.get(edge.target_api),
            label:edge.outcome,kind:'normal'
          }))
      };
    }
    if(recordTriggered && doc.flowType!=='Record-Triggered Flow')
      throw new Error('Record debug requires a Record-Triggered Flow');
    const nodes=doc.elements as Array<{id:number;type:string;label:string;config:Record<string,unknown>}>;
    const edges=doc.connectors as Array<{from:number;to:number;label:string;kind:string}>;
    const start=nodes.filter(n=>n.type==='Start');
    if(start.length!==1)throw new Error('Invalid Flow Start');
    const vars:Record<string,Scalar>=Object.create(null) as Record<string,Scalar>;
    for(const [name,value] of Object.entries(inputs)){
      if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||!scalar(value))throw new Error('Invalid debug input');
      vars[name]=value;
    }
    const resolve=(value:unknown):Scalar=>{
      if(!scalar(value))throw new Error('Unsupported debug expression');
      if(typeof value!=='string')return value;
      const reference=value.match(/^\{!([A-Za-z][A-Za-z0-9_]*)\}$/)?.[1]
        ??value.match(/^@([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if(!reference)return value;
      if(!Object.hasOwn(vars,reference))throw new Error('Unknown debug resource');
      return vars[reference];
    };
    const trace:Array<{elementApiName:string;type:string;status:string}>=[];
    let current=start[0].id;
    for(let step=0;step<200;step++){
      const node=nodes.find(n=>n.id===current);
      if(!node)throw new Error('Missing debug Flow element');
      trace.push({elementApiName:'step_'+node.id,type:node.type,
        status:['HTTP Callout','Create Records','CreateRecord','Update Records','Delete Records'].includes(node.type)
          ?'Simulated':'Completed'});
      if(node.type==='End')return {status:'completed',flowApiName:apiName,
        flowVersion:version.version,outputs:vars,debugTrace:trace,dryRun:true};
      if(node.type==='Screen')return {status:'waiting',flowApiName:apiName,
        flowVersion:version.version,screen:node,outputs:vars,debugTrace:trace,dryRun:true};
      let outcome:string|undefined;
      if(node.type==='Assignment'){
        const name=node.config.variable;
        if(typeof name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
          throw new Error('Invalid Assignment resource');
        vars[name]=resolve(node.config.value??null);
      }else if(node.type==='Decision'){
        const conditions=Array.isArray(node.config.outcomes)?node.config.outcomes as Array<Record<string,unknown>>:[];
        const match=(option:Record<string,unknown>)=>{
          if(!Array.isArray(option.conditions)||!option.conditions.length)return false;
          const decisions=option.conditions.map(condition=>{
            const rule=condition as Record<string,unknown>,a=resolve(rule.field),b=resolve(rule.value??null);
            if(rule.operator==='Equals')return a===b;
            if(rule.operator==='Not Equals')return a!==b;
            throw new Error('Unsupported Decision comparison');
          });
          return option.conditionLogic==='Any'?decisions.some(Boolean):decisions.every(Boolean);
        };
        const matched=conditions.find(option=>option.name!=='Default'&&match(option));
        outcome=String(matched?.label??matched?.name??'Default');
      }else if(node.type!=='Start'&&!['HTTP Callout','Create Records','CreateRecord'].includes(node.type)){
        throw new Error('Cannot safely debug unsupported Flow action: '+node.type);
      }
      const available=edges.filter(edge=>edge.from===current&&edge.kind==='normal');
      const next=outcome
        ?available.find(edge=>edge.label===outcome)??available.find(edge=>edge.label==='Default')
        :available.find(edge=>!edge.label||edge.label==='Default')??(available.length===1?available[0]:undefined);
      if(!next)throw new Error('Flow debug requires a connected branch');
      current=next.to;
    }
    throw new Error('Flow debug exceeded maximum steps');
  }

  private screenOutcomes(node:{config:Record<string,unknown>}) {
    const raw=Array.isArray(node.config.outcomes)?node.config.outcomes:[];
    const result=(raw as Array<Record<string,unknown>>).filter(item=>
      typeof item.name==='string'&&typeof item.label==='string')
      .map(item=>({name:item.name as string,label:item.label as string}));
    return result.length?result:[{name:'Default',label:'Next'}];
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
              const outputs:Record<string,Scalar>={};
              for(const [key,value] of props.get(node.id)??new Map<string,NodeProperty>()) {
                if(!key.startsWith('output.'))continue;
                const outputName=key.slice(7);
                if(!namePattern.test(outputName)||['__proto__','prototype','constructor'].includes(outputName))
                  throw new Error('Invalid Flow output');
                outputs[outputName]=resolve(value);
              }
              return {id:runId,status:'completed' as const,...(Object.keys(outputs).length?{outputs}:{})};
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
