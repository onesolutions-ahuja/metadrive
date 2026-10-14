// Run once or repeatedly with explicit operator approval:
// METADRIVE_API_URL=https://... METADRIVE_ADMIN_EMAIL=... METADRIVE_ADMIN_PASSWORD=...
// METADRIVE_DEMO_SEED_APPROVED=true node scripts/install-kiosk-demo-data.mjs
// An omitted approval performs only a dry run and never touches a tenant.
import {kioskObjectDefinitions,demoCategories,demoProducts} from './kiosk-demo-fixtures.mjs';

const base=(process.env.METADRIVE_API_URL ?? '').replace(/\/$/,'').replace(/\/api$/,'');
const approved=process.env.METADRIVE_DEMO_SEED_APPROVED==='true';
const expectedObjects=kioskObjectDefinitions.map(item=>item.apiName);
if(!approved){
  console.log(JSON.stringify({mode:'dry-run',objects:expectedObjects,categories:demoCategories.length,products:demoProducts.length}));
  process.exit(0);
}
if(!/^https:\/\//i.test(base))throw Error('An HTTPS METADRIVE_API_URL is required for approved installation');
const email=process.env.METADRIVE_ADMIN_EMAIL;
const password=process.env.METADRIVE_ADMIN_PASSWORD;
if(!email||!password)throw Error('Administrative credentials are required for central RBAC enforcement');
let token='';
async function api(path,method='GET',body){
  const response=await fetch(base+'/api'+path,{
    method,headers:{'accept':'application/json',...(token?{authorization:'Bearer '+token}:{}),
      ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{data={error:raw.slice(0,300)}}
  if(!response.ok)throw Error(method+' '+path+' failed ('+response.status+'): '+JSON.stringify(data).slice(0,900));
  return data;
}
const login=await api('/auth/login','POST',{email,password});
token=login.access_token;
const expectedTenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
if(expectedTenant && login.user?.tenantId !== expectedTenant) throw Error('Tenant mismatch: installer refused all writes');
if(!token)throw Error('Admin session did not return an access token');
const initial=await api('/metadata/objects');
const existing=new Set((initial.objects??[]).map(item=>item.apiName));
if(!existing.has('Sale__c'))throw Error('Existing Sale__c is required. No objects or records were modified.');
// Use the existing secured Object Manager endpoint, which validates every
// relationship and grants initial system-administrator object/field permissions.
let created=0;
let seededRecords=0;
for(const definition of kioskObjectDefinitions){
  if(existing.has(definition.apiName))continue;
  await api('/metadata/objects','POST',definition);
  existing.add(definition.apiName);created++;
}
async function matchingRecord(object,key,value){
  const result=await api('/records/'+encodeURIComponent(object)+'?search='+encodeURIComponent(String(value)));
  return (result.records??[]).find(record=>String(record[key]??'')===String(value));
}
async function upsertDemo(object,key,values){
  const found=await matchingRecord(object,key,values[key]);
  if(found)return found;
  const response=await api('/records/'+encodeURIComponent(object),'POST',values);
  if(!response.record?.Id)throw Error('Missing record ID after '+object+' creation');
  seededRecords++;
  return response.record;
}
const categoryIds=new Map();
for(const category of demoCategories){
  const record=await upsertDemo('ProductCategory__c','Name',category);
  if(!record?.Id)throw Error('Category write returned no ID');
  categoryIds.set(category.Name,record.Id);
}
for(const product of demoProducts){
  const {category,...values}=product;
  const parentId=categoryIds.get(category);
  if(!parentId)throw Error('Unrecognised category '+category);
  await upsertDemo('Product__c','Name',{...values,CategoryId:parentId});
}
const observed=await api('/metadata/objects');
const installed=new Set((observed.objects??[]).map(item=>item.apiName));
for(const name of expectedObjects)if(!installed.has(name))throw Error('Object activation not verified: '+name);
for(const category of demoCategories){
  const record=await matchingRecord('ProductCategory__c','Name',category.Name);
  if(!record?.Id)throw Error('Category seed not verified: '+category.Name);
}
for(const product of demoProducts){
  const record=await matchingRecord('Product__c','Name',product.Name);
  if(!record?.Id || record.SKU!==product.SKU || !record.CategoryId)
    throw Error('Product seed not verified: '+product.Name);
}
console.log(JSON.stringify({installed:true,createdObjects:created,
  verifiedObjects:expectedObjects,fixtureCategories:demoCategories.length,fixtureProducts:demoProducts.length,seededRecords,
  rbac:'Enforced by authenticated Object and Record APIs'}));
