// SQL physical schema planner. Pure: never connects to or modifies a database.
// Physical identifiers derive from immutable registry UUIDs, never display/API names.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function stableIdentifier(kind, id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw Error('A persisted immutable UUID is required for '+kind);
  return 'md_'+kind+'_'+id.replaceAll('-', '').toLowerCase();
}
export function physicalObjectTable(objectId) {return stableIdentifier('obj',objectId);}
export function physicalFieldColumn(fieldId) {return stableIdentifier('fld',fieldId);}

function precision(type, family) {
  const match=type.match(new RegExp('^'+family+'\\((\\d+),\\s*(\\d+)\\)$','i'));
  if(!match) return null;
  const p=Number(match[1]),s=Number(match[2]);
  if(!Number.isInteger(p)||p<1||p>1000||!Number.isInteger(s)||s<0||s>p)
    throw Error('Unsupported numeric precision or scale');
  return 'NUMERIC('+p+','+s+')';
}
export function postgresFieldType(dataType) {
  const type=String(dataType??'').trim();
  const text=type.match(/^Text\((\d+)\)$/i);
  if(text) {
    const width=Number(text[1]);
    if(!Number.isInteger(width)||width<1||width>65535) throw Error('Invalid Text length');
    return 'VARCHAR('+width+')';
  }
  const numeric=precision(type,'Number')??precision(type,'Currency')??precision(type,'Percent');
  if(numeric) return numeric;
  if (/^(?:Text|Name|Email|Phone|URL|Long Text Area|LongTextArea|Text Area|Rich Text Area|Picklist|Multi-Select Picklist|MultiPicklist|AutoNumber|Auto Number|Encrypted Text)$/i.test(type)) return 'TEXT';
  if (/^(?:Checkbox|Boolean)$/i.test(type)) return 'BOOLEAN';
  if (/^Date$/i.test(type)) return 'DATE';
  if (/^(?:Date\/Time|DateTime)$/i.test(type)) return 'TIMESTAMPTZ';
  if (/^Time$/i.test(type)) return 'TIME';
  if (/^(?:Number|Currency|Percent)$/i.test(type)) return 'NUMERIC';
  if (/^(?:Lookup|Master-Detail)\([A-Za-z][A-Za-z0-9_]*\)$/i.test(type)) return 'TEXT';
  const formula=type.match(/^Formula\(([^)]+)\)$/i);
  if (formula) return postgresFieldType(formula[1]);
  throw Error('Unsupported field type; migration must stop rather than flatten values');
}

/** registry: {objectId: UUID, fields: { [fieldApiName]: {fieldId: UUID} }}.
 * The registry MUST come from a durable SQL mapping; never regenerate IDs on rename.
 * Caller creates/matches metadata registry separately, then executes DDL in a transaction.
 */
export function planNormalizedObjectTable(object, registry) {
  if (!object || typeof object.apiName!=='string' || !Array.isArray(object.fields))
    throw Error('Invalid metadata object');
  if (!registry || typeof registry!=='object') throw Error('Persisted metadata registry is required');
  const table=physicalObjectTable(registry.objectId);
  const columns=[], seen=new Set(), seenIds=new Set();
  for (const field of object.fields) {
    if (!field || typeof field.apiName!=='string' || !field.apiName) throw Error('Invalid metadata field');
    if (seen.has(field.apiName)) throw Error('Duplicate metadata field');
    seen.add(field.apiName);
    if (field.apiName==='Id') continue; // Engine record identifier already has its own typed SQL column.
    const entry=registry.fields?.[field.apiName];
    const column=physicalFieldColumn(entry?.fieldId);
    if (seenIds.has(column)) throw Error('Duplicate physical field identity');
    seenIds.add(column);
    const sqlType=postgresFieldType(field.dataType);
    columns.push({apiName:field.apiName,fieldId:entry.fieldId,column,sqlType});
  }
  // All SQL identifiers have the fixed md_(obj|fld)_<hex> form. No metadata value is interpolated as an identifier.
  return {
    table,
    createTable:'CREATE TABLE IF NOT EXISTS '+table+' (tenant_id TEXT NOT NULL, record_id TEXT NOT NULL, record_version BIGINT NOT NULL DEFAULT 1 CHECK (record_version>0), PRIMARY KEY (tenant_id,record_id))',
    addColumns:columns.map(item=>'ALTER TABLE '+table+' ADD COLUMN IF NOT EXISTS '+item.column+' '+item.sqlType),
    columns
  };
}
