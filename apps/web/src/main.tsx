import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import MarketingSite from './MarketingSite';
import { registerUniversalShell } from './universalShell';

registerUniversalShell();

// Keep the authenticated workspace, including its large builder code and CSS,
// out of the initial public marketing bundle.
const Workspace = lazy(async () => {
  await import('./styles.css');
  await import('./styles-part2.css');
  await import('./styles-audit.css');
  return import('./App');
});

class WorkspaceFailureBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('MetaDrive workspace failed to render', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main role="alert" style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 680, margin: '12vh auto' }}>
      <h1>Workspace could not load</h1>
      <p>The workspace encountered a JavaScript error. Your records have not been changed.</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.state.error.message}</pre>
      <button type="button" onClick={() => window.location.reload()}>Retry loading</button>
    </main>;
  }
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const pathname = basePath && window.location.pathname.startsWith(basePath + '/')
  ? window.location.pathname.slice(basePath.length)
  : window.location.pathname;
// Browser regression and local metadata workspaces open the authenticated app at /.
// The public marketing homepage remains the production default.
const workspaceDevelopmentRoot = import.meta.env.DEV && Boolean(import.meta.env.VITE_API_BASE_URL);
const isMarketingHome = !workspaceDevelopmentRoot && (pathname === '/' || pathname === '/index.html' || (Boolean(basePath) && window.location.pathname === basePath));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMarketingHome
      ? <MarketingSite />
      : <WorkspaceFailureBoundary><Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui,sans-serif' }}>Loading your workspace…</div>}><Workspace /></Suspense></WorkspaceFailureBoundary>}
  </React.StrictMode>
);
