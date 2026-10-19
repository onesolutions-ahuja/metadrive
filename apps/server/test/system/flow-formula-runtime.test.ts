import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateFlowFormula} from '../../src/system-files/flow-formula-runtime.js';

test('Flow formulas evaluate arithmetic, precedence, references and short-circuit functions',()=>{
  const resources:Record<string,unknown>={Amount:20,Name:'MetaDrive'};
  const resolve=(name:string)=>resources[name];
  assert.equal(evaluateFlowFormula('Amount + 2 * 3',resolve),26);
  assert.equal(evaluateFlowFormula('IF(Amount >= 20, UPPER(@Name), 1 / 0)',resolve),'METADRIVE');
  assert.equal(evaluateFlowFormula('AND(Amount > 10, NOT(FALSE))',resolve),true);
  assert.equal(evaluateFlowFormula('LEFT(Name, 4) & "!"',resolve),'Meta!');
});

test('Flow formulas reject unsupported functions, malformed syntax and division by zero',()=>{
  const resolve=()=>null;
  assert.throws(()=>evaluateFlowFormula('RUN_CODE("x")',resolve),/Unsupported Flow formula function/);
  assert.throws(()=>evaluateFlowFormula('1 + (2 * 3',resolve),/parenthesis/);
  assert.throws(()=>evaluateFlowFormula('4 / 0',resolve),/division by zero/);
  assert.throws(()=>evaluateFlowFormula('1 @ 2',resolve),/Unsupported Flow formula character/);
});

test('formula DISTANCE calculates miles and kilometers between geolocations',()=>{
  const expression='DISTANCE(GEOLOCATION(0, 0), GEOLOCATION(0, 1), "km")';
  const distance=evaluateFlowFormula(expression,()=>null);
  assert.ok(typeof distance==='number'&&Math.abs(distance-111.195)<0.01);
  const miles=evaluateFlowFormula('DISTANCE(GEOLOCATION(0, 0), GEOLOCATION(0, 1), "mi")',()=>null);
  assert.ok(typeof miles==='number'&&Math.abs(miles-69.093)<0.01);
  assert.throws(()=>evaluateFlowFormula('GEOLOCATION(91, 0)',()=>null),/coordinates/);
});
