import type { FieldMetadata } from './metadata';
import { examineRecordFilter } from './recordFilterMetadata';

/**
 * The Page Builder supplies event bindings to the existing platform Flow/Action
 * runtime. A component need not select an Object merely to emit an action.
 * Never execute user-supplied expressions or attach business logic to JSX.
 */
export function needsMetadataComponentRuntime(properties: Record<string, unknown>): boolean {
  if (['objectApiName', 'cartObjectApiName', 'customerObjectApiName'].some(key =>
    typeof properties[key] === 'string' && (properties[key] as string).trim().length > 0)) return true;
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
    const actual = record[filter.field];
    if (actual === null || actual === undefined) return false;
    const expected = String(filter.value ?? '');
    const value = String(actual);
    switch (filter.operator) {
      case 'Equals': return value === expected;
      case 'Not Equals': return value !== expected;
      case 'Contains': return value.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
      case 'Greater Than': return Number(actual) > Number(expected);
      case 'Less Than': return Number(actual) < Number(expected);
      default: return false;
    }
  }));
}
