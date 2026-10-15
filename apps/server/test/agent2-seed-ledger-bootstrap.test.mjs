import test from 'node:test';
import assert from 'node:assert/strict';
import { recordInstalledAppPackageVersions } from '../src/seeders/registry.mjs';

test('seed version ledger bootstraps valid additive SQL before reading any installed packages', async () => {
  const statements = [];
  const client = { query: async (sql) => {
    statements.push(sql);
    return { rows: [], rowCount: 0 };
  } };
  await recordInstalledAppPackageVersions(client, { tenants: {} }, { packages: [] });
  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS md_seed_package_versions/);
  assert.match(statements[0], /definition_checksum ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(statements[0], /PRIMARY KEY \(tenant_id, package_kind, package_key\)/);
  assert.doesNotMatch(statements[0], /for \(const|await client\.query|function/);
  assert.match(statements[1], /CREATE INDEX IF NOT EXISTS md_seed_package_versions_kind_idx/);
});
