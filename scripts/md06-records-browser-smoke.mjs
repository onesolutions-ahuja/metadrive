// Module 6 browser acceptance, disposable local test-mode instance only.
// Never connects to Render, Aiven or a customer account.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'md06-browser-'));
const login = { email:'qa-records@example.test', password:'Synthetic-Records-QA-2026!' };
const children = [];
let browser;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
function service(cmd, args, env) {
  const child = spawn(cmd, args, {cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let output='';
  for(const stream of [child.stdout,child.stderr]) stream.on('data', data => { output=(output+String(data)).slice(-7000); });
  children.push(child);
  return {child,logs:()=>output};
}
async function ready(url, process, label) {
  for(let i=0;i<150;i++){
    if(process.child.exitCode!==null) throw Error(label+' exited: '+process.logs());
    try {const response=await fetch(url,{signal:AbortSignal.timeout(600)});if(response.ok)return;}catch{}
    await pause(200);
  }
  throw Error(label+' startup timed out: '+process.logs());
}
try {
  const server=service(process.execPath,['apps/server/dist/index.js'],{
    DATABASE_URL:'', METADRIVE_TEST_MODE:'true', METADRIVE_DATA_PATH:join(temp,'records.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID:'md06-browser',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'Module Six Browser',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:login.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:login.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000', NODE_ENV:'test', PORT:'3001',
    WEB_ORIGIN:'http://localhost:5173'
  });
  const web=service(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173'],{
    VITE_API_BASE_URL:'http://localhost:3001/api'
  });
  await Promise.all([ready('http://localhost:3001/health',server,'API'),ready('http://localhost:5173/',web,'Vite')]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true});
  page.setDefaultTimeout(25000);
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.goto('http://localhost:5173/');
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({state:'hidden'});
  await page.goto('http://localhost:5173/une/o/Account/list?filterName=AllAccounts&appId=Records');
  const list=page.locator('.records-list-card');
  await list.waitFor({state:'visible'});
  const headers=list.getByRole('button',{name:/Sort by /});
  if(await headers.count()===0) throw Error('Metadata-driven sortable record columns missing');
  await headers.first().click();
  await list.locator('th[aria-sort="ascending"]').first().waitFor({state:'visible'});
  await headers.first().click();
  await list.locator('th[aria-sort="descending"]').first().waitFor({state:'visible'});
  const search=list.getByRole('textbox',{name:/Search Accounts/i});
  await search.fill('MD06-MISSING-XYZ-587290');
  await list.getByText('No records match', {exact:false}).waitFor({state:'visible'});
  await search.fill('');
  const newButton=list.getByRole('button',{name:'New',exact:true});
  await newButton.click();
  const dialog=page.getByRole('dialog',{name:/New Account/});
  await dialog.waitFor({state:'visible'});
  await dialog.locator('input[name="Name"]').fill('MD06 Browser Acceptance Account');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.record-detail-heading').waitFor({state:'visible'});
  await page.goto('http://localhost:5173/une/o/Account/list?filterName=AllAccounts&appId=Records');
  await list.waitFor({state:'visible'});
  await list.getByRole('textbox',{name:/Search Accounts/i}).fill('MD06 Browser Acceptance Account');
  await list.getByText('MD06 Browser Acceptance Account',{exact:false}).first().waitFor({state:'visible'});
  const downloadTask=page.waitForEvent('download');
  await list.getByRole('button',{name:'Export CSV'}).click();
  const download=await downloadTask;
  if(!download.suggestedFilename().endsWith('.csv'))throw Error('Record CSV export failed');
  if(pageErrors.length)throw Error('Uncaught browser errors: '+pageErrors.join('; '));
  console.log(JSON.stringify({module:'Records & Data Management',browser:'chromium',login:true,
    recordList:true,sorting:true,search:true,create:true,export:true,pageErrors:0,offlineOnly:true}));
} finally {
  if(browser) await browser.close();
  for(const child of children.reverse()){
    if(child.exitCode===null) child.kill('SIGTERM');
  }
  rmSync(temp,{recursive:true,force:true});
}
