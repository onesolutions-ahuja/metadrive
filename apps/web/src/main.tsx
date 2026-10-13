import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MarketingSite from './MarketingSite';
import './styles.css';

// The public website lives at /; customer workspaces and deep links stay in
// the existing authenticated application. Do not run session refresh on /.
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const pathname = basePath && window.location.pathname.startsWith(basePath + '/')
  ? window.location.pathname.slice(basePath.length)
  : window.location.pathname;
const isMarketingHome = pathname === '/' || pathname === '/index.html' || (Boolean(basePath) && window.location.pathname === basePath);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMarketingHome ? <MarketingSite /> : <App />}
  </React.StrictMode>
);
