import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PlatformState, DashboardFolder, DashboardFilterMetadata, DashboardSnapshot, RuntimeRecord } from '../../index.js';

type Runtime = typeof import('../../index.js');
type Dependencies = Pick<Runtime, 'app' | 'dashboardFilterSchema' | 'reportFilterMatches' | 'dashboardSnapshotSchema' | 'dashboardFilterOperatorAllowed' | 'dashboardFilterValueError' | 'sanitizeDashboardRichText' | 'tenantData' | 'getPrincipal' | 'dashboardRunningPrincipal' | 'dashboardRunningUserSelectionError' | 'reportFolderAccessLevelForUser' | 'dashboardForUser' | 'requirePermission' | 'hasObjectPermission' | 'hasRecordAccess' | 'hasFieldPermission' | 'sanitizeRecordForRead' | 'persistTenantRecords' | 'routeParam' | 'formulaContextForUser' | 'resolveDashboardCrossFilters' | 'calculateFormulaFields' | 'pickDashboardSnapshotProperties' | 'libraryComponentVisible' | 'randomUUID' | 'sanitizeHtml' | 'canAccessDashboard' | 'matchesDashboardFilters'> & {
  getState: () => PlatformState;
  setState: (next: PlatformState) => void;
};
export function registerDashboardSnapshotRoutes(deps: Dependencies): void {
  const { app, dashboardFilterSchema, reportFilterMatches, dashboardSnapshotSchema, dashboardFilterOperatorAllowed, dashboardFilterValueError, sanitizeDashboardRichText, tenantData, getPrincipal, dashboardRunningPrincipal, dashboardRunningUserSelectionError, reportFolderAccessLevelForUser, dashboardForUser, requirePermission, hasObjectPermission, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, persistTenantRecords, routeParam, formulaContextForUser, resolveDashboardCrossFilters, calculateFormulaFields, pickDashboardSnapshotProperties, libraryComponentVisible, randomUUID, sanitizeHtml, canAccessDashboard, matchesDashboardFilters, getState, setState } = deps;
app.get('/api/metadata/dashboards/:apiName/snapshots', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const dashboard = tenant.dashboards.find((item) => item.apiName === apiName);
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const accessUser = tenant.accessControl.users.find((user) => user.id === principal.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, principal.userId), principal.userId, accessUser?.permissionSetGroupIds ?? [], principal.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  const snapshots = (tenant.dashboardSnapshots ?? [])
    .filter((snapshot) => snapshot.dashboardApiName === apiName && snapshot.createdBy === principal.userId)
    .filter((snapshot) => {
      const runningPrincipal = !dashboard.runningUserId && snapshot.runningUserId === principal.userId
        ? principal
        : dashboardRunningPrincipal(principal, tenant, dashboard, snapshot.runningUserId);
      if (!runningPrincipal) return false;
      const dataComponents = snapshot.components.filter((component) =>
        component.type === 'Metric' || component.type === 'Chart' || component.type === 'Table');
      if (dataComponents.length && !snapshot.sourceRecordAccess) return false;
      if (snapshot.sourceRecordAccess?.some((source) => {
        const object = tenant.objects.find((item) => item.apiName === source.objectApiName);
        const record = tenant.records[source.objectApiName]?.find((item) => item.Id === source.recordId);
        return !object || !record || !hasRecordAccess(runningPrincipal, tenant, source.objectApiName, record, 'Read');
      })) return false;
      return snapshot.components.every((snapshotComponent) => {
        const component = dashboard.components.find((item) => item.id === snapshotComponent.componentId);
        if (!component) return false;
        if (component.type === 'Rich Text' || component.type === 'Image' || component.type === 'Custom') return true;
        const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
        if (!object || !hasObjectPermission(runningPrincipal, tenant, object.apiName, 'read')) return false;
        const report = component.reportApiName
          ? tenant.reports.find((item) => item.apiName === component.reportApiName)
          : undefined;
        if (component.reportApiName && (!report
          || reportFolderAccessLevelForUser(tenant, report.folderId, principal.userId) === null)) return false;
        const fieldApiNames = new Set([
          ...snapshotComponent.columns.map((column) => column.apiName),
          ...component.displayFieldApiNames,
          ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
          ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
          ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
          ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
          ...(report?.fieldApiNames ?? []),
          ...(report?.groupByFieldApiNames ?? []),
          ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
          ...(report?.filters.map((filter) => filter.fieldApiName) ?? []),
          ...dashboard.filters.filter((filter) => filter.objectApiName === object.apiName)
            .map((filter) => filter.fieldApiName)
        ]);
        return [...fieldApiNames].every((fieldApiName) =>
          object.fields.some((field) => field.apiName === fieldApiName)
          && hasFieldPermission(runningPrincipal, tenant, object.apiName, fieldApiName, 'read'));
      });
    });
  return res.json({
      snapshots: snapshots
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((snapshot) => {
          const responseSnapshot = { ...snapshot };
          delete responseSnapshot.sourceRecordAccess;
          return responseSnapshot;
        })
    });
});
app.post('/api/metadata/dashboards/:apiName/snapshots', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const viewer = getPrincipal(res);
  const tenant = tenantData(viewer.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const dashboard = tenant.dashboards.find((item) => item.apiName === apiName);
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const accessUser = tenant.accessControl.users.find((user) => user.id === viewer.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, viewer.userId), viewer.userId, accessUser?.permissionSetGroupIds ?? [], viewer.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  if (dashboard.status !== 'Deployed') return res.status(409).json({ error: 'Publish the dashboard before creating a snapshot' });
  const input = z.object({
    label: z.string().trim().min(1).max(80),
    runningUserId: z.string().min(1).optional(),
    filters: z.array(dashboardFilterSchema).optional(),
    crossFilter: dashboardFilterSchema.optional(),
    crossFilters: z.array(dashboardFilterSchema).optional(),
    customComponents: z.array(z.object({
      componentId: z.string().min(1),
      html: z.string().max(50_000)
    }).strict()).default([])
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Snapshot label or filters are invalid', details: input.error.flatten() });
  const runningUserError = dashboardRunningUserSelectionError(viewer, tenant, dashboard, input.data.runningUserId);
  if (runningUserError) return res.status(403).json({ error: runningUserError });
  const principal = dashboardRunningPrincipal(viewer, tenant, dashboard, input.data.runningUserId);
  if (!principal) return res.status(409).json({ error: 'The dashboard running user is no longer active' });
  const requestedFilters = input.data.filters ?? dashboard.filters;
  const invalidFilter = requestedFilters.find((filter) => {
    const configured = dashboard.filters.find((item) => item.id === filter.id);
    return !configured || configured.objectApiName !== filter.objectApiName || configured.fieldApiName !== filter.fieldApiName
      || configured.operator !== filter.operator;
  });
  if (invalidFilter) return res.status(400).json({ error: 'Snapshot filters must match filters configured on the dashboard' });
  const snapshotFilters = dashboard.filters.map((filter) => ({
    ...filter,
    value: requestedFilters.find((item) => item.id === filter.id)?.value ?? filter.value
  }));
  for (const filter of snapshotFilters) {
    const object = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    const field = object?.fields.find((item) => item.apiName === filter.fieldApiName);
    if (!field || !object?.settings?.allowReports) {
      return res.status(409).json({ error: `Dashboard filter field "${filter.objectApiName}.${filter.fieldApiName}" is no longer available` });
    }
    if (!dashboardFilterOperatorAllowed(field, filter.operator)) {
      return res.status(409).json({ error: `Dashboard filter operator "${filter.operator}" is no longer valid for "${filter.objectApiName}.${field.apiName}"` });
    }
    const invalidValue = field ? dashboardFilterValueError(field, filter.value) : null;
    if (invalidValue) return res.status(400).json({ error: `Snapshot filter value is invalid for "${filter.fieldApiName}": ${invalidValue}` });
  }
  const crossFilters = [...(input.data.crossFilters ?? []), ...(input.data.crossFilter ? [input.data.crossFilter] : [])];
  const customComponents = new Map(input.data.customComponents.map((item) => [item.componentId, item.html]));
  if (customComponents.size !== input.data.customComponents.length) {
    return res.status(400).json({ error: 'Custom component snapshots must have unique component IDs' });
  }
  const dashboardCustomComponents = dashboard.components.filter((component) => component.type === 'Custom');
  if (dashboardCustomComponents.some((component) => !customComponents.has(component.id))
    || [...customComponents.keys()].some((componentId) => !dashboardCustomComponents.some((component) => component.id === componentId))) {
    return res.status(400).json({ error: 'Capture each registered custom dashboard component exactly once' });
  }
  if (crossFilters.some((crossFilter) => !dashboard.components.some((component) =>
    component.type === 'Chart'
    && component.objectApiName === crossFilter.objectApiName
    && (component.groupByFieldApiName === crossFilter.fieldApiName
      || component.seriesFieldApiName === crossFilter.fieldApiName)))) {
    return res.status(400).json({ error: 'Snapshot cross-filter must use a chart grouping field on this dashboard' });
  }
  const invalidCrossFilter = crossFilters.find((filter) => {
    const object = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    const field = object?.fields.find((item) => item.apiName === filter.fieldApiName);
    return !field || !dashboardFilterOperatorAllowed(field, filter.operator)
      || Boolean(field && dashboardFilterValueError(field, filter.value));
  });
  if (invalidCrossFilter) {
    return res.status(400).json({ error: `Snapshot cross-filter is invalid for "${invalidCrossFilter.objectApiName}.${invalidCrossFilter.fieldApiName}"` });
  }
  const matchesFilter = (record: RuntimeRecord, filter: DashboardFilterMetadata) => reportFilterMatches(record, filter);
  const components: DashboardSnapshot['components'] = [];
  const sourceRecordAccess = new Map<string, { objectApiName: string; recordId: string }>();
  for (const component of dashboard.components) {
    if (component.type === 'Rich Text') {
      const richTextContent = sanitizeDashboardRichText(component.richTextContent);
      components.push({
        ...pickDashboardSnapshotProperties(component),
        componentId: component.id,
        type: 'Rich Text',
        customHtml: null,
        richTextContent,
        imageUrl: '',
        imageAltText: '',
        unavailableReason: null,
        chartType: null,
        xAxisFieldApiName: null,
        xAxisTitle: '',
        yAxisTitle: '',
        showGridlines: false,
        showLegend: false,
        showValues: false,
        objectApiName: 'Content',
        groupByLabel: null,
        totalRows: 0,
        metricValue: null,
        columns: [],
        buckets: [],
        rows: []
      });
      continue;
    }
    if (component.type === 'Image') {
      components.push({
        ...pickDashboardSnapshotProperties(component),
        componentId: component.id,
        type: 'Image',
        customHtml: null,
        richTextContent: '',
        imageUrl: component.imageUrl,
        imageAltText: component.imageAltText,
        unavailableReason: null,
        chartType: null,
        xAxisFieldApiName: null,
        xAxisTitle: '',
        yAxisTitle: '',
        showGridlines: false,
        showLegend: false,
        showValues: false,
        objectApiName: 'Content',
        groupByLabel: null,
        totalRows: 0,
        metricValue: null,
        columns: [],
        buckets: [],
        rows: []
      });
      continue;
    }
    if (component.type === 'Custom') {
      const registered = getState().libraryComponents.find((item) =>
        item.apiName === component.customComponentApiName && item.surfaces.includes('dashboard')
          && libraryComponentVisible(item, viewer.tenantId, Object.keys(getState().tenants)));
      if (!registered) return res.status(409).json({ error: `Custom dashboard component "${component.customComponentApiName}" is no longer available` });
      const capturedHtml = customComponents.get(component.id);
      if (capturedHtml === undefined) return res.status(400).json({ error: `Custom dashboard component "${component.title}" was not captured` });
      const sanitizedHtml = sanitizeHtml(capturedHtml, {
        allowedTags: [
          'a', 'b', 'blockquote', 'br', 'caption', 'code', 'dd', 'div', 'dl', 'dt', 'em',
          'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'li', 'ol', 'p', 'pre', 'small', 'span',
          'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
          'ul', 'style'
        ],
        allowedAttributes: {
          '*': ['class', 'title', 'role', 'aria-label', 'style'],
          a: ['href', 'target', 'rel'],
          td: ['colspan', 'rowspan'],
          th: ['colspan', 'rowspan', 'scope']
        },
        allowedSchemes: ['mailto'],
        allowProtocolRelative: false
      });
      components.push({
        ...pickDashboardSnapshotProperties(component),
        componentId: component.id,
        type: 'Custom',
        customHtml: sanitizedHtml,
        richTextContent: '',
        imageUrl: '',
        imageAltText: '',
        unavailableReason: null,
        chartType: null,
        xAxisFieldApiName: null,
        xAxisTitle: '',
        yAxisTitle: '',
        showGridlines: false,
        showLegend: false,
        showValues: false,
        objectApiName: component.objectApiName,
        groupByLabel: null,
        totalRows: 0,
        metricValue: null,
        columns: [],
        buckets: [],
        rows: []
      });
      continue;
    }
    const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
    if (!object) return res.status(409).json({ error: `Dashboard object "${component.objectApiName}" is no longer available` });
    if (!hasObjectPermission(principal, tenant, object.apiName, 'read')) {
      return res.status(403).json({ error: `Missing read permission for dashboard object "${object.apiName}"` });
    }
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (component.reportApiName && !report) return res.status(409).json({ error: `Dashboard report "${component.reportApiName}" is no longer available` });
    const reportFilters = report?.filters ?? [];
    const activeDashboardFilters = snapshotFilters.filter((filter) =>
      filter.objectApiName === object.apiName
      && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'));
    const crossFilterResolution = resolveDashboardCrossFilters(principal, tenant, object.apiName, crossFilters, matchesFilter);
    if ('error' in crossFilterResolution) return res.status(crossFilterResolution.status).json({ error: crossFilterResolution.error });
    const selectedFieldNames = new Set([
      ...(report?.fieldApiNames ?? []),
      ...(report?.groupByFieldApiNames ?? []),
      ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
      ...reportFilters.map((filter) => filter.fieldApiName),
      ...activeDashboardFilters.map((filter) => filter.fieldApiName),
      ...(component.aggregation !== 'Count' && component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType !== 'Gauge' && component.groupByFieldApiName
        ? [component.groupByFieldApiName] : []),
       ...(component.type === 'Chart' && component.chartType === 'Scatter' && component.xAxisFieldApiName
        ? [component.xAxisFieldApiName] : []),
      ...(component.type === 'Chart' && ['Stacked Bar', 'Stacked Column'].includes(component.chartType)
        && component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.type === 'Table' ? component.displayFieldApiNames : [])
    ]);
    const inaccessibleField = [...selectedFieldNames].find((fieldApiName) =>
      !object.fields.some((field) => field.apiName === fieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, fieldApiName, 'read'));
    if (inaccessibleField) {
      return res.status(403).json({ error: `Missing read permission for dashboard field "${object.apiName}.${inaccessibleField}"` });
    }
    const formulaContext = formulaContextForUser(tenant, principal.userId);
    const sourceRecords = (tenant.records[object.apiName] ?? [])
      .filter((record) => hasRecordAccess(principal, tenant, object.apiName, record, 'Read'))
      .map((record) => calculateFormulaFields(object, record, formulaContext));
    const records = sourceRecords.filter((record) => hasRecordAccess(principal, tenant, object.apiName, record, 'Read')
      && reportFilters.every((filter) => reportFilterMatches(record, filter))
      && matchesDashboardFilters(
        snapshotFilters.filter((filter) => filter.objectApiName === object.apiName
          && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null')),
        dashboard.filterLogic,
        (filter) => matchesFilter(record, filter)
      )
      && (!crossFilters.length || crossFilterResolution.recordIds.has(record.Id)));
    for (const record of records) {
      sourceRecordAccess.set(`${object.apiName}:${record.Id}`, { objectApiName: object.apiName, recordId: record.Id });
    }
    const numericValuesFor = (items: RuntimeRecord[]) => component.measureFieldApiName
      ? items
        .map((record) => record[component.measureFieldApiName!])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite)
      : [];
    const numericValues = numericValuesFor(records);
    const metricValue = component.aggregation === 'Count' ? records.length
      : component.aggregation === 'Sum' ? numericValues.reduce((sum, value) => sum + value, 0)
        : component.aggregation === 'Average' ? numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : 0
          : component.aggregation === 'Minimum' ? numericValues.length ? Math.min(...numericValues) : 0
            : numericValues.length ? Math.max(...numericValues) : 0;
    const groups = new Map<string, RuntimeRecord[]>();
    const groupFieldApiName = component.type === 'Chart' && component.chartType === 'Scatter'
      ? component.xAxisFieldApiName
      : component.groupByFieldApiName;
    if (groupFieldApiName) {
      for (const record of records) {
        const label = String(record[groupFieldApiName] ?? '—');
        groups.set(label, [...(groups.get(label) ?? []), record]);
      }
    }
    let buckets = [...groups.entries()].map(([label, items]) => {
      const values = numericValuesFor(items);
      const value = component.aggregation === 'Count' ? items.length
        : component.aggregation === 'Sum' ? values.reduce((sum, item) => sum + item, 0)
          : component.aggregation === 'Average' ? values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0
            : component.aggregation === 'Minimum' ? values.length ? Math.min(...values) : 0
              : values.length ? Math.max(...values) : 0;
      const series = component.seriesFieldApiName
        ? Object.fromEntries([...new Set(items.map((record) => String(record[component.seriesFieldApiName!] ?? '—')))]
            .map((seriesName) => {
              const seriesRecords = items.filter((record) => String(record[component.seriesFieldApiName!] ?? '—') === seriesName);
              const seriesValues = numericValuesFor(seriesRecords);
              const seriesValue = component.aggregation === 'Count' ? seriesRecords.length
                : component.aggregation === 'Sum' ? seriesValues.reduce((sum, item) => sum + item, 0)
                  : component.aggregation === 'Average' ? seriesValues.length ? seriesValues.reduce((sum, item) => sum + item, 0) / seriesValues.length : 0
                    : component.aggregation === 'Minimum' ? seriesValues.length ? Math.min(...seriesValues) : 0
                      : seriesValues.length ? Math.max(...seriesValues) : 0;
              return [seriesName, seriesValue];
            }))
        : undefined;
      return { label, value, ...(series ? { series } : {}) };
    });
    if (component.type === 'Chart' && component.chartType === 'Gauge') {
      buckets = [{ label: component.title, value: metricValue }];
    } else {
      buckets = buckets
        .sort((left, right) => component.chartSortOrder === 'Ascending'
          ? left.value - right.value : right.value - left.value)
        .slice(0, component.chartLimit);
    }
    const columns = object.fields.filter((field) => component.displayFieldApiNames.includes(field.apiName))
      .map((field) => ({ apiName: field.apiName, label: field.label }));
    const rows = component.type === 'Table'
      ? records.slice(0, 10).map((record) => {
          const readable = sanitizeRecordForRead(principal, tenant, object, record);
          return Object.fromEntries(columns.map((field) => [field.apiName, readable[field.apiName] ?? null]));
        })
      : [];
    components.push({
      componentId: component.id,
      title: component.title,
      subtitle: component.subtitle,
      footer: component.footer,
      type: component.type,
      width: component.width,
      height: component.height,
      customHtml: null,
      richTextContent: '',
      imageUrl: '',
      imageAltText: '',
      unavailableReason: null,
      chartType: component.type === 'Chart' ? component.chartType : null,
      chartSortOrder: component.chartSortOrder,
      chartColorPalette: component.chartColorPalette,
      chartLimit: component.chartLimit,
      chartXAxisMinimum: component.chartXAxisMinimum,
      chartXAxisMaximum: component.chartXAxisMaximum,
      chartYAxisMinimum: component.chartYAxisMinimum,
      chartYAxisMaximum: component.chartYAxisMaximum,
      chartValueFormat: component.chartValueFormat,
      chartCurrencyCode: component.chartCurrencyCode,
      chartDecimalPlaces: component.chartDecimalPlaces,
      xAxisFieldApiName: component.xAxisFieldApiName,
      xAxisTitle: component.xAxisTitle,
      yAxisTitle: component.yAxisTitle,
      showGridlines: component.showGridlines,
      legendPosition: component.legendPosition,
      aggregation: component.aggregation,
      gaugeMin: component.gaugeMin,
      gaugeMax: component.gaugeMax,
      gaugeRange1EndPercent: component.gaugeRange1EndPercent,
      gaugeRange2EndPercent: component.gaugeRange2EndPercent,
      showLegend: component.showLegend,
      showValues: component.showValues,
      chartDataLabelPosition: component.chartDataLabelPosition,
      objectApiName: component.objectApiName,
      groupByLabel: groupFieldApiName
        ? object.fields.find((field) => field.apiName === groupFieldApiName)?.label ?? groupFieldApiName
        : null,
      totalRows: records.length,
      metricValue: component.type === 'Metric' ? metricValue : null,
      columns,
      buckets: component.type === 'Chart' ? buckets : [],
      rows
    });
  }
  const parsedSnapshot = dashboardSnapshotSchema.parse({
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    label: input.data.label,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
    runningUserId: principal.userId,
    filters: snapshotFilters,
    crossFilter: crossFilters.length === 1 ? crossFilters[0] : undefined,
    crossFilters,
    sourceRecordAccess: [...sourceRecordAccess.values()],
    components
  });
  const updatedTenant = { ...tenant, dashboardSnapshots: [...(tenant.dashboardSnapshots ?? []), parsedSnapshot] };
  persistTenantRecords(principal.tenantId, updatedTenant);
  const responseSnapshot = { ...parsedSnapshot };
  delete responseSnapshot.sourceRecordAccess;
  return res.status(201).json({ snapshot: responseSnapshot });
});
app.delete('/api/metadata/dashboards/:apiName/snapshots/:snapshotId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const snapshotId = routeParam(req, 'snapshotId');
  const snapshot = (tenant.dashboardSnapshots ?? []).find((item) =>
    item.id === snapshotId && item.dashboardApiName === apiName && item.createdBy === principal.userId);
  if (!snapshot) return res.status(404).json({ error: 'Dashboard snapshot was not found' });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSnapshots: tenant.dashboardSnapshots.filter((item) => item.id !== snapshotId)
  });
  return res.status(204).end();
});
}
