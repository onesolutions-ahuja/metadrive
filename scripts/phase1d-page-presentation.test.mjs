import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Static contract prevents reintroducing application-name decisions in the
// generic page presentation module before browser integration is completed.
const source=readFileSync(new URL('../apps/web/src/pageRuntimePresentation.ts',import.meta.url),'utf8');
test('page presentation is metadata-directed, not tied to a named business app',()=>{
  assert.match(source,/standalonePresentation/);
  assert.doesNotMatch(source,/KioskOrderingExperience|TillSalesWorkspace|POSApp|KioskApp/);
});
