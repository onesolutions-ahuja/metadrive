import { normalizeRuntimeValues, type RecordObjectMetadata } from './record-values.js';
type InputObject = RecordObjectMetadata & { apiName: string };
type RuntimeRecord = Record<string, unknown>;
export function sanitizeRecordValues(object: InputObject, input: Record<string, unknown>): Record<string, unknown> {
  const allowedFields = new Set(object.fields.map((field) => field.apiName));
  const readOnlyFields = new Set([
    'Id',
    'CreatedDate',
    'CreatedById',
    'LastModifiedDate',
    'LastModifiedById',
    'SystemModstamp',
    ...(object.apiName === 'Opportunity' ? ['Age', 'Fiscal', 'OwnerRole'] : []),
    ...(object.apiName === 'Case' ? ['Age', 'IsOpen', 'IsClosed'] : [])
  ]);
  const values: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(input)) {
    if (!allowedFields.has(fieldName) && fieldName !== 'RecordTypeId') throw new Error(`Field "${fieldName}" does not exist on "${object.apiName}".`);
    if (readOnlyFields.has(fieldName)) throw new Error(`Field "${fieldName}" on "${object.apiName}" is read-only.`);
    values[fieldName] = value;
  }
  return normalizeRuntimeValues(object, values);
}

export function withCaseClosedDate(objectApiName: string, record: RuntimeRecord, previous?: RuntimeRecord): RuntimeRecord {
  if (objectApiName !== 'Case') return record;
  const isClosed = /^closed(?:\b|[\s_-])/i.test(String(record.Status ?? ''));
  if (!isClosed) return { ...record, ClosedDate: null };
  const wasClosed = /^closed(?:\b|[\s_-])/i.test(String(previous?.Status ?? ''));
  const closedDate = wasClosed
    ? typeof previous?.ClosedDate === 'string' ? previous.ClosedDate : previous?.LastModifiedDate
    : record.LastModifiedDate;
  return { ...record, ClosedDate: closedDate ?? record.LastModifiedDate };
}

export function recordUnmodified(expected: string | undefined, record: RuntimeRecord): boolean {
  if (expected === undefined) return true; // Compatible with older clients.
  const original = new Date(expected).getTime();
  const current = new Date(String(record.LastModifiedDate ?? '')).getTime();
  return Number.isFinite(original) && Number.isFinite(current) && original === current;
}
