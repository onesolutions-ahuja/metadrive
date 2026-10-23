import React from 'react';
import ReactDOM from 'react-dom/client';
import '../WorkspaceTheme/design-system.css';
import '../WorkspaceTheme/styles.css';
import App from '../App/App';

// Independent HTML entry, reusing shared authentication, One components,
// SQL-backed published Page Runtime and central RBAC. No duplicate POS engine.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
