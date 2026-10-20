import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEmailDispatch} from '../../src/communication-engine/EmailDispatcher.js';
import {flowEmailHistory} from '../../src/communication-engine/CommunicationHistory.js';
import {runAuthorizedPrintJob} from '../../src/communication-engine/PrintJobManager.js';
import {loadTenantNotificationDefinitions} from '../../src/communication-engine/NotificationDispatcher.js';

const id='00000000-0000-4000-8000-000000000001';
test('email dispatch safely renders, deduplicates and validates without delivery bypass',()=>{
 const message=prepareEmailDispatch({namedCredentialId:id,fromEmail:'from@example.com',recipients:'a@example.com;a@example.com,b@example.com',subject:'Hello',body:'Body'},v=>v);
 assert.deepEqual(message.recipients,['a@example.com','b@example.com']);
 assert.throws(()=>prepareEmailDispatch({namedCredentialId:id,fromEmail:'from@example.com',recipients:'a@example.com',subject:'Injected\r\nBcc: x',body:'Body'},v=>v),/Invalid Flow email configuration/);
});
test('notification definitions and history stay tenant-scoped',async()=>{
 const seen:unknown[][]=[];
 const db={query:async(_sql:string,params:unknown[])=>{seen.push(params);return {rows:[]};}};
 assert.deepEqual(await loadTenantNotificationDefinitions(db as never,'tenant-1'),[]);
 assert.deepEqual(await flowEmailHistory(db as never,'tenant-1','run-1'),[]);
 assert.deepEqual(seen,[['tenant-1'],['tenant-1','run-1']]);
});
test('unauthorized printing never evaluates the shared action callback',async()=>{
 let called=false;
 await assert.rejects(()=>runAuthorizedPrintJob({tenantId:'t',userId:'u',allowed:false},async()=>{called=true;}),/unavailable/);
 assert.equal(called,false);
 await runAuthorizedPrintJob({tenantId:'t',userId:'u',allowed:true},async()=>{called=true;});
 assert.equal(called,true);
});
