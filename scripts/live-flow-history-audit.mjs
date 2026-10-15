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
const safe=parents.filter(f=>f.status==='Active'&&f.flowType==='Autolaunched Flow'&&(f.elements??[]).every(e=>['Start','End','Subflow','Subflow Element','Assignment'].includes(e.type))&&(f.elements??[]).some(e=>/subflow/i.test(e.type)));
console.log('LIVE FLOW AUDIT',JSON.stringify({flowCount:flows.length,scheduled:scheduled.map(f=>({apiName:f.apiName,status:f.status,flowType:f.flowType})),subflowParents:parents.map(f=>({apiName:f.apiName,status:f.status,flowType:f.flowType,types:(f.elements??[]).map(e=>e.type)})),interviewCount:interviews.length,interviewTypes:[...new Set(interviews.map(i=>i.kind))],failureLogCount:logs.length,safeNoWriteCandidateCount:safe.length}));
if(safe.length===1){const parent=safe[0];const r=await api('/api/flows/'+encodeURIComponent(parent.apiName)+'/execute',token,'POST',{});console.log('LIVE NO-WRITE SUBFLOW RESULT',JSON.stringify({flow:parent.apiName,hasOutputs:!!r.outputs,waiting:!!r.interviewId}));}
else console.log('SKIPPED live invocation: no unique verifiably no-write active parent Flow');
