import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import RegisteredComponent from '../apps/web/src/RegisteredComponent';

const definition = {
  apiName:'Phase3Test',label:'Phase 3 test',description:'',surfaces:['page'],
  jsxSource:'',cssSource:'',scopedCss:'',compiledJs:'module.exports.default = () => React.createElement("button", null, "Save");',
  updatedAt:'2026-10-14T00:00:00Z',version:1,trustedBundled:true as const,
};
test('published primitive gets accessible name through the existing host',()=>{
  const html=renderToStaticMarkup(React.createElement(RegisteredComponent,{
    definition:{...definition,primitiveMetadata:{kind:'button' as const,label:'Save changes'}},props:{}
  }));
  assert.match(html,/aria-label="Save changes"/);
  assert.match(html,/Save/);
});
test('invalid primitive fails closed before rendering trusted code',()=>{
  const html=renderToStaticMarkup(React.createElement(RegisteredComponent,{
    definition:{...definition,primitiveMetadata:{kind:'button' as const}},props:{}
  }));
  assert.match(html,/Invalid primitive metadata/);
  assert.doesNotMatch(html,/<button/);
});
test('legacy definitions are rendered without requiring new metadata',()=>{
  const html=renderToStaticMarkup(React.createElement(RegisteredComponent,{
    definition,props:{}
  }));
  assert.match(html,/<button/);
});
