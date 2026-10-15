import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../apps/web/src/authClient.ts', import.meta.url), 'utf8');

test('workspace API defaults to the browser origin on single-host deployments', () => {
  assert.match(source, /export const apiBase = import\.meta\.env\.VITE_API_BASE_URL \?\? `\$\{window\.location\.origin\}\/api`;/);
  assert.doesNotMatch(source, /defaultApiUrl\.port\s*=\s*['"]3001['"]/);
});
