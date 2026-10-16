import { loadPageBuilderFactory, loadObjectManagerFactory, LazyReportBuilder } from './builders/optionalBuilderEntries';
import { createLoginView } from './loginView';
import { apiBase, getAccessToken, setAccessToken, apiRequest, ApiRequestError, isAuthErrorMessage, withAuthRefreshLock, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords } from './authClient';



import { parseAppRoute, appRoutePath } from './appRouting';








import * as React from 'react';

import { useEffect, useRef, useState, type ReactNode } from 'react';






































import { type ObjectMetadata, type RelatedLookupFilterMetadata, type FlowDefinitionMetadata, type LightningPageMetadata, type LightningAppMetadata } from './metadata';

type NewFieldLookupFilterDraft = {
  id: string;
  relatedFieldApiName: string;
  operator: RelatedLookupFilterMetadata['operator'];
  valueMode: 'Value' | 'Field';
  value: string;
  valueFieldApiName: string;
  required: boolean;
};



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
  // Discard any in-flight refresh response after logout or another auth transition.
  const sessionGeneration = useRef(0);
  useEffect(() => {
    const expireSession = () => {
      sessionGeneration.current += 1;
      setAccessToken(undefined);
      setAuthState('anonymous');
    };
    window.addEventListener('metadrive:session-expired', expireSession);
    return () => window.removeEventListener('metadrive:session-expired', expireSession);
  }, []);

  const restoreSession = async () => {
    const generation = ++sessionGeneration.current;
    const stillCurrent = () => generation === sessionGeneration.current;
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

        if (!stillCurrent()) return;
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
        if (!stillCurrent()) return;
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
      if (!stillCurrent()) return;
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
  const loginSuccess = (timing: EntryTiming) => { sessionGeneration.current += 1; setEntryTiming(timing); setAuthState('authenticated'); };
  if (authState === 'anonymous') return <Login onSuccess={loginSuccess} />;
  if (authState === 'error') return <Login error={authError} onSuccess={loginSuccess} onRetry={() => { setAuthState('loading'); void restoreSession(); }} />;
  return <SetupApp entryTiming={entryTiming} onLogout={() => { sessionGeneration.current += 1; setEntryTiming(null); setAccessToken(undefined); setAuthState('anonymous'); }} />;
}

const uneSolutionsLogoUrl = `${import.meta.env.BASE_URL}une-solutions-logo.webp`;

const Login = createLoginView(uneSolutionsLogoUrl);

async function fetchFlowListPage(page: number, search: string) {
  return apiRequest<{
    flows: Array<Pick<FlowDefinitionMetadata, 'apiName' | 'label' | 'flowType' | 'status' | 'versionNumber' | 'activeVersion' | 'createdAt' | 'createdBy' | 'lastModifiedAt' | 'lastModifiedBy'>>;
    total: number; page: number; pageSize: number;
  }>(`/metadata/flows/list?page=${encodeURIComponent(String(page))}&search=${encodeURIComponent(search)}`);
}


// The full setup workspace is an on-demand route module, never part of the login bundle.
// Keep the Page Runtime out of Setup administration, including Tenant Management.
// Only published App Pages, Records and Page Builder need this optional bundle.
let pageRuntimeViewsPromise: ReturnType<typeof import('./pageRuntimeViews').createPageRuntimeViews> | undefined;
async function loadPageRuntimeViews() {
  if (pageRuntimeViewsPromise) return pageRuntimeViewsPromise;
  const { createPageRuntimeViews } = await import('./pageRuntimeViews');
  pageRuntimeViewsPromise = createPageRuntimeViews(apiRequest);
  return pageRuntimeViewsPromise;
}
const LazySetupWorkspace = React.lazy(async () => {
  const [{ createSetupApp }, { ProfilePasswordMenu, ConnectionHealthIndicator }, { customTabStyles }] = await Promise.all([
    import('./setupAppShell'), import('./authStatusViews'), import('./shell/customTabStyles')
  ]);
  const LightningAppRuntime = React.lazy(async () => ({
    default: (await loadPageRuntimeViews()).LightningAppRuntime
  }));
  const RecordWorkspace = React.lazy(async () => {
    const [{ createRecordWorkspaceViews }, runtime] = await Promise.all([
      import('./recordWorkspaceViews'), loadPageRuntimeViews()
    ]);
    return { default: createRecordWorkspaceViews(apiRequest, runtime.usePageLayoutDevice,
      ApiRequestError, getAccessToken, runtime.RuntimeReportChart, runtime.MetadataBoundPageComponent).RecordWorkspace };
  });
  const PageBuilder = React.lazy(async () => {
    const [createPageBuilder, { MetadataComponentProperties }, runtime] = await Promise.all([
      loadPageBuilderFactory(), import('./componentPropertiesView'), loadPageRuntimeViews()
    ]);
    return { default: createPageBuilder(MetadataComponentProperties, runtime.MetadataBoundPageComponent) };
  });
  return { default: createSetupApp({isAuthErrorMessage, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords, apiRequest, ApiRequestError, fetchFlowListPage, customTabStyles, uneSolutionsLogoUrl, ProfilePasswordMenu, ConnectionHealthIndicator, ConnectorSettingsWorkspace, LightningAppRuntime, RecordWorkspace, ObjectManager, PageBuilder, ReportBuilder, Permissions, SetupHome, AutomationSettingsWorkspace, CompanySettings, TenantMfaSettings, TenantSecurityAudit, TenantUserLockSettings, AccountSessionSecurity, TenantEmailRecoverySettings}) };
});
function SetupApp(props: {onLogout: () => void; entryTiming: EntryTiming | null}) {
  return <React.Suspense fallback={<div className="auth-loading">Loading workspace…</div>}><LazySetupWorkspace {...props} /></React.Suspense>;
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

// Builders and advanced settings are separate on-demand chunks, not login dependencies.
const ConnectorSettingsWorkspace = React.lazy(async () => ({ default: (await import('./connectorSettingsView')).ConnectorSettingsWorkspace }));
const SetupHome = React.lazy(async () => ({ default: (await import('./setupHomeView')).createSetupHome(PageHeading) }));
const ObjectManager = React.lazy(async () => ({ default: (await loadObjectManagerFactory())(apiRequest) }));
const ReportBuilder = LazyReportBuilder;
const Permissions = React.lazy(async () => ({ default: (await import('./permissionsView')).createPermissions(apiRequest, PageHeading) }));
const settingsViewModules = () => import('./settingsWorkspaceViews').then(module => module.createSettingsViews(apiRequest, PageHeading));
const AutomationSettingsWorkspace = React.lazy(async () => ({ default: (await settingsViewModules()).AutomationSettingsWorkspace }));
const TenantEmailRecoverySettings = React.lazy(async () => ({ default: (await settingsViewModules()).TenantEmailRecoverySettings }));
const TenantUserLockSettings = React.lazy(async () => ({ default: (await settingsViewModules()).TenantUserLockSettings }));
const AccountSessionSecurity = React.lazy(async () => ({ default: (await settingsViewModules()).AccountSessionSecurity }));
const TenantSecurityAudit = React.lazy(async () => ({ default: (await settingsViewModules()).TenantSecurityAudit }));
const TenantMfaSettings = React.lazy(async () => ({ default: (await settingsViewModules()).TenantMfaSettings }));
const CompanySettings = React.lazy(async () => ({ default: (await settingsViewModules()).CompanySettings }));

export default App;
