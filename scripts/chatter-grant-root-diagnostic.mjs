const origin='https://metadrive-production.up.railway.app/api';let token='';
async function api(path,method='GET',body){const res=await fetch(origin+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});return {status:res.status,data:await res.json().catch(()=>({}))};}
const l=await api('/auth/login','POST',{email:process.env.METADRIVE_TEST_EMAIL,password:process.env.METADRIVE_TEST_PASSWORD});
if(l.status!==200||l.data.user?.tenantId!=='unesolutions-dev')throw Error('Unexpected tenant or login');
token=l.data.access_token;
const [a,p,n,c,g]=await Promise.all([api('/chatter/access'),api('/metadata/permissions'),api('/named-credentials'),api('/records/Communication_Records__c?limit=200'),api('/records/Chatter_Channel_Grant__c?limit=100')]);
const users=p.data.users||[];
const matching=users.filter(x=>String(x.username||x.email||'').toLowerCase()==='support@unesolutions.co.uk');
const isIdentity=String(l.data.user?.email||'').toLowerCase()==='support@unesolutions.co.uk';
const creds=(n.data.credentials||[]).filter(x=>{try{return new URL(x.baseUrl).hostname==='graph.facebook.com'}catch{return false}});
const rows=c.data.records||[];
const stats={loginRole:l.data.user?.role,loginIsTarget:isIdentity,accountAccess:a.status,grants:(a.data.grants||[]).length,grantModes:(a.data.grants||[]).map(x=>({read:x.canRead,send:x.canSend,assign:x.canAssign,viewAll:x.viewAll,hasAccountId:Boolean(x.channelAccountId)})),permissionsStatus:p.status,targetRBACUsers:matching.length,targetMatchesLogin:matching.some(x=>x.id===l.data.user.id),targetProfiles:matching.map(x=>x.profileId),namedCredsStatus:n.status,graphCredentialCount:creds.length,graphCredentialPaths:creds.map(x=>{try{return new URL(x.baseUrl).pathname.replace(/[0-9A-Za-z_-]{5,120}(?=\/|$)/g,'*')}catch{return '?'}}),phoneNumberConfigured:creds.map(x=>Boolean(x.configuration?.PhoneNumberId)),communicationRecordCount:rows.length,communicationStatus:c.status,grantRecordStatus:g.status,grantRecordCount:(g.data.records||[]).length};
console.log('CHATTER_GRANT_DIAG '+JSON.stringify(stats));