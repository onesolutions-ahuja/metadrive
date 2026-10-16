import { registerReportExecutionRoutes } from './execution-routes.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PlatformState, DashboardMetadata, DashboardFilterMetadata, ReportMetadata, RuntimeRecord } from '../../index.js';

type Runtime = typeof import('../../index.js');
export type Dependencies = Pick<Runtime, 'app' | 'runtimeRecordSchema' | 'dashboardFilterSchema' | 'parseReportFilterLogic' | 'reportSchema' | 'reportDateRangeBounds' | 'evaluateReportFilterLogic' | 'reportFilterMatches' | 'dashboardFolderShareSchema' | 'reportFolderSchema' | 'isNumericField' | 'reportFilterOperatorAllowed' | 'dashboardFilterOperatorAllowed' | 'dashboardFilterValueError' | 'reportFilterValueError' | 'persistState' | 'tenantData' | 'getPrincipal' | 'dashboardRunningPrincipal' | 'dashboardRunningUserSelectionError' | 'reportFolderAccessLevelForUser' | 'reportFolderForUser' | 'validateReportFolderReferences' | 'dashboardForUser' | 'requirePermission' | 'accessAuthentication' | 'hasObjectPermission' | 'hasRecordAccess' | 'hasFieldPermission' | 'sanitizeRecordForRead' | 'persistTenantRecords' | 'routeParam' | 'formulaContextForUser' | 'resolveReportCrossFilters' | 'resolveDashboardCrossFilters' | 'canManageReportFolders' | 'calculateFormulaFields' | 'randomUUID' | 'canAccessDashboard' | 'matchesDashboardFilters'> & {
  getState: () => PlatformState;
  setState: (next: PlatformState) => void;
};
export function registerReportRoutes(deps: Dependencies): void {
  const { app, runtimeRecordSchema, dashboardFilterSchema, parseReportFilterLogic, reportSchema, reportDateRangeBounds, evaluateReportFilterLogic, reportFilterMatches, dashboardFolderShareSchema, reportFolderSchema, isNumericField, reportFilterOperatorAllowed, dashboardFilterOperatorAllowed, dashboardFilterValueError, reportFilterValueError, persistState, tenantData, getPrincipal, dashboardRunningPrincipal, dashboardRunningUserSelectionError, reportFolderAccessLevelForUser, reportFolderForUser, validateReportFolderReferences, dashboardForUser, requirePermission, accessAuthentication, hasObjectPermission, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, persistTenantRecords, routeParam, formulaContextForUser, resolveReportCrossFilters, resolveDashboardCrossFilters, canManageReportFolders, calculateFormulaFields, randomUUID, canAccessDashboard, matchesDashboardFilters, getState, setState } = deps;
const reportFolderInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable().default(null),
  shares: z.array(dashboardFolderShareSchema).default([]),
  visibility: z.enum(['Private', 'All Users']).default('Private')
});
app.get('/api/metadata/report-folders', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const canManageAll = canManageReportFolders(principal);
  return res.json({
    folders: tenant.reportFolders
      .filter((folder) => canManageAll || reportFolderAccessLevelForUser(tenant, folder.id, principal.userId) !== null)
      .map((folder) => reportFolderForUser(tenant, folder, principal.userId, canManageAll)),
    canManageAll
  });
});
app.post('/api/metadata/report-folders', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!canManageReportFolders(principal)) return res.status(403).json({ error: 'Report management permission is required' });
  const parsed = reportFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId && !tenant.reportFolders.some((folder) => folder.id === parsed.data.parentFolderId)) {
    return res.status(400).json({ error: 'Parent report folder was not found' });
  }
  if (tenant.reportFolders.some((folder) =>
    folder.parentFolderId === parsed.data.parentFolderId && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase())) {
    return res.status(409).json({ error: 'A report folder with this name already exists at that level' });
  }
  const shareError = validateReportFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const now = new Date().toISOString();
  const folder = reportFolderSchema.parse({
    ...parsed.data,
    id: randomUUID(),
    ownerUserId: principal.userId,
    createdAt: now,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, { ...tenant, reportFolders: [...tenant.reportFolders, folder] });
  return res.status(201).json({ folder: reportFolderForUser(tenantData(principal.tenantId)!, folder, principal.userId, true) });
});
app.put('/api/metadata/report-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const current = tenant.reportFolders.find((folder) => folder.id === folderId);
  if (!current) return res.status(404).json({ error: 'Report folder was not found' });
  if (!canManageReportFolders(principal)
    && reportFolderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager') {
    return res.status(403).json({ error: 'Manager access to this report folder is required' });
  }
  const parsed = reportFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId === folderId) return res.status(400).json({ error: 'A report folder cannot be its own parent' });
  if (parsed.data.parentFolderId && !tenant.reportFolders.some((folder) => folder.id === parsed.data.parentFolderId)) {
    return res.status(400).json({ error: 'Parent report folder was not found' });
  }
  let parentId = parsed.data.parentFolderId;
  const visited = new Set<string>([folderId]);
  while (parentId) {
    if (visited.has(parentId)) return res.status(400).json({ error: 'Report folder nesting cannot contain a cycle' });
    visited.add(parentId);
    parentId = tenant.reportFolders.find((folder) => folder.id === parentId)?.parentFolderId ?? null;
  }
  if (tenant.reportFolders.some((folder) => folder.id !== folderId
    && folder.parentFolderId === parsed.data.parentFolderId
    && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase())) {
    return res.status(409).json({ error: 'A report folder with this name already exists at that level' });
  }
  const shareError = validateReportFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const updated = reportFolderSchema.parse({ ...current, ...parsed.data, updatedAt: new Date().toISOString() });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    reportFolders: tenant.reportFolders.map((folder) => folder.id === folderId ? updated : folder)
  });
  return res.json({ folder: reportFolderForUser(tenantData(principal.tenantId)!, updated, principal.userId, canManageReportFolders(principal)) });
});
app.delete('/api/metadata/report-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const folder = tenant.reportFolders.find((item) => item.id === folderId);
  if (!folder) return res.status(404).json({ error: 'Report folder was not found' });
  if (!canManageReportFolders(principal)
    && reportFolderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager') {
    return res.status(403).json({ error: 'Manager access to this report folder is required' });
  }
  if (tenant.reports.some((report) => report.folderId === folderId)
    || tenant.reportFolders.some((item) => item.parentFolderId === folderId)) {
    return res.status(409).json({ error: 'Report folders containing reports or subfolders cannot be deleted' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    reportFolders: tenant.reportFolders.filter((item) => item.id !== folderId)
  });
  return res.status(204).end();
});
app.get('/api/metadata/reports', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  return res.json({
    reports: tenant.reports.filter((report) =>
      reportFolderAccessLevelForUser(tenant, report.folderId, principal.userId) !== null)
  });
});
registerReportExecutionRoutes(deps);
app.put('/api/metadata/reports/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existingReport = tenant.reports.find((report) => report.apiName === apiName);
  const requestedGroupings = Array.isArray(req.body?.groupByFieldApiNames)
    ? new Set(req.body.groupByFieldApiNames.filter((field: unknown): field is string => typeof field === 'string'))
    : null;
  if (existingReport && requestedGroupings) {
    const invalidatedChart = tenant.dashboards
      .flatMap((dashboard) => dashboard.components.map((component) => ({ dashboard, component })))
      .find(({ component }) => component.reportApiName === apiName
        && component.type === 'Chart'
        && component.groupByFieldApiName
        && !requestedGroupings.has(component.groupByFieldApiName));
    if (invalidatedChart) {
      return res.status(409).json({
        error: `This report update would invalidate dashboard component "${invalidatedChart.component.title}" on "${invalidatedChart.dashboard.label}"`
      });
    }
  }
  const parsed = reportSchema.safeParse({ ...req.body, apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report metadata', details: parsed.error.flatten() });
  const conflictingName = tenant.reports.find((report) =>
    report.apiName.toLowerCase() === parsed.data.apiName.toLowerCase() && report.apiName !== parsed.data.apiName);
  if (conflictingName) return res.status(409).json({ error: `Report API name "${parsed.data.apiName}" conflicts with "${conflictingName.apiName}"` });
  const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
  if (!object || !object.settings?.allowReports) {
    return res.status(422).json({ error: `Reports are not enabled for object "${parsed.data.objectApiName}"` });
  }
  const fieldNames = new Set(object.fields.map((field) => field.apiName));
  const bucketApiNames = new Set(parsed.data.bucketFields.map((bucket) => `Bucket_${bucket.apiName}`));
  const unknownField = [...parsed.data.fieldApiNames, ...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : []),   ...parsed.data.filters.map((filter) => filter.fieldApiName),
  ...Object.keys(parsed.data.summaryOperations), ...Object.keys(parsed.data.dateGroupings),
  ...(parsed.data.standardFilters.dateFieldApiName ? [parsed.data.standardFilters.dateFieldApiName] : []),
  ...(parsed.data.standardFilters.statusFieldApiName ? [parsed.data.standardFilters.statusFieldApiName] : [])]
    .find((fieldApiName) => !fieldNames.has(fieldApiName) && !bucketApiNames.has(fieldApiName));
  if (unknownField) return res.status(400).json({ error: `Report references unknown field "${unknownField}" on "${object.label}"` });
  const invalidBucket = parsed.data.bucketFields.find((bucket) => {
    const source = object.fields.find((field) => field.apiName === bucket.fieldApiName);
    return !source || !isNumericField(source) || fieldNames.has(`Bucket_${bucket.apiName}`);
  });
  if (invalidBucket) return res.status(422).json({ error: `Bucket "${invalidBucket.label}" requires a numeric source field and a unique generated field name` });
  const invalidFilterOperator = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return !field || !reportFilterOperatorAllowed(field, filter.operator);
  });
  if (invalidFilterOperator) return res.status(422).json({ error: `Operator "${invalidFilterOperator.operator}" is not valid for report field "${invalidFilterOperator.fieldApiName}"` });
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
  const invalidSummaryField = Object.keys(parsed.data.summaryOperations).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    const bucket = parsed.data.bucketFields.find((item) => `Bucket_${item.apiName}` === fieldApiName);
    const operations = parsed.data.summaryOperations[fieldApiName];
    return !parsed.data.fieldApiNames.includes(fieldApiName)
      || (bucket ? operations.some((operation) => operation !== 'Count') : !field)
      || (operations.some((operation) => operation !== 'Count') && !isNumericField(field));
  });
  if (invalidSummaryField) return res.status(422).json({ error: `Only Count can summarize a nonnumeric report column: "${invalidSummaryField}"` });
  if (Object.keys(parsed.data.summaryOperations).length
    && (parsed.data.format === 'Tabular' || !parsed.data.groupByFieldApiNames.length)) {
    return res.status(422).json({ error: 'Summary operations require a grouped Summary or Matrix report' });
  }
  const invalidDateGrouping = Object.keys(parsed.data.dateGroupings).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    return !parsed.data.groupByFieldApiNames.includes(fieldApiName)
      && parsed.data.columnGroupByFieldApiName !== fieldApiName
      || !field || !/^(Date|DateTime)(\(|$)/.test(field.dataType);
  });
  if (invalidDateGrouping) return res.status(422).json({ error: `Date grouping requires a grouped Date or DateTime field: "${invalidDateGrouping}"` });
  parsed.data.dateGroupings = {
    ...Object.fromEntries([...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : [])]
      .filter((fieldApiName) => {
        const field = object.fields.find((item) => item.apiName === fieldApiName);
        return Boolean(field && /^(Date|DateTime)(\(|$)/.test(field.dataType));
      })
      .map((fieldApiName) => [fieldApiName, 'Day' as const])),
    ...parsed.data.dateGroupings
  };
  for (const crossFilter of parsed.data.crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    if (!childObject?.fields.some((field) => field.relationship?.targetObject === object.apiName)) {
      return res.status(422).json({ error: `Cross-filter object "${crossFilter.childObjectApiName}" is not related as a child of "${object.apiName}"` });
    }
    const invalidSubfilter = crossFilter.filters.find((filter) =>
      !childObject.fields.some((field) => field.apiName === filter.fieldApiName));
    if (invalidSubfilter) {
      return res.status(400).json({ error: `Unknown cross-filter field "${invalidSubfilter.fieldApiName}" on "${childObject.label}"` });
    }
    const invalidSubfilterOperator = crossFilter.filters.find((filter) => {
      const field = childObject.fields.find((item) => item.apiName === filter.fieldApiName);
      return !field || !reportFilterOperatorAllowed(field, filter.operator);
    });
    if (invalidSubfilterOperator) return res.status(422).json({ error: `Operator "${invalidSubfilterOperator.operator}" is not valid for cross-filter field "${invalidSubfilterOperator.fieldApiName}"` });
    const invalidSubfilterValue = crossFilter.filters.find((filter) => {
      const field = childObject.fields.find((item) => item.apiName === filter.fieldApiName);
      return field && reportFilterValueError(field, filter);
    });
    if (invalidSubfilterValue) {
      const field = childObject.fields.find((item) => item.apiName === invalidSubfilterValue.fieldApiName)!;
      return res.status(422).json({
        error: `Cross-filter value is invalid for "${childObject.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidSubfilterValue)}`
      });
    }
  }
  const reportFields = new Set([...parsed.data.fieldApiNames, ...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : [])]);
  const invalidatingComponent = tenant.dashboards
    .flatMap((dashboard) => dashboard.components.map((component) => ({ dashboard, component })))
    .find(({ component }) => component.reportApiName === parsed.data.apiName && (
      component.objectApiName !== parsed.data.objectApiName
      || [
        ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
        ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
        ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
        ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
        ...component.displayFieldApiNames
      ].some((fieldApiName) => !reportFields.has(fieldApiName))
      || (component.type === 'Chart' && component.groupByFieldApiName !== null
        && component.groupByFieldApiName !== undefined
        && !parsed.data.groupByFieldApiNames.includes(component.groupByFieldApiName))
      || (component.type === 'Chart' && component.seriesFieldApiName !== null
        && component.seriesFieldApiName !== undefined
        && !parsed.data.groupByFieldApiNames.includes(component.seriesFieldApiName))
      || (component.type === 'Chart' && component.chartType === 'Scatter'
        && !parsed.data.groupByFieldApiNames.includes(component.xAxisFieldApiName ?? ''))
    ));
  if (invalidatingComponent) {
    return res.status(409).json({ error: `This report update would invalidate dashboard component "${invalidatingComponent.component.title}" on "${invalidatingComponent.dashboard.label}"` });
  }
  const reportFolders = [...tenant.reportFolders];
  if (parsed.data.folderId && !reportFolders.some((folder) => folder.id === parsed.data.folderId)) {
    return res.status(400).json({ error: 'The selected report folder does not exist in this tenant' });
  }
  let folderId = parsed.data.folderId ?? existingReport?.folderId ?? null;
  let targetFolder = reportFolders.find((folder) => folder.id === folderId);
  if (!targetFolder) {
    const folderLabel = parsed.data.folderName === 'Public Reports' ? 'Public Reports' : 'My Reports';
    const visibility = folderLabel === 'Public Reports' ? 'All Users' : 'Private';
    targetFolder = reportFolders.find((folder) => folder.label === folderLabel
      && folder.visibility === visibility
      && (visibility === 'All Users' || folder.ownerUserId === principal.userId));
    if (!targetFolder) {
      const now = new Date().toISOString();
      targetFolder = reportFolderSchema.parse({
        id: randomUUID(),
        label: folderLabel,
        parentFolderId: null,
        ownerUserId: principal.userId,
        shares: [],
        visibility,
        createdAt: now,
        updatedAt: now
      });
      reportFolders.push(targetFolder);
    }
    folderId = targetFolder.id;
  }
  const existingFolderId = existingReport?.folderId ?? null;
  if (!canManageReportFolders(principal)) {
    const targetAccess = reportFolderAccessLevelForUser(
      { ...tenant, reportFolders },
      folderId,
      principal.userId
    );
    if (targetAccess !== 'Editor' && targetAccess !== 'Manager') {
      return res.status(403).json({ error: 'Editor access to the target report folder is required' });
    }
    if (existingFolderId && existingFolderId !== folderId
      && reportFolderAccessLevelForUser(tenant, existingFolderId, principal.userId) !== 'Manager') {
      return res.status(403).json({ error: 'Manager access to the current report folder is required to move this report' });
    }
  }
  parsed.data.folderId = folderId;
  parsed.data.folderName = targetFolder.label;
  const reports = tenant.reports.some((report) => report.apiName === apiName)
    ? tenant.reports.map((report) => report.apiName === apiName ? parsed.data : report)
    : [...tenant.reports, parsed.data];
  const updatedTenant = { ...tenant, reports, reportFolders };
  const nextState = { ...getState(), tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  setState(nextState);
  return res.json({
    report: parsed.data,
    folder: reportFolderForUser(updatedTenant, targetFolder, principal.userId, canManageReportFolders(principal))
  });
});
app.delete('/api/metadata/reports/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const report = tenant.reports.find((item) => item.apiName === apiName);
  if (!report) return res.status(404).json({ error: 'Report was not found' });
  if (!canManageReportFolders(principal)
    && reportFolderAccessLevelForUser(tenant, report.folderId, principal.userId) !== 'Manager') {
    return res.status(403).json({ error: 'Manager access to the report folder is required to delete this report' });
  }
  const inUse = tenant.dashboards.some((dashboard) => dashboard.components.some((component) => component.reportApiName === apiName));
  if (inUse) return res.status(409).json({ error: 'This report is used by a dashboard. Remove all dashboard references before deleting it.' });
  const updatedTenant = { ...tenant, reports: tenant.reports.filter((report) => report.apiName !== apiName) };
  const nextState = { ...getState(), tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  setState(nextState);
  return res.status(204).end();
});
}
