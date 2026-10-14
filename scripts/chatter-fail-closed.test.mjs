import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const source=readFileSync(new URL('../apps/web/src/custom-components/ChatterInbox/ChatterInbox.jsx',import.meta.url),'utf8');
test('Chatter actions require explicit server-projected channel rights',()=>{
  assert.match(source,/selected\?\.canSend === true && p\.canSend === true/);
  assert.match(source,/selected\?\.canAssign === true && p\.enableAssignment === true/);
  assert.match(source,/if \(!selected \|\| !draft\.trim\(\) \|\| busy \|\| !canSendSelected\) return/);
  assert.match(source,/disabled=\{busy \|\| !canSendSelected\}/);
  assert.match(source,/disabled=\{!draft\.trim\(\) \|\| busy \|\| !canSendSelected\}/);
});
