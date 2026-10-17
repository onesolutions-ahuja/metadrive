/** Non-mutating production diagnostic of popup category event delivery. */
import {chromium} from 'playwright';
const base='https://metadrive-production.up.railway.app',site='https://unesolutions.co.uk';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Read-only CI credentials required');
async function request(path,token,method='GET',body){
 const r=await fetch(base+'/api'+path,{method,headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
 ...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json();
}
const token=(await request('/auth/login',null,'POST',{email,password})).access_token;
const id='UK_Off_Licence_POS_Cashier_Till';
const pageMeta=(await request('/metadata/pages',token)).pages.find(p=>p.apiName===id);
const comps=pageMeta?.components??[];
const tabs=comps.find(c=>c.type==='Custom:OneTabs'),grid=comps.find(c=>c.type==='Custom:OneItemGrid');
const [categories,products]=await Promise.all([request('/records/ProductCategory',token),request('/records/Product',token)]);
const chicken=(categories.records??[]).find(x=>String(x.Name).toLowerCase()==='chicken');
const expected=(products.records??[]).filter(x=>String(x.CategoryId)===String(chicken?.Id)).length;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:1440,height:960}});
 const page=await ctx.newPage();
 await page.goto(site+'/une/login');
 await page.locator('#login-email').fill(email);
 await page.locator('#login-password').fill(password);
 await page.locator('button.auth-submit').click();
 await page.locator('.auth-screen').waitFor({state:'hidden'});
 await page.goto(site+'/une/setup/page-builder/'+id);
 await page.getByRole('button',{name:'Preview page'}).waitFor();
 const popupEvt=ctx.waitForEvent('page');
 await page.getByRole('button',{name:'Preview page'}).click();
 const popup=await popupEvt;
 await popup.getByRole('tab',{name:'Chicken'}).waitFor();
 const inspect=()=>{window.__filterEvents=[];window.addEventListener('metadrive:page-filter-selected',e=>{
  const d=e.detail||{};window.__filterEvents.push({key:d.filterKey,label:d.label,hasRecordId:!!d.recordId,
   hasValue:d.value!==undefined,sessionKeyType:typeof d.pageSessionKey});
 });};
 await page.evaluate(inspect);await popup.evaluate(inspect);
 const before=await popup.locator('.one-grid .one-item--interactive').count();
 await popup.getByRole('tab',{name:'Chicken'}).click();
 await popup.waitForTimeout(1400);
 const after=await popup.locator('.one-grid .one-item--interactive').count();
 const eventPage=await page.evaluate(()=>window.__filterEvents||[]);
 const eventPopup=await popup.evaluate(()=>window.__filterEvents||[]);
 const active=await popup.getByRole('tab',{name:'Chicken'}).getAttribute('aria-selected');
 console.log(JSON.stringify({result:'NONMUTATING_POPUP_DIAGNOSTIC',draft:pageMeta?.status==='Draft',layoutMode:pageMeta?.layoutMode,
  before,after,expected,active,
  eventsOpener:eventPage,eventsPopup:eventPopup,
  tabProps:{objectApiName:tabs?.properties?.objectApiName,filterKey:tabs?.properties?.filterKey,
   actionType:tabs?.properties?.actionFlows?.tabChange?.actionType,categoryValueField:tabs?.properties?.categoryValueFieldApiName},
  gridProps:{objectApiName:grid?.properties?.objectApiName,filterKey:grid?.properties?.filterKey,
   categoryField:grid?.properties?.categoryFieldApiName},readOnly:true}));
}finally{await browser?.close();}
