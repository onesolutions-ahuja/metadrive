/** Shared, side-effect-free comparison for metadata record filters and visibility rules.
 * Validity, read permissions and field presence are checked by callers.
 * Preserve the existing locale-specific Contains behaviour for record filters.
 */
export function compareMetadataValue(
  actual: unknown, operator: string, expected: unknown, localeCase = false
): boolean {
  if (actual === null || actual === undefined) return false;
  const left = String(actual);
  const right = String(expected ?? '');
  switch (operator) {
    case 'Equals': return left === right;
    case 'Not Equals': return left !== right;
    case 'Contains': return localeCase
      ? left.toLocaleLowerCase().includes(right.toLocaleLowerCase())
      : left.toLowerCase().includes(right.toLowerCase());
    case 'Greater Than': return Number(actual) > Number(right);
    case 'Less Than': return Number(actual) < Number(right);
    default: return false;
  }
}
