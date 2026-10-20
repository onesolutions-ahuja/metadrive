import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFlowFormula,validateFlowFormula,inferFlowFormulaType}
  from '../../src/system-files/flow-formula-runtime.js';

const lines=[{Quantity:2,PriceMinor:450},{Quantity:1,PriceMinor:200}];
const resolve=(name:string):unknown=>name==='Lines'?lines:undefined;

test('Record Collection formula aggregates support visual meal rules and totals',()=>{
  assert.equal(evaluateFlowFormula('COLLECTIONCOUNT({!Lines})',resolve),2);
  assert.equal(evaluateFlowFormula('COLLECTIONSUM({!Lines}, "Quantity")',resolve),3);
  assert.equal(evaluateFlowFormula('COLLECTIONSUM({!Lines}, "PriceMinor")',resolve),650);
  assert.equal(evaluateFlowFormula('COLLECTIONCOUNT({!Empty})',name=>name==='Empty'?[]:undefined),0);
  for(const formula of ['COLLECTIONCOUNT({!Lines})','COLLECTIONSUM({!Lines}, "PriceMinor")']){
    assert.doesNotThrow(()=>validateFlowFormula(formula));
    assert.equal(inferFlowFormulaType(formula,()=>undefined),'Number');
  }
});
test('Collection aggregation fails closed for non-records and untrusted field access',()=>{
  assert.throws(()=>evaluateFlowFormula('COLLECTIONCOUNT({!Bad})',()=>'{\"items\":[]}'),/Record Collection/);
  assert.throws(()=>evaluateFlowFormula('COLLECTIONCOUNT({!Bad})',()=>[1,2]),/Record Collection/);
  assert.throws(()=>evaluateFlowFormula('COLLECTIONSUM({!Lines}, "NoField")',resolve),/finite numeric/);
  assert.throws(()=>evaluateFlowFormula('COLLECTIONSUM({!Lines}, "__proto__")',resolve),/valid numeric field/);
  assert.throws(()=>evaluateFlowFormula('COLLECTIONSUM({!Lines}, "PriceMinor")',
    ()=>[{PriceMinor:Infinity}]),/finite numeric/);
  assert.throws(()=>evaluateFlowFormula('COLLECTIONCOUNT({!Lines})',
    ()=>Array.from({length:201},()=>({}))),/maximum 200/);
  assert.throws(()=>inferFlowFormulaType('COLLECTIONSUM({!Lines}, {!Field})',()=>undefined),/literal numeric field/);
});
