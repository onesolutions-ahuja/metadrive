import test from 'node:test';
import assert from 'node:assert/strict';
import { insertFlowElementAtPath, reconcileDecisionOutcomePaths, completeFlowEndPaths } from '../src/core/builders/FlowBuilder/flowInsertElement.mjs';

const start = { id: 1, type: 'Start', label: 'Start', config: {} };
const step = { id: 2, type: 'Assignment', label: 'Assign', config: {} };
const end = { id: 3, type: 'End', label: 'End', config: {} };
const link = (id, from, to) => ({ id, from, to, label: '', kind: 'normal' });

test('End terminates a leaf path without an outgoing connector', () => {
  const graph = { elements: [start, step], connectors: [link('a', 1, 2)] };
  const result = insertFlowElementAtPath(graph, 2, end, undefined, 'b');
  assert.deepEqual(result.connectors, [link('a', 1, 2), link('b', 2, 3)]);
  assert.equal(result.connectors.some(c => c.from === 3), false);
});

test('End cannot split an existing connector and create an invalid outgoing path', () => {
  const graph = { elements: [start, step], connectors: [link('a', 1, 2)] };
  assert.throws(() => insertFlowElementAtPath(graph, 1, end, 'a', 'b'), /End must terminate a path/);
});

test('No element may be inserted after End', () => {
  const graph = { elements: [start, end], connectors: [link('a', 1, 3)] };
  assert.throws(() => insertFlowElementAtPath(graph, 3, step, undefined, 'b'), /Cannot add after an End/);
});

const decision = { id: 4, type: 'Decision', label: 'Check status',
  config: { outcomes: [{ name: 'Approved', label: 'Approved' }, { name: 'Default', label: 'Default Outcome' }] } };

test('Decision inserted before End connects all outcomes to End', () => {
  const graph = { elements: [start, end], connectors: [link('a', 1, 3)] };
  const result = insertFlowElementAtPath(graph, 1, decision, undefined, 'c');
  assert.equal(result.connectors.find(c => c.id === 'a').to, 4);
  assert.deepEqual(result.connectors.filter(c => c.from === 4).map(c => [c.label,c.to]),
    [['Approved',3], ['Default',3]]);
});

test('Decision inserted at a leaf creates an End automatically', () => {
  const graph = { elements: [start], connectors: [] };
  const result = insertFlowElementAtPath(graph, 1, decision, undefined, 'c');
  const terminal = result.elements.find(e => e.type === 'End');
  assert.ok(terminal);
  assert.deepEqual(result.connectors.filter(c => c.from === 4).map(c => c.to),
    [terminal.id,terminal.id]);
});

test('Decision outcome rename retains destination and new outcomes receive End route', () => {
  const graph = {
    elements: [start, decision, end, step],
    connectors: [link('start',1,4),
      { ...link('approved',4,2), label:'Approved' },
      { ...link('default',4,3), label:'Default' }]
  };
  const renamed = reconcileDecisionOutcomePaths(graph,4,
    [{ name:'Accepted',label:'Accepted' }, { name:'Default',label:'Default Outcome' }],'new');
  assert.equal(renamed.connectors.find(c => c.id === 'approved').label,'Accepted');
  assert.equal(renamed.connectors.find(c => c.id === 'approved').to,2);
  const extended = reconcileDecisionOutcomePaths(renamed,4,
    [{ name:'Accepted',label:'Accepted' },{ name:'Rejected',label:'Rejected' },
      { name:'Default',label:'Default Outcome' }],'more');
  assert.deepEqual(extended.connectors.filter(c => c.from === 4).map(c => c.label).sort(),
    ['Accepted','Default','Rejected']);
  assert.equal(extended.connectors.find(c => c.label === 'Rejected').to,3);
});

test('Legacy Start -> Screen Draft can restore and save a terminal End safely', () => {
  const screen = { id: 2, type: 'Screen', label: 'Checkout details', config: { fields: [] } };
  const legacy = { status:'Draft', elements:[start,screen], connectors:[link('a',1,2)] };
  const repaired = completeFlowEndPaths(legacy,'repair');
  assert.equal(repaired.elements.filter(node => node.type === 'End').length,1);
  assert.equal(repaired.connectors.length,2);
  assert.equal(repaired.connectors.find(edge => edge.from === 2).to,repaired.elements.find(node => node.type === 'End').id);
  assert.deepEqual(completeFlowEndPaths(repaired,'again'),repaired);
  assert.deepEqual(legacy.elements,[start,screen]);
});

test('Legacy Decision repair adds missing default path without overwriting assigned outcome target', () => {
  const graph = {status:'Draft',elements:[start,decision,step,end],
    connectors:[link('a',1,4),{...link('b',4,2),label:'Approved'},link('c',2,3)]};
  const repaired = completeFlowEndPaths(graph,'repair');
  assert.equal(repaired.connectors.find(c => c.id === 'b').to,2);
  assert.equal(repaired.connectors.find(c => c.from === 4 && c.label === 'Default').to,3);
  assert.deepEqual(completeFlowEndPaths(repaired,'again'),repaired);
});

test('Orchestration Stage splits a path into exactly Approved/Rejected branches',()=>{
 const graph={elements:[start,end],connectors:[link('orig',1,3)]};
 const stage={id:4,type:'Orchestration Stage',label:'Manager Review',config:{}};
 const next=insertFlowElementAtPath(graph,1,stage,undefined,'new-path');
 assert.equal(next.connectors.find(item=>item.id==='orig').to,4);
 assert.deepEqual(next.connectors.filter(item=>item.from===4).map(item=>item.label),
  ['Approved','Rejected']);
 assert.ok(next.connectors.filter(item=>item.from===4).every(item=>item.to===3));
 assert.equal(graph.connectors[0].to,3);
});

test('Complete End Paths repairs a disconnected orchestration stage without losing branches',()=>{
 const graph={status:'Draft',elements:[start,{id:4,type:'Orchestration Stage',label:'Review',config:{}}],
  connectors:[link('before',1,4)]};
 const result=completeFlowEndPaths(graph,'terminal');
 assert.deepEqual(result.connectors.filter(item=>item.from===4).map(item=>item.label),
  ['Approved','Rejected']);
 assert.equal(result.elements.filter(item=>item.type==='End').length,1);
});
