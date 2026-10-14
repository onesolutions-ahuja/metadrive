export type ComponentPropertyValues = Record<string, unknown>;
export type ComponentPropertyKind = 'text' | 'number' | 'boolean';

const reservedNames = new Set([
  '__proto__', 'prototype', 'constructor', 'key', 'ref', 'children',
  'onAction', 'onChange', 'onNavigate', 'onLaunchFlow',
  'properties', 'records', 'objects', 'flows', 'filters', 'sessionId'
]);

export function validateComponentPropertyName(name: string, existing: ComponentPropertyValues = {}): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return 'Use a letter followed by letters, digits or underscores.';
  if (reservedNames.has(name)) return 'This property is reserved for the component host.';
  if (Object.prototype.hasOwnProperty.call(existing, name)) return 'This property already exists.';
  return '';
}

export function parseComponentProperties(raw: unknown): { properties: ComponentPropertyValues; error: string } {
  if (raw === undefined || raw === null || raw === '') return { properties: {}, error: '' };
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { properties: {}, error: 'The stored component properties are invalid JSON. Repair them before editing.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { properties: {}, error: 'Component properties must be a plain object.' };
  }
  if (Object.keys(parsed).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    return { properties: {}, error: 'Component properties contain a forbidden key.' };
  }
  return { properties: parsed as ComponentPropertyValues, error: '' };
}

export function addComponentProperty(
  properties: ComponentPropertyValues,
  name: string,
  kind: ComponentPropertyKind
): ComponentPropertyValues {
  const error = validateComponentPropertyName(name, properties);
  if (error) throw new Error(error);
  return { ...properties, [name]: kind === 'boolean' ? false : kind === 'number' ? 0 : '' };
}

export function displayComponentPropertyName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

/** Phase 2b: optional typed definitions augment saved instance properties. */
export type ComponentPropertyDefinition = {
  name: string;
  kind: ComponentPropertyKind;
  required?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};
export function validateComponentPropertyDefinitions(definitions: readonly ComponentPropertyDefinition[]): string[] {
  const errors: string[] = [];
  const seen: ComponentPropertyValues = Object.create(null);
  for (const definition of definitions) {
    const nameError = validateComponentPropertyName(definition.name, seen);
    if (nameError) { errors.push(definition.name + ': ' + nameError); continue; }
    seen[definition.name] = true;
    if (!['text','number','boolean'].includes(definition.kind)) {
      errors.push(definition.name + ': Unsupported property type.'); continue;
    }
    if (definition.min !== undefined && (!Number.isFinite(definition.min) || definition.kind !== 'number'))
      errors.push(definition.name + ': Invalid minimum.');
    if (definition.max !== undefined && (!Number.isFinite(definition.max) || definition.kind !== 'number'))
      errors.push(definition.name + ': Invalid maximum.');
    if (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max)
      errors.push(definition.name + ': Minimum exceeds maximum.');
    if (definition.maxLength !== undefined && (definition.kind !== 'text' || !Number.isInteger(definition.maxLength) || definition.maxLength < 0))
      errors.push(definition.name + ': Invalid maximum length.');
    if (definition.defaultValue !== undefined) {
      const message = propertyValueError(definition, definition.defaultValue);
      if (message) errors.push(definition.name + ': ' + message);
    }
  }
  return errors;
}
function propertyValueError(definition: ComponentPropertyDefinition, value: unknown): string {
  const expected = definition.kind === 'text' ? 'string' : definition.kind;
  if (typeof value !== expected || (expected === 'number' && !Number.isFinite(value)))
    return 'Expected ' + expected + '.';
  if (typeof value === 'number' && ((definition.min !== undefined && value < definition.min)
    || (definition.max !== undefined && value > definition.max))) return 'Number outside configured range.';
  if (typeof value === 'string' && definition.maxLength !== undefined && value.length > definition.maxLength)
    return 'Text exceeds maximum length.';
  return '';
}
/** Resolves defaults without mutating old metadata; unknown values remain intact for compatibility. */
export function resolveComponentPropertyValues(
  definitions: readonly ComponentPropertyDefinition[],
  saved: ComponentPropertyValues = {}
): {values: ComponentPropertyValues; errors: string[]} {
  const errors = validateComponentPropertyDefinitions(definitions);
  if (errors.length) return {values: {...saved}, errors};
  const values: ComponentPropertyValues = {...saved};
  for (const definition of definitions) {
    const value = Object.prototype.hasOwnProperty.call(saved, definition.name) ? saved[definition.name] : definition.defaultValue;
    if (value === undefined) {
      if (definition.required) errors.push(definition.name + ': Required property missing.');
    } else {
      const message = propertyValueError(definition, value);
      if (message) errors.push(definition.name + ': ' + message);
      else values[definition.name] = value;
    }
  }
  return {values, errors};
}
