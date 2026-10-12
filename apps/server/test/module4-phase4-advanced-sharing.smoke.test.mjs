import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = require.resolve('tsx/cli');
async function port() {
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string') throw Error('Port unavailable');
  return new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(address.port)));
}
test('Module 4 Phase 4: tenant restriction rules apply to record APIs, wide privileges and persistence',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'metadrive-restrictions-'));
  const number=await port();
  const email='admin@advanced-sharing.test',password='Advanced-Sharing-Password-2026!';
  let logs='';
  const child=spawn(process.execPath,[cli,'src/index.ts'],{
    cwd,stdio:['ignore','pipe','pipe'],
    env:{...process.env,NODE_ENV:'test',METADRIVE_TEST_MODE:'true',
      PORT:String(number),METADRIVE_DATA_PATH:path.join(dir,'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID:'advanced-restrictions',
      METADRIVE_BOOTSTRAP_TENANT_NAME:'Advanced Restrictions',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL:email,METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:password}
  });
  child.stdout?.on('data',chunk=>{logs+=chunk.toString()});
  child.stderr?.on('data',chunk=>{logs+=chunk.toString()});
  const call=async(route,token='',method='GET',body)=>{
    const res=await fetch('http://127.0.0.1:'+number+'/api'+route,{
      method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    const raw=await res.text();
    return {status:res.status,data:raw?JSON.parse(raw):{}};
  };
  try{
    let ready=false;
    for(let n=0;n<600;n++){
      if(child.exitCode!==null)throw Error('Server exited: '+logs);
      try{const r=await fetch('http://127.0.0.1:'+number+'/health',
        {signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(ready,true,logs);
    const login=await call('/auth/login','','POST',{email,password});
    assert.equal(login.status,200,JSON.stringify(login.data));
    const token=login.data.access_token;
    const created=await call('/records/Account',token,'POST',{Name:'Restricted Account'});
    assert.equal(created.status,201,JSON.stringify(created.data));
    const id=created.data.record.Id;
    const path='/records/Account/'+id;
    assert.equal((await call(path,token)).status,200);
    const metadata=await call('/metadata/permissions',token);
    assert.equal(metadata.status,200);
    const policy={id:'allowed-only',tenantId:'advanced-restrictions',
      objectApiName:'Account',enabled:true,subjectType:'all',
      conditionLogic:'all',conditions:[{field:'Name',operator:'eq',value:'Allowed Account'}]};
    const updated={...metadata.data,sharingSettings:{
      ...metadata.data.sharingSettings,Account:{
        ...metadata.data.sharingSettings.Account,restrictionRules:[policy]
      }
    }};
    const saved=await call('/metadata/permissions',token,'PUT',updated);
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.notEqual((await call(path,token)).status,200,
      'Even system administrator record-wide permissions must obey restrictions');
    const blockedEdit=await call(path,token,'PUT',{Name:'Bypass Attempt'});
    assert.notEqual(blockedEdit.status,200,'Edit must obey record restriction');
    const crossTenant=await call('/metadata/permissions',token,'PUT',{
      ...updated,sharingSettings:{...updated.sharingSettings,
        Account:{...updated.sharingSettings.Account,
          restrictionRules:[{...policy,tenantId:'foreign-tenant'}]}}
    });
    assert.equal(crossTenant.status,400,'Cross-tenant restriction must be rejected');
    const invalidField=await call('/metadata/permissions',token,'PUT',{
      ...updated,sharingSettings:{...updated.sharingSettings,
        Account:{...updated.sharingSettings.Account,
          restrictionRules:[{...policy,conditions:[{
            field:'NotARealField',operator:'eq',value:'anything'}]}]}}
    });
    assert.equal(invalidField.status,400,'Unknown restriction field must be rejected');
    const after=await call('/metadata/permissions',token);
    assert.equal(after.data.sharingSettings.Account.restrictionRules[0].id,policy.id);
    assert.notEqual((await call(path,token)).status,200);
    const cleared=await call('/metadata/permissions',token,'PUT',{
      ...after.data,sharingSettings:{...after.data.sharingSettings,
        Account:{...after.data.sharingSettings.Account,restrictionRules:[]}}
    });
    assert.equal(cleared.status,200,JSON.stringify(cleared.data));
    assert.equal((await call(path,token)).status,200,
      'Removing restriction must immediately restore normal RBAC decisions');
  } finally {
    if(child.exitCode===null){
      child.kill();await Promise.race([once(child,'exit'),
        new Promise(resolve=>setTimeout(resolve,5000))]);
    }
    await rm(dir,{recursive:true,force:true});
  }
});
