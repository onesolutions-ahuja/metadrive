import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installedComponentDescriptors, ensureBundledAppComponents } from '../src/bundled-app-components.mjs';

const descriptors=[
  {apiName:'CommonText',label:'Text',jsxFile:'Text/Text.jsx',cssFile:'Text/Text.css',version:2,surfaces:['page'],resize:{}},
  {apiName:'Grid',label:'Grid',jsxFile:'Grid/Grid.jsx',cssFile:'Grid/Grid.css',version:1,surfaces:['page'],resize:{}}
];
const catalog={packages:[
  {appKey:'a',components:[descriptors[0]]},
  {appKey:'b',components:[descriptors[0],descriptors[1]]},
  {appKey:'c',components:[{apiName:'Forbidden',jsxFile:'../private'}]}
]};
const tenant=rows=>({records:{Connector_App__c:rows}});
const installed=(key,status='Licensed')=>({AppKey__c:key,Installed__c:true,LicenceStatus__c:status});

test('metadata iterator skips uninstalled and unlicensed packages',()=>{
  const t=tenant([installed('a'),installed('b','Expired'),installed('c','Expired')]);
  assert.deepEqual([...installedComponentDescriptors(t,catalog)].map(x=>x.apiName),['CommonText']);
});
test('component loader deduplicates overlapping packages and preserves user-owned components',()=>{
  const root=mkdtempSync(join(tmpdir(),'md-components-'));
  try {
    for (const name of ['Text','Grid']) mkdirSync(join(root,name));
    writeFileSync(join(root,'Text/Text.jsx'),'export default function Text(){return <span>hello</span>}');
    writeFileSync(join(root,'Text/Text.css'),'.text {}');
    writeFileSync(join(root,'Grid/Grid.jsx'),'export default function Grid(){return <div/>}');
    writeFileSync(join(root,'Grid/Grid.css'),'.grid {}');
    const t=tenant([installed('a'),installed('b')]);
    const registered=ensureBundledAppComponents([],t,catalog,root);
    assert.deepEqual(registered.map(x=>x.apiName),['CommonText','Grid']);
    assert(registered.every(x=>x.trustedBundled&&x.compiledJs));
    const rerun=ensureBundledAppComponents(registered,t,catalog,root);
    assert.deepEqual(rerun,registered);
    const customized=[{...registered[0],trustedBundled:false,compiledJs:'tenant custom'},registered[1]];
    assert.equal(ensureBundledAppComponents(customized,t,catalog,root)[0].compiledJs,'tenant custom');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('entitled descriptors may not escape the audited bundle directory',()=>{
  const t=tenant([installed('c')]);
  assert.throws(()=>ensureBundledAppComponents([],t,catalog,tmpdir()),/outside the signed source tree|Invalid app bundle path/);
});

test('retired bundle cleanup uses catalog metadata, not platform app-name conditions', () => {
  const originals = [
    {apiName:'RetiredContainer',trustedBundled:true},
    {apiName:'LegacyCart',trustedBundled:true},
    {apiName:'RetiredTenant',trustedBundled:true,tenantId:'tenant-1'},
    {apiName:'LegacyCustom',trustedBundled:false},
    {apiName:'CommonTable',trustedBundled:true}
  ];
  const t = tenant([]);
  const retired = {packages:[],retiredTrustedComponentPrefixes:['Retired','Legacy']};
  assert.deepEqual(ensureBundledAppComponents(originals,t,retired,tmpdir()).map(c=>c.apiName),
    ['RetiredTenant','LegacyCustom','CommonTable']);
  assert.deepEqual(ensureBundledAppComponents(originals,t,{packages:[]},tmpdir()), originals);
  assert.deepEqual(ensureBundledAppComponents(originals,t,
    {packages:[],retiredTrustedComponentPrefixes:['','.*']},tmpdir()), originals);
});

test('entitled current package definitions override a historical retirement prefix', () => {
  const descriptor={apiName:'RetiredCurrent',version:1};
  const catalog={retiredTrustedComponentPrefixes:['Retired'],packages:[
    {appKey:'active',components:[descriptor]}
  ]};
  const current={apiName:'RetiredCurrent',version:1,trustedBundled:true};
  assert.deepEqual(ensureBundledAppComponents([current],tenant([installed('active')]),
    catalog,tmpdir()),[current]);
});
