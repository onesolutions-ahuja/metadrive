import { normalizeRuntimeValues, type RecordObjectMetadata } from './record-values.js';
import { assertWritableRecordFields } from './record-write-fields.js';
type InputObject = RecordObjectMetadata & { apiName: string };
type RuntimeRecord = Record<string, unknown>;
export function sanitizeRecordValues(object: InputObject, input: Record<string, unknown>): Record<string, unknown> {
  assertWritableRecordFields(object, input);
  const values = { ...input };
  return normalizeRuntimeValues(object, values);
}

export function withCaseClosedDate<T extends RuntimeRecord>(objectApiName: string, record: T, previous?: T): T {
  if (objectApiName !== 'Case') return record;
  const isClosed = /^closed(?:\b|[\s_-])/i.test(String(record.Status ?? ''));
  if (!isClosed) return { ...record, ClosedDate: null } as T;
  const wasClosed = /^closed(?:\b|[\s_-])/i.test(String(previous?.Status ?? ''));
  const closedDate = wasClosed
    ? typeof previous?.ClosedDate === 'string' ? previous.ClosedDate : previous?.LastModifiedDate
    : record.LastModifiedDate;
  return { ...record, ClosedDate: closedDate ?? record.LastModifiedDate } as T;
}

export function recordUnmodified(expected: string | undefined, record: RuntimeRecord): boolean {
  if (expected === undefined) return true; // Compatible with older clients.
  const original = new Date(expected).getTime();
  const current = new Date(String(record.LastModifiedDate ?? '')).getTime();
  return Number.isFinite(original) && Number.isFinite(current) && original === current;
}
