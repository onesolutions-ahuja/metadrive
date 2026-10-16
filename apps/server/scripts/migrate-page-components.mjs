#!/usr/bin/env node
/**
 * Tenant-scoped component migration for page, dashboard and Flow metadata.
 * Only explicitly approved reference changes are allowed. Runtime library IDs
 * follow the new API name; mapped property defaults fill missing values only.
 * The SQL collection runner below is limited to relational persistence.
 *
 * Usage: node apps/server/scripts/migrate-page-components.mjs --tenant TENANT --mapping FILE --collections pages,dashboards,flows --dry-run
 *        node apps/server/scripts/migrate-page-components.mjs --tenant TENANT --mapping FILE --collections pages,dashboards,flows --targets API_NAME[,API_NAME...] --apply
 *        node apps/server/scripts/migrate-page-components.mjs --tenant TENANT --rollback RUN_ID
 */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {postgresConnectionOptions} from './postgres-connection.mjs';

const safeName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
const parse = payload => typeof payload === 'string' ? JSON.parse(payload) : payload;
const copy = value => structuredClone(value);
const collectionSurfaces = {pages:'page',dashboards:'dashboard',flows:'flow'};
const runtimeProperties = new Set(['actionFlows','canAssign','canSend','libraryComponentId']);

export function assertMigrationStorageMode(mode) {
  if (mode !== 'relational') {
    throw new Error('This SQL collection migration runner requires relational persistence; use the RBAC-authorized metadata API for typed SQL.');
  }
}

function approvedTarget(rule, surface, registered) {
  const approvedSurfaces=Array.isArray(rule.approvedSurfaces)?rule.approvedSurfaces:['page'];
  if(!approvedSurfaces.includes(surface))throw new Error('Migration mapping is not approved for '+surface+': '+rule.from);
  const target = registered.find(def => def.apiName === rule.to && def.status !== 'Draft' && def.surfaces?.includes(surface));
  if (!target) throw new Error(`Missing published ${surface} component: ${rule.to}`);
  if (![rule.from,rule.to].every(safeName) || !rule.to.startsWith('One')) throw new Error('Invalid component mapping');
  if (rule.parityVerified !== true || rule.tenantApproved !== true ||
      rule.metadataSnapshotVerified !== true || rule.draftPublishRollbackVerified !== true) {
    throw new Error('Unapproved migration mapping: ' + rule.from);
  }
  return target;
}

function validateProperties(instance, target, getProperties) {
  const properties = getProperties(instance);
  if (properties === undefined) return;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new Error('Invalid component properties for ' + target.apiName);
  }
  const allowed = new Set((target.propertyDefinitions ?? []).map(property => property.propertyKey));
  const unknown = Object.keys(properties).filter(key => !allowed.has(key)&&!runtimeProperties.has(key));
  if (unknown.length) throw new Error('Property parity mismatch for ' + target.apiName + ': ' + unknown.join(','));
}

function applyPropertyDefaults(instance, rule, target, getProperties, setProperties) {
  if (rule.propertyDefaults === undefined) return;
  const properties = getProperties(instance);
  if (properties !== undefined && (!properties || typeof properties !== 'object' || Array.isArray(properties))) {
    throw new Error('Invalid component properties for ' + target.apiName);
  }
  const definitions = new Map((target.propertyDefinitions ?? []).map(definition => [definition.propertyKey, definition]));
  const merged = {...(properties ?? {})};
  for (const [key, value] of Object.entries(rule.propertyDefaults)) {
    const definition = definitions.get(key);
    if (!definition) throw new Error('Migration default property is not supported by ' + target.apiName + ': ' + key);
    const valid = definition.kind === 'SELECT'
      ? typeof value === 'string' && definition.choices?.some(choice => choice.key === value)
      : ['TEXT','FLOW','OBJECT_FIELD','COLOR'].includes(definition.kind)
        ? typeof value === 'string'
        : definition.kind === 'NUMBER'
          ? typeof value === 'number' && Number.isFinite(value)
          : definition.kind === 'BOOLEAN'
            ? typeof value === 'boolean'
            : false;
    if (!valid) throw new Error('Invalid migration default for ' + target.apiName + '.' + key);
    if (merged[key] === undefined) merged[key] = value;
  }
  setProperties(instance, merged);
}

function updateLibraryComponentId(instance, rule, getProperties, setProperties) {
  const properties = getProperties(instance);
  if (properties?.libraryComponentId === rule.from) {
    setProperties(instance, {...properties,libraryComponentId:rule.to});
  }
}

function replaceReference(instance, property, surface, mapping, registered, getProperties, setProperties, changes) {
  const from = instance[property];
  const rule = mapping.find(candidate => candidate.from === from);
  if (!rule) return;
  const target = approvedTarget(rule,surface,registered);
  applyPropertyDefaults(instance,rule,target,getProperties,setProperties);
  updateLibraryComponentId(instance,rule,getProperties,setProperties);
  validateProperties(instance,target,getProperties);
  instance[property] = rule.to;
  changes.push({from,to:rule.to,id:instance.id ?? null,surface});
}

function planPages(payload,mapping,registered) {
  const result=copy(payload),changes=[];
  const visit=(components)=>{
    if(!Array.isArray(components))return;
    for(const instance of components){
      if(!instance||typeof instance!=='object'||Array.isArray(instance))continue;
      if(typeof instance.type==='string'&&instance.type.startsWith('Custom:')){
        const from=instance.type.slice(7);
        const rule=mapping.find(candidate=>candidate.from===from);
        if(rule){
          const target=approvedTarget(rule,'page',registered);
          applyPropertyDefaults(instance,rule,target,item=>item.properties,(item,value)=>{item.properties=value;});
          updateLibraryComponentId(instance,rule,item=>item.properties,(item,value)=>{item.properties=value;});
          validateProperties(instance,target,item=>item.properties);
          instance.type='Custom:'+rule.to;
          changes.push({from,to:rule.to,id:instance.id??null,surface:'page'});
        }
      }
      visit(instance.components);
    }
  };
  visit(result.components);
  return {payload:result,changes};
}

function planDashboards(payload,mapping,registered) {
  const result=copy(payload),changes=[];
  if(Array.isArray(result.components))for(const component of result.components){
    if(!component||component.type!=='Custom'||typeof component.customComponentApiName!=='string')continue;
    replaceReference(component,'customComponentApiName','dashboard',mapping,registered,item=>item.properties,
      (item,value)=>{item.properties=value;},changes);
  }
  return {payload:result,changes};
}

function planFlows(payload,mapping,registered) {
  const result=copy(payload),changes=[];
  const definitions=[result,...(Array.isArray(result.versions)?result.versions:[])];
  for(const definition of definitions){
    if(!Array.isArray(definition?.elements))continue;
    for(const element of definition.elements){
      const fields=element?.config?.fields;
      if(!Array.isArray(fields))continue;
      for(const field of fields){
        if(!field||field.type!=='Custom Component'||typeof field.componentApiName!=='string')continue;
        const properties=()=>{
          if(field.componentPropsJson===undefined)return undefined;
          if(typeof field.componentPropsJson!=='string')throw new Error('Invalid Flow component properties JSON');
          let parsed;
          try{parsed=JSON.parse(field.componentPropsJson);}catch{throw new Error('Invalid Flow component properties JSON');}
          return parsed;
        };
        replaceReference(field,'componentApiName','flow',mapping,registered,properties,
          (item,value)=>{item.componentPropsJson=JSON.stringify(value);},changes);
      }
    }
  }
  return {payload:result,changes};
}

export function planSurfaceReplacement(payload,collection,mapping,registered) {
  if(collection==='pages')return planPages(payload,mapping,registered);
  if(collection==='dashboards')return planDashboards(payload,mapping,registered);
  if(collection==='flows')return planFlows(payload,mapping,registered);
  throw new Error('Unsupported component collection: '+collection);
}

export function planPageReplacement(page,mapping,registered) {
  const planned=planSurfaceReplacement(page,'pages',mapping,registered);
  return {page:planned.payload,changes:planned.changes};
}

export function validateMapping(document,tenantId) {
  if(!document||document.tenantId!==tenantId||!Array.isArray(document.mappings))throw new Error('Tenant mapping mismatch');
  const seen=new Set();
  for(const rule of document.mappings){
    if(!safeName(rule.from)||!safeName(rule.to)||!rule.to.startsWith('One')||seen.has(rule.from))throw new Error('Duplicate or invalid mapping');
    if(rule.from===rule.to)throw new Error('Identity mapping is not a migration');
    if(rule.propertyDefaults!==undefined&&(!rule.propertyDefaults||typeof rule.propertyDefaults!=='object'||
      Array.isArray(rule.propertyDefaults)||Object.entries(rule.propertyDefaults).some(([key,value])=>
        !safeName(key)||!['string','number','boolean'].includes(typeof value)||
        (typeof value==='number'&&!Number.isFinite(value)))))throw new Error('Invalid component migration property defaults');
    if(rule.approvedSurfaces!==undefined&&(!Array.isArray(rule.approvedSurfaces)||!rule.approvedSurfaces.length||
      new Set(rule.approvedSurfaces).size!==rule.approvedSurfaces.length||
      rule.approvedSurfaces.some(surface=>!Object.values(collectionSurfaces).includes(surface))))throw new Error('Invalid approved migration surfaces');
    seen.add(rule.from);
  }
  return document.mappings;
}

export async function executeComponentMigration(client,{tenantId,document,collections=['pages'],targetApiNames=[],apply=false,rollback=null}) {
  if(!tenantId)throw new Error('Tenant required');
  if(!Array.isArray(collections)||!collections.length||collections.some(name=>!Object.hasOwn(collectionSurfaces,name)))throw new Error('Invalid component collections');
  if(!Array.isArray(targetApiNames)||targetApiNames.some(name=>!safeName(name)))throw new Error('Invalid component migration targets');
  if(apply&&!rollback&&!targetApiNames.length)throw new Error('Applying a migration requires exact --targets API names');
  await client.query('BEGIN');
  try{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['component-migration:'+tenantId]);
    await client.query(`CREATE TABLE IF NOT EXISTS metadrive_component_migration_backup (
      run_id UUID NOT NULL, tenant_id TEXT NOT NULL, collection_name TEXT NOT NULL,
      position INTEGER NOT NULL, previous_payload JSONB NOT NULL, migrated_payload JSONB NOT NULL,
      restored_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(run_id,tenant_id,collection_name,position)
    )`);
    if(rollback){
      const saved=await client.query(`SELECT collection_name,position,previous_payload,migrated_payload,restored_at
        FROM metadrive_component_migration_backup WHERE tenant_id=$1 AND run_id=$2::uuid FOR UPDATE`,[tenantId,rollback]);
      if(saved.rows.length){
        for(const row of saved.rows){
          if(row.restored_at)throw new Error('Already restored');
          const update=await client.query(`UPDATE metadrive_rel_tenant_collection_items SET payload=$1::jsonb
            WHERE tenant_id=$2 AND collection_name=$3 AND position=$4 AND payload=$5::jsonb`,
            [JSON.stringify(row.previous_payload),tenantId,row.collection_name,row.position,JSON.stringify(row.migrated_payload)]);
          if(update.rowCount!==1)throw new Error('Rollback conflict: metadata changed after migration');
        }
        await client.query('UPDATE metadrive_component_migration_backup SET restored_at=now() WHERE tenant_id=$1 AND run_id=$2::uuid',[tenantId,rollback]);
        await client.query('COMMIT');
        return {tenantId,rollback,restored:saved.rows.length};
      }
      const legacyExists=await client.query("SELECT to_regclass('metadrive_page_component_migration_backup') AS table_name");
      if(!legacyExists.rows[0]?.table_name)throw new Error('No backup for tenant/run');
      const legacy=await client.query(`SELECT position,previous_payload,migrated_payload,restored_at
        FROM metadrive_page_component_migration_backup WHERE tenant_id=$1 AND run_id=$2::uuid FOR UPDATE`,[tenantId,rollback]);
      if(!legacy.rows.length)throw new Error('No backup for tenant/run');
      for(const row of legacy.rows){
        if(row.restored_at)throw new Error('Already restored');
        const update=await client.query(`UPDATE metadrive_rel_tenant_collection_items SET payload=$1::jsonb
          WHERE tenant_id=$2 AND collection_name='pages' AND position=$3 AND payload=$4::jsonb`,
          [JSON.stringify(row.previous_payload),tenantId,row.position,JSON.stringify(row.migrated_payload)]);
        if(update.rowCount!==1)throw new Error('Rollback conflict: page changed after migration');
      }
      await client.query('UPDATE metadrive_page_component_migration_backup SET restored_at=now() WHERE tenant_id=$1 AND run_id=$2::uuid',[tenantId,rollback]);
      await client.query('COMMIT');
      return {tenantId,rollback,restored:legacy.rows.length};
    }
    const mapping=validateMapping(document,tenantId);
    const catalog=await client.query('SELECT payload FROM metadrive_rel_library_components');
    const registered=catalog.rows.map(row=>parse(row.payload));
    const rows=await client.query(`SELECT collection_name,position,payload FROM metadrive_rel_tenant_collection_items
      WHERE tenant_id=$1 AND collection_name=ANY($2::text[]) ORDER BY collection_name,position FOR UPDATE`,[tenantId,collections]);
    const planned=rows.rows.filter(row=>!targetApiNames.length||targetApiNames.includes(parse(row.payload)?.apiName)).map(row=>{
      const previousPayload=parse(row.payload);
      return {...row,previousPayload,...planSurfaceReplacement(previousPayload,row.collection_name,mapping,registered)};
    }).filter(row=>row.changes.length);
    const references=planned.flatMap(row=>row.changes).reduce((counts,change)=>{
      const key=change.surface+':'+change.from;
      counts[key]=(counts[key]??0)+1;
      return counts;
    },{});
    if(!apply){await client.query('ROLLBACK');return {mode:'dry-run',tenantId,collections,targets:targetApiNames,payloads:planned.length,references};}
    if(!planned.length){await client.query('COMMIT');return {mode:'applied',tenantId,collections,payloads:0,references:{}};}
    const runId=randomUUID();
    for(const row of planned){
      await client.query(`INSERT INTO metadrive_component_migration_backup
        (run_id,tenant_id,collection_name,position,previous_payload,migrated_payload)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [runId,tenantId,row.collection_name,row.position,JSON.stringify(row.previousPayload),JSON.stringify(row.payload)]);
      const update=await client.query(`UPDATE metadrive_rel_tenant_collection_items SET payload=$1::jsonb
        WHERE tenant_id=$2 AND collection_name=$3 AND position=$4 AND payload=$5::jsonb`,
        [JSON.stringify(row.payload),tenantId,row.collection_name,row.position,JSON.stringify(row.previousPayload)]);
      if(update.rowCount!==1)throw new Error('Concurrent update conflict');
    }
    await client.query('COMMIT');
    return {mode:'applied',runId,tenantId,collections,targets:targetApiNames,payloads:planned.length,references};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function executePageMigration(client,options) {
  return executeComponentMigration(client,{...options,collections:['pages']});
}

async function main(){
  assertMigrationStorageMode(process.env.METADRIVE_PERSISTENCE_MODE);
  const arg=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
  const tenantId=arg('--tenant');
  const rollback=arg('--rollback');
  const apply=process.argv.includes('--apply');
  const collections=arg('--collections')?.split(',')??['pages'];
  const targetApiNames=arg('--targets')?.split(',')??[];
  if(!tenantId||(!rollback&&!arg('--mapping'))||(rollback&&(apply||arg('--mapping')||arg('--targets'))))throw new Error('Supply --tenant plus --mapping [--collections pages,dashboards,flows] [--targets API_NAME[,API_NAME...]] [--apply] OR --rollback RUN_ID');
  const document=rollback?null:JSON.parse(readFileSync(arg('--mapping'),'utf8'));
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL missing');
  const {default:pg}=await import('pg');
  const client=new pg.Client(postgresConnectionOptions(process.env.DATABASE_URL));
  try{
    await client.connect();
    const result=await executeComponentMigration(client,{tenantId,document,collections,targetApiNames,apply,rollback});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
