import type { ObjectMetadata } from './metadata';

export function formatRecordValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    if (!Array.isArray(value) && value !== null && 'latitude' in value && 'longitude' in value) {
      return `${String(value.latitude)}, ${String(value.longitude)}`;
    }
    return JSON.stringify(value) ?? String(value);
  }
  return String(value);
}

export function parseCsvImport(text: string, object: ObjectMetadata): Array<Record<string, unknown>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV must include a header row and at least one record.');
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  if (headers.some((header) => !header)) throw new Error('CSV column headers cannot be blank.');
  if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
    throw new Error('CSV column headers must be unique.');
  }
  const fieldByHeader = new Map(object.fields.flatMap((field) => [
    [field.apiName.toLocaleLowerCase(), field.apiName],
    [field.label.toLocaleLowerCase(), field.apiName]
  ]));
  const fieldNames = headers.map((header) => fieldByHeader.get(header.toLocaleLowerCase()));
  const unknownHeader = headers.find((header) => !fieldByHeader.has(header.toLocaleLowerCase()) && header.toLocaleLowerCase() !== 'recordtypeid');
  if (unknownHeader) throw new Error(`CSV column "${unknownHeader}" does not match a field API name or label on ${object.label}.`);
  const mappedNames = headers.map((header, index) => header.toLocaleLowerCase() === 'recordtypeid' ? 'RecordTypeId' : fieldNames[index]!);
  if (new Set(mappedNames).size !== mappedNames.length) {
    throw new Error('CSV headers map more than once to the same field; remove duplicate label/API name columns.');
  }
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} values; expected ${headers.length}.`);
    return Object.fromEntries(values.map((value, columnIndex) => [mappedNames[columnIndex], value]));
  });
}

