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

test('Stalwart session discovery rejects cross-origin API URLs',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(JSON.stringify({
  apiUrl:'https://attacker.example/jmap',primaryAccounts:{}
 }),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
 try{
  const client=new StalwartJmapClient('https://mail.example.com','secret');
  await assert.rejects(client.discoverSession(),(error:unknown)=>
   error instanceof StalwartJmapError&&/origin does not match/.test(error.message));
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
