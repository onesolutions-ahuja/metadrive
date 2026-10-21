import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executeHttpCalloutNode} from '../../src/system-files/nodes/HttpCalloutNode.js';

test('HTTP Callout maps read-authorised Flow records and ignores spoofed dotted inputs',async()=>{
 let seen:Record<string,unknown>|undefined;
 await executeHttpCalloutNode({
  tenantId:'tenant',userId:'actor',client:{} as never,runId:'run',current:2,
  node:{id:2,config:{method:'POST'}},
  vars:{
   message:'Hello', 'conversation.PhoneNumber':'attacker-number',
   conversation:{Id:'chat-1',PhoneNumber:'authorised-number',DisplayName:'Customer'},
   channel:{PhoneNumberId:'tenant-phone-id',Active:true},
   collection:[{PhoneNumber:'not-exposed'}]
  },
  evaluate:value=>value,set:()=>undefined,resources:[],
  transport:async(_tenant,_user,_config,values)=>{
   seen=values;return {status:200,body:'{}'};
  }
 });
 assert.equal(seen?.['conversation.PhoneNumber'],'authorised-number');
 assert.equal(seen?.['channel.PhoneNumberId'],'tenant-phone-id');
 assert.equal(seen?.['message'],'Hello');
 assert.equal(Object.hasOwn(seen??{},'collection.0.PhoneNumber'),false);
});
