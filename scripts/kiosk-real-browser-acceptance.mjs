// Render the actual registered Kiosk components in an isolated MetaDrive tenant.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {kioskPresentationComponents} from './kiosk-phase4-components.mjs';
import {commercePages,commerceApp} from './kiosk-phase4-pages.mjs';
import {kioskObjectDefinitions,demoCategories,demoProducts} from './kiosk-demo-fixtures.mjs';

const temp=mkdtempSync(join(tmpdir(),'kiosk-visual-'));
const evidence=process.env.KIOSK_EVIDENCE_DIR||join(temp,'screenshots');
mkdirSync(evidence,{recursive:true});
const user={email:'qa-kiosk@example.test',password:'Synthetic-Visual-Kiosk-2026!'};
const site='http://127.0.0.1:5173',api='http://127.0.0.1:3001/api';
const services=[];
let browser;
function spawnService(args,env){
 const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{logs=(logs+String(d)).slice(-6000)});
 services.push(child);return {child,logs:()=>logs};
}
async function ready(url,service){
 for(let i=0;i<160;i++){
  if(service.child.exitCode!==null)throw Error('Service exited '+service.logs());
  try{const r=await fetch(url,{signal:AbortSignal.timeout(800)});if(r.ok)return}catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 throw Error('Service readiness timeout '+url+' '+service.logs());
}
let token='';
async function request(path,method='GET',body){
 const r=await fetch(api+path,{method,headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text.slice(0,500)}}
 assert.ok(r.ok,method+' '+path+' '+r.status+' '+JSON.stringify(data).slice(0,900));return data;
}
try{
 const server=spawnService(['apps/server/dist/index.js'],{
  DATABASE_URL:'',NODE_ENV:'test',METADRIVE_TEST_MODE:'true',METADRIVE_DATA_PATH:join(temp,'state.json'),
  METADRIVE_BOOTSTRAP_TENANT_ID:'kiosk-visual-test',METADRIVE_BOOTSTRAP_TENANT_NAME:'Kiosk Visual Test',
  METADRIVE_BOOTSTRAP_ADMIN_EMAIL:user.email,METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:user.password,
  METADRIVE_SCHEDULE_POLL_MS:'3600000',PORT:'3001',WEB_ORIGIN:site
 });
 const web=spawnService(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],{VITE_API_BASE_URL:api});
 await Promise.all([ready(api.replace('/api','')+'/health',server),ready(site,web)]);
 token=(await request('/auth/login','POST',user)).access_token;
 assert.ok(token);
 const existing=new Set((await request('/metadata/objects')).objects.map(o=>o.apiName));
 for(const obj of kioskObjectDefinitions.filter(o=>['ProductCategory__c','Product__c','Order__c'].includes(o.apiName)))
  if(!existing.has(obj.apiName))await request('/metadata/objects','POST',obj);
 const categoryIds=new Map();
 for(const record of demoCategories){
  const result=await request('/records/ProductCategory__c','POST',record);
  categoryIds.set(record.Name,String(result.record?.Id||result.Id));
 }
 for(const p of demoProducts)await request('/records/Product__c','POST',{
  Name:p.Name,DefaultPrice:p.DefaultPrice,Description:p.Description,ImageUrl:p.ImageUrl,
  CategoryId:categoryIds.get(p.category),IsActive:true
 });
 for(const comp of kioskPresentationComponents){
  await request('/component-library','POST',{...comp,publicationStatus:'Draft'});
  await request('/component-library/'+encodeURIComponent(comp.apiName)+'/publish','POST');
 }
 await request('/metadata/apps','POST',{...commerceApp,navigationPageApiNames:[],navigationOrder:[{type:'Object',apiName:'Product__c'}]});
 for(const p of commercePages)await request('/metadata/pages/'+p.apiName,'PUT',p);
 // Complete active app navigation after Pages exist.
 const app=(await request('/metadata/apps')).apps.find(a=>a.apiName===commerceApp.apiName);
 assert.ok(app);
 await request('/metadata/apps/'+commerceApp.apiName,'PUT',{...app,...commerceApp});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1649,height:764},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site+'/une/login');
 await page.locator('#login-email').fill(user.email);
 await page.locator('#login-password').fill(user.password);
 await page.locator('button.auth-submit').click();
 await page.locator('.auth-screen').waitFor({state:'hidden'});
 for(const [label,width,height] of [['desktop',1649,764],['phone',390,844]]){
  await page.setViewportSize({width,height});
  await page.goto(site+'/une/apps/MD_Commerce_Kiosk/pages/MD_Commerce_Menu');
  const frames=page.locator('[data-lightning-page="MD_Commerce_Menu"] iframe[sandbox="allow-scripts"]');
  await frames.nth(2).waitFor({state:'visible',timeout:40000});
  await frames.nth(1).contentFrame().getByText('Demo Classic Burger').waitFor({timeout:30000});
  await frames.nth(0).contentFrame().getByText('Demo Burgers').first().waitFor();
  await frames.nth(2).contentFrame().getByRole('button',{name:/PLACE ORDER/i}).waitFor();
  const bounds=await Promise.all([0,1,2].map(i=>frames.nth(i).boundingBox()));
  assert.ok(bounds.every(Boolean),label+' missing iframe bounds');
  assert.ok(bounds[0].height>height*.45,'Category rail cropped: '+JSON.stringify(bounds));
  assert.ok(bounds[1].height>height*.40,'Products iframe cropped: '+JSON.stringify(bounds));
  assert.ok(bounds[2].height>=80&&bounds[2].height<=height*.3,'Basket bar sized incorrectly: '+JSON.stringify(bounds));
  const checkout=await frames.nth(2).contentFrame().getByRole('button',{name:/PLACE ORDER/i}).boundingBox();
  assert.ok(checkout && checkout.width>100 && checkout.height>=35,'Checkout button has no visible size');
  assert.ok(checkout.y>=bounds[2].y && checkout.y+checkout.height<=bounds[2].y+bounds[2].height+2,
   'Checkout button is outside its visible iframe viewport: '+JSON.stringify({checkout,footer:bounds[2]}));
  assert.ok(bounds[1].width>100,'Product grid too narrow');
  await page.screenshot({path:join(evidence,'kiosk-'+label+'.png'),fullPage:true});
  console.log('Rendered Kiosk '+label+' '+JSON.stringify(bounds.map(x=>({width:x.width,height:x.height}))));
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: isolated real registered Kiosk, demo products, responsive viewport, and checkout rendered');
}finally{
 if(browser)await browser.close();
 for(const c of services)if(c.exitCode===null)c.kill('SIGTERM');
 rmSync(temp,{recursive:true,force:true});
}
