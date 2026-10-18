import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';

test('fresh tenant provisions OneEngine as an ordinary assignable SQL permission set',async()=>{
 const source=await readFile(new URL('../../src/system-files/tenant-provisioning.ts',import.meta.url),'utf8');
 assert.match(source,/INSERT INTO md_permission_sets[\s\S]*?\[tenantId,'OneEngine'\]/);
 assert.match(source,/INSERT INTO md_role_permission_sets/);
 assert.match(source,/INSERT INTO md_permission_rules/);
});
test('existing-tenant OneEngine migration preserves rule and membership records',async()=>{
 const sql=await readFile(new URL('../../src/system-support/migrations/20261018-zzzzzz-oneengine-identity.sql',import.meta.url),'utf8');
 assert.match(sql,/UPDATE md_permission_sets/);
 assert.match(sql,/SET api_name='OneEngine'/);
 assert.match(sql,/NOT EXISTS/);
 assert.doesNotMatch(sql,/DELETE|TRUNCATE|INSERT|md_permission_rules|md_permission_assignments|md_role_permission_sets/i);
});
