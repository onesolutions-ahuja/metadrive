// One-time CI smoke: uses GitHub secrets for a normal MetaDrive login.
// Never print passwords, access tokens, provider payloads, or credential configuration.
import fs from 'node:fs/promises';
const BASE='https://metadrive.onrender.com';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if (!email||!password) throw Error('Missing METADRIVE_TEST_EMAIL or METADRIVE_TEST_PASSWORD Actions secrets');
const result={login:'not_started',providers:{}};
async function request(path,token,method='GET',body){
 const response=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));
 return {status:response.status,data};
}
async function record(){await fs.writeFile('module11-live-smoke-result.json',JSON.stringify(result,null,2));}
try{
 const login=await request('/api/auth/login',null,'POST',{email,password});
 result.login=login.status===200?'success':'failed_http_'+login.status;
 if(login.status!==200)throw Error('Authenticated login failed HTTP '+login.status);
 const token=login.data.access_token;
 if(typeof token!=='string')throw Error('Login response has no access token');
 const list=await request('/api/named-credentials',token);
 if(list.status!==200)throw Error('Credential metadata unavailable HTTP '+list.status);
 const credentials=list.data.credentials||[];
 const templates=JSON.parse(await fs.readFile('apps/server/data/flow-templates/module11-secure-messaging-smoke.json','utf8')).flows;
 for(const [provider,name] of [['WhatsApp','ONE_WhatsApp_Secure_Smoke'],['SMSGate','ONE_SMSGate_Secure_Smoke']]){
  const report=result.providers[provider]={status:'not_started'};
  try{
   const credential=credentials.find(c=>(c.name+' '+c.label).toLowerCase().includes(provider.toLowerCase())&&c.protocol==='HTTPS');
   if(!credential){report.status='no_accessible_named_credential';continue;}
   if(credential.enabled===false||!credential.hasSecret){report.status='credential_inactive_or_secret_unavailable';continue;}
   const flow=structuredClone(templates.find(f=>f.apiName===name));
   const call=flow.elements.find(e=>e.type==='HTTP Callout');
   call.config.namedCredentialId=credential.id;
   const baseUrl=new URL(credential.baseUrl);
   if(provider==='WhatsApp'){
    if(baseUrl.hostname!=='graph.facebook.com'){report.status='unrecognized_whatsapp_host';continue;}
    const phoneId=credential.configuration?.PhoneNumberId||credential.configuration?.phoneNumberId;
    const basePath=baseUrl.pathname.replace(/^\/+|\/+$/g,'');
    if(!phoneId&&!/\/\d{8,}$/.test('/'+basePath)){report.status='phone_number_id_missing';continue;}
    const id=phoneId||basePath.split('/').at(-1);
    call.config.path=(basePath.endsWith('/'+id)?'':id+'/')+'messages';
   }else{
    const providerPath=credential.configuration?.SendPath||credential.configuration?.MessagePath||credential.configuration?.sendPath;
    if(!providerPath||providerPath.startsWith('/')||/^https?:/i.test(providerPath)){report.status='smsgate_send_operation_not_configured';continue;}
    call.config.path=providerPath;
   }
   const saved=await request('/api/metadata/flows/'+flow.apiName,token,'PUT',{...flow,status:'Active'});
   if(saved.status!==200){report.status='flow_activation_failed_http_'+saved.status;continue;}
   report.status='activated';
   const execution=await request('/api/flows/'+flow.apiName+'/execute',token,'POST',{});
   report.executeHttpStatus=execution.status;
   report.status=execution.status===200&&execution.data?.result?.status==='completed'?'flow_completed':'flow_response_http_'+execution.status;
   report.flowStatus=execution.data?.result?.status||execution.data?.status||'unknown';
  }catch(error){report.status='exception';report.error=String(error.message||error).slice(0,100).replace(/Bearer\s+\S+/g,'[redacted]');}
 }
}finally{await record();console.log(JSON.stringify(result));}
