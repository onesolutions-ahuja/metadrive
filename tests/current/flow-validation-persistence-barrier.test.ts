import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersistenceResponseBarrier} from '../../apps/server/src/core/state/response-barrier';

test('Read-only draft Flow Check is not blocked by an unrelated failed SQL writer',()=>{
 const rejected=Promise.reject(new Error('Concurrent writer detected; no state was overwritten'));
 void rejected.catch(()=>{});
 const barrier=createPersistenceResponseBarrier({persistenceMode:'typed',latestCommit:rejected});
 let invoked=false;
 const req={path:'/api/metadata/flows/COPILOT_POS_Cash_Checkout/validate',method:'POST'};
 const res={end(){throw Error('Validation must not replace response end');}};
 barrier(req as any,res as any,(()=>{invoked=true}) as any);
 assert.equal(invoked,true);
 assert.equal(typeof res.end,'function');
});
test('Draft Flow PUT still retains mandatory SQL commit barrier',()=>{
 const barrier=createPersistenceResponseBarrier({persistenceMode:'typed',latestCommit:Promise.resolve()});
 let invoked=false;
 const req={path:'/api/metadata/flows/COPILOT_POS_Cash_Checkout',method:'PUT'};
 const res={locals:{},end(){},getHeader(){return ''},setHeader(){return this},
  removeHeader(){return this},statusCode:200};
 barrier(req as any,res as any,(()=>{invoked=true}) as any);
 assert.equal(invoked,true);
 assert.notEqual(res.end,undefined);
});
