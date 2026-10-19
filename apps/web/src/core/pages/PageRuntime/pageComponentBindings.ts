import { compareMetadataValue } from '../../metadata/Definitions/metadataValueComparison';
import type { FieldMetadata } from '../../metadata/Definitions/metadata';
import { examineRecordFilter } from '../../records/RecordWorkspace/recordFilterMetadata';

/**
 * The Page Builder supplies event bindings to the existing platform Flow/Action
 * runtime. A component need not select an Object merely to emit an action.
 * Never execute user-supplied expressions or attach business logic to JSX.
 */
export function needsMetadataComponentRuntime(properties: Record<string, unknown>): boolean {
  // Any registered component can bind to an Object, not just a named business
  // vertical. Keep legacy *ObjectApiName properties working without per-app code.
  if (Object.entries(properties).some(([key, value]) =>
    /objectApiName$/i.test(key) && typeof value === 'string' && value.trim().length > 0)) return true;
  // Explicit record-field bindings also need the data runtime even while the
  // Object binding is missing, so the editor exposes a configuration error
  // instead of silently rendering an empty static grid.
  if (Object.entries(properties).some(([key, value]) =>
    /(?:name|title|price|image|category|vatApplicable|ageRestricted)FieldApiName$/i.test(key) &&
    typeof value === 'string' && value.trim().length > 0)) return true;
  // Field mentions require the same permission-gated data runtime as Object bindings.
  if (Object.values(properties).some(value => typeof value === 'string'
    && /(^|[^A-Za-z0-9_@])@[A-Za-z][A-Za-z0-9_]*\.[A-Za-z]/.test(value))) return true;
  const bindings = properties.actionFlows;
  return Boolean(bindings && typeof bindings === 'object' && !Array.isArray(bindings)
    && Object.keys(bindings).length > 0);
}

/** Apply one field-to-field equality selection from a sibling component's event.
 * This is presentation filtering only; the Object API already enforces tenant,
 * object, field and record RBAC. An invalid configured field fails closed. */
export function filterPageRecordsBySelection<T extends Record<string,unknown>>(
  records:readonly T[],fields:ReadonlyArray<FieldMetadata>,
  fieldName:string,selectedValue:string|undefined,requireSelection:boolean
):T[] {
  if(!fieldName || !fields.some(field=>field.apiName===fieldName))return [];
  if(selectedValue===undefined||selectedValue==='')return requireSelection?[]:[...records];
  return records.filter(row=>{
    if(!Object.hasOwn(row,fieldName))return false;
    const raw=row[fieldName];
    const values=raw&&typeof raw==='object'&&!Array.isArray(raw)
      ?[('Id' in raw ? raw.Id : undefined),('id' in raw ? raw.id : undefined),
        ('value' in raw ? raw.value : undefined)]
      :[raw];
    return values.some(value=>value!==undefined&&value!==null
      &&String(value)===selectedValue);
  });
}

/**
 * Evaluate the Page Builder's existing record-filter contract against
 * permission-checked records. Invalid, missing or unreadable fields fail closed;
 * an empty/unset filter is intentionally equivalent to "all readable records".
 */
export function filterPageComponentRecords<T extends Record<string, unknown>>(
  records: readonly T[],
  definitions: unknown,
  fields: ReadonlyArray<FieldMetadata>
): T[] {
  if (definitions === undefined || definitions === null) return [...records];
  if (!Array.isArray(definitions)) return [];
  if (definitions.some(item => examineRecordFilter(item, fields) !== null)) return [];
  return records.filter(record => definitions.every(item => {
    const filter = item as { field: string; operator: string; value: unknown };
    if (!Object.prototype.hasOwnProperty.call(record, filter.field)) return false;
    return compareMetadataValue(record[filter.field], filter.operator, filter.value, true);
  }));
}
