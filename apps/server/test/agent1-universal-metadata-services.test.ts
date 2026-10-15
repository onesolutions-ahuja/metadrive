import test from 'node:test';
import assert from 'node:assert/strict';
import { relationshipFieldCategory } from '../src/modules/objects/dependencies.js';
import { evaluateCustomConditionLogic } from '../src/modules/flows/condition-logic.js';
import { resolvePageAssignment } from '../src/modules/pages/page-assignment.js';

test('agent1: relationship comparisons use shared metadata type categories', () => {
  for (const [dataType, expected] of [['Text(80)','text'],['Currency(16,2)','number'],['Date/Time','date'],['Checkbox','boolean'],['Lookup(User)','other']])
    assert.equal(relationshipFieldCategory({dataType} as never),expected);
  assert.equal(relationshipFieldCategory({dataType:'Formula',formula:{returnType:'Number'}} as never),'number');
});
test('agent1: Flow condition parser respects AND precedence and rejects bad indexes', () => {
  assert.equal(evaluateCustomConditionLogic('1 OR 2 AND 3',[true,false,false]),true);
  assert.equal(evaluateCustomConditionLogic('(1 OR 2) AND 3',[true,false,false]),false);
  assert.throws(() => evaluateCustomConditionLogic('1 OR 9',[true]),/only 1 condition/);
});
test('agent1: published page selection is metadata-driven and respects device/profile priority', () => {
  const mk = (scope:string, profileId?:string) => ({
    status:'Active',pageType:'Home Page',devices:['Desktop'],activationAssignments:[{
      scope,appId:'app1',profileId,formFactors:['Desktop']
    }]
  });
  const pages=[mk('App Default'),mk('App and Profile','role1')];
  const result=resolvePageAssignment(pages as never,{pageType:'Home Page',appId:'app1',profileId:'role1',formFactor:'Desktop'} as never);
  assert.equal(result,pages[1]);
  assert.equal(resolvePageAssignment(pages as never,{pageType:'Home Page',appId:'app1',profileId:'role1',formFactor:'Phone'} as never),undefined);
});
