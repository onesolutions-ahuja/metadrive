import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACETILL} from '../src/manifest.js';

const sql=readFileSync(fileURLToPath(new URL('../sql/register-v2.sql',import.meta.url)),'utf8');

test('SQL template declares all Acetill pages and shared One components',()=>{
 for(const {apiName} of ACETILL.pages)assert.match(sql,new RegExp("'"+apiName+"'"));
 for(const component of ['OneText','OneBadge','OneSearch','OneItemGrid','OneShoppingCart','OneButton'])
   assert.match(sql,new RegExp("'"+component+"'"));
 assert.match(sql,/md_app_package_page_component_templates/);
 assert.match(sql,/md_app_package_page_property_templates/);
});
test('Acetill publishes metadata without seeding business records or granting implicit access',()=>{
 assert.doesNotMatch(sql,/INSERT INTO md_records|INSERT INTO md_users|INSERT INTO md_permission_assignments/i);
 assert.match(sql,/2,true/);
 assert.match(sql,/md_app_package_home_page_templates/);
 assert.match(sql,/2,'Field',f\.api_name,'Product'/);
});
test('checkout and receipt actions require named active Flows at runtime',()=>{
 assert.match(sql,/actionFlows\.checkout\.flowApiName','string','AcetillCompleteSale'/);
 assert.match(sql,/actionFlows\.click\.flowApiName','string','AcetillPrintReceipt'/);
 assert.doesNotMatch(sql,/disabled','boolean','true'/);
});
test('catalogue and basket bind shared Product fields and same cart state',()=>{
 assert.match(sql,/OneItemGrid','main',20,'objectApiName','string','Product'/);
 assert.match(sql,/OneItemGrid','main',20,'cartTargetKey','string','acetill'/);
 assert.match(sql,/OneShoppingCart','sidebar',30,'cartTargetKey','string','acetill'/);
});

test('standalone entrypoint uses the shared product-aware workspace shell',()=>{
 const main=readFileSync(fileURLToPath(new URL('../../web/src/main.tsx',import.meta.url)),'utf8');
 const app=readFileSync(fileURLToPath(new URL('../../web/src/core/workspace/App/App.tsx',import.meta.url)),'utf8');
 assert.doesNotMatch(main,/import\(['"]\.\.\/\.\.\/acetill\/src\/AcetillShell/);
 assert.match(main,/isMarketingHome/);
 assert.match(app,/standaloneCanonicalPath\(window\.location\.pathname/);
 assert.match(app,/resolveStandaloneEntry\(entryPath/);
 assert.match(app,/resolveStandaloneEntry\(entryPath/);
 assert.match(app,/LazyStandaloneRuntime entry=\{standaloneEntry\}/);
});

test('standalone Flow actions use server authorization without requiring Flow Definition read',()=>{
 const standalone=readFileSync(fileURLToPath(new URL('../../web/src/core/workspace/Standalone/StandaloneRuntime.tsx',import.meta.url)),'utf8');
 const pageRuntime=readFileSync(fileURLToPath(new URL('../../web/src/core/pages/PageRuntime/pageRuntimeViews.tsx',import.meta.url)),'utf8');
 assert.doesNotMatch(standalone,/\/metadata\/flows/);
 assert.match(pageRuntime,/binding\.flowType/);
 assert.match(sql,/actionFlows\.checkout\.flowType','string','Autolaunched Flow'/);
 assert.match(pageRuntime,/loadCompanySettings: \(\) => apiRequest\('\/metadata\/currencies'\)/);
});

test('custom Acetill terminal consumes only permitted Flows, not record or SQL APIs',()=>{
 const ui=readFileSync(fileURLToPath(new URL('../src/AcetillTerminal.tsx',import.meta.url)),'utf8');
 assert.match(ui,/AcetillGetProducts|find\('GetProducts'\)/);
 assert.match(ui,/\/flows\/available-actions/);
 assert.match(ui,/\/flows\//);
 assert.doesNotMatch(ui,/\/records\/|db\.query|md_records|OneShoppingCart|OneItemGrid/);
 assert.match(ui,/acetill-product-art/);
});

test('Acetill keeps its branded login instead of redirecting unauthenticated users to common login',()=>{
 const app=readFileSync(fileURLToPath(new URL('../../web/src/core/workspace/App/App.tsx',import.meta.url)),'utf8');
 assert.match(app,/authState==='anonymous'&&!standaloneEntry/);
 assert.match(app,/branding=\{standaloneEntry\?\?undefined\}/);
});
test('Flow-only terminal requires confirmed payment before showing receipt',()=>{
 const ui=readFileSync(fileURLToPath(new URL('../src/AcetillTerminal.tsx',import.meta.url)),'utf8');
 assert.match(ui,/find\('GetProducts'\)/);
 assert.match(ui,/find\('PrintReceipt'\)/);
 assert.match(ui,/find\('EmailReceipt'\)/);
 assert.match(ui,/if\(completed\)\{\s*setReceipt/);
 assert.doesNotMatch(ui,/\/records\/|db\.query|OneShoppingCart|OneItemGrid/);
});

test('customer display mirrors cart, and payments use only permitted Cash/Card Flows',()=>{
 const ui=readFileSync(fileURLToPath(new URL('../src/AcetillTerminal.tsx',import.meta.url)),'utf8');
 assert.match(ui,/find\('PaymentCash'\)/);
 assert.match(ui,/find\('PaymentCard'\)/);
 assert.match(ui,/createPortal\(/);
 assert.match(ui,/window\.open\(/);
 assert.match(ui,/customer-window|customerWindow/);
 assert.match(ui,/cashReceived:received,changeDue/);
 assert.match(ui,/cardPaymentConfirmed:true/);
 assert.match(ui,/if\(completed\)\{\s*setReceipt/);
 assert.doesNotMatch(ui,/\/records\/|db\.query/);
});


test('cash/card payment Flow graphs use server Product prices and create both Invoice and InvoiceLine',()=>{
 const graphs=JSON.parse(readFileSync(fileURLToPath(new URL('../flows/payment-flows.v1.json',import.meta.url)),'utf8'));
 const ui=readFileSync(fileURLToPath(new URL('../src/AcetillTerminal.tsx',import.meta.url)),'utf8');
 for(const name of ['AcetillPaymentCash','AcetillPaymentCard']){
  const graph=graphs[name];
  assert.equal(graph.flowType,'Autolaunched Flow');
  const resources=graph.resources;
  assert.ok(resources.some(r=>r.name==='cartItems'&&r.type==='Record Collection'
   &&r.dataType==='InvoiceLine'&&r.isCollection&&r.availableForInput));
  const nodes=graph.elements;
  assert.ok(nodes.some(n=>n.type==='Get Records'&&n.config.object==='Product'
   &&n.config.conditions.some(c=>c.field==='Id'&&(c.value==='{!verifyLine.Product}'||c.value==='{!saveLine.Product}'))));
  const order=nodes.find(n=>n.type==='Create Records'&&n.config.object==='Invoice');
  const line=nodes.find(n=>n.type==='Create Records'&&n.config.object==='InvoiceLine');
  assert.ok(order&&line);
  assert.equal(order.config.fieldValues.find(f=>f.field==='Total')?.value,'{!validatedTotal}');
  assert.equal(line.config.fieldValues.find(f=>f.field==='UnitPrice')?.value,'{!currentProduct.Price}');
  assert.equal(line.config.fieldValues.find(f=>f.field==='LineTotal')?.value,'{!saveLineAmount}');
  assert.equal(graph.appApiName,'Acetill');
  assert.ok(nodes.some(n=>n.type==='Decision'&&n.config.outcomes?.some(o=>o.label==='Match')));
  assert.ok(nodes.some(n=>n.type==='Custom Error'&&String(n.config.errorMessage).includes('Product price changed')));
  assert.ok(nodes.some(n=>n.type==='Loop'&&n.config.collection==='cartItems'));
  assert.ok(nodes.some(n=>n.type==='Custom Error'));
  assert.ok(nodes.some(n=>n.type==='Assignment'&&n.config.variable==='status'&&n.config.value==='completed'));
  assert.ok(graph.connectors.every(c=>c.label!=='default'));
  assert.ok(graph.connectors.every(c=>nodes.some(n=>n.id===c.from)&&nodes.some(n=>n.id===c.to)));
 }
 assert.match(ui,/cartItems:cart.map\(x=>\(\{Product:x.id,Quantity:x.quantity\}\)\)/);
 assert.match(ui,/requestId:paymentRequestId.current/);
 assert.doesNotMatch(ui,/db\.query|\/records\//);
});
