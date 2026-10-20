import {createHash,randomBytes} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {NamedCredentialService} from './named-credential-service.js';

const sha=(value:string)=>createHash('sha256').update(value).digest();
const digest=(value:string)=>sha(value).toString('hex');
const idPattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Config={clientId:string;authorizationUrl:string;tokenUrl:string;scope?:string};
type StoredCredential={id:string;enabled:boolean;auth_type:string;secret_ciphertext:Buffer|null;configuration_ciphertext:Buffer|null;encryption_key_id:string};
export function safeUrl(raw:string):URL{
 const parsed=new URL(raw);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash||
   (parsed.port&&parsed.port!=='443')||isIP(parsed.hostname)||
   parsed.hostname==='localhost'||parsed.hostname.endsWith('.local'))
  throw new Error('OAuth endpoints require a public HTTPS origin');
 return parsed;
}
// Use one vetted public-address rule for all token calls; DNS pinning prevents rebinding.
export function publicIp(ip:string){
 if(isIP(ip)===4){
  const [a,b,c]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||
    a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||
    a===198&&b>=18&&b<=19||a===192&&b===0||a===192&&b===88||
    a===198&&b===51||a===203&&b===0||a===192&&b===0&&c===0);
 }
 if(isIP(ip)===6){
  const normalized=ip.toLowerCase();
  return !(normalized.startsWith('::')||/^(ff|fc|fd|fe8|fe9|fea|feb)/.test(normalized)||
    normalized.includes(':ffff:'));
 }
 return false;
}
async function postToken(url:URL,clientId:string,clientSecret:string,parameters:URLSearchParams){
 const addresses=await lookup(url.hostname,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>!publicIp(a.address)))
  throw new Error('OAuth token endpoint resolves to a restricted network');
 const chosen=addresses[0],body=parameters.toString();
 const auth=Buffer.from(clientId+':'+clientSecret).toString('base64');
 const payload=await new Promise<string>((resolve,reject)=>{
  const req=httpsRequest(url,{method:'POST',agent:false,
   lookup:(_host,_options,cb)=>cb(null,chosen.address,chosen.family),
   timeout:15000,headers:{Authorization:'Basic '+auth,
    'Content-Type':'application/x-www-form-urlencoded',
    'Content-Length':Buffer.byteLength(body),Accept:'application/json'}},response=>{
   if((response.statusCode??0)<200||(response.statusCode??0)>=300){
    response.resume();reject(new Error('OAuth token exchange failed'));return;
   }
   const chunks:Buffer[]=[];let size=0;
   response.on('data',(piece:Buffer)=>{
    size+=piece.length;
    if(size>8192){req.destroy(new Error('OAuth token response too large'));return;}
    chunks.push(piece);
   });
   response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
  });
  req.on('timeout',()=>req.destroy(new Error('OAuth token exchange timed out')));
  req.on('error',reject);
  req.end(body);
 });
 let parsed:unknown;
 try {parsed=JSON.parse(payload);}catch{throw new Error('Invalid OAuth token response');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw new Error('Invalid OAuth token response');
 const t=parsed as Record<string,unknown>;
 if(typeof t.access_token!=='string'||!t.access_token||t.access_token.length>8192||
    String(t.token_type).toLowerCase()!=='bearer')
  throw new Error('Invalid OAuth token response');
 const expires=Number(t.expires_in);
 if(!Number.isInteger(expires)||expires<60||expires>86400)
  throw new Error('Invalid OAuth token lifetime');
 return {access:t.access_token,refresh:typeof t.refresh_token==='string'&&t.refresh_token.length<=8192?
  t.refresh_token:undefined,expires};
}

/** Generic OAuth Authorization Code/PKCE flow for tenant Named Credentials. */
export class OAuthAuthorizationService{
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine,
  private readonly vault:NamedCredentialService){}
 private async credential(tenantId:string,id:string):Promise<{row:StoredCredential;config:Config;secret:string}>{
  if(!idPattern.test(id))throw new Error('Invalid Named Credential');
  const {rows}=await this.db.query<StoredCredential>(`SELECT id,enabled,auth_type,
    secret_ciphertext,configuration_ciphertext,encryption_key_id
    FROM md_named_credentials WHERE tenant_id=$1 AND id=$2`,[tenantId,id]);
  const row=rows[0];
  if(!row?.enabled||row.auth_type!=='OAuth Authorization Code'||
    !row.secret_ciphertext||!row.configuration_ciphertext)
   throw new Error('OAuth credential is not configured');
  let c:unknown;
  try{c=JSON.parse(this.vault.decryptOpaque(row.configuration_ciphertext,row.encryption_key_id));}
  catch{throw new Error('Invalid OAuth configuration');}
  if(!c||typeof c!=='object'||Array.isArray(c))throw new Error('Invalid OAuth configuration');
  const config=c as Config;
  if(typeof config.clientId!=='string'||!config.clientId||config.clientId.length>512||
    typeof config.authorizationUrl!=='string'||typeof config.tokenUrl!=='string'||
    (config.scope!==undefined&&(typeof config.scope!=='string'||config.scope.length>1024)))
   throw new Error('Invalid OAuth configuration');
  safeUrl(config.authorizationUrl);safeUrl(config.tokenUrl);
  return {row,config,secret:this.vault.decryptOpaque(row.secret_ciphertext,row.encryption_key_id)};
 }
 private callbackUri(){
  const raw=process.env.METADRIVE_OAUTH_CALLBACK_URL;
  if(!raw)throw new Error('OAuth callback is not configured');
  const url=safeUrl(raw);
  if(url.pathname!=='/api/oauth/callback'||url.search)
   throw new Error('OAuth callback must use /api/oauth/callback');
  return url.toString();
 }
 private returnUri(){
  const raw=process.env.METADRIVE_OAUTH_RETURN_URL;
  if(!raw)throw new Error('OAuth return URL is not configured');
  return safeUrl(raw);
 }
 async start(tenantId:string,userId:string,id:string){
  await this.rbac.require(tenantId,userId,'NamedCredential','manage');
  const {config}=await this.credential(tenantId,id);
  const redirectUri=this.callbackUri();
  this.returnUri();
  const state=randomBytes(32).toString('base64url');
  const verifier=randomBytes(32).toString('base64url');
  const encrypted=this.vault.encryptOpaque(verifier);
  await this.db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':oauth:'+id+':'+userId]);
   const {rows}=await client.query<{n:string}>(`
    SELECT count(*)::text AS n FROM md_credential_oauth_grants
    WHERE tenant_id=$1 AND credential_id=$2 AND initiated_by=$3
      AND created_at>now()-interval '1 hour'`,[tenantId,id,userId]);
   if(Number(rows[0]?.n??0)>10)throw new Error('Too many OAuth authorizations');
   await client.query(`INSERT INTO md_credential_oauth_grants
    (tenant_id,credential_id,initiated_by,state_hash,verifier_ciphertext,key_id,redirect_uri,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
    [tenantId,id,userId,digest(state),encrypted.ciphertext,encrypted.keyId,redirectUri]);
  });
  const url=safeUrl(config.authorizationUrl);
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',config.clientId);
  url.searchParams.set('redirect_uri',redirectUri);
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',sha(verifier).toString('base64url'));
  url.searchParams.set('code_challenge_method','S256');
  if(config.scope)url.searchParams.set('scope',config.scope);
  return {authorizationUrl:url.toString()};
 }
 async complete(state:unknown,code:unknown){
  if(typeof state!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(state)||
    typeof code!=='string'||!code||code.length>4096)
   throw new Error('Invalid OAuth authorization response');
  const grant=await this.db.transaction(async client=>{
   const {rows}=await client.query<{
    tenant_id:string;credential_id:string;initiated_by:string;
    verifier_ciphertext:Buffer;key_id:string;redirect_uri:string
   }>(`SELECT tenant_id,credential_id,initiated_by,verifier_ciphertext,key_id,redirect_uri
     FROM md_credential_oauth_grants
     WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`,
     [digest(state)]);
   const found=rows[0];
   if(!found)throw new Error('OAuth authorization expired');
   await client.query('UPDATE md_credential_oauth_grants SET consumed_at=now() WHERE state_hash=$1',[digest(state)]);
   return found;
  });
  const {config,secret}=await this.credential(grant.tenant_id,grant.credential_id);
  const verifier=this.vault.decryptOpaque(grant.verifier_ciphertext,grant.key_id);
  if(grant.redirect_uri!==this.callbackUri())throw new Error('OAuth callback URI changed');
  const parameters=new URLSearchParams({grant_type:'authorization_code',code,
    redirect_uri:grant.redirect_uri,code_verifier:verifier});
  const result=await postToken(safeUrl(config.tokenUrl),config.clientId,secret,parameters);
  const access=this.vault.encryptOpaque(result.access);
  const refresh=result.refresh?this.vault.encryptOpaque(result.refresh):null;
  await this.db.transaction(async client=>{
   await client.query(`INSERT INTO md_credential_oauth_tokens
      (tenant_id,credential_id,key_id,access_ciphertext,refresh_ciphertext,expires_at)
    VALUES($1,$2,$3,$4,$5,now()+($6::integer * interval '1 second'))
    ON CONFLICT(tenant_id,credential_id) DO UPDATE SET
    key_id=$3,access_ciphertext=$4,refresh_ciphertext=$5,
    expires_at=now()+($6::integer * interval '1 second'),updated_at=now()`,
    [grant.tenant_id,grant.credential_id,access.keyId,access.ciphertext,refresh?.ciphertext??null,result.expires]);
   await client.query('INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,$3)',
    [grant.tenant_id,grant.initiated_by,'OAuthCredentialConnected']);
  });
  const web=this.returnUri();
  web.searchParams.set('oauth','connected');
  return web.toString();
 }
 async bearerToken(tenantId:string,id:string){
  const {config,secret}=await this.credential(tenantId,id);
  const {rows}=await this.db.query<{
    key_id:string;access_ciphertext:Buffer;refresh_ciphertext:Buffer|null;expires_at:Date
  }>(`SELECT key_id,access_ciphertext,refresh_ciphertext,expires_at
    FROM md_credential_oauth_tokens WHERE tenant_id=$1 AND credential_id=$2`,[tenantId,id]);
  const token=rows[0];
  if(!token)throw new Error('OAuth credential is not authorized');
  if(new Date(token.expires_at).getTime()>Date.now()+60000)
   return this.vault.decryptOpaque(token.access_ciphertext,token.key_id);
  if(!token.refresh_ciphertext)throw new Error('OAuth refresh token is unavailable');
  const previous=this.vault.decryptOpaque(token.refresh_ciphertext,token.key_id);
  const parameters=new URLSearchParams({grant_type:'refresh_token',refresh_token:previous});
  const fresh=await postToken(safeUrl(config.tokenUrl),config.clientId,secret,parameters);
  const access=this.vault.encryptOpaque(fresh.access);
  const nextRefresh=this.vault.encryptOpaque(fresh.refresh??previous);
  await this.db.query(`UPDATE md_credential_oauth_tokens SET
     key_id=$3,access_ciphertext=$4,refresh_ciphertext=$5,
     expires_at=now()+($6::integer * interval '1 second'),updated_at=now()
     WHERE tenant_id=$1 AND credential_id=$2`,
    [tenantId,id,access.keyId,access.ciphertext,nextRefresh.ciphertext,fresh.expires]);
  return fresh.access;
 }
}
