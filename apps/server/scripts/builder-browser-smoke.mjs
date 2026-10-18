import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {SqlPersistence} from '../dist-system/system-files/sql-persistence.js';
import {AuthenticationService} from '../dist-system/system-files/authentication.js';
import {createSystemServer} from '../dist-system/system-support/server.js';

const url=process.env.METADRIVE_SQL_TEST_DATABASE_URL;
if(!url)throw new Error('SQL test database is required');
const db=new SqlPersistence(url);
const api=createSystemServer(db),listener=api.listen(0,'127.0.0.1');
let frontend,browser;
try{
 if(!listener.listening)await once(listener,'listening');
 const apiPort=listener.address().port;
 const password='BrowserTestPassphrase!2026';
 const hash=await new AuthenticationService(db).hashPassword(password);
 const tenant=await db.query("INSERT INTO md_tenants(slug,name) VALUES($1,$2) RETURNING id",
  ['builder-browser-smoke','Builder Browser Smoke']);
 const tenantId=tenant.rows[0].id;
 const user=await db.query("INSERT INTO md_users(tenant_id,email,password_hash) VALUES($1,$2,$3) RETURNING id",
  [tenantId,'developer@example.invalid',hash]);
 const userId=user.rows[0].id;
 await db.query('INSERT INTO md_tenant_domains(domain,tenant_id) VALUES($1,$2)',[
  '127.0.0.1',tenantId]);
 const set=await db.query("INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,'BuilderE2E') RETURNING id",[tenantId]);
 await db.query('INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id) VALUES($1,$2,$3)',
  [tenantId,userId,set.rows[0].id]);
 await db.query("INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,'*','*','allow')",
  [tenantId,set.rows[0].id]);
 const tokens=await new AuthenticationService(db).signIn(tenantId,'developer@example.invalid',password);
 frontend=spawn('npm',['run','dev','--workspace','apps/web','--','--host','127.0.0.1','--port','4173'],{
  cwd:new URL('../../../',import.meta.url).pathname,
  env:{...process.env,METADRIVE_API_PROXY_TARGET:'http://127.0.0.1:'+apiPort},
  stdio:'ignore'
 });
 const origin='http://127.0.0.1:4173';
 let ready=false;
 for(let attempt=0;attempt<50;attempt++){
  try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(!ready)throw new Error('Vite test frontend did not start');
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addCookies([{name:'md_refresh',value:tokens.refreshToken,url:origin+'/api/auth/refresh',
  httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 const failures=[];
 page.on('pageerror',error=>failures.push(error.message));
 await page.goto(origin+'/une/setup/flow-builder',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1100);
 const title=await page.title();
 assert.ok(title.length>0,'UI document failed to mount');
 const status=await page.evaluate(async ({token})=>{
  const request=async (path,init={})=>{
   const response=await fetch('/api'+path,{
    ...init,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...init.headers}
   });
   const json=await response.json().catch(()=>({}));
   return {code:response.status,json};
  };
  const name='BrowserScreenFlow';
  const graph={apiName:name,label:'Browser Screen Flow',flowType:'Screen Flow',
   status:'Active',triggerObject:null,startConfig:{},resources:[],tests:[],versions:[],
   elements:[
    {id:1,type:'Start',label:'Start',config:{}},
    {id:2,type:'Screen',label:'Welcome',config:{fields:[{apiName:'Accepted',type:'Checkbox',label:'Accept',required:true}]}},
    {id:3,type:'End',label:'End',config:{}}
   ],connectors:[
    {id:'a',from:1,to:2,kind:'normal',label:'default'},
    {id:'b',from:2,to:3,kind:'normal',label:'Next'}
   ]};
  const saved=await request('/metadata/flows/'+name,{method:'PUT',body:JSON.stringify(graph)});
  if(saved.code!==200)return {failed:'Save',saved};
  const started=await request('/flows/'+name+'/execute',{method:'POST',body:'{}'});
  if(started.code!==200||started.json.screen?.id!==2)
   return {failed:'Start',started};
  const pending=await request('/flow-interviews/'+started.json.interviewId+'/next',{
   method:'POST',body:JSON.stringify({values:{Accepted:true}})});
  if(pending.code!==200||pending.json.completed!==true)
   return {failed:'Complete',pending};
  const deleted=await request('/metadata/flows/'+name,{method:'DELETE'});
  return {saved:saved.code,started:started.code,completed:pending.code,
   archived:deleted.code};
 },{token:tokens.accessToken});
 assert.deepEqual(status,{saved:200,started:200,completed:200,archived:204},
  'Real browser builder save/Screen Flow API check: '+JSON.stringify(status));
 const severe=failures.filter(message=>/TypeError|Cannot read properties|ReferenceError/i.test(message));
 assert.deepEqual(severe,[],'Browser runtime exceptions: '+severe.join(' | '));
 console.info('Browser UI loaded and SQL Flow save, start, screen submit, completion, archive passed');
}finally{
 if(browser)await browser.close();
 if(frontend){frontend.kill('SIGTERM');}
 if(listener.listening)await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
 await db.close();
}
