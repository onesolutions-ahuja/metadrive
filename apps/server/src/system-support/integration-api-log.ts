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
