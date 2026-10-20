import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {publicIp,safeUrl} from './oauth-authorization-service.js';
/** Same public-address validation as Named Credential OAuth, with DNS pinning and no redirects. */
export async function federationJson(raw:string,body?:URLSearchParams){
 const url=safeUrl(raw),addresses=await lookup(url.hostname,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>!publicIp(a.address)))throw Error('Invalid identity provider network');
 const selected=addresses[0],payload=body?.toString();
 return new Promise<Record<string,unknown>>((resolve,reject)=>{
  const req=request(url,{method:body?'POST':'GET',agent:false,timeout:10000,
   lookup:(_host,_options,cb)=>cb(null,selected.address,selected.family),headers:{Accept:'application/json',
    ...(payload?{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
   if(res.statusCode!==200){res.resume();reject(Error('Invalid identity provider response'));return;}
   let text='';res.on('data',(part:Buffer)=>{text+=part.toString('utf8');if(Buffer.byteLength(text)>262144)req.destroy(Error('Invalid identity response size'));});
   res.on('error',reject);res.on('end',()=>{try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();resolve(value);}catch{reject(Error('Invalid identity provider JSON'));}});
  });req.on('timeout',()=>req.destroy(Error('Identity provider timed out')));req.on('error',reject);req.end(payload);
 });
}
