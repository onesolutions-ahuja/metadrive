import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

/** Tenant-scoped SQL registry for optional administrative definitions.
 * Stable identifiers, activation and revisions are relational; validated
 * definition properties are JSONB. No JSON-file runtime fallback.
 */
export const definitionKinds = {
  'platform-events':'platformEvents',
  'email-alerts':'emailAlerts',
  'approval-processes':'approvalProcesses',
  'dashboards':'dashboards',
  'dashboard-folders':'folders',
  'dashboard-territories':'territories',
  'report-folders':'folders',
  'reports':'reports',
  'connector-providers':'providers',
  'integration-connections':'connections'
} as const;
export type DefinitionKind=keyof typeof definitionKinds;
export class SystemDefinitionService {
  constructor(private readonly db:SqlPersistence, private readonly rbac:RbacEngine){}
  async list(tenantId:string,userId:string,kind:DefinitionKind) {
    await this.rbac.require(tenantId,userId,'SystemDefinition:'+kind,'read');
    const {rows}=await this.db.query<{api_name:string;label:string;properties:unknown;revision:number;enabled:boolean}>(`
      SELECT api_name,label,properties,revision,enabled
      FROM md_system_definitions
      WHERE tenant_id=$1 AND kind=$2 AND enabled=true
      ORDER BY label,api_name`,[tenantId,kind]);
    const statuses=kind==='integration-connections'
      ?await this.db.query<{connection_api:string;status:string;message:string;tested_at:Date}>(
        'SELECT connection_api,status,message,tested_at FROM md_integration_connection_tests WHERE tenant_id=$1',
        [tenantId]):{rows:[]};
    const byName=new Map(statuses.rows.map(row=>[row.connection_api,row]));
    return rows.map(row=>{
      const status=byName.get(row.api_name);
      return {
        ...(row.properties && typeof row.properties==='object' && !Array.isArray(row.properties) ? row.properties : {}),
        apiName:row.api_name,id:row.api_name,name:row.api_name,label:row.label,revision:row.revision,enabled:row.enabled,
        ...(status?{testStatus:status.status,lastTestMessage:status.message,lastTestedAt:status.tested_at}:{}),
      };
    });
  }
  async save(tenantId:string,userId:string,kind:DefinitionKind,value:unknown) {
    await this.rbac.require(tenantId,userId,'SystemDefinition:'+kind,'manage');
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid definition');
    const body=value as Record<string,unknown>;
    const apiName=typeof body.apiName==='string'?body.apiName:body.name;
    if(typeof apiName!=='string'||! /^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)
      ||typeof body.label!=='string'||!body.label.trim())throw new Error('Invalid definition');
    const {apiName:_apiName,name:_name,id:_id,label,revision,enabled,...properties}=body;
    // Optional metadata must not become an unencrypted credential store.
    const hasSecret=(value:unknown):boolean=>{
      if(Array.isArray(value))return value.some(hasSecret);
      if(value && typeof value==='object')return Object.entries(value).some(([key,v])=>
        /(?:secret|password|access.?token|refresh.?token|private.?key|api.?key)/i.test(key)||hasSecret(v));
      return false;
    };
    if(hasSecret(properties))throw new Error('Credential secrets require the encrypted credential service');
    if(JSON.stringify(properties).length>65536)throw new Error('Invalid definition size');
    const expected=revision===undefined?0:revision;
    if(!Number.isSafeInteger(expected)||Number(expected)<0)throw new Error('Invalid definition revision');
    // Update an existing revision, or create a new definition only at revision zero.
    // Avoid INSERT ... WHERE expected=0 in an UPSERT: that prevents updates entirely.
    const sql=Number(expected)===0
      ? `INSERT INTO md_system_definitions(tenant_id,kind,api_name,label,properties,enabled,revision)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,1)
           ON CONFLICT(tenant_id,kind,api_name) DO NOTHING RETURNING revision`
      : `UPDATE md_system_definitions
           SET label=$4,properties=$5::jsonb,enabled=$6,revision=revision+1,updated_at=now()
           WHERE tenant_id=$1 AND kind=$2 AND api_name=$3 AND revision=$7
           RETURNING revision`;
    const params:(string|boolean|number)[]=[tenantId,kind,apiName,label,JSON.stringify(properties),enabled!==false];
    if(Number(expected)!==0)params.push(Number(expected));
    const {rows}=await this.db.query<{revision:number}>(sql,params);
    if(!rows.length)throw new Error('Definition revision conflict');
    return {...properties,apiName,id:apiName,name:apiName,label,revision:rows[0].revision,enabled:enabled!==false};
  }
 /** Execute a real HTTPS credential test; failures remain visible and tenant-scoped. */
 async testConnection(tenantId:string,userId:string,apiName:string,
  run:(credentialId:string,path:string)=>Promise<{status:number}>) {
  await this.rbac.require(tenantId,userId,'SystemDefinition:integration-connections','manage');
  await this.rbac.require(tenantId,userId,'HTTPCallout','execute');
  await this.rbac.require(tenantId,userId,'NamedCredential','read');
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid connection');
  const {rows}=await this.db.query<{api_name:string;label:string;properties:unknown}>(`
    SELECT api_name,label,properties FROM md_system_definitions
    WHERE tenant_id=$1 AND kind='integration-connections' AND api_name=$2 AND enabled=true`,
    [tenantId,apiName]);
  const found=rows[0];
  if(!found)throw new Error('Connection not found');
  const props=(found.properties&&typeof found.properties==='object'&&!Array.isArray(found.properties)
   ?found.properties:{}) as Record<string,unknown>;
  const config=(props.configuration&&typeof props.configuration==='object'&&!Array.isArray(props.configuration)
   ?props.configuration:{}) as Record<string,unknown>;
  const credentialId=config.namedCredentialId;
  const path=config.testPath;
  let status:'Connected'|'Failed'|'Not configured'='Not configured',message='No saved Named Credential configured';
  if(typeof credentialId==='string'&&/^[0-9a-f-]{36}$/i.test(credentialId)){
   if(path!==undefined&&(typeof path!=='string'||path.length>1024))
    throw new Error('Invalid connection test path');
   try{
    const result=await run(credentialId,typeof path==='string'?path:'');
    status='Connected';message='HTTPS connection succeeded ('+result.status+')';
   }catch{status='Failed';message='HTTPS connection test failed';}
  }
  const {rows:saved}=await this.db.query<{tested_at:Date}>(`
    INSERT INTO md_integration_connection_tests
      (tenant_id,connection_api,status,message,tested_by)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(tenant_id,connection_api)
    DO UPDATE SET status=$3,message=$4,tested_by=$5,tested_at=now()
    RETURNING tested_at`,
    [tenantId,apiName,status,message,userId]);
  return {...props,id:apiName,apiName,name:apiName,label:found.label,
    testStatus:status,lastTestMessage:message,lastTestedAt:saved[0]?.tested_at??new Date()};
 }

 async remove(tenantId:string,userId:string,kind:DefinitionKind,apiName:string){
  await this.rbac.require(tenantId,userId,'SystemDefinition:'+kind,'manage');
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName))throw new Error('Invalid definition');
  // Soft deletion preserves versioned customer metadata and relationships.
  const {rowCount}=await this.db.query(
   'UPDATE md_system_definitions SET enabled=false,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND kind=$2 AND api_name=$3 AND enabled=true',
   [tenantId,kind,apiName]);
  if(!rowCount)throw new Error('Definition not found');
 }

}
