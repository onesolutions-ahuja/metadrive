const origin='https://metadrive-production.up.railway.app/api';
let token='';
async function api(path,method='GET',data){const r=await fetch(origin+path,{method,headers:{accept:'application/json',...(data?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json().catch(()=>({}))}}
const login=await api('/auth/login','POST',{email:process.env.METADRIVE_TEST_EMAIL,password:process.env.METADRIVE_TEST_PASSWORD});
if(login.status!==200||login.data.user?.tenantId!=='unesolutions-dev')throw Error('Unauthorised tenant');
token=login.data.access_token;
const all=await api('/metadata/flows');if(all.status!==200)throw Error('Flow read refused HTTP '+all.status);
const flow=all.data.flows?.find(f=>f.apiName==='CHATTER_ASSIGN_CONVERSATION');
if(!flow)throw Error('Assign Flow absent');
const resource=(flow.resources||[]).find(r=>r.name==='TargetRecordId');
console.log('CHatter_TargetRecordId_BEFORE '+JSON.stringify({status:flow.status,activeVersion:flow.activeVersion,resource:resource?{type:resource.type,availableForInput:resource.availableForInput,dataType:resource.dataType}:null}));
if(resource?.type==='Variable'&&resource.availableForInput===true){console.log('ALREADY_VALID');process.exit(0)}
const next={...flow,status:'Active',resources:(flow.resources||[]).filter(r=>r.name!=='TargetRecordId').concat([{name:'TargetRecordId',label:'TargetRecordId',type:'Variable',dataType:'Text',isCollection:false,availableForInput:true,availableForOutput:false,value:''}])};
const validated=await api('/metadata/flows/CHATTER_ASSIGN_CONVERSATION/validate','POST',next);
if(validated.status!==200||validated.data.errors?.length)throw Error('Flow validation blocked '+JSON.stringify({status:validated.status,errors:validated.data.errors}).slice(0,1200));
const published=await api('/metadata/flows/CHATTER_ASSIGN_CONVERSATION','PUT',next);
if(published.status!==200)throw Error('Flow publication blocked HTTP '+published.status+' '+JSON.stringify({error:published.data.error,details:published.data.details}).slice(0,900));
const after=await api('/metadata/flows');const live=after.data.flows?.find(f=>f.apiName===flow.apiName);
if(live?.status!=='Active'||!live.activeVersion||!live.resources?.some(r=>r.name==='TargetRecordId'&&r.availableForInput===true))throw Error('Post-publish verification failed');
console.log('CHatter_TargetRecordId_AFTER '+JSON.stringify({status:live.status,activeVersion:live.activeVersion,input:true}));
