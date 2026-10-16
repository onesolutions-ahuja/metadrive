import test from 'node:test';
import assert from 'node:assert/strict';
import { audit } from './audit-one-component-migration.mjs';

test('40 One definitions have distinct API names, supported surfaces and configuration',()=>{
 const result=audit();
 assert.equal(result.counts.oneComponents,40);
 assert.deepEqual(result.failures,[]);
 assert.ok(result.commonProperties.includes('actionFlowApiName'));
 assert.ok(result.commonProperties.includes('fieldApiName'));
});
test('migration map never authorises automated replacement',()=>{
 const result=audit();
 assert.ok(result.mapping.length>=3);
 assert.ok(result.mapping.every(m=>m.automaticReplacementAllowed===false));
 assert.ok(result.mapping.every(m=>m.disposition==='manual review required'));
});
test('source reference scan distinguishes source use from tenant usage',()=>{
 const result=audit({sources:[{path:'test.ts',content:'Custom:SystemPanel and OneCard'}]});
 assert.deepEqual(result.references.find(r=>r.apiName==='SystemPanel').sourceReferences,['test.ts']);
 assert.deepEqual(result.references.find(r=>r.apiName==='OneCard').sourceReferences,['test.ts']);
 assert.equal(result.references.find(r=>r.apiName==='OneCard').liveTenantReferences,'NOT_INSPECTED');
});
