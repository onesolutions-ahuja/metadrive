import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {encryptCredential,decryptCredential,activeCredentialKey} from '../../src/system-files/credential-crypto.js';
test('credential keyring rotates active key without invalidating historical ciphertext',()=>{
 const previous={legacy:process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY,
  keys:process.env.METADRIVE_CREDENTIAL_KEYS,active:process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID};
 try{
  process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  process.env.METADRIVE_CREDENTIAL_KEYS=JSON.stringify({v2:randomBytes(32).toString('base64')});
  process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID='legacy';
  const original=encryptCredential('one-secret');
  assert.equal(original.keyId,'legacy');
  process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID='v2';
  assert.equal(activeCredentialKey().keyId,'v2');
  const rotated=encryptCredential(decryptCredential(original.ciphertext,original.keyId));
  assert.equal(rotated.keyId,'v2');
  assert.equal(decryptCredential(rotated.ciphertext,'v2'),'one-secret');
  assert.equal(decryptCredential(original.ciphertext,'legacy'),'one-secret');
  assert.throws(()=>decryptCredential(original.ciphertext,'v2'));
 }finally{
  for(const [name,value] of [['METADRIVE_CREDENTIAL_ENCRYPTION_KEY',previous.legacy],
   ['METADRIVE_CREDENTIAL_KEYS',previous.keys],['METADRIVE_CREDENTIAL_ACTIVE_KEY_ID',previous.active]]){
   if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
 }
});
