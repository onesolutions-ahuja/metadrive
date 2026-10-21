import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {validateFlowDraft} from '../../src/system-files/flow-validation.js';

const graphs=JSON.parse(readFileSync(fileURLToPath(new URL('../../../acetill/flows/payment-flows.v1.json',import.meta.url)),'utf8')) as Record<string,unknown>;
const rbac={require:async()=>undefined} as unknown as RbacEngine;
for(const apiName of ['AcetillPaymentCash','AcetillPaymentCard']){
 test(apiName+' graph passes shared Flow draft validation',async()=>{
  const validation=await validateFlowDraft(rbac,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',apiName,graphs[apiName]);
  assert.equal(validation.valid,true,validation.errors.join('; '));
 });
}
