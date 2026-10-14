import { createLoginView } from './loginView';
import { ProfilePasswordMenu, ConnectionHealthIndicator } from './authStatusViews';
import { apiBase, getAccessToken, setAccessToken, apiRequest, ApiRequestError, isAuthErrorMessage, withAuthRefreshLock, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords } from './authClient';
import { ConnectorSettingsWorkspace } from './connectorSettingsView';
import { MetadataComponentProperties } from './componentPropertiesView';
import { createPageRuntimeViews } from './pageRuntimeViews';
import { createSetupApp } from './setupAppShell';
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

const customTabStyles = [
  { name: 'Blue', color: '#1589ee', icon: Database },
  { name: 'Green', color: '#2e844a', icon: UsersRound },
  { name: 'Orange', color: '#fe9339', icon: CalendarDays },
  { name: 'Purple', color: '#9050e9', icon: BriefcaseBusiness },
  { name: 'Red', color: '#ea001e', icon: FileText },
  { name: 'Teal', color: '#0b827c', icon: Building2 },
  { name: 'Yellow', color: '#dd7a01', icon: ClipboardList }
] as const;

type AuthState = 'loading' | 'anonymous' | 'authenticated' | 'error';
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


type RecordActivity = {
  id: string;
  objectApiName: string;
  recordId: string;
  kind: 'Task' | 'Call' | 'Event';
  subject: string;
  description: string;
  status: 'Open' | 'Completed';
  dueAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
};
type ChatterComment = { id: string; body: string; createdBy: string; createdByName: string; createdAt: string };
type ChatterPost = {
  id: string;
  objectApiName: string;
  recordId: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  comments: ChatterComment[];
};

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState('');
  const [entryTiming, setEntryTiming] = useState<EntryTiming | null>(null);
  const sessionRestoreStarted = useRef(false);
  useEffect(() => {
    const expireSession = () => {
      setAccessToken(undefined);
      setAuthState('anonymous');
    };
    window.addEventListener('metadrive:session-expired', expireSession);
    return () => window.removeEventListener('metadrive:session-expired', expireSession);
  }, []);

  const restoreSession = async () => {
    const restoreStartedAt = performance.now();
    const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
    // Do not hold the login screen for more than ~20 seconds when the free API is waking.
    // A visible retry option is safer than hiding errors behind a minute-long spinner.
    const retryDelaysMs = [1500];

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      try {
        const response = await withAuthRefreshLock(() =>
          fetch(`${apiBase}/auth/refresh?landing=1`, {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal
          }), controller.signal
        );

        if (response.status === 401) {
          setAccessToken(undefined);
          setAuthError('');
          setAuthState('anonymous');
          return;
        }

        if (response.ok) {
          const session = await response.json() as { access_token: string; landing?: LandingBootstrap };
          setAccessToken(session.access_token);
          setAuthError('');
          setEntryTiming({ kind: 'restore', startedAt: restoreStartedAt, authenticatedAt: performance.now(), landing: session.landing });
          setAuthState('authenticated');
          return;
        }

        if (!retryableStatuses.has(response.status) || attempt === retryDelaysMs.length) {
          throw new Error(`Session restore failed (${response.status})`);
        }
      } catch (error) {
        const retryableNetworkFailure =
          error instanceof DOMException && error.name === 'AbortError'
          || error instanceof TypeError;

        if (!retryableNetworkFailure || attempt === retryDelaysMs.length) {
          setAuthError(error instanceof DOMException && error.name === 'AbortError'
            ? 'The workspace API is not responding yet. Check the API connection and retry.'
            : error instanceof Error ? error.message : String(error));
          setAuthState('error');
          return;
        }
      } finally {
        window.clearTimeout(timeout);
      }

      await new Promise((resolve) => window.setTimeout(resolve, retryDelaysMs[attempt]));
    }
  };

  useEffect(() => {
    if (sessionRestoreStarted.current) return;
    sessionRestoreStarted.current = true;
    void restoreSession();
  }, []);

  // Generic metadata-directed landing: when a profile has an active Home Page
  // for its app, honour that assignment after login or session restoration.
  // Never override explicit record, app page or Setup navigation.
  useEffect(() => {
    if (authState !== 'authenticated') return;
    const currentRoute = parseAppRoute(window.location.pathname, window.location.search);
    if (currentRoute.kind !== 'setup' || currentRoute.workspace !== 'home') return;
    const preferredApp = new URLSearchParams(window.location.search).get('appId') || 'Records';
    const formFactor = window.matchMedia('(max-width: 600px)').matches ? 'Phone' : 'Desktop';
    let cancelled = false;
    void (async () => {
      // Select only an app authorised by the server for this login.
      // The same application shell resolves any authorised landing page.
      // without hardcoded role-to-application routes.
      const allowed = entryTiming?.landing?.apps?.length
        ? entryTiming.landing.apps
        : (await apiRequest<{apps: LightningAppMetadata[]}>('/metadata/apps')).apps;
      const appId = allowed.some(app => app.apiName === preferredApp)
        ? preferredApp : allowed[0]?.apiName;
      if (!appId) return;
      const {page} = await apiRequest<{page:{apiName:string}|null}>(
        '/apps/' + encodeURIComponent(appId) + '/home-page?formFactor=' + formFactor
      );
      if (cancelled || !page || parseAppRoute(window.location.pathname, window.location.search).kind !== 'setup') return;
      window.history.replaceState({}, '', appRoutePath({kind:'app-home',appId}));
      window.dispatchEvent(new PopStateEvent('popstate'));
    })().catch(() => { /* No authorised Home Page: keep existing workspace. */ });
    return () => { cancelled = true; };
  }, [authState,entryTiming]);

  if (authState === 'loading') return <div className="auth-loading">Loading your workspace…</div>;
  const loginSuccess = (timing: EntryTiming) => { setEntryTiming(timing); setAuthState('authenticated'); };
  if (authState === 'anonymous') return <Login onSuccess={loginSuccess} />;
  if (authState === 'error') return <Login error={authError} onSuccess={loginSuccess} onRetry={() => { setAuthState('loading'); void restoreSession(); }} />;
  return <SetupApp entryTiming={entryTiming} onLogout={() => { setAccessToken(undefined); setAuthState('anonymous'); }} />;
}

const uneSolutionsLogoUrl = `${import.meta.env.BASE_URL}une-solutions-logo.webp`;

const Login = createLoginView(uneSolutionsLogoUrl);

async function fetchFlowListPage(page: number, search: string) {
  return apiRequest<{
    flows: Array<Pick<FlowDefinitionMetadata, 'apiName' | 'label' | 'flowType' | 'status' | 'versionNumber' | 'activeVersion' | 'createdAt' | 'createdBy' | 'lastModifiedAt' | 'lastModifiedBy'>>;
    total: number; page: number; pageSize: number;
  }>(`/metadata/flows/list?page=${encodeURIComponent(String(page))}&search=${encodeURIComponent(search)}`);
}


let setupAppImplementation: React.ComponentType<any> | undefined;
function SetupApp(props: {onLogout: () => void; entryTiming: EntryTiming | null}) {
  if (!setupAppImplementation) setupAppImplementation = createSetupApp({isAuthErrorMessage, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords, apiRequest, ApiRequestError, fetchFlowListPage, customTabStyles, uneSolutionsLogoUrl, ProfilePasswordMenu, ConnectionHealthIndicator, ConnectorSettingsWorkspace, LightningAppRuntime, RecordWorkspace, ObjectManager, PageBuilder, ReportBuilder, Permissions, SetupHome, AutomationSettingsWorkspace, CompanySettings, TenantMfaSettings, TenantSecurityAudit, TenantUserLockSettings, AccountSessionSecurity, TenantEmailRecoverySettings});
  const Component = setupAppImplementation;
  return <Component {...props} />;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

const { RuntimeReportChart, MetadataBoundPageComponent, usePageLayoutDevice, LightningAppRuntime } = createPageRuntimeViews(apiRequest);

const { RecordWorkspace, RecordFormDialog } = createRecordWorkspaceViews(apiRequest, usePageLayoutDevice, ApiRequestError, getAccessToken);

const SetupHome = createSetupHome(PageHeading);

const { AutomationSettingsWorkspace, TenantEmailRecoverySettings, TenantUserLockSettings, AccountSessionSecurity, TenantSecurityAudit, TenantMfaSettings, CompanySettings } = createSettingsViews(apiRequest, PageHeading);

const ObjectManager = createObjectManager(apiRequest);

const PageBuilder = createPageBuilder(MetadataComponentProperties);

const Permissions = createPermissions(apiRequest, PageHeading);

export default App;
