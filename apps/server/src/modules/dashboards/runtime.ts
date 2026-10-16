import type { Principal } from '../../auth.js';
import type { TenantData, LocalUser } from '../../core/state/types.js';
import type { RuntimeRecord } from '../../index.js';
import type { DashboardMetadata, DashboardFilterMetadata, DashboardSubscription, DashboardSnapshot } from './schemas.js';
import { dashboardForUser } from './folder-access.js';
import { dashboardSnapshotSchema } from './schemas.js';
import { reportFilterMatches } from '../reports/report-metadata.js';
import { matchesDashboardFilters, canAccessDashboard } from '../../dashboard-access.js';
import { nextDashboardSubscriptionRunAt } from './subscription-schedule.js';
import { calculateFormulaFields } from '../records/formula-fields.js';
import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import type { createTenantEmailRuntime } from '../integrations/tenant-email-runtime.js';

type Runtime = typeof import('../../index.js');

/** Published dashboard relationships, filtering, snapshots and scheduled delivery. */
export function createDashboardRuntime(deps: {
 getUsers: () => LocalUser[];
 tenantData: (tenantId: string) => TenantData | undefined;
 persistTenantRecords: Runtime['persistTenantRecords'];
 hasObjectPermission: Runtime['hasObjectPermission'];
 hasRecordAccess: Runtime['hasRecordAccess'];
 hasFieldPermission: Runtime['hasFieldPermission'];
 effectivePermissions: Runtime['effectivePermissions'];
 sendTenantEmail: ReturnType<typeof createTenantEmailRuntime>['sendTenantEmail'];
 formulaContextForUser: Runtime['formulaContextForUser'];
 sanitizeDashboardRichText: Runtime['sanitizeDashboardRichText'];
 reportFolderAccessLevelForUser: Runtime['reportFolderAccessLevelForUser'];
 sanitizeRecordForRead: Runtime['sanitizeRecordForRead'];
}) {
 const { getUsers, tenantData, persistTenantRecords, hasObjectPermission, hasRecordAccess,
  hasFieldPermission, effectivePermissions, sendTenantEmail, formulaContextForUser,
  sanitizeDashboardRichText, reportFolderAccessLevelForUser, sanitizeRecordForRead } = deps;
function dashboardEmailFilterMatches(record: RuntimeRecord, filter: DashboardFilterMetadata): boolean {
  return reportFilterMatches(record, filter);
}

type DashboardCrossFilterResolution =
  | { recordIds: Set<string> }
  | { error: string; status: 400 | 403 };

type DashboardRelationshipStep = {
  sourceObjectApiName: string;
  targetObjectApiName: string;
  fieldApiName: string;
  direction: 'forward' | 'reverse';
};

function dashboardRelationshipPaths(
  tenant: TenantData,
  sourceObjectApiName: string,
  targetObjectApiName: string,
  maxDepth = 3
): DashboardRelationshipStep[][] {
  if (sourceObjectApiName === targetObjectApiName) return [[]];
  const paths: DashboardRelationshipStep[][] = [];
  const queue: Array<{ objectApiName: string; path: DashboardRelationshipStep[]; visited: Set<string> }> = [
    { objectApiName: sourceObjectApiName, path: [], visited: new Set([sourceObjectApiName]) }
  ];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= maxDepth) continue;
    const object = tenant.objects.find((item) => item.apiName === current.objectApiName);
    if (!object) continue;
    const edges: DashboardRelationshipStep[] = [
      ...object.fields.filter((field) => field.relationship).map((field) => ({
        sourceObjectApiName: object.apiName,
        targetObjectApiName: field.relationship!.targetObject,
        fieldApiName: field.apiName,
        direction: 'forward' as const
      })),
      ...tenant.objects.flatMap((relatedObject) => relatedObject.fields
        .filter((field) => field.relationship?.targetObject === object.apiName)
        .map((field) => ({
          sourceObjectApiName: object.apiName,
          targetObjectApiName: relatedObject.apiName,
          fieldApiName: field.apiName,
          direction: 'reverse' as const
        })))
    ];
    for (const edge of edges) {
      if (current.visited.has(edge.targetObjectApiName)) continue;
      const path = [...current.path, edge];
      if (edge.targetObjectApiName === targetObjectApiName) paths.push(path);
      else queue.push({ objectApiName: edge.targetObjectApiName, path, visited: new Set([...current.visited, edge.targetObjectApiName]) });
    }
  }
  return paths;
}

function resolveDashboardCrossFilters(
  principal: Principal,
  tenant: TenantData,
  sourceObjectApiName: string,
  crossFilters: DashboardFilterMetadata[],
  matchesFilter: (record: RuntimeRecord, filter: DashboardFilterMetadata) => boolean
): DashboardCrossFilterResolution {
  const sourceObject = tenant.objects.find((item) => item.apiName === sourceObjectApiName);
  if (!sourceObject) return { error: `Dashboard object "${sourceObjectApiName}" is unavailable`, status: 400 };
  const groups = new Map<string, DashboardFilterMetadata[]>();
  for (const filter of crossFilters) {
    const targetObject = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    if (!targetObject || !targetObject.fields.some((field) => field.apiName === filter.fieldApiName)) {
      return { error: `Dashboard cross-filter field "${filter.objectApiName}.${filter.fieldApiName}" is unavailable`, status: 400 };
    }
    if (!hasObjectPermission(principal, tenant, filter.objectApiName, 'read')
      || !hasFieldPermission(principal, tenant, filter.objectApiName, filter.fieldApiName, 'read')) {
      return { error: `Missing read permission for dashboard cross-filter "${filter.objectApiName}.${filter.fieldApiName}"`, status: 403 };
    }
    const key = `${filter.objectApiName}\0${filter.fieldApiName}\0${filter.operator}`;
    groups.set(key, [...(groups.get(key) ?? []), filter]);
  }
  const visibleRecordsByObject = new Map<string, RuntimeRecord[]>();
  const visibleRecords = (objectApiName: string) => {
    let records = visibleRecordsByObject.get(objectApiName);
    if (!records) {
      const object = tenant.objects.find((item) => item.apiName === objectApiName);
      records = (tenant.records[objectApiName] ?? []).filter((record) =>
        hasRecordAccess(principal, tenant, objectApiName, record, 'Read'))
        .map((record) => object
          ? calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId))
          : record);
      visibleRecordsByObject.set(objectApiName, records);
    }
    return records;
  };
  for (const objectApiName of new Set([sourceObjectApiName, ...[...groups.values()].map((filters) => filters[0].objectApiName)])) {
    if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) {
      return { error: `Missing read permission for dashboard cross-filter object "${objectApiName}"`, status: 403 };
    }
  }
  const compiledGroups = [...groups.values()].map((filters) => {
    const targetObjectApiName = filters[0].objectApiName;
    const paths = dashboardRelationshipPaths(tenant, sourceObjectApiName, targetObjectApiName);
    const accessiblePaths: DashboardRelationshipStep[][] = [];
    for (const path of paths) {
      let inaccessible: DashboardRelationshipStep | undefined;
      for (const step of path) {
        const fieldObjectApiName = step.direction === 'forward' ? step.sourceObjectApiName : step.targetObjectApiName;
        const field = tenant.objects.find((item) => item.apiName === fieldObjectApiName)?.fields
          .find((item) => item.apiName === step.fieldApiName);
        if (!field || !hasFieldPermission(principal, tenant, fieldObjectApiName, step.fieldApiName, 'read')) {
          inaccessible = step;
          break;
        }
      }
      if (inaccessible) {
        const fieldObjectApiName = inaccessible.direction === 'forward'
          ? inaccessible.sourceObjectApiName : inaccessible.targetObjectApiName;
        return { error: `Missing read permission for relationship field "${fieldObjectApiName}.${inaccessible.fieldApiName}"`, status: 403 as const };
      }
      for (const objectApiName of path.flatMap((step) => [step.sourceObjectApiName, step.targetObjectApiName])) {
        if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) {
          return { error: `Missing read permission for dashboard cross-filter object "${objectApiName}"`, status: 403 as const };
        }
      }
      accessiblePaths.push(path);
    }
    return { filters, targetObjectApiName, paths: accessiblePaths };
  });
  const sourceRecords = visibleRecords(sourceObjectApiName);
  const matchesPath = (record: RuntimeRecord, path: DashboardRelationshipStep[], targetFilters: DashboardFilterMetadata[]) => {
    let currentRecords = [record];
    for (const step of path) {
      if (step.direction === 'forward') {
        const targetIds = new Set(currentRecords.map((item) => String(item[step.fieldApiName] ?? '')).filter(Boolean));
        currentRecords = visibleRecords(step.targetObjectApiName).filter((item) => targetIds.has(item.Id));
      } else {
        const sourceIds = new Set(currentRecords.map((item) => item.Id));
        currentRecords = visibleRecords(step.targetObjectApiName).filter((item) => sourceIds.has(String(item[step.fieldApiName] ?? '')));
      }
      if (!currentRecords.length) return false;
    }
    return currentRecords.some((item) => targetFilters.some((filter) => matchesFilter(item, filter)));
  };
  const recordIds = new Set<string>();
  for (const record of sourceRecords) {
    const matchesAllGroups = compiledGroups.every((group) => {
      if ('error' in group) return false;
      if (group.targetObjectApiName === sourceObjectApiName) {
        return group.filters.some((filter) => matchesFilter(record, filter));
      }
      if (!group.paths.length) return true;
      return group.paths.some((path) => matchesPath(record, path, group.filters));
    });
    if (matchesAllGroups) recordIds.add(record.Id);
  }
  const compiledError = compiledGroups.find((group) => 'error' in group);
  if (compiledError && 'error' in compiledError && typeof compiledError.error === 'string'
    && compiledError.status === 403) {
    return { error: compiledError.error, status: 403 };
  }
  return { recordIds };
}

function scheduledDashboardEmailBody(
  dashboard: DashboardMetadata,
  tenant: TenantData,
  recipient: LocalUser,
  subscription: DashboardSubscription,
  runAt: Date
): { text: string; html: string; snapshot: DashboardSnapshot } {
  const recipientAccess = tenant.accessControl.users.find((user) => user.id === recipient.id);
  if (!recipientAccess || !canAccessDashboard(dashboardForUser(tenant, dashboard, recipient.id), recipient.id, recipientAccess.permissionSetGroupIds, false)) {
    throw new Error(`Recipient "${recipient.email}" no longer has dashboard access.`);
  }
  const principal: Principal = {
    userId: recipient.id,
    tenantId: recipient.tenantId,
    email: recipient.email,
    roles: [recipient.role],
    permissions: effectivePermissions(recipient, tenant)
  };
  const lines = [
    `${dashboard.label} — scheduled dashboard snapshot`,
    `Run time: ${runAt.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}`,
    `Data is evaluated using ${recipient.name}'s current access permissions.`,
    ''
  ];
  const htmlSections: string[] = [];
  const snapshotComponents: DashboardSnapshot['components'] = [];
  const sourceRecordAccess = new Map<string, { objectApiName: string; recordId: string }>();
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!);
  const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const baseSnapshotComponent = (component: DashboardMetadata['components'][number], unavailableReason: string | null = null) => ({
    componentId: component.id,
    title: component.title,
    subtitle: component.subtitle,
    footer: component.footer,
    type: component.type,
    width: component.width,
    height: component.height,
    customHtml: null,
    richTextContent: component.type === 'Rich Text' ? sanitizeDashboardRichText(component.richTextContent) : '',
    imageUrl: component.type === 'Image' ? component.imageUrl : '',
    imageAltText: component.type === 'Image' ? component.imageAltText : '',
    unavailableReason,
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
    groupByLabel: null,
    totalRows: 0,
    metricValue: null,
    columns: [],
    buckets: [],
    rows: []
  });
  for (const component of dashboard.components) {
    lines.push(`${component.title} (${component.type})`);
    if (component.type === 'Rich Text') {
      const richTextContent = sanitizeDashboardRichText(component.richTextContent);
      const plainText = sanitizeHtml(richTextContent, { allowedTags: [], allowedAttributes: {} });
      lines.push(plainText, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><div>${richTextContent}</div></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        type: 'Rich Text',
        richTextContent
      });
      continue;
    }
    if (component.type === 'Image') {
      const imageUrl = component.imageUrl;
      lines.push(`${component.imageAltText || 'Image'}${imageUrl ? `: ${imageUrl}` : ''}`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(component.imageAltText)}" style="display:block;max-width:100%;height:auto">` : '<p>Image URL is not configured.</p>'}</section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        type: 'Image',
        imageUrl,
        imageAltText: component.imageAltText
      });
      continue;
    }
    if (component.type === 'Custom') {
      lines.push('Open the dashboard to view this custom component.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Open the dashboard to view this registered custom component.</p></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component, 'Registered custom components are not executed during scheduled runs.'),
        type: 'Custom'
      });
      continue;
    }
    const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (!object || (component.reportApiName && !report)
      || (report && (report.objectApiName !== component.objectApiName
        || reportFolderAccessLevelForUser(tenant, report.folderId, recipient.id) === null))
      || !hasObjectPermission(principal, tenant, component.objectApiName, 'read')) {
      lines.push('This component is unavailable under your current access permissions.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Unavailable under your current access permissions.</p></section>`);
      snapshotComponents.push(baseSnapshotComponent(component, 'Unavailable under the recipient current access permissions.'));
      continue;
    }
    const activeDashboardFilters = dashboard.filters.filter((filter) =>
      filter.objectApiName === object.apiName
      && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'));
    const neededFields = [
      ...(component.aggregation !== 'Count' && component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType !== 'Gauge' && component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType === 'Scatter' && component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
      ...(component.type === 'Chart' && component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.type === 'Table' ? component.displayFieldApiNames : []),
      ...(report?.fieldApiNames ?? []),
      ...(report?.groupByFieldApiNames ?? []),
      ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
      ...(report?.filters.map((filter) => filter.fieldApiName) ?? []),
      ...activeDashboardFilters.map((filter) => filter.fieldApiName)
    ];
    const unreadableField = neededFields.find((fieldApiName) =>
      !object.fields.some((field) => field.apiName === fieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, fieldApiName, 'read'));
    if (unreadableField) {
      lines.push('This component is unavailable under your current field permissions.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Unavailable under your current field permissions.</p></section>`);
      snapshotComponents.push(baseSnapshotComponent(component, 'Unavailable under the recipient current field permissions.'));
      continue;
    }
    const records = (tenant.records[object.apiName] ?? []).filter((record) =>
      hasRecordAccess(principal, tenant, object.apiName, record, 'Read'))
      .map((record) => calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId)))
      .filter((record) =>
        (report?.filters ?? []).every((filter) => reportFilterMatches(record, filter))
        && matchesDashboardFilters(activeDashboardFilters, dashboard.filterLogic, (filter) => dashboardEmailFilterMatches(record, filter)));
    for (const record of records) {
      sourceRecordAccess.set(`${object.apiName}:${record.Id}`, { objectApiName: object.apiName, recordId: record.Id });
    }
    const aggregateValue = (items: RuntimeRecord[]) => {
      if (component.aggregation === 'Count') return items.length;
      const values = items.map((record) => Number(record[component.measureFieldApiName ?? '']))
        .filter(Number.isFinite);
      if (!values.length) return 0;
      if (component.aggregation === 'Sum') return values.reduce((sum, value) => sum + value, 0);
      if (component.aggregation === 'Average') return values.reduce((sum, value) => sum + value, 0) / values.length;
      return component.aggregation === 'Minimum' ? Math.min(...values) : Math.max(...values);
    };
    if (component.type === 'Metric') {
      const aggregate = aggregateValue(records);
      const value = formatNumber(aggregate);
      lines.push(`Value: ${value}`, `${records.length.toLocaleString()} matching records`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><strong style="display:block;color:#0176d3;font-size:30px">${escapeHtml(value)}</strong><p style="margin:6px 0 0;color:#5c5c5c">${records.length.toLocaleString()} matching records</p></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        totalRows: records.length,
        metricValue: aggregate
      });
    } else if (component.type === 'Chart') {
      if (component.chartType === 'Gauge') {
        const value = aggregateValue(records);
        lines.push(`Value: ${formatNumber(value)} / ${formatNumber(component.gaugeMin)}-${formatNumber(component.gaugeMax)}`,
          `${records.length.toLocaleString()} matching records`, '');
        const percent = Math.max(0, Math.min(100, (value - component.gaugeMin) / (component.gaugeMax - component.gaugeMin) * 100));
        htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><strong style="font-size:24px">${escapeHtml(formatNumber(value))} / ${escapeHtml(formatNumber(component.gaugeMin))}-${escapeHtml(formatNumber(component.gaugeMax))}</strong><div style="position:relative;height:10px;margin:10px 0;background:linear-gradient(to right,#c23934 0 ${component.gaugeRange1EndPercent}%,#fe9339 ${component.gaugeRange1EndPercent}% ${component.gaugeRange2EndPercent}%,#2e844a ${component.gaugeRange2EndPercent}% 100%);border-radius:6px"><div style="position:absolute;left:calc(${percent}% - 1px);top:-4px;width:2px;height:18px;background:#181818;border:1px solid #fff"></div></div><p style="margin:0;color:#5c5c5c">${records.length.toLocaleString()} matching records</p></section>`);
        snapshotComponents.push({
          ...baseSnapshotComponent(component),
          totalRows: records.length,
          groupByLabel: null,
          buckets: [{ label: component.title, value }]
        });
      } else {
        const groupFieldApiName = component.chartType === 'Scatter'
          ? component.xAxisFieldApiName
          : component.groupByFieldApiName;
        const groups = new Map<string, RuntimeRecord[]>();
        for (const record of records) {
          const label = String(record[groupFieldApiName ?? ''] ?? '—');
          groups.set(label, [...(groups.get(label) ?? []), record]);
        }
        const buckets = [...groups].map(([label, items]) => ({
          label,
          value: aggregateValue(items),
          ...(component.seriesFieldApiName ? {
            series: Object.fromEntries([...new Set(items.map((record) => String(record[component.seriesFieldApiName!] ?? '—')))]
              .map((seriesName) => [seriesName, aggregateValue(items.filter((record) =>
                String(record[component.seriesFieldApiName!] ?? '—') === seriesName))]))
          } : {})
        }))
          .sort((left, right) => component.chartSortOrder === 'Ascending' ? left.value - right.value : right.value - left.value)
          .slice(0, component.chartLimit);
        const maxValue = Math.max(1, ...buckets.map((bucket) => Math.abs(bucket.value)));
        const bucketRows = buckets.map((bucket) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(bucket.label)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatNumber(bucket.value))}</td><td style="width:40% ;padding:6px 8px;border-bottom:1px solid #eee"><div style="height:10px;width:${Math.min(100, Math.abs(bucket.value) / maxValue * 100)}%;background:#0176d3;border-radius:5px"></div></td></tr>`).join('');
        const bucketLines = buckets.map(({ label, value }) => `${label}: ${formatNumber(value)}`);
        lines.push(...(bucketLines.length ? bucketLines : ['No matching records.']), '');
        htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0 0 10px;color:#5c5c5c">${escapeHtml(component.chartType)}${component.groupByFieldApiName ? ` · ${escapeHtml(object.fields.find((field) => field.apiName === component.groupByFieldApiName)?.label ?? component.groupByFieldApiName)}` : ''}</p>${bucketRows ? `<table role="presentation" style="width:100%;border-collapse:collapse">${bucketRows}</table>` : '<p>No matching records.</p>'}</section>`);
        snapshotComponents.push({
          ...baseSnapshotComponent(component),
          totalRows: records.length,
          groupByLabel: groupFieldApiName
            ? object.fields.find((field) => field.apiName === groupFieldApiName)?.label ?? groupFieldApiName
            : null,
          buckets
        });
      }
    } else {
      const columns = component.displayFieldApiNames.flatMap((fieldApiName) => {
        const field = object.fields.find((candidate) => candidate.apiName === fieldApiName);
        return field ? [field] : [];
      });
      const tableRows = records.slice(0, 10).map((record) => `<tr>${columns.map((field) => `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(record[field.apiName])}</td>`).join('')}</tr>`).join('');
      lines.push(`${records.length.toLocaleString()} matching records. First ${Math.min(10, records.length)} shown.`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0 0 10px;color:#5c5c5c">${records.length.toLocaleString()} matching records; first ${Math.min(10, records.length)} shown.</p>${tableRows ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>${columns.map((field) => `<th scope="col" style="padding:6px 8px;border-bottom:1px solid #d8dde6;text-align:left">${escapeHtml(field.label)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></div>` : '<p>No matching records.</p>'}</section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        totalRows: records.length,
        columns: columns.map((field) => ({ apiName: field.apiName, label: field.label })),
        rows: records.slice(0, 10).map((record) => {
          const readable = sanitizeRecordForRead(principal, tenant, object, record);
          return Object.fromEntries(columns.map((field) => [field.apiName, readable[field.apiName] ?? null]));
        })
      });
    }
  }
  const dashboardUrl = new URL(`/une/setup/dashboard-builder/${encodeURIComponent(dashboard.apiName)}`,
    process.env.WEB_APP_URL ?? 'http://localhost:5174').toString();
  lines.push('Open dashboard:', dashboardUrl);
  const text = lines.join('\n').slice(0, 100_000);
  dashboard.components.forEach((component, index) => {
    const section = htmlSections[index];
    if (!section) return;
    const heading = `<h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2>`;
    const subtitle = component.subtitle
      ? `<p style="margin:0 0 10px;color:#5c5c5c">${escapeHtml(component.subtitle)}</p>`
      : '';
    const footer = component.footer
      ? `<p style="margin:10px 0 0;color:#5c5c5c">${escapeHtml(component.footer)}</p>`
      : '';
    htmlSections[index] = section
      .replace(heading, `${heading}${subtitle}`)
      .replace('</section>', `${footer}</section>`);
    if (component.subtitle) lines.push(`Subtitle: ${component.subtitle}`);
    if (component.footer) lines.push(`Footer: ${component.footer}`);
  });
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f3f3;font-family:Arial,sans-serif;color:#181818"><main style="max-width:760px;margin:0 auto"><header style="padding:20px;background:#0176d3;color:#fff;border-radius:8px"><h1 style="margin:0;font-size:22px">${escapeHtml(dashboard.label)}</h1><p style="margin:8px 0 0">Scheduled dashboard snapshot · ${escapeHtml(runAt.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' }))}</p><p style="margin:8px 0 0">Data evaluated with ${escapeHtml(recipient.name)}'s current permissions.</p></header>${htmlSections.join('')}<p style="margin:20px 0;text-align:center"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#0176d3;color:#fff;text-decoration:none;border-radius:5px">Open dashboard</a></p></main></body></html>`;
  const snapshot = dashboardSnapshotSchema.parse({
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    label: `${subscription.label.slice(0, 45)} · ${runAt.toISOString()}`,
    createdAt: runAt.toISOString(),
    createdBy: recipient.id,
    runningUserId: recipient.id,
    subscriptionId: subscription.id,
    filters: dashboard.filters,
    sourceRecordAccess: [...sourceRecordAccess.values()],
    components: snapshotComponents
  });
  return { text, html: html.slice(0, 100_000), snapshot };
}

const dashboardSubscriptionDispatches = new Set<string>();
async function dispatchDashboardSubscription(tenantId: string, subscriptionId: string, manual = false): Promise<void> {
  const key = `${tenantId}:${subscriptionId}`;
  if (dashboardSubscriptionDispatches.has(key)) throw new Error('This dashboard subscription is already being delivered.');
  dashboardSubscriptionDispatches.add(key);
  try {
    const tenant = tenantData(tenantId);
    const subscription = tenant?.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (!tenant || !subscription || (!manual && !subscription.active)) return;
    const runAt = new Date();
    if (!manual && Date.parse(subscription.nextRunAt) > runAt.getTime()) return;
    const dashboard = tenant.dashboards.find((item) => item.apiName === subscription.dashboardApiName && item.status === 'Deployed');
    const creator = getUsers().find((item) => item.id === subscription.createdBy && item.tenantId === tenantId && !item.disabled);
    if (!dashboard) throw new Error('The subscribed dashboard is no longer deployed.');
    if (!creator || !effectivePermissions(creator, tenant).includes('email:send')) {
      throw new Error('The subscription owner is no longer active or lacks email:send permission.');
    }
    const failures: string[] = [];
    for (const userId of subscription.recipientUserIds) {
      const recipient = getUsers().find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
      if (!recipient) {
        failures.push('A scheduled recipient is no longer active.');
        continue;
      }
      try {
        const body = scheduledDashboardEmailBody(dashboard, tenant, recipient, subscription, runAt);
        if (subscription.saveSnapshots) {
          const snapshotTenant = tenantData(tenantId);
          if (!snapshotTenant) throw new Error('The tenant is no longer available for scheduled snapshot storage.');
          const recipientSnapshots = [
            ...snapshotTenant.dashboardSnapshots.filter((snapshot) =>
              snapshot.subscriptionId === subscription.id && snapshot.createdBy === recipient.id),
            body.snapshot
          ].slice(-30);
          const retainedIds = new Set(recipientSnapshots.map((snapshot) => snapshot.id));
          persistTenantRecords(tenantId, {
            ...snapshotTenant,
            dashboardSnapshots: [
              ...snapshotTenant.dashboardSnapshots.filter((snapshot) =>
                snapshot.subscriptionId !== subscription.id || snapshot.createdBy !== recipient.id),
              ...recipientSnapshots.filter((snapshot) => retainedIds.has(snapshot.id))
            ]
          });
        }
        await sendTenantEmail(
          tenantId,
          tenant,
          subscription.namedCredentialId,
          subscription.fromEmail,
          [recipient.email],
          `${dashboard.label} — scheduled dashboard`,
          body.text,
          body.html
        );
      } catch (error) {
        failures.push(`${recipient.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const currentTenant = tenantData(tenantId);
    if (!currentTenant) return;
    const latest = currentTenant.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (!latest) return;
    const lastRunAt = runAt.toISOString();
    const failed = failures.length > 0;
    const updated: DashboardSubscription = {
      ...latest,
      ...(manual ? {} : { nextRunAt: nextDashboardSubscriptionRunAt(latest, runAt) }),
      lastRunAt,
      lastRunStatus: failed ? 'Failed' : 'Success',
      lastRunError: failed ? failures.join('; ').slice(0, 500) : null,
      updatedAt: lastRunAt
    };
    persistTenantRecords(tenantId, {
      ...currentTenant,
      dashboardSubscriptions: currentTenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? updated : item)
    });
  } catch (error) {
    const tenant = tenantData(tenantId);
    const subscription = tenant?.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (tenant && subscription) {
      const now = new Date().toISOString();
      persistTenantRecords(tenantId, {
        ...tenant,
        dashboardSubscriptions: tenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? {
          ...item,
          ...(manual ? {} : { nextRunAt: nextDashboardSubscriptionRunAt(item, new Date(now)) }),
          lastRunAt: now,
          lastRunStatus: 'Failed',
          lastRunError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          updatedAt: now
        } : item)
      });
    }
    if (manual) throw error;
    console.error(`Dashboard subscription "${subscriptionId}" failed for tenant "${tenantId}": ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dashboardSubscriptionDispatches.delete(key);
  }
}

 return { dashboardEmailFilterMatches, dashboardRelationshipPaths, resolveDashboardCrossFilters,
  scheduledDashboardEmailBody, dispatchDashboardSubscription };
}
