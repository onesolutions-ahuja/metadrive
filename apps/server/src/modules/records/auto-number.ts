/** Metadata-driven record auto-number allocation and sequence recovery. */
type AutoNumberField = { apiName: string; dataType: string };
type AutoNumberObject = { apiName: string; fields: readonly AutoNumberField[]; settings?: { recordNameType?: string; recordNameFormat: string } };
type AutoNumberRecord = Record<string, unknown>;

export function autoNumberFormatForField(object: AutoNumberObject, field: AutoNumberField): string {
  return field.apiName === 'Name' && object.settings?.recordNameType === 'Auto Number'
    ? object.settings.recordNameFormat
    : field.dataType === 'AutoNumber' ? 'REC-{00000}' : 'REC-{000000}';
}
export function formatAutoNumber(format: string, sequence: number): string {
  return format.replace(/\{(0+)\}/, (_match, digits: string) => String(sequence).padStart(digits.length, '0'));
}
export function autoNumberSequenceFromValue(format: string, value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const token = /\{0+\}/.exec(format);
  if (!token || token.index === undefined) return undefined;
  const prefix = format.slice(0, token.index);
  const suffix = format.slice(token.index + token[0].length);
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escape(prefix)}(\\d+)${escape(suffix)}$`).exec(value);
  if (!match) return undefined;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) ? sequence : undefined;
}
export function autoNumberSequenceKey(objectApiName: string, fieldApiName: string): string {
  return `${objectApiName}.${fieldApiName}`;
}
export function migrateAutoNumberSequences(
  objects: AutoNumberObject[],
  records: Record<string, AutoNumberRecord[]>,
  existingSequences: Record<string, number>
): Record<string, number> {
  const sequences = { ...existingSequences };
  for (const object of objects) {
    for (const field of object.fields) {
      if (field.dataType !== 'AutoNumber' && field.dataType !== 'Auto Number') continue;
      const key = autoNumberSequenceKey(object.apiName, field.apiName);
      const format = autoNumberFormatForField(object, field);
      const highestExisting = (records[object.apiName] ?? []).reduce((highest, record) =>
        Math.max(highest, autoNumberSequenceFromValue(format, record[field.apiName]) ?? 0), 0);
      sequences[key] = Math.max(sequences[key] ?? 0, highestExisting);
    }
  }
  return sequences;
}
