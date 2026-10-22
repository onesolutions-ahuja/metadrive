import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractJsonScalar,executeParseJsonNode} from '../../src/system-files/nodes/ParseJsonNode.js';

test('Parse JSON extracts verified WhatsApp message and status fields without provider logic',()=>{
 const payload={entry:[{changes:[{value:{
  messages:[{id:'wamid.123',from:'447700900123',text:{body:'Hello'}}],
  statuses:[{id:'wamid.out',status:'delivered'}]
 }}]}]};
 assert.equal(extractJsonScalar(payload,'entry[0].changes[0].value.messages[0].from'),'447700900123');
 assert.equal(extractJsonScalar(payload,'entry[0].changes[0].value.messages[0].text.body'),'Hello');
 assert.equal(extractJsonScalar(payload,'entry[0].changes[0].value.statuses[0].status'),'delivered');
 assert.equal(extractJsonScalar(payload,'entry[0].changes[0].value.messages[1].id'),null);
 assert.throws(()=>extractJsonScalar(payload,'__proto__.polluted'),/Invalid JSON selector/);
 assert.throws(()=>extractJsonScalar(payload,'entry[0].changes[0].value.messages'),/expected a scalar/);
 const vars:Record<string,unknown>={webhookPayloadJson:JSON.stringify(payload)};
 executeParseJsonNode({vars,node:{id:2,type:'Parse JSON',config:{
  source:'@webhookPayloadJson',assignments:[
   {path:'entry[0].changes[0].value.messages[0].id',outputVariable:'messageId'}
  ]
 }},evaluate:v=>v==='@webhookPayloadJson'?vars.webhookPayloadJson:v} as never);
 assert.equal(vars.messageId,'wamid.123');
});
