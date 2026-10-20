import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  acceptScreenRecordSelection,screenRecordPayload,validateScreenRecordBindings,ScreenSelectionError
} from '../../src/system-files/flow-screen-record-selection.js';

const first='00000000-0000-4000-8000-000000000021';
const second='00000000-0000-4000-8000-000000000022';
const outside='00000000-0000-4000-8000-000000000023';
const source=[{Id:first,Name:'Chicken',Price:3},{Id:second,Name:'Sides',Price:2}];
const resources=[
  {name:'MealOptions',type:'Record Collection',dataType:'Product__c'},
  {name:'SelectedMeals',type:'Record Collection',dataType:'Product__c'},
  {name:'Unrelated',type:'Record Collection',dataType:'Other__c'}
];
const field={apiName:'Chosen',type:'Data Table',collection:'MealOptions',
  selectedRowsResource:'SelectedMeals',multiselect:true,minimumSelections:1,maximumSelections:2};
const screen={config:{fields:[field,{apiName:'Note',type:'Text'}]}};
const reader=async (objectApi:string,id:string)=>{
  assert.equal(objectApi,'Product__c');
  const record=source.find(item=>item.Id===id);
  if(!record)throw new Error('Not found');
  return record;
};

test('Screen Flow exposes only bound collection and previously selected IDs on Back',()=>{
  const vars={MealOptions:source,SelectedMeals:[source[1]],Unrelated:[{Id:outside}],Note:'hello'};
  const payload=screenRecordPayload(screen,vars,resources);
  assert.deepEqual(payload.screenResources,{MealOptions:source});
  assert.deepEqual(payload.values,{Chosen:[second],Note:'hello'});
  assert.equal(Object.hasOwn(payload.screenResources,'Unrelated'),false);
});

test('Screen Flow converts selected IDs to reauthorized typed record collection in order',async()=>{
  const vars:Record<string,unknown>={MealOptions:source};
  const checked:string[]=[];
  const done=await acceptScreenRecordSelection(field,[second,first],vars,resources,async(obj,id)=>{
    checked.push(id);return reader(obj,id);
  });
  assert.equal(done,true);
  assert.deepEqual(checked,[second,first]);
  assert.deepEqual(vars.SelectedMeals,[source[1],source[0]]);
  assert.deepEqual(screenRecordPayload(screen,vars,resources).values.Chosen,[second,first]);
  // Reuse the existing SQL typed Record Collection for Loop and Create Records steps.
  assert.equal((vars.SelectedMeals as typeof source).length,2);
});

test('Screen Flow refuses forged, repeated, malformed, over-limit and missing IDs',async()=>{
  const call=(value:unknown)=>acceptScreenRecordSelection(field,value,
    {MealOptions:source},resources,reader);
  await assert.rejects(()=>call([outside]),(error: unknown) =>
    error instanceof ScreenSelectionError
    && /not in the permitted record collection/.test(error.message));
  await assert.rejects(()=>call([first,first]),/duplicate/);
  await assert.rejects(()=>call([first,25]),/Invalid Screen selection entries/);
  await assert.rejects(()=>call([first,second,outside]),/selection count/);
  await assert.rejects(()=>call([]),/selection count/);
  await assert.rejects(()=>call(['not-uuid']),/Invalid or duplicate/);
  await assert.rejects(()=>call({Id:first}),/Invalid Screen selection/);
});

test('Screen Flow enforces fresh record access and Field/Object-type matching',async()=>{
  const vars:Record<string,unknown>={MealOptions:source};
  await assert.rejects(
    ()=>acceptScreenRecordSelection(field,[first],vars,resources,
      async()=>{throw new Error('OneEngine record access denied');}),
    /OneEngine record access denied/
  );
  assert.equal(vars.SelectedMeals,undefined);
  await assert.rejects(
    ()=>acceptScreenRecordSelection({...field,selectedRowsResource:'Unrelated'},[first],
      vars,resources,reader),/incompatible Object/
  );
  await assert.rejects(
    ()=>acceptScreenRecordSelection({...field,selectedRowsResource:'MealOptions'},[first],
      vars,resources,reader),/incompatible Object/
  );
});

test('Choice Lookup stores selected rows in a typed resource and verifies read access',async()=>{
  const vars:Record<string,unknown>={};
  const lookup={apiName:'Choice',type:'Choice Lookup',objectApiName:'Product__c',
    multipleSelections:true,selectedRowsResource:'SelectedMeals'};
  assert.equal(await acceptScreenRecordSelection(lookup,[first,second],vars,resources,reader),true);
  assert.deepEqual(vars.SelectedMeals,source);
  assert.deepEqual(screenRecordPayload({config:{fields:[lookup]}},vars,resources).values.Choice,
    [first,second]);
  await assert.rejects(()=>acceptScreenRecordSelection({...lookup,objectApiName:'Other__c'},
    [first],vars,resources,reader),/does not match the lookup/);
});

test('Screen Flow selected row output is validated before Flow activation',()=>{
  const elements=[{id:2,type:'Get Records',config:{object:'Product__c',
    recordLimit:'all',outputVariable:'MealOptions'}}];
  assert.deepEqual(validateScreenRecordBindings(screen,
    resources.filter(item=>item.name!=='MealOptions'),elements),[]);
  assert.match(validateScreenRecordBindings(screen,
    resources.filter(item=>item.name!=='SelectedMeals'),elements).join(' '),
    /declared Record Collection/);
  assert.match(validateScreenRecordBindings({config:{fields:[{
    ...field,selectedRowsResource:'MealOptions'}]}},resources,elements).join(' '),
    /separate matching/);
  assert.match(validateScreenRecordBindings({config:{fields:[{
    ...field,maximumSelections:0,minimumSelections:201}]}},resources,elements).join(' '),
    /selection limits/);
  assert.match(validateScreenRecordBindings({config:{fields:[{
    ...field,selectedRowsResource:''}]}},resources,elements).join(' '),
    /multiple selection requires/);
});
