import type { FlowElementMetadata } from './metadata';
import { resolveMentionValue } from './smartFieldMentions';

export function initialScreenValues(screen: FlowElementMetadata): Record<string, unknown> {
  const fields = Array.isArray(screen.config.fields)
    ? screen.config.fields.filter((field): field is Record<string, unknown> =>
      typeof field === 'object' && field !== null && !Array.isArray(field)
      && !['Display Text', 'Display Image', 'Section'].includes(String(field.type)))
    : [];
  return Object.fromEntries(fields.flatMap((field, index) => {
    const name = typeof field.apiName === 'string'
      ? field.apiName
      : String(field.label ?? `Field_${index + 1}`).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (Object.hasOwn(field, 'defaultValue')) return [[name, field.defaultValue]];
    if (field.type === 'Checkbox' || field.type === 'Toggle') return [[name, false]];
    if (field.type === 'Slider') return [[name, typeof field.min === 'number' ? field.min : 0]];
    return [];
  }));
}

export function screenFieldIsVisible(field: Record<string, unknown>, values: Record<string, unknown>): boolean {
  const conditions = Array.isArray(field.visibilityConditions)
    ? field.visibilityConditions.filter((condition): condition is Record<string, unknown> =>
      typeof condition === 'object' && condition !== null && !Array.isArray(condition))
    : [];
  if (!conditions.length) return true;
  const checks = conditions.map((condition) => {
    const actual = values[String(condition.field ?? '')];
    const expected = condition.value;
    switch (String(condition.operator ?? 'Equals')) {
      case 'Not Equals':
      case 'Not Equal To': return String(actual ?? '') !== String(expected ?? '');
      case 'Is Null': return actual === undefined || actual === null || actual === '';
      case 'Is Not Null': return actual !== undefined && actual !== null && actual !== '';
      case 'Contains': return String(actual ?? '').includes(String(expected ?? ''));
      case 'Starts With': return String(actual ?? '').toLocaleLowerCase().startsWith(String(expected ?? '').toLocaleLowerCase());
      case 'Equals':
      default: return String(actual ?? '') === String(expected ?? '');
    }
  });
  return String(field.visibilityLogic ?? 'All').toLowerCase() === 'any'
    ? checks.some(Boolean)
    : checks.every(Boolean);
}


/** Plain-text resource bindings for metadata-authored Screen Flow instructions. */
export function resolveScreenText(text: unknown, values: Record<string, unknown>): string {
  const merged = String(text ?? '').replace(/\{!([A-Za-z_][A-Za-z0-9_.]*)\}/g, (_match, path: string) => {
    let value: unknown = values;
    for (const key of path.split('.')) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)
          || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) return '';
      value = (value as Record<string, unknown>)[key];
    }
    return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '';
  });
  const records = Object.fromEntries(Object.entries(values).filter(([, value]) =>
    value && typeof value === 'object' && !Array.isArray(value))) as Record<string, Record<string, unknown>>;
  const fields = Object.fromEntries(Object.entries(records).map(([name, record]) => [name, Object.keys(record)]));
  return String(resolveMentionValue(merged, records, fields) ?? '');
}
