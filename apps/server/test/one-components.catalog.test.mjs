
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformSync} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadAppSeedCatalog} from '../src/seeders/catalog.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';

const root=resolve(fileURLToPath(new URL('../../web/src/custom-components/',import.meta.url)));
const catalog=loadAppSeedCatalog();
const expected={
  Layout:8,Display:9,Inputs:7,Actions:5,Data:12
};
test('all forty-one One-* Core components are uniquely named and registered',()=>{
  const core=catalog.coreComponents;
  assert.equal(core.length,41);
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,core.filter(x=>x.category===k).length])),expected);
  assert.equal(new Set(core.map(x=>x.apiName)).size,41);
  assert(core.every(x=>/^One[A-Za-z]+$/.test(x.apiName)&&/^One-/.test(x.label)));
  for(const component of core)
    assert.equal(new Set(component.propertyDefinitions.map(property=>property.propertyKey)).size,component.propertyDefinitions.length,
      `${component.apiName} property definitions must be unique`);
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
      assert.match(transformed,/\bexports\.default\b|\bdefault\s*:/);
      assert.doesNotMatch(transformed,/\brequire\s*\(/);
    }
  }
});
test('Core registry bootstraps without app installation and preserves existing components',()=>{
  const tenant={records:{Connector_App__c:[]}};
  const current=[{apiName:'CustomerComponent',status:'Published',tenantId:'tenant-a',version:2,compiledJs:'owner code'}];
  const registered=ensureBundledAppComponents(current,tenant,catalog,root);
  assert.equal(registered.length,42);
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

test('all 41 components render safely using their metadata defaults',()=>{
  const compiledCache=new Map();
  for(const definition of catalog.coreComponents){
    const jsPath=resolve(root,definition.jsxFile);
    let component=compiledCache.get(jsPath);
    if(!component){
      const code=transformSync(readFileSync(jsPath,'utf8'),{
        loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'
      }).code;
      const mod={exports:{}};
      new Function('React','module','exports',code)(React,mod,mod.exports);
      component=mod.exports.default;
      assert.equal(typeof component,'function',jsPath);
      compiledCache.set(jsPath,component);
    }
    const props=Object.fromEntries(definition.propertyDefinitions
      .filter(prop=>prop.defaultValue!==undefined)
      .map(prop=>[prop.propertyKey,prop.defaultValue]));
    const output=renderToStaticMarkup(React.createElement(component,props));
    assert.match(output,/one-ui/,definition.apiName);
  }
});

test('OneCard and OneInput render migrated legacy descriptions and validation metadata',()=>{
  const card=catalog.coreComponents.find(component=>component.apiName==='OneCard');
  const input=catalog.coreComponents.find(component=>component.apiName==='OneInput');
  assert.equal(card.version,2);
  assert.equal(input.version,2);
  assert.ok(card.propertyDefinitions.some(property=>property.propertyKey==='description'));
  for(const [definition,props,expected] of [
    [card,{kind:'Card',title:'Panel title',description:'Panel details'},['Panel title','Panel details']],
    [input,{kind:'Input',label:'Notes',description:'Field details',helpText:'Use plain text',multiline:true,rows:4,value:'Existing value',required:true,minLength:2,maxLength:80,autoComplete:'off'},['Notes','Field details','Use plain text','textarea','rows=\"4\"','required','minlength=\"2\"','maxlength=\"80\"']]
  ]){
    const source=readFileSync(resolve(root,definition.jsxFile),'utf8');
    const code=transformSync(source,{loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'}).code;
    const mod={exports:{}};
    new Function('React','module','exports',code)(React,mod,mod.exports);
    const output=renderToStaticMarkup(React.createElement(mod.exports.default,props));
    for(const fragment of expected)assert.ok(output.toLowerCase().includes(fragment.toLowerCase()),fragment);
  }
});

test('OneConversation renders the migrated Chatter inbox data and action affordances',()=>{
  const definition=catalog.coreComponents.find(component=>component.apiName==='OneConversation');
  assert.equal(definition.version,4);
  for(const property of ['viewMode','enableNewConversation','conversationsObjectApiName','messagesObjectApiName',
    'channelAccountObjectApiName','contactsObjectApiName','restrictToAssigned','enableAssignment','recordViewAdapter'])
    assert.ok(definition.propertyDefinitions.some(item=>item.propertyKey===property),property);
  const source=readFileSync(resolve(root,definition.jsxFile),'utf8');
  const code=transformSync(source,{loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'}).code;
  const mod={exports:{}};
  new Function('React','module','exports',code)(React,mod,mod.exports);
  const markup=renderToStaticMarkup(React.createElement(mod.exports.default,{
    viewMode:'inbox',title:'Chatter',searchPlaceholder:'Search name or number',enableNewConversation:true,
    conversations:[{id:'conversation-1',contactName:'Avery Example',phoneNumber:'+447700900001',
      channelAccountId:'account-1',preview:'Hello',unreadCount:2}],
    channelAccounts:[{id:'account-1',name:'Support'}],allowedAccountIds:['account-1'],
    messages:[],contactChoices:[]
  }));
  for(const fragment of ['Chatter','Search name or number','New conversation','Avery Example','Hello','2'])
    assert.ok(markup.includes(fragment),fragment);
});

test('OneShoppingCart renders generic catalogue and paired-display modes',()=>{
  const definition=catalog.coreComponents.find(component=>component.apiName==='OneShoppingCart');
  assert.equal(definition.version,1);
  for(const property of ['viewMode','nameFieldApiName','priceFieldApiName','barcodeFieldApiName','skuFieldApiName',
    'imageFieldApiName','ageRestrictedFieldApiName','vatApplicableFieldApiName','stateSyncEnabled',
    'stateReadFlowApiName','stateWriteFlowApiName','operationEvents','standalonePresentation'])
    assert.ok(definition.propertyDefinitions.some(item=>item.propertyKey===property),property);
  const source=readFileSync(resolve(root,definition.jsxFile),'utf8');
  const code=transformSync(source,{loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'}).code;
  const mod={exports:{}};
  new Function('React','module','exports',code)(React,mod,mod.exports);
  const till=renderToStaticMarkup(React.createElement(mod.exports.default,{
    viewMode:'till',nameFieldApiName:'Name',priceFieldApiName:'DefaultPrice',
    records:[{Id:'product-1',Name:'Sparkling water',DefaultPrice:1.25}]
  }));
  const display=renderToStaticMarkup(React.createElement(mod.exports.default,{
    standalonePresentation:true,title:'Your order',storeName:'Market',currencyCode:'GBP'
  }));
  for(const fragment of ['Sparkling water','Current sale','Payment'])assert.ok(till.includes(fragment),fragment);
  for(const fragment of ['Your order','Market','Your basket will appear here'])assert.ok(display.includes(fragment),fragment);
});
