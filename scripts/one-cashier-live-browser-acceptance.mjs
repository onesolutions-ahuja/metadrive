/** Production cashier draft browser acceptance: read-only metadata/products, local preview interactions only. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=(process.env.METADRIVE_API_BASE||'https://metadrive-production.up.railway.app').replace(/\/$/,'');
const site=(process.env.METADRIVE_WEB_BASE||'https://unesolutions.co.uk').replace(/\/$/,'');
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('CI tenant test credentials required');
async function get(path,token,method='GET',body){
 const response=await fetch(base+'/api'+path,{method,signal:AbortSignal.timeout(30000),
  headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
   ...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert(response.ok,path+' HTTP '+response.status);return response.json();
}
const token=(await get('/auth/login',null,'POST',{email,password})).access_token;
assert.equal(typeof token,'string');
const registry=(await get('/component-library',token)).components??[];
for(const [api,minimum] of [['OneTabs',5],['OneItemGrid',6],['OneShoppingCart',6]]){
 const definition=registry.find(component=>component.apiName===api);
 assert(definition?.status==='Published'&&definition.version>=minimum,
  api+' upgraded SQL registry definition not published');
}
const pageApi='UK_Off_Licence_POS_Cashier_Till';
const before=(await get('/metadata/pages',token)).pages.find(page=>page.apiName===pageApi);
assert(before&&before.status==='Draft','Cashier page must remain Draft');
const originalComponents=JSON.stringify(before.components);
const products=(await get('/records/Product',token)).records;
const categories=(await get('/records/ProductCategory',token)).records;
const chicken=categories.find(category=>String(category.Name).toLowerCase()==='chicken');
assert(chicken,'Chicken category must exist in test tenant');
const expected=products.filter(product=>String(product.CategoryId)===String(chicken.Id)).length;
assert(expected>=0&&expected<products.length,'Category should narrow product list');
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:false});
 const page=await context.newPage();
 page.setDefaultTimeout(25000);
 await page.goto(site+'/une/login',{waitUntil:'domcontentloaded'});
 await page.locator('#login-email').fill(email);
 await page.locator('#login-password').fill(password);
 await page.locator('button.auth-submit').click();
 await page.locator('.auth-screen').waitFor({state:'hidden'});
 await page.goto(site+'/une/setup/page-builder/'+pageApi,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Preview page'}).waitFor();
 const popupEvent=context.waitForEvent('page');
 await page.getByRole('button',{name:'Preview page'}).click();
 const popup=await popupEvent;
 popup.setDefaultTimeout(25000);
 const catalogue=popup.locator('.one-grid .one-item--interactive');
 await popup.getByRole('tab',{name:'Chicken'}).waitFor();
 await popup.waitForFunction(()=>document.querySelectorAll('.one-grid .one-item--interactive').length===5);
 await popup.getByRole('tab',{name:'Chicken'}).click();
 await popup.waitForFunction(count=>document.querySelectorAll('.one-grid .one-item--interactive').length===count,expected);
 assert.equal(await catalogue.count(),expected,'Chicken category filters Product CategoryId');
 if(expected===0){
  const populated=categories.find(category=>products.some(product=>String(product.CategoryId)===String(category.Id)));
  assert(populated,'One category must contain a product for basket test');
  await popup.getByRole('tab',{name:String(populated.Name)}).click();
  await popup.waitForFunction(()=>document.querySelectorAll('.one-grid .one-item--interactive').length>0);
 }
 {
  const productName=(await catalogue.first().locator('strong').innerText()).trim();
  await catalogue.first().click();
  const basket=popup.locator('aside[aria-label="Current sale"]');
  await basket.getByText(productName,{exact:true}).waitFor();
  assert.equal(await popup.getByRole('button',{name:'Payment'}).isDisabled(),true,'Draft preview checkout must stay disabled');
 }
 const after=(await get('/metadata/pages',token)).pages.find(p=>p.apiName===pageApi);
 assert.equal(after.status,'Draft','Cashier page must remain inactive');
 assert.equal(JSON.stringify(after.components),originalComponents,'Preview must not change draft component metadata');
 assert.equal((await get('/records/Product',token)).records.length,products.length,'Product records must be preserved');
 console.log(JSON.stringify({result:'PASS',authenticated:true,draft:true,categorySelected:'Chicken',
  initialProducts:products.length,filteredProducts:expected,basketPreview:true,checkoutBlocked:true,readOnly:true}));
}finally{await browser?.close();}
