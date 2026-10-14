/** Authorised, idempotent component publication using the existing OneEngine API. */
import {replacementDefinitions} from '../apps/server/src/modules/metadata/phase2-replacement-definitions.mjs';
const base=(process.env.METADRIVE_API_URL??'').replace(/\/$/,'').replace(/\/api$/,'');
const approved=process.env.METADRIVE_PHASE2_PUBLISH_APPROVED==='true';
const expectedTenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
if(!approved){console.log('Dry run: 39 replacement definitions, no changes');process.exit(0);}
if(!/^https:\/\//.test(base)||!expectedTenant)throw Error('Expected HTTPS endpoint and tenant are mandatory');
const email=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!email||!password)throw Error('GitHub Actions admin secret configuration is required');
let bearer='';
async function api(path,method='GET',body){
 const resp=await fetch(base+'/api'+path,{method,headers:{accept:'application/json',...(bearer?{authorization:'Bearer '+bearer}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const raw=await resp.text();let data;try{data=JSON.parse(raw)}catch{data={error:'Non-JSON API response'};}
 if(!resp.ok)throw Error(method+' '+path+' HTTP '+resp.status+': '+String(data.error??'request rejected').slice(0,150));
 return data;
}
const login=await api('/auth/login','POST',{email,password});bearer=login.access_token;
if(!bearer||login.user?.tenantId!==expectedTenant)throw Error('Authentication or tenant identity verification failed');
const definitions=replacementDefinitions();
if(definitions.length!==39||new Set(definitions.map(x=>x.apiName)).size!==39)throw Error('Replacement metadata invalid');
let current=await api('/component-library');
if(!current.canManage)throw Error('OneEngine denied components:manage permission');
let created=0,published=0,verified=0;
for(const definition of definitions){
 const original=current.components.find(x=>x.apiName===definition.apiName);
 if(original?.trustedBundled)throw Error('Refusing bundled component overwrite');
 if(original&&original.status==='Published'){verified++;continue;}
 if(!original){
  const kind=definition.apiName.slice('RecoveredShared'.length);
  const source=`export default function Component({label,title,kind:kindProp}) {
 const resolved=kindProp||'${kind}';
 const heading=title||label||resolved;
 return <div role="group" aria-label={heading}>{heading}</div>;
}`;
  await api('/component-library','POST',{apiName:definition.apiName,label:definition.label,description:definition.description,surfaces:definition.surfaces,resize:definition.resize,jsxSource:source,cssSource:'',publicationStatus:'Draft',propertyDefinitions:definition.propertyDefinitions});
  created++;
 }
 const before=(await api('/component-library')).components.find(x=>x.apiName===definition.apiName);
 if(!before||before.trustedBundled||before.status!=='Draft')throw Error('Unsafe component lifecycle '+definition.apiName);
 await api('/component-library/'+encodeURIComponent(definition.apiName)+'/publish','POST');
 published++;
 const after=(await api('/component-library')).components.find(x=>x.apiName===definition.apiName);
 if(!after||after.status!=='Published'||after.trustedBundled||!definition.surfaces.every(s=>after.surfaces.includes(s)))throw Error('Publication verification failed '+definition.apiName);
 verified++;
}
const final=await api('/component-library');
if(!definitions.every(d=>final.components.some(x=>x.apiName===d.apiName&&x.status==='Published'&&x.trustedBundled===false)))throw Error('Registry final validation failed');
console.log(JSON.stringify({tenantVerified:true,expected:39,created,published,verified:definitions.length,rbac:'authorised API'}));
