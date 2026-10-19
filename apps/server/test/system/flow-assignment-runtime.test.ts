import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyFlowAssignment} from '../../src/system-files/flow-assignment-runtime.js';

const resources=[
  {name:'ValidChoices',type:'Record Collection',isCollection:true,dataType:'MealChoice'},
  {name:'CurrentChoice',type:'Record',dataType:'MealChoice'},
  {name:'Total',type:'Variable',dataType:'Number'},
  {name:'Message',type:'Variable',dataType:'Text'}
];
function context(config:Record<string,unknown>,vars:Record<string,unknown>) {
  const scalar=(value:unknown)=>value===null||typeof value==='string'
    ||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);
  return {
    config,vars,resources,
    resolveReference:(reference:string)=>{
      const [name,field]=reference.split('.');
      if(!Object.hasOwn(vars,name))throw new Error('Unknown reference');
      const value=vars[name];
      return field&&value&&typeof value==='object'&&!Array.isArray(value)
        ?(value as Record<string,unknown>)[field]:value;
    },
    evaluateScalar:(value:unknown)=>{
      if(!scalar(value))throw new Error('Scalar expected');
      return value;
    },
    setScalar:(name:unknown,value:string|number|boolean|null)=>{
      if(typeof name!=='string')throw new Error('Invalid target');
      vars[name]=value;
    }
  };
}
const run=(config:Record<string,unknown>,vars:Record<string,unknown>)=>
  applyFlowAssignment(context(config,vars));

test('record collection Assignment can accumulate authoritative Object records',()=>{
  const vars:Record<string,unknown>={
    ValidChoices:[],CurrentChoice:{Id:'record-1',ExtraMinor:150}
  };
  run({variable:'ValidChoices',operator:'Add',value:'{!CurrentChoice}'},vars);
  assert.deepEqual(vars.ValidChoices,[{Id:'record-1',ExtraMinor:150}]);
  vars.CurrentChoice={Id:'record-2',ExtraMinor:0};
  run({variable:'ValidChoices',operator:'Add At Beginning',value:'{!CurrentChoice}'},vars);
  assert.deepEqual((vars.ValidChoices as Array<{Id:string}>).map(x=>x.Id),['record-2','record-1']);
  run({variable:'ValidChoices',operator:'Remove',value:'{!CurrentChoice}'},vars);
  assert.deepEqual((vars.ValidChoices as Array<{Id:string}>).map(x=>x.Id),['record-1']);
  run({variable:'ValidChoices',operator:'Remove All'},vars);
  assert.deepEqual(vars.ValidChoices,[]);
});
test('scalar Assignment applies configured numeric and text operators',()=>{
  const vars:Record<string,unknown>={Total:100,Message:'Hello'};
  run({variable:'Total',operator:'Add',value:20},vars);
  run({variable:'Total',operator:'Multiply',value:2},vars);
  assert.equal(vars.Total,240);
  run({variable:'Message',operator:'Add At End',value:' KFC'},vars);
  assert.equal(vars.Message,'Hello KFC');
  assert.throws(()=>run({variable:'Total',operator:'Divide',value:0},vars),/division by zero/);
  assert.throws(()=>run({variable:'Message',operator:'Multiply',value:2},vars),/numeric resources/);
});
test('Assignments reject malformed, oversized or untyped collection items',()=>{
  const vars:Record<string,unknown>={ValidChoices:[]};
  assert.throws(()=>run({variable:'ValidChoices',operator:'Add',value:4},vars),/record values/);
  vars.Bad=[{Id:'x',Extra:{unexpected:true}}];
  assert.throws(()=>run({variable:'ValidChoices',operator:'Assign',value:'{!Bad}'},vars),/invalid fields/);
  vars.Many=Array.from({length:201},(_,i)=>({Id:String(i)}));
  assert.throws(()=>run({variable:'ValidChoices',operator:'Assign',value:'{!Many}'},vars),/at most 200/);
  assert.deepEqual(vars.ValidChoices,[]);
});
