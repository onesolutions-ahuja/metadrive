import {createHash,randomBytes} from 'node:crypto';
import https from 'node:https';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {encryptCredential,decryptCredential} from './credential-crypto.js';
import {approvedCredentialEndpoint} from './credential-connection-test.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=(value:string)=>createHash('sha256').update(value).digest('hex');
const digest=(value:string)=>createHash('sha256').update(value).digest('base64url');
type Credential={id:string;tenant_id:string;enabled:boolean;protocol:string;auth_type:string;
 secret_ciphertext:Buffer|null;secret_key_id:string;
 configuration_ciphertext:Buffer|null;configuration_key_id:string};
const settings=(c:Credential)=>{
 if(!c.configuration_ciphertext)throw Error('OAuth client configuration missing');
 const parsed=JSON.parse(decryptCredential(c.configuration_ciphertext,c.configuration_key_id)) as Record<string,unknown>;
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid OAuth settings');
 for(const k of ['authorizationUrl','tokenUrl','clientId']){
  if(typeof parsed[k]!=='string'||!(parsed[k] as string).trim()||(parsed[k] as string).length>2048)
   throw Error('Missing OAuth '+k);
 }
 return parsed;
};
const callbackUrl=()=>{
 const raw=process.env.METADRIVE_PUBLIC_BASE_URL;
 if(!raw)throw Error('Public platform URL is not configured');
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')
  throw Error('Invalid public platform URL');
 return new URL('/api/oauth/callback',url).toString();
};
/** Register before the bearer authentication middleware: external OAuth callbacks have only PKCE state. */
export function registerOAuthCallback(app:Express,db:SqlPersistence){
 app.get('/api/oauth/callback',wrap(async(req,res)=>{
  const state=req.query.state,code=req.query.code,externalError=req.query.error;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if(typeof state!=='string'||state.length<20||state.length>256)
   throw Error('Invalid OAuth state');
  // Consume the state exactly once even if the external provider returns an error.
  const used=await db.query<{
   tenant_id:string;credential_id:string;requested_by:string;verifier_ciphertext:Buffer;
   verifier_key_id:string;redirect_uri:string;token_url:string
  }>(`UPDATE md_credential_oauth_states SET consumed_at=now()
   WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now()
   RETURNING tenant_id,credential_id,requested_by,verifier_ciphertext,verifier_key_id,redirect_uri,token_url`,
   [hex(state)]);
  const challenge=used.rows[0];if(!challenge)throw Error('OAuth authorization expired or already used');
  if(externalError!==undefined)throw Error('OAuth provider declined authorization');
  if(typeof code!=='string'||!code||code.length>4096)throw Error('Invalid OAuth authorization code');
  if(challenge.redirect_uri!==callbackUrl())throw Error('OAuth redirect URL changed');
  const {rows}=await db.query<Credential>(`SELECT id,tenant_id,enabled,protocol,auth_type,
    secret_ciphertext,secret_key_id,configuration_ciphertext,configuration_key_id
    FROM md_named_credentials WHERE tenant_id=$1 AND id=$2`,
    [challenge.tenant_id,challenge.credential_id]);
  const credential=rows[0];
  if(!credential||!credential.enabled||credential.protocol!=='HTTPS'||
     credential.auth_type!=='OAuth Authorization Code')
   throw Error('OAuth Named Credential unavailable');
  const config=settings(credential);
  if(challenge.token_url!==config.tokenUrl)throw Error('OAuth token endpoint changed');
  const clientId=config.clientId as string;
  const verifier=decryptCredential(challenge.verifier_ciphertext,challenge.verifier_key_id);
  const payload=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:challenge.redirect_uri,
   client_id:clientId,code_verifier:verifier});
  const clientSecret=credential.secret_ciphertext?
   decryptCredential(credential.secret_ciphertext,credential.secret_key_id):null;
  if(clientSecret)payload.set('client_secret',clientSecret);
  const ep=await approvedCredentialEndpoint(challenge.token_url,'HTTPS');
  if(ep.url.search||ep.url.hash)throw Error('Invalid OAuth token URL');
  const data=payload.toString();
  const token=await new Promise<Record<string,unknown>>((resolve,reject)=>{
   const out=https.request({hostname:ep.address,port:ep.port,servername:ep.hostname,
    method:'POST',path:ep.url.pathname,
    headers:{Host:ep.url.host,'Content-Type':'application/x-www-form-urlencoded',
      'Content-Length':Buffer.byteLength(data),Accept:'application/json'},
    rejectUnauthorized:true},response=>{
     const chunks:Buffer[]=[];let length=0;
     response.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>65536){
       out.destroy(Error('OAuth token response too large'));return;}chunks.push(chunk);});
     response.on('end',()=>{
      if((response.statusCode??0)<200||(response.statusCode??0)>=300){
       reject(Error('OAuth token exchange rejected'));return;
      }
      try{
       const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;
       if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();
       resolve(parsed);
      }catch{reject(Error('Invalid OAuth token response'));}
     });
   });
   out.on('error',reject);out.setTimeout(10000,()=>out.destroy(Error('OAuth timeout')));
   out.end(data);
  });
  if(typeof token.access_token!=='string'||token.access_token.length<8||token.access_token.length>16000)
   throw Error('OAuth provider did not return an access token');
  if(token.refresh_token!==undefined&&(typeof token.refresh_token!=='string'||token.refresh_token.length>16000))
   throw Error('Invalid OAuth refresh token');
  const lifetime=typeof token.expires_in==='number'&&Number.isFinite(token.expires_in)
   &&token.expires_in>0&&token.expires_in<=31536000?token.expires_in:null;
  const ciphertext=encryptCredential(JSON.stringify({
   accessToken:token.access_token,refreshToken:token.refresh_token??null,
   tokenType:typeof token.token_type==='string'?token.token_type:'Bearer',
   scope:typeof token.scope==='string'?token.scope:''
  }));
  await db.transaction(async client=>{
   await client.query(`INSERT INTO md_credential_oauth_tokens(tenant_id,credential_id,token_ciphertext,token_key_id,expires_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,credential_id)
    DO UPDATE SET token_ciphertext=EXCLUDED.token_ciphertext,token_key_id=EXCLUDED.token_key_id,
      expires_at=EXCLUDED.expires_at,updated_at=now()`,
    [challenge.tenant_id,challenge.credential_id,ciphertext.ciphertext,ciphertext.keyId,
     lifetime===null?null:new Date(Date.now()+lifetime*1000)]);
   await client.query(`INSERT INTO md_tenant_security_events(tenant_id,actor_id,event_type)
     VALUES($1,$2,'named_credential_oauth_authorized')`,
    [challenge.tenant_id,challenge.requested_by]);
  });
  res.status(200).type('text/plain').send('MetaDrive OAuth authorization completed. Return to your application.');
 }));
}
/** Register behind bearer authentication, with OneEngine RBAC and tenant checks. */
export function registerOAuthStart(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.post('/api/named-credentials/:id/oauth/start',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  await rbac.require(a.tenant_id,a.user_id,'NamedCredential','manage');
  if(!uuid.test(id))throw Error('Invalid credential ID');
  const {rows}=await db.query<Credential>(`SELECT id,tenant_id,enabled,protocol,auth_type,
    secret_ciphertext,secret_key_id,configuration_ciphertext,configuration_key_id
    FROM md_named_credentials WHERE tenant_id=$1 AND id=$2`,[a.tenant_id,id]);
  const credential=rows[0];
  if(!credential||!credential.enabled||credential.protocol!=='HTTPS'
   ||credential.auth_type!=='OAuth Authorization Code')
   throw Error('OAuth Authorization Code Named Credential is required');
  const config=settings(credential);
  const callback=callbackUrl();
  if(config.redirectUri!==undefined&&config.redirectUri!==callback)throw Error('OAuth redirect URI does not match platform URL');
  const authEndpoint=await approvedCredentialEndpoint(config.authorizationUrl as string,'HTTPS');
  const tokenEndpoint=await approvedCredentialEndpoint(config.tokenUrl as string,'HTTPS');
  if(authEndpoint.url.hash||tokenEndpoint.url.hash||tokenEndpoint.url.search)
   throw Error('Invalid OAuth endpoint');
  const verifier=randomBytes(32).toString('base64url');
  const state=randomBytes(32).toString('base64url');
  const protectedVerifier=encryptCredential(verifier);
  await db.query(`INSERT INTO md_credential_oauth_states
   (state_hash,tenant_id,credential_id,requested_by,verifier_ciphertext,verifier_key_id,
    redirect_uri,token_url,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes')`,
   [hex(state),a.tenant_id,id,a.user_id,protectedVerifier.ciphertext,
    protectedVerifier.keyId,callback,tokenEndpoint.url.toString()]);
  const authorize=new URL(authEndpoint.url);
  authorize.searchParams.set('response_type','code');
  authorize.searchParams.set('client_id',config.clientId as string);
  authorize.searchParams.set('redirect_uri',callback);
  authorize.searchParams.set('state',state);
  authorize.searchParams.set('code_challenge',digest(verifier));
  authorize.searchParams.set('code_challenge_method','S256');
  if(typeof config.scope==='string'&&config.scope.length<=2048)
   authorize.searchParams.set('scope',config.scope);
  res.setHeader('Cache-Control','no-store');
  res.json({authorizationUrl:authorize.toString()});
 }));
}
