import type {Express,NextFunction,Request,Response} from 'express';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

export type IntegrationApiLogInput={
 tenantId:string;
 direction:'Inbound'|'Outbound';
 transport?:'HTTP'|'Webhook';
 provider?:string;
 credentialId?:string|null;
 actorUserId?:string|null;
 endpoint:string;
 method:string;
 statusCode?:number|null;
 outcome:'success'|'http_error'|'network_error'|'rejected';
 durationMs?:number;
 requestBytes?:number;
 responseBytes?:number;
 errorCode?:string|null;
};

/** Store integration request metadata only. Never persist payloads, headers, tokens or query strings. */
export async function writeIntegrationApiLog(db:SqlPersistence,input:IntegrationApiLogInput):Promise<void>{
 const method=/^(GET|POST|PUT|PATCH|DELETE)$/.test(input.method.toUpperCase())
  ?input.method.toUpperCase():'OTHER';
 const endpoint=input.endpoint.split('?')[0].slice(0,2048);
 const provider=(input.provider||'Unknown').replace(/[\r\n\0]/g,' ').slice(0,120);
 const errorCode=input.errorCode&&/^[A-Z0-9_:-]{1,100}$/i.test(input.errorCode)
  ?input.errorCode:null;
 try{
  await db.query(`INSERT INTO md_integration_api_logs
   (tenant_id,direction,transport,provider,credential_id,actor_user_id,endpoint,method,
    status_code,outcome,duration_ms,request_bytes,response_bytes,error_code)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
   [input.tenantId,input.direction,input.transport??'HTTP',provider,
    input.credentialId??null,input.actorUserId??null,endpoint,method,
    input.statusCode??null,input.outcome,Math.max(0,Math.floor(input.durationMs??0)),
    Math.max(0,Math.floor(input.requestBytes??0)),Math.max(0,Math.floor(input.responseBytes??0)),
    errorCode]);
 }catch(error){
  // Audit storage must not leak request details or replace the provider's real result.
  console.error('Integration API audit write failed',JSON.stringify({
   direction:input.direction,transport:input.transport??'HTTP',
   error:error instanceof Error?error.name:'UnknownError'
  }));
 }
}

type LogActor={tenant_id:string;user_id:string};
type LogRequest=Request&{actor?:LogActor};

/** Tenant-scoped, RBAC-protected metadata view; never returns request or response bodies. */
export function registerIntegrationApiLogRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.get('/api/metadata/integration-api-logs',(req:Request,res:Response,next:NextFunction)=>{
  void (async()=>{
   const actor=(req as LogRequest).actor;
   if(!actor)throw new Error('Authenticated tenant required');
   await rbac.require(actor.tenant_id,actor.user_id,'NamedCredential','read');
   const rawLimit=req.query.limit;
   const limit=rawLimit===undefined?100:Number(rawLimit);
   if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error('Invalid integration log limit');
   const rawDirection=req.query.direction;
   const direction=rawDirection===undefined?null:
    rawDirection==='Inbound'||rawDirection==='Outbound'?rawDirection:null;
   if(rawDirection!==undefined&&direction===null)throw new Error('Invalid integration log direction');
   const {rows}=await db.query<{
    id:string;direction:string;transport:string;provider:string;credential_id:string|null;
    endpoint:string;method:string;status_code:number|null;outcome:string;duration_ms:number;
    request_bytes:number;response_bytes:number;error_code:string|null;created_at:Date
   }>(`SELECT id::text,direction,transport,provider,credential_id::text,endpoint,method,
      status_code,outcome,duration_ms,request_bytes,response_bytes,error_code,created_at
     FROM md_integration_api_logs WHERE tenant_id=$1 AND ($2::text IS NULL OR direction=$2)
     ORDER BY created_at DESC,id DESC LIMIT $3`,[actor.tenant_id,direction,limit]);
   res.setHeader('Cache-Control','no-store');
   res.json({logs:rows.map(row=>({
    id:row.id,direction:row.direction,transport:row.transport,provider:row.provider,
    credentialId:row.credential_id,endpoint:row.endpoint,method:row.method,
    statusCode:row.status_code,outcome:row.outcome,durationMs:row.duration_ms,
    requestBytes:row.request_bytes,responseBytes:row.response_bytes,
    errorCode:row.error_code,createdAt:row.created_at
   }))});
  })().catch(next);
 });
}
