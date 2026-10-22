import * as React from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {StandaloneEntry} from './standaloneEntries';
import './standaloneRuntime.css';

// The shared web shell routes to independent app-owned UIs.
// Loading one app must not download the other apps' frontend bundles.
const LazyAceAssist=React.lazy(()=>import('../../../../../aceassist/src/AceAssistRuntime'));
const LazyAceChatter=React.lazy(()=>import('../../../../../acechatter/src/AceChatterRuntime'));
const LazyAcetill=React.lazy(()=>import('../../../../../acetill/src/AcetillTerminal'));

/** Standalone routing and shared logout only. Business workflows stay in OneEngine. */
export default function StandaloneRuntime({entry,onLogout}:{
  entry:StandaloneEntry;onLogout:()=>void
}) {
  if(entry.slug==='aceassist')return <React.Suspense fallback={<main role="status">Opening Ace Assist…</main>}>
    <LazyAceAssist entry={entry} onLogout={onLogout}/>
  </React.Suspense>;
  if(entry.slug==='acechatter')return <React.Suspense fallback={<main role="status">Opening AceChatter…</main>}>
    <LazyAceChatter onLogout={onLogout}/>
  </React.Suspense>;
  if(entry.slug!=='acetill')return <main role="alert">Unsupported standalone app.</main>;

  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* Clear local session regardless. */}
    onLogout();
    window.location.assign('/login');
  };
  return <div className="standalone-product" style={{'--product-accent':entry.accent} as React.CSSProperties}>
    <header className="standalone-product-header">
      <div className="standalone-product-brand">
        <span className="standalone-product-mark">A</span>
        <span><strong>Acetill</strong><small>Point of sale</small></span>
      </div>
      <button type="button" className="standalone-product-logout" onClick={()=>void logout()}>Sign out</button>
    </header>
    <React.Suspense fallback={<main role="status">Opening Acetill…</main>}><LazyAcetill/></React.Suspense>
  </div>;
}
