import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const inbox = read('apps/web/src/custom-components/ChatterInbox/ChatterInbox.jsx');
const builder = read('apps/web/src/pageBuilderView.tsx');
const preset = JSON.parse(read('apps/web/src/page-presets/chatter.editable.json'));

test('existing Chatter composer accepts direct input changes in external popup preview', () => {
  assert.match(inbox, /aria-label="Message" value=\{draft\}[\s\S]*?onInput=\{e=>setDraft\(e\.currentTarget\.value\)\}/);
  assert.match(inbox, /onChange=\{e=>setDraft\(e\.currentTarget\.value\)\}/);
  assert.match(inbox, /disabled=\{busy\} maxLength=\{4096\}/);
  assert.match(builder, /disabled: !interactivePreview/);
  assert.match(builder, /externalPreviewTarget && createPortal\(/);
  assert.match(builder, /renderPageComponent\(component, page\.components\.findIndex\(\(item\) => item\.id === component\.id\), true, true\)/);
});

test('send remains independently controlled by server-authorized channel grants', () => {
  assert.match(inbox, /selected\?\.canSend === true && p\.canSend === true/);
  assert.match(inbox, /disabled=\{!draft\.trim\(\) \|\| busy \|\| !canSendSelected\}/);
  const chatter = preset.components.find(c => c.type === 'Custom:ChatterInbox');
  assert.ok(chatter);
  assert.equal(Object.hasOwn(chatter.properties, 'canSend'), false);
});
