import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const source=readFileSync(new URL('../apps/web/src/custom-components/ChatterInbox/ChatterInbox.jsx',import.meta.url),'utf8');
test('Chatter actions require explicit server-projected channel rights',()=>{
  assert.match(source,/selected\?\.canSend === true && p\.canSend === true/);
  assert.match(source,/selected\?\.canAssign === true && p\.enableAssignment === true/);
  assert.match(source,/if \(!draft\.trim\(\) \|\| busy \|\| !canSendSelected\) return/);
  assert.match(source,/aria-label="Message" value=\{draft\} onChange=/);
  assert.match(source,/disabled=\{busy\} maxLength=\{4096\} placeholder=/);
  assert.match(source,/disabled=\{!draft\.trim\(\) \|\| busy \|\| !canSendSelected\}/);
  assert.match(source,/You can type a message, but you do not have permission to send/);
});
