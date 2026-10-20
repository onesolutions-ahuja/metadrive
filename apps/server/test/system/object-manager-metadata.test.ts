import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {ObjectManagerMetadataService} from '../../src/system-files/object-manager-metadata.js';

const access={require:async()=>undefined} as unknown as RbacEngine;

test('Object Manager loads tenant-scoped action definitions in configured order',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_object_manager_settings'))return {rows:[{
   object_api:'Account',plural_label:'Accounts',description:'',help_text:'',allow_reports:true,
   allow_activities:false,track_field_history:false,allow_in_chatter:false,allow_search:true,
   deployment_status:'Deployed',record_name_type:'Text',record_name_format:''
  }]};
  if(sql.includes('FROM md_object_field_sets'))return {rows:[]};
  if(sql.includes('FROM md_object_actions'))return {rows:[{
   object_api:'Account',action_id:'MarkReviewed',label:'Mark Reviewed',action_type:'Custom',
   enabled:true,behavior:'Set Field Value',field_api:'Status',value_text:'Reviewed',sort_order:0
  }]};
  throw new Error('Unexpected Object Manager query: '+sql);
 }} as unknown as SqlPersistence;
 const service=new ObjectManagerMetadataService(db,access);
 const configuration=await service.load('tenant','user','Account');
 assert.deepEqual(configuration.actions,[{
  id:'MarkReviewed',label:'Mark Reviewed',type:'Custom',enabled:true,
  behavior:'Set Field Value',fieldApiName:'Status',value:'Reviewed'
 }]);
});

test('Object Manager persists only supported custom actions with writable fields',async()=>{
 const writes:Array<{sql:string;values:unknown[]}>= [];
 const client={query:async(sql:string,values:unknown[]=[]):Promise<{rows:unknown[];rowCount:number}>=>{
  if(sql.includes('SELECT api_name FROM md_object_definitions'))return {rows:[{api_name:'Account'}],rowCount:1};
  if(sql.includes('FROM md_field_definitions'))return {rows:[
   {api_name:'Name',data_type:'text'},{api_name:'Status',data_type:'picklist'},
   {api_name:'Calculated',data_type:'formula'}
  ],rowCount:3};
  writes.push({sql,values});
  return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 const service=new ObjectManagerMetadataService({} as SqlPersistence,access);
 const saved=await service.persistWithin(client,'tenant','Account',{
  pluralLabel:'Accounts',description:'',helpText:'',settings:{},fieldSets:[],
  actions:[{id:'MarkReviewed',label:'Mark Reviewed',type:'Custom',enabled:true,
   behavior:'Set Field Value',fieldApiName:'Status',value:'Reviewed'}]
 });
 assert.deepEqual(saved.actions,[{id:'MarkReviewed',label:'Mark Reviewed',type:'Custom',enabled:true,
  behavior:'Set Field Value',fieldApiName:'Status',value:'Reviewed'}]);
 const actionWrite=writes.find(write=>write.sql.includes('INSERT INTO md_object_actions'));
 assert.ok(actionWrite);
 assert.deepEqual(actionWrite.values,['tenant','Account','MarkReviewed','Mark Reviewed','Custom',true,
  'Set Field Value','Status','Reviewed',0,null,null,null,null,null]);
 await assert.rejects(()=>service.persistWithin(client,'tenant','Account',{
  pluralLabel:'Accounts',settings:{},fieldSets:[],
  actions:[{id:'BadAction',label:'Bad Action',type:'Custom',enabled:true,
   behavior:'Set Field Value',fieldApiName:'Calculated',value:'x'}]
 }),/writable field/);
});

test('Object Manager persists Flow, call and related actions in the same SQL metadata registry',async()=>{
 const writes:Array<{sql:string;values:unknown[]}>= [];
 const client={query:async(sql:string,values:unknown[]=[])=>{
  if(sql.includes('SELECT api_name FROM md_object_definitions'))
   return {rows:[{api_name:'Account'}],rowCount:1};
  if(sql.includes('SELECT api_name,data_type'))return {rows:[{api_name:'Name',data_type:'text'}],rowCount:1};
  if(sql.includes('SELECT 1 FROM md_field_definitions'))
   return {rows:[{exists:1}],rowCount:1};
  writes.push({sql,values});return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 const metadata=new ObjectManagerMetadataService({} as SqlPersistence,access);
 const saved=await metadata.persistWithin(client,'tenant','Account',{
  pluralLabel:'Accounts',settings:{},fieldSets:[],actions:[
   {id:'PhoneCall',label:'Log Phone Call',type:'Custom',enabled:true,
    behavior:'Log Call',value:'Customer call'},
   {id:'StartFlow',label:'Start Flow',type:'Custom',enabled:true,
    behavior:'Run Flow',flowApiName:'Account_Onboarding'},
   {id:'AddContact',label:'New Contact',type:'Custom',enabled:true,
    behavior:'Create Related',targetObjectApi:'Contact',relationshipFieldApi:'AccountId'}
  ]
 });
 assert.equal(saved.actions.length,3);
 const rows=writes.filter(x=>x.sql.includes('INSERT INTO md_object_actions'));
 assert.deepEqual(rows.map(r=>r.values.slice(6,9)),[
  ['Log Call',null,'Customer call'],['Run Flow',null,null],['Create Related',null,null]]);
 assert.deepEqual(rows[2].values.slice(10),['Contact','AccountId',null,null,null]);
 await assert.rejects(()=>metadata.persistWithin(client,'tenant','Account',{
  pluralLabel:'Accounts',settings:{},fieldSets:[],actions:[{
   id:'Bad',label:'Bad',type:'Custom',enabled:true,behavior:'Run Flow',flowApiName:'../unsafe'
  }]
 }),/Invalid quick action Flow/);
});

test('Send Email action validates tenant SMTP reference before persistence',async()=>{
 const calls:Array<{sql:string;args:unknown[]}>= [];
 const client={query:async(sql:string,args:unknown[]=[])=>{
  calls.push({sql,args});
  if(sql.includes('SELECT api_name FROM md_object_definitions'))return {rows:[{api_name:'Account'}],rowCount:1};
  if(sql.includes('SELECT api_name,data_type'))return {rows:[{api_name:'Name',data_type:'text'}],rowCount:1};
  if(sql.includes('FROM md_named_credentials'))return {rows:[{exists:1}],rowCount:1};
  return {rows:[],rowCount:1};
 }} as unknown as PoolClient;
 const service=new ObjectManagerMetadataService({} as SqlPersistence,access);
 const credential='00000000-0000-4000-8000-000000000011';
 const saved=await service.persistWithin(client,'tenant','Account',{pluralLabel:'Accounts',
  settings:{},fieldSets:[],actions:[{id:'Email',label:'Send Email',type:'Custom',enabled:true,
   behavior:'Send Email',credentialId:credential,fromEmail:'sales@example.com'}]});
 assert.equal(saved.actions[0].behavior,'Send Email');
 const insert=calls.find(x=>x.sql.includes('INSERT INTO md_object_actions'));
 assert.deepEqual(insert?.args.slice(-2),[credential,'sales@example.com']);
 await assert.rejects(()=>service.persistWithin(client,'tenant','Account',{
  pluralLabel:'Accounts',settings:{},fieldSets:[],actions:[{
   id:'Email',label:'Send Email',type:'Custom',enabled:true,
   behavior:'Send Email',credentialId:'unsafe',fromEmail:'sales@example.com'}
  ]}),/valid SMTP credential/);
});
