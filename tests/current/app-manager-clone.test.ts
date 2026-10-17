import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneAppConfiguration } from '../../apps/web/src/appCloneConfiguration.ts';
import type { LightningAppMetadata } from '../../apps/web/src/metadata.ts';

const app: LightningAppMetadata = {
  apiName:'Shop', label:'Shop', description:'Retail app', brandColor:'#123abc',
  navigationItems:['Account'], navigationPageApiNames:['Checkout'],
  navigationOrder:[{type:'Object',apiName:'Account'},{type:'App Page',apiName:'Checkout'}],
  utilityItems:['Notes'], installationAppKey:'package-owned'
};

test('cloning produces independent app metadata, unique name and no installation ownership',()=>{
  const cloned=cloneAppConfiguration(app,[app]);
  assert.equal(cloned.apiName,'ShopCopy');
  assert.equal(cloned.label,'Shop Copy');
  assert.equal(cloned.installationAppKey,undefined);
  assert.equal(cloned.brandColor,app.brandColor);
  assert.deepEqual(cloned.navigationItems,app.navigationItems);
  assert.deepEqual(cloned.navigationPageApiNames,app.navigationPageApiNames);
  assert.deepEqual(cloned.navigationOrder,app.navigationOrder);
  assert.deepEqual(cloned.utilityItems,app.utilityItems);
  cloned.navigationItems.push('Contact');
  cloned.navigationOrder.pop();
  cloned.utilityItems.push('History');
  assert.deepEqual(app.navigationItems,['Account']);
  assert.equal(app.navigationOrder.length,2);
  assert.deepEqual(app.utilityItems,['Notes']);
  assert.equal(app.installationAppKey,'package-owned');
});

test('repeat clones choose unique developer names case insensitively',()=>{
  const names=[app,{apiName:'shopcopy'},{apiName:'ShopCopy2'}];
  assert.equal(cloneAppConfiguration(app,names).apiName,'ShopCopy3');
});
