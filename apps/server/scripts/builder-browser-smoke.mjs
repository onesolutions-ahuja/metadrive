import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
const built=new URL('../dist-system/system-files/',import.meta.url);
const support=new URL('../dist-system/system-support/',import.meta.url);
const [{SqlPersistence},{AuthenticationService},{createSystemServer}]=await Promise.all([
 import(new URL('sql-persistence.js',built).href),
 import(new URL('authentication.js',built).href),
 import(new URL('server.js',support).href)
]);

const url=process.env.METADRIVE_SQL_TEST_DATABASE_URL;
if(!url)throw new Error('SQL test database is required');
const db=new SqlPersistence(url);
const api=createSystemServer(db),listener=api.listen(0,'127.0.0.1');
let frontend,browser,page;
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
 await db.query("INSERT INTO md_object_definitions(tenant_id,api_name,label) VALUES($1,'ReviewCase','Review Case')",
  [tenantId]);
 const reviewCase=await db.query(`
  INSERT INTO md_records(tenant_id,object_api,owner_id)
  VALUES($1,'ReviewCase',$2) RETURNING id
 `,[tenantId,userId]);
 const caseId=reviewCase.rows[0].id;

 // Create lifecycle fixture before the browser authenticates and caches landing metadata.
 const {ObjectDefinitionService:EarlyObjectDefinition}=await import(new URL('object-definition.js',built).href);
 const EarlyRecordEngine=(await import(new URL('record-engine.js',built).href)).RecordEngine;
 const EarlyRbacEngine=(await import(new URL('rbac-engine.js',built).href)).RbacEngine;
 const recycleDefinition=await new EarlyObjectDefinition(db).create(tenantId,'BrowserRecycle__c',
  'Browser Recycle',[{apiName:'Name',label:'Name',dataType:'Text(80)',required:true}]);
 assert.ok(recycleDefinition);
 await db.query(`INSERT INTO md_object_actions
   (tenant_id,object_api,action_id,label,action_type,enabled,sort_order)
   VALUES($1,'BrowserRecycle__c','Delete','Delete','Standard',true,0)
   ON CONFLICT(tenant_id,object_api,action_id) DO NOTHING`,[tenantId]);
 const recycleSetup=new EarlyRecordEngine(db,new EarlyRbacEngine(db));
 const recycleId=await recycleSetup.create(tenantId,userId,'BrowserRecycle__c',{Name:'Browser recovery test'});
 await recycleSetup.remove(tenantId,userId,'BrowserRecycle__c',recycleId);

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
 await context.addCookies([{name:'md_refresh',value:tokens.refreshToken,domain:'127.0.0.1',path:'/api/auth',
  httpOnly:true,sameSite:'Lax'}]);
 page=await context.newPage();
 const failures=[];
 page.on('pageerror',error=>{console.error('Browser JS exception:',error.stack??error.message);failures.push(error.message);});
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
  const history=await request('/metadata/flow-history?status=completed&limit=10');
  if(history.code!==200||!Array.isArray(history.json.runs)
    ||!history.json.runs.some(run=>run.flowApiName===name&&run.status==='completed'
      &&Number.isFinite(run.durationMs)))
    return {failed:'Flow history',history};
  const debug=await request('/flows/'+name+'/debug',{method:'POST',body:'{}'});
  if(debug.code!==200||debug.json.dryRun!==true||debug.json.status!=='waiting'
    ||!Array.isArray(debug.json.debugTrace)
    ||!debug.json.debugTrace.every(step=>typeof step.durationMs==='number'
      &&step.variables!==undefined))
    return {failed:'Flow debug trace',debug};
  const deleted=await request('/metadata/flows/'+name,{method:'DELETE'});
  return {saved:saved.code,started:started.code,completed:pending.code,
   history:history.code,debug:debug.code,archived:deleted.code};
 },{token:tokens.accessToken});
 assert.deepEqual(status,{saved:200,started:200,completed:200,history:200,debug:200,archived:204},
  'Real browser builder save/Screen Flow API check: '+JSON.stringify(status));


 // P0: exercise the actual SQL/HTTP contracts with a least-privilege kiosk user.
 await db.query("INSERT INTO md_users(tenant_id,email,password_hash) VALUES($1,$2,$3)",[
   tenantId,'kiosk-device@example.invalid',hash]);
 const kioskTokens=await new AuthenticationService(db).signIn(
   tenantId,'kiosk-device@example.invalid',password);
 const http=async(token,path,method='GET',body)=>{
   const response=await fetch('http://127.0.0.1:'+apiPort+'/api'+path,{
     method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     ...(body?{body:JSON.stringify(body)}:{})
   });
   return {status:response.status,data:await response.json().catch(()=>({}))};
 };
 assert.equal((await http(kioskTokens.accessToken,'/metadata/permissions')).status,403,
   'Restricted kiosk actor accessed tenant administration');
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9SQCQAAAAASUVORK5CYII=';
 const media=await http(tokens.accessToken,'/media-assets','POST',{
   name:'demo-brand.png',contentType:'image/png',contentBase64:png
 });
 assert.equal(media.status,201,'Tenant asset upload failed: '+JSON.stringify(media));
 assert.ok(/^asset:[0-9a-f-]{36}$/i.test(media.data.assetRef));
 const loadedAsset=await http(tokens.accessToken,'/media-assets/'+media.data.id);
 assert.equal(loadedAsset.status,200,'Tenant asset retrieval failed');
 assert.equal(loadedAsset.data.contentBase64,png);
 assert.equal((await http(kioskTokens.accessToken,'/media-assets/'+media.data.id)).status,403,
   'Kiosk actor read private media without Files permission');
 const checkoutApi='P0CheckoutReplay';
 const graph={apiName:checkoutApi,label:'P0 Checkout Replay',flowType:'Autolaunched Flow',
   status:'Active',triggerObject:null,startConfig:{},tests:[],versions:[],
   resources:[{name:'requestId',label:'Request ID',type:'Variable',dataType:'Text',
     isCollection:false,availableForInput:true,availableForOutput:true,value:''}],
   elements:[{id:1,type:'Start',label:'Start',config:{}},
     {id:2,type:'End',label:'End',config:{}}],
   connectors:[{id:'s',from:1,to:2,kind:'normal',label:'Next'}]};
 const savedCheckout=await http(tokens.accessToken,'/metadata/flows/'+checkoutApi,'PUT',graph);
 assert.equal(savedCheckout.status,200,'Idempotent Flow metadata save failed: '+JSON.stringify(savedCheckout));
 const requestId='00000000-0000-4000-8000-000000000999';
 const initial=await http(tokens.accessToken,'/flows/'+checkoutApi+'/execute','POST',{requestId});
 assert.equal(initial.status,200,'First checkout execution failed: '+JSON.stringify(initial));
 const replay=await http(tokens.accessToken,'/flows/'+checkoutApi+'/execute','POST',{requestId});
 assert.equal(replay.status,200,'Checkout replay failed: '+JSON.stringify(replay));
 const result=await db.query(`
   SELECT count(*)::int AS count FROM md_flow_runs r
   JOIN md_flow_definitions f ON f.tenant_id=r.tenant_id AND f.id=r.flow_id
   WHERE f.tenant_id=$1 AND f.api_name=$2`,[tenantId,checkoutApi]);
 assert.equal(result.rows[0]?.count,1,'Duplicate checkout request created a second Flow run');
 const mismatch=await http(tokens.accessToken,'/flows/'+checkoutApi+'/execute','POST',
   {requestId,ChangedPrice:199});
 assert.ok(mismatch.status>=400,'Replayed checkout request accepted altered inputs');
 await http(tokens.accessToken,'/metadata/flows/'+checkoutApi,'DELETE');
 console.info('P0 SQL media, restricted kiosk RBAC and idempotent Flow replay verified');

 const choicesResult=await page.evaluate(async token=>{
   const request=async(path,init={})=>{
     const response=await fetch('/api'+path,{
       ...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...init.headers}
     });
     return {code:response.status,body:await response.json().catch(()=>({}))};
   };
   const api='BrowserChoiceSetFlow';
   const graph={apiName:api,label:'Browser Choice Set Flow',flowType:'Screen Flow',
    status:'Active',triggerObject:null,startConfig:{},tests:[],versions:[],
    resources:[{name:'MealChoices',label:'Meal Choices',type:'Choice Set',dataType:'Text',
     isCollection:false,availableForInput:false,availableForOutput:false,value:'Burger\nWrap'}],
    elements:[{id:1,type:'Start',label:'Start',config:{}},
     {id:2,type:'Screen',label:'Choose',config:{fields:[{
       apiName:'Meal',label:'Meal',type:'Picklist',required:true,choiceSetResource:'MealChoices'
     }]}},{id:3,type:'End',label:'End',config:{}}],
    connectors:[{id:'a',from:1,to:2,kind:'normal',label:'Default'},
     {id:'b',from:2,to:3,kind:'normal',label:'Next'}]};
   const saved=await request('/metadata/flows/'+api,{method:'PUT',body:JSON.stringify(graph)});
   if(saved.code!==200)return {failed:'Choice Set save',saved};
   const badInterview=await request('/flows/'+api+'/execute',{method:'POST',body:'{}'});
   if(badInterview.code!==200)return {failed:'Choice Set launch',badInterview};
   const choices=badInterview.body.screen?.config?.fields?.[0]?.choices;
   if(!Array.isArray(choices)||choices.join('|')!=='Burger|Wrap')
     return {failed:'Choice Set hydration',choices,badInterview};
   const invalid=await request('/flow-interviews/'+badInterview.body.interviewId+'/next',{
     method:'POST',body:JSON.stringify({values:{Meal:'Not a valid meal'}})});
   if(invalid.code===200)return {failed:'Choice Set invalid-value rejection',invalid};
   const goodInterview=await request('/flows/'+api+'/execute',{method:'POST',body:'{}'});
   if(goodInterview.code!==200)return {failed:'Choice Set second launch',goodInterview};
   const valid=await request('/flow-interviews/'+goodInterview.body.interviewId+'/next',{
     method:'POST',body:JSON.stringify({values:{Meal:'Burger'}})});
   if(valid.code!==200||valid.body.completed!==true)
     return {failed:'Choice Set selected value',valid};
   const deleted=await request('/metadata/flows/'+api,{method:'DELETE'});
   return {saved:saved.code,invalid:invalid.code,completed:valid.code,deleted:deleted.code};
 },tokens.accessToken);
 assert.deepEqual(choicesResult,{saved:200,invalid:400,completed:200,deleted:204},
   'Browser SQL Choice Set runtime contract: '+JSON.stringify(choicesResult));

 // Phase 5: SQL-backed approval stage goes from active Flow to waiting and
 // atomically queues one resume after a human decision; no browser polling timer.
 const orchestration=await page.evaluate(async({token,caseId,userId})=>{
   const request=async(path,init={})=>{
     const response=await fetch('/api'+path,{
       ...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...init.headers}
     });
     return {code:response.status,body:await response.json().catch(()=>({}))};
   };
   const api='BrowserApprovalFlow';
   const graph={apiName:api,label:'Browser Approval Flow',flowType:'Flow Orchestration',
    status:'Active',triggerObject:null,startConfig:{},tests:[],versions:[],resources:[],
    elements:[
     {id:1,type:'Start',label:'Start',config:{}},
     {id:2,type:'Orchestration Stage',label:'Manager Approval',config:{
       objectApiName:'ReviewCase',recordId:caseId,approverIds:userId,
       approvalMode:'ANY',comments:'Approval requested in browser contract test'
     }},
     {id:3,type:'End',label:'End',config:{}}
    ],
    connectors:[
     {id:'start',from:1,to:2,kind:'normal',label:''},
     {id:'approved',from:2,to:3,kind:'normal',label:'Approved'},
     {id:'rejected',from:2,to:3,kind:'normal',label:'Rejected'}
    ]};
   const saved=await request('/metadata/flows/'+api,{method:'PUT',body:JSON.stringify(graph)});
   if(saved.code!==200)return {failed:'Orchestration save',saved};
   const started=await request('/flows/'+api+'/execute',{method:'POST',body:'{}'});
   if(started.code!==200||started.body.status!=='waiting')
     return {failed:'Orchestration pause',started};
   const pending=await request('/metadata/flow-interviews');
   if(pending.code!==200||!pending.body.interviews.some(item=>
     item.id===started.body.interviewId&&item.kind==='orchestration'))
     return {failed:'Orchestration pending work',pending,started};
   const inbox=await request('/approvals/inbox');
   const approval=inbox.body.requests?.find(item=>item.flowApiName===api);
   if(inbox.code!==200||!approval)return {failed:'Orchestration approval inbox',inbox};
   const decision=await request('/approvals/'+approval.id+'/decision',{
     method:'POST',body:JSON.stringify({decision:'Approved',comments:'Accepted'})});
   if(decision.code!==200)return {failed:'Orchestration decision',decision};
   const second=await request('/approvals/'+approval.id+'/decision',{
     method:'POST',body:JSON.stringify({decision:'Rejected'})});
   if(second.code===200)return {failed:'Approval accepted twice',second};
   return {saved:saved.code,started:started.code,decision:decision.code,
     interviewId:started.body.interviewId,api};
 },{token:tokens.accessToken,caseId,userId});
 assert.ok(!orchestration.failed,'Browser orchestration: '+JSON.stringify(orchestration));
 const queued=await db.query(`
   SELECT j.id FROM md_durable_jobs j
   WHERE j.tenant_id=$1 AND j.resource_id=$2 AND j.job_type='flow.resume' AND j.status='queued'
 `,[tenantId,orchestration.interviewId]);
 assert.equal(queued.rows.length,1,'Human approval did not queue exactly one durable resume');
 const {FlowRuntime}=await import(new URL('flow-runtime.js',built).href);
 const {RbacEngine}=await import(new URL('rbac-engine.js',built).href);
 const {RecordEngine}=await import(new URL('record-engine.js',built).href);
 const rbac=new RbacEngine(db);
 const resumed=await new FlowRuntime(db,rbac,new RecordEngine(db,rbac))
   .resumeWaitingInterview(tenantId,userId,orchestration.interviewId,1);
 assert.equal(resumed.status,'completed','Approval decision did not resume the published Flow');
 const completed=await db.query(
   'SELECT status FROM md_flow_runs WHERE tenant_id=$1 AND id=$2',
   [tenantId,orchestration.interviewId]);
 assert.equal(completed.rows[0].status,'completed');



 // Phase 1: confirm SQL metadata and the actual no-code browser controls agree.
 const capabilities=await page.evaluate(async(token)=>{
   const response=await fetch('/api/metadata/flow-capabilities',{
     headers:{Authorization:'Bearer '+token}
   });
   return {status:response.status,body:await response.json()};
 },tokens.accessToken);
 assert.equal(capabilities.status,200,'Flow capability endpoint denied the builder');
 for(const flowType of ['Record-Triggered Flow','Schedule-Triggered Flow',
   'Platform Event-Triggered Flow'])
   assert.ok(capabilities.body.flowTypes.some(type=>type.type===flowType&&type.createEnabled),
     'Missing browser Flow type: '+flowType);
 for(const elementType of ['Get Records','Update Records','Delete Records','Subflow',
   'Collection Filter','Collection Sort','Transform','Publish Platform Event']){
   const element=capabilities.body.elements.find(item=>item.type===elementType);
   assert.ok(element?.builderEnabled&&element.builderFlowTypes.includes('Autolaunched Flow'),
     'Missing builder capability: '+elementType);
   const readOnly=['Get Records','Loop','Collection Filter','Collection Sort','Transform'];
   assert.equal(element.beforeSaveAllowed,readOnly.includes(elementType),
     'Incorrect before-save data-action gate: '+elementType);
 }
 await page.getByRole('button',{name:/Autolaunched Flow/}).first().click();
 await page.locator('#flow-start-label').fill('Phase One Browser Test');
 await page.getByRole('button',{name:'Create Flow',exact:true}).click();
 await page.locator('.flow-element-option').filter({hasText:'Get Records'}).waitFor();
 for(const elementType of ['Get Records','Update Records','Delete Records','Subflow',
   'Collection Filter','Collection Sort','Transform','Publish Platform Event'])
   assert.equal(await page.locator('.flow-element-option').filter({hasText:elementType}).count(),1,
     'Missing browser toolbox entry: '+elementType);
 await page.locator('.flow-element-option').filter({hasText:'Get Records'}).click();
 await page.getByText('Filter Records',{exact:true}).waitFor();
 const flowEditor=await page.evaluate(()=>document.querySelector('.flow-settings')?.textContent??'');
 assert.ok(flowEditor.includes('How Many Records to Store')&&flowEditor.includes('Filter Records'),
   'Get Records browser configuration is incomplete');

 // Phase 4: graph editing is an actual browser workflow, not merely toolbar decoration.
 await page.getByRole('button',{name:/Review graph/}).click();
 await page.getByRole('region',{name:'Flow graph review'}).waitFor();
 const beforeGraphNodes=await page.locator('.flow-graph-node').count();
 assert.ok(beforeGraphNodes>=3,'A new Flow must show connected graph nodes');
 const assignment=page.locator('.flow-element-option').filter({hasText:'Assignment'});
 await assignment.dragTo(page.locator('.flow-edge-insert').first());
 assert.equal(await page.locator('.flow-graph-node').count(),beforeGraphNodes+1,
   'Dragging an element onto a branch did not split the connector');
 await page.getByRole('button',{name:'Duplicate selected element'}).click();
 assert.equal(await page.locator('.flow-graph-node').count(),beforeGraphNodes+2,
   'Duplicating a selected graph element did not create a connected copy');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 assert.equal(await page.locator('.flow-graph-node').count(),beforeGraphNodes+1,
   'Undo did not restore prior graph metadata');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 assert.equal(await page.locator('.flow-graph-node').count(),beforeGraphNodes+2,
   'Redo did not reapply graph metadata');
 const pathTargets=await page.locator('.flow-edge-insert').count();
 assert.ok(pathTargets>=3,'Connectors must expose accessible insertion targets');

 const pageStatus=await page.evaluate(async ({token})=>{
  const payload={apiName:'BrowserPage',label:'Browser Page',targetObject:'',
   pageType:'Home Page',layoutMode:'free-canvas',canvasWidth:1280,canvasHeight:900,
   status:'Draft',devices:['Desktop'],components:[],activationAssignments:[]};
  const http=async(path,method='GET',body)=>{
   const result=await fetch('/api'+path,{
    method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
   });
   return {status:result.status,content:result.status===204?null:await result.json().catch(()=>null)};
  };
  const saved=await http('/metadata/pages/BrowserPage','PUT',payload);
  const loaded=await http('/metadata/pages/BrowserPage');
  const deleted=await http('/metadata/pages/BrowserPage','DELETE');
  return {save:saved.status,load:loaded.status,delete:deleted.status,
   label:loaded.content?.page?.label??loaded.content?.label};
 },{token:tokens.accessToken});
 assert.equal(pageStatus.save,200,'Page Builder SQL save failed: '+JSON.stringify(pageStatus));
 assert.equal(pageStatus.load,200,'Page Builder SQL load failed: '+JSON.stringify(pageStatus));
 assert.equal(pageStatus.delete,204,'Page Builder SQL archive failed: '+JSON.stringify(pageStatus));
 await page.goto(origin+'/une/setup/page-builder',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1100);
 const {mkdir}=await import('node:fs/promises');
 await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../artifacts/page-builder.png',import.meta.url).pathname});
 await page.goto(origin+'/une/setup/flow-builder',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(800);
 await page.screenshot({path:new URL('../artifacts/flow-builder.png',import.meta.url).pathname});
 // Exercise the actual permission-editor Save button, refresh and SQL round-trip.
 await page.goto(origin+'/une/setup/rbac',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Profiles',exact:true}).click();
 await page.getByRole('button',{name:'New Profile',exact:true}).click();
 await page.getByLabel('Label',{exact:true}).fill('Browser Cashier Profile');
 await page.getByLabel('API Name',{exact:true}).fill('BrowserCashierProfile');
 const savedProfile=page.waitForResponse(r=>r.url().endsWith('/api/metadata/permissions')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 const profileResponse=await savedProfile;
 assert.equal(profileResponse.status(),200,await profileResponse.text());
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Profiles',exact:true}).click();
 await page.getByRole('button',{name:/Browser Cashier Profile/}).click();
 assert.equal(await page.getByLabel('Label',{exact:true}).inputValue(),'Browser Cashier Profile');
 const sqlProfile=await db.query('SELECT label FROM md_profiles WHERE tenant_id=$1 AND api_name=$2',[tenantId,'BrowserCashierProfile']);
 assert.equal(sqlProfile.rows[0]?.label,'Browser Cashier Profile');
 await page.getByRole('button',{name:'Permission Sets',exact:true}).click();
 await page.getByRole('button',{name:'New Permission Set',exact:true}).click();
 await page.getByLabel('Label',{exact:true}).fill('Browser Cashier Set');
 await page.getByLabel('API Name',{exact:true}).fill('BrowserCashierSet');
 await page.getByLabel('Description',{exact:true}).fill('Saved from the real browser');
 const savedSet=page.waitForResponse(r=>r.url().endsWith('/api/metadata/permissions')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 const setResponse=await savedSet;
 assert.equal(setResponse.status(),200,await setResponse.text());
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Permission Sets',exact:true}).click();
 await page.getByRole('button',{name:/Browser Cashier Set/}).click();
 assert.equal(await page.getByLabel('Description',{exact:true}).inputValue(),'Saved from the real browser');
 await page.screenshot({path:new URL('../artifacts/rbac-editor.png',import.meta.url).pathname});
 console.info('RBAC browser Save/refresh/SQL checks passed for profile creation and permission-set metadata');
 // Phase 1: verify the actual Records browser can restore a SQL-tombstoned record
 // and the tenant administrator can publish an audited retention policy.
 const recordEngine=new RecordEngine(db,rbac);
 await page.goto(origin+'/une/o/BrowserRecycle__c/list',{waitUntil:'domcontentloaded'});
 const recycleButton=page.getByRole('button',{name:'Recycle Bin',exact:true});
 await recycleButton.waitFor({state:'visible',timeout:15000});
 await recycleButton.click();
 await page.getByRole('heading',{name:'Browser Recycle Recycle Bin'}).waitFor({timeout:12000});
 await page.getByText(recycleId,{exact:true}).waitFor({timeout:12000});
 await page.getByLabel('Record retention days').fill('30');
 page.once('dialog',dialog=>void dialog.accept());
 const policyResponse=page.waitForResponse(resp=>resp.url().endsWith('/api/recycle-bin/retention')
   &&resp.request().method()==='PUT');
 await page.getByRole('button',{name:'Save Retention'}).click();
 assert.equal((await policyResponse).status(),200,'Browser retention policy save failed');
 assert.equal((await db.query(
  'SELECT retention_days FROM md_record_retention_settings WHERE tenant_id=$1',[tenantId]
 )).rows[0].retention_days,30);
 page.once('dialog',dialog=>void dialog.accept());
 const restoreResponse=page.waitForResponse(resp=>resp.url().endsWith(
  '/api/recycle-bin/records/BrowserRecycle__c/'+recycleId+'/restore'));
 await page.getByRole('button',{name:'Restore',exact:true}).click();
 assert.equal((await restoreResponse).status(),200,'Browser record recovery failed');
 assert.equal((await recordEngine.get(tenantId,userId,'BrowserRecycle__c',recycleId)).Name,
   'Browser recovery test');
 await page.screenshot({path:new URL('../artifacts/recycle-bin.png',import.meta.url).pathname});
 console.info('Browser Recycle Bin and policy editor restore/SQL checks passed');
 // Phase 2: configure a global action without code, publish to tenant SQL,
 // then verify the generic Records browser exposes and routes it.
 await page.goto(origin+'/une/setup/object-manager/BrowserRecycle__c/ButtonsLinksAndActions',
   {waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Global Quick Actions'}).waitFor({timeout:15000});
 await page.getByLabel('New global action name').fill('Browser Global Create');
 await page.getByLabel('Global action target Object').selectOption('BrowserRecycle__c');
 await page.getByRole('button',{name:'Add Global Action'}).click();
 const savedGlobal=page.waitForResponse(res=>res.url().endsWith('/api/metadata/global-actions')
   &&res.request().method()==='PUT');
 await page.getByRole('button',{name:'Save Global Actions'}).click();
 assert.equal((await savedGlobal).status(),200,'Global action browser save failed');
 const globalSql=await db.query(`SELECT action_id,target_object_api FROM md_global_quick_actions
   WHERE tenant_id=$1 AND label='Browser Global Create'`,[tenantId]);
 assert.equal(globalSql.rowCount,1,'Global action did not reach tenant SQL');
 await page.goto(origin+'/une/o/BrowserRecycle__c/list',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Browser Global Create'}).waitFor({timeout:12000});
 await page.getByRole('button',{name:'Browser Global Create'}).click();
 await page.waitForURL(/globalActionId=/);
 assert.ok(page.url().includes('BrowserRecycle__c'),'Global action routed to incorrect Object');
 await page.screenshot({path:new URL('../artifacts/global-quick-action.png',import.meta.url).pathname});
 console.info('Browser global Quick Action creation and runtime navigation passed');
 const severe=failures.filter(message=>/TypeError|Cannot read properties|ReferenceError/i.test(message));
 assert.deepEqual(severe,[],'Browser runtime exceptions: '+severe.join(' | '));
 console.info('Browser UI loaded: Page save/load/archive and Flow save/start/submit/complete/archive passed');
}catch(error){
 if(page){
  console.error('Browser failure URL:',page.url());
  console.error('Browser failure text:',(await page.locator('body').innerText().catch(()=>'' )).slice(0,4000));
  await page.screenshot({path:new URL('../artifacts/rbac-failure.png',import.meta.url).pathname}).catch(()=>{});
 }
 throw error;
}finally{
 if(browser)await browser.close();
 if(frontend){frontend.kill('SIGTERM');}
 if(listener.listening)await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
 await db.close();
}
