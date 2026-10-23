import type {Express,Request,Response} from 'express';
import {Readable,Transform} from 'node:stream';

const maxBodyBytes=25*1024*1024;
const allowedPaths=[
 {path:/^\/\.well-known\/jmap\/?$/,method:'GET'},
 {path:/^\/jmap\/?$/,method:'POST'},
 {path:/^\/jmap\/upload\/[^/]{1,256}\/?$/,method:'POST'},
 {path:/^\/jmap\/download\/[^/]{1,256}\/[^/]{1,512}\/[^/]{1,256}\/?$/,method:'GET'}
] as const;

/**
 * Public-origin JMAP bridge for GitHub Pages. Only forwards mailbox Basic auth to
 * Stalwart; never uses the MetaDrive management API key. Register before body parsers
 * so MIME uploads can be streamed without buffering the request body in Express.
 */
export function registerStalwartJmapProxyRoutes(app:Express){
 const origins=(process.env.METADRIVE_MAIL_WEB_ORIGINS??'https://unesolutions.co.uk')
  .split(',').map(value=>value.trim()).filter(Boolean);
 app.use('/api/mail-jmap',async(req:Request,res:Response)=>{
  const origin=req.get('origin');
  if(origin){
   if(!origins.includes(origin)){
    res.status(403).json({error:'Mail webmail origin is not allowed'});return;
   }
   res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Vary','Origin');
  }
  res.setHeader('Cache-Control','private, no-store');
  if(req.method==='OPTIONS'){
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Accept');
   res.setHeader('Access-Control-Max-Age','600');
   res.status(204).end();return;
  }
  const targetPath=req.path;
  const route=allowedPaths.find(item=>item.path.test(targetPath));
  if(!route){res.status(404).json({error:'JMAP endpoint not found'});return;}
  if(req.method!==route.method){res.status(405).setHeader('Allow',route.method);res.json({error:'Method not allowed'});return;}
  const authorization=req.get('authorization')??'';
  if(!/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization)||authorization.length>8192){
   res.status(401).json({error:'Mailbox Basic authentication is required'});return;
  }
  const declaredLength=Number(req.get('content-length')??0);
  if(Number.isFinite(declaredLength)&&declaredLength>maxBodyBytes){
   res.status(413).json({error:'Mail upload exceeds the 25 MB proxy limit'});return;
  }
  let tooLarge=false;
  try{
   const configured=new URL(process.env.STALWART_BASE_URL??'http://127.0.0.1:8080');
   if(!['http:','https:'].includes(configured.protocol)
    ||(configured.protocol!=='https:'&&!['localhost','127.0.0.1','::1'].includes(configured.hostname))){
    res.status(503).json({error:'Stalwart must use HTTPS or a loopback HTTP listener'});return;
   }
   const base=configured.href.endsWith('/')?configured.href:configured.href+'/';
   const target=new URL(targetPath.replace(/^\/+/,''),base);
   const query=req.originalUrl.indexOf('?');
   if(query>=0)target.search=req.originalUrl.slice(query);
   const headers=new Headers({authorization,accept:req.get('accept')??'application/json'});
   const contentType=req.get('content-type');
   if(contentType)headers.set('content-type',contentType);
   const init:RequestInit&{duplex?:'half'}={method:req.method,headers,redirect:'error',signal:AbortSignal.timeout(60_000)};
   if(req.method==='POST'){
    const limiter=new Transform({transform(chunk:Buffer,_encoding,callback){
     if(tooLarge){callback(new Error('Mail upload too large'));return;}
     if((this as Transform & {totalBytes?:number}).totalBytes===undefined)(this as Transform & {totalBytes?:number}).totalBytes=0;
     const state=this as Transform & {totalBytes:number};
     state.totalBytes+=chunk.length;
     if(state.totalBytes>maxBodyBytes){tooLarge=true;callback(new Error('Mail upload too large'));return;}
     callback(null,chunk);
    }});
    init.body=Readable.toWeb(req.pipe(limiter)) as unknown as BodyInit;
    init.duplex='half';
   }
   const upstream=await fetch(target,init);
   res.status(upstream.status);
   for(const header of ['content-type','content-disposition','www-authenticate']){
    const value=upstream.headers.get(header);if(value)res.setHeader(header,value);
   }
   res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch(error){
   if(res.headersSent)return;
   if(tooLarge){res.status(413).json({error:'Mail upload exceeds the 25 MB proxy limit'});return;}
   // Do not return upstream bodies, internal URLs, or credentials in errors.
   res.status(502).json({error:'Mail server proxy request failed'});
  }
 });
}
