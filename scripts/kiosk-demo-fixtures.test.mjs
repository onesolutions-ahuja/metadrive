import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {kioskObjectDefinitions,demoCategories,demoProducts} from './kiosk-demo-fixtures.mjs';

test('demo installer is inert unless operator explicitly approves',()=>{
  const run=spawnSync(process.execPath,['scripts/install-kiosk-demo-data.mjs'],{
    env:{...process.env,METADRIVE_DEMO_SEED_APPROVED:'false'},encoding:'utf8'
  });
  assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout).objects,kioskObjectDefinitions.map(value=>value.apiName));
});
test('all commerce objects use existing central Object Manager identity rules',()=>{
  const names=kioskObjectDefinitions.map(value=>value.apiName);
  assert.equal(new Set(names).size,5);
  assert.deepEqual(names,['ProductCategory__c','Product__c','Order__c','OrderLine__c','SaleLine__c']);
  const targets=new Set([...names,'Sale__c']);
  for(const object of kioskObjectDefinitions){
    assert.equal(object.kind,'Custom Object');
    assert.match(object.apiName,/^[A-Za-z][A-Za-z0-9_]*__c$/);
    const keys=object.fields.map(field=>field.apiName);
    assert.equal(new Set(keys).size,keys.length);
    for(const field of object.fields){
      if(!field.relationship)continue;
      assert.ok(targets.has(field.relationship.targetObject));
      assert.equal(field.dataType,`Lookup(${field.relationship.targetObject})`);
    }
  }
});
test('sample products and category images are predictable and separate from sales records',()=>{
  const categories=new Set(demoCategories.map(x=>x.Name));
  assert.equal(categories.size,demoCategories.length);
  const skus=new Set(demoProducts.map(x=>x.SKU));
  assert.equal(skus.size,demoProducts.length);
  for(const item of [...demoCategories,...demoProducts]){
    assert.match(item.Name,/^Demo /);
    assert.match(item.ImageUrl,/^https:\/\/images\.unsplash\.com\/photo-/);
  }
  for(const product of demoProducts){
    assert.ok(categories.has(product.category));
    assert.ok(product.DefaultPrice>0);
  }
});
