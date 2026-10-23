import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolveStandaloneEntry,standaloneEntryForAppId,standaloneCanonicalPath} from '../../src/core/workspace/Standalone/standaloneEntries.ts';
import {appRoutePathWithoutBase} from '../../src/core/workspace/Navigation/appRouting.ts';

test('direct Acetill and Ace Assist routes have separate product identities',()=>{
  assert.deepEqual(
    [resolveStandaloneEntry('/acetill')?.appId,resolveStandaloneEntry('/aceassist/')?.appId],
    ['Acetill','AceAssist']);
  assert.equal(resolveStandaloneEntry('/metadrive/acetill','/metadrive/')?.appId,'Acetill');
  for(const pathname of ['/','/une/setup/home','/api/auth/login','/acetill/checkout','/notinstalled','/login']) {
    assert.equal(resolveStandaloneEntry(pathname),null,pathname);
  }
});

test('product login keeps shared MetaDrive session, MFA and password recovery',()=>{
  const login=readFileSync(new URL('../../src/core/authentication/Login/loginView.tsx',import.meta.url),'utf8');
  assert.match(login,/branding\?: ProductLoginBrand/);
  assert.match(login,/branding\.label/);
  assert.match(login,/auth\/login\?landing=1/);
  assert.match(login,/auth\/mfa\/verify/);
  assert.match(login,/LoginRecovery/);
  const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
  assert.match(app,/standaloneCanonicalPath\(window\.location\.pathname/);
  assert.match(app,/resolveStandaloneEntry\(entryPath/);
  assert.match(app,/LazyStandaloneRuntime entry=\{standaloneEntry\}/);
  assert.match(app,/return <SetupApp entryTiming=/);
});

test('Ace Assist owns its own UI and uses authorised OneEngine CRUD Flows',()=>{
  const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../../src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url),'utf8');
  assert.match(runtime,/\/metadata\/objects/);
  assert.doesNotMatch(runtime,/\/records\//);
  assert.match(runtime,/\/flows\//);
  assert.match(runtime,/available-actions\?product=/);
  assert.match(runtime,/checkBusinessHours/);
  assert.doesNotMatch(runtime,/AcetillCompleteSale|AcetillPrintReceipt|AceAssistCompleteVisit|AceAssistRescheduleVisit/);
  assert.doesNotMatch(runtime,/method:'POST'.*\/records\//);
  assert.match(runtime,/\/auth\/logout/);
  assert.doesNotMatch(runtime,/\/metadata\/apps|LazyPublishedRuntime|PageBuilder|component-library/);
  assert.match(shell,/LazyAceAssist/);
});

test('standalone web router lazy-loads app-owned UIs, not business-specific JSX',()=>{
  const shell=readFileSync(new URL('../../src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url),'utf8');
  const assist=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
  const chatter=readFileSync(new URL('../../../acechatter/src/AceChatterRuntime.tsx',import.meta.url),'utf8');
  const chatterCss=readFileSync(new URL('../../../acechatter/src/aceChatter.css',import.meta.url),'utf8');
  const flowValueEditors=readFileSync(new URL('../../src/core/builders/FlowBuilder/FlowValueEditors.tsx',import.meta.url),'utf8');
  const till=readFileSync(new URL('../../../acetill/src/AcetillTerminal.tsx',import.meta.url),'utf8');
  assert.match(shell,/LazyAceAssist/);
  assert.match(shell,/LazyAceChatter/);
  assert.match(shell,/LazyAcetill/);
  const tillShell=readFileSync(new URL('../../../acetill/src/AcetillShell.tsx',import.meta.url),'utf8');
  assert.match(tillShell,/AcetillTerminal/);
  assert.match(tillShell,/ACETILL_STANDALONE_ENTRY/);
  assert.match(tillShell,/\/auth\/logout/);
  assert.match(tillShell,/standalone-product-header/);
  assert.doesNotMatch(shell,/AcetillTerminal|standalone-product-header|standalone-product-brand|\/auth\/logout/);
  assert.doesNotMatch(shell,/custom-pos|custom-assist|custom-week|custom-basket|\/metadata\/objects/);
  assert.match(assist,/custom-assist/);
  assert.match(assist,/custom-week/);
  assert.match(assist,/mutationFlow/);
  assert.match(chatter,/ace-chat-thread/);
  assert.match(chatter,/AceChatterLoadContacts/);
  assert.match(chatter,/sourceObjectApi/);
  assert.match(chatter,/newChatMode==='contacts'/);
  assert.match(chatter,/newChatMode==='number'/);
  assert.match(chatter,/has-selected-chat/);
  assert.doesNotMatch(chatter,/\/records\//);
  assert.match(chatterCss,/@media\(max-width:760px\)/);
  assert.match(chatterCss,/\.ace-chat\.has-selected-chat \.ace-chat-sidebar\{display:none\}/);
  assert.match(flowValueEditors,/value="OwnerId">Owner/);
  assert.match(flowValueEditors,/condition\.field==='OwnerId'\?ownerField/);
  assert.match(till,/AcetillGetProducts/);
  for(const source of [shell,assist,chatter,till])
    assert.doesNotMatch(source,/Home page is not configured|LazyPublishedRuntime|LightningAppRuntime/);
});

test('old app links and metadata navigation enter the app-only frontend',()=>{
  assert.equal(standaloneEntryForAppId('Aceassist')?.slug,'aceassist');
  assert.equal(standaloneEntryForAppId('ACEASSIST')?.slug,'aceassist');
  assert.equal(standaloneCanonicalPath('/une/apps/Aceassist/home'),'/aceassist');
  assert.equal(standaloneCanonicalPath('/une/apps/AceAssist/home'),'/aceassist');
  assert.equal(standaloneCanonicalPath('/une/apps/Acetill/home'),'/acetill');
  assert.equal(standaloneCanonicalPath('/une/apps/Aceassist/pages/Visits'),'/aceassist?page=Visits');
  assert.equal(standaloneCanonicalPath('/metadrive/une/apps/ACEASSIST/home','', '/metadrive/'),'/metadrive/aceassist');
  for (const path of ['/une/apps/Other/home','/une/setup/home','/une/apps/Aceassist/records/Contact','/une/apps/Aceassist/pages/../setup']) {
    assert.equal(standaloneCanonicalPath(path),null,path);
  }
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'Aceassist'}),'/aceassist');
  assert.equal(appRoutePathWithoutBase({kind:'app-page',appId:'AceAssist',pageApiName:'VisitList'}),'/aceassist?page=VisitList');
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'Acetill'}),'/acetill');
});

test('user landing preference opens the assigned app without granting access',()=>{
  const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../../../server/src/system-files/session-metadata.ts',import.meta.url),'utf8');
  const auth=readFileSync(new URL('../../../server/src/system-support/server.ts',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../../../server/src/system-support/migrations/20261021-user-landing-app.sql',import.meta.url),'utf8');
  assert.match(app,/landingAppApi\?: string/);
  assert.match(app,/entryTiming\?\.landingAppApi\?\?/);
  assert.match(app,/standaloneEntryForAppId\(landingApp\)/);
  assert.match(app,/window\.location\.replace\(destination\)/);
  assert.match(app,/if\(needsLandingRedirect\)return/);
  assert.doesNotMatch(app,/apiRequest<\{user:\{landingAppApi/);
  assert.equal(appRoutePathWithoutBase({kind:'app-home',appId:'Acetill'}),'/acetill');
  assert.match(server,/landingAppApi:landing\.rows\[0\]\?\.landing_app_api\?\?'Setup'/);
  assert.match(schema,/landing_app_api text NOT NULL DEFAULT 'Setup'/);
  assert.match(auth,/landingAppApi:await landingPreference\(tenantId,userId\)/);
  assert.match(auth,/landingAppApi:await landingPreference\(session\.tenant_id,session\.user_id\)/);
  assert.match(app,/standaloneEntryForAppId\(landingApp\)/);
});

test('AceKiosk uses independent lazy custom UI and backend Flows',()=>{
 const app=readFileSync(new URL('../../src/core/workspace/App/App.tsx',import.meta.url),'utf8');
 const kiosk=readFileSync(new URL('../../../acekiosk/src/AceKiosk.tsx',import.meta.url),'utf8');
 assert.equal(resolveStandaloneEntry('/acekiosk')?.appId,'AceKiosk');
 assert.equal(standaloneCanonicalPath('/une/apps/AceKiosk/home'),'/acekiosk');
 assert.match(app,/AceKioskAccessGate/);
 assert.match(kiosk,/AceKioskLoadMenu/);
 assert.match(kiosk,/AceKioskPaymentCash/);
 assert.match(kiosk,/AceKioskPaymentCard/);
 assert.doesNotMatch(kiosk,/\/records\/|OneShoppingCart|OneItemGrid|PageBuilder/);
});

test('AceKiosk all-screen client demo uses record images and optional OneEngine Flows',()=>{
 const ui=readFileSync(new URL('../../../acekiosk/src/AceKiosk.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../../acekiosk/src/acekiosk.css',import.meta.url),'utf8');
 for(const action of ['AceKioskStartSession','AceKioskFilterMenu','AceKioskProductOptions','AceKioskAddToCart','AceKioskUpdateCart','AceKioskRestart','AceKioskPaymentCash','AceKioskPaymentCard'])
   assert.match(ui,new RegExp(action));
 for(const screen of ["screen==='welcome'","screen==='menu'","screen==='cart'","screen==='checkout'","screen==='confirmation'"]) assert.ok(ui.includes(screen),screen);
 assert.match(ui,/categoryName\(p\.category\)/);
 assert.match(css,/\.ak-product-body>div strong\{font-size:22px/);
 assert.match(css,/\.ak-image img\{[^}]*border-radius/);
 assert.match(ui,/ImageUrl/);
 assert.doesNotMatch(ui,/\/records\/|INSERT INTO|OneShoppingCart/);
});

test('Ace Assist re-reads its tenant calendar and renders a phone-safe schedule',()=>{
  const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../../aceassist/src/aceassist.css',import.meta.url),'utf8');
  for(const token of ["tenantId?:string","No saved business hours found for the signed-in tenant",
    "Object.hasOwn(r,'calendar')","document.addEventListener('visibilitychange'",
    "window.matchMedia('(max-width: 650px)')","custom-detail-empty"])
    assert.ok(runtime.includes(token),token);
  for(const token of ['.custom-aceassist .assist-view-day .custom-day{min-width:0',
    '.custom-aceassist .custom-tabs{flex-wrap:nowrap',
    '.custom-aceassist .custom-calendar,.custom-aceassist .custom-visit-detail{padding:15px'])
    assert.ok(css.includes(token),token);
});


test('Ace Assist mobile home is backed by authorised Flow records, not demo values',()=>{
  const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
  const home=readFileSync(new URL('../../../aceassist/src/AceAssistDashboard.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../../aceassist/src/aceassist.css',import.meta.url),'utf8');
  assert.match(runtime,/AceAssistDashboard/);
  assert.match(runtime,/fetchRows\('Load','Invoice'\)/);
  assert.match(runtime,/fetchRows\('Load',current\.object\)/);
  assert.match(runtime,/available-actions\?product=/);
  assert.match(home,/appointments\.filter\(/);
  assert.match(home,/invoices\.filter\(/);
  assert.match(home,/AceAssistLoadAppointment/);
  assert.match(home,/AceAssistLoadInvoice/);
  assert.doesNotMatch(home,/dummyAppointments|mockInvoices|samplePatients/);
  assert.match(css,/\.assist-mobile-nav\{position:fixed/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('Ace Assist mobile navigation preserves main atomic financial document editor',()=>{
 const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 const editor=readFileSync(new URL('../../../aceassist/src/FinancialDocumentEditor.tsx',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../../../server/src/app-seeders/aceassist-document-flows.ts',import.meta.url),'utf8');
 const navigation=runtime.slice(runtime.indexOf('const tabs:'),runtime.indexOf('const inputFields:'));
 assert.doesNotMatch(navigation,/label:'Quotation lines'|label:'Invoice lines'/);
 assert.match(runtime,/FinancialDocumentEditor/);
 assert.match(runtime,/documentFlow\(editing,editingObject\)/);
 assert.match(runtime,/onSave={saveDocument}/);
 assert.match(runtime,/AceAssistCreateDocumentV1|documentFlow\('Create'/);
 assert.match(runtime,/startEdit\('Create',undefined,object\)/);
 assert.match(editor,/newLines:lines.filter/);
 assert.match(editor,/removedLines:storedLines.filter/);
 assert.match(backend,/expectedParentId/);
 assert.doesNotMatch(runtime,/\/records\//);
});
