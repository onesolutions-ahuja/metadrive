import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponentCatalog,buildBundledComponent} from '../../../scripts/component-catalog.mjs';
import {filterPageRecordsBySelection} from '../src/core/pages/PageRuntime/pageComponentBindings';
import type {FieldMetadata} from '../src/core/metadata/Definitions/metadata';

const fields=[
  {apiName:'ParentId',label:'Parent',dataType:'Lookup',required:false,unique:false},
  {apiName:'Name',label:'Name',dataType:'Text',required:false,unique:false}
] as FieldMetadata[];

test('generic sibling selection filters related records and fails closed on invalid metadata',()=>{
  const rows=[
    {Id:'one',ParentId:'meal-a',Name:'Fries'},
    {Id:'two',ParentId:'meal-b',Name:'Drink'},
    {Id:'three',ParentId:{Id:'meal-a'},Name:'Wings'},
    {Id:'four',Name:'Unavailable lookup'}
  ];
  assert.deepEqual(filterPageRecordsBySelection(rows,fields,'ParentId','meal-a',true)
    .map(item=>item.Id),['one','three']);
  assert.deepEqual(filterPageRecordsBySelection(rows,fields,'ParentId',undefined,true),[]);
  assert.deepEqual(filterPageRecordsBySelection(rows,fields,'ParentId',undefined,false),rows);
  assert.deepEqual(filterPageRecordsBySelection(rows,fields,'NotAField','meal-a',true),[]);
  assert.deepEqual(filterPageRecordsBySelection(rows,fields,'','meal-a',true),[]);
});

test('generic Choice reads authorized Object records through its property metadata',async()=>{
  const {components}=await loadComponentCatalog();
  const choice=components.find(component=>component.apiName==='OneChoice');
  assert.ok(choice);
  const built=await buildBundledComponent(choice);
  const context={React,module:{exports:{} as any},Intl};
  vm.runInNewContext(built.compiledJs,context);
  const Component=context.module.exports.default;
  const html=renderToStaticMarkup(React.createElement(Component,{
    label:'Select a side',mode:'checkbox',optionSource:'records',
    optionLabelFieldApiName:'Name',optionValueFieldApiName:'Id',
    optionPriceFieldApiName:'Extra',optionAvailableFieldApiName:'Available',
    currencyCode:'GBP',minSelections:1,maxSelections:2,
    records:[
      {Id:'s1',Name:'Fries',Extra:0,Available:true},
      {Id:'s2',Name:'Coleslaw',Extra:0.5,Available:true},
      {Id:'s3',Name:'Disabled',Extra:0,Available:false}
    ]
  }));
  assert.match(html,/Fries/);
  assert.match(html,/Coleslaw/);
  assert.match(html,/0\.50/);
  assert.match(html,/Select at least 1 and no more than 2 options/);
  assert.doesNotMatch(html,/Disabled/);
  assert.match(html,/value="s1"/);
});

test('Choice record mode fails closed when the configured label field is missing',async()=>{
  const {components}=await loadComponentCatalog();
  const choice=components.find(component=>component.apiName==='OneChoice');
  assert.ok(choice);
  const built=await buildBundledComponent(choice);
  const context={React,module:{exports:{} as any},Intl};
  vm.runInNewContext(built.compiledJs,context);
  const html=renderToStaticMarkup(React.createElement(context.module.exports.default,{
    label:'Choice',optionSource:'records',records:[{Id:'s1',Name:'Fries'}]
  }));
  assert.match(html,/Select the record label field/);
  assert.doesNotMatch(html,/Fries/);
});

test('one input change invokes the configured backend action exactly once',async()=>{
  const original=await readFile(new URL('../src/one/shared/OneInputs.jsx',import.meta.url),'utf8');
  const source=original.replace(
    "import {componentAppearance} from './componentAppearance.js';",
    "const componentAppearance = () => ({});"
  );
  const compiled=await transform(source,{loader:'jsx',format:'cjs'});
  const context={module:{exports:{} as any},React};
  vm.runInNewContext(compiled.code,context);
  const events:string[]=[];
  const props={
    changeEventHandledByOnChange:true,
    onChange:()=>events.push('change'),
    onAction:()=>events.push('action')
  };
  context.module.exports.fire(props,'change','s1');
  assert.deepEqual(events,['change']);
  context.module.exports.fire(props,'submit','s1');
  assert.deepEqual(events,['change','change','action']);
});
