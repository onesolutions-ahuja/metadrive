import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {ComponentLibraryService} from '../../src/system-support/component-library-service.js';

const sample={apiName:'DemoComponent',label:'Demo',description:'',
 surfaces:['page','dashboard'],resize:{defaultWidth:6,defaultHeight:4,minWidth:2,minHeight:2},
 jsxSource:'export default function Demo(){return null}',cssSource:'',publicationStatus:'Draft'};
test('component definitions are validated before any database write',async()=>{
 let queries=0;
 const db={query:async()=>{queries++;throw Error('Unexpected SQL');},transaction:async()=>{queries++;throw Error('Unexpected SQL');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new ComponentLibraryService(db,rbac);
 await assert.rejects(()=>svc.save('t','u',{...sample,compiledJs:'untrustedCode'}),/Compiled code/);
 await assert.rejects(()=>svc.save('t','u',{...sample,surfaces:['page','page']}),/Invalid component/);
 await assert.rejects(()=>svc.publish('t','u','invalid path',1),/Invalid component version/);
 assert.equal(queries,0);
});
test('component lifecycle requires OneEngine permissions before SQL',async()=>{
 let queries=0;
 const db={query:async()=>{queries++;return {rows:[]};},transaction:async()=>{queries++;}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 const svc=new ComponentLibraryService(db,rbac);
 await assert.rejects(()=>svc.list('t','u'),/Permission denied/);
 await assert.rejects(()=>svc.save('t','u',sample),/Permission denied/);
 await assert.rejects(()=>svc.publish('t','u','DemoComponent'),/Permission denied/);
 await assert.rejects(()=>svc.remove('t','u','DemoComponent'),/Permission denied/);
 assert.equal(queries,0);
});
