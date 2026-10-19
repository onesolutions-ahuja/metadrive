import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadFlowDefinitions } from '../src/core/workspace/SetupShell/useSetupMetadata';

test('Page Builder loads Flow definitions for component event bindings', () => {
  assert.equal(shouldLoadFlowDefinitions(true, 'page-builder'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'flow-builder'), true);
  assert.equal(shouldLoadFlowDefinitions(true, 'record-list'), false);
  assert.equal(shouldLoadFlowDefinitions(false, 'page-builder'), false);
});
