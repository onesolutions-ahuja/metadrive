import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publicHttpsUrl,publicIp,requestExternalHttps} from '../../src/system-support/external-http-transport.js';

test('external HTTPS transport rejects private destinations and unsupported URL forms',()=>{
 assert.equal(publicIp('8.8.8.8'),true);
 assert.equal(publicIp('127.0.0.1'),false);
 assert.equal(publicIp('10.0.0.1'),false);
 assert.throws(()=>publicHttpsUrl('http://example.com'),/public HTTPS origin/);
 assert.throws(()=>publicHttpsUrl('https://127.0.0.1'),/public HTTPS origin/);
 assert.throws(()=>publicHttpsUrl('https://user@example.com'),/public HTTPS origin/);
});

test('external HTTPS transport blocks configured MetaDrive API origins before DNS or network access',async()=>{
 const prior=process.env.METADRIVE_AUTH_PUBLIC_ORIGIN;
 process.env.METADRIVE_AUTH_PUBLIC_ORIGIN='https://metadrive.example';
 try{
  await assert.rejects(requestExternalHttps(new URL('https://metadrive.example/api/internal'),{
   method:'GET',timeoutMs:1000,maxResponseBytes:1024
  }),/cannot target MetaDrive internal APIs/);
 }finally{
  if(prior===undefined)delete process.env.METADRIVE_AUTH_PUBLIC_ORIGIN;
  else process.env.METADRIVE_AUTH_PUBLIC_ORIGIN=prior;
 }
});
