import React from 'react';
import ReactDOM from 'react-dom/client';
import './core/workspace/WorkspaceTheme/design-system.css';
import './core/workspace/WorkspaceTheme/styles.css';
import './core/workspace/WorkspaceTheme/styles-part2.css';
import './core/workspace/WorkspaceTheme/styles-audit.css';
import App from './core/workspace/App/App';

// Independent HTML entry, but the SAME shared auth, tenant-aware published
// Page Runtime, One component renderer and application permissions as MetaDrive.
// The App recognises /acetill/ and never mounts the Setup shell for this route.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
