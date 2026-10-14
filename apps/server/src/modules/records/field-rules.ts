/** Shared metadata-based record validation, independent of object or business app name. */
type FieldRule = {
  apiName: string;
  label: string;
  required?: boolean;
  formula?: unknown;
  relationship?: { type: string; allowReparenting?: boolean } | null;
};
type ObjectRule = { fields: readonly FieldRule[] };

export function validateRelationshipReparenting<T extends ObjectRule>(
  object: T,
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): void {
  for (const field of object.fields) {
    if (field.relationship?.type !== 'Master-Detail' || field.relationship.allowReparenting === true) continue;
    const previousParentId = previous[field.apiName];
    if (previousParentId !== undefined && previousParentId !== next[field.apiName]) {
      throw new Error(`Master-detail relationship "${field.label}" does not allow reparenting.`);
    }
  }
}

export function validateRequiredRecordFields(
  fields: readonly FieldRule[],
  values: Record<string, unknown>,
  current?: Record<string, unknown>
): void {
  for (const field of fields) {
    const value = values[field.apiName] ?? current?.[field.apiName];
    if (field.required && !field.formula && (value === undefined || value === null || value === '')) {
      throw new Error(`Required field "${field.apiName}" is missing.`);
    }
  }
}
