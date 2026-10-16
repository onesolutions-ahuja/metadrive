import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageSchema } from '../../apps/server/src/modules/pages/schemas.js';

const schema = createPageSchema();
const component = { id:'custom',type:'Custom:OneCard',label:'One Card',properties:{},visible:true,
  position:{x:0,y:0,width:320,height:180} };
function page(pageType:'App Page'|'Home Page'|'Record Page') {
  return {apiName:'ExistingPage',label:'Saved tenant page',targetObject:pageType==='Record Page'?'Account':'',
    pageType,layoutMode:'free-canvas',template:'one-region',canvasWidth:1200,canvasHeight:800,
    status:'Active',devices:['Desktop'],components:[component],activationAssignments:[]};
}
test('existing custom-component Free Canvas layouts load without changing App, Record or Home Page type',()=>{
  for(const kind of ['App Page','Record Page','Home Page'] as const)
    assert.equal(schema.safeParse(page(kind)).success,true,kind);
});
test('free canvas still rejects unsupported standard components and out-of-bounds positions',()=>{
  const unsupported=page('App Page');unsupported.components[0]={...component,type:'Record Field'};
  assert.equal(schema.safeParse(unsupported).success,false);
  const outOfBounds=page('Record Page');outOfBounds.components[0]={...component,position:{x:1100,y:700,width:320,height:180}};
  assert.equal(schema.safeParse(outOfBounds).success,false);
});
