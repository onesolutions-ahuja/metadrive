import {tenantCreateFieldDefinitions} from '../apps/web/src/adminTenantFieldMetadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {appManagerFieldDefinitions,validateAppManagerField} from '../apps/web/src/adminAppFieldMetadata';
test('App Manager fields use one ordered metadata source with independent properties',()=>{
 assert.deepEqual(appManagerFieldDefinitions.map(x=>x.propertyKey),['label','apiName','brandColor','description']);
 assert.ok(appManagerFieldDefinitions.every(x=>x.label&&x.kind));
 assert.equal(new Set(appManagerFieldDefinitions.map(x=>x.propertyKey)).size,4);
});
test('metadata property validation applies to bound App Manager controls',()=>{
 assert.equal(validateAppManagerField('apiName','Sales_Order'),null);
 assert.ok(validateAppManagerField('apiName','bad name'));
 assert.equal(validateAppManagerField('brandColor','#abcdef'),null);
 assert.ok(validateAppManagerField('brandColor','not-a-colour'));
 assert.ok(validateAppManagerField('label',''));
 assert.ok(validateAppManagerField('description','x'.repeat(501)));
});

test('tenant administration uses metadata-driven secure provisioning fields',()=>{
 assert.deepEqual(tenantCreateFieldDefinitions.map(x=>x.key),
 ['tenantId','tenantName','adminName','email','password','developerDomain']);
 assert.equal(tenantCreateFieldDefinitions.find(x=>x.key==='password')?.inputType,'password');
 assert.equal(tenantCreateFieldDefinitions.find(x=>x.key==='password')?.minLength,12);
 assert.equal(tenantCreateFieldDefinitions.find(x=>x.key==='tenantId')?.pattern,'[A-Za-z0-9][A-Za-z0-9_-]{1,62}');
});
