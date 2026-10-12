import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryComponentMetadata } from './metadata';

const SAFE_KEYS = ['label','device','properties','records','products','categories','cartLines','customers','loading','preview','disabled','sessionId','object','flows','actionError'] as const;
function publicProps(props: Record<string, unknown>): Record<string, unknown> {
  // Explicit allowlist. Never forward credential providers, React internals or auth tokens.
  const result: Record<string, unknown> = {};
  for (const key of SAFE_KEYS) {
    if (!(key in props)) continue;
    try { result[key] = JSON.parse(JSON.stringify(props[key])); } catch { /* reject non-serializable values */ }
  }
  return result;
}
export default function ComponentSandbox({ definition, props }: { definition: LibraryComponentMetadata; props: Record<string, unknown> }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const instance = useMemo(() => crypto.randomUUID(), [definition.apiName]);
  const [ready, setReady] = useState(false);
  const frameOrigin = window.location.origin;
  const asset = new URL(import.meta.env.BASE_URL + 'component-sandbox.js', frameOrigin).toString();
  const safeProps = useMemo(() => publicProps(props), [props]);
  const srcDoc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval' ${frameOrigin}; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'">
<style>html,body{margin:0;min-height:100%;font:inherit}#component-root{min-height:100%}</style><style id="component-style"></style></head>
<body><div id="component-root"></div><script src="${asset}"></script></body></html>`, [asset, frameOrigin]);
  useEffect(() => { setReady(false); }, [instance]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || event.origin !== 'null') return;
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.kind === 'READY') { setReady(true); return; }
      if (message.kind !== 'ACTION' || message.instance !== instance || typeof message.requestId !== 'string') return;
      const action = message.result;
      const id = message.requestId;
      const reply = (result?: unknown, error?: string) => {
        const frame = ref.current?.contentWindow;
        frame?.postMessage({ kind: 'ACK', instance, requestId: id, result, error }, '*');
      };
      if (!action || typeof action !== 'object' || typeof action.event !== 'string'
        || action.event.length > 128 || action.event.startsWith('__')) {
        reply(undefined,'Invalid component event'); return;
      }
      const handler = props.onAction;
      if (typeof handler !== 'function') { reply(undefined,'No metadata Flow or navigation action is configured'); return; }
      Promise.resolve().then(() => (handler as (payload: unknown) => Promise<unknown>)(action))
        .then((result) => reply(result)).catch((error: unknown) =>
          reply(undefined,error instanceof Error ? error.message : 'Action failed'));
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [instance, props.onAction]);
  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage({ kind:'RENDER',instance,
      definition:{compiledJs:definition.compiledJs,scopedCss:definition.scopedCss},props:safeProps }, '*');
  }, [ready, instance, definition.compiledJs, definition.scopedCss, safeProps]);
  return <iframe ref={ref} title={definition.label} sandbox="allow-scripts"
    referrerPolicy="no-referrer" srcDoc={srcDoc}
    style={{ display: 'block', width: '100%', height: '100%', minHeight: 160, border: 0 }}
    aria-label={definition.label} />;
}
