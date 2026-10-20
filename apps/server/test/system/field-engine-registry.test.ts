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

import {validateEmailField} from '../../src/field-engine/types/EmailField.js';
import {validatePhoneField} from '../../src/field-engine/types/PhoneField.js';
import {validateUrlField} from '../../src/field-engine/types/UrlField.js';
import {normalizeDateField} from '../../src/field-engine/types/DateField.js';
import {normalizeDateTimeField} from '../../src/field-engine/types/DateTimeField.js';
import {normalizeTimeField} from '../../src/field-engine/types/TimeField.js';

test('extracted field validators preserve existing typed Record Engine rules',()=>{
 assert.doesNotThrow(()=>validateEmailField('user@example.org','Email'));
 assert.throws(()=>validateEmailField('not-an-email','Email'),/Invalid email field/);
 assert.doesNotThrow(()=>validatePhoneField('+44 20 1234 5678','Phone'));
 assert.throws(()=>validatePhoneField('INVALID','Phone'),/Invalid phone field/);
 assert.doesNotThrow(()=>validateUrlField('https://example.org','Website'));
 assert.throws(()=>validateUrlField('ftp://example.org','Website'),/Invalid URL field/);
 assert.equal(normalizeDateField('2026-10-20','Day'),'2026-10-20');
 assert.throws(()=>normalizeDateField('2026-02-30','Day'),/Invalid date field/);
 assert.equal(normalizeTimeField('09:05','Clock'),'09:05:00.000');
 assert.throws(()=>normalizeTimeField('25:01','Clock'),/Invalid time field/);
 assert.equal(normalizeDateTimeField('2026-10-20T10:00:00+01:00','When'),'2026-10-20T09:00:00.000Z');
});
