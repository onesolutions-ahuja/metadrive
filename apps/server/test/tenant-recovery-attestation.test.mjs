import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryAttestationVerifier, PURPOSES } from '../src/tenant-recovery-attestation.mjs';

test('requires HTTPS identity provider and live actor authorization', () => {
  for (const options of [
    {jwksUri:'http://identity.example/jwks',issuer:'https://identity.example',isActorActive:async()=>true},
    {jwksUri:'https://identity.example/jwks',issuer:'',isActorActive:async()=>true},
    {jwksUri:'https://identity.example/jwks',issuer:'https://identity.example'},
    {jwksUri:'https://identity.example/jwks',issuer:'https://identity.example',isActorActive:async()=>true,maxAgeSeconds:3600}
  ]) assert.throws(()=>createRecoveryAttestationVerifier(options));
});
test('rejects absent or malformed untrusted attestations before authorization', async () => {
  let calls=0;
  const verify=createRecoveryAttestationVerifier({
    jwksUri:'https://identity.example/jwks',issuer:'https://identity.example',
    isActorActive:async()=>{calls++;return true;}
  });
  const req={purpose:PURPOSES.operator,tenantId:'tenant-a',claimantUserId:'user-a',caseId:'case-a'};
  for(const token of ['', 'not-a-jwt']) await assert.rejects(verify(token,req));
  await assert.rejects(verify('anything',{...req,purpose:'platform_admin'}));
  await assert.rejects(verify('anything',{...req,tenantId:''}));
  assert.equal(calls,0);
});
