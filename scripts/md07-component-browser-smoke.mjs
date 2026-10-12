// Real Module 7 Chromium acceptance on a disposable local tenant.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const temp=mkdtempSync(join(tmpdir(),'md07-browser-'));
const login={email:'qa-components@example.test',password:'Synthetic-Components-QA-2026!'};
const children=[]; let browser;
const pause=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
function service(args,env) {
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',(data)=>{logs=(logs+String(data)).slice(-9000);});
  children.push(child);return {child,logs:()=>logs};
}
async function ready(url,processInfo) {
  for(let i=0;i<140;i++){
    if(processInfo.child.exitCode!==null)throw Error('Service exited: '+processInfo.logs());
    try {const response=await fetch(url,{signal:AbortSignal.timeout(700)});if(response.ok)return;
      if(response.status>=500)throw Error('Service HTTP '+response.status+' '+processInfo.logs());}catch(error){
      if(String(error).includes('Service HTTP'))throw error;
    }
    await pause(250);
  }
  throw Error('Service not ready '+url+' '+processInfo.logs());
}
const api='http://127.0.0.1:3001/api';
async function request(path,token,method='GET',body) {
  const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=response.status===204?null:await response.json();
  if(!response.ok)throw Error(method+' '+path+' -> '+response.status+': '+JSON.stringify(data).slice(0,1300));
  return data;
}
try {
  const server=service(['apps/server/dist/index.js'],{
    DATABASE_URL:'',NODE_ENV:'test',METADRIVE_TEST_MODE:'true',
    METADRIVE_DATA_PATH:join(temp,'state.json'),METADRIVE_BOOTSTRAP_TENANT_ID:'md07-browser',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'Module Seven Browser',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:login.email,METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:login.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000',PORT:'3001',WEB_ORIGIN:'http://127.0.0.1:5173'
  });
  const web=service(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],{
    VITE_API_BASE_URL:api
  });
  await Promise.all([ready(api.replace('/api','')+'/health',server),ready('http://127.0.0.1:5173/',web)]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(20000);
  const uncaught=[];page.on('pageerror',(error)=>uncaught.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({state:'hidden'});
  await page.goto('http://127.0.0.1:5173/une/setup/component-library');
  await page.getByRole('heading',{name:'Global Component Library'}).waitFor();
  await page.getByRole('button',{name:'Register component'}).click();
  await page.locator('#library-component-label').fill('MD07 Browser Widget');
  await page.locator('#library-jsx-file').setInputFiles({
    name:'MD07_Browser_Widget.jsx',mimeType:'text/javascript',
    buffer:Buffer.from("export default function Component({label}) { return <div>MD07 isolated component ready: {label}</div> }")
  });
  await page.getByRole('button',{name:'Register draft'}).click();
  const row=page.locator('.library-component-card').filter({hasText:'MD07_Browser_Widget'});
  await row.getByText('Draft',{exact:false}).first().waitFor();
  await row.getByRole('button',{name:'Publish'}).click();
  await row.getByText('Published',{exact:false}).first().waitFor();
  const token=(await request('/auth/login',undefined,'POST',{email:login.email,password:login.password})).access_token;
  const registry=await request('/component-library',token);
  const component=registry.components.find((item)=>item.apiName==='MD07_Browser_Widget');
  if(!component||component.version!==1||component.status!=='Published'||component.trustedBundled!==false)
    throw Error('UI-created component not published as untrusted JSX');
  const pages=(await request('/metadata/pages',token)).pages;
  const template=pages.find((item)=>item.pageType==='Record Page'&&item.targetObject==='Account');
  if(!template)throw Error('No baseline record page for acceptance');
  const apiName='MD07_Browser_Page';
  await request('/metadata/pages/'+apiName,token,'PUT',{
    ...template,apiName,label:'MD07 Browser Page',status:'Draft',layoutMode:'template',template:'one-region',
    devices:['Desktop','Phone'],
    components:[{id:'md07-browser-widget',type:'Custom:MD07_Browser_Widget',
      label:'MD07 Browser Widget',properties:{libraryComponentId:'MD07_Browser_Widget'},visible:true,region:'main'}]
  });
  await page.goto('http://127.0.0.1:5173/une/setup/page-builder/'+apiName);
  await page.getByRole('button',{name:'Desktop preview'}).waitFor();
  for(const [label,width,height] of [['Desktop',1440,900],['Tablet',820,1180],['Phone',390,844]]) {
    await page.setViewportSize({width,height});
    await page.getByRole('button',{name:label+' preview'}).click();
    const iframe=page.locator('iframe[sandbox="allow-scripts"]').first();
    await iframe.waitFor({state:'attached'});
    await iframe.contentFrame().getByText('MD07 isolated component ready:',{exact:false}).first().waitFor();
  }
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const reopened=await request('/metadata/pages',token);
  const saved=reopened.pages.find((item)=>item.apiName===apiName);
  if(!saved?.components?.some((item)=>item.type==='Custom:MD07_Browser_Widget'))
    throw Error('Page Builder failed to persist component placement');
  await page.reload();
  await page.getByRole('button',{name:'Phone preview'}).waitFor();
  await page.getByRole('button',{name:'Phone preview'}).click();
  await page.locator('iframe[sandbox="allow-scripts"]').first().contentFrame().getByText('MD07 isolated component ready:',{exact:false}).waitFor();
  const componentRow=await request('/component-library',token);
  const published=componentRow.components.find((item)=>item.apiName==='MD07_Browser_Widget');
  if(!published?.surfaces.includes('dashboard')||!published?.surfaces.includes('flow'))
    throw Error('Custom component not advertised for dashboard and Flow surfaces');
  if(uncaught.length)throw Error('Uncaught browser errors: '+uncaught.join('; '));
  console.log(JSON.stringify({module:7,browser:'Chromium',registryCreate:true,publish:true,
    pageSave:true,reopen:true,desktop:true,tablet:true,phone:true,
    sandbox:true,advertisedSurfaces:['page','dashboard','flow'],pageErrors:0,isolated:true}));
} finally {
  if(browser)await browser.close();
  for(const child of children.reverse())if(child.exitCode===null)child.kill('SIGTERM');
  rmSync(temp,{recursive:true,force:true});
}
