const base=process.env.METADRIVE_API_BASE??'https://metadrive-production.up.railway.app';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Missing CI authentication secrets');
async function api(path,token,method='GET',body){
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(path+' HTTP '+r.status);return data;
}
const token=(await api('/api/auth/login',null,'POST',{email,password})).access_token;
if(!token)throw Error('Auth token absent');
const [flowData,interviewData,logData]=await Promise.all(['/api/metadata/flows','/api/metadata/flow-interviews','/api/metadata/flow-logs'].map(p=>api(p,token)));
const flows=flowData.flows??[],interviews=interviewData.interviews??[],logs=logData.logs??[];
const scheduled=flows.filter(f=>/schedule/i.test(f.flowType??'')||f.startConfig?.schedule||f.startConfig?.frequency||f.startConfig?.scheduleType);
const parents=flows.filter(f=>(f.elements??[]).some(e=>/subflow/i.test(e.type??'')));
console.log('LIVE FLOW AUDIT',JSON.stringify({flowCount:flows.length,scheduled:scheduled.map(f=>({apiName:f.apiName,status:f.status,flowType:f.flowType})),subflowParents:parents.map(f=>({apiName:f.apiName,status:f.status,flowType:f.flowType})),interviewCount:interviews.length,failureLogCount:logs.length}));
const suffix='E2EValidation_'+Date.now().toString(36);
const child='MD_'+suffix+'_Child',parent='MD_'+suffix+'_Parent';
const existingNames=new Set(flows.map(f=>f.apiName));if(existingNames.has(child)||existingNames.has(parent))throw Error('Unique test identity already exists');
const definition=(apiName,elements,connectors)=>({apiName,label:apiName,description:'Ephemeral no-write production Flow verification',flowType:'Autolaunched Flow',status:'Active',versionNumber:1,activeVersion:null,triggerObject:null,startConfig:{},elements,connectors,resources:[],versions:[]});
let childCreated=false,parentCreated=false;
try{
 const childFlow=definition(child,[{id:1,type:'Start',label:'Start',config:{}},{id:2,type:'End',label:'End',config:{}}],[{id:'start-end',from:1,to:2,kind:'normal',label:''}]);
 await api('/api/metadata/flows/'+child,token,'PUT',childFlow);childCreated=true;
 const parentFlow=definition(parent,[{id:1,type:'Start',label:'Start',config:{}},{id:2,type:'Subflow',label:'Invoke verification child',config:{flowApiName:child,inputValues:[],outputValues:[]}},{id:3,type:'End',label:'End',config:{}}],[{id:'start-child',from:1,to:2,kind:'normal',label:''},{id:'child-end',from:2,to:3,kind:'normal',label:''}]);
 await api('/api/metadata/flows/'+parent,token,'PUT',parentFlow);parentCreated=true;
 const result=await api('/api/flows/'+parent+'/execute',token,'POST',{});
 if(!result.outputs||result.interviewId)throw Error('Parent subflow invocation did not finish synchronously');
 console.log('LIVE SUBFLOW EXECUTION PASSED',JSON.stringify({parent,child,status:'completed',outputsPresent:!!result.outputs}));
}finally{
 for(const name of [parent,child]){
  if(name===parent&&!parentCreated||name===child&&!childCreated)continue;
  try {await api('/api/metadata/flows/'+name+'/deactivate',token,'POST',{});await api('/api/metadata/flows/'+name,token,'DELETE');console.log('CLEANUP PASSED',name)}
  catch(err){console.error('CLEANUP FAILED',name,String(err));process.exitCode=1;}
 }
}
