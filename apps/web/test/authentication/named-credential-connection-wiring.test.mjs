import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

test('Named Credential Test Connection is wired from SetupApp through the shared API',()=>{
 const setup=readFileSync(new URL('../../src/core/workspace/SetupShell/setupAppShell.tsx',import.meta.url),'utf8');
 const view=readFileSync(new URL('../../src/core/workspace/SetupShell/setupShellPresentation.tsx',import.meta.url),'utf8');
 const list=readFileSync(new URL('../../src/core/integrations/NamedCredentials/NamedCredentials.tsx',import.meta.url),'utf8');
 assert.match(setup,/const testNamedCredential = async/);
 assert.match(setup,/\'\/named-credentials\/\'\+encodeURIComponent\(id\)\+\'\/test\'/);
 assert.match(setup,/toggleNamedCredentialEnabled, testNamedCredential, undoFlow/);
 assert.match(view,/onTest=\{testNamedCredential\}/);
 assert.match(list,/onClick=\{\(\) => void testCredential\(credential\)\}/);
});

test('WhatsApp diagnostics use read-only Graph profile probe while preserving RBAC',()=>{
 const ui=readFileSync(new URL('../../src/core/integrations/NamedCredentials/NamedCredentials.tsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../../../../server/src/system-support/server.ts',import.meta.url),'utf8');
 assert.match(ui,/graph\.facebook\.com/);
 assert.match(ui,/testPath='me'/);
 assert.match(server,/await rbac\.require\(actor\.tenant_id,actor\.user_id,'NamedCredential','manage'\)/);
 assert.match(server,/method:'GET',path/);
 assert.match(server,/\^\[A-Za-z0-9_\.\/-\]\+\$/);
 assert.doesNotMatch(server,/method:'POST',path.*credential-connectivity-test/);
});
