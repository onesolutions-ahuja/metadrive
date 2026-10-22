import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

// Regression: the generic Setup bootstrap previously replaced the live
// Named Credentials API result with an empty placeholder after it loaded.
test('generic Setup bootstrap never writes Named Credentials state',()=>{
 const source=readFileSync(new URL('../src/core/workspace/SetupShell/useSetupMetadata.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/setNamedCredentials\s*\(/);
 assert.doesNotMatch(source,/credentials:\s*\[\]\s+as NamedCredentialMetadata\[\]/);
});
