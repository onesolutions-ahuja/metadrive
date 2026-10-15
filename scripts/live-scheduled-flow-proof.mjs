const base='https://metadrive-production.up.railway.app';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Missing CI credentials');
async function api(path,token,method='GET',body){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(path+' HTTP '+response.status+' '+JSON.stringify(data).slice(0,500));return data;}
const token=(await api('/api/auth/login',null,'POST',{email,password})).access_token;
if(!token)throw Error('Authentication failed');
const objects=(await api('/api/metadata/objects',token)).objects??[];
const target=objects.find(o=>o.apiName==='Account')??objects.find(o=>!o.apiName.startsWith('Communication_'));
if(!target)throw Error('No safe object metadata for scheduled no-write verification');
const now=new Date(Date.now()-120000);
const date=now.toISOString().slice(0,10),time=now.toISOString().slice(11,16);
const name='MD_Scheduled_Verification_'+Date.now().toString(36);
const flow={apiName:name,label:name,description:'Temporary, no-write scheduled Flow verification. No business actions.',flowType:'Schedule-Triggered Flow',status:'Active',versionNumber:1,activeVersion:null,triggerObject:target.apiName,startConfig:{startDate:date,startTime:time,timeZone:'UTC',frequency:'Once'},elements:[{id:1,type:'Start',label:'Start',config:{}},{id:2,type:'End',label:'End',config:{}}],connectors:[{id:'toEnd',from:1,to:2,kind:'normal',label:''}],resources:[],versions:[]};
await api('/api/metadata/flows/'+name,token,'PUT',flow);
console.log('SCHEDULED FLOW CREATED',JSON.stringify({apiName:name,triggerObject:target.apiName,scheduledAt:date+'T'+time+':00Z',version:1}));
const verified=(await api('/api/metadata/flows',token)).flows?.find(f=>f.apiName===name);
if(!verified||verified.status!=='Active')throw Error('Scheduled Flow not active');
console.log('SCHEDULED FLOW VERIFIED',JSON.stringify({apiName:name,status:verified.status}));
