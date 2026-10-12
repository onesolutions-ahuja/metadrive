import * as React from 'react';
import { createRoot } from 'react-dom/client';

type FrameMessage = { kind: string; instance: string; requestId?: string; props?: Record<string, unknown>; definition?: { compiledJs: string; scopedCss: string }; result?: unknown; error?: string };
const root = createRoot(document.getElementById('component-root')!);
const requests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let currentInstance = '';
function send(message: Omit<FrameMessage, 'instance'>) {
  window.parent.postMessage({ ...message, instance: currentInstance }, '*');
}
window.addEventListener('message', (event: MessageEvent<FrameMessage>) => {
  if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
  const message = event.data;
  if (message.kind === 'ACK' && message.instance === currentInstance && message.requestId) {
    const request = requests.get(message.requestId);
    if (!request) return;
    requests.delete(message.requestId);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
    return;
  }
  if (message.kind !== 'RENDER' || typeof message.instance !== 'string' || !message.definition
    || typeof message.definition.compiledJs !== 'string' || !message.props) return;
  currentInstance = message.instance;
  try {
    const mod: { exports: { default?: React.ComponentType<Record<string, unknown>> } } = { exports: {} };
    const execute = new Function('React','module','exports', message.definition.compiledJs) as
      (react: typeof React, m: typeof mod, exports: typeof mod.exports) => void;
    execute(React, mod, mod.exports);
    if (typeof mod.exports.default !== 'function') throw Error('Missing default React component');
    const Component = mod.exports.default;
    const style = document.getElementById('component-style') as HTMLStyleElement;
    style.textContent = message.definition.scopedCss || '';
    const onAction = (action: unknown) => new Promise<unknown>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      requests.set(requestId, { resolve, reject });
      send({ kind: 'ACTION', requestId, result: action });
    });
    root.render(<React.StrictMode><div className="registered-component"><Component {...message.props} onAction={onAction}
      onChange={(value: unknown) => { void onAction({ event: 'change', value }); }} /></div></React.StrictMode>);
  } catch (error) {
    root.render(<div role="alert">Component render failed: {error instanceof Error ? error.message : 'Invalid component'}</div>);
  }
});
window.parent.postMessage({ kind: 'READY' }, '*');
