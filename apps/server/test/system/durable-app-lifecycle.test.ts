import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

test('app uninstall cancels tenant app jobs in the uninstall transaction',()=>{
 const source=readFileSync(new URL('../../src/system-files/app-runtime.ts',import.meta.url),'utf8');
 const section=source.slice(source.indexOf('async uninstall('),source.indexOf('async homePage('));
 assert.match(section,/this\.db\.transaction\(async client/);
 assert.match(section,/UPDATE md_durable_jobs SET status='cancelled'/);
 assert.match(section,/tenant_id=\$1 AND app_api_name IN \(\$2,\$3\)/);
 assert.match(section,/DELETE FROM md_app_installations/);
 assert.ok(section.indexOf('UPDATE md_durable_jobs')<section.indexOf('DELETE FROM md_app_installations'));
});

test('durable Flow dispatch requires valid licence expiry and current actor',()=>{
 const source=readFileSync(new URL('../../src/system-support/flow-job-handler.ts',import.meta.url),'utf8');
 assert.match(source,/JOIN md_tenants t ON t.id=u.tenant_id AND t.status='ACTIVE'/);
 assert.match(source,/u.tenant_id=\$1 AND u.id=\$2 AND u.enabled=true/);
 const entitlement=readFileSync(new URL('../../src/flow-engine/FlowValidator.ts',import.meta.url),'utf8');
 assert.match(entitlement,/e\.active=true/);
 assert.match(entitlement,/e\.expires_at IS NULL OR e\.expires_at>now\(\)/);
 assert.match(entitlement,/md_app_installations/);
 assert.match(source,/active=true AND archived=false/);
 assert.match(source,/rbac\.allowed\(/);
});
