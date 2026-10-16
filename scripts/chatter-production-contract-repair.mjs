// Reconcile only packaged Chatter Flow contracts and page input binding via RBAC-protected APIs.
// No account grants, contacts, messages, secrets or broad tenant metadata are changed.
import {readFile} from 'node:fs/promises';
const origin='https://metadrive-production.up.railway.app/api';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('CI authorization missing');
let token='';
async function request(path,method='GET',body){
 const response=await fetch(origin+path,{method,headers:{accept:'application/json',
  ...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
 return {status:response.status,data:await response.json().catch(()=>({}))};
}
const fail=(label,res)=>{throw Error(label+' HTTP '+res.status+': '+JSON.stringify({error:res.data?.error,details:res.data?.details}).slice(0,1300))};
const login=await request('/auth/login','POST',{email,password});
if(login.status!==200||login.data.user?.tenantId!=='unesolutions-dev'||!login.data.access_token)fail('unexpected login tenant',login);
token=login.data.access_token;
const catalog=JSON.parse(await readFile(new URL('../apps/server/data/installable-app-packages.json',import.meta.url),'utf8'));
const pkg=catalog.packages.find(x=>x.appKey==='whatsapp');
if(!pkg)throw Error('Packaged WhatsApp contract not found');
const required=['CHATTER_SEND_MESSAGE','CHATTER_ASSIGN_CONVERSATION'];
const existing=await request('/metadata/flows');
if(existing.status!==200)fail('metadata flows',existing);
for(const name of required){
 const spec=pkg.flows.find(x=>x.apiName===name);
 const live=existing.data.flows?.find(x=>x.apiName===name);
 if(!spec||!live)throw Error('Missing existing packaged Flow '+name);
 if(live.status!=='Active'||!live.activeVersion)throw Error('Refusing to replace inactive Flow '+name);
 const candidate={...spec,apiName:name,status:'Active'};
 const valid=await request('/metadata/flows/'+encodeURIComponent(name)+'/validate','POST',candidate);
 if(valid.status!==200)fail(name+' validation',valid);
 if(valid.data?.errors?.length)throw Error(name+' invalid: '+JSON.stringify(valid.data.errors).slice(0,1300));
}
const pages=await request('/metadata/pages');
if(pages.status!==200)fail('metadata pages',pages);
const page=pages.data.pages?.find(x=>x.apiName==='UNE_CHATTER');
const component=page?.components?.find(x=>x.type==='Custom:ChatterInbox');
if(!page||!component)throw Error('Chatter metadata page or registered component missing');
const assign=component.properties?.actionFlows?.assign;
if(!assign||assign.flowApiName!=='CHATTER_ASSIGN_CONVERSATION')throw Error('Unexpected Chatter assignment metadata');
const report={flows:[],assignmentBinding:false};
for(const name of required){
 const spec=pkg.flows.find(x=>x.apiName===name);
 const result=await request('/metadata/flows/'+encodeURIComponent(name),'PUT',{...spec,status:'Active'});
 if(result.status!==200)fail(name+' publish',result);
 report.flows.push({name,active:result.data.flow?.status==='Active'});
}
const components=page.components.map(c=>c.id===component.id
 ? {...c,properties:{...c.properties,actionFlows:{...c.properties.actionFlows,
   assign:{...assign,inputs:{...assign.inputs,AssigneeId:'$event.assigneeId'}}}}} : c);
const updated=await request('/metadata/pages/UNE_CHATTER','PUT',{...page,components});
if(updated.status!==200)fail('Chatter page binding',updated);
const [flowsAfter,pagesAfter]=await Promise.all([request('/metadata/flows'),request('/metadata/pages')]);
const published=required.every(name=>flowsAfter.data.flows?.some(f=>f.apiName===name&&f.status==='Active'&&f.activeVersion));
const newPage=pagesAfter.data.pages?.find(p=>p.apiName==='UNE_CHATTER');
const mapped=newPage?.components?.find(c=>c.id===component.id)?.properties?.actionFlows?.assign?.inputs?.AssigneeId==='$event.assigneeId';
if(!published||!mapped)throw Error('Chatter post-publication validation failed');
report.assignmentBinding=true;
console.log('CHATTER_CONTRACT_REPAIR '+JSON.stringify(report));
