import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {publicIp,safeUrl} from './oauth-authorization-service.js';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {writeIntegrationActivity,type IntegrationActivityWriter} from './integration-api-log.js';
type ActivityContext={db:SqlPersistence;writer?:IntegrationActivityWriter;tenantId:string;
 providerId:string;provider:string};
/** Same public-address validation as Named Credential OAuth, with DNS pinning and no redirects. */
export async function federationJson(raw:string,body?:URLSearchParams,activity?:ActivityContext){
 const url=safeUrl(raw),addresses=await lookup(url.hostname,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>!publicIp(a.address)))throw Error('Invalid identity provider network');
 const selected=addresses[0],payload=body?.toString();
 const startedAt=Date.now(),requestBytes=Buffer.byteLength(payload??'');
 let statusCode:number|undefined,responseBytes=0;
 const log=(outcome:'success'|'http_error'|'network_error',errorCode?:string)=>
  activity?writeIntegrationActivity(activity.db,{
   tenantId:activity.tenantId,direction:'Outbound',transport:'HTTP',
   provider:activity.provider,credentialId:activity.providerId,
   endpoint:url.origin+url.pathname,method:body?'POST':'GET',statusCode,outcome,
   durationMs:Date.now()-startedAt,requestBytes,responseBytes,errorCode,
   communication:{name:'Identity provider API',provider:activity.provider,
    relatedObject:'IdentityProvider',relatedRecordId:activity.providerId}
  },activity.writer):Promise.resolve();
 let text:string;
 try{
  text=await new Promise<string>((resolve,reject)=>{
  const req=request(url,{method:body?'POST':'GET',agent:false,timeout:10000,
   lookup:(_host,_options,cb)=>cb(null,selected.address,selected.family),headers:{Accept:'application/json',
    ...(payload?{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
   statusCode=res.statusCode;
   if(res.statusCode!==200){res.resume();reject(Error('Invalid identity provider response'));return;}
   let text='';res.on('data',(part:Buffer)=>{text+=part.toString('utf8');if(Buffer.byteLength(text)>262144)req.destroy(Error('Invalid identity response size'));});
   res.on('data',(part:Buffer)=>{responseBytes+=part.length;});
   res.on('error',reject);res.on('end',()=>resolve(text));
  });req.on('timeout',()=>req.destroy(Error('Identity provider timed out')));req.on('error',reject);req.end(payload);
  });
 }catch(error){
  await log(statusCode!==undefined&&statusCode!==200?'http_error':'network_error',
   statusCode!==undefined&&statusCode!==200?'HTTP_STATUS_'+statusCode:
    error instanceof Error?error.name:'NETWORK_ERROR');
  throw error;
 }
 await log('success');
 try{
  const parsed:unknown=JSON.parse(text);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();
  return parsed as Record<string,unknown>;
 }catch{throw Error('Invalid identity provider JSON');}
}
