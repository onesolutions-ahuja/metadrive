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
  constructor(private readonly db:SqlPersistence,private readonly rbac?:RbacEngine,private readonly records?:RecordEngine) {}
  /** Builder drafts are checked against executable SQL Flow capabilities, never assumed executable. */
  async validateDraft(tenantId:string,userId:string,apiName:string,draft:unknown){
    if(!this.rbac)throw new Error('Flow permissions not configured');
    await this.rbac.require(tenantId,userId,'FlowDefinition','manage');
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid Flow name');
    if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('Invalid Flow draft');
    const data=draft as Record<string,unknown>;
    const errors:string[]=[],warnings:string[]=[];
    if(data.apiName!==apiName)errors.push('Flow API name must match the requested definition');
    if(data.flowType!=='Autolaunched Flow')errors.push('This SQL runtime can validate execution only for Autolaunched Flow');
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
      if(!['Start','Assignment','Decision','CreateRecord','End'].includes(type)){
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
      if(edge.kind!==undefined&&edge.kind!=='normal')errors.push('Unsupported SQL Flow connector type');
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
      // The lightweight SQL executor receives only validated, supported active graphs.
      if(input.status==='Active'){
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
    const rows=await this.list(tenantId);
    const flow=rows.find(item=>item.apiName===apiName);
    if(!flow)throw new Error('Flow not found');
    return {flow};
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
