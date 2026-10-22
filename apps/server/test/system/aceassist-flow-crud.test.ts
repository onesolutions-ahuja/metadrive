import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {ACEASSIST_CRUD_OBJECTS,ACEASSIST_EDITABLE_FIELDS} from '../../src/app-seeders/aceassist-crud-flows.js';
test('Ace Assist CRUD uses six existing Objects without duplicate engines',()=>{
 assert.deepEqual(ACEASSIST_CRUD_OBJECTS,['Appointment','Customer','Quotation','QuotationLine','Invoice','InvoiceLine']);
 assert.ok(ACEASSIST_EDITABLE_FIELDS.Appointment.includes('StartDateTime'));
 const code=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 assert.match(code,/type:'Get Records'/);
 assert.match(code,/recordSource:'fields'/);
 assert.match(code,/operation\+' Records'/);
 assert.match(code,/Flow:AceAssist/);
 assert.match(code,/if\(existing\.rowCount\)continue/);
 assert.doesNotMatch(code,/INSERT INTO md_records|INSERT INTO md_record_values/);
});
test('Ace Assist runtime never directly accesses CRUD APIs and uses tenant calendar',()=>{
 const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 const calendar=readFileSync(new URL('../../../aceassist/src/aceAssistCalendar.ts',import.meta.url),'utf8');
 assert.match(runtime,/\/flows\//);
 assert.doesNotMatch(runtime,/\/records\//);
 assert.match(runtime,/\/tenant\/business-calendar/);
 assert.match(runtime,/checkBusinessHours/);
 assert.match(calendar,/calendar\.holidays\.some/);
 assert.match(calendar,/calendar\.weeklyHours/);
});
