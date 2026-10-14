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

const defaultApiUrl = new URL(window.location.origin);
defaultApiUrl.port = '3001';
defaultApiUrl.pathname = '/api';
const apiBase = import.meta.env.VITE_API_BASE_URL ?? defaultApiUrl.toString().replace(/\/$/, '');
let accessToken: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;
function ProfilePasswordMenu({ onLogout, onPasswordChanged }: { onLogout: () => Promise<void> | void; onPasswordChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(profileMenuRef, open, () => setOpen(false));
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reset = () => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setError(''); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    if (newPassword.length < 12) { setError('Use at least 12 characters'); return; }
    setBusy(true); setError('');
    try {
      await apiRequest('/auth/change-password', { method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }) });
      reset(); setEditing(false); setOpen(false);
      onPasswordChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not change password'); }
    finally { setBusy(false); }
  };
  return <div className="profile-menu-wrap" ref={profileMenuRef}>
    <button type="button" className="user-menu" aria-label="User profile" aria-expanded={open}
      onClick={() => setOpen((state) => !state)}>Profile <ChevronDown size={13} /></button>
    {open && <div className="profile-menu-panel">
      <button type="button" onClick={() => { setEditing(true); setOpen(false); reset(); }}>Change Password</button>
      <button type="button" onClick={() => void onLogout()}>Sign Out</button>
    </div>}
    {editing && <div className="profile-password-backdrop" role="presentation">
      <section className="profile-password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-heading">
        <div className="profile-password-heading"><h2 id="change-password-heading">Change Password</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={() => { setEditing(false); reset(); }}><X size={18} /></button></div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="form-label">Current Password<input autoComplete="current-password" className="form-control" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label className="form-label">New Password<input autoComplete="new-password" className="form-control" type="password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label className="form-label">Confirm New Password<input autoComplete="new-password" className="form-control" type="password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <p className="settings-panel-copy">After changing your password, all sessions will be signed out.</p>
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="toolbar-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => { setEditing(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn btn-brand" disabled={busy}>{busy ? 'Updating…' : 'Change Password'}</button>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}

function ConnectionHealthIndicator() {
  const [health, setHealth] = useState<{ status: 'checking' | 'healthy' | 'slow' | 'offline'; database: string; latency: number | null; checked: string }>({ status: 'checking', database: 'checking', latency: null, checked: '' });
  const [expanded, setExpanded] = useState(false);
  const healthRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(healthRef, expanded, () => setExpanded(false));
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const started = performance.now();
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(`${apiBase.replace(/\/api\/?$/, '')}/health`, { cache: 'no-store', signal: controller.signal });
          const latency = Math.round(performance.now() - started);
          const result = response.ok ? await response.json() as { database?: string } : null;
          const database = result?.database ?? 'unknown';
          if (alive) setHealth({
            status: !response.ok || database === 'unavailable' ? 'offline'
              : database !== 'healthy' || latency > 2500 ? 'slow' : 'healthy',
            database, latency, checked: new Date().toLocaleTimeString()
          });
        } finally { window.clearTimeout(timeout); }
      } catch {
        if (alive) setHealth({ status: 'offline', database: 'unreachable', latency: null, checked: new Date().toLocaleTimeString() });
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 30000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);
  return <div className="connection-health-wrap" ref={healthRef}>
    <button type="button" className={`icon-button connection-health-${health.status}`} onClick={() => setExpanded((value) => !value)}
      aria-label={`API connection: ${health.status}`} aria-expanded={expanded} title={`API connection: ${health.status}`}>
      {health.status === 'offline' ? <WifiOff size={18} /> : <Wifi size={18} />}
    </button>
    {expanded && <div className="connection-health-popover" role="status">
      <strong>Connection health</strong>
      <p>API: {health.status}</p>
      <p>Response: {health.latency === null ? 'Unavailable' : `${health.latency} ms`}</p>
      <p>Checked: {health.checked || 'Checking…'}</p>
      <p>Database: {health.database}</p>
    </div>}
  </div>;
}

function isAuthErrorMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('401')
    || text.includes('bearer access token required')
    || text.includes('access token is invalid or expired')
    || text.includes('access token has been revoked')
    || text.includes('refresh token')
    || text.includes('session-expired')
    || text.includes('unable to refresh the login session');
}

function withAuthRefreshLock(refresh: () => Promise<Response>, signal?: AbortSignal): Promise<Response> {
  if (typeof navigator === 'undefined' || !navigator.locks) return refresh();
  // A request can wait behind another tab's Web Lock before fetch even starts.
  // Applying the abort signal to the lock itself bounds that wait as well.
  return navigator.locks.request('metadrive-auth-refresh', { signal }, refresh).then(async (response) => await response);
}

function refreshAccessToken() {
  if (!refreshInFlight) {
    const startedToken = accessToken;
    refreshInFlight = withAuthRefreshLock(() =>
      fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' })
    )
      .then(async (response) => {
        if (!response.ok) {
          // Only expire the session if our token didn't change while refreshing.
          // Otherwise another tab already refreshed and we hold a stale in-memory token.
          if (accessToken === startedToken) {
            accessToken = undefined;
            window.dispatchEvent(new Event('metadrive:session-expired'));
          }
          return undefined;
        }
        const session = await response.json() as { access_token: string };
        accessToken = session.access_token;
        return accessToken;
      })
      .catch((error: unknown) => {
        if (accessToken === startedToken) {
          accessToken = undefined;
          window.dispatchEvent(new Event('metadrive:session-expired'));
        }
        throw new Error(`Unable to refresh the login session: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
  }
  return refreshInFlight;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | undefined) => fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
      'X-MetaDrive-Request-Source': 'web-app'
    }
  });
  const sentToken = accessToken;
  let response = await send(sentToken);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    // If another request already refreshed while we were in flight, reuse that token.
    // Otherwise join the single shared refresh instead of firing N parallel refreshes
    // (parallel refreshes reuse the same rotation cookie -> family revoked -> logout).
    const token = accessToken !== undefined && accessToken !== sentToken
      ? accessToken
      : await refreshAccessToken();
    // Only retry once with a *different* token; retrying with the same/empty token
    // just repeats the 401 and can trigger another refresh loop.
    if (token && token !== sentToken) response = await send(token);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as T & { error?: string; details?: unknown };
  if (!response.ok) {
    const details = Array.isArray(payload.details)
      ? payload.details.map(String).join('; ')
      : typeof payload.details === 'string'
        ? payload.details
        : payload.details
          ? JSON.stringify(payload.details)
          : '';
    throw new ApiRequestError(
      `${payload.error ?? `Request failed (${response.status})`}${details ? `: ${details}` : ''}`,
      payload, response.status
    );
  }
  return payload;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly responseBody: unknown, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function loadAppCommunicationHistory(objectName: string, field: string, source: string, offset: number, search: string) {
  const params = new URLSearchParams({
    limit: '50', offset: String(offset), ...(field ? {filterField:field, filterValue:source} : {}),
    ...(search ? { search } : {})
  });
  return apiRequest<{ records: Array<{ Id: string; [key: string]: unknown }>; total: number }>(
    `/records/${encodeURIComponent(objectName)}?${params.toString()}`);
}

async function loadConnectorMarketplaceApps() {
  const result = await apiRequest<{records: import('./ConnectorAppWorkspace').ConnectorApp[]}>(`/connector-apps/catalog`);
  return result.records;
}
async function executeConnectorAppLifecycleFlow(apiName: string, appKey: string): Promise<void> {
  await apiRequest(`/flows/${encodeURIComponent(apiName)}/execute`, {
    method: 'POST', body: JSON.stringify({AppKey:appKey})
  });
}
async function loadFlowScreenRecords(objectApiName: string): Promise<Record<string, unknown>[]> {
  const result = await apiRequest<{ records: Record<string, unknown>[] }>(`/records/${encodeURIComponent(objectApiName)}`);
  return result.records;
}

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
      accessToken = undefined;
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
          accessToken = undefined;
          setAuthError('');
          setAuthState('anonymous');
          return;
        }

        if (response.ok) {
          const session = await response.json() as { access_token: string; landing?: LandingBootstrap };
          accessToken = session.access_token;
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
  return <SetupApp entryTiming={entryTiming} onLogout={() => { accessToken = undefined; setAuthState('anonymous'); }} />;
}

const uneSolutionsLogoUrl = `${import.meta.env.BASE_URL}une-solutions-logo.webp`;

function Login({ error, onSuccess, onRetry }: { error?: string; onSuccess?: (timing: EntryTiming) => void; onRetry?: () => void }) {
  const recoveryQuery = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(recoveryQuery.get('resetEmail') ?? '');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState(recoveryQuery.get('resetToken') ?? '');
  const [resetRequested, setResetRequested] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [resetFinished, setResetFinished] = useState(false);
  useEffect(() => {
    if (!resetToken) return;
    const clean = new URL(window.location.href);
    clean.searchParams.delete('resetEmail');
    clean.searchParams.delete('resetToken');
    window.history.replaceState(window.history.state, '', clean.pathname + clean.search + clean.hash);
  }, []);

  const [mfaChallenge, setMfaChallenge] = useState<{ challenge_token: string; enrollment_required: boolean; setup_secret?: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(Boolean(resetToken));
  const [message, setMessage] = useState(error ?? '');
  const [submitting, setSubmitting] = useState(false);
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startedAt = performance.now();
    setSubmitting(true);
    setMessage('');
    try {
      const session = await apiRequest<{ access_token?: string; landing?: LandingBootstrap; mfa_required?: boolean; challenge_token?: string; enrollment_required?: boolean; setup_secret?: string }>('/auth/login?landing=1', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (session.mfa_required && session.challenge_token) {
        setMfaChallenge({ challenge_token: session.challenge_token, enrollment_required: Boolean(session.enrollment_required), setup_secret: session.setup_secret });
        setPassword('');
        return;
      }
      if (!session.access_token) throw new Error('Authentication did not return an access token');
      accessToken = session.access_token;
      onSuccess?.({ kind: 'login', startedAt, authenticatedAt: performance.now(), landing: session.landing });
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };
  const verifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfaChallenge) return;
    setSubmitting(true);
    setMessage('');
    const startedAt = performance.now();
    try {
      const session = await apiRequest<{ access_token: string; landing?: LandingBootstrap }>('/auth/mfa/verify?landing=1', {
        method: 'POST',
        body: JSON.stringify({ challenge_token: mfaChallenge.challenge_token, code: mfaCode })
      });
      accessToken = session.access_token;
      onSuccess?.({ kind: 'login', startedAt, authenticatedAt: performance.now(), landing: session.landing });
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'MFA verification failed');
    } finally { setSubmitting(false); }
  };
  if (mfaChallenge) return <main className="auth-screen">
    <form className="auth-card" onSubmit={(event) => void verifyMfa(event)}>
      <img className="auth-brand-logo" src={uneSolutionsLogoUrl} alt="UNE Solutions" />
      <div className="eyebrow">ACCOUNT SECURITY</div>
      <h1>{mfaChallenge.enrollment_required ? 'Set up your authenticator' : 'Verify your identity'}</h1>
      {mfaChallenge.enrollment_required && <>
        <p>In your authenticator app, add an account manually using this setup key. Then enter its six-digit code to finish enrollment.</p>
        <div className="auth-notice"><strong>Setup key</strong><p><code style={{ overflowWrap: 'anywhere' }}>{mfaChallenge.setup_secret}</code></p></div>
      </>}
      {!mfaChallenge.enrollment_required && <p>Enter the current six-digit code from your authenticator app.</p>}
      {message && <div className="auth-error" role="alert">{message}</div>}
      <label className="form-label" htmlFor="login-mfa-code">Authenticator code</label>
      <input className="form-control" id="login-mfa-code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
        autoComplete="one-time-code" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/[^0-9]/g, ''))} />
      <button className="btn btn-brand auth-submit" disabled={submitting}>{submitting ? 'Verifying…' : 'Verify and sign in'}</button>
      <button className="text-action auth-back" type="button" onClick={() => {
        setMfaChallenge(null); setMfaCode(''); setMessage('');
      }}>Back to sign in</button>
    </form>
  </main>;
  const requestReset = async () => {
    setSubmitting(true); setMessage('');
    try {
      const response = await apiRequest<{ message: string }>('/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email })
      });
      setMessage(response.message);
      setResetRequested(true);
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Unable to request reset'); }
    finally { setSubmitting(false); }
  };
  const confirmReset = async () => {
    if (newPassword !== repeatPassword) { setMessage('Passwords do not match.'); return; }
    setSubmitting(true); setMessage('');
    try {
      await apiRequest('/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ email, token: resetToken, newPassword })
      });
      setResetFinished(true); setResetToken(''); setNewPassword(''); setRepeatPassword('');
      setMessage('Password changed. Sign in with your new password. Your MFA requirements remain unchanged.');
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Unable to reset password'); }
    finally { setSubmitting(false); }
  };
  if (showPasswordReset) return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="password-reset-heading">
      <img className="auth-brand-logo" src={uneSolutionsLogoUrl} alt="UNE Solutions" />
      <div className="eyebrow">ACCOUNT RECOVERY</div>
      <h1 id="password-reset-heading">{resetToken || resetRequested ? 'Verify and reset password' : 'Reset your password'}</h1>
      {message && <div className="auth-notice" role="status">{message}</div>}
      {!resetFinished && <>
        <label className="form-label" htmlFor="reset-email">Account email</label>
        <input className="form-control" id="reset-email" type="email" value={email}
          onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        {resetToken || resetRequested ? <>
          <label className="form-label" htmlFor="reset-code">Verification code (6 digits), or use your emailed reset link</label>
          <input className="form-control" id="reset-code" type="text" inputMode="numeric" maxLength={64} autoComplete="one-time-code" value={resetToken} onChange={(event) => setResetToken(event.target.value.replace(/[^0-9A-Za-z_-]/g, ''))} />
          <label className="form-label" htmlFor="reset-password">New password (minimum 12 characters)</label>
          <input className="form-control" id="reset-password" type="password" minLength={12}
            autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <label className="form-label" htmlFor="reset-confirm">Confirm password</label>
          <input className="form-control" id="reset-confirm" type="password" minLength={12}
            autoComplete="new-password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
          <button className="btn btn-brand auth-submit" type="button"
            disabled={submitting || !email || newPassword.length < 12 || !repeatPassword}
            onClick={() => void confirmReset()}>{submitting ? 'Saving…' : 'Reset password'}</button>
        </> : <>
          <p>We'll email a single-use verification code or a reset link according to your tenant recovery settings. It expires in 15 minutes.</p>
          <button className="btn btn-brand auth-submit" type="button" disabled={submitting || !email}
            onClick={() => void requestReset()}>{submitting ? 'Sending…' : 'Send verification'}</button>
        </>}
      </>}
      <button className="text-action auth-back" type="button" onClick={() => {
        setMessage(''); setShowPasswordReset(false); setResetToken(''); setResetRequested(false); setResetFinished(false);
      }}>Back to sign in</button>
    </section>
  </main>;
  return <main className="auth-screen">
    <form className="auth-card" onSubmit={(event) => void signIn(event)}>
      <img className="auth-brand-logo" src={uneSolutionsLogoUrl} alt="UNE Solutions" />
      <div className="eyebrow">UNEENGINE WORKSPACE</div>
      <h1>Welcome back</h1>
      <p>Sign in to manage your organization’s metadata and workflows.</p>
      {message && <div className="auth-error" role="alert">{message}{onRetry && <button type="button" className="text-action" onClick={onRetry}>Retry connection</button>}</div>}
      <label className="form-label" htmlFor="login-email">Email</label>
      <input className="form-control" id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
      <label className="form-label" htmlFor="login-password">Password</label>
      <input className="form-control" id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
      <button className="text-action auth-forgot" type="button" onClick={() => { setMessage(''); setShowPasswordReset(true); }}>Forgot password?</button>
      <button className="btn btn-brand auth-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}

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

const { RecordWorkspace, RecordFormDialog } = createRecordWorkspaceViews(apiRequest, usePageLayoutDevice, ApiRequestError, () => accessToken);

const SetupHome = createSetupHome(PageHeading);

const { AutomationSettingsWorkspace, TenantEmailRecoverySettings, TenantUserLockSettings, AccountSessionSecurity, TenantSecurityAudit, TenantMfaSettings, CompanySettings } = createSettingsViews(apiRequest, PageHeading);

const ObjectManager = createObjectManager(apiRequest);

const PageBuilder = createPageBuilder(MetadataComponentProperties);

const Permissions = createPermissions(apiRequest, PageHeading);

export default App;
