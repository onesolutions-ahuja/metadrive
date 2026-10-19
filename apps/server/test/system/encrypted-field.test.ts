import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decryptFieldValue,encryptFieldValue,maskEncryptedFieldValue} from '../../src/system-files/encrypted-field.js';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const recordId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const vault={
  encryptOpaque(value:string){return {ciphertext:Buffer.from(value),keyId:'test-key'};},
  decryptOpaque(value:Buffer){return value.toString();}
};

test('encrypted field envelopes bind ciphertext to tenant, object and field metadata',()=>{
  const encrypted=encryptFieldValue(vault,tenant,'Contact','Email','private@example.test');
  assert.notEqual(encrypted,'private@example.test');
  assert.equal(decryptFieldValue(vault,tenant,'Contact','Email',encrypted),'private@example.test');
  assert.throws(()=>decryptFieldValue(vault,tenant,'Contact','Phone',encrypted),/context/);
  assert.equal(maskEncryptedFieldValue(),'********');
});

test('record reads mask encrypted values without permission and audit authorized reveals',async()=>{
  const ciphertext=encryptFieldValue(vault,tenant,'Contact','Email','private@example.test');
  const audit:Array<readonly unknown[]>=[];
  const db={
    query:async(sql:string,args:readonly unknown[]=[]):Promise<{rows:any[];rowCount:number}>=>{
      if(sql.includes('FROM md_records r')&&sql.includes('md_record_access'))
        return {rows:[{id:recordId,created_at:new Date(),updated_at:new Date(),owner_id:user,
          record_type_id:null,field_api:'Email',value_text:ciphertext,reference_record_id:null,
          data_type:'encryptedtext',value_number:null,value_date:null,value_datetime:null,
          value_boolean:null,geo_latitude:null,geo_longitude:null,address_street:null,address_city:null,
          address_state:null,address_postal_code:null,address_country:null}],rowCount:1};
      if(sql.includes('FROM md_field_definitions')&&sql.includes('deleted_at IS NULL'))
        return {rows:[{api_name:'Email',data_type:'encryptedtext',related_object:null,
          relationship_type:null,allow_reparenting:false,required:false,max_length:175,
          precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
          default_value:null,auto_number_format:null}],rowCount:1};
      if(sql.includes('INSERT INTO md_encrypted_field_access_audit'))audit.push(args);
      return {rows:[],rowCount:1};
    }
  } as unknown as SqlPersistence;
  let canView=false;
  const rbac={
    require:async()=>{},
    allowed:async(_tenant:string,_user:string,resource:string)=>resource==='ViewEncryptedData'&&canView,
    allowedMany:async()=>[true]
  } as unknown as RbacEngine;
  const engine=new RecordEngine(db,rbac,vault);
  const masked=await engine.get(tenant,user,'Contact',recordId);
  assert.equal(masked.Email,'********');
  assert.equal(audit.length,0);
  canView=true;
  const revealed=await engine.get(tenant,user,'Contact',recordId);
  assert.equal(revealed.Email,'private@example.test');
  assert.deepEqual(audit[0],[tenant,recordId,'Contact','Email',user]);
});
