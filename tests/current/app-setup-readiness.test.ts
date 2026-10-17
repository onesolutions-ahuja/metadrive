import test from 'node:test';
import assert from 'node:assert/strict';
import { assessApplicationSetup, suggestAppApiName } from '../../apps/web/src/appSetupReadiness.ts';
import type { LightningAppMetadata, LightningPageMetadata, ObjectMetadata } from '../../apps/web/src/metadata.ts';

const app = (overrides: Partial<LightningAppMetadata> = {}): LightningAppMetadata => ({
  apiName: 'Shop', label: 'Shop', description: '', navigationItems: ['Product__c'],
  navigationPageApiNames: [], navigationOrder: [{type:'Object',apiName:'Product__c'}],
  brandColor: '#0176d3', utilityItems: [], ...overrides
});
const product = (overrides: Partial<ObjectMetadata> = {}): ObjectMetadata => ({
  apiName:'Product__c',label:'Product',pluralLabel:'Products',kind:'Custom Object',description:'',
  fields:[{apiName:'Name',label:'Name',dataType:'Text(255)',required:true,unique:false}],
  ...overrides
});
const page = (overrides: Partial<LightningPageMetadata> = {}): LightningPageMetadata => ({
  apiName:'Checkout',label:'Checkout',targetObject:'',pageType:'App Page',status:'Active',
  layoutMode:'template',canvasWidth:1200,canvasHeight:800,devices:['Desktop'],
  components:[], ...overrides
});

test('suggests a valid Lightning app API name and handles case-insensitive collisions', () => {
  assert.equal(suggestAppApiName('One POS V2',[]),'OnePOSV2');
  assert.equal(suggestAppApiName('2 retail apps',[]),'App2RetailApps');
  assert.equal(suggestAppApiName('One POS V2',[app({apiName:'oneposv2'})]),'OnePOSV22');
  assert.match(suggestAppApiName('!',[app({apiName:'App'})]),/^App[0-9]+$/);
});

test('does not confuse metadata configuration with operational verification', () => {
  const checks=assessApplicationSetup({app:app(),apps:[app()],objects:[product()],pages:[]});
  assert.equal(checks.find(item=>item.id==='data')?.level,'configured');
  assert.equal(checks.find(item=>item.id==='pages')?.level,'review'); // object-only applications are valid
  assert.equal(checks.find(item=>item.id==='security')?.level,'review');
  assert.equal(checks.find(item=>item.id==='integrations')?.level,'review');
  assert.equal(checks.find(item=>item.id==='release')?.level,'review');
  assert.equal(checks.find(item=>item.id==='identity')?.level,'configured');
});

test('flags invalid app names and duplicate API names only for creation', () => {
  const existing=app();
  const creating=assessApplicationSetup({app:app(),apps:[existing],objects:[product()],pages:[],creating:true});
  assert.equal(creating.find(item=>item.id==='identity')?.level,'action');
  const editing=assessApplicationSetup({app:app(),apps:[existing],objects:[product()],pages:[]});
  assert.equal(editing.find(item=>item.id==='identity')?.level,'configured');
  const invalid=assessApplicationSetup({app:app({apiName:'Bad-Key'}),apps:[],objects:[],pages:[]});
  assert.equal(invalid.find(item=>item.id==='identity')?.level,'action');
});

test('shows duplicate labels with the actual Object API names', () => {
  const checks=assessApplicationSetup({
    app:app({navigationItems:['Product__c','Product']}),
    apps:[],pages:[],
    objects:[product(),product({apiName:'Product',kind:'Standard Object'})]
  });
  const data=checks.find(item=>item.id==='data');
  assert.equal(data?.level,'review');
  assert.match(data?.findings.join(' ')??'',/Product__c, Product/);
});

test('identifies inactive pages, missing component bindings, missing Flow, and missing fields', () => {
  const linked=page({components:[{id:'catalog',type:'Custom:OneItemGrid',label:'Catalog',
    properties:{objectApiName:'Product__c',nameFieldApiName:'NotAField',
      actionFlows:{select:{actionType:'Flow',flowApiName:'NonexistentCheckout'}}},
    visible:true}]});
  const scope={
    app:app({navigationPageApiNames:['Checkout','Old'],navigationOrder:[]}),
    apps:[app()],objects:[product()],pages:[linked,page({apiName:'Old',label:'Old',status:'Draft'})]
  };
  const checks=assessApplicationSetup(scope);
  assert.equal(checks.find(item=>item.id==='pages')?.level,'action');
  const dependencies=checks.find(item=>item.id==='bindings');
  assert.equal(dependencies?.level,'action');
  assert.match(dependencies?.findings.join(' ')??'',/NotAField/);
  assert.match(dependencies?.findings.join(' ')??'',/NonexistentCheckout/);
});

test('inspects Flow-backed shared state only when a component binds a Flow', () => {
  const shared=page({components:[{
    id:'state',type:'Text',label:'Shared display',visible:true,
    properties:{stateSyncEnabled:true,stateReadFlowApiName:'ReadSharedState',stateWriteFlowApiName:'WriteSharedState'}
  }]});
  const scope={app:app({navigationPageApiNames:['Checkout'],navigationOrder:[]}),
    apps:[app()],objects:[product()],pages:[shared]};
  const unloaded=assessApplicationSetup(scope);
  assert.equal(unloaded.find(item=>item.id==='bindings')?.level,'review');
  assert.match(unloaded.find(item=>item.id==='bindings')?.findings.join(' ')??'',/not been checked/);
  const checked=assessApplicationSetup({...scope,flows:[]});
  assert.equal(checked.find(item=>item.id==='bindings')?.level,'action');
  assert.match(checked.find(item=>item.id==='bindings')?.findings.join(' ')??'',/ReadSharedState/);
});
