// OneEngine-authorized production Chatter Flow migration and post-release audit.
// Never log customer messages, phone numbers, tokens, or credential secrets.
const base='https://metadrive-production.up.railway.app/api';
const email=process.env.METADRIVE_TEST_EMAIL, password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('CI production credentials unavailable');
if(email.trim().toLowerCase()!=='support@unesolutions.co.uk')throw Error('Refusing release verification for unexpected login identity');
let token='';
async function api(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));
 return {status:response.status,data};
}
const login=await api('/auth/login','POST',{email,password});
if(login.status!==200||!login.data.access_token||login.data.user?.tenantId!=='unesolutions-dev')throw Error('Unexpected tenant or login denied');
token=login.data.access_token;
const [flows,access,pages,apps,credentials]=await Promise.all([
 api('/metadata/flows'),api('/chatter/access'),api('/metadata/pages'),api('/metadata/apps'),api('/named-credentials')]);
for(const [name,result] of Object.entries({flows,access,pages,apps,credentials})){
 if(result.status!==200)throw Error(name+' endpoint failed HTTP '+result.status);
}
const send=flows.data.flows?.find(x=>x.apiName==='CHATTER_SEND_MESSAGE');
if(!send)throw Error('Published Chatter Send Flow missing');
const callouts=(send.elements||[]).filter(e=>e.type==='HTTP Callout'&&e.config?.method==='POST'&&String(e.config?.body||'').includes('messaging_product'));
const callout=callouts.length===1?callouts[0]:undefined;
if(!callout)throw Error('Send Flow callout mismatch '+JSON.stringify((send.elements||[]).map(e=>({type:e.type,configKeys:Object.keys(e.config||{}),path:e.config?.path,resourceBinding:/^\\{![A-Za-z_][A-Za-z0-9_]*\\}$/.test(e.config?.namedCredentialResource||'')?e.config.namedCredentialResource:'non-template'}))).slice(0,900));
let flowStatus='already_current';
if(callout.config.path!=='{!AuthorisedMessagePath}'||callout.config.namedCredentialResource!=='{!AuthorisedCredentialId}'){
 const updated={...send,elements:send.elements.map(e=>e.id===callout.id?{...e,config:{...e.config,path:'{!AuthorisedMessagePath}',namedCredentialResource:'{!AuthorisedCredentialId}'}}:e),status:'Active'};
 const validation=await api('/metadata/flows/CHATTER_SEND_MESSAGE/validate','POST',updated);
 if(validation.status!==200||validation.data.errors?.length)throw Error('Flow validation failure '+JSON.stringify({status:validation.status,errors:validation.data.errors,details:validation.data.details}).slice(0,650));
 const publish=await api('/metadata/flows/CHATTER_SEND_MESSAGE','PUT',updated);
 if(publish.status!==200)throw Error('Flow publication rejected '+JSON.stringify({status:publish.status,error:publish.data.error,details:publish.data.details}).slice(0,650));
 flowStatus='published';
}
const verify=await api('/metadata/flows');
const active=verify.data.flows?.find(x=>x.apiName==='CHATTER_SEND_MESSAGE');
if(verify.status!==200||active?.status!=='Active'||!active.activeVersion||!active.elements?.some(e=>e.type==='HTTP Callout'&&e.config?.path==='{!AuthorisedMessagePath}'))throw Error('Live Chatter Send Flow activation check failed');
const assigned=(access.data.grants||[]).filter(g=>g.canRead===true&&g.canSend===true);
const page=pages.data.pages?.find(p=>p.apiName==='UNE_CHATTER');
const app=apps.data.apps?.find(a=>a.apiName==='Communication');
const graph=(credentials.data.credentials||[]).filter(x=>{try{return new URL(x.baseUrl).hostname==='graph.facebook.com'&&x.configuration?.PhoneNumberId;}catch{return false;}});
console.log('CHATTER_RELEASE_RESULT '+JSON.stringify({
 pageActive:page?.status==='Active',appNavigationLinked:app?.navigationPageApiNames?.includes('UNE_CHATTER')===true,
 flow:flowStatus,flowVersion:active.activeVersion,
 supportLogin:login.data.user?.role,assignedChannelCount:assigned.length,
 graphCredentialCount:graph.length
}));
if(page?.status!=='Active'||!app?.navigationPageApiNames?.includes('UNE_CHATTER'))throw Error('Chatter page navigation missing');
if(!assigned.length)throw Error('No WhatsApp account grants for the production test account');
