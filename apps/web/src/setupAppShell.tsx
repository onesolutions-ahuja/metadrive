import { createRecordWorkspaceViews } from './recordWorkspaceViews';
import { createPageBuilder } from './pageBuilderView';
import { ReportBuilder } from './reportBuilderView';
import { createPermissions } from './permissionsView';
import { createObjectManager } from './objectManagerView';
import { createSetupHome } from './setupHomeView';
import { createSettingsViews } from './settingsWorkspaceViews';
import { pageLayoutForRecord, compactLayoutForRecord, matchesLookupFilterGroup, relatedLookupFilterOperators, type RecordData } from './recordMetadataUtils';
import { formatRecordValue, parseCsvImport } from './recordCsvUtils';
import { initialScreenValues, screenFieldIsVisible } from './flowScreenRuntimeUtils';
import { objectSettings, parseAppRoute, appRoutePath, type AppRoute } from './appRouting';
import { NavigationLoadTime, resolveCurrentAppNavigation } from './appNavigationView';
import { isStandalonePagePresentation, pageCanvasPresentationStyle } from './pageRuntimePresentation';
import { insertFlowElementAtPath } from './flowInsertElement.mjs';
import AdvancedSharingSettings from './AdvancedSharingSettings';
import {resolveSetupNavigation} from './platformSetupNavigation';
import {readVerifiedMetadata,saveVerifiedMetadata,type MetadataPublicationResponse} from './verifiedMetadataCache';
import { queueOfflineRecord, listOfflineRecords, markOfflineRecord, removeOfflineRecord,
  synchronizeOfflineRecords, type OfflineQueueOwner, type OfflineRecordItem, type OfflineRecordWrite } from './offlineRecordQueue';
import SchemaBuilder from './SchemaBuilder';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  ClipboardPaste,
  Command,
  Copy,
  Database,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  FileText,
  Filter,
  GripVertical,
  Grid2X2,
  ListFilter,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Puzzle,
  Smartphone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Star,
  Undo2,
  Redo2,
  Trash2,
  Tablet,
  UsersRound,
  X,
  Workflow,
  Wifi,
  WifiOff,
  PanelLeft,
  PanelRight
} from 'lucide-react';
import FlowBuilderWorkspace from './FlowBuilder';
import FlowScreenContent from './FlowScreenContent';
import FlowLogs from './FlowLogs';
import FlowInterviews from './FlowInterviews';
import ScheduledFlows from './ScheduledFlows';
import DashboardBuilder from './DashboardBuilder';
import ComponentLibrary from './ComponentLibrary';
import RegisteredComponent from './RegisteredComponent';
import CustomComponentPropertyEditor from './CustomComponentPropertyEditor';
import FlowInputBindingEditor from './FlowInputBindingEditor';
import RecordFilterEditor from './RecordFilterEditor';
import ComponentVisibilityEditor from './ComponentVisibilityEditor';
import PageRouteDirectory from './PageRouteDirectory';
import { isComponentVisible } from './componentVisibility';
import PageComponentVisualEditor from './PageComponentVisualEditor';
import { canNestComponent, componentVisualStyle, directChildren, isLayoutType, isDescendantOf, layoutTypes } from './pageComponentLayout';
import PageComponentStyleEditor from './PageComponentStyleEditor';
import { isCanvasLocked, wrapCanvasComponent, ungroupCanvasComponent } from './canvasInteractions';
import { filterPageComponentRecords, needsMetadataComponentRuntime } from './pageComponentBindings';
import { childrenOf, canNest, componentLayoutProps, hasPageComponentAppearance, isLayoutContainer, rawLayoutParentId, reparentComponent, resolvePageComponentStyle, type LayoutDevice } from './pageComponentLayout';
import AppExchange from './AppExchange';
import AppManager from './AppManager';
import PlatformWorkspaceSurface from './PlatformWorkspaceSurface';
import { GlobalRecordSearch, RecordObjectPicker, useDismissOnOutside } from './TopbarRecords';
import { pageIsAvailableInApp, resolvePageActionRoute } from './pageActionRouting';
import NamedCredentials from './NamedCredentials';
import TenantManagement from './TenantManagement';
import TenantDomains from './TenantDomains';
import TenantRecoveryPanel from './TenantRecoveryPanel';
import TenantUsagePanel from './TenantUsagePanel';
import DeveloperAccountSettings from './DeveloperAccountSettings';
import SettingsViewRow from './SettingsViewRow';
import ApprovalProcessManager from './ApprovalProcessManager';
import { standardPageComponents } from './componentCatalog';
import EmbeddedDashboard from './EmbeddedDashboard';
import { inspectPageDependencies } from './pageDependencies';
import {
  canvasDimensionsForOrientation,
  canvasBoundPosition,
  canvasOrientation,
  canvasScaleToFitWidth,
  canvasUnitsFromScreenDelta
} from './pageCanvas';
import {
  createComponentPreviewProps,
  getPageBuilderComponentCategories,
  pageBuilderPaletteCategories
} from './pageBuilderPalette';
import {
  defaultFlow,
  defaultLightningPage,
  defaultAccessControl,
  objectMetadata,
  setupShortcuts,
  workspaces,
  type ObjectMetadata,
  type FieldMetadata,
  type FieldSetMetadata,
  type PageLayoutMetadata,
  type PageLayoutCustomLinkMetadata,
  type CompactLayoutMetadata,
  type RecordTypeMetadata,
  type RelatedLookupFilterMetadata,
  type ObjectActionMetadata,
  type ObjectSettingsMetadata,
  type ProfileMetadata,
  type PageActivationAssignmentMetadata,
  type FlowDefinitionMetadata,
  type FlowExecutionLogMetadata,
  type FlowInterviewMetadata,
  type FlowElementMetadata,
  type FlowResourceMetadata,
  type FlowValidationMetadata,
  type PlatformEventMetadata,
  type LightningPageTemplate,
  type NamedCredentialMetadata,
  type EmailAlertMetadata,
  type CustomNotificationMetadata,
  type ApprovalRequestMetadata,
  type ApprovalProcessMetadata,
  type ApprovalProcessInput,
  type ConnectorProviderMetadata,
  type IntegrationConnectionMetadata,
  type LightningPageMetadata,
  type PageComponentMetadata,
  type LibraryComponentMetadata,
  type DashboardFilterMetadata,
  type DashboardMetadata,
  type DashboardFolderMetadata,
  type DashboardFolderInput,
  type DashboardTerritoryMetadata,
  type DashboardSubscription,
  type DashboardSubscriptionInput,
  type DashboardSnapshot,
  type ReportMetadata,
  type ReportBucketMetadata,
  type ReportFolderMetadata,
  type ReportFolderInput,
  type ReportRunMetadata,
  type ReportStandardFiltersMetadata,
  type ReportFilterMetadata,
  type ReportDateRange,
  type ReportDateGrouping,
  type ReportSummaryOperation,
  type ReportCrossFilterMetadata,
  type AccessControlMetadata,
  type CurrencySettingsMetadata,
  type LightningAppMetadata,
  type PermissionSetMetadata,
  type PermissionSetGroupMetadata,
  type PublicGroupMetadata,
  type QueueMetadata,
  type SharingRuleMetadata,
  type UserMetadata,
  type WorkspaceId
} from './metadata';

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
  const [flowRun, setFlowRun] = useState<{ interviewId: string; screen: FlowElementMetadata; values: Record<string, unknown>; outcomes: Array<{ name: string; label: string }>; canGoBack: boolean } | null>(null);
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
  const [activeUtility, setActiveUtility] = useState<'Notes' | 'History' | null>(null);
  const [utilityNotes, setUtilityNotes] = useState<Record<string, string>>({});
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
  }, [workspace]);

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
          ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: page.apiName }
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

  const validateNewFieldFormula = async (): Promise<boolean> => {
    if (!object || !newFieldFormula.trim()) {
      setNewFieldFormulaValidation({ status: 'invalid', message: 'Enter a formula expression first.' });
      return false;
    }
    setNewFieldFormulaValidation({ status: 'checking', message: 'Checking formula…' });
    try {
      await apiRequest<{ valid: true }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/formulas/validate`, {
        method: 'POST',
        body: JSON.stringify({ expression: newFieldFormula.trim(), returnType: newFieldReturnType })
      });
      setNewFieldFormulaValidation({ status: 'valid', message: 'Formula syntax and field references are valid.' });
      return true;
    } catch (error) {
      setNewFieldFormulaValidation({
        status: 'invalid',
        message: error instanceof Error ? error.message : 'Unable to validate formula'
      });
      return false;
    }
  };

  const insertFormulaText = (snippet: string) => {
    const editor = formulaEditorRef.current;
    const start = editor?.selectionStart ?? newFieldFormula.length;
    const end = editor?.selectionEnd ?? start;
    const nextFormula = `${newFieldFormula.slice(0, start)}${snippet}${newFieldFormula.slice(end)}`;
    setNewFieldFormula(nextFormula);
    setNewFieldFormulaValidation({ status: 'idle', message: '' });
    window.requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const resetNewFieldDraft = () => {
    setNewFieldType('Text');
    setNewFieldStage(0);
    setNewFieldLabel('');
    setNewFieldTextLength(255);
    setNewFieldPrecision(18);
    setNewFieldScale(0);
    setNewFieldDescription('');
    setNewFieldHelpText('');
    setNewFieldDefaultValue('');
    setNewFieldHasDefault(false);
    setNewFieldFormula('');
    setNewFieldFormulaValidation({ status: 'idle', message: '' });
    setNewFieldPicklistValues('');
    setNewFieldPicklistRestricted(true);
    setNewFieldControllerApiName('');
    setNewFieldValueSettings({});
    setNewFieldRelationshipTarget('');
    setNewFieldRelationshipName('');
    setNewFieldChildRelationshipName('');
    setNewFieldDeleteBehavior('Clear');
    setNewFieldAllowReparenting(false);
    setNewFieldLookupFilters([]);
    setNewFieldLookupFilterLogic('All');
    setNewFieldRequired(false);
    setNewFieldUnique(false);
    setNewFieldExternalId(false);
    setNewFieldCaseSensitive(false);
    setNewFieldLayoutIds([]);
  };

  const newFieldApiName = `${newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}__c`;
  const newFieldPicklistOptions = newFieldPicklistValues.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const newFieldController = object.fields.find((field) => field.apiName === newFieldControllerApiName);
  const newFieldControllerValues = newFieldController?.dataType === 'Checkbox'
    ? ['true', 'false']
    : newFieldController?.picklistValues ?? [];
  const newFieldDefaultError = (() => {
    if (!newFieldHasDefault) return '';
    if (['Number', 'Currency', 'Percent'].includes(newFieldType)) {
      const value = Number(newFieldDefaultValue);
      const fraction = newFieldDefaultValue.split('.')[1] ?? '';
      if (!Number.isFinite(value) || fraction.length > newFieldScale || Math.abs(value) >= 10 ** (newFieldPrecision - newFieldScale)) {
        return 'The default value exceeds this field’s precision or scale.';
      }
    }
    if (newFieldType === 'Text' && newFieldDefaultValue.length > newFieldTextLength) return 'The default value exceeds the configured text length.';
    if (['Picklist', 'Multi-Select Picklist'].includes(newFieldType)) {
      const values = newFieldType === 'Multi-Select Picklist' ? newFieldDefaultValue.split(';') : [newFieldDefaultValue];
      if (values.some((value) => !newFieldPicklistOptions.includes(value))
        || (newFieldType === 'Multi-Select Picklist' && new Set(values).size !== values.length)) {
        return 'Choose distinct configured values for the default.';
      }
    }
    if (newFieldType === 'Email' && newFieldDefaultValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newFieldDefaultValue)) return 'Enter a valid email default.';
    if (newFieldType === 'URL' && newFieldDefaultValue) {
      try {
        if (!['http:', 'https:'].includes(new URL(newFieldDefaultValue).protocol)) return 'Enter a valid HTTP or HTTPS URL default.';
      } catch {
        return 'Enter a valid HTTP or HTTPS URL default.';
      }
    }
    if (newFieldType === 'Date' && newFieldDefaultValue) {
      const date = new Date(`${newFieldDefaultValue}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newFieldDefaultValue) || !Number.isFinite(date.getTime())
        || date.toISOString().slice(0, 10) !== newFieldDefaultValue) return 'Enter a valid date default.';
    }
    if (newFieldType === 'Date/Time' && newFieldDefaultValue
      && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.test(newFieldDefaultValue)
        || !Number.isFinite(Date.parse(newFieldDefaultValue)))) return 'Enter a valid date and time default.';
    return '';
  })();
  const newFieldConfigurationError = !newFieldLabel.trim()
    ? 'Enter a field label.'
    : !/^[A-Za-z][A-Za-z0-9_]*__c$/.test(newFieldApiName)
      ? 'The field label must produce a valid custom field name.'
      : object.fields.some((field) => field.apiName.toLocaleLowerCase() === newFieldApiName.toLocaleLowerCase())
        ? 'A field with this name already exists.'
        : newFieldType === 'Text' && (!Number.isInteger(newFieldTextLength) || newFieldTextLength < 1 || newFieldTextLength > 255)
          ? 'Text length must be between 1 and 255.'
          : ['Number', 'Currency', 'Percent'].includes(newFieldType)
            && (!Number.isInteger(newFieldPrecision) || newFieldPrecision < 1 || newFieldPrecision > 18
              || !Number.isInteger(newFieldScale) || newFieldScale < 0 || newFieldScale > newFieldPrecision)
              ? 'Precision must be 1–18 and scale must be between 0 and precision.'
              : newFieldType === 'Formula' && !newFieldFormula.trim()
                ? 'Enter a formula expression.'
                : ['Picklist', 'Multi-Select Picklist'].includes(newFieldType)
                  && (newFieldPicklistOptions.length === 0
                    || new Set(newFieldPicklistOptions.map((value) => value.toLocaleLowerCase())).size !== newFieldPicklistOptions.length)
                    ? 'Enter at least one unique picklist value.'
                    : newFieldType === 'Multi-Select Picklist' && newFieldPicklistOptions.some((value) => value.includes(';'))
                      ? 'Multi-select picklist values cannot contain semicolons.'
                      : Boolean(newFieldControllerApiName)
                        && (!newFieldController || !newFieldControllerValues.length)
                          ? 'Choose a controlling field with configured values.'
                          : ['Lookup Relationship', 'Master-Detail Relationship'].includes(newFieldType) && !newFieldRelationshipTarget
                            ? 'Select a related object.'
                            : ['Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType)
                              && !/^[A-Za-z][A-Za-z0-9_]*$/.test(newFieldRelationshipName.trim()
                                || newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, ''))
                              ? 'Enter a valid relationship name using letters, numbers, and underscores.'
                              : ['Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType)
                                && !/^[A-Za-z][A-Za-z0-9_]*$/.test(newFieldChildRelationshipName.trim()
                                  || `${object.apiName.replace(/__c$/, '')}Records`)
                                ? 'Enter a valid child relationship name using letters, numbers, and underscores.'
                            : newFieldLookupFilters.some((filter) =>
                              !filter.relatedFieldApiName
                              || (filter.operator !== 'Is Null' && filter.operator !== 'Is Not Null'
                                && filter.valueMode === 'Field' && !filter.valueFieldApiName))
                              ? 'Complete each lookup filter or remove it before continuing.'
                              : newFieldDefaultError;

  const addField = async () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    const apiName = newFieldApiName;
    const relationshipType = newFieldType === 'Lookup Relationship' ? 'Lookup'
      : newFieldType === 'Master-Detail Relationship' ? 'Master-Detail'
        : newFieldType === 'Hierarchical Relationship' ? 'Hierarchical' : undefined;
    const relationshipTarget = relationshipType === 'Hierarchical' ? 'User' : newFieldRelationshipTarget;
    const relationshipName = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const dataType = newFieldType === 'Formula'
      ? `Formula(${newFieldReturnType})`
      : relationshipType
        ? `${relationshipType === 'Hierarchical' ? 'Lookup' : relationshipType}(${relationshipTarget})`
        : newFieldType === 'Text' ? `Text(${newFieldTextLength})`
          : ['Number', 'Currency', 'Percent'].includes(newFieldType) ? `${newFieldType}(${newFieldPrecision}, ${newFieldScale})`
            : newFieldType;
    const field = {
      apiName,
      label,
      dataType,
      required: newFieldType === 'Master-Detail Relationship' || (newFieldType !== 'Formula' && newFieldRequired),
      unique: newFieldType !== 'Formula' && newFieldType !== 'Long Text Area' && newFieldType !== 'Geolocation' && !relationshipType && newFieldUnique,
      ...(newFieldExternalId ? { externalId: true } : {}),
      ...(newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType)
        ? { caseSensitive: newFieldCaseSensitive }
        : {}),
      ...(newFieldDescription.trim() ? { description: newFieldDescription.trim() } : {}),
      ...(newFieldHelpText.trim() ? { helpText: newFieldHelpText.trim() } : {}),
      ...(newFieldType === 'Formula' ? { formula: { expression: newFieldFormula.trim(), returnType: newFieldReturnType } } : {}),
      ...(['Picklist', 'Multi-Select Picklist'].includes(newFieldType) ? {
        picklistValues: newFieldPicklistOptions,
        picklistRestricted: newFieldPicklistRestricted,
        ...(newFieldControllerApiName ? {
          controllerFieldApiName: newFieldControllerApiName,
          valueSettings: newFieldValueSettings
        } : {})
      } : {}),
      ...(newFieldHasDefault ? {
        defaultValue: newFieldType === 'Checkbox'
          ? newFieldDefaultValue === 'true'
          : ['Number', 'Currency', 'Percent'].includes(newFieldType)
            ? Number(newFieldDefaultValue)
            : newFieldDefaultValue
      } : {}),
      ...(relationshipType ? { relationship: {
        type: relationshipType,
        targetObject: relationshipTarget,
        relationshipName: newFieldRelationshipName.trim() || relationshipName,
        childRelationshipName: newFieldChildRelationshipName.trim() || `${object.apiName.replace(/__c$/, '')}Records`,
        ...(relationshipType === 'Lookup' ? {
          deleteBehavior: newFieldRequired ? 'Restrict' : newFieldDeleteBehavior
        } : {}),
        ...(relationshipType === 'Master-Detail' ? { allowReparenting: newFieldAllowReparenting } : {})
      } } : {})
    };
    try {
      if (newFieldType === 'Formula' && !await validateNewFieldFormula()) return;
      const lookupFilters: RelatedLookupFilterMetadata[] = relationshipType
        ? newFieldLookupFilters.map((filter) => {
          const isNullOperator = filter.operator === 'Is Null' || filter.operator === 'Is Not Null';
          return {
            id: `lookup-filter-${crypto.randomUUID()}`,
            fieldApiName: apiName,
            relatedObject: relationshipTarget,
            relatedFieldApiName: filter.relatedFieldApiName,
            operator: filter.operator,
            value: filter.valueMode === 'Value' && !isNullOperator ? filter.value : '',
            ...(filter.valueMode === 'Field' && !isNullOperator && filter.valueFieldApiName
              ? { valueFieldApiName: filter.valueFieldApiName }
              : {}),
            required: filter.required
          };
        })
        : [];
      const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/fields`, {
        method: 'POST',
        headers: { 'If-Match': `"${object.revision ?? 0}"` },
        body: JSON.stringify({
          field,
          pageLayoutIds: newFieldLayoutIds,
          ...(lookupFilters.length ? { relatedLookupFilters: lookupFilters } : {}),
          ...(lookupFilters.length && newFieldLookupFilterLogic === 'Any'
            ? { relatedLookupFilterLogic: { [apiName]: newFieldLookupFilterLogic } }
            : {})
        })
      });
      setObject(payload.object);
      setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
      setShowNewField(false);
      resetNewFieldDraft();
      notify(`${label} field saved to ${object.label}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save field');
    }
  };

  const saveObject = async (nextObject: ObjectMetadata) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(nextObject.apiName)}`, {
      method: 'PUT',
      headers: { 'If-Match': `"${nextObject.revision ?? 0}"` },
      body: JSON.stringify(nextObject)
    });
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    notify(`${payload.object.label} configuration saved`);
  };

  const refreshObject = async (apiName: string) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(apiName)}`);
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    return payload.object;
  };

  const deleteObject = async (apiName: string) => {
    await apiRequest<void>(`/metadata/objects/${encodeURIComponent(apiName)}`, {
      method: 'DELETE', headers: { 'If-Match': `"${object.revision ?? 0}"` }
    });
    const remaining = objects.filter((item) => item.apiName !== apiName);
    setObjects(remaining);
    if (remaining[0]) setObject(remaining[0]);
    setObjectSetting('Details');
    if (route.kind === 'setup' && route.workspace === 'object-manager' && route.objectApiName === apiName && remaining[0]) {
      navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: remaining[0].apiName, setting: 'Details' });
    }
    notify('Custom object deleted');
  };

  const saveField = async (field: FieldMetadata) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/fields/${encodeURIComponent(field.apiName)}`, {
      method: 'PUT',
      headers: { 'If-Match': `"${object.revision ?? 0}"` },
      body: JSON.stringify(field)
    });
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    notify(`${field.label} field saved`);
    return payload.object;
  };

  const deleteField = async (apiName: string) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/fields/${encodeURIComponent(apiName)}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${object.revision ?? 0}"` }
    });
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    notify('Custom field deleted');
    return payload.object;
  };

  const createObject = async () => {
    const label = newObjectLabel.trim();
    const pluralLabel = newObjectPluralLabel.trim();
    if (!label || !pluralLabel) return;
    const objectName = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!objectName) {
      notify('Object label must contain at least one letter or number');
      return;
    }
    if (newObjectSettings.recordNameType === 'Auto Number' && !newObjectSettings.recordNameFormat.trim()) {
      notify('Enter a display format for the auto-number record name');
      return;
    }
    const apiName = `${objectName}__c`;
    const shouldLaunchTabWizard = launchCustomTabWizard;
    try {
      const payload = await apiRequest<{ object: ObjectMetadata }>('/metadata/objects', {
        method: 'POST',
        body: JSON.stringify({
          apiName, label, pluralLabel, kind: 'Custom Object',
          description: newObjectDescription.trim(),
          settings: newObjectSettings,
          fields: [{ apiName: 'Name', label: newObjectRecordNameLabel.trim() || `${label} Name`, dataType: newObjectSettings.recordNameType === 'Auto Number' ? 'AutoNumber' : 'Text(80)', required: true, unique: false }]
        })
      });
      setObjects((current) => [...current, payload.object]);
      setObject(payload.object);
      setObjectSetting('Details');
      navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: payload.object.apiName, setting: 'Details' });
      setShowNewObject(false);
      setNewObjectLabel('');
      setNewObjectPluralLabel('');
      setNewObjectDescription('');
      setNewObjectRecordNameLabel('');
      setLaunchCustomTabWizard(false);
      setNewObjectSettings({
        allowReports: true,
        allowActivities: false,
        trackFieldHistory: false,
        allowInChatter: false,
        deploymentStatus: 'In Development',
        recordNameType: 'Text',
        recordNameFormat: ''
      });
      if (shouldLaunchTabWizard) {
        setCustomTabObject(payload.object);
        setCustomTabStyle('Blue');
        setShowCustomTabWizard(true);
      }
      notify(`${label} object created`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to create object');
    }
  };

  const saveCustomTab = async () => {
    if (!customTabObject) return;
    try {
      await saveObject({ ...customTabObject, customTab: { style: customTabStyle } });
      setShowCustomTabWizard(false);
      setCustomTabObject(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save custom tab');
    }
  };

  const saveFlow = async (nextFlow: FlowDefinitionMetadata) => {
    try {
      const payload = await apiRequest<{ flow: FlowDefinitionMetadata }>(`/metadata/flows/${encodeURIComponent(nextFlow.apiName)}`, {
        method: 'PUT', body: JSON.stringify(nextFlow)
      });
      flowSnapshots.current.set(payload.flow.apiName, JSON.stringify(payload.flow));
      setFlow(payload.flow);
      flowHistory.current = { undo: [], redo: [] };
      setFlows((current) => current.some((item) => item.apiName === payload.flow.apiName)
        ? current.map((item) => item.apiName === payload.flow.apiName ? payload.flow : item)
        : [...current, payload.flow]);
      setFlowValidation(null);
      notify(nextFlow.status === 'Active' ? 'Flow activated; previous active version is now obsolete' : 'Flow saved as inactive draft');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save flow');
    }
  };

  const saveNamedCredential = async (credential: {
    id?: string; name: string; label: string; protocol: NamedCredentialMetadata['protocol']; baseUrl: string;
    authType: NamedCredentialMetadata['authType']; headerName?: string; configuration?: Record<string, string>; username?: string; secret?: string;
  }) => {
    const { id, ...body } = credential;
    const result = await apiRequest<{ credential: NamedCredentialMetadata }>(
      id ? `/named-credentials/${encodeURIComponent(id)}` : '/named-credentials',
      { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );
    setNamedCredentials((current) => current.some((item) => item.id === result.credential.id)
      ? current.map((item) => item.id === result.credential.id ? result.credential : item)
      : [...current, result.credential]);
    notify(`Named Credential ${id ? 'updated' : 'created'}`);
  };

  const toggleNamedCredentialEnabled = async (id: string, enabled: boolean) => {
    const result = await apiRequest<{ credential: NamedCredentialMetadata }>(
      `/named-credentials/${encodeURIComponent(id)}/enabled`,
      { method: 'PATCH', body: JSON.stringify({ enabled }) }
    );
    setNamedCredentials((current) => current.map((item) => item.id === result.credential.id ? result.credential : item));
    notify(enabled ? 'Connection enabled' : 'Connection disabled');
  };
  const grantConnectorLicence = async (appKey: string) => {
    await apiRequest(`/connector-apps/${encodeURIComponent(appKey)}/licence`, { method: 'POST', body: '{}' });
    notify('Connector licence granted or renewed');
  };

  const deleteNamedCredential = async (id: string) => {
    await apiRequest<void>(`/named-credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setNamedCredentials((current) => current.filter((item) => item.id !== id));
    notify('Named Credential deleted');
  };

  const authorizeNamedCredential = async (id: string): Promise<string> => {
    const result = await apiRequest<{ authorizationUrl: string }>(
      `/named-credentials/${encodeURIComponent(id)}/oauth/start`, { method: 'POST' }
    );
    return result.authorizationUrl;
  };

  const testNamedCredential = async (id: string): Promise<{ connected: boolean; status?: number; message: string }> => {
    return apiRequest<{ connected: boolean; status?: number; message: string }>(
      `/named-credentials/${encodeURIComponent(id)}/test`, { method: 'POST' }
    );
  };

  const rotateNamedCredential = async (id: string) => {
    const result = await apiRequest<{ credential: NamedCredentialMetadata }>(`/named-credentials/${encodeURIComponent(id)}/rotate`, { method: 'POST' });
    setNamedCredentials((current) => current.map((item) => item.id === id ? result.credential : item));
    notify('Named Credential encryption key rotated');
  };

  const saveEmailAlert = async (alert: {
    id?: string; name: string; label: string; objectApiName: string; namedCredentialId: string;
    fromEmail: string; recipients: string; subject: string; body: string;
  }) => {
    const { id, ...body } = alert;
    const result = await apiRequest<{ emailAlert: EmailAlertMetadata }>(
      id ? `/metadata/email-alerts/${encodeURIComponent(id)}` : '/metadata/email-alerts',
      { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );
    setEmailAlerts((current) => current.some((item) => item.id === result.emailAlert.id)
      ? current.map((item) => item.id === result.emailAlert.id ? result.emailAlert : item)
      : [...current, result.emailAlert]);
    notify(`Email Alert ${id ? 'updated' : 'created'}`);
  };

  const deleteEmailAlert = async (id: string) => {
    await apiRequest<void>(`/metadata/email-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setEmailAlerts((current) => current.filter((item) => item.id !== id));
    notify('Email Alert deleted');
  };

  const savePlatformEvent = async (platformEvent: PlatformEventMetadata) => {
    const result = await apiRequest<{ platformEvent: PlatformEventMetadata }>(
      `/metadata/platform-events/${encodeURIComponent(platformEvent.apiName)}`,
      { method: 'PUT', body: JSON.stringify(platformEvent) }
    );
    setPlatformEvents((current) => current.some((item) => item.apiName === result.platformEvent.apiName)
      ? current.map((item) => item.apiName === result.platformEvent.apiName ? result.platformEvent : item)
      : [...current, result.platformEvent]);
    notify(`Platform Event ${platformEvent.apiName} saved`);
  };

  const deletePlatformEvent = async (apiName: string) => {
    await apiRequest<void>(`/metadata/platform-events/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setPlatformEvents((current) => current.filter((item) => item.apiName !== apiName));
    notify('Platform Event deleted');
  };

  const saveApprovalProcess = async (process: ApprovalProcessInput) => {
    const result = await apiRequest<{ approvalProcess: ApprovalProcessMetadata }>(
      `/metadata/approval-processes/${encodeURIComponent(process.apiName)}`,
      { method: 'PUT', body: JSON.stringify(process) }
    );
    setApprovalProcesses((current) => current.some((item) => item.apiName === result.approvalProcess.apiName)
      ? current.map((item) => item.apiName === result.approvalProcess.apiName ? result.approvalProcess : item)
      : [...current, result.approvalProcess]);
    notify('Approval process saved');
  };

  const deleteApprovalProcess = async (apiName: string) => {
    await apiRequest<void>(`/metadata/approval-processes/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setApprovalProcesses((current) => current.filter((item) => item.apiName !== apiName));
    notify('Approval process deleted');
  };

  const validateFlow = async (nextFlow: FlowDefinitionMetadata) => {
    try {
      const result = await apiRequest<FlowValidationMetadata>(`/metadata/flows/${encodeURIComponent(nextFlow.apiName)}/validate`, {
        method: 'POST',
        body: JSON.stringify(nextFlow)
      });
      setFlowValidation(result);
      if (result.valid) notify(result.warnings.length ? 'Flow is valid with warnings' : 'Flow validation passed');
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to validate flow');
      return null;
    }
  };

  const openFlowDebug = () => {
    const savedSnapshot = flowSnapshots.current.get(flow.apiName);
    if (!savedSnapshot) {
      notify('Save the flow before debugging it');
      return;
    }
    let savedFlow: FlowDefinitionMetadata;
    try {
      savedFlow = JSON.parse(savedSnapshot) as FlowDefinitionMetadata;
    } catch {
      notify('The saved Flow version could not be read for debugging');
      return;
    }
    if (savedSnapshot !== JSON.stringify(flow)) {
      notify('Debug uses the most recently saved version; unsaved changes are not included.');
    }
    const inputs = Object.fromEntries(savedFlow.resources
      .filter((resource) => resource.availableForInput)
      .map((resource) => [resource.name, resource.value === undefined
        ? ''
        : typeof resource.value === 'string' ? resource.value : JSON.stringify(resource.value)]));
    if (savedFlow.flowType === 'Record-Triggered Flow') {
      inputs.$Record = JSON.stringify({
        Name: 'Example record',
        Id: 'TEST-RECORD'
      }, null, 2);
      inputs.$Prior = JSON.stringify({ Name: 'Previous record', Id: 'TEST-RECORD' }, null, 2);
      inputs.$Event = savedFlow.startConfig.trigger === 'deleted' ? 'deleted'
        : savedFlow.startConfig.trigger === 'updated' ? 'updated' : 'created';
      inputs.$IsClone = 'false';
    }
    setFlowDebug({ flow: savedFlow, mode: 'debug', inputs, error: '', running: false });
  };

  const parseFlowInputs = (flowDefinition: FlowDefinitionMetadata, rawInputs: Record<string, string>) => {
    const inputs: Record<string, unknown> = {};
    for (const resource of flowDefinition.resources.filter((item) => item.availableForInput)) {
      const rawValue = rawInputs[resource.name] ?? '';
      if (!rawValue.trim()) {
        if (['Text', 'String', 'Email', 'Phone', 'URL'].includes(resource.dataType)) inputs[resource.name] = '';
        continue;
      }
      const normalizedType = resource.dataType.toLocaleLowerCase();
      if (['number', 'currency', 'percent'].some((type) => normalizedType.startsWith(type))) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) throw new Error(`Enter a valid number for ${resource.label}.`);
        inputs[resource.name] = value;
      } else if (['boolean', 'checkbox'].includes(normalizedType)) {
        if (!['true', 'false'].includes(rawValue.toLocaleLowerCase())) {
          throw new Error(`Enter true or false for ${resource.label}.`);
        }
        inputs[resource.name] = rawValue.toLocaleLowerCase() === 'true';
      } else if (['Record', 'Record Collection'].includes(resource.type) || normalizedType === 'json') {
        try {
          inputs[resource.name] = JSON.parse(rawValue) as unknown;
        } catch {
          throw new Error(`Enter valid JSON for ${resource.label}.`);
        }
      } else if (normalizedType === 'multi-select picklist') {
        let values: unknown;
        try {
          values = JSON.parse(rawValue) as unknown;
        } catch {
          throw new Error(`Enter a JSON array of selected values for ${resource.label}.`);
        }
        if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
          throw new Error(`Enter a JSON array of text values for ${resource.label}.`);
        }
        inputs[resource.name] = values;
      } else if (normalizedType === 'date/time' || normalizedType === 'datetime') {
        const parsedDate = new Date(rawValue);
        if (!Number.isFinite(parsedDate.getTime())) throw new Error(`Enter a valid date and time for ${resource.label}.`);
        inputs[resource.name] = parsedDate.toISOString();
      } else {
        inputs[resource.name] = rawValue;
      }
    }
    return inputs;
  };

  const runFlowDebug = async () => {
    if (!flowDebug) return;
    try {
      const inputs = parseFlowInputs(flowDebug.flow, flowDebug.inputs);
      setFlowDebug((current) => current ? { ...current, error: '', running: true, result: undefined } : current);
      const recordTriggered = flowDebug.mode === 'debug' && flowDebug.flow.flowType === 'Record-Triggered Flow';
      let payload: Record<string, unknown> = inputs;
      if (recordTriggered) {
        let record: unknown;
        let prior: unknown;
        try {
          record = JSON.parse(flowDebug.inputs.$Record ?? '{}') as unknown;
          prior = flowDebug.inputs.$Event === 'created' || !flowDebug.inputs.$Prior?.trim()
            ? undefined : JSON.parse(flowDebug.inputs.$Prior) as unknown;
        } catch {
          throw new Error('Enter valid JSON for the current and prior record.');
        }
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error('Current record must be a JSON object.');
        }
        if (prior !== undefined && (!prior || typeof prior !== 'object' || Array.isArray(prior))) {
          throw new Error('Prior record must be a JSON object.');
        }
        const event = flowDebug.inputs.$Event || 'created';
        if (event !== 'created' && prior === undefined) throw new Error('Update/delete tests need prior record values.');
        payload = { record, ...(prior === undefined ? {} : { prior }),
          event, isClone: flowDebug.inputs.$IsClone === 'true' };
      }
      const result = await apiRequest<Record<string, unknown>>(
        `/flows/${encodeURIComponent(flowDebug.flow.apiName)}/${recordTriggered ? 'debug-record' : flowDebug.mode === 'debug' ? 'debug' : 'execute'}`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      if (flowDebug.mode === 'run') {
        const interviewId = typeof result.interviewId === 'string' ? result.interviewId : '';
        const screen = result.screen as FlowElementMetadata | undefined;
        if (interviewId && screen) {
          setFlowRun({
            interviewId, screen,
            values: { ...initialScreenValues(screen), ...(result.values as Record<string, unknown> | undefined) },
            outcomes: (result.outcomes as Array<{ name: string; label: string }> | undefined)
              ?? [{ name: 'Default', label: 'Next' }],
            canGoBack: false
          });
        } else {
          notify(`Flow completed${result.outputs && typeof result.outputs === 'object' && Object.keys(result.outputs).length
            ? ` · ${JSON.stringify(result.outputs)}` : ''}`);
        }
        if (interviewId && !screen) notify('Flow interview started and is waiting for an asynchronous stage or approval. View it under Pending Work.');
        setFlowDebug(null);
        return;
      }
      setFlowDebug((current) => current ? { ...current, result, running: false } : current);
    } catch (error) {
      const responseBody = error instanceof ApiRequestError
        && typeof error.responseBody === 'object' && error.responseBody !== null
        ? error.responseBody as Record<string, unknown>
        : undefined;
      setFlowDebug((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : 'Flow debug failed',
        result: responseBody && Array.isArray(responseBody.debugTrace) ? responseBody : undefined,
        running: false
      } : current);
    }
  };

  const runSavedFlowTests = async (definition: FlowDefinitionMetadata): Promise<Array<{
    id: string; label: string; passed: boolean; actualStatus: string; details: string
  }>> => {
    const saved = flowSnapshots.current.get(definition.apiName);
    if (!saved || saved !== JSON.stringify(definition)) {
      throw new Error('Save the Flow and its test cases before running them.');
    }
    const results: Array<{ id: string; label: string; passed: boolean; actualStatus: string; details: string }> = [];
    for (const test of definition.tests ?? []) {
      try {
        const isRecord = definition.flowType === 'Record-Triggered Flow';
        if (!isRecord && !['Autolaunched Flow', 'Screen Flow', 'Flow Orchestration'].includes(definition.flowType)) {
          throw new Error('This Flow type cannot be tested through a manual run.');
        }
        const payload = isRecord ? {
          event: test.event ?? 'created',
          record: test.record ?? {},
          ...(test.prior ? { prior: test.prior } : {}),
          isClone: test.isClone === true
        } : test.input ?? {};
        const endpoint = isRecord ? 'debug-record' : 'debug';
        const response = await apiRequest<Record<string, unknown>>(
          `/flows/${encodeURIComponent(definition.apiName)}/${endpoint}`,
          { method: 'POST', body: JSON.stringify(payload) }
        );
        const actualStatus = typeof response.status === 'string' ? response.status : 'completed';
        const wrongOutputs: string[] = [];
        const outputs = response.outputs && typeof response.outputs === 'object' && !Array.isArray(response.outputs)
          ? response.outputs as Record<string, unknown> : {};
        for (const [name, expected] of Object.entries(test.expectedOutputs ?? {})) {
          if (JSON.stringify(outputs[name]) !== JSON.stringify(expected)) wrongOutputs.push(name);
        }
        const passed = actualStatus === test.expectedStatus && wrongOutputs.length === 0;
        results.push({
          id: test.id, label: test.label, passed, actualStatus,
          details: passed ? 'Expected result matched'
            : `Expected ${test.expectedStatus}${wrongOutputs.length ? `; different outputs: ${wrongOutputs.join(', ')}` : ''}`
        });
      } catch (error) {
        results.push({
          id: test.id, label: test.label, passed: false, actualStatus: 'error',
          details: error instanceof Error ? error.message : 'Test could not execute'
        });
      }
    }
    return results;
  };

  const runFlow = async (apiName = flow.apiName, inputs: Record<string, unknown> = {}) => {
    const selectedFlow = flows.find((item) => item.apiName === apiName);
    if (!selectedFlow) {
      notify(`Flow "${apiName}" was not found`);
      return;
    }
    const savedSnapshot = flowSnapshots.current.get(apiName);
    if (!savedSnapshot) {
      notify('Save the flow before running it');
      return;
    }
    const hasUnsavedChanges = savedSnapshot !== JSON.stringify(selectedFlow);
    if (hasUnsavedChanges) notify('Running the most recently saved version; unsaved changes are not included.');
    const inputResources = selectedFlow.resources.filter((resource) => resource.availableForInput);
    if (inputResources.length && Object.keys(inputs).length === 0) {
      const defaultInputs = Object.fromEntries(inputResources.map((resource) => [resource.name, resource.value === undefined
        ? ''
        : typeof resource.value === 'string' ? resource.value : JSON.stringify(resource.value)]));
      setFlowDebug({ flow: selectedFlow, mode: 'run', inputs: { ...defaultInputs, ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])) }, error: '', running: false });
      return;
    }
    try {
      const result = await apiRequest<{ outputs?: Record<string, unknown>; interviewId?: string; screen?: FlowElementMetadata; outcomes?: Array<{ name: string; label: string }>; values?: Record<string, unknown> }>(`/flows/${encodeURIComponent(selectedFlow.apiName)}/execute`, {
        method: 'POST',
        body: JSON.stringify(inputs)
      });
      if (result.interviewId && result.screen) {
        setFlowRunnerError('');
        setFlowRun({ interviewId: result.interviewId, screen: result.screen, values: { ...initialScreenValues(result.screen), ...(result.values ?? {}) }, outcomes: result.outcomes ?? [{ name: 'Default', label: 'Next' }], canGoBack: false });
        return;
      }
      if (result.interviewId) {
        notify('Flow interview started. Approval stages and waiting work are visible in Pending Work.');
        return;
      }
      notify(`Flow completed${result.outputs && Object.keys(result.outputs).length ? ` · ${JSON.stringify(result.outputs)}` : ''}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to run flow');
    }
  };

  const submitFlowScreen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flowRun) return;
    setFlowRunnerSubmitting(true);
    try {
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const selectedOutcome = submitter instanceof HTMLButtonElement ? submitter.value : '';
      const result = await apiRequest<{ completed?: boolean; outputs?: Record<string, unknown>; interviewId?: string; screen?: FlowElementMetadata; outcomes?: Array<{ name: string; label: string }>; canGoBack?: boolean; values?: Record<string, unknown> }>(`/flow-interviews/${encodeURIComponent(flowRun.interviewId)}/next`, {
        method: 'POST',
        body: JSON.stringify({ values: flowRun.values, ...(selectedOutcome ? { outcome: selectedOutcome } : {}) })
      });
      if (result.interviewId && result.screen) {
        setFlowRunnerError('');
        setFlowRun({
          interviewId: result.interviewId,
          screen: result.screen,
          values: { ...initialScreenValues(result.screen), ...(result.values ?? {}) },
          outcomes: result.outcomes ?? [{ name: 'Default', label: 'Next' }],
          canGoBack: result.canGoBack === true
        });
        return;
      }
      setFlowRun(null);
      setFlowRunnerError('');
      notify(`Flow completed${result.outputs && Object.keys(result.outputs).length ? ` · ${JSON.stringify(result.outputs)}` : ''}`);
    } catch (error) {
      setFlowRunnerError(error instanceof Error ? error.message : 'Unable to continue flow');
      notify(error instanceof Error ? error.message : 'Unable to continue flow');
    } finally {
      setFlowRunnerSubmitting(false);
    }
  };

  const goBackFlowScreen = async () => {
    if (!flowRun || !flowRun.canGoBack) return;
    setFlowRunnerSubmitting(true);
    try {
      const result = await apiRequest<{ interviewId: string; screen: FlowElementMetadata; outcomes?: Array<{ name: string; label: string }>; canGoBack?: boolean; values?: Record<string, unknown> }>(
        `/flow-interviews/${encodeURIComponent(flowRun.interviewId)}/next`,
        { method: 'POST', body: JSON.stringify({ action: 'back' }) }
      );
      setFlowRun({
        interviewId: result.interviewId,
        screen: result.screen,
        values: { ...initialScreenValues(result.screen), ...(result.values ?? {}) },
        outcomes: result.outcomes ?? [{ name: 'Default', label: 'Next' }],
        canGoBack: result.canGoBack === true
      });
      setFlowRunnerError('');
    } catch (error) {
      setFlowRunnerError(error instanceof Error ? error.message : 'Unable to return to the previous screen');
      notify(error instanceof Error ? error.message : 'Unable to return to the previous screen');
    } finally {
      setFlowRunnerSubmitting(false);
    }
  };

  const createFlow = (label: string, flowType: FlowDefinitionMetadata['flowType']) => {
    const cleanLabel = label.trim();
    const apiName = cleanLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'New_Flow';
    if (flows.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      notify('A flow with this API name already exists');
      return;
    }
    const destination: AppRoute = { kind: 'setup', workspace: 'flow-builder', resourceApiName: apiName };
    if (!confirmFlowNavigation(destination)) return;
    const triggerObject = flowType === 'Platform Event-Triggered Flow'
      ? platformEvents[0]?.apiName ?? null
      : flowType === 'Record-Triggered Flow' || flowType === 'Schedule-Triggered Flow'
        ? objects.find((item) => item.apiName !== 'User')?.apiName ?? null
        : null;
    const startConfig: Record<string, unknown> = flowType === 'Schedule-Triggered Flow'
      ? { startDate: '', startTime: '', frequency: '', entryConditions: [] }
      : flowType === 'Platform Event-Triggered Flow'
        ? { entryConditions: [] }
        : flowType === 'Record-Triggered Flow'
          ? { trigger: 'created-or-updated', runWhen: 'after-save', entryConditions: [] }
          : {};
    const created: FlowDefinitionMetadata = {
      apiName,
      label: cleanLabel,
      flowType,
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      triggerObject,
      startConfig,
      elements: [{ id: 1, type: 'Start', label: `${flowType} Start`, config: { ...startConfig, ...(triggerObject ? { object: triggerObject } : {}) } }],
      connectors: [],
      resources: [],
      versions: []
    };
    setFlow(created);
    flowHistory.current = { undo: [], redo: [] };
    setFlows((current) => [...current, created]);
    setSelectedFlowId(1);
    setFlowValidation(null);
    navigateRoute(destination, true);
  };

  const cloneFlow = async (source: FlowDefinitionMetadata) => {
    if (!confirmDiscardFlowChanges()) return;
    const baseApiName = `${source.apiName}_Copy`;
    let apiName = baseApiName;
    let suffix = 2;
    while (flows.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      apiName = `${baseApiName}_${suffix}`;
      suffix += 1;
    }
    const cloned: FlowDefinitionMetadata = {
      ...structuredClone(source),
      apiName,
      label: `${source.label} Copy`,
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      versions: []
    };
    try {
      const result = await apiRequest<{ flow: FlowDefinitionMetadata }>(
        `/metadata/flows/${encodeURIComponent(apiName)}`,
        { method: 'PUT', body: JSON.stringify(cloned) }
      );
      flowSnapshots.current.set(result.flow.apiName, JSON.stringify(result.flow));
      setFlow(result.flow);
      setFlows((current) => [...current, result.flow]);
      flowHistory.current = { undo: [], redo: [] };
      setSelectedFlowId(result.flow.elements[0]?.id ?? 1);
      setFlowValidation(null);
      navigateRoute({ kind: 'setup', workspace: 'flow-builder', resourceApiName: result.flow.apiName }, true);
      notify('Flow cloned as a new draft');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to clone flow');
    }
  };

  const deactivateFlow = async (apiName: string) => {
    if (flow.apiName === apiName && !confirmDiscardFlowChanges()) return;
    try {
      const result = await apiRequest<{ flow: FlowDefinitionMetadata }>(
        `/metadata/flows/${encodeURIComponent(apiName)}/deactivate`,
        { method: 'POST' }
      );
      flowSnapshots.current.set(result.flow.apiName, JSON.stringify(result.flow));
      setFlows((current) => current.map((item) => item.apiName === apiName ? result.flow : item));
      if (flow.apiName === apiName) setFlow(result.flow);
      setFlowValidation(null);
      notify('Flow deactivated');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to deactivate flow');
    }
  };

  const deleteFlow = async (apiName: string) => {
    const candidate = flows.find((item) => item.apiName === apiName);
    if (!candidate || !window.confirm(`Delete flow "${candidate.label}"? This cannot be undone.`)) return;
    try {
      await apiRequest<void>(`/metadata/flows/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
      flowSnapshots.current.delete(apiName);
      const remaining = flows.filter((item) => item.apiName !== apiName);
      setFlows(remaining);
      if (flow.apiName === apiName) {
        const nextFlow = remaining[0] ?? defaultFlow;
        setFlow(nextFlow);
        flowHistory.current = { undo: [], redo: [] };
        setSelectedFlowId(nextFlow.elements[0]?.id ?? 1);
        setFlowValidation(null);
        navigateRoute(remaining.length
          ? { kind: 'setup', workspace: 'flow-builder', resourceApiName: nextFlow.apiName }
          : { kind: 'setup', workspace: 'flow-builder' }, true);
      }
      notify('Flow deleted');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to delete flow');
    }
  };

  const selectFlow = (apiName: string) => {
    const selectedFlow = flows.find((item) => item.apiName === apiName);
    if (!selectedFlow) return;
    const destination: AppRoute = { kind: 'setup', workspace: 'flow-builder', resourceApiName: selectedFlow.apiName };
    if (!confirmFlowNavigation(destination)) return;
    setFlow(selectedFlow);
    flowHistory.current = { undo: [], redo: [] };
    setSelectedFlowId(selectedFlow.elements[0]?.id ?? 1);
    setFlowValidation(null);
    navigateRoute(destination, true);
  };

  const restoreFlowVersion = (version: FlowDefinitionMetadata['versions'][number]) => {
    if (!confirmDiscardFlowChanges()) return;
    void saveFlow({
      ...flow,
      label: version.label ?? flow.label,
      description: version.description ?? flow.description,
      flowType: version.flowType ?? flow.flowType,
      triggerObject: version.triggerObject === undefined ? flow.triggerObject : version.triggerObject,
      startConfig: version.startConfig ?? flow.startConfig,
      elements: structuredClone(version.elements),
      connectors: structuredClone(version.connectors),
      resources: structuredClone(version.resources),
      status: 'Draft',
      activeVersion: null
    });
  };

  const exportFlow = () => {
    const exportBlob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(exportBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${flow.apiName}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  };

  const importFlow = async (file: File) => {
    if (!confirmDiscardFlowChanges()) return;
    try {
      const importedValue: unknown = JSON.parse(await file.text());
      if (typeof importedValue !== 'object' || importedValue === null || Array.isArray(importedValue)) {
        throw new Error('The selected file must contain a Flow JSON object.');
      }
      const imported = importedValue as Record<string, unknown>;
      const apiName = imported.apiName;
      if (typeof apiName !== 'string' || typeof imported.label !== 'string'
        || !Array.isArray(imported.elements) || !Array.isArray(imported.connectors)
        || !Array.isArray(imported.resources)) {
        throw new Error('The selected JSON does not contain a complete Flow definition.');
      }
      if (flows.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
        throw new Error(`A Flow named "${apiName}" already exists. Rename the API name in the JSON before importing.`);
      }
      const destination: AppRoute = {
        kind: 'setup',
        workspace: 'flow-builder',
        resourceApiName: apiName
      };
      if (!confirmFlowNavigation(destination)) return;
      const result = await apiRequest<{ flow: FlowDefinitionMetadata }>(
        `/metadata/flows/${encodeURIComponent(apiName)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...imported,
            status: 'Draft',
            versionNumber: 1,
            activeVersion: null,
            versions: []
          })
        }
      );
      flowSnapshots.current.set(result.flow.apiName, JSON.stringify(result.flow));
      setFlows((current) => [...current, result.flow]);
      setFlow(result.flow);
      flowHistory.current = { undo: [], redo: [] };
      setSelectedFlowId(result.flow.elements[0]?.id ?? 1);
      setFlowValidation(null);
      navigateRoute(destination, true);
      notify('Flow imported as a new draft');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to import Flow');
    }
  };

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

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const [result, approvalResult] = await Promise.all([
        apiRequest<{ notifications: CustomNotificationMetadata[]; unreadCount: number }>('/notifications'),
        apiRequest<{ requests: ApprovalRequestMetadata[] }>('/approvals/inbox')
      ]);
      setNotifications(result.notifications);
      setNotificationsUnreadCount(result.unreadCount);
      setApprovalRequests(approvalResult.requests);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to load notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const toggleNotifications = () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening) void loadNotifications();
  };

  const markNotificationRead = async (notification: CustomNotificationMetadata) => {
    if (notification.readAt) return;
    try {
      const result = await apiRequest<{ notification: CustomNotificationMetadata }>(
        `/notifications/${encodeURIComponent(notification.id)}/read`,
        { method: 'POST' }
      );
      setNotifications((current) => current.map((item) => item.id === notification.id ? result.notification : item));
      setNotificationsUnreadCount((current) => Math.max(0, current - 1));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to mark notification as read');
    }
  };

  const decideApproval = async (request: ApprovalRequestMetadata, decision: 'Approved' | 'Rejected') => {
    setApprovalBusyId(request.id);
    try {
      await apiRequest<{ request: ApprovalRequestMetadata }>(
        `/approvals/${encodeURIComponent(request.id)}/decision`,
        { method: 'POST', body: JSON.stringify({ decision }) }
      );
      setApprovalRequests((current) => current.filter((item) => item.groupId !== request.groupId));
      notify(`Approval request ${decision.toLowerCase()}`);
      void loadNotifications();
    } catch (error) {
      notify(error instanceof Error ? error.message : `Unable to ${decision.toLowerCase()} approval request`);
    } finally {
      setApprovalBusyId('');
    }
  };

  // Standalone presentation is a page metadata capability, not an app identity.
  // Only an active, route-matched page can opt into the edge-to-edge shell.
  const isStandaloneMetadataPage = (route.kind === 'app-page' || route.kind === 'app-home') && pages.some((candidate) =>
    candidate.status === 'Active' &&
    (route.kind === 'app-page' ? candidate.apiName === route.pageApiName && candidate.pageType === 'App Page'
      : candidate.pageType === 'Home Page' && (candidate.activationAssignments ?? []).some((assignment) =>
          assignment.appId === route.appId && (assignment.scope === 'App Default' || assignment.scope === 'App and Profile'))) &&
    isStandalonePagePresentation(candidate)
  );

  return (
    <div className={standalonePageMode || isStandaloneMetadataPage ? 'lightning standalone-page-mode' : route.kind === 'setup' && route.workspace === 'page-builder' && Boolean(route.resourceApiName) ? 'lightning page-builder-editing' : 'lightning'}>
      <header className="salesforce-header">
        <button type="button" className="brand brand-home-button" aria-label="Go to home" title="Home" onClick={() => openSetupWorkspace('home')}><img className="brand-logo" src={uneSolutionsLogoUrl} alt="UNE Solutions" /></button>
        <button type="button" className="header-home-link" onClick={() =>
          navigateRoute({ kind: 'app-home', appId: currentApp?.apiName ?? 'Records' })}>
          <Monitor size={16} />Home
        </button>
        <button type="button" disabled={!readableRecordObjects.length}
          className={route.kind === 'record-list' || route.kind === 'record-detail' ? 'header-records-link active' : 'header-records-link'}
          onClick={() => {
            const targetObject = route.kind === 'record-list' || route.kind === 'record-detail'
              ? route.objectApiName : readableRecordObjects[0]?.apiName;
            if (targetObject) navigateRoute({ kind: 'record-list', objectApiName: targetObject, appId: currentApp?.apiName ?? 'Records' });
          }}><Database size={16} />Records</button>
        <RecordObjectPicker objects={readableRecordObjects}
          selected={route.kind === 'record-list' || route.kind === 'record-detail' ? route.objectApiName : ''}
          onSelect={(apiName) => navigateRoute({ kind: 'record-list', objectApiName: apiName, appId: currentApp?.apiName ?? 'Records' })} />
        <div className="header-searches">
          <GlobalRecordSearch objects={readableRecordObjects}
            searchObject={(apiName, term) => apiRequest<{ records: RecordData[] }>(
              `/records/${encodeURIComponent(apiName)}?${new URLSearchParams({ search: term, limit: '5', offset: '0' })}`)}
            onSelect={(objectApiName, recordId) => navigateRoute({
              kind: 'record-detail', objectApiName, recordId, appId: currentApp?.apiName ?? 'Records'
            })} />
          {route.kind === 'record-list' && <label className="header-list-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label={`Search ${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? 'current object'} records`}
              placeholder={`Search ${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? 'records'}…`}
              value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} />
          </label>}
        </div>
        <div className="header-tools">
          <NavigationLoadTime routeKey={routeTiming.routeKey} startedAt={routeTiming.startedAt}
            ready={metadataLoaded && (route.kind !== 'setup' || route.workspace === 'home' || advancedMetadataLoaded)}
            kind={routeTiming.kind} authMs={routeTiming.authMs} />
          <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
          
          <ConnectionHealthIndicator />
          <div className="notification-center" ref={notificationRef}>
            <button className="icon-button notification-button" aria-label={`Notifications${notificationsUnreadCount ? `, ${notificationsUnreadCount} unread` : ''}`} aria-expanded={notificationsOpen} aria-controls="notification-panel" onClick={toggleNotifications}>
              <Bell size={17} />{notificationsUnreadCount > 0 && <span className="notification-count">{notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}</span>}
            </button>
            {notificationsOpen && <section className="notification-panel" id="notification-panel" aria-label="Notifications">
              <div className="notification-panel-heading"><strong>Notifications</strong><button type="button" className="text-action" onClick={() => void loadNotifications()}>Refresh</button></div>
              {notificationsLoading ? <p className="empty-list">Loading notifications…</p> : <>
                {approvalRequests.length > 0 && <section className="notification-approvals" aria-label="Approval requests">
                  <h3>Approval Requests</h3>
                  <ul className="notification-list">{approvalRequests.map((request) => <li key={request.id}>
                    <strong>{request.objectLabel}: {request.recordName}</strong>
                    <p>Submitted by {request.submittedByName}{request.comments ? ` · ${request.comments}` : ''}</p>
                    <small>{new Date(request.createdAt).toLocaleString()}</small>
                    <div className="toolbar-actions">
                      <button type="button" className="btn btn-brand" disabled={approvalBusyId === request.id} onClick={() => void decideApproval(request, 'Approved')}>Approve</button>
                      <button type="button" className="btn" disabled={approvalBusyId === request.id} onClick={() => void decideApproval(request, 'Rejected')}>Reject</button>
                    </div>
                  </li>)}</ul>
                </section>}
                {notifications.length
                ? <ul className="notification-list">{notifications.map((notification) => <li key={notification.id} className={notification.readAt ? '' : 'unread'}>
                  <strong>{notification.title}</strong><p>{notification.body}</p>
                  <small>{new Date(notification.createdAt).toLocaleString()} · {notification.flowApiName}</small>
                  {!notification.readAt && <button type="button" className="text-action" onClick={() => void markNotificationRead(notification)}>Mark as read</button>}
                </li>)}</ul>
                : approvalRequests.length ? null : <p className="empty-list">You’re all caught up.</p>}
              </>}
            </section>}
          </div>
          <ProfilePasswordMenu onLogout={logout} onPasswordChanged={onLogout} />
        </div>
      </header>

      {route.kind !== 'setup' && <div className="app-strip" ref={appUtilityRef} style={{ '--brand': currentApp?.brandColor ?? '#0176d3' } as React.CSSProperties}>
        {currentApp?.apiName !== 'Records' && <div className="app-title">
          <span className="app-icon"><Database size={18} /></span>
          {apps.length > 1
            ? <select className="app-title-switcher" aria-label="Switch app" value={currentApp?.apiName ?? ''}
                onChange={(event) => navigateRoute({ kind: 'app-home', appId: event.target.value })}>
                {apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
              </select>
            : <strong className="app-current-label">{currentApp?.label ?? 'Records'}</strong>}
        </div>}
        <nav className="primary-tabs" aria-label="Workspace navigation">
          {currentAppNavigation.filter((entry) => entry.type === 'App Page').map((entry) => {
            const apiName = entry.apiName;
            const appPage = pages.find((item) => item.apiName === apiName && item.pageType === 'App Page' && item.status === 'Active');
            if (!appPage) return null;
            return <button className={route.kind === 'app-page' && route.pageApiName === apiName ? 'primary-tab active' : 'primary-tab'}
              key={apiName} onClick={() => navigateRoute({ kind: 'app-page', appId: currentApp?.apiName ?? '', pageApiName: apiName })}><Monitor className="rail-icon" size={17} />{appPage.label}</button>;
          })}

        </nav>
        {currentApp?.utilityItems.map((utility) => <button className="app-utility-button" key={utility}
          aria-expanded={activeUtility === utility} onClick={() => setActiveUtility((current) => current === utility ? null : utility)}>{utility}</button>)}
        {canManageApps && <button className="app-strip-menu" type="button" title="Open App Manager" aria-label="Open App Manager"
          onClick={() => openSetupWorkspace('app-manager')}><MoreHorizontal size={19} /></button>}
        {activeUtility && <section className="app-utility-popover" aria-label={`${activeUtility} utility`}>
          <div className="app-utility-heading"><strong>{activeUtility}</strong><button className="icon-button" aria-label={`Close ${activeUtility}`} onClick={() => setActiveUtility(null)}><X size={14} /></button></div>
          {activeUtility === 'Notes'
            ? <textarea aria-label="App notes" placeholder="Write a note for this app session…" value={utilityNotes[currentApp?.apiName ?? ''] ?? ''}
              onChange={(event) => setUtilityNotes((current) => ({ ...current, [currentApp?.apiName ?? '']: event.target.value }))} />
            : <div className="app-utility-history">{recentRoutes.length
              ? recentRoutes.map((item) => <button key={item.key} onClick={() => { navigateRoute(item.route); setActiveUtility(null); }}>{item.label}</button>)
              : <p>No recent items.</p>}</div>}
        </section>}
      </div>

      }

      <main className={route.kind === 'setup' ? 'setup-layout setup-no-tabs' : 'setup-layout'}>
        {route.kind === 'setup' && !route.dashboardView && workspace !== 'flow-builder' && !(workspace === 'page-builder' && Boolean(route.resourceApiName)) && (
          <aside className={setupSidebarCollapsed ? 'setup-sidebar setup-sidebar-collapsed' : 'setup-sidebar'}>
            <div className="setup-sidebar-toolbar">
              <strong>Setup</strong>
              <button type="button" className="setup-sidebar-toggle" aria-label={setupSidebarCollapsed ? 'Expand Setup menu' : 'Collapse Setup menu'} aria-expanded={!setupSidebarCollapsed} onClick={() => setSetupSidebarCollapsed((collapsed) => !collapsed)}>
                {setupSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>
            <div className="quick-find">
              <div className="quick-find-title">Quick Find</div>
              <div className="quick-find-input">
                <Search size={14} />
                <input value={quickFind} onChange={(event) => setQuickFind(event.target.value)} placeholder="Quick Find" aria-label="Quick Find" />
                {quickFind && <button onClick={() => setQuickFind('')} aria-label="Clear search"><X size={13} /></button>}
              </div>
            </div>
            <div className="setup-tree">
              {filteredSetupGroups.map((group) => (
                <div className="setup-tree-group" key={group.group}>
                  <div className="tree-group-label">{group.group}</div>
                  {group.items.map((item) => (
                    <React.Fragment key={item}>
                      <button
                        className={((workspace === 'object-manager' && item === 'Object Manager')
                          || (workspace === 'page-builder' && item === 'Lightning App Builder')
                          || (workspace === 'app-manager' && item === 'App Manager')
                          || (workspace === 'component-library' && item === 'Component Library')
                          || (workspace === 'app-exchange' && item === 'AppExchange')
                          || (workspace === 'named-credentials' && item === 'Named Credentials')
                          || (workspace === 'connector-settings' && item === 'Une Connectors')
                          || (workspace === 'flow-interviews' && item === 'Paused and Waiting Interviews')
                          || (workspace === 'scheduled-flows' && item === 'Scheduled Flows')
                          || (workspace === 'flow-logs' && item === 'Failed Flow Logs')) ? 'tree-item selected' : 'tree-item'}
                        aria-label={`Open ${item}`}
                        title={item}
                        data-short-label={item.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')}
                        onClick={() => navigateSetupItem(item)}
                      >
                        <span>{item}</span>
                        <ChevronRight size={13} />
                      </button>

                    </React.Fragment>
                  ))}
                </div>
              ))}
              {filteredSetupGroups.length === 0 && <div className="empty-tree">No setup items found</div>}
            </div>
            <div className="sidebar-footer"><span className="online-dot" /> Setup menu</div>
          </aside>
        )}

        <section className={`workspace ${route.kind !== 'setup' ? 'workspace-records' : ''} ${workspace === 'flow-builder' ? 'workspace-flow' : ''}`}>
          {(route.kind === 'record-list' || route.kind === 'record-detail') && <RecordWorkspace route={route} objects={objects} apps={apps} pages={pages}
            availableFlows={flows.filter(item => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            onLaunchFlow={(apiName: string, inputs?: Record<string, unknown>) => void runFlow(apiName, inputs)}
            reports={reports} metadataLoaded={metadataLoaded} profileId={currentProfileId} canManageUserIdentities={canManageUserIdentities} userRoles={accessControl.roles}
            fieldAccess={currentFieldAccess} recordTypeAccess={currentRecordTypeAccess} libraryComponents={libraryComponents} headerSearch={recordSearch} onNavigate={navigateRoute} />}
          {route.kind === 'route-alias' && <section className="setup-card" role="status">
            {routeAliasError ? <p role="alert">{routeAliasError}</p> : <p>Resolving route alias…</p>}
          </section>}
          {route.kind === 'app-home' && <LightningAppRuntime appId={route.appId} objects={objects} apps={apps} pages={pages} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName: string, inputs: Record<string, unknown>) => void runFlow(apiName, inputs)} onStandaloneModeChange={setStandalonePageMode} />}
          {route.kind === 'app-page' && <LightningAppRuntime appId={route.appId} pageApiName={route.pageApiName} objects={objects} apps={apps} pages={pages} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName: string, inputs: Record<string, unknown>) => void runFlow(apiName, inputs)} onStandaloneModeChange={setStandalonePageMode} />}
          {route.kind === 'setup' && workspace === 'home' && (
            <SetupHome onNavigate={openSetupWorkspace} />
          )}
          {route.kind === 'setup' && workspace === 'object-manager' && (
            <PlatformWorkspaceSurface workspace="object-manager" permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} >
            <ObjectManager
              object={object}
              objects={objects}
              flows={flows}
              pages={pages}
              reports={reports}
              dashboards={dashboards}
              profiles={accessControlError ? [] : accessControl.profiles}
              activationAppIds={activationAppIds}
              selectedSetting={objectSetting}
              search={objectSearch}
              onSearch={setObjectSearch}
              onObjectSelect={(nextObject: ObjectMetadata) => navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: nextObject.apiName, setting: 'Fields & Relationships' })}
              onSettingSelect={(setting: string) => navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: object.apiName, setting: setting === 'Objects' ? 'Details' : setting })}
              onOpenDependency={(target: { setting?: string; objectApiName?: string; workspace?: 'flow-builder' | 'page-builder' | 'report-builder' | 'dashboard-builder'; resourceApiName?: string }) => {
                if (target.workspace === 'page-builder' && target.resourceApiName) {
                  const selectedPage = pages.find((candidate) => candidate.apiName === target.resourceApiName);
                  if (selectedPage) setPage(selectedPage);
                }
                navigateRoute(target.workspace
                  ? { kind: 'setup', workspace: target.workspace, resourceApiName: target.resourceApiName }
                  : { kind: 'setup', workspace: 'object-manager', objectApiName: target.objectApiName ?? object.apiName, setting: target.setting ?? 'Fields & Relationships' });
              }}
              onNewField={() => { resetNewFieldDraft(); setNewFieldLayoutIds(object.pageLayouts?.map((layout) => layout.id) ?? []); setShowNewField(true); }}
              onCreateObject={() => setShowNewObject(true)}
              onSaveObject={saveObject}
              onRefreshObject={refreshObject}
              onDeleteObject={deleteObject}
              onSaveField={saveField}
              onDeleteField={deleteField}
              onSavePage={savePage}
              onOpenPageBuilder={() => openPageForObject(object.apiName)}
              onOpenRecords={() => navigateRoute({ kind: 'record-list', objectApiName: object.apiName })}
              page={pages.find((item) => item.targetObject === object.apiName && item.pageType === 'Record Page') ?? page}
              onNotify={notify}
            />
            </PlatformWorkspaceSurface>
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && advancedMetadataLoaded && route.resourceApiName && !pages.some((item) => item.apiName === route.resourceApiName) && (
            <section className="setup-card" role="alert" style={{ padding: 24 }}>
              <h2>{metadataLoadError ? "Unable to load Lightning pages" : "Lightning page not found"}</h2>
              <p>{metadataLoadError ? `Metadata API error: ${metadataLoadError}` : `The page "${route.resourceApiName}" was not returned by the metadata API. No other page has been substituted.`}</p>
              <p>Check that the page exists in this tenant and that your account can access it.</p>
              <button className="btn" onClick={() => navigateRoute({ kind: 'setup', workspace: 'page-builder' })}>Open saved pages</button>
            </section>
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && (!route.resourceApiName || (advancedMetadataLoaded && pages.some((item) => item.apiName === route.resourceApiName))) && <PageBuilder key={route.resourceApiName ?? 'page-list'} editorMode={Boolean(route.resourceApiName)} onBackToPages={() => { setPage(pages.find(item => item.apiName === page.apiName) ?? page); navigateRoute({ kind: 'setup', workspace: 'page-builder' }); }} page={page} pages={pages}
            preparedAppId={pageCreationAppContext[page.apiName] ?? ''}
            dashboards={dashboards}
            onPrepareApp={(pageApiName: string, appId: string) => setPageCreationAppContext(current => ({
              ...current, [pageApiName]: appId
            }))}
            onAppLinked={(pageApiName: string) => setPageCreationAppContext(current => {
              const next = { ...current };
              delete next[pageApiName];
              return next;
            })} objects={objects} apps={apps} profiles={accessControl.profiles} reports={reports} libraryComponents={libraryComponents} flows={flows} onChange={changePage} onSelectPage={(apiName: string) => { const selected = pages.find((item) => item.apiName === apiName); if (selected) { setPage(selected); navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: selected.apiName }); } }} onTargetObjectChange={openPageForObject} onLaunchFlow={(apiName: string, inputs: Record<string, unknown>) => void runFlow(apiName, inputs)} onSave={savePageFromBuilder} onSaveApp={saveApp} onDeleteApp={deleteApp} request={apiRequest} canManageRoutes={canManageApps} onExit={() => { setPage(pages.find((item) => item.apiName === route.resourceApiName) ?? pages[0] ?? defaultLightningPage); pageRouteApiName.current = ''; navigateRoute({ kind: 'setup', workspace: 'home' }); }} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'app-manager' && <PlatformWorkspaceSurface workspace="app-manager" permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppManager apps={apps} objects={objects} pages={pages} onSave={saveApp} onDelete={deleteApp} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'dashboard-builder' && <DashboardBuilder
            dashboards={dashboards}
            dashboardFolders={dashboardFolders}
            objects={objects}
            libraryComponents={libraryComponents}
            reports={reports}
            smtpCredentials={namedCredentials.filter((credential) => credential.protocol === 'SMTP')}
            canSchedule={canScheduleDashboards}
            shareUsers={accessControlError ? [] : accessControl.users.filter((user) => user.id !== dashboardUserId)}
            shareGroups={accessControlError ? [] : accessControl.permissionSetGroups}
            folderPublicGroups={accessControlError ? [] : accessControl.publicGroups}
            folderRoles={accessControlError ? [] : accessControl.roles}
            folderPermissionSetGroups={accessControlError ? [] : accessControl.permissionSetGroups}
            dashboardTerritories={dashboardTerritories}
            canManageTerritories={canManageDashboardTerritories}
            subscriptionUsers={accessControlError ? [] : accessControl.users}
            runningUserIds={dashboardRunningUserIds}
            userId={dashboardUserId}
            canCreate={canCreateDashboards}
            canManageAll={canManageDashboards}
            viewerMode={route.kind === 'setup' && route.dashboardView === true}
            selectedApiName={route.kind === 'setup' ? route.resourceApiName : undefined}
            onSelect={selectDashboard}
            onOpenViewer={openDashboardViewer}
            onExitViewer={exitDashboardViewer}
            onLoadRecords={loadDashboardRecords}
            onRunReport={runReport}
            onLoadSnapshots={loadDashboardSnapshots}
            onCreateSnapshot={createDashboardSnapshot}
            onDeleteSnapshot={deleteDashboardSnapshot}
            onLoadSubscriptions={loadDashboardSubscriptions}
            onSaveSubscription={saveDashboardSubscription}
            onDeleteSubscription={deleteDashboardSubscription}
            onRunSubscription={runDashboardSubscription}
            onSave={saveDashboard}
            onDelete={deleteDashboard}
            onSaveFolder={saveDashboardFolder}
            onDeleteFolder={deleteDashboardFolder}
            onSaveTerritories={saveDashboardTerritories}
            onNotify={notify}
          />}
          {route.kind === 'setup' && workspace === 'component-library' && <ComponentLibrary components={libraryComponents} canManage={canManageLibrary} onSave={saveLibraryComponent} onDelete={deleteLibraryComponent} onPublish={publishLibraryComponent} onRollback={rollbackLibraryComponent} />}
          {route.kind === 'setup' && workspace === 'approval-processes' && <ApprovalProcessManager
            processes={approvalProcesses}
            objects={objects}
            users={accessControlError ? [] : accessControl.users}
            canManage={canManageApprovalProcesses}
            onSave={saveApprovalProcess}
            onDelete={deleteApprovalProcess}
            onNotify={notify}
          />}
          {route.kind === 'setup' && workspace === 'named-credentials' && <NamedCredentials
            credentials={namedCredentials}
            canManage={canManageNamedCredentials}
            encryptionReady={namedCredentialsEncryptionReady}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
            onOAuthAuthorize={authorizeNamedCredential}
            onToggleEnabled={toggleNamedCredentialEnabled}
          />}
          {route.kind === 'setup' && workspace === 'app-exchange' && <PlatformWorkspaceSurface workspace="app-exchange" permitted={connectorRights.view} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppExchange
            credentials={namedCredentials}
            flows={flows.map(({apiName,label,status,elements}) => ({
              apiName, label, status,
              elements: elements.map((element) => ({type:element.type,config:element.config as Record<string,unknown>}))
            }))}
            canManageFlows={canManageFlows}
            canManageCredentials={connectorRights.edit}
            canView={connectorRights.view}
            canManageSecrets={connectorRights.secrets}
            canTest={connectorRights.test}
            canInstall={connectorRights.install}
            canLicenceAdmin={connectorRights.licence}
            encryptionReady={namedCredentialsEncryptionReady}
            onGrantLicence={grantConnectorLicence}
            loadApps={loadConnectorMarketplaceApps}
            executeLifecycleFlow={executeConnectorAppLifecycleFlow}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
            onOAuthAuthorize={authorizeNamedCredential}
            loadHistory={loadAppCommunicationHistory}
            onOpenFlow={selectFlow}
            onOpenRecord={(objectName,id) => navigateRoute({kind:'record-detail', objectApiName:objectName, recordId:id})}
          /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'connector-settings' && (() => {
            const provider = connectorProviders.find((item) => item.connectorKey === route.resourceApiName) ?? connectorProviders[0];
            return provider ? <ConnectorSettingsWorkspace
              key={provider.connectorKey}
              provider={provider}
              providers={connectorProviders}
              integrationConnections={integrationConnections}
              onSelect={(connectorKey: string) => navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: connectorKey })}
              onSaveProvider={saveConnectorProvider}
              onSaveIntegrationConnection={saveIntegrationConnection}
              onTestIntegrationConnection={testIntegrationConnection}
              canManage={connectorRights.edit}
              onNotify={notify}
            /> : <div className="connector-settings-page"><div className="surface connector-empty">Connector metadata is loading…</div></div>;
          })()}
          {route.kind === 'setup' && workspace === 'report-builder' && <ReportBuilder reports={reports} reportFolders={reportFolders} canManageReportFolders={canManageReportFolders} accessControl={accessControl} objects={objects} onSave={saveReport} onSaveFolder={saveReportFolder} onDelete={deleteReport} onRun={runReport} onPreview={previewReport} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'scheduled-flows' && (
            <ScheduledFlows flows={flows} objects={objects} loading={!metadataLoaded} onEdit={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'flow-interviews' && (
            <FlowInterviews
              interviews={flowInterviews}
              loading={flowInterviewsLoading}
              canManage={canManageFlows}
              onRefresh={() => void refreshFlowInterviews()}
              onCancel={(interview) => void cancelFlowInterview(interview)}
              onOpenFlow={selectFlow}
            />
          )}
          {route.kind === 'setup' && workspace === 'flow-logs' && (
            <FlowLogs logs={flowLogs} loading={flowLogsLoading} onOpenFlow={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'automation-settings' && <AutomationSettingsWorkspace canManage={canManageFlows} />}
          {route.kind === 'setup' && workspace === 'flow-builder' && (
            <FlowBuilderWorkspace
              landing={!route.resourceApiName}
              flow={flow}
              flows={flows}
              onListFlows={fetchFlowListPage}
              libraryComponents={libraryComponents}
              platformEvents={platformEvents}
              objects={objects}
              users={accessControl.users}
              approvalProcesses={approvalProcesses}
              namedCredentials={namedCredentials}
              emailAlerts={emailAlerts}
              connectorProviders={connectorProviders}
              integrationConnections={integrationConnections}
              validation={flowValidation}
              isDirty={flowHasUnsavedChanges()}
              canRunFlows={canRunFlows}
              selectedId={selectedFlowId}
              toolTab={flowToolTab}
              canUndo={flowHistory.current.undo.length > 0}
              canRedo={flowHistory.current.redo.length > 0}
              onExit={() => openSetupWorkspace('home')}
              onFlowChange={commitFlow}
              onSelectFlow={selectFlow}
              onRestoreFlowVersion={restoreFlowVersion}
              onExportFlow={exportFlow}
              onImportFlow={(file) => void importFlow(file)}
              onCloneFlow={(candidate) => void cloneFlow(candidate)}
              onDeactivateFlow={(apiName) => void deactivateFlow(apiName)}
              onDeleteFlow={(apiName) => void deleteFlow(apiName)}
              onCreateFlow={createFlow}
              onUndo={undoFlow}
              onRedo={redoFlow}
              onSelect={setSelectedFlowId}
              onToolTab={setFlowToolTab}
              onAdd={addFlowElement}
              onUpdateLabel={updateFlowLabel}
              onUpdateConfig={updateFlowConfig}
              onRemove={removeFlowElement}
              onValidate={() => void validateFlow(flow)}
              onSave={() => void saveFlow({ ...flow, status: 'Draft' })}
              onActivate={() => void saveFlow({ ...flow, status: 'Active' })}
              onRun={() => void runFlow()}
              onDebug={openFlowDebug}
              onRunTests={runSavedFlowTests}
              onSaveNamedCredential={saveNamedCredential}
              onDeleteNamedCredential={deleteNamedCredential}
              onRotateNamedCredential={rotateNamedCredential}
              onSaveEmailAlert={saveEmailAlert}
              onDeleteEmailAlert={deleteEmailAlert}
              onSavePlatformEvent={savePlatformEvent}
              onDeletePlatformEvent={deletePlatformEvent}
              onNotify={notify}
            />
          )}
          {route.kind === 'setup' && workspace === 'company-settings' && <PlatformWorkspaceSurface workspace="company-settings" permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} ><><CompanySettings canManage={canManageUserIdentities} /><TenantDomains request={apiRequest} permitted={canManageUserIdentities} /><DeveloperAccountSettings request={apiRequest} permitted={canManageUserIdentities} /><TenantUsagePanel request={apiRequest} permitted={canManageUserIdentities} /><TenantRecoveryPanel request={apiRequest} operator={false} permitted={canManageUserIdentities} /><TenantMfaSettings onReauthenticate={onLogout} canManage={canManageUserIdentities} /><TenantEmailRecoverySettings canManage={canManageUserIdentities} /><TenantUserLockSettings /><AccountSessionSecurity onReauthenticate={onLogout} /><TenantSecurityAudit /></></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'tenant-management' && <PlatformWorkspaceSurface workspace="tenant-management" pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} permitted={canManagePlatformTenants}><TenantManagement request={apiRequest} permitted={canManagePlatformTenants} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'rbac' && <PlatformWorkspaceSurface workspace="rbac" permitted={canReadSecurity} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><Permissions
            accessControl={accessControl}
            accessControlError={accessControlError}
            objects={objects}
            routeResourceApiName={route.resourceApiName}
            routeResourceId={route.resourceId}
            onRouteResourceChange={(resourceApiName: string, resourceId: string) => navigateRoute({
              kind: 'setup', workspace: 'rbac', resourceApiName, ...(resourceId ? { resourceId } : {})
            })}
            onSave={saveAccessControl}
            onNotify={notify}
            onOpenUserRecords={() => navigateRoute({kind:'record-list',objectApiName:'User'})}
          /></PlatformWorkspaceSurface>}
        </section>
      </main>

      {showNewField && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { resetNewFieldDraft(); setShowNewField(false); } }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-field-title">
            <div className="modal-header"><h2 id="new-field-title">New Field</h2><button className="icon-button dark" onClick={() => { resetNewFieldDraft(); setShowNewField(false); }} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Create a field on {object.label}. Formula and relationship definitions are stored as object metadata.</p>
            <div className="wizard-progress" aria-label="New field steps">
              {(['Select Type', 'Configure', 'Page Layouts', 'Review'] as const).map((step, index) => <span key={step} className={newFieldStage === index ? 'active' : newFieldStage > index ? 'complete' : ''}>{index + 1}. {step}</span>)}
            </div>
            {newFieldStage === 0 && <div>
              <label className="form-label" htmlFor="new-field-type">Data Type</label>
              <select className="form-control" id="new-field-type" value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)}>
              {['Text', 'Long Text Area', 'Number', 'Currency', 'Percent', 'Date', 'Date/Time', 'Checkbox', 'Email', 'Phone', 'URL', 'Geolocation', 'Picklist', 'Multi-Select Picklist', 'Formula', 'Lookup Relationship', 'Master-Detail Relationship', ...(object.apiName === 'User' ? ['Hierarchical Relationship'] : [])].map((type) => <option key={type}>{type}</option>)}
              </select>
              <p className="permission-help">External Lookup and Indirect Lookup require external objects, which are not supported for this object. Hierarchical Relationship is available for User.</p>
            </div>}
            {newFieldStage === 1 && <div>
            <label className="form-label" htmlFor="new-field-label">Field Label</label>
            <input className="form-control" id="new-field-label" value={newFieldLabel} onChange={(event) => setNewFieldLabel(event.target.value)} placeholder="Enter a field label" autoFocus />
            <label className="form-label">Field Name<div className="form-display">{newFieldApiName || 'Enter a field label to generate the API name'}</div></label>
            {newFieldType === 'Text' && <label className="form-label" htmlFor="new-field-text-length">Length<input className="form-control" id="new-field-text-length" type="number" min={1} max={255} step={1} value={newFieldTextLength} onChange={(event) => setNewFieldTextLength(Number(event.target.value))} /></label>}
            {['Number', 'Currency', 'Percent'].includes(newFieldType) && <div className="form-options">
              <label className="form-label">Length (Precision)<input className="form-control" type="number" min={1} max={18} step={1} value={newFieldPrecision} onChange={(event) => {
                const precision = Number(event.target.value);
                setNewFieldPrecision(precision);
                setNewFieldScale((scale) => Math.min(scale, precision));
              }} /></label>
              <label className="form-label">Decimal Places (Scale)<input className="form-control" type="number" min={0} max={newFieldPrecision} step={1} value={newFieldScale} onChange={(event) => setNewFieldScale(Number(event.target.value))} /></label>
            </div>}
            {['Picklist', 'Multi-Select Picklist'].includes(newFieldType) && <>
              <label className="form-label" htmlFor="new-field-picklist-values">Picklist Values</label>
              <textarea className="form-control" id="new-field-picklist-values" value={newFieldPicklistValues} onChange={(event) => {
                const values = event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                setNewFieldPicklistValues(event.target.value);
                setNewFieldValueSettings((current) => Object.fromEntries(Object.entries(current)
                  .map(([controllerValue, selectedValues]) => [controllerValue, selectedValues.filter((value) => values.includes(value))])));
              }} placeholder={'New\\nIn Progress\\nCompleted'} rows={4} />
              <label className="checkbox-row"><input type="checkbox" checked={newFieldPicklistRestricted} onChange={(event) => setNewFieldPicklistRestricted(event.target.checked)} />Restrict to the values defined in the value set</label>
              {object.fields.some((field) => field.apiName !== newFieldApiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')) && <div className="metadata-card">
                <label className="form-label">Controlling Field
                  <select className="form-control" value={newFieldControllerApiName} onChange={(event) => {
                    const controllerApiName = event.target.value;
                    const controller = object.fields.find((field) => field.apiName === controllerApiName);
                    const values = controller?.dataType === 'Checkbox' ? ['true', 'false'] : controller?.picklistValues ?? [];
                    setNewFieldControllerApiName(controllerApiName);
                    setNewFieldValueSettings(Object.fromEntries(values.map((value) => [value, newFieldValueSettings[value] ?? []])));
                  }}>
                    <option value="">None</option>{object.fields.filter((field) => field.apiName !== newFieldApiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')).map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.dataType})</option>)}
                  </select>
                </label>
                {newFieldControllerApiName && <><p className="permission-help">Choose which values are available for each controlling value.</p>{newFieldControllerValues.map((controllerValue) => <div className="metadata-card" key={controllerValue}>
                  <strong>{controllerValue}</strong>
                  <div className="field-selector-list">{newFieldPicklistOptions.map((value) => <label className="checkbox-row" key={value}><input type="checkbox" checked={(newFieldValueSettings[controllerValue] ?? []).includes(value)} onChange={() => {
                    const selectedValues = newFieldValueSettings[controllerValue] ?? [];
                    setNewFieldValueSettings({ ...newFieldValueSettings, [controllerValue]: selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value] });
                  }} />{value}</label>)}</div>
                </div>)}</>}
              </div>}
            </>}
            {(newFieldType === 'Lookup Relationship' || newFieldType === 'Master-Detail Relationship' || newFieldType === 'Hierarchical Relationship') && <>
              {newFieldType === 'Hierarchical Relationship'
                ? <div className="form-display">Related Object: User</div>
                : <label className="form-label" htmlFor="new-field-target">Related Object
                  <select className="form-control" id="new-field-target" value={newFieldRelationshipTarget} onChange={(event) => {
                    setNewFieldRelationshipTarget(event.target.value);
                    setNewFieldLookupFilters([]);
                    setNewFieldLookupFilterLogic('All');
                  }}>
                    <option value="">Select an object</option>{objects.filter((item) => item.apiName !== object.apiName).map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}
                  </select>
                </label>}
              <label className="form-label">Relationship Name
                  <input className="form-control" value={newFieldRelationshipName || newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}
                  onChange={(event) => setNewFieldRelationshipName(event.target.value)} />
              </label>
              <label className="form-label">Child Relationship Name
                <input className="form-control" value={newFieldChildRelationshipName || `${object.apiName.replace(/__c$/, '')}Records`}
                  onChange={(event) => setNewFieldChildRelationshipName(event.target.value)} />
              </label>
              {newFieldType === 'Lookup Relationship' && <label className="form-label">When a referenced record is deleted
                <select className="form-control" value={newFieldRequired ? 'Restrict' : newFieldDeleteBehavior}
                  disabled={newFieldRequired}
                  onChange={(event) => setNewFieldDeleteBehavior(event.target.value as 'Clear' | 'Restrict')}>
                  <option value="Clear">Clear the lookup field</option>
                  <option value="Restrict">Prevent deletion</option>
                </select>
              </label>}
              {newFieldType === 'Master-Detail Relationship' && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldAllowReparenting} onChange={(event) => setNewFieldAllowReparenting(event.target.checked)} />
                Allow reparenting
              </label>}
              {newFieldType !== 'Hierarchical Relationship' && newFieldRelationshipTarget && <>
                <div className="section-toolbar">
                  <div><h3>Related Lookup Filters</h3><p>Add one or more criteria that determine which records are eligible.</p></div>
                  <button type="button" className="btn" onClick={() => setNewFieldLookupFilters((filters) => [...filters, {
                    id: crypto.randomUUID(),
                    relatedFieldApiName: '',
                    operator: 'Equals',
                    valueMode: 'Value',
                    value: '',
                    valueFieldApiName: '',
                    required: true
                  }])}><Plus size={14} />Add Filter</button>
                </div>
                {newFieldLookupFilters.length > 1 && <label className="form-label">Required criteria match
                  <select className="form-control" aria-label="Lookup filter logic" value={newFieldLookupFilterLogic} onChange={(event) => setNewFieldLookupFilterLogic(event.target.value as 'All' | 'Any')}>
                    <option value="All">All criteria</option><option value="Any">Any criterion</option>
                  </select>
                </label>}
                {newFieldLookupFilters.map((filter, index) => {
                  const relatedFields = objects.find((item) => item.apiName === newFieldRelationshipTarget)?.fields ?? [];
                  const noOperand = filter.operator === 'Is Null' || filter.operator === 'Is Not Null';
                  const updateFilter = (update: Partial<NewFieldLookupFilterDraft>) => setNewFieldLookupFilters((filters) =>
                    filters.map((candidate) => candidate.id === filter.id ? { ...candidate, ...update } : candidate));
                  return <div className="metadata-card" key={filter.id}>
                    <div className="metadata-card-header"><h4>Filter {index + 1}</h4><button type="button" className="row-menu" aria-label={`Remove lookup filter ${index + 1}`} onClick={() => setNewFieldLookupFilters((filters) => filters.filter((candidate) => candidate.id !== filter.id))}><X size={14} /></button></div>
                    <label className="form-label">Related Field
                      <select className="form-control" value={filter.relatedFieldApiName} onChange={(event) => updateFilter({ relatedFieldApiName: event.target.value })}>
                        <option value="">Select a field…</option>{relatedFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                      </select>
                    </label>
                    <label className="form-label">Operator
                      <select className="form-control" value={filter.operator} onChange={(event) => updateFilter({
                        operator: event.target.value as RelatedLookupFilterMetadata['operator'],
                        ...(event.target.value === 'Is Null' || event.target.value === 'Is Not Null' ? { value: '', valueFieldApiName: '' } : {})
                      })}>
                        {relatedLookupFilterOperators.map((operator) => <option key={operator}>{operator}</option>)}
                      </select>
                    </label>
                    {!noOperand && <>
                      <label className="form-label">Compare Against
                        <select className="form-control" value={filter.valueMode} onChange={(event) => updateFilter({ valueMode: event.target.value as 'Value' | 'Field', value: '', valueFieldApiName: '' })}>
                          <option value="Value">A value</option>
                          <option value="Field">A field on this object</option>
                        </select>
                      </label>
                      {filter.valueMode === 'Field'
                        ? <label className="form-label">Source Field
                          <select className="form-control" value={filter.valueFieldApiName} onChange={(event) => updateFilter({ valueFieldApiName: event.target.value })}>
                            <option value="">Select a field…</option>{object.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                          </select>
                        </label>
                        : <label className="form-label">Value
                          <input className="form-control" value={filter.value} onChange={(event) => updateFilter({ value: event.target.value })} />
                        </label>}
                    </>}
                    <label className="checkbox-row"><input type="checkbox" checked={filter.required} onChange={(event) => updateFilter({ required: event.target.checked })} />Required</label>
                  </div>;
                })}
              </>}
            </>}
            {newFieldType === 'Formula' && <>
              <label className="form-label" htmlFor="new-field-return-type">Formula Return Type</label>
              <select className="form-control" id="new-field-return-type" value={newFieldReturnType} onChange={(event) => { setNewFieldReturnType(event.target.value); setNewFieldFormulaValidation({ status: 'idle', message: '' }); }}>{['Number', 'Currency', 'Percent', 'Text', 'Date', 'Checkbox'].map((type) => <option key={type}>{type}</option>)}</select>
              <label className="form-label" htmlFor="new-field-formula">Formula</label>
              <textarea ref={formulaEditorRef} className="form-control" id="new-field-formula" value={newFieldFormula} onChange={(event) => { setNewFieldFormula(event.target.value); setNewFieldFormulaValidation({ status: 'idle', message: '' }); }} placeholder="For example: Amount__c * Probability__c" rows={4} />
              <div className="formula-builder-tools">
                <label className="form-label">Insert Field
                  <select className="form-control" value="" onChange={(event) => { if (event.target.value) insertFormulaText(event.target.value); }}>
                    <option value="">Select a field…</option>
                    {object.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                  </select>
                </label>
                <label className="form-label">Insert Function
                  <select className="form-control" value="" onChange={(event) => {
                    const templates: Record<string, string> = {
                      IF: 'IF(condition, value_if_true, value_if_false)',
                      AND: 'AND(condition1, condition2)',
                      OR: 'OR(condition1, condition2)',
                      CASE: 'CASE(expression, value1, result1, default_result)',
                      ISBLANK: 'ISBLANK(value)',
                      BLANKVALUE: 'BLANKVALUE(value, replacement)',
                      TEXT: 'TEXT(value)',
                      DATE: 'DATE(year, month, day)',
                      ROUND: 'ROUND(number, num_digits)'
                    };
                    if (event.target.value) insertFormulaText(templates[event.target.value] ?? `${event.target.value}()`);
                    event.target.value = '';
                  }}>
                    <option value="">Select a function…</option>
                    {['IF', 'AND', 'OR', 'CASE', 'ISBLANK', 'BLANKVALUE', 'TEXT', 'DATE', 'ROUND'].map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>
              <div className="formula-operator-tools" aria-label="Insert operator">
                {[' + ', ' - ', ' * ', ' / ', ' = ', ' <> ', ' > ', ' < ', ' & ', ' AND ', ' OR '].map((operator) =>
                  <button key={operator} type="button" className="btn" onClick={() => insertFormulaText(operator)}>{operator.trim()}</button>
                )}
              </div>
              <div className="formula-validation-row">
                <button type="button" className="btn" onClick={() => { void validateNewFieldFormula(); }} disabled={!newFieldFormula.trim() || newFieldFormulaValidation.status === 'checking'}>
                  {newFieldFormulaValidation.status === 'checking' ? 'Checking…' : 'Check Syntax'}
                </button>
                {newFieldFormulaValidation.message && <span className={newFieldFormulaValidation.status === 'valid' ? 'formula-validation-success' : 'formula-validation-error'} role="status">{newFieldFormulaValidation.message}</span>}
              </div>
            </>}
            <label className="form-label" htmlFor="new-field-description">Description</label>
            <input className="form-control" id="new-field-description" value={newFieldDescription} onChange={(event) => setNewFieldDescription(event.target.value)} placeholder="Optional field description" />
            <label className="form-label" htmlFor="new-field-help-text">Help Text</label>
            <textarea className="form-control" id="new-field-help-text" value={newFieldHelpText} onChange={(event) => setNewFieldHelpText(event.target.value)} placeholder="Optional guidance shown to users" maxLength={255} rows={2} />
            {!['Formula', 'Geolocation', 'Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType) && (newFieldType === 'Checkbox'
              ? <div className="form-options"><label className="checkbox-row"><input type="checkbox" checked={newFieldHasDefault} onChange={(event) => setNewFieldHasDefault(event.target.checked)} />Set a default value</label><label className="checkbox-row"><input type="checkbox" disabled={!newFieldHasDefault} checked={newFieldDefaultValue === 'true'} onChange={(event) => setNewFieldDefaultValue(String(event.target.checked))} />Default to checked</label></div>
              : ['Picklist', 'Multi-Select Picklist'].includes(newFieldType)
                ? <label className="form-label">Default Value<select className="form-control" multiple={newFieldType === 'Multi-Select Picklist'} value={newFieldType === 'Multi-Select Picklist' ? newFieldDefaultValue.split(';').filter(Boolean) : newFieldDefaultValue} onChange={(event) => {
                  const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                  const value = newFieldType === 'Multi-Select Picklist' ? values.join(';') : values[0] ?? '';
                  setNewFieldDefaultValue(value);
                  setNewFieldHasDefault(value !== '');
                }}><option value="">— None —</option>{newFieldPicklistValues.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                : <label className="form-label" htmlFor="new-field-default">Default Value<input className="form-control" id="new-field-default" type={['Number', 'Currency', 'Percent'].includes(newFieldType) ? 'number' : newFieldType === 'Date' ? 'date' : newFieldType === 'Date/Time' ? 'datetime-local' : newFieldType === 'Email' ? 'email' : newFieldType === 'URL' ? 'url' : 'text'} step={['Number', 'Currency', 'Percent'].includes(newFieldType) ? (newFieldScale ? 10 ** -newFieldScale : 1) : undefined} maxLength={newFieldType === 'Text' ? newFieldTextLength : undefined} value={newFieldDefaultValue} onChange={(event) => { setNewFieldDefaultValue(event.target.value); setNewFieldHasDefault(event.target.value !== ''); }} /></label>)}
            {newFieldType !== 'Formula' && <div className="form-options">
              <label className="checkbox-row"><input type="checkbox" checked={newFieldType === 'Master-Detail Relationship' || newFieldRequired} disabled={newFieldType === 'Master-Detail Relationship'} onChange={(event) => setNewFieldRequired(event.target.checked)} /> Required</label>
              <label className="checkbox-row"><input type="checkbox" checked={newFieldUnique} disabled={newFieldType === 'Long Text Area' || newFieldType === 'Geolocation' || newFieldType === 'Multi-Select Picklist' || newFieldType === 'Lookup Relationship' || newFieldType === 'Master-Detail Relationship' || newFieldType === 'Hierarchical Relationship'} onChange={(event) => setNewFieldUnique(event.target.checked)} /> Unique</label>
              {['Text', 'Number', 'Email', 'Phone'].includes(newFieldType) && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldExternalId} onChange={(event) => setNewFieldExternalId(event.target.checked)} /> External ID
              </label>}
              {newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType) && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldCaseSensitive} onChange={(event) => setNewFieldCaseSensitive(event.target.checked)} /> Treat uppercase and lowercase values as different
              </label>}
            </div>}
            </div>}
            {newFieldStage === 2 && <div className="metadata-card" aria-label="Add field to page layouts">
              <h3>Add to Page Layouts</h3>
              <p className="permission-help">Choose which record layouts should display this field. You can change placements later in Page Layouts.</p>
              {(object.pageLayouts ?? []).map((layout) => <label className="checkbox-row" key={layout.id}>
                <input type="checkbox" checked={newFieldLayoutIds.includes(layout.id)} onChange={() => setNewFieldLayoutIds((current) =>
                  current.includes(layout.id) ? current.filter((id) => id !== layout.id) : [...current, layout.id])} />
                {layout.label}
              </label>)}
              {(object.pageLayouts ?? []).length === 0 && <p className="permission-help">No page layouts are available for this object.</p>}
            </div>}
            {newFieldStage === 3 && <div className="metadata-card" aria-label="Field review">
              <h3>Review Field</h3>
              <dl className="metadata-summary">
                <dt>Data Type</dt><dd>{newFieldType}{newFieldType === 'Text' ? ` (${newFieldTextLength})` : ''}{['Number', 'Currency', 'Percent'].includes(newFieldType) ? ` (${newFieldPrecision}, ${newFieldScale})` : ''}</dd>
                <dt>Field Label</dt><dd>{newFieldLabel.trim()}</dd>
                <dt>Field Name</dt><dd>{newFieldApiName}</dd>
                <dt>Required / Unique</dt><dd>{newFieldType === 'Master-Detail Relationship' || newFieldRequired ? 'Required' : 'Optional'} / {newFieldUnique ? 'Unique' : 'Not unique'}</dd>
                {['Text', 'Number', 'Email', 'Phone'].includes(newFieldType) && <><dt>External ID</dt><dd>{newFieldExternalId ? 'Yes' : 'No'}</dd></>}
                {newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType) && <><dt>Case sensitivity</dt><dd>{newFieldCaseSensitive ? 'Case sensitive' : 'Case insensitive'}</dd></>}
                {newFieldDescription.trim() && <><dt>Description</dt><dd>{newFieldDescription.trim()}</dd></>}
                {newFieldHelpText.trim() && <><dt>Help Text</dt><dd>{newFieldHelpText.trim()}</dd></>}
                {newFieldPicklistOptions.length > 0 && <><dt>Values</dt><dd>{newFieldPicklistOptions.join(', ')}</dd></>}
                {newFieldController && <><dt>Controlling Field</dt><dd>{newFieldController.label}</dd></>}
                {newFieldRelationshipTarget && <><dt>Related Object</dt><dd>{newFieldRelationshipTarget}</dd></>}
                {newFieldHasDefault && <><dt>Default Value</dt><dd>{newFieldDefaultValue || '(blank)'}</dd></>}
                <dt>Page Layouts</dt><dd>{(object.pageLayouts ?? []).filter((layout) => newFieldLayoutIds.includes(layout.id)).map((layout) => layout.label).join(', ') || 'None'}</dd>
              </dl>
            </div>}
            {newFieldStage === 1 && newFieldConfigurationError && <p className="form-error" role="alert">{newFieldConfigurationError}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => { resetNewFieldDraft(); setShowNewField(false); }}>Cancel</button>
              {newFieldStage > 0 && <button className="btn" onClick={() => setNewFieldStage((stage) => (stage - 1) as 0 | 1 | 2 | 3)}>Back</button>}
              {newFieldStage < 3
                ? <button className="btn btn-brand" onClick={() => setNewFieldStage((stage) => (stage + 1) as 0 | 1 | 2 | 3)} disabled={newFieldStage === 1 && Boolean(newFieldConfigurationError)}>Next</button>
                : <button className="btn btn-brand" onClick={() => { void addField(); }} disabled={Boolean(newFieldConfigurationError)}>Save Field</button>}
            </div>
          </section>
        </div>
      )}
      {showNewObject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewObject(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-object-title">
            <div className="modal-header"><h2 id="new-object-title">New Custom Object</h2><button className="icon-button dark" onClick={() => setShowNewObject(false)} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Define the object labels and description. A required record-name field and default layouts are created with it.</p>
            <label className="form-label" htmlFor="new-object-label">Label</label>
            <input className="form-control" id="new-object-label" value={newObjectLabel} onChange={(event) => setNewObjectLabel(event.target.value)} placeholder="For example, Project" autoFocus />
            <label className="form-label" htmlFor="new-object-plural">Plural Label</label>
            <input className="form-control" id="new-object-plural" value={newObjectPluralLabel} onChange={(event) => setNewObjectPluralLabel(event.target.value)} placeholder="For example, Projects" />
            <label className="form-label" htmlFor="new-object-record-name">Record Name Label</label>
            <input className="form-control" id="new-object-record-name" value={newObjectRecordNameLabel} onChange={(event) => setNewObjectRecordNameLabel(event.target.value)} placeholder={`${newObjectLabel || 'Object'} Name`} />
            <label className="form-label" htmlFor="new-object-record-name-type">Record Name Data Type</label>
            <select className="form-control" id="new-object-record-name-type" value={newObjectSettings.recordNameType} onChange={(event) => setNewObjectSettings((current) => ({ ...current, recordNameType: event.target.value as ObjectSettingsMetadata['recordNameType'], recordNameFormat: event.target.value === 'Auto Number' ? current.recordNameFormat || 'REC-{0000}' : '' }))}><option>Text</option><option>Auto Number</option></select>
            {newObjectSettings.recordNameType === 'Auto Number' && <label className="form-label">Display Format<input className="form-control" value={newObjectSettings.recordNameFormat} onChange={(event) => setNewObjectSettings((current) => ({ ...current, recordNameFormat: event.target.value }))} placeholder="REC-{0000}" /></label>}
            <label className="form-label" htmlFor="new-object-description">Description</label>
            <textarea className="form-control" id="new-object-description" value={newObjectDescription} onChange={(event) => setNewObjectDescription(event.target.value)} rows={3} />
            <div className="metadata-card"><h3>Optional Features</h3>{([
              ['allowReports', 'Allow Reports'],
              ['allowActivities', 'Allow Activities'],
              ['trackFieldHistory', 'Track Field History'],
              ['allowInChatter', 'Allow in Chatter']
            ] as const).map(([key, label]) => <label className="metadata-row" key={key}><span>{label}</span><input type="checkbox" checked={newObjectSettings[key]} onChange={(event) => setNewObjectSettings((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}<label className="form-label">Deployment Status<select className="form-control" value={newObjectSettings.deploymentStatus} onChange={(event) => setNewObjectSettings((current) => ({ ...current, deploymentStatus: event.target.value as ObjectSettingsMetadata['deploymentStatus'] }))}><option>In Development</option><option>Deployed</option></select></label></div>
            <label className="checkbox-row"><input type="checkbox" checked={launchCustomTabWizard} onChange={(event) => setLaunchCustomTabWizard(event.target.checked)} />Launch New Custom Tab Wizard after saving this custom object</label>
            <div className="modal-actions"><button className="btn" onClick={() => setShowNewObject(false)}>Cancel</button><button className="btn btn-brand" onClick={createObject} disabled={!newObjectLabel.trim() || !newObjectPluralLabel.trim() || (newObjectSettings.recordNameType === 'Auto Number' && !newObjectSettings.recordNameFormat.trim())}>Save</button></div>
          </section>
        </div>
      )}
      {showCustomTabWizard && customTabObject && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal custom-tab-wizard" role="dialog" aria-modal="true" aria-labelledby="custom-tab-wizard-title">
            <div className="modal-header"><h2 id="custom-tab-wizard-title">New Custom Object Tab</h2><button className="icon-button dark" onClick={() => { setShowCustomTabWizard(false); setCustomTabObject(null); }} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Choose a tab style for {customTabObject.label}. The tab will be added to workspace navigation.</p>
            <h3 className="custom-tab-section-title">Select a Tab Style</h3>
            <div className="custom-tab-style-grid" role="group" aria-label="Tab style">
              {customTabStyles.map((style) => (
                <button
                  className={customTabStyle === style.name ? 'custom-tab-style selected' : 'custom-tab-style'}
                  key={style.name}
                  type="button"
                  aria-pressed={customTabStyle === style.name}
                  onClick={() => setCustomTabStyle(style.name)}
                >
                  <span className="custom-tab-style-icon" style={{ backgroundColor: style.color }}><style.icon size={18} /></span>
                  <span>{style.name}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions"><button className="btn" onClick={() => { setShowCustomTabWizard(false); setCustomTabObject(null); }}>Cancel</button><button className="btn btn-brand" onClick={() => void saveCustomTab()}>Save</button></div>
          </section>
        </div>
      )}
      {flowRun && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="flow-screen-title" onSubmit={submitFlowScreen}>
            <div className="modal-header"><h2 id="flow-screen-title">{flowRun.screen.label}</h2><button className="icon-button dark" type="button" onClick={() => setFlowRun(null)} aria-label="Close"><X size={18} /></button></div>
            {flowRunnerError && <div className="flow-screen-error" role="alert" aria-live="assertive">{flowRunnerError}</div>}
            <div className={`flow-screen-grid${flowRun.screen.config.layout === 'Two Columns' ? ' flow-screen-grid-two' : ''}`}>
              <FlowScreenContent
                fields={(Array.isArray(flowRun.screen.config.fields) ? flowRun.screen.config.fields : []) as Array<Record<string, unknown>>}
                libraryComponents={libraryComponents}
                interviewId={flowRun.interviewId}
                values={flowRun.values}
                onValueChange={(name, value) => {
                  setFlowRunnerError('');
                  setFlowRun((current) => current ? { ...current, values: { ...current.values, [name]: value } } : current);
                }}
                loadRecords={loadFlowScreenRecords}
                onError={setFlowRunnerError}
                isFieldVisible={screenFieldIsVisible}
              />
            </div>
            <div className="modal-actions"><button className="btn" type="button" onClick={() => setFlowRun(null)}>Cancel</button>{flowRun.canGoBack && <button className="btn" type="button" onClick={() => void goBackFlowScreen()} disabled={flowRunnerSubmitting}>Previous</button>}{flowRun.outcomes.map((outcome) => <button className="btn btn-brand" type="submit" name="outcome" value={outcome.label} key={outcome.name} disabled={flowRunnerSubmitting}>{flowRunnerSubmitting ? 'Continuing…' : outcome.label}</button>)}</div>
          </form>
        </div>
      )}
      {flowDebug && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="flow-debug-title">
            <div className="modal-header">
              <div>
                <h2 id="flow-debug-title">{flowDebug.mode === 'debug' ? 'Debug' : 'Run'} {flowDebug.flow.label}</h2>
                <p>{flowDebug.mode === 'debug'
                  ? 'Debug runs the saved version in an isolated tenant copy. Email and HTTP side effects are simulated.'
                  : 'Provide inputs for the saved version. Side effects occur as configured by the flow.'}</p>
              </div>
              <button className="btn btn-icon" type="button" aria-label="Close debug" onClick={() => setFlowDebug(null)}><X size={16} /></button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void runFlowDebug(); }}>
              <div className="modal-body">
                {flowDebug.mode === 'debug' && flowDebug.flow.flowType === 'Record-Triggered Flow' && <>
                  <div className="info-callout">Simulate a record-triggered Flow. This test uses a disposable data snapshot; it never saves record changes or delivers messages. Use actual field API names in the JSON, and provide prior values when testing an update or deletion.</div>
                  <label className="form-label">Trigger Event
                    <select className="form-control" value={flowDebug.inputs.$Event ?? 'created'} onChange={(event) => setFlowDebug((current) => current ? { ...current, inputs: { ...current.inputs, $Event: event.target.value } } : current)}>
                      <option value="created">Created</option><option value="updated">Updated</option><option value="deleted">Deleted</option>
                    </select>
                  </label>
                  <label className="form-label">Current Record ({flowDebug.flow.triggerObject ?? 'object'}) — JSON
                    <textarea className="form-control" rows={7} value={flowDebug.inputs.$Record ?? '{}'} onChange={(event) => setFlowDebug((current) => current ? { ...current, inputs: { ...current.inputs, $Record: event.target.value } } : current)} />
                  </label>
                  {flowDebug.inputs.$Event !== 'created' && <label className="form-label">Prior Record — JSON
                    <textarea className="form-control" rows={6} value={flowDebug.inputs.$Prior ?? '{}'} onChange={(event) => setFlowDebug((current) => current ? { ...current, inputs: { ...current.inputs, $Prior: event.target.value } } : current)} />
                  </label>}
                  <label className="checkbox-row"><input type="checkbox" checked={flowDebug.inputs.$IsClone === 'true'} onChange={(event) => setFlowDebug((current) => current ? { ...current, inputs: { ...current.inputs, $IsClone: event.target.checked ? 'true' : 'false' } } : current)} />Simulate cloned record</label>
                </>}
                {flowDebug.flow.resources.filter((resource) => resource.availableForInput && flowDebug.flow.flowType !== 'Record-Triggered Flow').map((resource) => {
                  const normalizedType = resource.dataType.toLocaleLowerCase();
                  const isJsonInput = ['Record', 'Record Collection'].includes(resource.type) || normalizedType === 'json';
                  const updateValue = (value: string) => setFlowDebug((current) => current ? {
                    ...current, inputs: { ...current.inputs, [resource.name]: value }
                  } : current);
                  return (
                    <label className="form-label" key={resource.name}>
                      {resource.label} <span className="muted">({resource.dataType})</span>
                      {isJsonInput || normalizedType === 'multi-select picklist'
                        ? <textarea
                            className="form-control"
                            rows={4}
                            value={flowDebug.inputs[resource.name] ?? ''}
                            placeholder={normalizedType === 'multi-select picklist' ? '["Sales", "Service"]' : 'Enter JSON'}
                            onChange={(event) => updateValue(event.target.value)}
                          />
                        : normalizedType === 'boolean' || normalizedType === 'checkbox'
                          ? <select className="form-control" value={flowDebug.inputs[resource.name] ?? ''} onChange={(event) => updateValue(event.target.value)}>
                              <option value="">Use default</option><option value="true">True</option><option value="false">False</option>
                            </select>
                          : <input
                              className="form-control"
                              type={normalizedType.startsWith('number') || normalizedType.startsWith('currency') || normalizedType.startsWith('percent') ? 'number'
                                : normalizedType === 'date' ? 'date'
                                  : normalizedType === 'time' ? 'time'
                                    : normalizedType === 'date/time' || normalizedType === 'datetime' ? 'datetime-local'
                                      : normalizedType === 'email' ? 'email'
                                        : normalizedType === 'url' ? 'url'
                                          : normalizedType === 'phone' ? 'tel' : 'text'}
                              step={normalizedType.startsWith('number') || normalizedType.startsWith('currency') || normalizedType.startsWith('percent') ? 'any' : undefined}
                              value={flowDebug.inputs[resource.name] ?? ''}
                              onChange={(event) => updateValue(event.target.value)}
                            />}
                    </label>
                  );
                })}
                {flowDebug.error && <div className="records-message" role="alert">{flowDebug.error}</div>}
                {flowDebug.result && (
                  <div className="flow-debug-results" aria-live="polite">
                    <h3>Debug results</h3>
                    <p>{flowDebug.error
                      ? 'Execution failed; the trace shows the path reached before the error.'
                      : flowDebug.result.status === 'skipped'
                        ? `Trigger skipped: ${String(flowDebug.result.reason ?? 'entry conditions did not match')}`
                        : flowDebug.result.status === 'waiting'
                          ? `Paused at ${flowDebug.result.kind === 'screen' ? 'a Screen' : 'an asynchronous stage'}.`
                          : 'Execution completed.'}</p>
                    {typeof flowDebug.result.screen === 'object' && flowDebug.result.screen !== null && (
                      <section>
                        <h4>Current screen</h4>
                        <p>{String((flowDebug.result.screen as Record<string, unknown>).label ?? 'Screen')}</p>
                        <pre>{JSON.stringify((flowDebug.result.screen as Record<string, unknown>).config ?? {}, null, 2)}</pre>
                      </section>
                    )}
                    {typeof flowDebug.result.waitUntil === 'string' && (
                      <p>Wait scheduled until {new Date(flowDebug.result.waitUntil).toLocaleString()}.</p>
                    )}
                    {flowDebug.result.sideEffectsSimulated === true && (
                      <p>External side effects were simulated; no email or HTTP request was sent.</p>
                    )}
                    {flowDebug.result.outputs !== undefined && (
                      <section><h4>Outputs</h4><pre>{JSON.stringify(flowDebug.result.outputs, null, 2)}</pre></section>
                    )}
                    {flowDebug.result.variables !== undefined && (
                      <section><h4>Variables</h4><pre>{JSON.stringify(flowDebug.result.variables, null, 2)}</pre></section>
                    )}
                    {Array.isArray(flowDebug.result.debugTrace) && (
                      <section>
                        <h4>Element trace</h4>
                        <ol>{flowDebug.result.debugTrace.map((entry, index) => (
                          <li key={index}><pre>{JSON.stringify(entry, null, 2)}</pre></li>
                        ))}</ol>
                      </section>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" type="button" onClick={() => setFlowDebug(null)}>Close</button>
                <button className="btn btn-brand" type="submit" disabled={flowDebug.running}>
                  {flowDebug.running ? (flowDebug.mode === 'debug' ? 'Debugging…' : 'Running…')
                    : flowDebug.mode === 'debug' ? 'Run Debug' : 'Run Flow'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}
return SetupApp;
}
