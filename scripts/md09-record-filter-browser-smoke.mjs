// MD-09: visual Object Manager field filters must persist and filter real runtime records.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const tmp = mkdtempSync(join(tmpdir(),'md09-filters-'));
const login = { email: 'md09-filter@example.test', password: 'Synthetic-Visual-Filters-2026!' };
const processes = []; let browser;
const api = 'http://127.0.0.1:3001/api';
const web = 'http://127.0.0.1:5173';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function service(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe']
  });
  let output = '';
  for (const stream of [child.stdout,child.stderr]) {
    stream.on('data', chunk => { output = (output + String(chunk)).slice(-8000); });
  }
  processes.push(child); return {child, logs: () => output};
}
async function wait(url, processInfo) {
  for (let n=0; n<140; n++) {
    if (processInfo.child.exitCode!==null) throw Error('Service exited: '+processInfo.logs());
    try {
      const res=await fetch(url,{signal:AbortSignal.timeout(700)});
      if(res.ok)return;
      if(res.status>=500)throw Error('Service HTTP '+res.status+': '+processInfo.logs());
    } catch(e) {if(String(e).includes('Service HTTP')) throw e;}
    await sleep(250);
  }
  throw Error('Timed out starting '+url+': '+processInfo.logs());
}
async function req(path, token, method='GET', data) {
  const response = await fetch(api+path,{
    method,
    headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},
    ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  const payload=response.status===204?null:await response.json();
  if(!response.ok)throw Error(method+' '+path+' -> '+response.status+' '+JSON.stringify(payload).slice(0,1100));
  return payload;
}
try {
  const server=service(['apps/server/dist/index.js'],{
    DATABASE_URL:'',NODE_ENV:'test',METADRIVE_TEST_MODE:'true',
    METADRIVE_DATA_PATH:join(tmp,'data.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID:'md09-filters',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'MD09 Filter QA',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:login.email,METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:login.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000', PORT:'3001',WEB_ORIGIN:web
  });
  const frontend=service(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],{
    VITE_API_BASE_URL:api
  });
  await Promise.all([wait('http://127.0.0.1:3001/health',server),wait(web,frontend)]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(25000);
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(web);
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({state:'hidden'});

  const token=(await req('/auth/login',undefined,'POST',login)).access_token;
  await req('/records/Account',token,'POST',{Name:'MD09 Blue'});
  await req('/records/Account',token,'POST',{Name:'MD09 Red'});

  await page.goto(web+'/une/setup/component-library');
  await page.getByRole('heading',{name:'Global Component Library'}).waitFor();
  await page.getByRole('button',{name:'Register component'}).click();
  await page.locator('#library-component-label').fill('MD09 Filtered Accounts');
  await page.locator('#library-jsx-file').setInputFiles({
    name:'MD09_Filtered_Accounts.jsx',mimeType:'text/javascript',
    buffer:Buffer.from("export default function Component({records}){return <div><strong>Visible Accounts</strong><ul>{(records||[]).map(r=><li key={r.Id}>{r.Name}</li>)}</ul></div>}")
  });
  await page.getByRole('button',{name:'Register draft'}).click();
  const widget=page.locator('.library-component-card').filter({hasText:'MD09_Filtered_Accounts'});
  await widget.getByText('Draft',{exact:false}).first().waitFor();
  await widget.getByRole('button',{name:'Publish'}).click();
  await widget.getByText('Published',{exact:false}).first().waitFor();

  const app='MD09_Filter_App', pageId='MD09_Filter_Page';
  await req('/metadata/pages/'+pageId,token,'PUT',{
    apiName:pageId,label:'MD09 Filter Page',targetObject:'Account',
    pageType:'App Page',status:'Active',layoutMode:'template',template:'one-region',
    canvasWidth:1440,canvasHeight:900,devices:['Desktop','Phone'],
    activationAssignments:[],
    components:[{id:'accounts-component',type:'Custom:MD09_Filtered_Accounts',label:'Accounts list',
      properties:{libraryComponentId:'MD09_Filtered_Accounts',objectApiName:'Account',filters:[]},
      visible:true,region:'main'}]
  });
  await req('/metadata/apps',token,'POST',{
    apiName:app,label:'MD09 Filters',description:'Disposable page filter test',
    navigationItems:['Account'],navigationPageApiNames:[pageId],
    brandColor:'#0176d3',utilityItems:[]
  });
  await page.goto(web+'/une/setup/page-builder/'+pageId);
  await page.getByRole('button',{name:'Desktop preview'}).waitFor();
  await page.getByRole('button',{name:'Data & Actions'}).click();
  const editor=page.getByLabel('Record Filters filter editor').first();
  await editor.waitFor();
  await editor.getByRole('button',{name:'Add filter'}).click();
  await editor.getByLabel('Record Filters field 1').selectOption('Name');
  await editor.getByLabel('Record Filters operator 1').selectOption('Equals');
  await editor.getByLabel('Record Filters value 1').fill('MD09 Blue');
  await page.getByRole('button',{name:'Save',exact:true}).click();

  const saved=(await req('/metadata/pages',token)).pages.find(item=>item.apiName===pageId);
  assert(saved,'Page must persist');
  assert.deepEqual(saved.components[0].properties.filters,[
    {field:'Name',operator:'Equals',value:'MD09 Blue'}
  ]);
  await page.reload();
  await page.getByRole('button',{name:'Desktop preview'}).waitFor();
  await page.getByRole('button',{name:'Data & Actions'}).click();
  assert.equal(await page.getByLabel('Record Filters value 1').inputValue(),'MD09 Blue');

  await page.goto(web+'/une/apps/'+app+'/pages/'+pageId);
  const frame=page.locator('iframe[sandbox="allow-scripts"]').first();
  await frame.waitFor({state:'attached'});
  await frame.contentFrame().getByText('MD09 Blue',{exact:true}).waitFor();
  assert.equal(await frame.contentFrame().getByText('MD09 Red',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('MD09 filters passed: typed visual field authoring, saved metadata, reload and real record filtering.');
} finally {
  if(browser)await browser.close();
  for(const child of processes.reverse()) if(child.exitCode===null)child.kill('SIGTERM');
  rmSync(tmp,{recursive:true,force:true});
}
