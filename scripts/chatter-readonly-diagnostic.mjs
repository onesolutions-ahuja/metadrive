// Read-only, aggregate Chatter diagnostics. No messages, contact details or credentials logged.
const base='https://metadrive-production.up.railway.app/api';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Missing CI authentication');
let token='';
async function get(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};
}
const login=await get('/auth/login','POST',{email,password});
if(login.status!==200||login.data.user?.tenantId!=='unesolutions-dev')throw Error('Refusing unexpected tenant');
token=login.data.access_token;
const [access,records,grants,objects]=await Promise.all([
 get('/chatter/access'),get('/records/Communication_Records__c?limit=200'),
 get('/records/Chatter_Channel_Grant__c?limit=100'),get('/metadata/objects')
]);
const list=records.data.records||[];
const whatsapp=list.filter(x=>String(x.Communication_Mode__c||'').toLowerCase()==='whatsapp');
const msg=whatsapp.filter(x=>String(x.Event_Type__c||'').toLowerCase()==='message');
const usable=msg.filter(x=>x.Channel_Account__c&&x.Id&&
 ['incoming','outgoing'].includes(String(x.Direction__c||'').toLowerCase())&&
 (String(x.Direction__c).toLowerCase()==='incoming'?x.From_Number__c:x.To_Number__c));
const gr=access.data.grants||[];
const creds=await get('/named-credentials');
const graph=(creds.data.credentials||[]).filter(c=>{try{return new URL(c.baseUrl).hostname==='graph.facebook.com';}catch{return false}}).map(c=>({protocol:c.protocol,enabled:c.enabled,accountIdConfigured:!!c.configuration?.PhoneNumberId,apiVersionConfigured:/^v?\d+\.\d+$/.test(String(c.configuration?.ApiVersion??'')),pathType:(()=>{const p=new URL(c.baseUrl).pathname;return /^\/v\d+\.\d+\/?$/.test(p)?'version-only':/^\/v\d+\.\d+\/[A-Za-z0-9_-]+\/?$/.test(p)?'account-path':'other'})()}));
console.log('CHATTER_READONLY_DIAGNOSTIC '+JSON.stringify({
 role:login.data.user.role, graphCredentials:graph, credentialsStatus:creds.status,
 supportAccount: String(login.data.user.email||email).toLowerCase()==='support@unesolutions.co.uk',
 endpoints:{access:access.status,records:records.status,grantRecords:grants.status,objects:objects.status},
 counts:{visibleRecordPage:list.length,whatsapp:whatsapp.length,whatsappMessages:msg.length,renderableMessages:usable.length,authorizedChannels:gr.filter(x=>x.canRead).length,sendChannels:gr.filter(x=>x.canRead&&x.canSend).length,assignChannels:gr.filter(x=>x.canRead&&x.canAssign).length,accountIdsAvailable:gr.every(x=>typeof x.channelAccountId==='string'&&x.channelAccountId.length>0)},
 grantObjectExists:(objects.data.objects||[]).some(o=>o.apiName==='Chatter_Channel_Grant__c')
}));
