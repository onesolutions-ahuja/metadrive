import { loadPageBuilderFactory, loadObjectManagerFactory, LazyReportBuilder } from '../../builders/Entries/optionalBuilderEntries';
import { createLoginView } from '../../authentication/Login/loginView';
import { apiBase, getAccessToken, setAccessToken, apiRequest, ApiRequestError, isAuthErrorMessage, withAuthRefreshLock, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords } from '../../authentication/Client/authClient';



import { parseAppRoute, appRoutePath } from '../Navigation/appRouting';
import {resolveStandaloneEntry,standaloneCanonicalPath,standaloneEntryForAppId} from '../Standalone/standaloneEntries';








import * as React from 'react';

import { useEffect, useRef, useState, type ReactNode } from 'react';






































import { type ObjectMetadata, type RelatedLookupFilterMetadata, type FlowDefinitionMetadata, type LightningPageMetadata, type LightningAppMetadata } from '../../metadata/Definitions/metadata';

type NewFieldLookupFilterDraft = {
  id: string;
  relatedFieldApiName: string;
  operator: RelatedLookupFilterMetadata['operator'];
  valueMode: 'Value' | 'Field';
  value: string;
  valueFieldApiName: string;
  required: boolean;
};



const LazyOAuthConsent=React.lazy(()=>import('../../authentication/Login/OAuthConsent'));
const LazyStandaloneRuntime=React.lazy(()=>import('../Standalone/StandaloneRuntime'));
const LazyAceKiosk=React.lazy(()=>import('../../../../../acekiosk/src/AceKiosk'));
function AceKioskAccessGate({onLogout}:{onLogout:()=>void}){
 type AppAccess={installed:boolean;licensed:boolean;enabled:boolean;permitted:boolean};
 const [access,setAccess]=React.useState<AppAccess|null>(null);
 const [failure,setFailure]=React.useState('');
 React.useEffect(()=>{
  let mounted=true;
  void apiRequest<AppAccess>('/metadata/apps/AceKiosk/access')
   .then(value=>{if(mounted)setAccess(value);})
   .catch(error=>{if(mounted)setFailure(error instanceof Error?error.message:'Unable to verify app access');});
  return()=>{mounted=false;};
 },[]);
 if(!access&&!failure)return <main role="status">Checking AceKiosk access…</main>;
 if(!access)return <main role="alert">AceKiosk access check failed: {failure}. Please sign in again or contact your tenant administrator.</main>;
 if(!access.installed)return <main role="alert">AceKiosk is not installed for this tenant. Install AceKiosk from AppExchange.</main>;
 if(!access.licensed)return <main role="alert">AceKiosk licence is missing, inactive or expired for this tenant. Activate its entitlement in AppExchange.</main>;
 if(!access.enabled)return <main role="alert">AceKiosk is disabled in the app catalogue. Contact your platform administrator.</main>;
 if(!access.permitted)return <main role="alert">AceKiosk is installed and licensed, but your user lacks App:AceKiosk → read permission. Assign that permission through OneEngine RBAC. Setting Default landing page does not grant access.</main>;
 return <React.Suspense fallback={<main role="status">Opening AceKiosk…</main>}><LazyAceKiosk onLogout={onLogout}/></React.Suspense>;
}
type AuthState = 'restoring' | 'anonymous' | 'authenticated' | 'error';
type LandingBootstrap = {
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  apps: LightningAppMetadata[];
  user: {
    profileId: string;
    permissions: string[];
    fieldAccess: Record<string, { read: boolean; edit: boolean }>;
    recordTypeAccess: Record<string, boolean>;
    landingAppApi?: string;
  };
};
type EntryTiming = { kind: 'login' | 'restore'; startedAt: number; authenticatedAt: number; landing?: LandingBootstrap; landingAppApi?: string };


function App() {
  // Handle bookmarked UNE app routes before the generic Setup shell initialises.
  const legacyStandalonePath=standaloneCanonicalPath(window.location.pathname,window.location.search,import.meta.env.BASE_URL);
  const entryPath=legacyStandalonePath?legacyStandalonePath.split('?')[0]:window.location.pathname;
  const standaloneEntry=resolveStandaloneEntry(entryPath,import.meta.env.BASE_URL);
  React.useLayoutEffect(()=>{
    if(legacyStandalonePath)window.history.replaceState({},'',legacyStandalonePath);
  },[legacyStandalonePath]);
  const [authState, setAuthState] = useState<AuthState>('restoring');
  const [authError, setAuthError] = useState('');
  const [entryTiming, setEntryTiming] = useState<EntryTiming | null>(null);
  const sessionRestoreStarted = useRef(false);
  // Keep the Login form hidden until the refresh cookie has been checked.
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
    // Bound a hung refresh to one timeout window. Retrying an aborted request
    // automatically doubled the worst-case wait to ~20 seconds without evidence
    // that the second request could succeed; show the existing explicit Retry UI.
    // Fast transient network failures and retryable HTTP responses still get one retry.
    const retryDelaysMs = [1000];

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
          const session = await response.json() as { access_token: string; landing?: LandingBootstrap; landingAppApi?: string };
          setAccessToken(session.access_token);
          setAuthError('');
          setEntryTiming({ kind: 'restore', startedAt: restoreStartedAt, authenticatedAt: performance.now(), landing: session.landing, landingAppApi: session.landingAppApi });
          setAuthState('authenticated');
          return;
        }

        if (!retryableStatuses.has(response.status) || attempt === retryDelaysMs.length) {
          throw new Error(`Session restore failed (${response.status})`);
        }
      } catch (error) {
        if (!stillCurrent()) return;
        const timedOut = error instanceof DOMException && error.name === 'AbortError';
        const retryableNetworkFailure = error instanceof TypeError;

        // A timeout is already the full request budget. Do not silently spend
        // another full timeout on an automatic retry; the screen exposes Retry.
        if (timedOut || !retryableNetworkFailure || attempt === retryDelaysMs.length) {
          setAuthError(timedOut
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
    // SSO returns to the registered tenant root. Restore only this fixed consent
    // route; the server revalidates every client, redirect, scope and user grant.
    try{if(window.location.pathname==='/'&&!window.location.search){const raw=sessionStorage.getItem('md_oauth_return');if(raw){sessionStorage.removeItem('md_oauth_return');const saved=JSON.parse(raw);if(saved.expires>Date.now()&&typeof saved.query==='string'&&saved.query.startsWith('?')&&saved.query.length<8000)window.history.replaceState({},'','/oauth/authorize'+saved.query);}}}catch{/* Storage can be disabled. The client can restart authorization. */}
    sessionRestoreStarted.current = true;
    void restoreSession();
  }, []);

  // Do not render Setup Home while resolving the authenticated landing destination.
  // The preference arrives with login/refresh; no second /auth/me round trip.
  const route=parseAppRoute(window.location.pathname,window.location.search);
  const entryIsHome=window.location.pathname==='/login'
    ||(route.kind==='setup'&&route.workspace==='home');
  const landingApp=entryTiming?.landingAppApi??entryTiming?.landing?.user?.landingAppApi??'Setup';
  const needsLandingRedirect=authState==='authenticated'&&!standaloneEntry&&entryIsHome
    &&(landingApp.toLowerCase()!=='setup'||window.location.pathname==='/login');
  useEffect(()=>{
    if(!needsLandingRedirect)return;
    const preferred=landingApp.toLowerCase();
    if(preferred==='setup'){
      if(window.location.pathname==='/login')window.location.replace(appRoutePath({kind:'setup',workspace:'home'}));
      return;
    }
    const standalone=standaloneEntryForAppId(landingApp);
    const destination=standalone?'/'+standalone.slug:appRoutePath({kind:'app-home',appId:landingApp});
    window.location.replace(destination);
  },[needsLandingRedirect,landingApp]);

  useEffect(()=>{
    if(authState==='anonymous'&&!standaloneEntry&&window.location.pathname!=='/login'&&window.location.pathname!=='/oauth/authorize'){
      window.location.replace('/login');
    }
  },[authState,standaloneEntry]);
  const loginSuccess = (timing: EntryTiming) => { sessionGeneration.current += 1; setEntryTiming(timing); setAuthState('authenticated'); };
  const cancelRestore = () => { sessionGeneration.current += 1; };
  if (authState === 'restoring') return <div className="auth-loading" role="status">Restoring session…</div>;
  if (authState === 'anonymous' && !standaloneEntry && window.location.pathname!=='/login') return <div role="status">Opening login…</div>;
  if (authState === 'anonymous') return <Login branding={standaloneEntry??undefined} onStart={cancelRestore} onSuccess={loginSuccess} />;
  if (authState === 'error') return <Login branding={standaloneEntry??undefined} error={authError} onStart={cancelRestore} onSuccess={loginSuccess} onRetry={() => { setAuthError(''); setAuthState('anonymous'); void restoreSession(); }} />;
  if(window.location.pathname==='/oauth/authorize')return <React.Suspense fallback={<div role="status">Loading consent…</div>}><LazyOAuthConsent/></React.Suspense>;
  const onLogout=()=>{
    sessionGeneration.current += 1;
    setAccessToken(undefined);
    // Logout links navigate to /login. Do not render a half-reset workspace
    // during that navigation, which can trip the global workspace boundary.
    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
      return;
    }
    setEntryTiming(null);
    setAuthState('anonymous');
  };
  if(needsLandingRedirect)return <div className="auth-loading" role="status">Opening assigned application…</div>;
  if(standaloneEntry)return <React.Suspense fallback={<div className="auth-loading" role="status">Opening application…</div>}>{standaloneEntry.slug==='acekiosk'?<AceKioskAccessGate onLogout={onLogout}/>:<LazyStandaloneRuntime entry={standaloneEntry} onLogout={onLogout}/>}</React.Suspense>;
  return <SetupApp entryTiming={entryTiming} onLogout={onLogout} />;
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
let pageRuntimeViewsPromise: ReturnType<typeof import('../../pages/PageRuntime/pageRuntimeViews').createPageRuntimeViews> | undefined;
async function loadPageRuntimeViews() {
  if (pageRuntimeViewsPromise) return pageRuntimeViewsPromise;
  const { createPageRuntimeViews } = await import('../../pages/PageRuntime/pageRuntimeViews');
  pageRuntimeViewsPromise = createPageRuntimeViews(apiRequest);
  return pageRuntimeViewsPromise;
}
const LazySetupWorkspace = React.lazy(async () => {
  const [{ createSetupApp }, { ProfilePasswordMenu, ConnectionHealthIndicator }, { customTabStyles }] = await Promise.all([
    import('../SetupShell/setupAppShell'), import('../../authentication/AuthStatus/authStatusViews'), import('../SetupShell/customTabStyles')
  ]);
  const LightningAppRuntime = React.lazy(async () => ({
    default: (await loadPageRuntimeViews()).LightningAppRuntime
  }));
  const RecordWorkspace = React.lazy(async () => {
    const [{ createRecordWorkspaceViews }, runtime] = await Promise.all([
      import('../../records/RecordWorkspace/recordWorkspaceViews'), loadPageRuntimeViews()
    ]);
    return { default: createRecordWorkspaceViews(apiRequest, runtime.usePageLayoutDevice,
      ApiRequestError, getAccessToken, runtime.RuntimeReportChart, runtime.MetadataBoundPageComponent).RecordWorkspace };
  });
  const PageBuilder = React.lazy(async () => {
    const [createPageBuilder, { MetadataComponentProperties }, runtime] = await Promise.all([
      loadPageBuilderFactory(), import('../../builders/ComponentProperties/componentPropertiesView'), loadPageRuntimeViews()
    ]);
    return { default: createPageBuilder(MetadataComponentProperties, runtime.MetadataBoundPageComponent) };
  });
  return { default: createSetupApp({isAuthErrorMessage, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords, apiRequest, ApiRequestError, fetchFlowListPage, customTabStyles, uneSolutionsLogoUrl, ProfilePasswordMenu, ConnectionHealthIndicator, LightningAppRuntime, RecordWorkspace, ObjectManager, PageBuilder, ReportBuilder, Permissions, SetupHome, AutomationSettingsWorkspace, CompanySettings, TenantMfaSettings, TenantSecurityAudit, TenantUserLockSettings, AccountSessionSecurity, TenantEmailRecoverySettings}) };
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
const SetupHome = React.lazy(async () => ({ default: (await import('../../settings/SetupHome/setupHomeView')).createSetupHome(PageHeading) }));
const ObjectManager = React.lazy(async () => ({ default: (await loadObjectManagerFactory())(apiRequest) }));
const ReportBuilder = LazyReportBuilder;
const Permissions = React.lazy(async () => ({ default: (await import('../../security/Permissions/permissionsView')).createPermissions(apiRequest, PageHeading) }));
const settingsViewModules = () => import('../../settings/SettingsWorkspace/settingsWorkspaceViews').then(module => module.createSettingsViews(apiRequest, PageHeading));
const AutomationSettingsWorkspace = React.lazy(async () => ({ default: (await settingsViewModules()).AutomationSettingsWorkspace }));
const TenantEmailRecoverySettings = React.lazy(async () => ({ default: (await settingsViewModules()).TenantEmailRecoverySettings }));
const TenantUserLockSettings = React.lazy(async () => ({ default: (await settingsViewModules()).TenantUserLockSettings }));
const AccountSessionSecurity = React.lazy(async () => ({ default: (await settingsViewModules()).AccountSessionSecurity }));
const TenantSecurityAudit = React.lazy(async () => ({ default: (await settingsViewModules()).TenantSecurityAudit }));
const TenantMfaSettings = React.lazy(async () => ({ default: (await settingsViewModules()).TenantMfaSettings }));
const CompanySettings = React.lazy(async () => ({ default: (await settingsViewModules()).CompanySettings }));

export default App;
