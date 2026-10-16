import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchIntegrationDeliveries } from '../src/connector-delivery-worker.js';
import { IntegrationOutbox } from '../src/connector-outbox.js';

test('native worker dispatches tenant leased jobs, acknowledges success and dead-letters 400',async()=>{
  const calls:Array<{operation:string;permanent?:boolean}>=[];
  const jobs=[
    {id:'1',tenantId:'A',credentialId:'C',operationKey:'one',method:'POST',path:'/post',encryptedRequest:'enc:test',attempts:1,maxAttempts:3},
    {id:'2',tenantId:'A',credentialId:'C',operationKey:'two',method:'POST',path:'/post',encryptedRequest:'enc:test',attempts:1,maxAttempts:3},
  ];
  const outbox={
    claim:async(tenantId:string,worker:string)=>{assert.equal(tenantId,'A');assert.equal(worker,'worker');return jobs;},
    complete:async(_t:string,_w:string,id:string)=>{calls.push({operation:'complete:'+id});},
    fail:async(_t:string,_w:string,id:string,_e:string,_d:number,permanent:boolean)=>{calls.push({operation:'fail:'+id,permanent});}
  } as unknown as IntegrationOutbox;
  const result=await dispatchIntegrationDeliveries({outbox,tenantId:'A',workerId:'worker',dispatch:async job=>({status:job.id==='1'?201:400})});
  assert.deepEqual(result,{claimed:2,succeeded:1,deferred:1});
  assert.deepEqual(calls,[{operation:'complete:1'},{operation:'fail:2',permanent:true}]);
});
test('transient failures defer delivery; no plaintext error is persisted',async()=>{
  const errors:string[]=[];
  const outbox={
    claim:async()=>[{id:'1',tenantId:'A',credentialId:'C',operationKey:'one',method:'POST',path:'/post',encryptedRequest:'enc:test',attempts:2,maxAttempts:3}],
    fail:async(_t:string,_w:string,_id:string,code:string,delay:number,permanent:boolean)=>{
      errors.push(code);assert.equal(delay,2000);assert.equal(permanent,false);
    }
  } as unknown as IntegrationOutbox;
  await dispatchIntegrationDeliveries({outbox,tenantId:'A',workerId:'worker',dispatch:async()=>{throw Error('private API token leaked');}});
  assert.deepEqual(errors,['DELIVERY_FAILURE']);
});

test('redirects and malformed provider status are never acknowledged as successful deliveries',async()=>{
  for(const status of [301,302,307,308,NaN,0,600]){
    const calls:string[]=[];
    const outbox={
      claim:async()=>[{id:'redirect',tenantId:'A',credentialId:'C',operationKey:'x',method:'POST',path:'/safe',encryptedRequest:'enc:test',attempts:1,maxAttempts:3}],
      complete:async()=>{calls.push('complete');},
      fail:async(_t:string,_w:string,_id:string,_code:string,_delay:number,permanent:boolean)=>{
        assert.equal(permanent,true);calls.push('failed');
      }
    } as unknown as IntegrationOutbox;
    const result=await dispatchIntegrationDeliveries({outbox,tenantId:'A',workerId:'worker',dispatch:async()=>({status})});
    assert.deepEqual(result,{claimed:1,succeeded:0,deferred:1});
    assert.deepEqual(calls,['failed']);
  }
});
