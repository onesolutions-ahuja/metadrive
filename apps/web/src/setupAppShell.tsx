






import { relatedLookupFilterOperators } from './recordMetadataUtils';


import { objectSettings, parseAppRoute, appRoutePath, type AppRoute } from './appRouting';
import { NavigationLoadTime, resolveCurrentAppNavigation } from './appNavigationView';
import { isStandalonePagePresentation } from './pageRuntimePresentation';
import { insertFlowElementAtPath } from './flowInsertElement.mjs';

import { resolveSetupNavigation } from './platformSetupNavigation';
import { readVerifiedMetadata, saveVerifiedMetadata, type MetadataPublicationResponse } from './verifiedMetadataCache';


import * as React from 'react';
import { renderSetupShell } from './setupShellPresentation';
import { createSetupNotificationActions } from './setupNotificationActions';
import { useSetupAnalyticsActions } from './useSetupAnalyticsActions';
import { createSetupObjectActions } from './setupObjectActions';
import { createSetupFlowActions } from './setupFlowActions';
import { useSetupMetadata } from './useSetupMetadata';
const SetupObjectDialogs = React.lazy(() => import('./setupObjectDialogs'));
const FieldWizardModal = React.lazy(() => import('./setupFieldWizard'));

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronLeft, ChevronRight, CircleHelp, Database, Monitor, History, Search, X } from 'lucide-react';
const FlowBuilderWorkspace = React.lazy(() => import('./FlowBuilder'));
const SetupFlowDialogs = React.lazy(() => import('./setupFlowDialogs'));
const FlowLogs = React.lazy(() => import('./FlowLogs'));
const FlowInterviews = React.lazy(() => import('./FlowInterviews'));
const ScheduledFlows = React.lazy(() => import('./ScheduledFlows'));
const DashboardBuilder = React.lazy(() => import('./DashboardBuilder'));
const ComponentLibrary = React.lazy(() => import('./ComponentLibrary'));













const AppExchange = React.lazy(() => import('./AppExchange'));
const AppManager = React.lazy(() => import('./AppManager'));
import PlatformWorkspaceSurface from './PlatformWorkspaceSurface'; import { PlatformPageSlot } from './PlatformPageSlot';
import { GlobalRecordSearch, RecordObjectPicker, useDismissOnOutside } from './TopbarRecords';

const NamedCredentials = React.lazy(() => import('./NamedCredentials'));
const TenantManagement = React.lazy(() => import('./TenantManagement'));
const TenantDomains = React.lazy(() => import('./TenantDomains'));
const TenantRecoveryPanel = React.lazy(() => import('./TenantRecoveryPanel'));
const TenantUsagePanel = React.lazy(() => import('./TenantUsagePanel'));
const DeveloperAccountSettings = React.lazy(() => import('./DeveloperAccountSettings'));

const ApprovalProcessManager = React.lazy(() => import('./ApprovalProcessManager'));

const EmbeddedDashboard = React.lazy(() => import('./EmbeddedDashboard'));



import { defaultFlow, defaultLightningPage, defaultAccessControl, objectMetadata, workspaces, type ObjectMetadata, type RelatedLookupFilterMetadata, type ObjectSettingsMetadata, type FlowDefinitionMetadata, type FlowExecutionLogMetadata, type FlowInterviewMetadata, type FlowElementMetadata, type FlowValidationMetadata, type PlatformEventMetadata, type NamedCredentialMetadata, type EmailAlertMetadata, type CustomNotificationMetadata, type ApprovalRequestMetadata, type ApprovalProcessMetadata, type ConnectorProviderMetadata, type IntegrationConnectionMetadata, type LightningPageMetadata, type LibraryComponentMetadata, type DashboardMetadata, type DashboardFolderMetadata, type DashboardTerritoryMetadata, type ReportMetadata, type ReportFolderMetadata, type AccessControlMetadata, type LightningAppMetadata, type WorkspaceId } from './metadata';
type NewFieldLookupFilterDraft = {
  id: string;
  relatedFieldApiName: string;
  operator: RelatedLookupFilterMetadata['operator'];
  valueMode: 'Value' | 'Field';
  value: string;
  valueFieldApiName: string;
  required: boolean;
};
type LandingBootstrap = {
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  apps: LightningAppMetadata[];
  user: {
    profileId: string;
    permissions: string[];
    fieldAccess: Record<string, { read: boolean; edit: boolean }>;
    recordTypeAccess: Record<string, boolean>;
  };
};
type EntryTiming = { kind: 'login' | 'restore'; startedAt: number; authenticatedAt: number; landing?: LandingBootstrap };
export function createSetupApp(deps: {
apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
ApiRequestError: new (...args: any[]) => Error & {status:number;responseBody:unknown};
fetchFlowListPage: (page:number, search:string) => Promise<any>;
isAuthErrorMessage: (message: string) => boolean;
loadAppCommunicationHistory: (objectName: string, field: string, source: string, offset: number, search: string) => Promise<any>;
loadConnectorMarketplaceApps: () => Promise<any>;
executeConnectorAppLifecycleFlow: (apiName: string, appKey: string) => Promise<void>;
loadFlowScreenRecords: (objectApiName: string) => Promise<Record<string, unknown>[]>;
customTabStyles: ReadonlyArray<{name:'Blue' | 'Green' | 'Orange' | 'Purple' | 'Red' | 'Teal' | 'Yellow';color:string;icon:React.ComponentType<any>}>;
uneSolutionsLogoUrl: string;
ProfilePasswordMenu: React.ComponentType<any>,
ConnectionHealthIndicator: React.ComponentType<any>,
ConnectorSettingsWorkspace: React.ComponentType<any>,
LightningAppRuntime: React.ComponentType<any>,
RecordWorkspace: React.ComponentType<any>,
ObjectManager: React.ComponentType<any>,
PageBuilder: React.ComponentType<any>,
ReportBuilder: React.ComponentType<any>,
Permissions: React.ComponentType<any>,
SetupHome: React.ComponentType<any>,
AutomationSettingsWorkspace: React.ComponentType<any>,
CompanySettings: React.ComponentType<any>,
TenantMfaSettings: React.ComponentType<any>,
TenantSecurityAudit: React.ComponentType<any>,
TenantUserLockSettings: React.ComponentType<any>,
AccountSessionSecurity: React.ComponentType<any>,
TenantEmailRecoverySettings: React.ComponentType<any>
}) {
const {isAuthErrorMessage, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords, apiRequest, ApiRequestError, fetchFlowListPage, customTabStyles, uneSolutionsLogoUrl, ProfilePasswordMenu, ConnectionHealthIndicator, ConnectorSettingsWorkspace, LightningAppRuntime, RecordWorkspace, ObjectManager, PageBuilder, ReportBuilder, Permissions, SetupHome, AutomationSettingsWorkspace, CompanySettings, TenantMfaSettings, TenantSecurityAudit, TenantUserLockSettings, AccountSessionSecurity, TenantEmailRecoverySettings} = deps;
function SetupApp({ onLogout, entryTiming }: { onLogout: () => void; entryTiming: EntryTiming | null }) {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.pathname, window.location.search));
  const [routeAliasError, setRouteAliasError] = useState('');
  const [routeTiming, setRouteTiming] = useState(() => ({
    routeKey: window.location.pathname + window.location.search,
    startedAt: entryTiming?.startedAt ?? performance.now(),
    kind: entryTiming?.kind ?? 'navigation' as const,
    authMs: entryTiming ? entryTiming.authenticatedAt - entryTiming.startedAt : null
  }));
  const [currentAppId, setCurrentAppId] = useState(() => new URLSearchParams(window.location.search).get('appId') || 'Records');
  const [apps, setApps] = useState<LightningAppMetadata[]>([]);
  const [runtimeFormFactor, setRuntimeFormFactor] = useState<'Desktop' | 'Phone'>(() =>
    window.matchMedia('(max-width: 600px)').matches ? 'Phone' : 'Desktop');
  const [workspace, setWorkspace] = useState<WorkspaceId>(() => route.kind === 'setup' ? route.workspace : 'home');
  const [quickFind, setQuickFind] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [setupSidebarCollapsed, setSetupSidebarCollapsed] = useState(false);
  const [objectSearch, setObjectSearch] = useState('');
  const [objects, setObjects] = useState(objectMetadata);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [advancedMetadataLoaded, setAdvancedMetadataLoaded] = useState(false);
  const [metadataLoadError, setMetadataLoadError] = useState('');
  const [object, setObject] = useState<ObjectMetadata>(() =>
    (route.kind === 'setup' && route.objectApiName ? objectMetadata.find((item) => item.apiName === route.objectApiName) : undefined)
      ?? objectMetadata.find((item) => item.apiName === 'Account')
      ?? objectMetadata[0]
  );
  const [objectSetting, setObjectSetting] = useState(() => route.kind === 'setup' ? route.setting ?? 'Fields & Relationships' : 'Fields & Relationships');
  const [flow, setFlow] = useState<FlowDefinitionMetadata>(defaultFlow);
  const [flows, setFlows] = useState<FlowDefinitionMetadata[]>([defaultFlow]);
  const [platformEvents, setPlatformEvents] = useState<PlatformEventMetadata[]>([]);
  const [flowLogs, setFlowLogs] = useState<FlowExecutionLogMetadata[]>([]);
  const [flowLogsLoading, setFlowLogsLoading] = useState(true);
  const [flowInterviews, setFlowInterviews] = useState<FlowInterviewMetadata[]>([]);
  const [flowInterviewsLoading, setFlowInterviewsLoading] = useState(false);
  const [canManageFlows, setCanManageFlows] = useState(false);
  const [canManageApps, setCanManageApps] = useState(false); const [canReadMetadata,setCanReadMetadata]=useState(false); const [canReadSecurity,setCanReadSecurity]=useState(false);
  const [notifications, setNotifications] = useState<CustomNotificationMetadata[]>([]);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(notificationRef, notificationsOpen, () => setNotificationsOpen(false));
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequestMetadata[]>([]);
  const [approvalBusyId, setApprovalBusyId] = useState('');
  const [approvalProcesses, setApprovalProcesses] = useState<ApprovalProcessMetadata[]>([]);
  const [canManageApprovalProcesses, setCanManageApprovalProcesses] = useState(false);
  const [canManageUserIdentities, setCanManageUserIdentities] = useState(false);
  const [namedCredentials, setNamedCredentials] = useState<NamedCredentialMetadata[]>([]);
  const [canManageNamedCredentials, setCanManageNamedCredentials] = useState(false);
  const [connectorRights, setConnectorRights] = useState({
    view: false, edit: false, secrets: false, test: false, install: false, licence: false
  });
  const [canManagePlatformLicences, setCanManagePlatformLicences] = useState(false);
  const [canManagePlatformTenants, setCanManagePlatformTenants] = useState(false);
  const [namedCredentialsEncryptionReady, setNamedCredentialsEncryptionReady] = useState<boolean | null>(null);
  const [emailAlerts, setEmailAlerts] = useState<EmailAlertMetadata[]>([]);
  const [connectorProviders, setConnectorProviders] = useState<ConnectorProviderMetadata[]>([]);
  const [integrationConnections, setIntegrationConnections] = useState<IntegrationConnectionMetadata[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControlMetadata>(defaultAccessControl);
  const [accessControlError, setAccessControlError] = useState('');
  const [flowValidation, setFlowValidation] = useState<FlowValidationMetadata | null>(null);
  const [flowRun, setFlowRun] = useState<{ interviewId: string; flowApiName: string; screen: FlowElementMetadata; values: Record<string, unknown>; outcomes: Array<{ name: string; label: string }>; canGoBack: boolean } | null>(null);
  const [flowDebug, setFlowDebug] = useState<{
    flow: FlowDefinitionMetadata;
    mode: 'debug' | 'run';
    inputs: Record<string, string>;
    result?: Record<string, unknown>;
    error: string;
    running: boolean;
  } | null>(null);
  const [flowRunnerSubmitting, setFlowRunnerSubmitting] = useState(false);
  const [flowRunnerError, setFlowRunnerError] = useState('');
  const [standalonePageMode, setStandalonePageMode] = useState(false);
  const flowHistory = useRef<{ undo: FlowDefinitionMetadata[]; redo: FlowDefinitionMetadata[] }>({ undo: [], redo: [] });
  const flowSnapshots = useRef(new Map<string, string>());
  const [page, setPage] = useState<LightningPageMetadata>(defaultLightningPage);
  // UI-only wizard handoff; app membership is persisted through metadata navigation on activation.
  const [pageCreationAppContext, setPageCreationAppContext] = useState<Record<string, string>>({});
  const pageRouteApiName = useRef('');
  const [pages, setPages] = useState<LightningPageMetadata[]>([defaultLightningPage]);
  const [dashboards, setDashboards] = useState<DashboardMetadata[]>([]);
  const [dashboardFolders, setDashboardFolders] = useState<DashboardFolderMetadata[]>([]);
  const [dashboardTerritories, setDashboardTerritories] = useState<DashboardTerritoryMetadata[]>([]);
  const [canManageDashboardTerritories, setCanManageDashboardTerritories] = useState(false);
  const [reports, setReports] = useState<ReportMetadata[]>([]);
  const [reportFolders, setReportFolders] = useState<ReportFolderMetadata[]>([]);
  const [canManageReportFolders, setCanManageReportFolders] = useState(false);
  const [dashboardUserId, setDashboardUserId] = useState('');
  const [dashboardRunningUserIds, setDashboardRunningUserIds] = useState<string[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState('');
  const [canRunFlows, setCanRunFlows] = useState(false);
  const [currentFieldAccess, setCurrentFieldAccess] = useState<Record<string, { read: boolean; edit: boolean }>>({});
  const [currentRecordTypeAccess, setCurrentRecordTypeAccess] = useState<Record<string, boolean>>({});
  const [canCreateDashboards, setCanCreateDashboards] = useState(false);
  const [canManageDashboards, setCanManageDashboards] = useState(false);
  const [canScheduleDashboards, setCanScheduleDashboards] = useState(false);
  const [libraryComponents, setLibraryComponents] = useState<LibraryComponentMetadata[]>([]);
  const [canManageLibrary, setCanManageLibrary] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState(2);
  const [showNewField, setShowNewField] = useState(false);
  const [newFieldStage, setNewFieldStage] = useState<0 | 1 | 2 | 3>(0);
  const [newFieldLayoutIds, setNewFieldLayoutIds] = useState<string[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('Text');
  const [newFieldTextLength, setNewFieldTextLength] = useState(255);
  const [newFieldPrecision, setNewFieldPrecision] = useState(18);
  const [newFieldScale, setNewFieldScale] = useState(0);
  const [newFieldDescription, setNewFieldDescription] = useState('');
  const [newFieldHelpText, setNewFieldHelpText] = useState('');
  const [newFieldDefaultValue, setNewFieldDefaultValue] = useState('');
  const [newFieldHasDefault, setNewFieldHasDefault] = useState(false);
  const [newFieldFormula, setNewFieldFormula] = useState('');
  const [newFieldFormulaValidation, setNewFieldFormulaValidation] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid'; message: string }>({ status: 'idle', message: '' });
  const formulaEditorRef = useRef<HTMLTextAreaElement>(null);
  const [newFieldPicklistValues, setNewFieldPicklistValues] = useState('');
  const [newFieldPicklistRestricted, setNewFieldPicklistRestricted] = useState(true);
  const [newFieldControllerApiName, setNewFieldControllerApiName] = useState('');
  const [newFieldValueSettings, setNewFieldValueSettings] = useState<Record<string, string[]>>({});
  const [newFieldReturnType, setNewFieldReturnType] = useState('Number');
  const [newFieldRelationshipTarget, setNewFieldRelationshipTarget] = useState('');
  const [newFieldRelationshipName, setNewFieldRelationshipName] = useState('');
  const [newFieldChildRelationshipName, setNewFieldChildRelationshipName] = useState('');
  const [newFieldDeleteBehavior, setNewFieldDeleteBehavior] = useState<'Clear' | 'Restrict'>('Clear');
  const [newFieldAllowReparenting, setNewFieldAllowReparenting] = useState(false);
  const [newFieldLookupFilters, setNewFieldLookupFilters] = useState<NewFieldLookupFilterDraft[]>([]);
  const [newFieldLookupFilterLogic, setNewFieldLookupFilterLogic] = useState<'All' | 'Any'>('All');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldUnique, setNewFieldUnique] = useState(false);
  const [newFieldExternalId, setNewFieldExternalId] = useState(false);
  const [newFieldCaseSensitive, setNewFieldCaseSensitive] = useState(false);
  const [showNewObject, setShowNewObject] = useState(false);
  const [newObjectLabel, setNewObjectLabel] = useState('');
  const [newObjectPluralLabel, setNewObjectPluralLabel] = useState('');
  const [newObjectDescription, setNewObjectDescription] = useState('');
  const [newObjectRecordNameLabel, setNewObjectRecordNameLabel] = useState('');
  const [launchCustomTabWizard, setLaunchCustomTabWizard] = useState(false);
  const [customTabObject, setCustomTabObject] = useState<ObjectMetadata | null>(null);
  const [customTabStyle, setCustomTabStyle] = useState<(typeof customTabStyles)[number]['name']>('Blue');
  const [showCustomTabWizard, setShowCustomTabWizard] = useState(false);
  const [newObjectSettings, setNewObjectSettings] = useState<ObjectSettingsMetadata>({
    allowReports: true,
    allowActivities: false,
    trackFieldHistory: false,
    allowInChatter: false,
    deploymentStatus: 'In Development',
    recordNameType: 'Text',
    recordNameFormat: ''
  });
  const [toast, setToast] = useState('');
  const [activeUtility, setActiveUtility] = useState<'History' | null>(null);
  const [recentRoutes, setRecentRoutes] = useState<Array<{ key: string; label: string; route: AppRoute }>>([]);
  const [flowToolTab, setFlowToolTab] = useState<'Elements' | 'Manager'>('Elements');
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const updateFormFactor = () => setRuntimeFormFactor(media.matches ? 'Phone' : 'Desktop');
    updateFormFactor();
    media.addEventListener('change', updateFormFactor);
    return () => media.removeEventListener('change', updateFormFactor);
  }, []);

  useEffect(() => {
    const key = JSON.stringify(route);
    const label = route.kind === 'setup'
      ? workspaces.find((item) => item.id === route.workspace)?.label ?? 'Setup'
      : route.kind === 'app-home' ? `${apps.find((app) => app.apiName === route.appId)?.label ?? route.appId} Home`
        : route.kind === 'app-page' ? pages.find((page) => page.apiName === route.pageApiName)?.label ?? route.pageApiName
          : route.kind === 'route-alias' ? route.slug
          : `${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? route.objectApiName}${route.kind === 'record-detail' ? ' Record' : ''}`;
    setRecentRoutes((current) => current[0]?.key === key
      ? current
      : [{ key, label, route }, ...current.filter((item) => item.key !== key)].slice(0, 8));
  }, [route, objects, apps, pages]);

  // Resolve credential permissions independently of unrelated metadata requests.
  // A failed report/connector/dashboard request must not disable credential management.
  useEffect(() => {
    // Connector administration is optional; never request secrets on unrelated tenant routes.
    if (!advancedMetadataLoaded || route.kind !== 'setup' || !['named-credentials', 'connector-settings', 'app-exchange', 'flow-builder'].includes(workspace)) return;
    let active = true;
    void apiRequest<{ canManage: boolean; encryptionReady: boolean }>('/named-credentials/readiness')
      .then(({ canManage, encryptionReady }) => {
        if (active) {
          setCanManageNamedCredentials(canManage);
          setNamedCredentialsEncryptionReady(encryptionReady);
        }
      })
      .catch(() => {
        if (active) setNamedCredentialsEncryptionReady(null);
      });
    void apiRequest<{ view: boolean; edit: boolean; secrets: boolean; test: boolean; install: boolean; licence: boolean }>('/connector-apps/capabilities')
      .then((rights) => { if (active) setConnectorRights(rights); })
      .catch(() => { if (active) setConnectorRights({view:false,edit:false,secrets:false,test:false,install:false,licence:false}); });
    void apiRequest<{ credentials: NamedCredentialMetadata[] }>('/named-credentials')
      .then(({ credentials }) => {
        if (active) setNamedCredentials(credentials);
      })
      .catch(() => {
        // The main metadata loader reports errors; keep this permission check independent.
      });
    return () => { active = false; };
  }, [advancedMetadataLoaded, route.kind, workspace]);

  useSetupMetadata({ advancedMetadataLoaded, apiRequest, approvalProcesses, apps, currentAppId, dashboards, emailAlerts, entryTiming, flowSnapshots, flows, isAuthErrorMessage, object, objects, page, pages, platformEvents, readVerifiedMetadata, reports, route, saveVerifiedMetadata, setAccessControl, setAccessControlError, setAdvancedMetadataLoaded, setApprovalProcesses, setApps, setCanCreateDashboards, setCanManageApprovalProcesses, setCanManageApps, setCanReadMetadata, setCanReadSecurity, setCanManageDashboardTerritories, setCanManageDashboards, setCanManageFlows, setCanManageLibrary, setCanManagePlatformLicences, setCanManagePlatformTenants, setCanManageReportFolders, setCanManageUserIdentities, setCanRunFlows, setCanScheduleDashboards, setConnectorProviders, setCurrentAppId, setCurrentFieldAccess, setCurrentProfileId, setCurrentRecordTypeAccess, setDashboardFolders, setDashboardRunningUserIds, setDashboardTerritories, setDashboardUserId, setDashboards, setEmailAlerts, setFlow, setFlows, setIntegrationConnections, setLibraryComponents, setMetadataLoadError, setMetadataLoaded, setNamedCredentials, setObject, setObjects, setPage, setPages, setPlatformEvents, setReportFolders, setReports, setSelectedFlowId, setToast, toast, workspace });
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
          setCanManagePlatformTenants(firstSession.user.permissions.includes('platform:superadmin'));
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
          recover<{ flows: FlowDefinitionMetadata[] }>('/metadata/flows', { flows: [] }),
          recover<{ platformEvents: PlatformEventMetadata[] }>('/metadata/platform-events', { platformEvents: [] }),
          recover<{ pages: LightningPageMetadata[] }>('/metadata/pages', { pages: [] }),
          recover<{ apps: LightningAppMetadata[] }>('/metadata/apps', { apps: [] }),
          recover<{ credentials: NamedCredentialMetadata[] }>('/named-credentials', { credentials: [] }),
          recover<{ emailAlerts: EmailAlertMetadata[] }>('/metadata/email-alerts', { emailAlerts: [] }),
          recover<{ approvalProcesses: ApprovalProcessMetadata[] }>('/metadata/approval-processes', { approvalProcesses: [] }),
          recover<{ providers: ConnectorProviderMetadata[] }>('/connector-providers', { providers: [] }),
          recover<{ connections: IntegrationConnectionMetadata[] }>('/integration-connections', { connections: [] }),
          recover<{ components: LibraryComponentMetadata[]; canManage: boolean }>('/component-library', { components: [], canManage: false }),
          recover<{ dashboards: DashboardMetadata[]; userId: string; runningUserIds: string[]; canCreate: boolean; canManageAll: boolean; canSchedule: boolean }>('/metadata/dashboards', { dashboards: [], userId: '', runningUserIds: [], canCreate: false, canManageAll: false, canSchedule: false }),
          recover<{ folders: DashboardFolderMetadata[] }>('/metadata/dashboard-folders', { folders: [] }),
          recover<{ territories: DashboardTerritoryMetadata[]; canManage: boolean }>('/metadata/dashboard-territories', { territories: [], canManage: false }),
          recover<{ folders: ReportFolderMetadata[]; canManageAll: boolean }>('/metadata/report-folders', { folders: [], canManageAll: false }),
          recover<{ reports: ReportMetadata[] }>('/metadata/reports', { reports: [] }),
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
        if (flowPayload.flows.length) {
          flowSnapshots.current = new Map(flowPayload.flows.map((item) =>
            [item.apiName, JSON.stringify(item)]));
          setFlows(flowPayload.flows);
          setFlow(flowPayload.flows[0]);
          setSelectedFlowId(flowPayload.flows[0].elements[0]?.id ?? 1);
        }
        setPlatformEvents(platformEventPayload.platformEvents);
        if (pagePayload.pages.length) {
          setPages(pagePayload.pages);
          setPage(pagePayload.pages.find((item) =>
            route.kind === 'setup' && route.workspace === 'page-builder' && item.apiName === route.resourceApiName)
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
        setCanManagePlatformTenants(sessionPayload.user.permissions.includes('platform:superadmin'));
        setCanRunFlows(sessionPayload.user.permissions.includes('flows:run'));
        setCanManageFlows(sessionPayload.user.permissions.includes('flows:manage')
          || sessionPayload.user.permissions.includes('metadata:write'));
        setCanManageApps(sessionPayload.user.permissions.includes('metadata:write'));
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

  useEffect(() => {
    if (workspace !== 'flow-logs') return;
    let active = true;
    setFlowLogsLoading(true);
    void apiRequest<{ logs: FlowExecutionLogMetadata[] }>('/metadata/flow-logs')
      .then((payload) => {
        if (active) setFlowLogs(payload.logs);
      })
      .catch((error) => {
        if (active) setToast(`Unable to load failed flow logs: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (active) setFlowLogsLoading(false);
      });
    return () => { active = false; };
  }, [workspace]);

  useEffect(() => {
    if (workspace !== 'flow-interviews') return;
    let active = true;
    setFlowInterviewsLoading(true);
    void apiRequest<{ interviews: FlowInterviewMetadata[] }>('/metadata/flow-interviews')
      .then((payload) => {
        if (active) setFlowInterviews(payload.interviews);
      })
      .catch((error) => {
        if (active) setToast(`Unable to load Flow interviews: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (active) setFlowInterviewsLoading(false);
      });
    return () => { active = false; };
  }, [workspace]);

  const refreshFlowInterviews = async () => {
    setFlowInterviewsLoading(true);
    try {
      const payload = await apiRequest<{ interviews: FlowInterviewMetadata[] }>('/metadata/flow-interviews');
      setFlowInterviews(payload.interviews);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to load Flow interviews');
    } finally {
      setFlowInterviewsLoading(false);
    }
  };

  const cancelFlowInterview = async (interview: FlowInterviewMetadata) => {
    if (!window.confirm(`Cancel the ${interview.kind} interview for "${interview.flowLabel}"? It cannot be resumed afterward.`)) return;
    try {
      await apiRequest<void>(`/metadata/flow-interviews/${encodeURIComponent(interview.id)}`, { method: 'DELETE' });
      setFlowInterviews((current) => current.filter((item) => item.id !== interview.id));
      notify(`Interview for "${interview.flowLabel}" canceled`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to cancel Flow interview');
    }
  };

  const flowHasUnsavedChanges = () => {
    if (route.kind !== 'setup' || route.workspace !== 'flow-builder') return false;
    const savedSnapshot = flowSnapshots.current.get(flow.apiName);
    return savedSnapshot === undefined || savedSnapshot !== JSON.stringify(flow);
  };
  const confirmDiscardFlowChanges = () => !flowHasUnsavedChanges()
    || window.confirm('This flow has unsaved changes. Leave without saving them?');
  const confirmFlowNavigation = (nextRoute: AppRoute) => {
    const remainsOnCurrentFlow = nextRoute.kind === 'setup'
      && nextRoute.workspace === 'flow-builder'
      && nextRoute.resourceApiName === flow.apiName;
    return remainsOnCurrentFlow || confirmDiscardFlowChanges();
  };

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = parseAppRoute(window.location.pathname, window.location.search);
      if (!confirmFlowNavigation(nextRoute)) {
        window.history.pushState({}, '', appRoutePath(route));
        return;
      }
      setRouteTiming({ routeKey: window.location.pathname + window.location.search, startedAt: performance.now(), kind: 'navigation', authMs: null });
      setRoute(nextRoute);
      setCurrentAppId(new URLSearchParams(window.location.search).get('appId') || 'Records');
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [route, flow, flows]);

  useEffect(() => {
    if (!flowHasUnsavedChanges()) return;
    const protectUnsavedFlow = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsavedFlow);
    return () => window.removeEventListener('beforeunload', protectUnsavedFlow);
  }, [flow, route]);

  useEffect(() => {
    if (route.kind !== 'setup') return;
    setWorkspace(route.workspace);
    if (route.workspace === 'object-manager') {
      const selectedObject = route.objectApiName ? objects.find((item) => item.apiName === route.objectApiName) : undefined;
      if (selectedObject && selectedObject.apiName !== object.apiName) setObject(selectedObject);
      setObjectSetting(route.setting ?? 'Fields & Relationships');
    }
    if (route.workspace === 'flow-builder' && route.resourceApiName && flow.apiName !== route.resourceApiName) {
      const selectedFlow = flows.find((item) => item.apiName === route.resourceApiName);
      if (selectedFlow) {
        setFlow(selectedFlow);
        setSelectedFlowId(selectedFlow.elements[0]?.id ?? 1);
        flowHistory.current = { undo: [], redo: [] };
      }
    }
    if (route.workspace === 'page-builder' && route.resourceApiName) {
      const selectedPage = pages.find((item) => item.apiName === route.resourceApiName);
      if (selectedPage && (pageRouteApiName.current !== route.resourceApiName || page.apiName !== selectedPage.apiName)) {
        pageRouteApiName.current = route.resourceApiName;
        setPage(selectedPage);
      }
    }
  }, [route, objects, object.apiName, flows, flow.apiName, pages, page.apiName]);

  useEffect(() => {
    const canonicalPath = appRoutePath(route);
    if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
      window.history.replaceState({}, '', canonicalPath);
    }
  }, []);

  const navigateRoute = (nextRoute: AppRoute, skipFlowConfirmation = false) => {
    if (!skipFlowConfirmation && !confirmFlowNavigation(nextRoute)) return false;
    const routeWithApp = nextRoute.kind === 'setup' ? nextRoute : { ...nextRoute, appId: nextRoute.appId ?? currentAppId };
    const path = appRoutePath(routeWithApp);
    if (`${window.location.pathname}${window.location.search}` !== path) {
      setRouteTiming({ routeKey: path, startedAt: performance.now(), kind: 'navigation', authMs: null });
      window.history.pushState({}, '', path);
    }
    setRoute(routeWithApp);
    if (routeWithApp.kind !== 'setup') setCurrentAppId(routeWithApp.appId ?? 'Records');
    return true;
  };
  useEffect(() => {
    if (route.kind !== 'setup' || route.workspace !== 'connector-settings' || connectorProviders.length === 0) return;
    const selectedProvider = connectorProviders.find((provider) => provider.connectorKey === route.resourceApiName);
    if (!selectedProvider) {
      navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: connectorProviders[0].connectorKey });
    }
  }, [route, connectorProviders]);

  // Resolve friendly metadata aliases via an authenticated tenant-scoped API.
  // The server checks the destination again, so an old alias never grants access.
  useEffect(() => {
    if (route.kind !== 'route-alias') { setRouteAliasError(''); return; }
    const pending = route;
    let cancelled = false;
    setRouteAliasError('');
    void apiRequest<{ path: string }>('/routes/resolve/' + encodeURIComponent(pending.appId) +
      '/' + encodeURIComponent(pending.slug)).then(({ path }) => {
      if (cancelled || typeof path !== 'string' || !path.startsWith('/une/')) return;
      const targetUrl = new URL(path, window.location.origin);
      if (targetUrl.origin !== window.location.origin || !targetUrl.pathname.startsWith('/une/'))
        throw Error('Invalid route alias destination');
      const destination = parseAppRoute(targetUrl.pathname, targetUrl.search);
      if (destination.kind === 'setup' || destination.kind === 'route-alias'
          || (destination.appId && destination.appId !== pending.appId))
        throw Error('Route alias target is unavailable');
      window.history.replaceState({}, '', appRoutePath(destination));
      setRoute(destination);
    }).catch(error => {
      if (!cancelled) setRouteAliasError(error instanceof Error ? error.message : 'Unable to resolve route alias');
    });
    return () => { cancelled = true; };
  }, [route]);
 
  const openSetupWorkspace = (nextWorkspace: WorkspaceId) => {
    const nextRoute: AppRoute = nextWorkspace === 'object-manager'
      ? { kind: 'setup', workspace: nextWorkspace, objectApiName: object.apiName, setting: objectSetting }
      : nextWorkspace === 'flow-builder'
        ? { kind: 'setup', workspace: nextWorkspace }
        : nextWorkspace === 'page-builder'
          ? { kind: 'setup', workspace: nextWorkspace }
          : nextWorkspace === 'report-builder'
            ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: 'Opportunities_by_Stage' }
            : nextWorkspace === 'dashboard-builder'
              ? { kind: 'setup', workspace: nextWorkspace, ...(dashboards[0] ? { resourceApiName: dashboards[0].apiName } : {}) }
              : nextWorkspace === 'connector-settings'
                ? { kind: 'setup', workspace: nextWorkspace, ...(connectorProviders[0] ? { resourceApiName: connectorProviders[0].connectorKey } : {}) }
                : nextWorkspace === 'rbac'
                ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: 'PermissionSets' }
                : { kind: 'setup', workspace: nextWorkspace };
    navigateRoute(nextRoute);
  };
  const changePage = (nextPage: LightningPageMetadata) => {
    setPage(nextPage);
  };

  const filteredObjects = useMemo(() => {
    const query = objectSearch.trim().toLowerCase();
    if (!query) return objects;
    return objects.filter((item) =>
      `${item.label} ${item.pluralLabel} ${item.apiName}`.toLowerCase().includes(query)
    );
  }, [objectSearch, objects]);
  const activationAppIds = [...new Set([
    ...apps.map((app) => app.apiName)
  ])].sort((left, right) => left.localeCompare(right));
  const currentApp = apps.find((app) => app.apiName === currentAppId) ?? apps[0];
  const currentAppNavigation = resolveCurrentAppNavigation(currentApp);
  const protectedPageRuntime={apiRequest,objects,apps,pages,reports,currentAppId,
   availableFlows:flows.map(({apiName,label,flowType,status})=>({apiName,label,flowType,status})),
   formFactor:runtimeFormFactor,onNavigate:navigateRoute,
   onLaunchFlow:(apiName:string,inputs?:Record<string,unknown>)=>{void runFlow(apiName,inputs);}};
  // Build the complete navigable object catalogue from tenant metadata, not app tabs.
  // The field map reflects effective RBAC; record APIs check object permissions again.
  const readableRecordObjects = useMemo(() => objects.filter((item) =>
    item.fields.some((field) => currentFieldAccess[`${item.apiName}.${field.apiName}`]?.read)
  ), [objects, currentFieldAccess]);
  useEffect(() => { setRecordSearch(''); }, [route.kind, route.kind === 'record-list' || route.kind === 'record-detail' ? route.objectApiName : '']);
  const appUtilityRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(appUtilityRef, Boolean(activeUtility), () => setActiveUtility(null));
  const filteredSetupGroups = useMemo(() => {
    return resolveSetupNavigation(quickFind,canManagePlatformTenants,
      connectorProviders.map(provider=>provider.name+' '+provider.connectorKey));
  }, [quickFind, connectorProviders, canManagePlatformTenants]);
  const filteredConnectorProviders = useMemo(() => {
    const query = quickFind.trim().toLowerCase();
    return query
      ? connectorProviders.filter((provider) => `${provider.name} ${provider.connectorKey}`.toLowerCase().includes(query))
      : connectorProviders;
  }, [quickFind, connectorProviders]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };
  const saveAccessControl = async (nextAccessControl: AccessControlMetadata) => {
    const saved = await apiRequest<AccessControlMetadata>('/metadata/permissions', {
      method: 'PUT',
      body: JSON.stringify(nextAccessControl)
    });
    setAccessControl(saved);
    setAccessControlError('');
    notify('Access-control metadata saved');
  };
  const saveConnectorProvider = async (provider: ConnectorProviderMetadata) => {
    const result = await apiRequest<{ provider: ConnectorProviderMetadata }>(
      `/connector-providers/${encodeURIComponent(provider.connectorKey)}`,
      { method: 'PUT', body: JSON.stringify(provider) }
    );
    setConnectorProviders((current) => current.map((item) =>
      item.connectorKey === result.provider.connectorKey ? result.provider : item
    ));
    return result.provider;
  };
  const saveIntegrationConnection = async (
    connection: Omit<Pick<IntegrationConnectionMetadata, 'id' | 'connectorKey' | 'name' | 'configuration' | 'status'>, 'id'> & { id?: string; credentials: Record<string, string> }
  ) => {
    const path = connection.id
      ? `/integration-connections/${encodeURIComponent(connection.id)}`
      : '/integration-connections';
    const result = await apiRequest<{ connection: IntegrationConnectionMetadata }>(path, {
      method: connection.id ? 'PUT' : 'POST',
      body: JSON.stringify(connection)
    });
    setIntegrationConnections((current) => connection.id
      ? current.map((item) => item.id === result.connection.id ? result.connection : item)
      : [...current, result.connection]);
    return result.connection;
  };
  const testIntegrationConnection = async (id: string) => {
    const result = await apiRequest<{ connection: IntegrationConnectionMetadata }>(
      `/integration-connections/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    );
    setIntegrationConnections((current) => current.map((item) =>
      item.id === result.connection.id ? result.connection : item
    ));
    return result.connection;
  };
  const commitFlow = (nextFlow: FlowDefinitionMetadata) => {
    if (JSON.stringify(flow) === JSON.stringify(nextFlow)) return;
    const editedFlow = flow.status === 'Active' && nextFlow.status === 'Active'
      ? { ...nextFlow, status: 'Draft' as const }
      : nextFlow;
    flowHistory.current.undo.push(flow);
    if (flowHistory.current.undo.length > 50) flowHistory.current.undo.shift();
    flowHistory.current.redo = [];
    setFlow(editedFlow);
    setFlows((current) => current.map((item) => item.apiName === editedFlow.apiName ? editedFlow : item));
    setFlowValidation(null);
  };
  const undoFlow = () => {
    const previous = flowHistory.current.undo.pop();
    if (!previous) return;
    flowHistory.current.redo.push(flow);
    setFlow(previous);
    setFlows((current) => current.map((item) => item.apiName === previous.apiName ? previous : item));
    setSelectedFlowId(previous.elements[0]?.id ?? 1);
    setFlowValidation(null);
  };
  const redoFlow = () => {
    const next = flowHistory.current.redo.pop();
    if (!next) return;
    flowHistory.current.undo.push(flow);
    setFlow(next);
    setFlows((current) => current.map((item) => item.apiName === next.apiName ? next : item));
    setSelectedFlowId(next.elements[0]?.id ?? 1);
    setFlowValidation(null);
  };
  const logout = async () => {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to sign out cleanly');
    } finally {
      onLogout();
    }
  };

  const navigateSetupItem = (item: string) => {
    const provider = connectorProviders.find((definition) => definition.name === item || definition.connectorKey === item);
    if (provider) {
      navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: provider.connectorKey });
      return;
    }
    if (item === 'Une Connectors') {
      // Existing navigation aliases use the credential store actually consumed by flows.
      openSetupWorkspace('named-credentials');
      return;
    }
    if (item === 'Company Information' || item === 'Currencies') {
      openSetupWorkspace('company-settings');
      return;
    }
    if (item === 'Named Devices') {
      if (!readableRecordObjects.some((object) => object.apiName === 'NamedDevice__c')) {
        notify('Named Devices requires Read access in your Profile or Permission Set.');
        return;
      }
      navigateRoute({ kind: 'record-list', objectApiName: 'NamedDevice__c' });
      return;
    }
    if (item === 'Tenant Management') {
      if (canManagePlatformTenants) openSetupWorkspace('tenant-management');
      return;
    }
    if (item === 'Named Credentials') {
      openSetupWorkspace('named-credentials');
      return;
    }
    if (item === 'Approval Processes') {
      openSetupWorkspace('approval-processes');
      return;
    }
    if (item === 'Object Manager' || item === 'Objects' || objectSettings.includes(item)) {
      navigateRoute({
        kind: 'setup',
        workspace: 'object-manager',
        objectApiName: object.apiName,
        setting: item === 'Object Manager' || item === 'Objects' ? 'Details' : item
      });
      return;
    }
    if (item === 'Lightning App Builder') openSetupWorkspace('page-builder');
    else if (item === 'App Manager') openSetupWorkspace('app-manager');
    else if (item === 'Component Library') openSetupWorkspace('component-library');
    else if (item === 'AppExchange') openSetupWorkspace('app-exchange');
    else if (item === 'Flows') openSetupWorkspace('flow-builder');
    else if (item === 'Paused and Waiting Interviews') openSetupWorkspace('flow-interviews');
    else if (item === 'Scheduled Flows') openSetupWorkspace('scheduled-flows');
    else if (item === 'Failed Flow Logs') openSetupWorkspace('flow-logs');
    else if (item === 'Process Automation Settings') openSetupWorkspace('automation-settings');
    else if (item === 'Reports') openSetupWorkspace('report-builder');
    else if (item === 'Dashboards') openSetupWorkspace('dashboard-builder');
    else if (['Users', 'Roles', 'Public Groups', 'Queues', 'Permission Sets', 'Permission Set Groups', 'Profiles', 'Sharing Settings', 'Sharing Rules'].includes(item)) {
      const resourceApiName = item === 'Users' ? 'Users' : item === 'Permission Set Groups' ? 'PermissionSetGroups' : item.replace(/[^A-Za-z0-9]/g, '');
      navigateRoute({ kind: 'setup', workspace: 'rbac', resourceApiName });
    } else openSetupWorkspace('home');
  };

  const addFlowElement = (type: string, afterId = selectedFlowId, connectorId?: string) => {
    if (type === 'Start') {
      notify('A flow can only have one Start element');
      return;
    }
    if (type === 'Screen' && flow.flowType !== 'Screen Flow') {
      notify('Screen elements are only available in Screen Flows');
      return;
    }
    if (type === 'Roll Back Records' && !['Screen Flow', 'Autolaunched Flow'].includes(flow.flowType)) {
      notify('Roll Back Records is only available in Screen and Autolaunched Flows');
      return;
    }
    const nextId = Math.max(...flow.elements.map((item) => item.id), 0) + 1;
    const label = type === 'Decision' ? 'New Decision' : `New ${type}`;
    const object = flow.triggerObject ?? 'Account';
    const defaults: Record<string, Record<string, unknown>> = {
      'Decision': { object, outcomes: [{ name: 'Outcome_1', label: 'Outcome 1', conditions: [] }, { name: 'Default', label: 'Default Outcome', conditions: [] }] },
      'Assignment': { variable: '', operator: 'Assign', value: '' },
      'Loop': { collection: '', direction: 'First to last', loopVariable: '' },
      'Wait': { waitType: 'Duration', amount: 1, unit: 'Hours' },
      'Get Records': { object, conditions: [], fields: 'all', sortField: '', sortOrder: 'Ascending', recordLimit: 1 },
      'Create Records': { object, fieldValues: [] },
      'Update Records': { object, conditions: [], fieldValues: [] },
      'Delete Records': { object, conditions: [] },
      'Roll Back Records': {},
      'Screen': { fields: [] },
      'Action': { actionType: '', inputValues: [] },
      'HTTP Callout': { method: 'GET', namedCredentialId: '', path: '', headers: '', body: '', responseVariable: '', statusVariable: '' },
      'Subflow': { flowApiName: '', inputValues: [] }
    };
    const next = { id: nextId, type, label, config: defaults[type] ?? {} };
    try {
      // Flow connectors, not element-array order, define execution paths.
      const inserted = insertFlowElementAtPath(flow, afterId, next, connectorId,
        `connector-${crypto.randomUUID()}`);
      commitFlow(inserted);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to insert Flow element');
      return;
    }
    setSelectedFlowId(next.id);
  };

  const updateFlowLabel = (id: number, label: string) => {
    commitFlow({ ...flow, elements: flow.elements.map((item) => item.id === id ? { ...item, label } : item) });
  };

  const updateFlowConfig = (id: number, key: string, value: unknown) => {
    commitFlow({
      ...flow,
      triggerObject: flow.elements.find((item) => item.id === id)?.type === 'Start' && key === 'object'
        ? String(value) || null
        : flow.triggerObject,
      startConfig: flow.elements.find((item) => item.id === id)?.type === 'Start'
        ? { ...flow.startConfig, [key]: value }
        : flow.startConfig,
      elements: flow.elements.map((item) => item.id === id ? { ...item, config: { ...item.config, [key]: value } } : item)
    });
  };

  const removeFlowElement = (id: number) => {
    if (flow.elements.find((item) => item.id === id)?.type === 'Start') {
      notify('The Start element cannot be removed');
      return;
    }
    if (flow.connectors.some((connector) => connector.from === id)) {
      notify('Disconnect child paths before removing this Flow element.');
      return;
    }
    const incoming = flow.connectors.filter((connector) => connector.to === id);
    const outgoing = flow.connectors.filter((connector) => connector.from === id);
    const remaining = flow.elements.filter((item) => item.id !== id);
    const connectors = flow.connectors.filter((connector) => connector.from !== id && connector.to !== id);
    for (const source of incoming) {
      for (const target of outgoing) {
        if (source.from !== target.to && !connectors.some((connector) => connector.from === source.from && connector.to === target.to)) {
          connectors.push({ id: `connector-${crypto.randomUUID()}`, from: source.from, to: target.to, label: source.label || target.label, kind: target.kind });
        }
      }
    }
    commitFlow({ ...flow, elements: remaining, connectors });
    setSelectedFlowId(incoming[0]?.from ?? remaining[0]?.id ?? 1);
  };

  const { validateNewFieldFormula, insertFormulaText, resetNewFieldDraft, newFieldApiName, newFieldPicklistOptions, newFieldController, newFieldControllerValues, newFieldDefaultError, newFieldConfigurationError, addField, saveObject, refreshObject, deleteObject, saveField, deleteField, createObject, saveCustomTab } = createSetupObjectActions({ apiRequest, customTabObject, customTabStyle, formulaEditorRef, launchCustomTabWizard, navigateRoute, newFieldAllowReparenting, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldControllerApiName, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, newObjectDescription, newObjectLabel, newObjectPluralLabel, newObjectRecordNameLabel, newObjectSettings, notify, object, objects, route, setCustomTabObject, setCustomTabStyle, setLaunchCustomTabWizard, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setNewObjectDescription, setNewObjectLabel, setNewObjectPluralLabel, setNewObjectRecordNameLabel, setNewObjectSettings, setObject, setObjectSetting, setObjects, setShowCustomTabWizard, setShowNewField, setShowNewObject, workspace });

  const { saveFlow, saveNamedCredential, toggleNamedCredentialEnabled, grantConnectorLicence, deleteNamedCredential, authorizeNamedCredential, testNamedCredential, rotateNamedCredential, saveEmailAlert, deleteEmailAlert, savePlatformEvent, deletePlatformEvent, saveApprovalProcess, deleteApprovalProcess, validateFlow, openFlowDebug, parseFlowInputs, runFlowDebug, runSavedFlowTests, runFlow, submitFlowScreen, goBackFlowScreen, createFlow, cloneFlow, deactivateFlow, deleteFlow, selectFlow, restoreFlowVersion, exportFlow, importFlow } = createSetupFlowActions({ apiRequest, apps, confirmDiscardFlowChanges, confirmFlowNavigation, flow, flowDebug, flowHistory, flowRun, flowSnapshots, flows, navigateRoute, notify, object, objects, platformEvents, setApprovalProcesses, setEmailAlerts, setFlow, setFlowDebug, setFlowRun, setFlowRunnerError, setFlowRunnerSubmitting, setFlowValidation, setFlows, setNamedCredentials, setPlatformEvents, setSelectedFlowId, workspace });

  const savePage = async (nextPage: LightningPageMetadata) => {
    try {
      const payload = await apiRequest<{ page: LightningPageMetadata }>(`/metadata/pages/${encodeURIComponent(nextPage.apiName)}`, {
        method: 'PUT', body: JSON.stringify(nextPage)
      });
      setPage(payload.page);
      setPages((current) => [...current.filter((item) => item.apiName !== payload.page.apiName), payload.page]);
      notify(payload.page.status === 'Active' ? 'Lightning page activated' : 'Lightning page saved');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save Lightning page');
    }
  };
  const savePageFromBuilder = async (
    nextPage: LightningPageMetadata,
    previousApiName: string,
    successMessage?: string
  ): Promise<boolean> => {
    try {
      const payload = await apiRequest<{ page: LightningPageMetadata }>(`/metadata/pages/${encodeURIComponent(previousApiName)}`, {
        method: 'PUT', body: JSON.stringify(nextPage)
      });
      setPage(payload.page);
      setPages((current) => [...current.filter((item) => item.apiName !== previousApiName && item.apiName !== payload.page.apiName), payload.page]);
      if (previousApiName !== payload.page.apiName) {
        setApps((current) => current.map((app) => ({
          ...app,
          navigationPageApiNames: app.navigationPageApiNames.map((apiName) => apiName === previousApiName ? payload.page.apiName : apiName),
          navigationOrder: app.navigationOrder.map((item) =>
            item.type === 'App Page' && item.apiName === previousApiName
              ? { ...item, apiName: payload.page.apiName }
              : item)
        })));
      }
      if (route.kind === 'setup' && route.workspace === 'page-builder' && route.resourceApiName !== payload.page.apiName) {
        navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: payload.page.apiName });
      }
      notify(successMessage ?? (payload.page.status === 'Active' ? 'Lightning page activated' : 'Lightning page saved'));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save Lightning page');
      return false;
    }
  };
  const saveApp = async (nextApp: LightningAppMetadata, updating: boolean) => {
    const path = updating ? `/metadata/apps/${encodeURIComponent(nextApp.apiName)}` : '/metadata/apps';
    const payload = await apiRequest<{ app: LightningAppMetadata }>(path, {
      method: updating ? 'PUT' : 'POST',
      body: JSON.stringify(nextApp)
    });
    setApps((current) => current.some((item) => item.apiName === payload.app.apiName)
      ? current.map((item) => item.apiName === payload.app.apiName ? payload.app : item)
      : [...current, payload.app]);
    if (!updating) setCurrentAppId(payload.app.apiName);
  };
  const deleteApp = async (apiName: string) => {
    await apiRequest<void>(`/metadata/apps/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    const remaining = apps.filter((app) => app.apiName !== apiName);
    setApps(remaining);
    const nextApp = remaining[0];
    if (currentAppId === apiName) {
      setCurrentAppId(nextApp?.apiName ?? '');
      if (route.kind !== 'setup') {
        navigateRoute(nextApp
          ? { ...route, appId: nextApp.apiName }
          : { kind: 'setup', workspace: 'home' });
      }
    }
  };
  const saveLibraryComponent = async (
    component: Pick<LibraryComponentMetadata, 'apiName' | 'label' | 'description' | 'surfaces' | 'resize' | 'jsxSource' | 'cssSource'> & { publicationStatus: 'Draft' | 'Published' }, 
    updating: boolean
  ) => {
    const path = updating ? `/component-library/${encodeURIComponent(component.apiName)}` : '/component-library';
    const payload = await apiRequest<{ component: LibraryComponentMetadata }>(path, {
      method: updating ? 'PUT' : 'POST',
      body: JSON.stringify(component)
    });
    setLibraryComponents((current) => current.some((item) => item.apiName === payload.component.apiName)
      ? current.map((item) => item.apiName === payload.component.apiName ? payload.component : item)
      : [...current, payload.component]);
    notify(updating ? 'Global component updated' : 'Global component registered');
  };
  const publishLibraryComponent = async (apiName: string) => {
    const payload = await apiRequest<{component: LibraryComponentMetadata}>(`/component-library/${encodeURIComponent(apiName)}/publish`, {method:'POST',body:'{}'});
    setLibraryComponents((current) => current.map((item) => item.apiName === apiName ? payload.component : item));
    notify('Component published');
  };
  const rollbackLibraryComponent = async (apiName: string, version: number) => {
    const payload = await apiRequest<{component: LibraryComponentMetadata}>(`/component-library/${encodeURIComponent(apiName)}/rollback`, {
      method:'POST',body:JSON.stringify({version})
    });
    setLibraryComponents((current) => current.map((item) => item.apiName === apiName ? payload.component : item));
    notify('Component restored as a new published version');
  };
  const deleteLibraryComponent = async (apiName: string) => {
    await apiRequest<void>(`/component-library/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setLibraryComponents((current) => current.filter((item) => item.apiName !== apiName));
    notify('Global component deleted');
  };
  const { loadDashboardRecords, saveReport, saveReportFolder, deleteReport, runReport, previewReport, loadDashboardSnapshots, createDashboardSnapshot, deleteDashboardSnapshot, loadDashboardSubscriptions, saveDashboardSubscription, deleteDashboardSubscription, runDashboardSubscription, saveDashboard, saveDashboardFolder, deleteDashboardFolder, saveDashboardTerritories, deleteDashboard, selectDashboard, openDashboardViewer, exitDashboardViewer, selectPageForObject, openPageForObject } = useSetupAnalyticsActions({ apiRequest, dashboards, navigateRoute, notify, objects, page, pages, reports, setDashboardFolders, setDashboardTerritories, setDashboards, setPage, setReportFolders, setReports, workspace });

  const { loadNotifications, toggleNotifications, markNotificationRead, decideApproval } = createSetupNotificationActions({ apiRequest, notifications, notificationsOpen, notify, setApprovalBusyId, setApprovalRequests, setNotifications, setNotificationsLoading, setNotificationsOpen, setNotificationsUnreadCount });

  // Standalone presentation is a page metadata capability, not an app identity.
  // Only an active, route-matched page can opt into the edge-to-edge shell.
  const isStandaloneMetadataPage = (route.kind === 'app-page' || route.kind === 'app-home') && pages.some((candidate) =>
    candidate.status === 'Active' &&
    (route.kind === 'app-page' ? candidate.apiName === route.pageApiName && candidate.pageType === 'App Page'
      : candidate.pageType === 'Home Page' && (candidate.activationAssignments ?? []).some((assignment) =>
          assignment.appId === route.appId && (assignment.scope === 'App Default' || assignment.scope === 'App and Profile'))) &&
    isStandalonePagePresentation(candidate)
  );

  return renderSetupShell({ AppExchange, AppManager, ComponentLibrary, FieldWizardModal, FlowInterviews, FlowLogs, NamedCredentials, ScheduledFlows, SetupFlowDialogs, SetupObjectDialogs, AccountSessionSecurity, ApprovalProcessManager, AutomationSettingsWorkspace, Bell, Check, ChevronLeft, ChevronRight, CircleHelp, CompanySettings, ConnectionHealthIndicator, ConnectorSettingsWorkspace, DashboardBuilder, Database, DeveloperAccountSettings, FlowBuilderWorkspace, GlobalRecordSearch, History, LightningAppRuntime, Monitor, NavigationLoadTime, ObjectManager, PageBuilder, Permissions, PlatformPageSlot, PlatformWorkspaceSurface, ProfilePasswordMenu, RecordObjectPicker, RecordWorkspace, ReportBuilder, Search, SetupHome, TenantDomains, TenantEmailRecoverySettings, TenantManagement, TenantMfaSettings, TenantRecoveryPanel, TenantSecurityAudit, TenantUsagePanel, TenantUserLockSettings, X, accessControl, accessControlError, activationAppIds, activeUtility, addField, addFlowElement, advancedMetadataLoaded, apiRequest, appUtilityRef, approvalBusyId, approvalProcesses, approvalRequests, apps, authorizeNamedCredential, canCreateDashboards, canManageApprovalProcesses, canManageApps, canReadMetadata, canReadSecurity, canManageDashboardTerritories, canManageDashboards, canManageFlows, canManageLibrary, canManageNamedCredentials, canManagePlatformTenants, canManageReportFolders, canManageUserIdentities, canRunFlows, canScheduleDashboards, cancelFlowInterview, changePage, cloneFlow, commitFlow, connectorProviders, connectorRights, createDashboardSnapshot, createFlow, createObject, currentApp, currentAppNavigation, currentFieldAccess, currentProfileId, currentRecordTypeAccess, customTabObject, customTabStyle, customTabStyles, dashboardFolders, dashboardRunningUserIds, dashboardTerritories, dashboardUserId, dashboards, deactivateFlow, decideApproval, defaultLightningPage, deleteApp, deleteApprovalProcess, deleteDashboard, deleteDashboardFolder, deleteDashboardSnapshot, deleteDashboardSubscription, deleteEmailAlert, deleteField, deleteFlow, deleteLibraryComponent, deleteNamedCredential, deleteObject, deletePlatformEvent, deleteReport, emailAlerts, executeConnectorAppLifecycleFlow, exitDashboardViewer, exportFlow, fetchFlowListPage, filteredSetupGroups, flow, flowDebug, flowHasUnsavedChanges, flowHistory, flowInterviews, flowInterviewsLoading, flowLogs, flowLogsLoading, flowRun, flowRunnerError, flowRunnerSubmitting, flowToolTab, flowValidation, flows, formulaEditorRef, goBackFlowScreen, grantConnectorLicence, importFlow, insertFormulaText, integrationConnections, isStandaloneMetadataPage, launchCustomTabWizard, libraryComponents, loadAppCommunicationHistory, loadConnectorMarketplaceApps, loadDashboardRecords, loadDashboardSnapshots, loadDashboardSubscriptions, loadFlowScreenRecords, loadNotifications, logout, markNotificationRead, metadataLoadError, metadataLoaded, namedCredentials, namedCredentialsEncryptionReady, navigateRoute, navigateSetupItem, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, newObjectDescription, newObjectLabel, newObjectPluralLabel, newObjectRecordNameLabel, newObjectSettings, notificationRef, notifications, notificationsLoading, notificationsOpen, notificationsUnreadCount, notify, object, objectSearch, objectSetting, objects, onLogout, openDashboardViewer, openFlowDebug, openPageForObject, openSetupWorkspace, page, pageCreationAppContext, pageRouteApiName, pages, platformEvents, previewReport, protectedPageRuntime, publishLibraryComponent, quickFind, readableRecordObjects, recentRoutes, recordSearch, redoFlow, refreshFlowInterviews, refreshObject, relatedLookupFilterOperators, removeFlowElement, reportFolders, reports, resetNewFieldDraft, restoreFlowVersion, rollbackLibraryComponent, rotateNamedCredential, route, routeAliasError, routeTiming, runDashboardSubscription, runFlow, runFlowDebug, runReport, runSavedFlowTests, runtimeFormFactor, saveAccessControl, saveApp, saveApprovalProcess, saveConnectorProvider, saveCustomTab, saveDashboard, saveDashboardFolder, saveDashboardSubscription, saveDashboardTerritories, saveEmailAlert, saveField, saveFlow, saveIntegrationConnection, saveLibraryComponent, saveNamedCredential, saveObject, savePage, savePageFromBuilder, savePlatformEvent, saveReport, saveReportFolder, selectDashboard, selectFlow, selectedFlowId, setActiveUtility, setCustomTabObject, setCustomTabStyle, setFlowDebug, setFlowRun, setFlowRunnerError, setFlowToolTab, setLaunchCustomTabWizard, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setNewObjectDescription, setNewObjectLabel, setNewObjectPluralLabel, setNewObjectRecordNameLabel, setNewObjectSettings, setObjectSearch, setPage, setPageCreationAppContext, setQuickFind, setRecordSearch, setSelectedFlowId, setSetupSidebarCollapsed, setShowNewField, setShowNewObject, setStandalonePageMode, setupSidebarCollapsed, showCustomTabWizard, showNewField, showNewObject, standalonePageMode, submitFlowScreen, testIntegrationConnection, testNamedCredential, toast, toggleNamedCredentialEnabled, toggleNotifications, undoFlow, uneSolutionsLogoUrl, updateFlowConfig, updateFlowLabel, validateFlow, validateNewFieldFormula, workspace });
}
return SetupApp;
}
