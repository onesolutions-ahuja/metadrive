/** Shared metadata based record input constraints. */
export function matchesRelatedLookupFilter(
  actualValue: unknown,
  expectedValue: unknown,
  operator: 'Is Null' | 'Is Not Null' | 'Equals' | 'Not Equal To' | 'Contains' | 'Starts With' | 'Greater Than' | 'Less Than'
): boolean {
  const actual = actualValue === undefined || actualValue === null ? '' : String(actualValue);
  const expected = expectedValue === undefined || expectedValue === null ? '' : String(expectedValue);
  if (operator === 'Is Null') return actual === '';
  if (operator === 'Is Not Null') return actual !== '';
  if (operator === 'Equals') return actual === expected;
  if (operator === 'Not Equal To') return actual !== expected;
  if (operator === 'Contains') return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if (operator === 'Starts With') return actual.toLocaleLowerCase().startsWith(expected.toLocaleLowerCase());
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return operator === 'Greater Than' ? actualNumber > expectedNumber : actualNumber < expectedNumber;
  }
  return operator === 'Greater Than'
    ? actual.localeCompare(expected) > 0
    : actual.localeCompare(expected) < 0;
}

export function validateGeolocationValue(label: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const coordinates = typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
  const latitude = coordinates?.latitude;
  const longitude = coordinates?.longitude;
  if (!coordinates || Object.keys(coordinates).length !== 2
    || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Field "${label}" requires numeric latitude (-90 to 90) and longitude (-180 to 180).`);
  }
}
