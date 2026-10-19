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
