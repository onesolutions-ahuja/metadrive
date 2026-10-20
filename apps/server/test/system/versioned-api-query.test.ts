import test from 'node:test';
import assert from 'node:assert/strict';
import express,{type Request} from 'express';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import type {ObjectDefinitionService} from '../../src/system-files/object-definition.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {parseSalesforceQuery,parseSalesforceSearch} from '../../src/system-support/versioned-api-routes.js';
import {registerVersionedApiRoutes} from '../../src/system-support/versioned-api-routes.js';

test('parses bounded SOQL projections, filters, sorting, limits and offsets',()=>{
 const query=parseSalesforceQuery(
  "SELECT Id,Name,Amount FROM Invoice WHERE Amount >= 10 AND (Name = 'A''B' OR Name LIKE 'unused') ORDER BY Amount DESC LIMIT 50 OFFSET 5"
 );
 assert.deepEqual(query.fields,['Id','Name','Amount']);
 assert.equal(query.objectApi,'Invoice');
 assert.deepEqual(query.filters,[
  {field:'Amount',operator:'gte',value:'10'},
  {field:'Name',operator:'eq',value:"A'B"},
  {field:'Name',operator:'eq',value:'unused'}
 ]);
 assert.equal(query.filterLogic,'(1 AND (2 OR 3))');
 assert.equal(query.sortField,'Amount');
 assert.equal(query.sortDirection,'desc');
 assert.equal(query.limit,50);
 assert.equal(query.offset,5);
});

test('parses IN lists and rejects malformed or unsupported SOQL',()=>{
 const query=parseSalesforceQuery("SELECT Id FROM Invoice WHERE Status IN ('Open','Closed')");
 assert.deepEqual(query.filters,[{field:'Status',operator:'in',value:['Open','Closed']}]);
 assert.throws(()=>parseSalesforceQuery('SELECT Id FROM Invoice; DELETE FROM Invoice'),/Unsupported SOQL/);
 assert.throws(()=>parseSalesforceQuery('SELECT Id FROM Invoice WHERE Name = null'),/literal values/);
 assert.throws(()=>parseSalesforceQuery('SELECT Id FROM Invoice LIMIT 5000'),/outside the supported range/);
});

test('parses a bounded single-object SOSL search and rejects arbitrary search shapes',()=>{
 assert.deepEqual(parseSalesforceSearch(
  'FIND {cafe} IN ALL FIELDS RETURNING Contact(Id,Name) LIMIT 30'
 ),{search:'cafe',objectApi:'Contact',fields:['Id','Name'],limit:30});
 assert.throws(()=>parseSalesforceSearch('FIND {x} IN ALL FIELDS RETURNING Contact(Id),Account(Id)'),
  /Unsupported SOSL/);
});

test('serves authenticated versioned discovery, describe and SOQL records',async()=>{
 const app=express();
 app.use((req,_res,next)=>{
  (req as Request&{actor?:{tenant_id:string;user_id:string}}).actor={
   tenant_id:'tenant',user_id:'user'
  };
  next();
 });
 const rbac={
  require:async()=>undefined,
  allowed:async()=>true
 } as unknown as RbacEngine;
 const definitions={
  list:async()=>[{apiName:'Account',label:'Account',kind:'Standard Object'}],
  get:async()=>({apiName:'Account',label:'Account',kind:'Standard Object',fields:[
   {apiName:'Name',label:'Name',dataType:'Text(80)',required:false}
  ]})
 } as unknown as ObjectDefinitionService;
 const records={
  list:async()=>({records:[{Id:'11111111-1111-4111-8111-111111111111',
   CreatedAt:'2026-01-01T00:00:00.000Z',LastModifiedDate:'2026-01-02T00:00:00.000Z',
   Name:'Example'}],total:1}),
 } as unknown as RecordEngine;
 const db={query:async()=>({rows:[]})} as unknown as SqlPersistence;
 registerVersionedApiRoutes(app,records,definitions,rbac,db);
 const server=app.listen(0);
 try{
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const versions=await fetch(`${base}/services/data`);
  assert.equal(versions.status,200);
  assert.equal((await versions.json() as Array<{url:string}>)[0]?.url,'/services/data/v1.0');
  const describe=await fetch(`${base}/services/data/v1.0/sobjects/Account/describe`);
  assert.equal(describe.status,200);
  assert.equal((await describe.json() as {fields:Array<{name:string}>}).fields[0]?.name,'Name');
  const query=await fetch(`${base}/services/data/v1.0/query?q=${encodeURIComponent('SELECT Id,Name FROM Account')}`);
  assert.equal(query.status,200);
  const result=await query.json() as {totalSize:number;done:boolean;records:Array<Record<string,unknown>>};
  assert.equal(result.totalSize,1);
  assert.equal(result.done,true);
  assert.equal(result.records[0]?.Name,'Example');
  assert.deepEqual(result.records[0]?.attributes,{type:'Account',
   url:'/services/data/v1.0/sobjects/Account/11111111-1111-4111-8111-111111111111'});
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
