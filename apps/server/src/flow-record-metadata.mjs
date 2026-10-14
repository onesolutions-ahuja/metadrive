/** Pure shared metadata rules for Flow record collections.
 * Validation does not grant object or field access; DML RBAC remains authoritative.
 */
export const immutableRecordFieldNames = Object.freeze([
  'Id','CreatedDate','LastModifiedDate','CreatedById','LastModifiedById'
]);
export function isFlowRecordObject(value, requirePlainObject = false) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!requirePlainObject) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function flowRecordWritableFields(object) {
  return new Set(['RecordTypeId',...(object.fields ?? []).map(field=>field.apiName)]
    .filter(name=>!immutableRecordFieldNames.includes(name)));
}
export function validateFlowRecordFields(source, object) {
  const allowed = flowRecordWritableFields(object);
  return Object.keys(source).every(field => allowed.has(field));
}
