import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const inbox=readFileSync(new URL('../apps/web/src/custom-components/ChatterInbox/ChatterInbox.jsx',import.meta.url),'utf8');
test('Chatter account picker uses only server-authorized channel IDs',()=>{
  assert.match(inbox,/assignedAccounts = accounts\.filter\(a => Array\.isArray\(p\.allowedAccountIds\)/);
  assert.match(inbox,/p\.allowedAccountIds\.includes\(a\.id\)/);
  assert.match(inbox,/selectedAccount && String\(c\.channelAccountId\) !== selectedAccount/);
  assert.match(inbox,/aria-label="WhatsApp account"/);
  assert.match(inbox,/select\(null\);setAssigneeId\(''\)/);
  assert.doesNotMatch(inbox,/fetch\(|localStorage|sessionStorage/);
});
