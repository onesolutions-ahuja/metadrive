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

test('Named Credentials list and permission readiness share one authenticated tenant response',()=>{
 const server=readFileSync(new URL('../../../../server/src/system-support/server.ts',import.meta.url),'utf8');
 const start=server.indexOf("app.get('/api/named-credentials',route(");
 const end=server.indexOf("app.post('/api/named-credentials',route(",start);
 assert.ok(start>=0&&end>start,'Named Credentials GET route exists');
 const route=server.slice(start,end);
 assert.match(route,/const actor=req\.actor!/);
 assert.match(route,/namedCredentials\.list\(actor\.tenant_id,actor\.user_id\)/);
 assert.match(route,/namedCredentials\.readiness\(actor\.tenant_id,actor\.user_id\)/);
 assert.match(route,/credentials:all\.map\(item=>credentialWithWebhookUrl\(req,item\)\),\.\.\.readiness/);
 assert.match(route,/Cache-Control',\s*'private, no-store'/);
 assert.doesNotMatch(route,/res\.json\(\{credentials:all\}\)/);
});

test('Named Credentials UI updates credentials and OneEngine rights atomically',()=>{
 const setup=readFileSync(new URL('../../src/core/workspace/SetupShell/setupAppShell.tsx',import.meta.url),'utf8');
 assert.match(setup,/if\(workspace!=='named-credentials'\)void checkCredentialReadiness\(\)/);
 assert.match(setup,/type CredentialSnapshot=\{credentials:NamedCredentialMetadata\[\];canManage:boolean;encryptionReady:boolean\}/);
 assert.match(setup,/apiRequest<CredentialSnapshot>\('\/named-credentials'/);
 assert.match(setup,/typeof snapshot\.canManage!=='boolean'/);
 assert.match(setup,/typeof snapshot\.encryptionReady!=='boolean'/);
 assert.match(setup,/if\(snapshot\.credentials\.length===0\)/);
 assert.match(setup,/const confirmation=await getSnapshot\(\)/);
 assert.match(setup,/setNamedCredentials\(previous=>/);
 assert.match(setup,/setCanManageNamedCredentials\(snapshot\.canManage\)/);
 assert.match(setup,/setNamedCredentialsEncryptionReady\(snapshot\.encryptionReady\)/);
});
