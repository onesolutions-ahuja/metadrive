// Module 9 completion: real browser authoring, native dashboard, runtime and dependency proof.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const tmp=mkdtempSync(join(tmpdir(),'md09-finish-'));
const login={email:'md09-complete@example.test',password:'Synthetic-Completion-QA-2026!'};
const api='http://127.0.0.1:3001/api',site='http://127.0.0.1:5173';
const children=[];let browser;
function service(args,env){
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [child.stdout,child.stderr])
    stream.on('data',value=>{logs=(logs+String(value)).slice(-8000);});
  children.push(child);return {child,logs:()=>logs};
}
async function ready(path,svc){
  for(let i=0;i<140;i++){
    if(svc.child.exitCode!==null)throw Error('Service exited '+svc.logs());
    try{if((await fetch(path,{signal:AbortSignal.timeout(650)})).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Service unavailable '+path+' '+svc.logs());
}
async function request(path,token,method='GET',payload,expected){
  const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',
    ...(token?{Authorization:'Bearer '+token}:{})},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const result=response.status===204?null:await response.json();
  if(expected!==undefined?response.status!==expected:!response.ok)
    throw Error(method+' '+path+' HTTP '+response.status+': '+JSON.stringify(result).slice(0,1700));
  return result;
}
try{
  const server=service(['apps/server/dist/index.js'],{
    NODE_ENV:'test',METADRIVE_TEST_MODE:'true',DATABASE_URL:'',
    METADRIVE_DATA_PATH:join(tmp,'state.json'),PORT:'3001',WEB_ORIGIN:site,
    METADRIVE_BOOTSTRAP_TENANT_ID:'md09-completion-test',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'Module 9 Completion',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:login.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:login.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000'
  });
  const web=service(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],
    {VITE_API_BASE_URL:api});
  await Promise.all([ready('http://127.0.0.1:3001/health',server),ready(site,web)]);
  const token=(await request('/auth/login',undefined,'POST',login)).access_token;
  assert(token);
  const dashboardApi='MD09_Embed_Dashboard', app='MD09_Embed_App', pageApi='MD09_Embed_Page';
  await request('/metadata/dashboards/'+dashboardApi,token,'PUT',{
    apiName:dashboardApi,label:'Module 9 embedded dashboard',description:'Live dashboard proof',
    folderName:'Private Reports',visibility:'Private',sharedUserIds:[],
    sharedPermissionSetGroupIds:[],filterLogic:'All',status:'Deployed',filters:[],
    components:[
      {id:'rich-test',title:'Instructions',type:'Rich Text',objectApiName:'Account',
       richTextContent:'Embedded dashboard data is permission checked',
       aggregation:'Count',measureFieldApiName:null,groupByFieldApiName:null,
       chartType:'Bar',displayFieldApiNames:[]},
      {id:'metric-test',title:'Record count',type:'Metric',objectApiName:'Account',
       aggregation:'Count',measureFieldApiName:null,groupByFieldApiName:null,
       chartType:'Bar',displayFieldApiNames:[]}
    ]
  });
  await request('/metadata/apps',token,'POST',{
    apiName:app,label:'Embed App',description:'Module 9 acceptance',
    navigationItems:['Account'],navigationPageApiNames:[],
    brandColor:'#0176d3',utilityItems:[]
  });
  const defaultPage=(await request('/metadata/pages',token)).pages
    .find(page=>page.pageType==='Record Page'&&page.targetObject==='Account');
  assert(defaultPage,'Requires seeded Account page');
  const payload={
    ...defaultPage,apiName:pageApi,label:'Embedded Metrics',
    pageType:'App Page',status:'Draft',layoutMode:'template',template:'one-region',
    activationAssignments:[],devices:['Desktop','Phone'],components:[
      {id:'embed-test',type:'Dashboard',label:'Dashboard',visible:true,region:'main',
       properties:{dashboardApiName:dashboardApi}}
    ]
  };
  await request('/metadata/pages/'+pageApi,token,'PUT',payload);
  // No publishing an inactive/missing dependency.
  await request('/metadata/pages/'+pageApi,token,'PUT',{
    ...payload,status:'Active',components:[{...payload.components[0],properties:{dashboardApiName:'Missing_Dashboard'}}]
  },422);
  await request('/metadata/pages/'+pageApi,token,'PUT',{...payload,status:'Active'});
  await request('/metadata/apps/'+app,token,'PUT',{
    apiName:app,label:'Embed App',description:'Module 9 acceptance',
    navigationItems:['Account'],navigationPageApiNames:[pageApi],
    brandColor:'#0176d3',utilityItems:[],
    navigationOrder:[{type:'Object',apiName:'Account'},{type:'App Page',apiName:pageApi}]
  });
  await request('/metadata/dashboards/'+dashboardApi,token,'DELETE',undefined,409);

  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const browserPage=await browser.newPage({viewport:{width:1440,height:900}});
  browserPage.setDefaultTimeout(25000);
  const errors=[];browserPage.on('pageerror',error=>errors.push(error.message));
  await browserPage.goto(site);
  await browserPage.locator('#login-email').fill(login.email);
  await browserPage.locator('#login-password').fill(login.password);
  await browserPage.locator('button.auth-submit').click();
  await browserPage.locator('.auth-screen').waitFor({state:'hidden'});
  await browserPage.goto(site+'/une/setup/page-builder/'+pageApi);
  await browserPage.getByRole('button',{name:'Desktop preview'}).waitFor();
  await browserPage.getByRole('button',{name:'Open page dependencies'}).click();
  const deps=browserPage.getByRole('dialog',{name:'Page dependencies'});
  await deps.getByRole('cell',{name:dashboardApi}).waitFor();
  await deps.getByRole('cell',{name:'Ready'}).waitFor();
  await deps.getByRole('button',{name:'Close'}).click();
  await browserPage.getByRole('button',{name:'Layers'}).click();
  await browserPage.getByRole('navigation',{name:'Page component layers'})
    .getByRole('button',{name:'Select layer Dashboard'}).click();
  await browserPage.locator('#page-component-dashboard').waitFor();
  assert.equal(await browserPage.locator('#page-component-dashboard').inputValue(),dashboardApi);
  await browserPage.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal((await request('/metadata/pages',token)).pages
    .find(item=>item.apiName===pageApi)?.components[0]?.properties.dashboardApiName,dashboardApi);
  for(const [width,height] of [[1440,900],[820,1180],[390,844]]){
    await browserPage.setViewportSize({width,height});
    await browserPage.goto(site+'/une/apps/'+app+'/pages/'+pageApi);
    await browserPage.locator('[data-dashboard="'+dashboardApi+'"]').waitFor();
    await browserPage.getByText('Embedded dashboard data is permission checked').waitFor();
    await browserPage.getByText('Record count').waitFor();
  }
  assert.deepEqual(errors,[],'No browser execution errors allowed');
  console.log('MD-09 completion: dashboard lifecycle, publish guard, dependency/layers UI, persistence and responsive runtime passed');
}finally{
  if(browser)await browser.close();
  for(const child of children.reverse())if(child.exitCode===null)child.kill('SIGTERM');
  rmSync(tmp,{recursive:true,force:true});
}
