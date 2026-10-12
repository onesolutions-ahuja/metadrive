// CI cutover preflight: rejects unsafe blue/green rewrites and accidental
// production writes in verification scripts. This does not apply a migration.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const state=readFileSync(new URL('../src/postgres-state.ts',import.meta.url),'utf8');
const verify=readFileSync(new URL('./verify-bluegreen-sql-target.mjs',import.meta.url),'utf8');
assert.match(state,/METADRIVE_DB_NAME_OVERRIDE/);
assert.match(state,/persistenceMode !== 'typed'/);
assert.match(state,/databaseUrl\.pathname = '\/' \+ databaseOverride/);
assert.match(state,/\^\[a-z\]/);
assert.match(verify,/readNormalizedState\(pool,verifyTypedRecords\)/);
assert.match(verify,/information_schema\.columns/);
assert.match(verify,/stateDigest\(old\.rows\[0\]\.payload\)/);
assert.match(verify,/sslmode/);
assert.doesNotMatch(verify,/\b(?:CREATE|DROP|TRUNCATE|DELETE|INSERT|UPDATE)\s+(?:TABLE|FROM|INTO|[a-z])/i);
console.log('SQL-only blue-green configuration and read-only verifier contract passed');
