// Authorized one-time production activation through the existing metadata APIs.
const base='https://metadrive-production.up.railway.app/api';
const user=process.env.METADRIVE_TEST_EMAIL,pass=process.env.METADRIVE_TEST_PASSWORD;
if(!user||!pass)throw Error('Missing existing GitHub Actions production credentials');
let token='';
const report={authenticated:false,flows:{},page:'not_attempted',rbac:'not_attempted'};
async function api(path,method='GET',body,auth=true){
 const r=await fetch(base+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(auth&&token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await r.json().catch(()=>({}));return {status:r.status,data};
}
const fail=(step,result)=>{throw Error(step+' HTTP '+result.status+' '+JSON.stringify({error:result.data?.error,details:result.data?.details}).slice(0,1000))};
const l=await api('/auth/login','POST',{email:user,password:pass},false);
if(l.status!==200||!l.data.access_token||l.data.user?.tenantId!=='unesolutions-dev')fail('tenant login',l);
token=l.data.access_token;report.authenticated=true;
const [p,f,c]=await Promise.all([api('/metadata/pages'),api('/metadata/flows'),api('/chatter/access')]);
if(p.status!==200||f.status!==200||c.status!==200)throw Error('Metadata endpoint statuses: '+JSON.stringify({pages:p.status,flows:f.status,chatterAccess:c.status}));
const page=p.data.pages.find(x=>x.apiName==='UNE_CHATTER');
if(!page)throw Error('Chatter page missing');
const grantCount=(c.data.grants||[]).filter(x=>x.canRead&&x.canSend).length;
if(!grantCount){
 const [credentials,grantRows,profiles]=await Promise.all([
  api('/named-credentials'),api('/records/Chatter_Channel_Grant__c?limit=100'),
  api('/metadata/access-control')]);
 const credentialRows=credentials.data.credentials||[];
 const meta=credentialRows.filter(x=>{
  try{return new URL(x.baseUrl).hostname==='graph.facebook.com';}catch{return false}
 }).map(x=>({hasPathNumber:/^\/v\\d+\\.\\d+\/[A-Za-z0-9_-]{5,120}/.test(new URL(x.baseUrl).pathname),configurationKeys:Object.keys(x.configuration||{}),enabled:x.enabled!==false}));
 throw Error('No usable WhatsApp channel grant: '+JSON.stringify({credentialsStatus:credentials.status,graphCredentials:meta,grantRowsStatus:grantRows.status,grantsCount:grantRows.data.records?.length,profileStatus:profiles.status,grantsVisible:c.data.grants?.length,loginRole:l.data.user?.role,loginProfile:l.data.user?.profileId,phoneConfigValid:meta.some(x=>x.configurationKeys.includes('PhoneNumberId'))}));
}
report.rbac='verified';
for(const name of ['CHATTER_SEND_MESSAGE','CHATTER_ASSIGN_CONVERSATION']){
 const flow=f.data.flows.find(x=>x.apiName===name);
 if(!flow)throw Error(name+' missing');
 if(flow.status==='Active'&&flow.activeVersion){report.flows[name]='already_active';continue;}
 const v=await api('/metadata/flows/'+name+'/validate','POST',{...flow,status:'Active'});
 if(v.status!==200){report.flows[name]='validation_failed';fail(name+' validate',v)}
 if(v.data.errors?.length)throw Error(name+' validation: '+JSON.stringify(v.data.errors).slice(0,900));
 const publish=await api('/metadata/flows/'+name,'PUT',{...flow,status:'Active'});
 if(publish.status!==200)fail(name+' publication',publish);
 report.flows[name]='published';
}
if(page.status!=='Active'){
 const a=await api('/metadata/pages/UNE_CHATTER','PUT',{...page,status:'Active'});
 if(a.status!==200)fail('page activation',a);
 report.page='activated';
}else report.page='already_active';
const [pages,flows,grants]=await Promise.all([api('/metadata/pages'),api('/metadata/flows'),api('/chatter/access')]);
const p2=pages.data.pages?.find(x=>x.apiName==='UNE_CHATTER');
if(p2?.status!=='Active'||!['CHATTER_SEND_MESSAGE','CHATTER_ASSIGN_CONVERSATION'].every(n=>flows.data.flows?.some(x=>x.apiName===n&&x.status==='Active'&&x.activeVersion))||grants.status!==200)throw Error('Post-activation state mismatch');
console.log('CHATTER_ACTIVATION_RESULT '+JSON.stringify(report));
