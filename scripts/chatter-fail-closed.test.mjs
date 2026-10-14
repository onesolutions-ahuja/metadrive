import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('../apps/web/src/custom-components/ChatterInbox/ChatterInbox.jsx',import.meta.url),'utf8');
test('Chatter controls are disabled until server-derived permissions are explicitly granted',()=>{
  assert.match(source,/p\.canSend !== true\) return/);
  assert.match(source,/p\.enableAssignment === true && p\.canAssign === true/);
  assert.match(source,/disabled=\{busy \|\| p\.canSend !== true\}/);
  assert.match(source,/disabled=\{!draft\.trim\(\) \|\| busy \|\| p\.canSend !== true\}/);
});
