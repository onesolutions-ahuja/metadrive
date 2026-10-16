/** Shared list pagination contract. Legacy unpaged reads remain supported. */
export interface RecordPageQuery {
  limit?: unknown;
  offset?: unknown;
  search?: unknown;
  filterField?: unknown;
  sortField?: unknown;
}
export function recordPageRequest(query: RecordPageQuery):
  { paginated: boolean; limit: number; offset: number; valid: boolean } {
  const paginated = query.limit !== undefined || query.offset !== undefined
    || query.search !== undefined || query.filterField !== undefined || query.sortField !== undefined;
  const limit = Number(query.limit ?? 50);
  const offset = Number(query.offset ?? 0);
  return {
    paginated, limit, offset,
    valid: !paginated || (Number.isSafeInteger(limit) && limit >= 1 && limit <= 200
      && Number.isSafeInteger(offset) && offset >= 0)
  };
}
