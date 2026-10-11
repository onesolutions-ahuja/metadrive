// Generic typed SQL CRUD for a future metadata runtime. NOT WIRED TO PRODUCTION.
// The caller MUST own a SQL transaction (BEGIN/COMMIT/ROLLBACK) and supply a
// permission-aware authorizer on every operation. No business object names occur here.
import {randomUUID} from 'node:crypto';
import {physicalObjectTable,physicalFieldColumn,postgresFieldType} from './normalized-object-schema.mjs';

function requireText(value,name) {
  if(typeof value!=='string'||!value.trim()) throw Error('Invalid '+name);
  return value;
}
async function resolveObject(client,tenantId,objectId) {
  requireText(tenantId,'tenant');
  const table=physicalObjectTable(objectId);
  const {rows}=await client.query(
    'SELECT object_id,physical_table FROM md_v2_object_registry WHERE tenant_id=$1 AND object_id=$2 AND active=TRUE',
    [tenantId,objectId]);
  if(rows.length!==1||rows[0].physical_table!==table) throw Error('Unregistered or inaccessible object');
  const f=await client.query(
    'SELECT field_id,api_name,physical_column,source_data_type FROM md_v2_field_registry WHERE object_id=$1 AND active=TRUE',
    [objectId]);
  const byName=new Map(),byId=new Map();
  for (const item of f.rows) {
    if(item.physical_column!==physicalFieldColumn(item.field_id))
      throw Error('Untrusted metadata physical column');
    if(byName.has(item.api_name)||byId.has(item.field_id)) throw Error('Duplicate field metadata');
    byName.set(item.api_name,item);
    byId.set(item.field_id,item);
  }
  return {table,byName,byId};
}
async function requireAccess(authorize,operation,tenantId,objectId,fieldIds,recordId) {
  if(typeof authorize!=='function') throw Error('Permission authorizer is mandatory');
  const allowed=await authorize({operation,tenantId,objectId,fieldIds,recordId});
  if(allowed!==true) throw Error('Access denied');
}
function fieldsForWrite(context,values) {
  if(!values||typeof values!=='object'||Array.isArray(values)) throw Error('Field values must be an object');
  const fields=[];
  for(const [key,value] of Object.entries(values)) {
    const field=context.byId.get(key)??context.byName.get(key);
    if(!field) throw Error('Field has no active metadata definition');
    if(fields.some(x=>x.field_id===field.field_id)) throw Error('Duplicate field identity in write');
    // SQL casts enforce the actual type, length and scale. Never silently store an unknown value.
    postgresFieldType(field.source_data_type);
    fields.push({...field,value});
  }
  return fields;
}
function decodedValue(value,dataType) {
  if(value==null) return null;
  const type=postgresFieldType(dataType);
  if(type==='DATE') return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
  if(type==='TIMESTAMPTZ') return value instanceof Date?value.toISOString():new Date(value).toISOString();
  if(type==='NUMERIC'||type.startsWith('NUMERIC(')) {
    // A decimal string is lossless. The Flow type system must opt in to arithmetic conversion.
    return String(value);
  }
  return value;
}
export async function sqlGetRecord(client,{tenantId,objectId,recordId,authorize}) {
  const context=await resolveObject(client,tenantId,objectId);
  requireText(recordId,'record');
  const presence=await client.query(
    'SELECT field_id FROM md_v2_field_presence WHERE object_id=$1 AND tenant_id=$2 AND record_id=$3',
    [objectId,tenantId,recordId]);
  const fieldIds=presence.rows.map(r=>r.field_id);
  await requireAccess(authorize,'read',tenantId,objectId,fieldIds,recordId);
  const selected=await client.query('SELECT * FROM '+context.table+' WHERE tenant_id=$1 AND record_id=$2',
    [tenantId,recordId]);
  if(selected.rowCount===0) return null;
  if(selected.rowCount!==1) throw Error('Duplicate record identity');
  const row=selected.rows[0],values={Id:recordId};
  for(const fieldId of fieldIds) {
    const meta=context.byId.get(fieldId);
    if(!meta) throw Error('Field presence references inactive or unknown metadata');
    values[meta.api_name]=decodedValue(row[meta.physical_column],meta.source_data_type);
  }
  return {values,version:Number(row.record_version)};
}
export async function sqlCreateRecord(client,{tenantId,objectId,recordId,values,authorize}) {
  const context=await resolveObject(client,tenantId,objectId);
  const id=recordId??randomUUID();
  requireText(id,'record');
  const fields=fieldsForWrite(context,values);
  await requireAccess(authorize,'create',tenantId,objectId,fields.map(f=>f.field_id),id);
  const keys=['tenant_id','record_id',...fields.map(f=>f.physical_column)];
  const params=keys.map((_,i)=>'$'+(i+1));
  await client.query('INSERT INTO '+context.table+' ('+keys.join(',')+') VALUES ('+params.join(',')+')',
    [tenantId,id,...fields.map(f=>f.value)]);
  for(const field of fields) await client.query(
    'INSERT INTO md_v2_field_presence(object_id,tenant_id,record_id,field_id) VALUES ($1,$2,$3,$4)',
    [objectId,tenantId,id,field.field_id]);
  return {recordId:id,version:1};
}
export async function sqlUpdateRecord(client,{tenantId,objectId,recordId,expectedVersion,values={},unsetFields=[],authorize}) {
  const context=await resolveObject(client,tenantId,objectId);
  requireText(recordId,'record');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
    throw Error('Optimistic record version is mandatory');
  if(!Array.isArray(unsetFields)) throw Error('unsetFields must be an array');
  const fields=fieldsForWrite(context,values);
  const unset=unsetFields.map(key=>context.byId.get(key)??context.byName.get(key));
  if(unset.some(f=>!f)||new Set(unset.map(f=>f.field_id)).size!==unset.length) throw Error('Invalid field removal metadata');
  if(unset.some(f=>fields.some(item=>item.field_id===f.field_id))) throw Error('Cannot update and remove same field');
  await requireAccess(authorize,'edit',tenantId,objectId,[...fields,...unset].map(f=>f.field_id),recordId);
  const sets=[...fields.map((f,i)=>f.physical_column+'=$'+(i+1)),
    ...unset.map(f=>f.physical_column+'=NULL'),'record_version=record_version+1'];
  const args=[...fields.map(f=>f.value),tenantId,recordId,expectedVersion];
  const offset=fields.length;
  const changed=await client.query('UPDATE '+context.table+' SET '+sets.join(',')+
    ' WHERE tenant_id=$'+(offset+1)+' AND record_id=$'+(offset+2)+
    ' AND record_version=$'+(offset+3)+' RETURNING record_version',args);
  if(changed.rowCount!==1) throw Error('Record version conflict or record missing');
  for(const field of fields) await client.query(
    'INSERT INTO md_v2_field_presence(object_id,tenant_id,record_id,field_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [objectId,tenantId,recordId,field.field_id]);
  for(const field of unset) await client.query(
    'DELETE FROM md_v2_field_presence WHERE object_id=$1 AND tenant_id=$2 AND record_id=$3 AND field_id=$4',
    [objectId,tenantId,recordId,field.field_id]);
  return {recordId,version:Number(changed.rows[0].record_version)};
}
export async function sqlDeleteRecord(client,{tenantId,objectId,recordId,expectedVersion,authorize}) {
  const context=await resolveObject(client,tenantId,objectId);
  requireText(recordId,'record');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
    throw Error('Optimistic record version is mandatory');
  await requireAccess(authorize,'delete',tenantId,objectId,[],recordId);
  const deleted=await client.query('DELETE FROM '+context.table+
    ' WHERE tenant_id=$1 AND record_id=$2 AND record_version=$3',
    [tenantId,recordId,expectedVersion]);
  if(deleted.rowCount!==1) throw Error('Record version conflict or record missing');
  await client.query('DELETE FROM md_v2_field_presence WHERE object_id=$1 AND tenant_id=$2 AND record_id=$3',
    [objectId,tenantId,recordId]);
  return {recordId,deleted:true};
}
