
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformSync} from 'esbuild';
import {loadAppSeedCatalog} from '../src/seeders/catalog.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';

const root=resolve(fileURLToPath(new URL('../../web/src/custom-components/',import.meta.url)));
const catalog=loadAppSeedCatalog();
const expected={
  Layout:8,Display:9,Inputs:7,Actions:5,Data:11
};
test('all forty One-* Core components are uniquely named and registered',()=>{
  const core=catalog.coreComponents;
  assert.equal(core.length,40);
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,core.filter(x=>x.category===k).length])),expected);
  assert.equal(new Set(core.map(x=>x.apiName)).size,40);
  assert(core.every(x=>/^One[A-Za-z]+$/.test(x.apiName)&&/^One-/.test(x.label)));
  assert(core.every(x=>x.surfaces.join(',')==='page,dashboard,flow'));
  assert(core.every(x=>x.propertyDefinitions.some(d=>d.propertyKey==='kind'&&d.required===true)));
  assert(core.every(x=>x.propertyDefinitions.some(d=>d.propertyKey==='theme')));
  assert(core.every(x=>x.propertyDefinitions.some(d=>d.propertyKey==='accentColor')));
  assert(core.every(x=>x.propertyDefinitions.some(d=>d.propertyKey==='actionFlowApiName')));
});
test('One-* source assets are in the signed bundle and compile without imports',()=>{
  const files=new Set();
  for (const component of catalog.coreComponents) {
    for (const path of [component.jsxFile,component.cssFile]) {
      const absolute=resolve(root,path);
      assert(absolute.startsWith(root+sep),'Asset escaped signed bundle');
      files.add(absolute);
    }
  }
  for (const path of files) {
    const source=readFileSync(path,'utf8');
    assert(source.length>50);
    if(path.endsWith('.jsx')){
      assert(!/\bimport\b/.test(source),'Core component should not embed imports');
      const transformed=transformSync(source,{loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'}).code;
      assert.match(transformed,/exports\.default/);
      assert.doesNotMatch(transformed,/\brequire\s*\(/);
    }
  }
});
test('Core registry bootstraps without app installation and preserves existing components',()=>{
  const tenant={records:{Connector_App__c:[]}};
  const current=[{apiName:'CustomerComponent',status:'Published',tenantId:'tenant-a',version:2,compiledJs:'owner code'}];
  const registered=ensureBundledAppComponents(current,tenant,catalog,root);
  assert.equal(registered.length,41);
  assert.strictEqual(registered[0],current[0]);
  assert(registered.slice(1).every(x=>x.status==='Published'&&x.trustedBundled===true&&x.compiledJs));
  assert.deepEqual(ensureBundledAppComponents(registered,tenant,catalog,root),registered);
  assert(registered.some(c=>c.apiName==='OneCard'));
  assert(registered.some(c=>c.apiName==='OneTable'));
});
test('Registry never overwrites tenant-owned One component identity',()=>{
  const owned={apiName:'OneCard',tenantId:'tenant-a',status:'Published',compiledJs:'custom',version:5,trustedBundled:false};
  const registered=ensureBundledAppComponents([owned],{records:{Connector_App__c:[]}},catalog,root);
  assert.strictEqual(registered.find(x=>x.apiName==='OneCard'),owned);
});
