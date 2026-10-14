import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveComponentSettings, sortComponentSettings, validateComponentSetting
} from '../apps/web/src/componentSettingDefinitions.ts';

test('saved app instance values win over shared defaults including false and zero', () => {
  const fields = [
    { propertyKey:'enabled', label:'Enabled', kind:'BOOLEAN', defaultValue:true },
    { propertyKey:'columns', label:'Columns', kind:'NUMBER', defaultValue:3 },
    { propertyKey:'title', label:'Title', kind:'TEXT', defaultValue:'Shared' }
  ];
  assert.deepEqual(resolveComponentSettings(fields, { enabled:false,columns:0,title:'' }),
    { enabled:false,columns:0,title:'' });
  assert.deepEqual(resolveComponentSettings(fields, { title:'Kiosk' }),
    { enabled:true,columns:3,title:'Kiosk' });
  assert.deepEqual(resolveComponentSettings(fields, { title:'Till' }),
    { enabled:true,columns:3,title:'Till' });
});

test('metadata determines ordering and choice validation without component-name switches', () => {
  const choices = { propertyKey:'fit', label:'Image fit', kind:'SELECT', choices:[
    {key:'cover',label:'Cover'},{key:'contain',label:'Contain'}
  ] };
  assert.equal(validateComponentSetting(choices,'contain'), true);
  assert.equal(validateComponentSetting(choices,'invalid'), false);
  assert.deepEqual(sortComponentSettings([
    {propertyKey:'z',label:'Z',kind:'TEXT',displayOrder:2},
    {propertyKey:'a',label:'A',kind:'TEXT',displayOrder:1}
  ]).map(x=>x.propertyKey),['a','z']);
});
