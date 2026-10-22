import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {acetillStyleCss,validAcetillStyleValue} from '../src/visual-styles.js';

test('original Acetill CSS is untouched when SQL has no overrides',()=>{
 assert.equal(acetillStyleCss({}),'');
 const terminal=readFileSync(new URL('../src/AcetillTerminal.tsx',import.meta.url),'utf8');
 assert.match(terminal,/data-acetill-element="cash"/);
 assert.match(terminal,/data-acetill-element="order"/);
 assert.match(terminal,/data-acetill-element="products"/);
 assert.match(terminal,/editorStyles\?\?savedStyles/);
});
test('only safe CSS properties can be interpolated in live terminal',()=>{
 assert.equal(validAcetillStyleValue('backgroundColor','#ffcc00'),true);
 assert.equal(validAcetillStyleValue('borderRadius','12px'),true);
 assert.equal(validAcetillStyleValue('backgroundColor','url(javascript:alert(1))'),false);
 assert.equal(validAcetillStyleValue('unknown','red'),false);
 const css=acetillStyleCss({cash:{backgroundColor:'#ffcc00',translateY:'-42'}});
 assert.match(css,/background-color: #ffcc00 !important/);
 assert.match(css,/transform: translate\(0px,-42px\) !important/);
 assert.equal(acetillStyleCss({cash:{backgroundColor:'url(x)'}}),'');
});
test('Acetill editable pages use the shared metadata Page Builder',()=>{
 const builder=readFileSync(new URL('../../web/src/core/builders/PageBuilder/pageBuilderView.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(builder,/AcetillVisualEditor/);
 assert.doesNotMatch(builder,/page\.apiName==='AcetillRegisterEditable'/);
 assert.match(builder,/builder-editor-mode/);
});
