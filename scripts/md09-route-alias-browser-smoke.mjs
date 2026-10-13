// MD-09 Phase 6B: disposable PostgreSQL and real Chromium acceptance.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';
const url=new URL(process.env.METADRIVE_TEST_DATABASE_URL ?? '');
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||!url.pathname.includes('test'))
  throw Error('Use only a disposable local test database');
const pool=new pg.Pool({connectionString:url.toString(),ssl:false,max:2});
const tmp=mkdtempSync(join(tmpdir(),'md09-alias-'));
const api='http://127.0.0.1:3001/api',site='http://127.0.0.1:5173';
const email='admin@md09-alias.test',password='Synthetic-Route-Alias-2026!';
const children=[];let browser;
function spawnService(args,env) {
  const child=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [child.stdout,child.stderr])
    stream.on('data',data=>{logs=(logs+String(data)).slice(-5000);});
  const service={child,logs:()=>logs};children.push(service);return service;
}
async function ready(path,service) {
  for(let i=0;i<140;i++){
    if(service.child.exitCode!==null)throw Error('Service crashed: '+service.logs());
    try{const res=await fetch(path,{signal:AbortSignal.timeout(650)});if(res.ok)return;}
    catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  throw Error('Service not ready '+path+' '+service.logs());
}
async function req(path,token,method='GET',body,expect=200){
  const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',
    ...(token?{Authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>null);
  assert.equal(response.status,expect,method+' '+path+' '+JSON.stringify(data));
  return data;
}
try{
  await pool.query(readFileSync('apps/server/sql/route-aliases-v1.sql','utf8'));
  const columns=await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name='md_route_aliases'");
  assert(columns.rows.length>=8);
  assert(columns.rows.every(x=>!['json','jsonb'].includes(x.data_type)));
  const server=spawnService(['apps/server/dist/index.js'],{
    NODE_ENV:'test',METADRIVE_TEST_MODE:'true',DATABASE_URL:url.toString(),PGSSLMODE:'disable',
    METADRIVE_DATA_PATH:join(tmp,'state.json'),PORT:'3001',WEB_ORIGIN:site,
    METADRIVE_BOOTSTRAP_TENANT_ID:'md09-alias-test',METADRIVE_BOOTSTRAP_TENANT_NAME:'MD09 Alias QA',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:email,METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000'
  });
  const web=spawnService(['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],
    {VITE_API_BASE_URL:api});
  await Promise.all([ready('http://127.0.0.1:3001/health',server),ready(site,web)]);
  const token=(await req('/auth/login',null,'POST',{email,password})).access_token;
  assert(token);
  const app='MD09_Alias_App',page='MD09_Alias_Page',slug='entry-here';
  await req('/metadata/pages/'+page,token,'PUT',{
    apiName:page,label:'Alias Destination',targetObject:'Account',pageType:'App Page',
    status:'Active',layoutMode:'template',template:'one-region',canvasWidth:1440,
    canvasHeight:900,devices:['Desktop','Phone'],components:[],activationAssignments:[]
  });
  await req('/metadata/apps',token,'POST',{
    apiName:app,label:'Alias App',description:'Disposable SQL route alias QA',
    navigationItems:['Account'],navigationPageApiNames:[page],brandColor:'#0176d3',utilityItems:[]
  },201);
  const body={appId:app,slug,kind:'App Page',targetApiName:page,status:'Active',expectedVersion:0};
  const endpoint='/metadata/route-aliases/'+app+'/'+slug;
  assert.equal((await req(endpoint,token,'PUT',body)).alias.version,1);
  await req(endpoint,token,'PUT',body,409);
  assert.equal((await req(endpoint,token,'PUT',{...body,expectedVersion:1})).alias.version,2);
  const canonical='/une/apps/'+app+'/pages/'+page;
  assert.equal((await req('/routes/resolve/'+app+'/'+slug,token)).path,canonical);
  await req('/routes/resolve/'+app+'/'+slug,null,'GET',undefined,401);
  await req('/routes/resolve/Other_App/'+slug,token,'GET',undefined,404);
  await pool.query("INSERT INTO md_route_aliases (tenant_id,app_api_name,slug,target_kind,target_api_name,status,version) VALUES ($1,$2,$3,'App Page',$4,'Active',1)",
    ['md09-other-tenant',app,'hidden-tenant',page]);
  await req('/routes/resolve/'+app+'/hidden-tenant',token,'GET',undefined,404);
  assert(!(await req('/metadata/route-aliases',token)).aliases.some(a=>a.slug==='hidden-tenant'));
  const revision=await pool.query('SELECT version FROM md_route_alias_revisions WHERE tenant_id=$1 AND slug=$2 ORDER BY version',
    ['md09-alias-test',slug]);
  assert.deepEqual(revision.rows.map(x=>x.version),[1,2]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const tab=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];tab.on('pageerror',e=>errors.push(e.message));
  await tab.goto(site);
  await tab.locator('#login-email').fill(email);
  await tab.locator('#login-password').fill(password);
  await tab.locator('button.auth-submit').click();
  await tab.locator('.auth-screen').waitFor({state:'hidden'});
  await tab.goto(site+'/une/setup/page-builder/'+page);
  await tab.getByRole('button',{name:'Open page routes'}).click();
  const modal=tab.getByRole('dialog',{name:'Page routes'});
  await modal.getByLabel('Alias application').selectOption(app);
  await modal.getByLabel('Alias destination').selectOption(app+':page:'+page);
  await modal.getByLabel('Friendly URL name').fill('my-checkout');
  await modal.getByRole('button',{name:'Create alias'}).click();
  await modal.getByRole('link',{name:'Test alias my-checkout'}).waitFor();
  assert.equal((await req('/routes/resolve/'+app+'/my-checkout',token)).path,canonical);
  await modal.getByRole('button',{name:'Close page routes'}).click();
  for(const [width,height] of [[1440,900],[390,844]]){
    await tab.setViewportSize({width,height});
    await tab.goto(site+'/une/apps/'+app+'/routes/my-checkout');
    await tab.waitForURL('**'+canonical);
    await tab.locator('[data-lightning-page="'+page+'"]').waitFor();
  }
  await tab.setViewportSize({width:1440,height:900});
  await tab.goto(site+'/une/setup/page-builder/'+page);
  await tab.getByRole('button',{name:'Open page routes'}).click();
  const aliasRow=tab.getByRole('table',{name:'Route aliases'})
    .getByRole('row').filter({hasText:'my-checkout'});
  await aliasRow.getByRole('button',{name:'Disable'}).click();
  // React starts the async DELETE on click; wait until the saved SQL revision
  // has been fetched and displayed before asserting the server's 404.
  await aliasRow.getByText('Disabled · v2',{exact:false}).waitFor();
  await req('/routes/resolve/'+app+'/my-checkout',token,'GET',undefined,404);
  const statuses=await pool.query('SELECT status FROM md_route_alias_revisions WHERE tenant_id=$1 AND slug=$2 ORDER BY version',
    ['md09-alias-test','my-checkout']);
  assert.deepEqual(statuses.rows.map(x=>x.status),['Active','Disabled']);
  assert.deepEqual(errors,[]);
  console.log('MD-09 6B acceptance passed: SQL revisions, tenant isolation, Page Builder, desktop/phone routes, disable.');
}finally{
  if(browser)await browser.close();
  for(const service of children)if(service.child.exitCode===null)service.child.kill('SIGTERM');
  await pool.end();
  rmSync(tmp,{recursive:true,force:true});
}
