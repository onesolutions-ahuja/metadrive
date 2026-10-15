import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DashboardMetadata, ReportMetadata } from '../../index.js';
import type { Dependencies } from './routes.js';

/** Registers report preview and execution independently from report editing routes. */
export function registerReportExecutionRoutes(deps: Dependencies): void {
  const { app, runtimeRecordSchema, dashboardFilterSchema, parseReportFilterLogic, reportSchema, reportDateRangeBounds, evaluateReportFilterLogic, reportFilterMatches, isNumericField, reportFilterOperatorAllowed, dashboardFilterOperatorAllowed, dashboardFilterValueError, reportFilterValueError, tenantData, getPrincipal, dashboardRunningPrincipal, dashboardRunningUserSelectionError, reportFolderAccessLevelForUser, dashboardForUser, accessAuthentication, hasObjectPermission, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, routeParam, formulaContextForUser, resolveReportCrossFilters, resolveDashboardCrossFilters, calculateFormulaFields, canAccessDashboard, matchesDashboardFilters, getState } = deps;
const executeReport = (req: Request, res: Response, previewReport?: ReportMetadata) => {
  const viewer = getPrincipal(res);
  const tenant = tenantData(viewer.tenantId)!;
  const apiName = previewReport?.apiName ?? routeParam(req, 'apiName');
  const report = previewReport ?? tenant.reports.find((item) => item.apiName === apiName);
  if (!report) return res.status(404).json({ error: 'Report was not found' });
  if (!previewReport && reportFolderAccessLevelForUser(tenant, report.folderId, viewer.userId) === null) {
    return res.status(404).json({ error: 'Report was not found' });
  }
  const object = tenant.objects.find((item) => item.apiName === report.objectApiName);
  if (!object) return res.status(409).json({ error: `Report object "${report.objectApiName}" is no longer available` });
  if (!object.settings?.allowReports) return res.status(409).json({ error: `Reports are disabled for object "${object.label}"` });
  const runOptions = req.method === 'POST'
    ? z.object({
        dashboardFilters: z.array(dashboardFilterSchema).default([]),
          dashboardFilterLogic: z.enum(['All', 'Any']).default('All'),
          dashboardCrossFilter: dashboardFilterSchema.optional(),
        dashboardCrossFilters: z.array(dashboardFilterSchema).default([]),
        reportFilterOverrides: z.array(z.object({
          id: z.string().min(1),
          value: z.string().max(500).optional(),
          values: z.array(z.string().max(500)).optional()
        })).default([]),
        dashboardApiName: z.string().min(1).optional(),
        dashboardRunningUserId: z.string().min(1).optional(),
        offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(5000).default(100)
    }).safeParse(req.body ?? {})
    : { success: true as const, data: { dashboardFilters: [], dashboardFilterLogic: 'All' as const, dashboardCrossFilter: undefined, dashboardCrossFilters: [], reportFilterOverrides: [], dashboardApiName: undefined, dashboardRunningUserId: undefined, offset: 0, limit: 100 } };
  if (!runOptions.success) return res.status(400).json({ error: 'Invalid report run options', details: runOptions.error.flatten() });
  if (runOptions.data.dashboardRunningUserId && !runOptions.data.dashboardApiName) {
    return res.status(400).json({ error: 'dashboardRunningUserId can only be used with a dashboard report run' });
  }
  let principal = viewer;
  let dashboardForRun: DashboardMetadata | undefined;
  if (runOptions.data.dashboardApiName) {
    const dashboard = tenant.dashboards.find((item) => item.apiName === runOptions.data.dashboardApiName);
    if (!dashboard || !canAccessDashboard(dashboardForUser(tenant, dashboard, viewer.userId), viewer.userId,
      tenant.accessControl.users.find((user) => user.id === viewer.userId)?.permissionSetGroupIds ?? [],
      viewer.permissions.includes('dashboards:manage'))) {
      return res.status(404).json({ error: 'Dashboard was not found' });
    }
    if (!dashboard.components.some((component) =>
      component.reportApiName === apiName && component.objectApiName === report.objectApiName)) {
      return res.status(403).json({ error: 'This report is not a data source on the requested dashboard' });
    }
    const runningUserError = dashboardRunningUserSelectionError(viewer, tenant, dashboard, runOptions.data.dashboardRunningUserId);
    if (runningUserError) return res.status(403).json({ error: runningUserError });
    const runningPrincipal = dashboardRunningPrincipal(viewer, tenant, dashboard, runOptions.data.dashboardRunningUserId);
    if (!runningPrincipal) return res.status(409).json({ error: 'The dashboard running user is no longer active' });
    principal = runningPrincipal;
    dashboardForRun = dashboard;
  }
  const mismatchedFilter = runOptions.data.dashboardFilters
    .find((filter) => filter.objectApiName !== report.objectApiName);
  if (mismatchedFilter) return res.status(400).json({ error: 'Dashboard filters must target the report object' });
  if (dashboardForRun) {
    const configuredDashboard = dashboardForRun;
    const staleDashboardFilter = configuredDashboard.filters.find((filter) => {
      if (filter.objectApiName !== report.objectApiName) return false;
      const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
      return !field || !dashboardFilterOperatorAllowed(field, filter.operator)
        || Boolean(field && dashboardFilterValueError(field, filter.value));
    });
    if (staleDashboardFilter) {
      return res.status(409).json({
        error: `Dashboard filter "${staleDashboardFilter.id}" is no longer valid for report "${report.label}"`
      });
    }
    const invalidDashboardFilter = runOptions.data.dashboardFilters.find((filter) => {
      const configured = configuredDashboard.filters.find((item) => item.id === filter.id);
      return !configured
        || configured.objectApiName !== filter.objectApiName
        || configured.fieldApiName !== filter.fieldApiName
        || configured.operator !== filter.operator;
    });
    if (invalidDashboardFilter) {
      return res.status(400).json({ error: `Filter "${invalidDashboardFilter.id}" is not configured on dashboard "${configuredDashboard.apiName}"` });
    }
    const invalidFilterValue = runOptions.data.dashboardFilters.find((filter) => {
      const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
      return field && dashboardFilterValueError(field, filter.value);
    });
    if (invalidFilterValue) {
      const field = object.fields.find((item) => item.apiName === invalidFilterValue.fieldApiName)!;
      return res.status(400).json({
        error: `Dashboard filter value is invalid for "${object.apiName}.${field.apiName}": ${dashboardFilterValueError(field, invalidFilterValue.value)}`
      });
    }
  }
  const reportFilterIds = new Set(report.filters.map((filter) => filter.id));
  const invalidOverride = runOptions.data.reportFilterOverrides.find((override) => !reportFilterIds.has(override.id));
  if (invalidOverride) return res.status(400).json({ error: `Unknown report filter override "${invalidOverride.id}"` });
  const lockedOverride = runOptions.data.reportFilterOverrides.find((override) => {
    const filter = report.filters.find((item) => item.id === override.id);
    const savedValues = filter ? (filter.values.length ? filter.values : filter.value.trim() ? [filter.value] : []) : [];
    const overriddenValues = override.values ?? savedValues;
    return filter?.locked && (
      (override.value !== undefined && filter.value !== override.value)
      || (override.values !== undefined && JSON.stringify([...savedValues].sort()) !== JSON.stringify([...overriddenValues].sort()))
    );
  });
  if (lockedOverride) return res.status(403).json({ error: `Report filter "${lockedOverride.id}" is locked` });
  if (!hasObjectPermission(principal, tenant, object.apiName, 'read')) {
    return res.status(403).json({ error: `Missing read permission for report object "${object.apiName}"` });
  }
  const activeDashboardFilters = runOptions.data.dashboardFilters.filter((filter) =>
    filter.value.trim() !== '' || filter.operator === 'Is Null' || filter.operator === 'Is Not Null');
  const reportFilterValues = new Map(runOptions.data.reportFilterOverrides.map((filter) => [filter.id, filter]));
  const filtersWithRunValues = report.filters.map((filter) => ({
    ...filter,
    value: reportFilterValues.get(filter.id)?.value ?? filter.value,
    values: reportFilterValues.get(filter.id)?.values ?? filter.values
  }));
  const invalidReportFilterValue = filtersWithRunValues.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && reportFilterValueError(field, filter);
  });
  if (invalidReportFilterValue) {
    const field = object.fields.find((item) => item.apiName === invalidReportFilterValue.fieldApiName)!;
    return res.status(400).json({
      error: `Filter value is invalid for "${object.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidReportFilterValue)}`
    });
  }
  const allFilters = [...filtersWithRunValues, ...activeDashboardFilters];
  const selectedFields = [...new Set([
    ...report.fieldApiNames,
    ...report.groupByFieldApiNames,
    ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
    ...allFilters.map((filter) => filter.fieldApiName),
    ...(report.standardFilters.dateFieldApiName ? [report.standardFilters.dateFieldApiName] : []),
    ...(report.standardFilters.statusFieldApiName ? [report.standardFilters.statusFieldApiName] : [])
  ])];
  const inaccessibleField = selectedFields.find((fieldApiName) => {
    const bucket = report.bucketFields.find((item) => `Bucket_${item.apiName}` === fieldApiName);
    const sourceFieldApiName = bucket?.fieldApiName ?? fieldApiName;
    return !object.fields.some((field) => field.apiName === sourceFieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, sourceFieldApiName, 'read');
  });
  if (inaccessibleField) {
    return res.status(403).json({ error: `Missing read permission for report field "${object.apiName}.${inaccessibleField}"` });
  }
  const crossFilters = [...runOptions.data.dashboardCrossFilters, ...(runOptions.data.dashboardCrossFilter ? [runOptions.data.dashboardCrossFilter] : [])];
  if (dashboardForRun) {
    const configuredDashboard = dashboardForRun;
    const invalidCrossFilter = crossFilters.find((filter) => !configuredDashboard.components.some((component) =>
      component.type === 'Chart'
      && component.objectApiName === filter.objectApiName
      && (component.groupByFieldApiName === filter.fieldApiName
        || component.seriesFieldApiName === filter.fieldApiName)));
    if (invalidCrossFilter) {
      return res.status(400).json({ error: 'Dashboard cross-filters must use a chart grouping or series field on this dashboard' });
    }
  }
  const invalidCrossFilter = crossFilters.find((filter) => {
    const crossFilterObject = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    const field = crossFilterObject?.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && (!dashboardFilterOperatorAllowed(field, filter.operator)
      || Boolean(dashboardFilterValueError(field, filter.value)));
  });
  if (invalidCrossFilter) {
    const crossFilterObject = tenant.objects.find((item) => item.apiName === invalidCrossFilter.objectApiName);
    const field = crossFilterObject?.fields.find((item) => item.apiName === invalidCrossFilter.fieldApiName);
    return res.status(400).json({
      error: field
        ? `Dashboard cross-filter is invalid for "${invalidCrossFilter.objectApiName}.${field.apiName}"`
        : `Dashboard cross-filter field "${invalidCrossFilter.objectApiName}.${invalidCrossFilter.fieldApiName}" is unavailable`
    });
  }
  const sourceRecords = object.apiName === 'User'
    ? getState().users.filter((user) => user.tenantId === principal.tenantId).map((user) => runtimeRecordSchema.parse({
        Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: !user.disabled, UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
      }))
    : tenant.records[object.apiName] ?? [];
  const calculatedSourceRecords = sourceRecords.map((record) =>
    calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId)));
  const reportRunTimestamp = Date.now();
  const reportSourceRecords = object.apiName === 'Opportunity'
    ? calculatedSourceRecords.map((record) => {
        const closeDate = record.CloseDate === null || record.CloseDate === undefined
          ? Number.NaN : new Date(`${String(record.CloseDate)}T00:00:00.000Z`).getTime();
        const createdDate = new Date(String(record.CreatedDate)).getTime();
        const isClosed = /^Closed(?:\b|[\s_-])/i.test(String(record.StageName ?? ''));
        const ageEnd = isClosed && Number.isFinite(closeDate) ? closeDate : reportRunTimestamp;
        const owner = tenant.accessControl.users.find((user) => user.id === record.OwnerId);
        const ownerRole = tenant.accessControl.roles.find((role) =>
          role.id === owner?.roleId || role.name === owner?.role);
        return {
          ...record,
          Fiscal: Number.isFinite(closeDate)
            ? `FY${new Date(closeDate).getUTCFullYear()} Q${Math.floor(new Date(closeDate).getUTCMonth() / 3) + 1}`
            : null,
          Age: Number.isFinite(createdDate) ? Math.max(0, Math.floor((ageEnd - createdDate) / 86_400_000)) : null,
          OwnerRole: ownerRole?.name ?? owner?.role ?? null
        };
      })
    : object.apiName === 'Case'
      ? calculatedSourceRecords.map((record) => {
          const createdDate = new Date(String(record.CreatedDate)).getTime();
          const isClosed = /^closed(?:\b|[\s_-])/i.test(String(record.Status ?? ''));
          const closedDate = record.ClosedDate === null || record.ClosedDate === undefined
            ? Number.NaN : new Date(String(record.ClosedDate)).getTime();
          const lastModifiedDate = new Date(String(record.LastModifiedDate)).getTime();
          const ageEnd = isClosed
            ? Number.isFinite(closedDate) ? closedDate : lastModifiedDate
            : reportRunTimestamp;
          return {
            ...record,
            Age: Number.isFinite(createdDate) && Number.isFinite(ageEnd)
              ? Math.max(0, Math.floor((ageEnd - createdDate) / 86_400_000))
              : null,
            IsOpen: !isClosed,
            IsClosed: isClosed
          };
        })
    : calculatedSourceRecords;
  const matches = (
    record: RuntimeRecord,
    filter: ReportMetadata['filters'][number] | DashboardFilterMetadata
  ) => reportFilterMatches(record, filter);
  const visibleSourceRecords = object.apiName === 'User'
    ? reportSourceRecords
    : reportSourceRecords.filter((record) => hasRecordAccess(principal, tenant, object.apiName, record, 'Read'));
  const crossFilterResolution = resolveDashboardCrossFilters(principal, tenant, object.apiName, crossFilters, matches);
  if ('error' in crossFilterResolution) {
    return res.status(crossFilterResolution.status).json({ error: crossFilterResolution.error });
  }
  const logic = parseReportFilterLogic(report.filterLogic, report.filters.length);
  if (!logic) return res.status(409).json({ error: 'Saved report filter logic is invalid' });
  const activeReportFilterMatches = (record: RuntimeRecord) => {
    const result = evaluateReportFilterLogic(logic, filtersWithRunValues.map((filter) =>
      filter.value.trim() || filter.values.length > 0 || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'
        ? matches(record, filter)
        : null));
    return result ?? true;
  };
  const dateBounds = reportDateRangeBounds(report.standardFilters.dateRange);
  const reportCrossFilterResolution = resolveReportCrossFilters(principal, tenant, object, report.crossFilters, matches);
  if ('error' in reportCrossFilterResolution) {
    return res.status(reportCrossFilterResolution.status).json({ error: reportCrossFilterResolution.error });
  }
  const matchedRecords = visibleSourceRecords.filter((record) => (
    report.filters.length === 0 || activeReportFilterMatches(record)
  )
    && (report.standardFilters.showMe !== 'My' || record.OwnerId === principal.userId)
    && (!dateBounds || !report.standardFilters.dateFieldApiName || (() => {
      const value = record[report.standardFilters.dateFieldApiName!];
      const timestamp = value === null || value === undefined || value === '' ? Number.NaN : new Date(String(value)).getTime();
      return Number.isFinite(timestamp) && timestamp >= dateBounds[0] && timestamp < dateBounds[1];
    })())
    && (report.standardFilters.statusSelection === 'All' || !report.standardFilters.statusFieldApiName || (() => {
      const value = String(record[report.standardFilters.statusFieldApiName!] ?? '');
      const isClosed = /^closed(?:\b|[\s_-])/i.test(value);
      if (report.standardFilters.statusSelection === 'Closed') return isClosed;
      if (report.standardFilters.statusSelection === 'Open') return value !== '' && !isClosed;
      return value.toLocaleLowerCase() === report.standardFilters.statusSelection.toLocaleLowerCase();
    })())
    && matchesDashboardFilters(
      activeDashboardFilters,
      runOptions.data.dashboardFilterLogic,
      (filter) => matches(record, filter)
    )
    && (!crossFilters.length || crossFilterResolution.recordIds.has(record.Id))
    && reportCrossFilterResolution.matchesRecord(record));
  const visibleRecords = matchedRecords.map((record) => {
    const bucketValues: Record<string, unknown> = {};
    for (const bucket of report.bucketFields) {
      const raw = (record as RuntimeRecord)[bucket.fieldApiName];
      const numericValue = raw === null || raw === undefined || raw === ''
        ? bucket.treatBlanksAsZero ? 0 : Number.NaN
        : Number(raw);
      const range = Number.isFinite(numericValue)
        ? bucket.ranges.find((candidate) =>
          (candidate.lowerBound === null || numericValue >= candidate.lowerBound)
          && (candidate.upperBound === null || numericValue < candidate.upperBound))
        : undefined;
      bucketValues[`Bucket_${bucket.apiName}`] = range?.label ?? null;
    }
    return { ...record, ...bucketValues } as RuntimeRecord;
  });
  const configuredSortField = report.rowLimit.limit !== null
    ? report.rowLimit.sortFieldApiName
    : report.sortFieldApiName;
  const sortField = configuredSortField
    ? object.fields.find((field) => field.apiName === configuredSortField)
    : undefined;
  const isBucketSort = Boolean(configuredSortField && report.bucketFields.some((bucket) => `Bucket_${bucket.apiName}` === configuredSortField));
  const sortDirection = (report.rowLimit.limit !== null ? report.rowLimit.sortDirection : report.sortDirection) === 'Descending' ? -1 : 1;
  const compareSortValues = (leftValue: unknown, rightValue: unknown): number => {
    if (leftValue === null || leftValue === undefined || leftValue === '') return rightValue === null || rightValue === undefined || rightValue === '' ? 0 : -1;
    if (rightValue === null || rightValue === undefined || rightValue === '') return 1;
    if (isNumericField(sortField)) {
      return (Number(leftValue) - Number(rightValue)) * sortDirection;
    }
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * sortDirection;
  };
  if (sortField || isBucketSort) {
    visibleRecords.sort((left, right) =>
      compareSortValues((left as RuntimeRecord)[configuredSortField!], (right as RuntimeRecord)[configuredSortField!])
      || left.Id.localeCompare(right.Id));
  }
  if (report.rowLimit.limit !== null) visibleRecords.splice(report.rowLimit.limit);
  const numericSummaryFields = report.fieldApiNames.filter((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    return isNumericField(field);
  });
  type NumericSummary = { sums: Record<string, number>; counts: Record<string, number>; minimums: Record<string, number>; maximums: Record<string, number> };
  const summarizeNumericFields = (records: RuntimeRecord[]): NumericSummary => {
    const summary: NumericSummary = { sums: {}, counts: {}, minimums: {}, maximums: {} };
    report.fieldApiNames.forEach((fieldApiName) => {
      summary.counts[fieldApiName] = records.filter((record) =>
        record[fieldApiName] !== null && record[fieldApiName] !== undefined && record[fieldApiName] !== '').length;
    });
    numericSummaryFields.forEach((fieldApiName) => {
      const values = records
        .map((record) => record[fieldApiName])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite);
      summary.sums[fieldApiName] = values.reduce((total, value) => total + value, 0);
      summary.counts[fieldApiName] = values.length;
      if (values.length) {
        summary.minimums[fieldApiName] = values.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY);
        summary.maximums[fieldApiName] = values.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY);
      }
    });
    return summary;
  };
  const addRecordToSummary = (summary: NumericSummary, record: RuntimeRecord) => {
    report.fieldApiNames.forEach((fieldApiName) => {
      const rawValue = record[fieldApiName];
      if (rawValue !== null && rawValue !== undefined && rawValue !== '') summary.counts[fieldApiName] += 1;
    });
    numericSummaryFields.forEach((fieldApiName) => {
      const rawValue = record[fieldApiName];
      if (rawValue === null || rawValue === undefined || rawValue === '') return;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return;
      summary.sums[fieldApiName] += value;
      summary.minimums[fieldApiName] = fieldApiName in summary.minimums ? Math.min(summary.minimums[fieldApiName], value) : value;
      summary.maximums[fieldApiName] = fieldApiName in summary.maximums ? Math.max(summary.maximums[fieldApiName], value) : value;
    });
  };
  const groupValueFor = (record: RuntimeRecord, fieldApiName: string): unknown => {
    const value = record[fieldApiName];
    const granularity = report.dateGroupings[fieldApiName];
    if (value === null || value === undefined || !granularity) return value ?? null;
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime())) return value;
    if (granularity === 'Day') return date.toISOString().slice(0, 10);
    const year = date.getUTCFullYear();
    if (granularity === 'Year') return String(year);
    if (granularity === 'Quarter') return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    if (granularity === 'Month') return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return date.toISOString().slice(0, 10);
  };
  const grouped = new Map<string, { groupValues: Record<string, unknown>; rowCount: number } & NumericSummary>();
  const subtotals = new Map<string, { groupValues: Record<string, unknown>; groupLevel: number; rowCount: number } & NumericSummary>();
  if (report.groupByFieldApiNames.length) {
    visibleRecords.forEach((record) => {
      const groupingFields = [...report.groupByFieldApiNames, ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : [])];
      const groupValues = Object.fromEntries(groupingFields.map((fieldApiName) => [
        fieldApiName,
        groupValueFor(record, fieldApiName)
      ]));
      const key = JSON.stringify(groupingFields.map((fieldApiName) => groupValues[fieldApiName]));
      const group = grouped.get(key) ?? { groupValues, rowCount: 0, ...summarizeNumericFields([]) };
      group.rowCount += 1;
      addRecordToSummary(group, record);
      grouped.set(key, group);

      for (let groupLevel = 1; groupLevel < report.groupByFieldApiNames.length; groupLevel += 1) {
        const subtotalFields = report.groupByFieldApiNames.slice(0, groupLevel);
        const subtotalValues = Object.fromEntries(subtotalFields.map((fieldApiName) => [
          fieldApiName,
          groupValueFor(record, fieldApiName)
        ]));
        if (report.columnGroupByFieldApiName) {
          subtotalValues[report.columnGroupByFieldApiName] = groupValueFor(record, report.columnGroupByFieldApiName);
        }
        const subtotalKey = JSON.stringify([
          groupLevel,
          ...subtotalFields.map((fieldApiName) => subtotalValues[fieldApiName]),
          ...(report.columnGroupByFieldApiName ? [subtotalValues[report.columnGroupByFieldApiName]] : [])
        ]);
        const subtotal = subtotals.get(subtotalKey) ?? {
          groupValues: subtotalValues,
          groupLevel,
          rowCount: 0,
          ...summarizeNumericFields([])
        };
        subtotal.rowCount += 1;
        addRecordToSummary(subtotal, record);
        subtotals.set(subtotalKey, subtotal);
      }
    });
  }
  const summaryTotals = {
    rowCount: visibleRecords.length,
    ...summarizeNumericFields(visibleRecords)
  };
  const rows = report.showDetails || runOptions.data.dashboardApiName
    ? visibleRecords.slice(runOptions.data.offset, runOptions.data.offset + runOptions.data.limit).map((record) => {
    const readable = sanitizeRecordForRead(principal, tenant, object, record);
    const outputFields = new Set([...report.fieldApiNames, ...report.groupByFieldApiNames, ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : [])]);
    return Object.fromEntries([...outputFields].map((fieldApiName) => {
      const value = report.bucketFields.some((bucket) => `Bucket_${bucket.apiName}` === fieldApiName)
        ? (record as RuntimeRecord)[fieldApiName] ?? null
        : readable[fieldApiName] ?? null;
      if (runOptions.data.dashboardApiName || typeof value !== 'string') return [fieldApiName, value];
      const field = object.fields.find((item) => item.apiName === fieldApiName);
      const targetObjectApiName = field?.relationship?.targetObject;
      if (!targetObjectApiName) return [fieldApiName, value];
      const targetObject = tenant.objects.find((item) => item.apiName === targetObjectApiName);
      if (!targetObject || !hasObjectPermission(principal, tenant, targetObjectApiName, 'read')
        || !hasFieldPermission(principal, tenant, targetObjectApiName, 'Name', 'read')) {
        return [fieldApiName, null];
      }
      if (targetObjectApiName === 'User') {
        const relatedUser = getState().users.find((user) => user.id === value && user.tenantId === principal.tenantId);
        return [fieldApiName, relatedUser?.name ?? null];
      }
      const relatedRecord = (tenant.records[targetObjectApiName] ?? []).find((item) => item.Id === value);
      if (!relatedRecord || !hasRecordAccess(principal, tenant, targetObjectApiName, relatedRecord, 'Read')) {
        return [fieldApiName, null];
      }
      return [fieldApiName, sanitizeRecordForRead(principal, tenant, targetObject, relatedRecord).Name ?? null];
    }));
    })
    : [];
  const summaryRows = [...grouped.values()];
  const subtotalRows = [...subtotals.values()].sort((left, right) => {
    const leftKey = JSON.stringify(report.groupByFieldApiNames.slice(0, left.groupLevel)
      .map((fieldApiName) => left.groupValues[fieldApiName]));
    const rightKey = JSON.stringify(report.groupByFieldApiNames.slice(0, right.groupLevel)
      .map((fieldApiName) => right.groupValues[fieldApiName]));
    return left.groupLevel - right.groupLevel || leftKey.localeCompare(rightKey)
      || String(left.groupValues[report.columnGroupByFieldApiName ?? ''] ?? '')
        .localeCompare(String(right.groupValues[report.columnGroupByFieldApiName ?? ''] ?? ''));
  });
  if (sortField) {
    summaryRows.sort((left, right) => {
      const leftValue = left.groupValues[sortField.apiName] ?? left.sums[sortField.apiName];
      const rightValue = right.groupValues[sortField.apiName] ?? right.sums[sortField.apiName];
      const comparison = report.dateGroupings[sortField.apiName]
        ? String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        : compareSortValues(leftValue, rightValue);
      return comparison
        || JSON.stringify(left.groupValues).localeCompare(JSON.stringify(right.groupValues));
    });
  } else {
    summaryRows.sort((left, right) => JSON.stringify(left.groupValues).localeCompare(JSON.stringify(right.groupValues)));
  }
  return res.json({
    report,
    rows,
    summaryRows,
    subtotalRows,
    summaryTotals,
    totalRows: visibleRecords.length,
    offset: runOptions.data.offset,
    pageSize: runOptions.data.limit,
    truncated: (report.showDetails || Boolean(runOptions.data.dashboardApiName))
      && visibleRecords.length > runOptions.data.offset + rows.length,
    generatedAt: new Date().toISOString()
  });
};
app.post('/api/reports/preview', accessAuthentication, (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body?.report);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid report preview configuration', details: parsed.error.flatten() });
  }
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
  if (!object || !object.settings?.allowReports) {
    return res.status(422).json({ error: `Reports are not enabled for object "${parsed.data.objectApiName}"` });
  }
  const fieldNames = new Set(object.fields.map((field) => field.apiName));
  const bucketApiNames = new Set(parsed.data.bucketFields.map((bucket) => `Bucket_${bucket.apiName}`));
  const referencedFields = [
    ...parsed.data.fieldApiNames,
    ...parsed.data.groupByFieldApiNames,
    ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : []),
    ...parsed.data.filters.map((filter) => filter.fieldApiName),
    ...Object.keys(parsed.data.summaryOperations),
    ...Object.keys(parsed.data.dateGroupings),
    ...(parsed.data.standardFilters.dateFieldApiName ? [parsed.data.standardFilters.dateFieldApiName] : []),
    ...(parsed.data.standardFilters.statusFieldApiName ? [parsed.data.standardFilters.statusFieldApiName] : [])
  ];
  const unknownField = referencedFields.find((fieldApiName) => !fieldNames.has(fieldApiName) && !bucketApiNames.has(fieldApiName));
  if (unknownField) {
    return res.status(400).json({ error: `Report references unknown field "${unknownField}" on "${object.label}"` });
  }
  const invalidBucket = parsed.data.bucketFields.find((bucket) => {
    const source = object.fields.find((field) => field.apiName === bucket.fieldApiName);
    return !source || !isNumericField(source) || fieldNames.has(`Bucket_${bucket.apiName}`);
  });
  if (invalidBucket) return res.status(422).json({ error: `Bucket "${invalidBucket.label}" requires a numeric source field and a unique generated field name` });
  if (parsed.data.standardFilters.showMe === 'My' && !fieldNames.has('OwnerId')) {
    return res.status(422).json({ error: `The "${object.label}" report type does not support the My records standard filter` });
  }
  if (parsed.data.standardFilters.dateFieldApiName) {
    const dateField = object.fields.find((field) => field.apiName === parsed.data.standardFilters.dateFieldApiName);
    if (!dateField || !/^(Date|DateTime)(\(|$)/.test(dateField.dataType)) {
      return res.status(422).json({ error: 'The standard report date filter must use a Date or DateTime field' });
    }
  }
  if (parsed.data.standardFilters.statusFieldApiName) {
    const statusField = object.fields.find((field) => field.apiName === parsed.data.standardFilters.statusFieldApiName);
    if (!statusField?.picklistValues?.length || !['Status', 'StageName'].includes(statusField.apiName)) {
      return res.status(422).json({ error: 'The standard report status filter must use a Status or StageName picklist field' });
    }
    if (!['All', 'Open', 'Closed'].includes(parsed.data.standardFilters.statusSelection)
      && !statusField.picklistValues.includes(parsed.data.standardFilters.statusSelection)) {
      return res.status(422).json({ error: `Unknown status value "${parsed.data.standardFilters.statusSelection}" for "${statusField.label}"` });
    }
  }
  const invalidFilterOperator = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return !field || !reportFilterOperatorAllowed(field, filter.operator);
  });
  if (invalidFilterOperator) {
    return res.status(422).json({ error: `Operator "${invalidFilterOperator.operator}" is not valid for report field "${invalidFilterOperator.fieldApiName}"` });
  }
  const invalidFilterValue = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && reportFilterValueError(field, filter);
  });
  if (invalidFilterValue) {
    const field = object.fields.find((item) => item.apiName === invalidFilterValue.fieldApiName)!;
    return res.status(422).json({
      error: `Filter value is invalid for "${object.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidFilterValue)}`
    });
  }
  for (const crossFilter of parsed.data.crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    if (!childObject?.fields.some((field) => field.relationship?.targetObject === object.apiName)) {
      return res.status(422).json({ error: `Cross-filter object "${crossFilter.childObjectApiName}" is not related as a child of "${object.apiName}"` });
    }
    const invalidSubfilter = crossFilter.filters.find((filter) => {
      const field = childObject.fields.find((item) => item.apiName === filter.fieldApiName);
      return !field || !reportFilterOperatorAllowed(field, filter.operator) || Boolean(reportFilterValueError(field, filter));
    });
    if (invalidSubfilter) {
      return res.status(422).json({
        error: `Invalid cross-filter condition on "${childObject.apiName}.${invalidSubfilter.fieldApiName}"`
      });
    }
  }
  const invalidSummaryField = Object.keys(parsed.data.summaryOperations).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    const bucket = parsed.data.bucketFields.find((item) => `Bucket_${item.apiName}` === fieldApiName);
    const operations = parsed.data.summaryOperations[fieldApiName];
    return !parsed.data.fieldApiNames.includes(fieldApiName)
      || (bucket ? operations.some((operation) => operation !== 'Count') : !field)
      || (operations.some((operation) => operation !== 'Count') && !isNumericField(field));
  });
  if (invalidSummaryField) {
    return res.status(422).json({ error: `Only Count can summarize a nonnumeric report column: "${invalidSummaryField}"` });
  }
  const invalidDateGrouping = Object.keys(parsed.data.dateGroupings).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    return (!parsed.data.groupByFieldApiNames.includes(fieldApiName)
      && parsed.data.columnGroupByFieldApiName !== fieldApiName)
      || !field
      || !/^(Date|DateTime)(\(|$)/.test(field.dataType);
  });
  if (invalidDateGrouping) {
    return res.status(422).json({ error: `Date grouping requires a grouped Date or DateTime field: "${invalidDateGrouping}"` });
  }
  const report = {
    ...parsed.data,
    dateGroupings: {
      ...Object.fromEntries([...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : [])]
        .filter((fieldApiName) => {
          const field = object.fields.find((item) => item.apiName === fieldApiName);
          return Boolean(field && /^(Date|DateTime)(\(|$)/.test(field.dataType));
        })
        .map((fieldApiName) => [fieldApiName, 'Day' as const])),
      ...parsed.data.dateGroupings
    }
  };
  return executeReport(req, res, report);
});
app.get('/api/reports/:apiName/run', accessAuthentication, (req: Request, res: Response) => executeReport(req, res));
app.post('/api/reports/:apiName/run', accessAuthentication, (req: Request, res: Response) => executeReport(req, res));
}
