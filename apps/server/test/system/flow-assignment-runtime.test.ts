import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executeFlowAssignment} from '../../src/system-files/flow-assignment-runtime.js';

const makeNode=(variable:string,operator:string,value:unknown)=>({
 id:1,type:'Assignment',config:{variable,operator,value}
});

test('record collection assignments add, prepend, remove and clear records with the 200-item cap',()=>{
 const resources=[{name:'accounts',type:'Record Collection',dataType:'Account'},
  {name:'firstRecord',type:'Record',dataType:'Account'},
  {name:'secondRecord',type:'Record',dataType:'Account'},
  {name:'zeroRecord',type:'Record',dataType:'Account'}];
 const first={Id:'1',Name:'One'},second={Id:'2',Name:'Two'};
 const zero={Id:'0',Name:'Zero'};
 const vars:Record<string,unknown>={accounts:[first],firstRecord:first,
  secondRecord:second,zeroRecord:zero};
 const run=(operator:string,value:unknown)=>executeFlowAssignment({
  node:makeNode('accounts',operator,value),resources,vars,
  evaluate:value=>typeof value==='string'&&value.startsWith('@')?vars[value.slice(1)]:value,
  set:(name,value)=>{vars[String(name)]=value}
 });
 run('Add','@secondRecord');
 run('Add At Beginning','@zeroRecord');
 assert.deepEqual((vars.accounts as Array<{Id:string}>).map(item=>item.Id),['0','1','2']);
 run('Remove','@firstRecord');
 assert.deepEqual((vars.accounts as Array<{Id:string}>).map(item=>item.Id),['0','2']);
 run('Remove All',null);
 assert.deepEqual(vars.accounts,[]);
 vars.accounts=Array.from({length:200},(_,index)=>({Id:String(index)}));
 assert.throws(()=>run('Add','@secondRecord'),/200-record limit/);
});

test('record collection assignment copies only bounded record collections',()=>{
 const resources=[{name:'accounts',type:'Record Collection',dataType:'Account'}];
 const source=[{Id:'1',Name:'One'}];
 const vars:Record<string,unknown>={source};
 executeFlowAssignment({
  node:makeNode('accounts','Assign','@source'),
  resources:[...resources,{name:'source',type:'Record Collection',dataType:'Account'}],
  vars,evaluate:value=>value==='@source'?source:value,set:(name,value)=>{vars[String(name)]=value}
 });
 assert.deepEqual(vars.accounts,source);
 assert.notEqual(vars.accounts,source);
 assert.throws(()=>executeFlowAssignment({
  node:makeNode('accounts','Assign','not-a-collection'),resources,vars,
  evaluate:value=>value,set:(name,value)=>{vars[String(name)]=value}
 }),/source must match/);
});

test('scalar assignments apply arithmetic and text operators instead of silently assigning',()=>{
 const resources=[{name:'count',type:'Variable',dataType:'Number'},
  {name:'label',type:'Variable',dataType:'Text'}];
 const vars:Record<string,unknown>={count:2,label:'Order'};
 const run=(variable:string,operator:string,value:unknown)=>executeFlowAssignment({
  node:makeNode(variable,operator,value),resources,vars,evaluate:value=>value,
  set:(name,value)=>{vars[String(name)]=value}
 });
 run('count','Add',3);
 assert.equal(vars.count,5);
 run('label','Add At Beginning','New ');
 assert.equal(vars.label,'New Order');
 assert.throws(()=>run('count','Divide',0),/divide by zero/);
});
