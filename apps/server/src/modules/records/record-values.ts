/** Shared metadata-driven field evolution and record value services. */
export type RecordFieldMetadata = {
  apiName: string; dataType: string; required?: boolean; unique?: boolean; caseSensitive?: boolean;
  relationship?: unknown; picklistRestricted?: boolean; picklistValues?: string[];
  controllerFieldApiName?: string; valueSettings?: Record<string, string[]>; formula?: unknown;
};
export type RecordObjectMetadata = {
  fields: readonly RecordFieldMetadata[];
  recordTypes?: readonly { id: string; picklistValues?: Record<string, string[]> }[];
};
type RecordValues = Record<string, unknown>;

export function numericFieldValueError(dataType: string, value: number): string | null {
  const format = dataType.match(/^(Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
  if (!format) return null;
  const precision = Number(format[2]);
  const scale = Number(format[3]);
  if (precision < 1 || precision > 18 || scale < 0 || scale > precision) return 'Numeric precision and scale are outside supported limits.';
  if (Math.abs(value) >= 10 ** (precision - scale)) return `Value exceeds the ${precision}-digit precision.`;
  const [mantissa, exponentText = '0'] = Math.abs(value).toString().toLowerCase().split('e');
  const fractionalDigits = mantissa.split('.')[1]?.length ?? 0;
  const valueScale = Math.max(0, fractionalDigits - Number(exponentText));
  if (valueScale > scale) return `Value exceeds the ${scale}-digit scale.`;
  return null;
}

export function validateFieldChange(current: RecordFieldMetadata | undefined, next: RecordFieldMetadata, records: RecordValues[]): string | null {
  const currentFamily = current?.dataType.match(/^(Text|Number|Currency|Percent)(?:\(|$)/)?.[1] ?? current?.dataType;
  const nextFamily = next.dataType.match(/^(Text|Number|Currency|Percent)(?:\(|$)/)?.[1] ?? next.dataType;
  if (current && currentFamily !== nextFamily) {
    return `Field "${next.apiName}" data type cannot be changed after creation`;
  }
  if (current?.relationship && JSON.stringify(current.relationship) !== JSON.stringify(next.relationship)) {
    return `Relationship definition for "${next.apiName}" cannot be changed after creation`;
  }
  if ((!current || !current.required) && next.required) {
    const missingValue = records.some((record) => record[next.apiName] === undefined || record[next.apiName] === null || record[next.apiName] === '');
    if (missingValue) return `Field "${next.apiName}" cannot be made required while records have no value`;
  }
  if ((!current || !current.unique) && next.unique) {
    const values = new Set<string>();
    for (const record of records) {
      const value = record[next.apiName];
      if (value === undefined || value === null || value === '') continue;
      const key = uniqueFieldValueKey(next, value);
      if (values.has(key)) return `Field "${next.apiName}" cannot be made unique while duplicate values exist`;
      values.add(key);
    }
  }
  return null;
}

export function uniqueFieldValueKey(field: RecordFieldMetadata, value: unknown): string {
  if (typeof value === 'string' && field.caseSensitive !== true) return `string:${value.toLocaleLowerCase('en-US')}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

export function validateExistingFieldValues(object: RecordObjectMetadata, records: RecordValues[]): string | null {
  for (const record of records) {
    const recordType = object.recordTypes?.find((item) => item.id === record.RecordTypeId);
    for (const field of object.fields) {
      const value = record[field.apiName];
      if (value === undefined || value === null || value === '') continue;
      if (/^Text(?:\(|$)/.test(field.dataType)) {
        const length = Number(field.dataType.match(/^Text\((\d+)\)$/)?.[1] ?? 255);
        if (String(value).length > length) return `Field "${field.apiName}" cannot be shortened because existing records exceed its new length`;
      }
      if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType) && typeof value === 'number') {
        if (numericFieldValueError(field.dataType, value)) return `Field "${field.apiName}" cannot use this precision or scale while existing records contain incompatible values`;
      }
      if (field.dataType === 'Long Text Area' && String(value).length > 131072) {
        return `Field "${field.apiName}" cannot use this limit while existing records exceed it`;
      }
      if (field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist') {
        const allowedValues = recordType?.picklistValues?.[field.apiName] ?? field.picklistValues;
        const values = field.dataType === 'Multi-Select Picklist' ? String(value).split(';') : [String(value)];
        if (field.picklistRestricted && allowedValues !== undefined && values.some((item) => !allowedValues.includes(item))) {
          return `Field "${field.apiName}" cannot remove a picklist value that is used by an existing record`;
        }
        if (field.controllerFieldApiName) {
          const controllerValue = record[field.controllerFieldApiName];
          const dependentValues = field.valueSettings?.[String(controllerValue ?? '')] ?? [];
          if (values.some((item) => !dependentValues.includes(item))) {
            return `Field "${field.apiName}" cannot change its dependency mapping while existing records use incompatible values`;
          }
        }
      }
    }
  }
  return null;
}

export function isValidFlowDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.test(value)) return false;
  const date = value.slice(0, 10);
  const midnight = new Date(`${date}T00:00:00.000Z`);
  const [year, month, day] = date.split('-').map(Number);
  return Number.isFinite(Date.parse(value))
    && Number.isFinite(midnight.getTime())
    && midnight.toISOString().slice(0, 10) === date
    && midnight.getUTCFullYear() === year
    && midnight.getUTCMonth() === month - 1
    && midnight.getUTCDate() === day;
}

export function normalizeRuntimeValues(object: RecordObjectMetadata, values: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...values };
  const fieldsByName = new Map(object.fields.map((field) => [field.apiName, field]));
  for (const [fieldName, value] of Object.entries(normalized)) {
    if (value === undefined || value === null) continue;
    const field = fieldsByName.get(fieldName);
    if (!field) continue;
    if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType)) {
      const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
      if (!Number.isFinite(numeric)) throw new Error(`Field "${fieldName}" must contain a valid number.`);
      const numericError = numericFieldValueError(field.dataType, numeric);
      if (numericError) throw new Error(`Field "${fieldName}" ${numericError.toLocaleLowerCase()}`);
      normalized[fieldName] = numeric;
    } else if (field.dataType === 'Checkbox') {
      if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) normalized[fieldName] = value.toLowerCase() === 'true';
      else if (typeof value !== 'boolean') throw new Error(`Field "${fieldName}" must be true or false.`);
    } else if (field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist' || field.dataType === 'Long Text Area' || /^(Text|Email|Phone|URL)(\(|$)/.test(field.dataType)) {
      if (typeof value !== 'string') throw new Error(`Field "${fieldName}" must contain text.`);
      const textLimit = field.dataType.match(/^Text(?:\((\d+)\))?$/);
      const maximumTextLength = textLimit ? Number(textLimit[1] ?? 255) : undefined;
      if (maximumTextLength !== undefined && value.length > maximumTextLength) {
        throw new Error(`Field "${fieldName}" exceeds its ${maximumTextLength} character limit.`);
      }
      if (field.dataType === 'Long Text Area' && value.length > 131072) throw new Error(`Field "${fieldName}" exceeds its 131072 character limit.`);
      if (field.dataType === 'Email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`Field "${fieldName}" must contain a valid email address.`);
      if (field.dataType === 'URL' && value) {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        } catch {
          throw new Error(`Field "${fieldName}" must contain a valid HTTP or HTTPS URL.`);
        }
      }
    } else if (field.dataType === 'Date' || field.dataType === 'Date/Time') {
      if (typeof value !== 'string' || (field.dataType === 'Date'
        ? !/^\d{4}-\d{2}-\d{2}$/.test(value)
          || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
          || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
        : !isValidFlowDateTime(value))) {
        throw new Error(`Field "${fieldName}" must contain a valid ${field.dataType.toLowerCase()}.`);
      }
    } else if (field.dataType === 'DateTime') {
      if (typeof value !== 'string' || !isValidFlowDateTime(value)) throw new Error(`Field "${fieldName}" must contain a valid date/time.`);
    }
  }
  return normalized;
}

export function normalizeFlowRecordAssignments(object: RecordObjectMetadata, record: RecordValues, previous: Record<string, unknown>): Record<string, unknown> {
  const changes = Object.fromEntries(object.fields
    .filter((field) => !field.formula && record[field.apiName] !== previous[field.apiName])
    .map((field) => [field.apiName, record[field.apiName]]));
  const normalized = normalizeRuntimeValues(object, changes);
  Object.assign(record, normalized);
  return normalized;
}
