import {responsiveNumberFields,responsiveOptionFields,responsiveSettingKeys} from '../src/metadataAppearanceSchema';
import * as React from 'react';
import {compileComponentModule} from '../src/componentRuntimeModule';
import {findRegisteredComponent} from '../src/componentRegistryLookup';
import {appearanceNumberFields,appearanceColorFields,appearanceChoiceFields} from '../src/metadataAppearanceSchema';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canNestComponent, componentVisualStyle, directChildren, normalizeVisualProperties } from '../src/pageComponentLayout';
import type { PageComponentMetadata } from '../src/metadata';
const components: PageComponentMetadata[] = [
  { id: 'grid', type: 'Grid', label: 'Grid', properties: {}, visible: true },
  { id: 'row', type: 'Row', parentId: 'grid', label: 'Row', properties: {}, visible: true },
  { id: 'card', type: 'Card', parentId: 'row', label: 'Card', properties: {}, visible: true },
  { id: 'text', type: 'Custom:Text', parentId: 'card', label: 'Text', properties: {}, visible: true }
];
test('nested component relationships prevent cycles and reject non-containers', () => {
  assert.equal(canNestComponent(components, 'text', 'grid'), true);
  assert.equal(canNestComponent(components, 'grid', 'card'), false);
  assert.equal(canNestComponent(components, 'grid', 'grid'), false);
  assert.equal(canNestComponent(components, 'grid', 'text'), false);
  assert.deepEqual(directChildren(components, 'row').map((item) => item.id), ['card']);
  assert.deepEqual(directChildren(components).map((item) => item.id), ['grid']);
});
test('styles clamp out-of-range values and validate tokens', () => {
  const v = normalizeVisualProperties({ padding: -50, desktopColumns: 200, borderWidth: 999, backgroundColor: 'url(javascript:evil)', align: 'broken' });
  assert.equal(v.padding, 0); assert.equal(v.desktopColumns, 12); assert.equal(v.borderWidth, 16);
  assert.equal(v.backgroundColor, ''); assert.equal(v.align, 'stretch');
});
test('responsive grid styles use configured device columns', () => {
  const visual = { desktopColumns: 4, tabletColumns: 2, mobileColumns: 1 };
  assert.equal(componentVisualStyle(visual, 'Grid', 'Desktop').gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
  assert.equal(componentVisualStyle(visual, 'Grid', 'Tablet').gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(componentVisualStyle(visual, 'Grid', 'Phone').gridTemplateColumns, 'repeat(1, minmax(0, 1fr))');
});

test('appearance editor and normalizer share a single ordered metadata schema',()=>{
  assert.equal(new Set(appearanceNumberFields.map(x=>x.key)).size,appearanceNumberFields.length);
  const maxes=Object.fromEntries(appearanceNumberFields.map(x=>[x.key,x.max]));
  const input=Object.fromEntries(appearanceNumberFields.map(x=>[x.key,x.max+100]));
  const normal=normalizeVisualProperties(input);
  for(const [key,max] of Object.entries(maxes)) assert.equal((normal as unknown as Record<string,unknown>)[key],max);
  assert.deepEqual(appearanceColorFields.map(x=>x.key),['backgroundColor','color','borderColor']);
  assert.deepEqual(appearanceChoiceFields.map(x=>x.key),['align','justify']);
});

test('shared component runtime and registry respect metadata definitions',()=>{
 const Component=compileComponentModule('module.exports.default = function A(){return null}',React);
 assert.equal(typeof Component,'function');
 const list=[{apiName:'One',status:'Published',surfaces:['page','dashboard']}];
 assert.equal(findRegisteredComponent(list as any,'One','page')?.apiName,'One');
 assert.equal(findRegisteredComponent(list as any,'One','flow'),undefined);
});

test('responsive editor and persistence accept one identical metadata schema',()=>{
  const keys=new Set(responsiveSettingKeys);
  assert.equal(keys.size,responsiveSettingKeys.length);
  for(const field of responsiveNumberFields) {
    assert.equal(validateLayoutSetting(field.key,field.min),'');
    assert.equal(validateLayoutSetting(field.key,field.max),'');
    assert.notEqual(validateLayoutSetting(field.key,field.max+1),'');
  }
  for(const field of responsiveOptionFields) {
    for(const option of field.options) assert.equal(validateLayoutSetting(field.key,option),'');
    assert.notEqual(validateLayoutSetting(field.key,'unsupported-option'),'');
  }
});
test('legacy and modern nesting reject cycles and preserve custom container capabilities',()=>{
  const elements=[
    {id:'a',type:'Container',properties:{},position:{x:0,y:0,width:1,height:1}},
    {id:'b',type:'Custom:Panel',properties:{layoutContainer:true,layoutParentId:'a'},position:{x:0,y:0,width:1,height:1}},
    {id:'c',type:'Text',properties:{layoutParentId:'b'},position:{x:0,y:0,width:1,height:1}}
  ] as any;
  assert.equal(canNest(elements,'a','b'),false);
  assert.equal(canNestComponent(elements,'c','a'),true);
  assert.equal(canNestComponent(elements,'a','b'),false);
  assert.equal(isDescendantOf(elements,'c','a'),true);
  assert.equal(canNest(elements,'b','c'),false);
});
