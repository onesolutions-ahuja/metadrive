import assert from 'node:assert/strict';
const origin=process.env.METADRIVE_API_URL;
const email=process.env.METADRIVE_ADMIN_EMAIL;
const password=process.env.METADRIVE_ADMIN_PASSWORD;
const tenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
const key=process.env.METADRIVE_LIFECYCLE_APP_KEY || 'xero';
if(!origin?.startsWith('https://')||!email||!password||!tenant) throw Error('Missing authenticated live acceptance configuration');
async function req(path,token,method='GET',body){
 const response=await fetch(origin+'/api'+path,{method,signal:AbortSignal.timeout(40000),
 headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json()}catch{data={}}return {status:response.status,data};
}
const auth=await req('/auth/login',null,'POST',{email,password});
assert.equal(auth.status,200,'Cannot authenticate to live tenant');
assert.equal(auth.data.user?.tenantId,tenant,'Wrong live tenant');
const token=auth.data.access_token;
const catalog=async()=>{const r=await req('/connector-apps/catalog',token);assert.equal(r.status,200,'Catalog denied');return r.data.records};
const before=await catalog();
const matches=before.filter(x=>x.AppKey__c===key);
assert.equal(matches.length,1,'Test package must have one unique installation record');
const app=matches[0];
assert.equal(app.Installed__c,false,'Refusing to modify an already installed application');
assert.equal(app.TrialUsed__c,false,'Refusing to modify previous trial history');
assert(app.InstallFlow__c&&app.UninstallFlow__c,'Lifecycle Flow metadata not available');
const allOther=before.filter(x=>x.AppKey__c!==key).map(x=>[x.AppKey__c,x.Installed__c,x.LicenceStatus__c,x.TrialUsed__c]);
async function flow(name){const r=await req('/flows/'+encodeURIComponent(name)+'/execute',token,'POST',{AppKey:key});assert.equal(r.status,200,'Lifecycle action failed HTTP '+r.status+' '+String(r.data.error||r.data.message||'unknown').slice(0,400));}
let changed=false;
try{
 await flow(app.InstallFlow__c);changed=true;
 assert.equal((await catalog()).find(x=>x.AppKey__c===key).Installed__c,true);
 await flow(app.UninstallFlow__c);changed=false;
 assert.equal((await catalog()).find(x=>x.AppKey__c===key).Installed__c,false);
 await flow(app.InstallFlow__c);changed=true;
 assert.equal((await catalog()).find(x=>x.AppKey__c===key).Installed__c,true);
}finally{
 if(changed){await flow(app.UninstallFlow__c);changed=false;}
}
const after=await catalog();
assert.equal(after.find(x=>x.AppKey__c===key).Installed__c,false);
assert.equal(after.find(x=>x.AppKey__c===key).TrialUsed__c,false);
assert.deepEqual(after.filter(x=>x.AppKey__c!==key).map(x=>[x.AppKey__c,x.Installed__c,x.LicenceStatus__c,x.TrialUsed__c]),allOther);
console.log(JSON.stringify({outcome:'PASS',tenantVerified:true,lifecycle:'install/uninstall/reinstall/uninstall',restored:true,otherPackagesUnchanged:true,trialUntouched:true}));
