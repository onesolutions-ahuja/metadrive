import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sandboxPublicProps, sandboxSafeValue } from '../src/componentSandboxPolicy';

test('sandbox never forwards tokens, named credentials or nested secrets',()=>{
  const original = {
    label:'Safe', value:12, records:[{Name:'A',passwordHash:'hash',nested:{apiKey:'key',visible:true}}],
    properties:{password:'p',connector:{clientSecret:'secret',providerKey:'provider.reference',title:'safe'}},
    accessToken:'raw', namedCredentials:[{secret:'unsafe'}], onAction:()=>{}
  };
  const safe=sandboxPublicProps(original);
  assert.equal(safe.label,'Safe');assert.equal(safe.value,12);
  assert.equal((safe.records as any[])[0].Name,'A');
  assert.equal((safe.records as any[])[0].passwordHash,undefined);
  assert.equal(((safe.properties as any).connector as any).clientSecret,undefined);
  assert.equal((safe as any).accessToken,undefined);
  assert.equal((safe as any).namedCredentials,undefined);
  assert.equal((safe as any).onAction,undefined);
});
test('sandbox rejects inherited prototypes, cycles and unbounded arrays',()=>{
  const value:any={self:null,constructor:'bad',rows:Array.from({length:550},(_,i)=>i)};
  value.self=value;
  const clean=sandboxSafeValue(value) as any;
  assert.equal(clean.self,undefined);
  assert.equal(clean.constructor,undefined);
  assert.equal(clean.rows.length,500);
  assert.equal(sandboxSafeValue('x'.repeat(15000)), 'x'.repeat(10000));
});
