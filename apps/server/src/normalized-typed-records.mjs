// Typed, per-object SQL record persistence for MetaDrive's normalized state runtime.
// No business object, field or action is hardcoded into SQL identifiers.
// Registry UUIDs are durable; removed schema is retained for lossless rollback.
import {randomUUID} from 'node:crypto';
import {planNormalizedObjectTable,postgresFieldType,physicalObjectTable,physicalFieldColumn} from './normalized-object-schema.mjs';

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
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function fullFields(object){
  if(!Array.isArray(object?.fields)) throw Error('Typed records require metadata-defined fields');
  const fields=object.fields.filter(f=>f?.apiName!=='Id');
  const names=new Set(fields.map(f=>f.apiName));
  if(names.size!==fields.length) throw Error('Duplicate metadata field name');
  for(const f of platformFields) if(!names.has(f.apiName)) fields.push(f);
  return fields;
}
function tableName(objectId) { return physicalObjectTable(objectId); }
function equal(sqlType,a,b){
  if(a==null||b==null) return a===b;
  if(sqlType.startsWith('NUMERIC')) return (typeof a==='number'||typeof a==='string') &&
    Number.isFinite(Number(a))&&Number(a)===Number(b);
  if(sqlType==='TIMESTAMPTZ') return Number.isFinite(new Date(a).getTime())&&new Date(a).getTime()===new Date(b).getTime();
  if(sqlType==='DATE') return String(a).slice(0,10)===(b instanceof Date?b.toISOString().slice(0,10):String(b).slice(0,10));
  if(sqlType==='BOOLEAN') return typeof a==='boolean'&&a===b;
  return typeof a==='string'&&a===b;
}
async function registry(client) {
  const objects=await client.query('SELECT object_id,tenant_id,api_name,physical_table FROM md_v2_object_registry WHERE active=true');
  const fields=await client.query('SELECT field_id,object_id,api_name,physical_column,source_data_type FROM md_v2_field_registry WHERE active=true');
  const byObject=new Map();
  for(const row of objects.rows){
    if(row.physical_table!==tableName(row.object_id)) throw Error('Invalid immutable SQL object table mapping');
    const id=JSON.stringify([row.tenant_id,row.api_name]);
    if(byObject.has(id)) throw Error('Duplicate typed SQL registry object');
    byObject.set(id,{...row,fields:new Map()});
  }
  const byId=new Map([...byObject.values()].map(o=>[o.object_id,o]));
  for(const field of fields.rows){
    const o=byId.get(field.object_id);
    if(!o) continue;
    if(field.physical_column!==physicalFieldColumn(field.field_id)) throw Error('Invalid immutable field mapping');
    if(o.fields.has(field.api_name)) throw Error('Duplicate typed SQL registry field');
    o.fields.set(field.api_name,field);
  }
  return byObject;
}
const key=(tenantId,apiName)=>JSON.stringify([tenantId,apiName]);
function definedObjects(state){
  const expected=new Map();
  for(const [tenantId,t] of Object.entries(state?.tenants??{})){
    if(!Array.isArray(t.objects)||!t.records||typeof t.records!=='object') throw Error('Invalid metadata or record buckets');
    for(const object of t.objects){
      if(typeof object?.apiName!=='string'||!object.apiName) throw Error('Missing object API name');
      const id=key(tenantId,object.apiName);
      if(expected.has(id)) throw Error('Duplicate object metadata');
      const records=t.records[object.apiName]??[];
      if(!Array.isArray(records)) throw Error('Invalid record bucket');
      expected.set(id,{tenantId,object,fields:fullFields(object),records});
    }
    for(const [apiName,records] of Object.entries(t.records)){
      if(!Array.isArray(records)) throw Error('Invalid record bucket');
      if(records.length&&!expected.has(key(tenantId,apiName))) throw Error('Records have no object definition: '+apiName);
    }
  }
  return expected;
}
async function prepare(client,state){
  const expected=definedObjects(state);
  await client.query('SELECT object_id FROM md_v2_object_registry LIMIT 1');
  const mapping=await registry(client);
  // Retire removed objects without dropping their physical tables or values.
  for(const [identifier,saved] of [...mapping]) {
    if(expected.has(identifier)) continue;
    await client.query('UPDATE md_v2_object_registry SET active=false WHERE object_id=$1',[saved.object_id]);
    mapping.delete(identifier);
  }
  for(const item of expected.values()){
    let current=mapping.get(key(item.tenantId,item.object.apiName));
    if(!current){
      const dormant=await client.query('SELECT object_id,tenant_id,api_name,physical_table FROM md_v2_object_registry WHERE tenant_id=$1 AND api_name=$2 AND active=false',[item.tenantId,item.object.apiName]);
      if(dormant.rowCount){
        const saved=dormant.rows[0];
        if(saved.physical_table!==tableName(saved.object_id)) throw Error('Invalid retired object table identity');
        await client.query('UPDATE md_v2_object_registry SET active=true WHERE object_id=$1',[saved.object_id]);
        current={...saved,fields:new Map()};
        mapping.set(key(item.tenantId,item.object.apiName),current);
      }
    }
    if(!current){
      const objectId=randomUUID();
      const plan=planNormalizedObjectTable({...item.object,fields:item.fields},{
        objectId,fields:Object.fromEntries(item.fields.map(f=>[f.apiName,{fieldId:randomUUID()}]))
      });
      await client.query('INSERT INTO metadrive_rel_tenants(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[item.tenantId]);
      await client.query('INSERT INTO md_v2_object_registry(object_id,tenant_id,api_name,object_label,physical_table) VALUES($1,$2,$3,$4,$5)',
        [objectId,item.tenantId,item.object.apiName,item.object.label??item.object.apiName,plan.table]);
      await client.query(plan.createTable);
      for(const ddl of plan.addColumns) await client.query(ddl);
      current={object_id:objectId,tenant_id:item.tenantId,api_name:item.object.apiName,physical_table:plan.table,fields:new Map()};
      mapping.set(key(item.tenantId,item.object.apiName),current);
    }
    for(const f of item.fields){
      const sqlType=postgresFieldType(f.dataType);
      let saved=current.fields.get(f.apiName);
      if(!saved){
        const dormantField=await client.query('SELECT field_id,api_name,source_data_type,physical_column FROM md_v2_field_registry WHERE object_id=$1 AND api_name=$2 AND active=false',[current.object_id,f.apiName]);
        if(dormantField.rowCount){
          saved=dormantField.rows[0];
          if(saved.physical_column!==physicalFieldColumn(saved.field_id)) throw Error('Invalid retired field identity');
          await client.query('UPDATE md_v2_field_registry SET active=true WHERE field_id=$1',[saved.field_id]);
          current.fields.set(f.apiName,saved);
        }
      }
      if(!saved){
        const fieldId=randomUUID(),column=physicalFieldColumn(fieldId);
        await client.query('ALTER TABLE '+current.physical_table+' ADD COLUMN '+column+' '+sqlType);
        await client.query('INSERT INTO md_v2_field_registry(field_id,object_id,api_name,field_label,source_data_type,physical_column) VALUES($1,$2,$3,$4,$5,$6)',
          [fieldId,current.object_id,f.apiName,f.label??f.apiName,String(f.dataType),column]);
        saved={field_id:fieldId,api_name:f.apiName,source_data_type:String(f.dataType),physical_column:column};
        current.fields.set(f.apiName,saved);
      }
      if(postgresFieldType(saved.source_data_type)!==sqlType) throw Error('SQL type changed without explicit field migration: '+f.apiName);
    }
    const declared=new Set(item.fields.map(f=>f.apiName));
    for(const [name,field] of [...current.fields]){
      if(declared.has(name)) continue;
      await client.query('UPDATE md_v2_field_registry SET active=false WHERE field_id=$1',[field.field_id]);
      current.fields.delete(name);
    }
  }
  // The source of truth for missing/deleted object metadata is the normalized
  // graph. Retain old physical tables/registry rows rather than discarding data.
  return {expected,mapping};
}
async function compareObject(client,item,sqlObject) {
  const table=tableName(sqlObject.object_id);
  const physical=await client.query('SELECT * FROM '+table+' WHERE tenant_id=$1',[item.tenantId]);
  const presence=await client.query('SELECT record_id,field_id FROM md_v2_field_presence WHERE object_id=$1 AND tenant_id=$2',
    [sqlObject.object_id,item.tenantId]);
  const present=new Map();
  for(const p of presence.rows){
    if(!present.has(p.record_id)) present.set(p.record_id,new Set());
    present.get(p.record_id).add(p.field_id);
  }
  const rows=new Map();
  for(const p of physical.rows){
    if(rows.has(p.record_id)) throw Error('Duplicate physical SQL record identity');
    rows.set(p.record_id,p);
  }
  if(rows.size!==item.records.length) return false;
  const seen=new Set();
  for(const record of item.records){
    if(typeof record?.Id!=='string'||!record.Id||seen.has(record.Id)) throw Error('Invalid or duplicate record identity');
    seen.add(record.Id);
    const p=rows.get(record.Id);
    if(!p) return false;
    const names=Object.keys(record).filter(n=>n!=='Id');
    const current=present.get(record.Id)??new Set();
    if(current.size!==names.length) return false;
    for(const n of names){
      const f=sqlObject.fields.get(n);
      if(!f) throw Error('Record field absent from immutable SQL registry: '+n);
      if(!current.has(f.field_id)) return false;
      if(!equal(postgresFieldType(f.source_data_type),record[n],p[f.physical_column])) return false;
    }
  }
  return true;
}
async function rewriteObject(client,item,sqlObject){
  // Rebuild only objects with differences; all work is in the SAME transaction
  // as the graph revision. External queries can never see a partial update.
  const table=tableName(sqlObject.object_id);
  await client.query('DELETE FROM md_v2_field_presence WHERE object_id=$1 AND tenant_id=$2',[sqlObject.object_id,item.tenantId]);
  await client.query('DELETE FROM '+table+' WHERE tenant_id=$1',[item.tenantId]);
  const seen=new Set();
  for(const record of item.records){
    if(typeof record?.Id!=='string'||!record.Id||seen.has(record.Id)) throw Error('Duplicate or invalid record Id');
    seen.add(record.Id);
    const names=Object.keys(record).filter(n=>n!=='Id');
    const fields=names.map(n=>sqlObject.fields.get(n));
    if(fields.some(f=>!f)) throw Error('Record contains field absent from metadata');
    const cols=['tenant_id','record_id',...fields.map(f=>f.physical_column)];
    const values=[item.tenantId,record.Id,...names.map(n=>record[n])];
    await client.query('INSERT INTO '+table+' ('+cols.join(',')+') VALUES ('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',values);
    for(const f of fields) await client.query(
      'INSERT INTO md_v2_field_presence(object_id,tenant_id,record_id,field_id) VALUES($1,$2,$3,$4)',
      [sqlObject.object_id,item.tenantId,record.Id,f.field_id]);
  }
}
/** Use as normalized-state-runtime transactional beforeCommit callback. */
export async function synchronizeTypedRecords(client,state){
  const {expected,mapping}=await prepare(client,state);
  for(const [k,item] of expected){
    const sqlObject=mapping.get(k);
    if(!sqlObject) throw Error('Missing metadata SQL object registry');
    if(!(await compareObject(client,item,sqlObject)))
      await rewriteObject(client,item,sqlObject);
    if(!(await compareObject(client,item,sqlObject)))
      throw Error('Physical SQL business record field-level readback failed');
  }
}
/** Also use inside the same REPEATABLE READ snapshot as the normalized graph read. */
export async function verifyTypedRecords(client,state){
  const expected=definedObjects(state),mapping=await registry(client);
  if(expected.size!==mapping.size) throw Error('SQL object registry differs from normalized metadata');
  for(const [k,item] of expected){
    const mapped=mapping.get(k);
    if(!mapped) throw Error('Missing object in typed SQL registry');
    for(const f of item.fields){
      const saved=mapped.fields.get(f.apiName);
      if(!saved||postgresFieldType(saved.source_data_type)!==postgresFieldType(f.dataType))
        throw Error('Missing or changed typed SQL field registry');
    }
    if(!(await compareObject(client,item,mapped)))
      throw Error('SQL physical records differ from normalized state');
  }
}
