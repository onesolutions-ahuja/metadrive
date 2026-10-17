/**
 * Owner-approved retirement of obsolete commerce Object metadata.
 * Runs OFFLINE against canonical SQL with a fresh, independently verified
 * encrypted backup. Dry run unless --apply is supplied. Never drops tables.
 *
 * Historical SQL tables remain for separate, owner-controlled DROP TABLE.
 * Uses the shared normalized SQL state CAS and typed synchronization engine.
 */
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {readNormalizedState,writeNormalizedState} from '../src/normalized-state-runtime.mjs';
import {synchronizeTypedRecords} from '../src/normalized-typed-records.mjs';
import {customisationObjectExtensions,basketObjectExtensions} from '../../../scripts/kiosk-commerce-capabilities.mjs';
import {commerceFlows} from '../../../scripts/kiosk-phase4-flows.mjs';
import {commercePages} from '../../../scripts/kiosk-phase4-pages.mjs';

const db='metadrive_sql_20261012';
const target=process.env.METADRIVE_EXPECTED_TENANT_ID;
const apply=process.argv.includes('--apply');
if(process.argv.some(x=>x!=='--apply'))throw Error('Unknown argument');
if(process.env.METADRIVE_SQL_TARGET_DB!==db||!target)throw Error('Explicit target database and tenant required');
const input=process.env.DATABASE_URL;
if(!input)throw Error('DATABASE_URL required');
const url=new URL(input);
const isolated=process.env.METADRIVE_ISOLATED_SQL_RESTORE==='true';
if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Invalid SQL URL');
if(isolated){
 if(process.env.GITHUB_ACTIONS!=='true'||url.hostname!=='127.0.0.1'||
    url.pathname!=='/metadrive_sql_proof')
   throw Error('Isolated SQL restore may run only inside GitHub proof job');
}else{
 if(!url.hostname.toLowerCase().endsWith('.aivencloud.com')||
    !['/defaultdb','/'+db].includes(url.pathname))
   throw Error('Live Aiven source database connection mismatch');
 url.pathname='/'+db;
}
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const ssl=isolated?false:{rejectUnauthorized:process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
  ...(process.env.METADRIVE_DB_CA_CERT?{ca:process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})};
const pool=new pg.Pool({connectionString:url.toString(),ssl,max:2,connectionTimeoutMillis:15000});
const retired=new Set(['Campaign','Global_Settings__c','KioskSettings__c',
  'OrderLineModifier__c','Tenant__c','TillSession__c',
  'ModifierGroup__c','ModifierOption__c','ProductCategory__c','SaleItem__c']);
const mandatory=['ProductCategory','Product__c','ProductModifierGroup__c',
  'ProductModifier__c','OrderLine__c','SaleLine__c'];
function mapByName(records){return new Map(records.map(r=>[String(r.Name??'').trim().toLowerCase(),r]));}
function addField(object,field){
  const at=object.fields.findIndex(f=>f.apiName===field.apiName);
  if(at<0)object.fields.push(structuredClone(field));
  else if(object.fields[at].dataType!==field.dataType ||
    (field.relationship && object.fields[at].relationship?.targetObject!==field.relationship.targetObject)){
    // This controlled SQL migration is intentionally separate from ordinary
    // Object Manager edits, which reject existing relationship retargeting.
    object.fields[at]={...object.fields[at],...structuredClone(field)};
  }
}
function flowSnapshot(flow,savedAt){return {
  versionNumber:flow.versionNumber,status:flow.status,savedAt,label:flow.label,
  description:flow.description,flowType:flow.flowType,
  triggerObject:flow.triggerObject,startConfig:flow.startConfig,
  elements:flow.elements,connectors:flow.connectors,resources:flow.resources,
  tests:flow.tests??[]
};}
function replaceManagedFlows(tenant){
 const now=new Date().toISOString();
 for(const desired of commerceFlows){
  const index=(tenant.flows??[]).findIndex(f=>f.apiName===desired.apiName);
  if(index<0)continue; // Never silently install/activate an absent app.
  const old=tenant.flows[index];
  if(!old.description?.startsWith('MetaDrive Commerce Phase 4:'))
    throw Error('Unverified tenant-owned Flow: '+old.apiName);
  if(JSON.stringify({elements:old.elements,connectors:old.connectors,resources:old.resources})===
     JSON.stringify({elements:desired.elements,connectors:desired.connectors,resources:desired.resources}))
    continue; // Version-safe, repeatable migration: do not append duplicate history.
  if((tenant.interviews??[]).some(i=>i.flowApiName===old.apiName))
    throw Error('Cannot migrate Flow with pending interviews: '+old.apiName);
  const history=new Map((old.versions??[]).map(v=>[v.versionNumber,v]));
  history.set(old.versionNumber,flowSnapshot(old,now));
  const number=Math.max(old.versionNumber,...history.keys())+1;
  const versions=[...history.values()].map(v=>({...v,
    status:v.status==='Draft'?'Draft':'Obsolete'}));
  const next={...old,...structuredClone(desired),versionNumber:number,
    activeVersion:old.activeVersion===null?null:number,
    status:old.activeVersion===null?'Draft':'Active',
    lastModifiedAt:now,versions};
  if(next.activeVersion!==null)next.versions.push(flowSnapshot(next,now));
  tenant.flows[index]=next;
 }
}
// This existing tenant-authored Draft Flow uses the retired SaleItem Object.
// Update its exact known checkout field contract and preserve draft/version history.
function migrateCashCheckoutFlow(tenant){
 const index=(tenant.flows??[]).findIndex(flow=>flow.apiName==='COPILOT_POS_Cash_Checkout');
 if(index<0)return;
 const old=tenant.flows[index];
 const usesRetired=(old.elements??[]).some(e=>e.config?.object==='SaleItem__c');
 if(!usesRetired)return;
 const current=structuredClone(old);
 const createLine=current.elements.find(e=>e.config?.object==='SaleItem__c');
 if(!createLine||createLine.type!=='Create Records')throw Error('Unexpected Cash Checkout item writer');
 const fields=new Map((createLine.config.fieldValues??[]).map(f=>[f.field,f.value]));
 for(const required of ['Name','Quantity__c','Unit_Price__c','Sale__c','Product__c'])
  if(!fields.has(required))throw Error('Unsupported Cash Checkout line field: '+required);
 createLine.config.object='SaleLine__c';
 createLine.config.fieldValues=[
  {field:'Name',value:fields.get('Name')},
  {field:'Quantity',value:fields.get('Quantity__c')},
  {field:'UnitPrice',value:fields.get('Unit_Price__c')},
  {field:'SaleId',value:fields.get('Sale__c')},
  // OrderLine__c.ProductId already refers to Product__c (the correct target).
  {field:'ProductId',value:'{!CurrentOrderLine.ProductId}'},
  ...(fields.has('CurrencyIsoCode')?[{field:'CurrencyIsoCode',value:fields.get('CurrencyIsoCode')}]:[])
 ];
 for(const element of current.elements){
  if(element.config?.object==='Product' && element.type==='Get Records'){
   element.config.object='Product__c';
   element.config.conditions=[
    {field:'Id',operator:'Equals',value:'{!CurrentOrderLine.ProductId}'}
   ];
  }
 }
 for(const resource of current.resources??[]){
  if(resource.name==='StandardCatalogProduct'&&resource.dataType==='Product')
   resource.dataType='Product__c';
 }
 const now=new Date().toISOString();
 const history=new Map((old.versions??[]).map(v=>[v.versionNumber,v]));
 history.set(old.versionNumber,flowSnapshot(old,now));
 const nextVersion=Math.max(old.versionNumber,...history.keys())+1;
 const next={...current,versionNumber:nextVersion,
  activeVersion:old.activeVersion===null?null:nextVersion,
  status:old.activeVersion===null?'Draft':'Active',
  lastModifiedAt:now,
  versions:[...history.values()].map(v=>({...v,status:v.status==='Draft'?'Draft':'Obsolete'}))};
 if(next.activeVersion!==null)next.versions.push(flowSnapshot(next,now));
 tenant.flows[index]=next;
}
function assertNoForeignReferences(tenant){
 const buckets=[
  ...(tenant.flows??[]).filter(f=>!f.apiName.startsWith('MD_Commerce_'))
    .map(f=>['flow',f.apiName,{startConfig:f.startConfig,elements:f.elements,resources:f.resources}]),
  ...(tenant.pages??[]).filter(p=>!commercePages.some(x=>x.apiName===p.apiName))
    .map(p=>['page',p.apiName,{targetObject:p.targetObject,components:p.components}]),
  ...(tenant.reports??[]).map(p=>['report',p.apiName??p.id,p]),
  ...(tenant.dashboards??[]).map(p=>['dashboard',p.apiName??p.id,p]),
  ...(tenant.apps??[]).map(p=>['app',p.apiName??p.id,p])
 ];
 for(const [kind,name,value] of buckets){
  const content=JSON.stringify(value);
  for(const old of retired)if(content.includes('"'+old+'"'))
    throw Error(kind+' '+name+' still references retired Object '+old);
 }
}
function removeAccessGrants(tenant){
 for(const entry of [
   ...(tenant.accessControl?.profiles??[]),
   ...(tenant.accessControl?.permissionSets??[]),
   ...(tenant.accessControl?.permissionSetGroups??[])
 ]){
  for(const property of ['objectPermissions','mutedObjectPermissions','tabPermissions']){
   if(entry[property])for(const name of retired)delete entry[property][name];
  }
  for(const property of ['fieldPermissions','mutedFieldPermissions','recordTypePermissions']){
   if(entry[property])for(const key of Object.keys(entry[property]))
    if([...retired].some(name=>key.startsWith(name+'.')))delete entry[property][key];
  }
 }
 for(const key of Object.keys(tenant.sharingSettings??{}))if(retired.has(key))
  delete tenant.sharingSettings[key];
}
function migrateTenant(t){
 if(!t||!Array.isArray(t.objects)||!t.records)throw Error('Tenant metadata unavailable');
 const objects=new Map(t.objects.map(o=>[o.apiName,o]));
 for(const name of mandatory)if(!objects.has(name))throw Error('Missing replacement Object: '+name);
 for(const [name,fields] of Object.entries({...customisationObjectExtensions,...basketObjectExtensions}))
  for(const field of fields)addField(objects.get(name),field);
 // Transfer categories with stable identifiers where possible.
 const categories=t.records.ProductCategory??[];
 const existing=mapByName(categories);
 const categoryIds=new Map();
 for(const old of t.records.ProductCategory__c??[]){
  const label=String(old.Name??'').trim();
  const equivalent=existing.get(label.toLowerCase())
    ??existing.get(label.replace(/^Demo\s+/i,'').toLowerCase());
  if(equivalent){categoryIds.set(old.Id,equivalent.Id);continue;}
  const cloned={Id:old.Id,Name:old.Name,
    ...(old.ImageUrl!==undefined?{ImageUrl:old.ImageUrl}:{}),
    ...(old.IsActive!==undefined?{IsActive:old.IsActive}:{}),
    ...(old.SortOrder!==undefined?{SortOrder:old.SortOrder}:{}),
    ...(old.CreatedById?{CreatedById:old.CreatedById}:{})};
  if(categories.some(x=>x.Id===cloned.Id))cloned.Id=randomUUID();
  categories.push(cloned);existing.set(label.toLowerCase(),cloned);
  categoryIds.set(old.Id,cloned.Id);
 }
 t.records.ProductCategory=categories;
 for(const product of t.records.Product__c??[]){
  if(product.CategoryId && categoryIds.has(product.CategoryId))
    product.CategoryId=categoryIds.get(product.CategoryId);
  else if(product.CategoryId&&!categories.some(x=>x.Id===product.CategoryId))
    delete product.CategoryId;
 }
 const groupData=new Map((t.records.ModifierGroup__c??[]).map(x=>[x.Id,x]));
 const assignments=t.records.ProductModifierGroup__c??[];
 for(const a of assignments){
  const previous=groupData.get(a.GroupId);
  if(previous)for(const property of ['MinSelections','MaxSelections','IsRequired','IsActive','SortOrder'])
   if(a[property]===undefined&&previous[property]!==undefined)a[property]=previous[property];
  delete a.GroupId;
 }
 // An option is now attached directly to a product-specific group. Preserve
 // existing ProductModifier records; only append identities that are absent.
 const alternatives=t.records.ProductModifier__c??[];
 for(const a of assignments){
  // Read the original product/group assignment before retiring the lookup.
  const groupId=t.__oldModifierGroups?.[a.Id];
  if(!groupId)continue;
  for(const option of (t.records.ModifierOption__c??[]).filter(x=>x.GroupId===groupId)){
   if(alternatives.some(x=>x.GroupId===a.Id&&x.Name===option.Name))continue;
   alternatives.push({Id:randomUUID(),Name:option.Name,GroupId:a.Id,
     Product__c:String(a.ProductId??''),Price__c:Number(option.PriceAdjustment??0),
     IsActive:option.IsActive!==false,Available__c:option.IsActive!==false,
     ...(option.SortOrder!==undefined?{SortOrder:option.SortOrder}:{})});
  }
 }
 delete t.__oldModifierGroups;
 t.records.ProductModifier__c=alternatives;
 // Sale items must never disappear silently if actual transactions exist.
 if((t.records.SaleItem__c??[]).length)
  throw Error('SaleItem contains business records; migration requires validated SaleLine mapping');
 for(const apiName of retired){t.objects=t.objects.filter(x=>x.apiName!==apiName);delete t.records[apiName];}
 t.fieldHistory=(t.fieldHistory??[]).filter(h=>!retired.has(h.objectApiName));
 removeAccessGrants(t);
 replaceManagedFlows(t);
 migrateCashCheckoutFlow(t);
 t.pages=(t.pages??[]).map(page=>{
  const desired=commercePages.find(x=>x.apiName===page.apiName);
  return desired?{...page,components:structuredClone(desired.components)}:page;
 });
 assertNoForeignReferences(t);
}
try{
 const snapshot=await readNormalizedState(pool);
 const next=structuredClone(snapshot.state);
 const tenant=next.tenants?.[target];
 if(!tenant)throw Error('Tenant not found: '+target);
 // Capture parent group links BEFORE stripping obsolete lookup fields.
 tenant.__oldModifierGroups=Object.fromEntries((tenant.records.ProductModifierGroup__c??[])
   .map(row=>[row.Id,row.GroupId]));
 migrateTenant(tenant);
 const missingSql=await pool.query(
  "SELECT count(*)::int AS n FROM md_v2_object_registry WHERE active=true AND to_regclass('public.'||physical_table) IS NULL");
 const noChanges=missingSql.rows[0]?.n===0&&JSON.stringify(snapshot.state)===JSON.stringify(next);
 const summary={database:db,tenant:target,revision:snapshot.version,
   stateDigest:snapshot.digest,retiredObjects:[...retired],
   migratedFlows:(tenant.flows??[]).filter(f=>f.apiName.startsWith('MD_Commerce_')).length};
 if(!apply||noChanges){console.log(JSON.stringify({mode:noChanges?'already-migrated':'dry-run',...summary},null,2));}
 else{
  if(!isolated){
   if(process.env.METADRIVE_COMMERCE_MIGRATION_APPROVED!=='true'||
      process.env.METADRIVE_BACKEND_MAINTENANCE_CONFIRMED!=='true')
    throw Error('Explicit approved migration and offline API maintenance required');
   const file=process.env.METADRIVE_SQL_CLEANUP_PROOF_FILE;
   if(!file)throw Error('Independently restored encrypted backup proof required');
   const proof=JSON.parse(readFileSync(file,'utf8'));
   if(proof.database!==db||proof.revision!==snapshot.version||
      proof.stateDigest!==snapshot.digest||proof.restoredDatabaseVerified!==true||
      !/^[a-f0-9]{64}$/.test(proof.encryptedBackupSha256??''))
    throw Error('Fresh SQL restore proof does not match this revision');
  }
  const result=await writeNormalizedState(pool,next,snapshot,synchronizeTypedRecords);
  console.log(JSON.stringify({mode:'committed',...summary,newRevision:result.version,
    physicalTablesDropped:false}));
 }
}finally{await pool.end();}
