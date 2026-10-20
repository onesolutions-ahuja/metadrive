import {resolve} from 'node:path';
import {isIP} from 'node:net';
import express,{type Express} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {browserSecurityHeaders,readSessionPolicy} from './session-policy-service.js';
export function configureTrustedProxy(app:Express,raw:string|undefined){
 if(!raw)return;
 const networks=raw.split(',').map(v=>v.trim());
 if(networks.some(n=>{const [ip,prefix,...extra]=n.split('/');const family=isIP(ip);
  return !family||extra.length>0||(prefix!==undefined&&(!/^\d{1,3}$/.test(prefix)||Number(prefix)>(family===4?32:128)));}))
  throw Error('Invalid trusted proxy IP/CIDR configuration');
 app.set('trust proxy',networks);
}
/** Optional same-origin production host applies tenant SQL security headers to HTML, not just API JSON. */
export function registerSecurityWebHost(app:Express,db:SqlPersistence,folder:string|undefined){
 if(!folder)return;
 const root=resolve(folder);
 app.use(async(req,res,next)=>{
  if(req.method!=='GET'||req.path.startsWith('/api/')||req.path.startsWith('/services/')){next();return;}
  try{
   const domain=await db.query<{tenant_id:string}>('SELECT tenant_id FROM md_tenant_domains WHERE domain=$1',[req.hostname.toLowerCase()]);
   if(!domain.rows[0]){res.status(404).end();return;}
   res.set(browserSecurityHeaders(await readSessionPolicy(db,domain.rows[0].tenant_id)));
   next();
  }catch(error){next(error);}
 });
 app.use(express.static(root,{index:false,redirect:false}));
 app.get('*',(req,res,next)=>{
  if(req.path.startsWith('/api/')||req.path.startsWith('/services/')){next();return;}
  res.setHeader('Cache-Control','no-store');res.sendFile(resolve(root,'index.html'));
 });
}
