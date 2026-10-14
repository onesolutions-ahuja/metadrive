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
