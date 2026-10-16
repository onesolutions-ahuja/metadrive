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

test('App runtime and builder do not branch on retired component names',()=>{
 const app=readFileSync(new URL('../apps/web/src/setupShellPresentation.tsx',import.meta.url),'utf8')+readFileSync(new URL('../apps/web/src/pageRuntimeViews.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(app,/Custom:KioskOrderingExperience|Custom:TillSalesWorkspace|Custom:KioskContainer/);
 assert.match(app,/isStandalonePagePresentation\(page\)/);
 assert.match(app,/pageCanvasPresentationStyle\(page\)/);
});
