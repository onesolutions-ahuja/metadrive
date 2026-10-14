import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformSync} from 'esbuild';
import {compileComponentModule} from '../src/componentRuntimeModule';
import RegisteredComponent from '../src/RegisteredComponent';
import {sandboxPublicProps} from '../src/componentSandboxPolicy';

test('one compiled module loader is usable by trusted and isolated rendering contexts',()=>{
  const jsx='export default function Sample(props) { return <section data-prop={props.customTitle}>{props.label}</section>; }';
  const compiledJs=transformSync(jsx,{loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'}).code;
  const Component=compileComponentModule(compiledJs,React);
  assert.match(renderToStaticMarkup(React.createElement(Component,{customTitle:'Metadata configured',label:'Hello'})),/Metadata configured/);
  const metadata={apiName:'Sample',label:'Sample',description:'',version:1,status:'Published' as const,
    trustedBundled:true,updatedAt:'2026-10-14T00:00:00Z',surfaces:['page' as const],
    jsxSource:jsx,cssSource:'',scopedCss:'',compiledJs};
  const rendered=renderToStaticMarkup(React.createElement(RegisteredComponent,{
    definition:metadata,props:{customTitle:'Metadata configured',label:'Hello'}
  }));
  assert.match(rendered,/Metadata configured/);
  assert.match(rendered,/>Hello</);
});
test('compiled loader rejects missing, malformed and non-component exports',()=>{
  assert.throws(()=>compileComponentModule('',React),/Missing registered component source/);
  assert.throws(()=>compileComponentModule('module.exports.default = 42;',React),/not a React component/);
  assert.throws(()=>compileComponentModule('module.exports.default = () => {',React),SyntaxError);
});
test('sandbox passes only declared custom metadata property names while redacting secrets',()=>{
  const output=sandboxPublicProps({
    label:'Safe',customTitle:'Configurable',accentColor:'#112233',
    properties:{customTitle:'Configured',accentColor:'#112233',password:'hidden',onAction:'unsafe'},
    password:'secret',onAction:()=>{},onNavigate:'unsafe',hostOnly:'not in metadata',
    records:[{Name:'Product',bearerToken:'never forward'}]
  });
  assert.equal(output.customTitle,'Configurable');
  assert.equal(output.accentColor,'#112233');
  assert.equal(output.password,undefined);
  assert.equal(output.onAction,undefined);
  assert.equal(output.onNavigate,undefined);
  assert.equal(output.hostOnly,undefined);
  assert.equal((output.records as any[])[0].bearerToken,undefined);
});
test('sandbox refuses undeclared and malformed property keys',()=>{
  const output=sandboxPublicProps({
    properties:{'bad-name':'x','__proto__':'x','clientSecret':'z',userTitle:'y',children:'x'},
    'bad-name':'x',clientSecret:'z',userTitle:'y',children:'x'
  });
  assert.equal(output['bad-name'],undefined);
  assert.equal(output.clientSecret,undefined);
  assert.equal(output.userTitle,'y');
  assert.equal(output.children,undefined);
});
