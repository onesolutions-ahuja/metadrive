/** Read-only isolated browser acceptance for reusable catalogue, tabs, search and basket. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import OneActions from './apps/web/src/custom-components/one/OneActions.jsx';
import OneData from './apps/web/src/custom-components/one/OneData.jsx';
import OneLayout from './apps/web/src/custom-components/one/OneLayout.jsx';
import OneShoppingCart from './apps/web/src/custom-components/one/OneShoppingCart.jsx';
globalThis.React=React;
const categories=['Fruit','Bakery','Dairy','Drinks'].map(Name=>({Name}));
const products=[
 {Id:'product-1',Name:'Apple',Category:'Fruit',DefaultPrice:1.4,ImageURL:'https://example.com/apple.jpg'},
 {Id:'product-2',Name:'Banana',Category:'Fruit',DefaultPrice:1.8},
 {Id:'product-3',Name:'Bread',Category:'Bakery',DefaultPrice:2.2},
 {Id:'product-4',Name:'Milk',Category:'Dairy',DefaultPrice:1.2},
 {Id:'product-5',Name:'Water',Category:'Drinks',DefaultPrice:0.75}
];
const session='isolated-cashier-test',basketKey='cashier';
function Harness(){
 const [filters,setFilters]=React.useState({});
 React.useEffect(()=>{
  const listener=e=>{if(e.detail?.pageSessionKey===session)setFilters(old=>({...old,[e.detail.filterKey]:e.detail.value}));};
  window.addEventListener('metadrive:page-filter-selected',listener);
  return()=>window.removeEventListener('metadrive:page-filter-selected',listener);
 },[]);
 return <div>
  <OneLayout kind="Tabs" label="Categories" dynamicTabs={true} records={categories} onAction={({event,value})=>{
   if(event==='tabChange')window.dispatchEvent(new CustomEvent('metadrive:page-filter-selected',{detail:{pageSessionKey:session,filterKey:'category',value:value.value}}));
  }}/>
  <OneActions kind="Search" label="Find product" searchKey="catalogue" pageSessionKey={session}/>
  <OneData kind="ItemGrid" title="Products" records={products} imageFieldApiName="ImageURL" titleFieldApiName="Name"
    priceFieldApiName="DefaultPrice" categoryFieldApiName="Category" selectedCategory={filters.category||''}
    searchQuery={filters.catalogue||''} cartTargetKey={basketKey} pageSessionKey={session}/>
  <OneShoppingCart viewMode="basket" title="Basket" previewOnly={true} cartTargetKey={basketKey}
    pageSessionKey={session} nameFieldApiName="Name" priceFieldApiName="DefaultPrice"/>
 </div>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`;
const bundle = await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'one-cashier-harness.jsx',loader:'jsx'},bundle:true,format:'iife',platform:'browser',write:false,target:'es2022'});
let browser;
try {
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<main id="root"></main><script>'+bundle.outputFiles[0].text+'</script>');
 const items=page.locator('.one-grid .one-item--interactive');
 await page.getByRole('tab',{name:'Fruit'}).waitFor();
 assert.equal(await page.getByRole('tab').count(),4,'Categories are generated dynamically');
 assert.equal(await items.count(),5,'All five product records are initially present');
 assert.equal(await page.locator('img[src="https://example.com/apple.jpg"]').count(),1,'Configured image field is rendered');
 await page.getByRole('tab',{name:'Fruit'}).click();
 await page.getByText('Apple',{exact:true}).first().waitFor();
 assert.equal(await items.count(),2,'Category selection filters product grid');
 await page.getByRole('searchbox',{name:'Find product'}).fill('app');
 assert.equal(await items.count(),1,'Shared search filters the selected category');
 await items.first().click();
 const basket=page.locator('aside[aria-label="Current sale"]');
 await basket.getByText('Apple',{exact:true}).waitFor();
 assert.match(await basket.innerText(),/£1\.40/,'Basket uses real product price');
 assert.equal(await page.getByRole('button',{name:'Payment'}).isDisabled(),true,'Checkout cannot run in draft preview');
 await page.getByRole('searchbox',{name:'Find product'}).fill('');
 await page.getByRole('tab',{name:'Bakery'}).click();
 assert.equal(await items.count(),1,'Switching tabs updates product filter');
 await items.first().getByText('Bread').waitFor();
 assert.deepEqual(errors,[],'No browser script errors');
 console.log(JSON.stringify({result:'PASS',readOnly:true,tabs:4,products:5,categoryFilter:true,searchFilter:true,imageBinding:true,localBasket:true,checkoutDisabled:true}));
} finally {
 await browser?.close();
}
