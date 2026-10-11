// Additive COPY + readback on a disposable restored PostgreSQL database only.
// NEVER allow this utility to connect to production. No runtime/cutover changes.
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {planNormalizedObjectTable} from '../src/normalized-object-schema.mjs';
import {stateDigest} from '../src/relational-projection.mjs';

if(process.argv.length!==3||process.argv[2]!=='--apply')
  throw Error('Use --apply only on an independently restored local database');
if(!process.env.DATABASE_URL) throw Error('Local restore DATABASE_URL is required');
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','::1'].includes(url.hostname) ||
   url.pathname!=='/metadrive_restored' || process.env.PGSSLMODE!=='disable')
  throw Error('Shadow copy is restricted to an isolated LOCAL metadrive_restored database');
const client=new pg.Client({connectionString:url.toString(),ssl:false,connectionTimeoutMillis:15000});

const platformFields=[
  {apiName:'CreatedDate',dataType:'Date/Time'},
  {apiName:'LastModifiedDate',dataType:'Date/Time'},
  {apiName:'SystemModstamp',dataType:'Date/Time'},
  {apiName:'CreatedById',dataType:'Lookup(User)'},
  {apiName:'LastModifiedById',dataType:'Lookup(User)'},
  {apiName:'OwnerId',dataType:'Lookup(User)'},
  {apiName:'RecordTypeId',dataType:'Text'},
  {apiName:'IsDeleted',dataType:'Checkbox'}
];

function fullFields(object) {
  if (!Array.isArray(object?.fields)) throw Error('Object fields are missing');
  const fields=object.fields.filter(f=>f?.apiName!=='Id');
  const known=new Set(fields.map(f=>f.apiName));
  for(const field of platformFields) if(!known.has(field.apiName)) fields.push(field);
  return fields;
}

function equivalent(sqlType, expected, actual) {
  if(expected===null||actual===null) return expected===actual;
  if(sqlType.startsWith('NUMERIC')) {
    if ((typeof expected!=='number'&&typeof expected!=='string')||!Number.isFinite(Number(expected)))
      return false;
    return Number(expected)===Number(actual);
  }
  if(sqlType==='TIMESTAMPTZ') {
    const a=new Date(expected).getTime(),b=new Date(actual).getTime();
    return Number.isFinite(a)&&a===b;
  }
  if(sqlType==='DATE') {
    const actualDate=actual instanceof Date?actual.toISOString().slice(0,10):String(actual).slice(0,10);
    return typeof expected==='string' && expected.slice(0,10)===actualDate;
  }
  if(sqlType==='BOOLEAN') return typeof expected==='boolean' && expected===actual;
  return typeof expected==='string' && expected===actual;
}

async function migrate() {
  await client.connect();
  let transaction=false;
  try {
    await client.query('BEGIN');
    transaction=true;
    await client.query("SET LOCAL statement_timeout='120000'");
    const existing=await client.query("SELECT to_regclass('md_v2_shadow_run') AS name");
    if(existing.rows[0]?.name) throw Error('Shadow migration was previously started; refusing duplicate copy');
    const live=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1 FOR SHARE');
    if(live.rowCount!==1) throw Error('Source state is missing');
    const original=live.rows[0].payload;
    const sourceDigest=stateDigest(original);
    const schema=await readFile(new URL('../sql/normalized-registry-v2.sql',import.meta.url),'utf8');
    await client.query(schema);
    let objectCount=0,recordCount=0;
    const recordSnapshots=[];
    for (const [tenantId,tenant] of Object.entries(original.tenants??{})) {
      await client.query('INSERT INTO metadrive_rel_tenants(tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING',[tenantId]);
      const objects=tenant.objects??[];
      const objectByName=new Map(objects.map(o=>[o.apiName,o]));
      if(objectByName.size!==objects.length) throw Error('Duplicate object metadata name');
      for (const [apiName, records] of Object.entries(tenant.records??{})) {
        if(!Array.isArray(records)) throw Error('Non-array business record bucket');
        if(records.length && !objectByName.has(apiName)) throw Error('Records reference unknown metadata object');
      }
      for (const object of objects) {
        const objectId=randomUUID();
        const fields=fullFields(object);
        const mapping={objectId,fields:{}};
        for(const field of fields) {
          if(typeof field?.apiName!=='string'||!field.apiName) throw Error('Field API name is missing');
          mapping.fields[field.apiName]={fieldId:randomUUID()};
        }
        const plan=planNormalizedObjectTable({...object,fields},mapping);
        await client.query(plan.createTable);
        for(const sql of plan.addColumns) await client.query(sql);
        await client.query('INSERT INTO md_v2_object_registry(object_id,tenant_id,api_name,object_label,physical_table) VALUES ($1,$2,$3,$4,$5)',
          [objectId,tenantId,object.apiName,object.label??object.apiName,plan.table]);
        for(const item of plan.columns) {
          const f=fields.find(f=>f.apiName===item.apiName);
          await client.query('INSERT INTO md_v2_field_registry(field_id,object_id,api_name,field_label,source_data_type,physical_column) VALUES ($1,$2,$3,$4,$5,$6)',
            [item.fieldId,objectId,item.apiName,f.label??item.apiName,String(f.dataType),item.column]);
        }
        objectCount++;
        const records=tenant.records?.[object.apiName]??[];
        const ids=new Set();
        for(const record of records) {
          if(!record || typeof record.Id!=='string'||!record.Id || ids.has(record.Id))
            throw Error('Missing or duplicate business record identity');
          ids.add(record.Id);
          const fieldNames=Object.keys(record).filter(k=>k!=='Id');
          const actualFields=fieldNames.map(k=>plan.columns.find(c=>c.apiName===k));
          if(actualFields.some(f=>!f)) throw Error('Record has field not declared in object metadata');
          const values=[tenantId,record.Id,...actualFields.map(f=>record[f.apiName]??null)];
          const columns=['tenant_id','record_id',...actualFields.map(f=>f.column)];
          const params=columns.map((_,i)=>'$'+(i+1));
          await client.query('INSERT INTO '+plan.table+' ('+columns.join(',')+') VALUES ('+params.join(',')+')',values);
          for(const f of actualFields) {
            await client.query('INSERT INTO md_v2_field_presence(object_id,tenant_id,record_id,field_id) VALUES ($1,$2,$3,$4)',
              [objectId,tenantId,record.Id,f.fieldId]);
          }
          recordCount++;
        }
        recordSnapshots.push({tenantId,object,records,plan,objectId});
      }
    }
    // Full field-level readback, including null versus absent and record identities.
    for(const {tenantId,records,plan,objectId} of recordSnapshots) {
      const stored=await client.query('SELECT * FROM '+plan.table+' WHERE tenant_id=$1',[tenantId]);
      if(stored.rowCount!==records.length) throw Error('Business record count mismatch after SQL copy');
      const byId=new Map(stored.rows.map(row=>[row.record_id,row]));
      const presence=await client.query('SELECT record_id,field_id FROM md_v2_field_presence WHERE object_id=$1 AND tenant_id=$2',[objectId,tenantId]);
      const present=new Map();
      for(const row of presence.rows) {
        if(!present.has(row.record_id)) present.set(row.record_id,new Set());
        present.get(row.record_id).add(row.field_id);
      }
      for(const record of records) {
        const row=byId.get(record.Id);
        if(!row) throw Error('Missing SQL record identity');
        const keys=Object.keys(record).filter(k=>k!=='Id');
        const fieldIds=new Set(keys.map(k=>plan.columns.find(f=>f.apiName===k).fieldId));
        const observed=present.get(record.Id)??new Set();
        if(fieldIds.size!==observed.size || [...fieldIds].some(id=>!observed.has(id)))
          throw Error('SQL field presence differs from original record');
        for(const field of plan.columns) {
          if(!Object.prototype.hasOwnProperty.call(record,field.apiName)) continue;
          if(!equivalent(field.sqlType,record[field.apiName],row[field.column]))
            throw Error('SQL field value failed lossless readback');
        }
      }
    }
    await client.query('INSERT INTO md_v2_shadow_run(id,source_sha256,object_count,record_count) VALUES (1,$1,$2,$3)',[sourceDigest,objectCount,recordCount]);
    const final=await client.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
    if(final.rowCount!==1||stateDigest(final.rows[0].payload)!==sourceDigest)
      throw Error('Legacy source changed during shadow copy');
    await client.query('COMMIT');
    transaction=false;
    // Never output original metadata, records, secrets or SQL column values.
    console.log(JSON.stringify({shadowCopyVerified:true,isolatedRestoredDatabase:true,objectCount,recordCount,legacyStateUnchanged:true}));
  } catch(error) {
    if(transaction) await client.query('ROLLBACK');
    console.error('Normalized shadow copy rejected and rolled back',error instanceof Error?error.name:'UnknownError');
    process.exitCode=1;
  } finally {
    await client.end();
  }
}
await migrate();
