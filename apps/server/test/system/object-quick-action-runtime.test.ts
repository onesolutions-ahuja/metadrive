import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ObjectQuickActionRuntime} from '../../src/system-support/object-quick-action-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import type {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {RecordCollaborationService} from '../../src/system-support/record-collaboration-service.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';

const tenant='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const parent='00000000-0000-4000-8000-000000000003';
const child='00000000-0000-4000-8000-000000000004';
const user={tenant_id:tenant,user_id:actor};
const action=(behavior:string,props:Record<string,unknown>={})=>({
 behavior,field_api:null,value_text:null,target_object_api:null,
 relationship_field_api:null,flow_api_name:null,...props
});

function harness(definition:Record<string,unknown>,options:{deny?:string;relation?:boolean}={}){
 const writes:Array<{kind:string;args:unknown[]}>= [];
 const db={query:async(sql:string,args:unknown[])=>{
  writes.push({kind:'sql:'+sql.slice(0,65),args});
  if(sql.includes('FROM md_object_actions'))return {rows:[definition],rowCount:1};
  if(sql.includes('SELECT 1 FROM md_field_definitions'))
   return {rows:options.relation===false?[]:[{present:true}],rowCount:options.relation===false?0:1};
  throw Error('Unexpected SQL '+sql);
 }} as unknown as SqlPersistence;
 const rbac={
  require:async(_t:string,_u:string,resource:string,act:string)=>{
   writes.push({kind:'allow:'+resource+':'+act,args:[]});
   if(resource===options.deny)throw Error('Permission denied');
  },
  requireRecord:async(_t:string,_u:string,_object:string,id:string,act:string)=>{
   writes.push({kind:'record:'+id+':'+act,args:[]});
  }
 } as unknown as RbacEngine;
 const records={
  update:async(...args:unknown[])=>writes.push({kind:'update',args}),
  create:async(...args:unknown[])=>{writes.push({kind:'create',args});return child;}
 } as unknown as RecordEngine;
 const collaboration={addActivity:async(...args:unknown[])=>{
  writes.push({kind:'activity',args});return {activity:{id:child}};
 }} as unknown as RecordCollaborationService;
 const flows={execute:async(...args:unknown[])=>{
  writes.push({kind:'flow',args});return {status:'completed'};
 }} as unknown as FlowRuntime;
 return {runtime:new ObjectQuickActionRuntime(db,rbac,records,collaboration,flows),writes};
}

test('Quick Actions deny execution without the central Action grant',async()=>{
 const {runtime,writes}=harness(action('Set Field Value',{field_api:'Status',value_text:'Done'}),
  {deny:'Action:Account.MarkReviewed'});
 await assert.rejects(()=>runtime.execute(user,'Account',parent,'MarkReviewed',{}),/Permission denied/);
 assert.ok(!writes.some(x=>x.kind==='update'));
});

test('field update uses shared CRUD and immutable configured field/value',async()=>{
 const {runtime,writes}=harness(action('Set Field Value',{field_api:'Status',value_text:'Done'}));
 const result=await runtime.execute(user,'Account',parent,'MarkReviewed',{});
 assert.deepEqual(result,{status:'completed',recordId:parent});
 assert.deepEqual(writes.find(x=>x.kind==='update')?.args.slice(0,5),
  [tenant,actor,'Account',parent,{Status:'Done'}]);
 await assert.rejects(()=>runtime.execute(user,'Account',parent,'MarkReviewed',{Status:'Hacked'}),
  /accepts no user input/);
});

test('Log Call delegates to central record activity implementation',async()=>{
 const {runtime,writes}=harness(action('Log Call',{value_text:'Follow up'}));
 await runtime.execute(user,'Account',parent,'Call',{description:'Spoke to customer'});
 const entry=writes.find(x=>x.kind==='activity');
 assert.ok(entry);
 assert.deepEqual(entry.args[3],{kind:'Call',subject:'Follow up',
  description:'Spoke to customer',status:'Completed'});
});

test('Create Related forces the parent relationship, blocks override and verifies metadata',async()=>{
 const {runtime,writes}=harness(action('Create Related',{
  target_object_api:'Contact',relationship_field_api:'AccountId'}));
 assert.deepEqual(await runtime.execute(user,'Account',parent,'NewContact',{Name:'Jane'}),
  {status:'completed',recordId:child,objectApiName:'Contact'});
 assert.deepEqual(writes.find(x=>x.kind==='create')?.args,
  [tenant,actor,'Contact',{Name:'Jane',AccountId:parent}]);
 await assert.rejects(()=>runtime.execute(user,'Account',parent,'NewContact',{AccountId:child}),
  /Invalid related-record values/);
 const invalid=harness(action('Create Related',{
  target_object_api:'Contact',relationship_field_api:'AccountId'}),{relation:false});
 await assert.rejects(()=>invalid.runtime.execute(user,'Account',parent,'NewContact',{Name:'Jane'}),
  /relationship is no longer available/);
});

test('Run Flow reuses shared Flow runtime which checks Flow permissions',async()=>{
 const {runtime,writes}=harness(action('Run Flow',{flow_api_name:'OnboardAccount'}));
 assert.deepEqual(await runtime.execute(user,'Account',parent,'Onboard',{}),
  {status:'started',result:{status:'completed'}});
 assert.deepEqual(writes.find(x=>x.kind==='flow')?.args,
  [tenant,'OnboardAccount',actor,{recordId:parent,objectApiName:'Account'}]);
});

test('Send Email reuses tenant SMTP service, never accepts client-supplied credentials',async()=>{
 const sent:unknown[][]=[];
 const configured='00000000-0000-4000-8000-000000000099';
 const db={query:async()=>({rows:[action('Send Email',{credential_id:configured,
   from_email:'admin@example.com'})],rowCount:1})} as unknown as SqlPersistence;
 const rbac={require:async(_t:string,_u:string,res:string)=>{
  if(res==='Action:Account.Email')return;
 },requireRecord:async()=>{}} as unknown as RbacEngine;
 const mail={sendQuickActionEmail:async(...args:unknown[])=>{sent.push(args);}}
   as unknown as NamedCredentialService;
 const runtime=new ObjectQuickActionRuntime(db,rbac,{} as RecordEngine,
  {} as RecordCollaborationService,{} as FlowRuntime,mail);
 const result=await runtime.execute(user,'Account',parent,'Email',{
  to:'client@example.com',subject:'Follow up',body:'Hello there'});
 assert.deepEqual(result,{status:'completed',recordId:parent});
 assert.deepEqual(sent[0],[tenant,actor,'Account',parent,'Email',configured,
  'admin@example.com','client@example.com','Follow up','Hello there',undefined]);
 await assert.rejects(()=>runtime.execute(user,'Account',parent,'Email',{
  credentialId:'replacement',to:'client@example.com',subject:'Hi',body:'Hello'}),/Invalid email action input/);
 assert.equal(sent.length,1);
});
