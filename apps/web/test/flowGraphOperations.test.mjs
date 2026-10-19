import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canBypassFlowElement,removeFlowGraphElement,duplicateFlowGraphElement,
 retargetFlowGraphConnector,flowGraphDiagnostics} from '../src/core/builders/FlowBuilder/flowGraphOperations.mjs';

const step=(id,type='Assignment',label=type)=>({id,type,label,config:{}});
const link=(id,from,to,label='',kind='normal')=>({id,from,to,label,kind});
const flow=()=>({
 status:'Draft',
 elements:[step(1,'Start'),step(2),step(3,'End')],
 connectors:[link('start-2',1,2),link('2-end',2,3)]
});

test('safe removal rewires a normal intermediate step and retains the original incoming connector ID',()=>{
 const graph=flow();
 assert.equal(canBypassFlowElement(graph,2),true);
 const edited=removeFlowGraphElement(graph,2);
 assert.deepEqual(edited.elements.map(x=>x.id),[1,3]);
 assert.deepEqual(edited.connectors,[link('start-2',1,3)]);
 assert.equal(graph.connectors[0].to,2);
});
test('safe removal preserves fault/scheduled/async semantics on incoming branch',()=>{
 for(const kind of ['fault','scheduled','async']){
  const graph=flow();
  graph.connectors[0]={...graph.connectors[0],kind,label:'Error'};
  const result=removeFlowGraphElement(graph,2);
  assert.equal(result.connectors[0].kind,kind);
  assert.equal(result.connectors[0].label,'Error');
  assert.equal(result.connectors[0].id,'start-2');
 }
});
test('unsafe branch collapse or terminal removal cannot silently change runtime routing',()=>{
 const graph=flow();
 graph.elements.push(step(4,'End'));
 graph.connectors.push(link('2-other',2,4,'Other'));
 assert.equal(canBypassFlowElement(graph,2),false);
 assert.throws(()=>removeFlowGraphElement(graph,2),/Cannot remove/);
 assert.equal(canBypassFlowElement(graph,1),false);
 assert.equal(canBypassFlowElement(graph,3),false);
});
test('node duplication splits an explicitly chosen path, preserving outcome and fault semantics',()=>{
 const graph=flow();
 graph.connectors[0]={...graph.connectors[0],label:'Fault',kind:'fault'};
 const copied=duplicateFlowGraphElement(graph,2,undefined,4,'new-continuation');
 assert.equal(copied.elements.find(x=>x.id===4).label,'Assignment Copy');
 assert.equal(copied.connectors.find(x=>x.id==='2-end').to,4);
 assert.equal(copied.connectors.find(x=>x.id==='new-continuation').to,3);
 assert.equal(copied.connectors[0].kind,'fault');
});
test('branching duplication requires a chosen outcome path',()=>{
 const graph=flow();
 graph.elements.push(step(4,'End'));
 graph.connectors.push(link('2-secondary',2,4,'Default'));
 assert.throws(()=>duplicateFlowGraphElement(graph,2,undefined,5,'continue'),/Choose the branch/);
 const result=duplicateFlowGraphElement(graph,2,'2-secondary',5,'continue');
 assert.equal(result.connectors.find(x=>x.id==='2-secondary').to,5);
 assert.equal(result.connectors.find(x=>x.id==='2-end').to,3);
});
test('connector retargeting cannot point at Start, itself or create duplicate paths',()=>{
 const graph=flow();
 assert.throws(()=>retargetFlowGraphConnector(graph,'2-end',1),/Start/);
 assert.throws(()=>retargetFlowGraphConnector(graph,'2-end',2),/own source/);
 const changed=retargetFlowGraphConnector(graph,'start-2',3);
 assert.equal(changed.connectors.find(x=>x.id==='start-2').to,3);
 assert.equal(graph.connectors.find(x=>x.id==='start-2').to,2);
});
test('graph diagnostics identify disconnected and unfinished steps without modifying the Flow',()=>{
 const graph=flow();
 graph.elements.push(step(4,'Action','Detached Action'));
 const problems=flowGraphDiagnostics(graph);
 assert.ok(problems.some(item=>item.nodeId===4&&item.description.includes('not reachable')));
 assert.ok(problems.some(item=>item.nodeId===4&&item.description.includes('outgoing path')));
 assert.equal(graph.elements.length,4);
});
