import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {applySystemMigrations} from '../../src/system-files/system-migrations.js';
import {TenantProvisioning} from '../../src/system-files/tenant-provisioning.js';
import {createSystemServer} from '../../src/system-files/server.js';
import {base32Decode} from '../../src/system-files/totp-security.js';

const url=process.env.DATABASE_URL;
const isLocal=url&&['localhost','127.0.0.1'].includes(new URL(url).hostname)
 &&new URL(url).pathname.includes('test');
const enabled=process.env.METADRIVE_SQL_E2E==='true'&&isLocal;
test('PostgreSQL tenant, MFA, Flow, Screen interview and Page publishing E2E',
 {skip:!enabled,timeout:120000},async()=>{
 if(!url)throw Error('A local PostgreSQL test URL is required');
 const previousMfa=process.env.METADRIVE_MFA_ENCRYPTION_KEY;
 process.env.METADRIVE_MFA_ENCRYPTION_KEY=Buffer.alloc(32,77).toString('base64');
 const db=new SqlPersistence(url);
 const suffix=randomUUID().replace(/-/g,'').slice(0,12);
 const slug='e2e-'+suffix,email='developer-'+suffix+'@example.test';
 const password='StrongTenantPassword-'+suffix;
 let server:ReturnType<ReturnType<typeof createSystemServer>['listen']>|undefined;
 try{
  const schema=readFileSync(new URL('../../src/system-files/schema.sql',import.meta.url),'utf8');
  await db.query(schema);
  await applySystemMigrations(db);
  await db.verifySchema();
  await new TenantProvisioning(db).provision({
   slug,name:'E2E Tenant',domain:slug+'.test',developerEmail:email,developerPassword:password
  });
  const app=createSystemServer(db);
  server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No local server address');
  const api='http://127.0.0.1:'+address.port+'/api';
  const request=async(path:string,method='GET',body?:unknown,token?:string)=>{
   const response=await fetch(api+path,{method,headers:{
    ...(token?{authorization:'Bearer '+token}:{}),
    'content-type':'application/json'
   },...(body===undefined?{}:{body:JSON.stringify(body)})});
   const result=response.status===204?null:await response.json() as Record<string,any>;
   assert.ok(response.ok,method+' '+path+': HTTP '+response.status+' '+JSON.stringify(result));
   return result;
  };
  const login=async(pwd=password)=>request('/auth/login','POST',{tenantSlug:slug,email,password:pwd});
  let session=await login(),token=String(session?.access_token);
  assert.ok(token&&token!=='undefined');
  const objects=await request('/metadata/objects','GET',undefined,token);
  assert.equal(objects?.objects.length,22);
  const basic={
   apiName:'E2ECheckout',label:'Checkout',flowType:'Autolaunched Flow',status:'Active',
   versionNumber:1,activeVersion:null,triggerObject:null,startConfig:{},resources:[],versions:[],
   elements:[{id:1,type:'Start',label:'Start',config:{}},{id:2,type:'End',label:'End',config:{}}],
   connectors:[{id:'e1',from:1,to:2,label:'Next',kind:'normal'}]
  };
  const published=await request('/metadata/flows/E2ECheckout/publish','POST',basic,token);
  assert.equal(published?.flow.status,'Active');
  const executed=await request('/flows/E2ECheckout/execute','POST',{inputs:{}},token);
  assert.equal(executed?.status,'completed');
  const screen={
   ...basic,apiName:'E2EScreen',label:'Screen Check',flowType:'Screen Flow',
   elements:[basic.elements[0],{id:2,type:'Screen',label:'Choose',config:{title:'Welcome'}},
    {id:3,type:'End',label:'End',config:{}}],
   connectors:[{id:'s1',from:1,to:2,label:'Next',kind:'normal'},
    {id:'s2',from:2,to:3,label:'Next',kind:'normal'}]
  };
  await request('/metadata/flows/E2EScreen/publish','POST',screen,token);
  const interview=await request('/flows/E2EScreen/execute','POST',{inputs:{}},token);
  assert.equal(interview?.screen.type,'Screen');
  const result=await request('/flow-interviews/'+interview?.interviewId+'/next','POST',
   {values:{selection:'yes'}},token);
  assert.equal(result?.completed,true);
  assert.equal(result?.outputs.selection,'yes');
  const tenant=await db.query<{id:string}>('SELECT id FROM md_tenants WHERE slug=$1',[slug]);
  const tenantId=tenant.rows[0].id;
  await db.query(`INSERT INTO md_component_definitions(tenant_id,api_name,renderer_key)
   VALUES($1,'Text','text-renderer') ON CONFLICT DO NOTHING`,[tenantId]);
  const page=await request('/metadata/pages/E2EPage/publish','POST',{
   apiName:'E2EPage',label:'Sample',targetObject:'Product',pageType:'App Page',
   layoutMode:'template',canvasWidth:1024,canvasHeight:768,
   status:'Active',devices:['Desktop'],
   components:[{id:'Heading',type:'Text',label:'Heading',visible:true,
    region:'main',properties:{text:'Hello world'}}]
  },token);
  assert.equal(page?.page.status,'Active');
  const loaded=await request('/metadata/pages/E2EPage','GET',undefined,token);
  assert.equal(loaded?.page.components[0].properties.text,'Hello world');
  // PR #625 regression: exercise the real SQL handlers, not merely route registration.
  const publication=await request('/metadata/offline-publication','GET',undefined,token);
  assert.equal(publication?.publication.verifiedDigest,
    createHash('sha256').update(JSON.stringify(publication.content)).digest('hex'));
  const formula=await request('/metadata/objects/Product/formulas/validate','POST',
    {expression:'@Product.Price * 1.2',returnType:'Number'},token);
  assert.equal(formula?.valid,true);
  const dryRun=await request('/flows/E2ECheckout/debug','POST',{inputs:{}},token);
  assert.equal(dryRun?.dryRun,true);
  assert.equal(dryRun?.debugTrace?.length,2);

  const permissionUpdate=await request('/metadata/permissions','PUT',{
    profiles:[],permissionSets:[{apiName:'E2EReader',label:'E2E Reader',
      objectPermissions:{Product:{read:true,create:false,edit:false,delete:false,
       viewAll:false,modifyAll:false}},fieldPermissions:{},systemPermissions:[]}],
    permissionSetGroups:[],roles:[],users:[],publicGroups:[],queues:[],sharingRules:[],
    sharingSettings:{}
  },token);
  assert.equal(permissionUpdate?.permissionSets?.[0]?.apiName,'E2EReader');
  const persisted=await request('/metadata/permissions','GET',undefined,token);
  assert.ok(persisted?.permissionSets.some((item:{apiName:string})=>item.apiName==='E2EReader'));

  const definition={apiName:'E2ESandbox',label:'E2E Sandbox',description:'A sandboxed React component',
    surfaces:['page'],resize:{defaultWidth:320,defaultHeight:180,minWidth:120,minHeight:60},
    jsxSource:'export default function E2ESandbox(props) { return <div>{props.title}</div>; }',
    cssSource:'div {font-weight:bold}',publicationStatus:'Draft'};
  const draftComponent=await request('/component-library','POST',definition,token);
  assert.equal(draftComponent?.component?.status,'Draft');
  const publishedComponent=await request('/component-library/E2ESandbox/publish','POST',{},token);
  assert.equal(publishedComponent?.component?.status,'Published');
  assert.ok(publishedComponent?.component?.compiledJs);
  const rolledBackComponent=await request('/component-library/E2ESandbox/rollback','POST',
    {version:publishedComponent?.component.version},token);
  assert.ok(rolledBackComponent?.component.version>publishedComponent?.component.version);
  await request('/component-library/E2ESandbox','DELETE',undefined,token);

  const userRows=await db.query<{id:string}>('SELECT id FROM md_users WHERE tenant_id=$1',[tenantId]);
  const accountId=userRows.rows[0].id;
  const smtp=await db.query<{id:string}>(`INSERT INTO md_named_credentials(
    tenant_id,name,label,protocol,base_url,auth_type,header_name,enabled)
    VALUES($1,'E2ESmtp','E2E SMTP','SMTP','smtps://mail.example.invalid:465','Basic','',true)
    RETURNING id`,[tenantId]);
  await db.query(`INSERT INTO md_system_definitions(tenant_id,kind,api_name,label,properties)
    VALUES($1,'dashboards','E2ESummary','E2E Summary',$2::jsonb)`,
    [tenantId,JSON.stringify({apiName:'E2ESummary',status:'Deployed',components:[]})]);
  const sub=await request('/metadata/dashboards/E2ESummary/subscriptions','POST',{
    label:'E2E Reminder',frequency:'Daily',localTime:'09:00',timeZone:'Europe/London',dayOfWeek:null,
    recipientUserIds:[accountId],namedCredentialId:smtp.rows[0].id,fromEmail:'alerts@example.test',
    active:true,saveSnapshots:false
  },token);
  assert.equal(sub?.subscription?.lastRunStatus,'Never');
  const subscriptions=await request('/metadata/dashboards/E2ESummary/subscriptions','GET',undefined,token);
  assert.equal(subscriptions?.subscriptions?.length,1);
  await request('/metadata/dashboards/E2ESummary/subscriptions/'+sub?.subscription.id,'DELETE',undefined,token);

  const enroll=await request('/auth/mfa/enroll','POST',{password},token);
  const totp=(step:number)=>{
   const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(step));
   const h=createHmac('sha1',base32Decode(enroll?.setup_secret)).update(message).digest();
   const offset=h[19]&15;
   const code=(((h[offset]&127)<<24)|(h[offset+1]<<16)|(h[offset+2]<<8)|h[offset+3])%1000000;
   return String(code).padStart(6,'0');
  };
  const counter=Math.floor(Date.now()/30000);
  await request('/auth/mfa/enroll/confirm','POST',
   {enrollment_token:enroll?.enrollment_token,code:totp(counter)},token);
  session=await login();token=String(session?.access_token);
  await request('/auth/mfa/policy','PUT',{mode:'Optional'},token);
  session=await login();
  assert.equal(session?.mfa_required,true);
  const authorized=await request('/auth/mfa/verify','POST',
   {challenge_token:session?.challenge_token,code:totp(counter+1)});
  assert.ok(authorized?.access_token);
 }finally{
  if(server)await new Promise<void>((resolve,reject)=>server!.close(err=>err?reject(err):resolve()));
  await db.close();
  if(previousMfa===undefined)delete process.env.METADRIVE_MFA_ENCRYPTION_KEY;
  else process.env.METADRIVE_MFA_ENCRYPTION_KEY=previousMfa;
 }
});
