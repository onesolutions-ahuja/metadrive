import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.METADRIVE_TEST_BASE_URL;
if(!base)throw Error('METADRIVE_TEST_BASE_URL is required for API smoke checks');
const url=new URL(base);
if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))
 throw Error('Integration target must be HTTPS or a local isolated app');
test('untrusted requests cannot read tenant Object metadata',async()=>{
 const response=await fetch(new URL('/api/metadata/objects/Appointment__c',url),
  {redirect:'manual'});
 assert.ok([401,403].includes(response.status),
  'Metadata API did not reject anonymous request: '+response.status);
});
test('untrusted requests cannot execute tenant Flows',async()=>{
 const response=await fetch(new URL('/api/flows/NoSuchFlow/execute',url),
  {method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual'});
 assert.ok([401,403].includes(response.status),
  'Flow API did not reject anonymous execution: '+response.status);
});
