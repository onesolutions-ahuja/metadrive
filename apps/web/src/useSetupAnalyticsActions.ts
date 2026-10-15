// @ts-nocheck
// On-demand reports, dashboards, subscriptions and page selection operations.
import { useCallback } from 'react';
import type { DashboardMetadata, DashboardFolderMetadata, DashboardTerritoryMetadata, DashboardSubscription, DashboardSubscriptionInput, DashboardSnapshot, ReportMetadata, ReportFolderInput, ReportRunMetadata, LightningPageMetadata } from './metadata';
export function useSetupAnalyticsActions(ctx: any) {
 const { apiRequest, dashboards, navigateRoute, notify, objects, page, pages, reports, setDashboardFolders, setDashboardTerritories, setDashboards, setPage, setReportFolders, setReports, workspace } = ctx;
  const loadDashboardRecords = useCallback(async (dashboardApiName: string, objectApiName: string, runningUserId?: string) => {
    const payload = await apiRequest<{ records: Record<string, unknown>[] }>(
      `/metadata/dashboards/${encodeURIComponent(dashboardApiName)}/data/${encodeURIComponent(objectApiName)}${runningUserId ? `?runningUserId=${encodeURIComponent(runningUserId)}` : ''}`
    );
    return payload.records;
  }, []);
  const saveReport = async (report: ReportMetadata) => {
    const payload = await apiRequest<{ report: ReportMetadata; folder?: ReportFolderMetadata }>(`/metadata/reports/${encodeURIComponent(report.apiName)}`, {
      method: 'PUT',
      body: JSON.stringify(report)
    });
    setReports((current) => current.some((item) => item.apiName === payload.report.apiName)
      ? current.map((item) => item.apiName === payload.report.apiName ? payload.report : item)
      : [...current, payload.report]);
    if (payload.folder) setReportFolders((current) => current.some((folder) => folder.id === payload.folder!.id)
      ? current.map((folder) => folder.id === payload.folder!.id ? payload.folder! : folder)
      : [...current, payload.folder!]);
    notify('Report saved');
    return payload.report;
  };
  const saveReportFolder = async (input: ReportFolderInput) => {
    const payload = await apiRequest<{ folder: ReportFolderMetadata }>('/metadata/report-folders', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    setReportFolders((current) => [...current, payload.folder]);
    notify('Report folder created');
    return payload.folder;
  };
  const deleteReport = async (apiName: string) => {
    await apiRequest<void>(`/metadata/reports/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setReports((current) => current.filter((item) => item.apiName !== apiName));
    notify('Report deleted');
  };
  const runReport = useCallback(
    (apiName: string, filters: DashboardFilterMetadata[] = [], offset = 0, limit = 100, filterLogic: DashboardMetadata['filterLogic'] = 'All', crossFilters: DashboardFilterMetadata[] = [], dashboardApiName?: string, reportFilterOverrides: Array<{ id: string; value: string; values: string[] }> = [], dashboardRunningUserId?: string) => apiRequest<ReportRunMetadata>(
      `/reports/${encodeURIComponent(apiName)}/run`,
      { method: 'POST', body: JSON.stringify({ dashboardFilters: filters, dashboardFilterLogic: filterLogic, dashboardCrossFilters: crossFilters, reportFilterOverrides, offset, limit, ...(dashboardApiName ? { dashboardApiName } : {}), ...(dashboardRunningUserId ? { dashboardRunningUserId } : {}) }) }
    ),
    []
  );
  const previewReport = useCallback(
    (report: ReportMetadata, reportFilterOverrides: Array<{ id: string; value: string; values: string[] }>, offset = 0, limit = 100) => apiRequest<ReportRunMetadata>(
      '/reports/preview',
      { method: 'POST', body: JSON.stringify({ report, reportFilterOverrides, offset, limit }) }
    ),
    []
  );
  const loadDashboardSnapshots = useCallback(async (apiName: string) => {
    const payload = await apiRequest<{ snapshots: DashboardSnapshot[] }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/snapshots`
    );
    return payload.snapshots;
  }, []);
  const createDashboardSnapshot = useCallback(async (
    apiName: string,
    label: string,
    filters: DashboardFilterMetadata[],
    crossFilters: DashboardFilterMetadata[] = [],
    customComponents: Array<{ componentId: string; html: string }> = [],
    runningUserId?: string
  ) => {
    const payload = await apiRequest<{ snapshot: DashboardSnapshot }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/snapshots`,
      { method: 'POST', body: JSON.stringify({ label, filters, crossFilters, customComponents, ...(runningUserId ? { runningUserId } : {}) }) }
    );
    return payload.snapshot;
  }, []);
  const deleteDashboardSnapshot = useCallback(async (apiName: string, snapshotId: string) => {
    await apiRequest<void>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/snapshots/${encodeURIComponent(snapshotId)}`,
      { method: 'DELETE' }
    );
  }, []);
  const loadDashboardSubscriptions = useCallback(async (apiName: string) => {
    const payload = await apiRequest<{ subscriptions: DashboardSubscription[] }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions`
    );
    return payload.subscriptions;
  }, []);
  const saveDashboardSubscription = useCallback(async (
    apiName: string,
    input: DashboardSubscriptionInput,
    subscriptionId?: string
  ) => {
    const path = `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions${subscriptionId ? `/${encodeURIComponent(subscriptionId)}` : ''}`;
    const payload = await apiRequest<{ subscription: DashboardSubscription }>(path, {
      method: subscriptionId ? 'PUT' : 'POST',
      body: JSON.stringify(input)
    });
    return payload.subscription;
  }, []);
  const deleteDashboardSubscription = useCallback(async (apiName: string, subscriptionId: string) => {
    await apiRequest<void>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: 'DELETE' }
    );
  }, []);
  const runDashboardSubscription = useCallback(async (apiName: string, subscriptionId: string) => {
    const payload = await apiRequest<{ subscription: DashboardSubscription }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions/${encodeURIComponent(subscriptionId)}/run`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    return payload.subscription;
  }, []);
  const saveDashboard = async (dashboard: DashboardMetadata) => {
    const payload = await apiRequest<{ dashboard: DashboardMetadata }>(`/metadata/dashboards/${encodeURIComponent(dashboard.apiName)}`, {
      method: 'PUT',
      body: JSON.stringify(dashboard)
    });
    setDashboards((current) => current.some((item) => item.apiName === payload.dashboard.apiName)
      ? current.map((item) => item.apiName === payload.dashboard.apiName ? payload.dashboard : item)
      : [...current, payload.dashboard]);
    return payload.dashboard;
  };
  const saveDashboardFolder = async (input: DashboardFolderInput, folderId?: string) => {
    const path = `/metadata/dashboard-folders${folderId ? `/${encodeURIComponent(folderId)}` : ''}`;
    const payload = await apiRequest<{ folder: DashboardFolderMetadata }>(path, {
      method: folderId ? 'PUT' : 'POST',
      body: JSON.stringify(input)
    });
    setDashboardFolders((current) => current.some((folder) => folder.id === payload.folder.id)
      ? current.map((folder) => folder.id === payload.folder.id ? payload.folder : folder)
      : [...current, payload.folder]);
    const dashboardAccess = await apiRequest<{ dashboards: DashboardMetadata[] }>(
      '/metadata/dashboards'
    );
    setDashboards(dashboardAccess.dashboards);
    return payload.folder;
  };
  const deleteDashboardFolder = async (folderId: string) => {
    await apiRequest<void>(`/metadata/dashboard-folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
    setDashboardFolders((current) => current.filter((folder) => folder.id !== folderId));
    const dashboardAccess = await apiRequest<{ dashboards: DashboardMetadata[] }>('/metadata/dashboards');
    setDashboards(dashboardAccess.dashboards);
  };
  const saveDashboardTerritories = async (
    territories: Array<Pick<DashboardTerritoryMetadata, 'id' | 'label' | 'parentTerritoryId' | 'userIds'>>
  ) => {
    const payload = await apiRequest<{ territories: DashboardTerritoryMetadata[] }>('/metadata/dashboard-territories', {
      method: 'PUT',
      body: JSON.stringify(territories)
    });
    setDashboardTerritories(payload.territories);
    return payload.territories;
  };
  const deleteDashboard = async (apiName: string) => {
    await apiRequest<void>(`/metadata/dashboards/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setDashboards((current) => current.filter((item) => item.apiName !== apiName));
  };
  const selectDashboard = (apiName: string) => {
    navigateRoute({
      kind: 'setup',
      workspace: 'dashboard-builder',
      ...(apiName ? { resourceApiName: apiName } : {})
    });
  };
  const openDashboardViewer = (apiName: string) => navigateRoute({
    kind: 'setup',
    workspace: 'dashboard-builder',
    resourceApiName: apiName,
    dashboardView: true
  });
  const exitDashboardViewer = (apiName: string) => navigateRoute({
    kind: 'setup',
    workspace: 'dashboard-builder',
    resourceApiName: apiName
  });
  const selectPageForObject = (targetObject: string) => {
    const existing = pages.find((item) => item.targetObject === targetObject && item.pageType === 'Record Page');
    if (existing) {
      setPage(existing);
      return;
    }
    const objectLabel = objects.find((item) => item.apiName === targetObject)?.label ?? targetObject;
    const apiName = `${targetObject.replace(/__c$/, '')}_Record_Page`;
    setPage({
      ...defaultLightningPage,
      apiName,
      label: `${objectLabel} Record Page`,
      targetObject,
      status: 'Draft',
      components: defaultLightningPage.components.map((component) => ({ ...component, properties: { ...component.properties } })),
      activationAssignments: []
    });
  };

  const openPageForObject = (targetObject: string) => {
    const existing = pages.find((item) => item.targetObject === targetObject && item.pageType === 'Record Page');
    const apiName = existing?.apiName ?? `${targetObject.replace(/__c$/, '')}_Record_Page`;
    selectPageForObject(targetObject);
    navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: apiName });
  };


 return { loadDashboardRecords, saveReport, saveReportFolder, deleteReport, runReport, previewReport, loadDashboardSnapshots, createDashboardSnapshot, deleteDashboardSnapshot, loadDashboardSubscriptions, saveDashboardSubscription, deleteDashboardSubscription, runDashboardSubscription, saveDashboard, saveDashboardFolder, deleteDashboardFolder, saveDashboardTerritories, deleteDashboard, selectDashboard, openDashboardViewer, exitDashboardViewer, selectPageForObject, openPageForObject };
}
