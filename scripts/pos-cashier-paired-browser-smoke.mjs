/** Isolated browser acceptance: cashier ↔ customer display, manual age rejection and cash statuses.
 * No real payment, backend, SQL write or tenant metadata activation.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const js=String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import OneShoppingCart from './apps/web/src/custom-components/one/OneShoppingCart.jsx';
globalThis.React=React;
const params=new URLSearchParams(location.search);
const display=params.get('mode')==='display';
const records=[
 {Id:'lager-demo',Name:'Demo Lager',DefaultPrice:3.50,AgeRestricted:true,MinimumAge:18,VATApplicable:true},
 {Id:'water-demo',Name:'Water',DefaultPrice:1.25,AgeRestricted:false,MinimumAge:0,VATApplicable:true}
];
window.flowCalls=[];
function action(event){window.flowCalls.push(event);return Promise.resolve(true)}
createRoot(document.getElementById('root')).render(
 display?<OneShoppingCart viewMode="display" currencyCode="GBP" />:
 <OneShoppingCart records={records} currencyCode="GBP" customerDisplayUrl={location.origin+'/?mode=display'}
   actionFlows={{checkout:{flowApiName:'POS_Test_Checkout',inputs:{}}}}
   onAction={action} sessionId="isolated-age-cash-test" />
);
`;
const built=await build({stdin:{contents:js,resolveDir:process.cwd(),sourcefile:'pos-harness.jsx',loader:'jsx'},
  bundle:true,format:'iife',platform:'browser',write:false,target:'es2022'});
const source=built.outputFiles[0].text;
const server=http.createServer((req,res)=>{
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end('<main id="root"></main><script>'+source+'</script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const cashier=await context.newPage();
 const errors=[];
 const navigations=[];
 cashier.on('framenavigated',frame=>{if(frame===cashier.mainFrame())navigations.push(frame.url())});
 cashier.on('pageerror',error=>errors.push(error.message));
 await cashier.goto(url);
 await cashier.evaluate(()=>{
   window.__displayOpenAttempts=[];
   const original=window.open.bind(window);
   window.open=(...args)=>{window.__displayOpenAttempts.push(args[0]);return original(...args)};
 });
 await cashier.getByRole('button',{name:'Demo Lager'}).click();
 await cashier.getByRole('button',{name:'Water'}).click();
 assert.match(await cashier.locator('aside[aria-label="Current sale"]').innerText(),/£4\.75/);
 await cashier.evaluate(()=>{window.__displayClickTrace=[];document.addEventListener('click',event=>{
   if(event.target?.closest?.('button')?.textContent?.includes('Open customer display'))
     window.__displayClickTrace.push('captured display button click');
 },true)});
 const popupEvent=cashier.waitForEvent('popup',{timeout:15000}).catch(async error=>{
   const alerts=await cashier.getByRole('alert').allInnerTexts();
   throw Error('Display popup failed: '+error.message+'; alerts='+JSON.stringify(alerts)+
     '; pageErrors='+JSON.stringify(errors)+'; pageCount='+context.pages().length+
     '; openAttempts='+JSON.stringify(await cashier.evaluate(()=>window.__displayOpenAttempts))+
     '; clickTrace='+JSON.stringify(await cashier.evaluate(()=>window.__displayClickTrace))+
     '; navigations='+JSON.stringify(navigations)+
     '; pageUrl='+cashier.url()+
     '; currentSale='+JSON.stringify(await cashier.locator('aside[aria-label="Current sale"]').allInnerTexts()));
 });
 await cashier.getByRole('button',{name:'Open customer display'}).click();
 const customer=await popupEvent;
 customer.on('pageerror',error=>errors.push(error.message));
 await customer.waitForLoadState('domcontentloaded');
 await customer.getByText('Staff approval required').first().waitFor();
 await customer.getByText('£4.75').first().waitFor();
 await cashier.getByRole('button',{name:'Payment'}).click();
 await cashier.getByText('Complete the payment step in the Flow screen.').waitFor();
 await cashier.evaluate(()=>window.dispatchEvent(new CustomEvent('metadrive:flow-completed',{
  detail:{flowApiName:'POS_Test_Checkout',outputs:{CheckoutStatus:'AgeRejected'}}
 })));
 await cashier.getByRole('button',{name:'Payment'}).waitFor();
 await cashier.getByText('Water').first().waitFor();
 await cashier.waitForFunction(()=>window.flowCalls.length===2);
 assert.equal(await cashier.getByText('Demo Lager',{exact:true}).count(),1,'Product still in catalogue but removed from basket');
 assert.doesNotMatch(await cashier.locator('aside[aria-label="Current sale"]').innerText(),/Demo Lager/);
 await cashier.evaluate(()=>window.dispatchEvent(new CustomEvent('metadrive:flow-completed',{
  detail:{flowApiName:'POS_Test_Checkout',outputs:{CheckoutStatus:'InsufficientCash'}}
 })));
 await cashier.getByText('Tendered cash was less than the sale total.').waitFor();
 await cashier.getByRole('button',{name:'Payment'}).click();
 await cashier.waitForFunction(()=>window.flowCalls.length===3);
 await cashier.evaluate(()=>window.dispatchEvent(new CustomEvent('metadrive:flow-completed',{
  detail:{flowApiName:'POS_Test_Checkout',outputs:{CheckoutStatus:'Accepted',ChangeDue:1}}
 })));
 await cashier.getByText('Payment accepted. Clear the sale when ready.').waitFor();
 await customer.getByText('Change due').waitFor();
 await customer.getByText('£1.00').waitFor();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',isolated:true,realPayments:false,realStockWrites:false,
   pagePairing:true,ageRejectionDropsRestrictedItem:true,insufficientCashState:true,
   paymentAcceptanceDisplay:true,changeDueDisplay:true}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
