import {createHash,randomBytes} from 'node:crypto';
import https from 'node:https';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {approvedCredentialEndpoint} from './credential-connection-test.js';
import {encryptCredential,decryptCredential} from './credential-crypto.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void f(req as Req,res).catch(next);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statePattern=/^[A-Za-z0-9_-]{32,100}$/;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
type Credential={
 id:string;enabled:boolean;protocol:string;auth_type:string;
 configuration_ciphertext:Buffer|null;configuration_key_id:string|null;
 secret_ciphertext:Buffer|null;secret_key_id:string|null
};
type Attempt={tenant_id:string;credential_id:string;user_id:string;verifier_ciphertext:Buffer;
 verifier_key_id:string;redirect_uri:string;token_url:string;expires_at:Date};
type OAuthConfig={authorizationUrl?:string;tokenUrl?:string;clientId?:string;scope?:string;clientSecret?:string};
const stringValue=(v:unknown,max=2000)=>typeof v==='string'&&v.length>0&&v.length<=max?v:null;
const publicRedirect=()=>{
 const base=process.env.METADRIVE_PUBLIC_BASE_URL;
 if(!base)throw Error('OAuth public callback base URL is not configured');
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.includes('.'))
  throw Error('Invalid OAuth callback base URL');
 return new URL('/api/named-credentials/oauth/callback',url).toString();
};
async function fetchTokens(url:string,body:URLSearchParams){
 const endpoint=await approvedCredentialEndpoint(url,'HTTPS');
 if(endpoint.url.username||endpoint.url.password)throw Error('Unsafe OAuth token endpoint');
 const data=body.toString();
 const result=await new Promise<{status:number;data:string}>((resolve,reject)=>{
  const request=https.request({
   hostname:endpoint.address,port:endpoint.port,servername:endpoint.hostname,
   path:endpoint.url.pathname+endpoint.url.search,method:'POST',rejectUnauthorized:true,
   headers:{Host:endpoint.url.host,'Content-Type':'application/x-www-form-urlencoded',
    'Content-Length':Buffer.byteLength(data)}
  },response=>{
   let text='';response.setEncoding('utf8');
   response.on('data',(part:string)=>{text+=part;if(text.length>32768)request.destroy(Error('OAuth response too large'));});
   response.on('end',()=>resolve({status:response.statusCode??0,data:text}));
  });
  request.on('error',reject);request.setTimeout(8000,()=>request.destroy(Error('OAuth token timeout')));
  request.end(data);
 });
 if(result.status!==200)throw Error('OAuth token exchange was rejected');
 let token:Record<string,unknown>;
 try{token=JSON.parse(result.data);}catch{throw Error('OAuth provider returned invalid token data');}
 const access=stringValue(token.access_token,4096);
 if(!access||!['Bearer','bearer'].includes(String(token.token_type)))throw Error('OAuth provider did not return a Bearer access token');
 const refresh=token.refresh_token===undefined?null:stringValue(token.refresh_token,4096);
 if(token.refresh_token!==undefined&&!refresh)throw Error('Invalid OAuth refresh token');
 const expires=token.expires_in===undefined?3600:Number(token.expires_in);
 if(!Number.isFinite(expires)||expires<60||expires>31536000)throw Error('Invalid OAuth token expiry');
 return {access,refresh,expires:Math.floor(expires)};
}
export function registerOAuthPublicCallback(app:Express,db:SqlPersistence){
 // Provider redirects here without a bearer token. A one-time 256-bit state and PKCE bind the request.
 app.get('/api/named-credentials/oauth/callback',wrap(async(req,res)=>{
  const state=req.query.state,code=req.query.code;
  if(typeof state!=='string'||!statePattern.test(state)||typeof code!=='string'||
   code.length<1||code.length>4096||req.query.error!==undefined)
   throw Error('Invalid OAuth callback');
  const stateHash=hash(state);
  const attempt=await db.transaction(async client=>{
   const {rows}=await client.query<Attempt>(`
    SELECT a.tenant_id,a.credential_id,a.user_id,a.verifier_ciphertext,a.verifier_key_id,
      a.redirect_uri,a.token_url,a.expires_at
    FROM md_oauth_authorization_attempts a
    JOIN md_users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id AND u.enabled=true
    JOIN md_named_credentials c ON c.tenant_id=a.tenant_id AND c.id=a.credential_id
       AND c.enabled=true AND c.auth_type='OAuth Authorization Code'
    WHERE a.state_hash=$1 AND a.consumed_at IS NULL AND a.expires_at>now()
    FOR UPDATE OF a`,[stateHash]);
   if(rows.length!==1)throw Error('OAuth authorization expired or already used');
   await client.query(`UPDATE md_oauth_authorization_attempts SET consumed_at=now()
     WHERE tenant_id=$1 AND state_hash=$2`,[rows[0].tenant_id,stateHash]);
   return rows[0];
  });
  if(attempt.redirect_uri!==publicRedirect())throw Error('OAuth callback changed since authorization began');
  const verifier=decryptCredential(attempt.verifier_ciphertext,attempt.verifier_key_id);
  const credential=await db.query<Credential>(`
    SELECT id,enabled,protocol,auth_type,configuration_ciphertext,configuration_key_id,
      secret_ciphertext,secret_key_id FROM md_named_credentials
    WHERE tenant_id=$1 AND id=$2`,[attempt.tenant_id,attempt.credential_id]);
  const current=credential.rows[0];
  if(!current||!current.enabled)throw Error('OAuth credential disabled');
  const cfg:OAuthConfig=current.configuration_ciphertext?
    JSON.parse(decryptCredential(current.configuration_ciphertext,current.configuration_key_id??'legacy')):{};
  const clientId=stringValue(cfg.clientId,512);
  if(!clientId)throw Error('OAuth client ID not configured');
  const secret=current.secret_ciphertext?decryptCredential(current.secret_ciphertext,current.secret_key_id??'legacy'):
    stringValue(cfg.clientSecret,4096);
  const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:attempt.redirect_uri,
    client_id:clientId,code_verifier:verifier});
  if(secret)body.set('client_secret',secret);
  const tokens=await fetchTokens(attempt.token_url,body);
  const access=encryptCredential(tokens.access),refresh=tokens.refresh?encryptCredential(tokens.refresh):null;
  await db.transaction(async client=>{
   const updated=await client.query(`
    UPDATE md_named_credentials SET oauth_access_ciphertext=$3,oauth_access_key_id=$4,
      oauth_refresh_ciphertext=$5,oauth_refresh_key_id=$6,
      oauth_expires_at=now()+($7::integer * interval '1 second'),updated_at=now()
    WHERE tenant_id=$1 AND id=$2 AND enabled=true RETURNING id`,
    [attempt.tenant_id,attempt.credential_id,access.ciphertext,access.keyId,
     refresh?.ciphertext??null,refresh?.keyId??null,tokens.expires]);
   if(!updated.rowCount)throw Error('OAuth credential unavailable');
   await client.query(`INSERT INTO md_tenant_security_events(tenant_id,actor_id,event_type)
     VALUES($1,$2,'oauth_credential_authorized')`,[attempt.tenant_id,attempt.user_id]);
  });
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});
  res.type('text/plain').send('Named Credential authorised. You can close this window.');
 }));
}
export function registerOAuthStartRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.post('/api/named-credentials/:id/oauth/start',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  await rbac.require(a.tenant_id,a.user_id,'NamedCredential','manage');
  if(!uuid.test(id))throw Error('Invalid Named Credential ID');
  const {rows}=await db.query<Credential>(`
    SELECT id,enabled,protocol,auth_type,configuration_ciphertext,configuration_key_id,
      secret_ciphertext,secret_key_id FROM md_named_credentials WHERE tenant_id=$1 AND id=$2`,
    [a.tenant_id,id]);
  const credential=rows[0];
  if(!credential||!credential.enabled||credential.protocol!=='HTTPS'||credential.auth_type!=='OAuth Authorization Code')
   throw Error('Enabled OAuth Authorization Code HTTPS credential required');
  if(!credential.configuration_ciphertext)throw Error('OAuth provider configuration is missing');
  const cfg=JSON.parse(decryptCredential(credential.configuration_ciphertext,credential.configuration_key_id??'legacy')) as OAuthConfig;
  const authUrl=stringValue(cfg.authorizationUrl),tokenUrl=stringValue(cfg.tokenUrl);
  const clientId=stringValue(cfg.clientId,512);
  if(!authUrl||!tokenUrl||!clientId)throw Error('OAuth authorization URL, token URL and client ID are required');
  // Provider URLs must be approved and resolve to public addresses (same policy as HTTP credentials).
  const authEndpoint=await approvedCredentialEndpoint(authUrl,'HTTPS');
  await approvedCredentialEndpoint(tokenUrl,'HTTPS');
  if(authEndpoint.url.search||authEndpoint.url.hash)throw Error('OAuth authorization URL cannot contain fixed query parameters');
  const redirect=publicRedirect(),state=randomBytes(32).toString('base64url'),
   verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const encrypted=encryptCredential(verifier);
  await db.query(`INSERT INTO md_oauth_authorization_attempts
    (tenant_id,state_hash,credential_id,user_id,verifier_ciphertext,verifier_key_id,
     redirect_uri,token_url,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes')`,
    [a.tenant_id,hash(state),id,a.user_id,encrypted.ciphertext,encrypted.keyId,redirect,tokenUrl]);
  const url=new URL(authUrl);
  url.searchParams.set('response_type','code');url.searchParams.set('client_id',clientId);
  url.searchParams.set('redirect_uri',redirect);url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',challenge);url.searchParams.set('code_challenge_method','S256');
  if(cfg.scope&&cfg.scope.length<=1000)url.searchParams.set('scope',cfg.scope);
  res.set('Cache-Control','no-store');
  res.json({authorizationUrl:url.toString()});
 }));
}
