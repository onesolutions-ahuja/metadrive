// Idempotent, authorised Chatter installation and post-deploy smoke verification.
// Never log access tokens, contact numbers, customer messages, or credentials.
import {writeFile} from 'node:fs/promises';
const origin=String(process.env.METADRIVE_API_URL||'').trim().replace(/\/$/,'');
const tenantId=process.env.METADRIVE_EXPECTED_TENANT_ID;
const email=process.env.METADRIVE_ADMIN_EMAIL;
const password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!origin.startsWith('https://')||!tenantId||!email||!password)throw Error('Chatter installer requires HTTPS, expected tenant and deployment credentials');
let token='';
const report={authenticated:false,installed:false,page:false,flows:false,rbac:false,webhook:false,
  denialTests:false,incomingTest:'not_run',outgoingTest:'not_run'};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,method='GET',data,authenticated=true){
 const response=await fetch(origin+'/api'+path,{method,
   headers:{accept:'application/json',...(data?{'content-type':'application/json'}:{}),
     ...(authenticated&&token?{authorization:'Bearer '+token}:{})},
   ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(45000)});
 const raw=await response.text();let payload;
 try{payload=JSON.parse(raw)}catch{payload={error:raw.slice(0,200)}}
 return {status:response.status,data:payload};
}
const ensure=(v,reason)=>{if(!v)throw Error(reason)};
try{
 const login=await request('/auth/login','POST',{email,password},false);
 ensure(login.status===200&&login.data.access_token,'Chatter admin login failed');
 ensure(login.data.user?.tenantId===tenantId,'Refusing Chatter installation for unexpected tenant');
 token=login.data.access_token;report.authenticated=true;
 const installed=await request('/records/Connector_App__c?limit=200');
 ensure(installed.status===200,'Cannot read tenant connector installation status');
 const row=(installed.data.records||[]).find(x=>x.AppKey__c==='whatsapp');
 ensure(row,'WhatsApp connector is missing from AppExchange');
 if(row.Installed__c!==true){
   const install=await request('/flows/'+encodeURIComponent(row.InstallFlow__c||'ONE_Install_Connector')+'/execute','POST',{AppKey:'whatsapp'});
   ensure(install.status===200,'Existing connector installer failed HTTP '+install.status);
 }
 report.installed=true;
 let page,flows,object;
 for(let i=0;i<72;i++){
   const [pagesResult,flowsResult,objectsResult]=await Promise.all([
     request('/metadata/pages'),request('/metadata/flows'),request('/metadata/objects')]);
   if(pagesResult.status===200&&flowsResult.status===200&&objectsResult.status===200){
     page=(pagesResult.data.pages||[]).find(x=>x.apiName==='UNE_CHATTER');
     flows=flowsResult.data.flows||[];
     object=(objectsResult.data.objects||[]).find(x=>x.apiName==='Communication_Records__c');
   }
   if(page?.status==='Active' && flows?.some(x=>x.apiName==='CHATTER_SEND_MESSAGE'&&x.status==='Active')
       && flows?.some(x=>x.apiName==='CHATTER_ASSIGN_CONVERSATION'&&x.status==='Active')
       && object?.fields?.some(x=>x.apiName==='Channel_Account__c'))break;
   await sleep(10000);
 }
 ensure(page?.pageType==='Record Page'&&page?.targetObject==='Communication_Records__c'&&page?.status==='Active',
   'Active Communication Record Page was not installed on production');
 report.page=true;
 ensure(flows?.some(x=>x.apiName==='CHATTER_SEND_MESSAGE'&&x.status==='Active'&&x.activeVersion)
   &&flows?.some(x=>x.apiName==='CHATTER_ASSIGN_CONVERSATION'&&x.status==='Active'&&x.activeVersion),
   'Published Send and Assign Flows missing from production');
 report.flows=true;
 ensure(object?.fields?.some(x=>x.apiName==='Channel_Account__c'),'Communication channel field missing');
 const grants=await request('/chatter/access');
 ensure(grants.status===200 && Array.isArray(grants.data.grants),'Authorised Chatter permission endpoint unavailable');
 ensure(grants.data.grants.some(x=>x.canRead===true&&x.canSend===true),'No authorised live WhatsApp account grant exists for installer');
 report.rbac=true;
 const unauth=await request('/chatter/access','GET',undefined,false);
 ensure(unauth.status===401,'Unauthenticated Chatter access was not denied');
 const tampered=await request('/whatsapp/webhook','POST',{object:'whatsapp_business_account',entry:[]},false);
 ensure(tampered.status===403,'Unsigned provider webhook was not rejected');
 const forbidden={ConversationId:JSON.stringify(['ungranted-account','447700900000']),
   ChannelAccountId:'ungranted-account',RecipientPhone:'447700900000',Body:'test'};
 const rejected=await request('/flows/CHATTER_SEND_MESSAGE/execute','POST',forbidden);
 ensure(rejected.status===403||rejected.status===400,'Forged Send Flow did not fail closed');
 const assign=await request('/flows/CHATTER_ASSIGN_CONVERSATION/execute','POST',
   {...forbidden,AssigneeId:login.data.user.id});
 ensure(assign.status===403||assign.status===400,'Forged Assign Flow did not fail closed');
 report.denialTests=true;
 const webhook=await fetch(origin+'/api/whatsapp/webhook',{signal:AbortSignal.timeout(20000)});
 report.webhook=webhook.status===403; // verification endpoint must reject unverified GETs
 ensure(report.webhook,'Webhook verification endpoint is not enforcing a token');
 // Genuine Meta incoming and provider-accepted outgoing require a designated test
 // contact and provider delivery receipt; never send to an arbitrary customer.
 report.incomingTest='requires_meta_signed_message';
 report.outgoingTest='requires_approved_test_contact';
 console.log(JSON.stringify(report));
}finally{
 await writeFile('chatter-live-install-result.json',JSON.stringify(report,null,2));
}
