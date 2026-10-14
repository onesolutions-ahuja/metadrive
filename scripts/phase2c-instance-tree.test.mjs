import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInstanceTree,resolveInstancePlacement,childrenForSlot} from '../apps/web/src/componentInstanceTree.ts';
const nodes=[
 {id:'root',registeredApiName:'Panel',layout:{desktop:{x:0,y:0,width:800,height:600}}},
 {id:'child',registeredApiName:'Text',parentId:'root',slot:'content',layout:{tablet:{x:0,y:0,width:320,height:40}}}
];
test('2c permits nested slots and responsive fallback',()=>{
 assert.deepEqual(validateInstanceTree(nodes),[]);
 assert.equal(childrenForSlot(nodes,'root','content')[0].id,'child');
 assert.equal(resolveInstancePlacement(nodes[1],'phone')?.width,320);
 assert.equal(resolveInstancePlacement(nodes[0],'phone')?.width,800);
});
test('2c rejects missing parents and cycles',()=>{
 assert.ok(validateInstanceTree([{id:'orphan',registeredApiName:'A',parentId:'missing'}]).some(e=>e.includes('Missing parent')));
 assert.ok(validateInstanceTree([{id:'a',registeredApiName:'A',parentId:'b'},{id:'b',registeredApiName:'B',parentId:'a'}]).some(e=>e.includes('Circular')));
});
test('2c rejects duplicate identity and malformed positions',()=>{
 assert.ok(validateInstanceTree([{id:'same',registeredApiName:'A'},{id:'same',registeredApiName:'B'}]).some(e=>e.includes('Duplicate')));
 assert.ok(validateInstanceTree([{id:'bad',registeredApiName:'A',layout:{desktop:{x:0,y:0,width:-1,height:30}}}]).some(e=>e.includes('Invalid placement')));
});
