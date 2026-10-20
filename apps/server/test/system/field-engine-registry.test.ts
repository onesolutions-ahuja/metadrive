import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldDefinitions,getFieldType} from '../../src/field-engine/FieldRegistry.js';
import {requireFieldType,resolveFieldType} from '../../src/field-engine/FieldDispatcher.js';
import {validateFieldTypeMetadata} from '../../src/field-engine/FieldValidator.js';
import {formatAutoNumberValue} from '../../src/field-engine/FieldFormatter.js';

test('all 23 requested field descriptors exist with unique names',()=>{
 assert.equal(fieldDefinitions.length,23);
 assert.equal(new Set(fieldDefinitions.map(item=>item.name)).size,23);
 for(const descriptor of fieldDefinitions)assert.equal(getFieldType(descriptor.name),descriptor);
});

test('reference relationship metadata selects Lookup or Master Detail safely',()=>{
 assert.equal(resolveFieldType('reference','Lookup')?.name,'LookupField');
 assert.equal(resolveFieldType('reference','Master-Detail')?.name,'MasterDetailField');
 assert.equal(resolveFieldType('reference')?.name,'LookupField');
 assert.equal(validateFieldTypeMetadata('reference','Master-Detail'),true);
});

test('file and image descriptors use shared services instead of inventing SQL data types',()=>{
 assert.deepEqual([getFieldType('FileField')?.dataType,getFieldType('ImageField')?.dataType],[null,null]);
 assert.equal(getFieldType('FileField')?.storage,'file-service');
 assert.equal(getFieldType('ImageField')?.storage,'media-service');
});

test('unknown metadata types fail closed and shared formatter preserves auto number behaviour',()=>{
 assert.equal(validateFieldTypeMetadata('unregistered-type'),false);
 assert.throws(()=>requireFieldType('unregistered-type'),/Unsupported field metadata type/);
 assert.equal(formatAutoNumberValue('INV-{0000}',23,2026),'INV-0023');
});
