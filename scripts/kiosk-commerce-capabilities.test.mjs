import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {customisationObjects,basketObjectExtensions,demoModifierGroups,demoModifierOptions,demoModifierAssignments} from './kiosk-commerce-capabilities.mjs';
import {validateSelections,priceBasketLine,basketTotals,lineFingerprint} from './kiosk-commerce-basket.mjs';

test('modifier definitions reuse custom Object metadata and valid relationships',()=>{
 const objects=new Map(customisationObjects.map(o=>[o.apiName,o]));
 assert.equal(objects.size,4);
 for(const definition of objects.values()){
   assert.equal(definition.kind,'Custom Object');
   assert.ok(definition.apiName.endsWith('__c'));
   for(const f of definition.fields) if(f.relationship){
     assert.equal(f.dataType,`Lookup(${f.relationship.targetObject})`);
     assert.ok(['ModifierGroup__c','ModifierOption__c','Product__c','OrderLine__c'].includes(f.relationship.targetObject));
   }
 }
 assert.deepEqual(Object.keys(basketObjectExtensions),['Order__c','OrderLine__c']);
 assert.equal(new Set(demoModifierOptions.map(o=>o.Name)).size,demoModifierOptions.length);
 for(const item of demoModifierAssignments)assert.ok(demoModifierGroups.some(g=>g.Name===item.group));
});
test('groups enforce limits, inactive options and cross-group membership',()=>{
 const groups=[{Id:'g',Name:'Cooking',MinSelections:1,MaxSelections:1,IsActive:true}];
 const options=[{Id:'a',GroupId:'g',PriceAdjustment:0},{Id:'b',GroupId:'g',PriceAdjustment:1},{Id:'c',GroupId:'other'}];
 assert.deepEqual(validateSelections(groups,options,['a']).map(o=>o.Id),['a']);
 assert.throws(()=>validateSelections(groups,options,[]),/selections/);
 assert.throws(()=>validateSelections(groups,options,['a','b']),/selections/);
 assert.throws(()=>validateSelections(groups,options,['a','c']),/Unassigned/);
 assert.throws(()=>validateSelections(groups,options,['a','a']),/Duplicate/);
 assert.throws(()=>validateSelections(groups,[{...options[0],IsActive:false}],['a']),/Inactive/);
});
test('basket prices use stable minor units; same modifiers use same fingerprint',()=>{
 const line=priceBasketLine({product:{DefaultPrice:6.99},quantity:3,modifiers:[{PriceAdjustment:.75},{PriceAdjustment:2}]});
 assert.deepEqual(line,{quantity:3,baseUnitPrice:6.99,modifierTotal:2.75,unitPrice:9.74,lineTotal:29.22});
 assert.deepEqual(basketTotals([{LineTotal:29.22},{LineTotal:1.99}],.2),{subtotal:31.21,taxAmount:6.24,total:37.45});
 assert.equal(lineFingerprint('p',['b','a']),lineFingerprint('p',['a','b']));
 assert.throws(()=>priceBasketLine({product:{DefaultPrice:1},quantity:0}),/Quantity/);
 assert.throws(()=>basketTotals([],1.3),/Tax rate/);
});
test('approved installer remains inert by default, now including customisation metadata',()=>{
 const run=spawnSync(process.execPath,['scripts/install-kiosk-demo-data.mjs'],{encoding:'utf8',env:{...process.env,METADRIVE_DEMO_SEED_APPROVED:'false'}});
 assert.equal(run.status,0,run.stderr);
 for(const name of customisationObjects.map(o=>o.apiName)) assert.ok(JSON.parse(run.stdout).objects.includes(name));
});
