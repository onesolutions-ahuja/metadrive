import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadAppSeedCatalog} from '../../apps/server/src/seeders/catalog.mjs';
import {assertMetadataOnlySeed} from '../../apps/server/src/seeders/metadata-only.mjs';

const root=resolve(import.meta.dirname,'../..');
const source=path=>readFileSync(resolve(root,path),'utf8');

test('SQL lifecycle inventory is read-only and authoritative',()=>{
  const audit=source('apps/server/scripts/audit-sql-table-lifecycle.mjs');
  assert.match(audit,/readNormalizedState\(pool,verifyTypedRecords\)/);
  assert.match(audit,/md_v2_object_registry/);
  assert.match(audit,/tenantObjects/);
  assert.match(audit,/objectUses\(/);
  assert.match(audit,/HISTORICAL_BACKUP_REVIEW/);
  assert.match(audit,/SEED_VERSION_LEDGER/);
  assert.doesNotMatch(audit,/\b(?:DROP|TRUNCATE|DELETE FROM)\s+TABLE\b/i);
});

test('cleanup never bulk-drops unverified physical, metadata or user tables',()=>{
  const cleanup=source('apps/server/scripts/remove-verified-sql-duplicates.mjs');
  const names=cleanup.match(/export const duplicateBackupNames=Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(names);
  assert.deepEqual(
    [...names[1].matchAll(/'([^']+)'/g)].map(match=>match[1]),
    ['md_wa_router_backup_20261011','metadrive_connector_backup_20261011']);
  assert.match(cleanup,/METADRIVE_SQL_CLEANUP_PROOF_FILE/);
  assert.match(cleanup,/proof\.stateDigest!==snapshot\.digest/);
  assert.match(cleanup,/proof\.revision!==snapshot\.version/);
  assert.match(cleanup,/readNormalizedState\(active,verifyTypedRecords\)/);
  assert.match(cleanup,/LOCK TABLE public\./);
  assert.match(cleanup,/DROP TABLE public\./);
  assert.match(cleanup,/RESTRICT/);
  assert.doesNotMatch(cleanup,/DROP TABLE [^;\n]+ CASCADE/);
});

test('AppExchange seeder catalog contains metadata only with unique app keys',()=>{
  const catalog=loadAppSeedCatalog();
  assert.ok(catalog.packages.length>0);
  const keys=catalog.packages.map(pkg=>pkg.appKey);
  assert.equal(new Set(keys).size,keys.length);
  for(const pkg of catalog.packages){
    assertMetadataOnlySeed(pkg);
    assert.ok(pkg.appKey);
  }
});

test('the registered seeder only marks an app version after installed metadata is present',()=>{
  const registry=source('apps/server/src/seeders/registry.mjs');
  assert.match(registry,/item\.Installed__c===true/);
  assert.match(registry,/if \(!complete\) continue/);
  assert.match(registry,/kind:'app',key:pkg\.appKey/);
  assert.match(registry,/Package version reused with different metadata/);
});
