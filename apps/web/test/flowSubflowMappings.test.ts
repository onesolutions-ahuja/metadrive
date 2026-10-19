import test from 'node:test';
import assert from 'node:assert/strict';
import {getSubflowMapping,setSubflowMapping} from '../src/core/builders/FlowBuilder/flowSubflowMappings';

test('Subflow browser mapping generator preserves sibling mappings and encodes Flow references',()=>{
 let text=setSubflowMapping('', 'ContactId','{!ParentContactId}');
 text=setSubflowMapping(text,'Quantity','{!ParentQuantity}');
 assert.equal(getSubflowMapping(text,'ContactId'),'{!ParentContactId}');
 assert.equal(getSubflowMapping(text,'Quantity'),'{!ParentQuantity}');
 text=setSubflowMapping(text,'ContactId','');
 assert.equal(getSubflowMapping(text,'ContactId'),'');
 assert.equal(getSubflowMapping(text,'Quantity'),'{!ParentQuantity}');
 assert.equal(setSubflowMapping(text,'Quantity','QuantityResult'),'Quantity=QuantityResult');
});

test('Subflow mapping generator does not allow multiline injection',()=>{
 assert.throws(()=>setSubflowMapping('', 'Quantity','x\nInjected=1'));
 assert.throws(()=>setSubflowMapping('', 'Bad=Input','value'));
});
