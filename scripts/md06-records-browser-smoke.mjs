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
async function ready(url, serviceProcess, label) {
  let lastResponse = 'none';
  for(let i=0;i<150;i++){
    if(serviceProcess.child.exitCode!==null) throw Error(label+' exited: '+serviceProcess.logs());
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(600)});
      lastResponse='HTTP '+response.status+' at '+response.url;
      if(response.ok)return;
      if(response.status>=500) {
        lastResponse+=' '+(await response.text()).slice(0,500);
        throw Error(label+' responded with HTTP error: '+lastResponse+' '+serviceProcess.logs());
      }
    } catch(error) {
      lastResponse=String(error instanceof Error ? error.message : error);
      if(lastResponse.includes('responded with HTTP error')) throw error;
    }
    await pause(200);
  }
  throw Error(label+' startup timed out; last response: '+lastResponse+' logs: '+serviceProcess.logs());
}
try {
  const server=service(process.execPath,['apps/server/dist/index.js'],{
    DATABASE_URL:'', METADRIVE_TEST_MODE:'true', METADRIVE_DATA_PATH:join(temp,'records.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID:'md06-browser',
    METADRIVE_BOOTSTRAP_TENANT_NAME:'Module Six Browser',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:login.email,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:login.password,
    METADRIVE_SCHEDULE_POLL_MS:'3600000', NODE_ENV:'test', PORT:'3001',
    WEB_ORIGIN:'http://127.0.0.1:5173'
  });
  const web=service(process.execPath,['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5173'],{
    VITE_API_BASE_URL:'http://127.0.0.1:3001/api'
  });
  await Promise.all([ready('http://127.0.0.1:3001/health',server,'API'),ready('http://127.0.0.1:5173/',web,'Vite')]);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true});
  page.setDefaultTimeout(25000);
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.goto('http://127.0.0.1:5173/une/login');
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  await page.locator('button.auth-submit').click();
  await page.locator('.auth-screen').waitFor({state:'hidden'});
  await page.goto('http://127.0.0.1:5173/une/o/Account/list?filterName=AllAccounts&appId=Records');
  const list=page.locator('.records-list-card');
  await list.waitFor({state:'visible'});
  // New tenants may contain zero Account rows, in which case the list has no
  // table headers until the first record is persisted. Exercise creation first.
  const newButton=list.getByRole('button',{name:'New',exact:true});
  await newButton.click();
  const dialog=page.getByRole('dialog',{name:/New Account/});
  await dialog.waitFor({state:'visible'});
  await dialog.locator('input[name="Name"]').fill('MD06 Browser Acceptance Account');
  const saveResponses=[];
  page.on('response', response => {
    if(response.url().includes('/api/records/Account') && response.status()>=400)
      saveResponses.push(response.status()+' '+response.url());
  });
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  try {
    await dialog.waitFor({state:'hidden',timeout:9000});
  } catch(error) {
    throw Error('New Account did not save. API errors: '+JSON.stringify(saveResponses)+
      '; form: '+(await dialog.innerText()).slice(-1800)+
      '; page alerts: '+JSON.stringify(await page.locator('[role="alert"]').allTextContents()),{cause:error});
  }
  try {
    await page.locator('.record-detail-heading').waitFor({state:'visible',timeout:8000});
  } catch(error) {
    throw Error('Record created, but detail page not ready. URL: '+page.url()+
      '; body: '+(await page.locator('body').innerText()).slice(-2300)+
      '; errors: '+JSON.stringify(pageErrors),{cause:error});
  }
  await page.goto('http://127.0.0.1:5173/une/o/Account/list?filterName=AllAccounts&appId=Records');
  await list.waitFor({state:'visible'});
  // Record search is now a dedicated topbar control, not a duplicated list field.
  const search=page.getByRole('searchbox',{name:/Search Accounts records/i});
  const global=page.getByRole('searchbox',{name:'Global search across objects'});
  if(await list.locator('.records-search').count()) throw Error('Duplicate record search must not appear in list');
  await global.fill('Unrelated global query');
  if(await search.inputValue()) throw Error('Global search must not populate the record search');
  await search.fill('MD06 Browser Acceptance Account');
  if(await global.inputValue()!=='Unrelated global query') throw Error('Record search changed the global search');
  await list.getByText('MD06 Browser Acceptance Account',{exact:false}).first().waitFor({state:'visible'});
  // Await the asynchronous metadata/record response rather than asserting
  // immediately after route rendering.
  const headers=list.getByRole('button',{name:/Sort by /});
  await headers.first().waitFor({state:'visible'});
  await headers.first().click();
  await list.locator('th[aria-sort="ascending"]').first().waitFor({state:'visible'});
  await headers.first().click();
  await list.locator('th[aria-sort="descending"]').first().waitFor({state:'visible'});
  await search.fill('MD06-MISSING-XYZ-587290');
  await list.getByText('No records match', {exact:false}).waitFor({state:'visible'});
  await search.fill('MD06 Browser Acceptance Account');
  await list.getByText('MD06 Browser Acceptance Account',{exact:false}).first().waitFor({state:'visible'});
  const downloadTask=page.waitForEvent('download');
  await list.getByRole('button',{name:'Export CSV'}).click();
  const download=await downloadTask;
  if(!download.suggestedFilename().endsWith('.csv'))throw Error('Record CSV export failed');
  // End-to-end offline RBAC revocation: a record is drafted with permission,
  // an admin removes Create while disconnected, and sync MUST retain a 403.
  const apiUrl='http://127.0.0.1:3001/api';
  const adminLogin=await fetch(apiUrl+'/auth/login',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(login)
  });
  if(!adminLogin.ok) throw Error('Unable to establish synthetic admin control session');
  const adminJwt=(await adminLogin.json()).access_token;
  const adminApi=async(path,method='GET',body)=>{
    const response=await fetch(apiUrl+path,{
      method,
      headers:{authorization:'Bearer '+adminJwt,...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    return {status:response.status,data:await response.json()};
  };
  const offlineName='MD06 Offline Permission Revoked Draft';
  await page.context().setOffline(true);
  await newButton.click();
  await dialog.waitFor({state:'visible'});
  await dialog.locator('input[name="Name"]').fill(offlineName);
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  const offlinePanel=page.getByRole('region',{name:'Offline record changes'});
  await offlinePanel.getByText('Pending sync').waitFor({state:'visible'});
  const originalAcl=await adminApi('/metadata/permissions');
  if(originalAcl.status!==200)throw Error('Cannot inspect synthetic RBAC state');
  const lockedAcl=structuredClone(originalAcl.data);
  for(const grant of [...lockedAcl.profiles,...lockedAcl.permissionSets]){
    const current=grant.objectPermissions?.Account;
    if(current)grant.objectPermissions.Account={...current,create:false};
  }
  const revoke=await adminApi('/metadata/permissions','PUT',lockedAcl);
  if(revoke.status!==200)throw Error('Cannot remove synthetic Account Create grant: '+JSON.stringify(revoke.data));
  await page.context().setOffline(false);
  await offlinePanel.getByText('Sync rejected').waitFor({state:'visible',timeout:15000});
  const deniedRecord=await adminApi('/records/Account?search='+encodeURIComponent(offlineName));
  if(deniedRecord.status!==200 || deniedRecord.data.records.some(item=>item.Name===offlineName))
    throw Error('A permission-revoked offline Account was incorrectly committed');
  const restored=await adminApi('/metadata/permissions','PUT',originalAcl.data);
  if(restored.status!==200)throw Error('Cannot restore synthetic RBAC fixture');
  // Wait for the rejected sync to release its in-flight guard before retrying.
  await offlinePanel.getByRole('button',{name:'Sync pending'}).waitFor({state:'visible',timeout:15000});
  await offlinePanel.getByRole('button',{name:'Retry after review'}).click();
  await offlinePanel.waitFor({state:'hidden',timeout:15000});
  // Offline queue removal is asynchronous to records-list refresh: poll the
  // independently authenticated server until the successful write is visible.
  let syncedRecord;
  for(let attempt=0;attempt<20;attempt++){
    syncedRecord=await adminApi('/records/Account?search='+encodeURIComponent(offlineName));
    if(syncedRecord.status===200 && syncedRecord.data.records.some(item=>item.Name===offlineName)) break;
    await pause(250);
  }
  if(syncedRecord.status!==200 || !syncedRecord.data.records.some(item=>item.Name===offlineName))
    throw Error('Explicit retry did not synchronise a restored-permission offline draft. Last server response: '+
      JSON.stringify(syncedRecord).slice(0,1200));
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
