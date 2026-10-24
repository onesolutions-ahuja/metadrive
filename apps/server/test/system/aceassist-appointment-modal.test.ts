import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('Ace Assist record editors use dialogs and user/customer/product Flow lookups',()=>{
 const src=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 const picker=readFileSync(new URL('../../../aceassist/src/AppointmentFields.tsx',import.meta.url),'utf8');
 const seeder=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 assert.match(src,/role="dialog" aria-modal="true"/);
 assert.match(src,/<SearchRecord label="Assigned to"/);
 assert.match(src,/<SearchRecord label="Customer"/);
 assert.match(src,/<SearchRecord label="Service"/);
 assert.match(src,/<DateSlotPicker label=/);
 assert.match(src,/\{busy\?'Saving…':editing==='Delete'\?'Delete':'Save'\}/);
 assert.doesNotMatch(src,/Save through Flow/);
 assert.match(src,/\/auth\/me/);
 // Appointment buttons must accept the V3 actions that the tenant seeder grants.
  assert.ok(src.includes("canDynamic('Create',current.object)"));
  assert.ok(src.includes("canDynamic('Update',current.object)"));
  assert.ok(src.includes("documentFlow('Create',current.object)"));
  assert.ok(src.includes("documentFlow('Update',current.object)"));
 // Line-item lookups must follow the active editor, including Product, rather than
 // relying on lookup state populated by a previously visited tab.
 assert.match(src,/const lookupFor=editing\?editingObject:current\.object/);
 assert.match(src,/\['QuotationLine','InvoiceLine'\]\.includes\(lookupFor\)\?\['Product'\]:\[\]/);
 assert.match(picker,/role="combobox"/);
 assert.match(picker,/\+ Add new/);
 assert.match(seeder,/\['User','Product'\]/);
 assert.match(seeder,/makeGraph\(lookupObject,'Load',\[\]\)/);
 assert.doesNotMatch(src,/\/records\//);
});

test('Ace Assist financial line CRUD is guarded and recalculates parent totals in Flows',()=>{
 const guard=readFileSync(new URL('../../src/system-files/nodes/DocumentFinancialGuard.ts',import.meta.url),'utf8');
 const create=readFileSync(new URL('../../src/system-files/nodes/CreateRecordsNode.ts',import.meta.url),'utf8');
 const update=readFileSync(new URL('../../src/system-files/nodes/UpdateRecordsNode.ts',import.meta.url),'utf8');
 const remove=readFileSync(new URL('../../src/system-files/nodes/DeleteRecordsNode.ts',import.meta.url),'utf8');
 const crud=readFileSync(new URL('../../src/app-seeders/aceassist-crud-flows.ts',import.meta.url),'utf8');
 const financial=readFileSync(new URL('../../src/app-seeders/aceassist-financial-flows.ts',import.meta.url),'utf8');
 assert.match(guard,/export async function prepareDocumentLineMutation/);
 assert.match(guard,/export async function recalculateDocumentLineTotals/);
 assert.match(create,/prepareDocumentLineMutation\(context,lineTotalsConfig,undefined,fields\)/);
 assert.match(create,/recalculateDocumentLineTotals\(context,lineTotalsConfig,lineMutation\.newParent\)/);
 assert.match(update,/recalculateDocumentLineTotals\(context,lineTotalsConfig,lineMutation\.oldParent\)/);
 assert.match(remove,/recalculateDocumentLineTotals\(context,lineTotalsConfig,lineMutation\.oldParent/);
 assert.match(crud,/documentLineTotals:lineTotals\(objectApi\)/);
 assert.match(financial,/documentLineTotals:\{parentObject:'Invoice',parentField:'Invoice'/);
});


test('new appointment hides post-booking controls and retains tenant calendar defaults',()=>{
 const src=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');
 assert.match(src,/editing!=='Create'\|\|!\['CompletedAt','ExternalBookingId','Resource','Status','TimeZone','ReminderAt','Name','EndDateTime','Service','ServiceProduct'\]/);
 assert.match(src,/values\.Status='Scheduled'/);
 assert.match(src,/payload\.Status='Scheduled'/);
 assert.match(src,/payload\.TimeZone=hours\?\.timezone/);
 assert.match(src,/payload\.Name=/);
 assert.match(src,/Appointment date and time/);
 assert.match(src,/Contact person \(optional\)/);
 assert.match(src,/label:'Address'/);
 assert.match(src,/dataType:'textarea'/);
 assert.match(src,/checkBusinessHours\(hours,form\.StartDateTime/);
});
