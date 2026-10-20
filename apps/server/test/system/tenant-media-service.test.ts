import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {TenantMediaService} from '../../src/system-files/tenant-media-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenant='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002',
 id='00000000-0000-4000-8000-000000000003';
const base64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9SQCQAAAAASUVORK5CYII=';
const content=Buffer.from(base64,'base64');
function setup(){
 const calls:Array<{sql:string;args:unknown[]}>=[],permissions:string[]=[];
 const db={
  query:async(sql:string,args:unknown[]=[])=>{
   calls.push({sql,args});
   if(sql.includes('FROM md_tenant_media_assets WHERE tenant_id=$1 ORDER BY'))
     return {rows:[{id,name:'kfc.png',content_type:'image/png',byte_size:content.length,created_at:new Date()}]};
   if(sql.includes('SELECT name,content_type,byte_size,checksum,content FROM md_tenant_media_assets'))
     return {rows:[{name:'kfc.png',content_type:'image/png',byte_size:content.length,
       checksum:createHash('sha256').update(content).digest('hex'),content}]};
   if(sql.includes('COALESCE(sum(byte_size)'))return {rows:[{used_bytes:'0'}]};
   if(sql.includes('INSERT INTO md_tenant_media_assets'))return {rows:[{id}]};
   if(sql.includes('SELECT 1 FROM md_page_component_properties'))return {rows:[]};
   if(sql.includes('DELETE FROM md_tenant_media_assets'))return {rowCount:1,rows:[{id}]};
   return {rows:[]};
  },
  transaction:async<T>(fn:(client:unknown)=>Promise<T>)=>fn(db)
 } as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  permissions.push(resource+':'+action);
 }} as unknown as RbacEngine;
 return {service:new TenantMediaService(db,rbac),calls,permissions};
}
test('tenant media supports valid image uploads, reads and Files permissions',async()=>{
 const {service,calls,permissions}=setup();
 const created=await service.upload(tenant,user,{name:'kfc.png',contentType:'image/png',contentBase64:base64});
 assert.equal(created.assetRef,'asset:'+id);
 assert.equal((await service.list(tenant,user))[0].assetRef,'asset:'+id);
 assert.equal((await service.read(tenant,user,id)).contentBase64,base64);
 assert.deepEqual(permissions,['Files:create','Files:read','Files:read']);
 assert.ok(calls.filter(c=>c.sql.includes('md_tenant_media_assets')).every(c=>c.args[0]===tenant));
});
test('media validation rejects forged SVG and images without dimensions',async()=>{
 const {service}=setup();
 await assert.rejects(()=>service.upload(tenant,user,{name:'logo.svg',contentType:'image/svg+xml',
   contentBase64:Buffer.from('<svg/>').toString('base64')}),/Invalid image/);
 await assert.rejects(()=>service.upload(tenant,user,{name:'broken.png',contentType:'image/png',
   contentBase64:Buffer.from('not a PNG').toString('base64')}),/Invalid image/);
});
