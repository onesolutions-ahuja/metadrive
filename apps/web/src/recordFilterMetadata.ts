import type { FieldMetadata } from './metadata';

export type RecordFilterOperator = 'Equals' | 'Not Equals' | 'Contains' | 'Greater Than' | 'Less Than';
export type RecordFilterField = Pick<FieldMetadata, 'apiName' | 'label' | 'dataType' | 'picklistValues'>;
export type RecordFilterValue = { field: string; operator: string; value: unknown };
const operators: RecordFilterOperator[] = ['Equals', 'Not Equals', 'Contains', 'Greater Than', 'Less Than'];

export function isNumericFilterField(field?: RecordFilterField): boolean {
  return /^(Number|Currency|Percent|Integer|Decimal|Double)(\(|$)/i.test(field?.dataType ?? '');
}
export function isBooleanFilterField(field?: RecordFilterField): boolean {
  return /^(Checkbox|Boolean)$/i.test(field?.dataType ?? '');
}
/** Matches the operators currently implemented by the shared page-data runtime. */
export function supportedFilterOperators(field?: RecordFilterField): RecordFilterOperator[] {
  if (!field) return [...operators];
  if (isNumericFilterField(field)) return ['Equals', 'Not Equals', 'Greater Than', 'Less Than'];
  if (isBooleanFilterField(field) || /^(Date|Date\/Time|DateTime|Time)(\(|$)/i.test(field.dataType)) {
    return ['Equals', 'Not Equals'];
  }
  return ['Equals', 'Not Equals', 'Contains'];
}
export function examineRecordFilter(raw: unknown, fields: ReadonlyArray<RecordFilterField>): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Invalid saved filter. Remove and re-create it.';
  const filter = raw as Partial<RecordFilterValue>;
  if (typeof filter.field !== 'string' || filter.field === '') return 'Choose a field.';
  const field = fields.find(candidate => candidate.apiName === filter.field);
  if (!field) return 'This field is unavailable in the selected data object.';
  if (!supportedFilterOperators(field).includes(filter.operator as RecordFilterOperator)) {
    return 'This operator is not supported for the selected field type.';
  }
  const value = String(filter.value ?? '');
  if (isBooleanFilterField(field) && !['true', 'false'].includes(value)) return 'Choose True or False.';
  if (isNumericFilterField(field) && (value.trim() === '' || !Number.isFinite(Number(value)))) {
    return 'Enter a finite numeric filter value.';
  }
  return null;
}
