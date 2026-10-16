import { compareMetadataValue } from './metadataValueComparison';
import type { FieldMetadata } from './metadata';
import { examineRecordFilter } from './recordFilterMetadata';

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
  const bindings = properties.actionFlows;
  return Boolean(bindings && typeof bindings === 'object' && !Array.isArray(bindings)
    && Object.keys(bindings).length > 0);
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
