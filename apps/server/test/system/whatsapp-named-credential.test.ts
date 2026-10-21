import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('Meta WhatsApp variables are editable but sensitive tokens are never returned',()=>{
 const service=readFileSync(new URL('../../src/system-support/named-credential-service.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../../../web/src/core/integrations/NamedCredentials/NamedCredentials.tsx',import.meta.url),'utf8');
 for(const name of ['graphApiVersion','wabaId','phoneNumberId','businessPortfolioId','metaAppId',
   'businessPhoneE164','templateLanguage','webhookCallbackUrl'])
   assert.match(service,new RegExp(name));
 assert.match(service,/this\.decryptOpaque\(x\.configuration_ciphertext,x\.encryption_key_id\)/);
 assert.match(service,/publicKeys\.has\(key\)/);
 assert.doesNotMatch(service.slice(service.indexOf(' async list('),service.indexOf(' async create(')),
   /secret:\s*x\.secret_ciphertext|secretCiphertext:\s*x\.secret_ciphertext/);
 assert.match(ui,/credential\.name==='WhatsApp_Cloud_API'/);
 assert.match(ui,/whatsAppFields/);
});
