import { z } from 'zod';
import type { RuntimeRecord, DashboardFilterMetadata } from '../../index.js';

export const reportFilterSchema = z.object({
  id: z.string().min(1),
  fieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With', 'Greater Than', 'Greater Than or Equal To', 'Less Than', 'Less Than or Equal To', 'Includes', 'Excludes', 'Is Null', 'Is Not Null']),
  value: z.string().max(500),
  values: z.array(z.string().max(500)).default([]),
  locked: z.boolean().default(false)
});
export const reportDateRangeSchema = z.enum([
  'All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Next 7 Days', 'Next 30 Days',
  'This Week', 'Last Week', 'This Month', 'Last Month', 'This Quarter',
  'Last Quarter', 'This Year', 'Last Year'
]);
export const reportStandardFiltersSchema = z.object({
  showMe: z.enum(['All', 'My']).default('All'),
  dateFieldApiName: z.string().min(1).nullable().default(null),
  dateRange: reportDateRangeSchema.default('All Time'),
  statusFieldApiName: z.string().min(1).nullable().default(null),
  statusSelection: z.string().max(80).default('All')
});
export const reportCrossFilterSchema = z.object({
  id: z.string().min(1),
  childObjectApiName: z.string().min(1),
  mode: z.enum(['With', 'Without']),
  filters: z.array(reportFilterSchema).default([])
});
export const reportRowLimitSchema = z.object({
  limit: z.number().int().min(1).nullable().default(null),
  sortFieldApiName: z.string().min(1).nullable().default(null),
  sortDirection: z.enum(['Ascending', 'Descending']).default('Ascending')
});
export const reportSummaryOperationSchema = z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']);
export const reportDateGroupingSchema = z.enum(['Day', 'Month', 'Quarter', 'Year']);
type ReportFilterLogicNode =
  | { type: 'filter'; index: number }
  | { type: 'not'; value: ReportFilterLogicNode }
  | { type: 'and' | 'or'; left: ReportFilterLogicNode; right: ReportFilterLogicNode }
  | { type: 'all' | 'any' };
export const parseReportFilterLogic = (logic: string, filterCount: number): ReportFilterLogicNode | null => {
  const normalized = logic.trim().toUpperCase();
  if (normalized === 'ALL') return { type: 'all' };
  if (normalized === 'ANY') return { type: 'any' };
  const tokens = logic.match(/\d+|AND|OR|NOT|\(|\)/gi) ?? [];
  if (tokens.join('').toUpperCase() !== normalized.replace(/\s+/g, '')) return null;
  let cursor = 0;
  const parsePrimary = (): ReportFilterLogicNode | null => {
    const token = tokens[cursor];
    if (!token) return null;
    if (token === '(') {
      cursor += 1;
      const nested = parseOr();
      if (!nested || tokens[cursor] !== ')') return null;
      cursor += 1;
      return nested;
    }
    if (!/^\d+$/.test(token)) return null;
    const index = Number(token);
    if (index < 1 || index > filterCount) return null;
    cursor += 1;
    return { type: 'filter', index: index - 1 };
  };
  const parseUnary = (): ReportFilterLogicNode | null => {
    if (tokens[cursor]?.toUpperCase() === 'NOT') {
      cursor += 1;
      const value = parseUnary();
      return value ? { type: 'not', value } : null;
    }
    return parsePrimary();
  };
  const parseAnd = (): ReportFilterLogicNode | null => {
    let left = parseUnary();
    while (left && tokens[cursor]?.toUpperCase() === 'AND') {
      cursor += 1;
      const right = parseUnary();
      if (!right) return null;
      left = { type: 'and', left, right };
    }
    return left;
  };
  const parseOr = (): ReportFilterLogicNode | null => {
    let left = parseAnd();
    while (left && tokens[cursor]?.toUpperCase() === 'OR') {
      cursor += 1;
      const right = parseAnd();
      if (!right) return null;
      left = { type: 'or', left, right };
    }
    return left;
  };
  const parsed = parseOr();
  return parsed && cursor === tokens.length ? parsed : null;
};
export const reportSchema = z.object({
  reportType: z.literal('Standard').default('Standard'),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  objectApiName: z.string().min(1),
  fieldApiNames: z.array(z.string().min(1)).min(1),
  groupByFieldApiNames: z.array(z.string().min(1)).max(3),
  filterLogic: z.string().trim().min(1).default('All'),
  format: z.enum(['Tabular', 'Summary', 'Matrix']).default('Tabular'),
  columnGroupByFieldApiName: z.string().min(1).nullable().default(null),
  sortFieldApiName: z.string().min(1).nullable().default(null),
  sortDirection: z.enum(['Ascending', 'Descending']).default('Ascending'),
  filters: z.array(reportFilterSchema),
  standardFilters: reportStandardFiltersSchema.default({}),
  crossFilters: z.array(reportCrossFilterSchema).default([]),
  rowLimit: reportRowLimitSchema.default({}),
  summaryOperations: z.record(z.array(reportSummaryOperationSchema).max(5)).default({}),
  dateGroupings: z.record(reportDateGroupingSchema).default({}),
  bucketFields: z.array(z.object({
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
    label: z.string().trim().min(1).max(80),
    fieldApiName: z.string().min(1),
    ranges: z.array(z.object({
      label: z.string().trim().min(1).max(80),
      lowerBound: z.number().finite().nullable(),
      upperBound: z.number().finite().nullable()
    })).min(1),
    treatBlanksAsZero: z.boolean().default(false)
  })).default([]),
  showDetails: z.boolean().default(true),
  showChart: z.boolean().default(false),
  folderName: z.string().trim().min(1).max(80).default('My Reports'),
  folderId: z.string().uuid().nullable().default(null)
}).superRefine((report, context) => {
  if (new Set(report.fieldApiNames).size !== report.fieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldApiNames'], message: 'Report columns must be unique' });
  }
  if (new Set(report.groupByFieldApiNames).size !== report.groupByFieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupByFieldApiNames'], message: 'Report grouping fields must be unique' });
  }
  if (new Set(report.bucketFields.map((bucket) => bucket.apiName.toLowerCase())).size !== report.bucketFields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields'], message: 'Bucket API names must be unique' });
  }
  for (const [bucketIndex, bucket] of report.bucketFields.entries()) {
    if (new Set(bucket.ranges.map((range) => range.label.toLocaleLowerCase())).size !== bucket.ranges.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket labels must be unique' });
    }
    if (bucket.ranges.some((range) => range.lowerBound !== null && range.upperBound !== null && range.lowerBound >= range.upperBound)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket lower bounds must be less than upper bounds' });
    }
    const orderedRanges = [...bucket.ranges].sort((left, right) =>
      (left.lowerBound ?? Number.NEGATIVE_INFINITY) - (right.lowerBound ?? Number.NEGATIVE_INFINITY));
    if (orderedRanges.some((range, index) => index > 0
      && (orderedRanges[index - 1].upperBound === null
        || range.lowerBound === null
        || orderedRanges[index - 1].upperBound! > range.lowerBound))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket ranges cannot overlap' });
    }
  }
  if (report.sortFieldApiName
    && !report.fieldApiNames.includes(report.sortFieldApiName)
    && !report.groupByFieldApiNames.includes(report.sortFieldApiName)
    && report.columnGroupByFieldApiName !== report.sortFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sortFieldApiName'], message: 'Sort field must be included as a report column or grouping field' });
  }
  if (report.columnGroupByFieldApiName
    && (!report.groupByFieldApiNames.length || report.groupByFieldApiNames.includes(report.columnGroupByFieldApiName))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Matrix reports require a distinct column grouping field and at least one row grouping field' });
  }
  if (report.format === 'Matrix' && !report.columnGroupByFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Matrix reports require a column grouping field' });
  }
  if (report.format === 'Summary' && !report.groupByFieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupByFieldApiNames'], message: 'Summary reports require at least one row grouping' });
  }
  if (!report.showDetails && (report.format === 'Tabular' || !report.groupByFieldApiNames.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['showDetails'], message: 'Detail rows can only be hidden on grouped summary or matrix reports' });
  }
  if (report.showChart && (report.format === 'Tabular' || !report.groupByFieldApiNames.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['showChart'], message: 'Report charts require a grouped summary or matrix report' });
  }
  if (Object.values(report.summaryOperations).some((operations) => new Set(operations).size !== operations.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summaryOperations'], message: 'Summary operations must be unique per field' });
  }
  if (report.rowLimit.limit !== null && (report.format !== 'Tabular' || !report.rowLimit.sortFieldApiName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rowLimit'], message: 'Row limits require a tabular report and a sort field' });
  }
  if (report.rowLimit.sortFieldApiName
    && !report.fieldApiNames.includes(report.rowLimit.sortFieldApiName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rowLimit', 'sortFieldApiName'], message: 'Row limit sort field must be a report column' });
  }
  if (report.standardFilters.dateRange !== 'All Time' && !report.standardFilters.dateFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standardFilters', 'dateFieldApiName'], message: 'A date field is required for the selected date range' });
  }
  if (report.standardFilters.statusSelection !== 'All' && !report.standardFilters.statusFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standardFilters', 'statusFieldApiName'], message: 'A status field is required for the selected status range' });
  }
  if (new Set(report.filters.map((filter) => filter.id)).size !== report.filters.length
    || new Set(report.crossFilters.map((filter) => filter.id)).size !== report.crossFilters.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Report filter identifiers must be unique' });
  }
  if (new Set(report.crossFilters.flatMap((filter) => filter.filters.map((subfilter) => subfilter.id))).size
    !== report.crossFilters.reduce((total, filter) => total + filter.filters.length, 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['crossFilters'], message: 'Cross-filter subfilter identifiers must be unique' });
  }
  if (!parseReportFilterLogic(report.filterLogic, report.filters.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filterLogic'], message: 'Filter logic must use valid filter numbers, AND, OR, NOT, and parentheses' });
  }
  if (report.format !== 'Matrix' && report.columnGroupByFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Column grouping is only supported by Matrix reports' });
  }
  const filterIds = report.filters.map((filter) => filter.id);
  if (new Set(filterIds).size !== filterIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Report filter IDs must be unique' });
  }
});
type ReportDateRange = z.infer<typeof reportDateRangeSchema>;
export const reportDateRangeBounds = (range: ReportDateRange, now = new Date()): [number, number] | null => {
  if (range === 'All Time') return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 24 * 60 * 60 * 1000;
  const startOfWeek = today - ((new Date(today).getUTCDay() + 6) % 7) * day;
  const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const startOfQuarter = Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1);
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  switch (range) {
    case 'Today': return [today, today + day];
    case 'Yesterday': return [today - day, today];
    case 'Last 7 Days': return [today - 6 * day, today + day];
    case 'Next 7 Days': return [today + day, today + 8 * day];
    case 'Next 30 Days': return [today + day, today + 31 * day];
    case 'This Week': return [startOfWeek, startOfWeek + 7 * day];
    case 'Last Week': return [startOfWeek - 7 * day, startOfWeek];
    case 'This Month': return [startOfMonth, Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)];
    case 'Last Month': return [Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1), startOfMonth];
    case 'This Quarter': return [startOfQuarter, Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 + 3, 1)];
    case 'Last Quarter': return [Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 - 3, 1), startOfQuarter];
    case 'This Year': return [startOfYear, Date.UTC(now.getUTCFullYear() + 1, 0, 1)];
    case 'Last Year': return [Date.UTC(now.getUTCFullYear() - 1, 0, 1), startOfYear];
  }
};
export const evaluateReportFilterLogic = (node: ReportFilterLogicNode, matches: Array<boolean | null>): boolean | null => {
  switch (node.type) {
    case 'all': {
      const active = matches.filter((value): value is boolean => value !== null);
      return active.length === 0 ? null : active.every(Boolean);
    }
    case 'any': {
      const active = matches.filter((value): value is boolean => value !== null);
      return active.length === 0 ? null : active.some(Boolean);
    }
    case 'filter': return matches[node.index] ?? null;
    case 'not': {
      const value = evaluateReportFilterLogic(node.value, matches);
      return value === null ? null : !value;
    }
    case 'and': {
      const left = evaluateReportFilterLogic(node.left, matches);
      const right = evaluateReportFilterLogic(node.right, matches);
      return left === null ? right : right === null ? left : left && right;
    }
    case 'or': {
      const left = evaluateReportFilterLogic(node.left, matches);
      const right = evaluateReportFilterLogic(node.right, matches);
      return left === null ? right : right === null ? left : left || right;
    }
  }
};
export function reportFilterMatches(
  record: RuntimeRecord,
  filter: z.infer<typeof reportFilterSchema> | DashboardFilterMetadata
): boolean {
  const actual = record[filter.fieldApiName];
  if (filter.operator === 'Is Null') return actual === null || actual === undefined || actual === '';
  if (filter.operator === 'Is Not Null') return actual !== null && actual !== undefined && actual !== '';
  const filterValues = 'values' in filter && filter.values.length
    ? filter.values.filter((item) => item.trim() !== '')
    : filter.value.trim()
      ? ['Includes', 'Excludes'].includes(filter.operator) ? filter.value.split(';').filter((item) => item.trim() !== '') : [filter.value]
      : [];
  if (!filterValues.length) return true;
  const value = actual === null || actual === undefined ? '' : String(actual);
  const normalizedValue = value.toLocaleLowerCase();
  const multiSelectValues = value.split(';').map((item) => item.toLocaleLowerCase());
  if (filter.operator === 'Includes') return filterValues.some((item) => multiSelectValues.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Excludes') return filterValues.every((item) => !multiSelectValues.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Equals') return filterValues.some((item) => normalizedValue === item.toLocaleLowerCase());
  if (filter.operator === 'Not Equal To') return filterValues.every((item) => normalizedValue !== item.toLocaleLowerCase());
  if (filter.operator === 'Contains') return filterValues.some((item) => normalizedValue.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Does Not Contain') return filterValues.every((item) => !normalizedValue.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Starts With') return filterValues.some((item) => normalizedValue.startsWith(item.toLocaleLowerCase()));
  return filterValues.some((item) => {
    const left = Number(value);
    const right = Number(item);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      if (filter.operator === 'Greater Than') return left > right;
      if (filter.operator === 'Greater Than or Equal To') return left >= right;
      if (filter.operator === 'Less Than') return left < right;
      return left <= right;
    }
    if (filter.operator === 'Greater Than') return value > item;
    if (filter.operator === 'Greater Than or Equal To') return value >= item;
    if (filter.operator === 'Less Than') return value < item;
    return value <= item;
  });
}
