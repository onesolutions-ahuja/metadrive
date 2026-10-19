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
  'Set Field Value','Status','Reviewed',0]);
 await assert.rejects(()=>service.persistWithin(client,'tenant','Account',{
  pluralLabel:'Accounts',settings:{},fieldSets:[],
  actions:[{id:'BadAction',label:'Bad Action',type:'Custom',enabled:true,
   behavior:'Set Field Value',fieldApiName:'Calculated',value:'x'}]
 }),/writable field/);
});
