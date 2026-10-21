import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {validateFlowDraft} from '../../src/system-files/flow-validation.js';

const file=fileURLToPath(new URL('../../../acetill/flows/payment-flows.v1.json',import.meta.url));
const graphs=JSON.parse(readFileSync(file,'utf8')) as Record<string,Record<string,unknown>>;
const rbac={require:async()=>undefined} as unknown as RbacEngine;

for(const apiName of ['AcetillPaymentCash','AcetillPaymentCard']){
 test(apiName+' matches shared Flow validation contract',async()=>{
  const result=await validateFlowDraft(rbac,'tenant-id','user-id',apiName,graphs[apiName]);
  assert.equal(result.valid,true,result.errors.join('; '));
 });
}
