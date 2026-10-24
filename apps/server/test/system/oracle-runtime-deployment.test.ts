import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const script=new URL('../../../../scripts/oracle/deploy-api.sh',import.meta.url);
const workflow=new URL('../../../../.github/workflows/oracle-api-deploy.yml',import.meta.url);
const diagnostic=new URL('../../../../scripts/oracle/check-communication-backlog.sh',import.meta.url);
const startupDiagnostic=new URL('../../../../scripts/oracle/diagnose-api-startup.py',import.meta.url);

test('Oracle backend release deploys API and Communication worker as one rollback unit',()=>{
 const sh=readFileSync(script,'utf8');
 assert.match(sh,/LOCAL_OK=0/);
 assert.match(sh,/PUBLIC_OK=0/);
 assert.match(sh,/diagnose-api-startup\.py/);
 const portLine=sh.split('\n').find(line=>line.startsWith('API_PORT="$(sed -nE'));
 const portFilter=portLine?.match(/sed -nE '([^']+)'/)?.[1];
 assert.ok(portFilter,'Local health check must parse configured numeric PORT');
 if(process.platform!=='win32'){
  const port=spawnSync('sed',['-nE',portFilter],{input:'PORT=3001\n',encoding:'utf8'});
  assert.equal(port.status,0,port.stderr);
  assert.equal(port.stdout.trim(),'3001');
 }

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
 assert.match(yaml,/statuses: write/);
 assert.match(yaml,/oracle-production\/communication/);
 assert.match(yaml,/check-communication-backlog\.sh/);
 const startup=readFileSync(startupDiagnostic,'utf8');
 assert.match(startup,/journalctl/);
 assert.match(startup,/sanitize/);
 assert.doesNotMatch(startup,/print\\(logs\\)/);
 const probe=readFileSync(diagnostic,'utf8');
 assert.match(probe,/md_communication_delivery_outbox/);
 assert.match(probe,/md_records/);
 assert.match(probe,/runuser -u postgres/);
 if(process.platform!=='win32'){
  const syntax=spawnSync('bash',['-n',fileURLToPath(diagnostic)],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
 }
});
