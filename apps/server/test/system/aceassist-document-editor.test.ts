import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {aceAssistDocumentFlowApi,buildAceAssistDocumentGraph}
 from '../../src/app-seeders/aceassist-document-flows.js';

test('quotations and invoices have single-transaction header + item creation Flows',()=>{
 for(const type of ['Quotation','Invoice'] as const){
  const graph=buildAceAssistDocumentGraph(type,'Create');
  assert.equal(graph.apiName,aceAssistDocumentFlowApi('Create',type));
  const header=graph.elements.find(node=>node.id===2);
  const line=graph.elements.find(node=>node.id===4);
  assert.equal(header?.type,'Create Records');
  assert.equal(header?.config.object,type);
  assert.equal(line?.type,'Create Records');
  assert.equal(line?.config.object,type+'Line');
  assert.equal(line?.config.expectedParentId,'{!record2.Id}');
  assert.deepEqual(graph.connectors.filter(edge=>edge.label==='For Each').map(x=>x.to),[4]);
  assert.ok(graph.resources.some(x=>x.name==='lineInputs'));
  assert.ok(graph.resources.some(x=>x.name==='documentId'&&x.availableForOutput===true));
  assert.ok(!JSON.stringify(header?.config).includes('Subtotal'));
 }
});

test('document edits mutate only selected parent and preserve server line-total guards',()=>{
 for(const type of ['Quotation','Invoice'] as const){
  const graph=buildAceAssistDocumentGraph(type,'Update');
  assert.deepEqual(graph.elements.filter(n=>n.type==='Delete Records').map(n=>n.config),[
   {object:type+'Line',recordSource:'collection',collection:'removedLines',
    expectedParentId:'{!recordId}'}]);
  const update=graph.elements.find(n=>n.id===6);
  assert.equal(update?.config.expectedParentId,'{!recordId}');
  assert.equal(update?.config.fieldSource,'record');
  assert.equal(graph.elements.find(n=>n.id===8)?.config.expectedParentId,'{!recordId}');
  assert.ok(graph.elements.some(n=>n.type==='Decision'));
 }
 const financial=readFileSync(new URL('../../src/system-files/nodes/DocumentFinancialGuard.ts',import.meta.url),'utf8');
 assert.match(financial,/Financial line does not belong to the selected document/);
});

test('Ace Assist financial documents show inline items instead of separate navigation',()=>{
 const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 const editor=readFileSync(new URL('../../../aceassist/src/FinancialDocumentEditor.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../../aceassist/src/aceassist.css',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/label:'Quotation lines'|label:'Invoice lines'/);
 assert.match(runtime,/FinancialDocumentEditor/);
 assert.match(runtime,/documentFlow\(editing,editingObject\)/);
 assert.match(runtime,/documentLines/);
 assert.match(editor,/Line items|Products and services/);
 assert.match(editor,/newLines:lines.filter/);
 assert.match(editor,/updatedLines:changed.map/);
 assert.match(editor,/removedLines:storedLines.filter/);
 assert.match(css,/assist-document-line-numbers/);
});
