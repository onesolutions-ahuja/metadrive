import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
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
const tsxCli = require.resolve('tsx/cli');
async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No available port');
  return await new Promise<number>((resolve,reject)=>server.close((error)=>error?reject(error):resolve(address.port)));
}
test('User CRUD enforces security and User object RBAC while preserving identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'metadrive-users-rbac-'));
  const listenPort = await port();
  const email = 'admin@user-crud-rbac.test';
  const secret = 'User-RBAC-Integration-Validation-2026!';
  let logs='';
  const child:ChildProcess = spawn(process.execPath,[tsxCli,'src/index.ts'],{
    cwd,
    env:{...process.env, PORT:String(listenPort), METADRIVE_DATA_PATH:path.join(dir,'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID:'users-rbac-test',
      METADRIVE_BOOTSTRAP_TENANT_NAME:'User RBAC Test',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL:email,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:secret},
    stdio:['ignore','pipe','pipe']
  });
  child.stdout?.on('data',(chunk:Buffer)=>{logs+=chunk.toString();});
  child.stderr?.on('data',(chunk:Buffer)=>{logs+=chunk.toString();});
  const send = async (route:string, token?:string, method='GET', body?:unknown) => {
    const response=await fetch('http://127.0.0.1:'+listenPort+'/api'+route,{
      method,
      headers:{ ...(token?{Authorization:'Bearer '+token}:{}), ...(body?{'Content-Type':'application/json'}:{}) },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.text();
    return {status:response.status,data:data?JSON.parse(data) as Record<string,any>:{}};
  };
  try {
    let ready=false;
    for(let i=0;i<600;i++){
      if(child.exitCode!==null)throw Error('Unexpected server exit: '+logs);
      try{ const response=await fetch('http://127.0.0.1:'+listenPort+'/health',{signal:AbortSignal.timeout(500)}); if(response.ok){ready=true;break;} }
      catch {/* still starting */}
      await new Promise((resolve)=>setTimeout(resolve,100));
    }
    assert.equal(ready,true,logs);
    const login=await send('/auth/login',undefined,'POST',{email,password:secret});
    assert.equal(login.status,200,JSON.stringify(login.data));
    const token=login.data.access_token as string;
    const security=await send('/metadata/permissions',token);
    assert.equal(security.status,200);
    const admin=security.data.users.find((user:Record<string,any>)=>user.username===email);
    assert.ok(admin);
    const role=security.data.roles[0];
    assert.ok(role,'tenant must seed at least one role');
    const userInput={Name:'Cashier Example',Email:'cashier-rbac@example.test',
      Username:'cashier-rbac@example.test',IsActive:true,UserRoleId:role.name,
      Password:'Temporary-Strong-Test-Pass-123!'};
    const created=await send('/records/User',token,'POST',userInput);
    assert.equal(created.status,201,JSON.stringify(created.data));
    assert.ok(created.data.record.Id);
    assert.ok(!JSON.stringify(created.data).includes(userInput.Password),'Never expose initial password');
    const id=created.data.record.Id as string;
    const members=await send('/metadata/permissions',token);
    assert.equal(members.data.users.some((user:Record<string,any>)=>user.id===id),true,'Created identity must have RBAC assignment');
    const duplicate=await send('/records/User',token,'POST',userInput);
    assert.equal(duplicate.status,409);
    const nonAdminLogin=await send('/auth/login',undefined,'POST',{email:userInput.Email,password:userInput.Password});
    assert.equal(nonAdminLogin.status,200,'Created identity must be able to authenticate');
    const userToken=nonAdminLogin.data.access_token as string;
    const denied=await send('/records/User',userToken,'POST',{...userInput,Email:'unauthorized@example.test',Username:'unauthorized@example.test'});
    assert.equal(denied.status,403,'New users receive no implicit user-management grants');
    const edited=await send('/records/User/'+id,token,'PUT',{Name:'Updated Cashier Example'});
    assert.equal(edited.status,200,JSON.stringify(edited.data));
    assert.equal(edited.data.record.Name,'Updated Cashier Example');
    const protectAdmin=await send('/records/User/'+admin.id,token,'DELETE');
    assert.equal(protectAdmin.status,409,'Last active security administrator must be protected');
    const deactivated=await send('/records/User/'+id,token,'DELETE');
    assert.equal(deactivated.status,204);
    const record=await send('/records/User/'+id,token);
    assert.equal(record.status,200);
    assert.equal(record.data.record.IsActive,false,'Delete should preserve inactive identity for audit');
    const repeat=await send('/records/User/'+id,token,'DELETE');
    assert.equal(repeat.status,409);
    const rejectedLogin=await send('/auth/login',undefined,'POST',{email:userInput.Email,password:userInput.Password});
    assert.notEqual(rejectedLogin.status,200,'Deactivated identity must not authenticate');
  } finally {
    if (child.exitCode===null) {
      child.kill();
      await Promise.race([once(child,'exit'),new Promise((resolve)=>setTimeout(resolve,4000))]);
    }
    await rm(dir,{recursive:true,force:true});
  }
});
