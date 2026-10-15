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
import { createSetupFlowActions } from './setupFlowActions';
import { useSetupMetadata } from './useSetupMetadata';
const SetupObjectDialogs = React.lazy(() => import('./setupObjectDialogs'));
const FieldWizardModal = React.lazy(() => import('./setupFieldWizard'));
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
  History,
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
const SetupFlowDialogs = React.lazy(() => import('./setupFlowDialogs'));
const FlowLogs = React.lazy(() => import('./FlowLogs'));
const FlowInterviews = React.lazy(() => import('./FlowInterviews'));
const ScheduledFlows = React.lazy(() => import('./ScheduledFlows'));
import DashboardBuilder from './DashboardBuilder';
const ComponentLibrary = React.lazy(() => import('./ComponentLibrary'));
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
const AppExchange = React.lazy(() => import('./AppExchange'));
const AppManager = React.lazy(() => import('./AppManager'));
import PlatformWorkspaceSurface from './PlatformWorkspaceSurface'; import {PlatformPageSlot} from './PlatformPageSlot';
import { GlobalRecordSearch, RecordObjectPicker, useDismissOnOutside } from './TopbarRecords';
import { pageIsAvailableInApp, resolvePageActionRoute } from './pageActionRouting';
const NamedCredentials = React.lazy(() => import('./NamedCredentials'));
import TenantManagement from './TenantManagement';
import TenantDomains from './TenantDomains';
import TenantRecoveryPanel from './TenantRecoveryPanel';
import TenantUsagePanel from './TenantUsagePanel';
import DeveloperAccountSettings from './DeveloperAccountSettings';
import SettingsViewRow from './SettingsViewRow';
import ApprovalProcessManager from './ApprovalProcessManager';
import { standardPageComponents } from './componentCatalog';
const EmbeddedDashboard = React.lazy(() => import('./EmbeddedDashboard'));
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

  useSetupMetadata({ apiRequest, approvalProcesses, apps, currentAppId, dashboards, emailAlerts, entryTiming, flowSnapshots, flows, isAuthErrorMessage, object, objects, page, pages, platformEvents, readVerifiedMetadata, reports, route, saveVerifiedMetadata, setAccessControl, setAccessControlError, setAdvancedMetadataLoaded, setApprovalProcesses, setApps, setCanCreateDashboards, setCanManageApprovalProcesses, setCanManageApps, setCanManageDashboardTerritories, setCanManageDashboards, setCanManageFlows, setCanManageLibrary, setCanManagePlatformLicences, setCanManagePlatformTenants, setCanManageReportFolders, setCanManageUserIdentities, setCanRunFlows, setCanScheduleDashboards, setConnectorProviders, setCurrentAppId, setCurrentFieldAccess, setCurrentProfileId, setCurrentRecordTypeAccess, setDashboardFolders, setDashboardRunningUserIds, setDashboardTerritories, setDashboardUserId, setDashboards, setEmailAlerts, setFlow, setFlows, setIntegrationConnections, setLibraryComponents, setMetadataLoadError, setMetadataLoaded, setNamedCredentials, setObject, setObjects, setPage, setPages, setPlatformEvents, setReportFolders, setReports, setSelectedFlowId, setToast, toast, workspace });

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
        <div className="header-tools" ref={appUtilityRef}>
          <button type="button" className="icon-button header-history-button" title="History" aria-label="History" aria-expanded={activeUtility === 'History'}
            onClick={() => setActiveUtility((current) => current === 'History' ? null : 'History')}><History size={17} /></button>
          {activeUtility === 'History' && <section className="app-utility-popover" aria-label="History utility">
            <div className="app-utility-heading"><strong>History</strong><button className="icon-button" aria-label="Close History" onClick={() => setActiveUtility(null)}><X size={14} /></button></div>
            <div className="app-utility-history">{recentRoutes.length
              ? recentRoutes.map((item) => <button key={item.key} onClick={() => { navigateRoute(item.route); setActiveUtility(null); }}>{item.label}</button>)
              : <p>No recent items.</p>}</div>
          </section>}
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

      {route.kind !== 'setup' && currentAppNavigation.some((entry) => entry.type === 'App Page' && pages.some((page) => page.apiName === entry.apiName && page.pageType === 'App Page' && page.status === 'Active')) && <div className="app-strip" style={{ '--brand': currentApp?.brandColor ?? '#0176d3' } as React.CSSProperties}>
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
            <PlatformWorkspaceSurface workspace="object-manager" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} >
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
          {route.kind === 'setup' && workspace === 'app-manager' && <PlatformWorkspaceSurface workspace="app-manager" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppManager apps={apps} objects={objects} pages={pages} onSave={saveApp} onDelete={deleteApp} /></PlatformWorkspaceSurface>}
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
          {route.kind === 'setup' && workspace === 'approval-processes' && <PlatformWorkspaceSurface workspace="approval-processes" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="approval-workspace"><ApprovalProcessManager
            processes={approvalProcesses}
            objects={objects}
            users={accessControlError ? [] : accessControl.users}
            canManage={canManageApprovalProcesses}
            onSave={saveApprovalProcess}
            onDelete={deleteApprovalProcess}
            onNotify={notify}
          /></PlatformPageSlot></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'named-credentials' && <PlatformWorkspaceSurface workspace="named-credentials" componentRuntime={protectedPageRuntime} permitted={canManageNamedCredentials} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="credentials"><NamedCredentials
            credentials={namedCredentials}
            canManage={canManageNamedCredentials}
            encryptionReady={namedCredentialsEncryptionReady}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
            onOAuthAuthorize={authorizeNamedCredential}
            onToggleEnabled={toggleNamedCredentialEnabled}
          /></PlatformPageSlot></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'app-exchange' && <PlatformWorkspaceSurface workspace="app-exchange" componentRuntime={protectedPageRuntime} permitted={connectorRights.view} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppExchange
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
            return <PlatformWorkspaceSurface workspace="connector-settings" componentRuntime={protectedPageRuntime} permitted={connectorRights.view} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:"setup",workspace:"page-builder",resourceApiName:apiName});}}><PlatformPageSlot slotKey="connector-workspace">{provider ? <ConnectorSettingsWorkspace
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
            /> : <div className="connector-settings-page"><div className="surface connector-empty">Connector metadata is loading…</div></div>}</PlatformPageSlot></PlatformWorkspaceSurface>;
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
          {route.kind === 'setup' && workspace === 'automation-settings' && <PlatformWorkspaceSurface workspace="automation-settings" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="automation-policy"><AutomationSettingsWorkspace canManage={canManageFlows} /></PlatformPageSlot></PlatformWorkspaceSurface>}
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
          {route.kind === 'setup' && workspace === 'company-settings' && <PlatformWorkspaceSurface workspace="company-settings" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} ><><PlatformPageSlot slotKey="company-info"><CompanySettings canManage={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="domains"><TenantDomains request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="developer-accounts"><DeveloperAccountSettings request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="usage"><TenantUsagePanel request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="recovery"><TenantRecoveryPanel request={apiRequest} operator={false} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="mfa"><TenantMfaSettings onReauthenticate={onLogout} canManage={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="email-recovery"><TenantEmailRecoverySettings canManage={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="locks"><TenantUserLockSettings /></PlatformPageSlot><PlatformPageSlot slotKey="sessions"><AccountSessionSecurity onReauthenticate={onLogout} /></PlatformPageSlot><PlatformPageSlot slotKey="audit"><TenantSecurityAudit /></PlatformPageSlot></></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'tenant-management' && <PlatformWorkspaceSurface workspace="tenant-management" componentRuntime={protectedPageRuntime} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} permitted={canManagePlatformTenants}><TenantManagement request={apiRequest} permitted={canManagePlatformTenants} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'rbac' && <PlatformWorkspaceSurface workspace="rbac" componentRuntime={protectedPageRuntime} permitted={canReadSecurity} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><Permissions
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
      {showNewField && <React.Suspense fallback={null}><FieldWizardModal context={{ X, addField, formulaEditorRef, insertFormulaText, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, object, objects, relatedLookupFilterOperators, resetNewFieldDraft, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setShowNewField, showNewField, validateNewFieldFormula }} /></React.Suspense>}
      {(showNewObject || showCustomTabWizard) && <React.Suspense fallback={null}><SetupObjectDialogs context={{ showNewObject, setShowNewObject, newObjectLabel, setNewObjectLabel, newObjectPluralLabel, setNewObjectPluralLabel, newObjectRecordNameLabel, setNewObjectRecordNameLabel, newObjectSettings, setNewObjectSettings, newObjectDescription, setNewObjectDescription, launchCustomTabWizard, setLaunchCustomTabWizard, createObject, showCustomTabWizard, customTabObject, setCustomTabObject, customTabStyle, setCustomTabStyle, customTabStyles, saveCustomTab }} /></React.Suspense>}
      {(flowRun || flowDebug) && <React.Suspense fallback={null}><SetupFlowDialogs context={{ flowRun, setFlowRun, flowRunnerError, setFlowRunnerError, submitFlowScreen, goBackFlowScreen, flowRunnerSubmitting, flowDebug, setFlowDebug, runFlowDebug, libraryComponents, loadFlowScreenRecords }} /></React.Suspense>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}
return SetupApp;
}
