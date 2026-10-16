// @ts-nocheck
// Tenant-scoped bootstrap: core metadata first, optional admin metadata afterwards.
import { useEffect, useRef } from 'react';
import type { ObjectMetadata, LightningPageMetadata, LightningAppMetadata, FlowDefinitionMetadata, PlatformEventMetadata, NamedCredentialMetadata, EmailAlertMetadata, ApprovalProcessMetadata, ConnectorProviderMetadata, IntegrationConnectionMetadata, LibraryComponentMetadata, DashboardMetadata, DashboardFolderMetadata, DashboardTerritoryMetadata, ReportFolderMetadata, ReportMetadata, AccessControlMetadata } from './metadata';
import type { MetadataPublicationResponse } from './verifiedMetadataCache';
export function useSetupMetadata(ctx: any) {
  const { advancedMetadataLoaded, apiRequest, approvalProcesses, apps, currentAppId, dashboards, emailAlerts, entryTiming, flowSnapshots, flows, isAuthErrorMessage, object, objects, page, pages, platformEvents, readVerifiedMetadata, reports, route, saveVerifiedMetadata, setAccessControl, setAccessControlError, setAdvancedMetadataLoaded, setApprovalProcesses, setApps, setCanCreateDashboards, setCanManageApprovalProcesses, setCanManageApps, setCanReadMetadata, setCanReadSecurity, setCanManageDashboardTerritories, setCanManageDashboards, setCanManageFlows, setCanManageLibrary, setCanManagePlatformLicences, setCanManagePlatformTenants, setCanManageReportFolders, setCanManageUserIdentities, setCanRunFlows, setCanScheduleDashboards, setConnectorProviders, setCurrentAppId, setCurrentFieldAccess, setCurrentProfileId, setCurrentRecordTypeAccess, setDashboardFolders, setDashboardRunningUserIds, setDashboardTerritories, setDashboardUserId, setDashboards, setEmailAlerts, setFlow, setFlows, setIntegrationConnections, setLibraryComponents, setMetadataLoadError, setMetadataLoaded, setNamedCredentials, setObject, setObjects, setPage, setPages, setPlatformEvents, setReportFolders, setReports, setSelectedFlowId, setToast, toast, workspace } = ctx;
  // Optional business metadata is resolved only for the active screen or page dependencies.
  // Tenant installation, entitlement and OneEngine access are always checked by the APIs.
  const analyticsLoads = useRef(new Set<string>());
  useEffect(() => {
    if (!advancedMetadataLoaded) return;
    const currentPage = pages.filter((page) =>
      (route.kind === 'app-page' && page.apiName === route.pageApiName)
      || (route.kind === 'app-home' && page.pageType === 'Home Page' &&
        (page.activationAssignments ?? []).some((item) => item.appId === route.appId))
      || ((route.kind === 'record-list' || route.kind === 'record-detail') &&
        page.pageType === 'Record Page' && page.targetObject === route.objectApiName));
    const components = currentPage.flatMap((page) => page.components ?? []);
    const adminDependencies = route.kind === 'setup' &&
      ['page-builder', 'object-manager'].includes(workspace);
    const dashboardNeeded = adminDependencies || (route.kind === 'setup' && workspace === 'dashboard-builder')
      || components.some((component) => component.type === 'Dashboard');
    const reportNeeded = dashboardNeeded || adminDependencies || (route.kind === 'setup' && workspace === 'report-builder')
      || components.some((component) => component.type === 'Report Chart');
    // Administration is a separate workspace, not a dependency of a Till-only tenant.
    const isAdmin = route.kind === 'setup';
    const needsFlowAdministration = isAdmin && workspace === 'flow-builder';
    const needsApprovalAdministration = isAdmin && (workspace === 'approval-processes' || needsFlowAdministration);
    const needsConnectorAdministration = isAdmin && (workspace === 'connector-settings' || needsFlowAdministration);
    const optionalGroups = [
      {
        key: 'flow-definitions', enabled: needsFlowAdministration,
        run: () => apiRequest<{flows: FlowDefinitionMetadata[]}>('/metadata/flows')
          .then((payload) => {
            const definitions = payload.flows ?? [];
            flowSnapshots.current = new Map(definitions.map(item => [item.apiName, JSON.stringify(item)]));
            setFlows(definitions);
            if (definitions.length) {
              setFlow(definitions[0]);
              setSelectedFlowId(definitions[0].elements[0]?.id ?? 1);
            }
          })
      },
      {
        key: 'flow-admin', enabled: needsFlowAdministration,
        run: () => Promise.all([apiRequest('/metadata/platform-events'), apiRequest('/metadata/email-alerts')])
          .then(([events, alerts]) => { setPlatformEvents(events.platformEvents ?? []); setEmailAlerts(alerts.emailAlerts ?? []); })
      },
      {
        key: 'approvals-admin', enabled: needsApprovalAdministration,
        run: () => apiRequest('/metadata/approval-processes')
          .then((payload) => setApprovalProcesses(payload.approvalProcesses ?? []))
      },
      {
        key: 'connectors-admin', enabled: needsConnectorAdministration,
        run: () => Promise.all([apiRequest('/connector-providers'), apiRequest('/integration-connections')])
          .then(([providers, connections]) => { setConnectorProviders(providers.providers ?? []); setIntegrationConnections(connections.connections ?? []); })
      }
    ];
    for (const group of optionalGroups) {
      if (!group.enabled || analyticsLoads.current.has(group.key)) continue;
      analyticsLoads.current.add(group.key);
      void group.run().catch(() => analyticsLoads.current.delete(group.key));
    }
    if (reportNeeded && !analyticsLoads.current.has('reports')) {
      analyticsLoads.current.add('reports');
      void Promise.all([
        apiRequest('/metadata/reports'),
        apiRequest('/metadata/report-folders')
      ]).then(([reportsPayload, foldersPayload]) => {
        setReports(reportsPayload.reports ?? []);
        setReportFolders(foldersPayload.folders ?? []);
        setCanManageReportFolders(Boolean(foldersPayload.canManageAll));
      }).catch(() => analyticsLoads.current.delete('reports'));
    }
    if (dashboardNeeded && !analyticsLoads.current.has('dashboards')) {
      analyticsLoads.current.add('dashboards');
      void Promise.all([
        apiRequest('/metadata/dashboards'),
        apiRequest('/metadata/dashboard-folders'),
        apiRequest('/metadata/dashboard-territories')
      ]).then(([payload, foldersPayload, territoryPayload]) => {
        setDashboards(payload.dashboards ?? []);
        setDashboardUserId(payload.userId ?? '');
        setDashboardRunningUserIds(payload.runningUserIds ?? []);
        setCanCreateDashboards(Boolean(payload.canCreate));
        setCanManageDashboards(Boolean(payload.canManageAll));
        setCanScheduleDashboards(Boolean(payload.canSchedule));
        setDashboardFolders(foldersPayload.folders ?? []);
        setDashboardTerritories(territoryPayload.territories ?? []);
        setCanManageDashboardTerritories(Boolean(territoryPayload.canManage));
      }).catch(() => analyticsLoads.current.delete('dashboards'));
    }
  }, [advancedMetadataLoaded, route, workspace, pages]);

  useEffect(() => {
    const loadMetadata = async () => {
      const failures: string[] = [];
      const pending = new Map<string, Promise<unknown>>();
      // Reuse the four essential requests when the optional data loads later.
      // This avoids fetching the same objects/pages/apps/session twice.
      const recover = <T,>(path: string, fallback: T): Promise<T> => {
        const existing = pending.get(path);
        if (existing) return existing as Promise<T>;
        const request = (async () => {
          try { return await apiRequest<T>(path); }
          catch (error) {
            if (isAuthErrorMessage(error instanceof Error ? error.message : String(error))) throw error;
            failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
            return fallback;
          }
        })();
        pending.set(path, request);
        return request;
      };
      try {
        // Entry routes need only core tenant metadata. Their initial render must
        // not wait for the Flow Builder, report builders, connectors and dashboards.
        const fastEntryRoute = route.kind !== 'setup' || route.workspace === 'home';
        if (fastEntryRoute) {
          // Trusted tenant-scoped RBAC bootstrap is returned with successful
          // refresh/login: render immediately without 4 more HTTP round trips.
          const [firstObjects, firstPages, firstApps, firstSession] = entryTiming?.landing
            ? [
                { objects: entryTiming.landing.objects },
                { pages: entryTiming.landing.pages },
                { apps: entryTiming.landing.apps },
                { user: entryTiming.landing.user }
              ] as const
            : await Promise.all([
            recover<{ objects: ObjectMetadata[] }>('/metadata/objects', { objects: [] }),
            recover<{ pages: LightningPageMetadata[] }>('/metadata/pages', { pages: [] }),
            recover<{ apps: LightningAppMetadata[] }>('/metadata/apps', { apps: [] }),
            recover<{ user: { profileId: string; permissions: string[]; fieldAccess: Record<string, {read:boolean;edit:boolean}>; recordTypeAccess: Record<string, boolean> } }>('/auth/me',
              { user: { profileId:'',permissions:[],fieldAccess:{},recordTypeAccess:{} } })
          ]);
          // A snapshot is display-only and is never accepted in place of
          // authenticated identity or server-side permissions. Restore solely
          // when the live session was verified but presentation endpoints failed.
          const signedIn = firstSession.user as typeof firstSession.user & {id?:string;tenantId?:string};
          // Encrypted presentation fallback requires a fresh OneEngine publication digest.
          const serverPublication = signedIn.id && signedIn.tenantId && (!firstObjects.objects.length || !firstPages.pages.length || !firstApps.apps.length)
            ? await apiRequest<MetadataPublicationResponse>('/metadata/offline-publication').catch(() => null) : null;
          const offlineView = signedIn.id && signedIn.tenantId && serverPublication
            ? await readVerifiedMetadata({userId:signedIn.id,tenantId:signedIn.tenantId},serverPublication.publication).catch(() => null) : null;
          const displayObjects = firstObjects.objects.length ? firstObjects.objects : (offlineView?.objects ?? []) as ObjectMetadata[];
          const displayPages = firstPages.pages.length ? firstPages.pages : (offlineView?.pages ?? []) as LightningPageMetadata[];
          const displayApps = firstApps.apps.length ? firstApps.apps : (offlineView?.apps ?? []) as LightningAppMetadata[];
          if (offlineView) {
            setLibraryComponents(offlineView.components as LibraryComponentMetadata[]);
            setToast('Showing last saved page layout. Cloud actions require a connection.');
          }
          if (displayObjects.length) {
            setObjects(displayObjects);
            setObject(displayObjects.find((item) => item.apiName === object.apiName) ?? displayObjects[0]);
          }
          if (displayPages.length) setPages(displayPages);
          setApps(displayApps);
          if (!displayApps.some((item) => item.apiName === currentAppId))
            setCurrentAppId(displayApps[0]?.apiName ?? '');
          setCurrentProfileId(firstSession.user.profileId);
          setCurrentFieldAccess(firstSession.user.fieldAccess);
          setCurrentRecordTypeAccess(firstSession.user.recordTypeAccess);
          setCanManageUserIdentities(firstSession.user.permissions.includes('security:manage'));
          setCanManageApprovalProcesses(firstSession.user.permissions.includes('security:manage')
            || firstSession.user.permissions.includes('metadata:write'));
          setCanManagePlatformTenants(firstSession.user.permissions.includes('platform:tenants:manage'));
          setCanRunFlows(firstSession.user.permissions.includes('flows:run'));
          setCanManageFlows(firstSession.user.permissions.includes('flows:manage')
            || firstSession.user.permissions.includes('metadata:write'));
          setCanManageApps(firstSession.user.permissions.includes('metadata:write')); setCanReadMetadata(firstSession.user.permissions.includes('metadata:read')||firstSession.user.permissions.includes('metadata:write')); setCanReadSecurity(firstSession.user.permissions.includes('security:read')||firstSession.user.permissions.includes('security:manage'));
          setMetadataLoaded(true);
          // Give the landing screen a chance to paint before loading editor-only
          // data in the background. On direct builder URLs the full load begins
          // immediately, preserving the previous deep-link behaviour.
          await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
        }
        const [objectPayload, flowPayload, platformEventPayload, pagePayload, appPayload, credentialPayload, emailAlertPayload, approvalProcessPayload, providerPayload, integrationPayload, libraryPayload, dashboardPayload, folderPayload, territoryPayload, reportFolderPayload, reportPayload, sessionPayload] = await Promise.all([
          recover<{ objects: ObjectMetadata[] }>('/metadata/objects', { objects: [] }),
          Promise.resolve({ flows: [] as FlowDefinitionMetadata[] }), // Flow definitions belong to the Builder, not login.
          Promise.resolve({ platformEvents: [] as PlatformEventMetadata[] }),
          recover<{ pages: LightningPageMetadata[] }>('/metadata/pages', { pages: [] }),
          recover<{ apps: LightningAppMetadata[] }>('/metadata/apps', { apps: [] }),
          Promise.resolve({ credentials: [] as NamedCredentialMetadata[] }),
          Promise.resolve({ emailAlerts: [] as EmailAlertMetadata[] }),
          Promise.resolve({ approvalProcesses: [] as ApprovalProcessMetadata[] }),
          Promise.resolve({ providers: [] as ConnectorProviderMetadata[] }),
          Promise.resolve({ connections: [] as IntegrationConnectionMetadata[] }),
          recover<{ components: LibraryComponentMetadata[]; canManage: boolean }>('/component-library', { components: [], canManage: false }),
          Promise.resolve({ dashboards: [], userId: '', runningUserIds: [], canCreate: false, canManageAll: false, canSchedule: false }),
          Promise.resolve({ folders: [] as DashboardFolderMetadata[] }),
          Promise.resolve({ territories: [] as DashboardTerritoryMetadata[], canManage: false }),
          Promise.resolve({ folders: [] as ReportFolderMetadata[], canManageAll: false }),
          Promise.resolve({ reports: [] as ReportMetadata[] }),
          recover<{ user: { id?: string; tenantId?: string; profileId: string; permissions: string[]; fieldAccess: Record<string, { read: boolean; edit: boolean }>; recordTypeAccess: Record<string, boolean> } }>('/auth/me', { user: { profileId: '', permissions: [], fieldAccess: {}, recordTypeAccess: {} } })
        ]);
        // RBAC settings are optional for initial page rendering. Fetch them
        // independently so a slow permissions response cannot block all pages.
        void apiRequest<AccessControlMetadata>('/metadata/permissions')
          .then((permissions) => {
            setAccessControl(permissions);
            setAccessControlError('');
          })
          .catch((error) => {
            setAccessControlError(error instanceof Error ? error.message : String(error));
          });
        if (objectPayload.objects.length) {
          setObjects(objectPayload.objects);
          setObject(objectPayload.objects.find((item) => item.apiName === object.apiName) ?? objectPayload.objects[0]);
        }
        setPlatformEvents(platformEventPayload.platformEvents);
        if (pagePayload.pages.length) {
          setPages(pagePayload.pages);
          setPage(pagePayload.pages.find((item) =>
            route.kind === 'setup' && route.workspace === 'page-builder' && item.apiName === route.resourceApiName)
            ?? pagePayload.pages.find((item) => item.targetObject === 'Account' && item.pageType === 'Record Page')
            ?? pagePayload.pages[0]);
        }
        setApps(appPayload.apps);
        if (!appPayload.apps.some((app) => app.apiName === currentAppId)) {
          setCurrentAppId(appPayload.apps[0]?.apiName ?? '');
        }
        setNamedCredentials(credentialPayload.credentials);
        setEmailAlerts(emailAlertPayload.emailAlerts);
        setApprovalProcesses(approvalProcessPayload.approvalProcesses);
        setConnectorProviders(providerPayload.providers);
        setIntegrationConnections(integrationPayload.connections);
        setLibraryComponents(libraryPayload.components);
        setCanManageLibrary(libraryPayload.canManage);
        setDashboards(dashboardPayload.dashboards);
        setDashboardFolders(folderPayload.folders);
        setDashboardTerritories(territoryPayload.territories);
        setCanManageDashboardTerritories(territoryPayload.canManage);
        setReportFolders(reportFolderPayload.folders);
        setCanManageReportFolders(reportFolderPayload.canManageAll);
        setDashboardUserId(dashboardPayload.userId);
        setDashboardRunningUserIds(dashboardPayload.runningUserIds);
        // Cache presentation metadata only after /auth/me confirms the live user and
        // all authorised metadata endpoints return successfully. Do not cache
        // credentials, permissions, business records or executable checkout state.
        if (sessionPayload.user.id && sessionPayload.user.tenantId
          && !failures.length && objectPayload.objects.length && pagePayload.pages.length) {
          void apiRequest<MetadataPublicationResponse>('/metadata/offline-publication')
            .then(({content,publication})=>saveVerifiedMetadata(
              {userId:sessionPayload.user.id!,tenantId:sessionPayload.user.tenantId!},content,publication))
            .catch(() => { /* Online rendering remains authoritative. */ });
        }
        setCurrentProfileId(sessionPayload.user.profileId);
        setCanManageUserIdentities(sessionPayload.user.permissions.includes('security:manage'));
        setCanManageApprovalProcesses(sessionPayload.user.permissions.includes('security:manage')
          || sessionPayload.user.permissions.includes('metadata:write'));
        setCanManagePlatformLicences(sessionPayload.user.permissions.includes('licence:manage'));
        setCanManagePlatformTenants(sessionPayload.user.permissions.includes('platform:tenants:manage'));
        setCanRunFlows(sessionPayload.user.permissions.includes('flows:run'));
        setCanManageFlows(sessionPayload.user.permissions.includes('flows:manage')
          || sessionPayload.user.permissions.includes('metadata:write'));
        setCanManageApps(sessionPayload.user.permissions.includes('metadata:write'));
        // Direct Builder/Admin URLs also require live read grants. Do not rely on
        // the fast-entry bootstrap, which only runs for ordinary landing routes.
        setCanReadMetadata(sessionPayload.user.permissions.includes('metadata:read') || sessionPayload.user.permissions.includes('metadata:write'));
        setCanReadSecurity(sessionPayload.user.permissions.includes('security:read') || sessionPayload.user.permissions.includes('security:manage'));
        setCurrentFieldAccess(sessionPayload.user.fieldAccess);
        setCurrentRecordTypeAccess(sessionPayload.user.recordTypeAccess);
        setCanCreateDashboards(dashboardPayload.canCreate);
        setCanManageDashboards(dashboardPayload.canManageAll);
        setCanScheduleDashboards(dashboardPayload.canSchedule);
        setReports(reportPayload.reports);
        if (failures.length) setToast(`Some metadata could not load: ${failures.join('; ')}`);
      } catch (error) {
        // 401 / session expiry just returns to Login via metadrive:session-expired —
        // don't spam a "Metadata API unavailable" toast for a normal logged-out state.
        const message = error instanceof Error ? error.message : String(error);
        if (!isAuthErrorMessage(message)) {
          setMetadataLoadError(message);
          setToast(`Metadata API unavailable: ${message}`);
        }
      } finally {
        setMetadataLoaded(true);
        setAdvancedMetadataLoaded(true);
      }
    };
    void loadMetadata();
  }, []);
}
