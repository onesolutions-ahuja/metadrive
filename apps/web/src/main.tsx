import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './core/workspace/WorkspaceTheme/design-system.css';
import MarketingSite from './core/public/MarketingSite/MarketingSite';
import { registerUniversalShell } from './core/workspace/Bootstrap/universalShell';
import { isMissingDynamicChunk, recoverMissingDynamicChunk, reloadLatestWorkspace } from './core/workspace/Bootstrap/dynamicChunkRecovery';

registerUniversalShell();

// Vite emits this event for a missing lazy JS/CSS module after Pages publishes
// a new content-hashed build. Fetch the fresh HTML once, never loop on 404s.
window.addEventListener('vite:preloadError', (event: Event) => {
  const payload = (event as Event & { payload?: unknown }).payload;
  if (recoverMissingDynamicChunk(payload)) event.preventDefault();
});

// Keep the authenticated workspace, including its large builder code and CSS,
// out of the initial public marketing bundle.
const Workspace = lazy(async () => {
  await Promise.all([
    import('./core/workspace/WorkspaceTheme/styles.css'), import('./core/workspace/WorkspaceTheme/styles-part2.css'), import('./core/workspace/WorkspaceTheme/styles-audit.css')
  ]);
  return import('./core/workspace/App/App');
});

function WorkspaceLoadingFallback() {
  const [slow,setSlow] = React.useState(false);
  React.useEffect(()=>{
    const timer=window.setTimeout(()=>setSlow(true),12000);
    return ()=>window.clearTimeout(timer);
  },[]);
  return <main role="status" style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'system-ui,sans-serif'}}>
    <div style={{textAlign:'center',maxWidth:480,padding:24}}>
      <p>Loading your workspace…</p>
      {slow && <><p>The workspace is taking longer than expected. You can request the latest application files without losing saved data.</p>
        <button type="button" onClick={reloadLatestWorkspace}>Reload latest version</button></>}
    </div>
  </main>;
}

class WorkspaceFailureBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('MetaDrive workspace failed to render', error, info.componentStack);
    // Preserve the actual browser exception across the immediate login/logout
    // navigation, instead of losing its cause in a one-frame error boundary.
    // No credentials, URLs with queries, cookies, tokens or user records.
    try {
      window.sessionStorage.setItem('md_last_workspace_exception', JSON.stringify({
        route: window.location.pathname,
        errorName: error.name,
        message: error.message.slice(0, 1200),
        componentStack: (info.componentStack ?? '').slice(0, 1800),
        recordedAt: new Date().toISOString()
      }));
    } catch { /* Browsers can disable session storage. */ }
    recoverMissingDynamicChunk(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const missingChunk = isMissingDynamicChunk(this.state.error);
    return <main role="alert" style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 680, margin: '12vh auto' }}>
      <h1>{missingChunk ? 'A new MetaDrive version is available' : 'Workspace could not load'}</h1>
      <p>{missingChunk
        ? 'A previous version of this browser tab requested a JavaScript file that is no longer available. Reload the current page with the latest files. Your saved records are unaffected.'
        : 'The workspace encountered a JavaScript error. Your saved records have not been changed.'}</p>
      <details><summary>Technical details</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.state.error.message}</pre>
      </details>
      <button type="button" onClick={missingChunk ? reloadLatestWorkspace : () => window.location.reload()}>
        {missingChunk ? 'Load latest version' : 'Retry loading'}
      </button>
    </main>;
  }
}

// GitHub Pages /login fallback sends users to /?__spa=%2Flogin. Restore the
// same-origin SPA route before deciding between marketing and workspace.
if (window.location.pathname === '/' && new URLSearchParams(window.location.search).has('__spa')) {
  const route = new URLSearchParams(window.location.search).get('__spa');
  if (route && route.startsWith('/') && !route.startsWith('//') && !route.includes('\\')) {
    const target = new URL(route, window.location.origin);
    if (target.origin === window.location.origin) {
      window.history.replaceState(window.history.state, '', target.pathname + target.search + target.hash);
    }
  }
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const pathname = basePath && window.location.pathname.startsWith(basePath + '/')
  ? window.location.pathname.slice(basePath.length)
  : window.location.pathname;
// Browser regression and local metadata workspaces open the authenticated app at /.
// The public marketing homepage remains the production default.
const workspaceDevelopmentRoot = import.meta.env.DEV && Boolean(import.meta.env.VITE_API_BASE_URL);
// Redirect old metadata workspace links to the Acetill-owned login/POS entry.
if (pathname.toLowerCase().startsWith('/une/apps/acetill/')
  || pathname.toLowerCase() === '/acetill') {
  // Load the real standalone HTML document, not the admin SPA fallback.
  window.location.replace('/acetill/');
}
const isMarketingHome = !workspaceDevelopmentRoot && (pathname === '/' || pathname === '/index.html' || (Boolean(basePath) && window.location.pathname === basePath));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMarketingHome
      ? <MarketingSite />
      : <WorkspaceFailureBoundary><Suspense fallback={<WorkspaceLoadingFallback />}><Workspace /></Suspense></WorkspaceFailureBoundary>}
  </React.StrictMode>
);
