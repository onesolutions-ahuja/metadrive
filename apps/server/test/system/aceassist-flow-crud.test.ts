import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {ACEASSIST_CRUD_OBJECTS,ACEASSIST_EDITABLE_FIELDS} from '../../src/app-seeders/aceassist-crud-flows.js';
test('Ace Assist CRUD uses six existing Objects without duplicate engines',()=>{
 assert.deepEqual(ACEASSIST_CRUD_OBJECTS,['Appointment','Customer','Quotation','QuotationLine','Invoice','InvoiceLine']);
 assert.ok(ACEASSIST_EDITABLE_FIELDS.Appointment.includes('StartDateTime'));
 const code=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 assert.match(code,/operation==='Load'\?'Get Records'/);
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

test('Ace Assist V2 collection mutations use shared record engine with field permissions',()=>{
 const flows=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 const update=readFileSync(new URL('../../src/system-files/nodes/UpdateRecordsNode.ts',import.meta.url),'utf8');
 const validator=readFileSync(new URL('../../src/flow-engine/FlowValidator.ts',import.meta.url),'utf8');
 assert.match(flows,/makeDynamicGraph/);
 assert.match(flows,/isCollection:true,availableForInput:true/);
 assert.match(flows,/if\(found.rowCount\)continue/);
 assert.match(update,/records.update\(tenantId,userId,objectApi/);
 assert.match(validator,/Record-sourced Update Records/);
});

test('Ace Assist field controls map standard Object Manager field types and use notifications',()=>{
 const control=readFileSync(new URL('../../../web/src/core/metadata/Fields/RecordFieldInput.tsx',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 assert.match(control,/raw==='checkbox'/);
 assert.match(control,/type="checkbox"/);
 assert.match(control,/field.picklistValues/);
 assert.match(runtime,/canDynamic/);
 assert.match(runtime,/recordsInput/);
 assert.match(runtime,/NotificationBell/);
});

test('AceAssist booking updates seed native record-trigger notifications',()=>{
 const source=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 assert.match(source,/AceAssistAppointmentChanged/);
 assert.match(source,/syncFlowTriggerSubscription/);
 assert.match(source,/\{!\$User\.Id\}/);
 assert.match(source,/Notification failure/);
});
