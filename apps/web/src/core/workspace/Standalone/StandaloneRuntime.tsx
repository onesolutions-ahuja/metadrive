import * as React from 'react';
import type {StandaloneEntry} from './standaloneEntries';
import './standaloneRuntime.css';

// The shared web shell routes to independent app-owned UIs.
// Loading one app must not download the other apps' frontend bundles.
const LazyAceAssist=React.lazy(()=>import('../../../../../aceassist/src/AceAssistRuntime'));
const LazyAceChatter=React.lazy(()=>import('../../../../../acechatter/src/AceChatterRuntime'));
const LazyAcetill=React.lazy(()=>import('../../../../../acetill/src/AcetillShell'));

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
  if(entry.slug==='acetill')return <React.Suspense fallback={<main role="status">Opening Acetill…</main>}>
    <LazyAcetill onLogout={onLogout}/>
  </React.Suspense>;
  return <main role="alert">Unsupported standalone app.</main>;
}
