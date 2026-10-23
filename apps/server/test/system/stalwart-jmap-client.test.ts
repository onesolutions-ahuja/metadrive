import test from 'node:test';
import assert from 'node:assert/strict';
import {StalwartJmapClient,StalwartJmapError} from '../../src/system-support/stalwart-jmap-client.js';

test('Stalwart client rejects non-loopback plaintext HTTP',()=>{
 assert.throws(()=>new StalwartJmapClient('http://mail.example.com','secret'),
  (error:unknown)=>error instanceof StalwartJmapError&&/loopback/.test(error.message));
});

test('Stalwart client requires a configured API key',()=>{
 assert.throws(()=>new StalwartJmapClient('https://mail.example.com','  '),
  (error:unknown)=>error instanceof StalwartJmapError&&/not configured/.test(error.message));
});

test('Stalwart client rejects invalid timeout configuration',()=>{
 assert.throws(()=>new StalwartJmapClient('https://mail.example.com','secret',0),
  (error:unknown)=>error instanceof StalwartJmapError&&/timeout/.test(error.message));
});

test('Stalwart discovery pins public advertised JMAP URL to the configured private origin',async()=>{
 const original=globalThis.fetch;
 const urls:string[]=[];
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);urls.push(url);
  assert.equal(init?.headers && (init.headers as Record<string,string>).authorization,'Bearer secret');
  if(url.endsWith('/.well-known/jmap'))return new Response(JSON.stringify({
   apiUrl:'https://unesolutions.co.uk/jmap/',primaryAccounts:{}
  }),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({methodResponses:[['x:Domain/query',{ids:[]},'metadrive-1']]}),
   {status:200,headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 try{
  const client=new StalwartJmapClient('http://127.0.0.1:8080','secret');
  const session=await client.discoverSession();
  assert.equal(session.apiUrl,'http://127.0.0.1:8080/jmap/');
  await client.call(session,'x:Domain/query',{filter:{},limit:1});
  assert.deepEqual(urls,['http://127.0.0.1:8080/.well-known/jmap','http://127.0.0.1:8080/jmap/']);
 }finally{globalThis.fetch=original;}
});

test('Stalwart discovery rejects advertised paths outside its JMAP endpoint',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(JSON.stringify({
  apiUrl:'https://attacker.example/private?token=secret'
 }),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
 try{
  const client=new StalwartJmapClient('http://127.0.0.1:8080','secret');
  await assert.rejects(client.discoverSession(),(error:unknown)=>
   error instanceof StalwartJmapError&&/unsupported JMAP endpoint/.test(error.message));
 }finally{globalThis.fetch=original;}
});

test('Stalwart client does not follow redirects for authenticated requests',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  assert.equal(init?.redirect,'error');
  return new Response('redirect',{status:302,headers:{location:'https://attacker.example/'}});
 }) as typeof fetch;
 try{
  const client=new StalwartJmapClient('https://mail.example.com','secret');
  await assert.rejects(client.discoverSession());
 }finally{globalThis.fetch=original;}
});

import {StalwartMailService} from '../../src/system-support/stalwart-mail-service.js';

test('mail integration remains optional when server configuration is absent',()=>{
 assert.doesNotThrow(()=>new StalwartMailService('http://127.0.0.1:8080',''));
});
