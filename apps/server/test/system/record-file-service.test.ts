import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RecordFileService} from '../../src/system-files/record-file-service.js';
import {sanitizeRichText} from '../../src/system-files/rich-text.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

const tenantId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
const recordId='00000000-0000-4000-8000-000000000003';
const validPng=()=>{
  const buffer=Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer);
  buffer.writeUInt32BE(1,16);
  buffer.writeUInt32BE(1,20);
  return buffer;
};

test('Rich Text keeps only tenant-file inline image URLs and strips unsafe markup',()=>{
  const clean=sanitizeRichText('<p>Text<script>alert(1)</script></p>'
    +'<img src="https://attacker.invalid/track.png">'
    +'<img src="/api/files/00000000-0000-4000-8000-000000000004/content" alt="Safe">'
    +'<a href="javascript:alert(1)">link</a>');
  assert.match(clean,/<p>Text<\/p>/);
  assert.doesNotMatch(clean,/attacker\.invalid|javascript:|<script/);
  assert.match(clean,/<img src="\/api\/files\/00000000-0000-4000-8000-000000000004\/content" alt="Safe" \/>/);
});

test('Rich Text updates prune only unreferenced files for that field and record',async()=>{
  let captured:{sql:string;args:unknown[]}|undefined;
  const client={query:async(sql:string,args:unknown[])=>{
    captured={sql,args};
    return {rows:[],rowCount:1};
  }} as unknown as import('pg').PoolClient;
  const html='<p><img src="/api/files/00000000-0000-4000-8000-000000000004/content">'
    +'<img src="/api/files/00000000-0000-4000-8000-000000000005/content"></p>';
  await new RecordFileService({} as SqlPersistence,{} as RbacEngine)
    .pruneUnreferenced(client,tenantId,'Note__c',recordId,'Body__c',html);
  assert.match(captured?.sql??'',/tenant_id=\$1 AND object_api=\$2 AND record_id=\$3 AND field_api=\$4/);
  assert.deepEqual(captured?.args,[tenantId,'Note__c',recordId,'Body__c',[
    '00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005'
  ]]);
});

test('inline image upload enforces RBAC, rich-text metadata, valid image bytes and tenant-scoped storage',async()=>{
  const calls:Array<{sql:string;args:unknown[]}>= [];
  const db={query:async(sql:string,args:unknown[]=[])=>{
    calls.push({sql,args});
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
    if(sql.includes('SELECT data_type FROM md_field_definitions'))
      return {rows:[{data_type:'richtext'}],rowCount:1};
    if(sql.includes('SELECT COALESCE(sum(byte_size)'))
      return {rows:[{used_bytes:'0',field_count:'0'}],rowCount:1};
    if(sql.includes('INSERT INTO md_record_files'))
      return {rows:[{id:'00000000-0000-4000-8000-000000000004'}],rowCount:1};
    throw new Error('Unexpected SQL: '+sql);
  }};
  const dbWithTransaction={...db,transaction:async(run:(client:typeof db)=>Promise<unknown>)=>run(db)} as unknown as SqlPersistence;
  const permissionCalls:string[][]= [];
  const rbac={
    require:async(...args:string[])=>{permissionCalls.push(args);},
    requireRecord:async(...args:string[])=>{permissionCalls.push(args);}
  } as unknown as RbacEngine;
  const png=validPng().toString('base64');
  const service=new RecordFileService(dbWithTransaction,rbac);
  const result=await service.upload(tenantId,userId,{objectApi:'Note__c',recordId,
    fieldApi:'Body__c',name:'../drawing.png',contentType:'image/png',contentBase64:png});
  assert.equal(result.url,'/api/files/00000000-0000-4000-8000-000000000004/content');
  assert.equal(result.name,'.._drawing.png');
  const insert=calls.find(call=>call.sql.includes('INSERT INTO md_record_files'));
  assert.deepEqual(insert?.args.slice(0,4),[tenantId,'Note__c',recordId,'Body__c']);
  assert.equal(insert?.args[5],'image/png');
  assert.equal(insert?.args[6],24);
  assert.equal((insert?.args[8] as Buffer).toString('base64'),png);
  assert.deepEqual(permissionCalls.map(call=>call.slice(2)),[
    ['Files','create'],['Note__c','edit'],['Note__c.Body__c','edit'],
    ['Note__c',recordId,'edit']
  ]);
  assert.ok(calls.find(call=>call.sql.includes('SELECT data_type FROM md_field_definitions'))
    ?.args.every(value=>value!==''));
});

test('inline image upload rejects mismatched content types before storage',async()=>{
  let inserted=false;
  const db={query:async(sql:string)=>{
    if(sql.includes('SELECT data_type FROM md_field_definitions'))
      return {rows:[{data_type:'richtext'}],rowCount:1};
    if(sql.includes('INSERT INTO md_record_files'))inserted=true;
    return {rows:[],rowCount:0};
  }};
  const dbWithTransaction={...db,transaction:async(run:(client:typeof db)=>Promise<unknown>)=>run(db)} as unknown as SqlPersistence;
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  const service=new RecordFileService(dbWithTransaction,rbac);
  await assert.rejects(()=>service.upload(tenantId,userId,{objectApi:'Note__c',recordId,
    fieldApi:'Body__c',name:'fake.png',contentType:'image/png',
    contentBase64:Buffer.from('<svg/>').toString('base64')}),/Invalid inline image content/);
  assert.equal(inserted,false);
});

test('inline image upload rejects non-rich-text field associations',async()=>{
  const db={query:async()=>({rows:[{data_type:'text'}],rowCount:1})};
  const dbWithTransaction={...db,transaction:async(run:(client:typeof db)=>Promise<unknown>)=>run(db)} as unknown as SqlPersistence;
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordFileService(dbWithTransaction,rbac).upload(tenantId,userId,{
    objectApi:'Note__c',recordId,fieldApi:'Body__c',name:'image.png',
    contentType:'image/png',contentBase64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')
  }),/require an active Rich Text Area field/);
});

test('inline image upload enforces tenant storage and per-field limits',async()=>{
  for(const usage of [{used_bytes:String(100*1024*1024),field_count:'0'},
    {used_bytes:'0',field_count:'20'}]){
    let inserted=false;
    const db={query:async(sql:string)=>{
      if(sql.includes('SELECT data_type FROM md_field_definitions'))
        return {rows:[{data_type:'richtext'}],rowCount:1};
      if(sql.includes('SELECT COALESCE(sum(byte_size)'))
        return {rows:[usage],rowCount:1};
      if(sql.includes('INSERT INTO md_record_files'))inserted=true;
      return {rows:[],rowCount:1};
    }};
    const transactionDb={...db,transaction:async(run:(client:typeof db)=>Promise<unknown>)=>run(db)} as unknown as SqlPersistence;
    const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
    const service=new RecordFileService(transactionDb,rbac);
    await assert.rejects(()=>service.upload(tenantId,userId,{objectApi:'Note__c',recordId,
      fieldApi:'Body__c',name:'image.png',contentType:'image/png',
      contentBase64:validPng().toString('base64')}),
    usage.used_bytes!=='0'?/File storage quota exceeded/:/Too many inline images/);
    assert.equal(inserted,false);
  }
});

test('inline image serving checks file integrity and refuses tampered bytes',async()=>{
  const content=validPng();
  const row={id:'00000000-0000-4000-8000-000000000004',object_api:'Note__c',
    record_id:recordId,field_api:'Body__c',content_type:'image/png',
    content,name:'image.png',byte_size:content.length,
    checksum:'0'.repeat(64)};
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM md_record_files'))
      return {rows:[row],rowCount:1};
    if(sql.includes('FROM md_field_definitions'))
      return {rows:[{data_type:'richtext'}],rowCount:1};
    throw new Error('Unexpected SQL: '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordFileService(db,rbac).read(tenantId,userId,row.id),
    /integrity validation/);
});

test('inline image upload rejects oversized decoded dimensions',async()=>{
  let inserted=false;
  const db={query:async(sql:string)=>{
    if(sql.includes('SELECT data_type FROM md_field_definitions'))
      return {rows:[{data_type:'richtext'}],rowCount:1};
    if(sql.includes('SELECT COALESCE(sum(byte_size)'))
      return {rows:[{used_bytes:'0',field_count:'0'}],rowCount:1};
    if(sql.includes('INSERT INTO md_record_files'))inserted=true;
    return {rows:[],rowCount:1};
  }};
  const transactionDb={...db,transaction:async(run:(client:typeof db)=>Promise<unknown>)=>run(db)} as unknown as SqlPersistence;
  const content=validPng();
  content.writeUInt32BE(100_000,16);
  const rbac={require:async()=>{},requireRecord:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordFileService(transactionDb,rbac).upload(tenantId,userId,{
    objectApi:'Note__c',recordId,fieldApi:'Body__c',name:'huge.png',
    contentType:'image/png',contentBase64:content.toString('base64')
  }),/Invalid inline image dimensions/);
  assert.equal(inserted,false);
});
