import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const script=new URL('../../../../scripts/oracle/deploy-api.sh',import.meta.url);
const workflow=new URL('../../../../.github/workflows/oracle-api-deploy.yml',import.meta.url);

test('Oracle backend release deploys API and Communication worker as one rollback unit',()=>{
 const sh=readFileSync(script,'utf8');
 assert.match(sh,/API_SERVICE=metadrive-api\.service/);
 assert.match(sh,/WORKER_SERVICE=metadrive-worker\.service/);
 assert.match(sh,/job-worker-entrypoint\.js/);
 assert.match(sh,/restore_override "\$WORKER_BACKUP" "\$WORKER_OVERRIDE"/);
 assert.match(sh,/restore_override "\$API_BACKUP" "\$API_OVERRIDE"/);
 assert.match(sh,/systemctl restart "\$WORKER_SERVICE"/);
 assert.match(sh,/systemctl restart "\$API_SERVICE"/);
 assert.match(sh,/systemctl show -p ExecStart --value "\$WORKER_SERVICE"/);
 assert.match(sh,/systemctl show -p ExecStart --value "\$API_SERVICE"/);
 assert.ok(sh.indexOf('systemctl restart "$API_SERVICE"')<
           sh.lastIndexOf('systemctl restart "$WORKER_SERVICE"'),
  'Schema-owning API must start before the worker');
 if(process.platform!=='win32'){
  const syntax=spawnSync('bash',['-n',fileURLToPath(script)],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
 }
});

test('Oracle deployment runs on main backend changes behind environment protection',()=>{
 const yaml=readFileSync(workflow,'utf8');
 assert.match(yaml,/push:\s*\n\s*branches: \[main\]/);
 assert.match(yaml,/apps\/server\/\*\*/);
 assert.match(yaml,/environment: oracle-production/);
 assert.match(yaml,/runs-on: \[self-hosted, linux, ARM64, metadrive-oracle\]/);
 assert.match(yaml,/job-worker-entrypoint\.js/);
 assert.match(yaml,/bash -n scripts\/oracle\/deploy-api\.sh/);
});
