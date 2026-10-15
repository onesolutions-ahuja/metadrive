// One-time, tenant-checked repair of packaged Chatter Flow input resources.
// Uses the same authenticated OneEngine metadata API as Flow Builder.
// Never logs tokens, customer conversations, message contents, or named credentials.
const base=String(process.env.METADRIVE_API_URL||'https://metadrive-production.up.railway.app').replace(/\/$/,'')+'/api';
const email=process.env.METADRIVE_TEST_EMAIL, password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Existing authenticated CI credentials are required');
let token='';
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};
}
const login=await api('/auth/login','POST',{email,password});
if(login.status!==200||login.data.user?.tenantId!=='unesolutions-dev'||!login.data.access_token)throw Error('Refusing unknown tenant or unauthenticated change');
token=login.data.access_token;
const catalogue=await api('/metadata/flows');
if(catalogue.status!==200)throw Error('Cannot inspect Flows: '+catalogue.status);
const wanted={
 CHATTER_ASSIGN_CONVERSATION:['TargetRecordId'],
 CHATTER_SEND_MESSAGE:['AuthorisedMessagePath','AuthorisedCredentialId','SenderPhone','AssignedUserId','RecipientPhone']
};
const report={};
for(const [name,needed] of Object.entries(wanted)){
 const flow=(catalogue.data.flows||[]).find(f=>f.apiName===name);
 if(!flow||flow.status!=='Active'||!flow.activeVersion)throw Error(name+' must exist and be published before repairing');
 const resources=[...(flow.resources||[])];
 let changed=false;
 for(const id of needed){
  let resource=resources.find(r=>r.name===id);
  if(!resource){
   resource={name:id,label:id,type:'Variable',dataType:'Text',isCollection:false,availableForInput:true,availableForOutput:false,value:''};
   resources.push(resource);changed=true;
  }else if(resource.availableForInput!==true){
   resources.splice(resources.indexOf(resource),1,{...resource,availableForInput:true});changed=true;
  }
 }
 if(changed){
  const candidate={...flow,resources,status:'Active'};
  const check=await api('/metadata/flows/'+name+'/validate','POST',candidate);
  if(check.status!==200||check.data.errors?.length)throw Error(name+' validation rejected resource repair: '+JSON.stringify({status:check.status,errors:check.data.errors,error:check.data.error}).slice(0,1300));
  const update=await api('/metadata/flows/'+name,'PUT',candidate);
  if(update.status!==200)throw Error(name+' publication failed: '+JSON.stringify({status:update.status,error:update.data.error,details:update.data.details}).slice(0,1300));
 }
 report[name]={changed};
}
const verify=await api('/metadata/flows');
if(verify.status!==200)throw Error('Cannot verify publication');
for(const [name,needed] of Object.entries(wanted)){
 const flow=(verify.data.flows||[]).find(f=>f.apiName===name);
 if(flow?.status!=='Active'||!flow.activeVersion||needed.some(n=>!flow.resources?.some(r=>r.name===n&&r.availableForInput===true)))throw Error('Failed post-publication verification: '+name);
 report[name].activeVersion=flow.activeVersion;
}
console.log('CHATTER_FLOW_CONTRACT_REPAIR '+JSON.stringify(report));
