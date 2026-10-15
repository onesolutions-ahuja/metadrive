/** Generic metadata-backed record query utilities.
 * Call only after tenant, object, record and field permissions have been applied.
 * This deliberately accepts already-authorised records; it never grants access.
 */
export type RecordRow = Record<string, unknown>;
export type QuerySort = { field: string; direction: 'asc' | 'desc'; dataType?: string };

export function orderAuthorisedRecords<T extends RecordRow>(rows: readonly T[], sort?: QuerySort): T[] {
  if (!sort) return [...rows];
  const { field, direction, dataType = '' } = sort;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...rows].sort((left, right) => {
    const a = left[field], b = right[field];
    const aMissing = a === null || a === undefined || a === '';
    const bMissing = b === null || b === undefined || b === '';
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    let comparison = 0;
    if (!aMissing && !bMissing) {
      if (dataType.startsWith('Number') || dataType.startsWith('Currency') || dataType.startsWith('Percent')) {
        comparison = Number(a) - Number(b);
      } else if (['Date', 'Date/Time', 'DateTime'].includes(dataType)) {
        comparison = new Date(String(a)).getTime() - new Date(String(b)).getTime();
      } else {
        comparison = collator.compare(String(a), String(b));
      }
    }
    if (!Number.isFinite(comparison)) comparison = collator.compare(String(a), String(b));
    return comparison ? (direction === 'desc' ? -Math.sign(comparison) : Math.sign(comparison))
      : collator.compare(String(left.Id), String(right.Id));
  });
}

export function pageAuthorisedRecords<T>(rows: readonly T[], offset: number, limit: number) {
  return { records: rows.slice(offset, offset + limit), total: rows.length, offset, limit };
}

/** Filter only records already sanitised for the requesting principal. */
export function filterAuthorisedRecords<T extends RecordRow>(
  records: readonly T[],
  options: { relatedField?: string; relatedId?: string; filterField?: string; filterValue?: string;
    needle?: string; searchFields?: readonly string[] }
): T[] {
  const { relatedField, relatedId, filterField, filterValue, needle = '', searchFields = [] } = options;
  const scoped = relatedField !== undefined && relatedId !== undefined
    ? records.filter((record) => record[relatedField] === relatedId) : [...records];
  const exact = filterField !== undefined && filterValue !== undefined
    ? scoped.filter((record) => String(record[filterField] ?? '') === filterValue) : scoped;
  if (!needle) return exact;
  return exact.filter((record) => searchFields.some((field) =>
    Object.prototype.hasOwnProperty.call(record, field)
    && String(record[field] ?? '').toLocaleLowerCase().includes(needle)));
}
