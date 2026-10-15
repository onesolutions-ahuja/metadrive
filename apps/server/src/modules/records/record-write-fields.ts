/** Pure input validation for the shared Object API.
 * The caller remains responsible for tenant, Object and Field permission checks.
 */
export interface WritableFieldDefinition { apiName: string }
export interface WritableObjectDefinition {
  apiName: string;
  fields: readonly WritableFieldDefinition[];
}
const AUDIT_READ_ONLY_FIELDS = new Set([
  'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate',
  'LastModifiedById', 'SystemModstamp'
]);
// Legacy computed fields remain protected until they are represented by SQL metadata.
const LEGACY_COMPUTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Opportunity: ['Age', 'Fiscal', 'OwnerRole'],
  Case: ['Age', 'IsOpen', 'IsClosed']
};

export function assertWritableRecordFields(
  object: WritableObjectDefinition, input: Record<string, unknown>
): void {
  const allowed = new Set(object.fields.map((field) => field.apiName));
  const computed = LEGACY_COMPUTED_FIELDS[object.apiName] ?? [];
  for (const fieldName of Object.keys(input)) {
    if (!allowed.has(fieldName) && fieldName !== 'RecordTypeId')
      throw new Error(`Field "${fieldName}" does not exist on "${object.apiName}".`);
    if (AUDIT_READ_ONLY_FIELDS.has(fieldName) || computed.includes(fieldName))
      throw new Error(`Field "${fieldName}" on "${object.apiName}" is read-only.`);
  }
}
