import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('Shared Named Credential types match supported SQL transport auth types',()=>{
 const metadata=readFileSync(new URL('../../../web/src/core/metadata/Definitions/metadata.ts',import.meta.url),'utf8');
 const service=readFileSync(new URL('../../src/system-support/named-credential-service.ts',import.meta.url),'utf8');
 const declaration=metadata.match(/authType: ([^;]+);/);
 assert.ok(declaration);
 for(const type of ['None','Bearer','Basic','API Key','OAuth Client Credentials','OAuth Authorization Code']){
  assert.ok(declaration[1].includes("'"+type+"'"),type);
  assert.ok(service.includes("'"+type+"'"),type);
 }
 assert.ok(service.includes("'OAuth Authorization Code'"));
});
