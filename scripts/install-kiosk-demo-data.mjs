// Run once or repeatedly with explicit operator approval:
// METADRIVE_API_URL=https://... METADRIVE_ADMIN_EMAIL=... METADRIVE_ADMIN_PASSWORD=...
// METADRIVE_DEMO_SEED_APPROVED=true node scripts/install-kiosk-demo-data.mjs
// An omitted approval performs only a dry run and never touches a tenant.
import {kioskObjectDefinitions,demoCategories,demoProducts} from './kiosk-demo-fixtures.mjs';
import {customisationObjects,basketObjectExtensions,demoModifierGroups,demoModifierOptions,demoModifierAssignments} from './kiosk-commerce-capabilities.mjs';
const allDefinitions=[...kioskObjectDefinitions,...customisationObjects];

const base=(process.env.METADRIVE_API_URL ?? '').replace(/\/$/,'').replace(/\/api$/,'');
const approved=process.env.METADRIVE_DEMO_SEED_APPROVED==='true';
const expectedObjects=allDefinitions.map(item=>item.apiName);
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
for(const definition of allDefinitions){
  if(existing.has(definition.apiName))continue;
  await api('/metadata/objects','POST',definition);
  existing.add(definition.apiName);created++;
}
// Metadata creation grants access only to the system-administrator profile.
// The CI service account may use another profile; grant it an explicitly scoped
// permission set through the normal security:manage API, never bypass RBAC.
const access=await api('/metadata/permissions');
const seedUser=(access.users??[]).find(user=>user.id===login.user?.id)
  ?? (access.users??[]).find(user=>user.username?.toLowerCase()===email.toLowerCase());
if(!seedUser)throw Error('Seeder user is not registered in tenant RBAC; refusing privilege changes');
const seedProfile=(access.profiles??[]).find(profile=>profile.id===seedUser.profileId);
if(!seedProfile)throw Error('Seeder user has no matching tenant profile; refusing privilege changes');
const seederSetId='kiosk-demo-catalog-seeder';
const canSeed=expectedObjects.every(name=>seedUser.permissionSetIds?.some(id=>
  access.permissionSets?.find(set=>set.id===id)?.objectPermissions?.[name]?.create));
if(!canSeed){
  const existingSet=access.permissionSets.find(set=>set.id===seederSetId);
  const objectPermissions=Object.fromEntries(expectedObjects.map(name=>[name,{
    read:true,create:true,edit:true,delete:false,viewAll:false,modifyAll:false
  }]));
  const fieldPermissions=Object.fromEntries(allDefinitions.flatMap(object=>
    object.fields.map(field=>[object.apiName+'.'+field.apiName,{read:true,edit:true}])));
  const seedSet={
    ...(existingSet??{
      id:seederSetId,label:'Kiosk Demo Catalog Seeder',apiName:'Kiosk_Demo_Catalog_Seeder',
      license:seedProfile.license,description:'Narrow, tenant-scoped catalog demo seed privileges',
      systemPermissions:[],recordTypePermissions:{},appPermissions:{},tabPermissions:{}
    }),
    objectPermissions:{...(existingSet?.objectPermissions??{}),...objectPermissions},
    fieldPermissions:{...(existingSet?.fieldPermissions??{}),...fieldPermissions}
  };
  // Legacy connector uninstall left RBAC references to absent metadata fields.
  // Sanitize only orphaned object/field grants before using the secured
  // security:manage endpoint; valid unrelated permissions remain unchanged.
  const objectsByName=new Map((await api('/metadata/objects')).objects.map(object=>
    [object.apiName,new Set(object.fields.map(field=>field.apiName))]));
  const knownObject=name=>objectsByName.has(name);
  const knownField=key=>{
    const dot=key.indexOf('.');
    return dot>0 && objectsByName.get(key.slice(0,dot))?.has(key.slice(dot+1));
  };
  let orphanedPermissions=0;
  const keepKnown=(entries,valid)=>{
    const kept=Object.fromEntries(Object.entries(entries??{}).filter(([key])=>{
      if(valid(key))return true;
      orphanedPermissions++;return false;
    }));
    return kept;
  };
  const cleanGrants=entry=>({
    ...entry,
    objectPermissions:keepKnown(entry.objectPermissions,knownObject),
    fieldPermissions:keepKnown(entry.fieldPermissions,knownField),
    ...(entry.mutedObjectPermissions?{
      mutedObjectPermissions:keepKnown(entry.mutedObjectPermissions,knownObject)
    }:{}),
    ...(entry.mutedFieldPermissions?{
      mutedFieldPermissions:keepKnown(entry.mutedFieldPermissions,knownField)
    }:{})
  });
  const updated={
    ...access,
    profiles:access.profiles.map(cleanGrants),
    permissionSets:[...access.permissionSets.filter(set=>set.id!==seederSetId),seedSet].map(cleanGrants),
    permissionSetGroups:(access.permissionSetGroups??[]).map(cleanGrants),
    users:access.users.map(user=>user.id===seedUser.id?{
      ...user,permissionSetIds:[...new Set([...(user.permissionSetIds??[]),seederSetId])]
    }:user)
  };
  if(orphanedPermissions)console.log('Discarding orphaned RBAC references to absent metadata: '+orphanedPermissions);
  await api('/metadata/permissions','PUT',updated);
  const relogin=await api('/auth/login','POST',{email,password});
  if(relogin.user?.tenantId!==login.user?.tenantId)throw Error('Tenant changed across RBAC refresh');
  token=relogin.access_token;
  if(!token)throw Error('RBAC refresh yielded no token');
}
// Existing installations may contain lightweight placeholder Objects, so never
// treat an existing API name as proof that its schema is ready for demo records.
// Add only absent fields via Object Manager, keeping custom fields/layouts intact.
const latestObjects=(await api('/metadata/objects')).objects;
for(const definition of [...allDefinitions,...Object.entries(basketObjectExtensions).map(([apiName,fields])=>({apiName,fields}))]){
  const current=latestObjects.find(object=>object.apiName===definition.apiName);
  if(!current)throw Error('Metadata Object missing after installation: '+definition.apiName);
  const existingFields=new Set(current.fields.map(field=>field.apiName));
  const missingFields=definition.fields.filter(field=>!existingFields.has(field.apiName));
  if(!missingFields.length)continue;
  if(current.kind!=='Custom Object')throw Error('Cannot extend non-custom Object '+definition.apiName);
  await api('/metadata/objects/'+encodeURIComponent(definition.apiName),'PUT',{
    ...current,fields:[...current.fields,...missingFields]
  });
  console.log('Upgraded '+definition.apiName+' with '+missingFields.length+' missing fields');
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
  // Preserve the existing tenant's commerce contract: some Product__c
  // definitions require Price__c rather than the reusable DefaultPrice field.
  const productDefinition=latestObjects.find(object=>object.apiName==='Product__c');
  const priceRequired=productDefinition?.fields.some(field=>field.apiName==='Price__c' && field.required);
  await upsertDemo('Product__c','Name',{
    ...values,CategoryId:parentId,
    ...(priceRequired?{Price__c:values.DefaultPrice}:{})
  });
}
// Seed only standalone product customisation metadata, not fake transactions.
const groupIds=new Map();
for(const group of demoModifierGroups){
  const record=await upsertDemo('ModifierGroup__c','Name',group);
  groupIds.set(group.Name,record.Id);
}
for(const option of demoModifierOptions){
  const {group,...values}=option;
  await upsertDemo('ModifierOption__c','Name',{...values,GroupId:groupIds.get(group)});
}
for(const assignment of demoModifierAssignments){
  const product=await matchingRecord('Product__c','Name',assignment.product);
  const groupId=groupIds.get(assignment.group);
  if(!product?.Id||!groupId)throw Error('Missing product or group assignment');
  await upsertDemo('ProductModifierGroup__c','Name',{
    Name:'Demo assignment: '+assignment.product+' / '+assignment.group,
    ProductId:product.Id,GroupId:groupId
  });
}
const observed=await api('/metadata/objects');
const installed=new Set((observed.objects??[]).map(item=>item.apiName));
for(const name of expectedObjects)if(!installed.has(name))throw Error('Object activation not verified: '+name);
for(const [name,fields] of Object.entries(basketObjectExtensions)){
  const current=observed.objects.find(item=>item.apiName===name);
  if(!current||fields.some(field=>!current.fields.some(existing=>existing.apiName===field.apiName)))
    throw Error('Basket metadata fields not installed on '+name);
}
for(const category of demoCategories){
  const record=await matchingRecord('ProductCategory__c','Name',category.Name);
  if(!record?.Id)throw Error('Category seed not verified: '+category.Name);
}
for(const product of demoProducts){
  const record=await matchingRecord('Product__c','Name',product.Name);
  if(!record?.Id || record.SKU!==product.SKU || !record.CategoryId)
    throw Error('Product seed not verified: '+product.Name);
}
for(const group of demoModifierGroups){
  if(!(await matchingRecord('ModifierGroup__c','Name',group.Name))?.Id)
    throw Error('Modifier group seed not verified: '+group.Name);
}
for(const option of demoModifierOptions){
  const record=await matchingRecord('ModifierOption__c','Name',option.Name);
  if(!record?.Id || !record.GroupId)throw Error('Modifier option seed not verified: '+option.Name);
}
for(const assignment of demoModifierAssignments){
  const name='Demo assignment: '+assignment.product+' / '+assignment.group;
  const record=await matchingRecord('ProductModifierGroup__c','Name',name);
  if(!record?.Id || !record.ProductId || !record.GroupId)
    throw Error('Product modifier assignment not verified: '+name);
}
console.log(JSON.stringify({installed:true,createdObjects:created,
  verifiedObjects:expectedObjects,fixtureCategories:demoCategories.length,fixtureProducts:demoProducts.length,
  fixtureModifierGroups:demoModifierGroups.length,fixtureModifierOptions:demoModifierOptions.length,seededRecords,
  rbac:'Enforced by authenticated Object and Record APIs'}));
