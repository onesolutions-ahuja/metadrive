import type { FlowElementMetadata } from './metadata';

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

