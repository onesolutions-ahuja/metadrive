import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('WhatsApp connection seeds only required sender ID without hardcoded optional UI fields',()=>{
 const service=readFileSync(new URL('../../src/system-support/named-credential-service.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../../../web/src/core/integrations/NamedCredentials/NamedCredentials.tsx',import.meta.url),'utf8');
 const manifest=readFileSync(new URL('../../../connectors/whatsapp/scripts/install.mjs',import.meta.url),'utf8');
 assert.match(manifest,/"apiName": "public_phoneNumberId"/);
 assert.match(manifest,/"required": true/);
 assert.doesNotMatch(manifest,/"required": false/);
 assert.match(manifest,/v26\.0\/\{!public_phoneNumberId\}\/messages/);
 assert.doesNotMatch(ui,/whatsAppFields|public_businessPortfolioId|public_displayName/);
 assert.match(ui,/\.\.\.preset\?\.configuration, \.\.\.credential\.configuration/);
 assert.match(ui,/Add variable/);
 assert.match(ui,/name\.startsWith\('public_'\)/);
 assert.match(ui,/non-secret variable name/);
 assert.match(service,/this\.decryptOpaque\(x\.configuration_ciphertext,x\.encryption_key_id\)/);
 assert.match(service,/safePublicKey\(key\)/);
 assert.doesNotMatch(service.slice(service.indexOf(' async list('),service.indexOf(' async create(')),
   /secret:\s*x\.secret_ciphertext|secretCiphertext:\s*x\.secret_ciphertext/);
});
