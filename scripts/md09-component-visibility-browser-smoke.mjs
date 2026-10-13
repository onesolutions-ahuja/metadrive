// Module 9 isolated Chromium acceptance for visual visibility authoring, device runtime and record rules.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const temp = mkdtempSync(join(tmpdir(), 'md09-visibility-'));
const login = {email:'qa-visibility@example.test',password:'Synthetic-Visibility-QA-2026!'};
const processes=[]; let browser;
const api='http://127.0.0.1:3001/api', site='http://127.0.0.1:5173';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function service(args,env){
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])
    stream.on('data',chunk=>{output=(output+String(chunk)).slice(-8000);});
  processes.push(child);return {child,logs:()=>output};
}
async function ready(url,info){
  for(let n=0;n<140;n++){
    if(info.child.exitCode!==null)throw Error('Service exited: '+info.logs());
    try{
      const res=await fetch(url,{signal:AbortSignal.timeout(700)});
      if(res.ok)return;
      if(res.status>=500)throw Error('Service HTTP '+res.status+': '+info.logs());
    }catch(error){if(String(error).includes('Service HTTP'))throw error;}
    await sleep(250);
  }
  throw Error('Service unavailable: '+url+' '+info.logs());
}
async function request(path,token,method='GET',body){
  const res=await fetch(api+path,{method,headers:{'Content-Type':'application/json',
    ...(token?{Authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=res.status===204?null:await res.json();
  if(!res.ok)throw Error(method+' '+path+': '+res.status+' '+JSON.stringify(data).slice(0,900));
  return data;
}
try{
  const server=service(['apps/server/dist/index.js'],{
    DATABASE_URL:'',NODE_ENV:'test',METADRIVE_TEST_MODE:'true',
    METADRIVE_DATA_PATH:join(temp,'data.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID:'md09-visibility',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'MD09 Visibility QA',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:login.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:login.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000',PORT:'3001',WEB_ORIGIN:site
  });
  const web=service(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],{VITE_API_BASE_URL:api});
  await Promise.all([ready('http://127.0.0.1:3001/health',server),ready(site,web)]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(25000);
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(site+'/une/login');
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({state:'hidden'});

  await page.goto(site+'/une/setup/component-library');
  await page.getByRole('heading',{name:'Global Component Library'}).waitFor();
  await page.getByRole('button',{name:'Register component'}).click();
  await page.locator('#library-component-label').fill('MD09 Visibility Widget');
  await page.locator('#library-jsx-file').setInputFiles({
    name:'MD09_Visibility_Widget.jsx',mimeType:'text/javascript',
    buffer:Buffer.from("export default function Component({label}){return <div className='visibility-proof'>{label}</div>}")
  });
  await page.getByRole('button',{name:'Register draft'}).click();
  const widget=page.locator('.library-component-card').filter({hasText:'MD09_Visibility_Widget'});
  await widget.getByText('Draft',{exact:false}).first().waitFor();
  await widget.getByRole('button',{name:'Publish'}).click();
  await widget.getByText('Published',{exact:false}).first().waitFor();

  const token=(await request('/auth/login',undefined,'POST',login)).access_token;
  const app='MD09_Visibility_App', appPage='MD09_Visibility_App_Page',recordPage='MD09_Visibility_Record_Page';
  const component=(id,label,visibilityRules)=>({
    id,type:'Custom:MD09_Visibility_Widget',label,visible:true,region:'main',
    properties:{libraryComponentId:'MD09_Visibility_Widget',...(visibilityRules?{visibilityRules}:{})}
  });
  const phoneOnly={logic:'All',conditions:[{source:'Device',operator:'Equals',value:'Phone'}]};
  await request('/metadata/pages/'+appPage,token,'PUT',{
    apiName:appPage,label:'Visibility App Test',targetObject:'Account',pageType:'App Page',
    status:'Active',layoutMode:'template',template:'one-region',canvasWidth:1440,canvasHeight:900,
    devices:['Desktop','Phone'],activationAssignments:[],
    components:[component('desktop-proof','Desktop content'),component('phone-proof','Phone content',phoneOnly)]
  });
  await request('/metadata/apps',token,'POST',{
    apiName:app,label:'Visibility QA App',description:'Disposable visibility acceptance',
    navigationItems:['Account'],navigationPageApiNames:[appPage],
    brandColor:'#0176d3',utilityItems:[]
  });

  // Exercise the actual Page Builder inspector rather than just writing metadata via API.
  await page.goto(site+'/une/setup/page-builder/'+appPage);
  await page.getByRole('button',{name:'Back to page list'}).waitFor();
  await page.locator('[data-component-id="desktop-proof"]').click();
  await page.getByRole('button',{name:'Conditions',exact:true}).click();
  const editor=page.getByLabel('Component visibility rules');
  await editor.getByLabel('Enable visibility conditions').check();
  assert.equal(await editor.getByLabel('Visibility source 1').inputValue(),'Device');
  await editor.getByLabel('Visibility value 1').selectOption('Desktop');
  // The editor persists metadata asynchronously; a click does not mean the
  // server commit is complete. Wait for the actual success response.
  const savedPageResponse=page.waitForResponse(response=>
    response.url().includes('/api/metadata/pages/'+appPage)
    && response.request().method()==='PUT' && response.status()===200);
  await page.getByRole('button',{name:'Save page'}).click();
  await savedPageResponse;

  let saved=(await request('/metadata/pages',token)).pages.find(item=>item.apiName===appPage);
  assert.equal(saved.components[0].properties.visibilityRules.conditions[0].value,'Desktop');
  await page.reload();
  await page.getByRole('button',{name:'Back to page list'}).waitFor();
  await page.locator('[data-component-id="desktop-proof"]').click();
  await page.getByRole('button',{name:'Conditions',exact:true}).click();
  assert.equal(await page.getByLabel('Visibility value 1').inputValue(),'Desktop');

  for(const [width,height,expected,hidden] of [
    [1440,900,'Desktop content','Phone content'],
    [390,844,'Phone content','Desktop content']
  ]){
    await page.setViewportSize({width,height});
    await page.goto(site+'/une/apps/'+app+'/pages/'+appPage);
    const frame=page.locator('iframe[sandbox="allow-scripts"]').first();
    await frame.waitFor({state:'attached'});
    await frame.contentFrame().getByText(expected,{exact:true}).waitFor();
    assert.equal(await page.locator('iframe[sandbox="allow-scripts"]').count(),1,
      'Hidden components must not mount their sandbox iframe');
    assert.equal(await page.getByText(hidden,{exact:true}).count(),0);
  }

  const accepted=(await request('/records/Account',token,'POST',{Name:'MD09 Allowed'})).record;
  const denied=(await request('/records/Account',token,'POST',{Name:'MD09 Denied'})).record;
  const fieldOnly={logic:'All',conditions:[{source:'Record Field',fieldApiName:'Name',operator:'Equals',value:'MD09 Allowed'}]};
  await request('/metadata/pages/'+recordPage,token,'PUT',{
    apiName:recordPage,label:'Visibility Record Test',targetObject:'Account',pageType:'Record Page',
    status:'Active',layoutMode:'template',template:'one-region',canvasWidth:1440,canvasHeight:900,
    devices:['Desktop','Phone'],
    activationAssignments:[{
      id:'md09-record-app-visibility',scope:'App Default',appId:app,
      profileId:null,recordTypeId:null,formFactors:['Desktop','Phone']
    }],
    components:[component('record-proof','Allowed record component',fieldOnly)]
  });
  const received=await request('/records/Account/'+accepted.Id+'?appId='+app+'&formFactor=Desktop',token);
  assert.equal(received.lightningPage?.apiName,recordPage,'Record page must resolve through metadata activation');

  await page.setViewportSize({width:1440,height:900});
  await page.goto(site+'/une/r/Account/'+accepted.Id+'/view?appId='+app);
  await page.locator('iframe[sandbox="allow-scripts"]').first().contentFrame()
    .getByText('Allowed record component',{exact:true}).waitFor();
  await page.goto(site+'/une/r/Account/'+denied.Id+'/view?appId='+app);
  await page.getByRole('heading',{name:'MD09 Denied'}).first().waitFor();
  assert.equal(await page.getByText('Allowed record component',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('MD09 visibility E2E passed: visual editor, save/reopen, phone/desktop, record-field runtime.');
}finally{
  if(browser)await browser.close();
  for(const child of processes.reverse())if(child.exitCode===null)child.kill('SIGTERM');
  rmSync(temp,{recursive:true,force:true});
}
