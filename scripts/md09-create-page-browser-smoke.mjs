import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const temp=mkdtempSync(join(tmpdir(),'md09-page-wizard-'));
const user={email:'qa-page-wizard@example.test',password:'Synthetic-Page-Wizard-QA-2026!'};
const processes=[];let browser;
const origin='http://127.0.0.1:5173',api='http://127.0.0.1:3001/api';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function service(args,env){
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',value=>{logs=(logs+String(value)).slice(-9000);});
  processes.push(child);return {child,logs:()=>logs};
}
async function ready(url,info){
  for(let i=0;i<140;i++){
    if(info.child.exitCode!==null)throw Error('Service exited: '+info.logs());
    try{const response=await fetch(url,{signal:AbortSignal.timeout(700)});
      if(response.ok)return;
      if(response.status>=500)throw Error('Service HTTP '+response.status+' '+info.logs());
    }catch(error){if(String(error).includes('Service HTTP'))throw error;}
    await pause(250);
  }
  throw Error('Service not ready '+url+' '+info.logs());
}
async function request(path,token,method='GET',body){
  const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',
    ...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=response.status===204?null:await response.json();
  if(!response.ok)throw Error(method+' '+path+': '+response.status+' '+JSON.stringify(data).slice(0,1000));
  return data;
}
try{
  const server=service(['apps/server/dist/index.js'],{
    DATABASE_URL:'',NODE_ENV:'test',METADRIVE_TEST_MODE:'true',
    METADRIVE_DATA_PATH:join(temp,'data.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID:'md09-page-wizard',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'Page Wizard QA',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:user.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:user.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000',PORT:'3001',WEB_ORIGIN:origin
  });
  const frontend=service(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],{
    VITE_API_BASE_URL:api
  });
  await Promise.all([ready('http://127.0.0.1:3001/health',server),ready(origin,frontend)]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(25000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);
  await page.locator('#login-email').fill(user.email);
  await page.locator('#login-password').fill(user.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({state:'hidden'});
  const token=(await request('/auth/login',undefined,'POST',user)).access_token;
  const appId='MD09_Wizard_App',newApi='MD09_Guided_App';
  await request('/metadata/apps',token,'POST',{
    apiName:appId,label:'Page Wizard App',description:'Isolated page creation acceptance',
    navigationItems:['Account'],navigationPageApiNames:[],
    brandColor:'#0176d3',utilityItems:[]
  });
  const catalog=(await request('/metadata/pages',token)).pages;
  const initial=catalog.find(item=>item.pageType==='Record Page'&&item.targetObject==='Account')??catalog[0];
  assert(initial,'Page Builder requires a bootstrap page');
  await page.goto(origin+'/une/setup/page-builder/'+initial.apiName);
  await page.getByRole('button',{name:'Desktop preview'}).waitFor();
  await page.getByRole('button',{name:'New Page'}).click();
  await page.locator('#new-lightning-page-label').fill('MD09 Guided App');
  await page.locator('#new-lightning-page-type').selectOption('App Page');
  await page.locator('#new-lightning-page-object').selectOption('Account');
  await page.locator('#new-lightning-page-app').selectOption(appId);
  await page.locator('#new-lightning-page-template').selectOption('header-main');
  const wizard=page.getByRole('dialog',{name:'Create a Lightning page'});
  await wizard.getByLabel('Phone').check();
  await wizard.getByLabel('Desktop and tablet').uncheck();
  await wizard.getByRole('button',{name:'Create draft'}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async apiName=>{
    const response=await fetch('/_unused_'+apiName).catch(()=>null);
    return true;
  },newApi).catch(()=>{});
  const saved=(await request('/metadata/pages',token)).pages.find(item=>item.apiName===newApi);
  assert(saved,'Guided page must be saved');
  assert.equal(saved.pageType,'App Page');
  assert.equal(saved.targetObject,'Account');
  assert.equal(saved.template,'header-main');
  assert.deepEqual(saved.devices,['Phone']);
  const updatedApp=(await request('/metadata/apps',token)).apps.find(item=>item.apiName===appId);
  assert(updatedApp?.navigationPageApiNames.includes(newApi),'App Page must be attached to the selected application on first save');
  assert(updatedApp.navigationOrder.some(entry=>entry.type==='App Page'&&entry.apiName===newApi));
  await page.reload();
  await page.getByRole('button',{name:'Phone preview'}).waitFor();

  // A Record Page must not silently inherit an unrelated object's API name.
  await page.getByRole('button',{name:'New Page'}).click();
  await page.locator('#new-lightning-page-label').fill('MD09 Guided Record');
  await page.locator('#new-lightning-page-type').selectOption('Record Page');
  await page.locator('#new-lightning-page-object').selectOption('Contact');
  await page.locator('#new-lightning-page-app').selectOption('');
  await page.getByRole('dialog',{name:'Create a Lightning page'}).getByRole('button',{name:'Create draft'}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const recordPage=(await request('/metadata/pages',token)).pages.find(item=>item.apiName==='MD09_Guided_Record');
  assert(recordPage);
  assert.equal(recordPage.pageType,'Record Page');
  assert.equal(recordPage.targetObject,'Contact');
  assert.deepEqual(errors,[]);
  console.log('MD09 wizard: object selection, app linking, device defaults and saved/reloaded pages passed');
}finally{
  if(browser)await browser.close();
  for(const child of processes.reverse())if(child.exitCode===null)child.kill('SIGTERM');
  rmSync(temp,{recursive:true,force:true});
}
