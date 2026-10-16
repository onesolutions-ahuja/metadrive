import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('published Screen Flow renderer loads only when its dialog opens', () => {
  const dialogs = read('../src/setupFlowDialogs.tsx');
  const shell = read('../src/setupAppShell.tsx');
  assert.ok(shell.includes("React.lazy(() => import('./setupFlowDialogs'))"));
  assert.ok(dialogs.includes("lazy(() => import('./FlowScreenContent'))"));
  assert.ok(dialogs.includes('<Suspense fallback='));
  assert.ok(!dialogs.includes("import FlowScreenContent from"));
});

test('advanced fields use a separate on-demand chunk', () => {
  const screen = read('../src/FlowScreenContent.tsx');
  const pages = read('../src/pageRuntimeViews.tsx');
  assert.ok(screen.includes("lazy(() => import('./FlowScreenAdvancedField'))"));
  assert.ok(screen.includes('<Suspense key={name}'));
  assert.ok(!pages.includes("import FlowScreenContent from"));
});

test('offline writes remain encrypted, provisional and server-validated', () => {
  const queue = read('../src/offlineRecordQueue.ts');
  const worker = read('../public/metadrive-sw.js');
  assert.match(queue, /AES-GCM/);
  assert.match(queue, /needs-review/);
  assert.match(queue, /cannot safely synchronise offline changes/);
  assert.ok(worker.includes("request.method !== 'GET'"));
  assert.ok(worker.includes("url.pathname.includes('/api/')"));
});

test('full Flow definitions load only when the Flow Builder is opened', () => {
  const hook=read('../src/useSetupMetadata.ts');
  assert.ok(hook.includes("key: 'flow-definitions', enabled: needsFlowAdministration"));
  assert.ok(hook.includes("needsFlowAdministration = isAdmin && workspace === 'flow-builder'"));
  assert.ok(hook.includes("Promise.resolve({ flows: [] as FlowDefinitionMetadata[] })"));
  assert.ok(!hook.includes("recover<{ flows: FlowDefinitionMetadata[] }>('/metadata/flows'"));
});
