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
