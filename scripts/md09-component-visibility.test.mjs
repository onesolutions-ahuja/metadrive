import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVisibilityRule, isComponentVisible } from '../apps/web/src/componentVisibility.ts';

const fields = [
  { apiName: 'Name', label: 'Name', dataType: 'Text' },
  { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', picklistValues: ['Open', 'Closed'] },
  { apiName: 'Amount__c', label: 'Amount', dataType: 'Currency(18,2)' },
  { apiName: 'Approved__c', label: 'Approved', dataType: 'Checkbox' },
];
const rule = (logic, conditions) => ({ logic, conditions });
const visible = (conditions, logic='All', overrides={}) => ({
  visible: true, properties: { ...overrides, visibilityRules: rule(logic,conditions) }
});
const device = (value='Desktop',operator='Equals')=>({source:'Device',operator,value});
const recordRule = (fieldApiName, value, operator='Equals') =>
  ({source:'Record Field',fieldApiName,operator,value});

const ctx = {
  formFactor: 'Desktop',
  record: {Name:'Approved',Status__c:'Open',Amount__c:120,Approved__c:true},
  fields, readableFieldApiNames:new Set(fields.map(x=>x.apiName))
};

test('legacy component visibility is unchanged without a rule', () => {
  assert.equal(isComponentVisible({visible:true,properties:{}},ctx,true),true);
  assert.equal(isComponentVisible({visible:false,properties:{}},ctx,true),false);
  assert.equal(isComponentVisible({visible:false,properties:{visibilityRules:rule('All',[device()])}},ctx,true),false);
});

test('device conditions control App, Home and Record Page rendering', () => {
  assert.equal(isComponentVisible(visible([device()]),ctx,false),true);
  assert.equal(isComponentVisible(visible([device('Phone')]),ctx,false),false);
  assert.equal(isComponentVisible(visible([device('Phone','Not Equals')]),ctx,false),true);
  assert.equal(isComponentVisible(visible([device()]),{formFactor:'Phone'},false),false);
});

test('current-record conditions are strongly typed and combine All/Any', () => {
  const condition=recordRule('Status__c','Open');
  assert.equal(isComponentVisible(visible([condition]),ctx,true),true);
  assert.equal(isComponentVisible(visible([recordRule('Amount__c','100','Greater Than')]),ctx,true),true);
  assert.equal(isComponentVisible(visible([recordRule('Approved__c','true')]),ctx,true),true);
  assert.equal(isComponentVisible(visible([condition,device('Phone')]),ctx,true),false);
  assert.equal(isComponentVisible(visible([condition,device('Phone')],'Any'),ctx,true),true);
  assert.equal(isComponentVisible(visible([recordRule('Name','foo','Contains')]),ctx,true),false);
});

test('record visibility cannot bypass read permissions or use unbound context', () => {
  const x=visible([recordRule('Status__c','Open')]);
  assert.equal(isComponentVisible(x,{...ctx,readableFieldApiNames:new Set(['Name'])},true),false);
  assert.equal(isComponentVisible(x,{...ctx,record:null},true),false);
  assert.equal(isComponentVisible(x,{...ctx,record:{}},true),false);
  assert.equal(isComponentVisible(x,ctx,false),false);
  assert.deepEqual(validateVisibilityRule(x.properties.visibilityRules,fields,false),['Record field conditions require a Record Page.']);
});

test('invalid, unsafe and stale visibility metadata fails closed', () => {
  const invalid=[
    {logic:'Any', conditions:[]},
    {logic:'All',conditions:[{source:'Hidden',operator:'Equals',value:'yes'}]},
    {logic:'All',conditions:[device('Tablet')]},
    {logic:'All',conditions:[recordRule('Deleted_Field__c','yes')]},
    {logic:'Any',conditions:[recordRule('__proto__','yes'),device()]},
    {logic:'Any',conditions:[recordRule('Amount__c','nan','Greater Than')]},
    {logic:'Any',conditions:[recordRule('Approved__c','maybe'),device()]},
    {logic:'All',conditions:Array.from({length:21},()=>device())},
    'showAll'
  ];
  for(const rules of invalid){
    assert.notEqual(validateVisibilityRule(rules,fields,true).length,0);
    assert.equal(isComponentVisible({visible:true,properties:{visibilityRules:rules}},ctx,true),false);
  }
  assert.deepEqual(validateVisibilityRule(undefined, fields, true),[]);
});
