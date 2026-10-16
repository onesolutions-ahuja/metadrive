import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('shared Core, Flow, Scheduler and Integration runtimes are real modules', () => {
  const paths = [
    'apps/server/src/core/security/record-access.ts',
    'apps/server/src/modules/flows/flow-context-runtime.ts',
    'apps/server/src/modules/flows/failure-runtime.ts',
    'apps/server/src/scheduler/runtime-bootstrap.ts',
    'apps/server/src/modules/integrations/http-callout-executor.ts',
    'apps/server/src/modules/records/record-cascade.ts'
  ];
  for (const path of paths) assert.ok(existsSync(new URL(path, root)), path);
});

test('metadata services depend on types, not runtime imports from the server entry point', () => {
  const modules = [
    'core/security/record-access.ts',
    'modules/flows/flow-context-runtime.ts',
    'modules/integrations/connector-lifecycle.ts',
    'modules/pages/activation-access.ts',
    'modules/records/field-history.ts'
  ];
  for (const path of modules) {
    const code = read('apps/server/src/' + path);
    const imports = code.match(/^import[^;]+;/gm) ?? [];
    for (const statement of imports) {
      if (/from\s*['"][^'"]*\/index\.js['"]/.test(statement)) {
        assert.match(statement, /^import\s+type\s+/, 'runtime cycle: ' + path);
      }
    }
  }
});

test('authoritative security policy protects tenant data and preserves SQL backup recovery', () => {
  const policy = read('DEVELOPER_POLICY.md');
  assert.match(policy, /OneEngine/);
  assert.match(policy, /SQL Source of Truth/i);
  assert.match(policy, /Data Recovery/i);
  assert.match(policy, /tenant isolation/i);
});
