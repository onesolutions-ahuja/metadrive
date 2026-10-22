import { useEffect, useState } from 'react';
import { reconcileNavigationOrder } from './appNavigation';
import type { LightningAppMetadata } from '../../metadata/Definitions/metadata';

export function resolveCurrentAppNavigation(app: LightningAppMetadata | undefined) {
  return app ? reconcileNavigationOrder(app.navigationItems ?? [], app.navigationPageApiNames ?? [], app.navigationOrder ?? []) : [];
}

export function NavigationLoadTime({ routeKey, startedAt, ready, kind, authMs }: {
  routeKey: string;
  startedAt: number;
  ready: boolean;
  kind: 'login' | 'restore' | 'navigation';
  authMs: number | null;
}) {
  const [result, setResult] = useState<{ routeKey: string; milliseconds: number } | null>(null);
  useEffect(() => {
    // Never declare a screen loaded while its essential metadata is outstanding.
    if (!ready) return;
    let idleTimer: number | undefined;
    let observer: MutationObserver | undefined;
    let cancelled = false;
    let animation: number | undefined;
    const complete = () => {
      if (cancelled) return;
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(idleTimer);
      setResult({ routeKey, milliseconds: Math.max(0, performance.now() - startedAt) });
    };
    const schedule = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        const content = document.querySelector('.lightning');
        const stillLoading = content?.querySelector('[aria-busy="true"], [role="progressbar"], .records-loading, .loading-spinner');
        if (stillLoading) schedule();
        else complete();
      }, 120);
    };
    animation = window.requestAnimationFrame(() => {
      const content = document.querySelector('.lightning');
      if (content) {
        // Background notifications, header health and editor loads are not
        // landing-page blockers. Only extend the timer for a real busy UI.
        observer = new MutationObserver(() => {
          if (content.querySelector('[aria-busy="true"], [role="progressbar"], .records-loading, .loading-spinner')) schedule();
        });
        observer.observe(content, { childList: true, subtree: true, characterData: true });
      }
      schedule();
    });
    return () => {
      cancelled = true;
      if (animation !== undefined) window.cancelAnimationFrame(animation);
      observer?.disconnect();
      window.clearTimeout(idleTimer);
    };
  }, [routeKey, startedAt, ready]);
  const isEntry = kind !== 'navigation';
  const label = kind === 'login' ? 'Login → Landing' : kind === 'restore' ? 'Session → Landing' : 'Page navigation';
  const completed = result?.routeKey === routeKey;
  const requestSeconds = authMs === null ? null : (authMs / 1000).toFixed(2);
  // Retain the existing opt-out for environments that explicitly disable diagnostics.
  // Production should display the same useful screen and authentication timing as development.
  if (import.meta.env.VITE_SHOW_NAV_TIMINGS === 'false') return null;
  return <span className="navigation-load-time" role="status" aria-label="Screen load time"
    title={isEntry
      ? `From ${kind === 'login' ? 'Sign in click' : 'session restoration'} until landing content is ready. session request: ${requestSeconds ?? 'unknown'}s.`
      : 'From route navigation until page content is ready.'}>
    {completed ? `${label}: ${(result.milliseconds / 1000).toFixed(2)}s` : `${label}: Loading…`}
    {isEntry && requestSeconds !== null && ` · Auth: ${requestSeconds}s`}
  </span>;
}
