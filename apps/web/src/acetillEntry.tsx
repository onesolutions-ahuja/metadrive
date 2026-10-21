import React from 'react';
import ReactDOM from 'react-dom/client';
import AcetillShell from '../../acetill/src/AcetillShell';

// Independent HTML/Vite entry. The MetaDrive admin workspace is intentionally
// absent from this dependency graph. Authentication and the One library are reused.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AcetillShell /></React.StrictMode>
);
