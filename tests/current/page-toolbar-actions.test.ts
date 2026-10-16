import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePageToolbarActions } from '../../apps/web/src/pageToolbarActions.js';

const registration = {
  apiName: 'ReusableCart', label: 'Reusable cart', propertyDefinitions: [
    {propertyKey:'topbarActionEvent',defaultValue:'openDisplay'},
    {propertyKey:'topbarActionLabelProperty',defaultValue:'displayButtonLabel'},
    {propertyKey:'topbarActionRequiresProperty',defaultValue:'customerDisplayUrl'},
    {propertyKey:'displayButtonLabel',defaultValue:'Open customer display'}
  ]
};

test('page toolbar actions are registered-component metadata, not app names', () => {
  const page = {components:[{id:'cart-1',visible:true,type:'Custom:ReusableCart',
    label:'Till',properties:{customerDisplayUrl:'/pages/customer',displayButtonLabel:'Open paired display'}}]};
  assert.deepEqual(resolvePageToolbarActions(page as never,[registration] as never),
    [{componentId:'cart-1',event:'openDisplay',label:'Open paired display'}]);
});

test('missing configuration, absent registration and hidden components never expose actions', () => {
  const page = {components:[
    {id:'no-url',visible:true,type:'Custom:ReusableCart',label:'A',properties:{}},
    {id:'hidden',visible:false,type:'Custom:ReusableCart',label:'B',properties:{customerDisplayUrl:'/display'}},
    {id:'uninstalled',visible:true,type:'Custom:NotInstalled',label:'C',properties:{topbarActionEvent:'openDisplay'}}
  ]};
  assert.deepEqual(resolvePageToolbarActions(page as never,[registration] as never),[]);
});
