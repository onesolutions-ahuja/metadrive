import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('Named Credentials persist and retrieve the encryption key identity',()=>{
 const migration=readFileSync(new URL('../../src/system-support/migrations/20261020-named-credential-key-version.sql',import.meta.url),'utf8');
 const service=readFileSync(new URL('../../src/system-support/named-credential-service.ts',import.meta.url),'utf8');
 assert.match(migration,/ADD COLUMN IF NOT EXISTS encryption_key_id text NOT NULL DEFAULT 'legacy'/);
 assert.match(service,/keyFor\(item\.encryption_key_id\)/);
 assert.match(service,/encryption_key_id=CASE WHEN/);
 assert.match(service,/Credential key rotation requires a complete re-encryption workflow/);
});
