/** Typed reusable component settings. Read from the active registry adapter when enabled.
 * Undefined definitions preserve the legacy value-inferred editor unchanged. */
export type ComponentSettingKind =
  'TEXT'|'NUMBER'|'BOOLEAN'|'COLOR'|'IMAGE'|'SELECT'|'OBJECT_FIELD'|'FLOW'|'CURRENCY';
export type ComponentSettingDefinition = {
  propertyKey: string;
  label: string;
  kind: ComponentSettingKind;
  required?: boolean;
  isBindable?: boolean;
  displayOrder?: number;
  choices?: ReadonlyArray<{ key: string; label: string }>;
  defaultValue?: string | number | boolean;
};
export function sortComponentSettings(
  definitions: readonly ComponentSettingDefinition[]
): ComponentSettingDefinition[] {
  return [...definitions].sort((a,b) =>
    (a.displayOrder ?? 0)-(b.displayOrder ?? 0) || a.propertyKey.localeCompare(b.propertyKey));
}
export function resolveComponentSettings(
  definitions: readonly ComponentSettingDefinition[],
  instance: Readonly<Record<string,unknown>>
): Record<string,unknown> {
  const result: Record<string,unknown> = {};
  for (const definition of definitions) {
    if (definition.defaultValue !== undefined) result[definition.propertyKey] = definition.defaultValue;
  }
  // Existing instance properties always take precedence, including false, empty text and zero.
  return { ...result, ...instance };
}
export function validateComponentSetting(
  definition: ComponentSettingDefinition, value: unknown
): boolean {
  if (value === undefined || value === null || value === '') return !definition.required;
  switch(definition.kind) {
    case 'NUMBER': case 'CURRENCY': return typeof value === 'number' && Number.isFinite(value);
    case 'BOOLEAN': return typeof value === 'boolean';
    case 'SELECT': return typeof value === 'string' &&
      Boolean(definition.choices?.some(choice=>choice.key === value));
    default: return typeof value === 'string';
  }
}
