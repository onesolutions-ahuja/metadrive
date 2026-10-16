import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { getOAuthAccessToken, validatedOAuthUrl, type OAuthVault } from '../../connector-oauth.js';
import { SqlOAuthChallengeStore, type ChallengeCipher } from '../../connector-oauth-challenges.js';
import { credentialKeyRing, openCredentialPayload, sealCredentialPayload } from '../../core/credential-crypto.js';
import { getRouteAliasPool } from '../../postgres-state.js';
import { assertCalloutHostAllowed } from '../../outbound-callout-policy.js';
import type { TenantData } from '../../core/state/types.js';
import type { StoredNamedCredential } from '../../index.js';

/** Tenant-scoped OAuth lifecycle, SQL PKCE challenges and DNS-pinned token transport. */
export function createOAuthRuntime(deps: {
 isPublicAddress: (address: string) => boolean;
 tenantData: (tenantId: string) => TenantData | undefined;
 persistTenantRecords: (tenantId: string, tenant: TenantData) => void;
 namedCredentialSchema: { parse: (value: unknown) => StoredNamedCredential };
}) {
 const { isPublicAddress, tenantData, persistTenantRecords, namedCredentialSchema } = deps;
/** OAuth transport is deliberately server-side and DNS-pinned to public HTTPS hosts. */
async function safeOAuthTokenRequest(endpoint: URL, params: URLSearchParams): Promise<{ status:number; body:unknown }> {
  assertCalloutHostAllowed(endpoint.hostname, process.env.METADRIVE_PAUSED_CALLOUT_HOSTS);
  validatedOAuthUrl(endpoint.toString());
  const encoded=params.toString();
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];
    let size=0;
    const request=httpsRequest(endpoint,{
      method:'POST',timeout:15000,maxHeaderSize:8192,
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':String(Buffer.byteLength(encoded)),'Accept':'application/json'},
      lookup:(hostname,options,callback)=>{
        void lookup(hostname,{all:true,verbatim:true}).then(addresses=>{
          if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) {
            callback(new Error('OAuth token host failed public DNS validation'),'',0);return;
          }
          const first=addresses[0];
          if(options && typeof options==='object' && 'all' in options && options.all) callback(null,[first]);
          else callback(null,first.address,first.family);
        }).catch(()=>callback(new Error('OAuth token DNS unavailable'),'',0));
      }
    }, incoming=>{
      incoming.on('data',(chunk:Buffer|string)=>{
        const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=data.length;
        if(size>65536){request.destroy(new Error('OAuth response exceeded limit'));return;}
        chunks.push(data);
      });
      incoming.on('end',()=>{
        try {resolve({status:incoming.statusCode??0,body:JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown});}
        catch {reject(new Error('OAuth endpoint returned invalid JSON'));}
      });
      incoming.on('error',()=>reject(new Error('OAuth token response failed')));
    });
    request.on('timeout',()=>request.destroy(new Error('OAuth token request timed out')));
    request.on('error',()=>reject(new Error('OAuth token transport failed')));
    request.end(encoded);
  });
}

function oauthCredentialVault(tenantId:string, credentialId:string):OAuthVault {
  return {
    load:async scope=>{
      if(scope.tenantId!==tenantId || scope.credentialId!==credentialId) throw new Error('OAuth tenant scope mismatch.');
      const credential=tenantData(tenantId)?.namedCredentials.find(row=>row.id===credentialId);
      if(!credential || !['OAuth Client Credentials','OAuth Authorization Code'].includes(credential.authType)
        || credential.enabled===false) throw new Error('OAuth credential unavailable.');
      return openCredentialPayload(tenantId,credential).oauthToken??null;
    },
    save:async (scope,token)=>{
      if(scope.tenantId!==tenantId || scope.credentialId!==credentialId) throw new Error('OAuth tenant scope mismatch.');
      const currentTenant=tenantData(tenantId);
      const current=currentTenant?.namedCredentials.find(row=>row.id===credentialId);
      if(!currentTenant || !current || !['OAuth Client Credentials','OAuth Authorization Code'].includes(current.authType)
        || current.enabled===false) throw new Error('OAuth credential changed during refresh.');
      const payload=openCredentialPayload(tenantId,current);
      const updated=namedCredentialSchema.parse({...current,
        ...sealCredentialPayload(tenantId,current.id,{...payload,oauthToken:token}),
        updatedAt:new Date().toISOString()});
      persistTenantRecords(tenantId,{...currentTenant,namedCredentials:currentTenant.namedCredentials.map(row=>row.id===current.id?updated:row)});
    }
  };
}
function oauthChallengeStore():SqlOAuthChallengeStore {
  const sql=getRouteAliasPool();
  if(!sql) throw new Error('OAuth authorization requires the configured PostgreSQL database.');
  const cipher:ChallengeCipher={
    seal:(tenantId,digest,verifier)=>sealCredentialPayload(tenantId,'oauth-pkce:'+digest,{secret:verifier}),
    open:(tenantId,digest,sealed)=>{
      const synthetic={id:'oauth-pkce:'+digest,name:'OAuth challenge',...sealed} as StoredNamedCredential;
      return openCredentialPayload(tenantId,synthetic).secret??'';
    }
  };
  return new SqlOAuthChallengeStore(sql,cipher);
}
async function oauthAccessTokenForCredential(tenantId:string,credential:StoredNamedCredential):Promise<string> {
  if (!['OAuth Client Credentials','OAuth Authorization Code'].includes(credential.authType) || credential.protocol!=='HTTPS')
    throw new Error('OAuth credential is not configured for HTTPS.');
  const configuration=credential.configuration??{};
  if (!configuration.ClientId || !configuration.OAuthEndpoint) throw new Error('OAuth ClientId/OAuthEndpoint missing.');
  const clientSecret=openCredentialPayload(tenantId,credential).secret;
  if(!clientSecret)throw new Error('OAuth client secret is not configured.');
  return getOAuthAccessToken({tenantId,credentialId:credential.id},{
    tokenUrl:configuration.OAuthEndpoint,clientId:configuration.ClientId,clientSecret,
    scope:configuration.Scope,grantType:credential.authType==='OAuth Client Credentials'?'client_credentials':'authorization_code'
  },oauthCredentialVault(tenantId,credential.id),safeOAuthTokenRequest);
}

 return { safeOAuthTokenRequest, oauthCredentialVault, oauthChallengeStore, oauthAccessTokenForCredential };
}
