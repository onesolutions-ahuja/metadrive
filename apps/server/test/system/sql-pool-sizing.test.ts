import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveSqlPoolSize} from '../../src/system-files/sql-persistence.js';

test('SQL pool leaves capacity headroom by default',()=>{
 assert.equal(resolveSqlPoolSize({}),5);
 assert.equal(resolveSqlPoolSize({METADRIVE_DB_POOL_MAX:'3'}),3);
 for(const size of ['0','-1','abc','2.5','51','999999999999999999999']){
  assert.throws(()=>resolveSqlPoolSize({METADRIVE_DB_POOL_MAX:size}),/Invalid SQL connection pool size/);
 }
});
