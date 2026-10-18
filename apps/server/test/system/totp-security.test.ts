import assert from 'node:assert/strict';
import {test} from 'node:test';
import {base32Encode,base32Decode,matchingTotpStep,encryptTotp,decryptTotp} from '../../src/system-files/totp-security.js';

test('RFC 6238 SHA1 six digit TOTP, clock skew and replay protection',()=>{
 const secret=Buffer.from('12345678901234567890','ascii');
 const encoded=base32Encode(secret);
 assert.deepEqual(base32Decode(encoded),secret);
 assert.equal(matchingTotpStep(encoded,'287082',-1,59000),1);
 assert.equal(matchingTotpStep(encoded,'287082',1,59000),null);
 assert.equal(matchingTotpStep(encoded,'287082',-1,150000),null);
});
test('TOTP secrets encrypt and authenticate with tenant-independent server key',()=>{
 const previous=process.env.METADRIVE_MFA_ENCRYPTION_KEY;
 process.env.METADRIVE_MFA_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 try {
  const encrypted=encryptTotp('JBSWY3DPEHPK3PXP');
  assert.notEqual(encrypted.toString('utf8'),'JBSWY3DPEHPK3PXP');
  assert.equal(decryptTotp(encrypted),'JBSWY3DPEHPK3PXP');
  encrypted[encrypted.length-1]^=1;
  assert.throws(()=>decryptTotp(encrypted));
 } finally {
  if(previous===undefined)delete process.env.METADRIVE_MFA_ENCRYPTION_KEY;
  else process.env.METADRIVE_MFA_ENCRYPTION_KEY=previous;
 }
});
