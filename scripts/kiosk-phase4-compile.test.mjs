// Compile every Phase 4 registered JSX/CSS asset with the same libraries
// used by the secured component registry. No access tokens or live writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import {commerceComponents} from './kiosk-phase4-components.mjs';

for(const item of commerceComponents){
 test('registry accepts component source: '+item.apiName,async()=>{
  const compiled=await transform(item.jsxSource,{
   loader:'tsx',format:'cjs',target:'es2020',
   jsxFactory:'React.createElement',jsxFragment:'React.Fragment',
   sourcefile:item.apiName+'.tsx'
  });
  assert.match(compiled.code,/\bexports\.default\b|\bdefault\s*:/,'Default component export missing');
  assert.doesNotMatch(compiled.code,/\brequire\s*\(/,'Custom components cannot import external modules');
  const css=postcss.parse(item.cssSource,{from:item.apiName+'.css'});
  css.walkRules(rule=>{
   let parent=rule.parent;
   while(parent&&parent.type!=='root'){
    if(parent.type==='atrule'&&/keyframes$/i.test(parent.name))return;
    parent=parent.parent;
   }
   const result=selectorParser(selectors=>{
    selectors.each(selector=>{
     const isRoot=selector.nodes[0]?.type==='pseudo'&&selector.nodes[0].value===':root';
     if(isRoot)selector.nodes.splice(0,1,selectorParser.className({value:'metadrive-component-'+item.apiName.toLowerCase()}));
     else{
      selector.prepend(selectorParser.combinator({value:' '}));
      selector.prepend(selectorParser.className({value:'metadrive-component-'+item.apiName.toLowerCase()}));
     }
    });
   }).processSync(rule.selector);
   assert.ok(result);
  });
 });
}
