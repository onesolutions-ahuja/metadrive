// One-time tenant-owned Chatter page binding reconciliation through normal metadata API.
// Only fills missing properties from the registered app package; never overwrites custom values.
import {readFileSync} from 'node:fs';
const base='https://metadrive-production.up.railway.app/api';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Existing CI credentials required');
async function call(path,method='GET',payload,token=''){
 const r=await fetch(base+path,{method,headers:{accept:'application/json',...(payload?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};
}
const login=await call('/auth/login','POST',{email,password});
if(login.status!==200||login.data.user?.tenantId!=='unesolutions-dev' ||
 String(login.data.user?.email||email).toLowerCase()!=='support@unesolutions.co.uk')throw Error('Expected authorized tenant user is not authenticated');
const token=login.data.access_token;
const pages=await call('/metadata/pages','GET',undefined,token);
if(pages.status!==200)throw Error('Chatter metadata read denied: '+pages.status);
const page=pages.data.pages?.find(p=>p.apiName==='UNE_CHATTER');
const component=page?.components?.find(c=>c.type==='Custom:ChatterInbox');
if(!page||page.status!=='Active'||!component)throw Error('Active Chatter page/component not found');
const catalog=JSON.parse(readFileSync('apps/server/data/installable-app-packages.json','utf8'));
const spec=catalog.packages.find(p=>p.appKey==='whatsapp')?.pages?.find(p=>p.apiName==='UNE_CHATTER')
 ?.components?.find(c=>c.type==='Custom:ChatterInbox')?.properties;
if(!spec||spec.recordPresenterApiName!=='CommunicationThread')throw Error('Missing trusted packaged Chatter presenter contract');
const missing={};
for(const key of ['recordPresenterApiName','objectApiName','contactsObjectApiName','actionFlows']){
 if(component.properties?.[key]===undefined||component.properties?.[key]===null||component.properties?.[key]==='')missing[key]=spec[key];
}
if(Object.keys(missing).length){
 const updated={...page,components:page.components.map(c=>c.id===component.id?{...c,properties:{...c.properties,...missing}}:c)};
 const save=await call('/metadata/pages/UNE_CHATTER','PUT',updated,token);
 if(save.status!==200)throw Error('Chatter metadata save rejected '+save.status+' '+JSON.stringify({error:save.data?.error,details:save.data?.details}).slice(0,1000));
}
const current=await call('/metadata/pages','GET',undefined,token);
const saved=current.data.pages?.find(p=>p.apiName==='UNE_CHATTER')?.components?.find(c=>c.id===component.id);
if(current.status!==200||saved?.properties?.recordPresenterApiName!=='CommunicationThread'||
 saved?.properties?.objectApiName!=='Communication_Records__c'||
 !saved?.properties?.actionFlows?.send?.flowApiName)throw Error('Saved Chatter presenter/action binding is not valid');
console.log('CHATTER_PAGE_BINDING_REPAIR '+JSON.stringify({success:true,changedProperties:Object.keys(missing),presenterReady:true,sendFlowBound:true}));
