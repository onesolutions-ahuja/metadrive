import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {ACEASSIST_SCHEDULING_OBJECTS,seedAceAssistSchedulingObjects}
 from '../../src/app-seeders/aceassist-scheduling-objects.js';
import {ACEASSIST_DOCUMENT_SERIES,seedAceAssistDocumentSeries}
 from '../../src/app-seeders/aceassist-document-series.js';
import {seedAceAssistCommunicationTemplates}
 from '../../src/app-seeders/aceassist-communication-templates.js';

test('internal scheduling provisions Objects without duplicating User records',()=>{
 assert.deepEqual(ACEASSIST_SCHEDULING_OBJECTS.map(x=>x.api),
  ['BookableResource','StaffAvailability','AvailabilityException']);
 for(const item of ACEASSIST_SCHEDULING_OBJECTS){
  assert.ok(item.fields.some(field=>field[0]==='Name'));
  assert.ok(!item.fields.some(field=>field[0]==='Staff'));
 }
 const code=readFileSync(new URL('../../src/app-seeders/aceassist-scheduling-objects.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/DELETE FROM md_records|UPDATE md_field_definitions/);
 assert.match(code,/ON CONFLICT DO NOTHING/);
});
test('serialisation delegates to shared Object Manager Auto Number field',()=>{
 assert.deepEqual(ACEASSIST_DOCUMENT_SERIES.map(x=>x.object),['Quotation','Invoice']);
 assert.ok(ACEASSIST_DOCUMENT_SERIES.every(x=>x.format.includes('{YYYY}')&&x.format.includes('{000000}')));
 const code=readFileSync(new URL('../../src/app-seeders/aceassist-document-series.ts',import.meta.url),'utf8');
 assert.match(code,/data_type,auto_number_format,is_unique/);
 assert.match(code,/ON CONFLICT\(tenant_id,object_api,api_name\) DO NOTHING/);
});
test('WhatsApp and tenant-configurable email HTTP Callout Flows remain inactive until authorised provider configuration',()=>{
 const code=readFileSync(new URL('../../src/app-seeders/aceassist-communication-templates.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/actionType:'Send Email'/);
 assert.match(code,/type:'HTTP Callout'/);
 const emailFlow=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 assert.match(emailFlow,/AceAssistEmailHttpCallout/);
 assert.doesNotMatch(emailFlow,/AceAssistSendEmail/);
 assert.match(code,/status:'Draft'/);
 assert.match(code,/VALUES\(\$1,\$2,\$3,'Autolaunched Flow',1,false\)/);
});
test('new booking paths only use internal tenant users and shared Flow guards',()=>{
 const server=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 assert.match(server,/V3/);
 assert.match(server,/availabilityGuard/);
 assert.match(server,/AssignedTo/);
 assert.doesNotMatch(server,/publicBooking|guestBooking|anonymousBooking/);
 assert.match(browser,/Safe booking Flow V3 is unavailable/);
 assert.match(browser,/StaffAvailability/);
 assert.match(browser,/AceAssistLoad/);
});
void seedAceAssistSchedulingObjects;
void seedAceAssistDocumentSeries;
void seedAceAssistCommunicationTemplates;

test('WhatsApp booking is a disabled verified-provider orchestration with dedupe and RBAC',()=>{
 const code=readFileSync(new URL('../../src/app-seeders/aceassist-whatsapp-booking-flow.ts',import.meta.url),'utf8');
 assert.match(code,/AceAssistWhatsAppCreateBooking/);
 assert.match(code,/uniqueInputGuard/);
 assert.match(code,/availabilityGuard:ACEASSIST_BOOKING_AVAILABILITY/);
 assert.match(code,/VALUES\(\$1,\$2,\$3,'Autolaunched Flow',1,false\)/);
 assert.match(code,/AceAssistWhatsAppBookingService/);
 assert.doesNotMatch(code,/INSERT INTO md_records|publicBooking/);
});
