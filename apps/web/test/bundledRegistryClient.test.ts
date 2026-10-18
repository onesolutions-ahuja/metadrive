import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSqlComponentLibrary } from '../src/core/components/Registry/bundledRegistryClient';

test('unregistered SQL component keys never become trusted built-ins',async()=>{
  const result=await resolveSqlComponentLibrary([{apiName:'OneShoppingCart',rendererKey:'custom'}],'/');
  assert.deepEqual(result,[]);
});

test('SQL-enabled reviewed components hydrate from a lightweight catalog, not executable code',async()=>{
  const previous=globalThis.fetch;
  const requested:string[]=[];
  globalThis.fetch=async(input:RequestInfo|URL)=>{
    requested.push(String(input));
    return new Response(JSON.stringify({components:[
      {apiName:'OneShoppingCart',label:'One-Shopping-Cart',version:9,surfaces:['page','dashboard','flow']},
      {apiName:'OneItemGrid',label:'One-Item-Grid',version:9,surfaces:['page','dashboard','flow']}
    ]}),{status:200});
  };
  try{
    const components=await resolveSqlComponentLibrary([
      {apiName:'OneShoppingCart',rendererKey:'one-bundled:OneShoppingCart'},
      {apiName:'OneItemGrid',rendererKey:'one-bundled:OneItemGrid'},
      {apiName:'CustomX',rendererKey:'Other'}],'/');
    assert.deepEqual(components.map(c=>c.apiName),['OneShoppingCart','OneItemGrid']);
    assert.ok(components.every(c=>c.trustedBundled===true&&c.compiledJs===''));
    assert.deepEqual(requested,['/component-library/catalog-index.json']);
  }finally {globalThis.fetch=previous;}
});
