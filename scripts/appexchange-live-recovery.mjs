import assert from 'node:assert/strict';
const origin=process.env.METADRIVE_API_URL;
const email=process.env.METADRIVE_ADMIN_EMAIL;
const password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!origin||!email||!password) throw Error('Missing live test configuration');
const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
assert.equal(response.status,200);
const login=await response.json();
assert.equal(login.user?.tenantId,process.env.METADRIVE_EXPECTED_TENANT_ID);
const token=login.access_token;
const get=async path=>{const r=await fetch(origin+'/api'+path,{headers:{authorization:'Bearer '+token}});assert.equal(r.status,200);return r.json()};
const apps=(await get('/connector-apps/catalog')).records;
const app=apps.find(x=>x.AppKey__c==='xero');
assert(app&&app.Installed__c===false&&app.TrialUsed__c===false,'SQL-recovered Xero state must remain uninstalled and unused');
const flow=(await get('/metadata/flows')).flows.find(x=>x.apiName==='CHATTER_SEND_MESSAGE');
assert(flow);
const element=flow.elements.find(x=>x.config?.namedCredentialResource==='{!AuthorisedCredentialId}');
assert.deepEqual(element?.config?.allowedCredentialAppKeys,['whatsapp']);
const prior=apps.filter(x=>x.AppKey__c!=='xero').map(x=>[x.AppKey__c,x.Installed__c,x.LicenceStatus__c,x.TrialUsed__c]);
const exec=async name=>{
 const r=await fetch(origin+'/api/flows/'+encodeURIComponent(name)+'/execute',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({AppKey:'xero'})});
 if(!r.ok){const data=await r.json().catch(()=>({}));throw Error('Lifecycle failed '+r.status+' '+String(data.error??'').slice(0,240))}
};
const state=async()=> (await get('/connector-apps/catalog')).records;
let installed=false;
try {
 await exec(app.InstallFlow__c);installed=true;
 assert.equal((await state()).find(x=>x.AppKey__c==='xero')?.Installed__c,true);
 await exec(app.UninstallFlow__c);installed=false;
 assert.equal((await state()).find(x=>x.AppKey__c==='xero')?.Installed__c,false);
 await exec(app.InstallFlow__c);installed=true;
 assert.equal((await state()).find(x=>x.AppKey__c==='xero')?.Installed__c,true);
} finally {
 if(installed) await exec(app.UninstallFlow__c);
}
const after=await state();
assert.equal(after.find(x=>x.AppKey__c==='xero')?.Installed__c,false);
assert.equal(after.find(x=>x.AppKey__c==='xero')?.TrialUsed__c,false);
assert.deepEqual(after.filter(x=>x.AppKey__c!=='xero').map(x=>[x.AppKey__c,x.Installed__c,x.LicenceStatus__c,x.TrialUsed__c]),prior);
const denied=await fetch(origin+'/api/connector-apps/catalog');
assert.equal(denied.status,401);
console.log(JSON.stringify({result:'PASS',liveTenant:true,scopedFlow:true,cycle:'install/uninstall/reinstall/uninstall',otherAppsUnchanged:true,trialUnused:true,unauthenticatedDenied:true}));
