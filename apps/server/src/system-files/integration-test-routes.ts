import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {NamedCredentialService} from './named-credential-service.js';
import {testHttpsCredential} from './credential-connection-test.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const safe=/^[A-Za-z0-9_-]{1,80}$/;
type Row={api_name:string;label:string;properties:Record<string,unknown>;revision:number};
export function registerIntegrationTestRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,credentials:NamedCredentialService){
 app.post('/api/integration-connections/:id/test',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  if(!safe.test(id))throw Error('Invalid Connection name');
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:integration-connections','manage');
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:connector-providers','read');
  const {rows}=await db.query<Row>(`SELECT api_name,label,properties,revision FROM md_system_definitions
   WHERE tenant_id=$1 AND kind='integration-connections' AND enabled=true
    AND (api_name=$2 OR properties->>'id'=$2)`,[a.tenant_id,id]);
  if(rows.length!==1)throw Error('Integration Connection not found or ambiguous');
  const row=rows[0],p=row.properties??{},connector=p.connectorKey;
  if(p.status!=='ACTIVE'||typeof connector!=='string'||!safe.test(connector))
   throw Error('Integration Connection not active or incomplete');
  const providerResult=await db.query<Row>(`SELECT api_name,label,properties,revision FROM md_system_definitions
   WHERE tenant_id=$1 AND kind='connector-providers' AND enabled=true AND api_name=$2`,
   [a.tenant_id,connector]);
  const provider=providerResult.rows[0]?.properties;
  if(!provider||provider.status!=='ACTIVE')throw Error('Connector Provider not active');
  let status:'Connected'|'Failed'|'Not configured'|'Test unavailable'='Test unavailable';
  let message='Provider has no safe test configuration';
  const config=p.configuration;
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid Connection configuration');
  const settings=config as Record<string,unknown>;
  const credentialId=settings.namedCredentialId??settings.credentialId;
  if(typeof credentialId==='string'&&/^[0-9a-f-]{36}$/i.test(credentialId)){
   const tested=await credentials.test(a.tenant_id,a.user_id,credentialId);
   status=tested.connected?'Connected':'Failed';
   message=tested.message;
  }else if(provider.authType==='NONE'&&typeof provider.baseUrl==='string'){
   const raw=provider.baseUrl as string, test=provider.test;
   if(test&&typeof test==='object'&&!Array.isArray(test)){
    const spec=test as {method?:string;path?:string;expectedStatus?:number};
    if(spec.method!=='GET'||typeof spec.path!=='string'||!spec.path.startsWith('/')||spec.path.startsWith('//')||
      spec.path.includes('\\')||spec.path.includes('#')||spec.path.length>1000||
      !Number.isInteger(spec.expectedStatus)||Number(spec.expectedStatus)<100||Number(spec.expectedStatus)>599)
      throw Error('Unsupported or unsafe Connector test metadata');
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.search||url.hash||url.username||url.password)throw Error('Invalid Provider URL');
    url.pathname=spec.path;
    try{
     const tested=await testHttpsCredential(url.toString(),'None',null,'');
     status=tested.status===spec.expectedStatus?'Connected':'Failed';
     message=status==='Connected'?'Provider HTTP health check passed':'Provider returned unexpected status';
    }catch(error){
     status='Failed';
     message=error instanceof Error&&/^(?:Unsafe credential endpoint|Credential host must be approved|Credential DNS resolves)/.test(error.message)?
       error.message:'Provider connection test failed';
    }
   }
  }else{
   status='Not configured';message='Named Credential required before testing Provider';
  }
  const time=new Date().toISOString();
  const updated={...p,testStatus:status,lastTestedAt:time,lastTestMessage:message};
  const result=await db.query(`UPDATE md_system_definitions SET properties=$4::jsonb,revision=revision+1,
    updated_at=now() WHERE tenant_id=$1 AND kind='integration-connections' AND api_name=$2 AND revision=$3
    RETURNING api_name`,[a.tenant_id,row.api_name,row.revision,JSON.stringify(updated)]);
  if(!result.rowCount)throw Error('Connection changed while testing');
  res.json({connection:{...updated,id:p.id??row.api_name,connectorKey:connector,name:p.name??row.label}});
 }));
}
