import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('record type foreign key scopes both tenant and object and preserves legacy data',()=>{
 const sql=readFileSync(new URL('../../src/system-support/migrations/20261019-record-type-integrity.sql',import.meta.url),'utf8');
 assert.match(sql,/FOREIGN KEY\s*\(tenant_id,object_api,record_type_id\)/i);
 assert.match(sql,/REFERENCES\s+md_object_record_types\s*\(tenant_id,object_api,record_type_id\)/i);
 assert.match(sql,/NOT VALID/i);
 assert.doesNotMatch(sql,/\bUPDATE\s+md_records\b/i);
});

test('schema verification includes all ten audited required base tables',()=>{
 const source=readFileSync(new URL('../../src/system-files/sql-persistence.ts',import.meta.url),'utf8');
 for(const name of ['md_bootstrap_password_repairs','md_tenant_provisioning_requests',
  'md_notifications','md_approval_requests','md_record_activities',
  'md_record_chatter_posts','md_record_chatter_comments',
  'md_password_recovery_settings','md_security_events','md_record_history']){
  assert.ok(source.includes(JSON.stringify(name)),name);
 }
});

test('Core default reconciliation runs after tenant provisioning',()=>{
 const source=readFileSync(new URL('../../src/system-support/server.ts',import.meta.url),'utf8');
 const bootstrap=source.indexOf('await bootstrapFreshTenant(db)');
 const reconcile=source.indexOf('await reconcileCoreObjectDefaults(db)');
 assert.ok(bootstrap>=0 && reconcile>bootstrap);
});
