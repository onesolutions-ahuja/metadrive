import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
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
