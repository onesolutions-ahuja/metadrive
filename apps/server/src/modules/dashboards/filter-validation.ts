import type { DashboardFilterMetadata } from './schemas.js';
import sanitizeHtml from 'sanitize-html';

/** Reusable Dashboard Builder and published runtime filter sanitization. */
export function isNumericField(field: { dataType: string; formula?: { returnType: string } } | undefined): boolean {
  const numericTypes = /^(Number|Currency|Percent)(\(|$)/;
  return Boolean(field && (numericTypes.test(field.dataType)
    || (field.dataType.startsWith('Formula(') && numericTypes.test(field.formula?.returnType ?? ''))));
}
export function dashboardFilterOperatorAllowed(
  field: { dataType: string; formula?: { returnType: string } },
  operator: DashboardFilterMetadata['operator']
): boolean {
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  if (['Includes', 'Excludes'].includes(operator) && type !== 'Multi-Select Picklist') return false;
  const nullOperators: DashboardFilterMetadata['operator'][] = ['Is Null', 'Is Not Null'];
  if (type === 'Checkbox' || type === 'Picklist') {
    return [...nullOperators, 'Equals', 'Not Equal To'].includes(operator);
  }
  if (type === 'Multi-Select Picklist') {
    return [...nullOperators, 'Equals', 'Not Equal To', 'Contains', 'Includes', 'Excludes'].includes(operator);
  }
  if (isNumericField(field) || type === 'Date' || type === 'DateTime') {
    return !['Contains', 'Starts With'].includes(operator);
  }
  return true;
}
export function dashboardFilterValueError(
  field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] },
  value: string
): string | null {
  if (!value.trim()) return null;
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  if (isNumericField(field) && !Number.isFinite(Number(value))) return 'Enter a valid number';
  if (type === 'Date') {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== value) return 'Enter a valid date';
  }
  if (type === 'DateTime' && !Number.isFinite(new Date(value).getTime())) return 'Enter a valid date and time';
  if (type === 'Checkbox' && !['true', 'false'].includes(value.toLocaleLowerCase())) return 'Choose true or false';
  if (type === 'Picklist' && field.picklistValues?.length && !field.picklistValues.includes(value)) {
    return 'Choose a configured picklist value';
  }
  if (type === 'Multi-Select Picklist' && field.picklistValues?.length
    && value.split(';').some((item) => !field.picklistValues!.includes(item))) {
    return 'Choose configured picklist values';
  }
  return null;
}
export function sanitizeDashboardRichText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'li', 'ol', 'p', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false
  });
}
