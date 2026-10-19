import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {FlowDefinitionMetadata, ObjectMetadata} from '../src/core/metadata/Definitions/metadata';
import {flowReferenceChoices} from '../src/core/builders/FlowBuilder/flowReferenceCatalog';

const account: ObjectMetadata={
  apiName:'Account',label:'Account',pluralLabel:'Accounts',kind:'Standard Object',
  description:'',fields:[{apiName:'Name',label:'Name',dataType:'Text',required:false,unique:false}]
};

function flow(flowType:FlowDefinitionMetadata['flowType']):FlowDefinitionMetadata {
  return {
    apiName:'AccountFlow',label:'Account Flow',flowType,status:'Draft',versionNumber:1,
    activeVersion:null,triggerObject:'Account',startConfig:{},
    elements:[
      {id:1,type:'Start',label:'Start',config:{}},
      {id:2,type:'Decision',label:'Decision',config:{}}
    ],
    connectors:[{id:'start-decision',from:1,to:2,label:'Default',kind:'normal'}],
    resources:[],versions:[]
  };
}

test('record-triggered Flow references expose both current and prior trigger fields',()=>{
  const choices=flowReferenceChoices(flow('Record-Triggered Flow'),2,[account]);
  assert.ok(choices.some(choice=>choice.reference==='{!$Record.Name}'));
  assert.ok(choices.some(choice=>choice.reference==='{!$Record__Prior.Name}'));
  const screenChoices=flowReferenceChoices(flow('Screen Flow'),2,[account]);
  assert.ok(!screenChoices.some(choice=>choice.reference==='{!$Record__Prior.Name}'));
});

test('Create Records exposes new record Id in the following Create Records step',()=>{
  const draft=flow('Autolaunched Flow');
  draft.elements=[
    {id:1,type:'Start',label:'Start',config:{}},
    {id:3,type:'Create Records',label:'Create Sale',config:{object:'Sale',recordSource:'fields'}},
    {id:4,type:'Create Records',label:'Create SaleLine',config:{object:'SaleLine',recordSource:'fields'}}
  ];
  draft.connectors=[
    {id:'a',from:1,to:3,label:'Default',kind:'normal'},
    {id:'b',from:3,to:4,label:'Default',kind:'normal'}
  ];
  const sale={...account,apiName:'Sale',label:'Sale',pluralLabel:'Sales'};
  const choices=flowReferenceChoices(draft,4,[sale,account]);
  assert.ok(choices.some(choice=>choice.reference==='{!record3.Id}'
    &&choice.targetObject==='Sale'));
});
