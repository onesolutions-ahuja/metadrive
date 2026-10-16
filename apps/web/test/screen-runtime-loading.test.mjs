import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('published Screen Flow renderer loads only when the Screen Flow dialog opens', () => {
  const dialogs=read('../src/setupFlowDialogs.tsx');
  const shell=read('../src/setupAppShell.tsx');
  assert.match(shell, /React\\.lazy\\(\\(\\) => import\\('\\.\\/setupFlowDialogs'\\)\\)/);
  assert.match(dialogs, /lazy\\(\\(\\) => import\\('\\.\\/FlowScreenContent'\\)\\)/);
  assert.match(dialogs, /<Suspense fallback=/);
  assert.doesNotMatch(dialogs, /import FlowScreenContent from/);
});

test('advanced screen controls are loaded only by screens requiring them', () => {
  const screen=read('../src/FlowScreenContent.tsx');
  const pageRuntime=read('../src/pageRuntimeViews.tsx');
  assert.match(screen, /lazy\\(\\(\\) => import\\('\\.\\/FlowScreenAdvancedField'\\)\\)/);
  assert.match(screen, /<Suspense key=\\{name\\}/);
  assert.doesNotMatch(pageRuntime, /import FlowScreenContent from/);
});

test('offline record operations stay encrypted, provisional and server-validated', () => {
  const queue=read('../src/offlineRecordQueue.ts');
  const sw=read('../public/metadrive-sw.js');
  assert.match(queue, /AES-GCM/);
  assert.match(queue, /needs-review/);
  assert.match(queue, /cannot safely synchronise offline changes/);
  assert.match(sw, /request\\.method !== 'GET'/);
  assert.match(sw, /url\\.pathname\\.includes\\('\\/api\\/'\\)/);
});
