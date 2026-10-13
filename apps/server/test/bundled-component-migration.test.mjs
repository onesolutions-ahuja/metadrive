import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceGitBlobSha, bundledLegacyMigrationDecision } from '../src/bundled-component-migration.mjs';

test('git blob fingerprints are content-addressed', () => {
  assert.equal(sourceGitBlobSha('test'), '30d74d258442c7c65512eafab474568dd706c430');
  assert.equal(sourceGitBlobSha(null), '');
});
test('legacy registry adopts only source-identical global components', () => {
  const old = {apiName:'KioskOrderingExperience',jsxSource:'jsx content',cssSource:'css content'};
  assert.equal(bundledLegacyMigrationDecision(old,'KioskOrderingExperience','jsx content','css content'),'adopt-current');
  assert.equal(bundledLegacyMigrationDecision(old,'KioskOrderingExperience','new jsx','new css'),'preserve');
  assert.equal(bundledLegacyMigrationDecision({...old,tenantId:'tenant-a'},'KioskOrderingExperience','jsx content','css content'),'preserve');
  assert.equal(bundledLegacyMigrationDecision({...old,trustedBundled:true},'KioskOrderingExperience','jsx content','css content'),'preserve');
  assert.equal(bundledLegacyMigrationDecision({...old,apiName:'Unrelated'},'KioskOrderingExperience','jsx content','css content'),'preserve');
  assert.equal(bundledLegacyMigrationDecision({...old,jsxSource:null},'KioskOrderingExperience','jsx content','css content'),'preserve');
});
test('an unrelated manifest collision is preserved without granting trust', () => {
  const record = {apiName:'KioskRow',tenantId:'tenant-a',jsxSource:'custom row',cssSource:'custom style'};
  assert.equal(bundledLegacyMigrationDecision(record,'KioskRow','trusted row','trusted style'),'preserve');
  assert.equal(record.trustedBundled,undefined);
});
