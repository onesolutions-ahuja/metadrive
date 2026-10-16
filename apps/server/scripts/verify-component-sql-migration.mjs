#!/usr/bin/env node
/** Read-only, tenant-scoped component reference verification against the active SQL runtime. */
import {pathToFileURL} from 'node:url';

const NAME=/^[A-Za-z][A-Za-z0-9_]*$/;
const SURFACES=['page','dashboard','flow'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function verifyComponentSqlMigration(state,tenantId,catalog){
  if(!object(state?.tenants?.[tenantId]))throw Error('Tenant is missing from verified SQL state');
  if(!Array.isArray(state.libraryComponents)||!Array.isArray(catalog?.coreComponents)||!Array.isArray(catalog?.packages))
    throw Error('Invalid SQL component registry or seed catalog');
  const tenant=state.tenants[tenantId],failures=[],checked={page:0,dashboard:0,flow:0,core:0,app:0};
  const fail=(code,surface,owner,apiName)=>failures.push({code,surface,owner,apiName});
  const visible=new Map();
  for(const def of state.libraryComponents){
    if(typeof def?.apiName!=='string'||!NAME.test(def.apiName))continue;
    if(def.tenantId!=null&&def.tenantId!==tenantId)continue;
    if(visible.has(def.apiName))fail('DUPLICATE_VISIBLE_DEFINITION','registry','library',def.apiName);
    else visible.set(def.apiName,def);
  }
  const owners=new Map();
  for(const pkg of catalog.packages)for(const component of pkg.components??[]){
    if(owners.has(component.apiName)&&owners.get(component.apiName)!==pkg.appKey)
      fail('MULTIPLE_APP_OWNERS','app',pkg.appKey,component.apiName);
    owners.set(component.apiName,pkg.appKey);
  }
  const installed=new Set(),seenApps=new Set();
  for(const row of tenant.records?.Connector_App__c??[]){
    if(!object(row)||typeof row.AppKey__c!=='string')continue;
    if(seenApps.has(row.AppKey__c)){
      installed.delete(row.AppKey__c);fail('DUPLICATE_APP_INSTALLATION','app',row.AppKey__c,'');continue;
    }
    seenApps.add(row.AppKey__c);
    if(row.Installed__c===true&&['Trial','Licensed'].includes(row.LicenceStatus__c))
      installed.add(row.AppKey__c);
  }
  function check(name,surface,owner,{trusted=false,version=0}={}){
    if(typeof name!=='string'||!NAME.test(name)){
      fail('INVALID_COMPONENT_REFERENCE',surface,owner,String(name??''));return;
    }
    const def=visible.get(name);
    if(!def){fail('MISSING_SQL_DEFINITION',surface,owner,name);return;}
    if(def.status!=='Published'||!Array.isArray(def.surfaces)||!def.surfaces.includes(surface))
      fail('NOT_PUBLISHED_FOR_SURFACE',surface,owner,name);
    if(typeof def.compiledJs!=='string'||!def.compiledJs.length)
      fail('MISSING_PUBLISHED_RUNTIME',surface,owner,name);
    if(trusted&&def.trustedBundled!==true)fail('INCORRECT_TRUST',surface,owner,name);
    if(version&&(def.version??0)<version)fail('OUTDATED_COMPONENT_VERSION',surface,owner,name);
    if(owners.has(name)&&!installed.has(owners.get(name)))
      fail('UNINSTALLED_APP_REFERENCE',surface,owner,name);
  }
  if(catalog.coreComponents.length!==40)fail('CORE_CATALOG_COUNT','registry','core',String(catalog.coreComponents.length));
  for(const def of catalog.coreComponents){
    checked.core++;
    for(const s of SURFACES)check(def.apiName,s,'core',{trusted:true,version:def.version});
    const actual=visible.get(def.apiName);
    if(actual&&(!Array.isArray(actual.propertyDefinitions)||!actual.propertyDefinitions.length))
      fail('MISSING_PROPERTY_SCHEMA','registry','core',def.apiName);
  }
  for(const pkg of catalog.packages){
    if(!installed.has(pkg.appKey))continue;
    for(const def of pkg.components??[]){
      checked.app++;
      for(const s of def.surfaces??[])check(def.apiName,s,pkg.appKey,{trusted:true,version:def.version});
    }
  }
  function walkReference(root,surface,owner){
    const seen=new WeakSet();
    const walk=(node,depth=0)=>{
      if(!node||typeof node!=='object'||depth>70||seen.has(node))return;
      seen.add(node);
      if(Array.isArray(node)){for(const x of node)walk(x,depth+1);return;}
      const isPage=surface==='page'&&typeof node.type==='string'&&node.type.startsWith('Custom:');
      const isDashboard=surface==='dashboard'&&node.type==='Custom';
      const isFlow=surface==='flow'&&node.type==='Custom Component';
      if(isPage||isDashboard||isFlow){
        checked[surface]++;
        const name=isPage?node.type.slice(7):isDashboard?node.customComponentApiName:node.componentApiName;
        check(name,surface,owner);
        if(isPage&&node.properties?.libraryComponentId&&node.properties.libraryComponentId!==name)
          fail('SAVED_COMPONENT_BINDING_MISMATCH',surface,owner,String(name??''));
      }
      for(const [key,value] of Object.entries(node)){
        if(['records','properties','componentPropsJson','credentials','jsxSource','cssSource','compiledJs','scopedCss'].includes(key))continue;
        walk(value,depth+1);
      }
    };
    walk(root);
  }
  for(const [collection,surface] of [['pages','page'],['dashboards','dashboard'],['flows','flow']]){
    if(!Array.isArray(tenant[collection])){
      fail('MISSING_SQL_COLLECTION',surface,collection,'');continue;
    }
    for(const entry of tenant[collection])
      walkReference(entry,surface,String(entry?.apiName??collection));
  }
  return {result:failures.length?'FAIL':'PASS',mode:'read-only-sql-state',checked,installedApps:installed.size,failures};
}

async function main(){
  const idx=process.argv.indexOf('--tenant'),tenantId=idx>=0?process.argv[idx+1]:null;
  const mode=process.env.METADRIVE_PERSISTENCE_MODE;
  if(process.argv.includes('--apply')||!tenantId||tenantId.length>256)
    throw Error('Usage: --tenant <tenant-id>; writes are forbidden');
  if(!['relational','normalized','typed'].includes(mode))
    throw Error('Active METADRIVE_PERSISTENCE_MODE must be relational, normalized or typed');
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
  const [{default:pg},{loadAppSeedCatalog}]=await Promise.all([
    import('pg'),import('../src/seeders/catalog.mjs')]);
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
  try{
    const snapshot=mode==='relational'
      ?await(await import('../src/relational-runtime.mjs')).readRelationalState(pool)
      :await(await import('../src/normalized-state-runtime.mjs')).readNormalizedState(pool,
        mode==='typed'?(await import('../src/normalized-typed-records.mjs')).verifyTypedRecords:null);
    const report=verifyComponentSqlMigration(snapshot.state,tenantId,loadAppSeedCatalog());
    process.stdout.write(JSON.stringify({persistenceMode:mode,...report},null,2)+'\n');
    if(report.result!=='PASS')process.exitCode=1;
  }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
