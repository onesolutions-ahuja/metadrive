import { createHash } from 'node:crypto';

// Safe production diagnostic: validates an authenticated metadata publication without
// logging credentials, tokens, metadata, user IDs or customer records.
const required = ['METADRIVE_TENANT_SLUG','METADRIVE_LOGIN_EMAIL','METADRIVE_LOGIN_PASSWORD'];
const missing = required.filter(k=>!process.env[k]);
if(missing.length)throw Error('Production diagnostic credentials not configured: '+missing.join(','));
const base='https://metadrive-nxd7.onrender.com/api';
const req=async(path,init={})=>{
  const response=await fetch(base+path,{
    ...init,
    signal:AbortSignal.timeout(30000),
    headers:{Origin:'https://unesolutions.co.uk','Content-Type':'application/json',...init.headers}
  });
  const data=await response.json().catch(()=>({}));
  return {response,data};
};
const login=await req('/auth/login',{method:'POST',body:JSON.stringify({
  tenantSlug:process.env.METADRIVE_TENANT_SLUG,
  email:process.env.METADRIVE_LOGIN_EMAIL,
  password:process.env.METADRIVE_LOGIN_PASSWORD
})});
if(!login.response.ok||!login.data.access_token)
  throw Error('Diagnostic sign-in unavailable: HTTP '+login.response.status+
    (login.data.challenge_token?' (MFA challenge)':''));
const {response,data}=await req('/metadata/offline-publication',{
  headers:{Authorization:'Bearer '+login.data.access_token}
});
if(!response.ok)throw Error('Publication API unavailable: HTTP '+response.status);
const pub=data?.publication,content=data?.content;
if(!content||!pub?.revision)throw Error('Publication response missing payload or revision');
const exact=createHash('sha256').update(JSON.stringify({
  pages:content.pages,apps:content.apps,objects:content.objects,components:content.components
})).digest('hex');
const checks={
  digestMatchesPayload:exact===pub.verifiedDigest,
  digestMatchesRevision:pub.verifiedDigest===pub.revision.digest,
  validRevision:Number.isSafeInteger(pub.revision.version)&&pub.revision.version>0,
  validPublishedAt:Number.isFinite(pub.revision.publishedAt)&&pub.revision.publishedAt>0,
  revisionNotFuture:Date.now()>=pub.revision.publishedAt,
  ageWithin24Hours:Date.now()-pub.revision.publishedAt<=86400000,
  minimumVersionSatisfied:Number.isSafeInteger(pub.minimumVersion)&&pub.minimumVersion>=1&&
    pub.revision.version>=pub.minimumVersion,
  responseContentIsArrays:['pages','apps','objects','components'].every(k=>Array.isArray(content[k])),
  accessControlAllowsOrigin:response.headers.get('access-control-allow-origin')==='https://unesolutions.co.uk',
  accessControlAllowsCredentials:response.headers.get('access-control-allow-credentials')==='true'
};
for(const [key,valid] of Object.entries(checks))
  console.log('Metadata publication integrity check:',key,valid?'PASS':'FAIL');
if(Object.values(checks).some(x=>!x))throw Error('Authenticated publication integrity check failed');
console.log('Authenticated publication integrity verified; no metadata or secrets logged');
