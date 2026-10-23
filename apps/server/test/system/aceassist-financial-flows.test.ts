import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {enforceDocumentConversion,enforceDocumentIssue,prepareDocumentLineMutation,recalculateDocumentLineTotals}
 from '../../src/system-files/nodes/DocumentFinancialGuard.js';

const id='11111111-1111-4111-8111-111111111111';
const invoiceId='22222222-2222-4222-8222-222222222222';
const customer='33333333-3333-4333-8333-333333333333';
const quoteLine={Quantity:2,UnitPrice:30,DiscountAmount:5,TaxAmount:6,
 LineTotal:61,Product:'44444444-4444-4444-8444-444444444444'};
const template={lineObject:'QuotationLine',quantityField:'Quantity',unitPriceField:'UnitPrice',
 discountField:'DiscountAmount',taxField:'TaxAmount',lineTotalField:'LineTotal',
 subtotalField:'Subtotal',discountTotalField:'DiscountAmount',taxTotalField:'TaxAmount',
 totalField:'Total'};
const conversion={...template,sourceObject:'Quotation',sourceField:'Id',lineParentField:'Quotation',
 statusField:'Status',approvedStatuses:['Accepted','Approved'],customerField:'Customer',
 targetSourceField:'Quotation',targetCustomerField:'Customer'};
const issue={...template,lineObject:'InvoiceLine',parentField:'Invoice',statusField:'Status',
 issuedStatus:'Issued',numberField:'InvoiceNumber',formatField:'DocumentNumber'};
function fake(input:{converted?:boolean;quoteStatus?:string;issued?:boolean;lines?:Array<Record<string,unknown>>;
 totals?:number;numberFormat?:string}={}){
 const queries:Array<{sql:string;params:unknown[]}>= [];
 const lines=input.lines??[quoteLine];
 const client={query:async(sql:string,params:unknown[]=[])=>{
  queries.push({sql,params});
  if(sql.includes('md_field_definitions'))return {
   rows:[{auto_number_format:input.numberFormat??'INV-{YYYY}-{000000}'}],rowCount:1};
  if(sql.includes('INSERT INTO md_auto_number_counters'))return {rows:[{sequence:'2'}],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const records={get:async(_tenant:string,_user:string,object:string)=>{
  if(object==='Quotation')return {Id:id,Customer:customer,
   Status:input.quoteStatus??'Accepted',Total:input.totals??61};
  return {Id:invoiceId,Status:input.issued?'Issued':'Draft',
   InvoiceNumber:input.issued?'INV-2026-000001':null};
 }};
 const recordQuery={find:async(_t:string,_u:string,object:string)=>{
  if(object==='Invoice')return input.converted?[{Id:invoiceId}]:[];
  return lines;
 }};
 const context={tenantId:'tenant',userId:'operator',
  node:{id:4,type:'Create Records',config:{object:'Invoice'}},
  client,records,recordQuery} as never;
 return {context,queries};
}
test('quote conversion validates and calculates line totals under a source lock',async()=>{
 const f=fake();
 const fields:Record<string,unknown>={Quotation:id,Status:'Draft',Name:'Invoice'};
 await enforceDocumentConversion(f.context,conversion,fields);
 assert.equal(fields.Customer,customer);
 assert.equal(fields.Subtotal,60);
 assert.equal(fields.DiscountAmount,5);
 assert.equal(fields.TaxAmount,6);
 assert.equal(fields.Total,61);
 assert.match(f.queries[0].sql,/pg_advisory_xact_lock/);
});
test('quote conversion rejects duplicates, unaccepted quotes and inconsistent line totals',async()=>{
 for(const fixture of [
  fake({converted:true}),fake({quoteStatus:'Draft'}),
  fake({lines:[{...quoteLine,LineTotal:70}]}),
  fake({totals:70}),fake({lines:[]})
 ]){
  await assert.rejects(enforceDocumentConversion(fixture.context,conversion,
   {Quotation:id}),/already exists|not been accepted|differs|disagrees|must have/);
 }
});
test('invoice issue verifies stored lines and allocates issued number once',async()=>{
 const f=fake();
 const fields:Record<string,unknown>={Status:'Issued'};
 await enforceDocumentIssue(f.context,issue,invoiceId,fields);
 assert.equal(fields.Total,61);
 assert.match(String(fields.InvoiceNumber),/^INV-\d{4}-000002$/);
 assert.ok(f.queries.some(q=>q.sql.includes('md_auto_number_counters')));
});
test('invoice issue rejects already issued record, bad line, forged number',async()=>{
 await assert.rejects(enforceDocumentIssue(fake({issued:true}).context,issue,invoiceId,
  {Status:'Issued'}),/already been issued/);
 await assert.rejects(enforceDocumentIssue(fake().context,issue,invoiceId,
  {Status:'Issued',InvoiceNumber:'fake'}),/system allocated/);
 await assert.rejects(enforceDocumentIssue(fake({lines:[]}).context,issue,invoiceId,
  {Status:'Issued'}),/must have/);
});
test('conversion and invoice issuance are installed as shared flow graphs, not direct APIs',()=>{
 const seed=readFileSync(new URL('../../src/app-seeders/aceassist-financial-flows.ts',import.meta.url),'utf8');
 assert.match(seed,/AceAssistConvertQuoteToInvoice/);
 assert.match(seed,/AceAssistIssueInvoice/);
 assert.match(seed,/documentConversion/);
 assert.match(seed,/documentIssue/);
 assert.match(seed,/AceAssistFinanceIssuer/);
 assert.match(seed,/md_validation_rules/);
 assert.doesNotMatch(seed,/INSERT INTO md_records|INSERT INTO md_record_values/);
});

test('Flow line guard computes LineTotal and updates parent totals after mutations',async()=>{
 const lineConfig={parentObject:'Invoice',parentField:'Invoice',quantityField:'Quantity',
  unitPriceField:'UnitPrice',discountField:'DiscountAmount',taxField:'TaxAmount',
  lineTotalField:'LineTotal',subtotalField:'Subtotal',discountTotalField:'DiscountAmount',
  taxTotalField:'TaxAmount',totalField:'Total',statusField:'Status',lockedStatuses:['Issued','PartPaid','Paid','PartiallyPaid'],numberField:'InvoiceNumber'};
 const writes:Array<{object:string;id:string;values:Record<string,unknown>}>=[];
 const line={Id:'55555555-5555-4555-8555-555555555555',Invoice:invoiceId,
  Quantity:2,UnitPrice:30,DiscountAmount:5,TaxAmount:6,LineTotal:70};
 const context={tenantId:'tenant',userId:'operator',
  node:{id:2,type:'Create Records',config:{object:'InvoiceLine'}},
  client:{query:async()=>({rows:[],rowCount:0})},
  records:{
   get:async(_tenant:string,_user:string,object:string)=>object==='InvoiceLine'?line:
    {Id:invoiceId,Status:'Draft'},
   update:async(_tenant:string,_user:string,object:string,id:string,values:Record<string,unknown>)=>{
    writes.push({object,id,values});return line;
   }
  },
  recordQuery:{find:async()=>[line]}
 } as never;
 const fields:Record<string,unknown>={Invoice:invoiceId,Quantity:2,UnitPrice:30,DiscountAmount:5,TaxAmount:6};
 const prepared=await prepareDocumentLineMutation(context,lineConfig,undefined,fields);
 assert.equal(fields.LineTotal,61);
 assert.equal(prepared.newParent,invoiceId);
 await recalculateDocumentLineTotals(context,lineConfig,invoiceId);
 assert.ok(writes.some(w=>w.object==='InvoiceLine'&&w.values.LineTotal===61));
 assert.ok(writes.some(w=>w.object==='Invoice'&&w.values.Subtotal===60&&
  w.values.DiscountAmount===5&&w.values.TaxAmount===6&&w.values.Total===61));
});
test('Flow line guard prevents changes to issued invoices',async()=>{
 const lineConfig={parentObject:'Invoice',parentField:'Invoice',quantityField:'Quantity',
  unitPriceField:'UnitPrice',discountField:'DiscountAmount',taxField:'TaxAmount',
  lineTotalField:'LineTotal',subtotalField:'Subtotal',discountTotalField:'DiscountAmount',
  taxTotalField:'TaxAmount',totalField:'Total',statusField:'Status',lockedStatuses:['Issued']};
 const line={Id:'55555555-5555-4555-8555-555555555555',Invoice:invoiceId,
  Quantity:1,UnitPrice:10,DiscountAmount:0,TaxAmount:0,LineTotal:10};
 const context={tenantId:'tenant',userId:'operator',
  node:{id:2,type:'Update Records',config:{object:'InvoiceLine'}},
  client:{query:async()=>({rows:[],rowCount:0})},
  records:{get:async(_tenant:string,_user:string,object:string)=>object==='InvoiceLine'?line:
   {Id:invoiceId,Status:'Issued'}},
  recordQuery:{find:async()=>[line]}
 } as never;
 await assert.rejects(prepareDocumentLineMutation(context,lineConfig,line.Id,{Quantity:2}),
  /cannot be changed after the financial document is issued/);
});

test('Flow line guard protects numbered invoices even if status later changes',async()=>{
 const lineConfig={parentObject:'Invoice',parentField:'Invoice',quantityField:'Quantity',
  unitPriceField:'UnitPrice',discountField:'DiscountAmount',taxField:'TaxAmount',
  lineTotalField:'LineTotal',subtotalField:'Subtotal',discountTotalField:'DiscountAmount',
  taxTotalField:'TaxAmount',totalField:'Total',statusField:'Status',
  lockedStatuses:['Issued','PartPaid','Paid','PartiallyPaid'],numberField:'InvoiceNumber'};
 const line={Id:'55555555-5555-4555-8555-555555555555',Invoice:invoiceId,
  Quantity:1,UnitPrice:10,DiscountAmount:0,TaxAmount:0,LineTotal:10};
 const context={tenantId:'tenant',userId:'operator',
  node:{id:2,type:'Update Records',config:{object:'InvoiceLine'}},
  client:{query:async()=>({rows:[],rowCount:0})},
  records:{get:async(_tenant:string,_user:string,object:string)=>object==='InvoiceLine'?line:
   {Id:invoiceId,Status:'Draft',InvoiceNumber:'INV-2026-000001'}},
  recordQuery:{find:async()=>[line]}
 } as never;
 await assert.rejects(prepareDocumentLineMutation(context,lineConfig,line.Id,{Quantity:2}),
  /cannot be changed after the financial document is issued/);
});

test('composite document guard rejects another parent line before mutation',async()=>{
 const lineConfig={parentObject:'Invoice',parentField:'Invoice',
  quantityField:'Quantity',unitPriceField:'UnitPrice',discountField:'DiscountAmount',
  taxField:'TaxAmount',lineTotalField:'LineTotal',subtotalField:'Subtotal',
  discountTotalField:'DiscountAmount',taxTotalField:'TaxAmount',totalField:'Total'};
 const line={Id:'55555555-5555-4555-8555-555555555555',Invoice:invoiceId,
  Quantity:1,UnitPrice:10,DiscountAmount:0,TaxAmount:0,LineTotal:10};
 const base={tenantId:'tenant',userId:'operator',
  node:{id:3,type:'Update Records',config:{
   object:'InvoiceLine',expectedParentId:'{!recordId}'}},
  client:{query:async()=>({rows:[],rowCount:0})},
  records:{get:async(_tenant:string,_user:string,object:string)=>
   object==='InvoiceLine'?line:{Id:invoiceId,Status:'Draft'}}};
 const forged={...base,evaluate:()=>id} as never;
 await assert.rejects(
  prepareDocumentLineMutation(forged,lineConfig,line.Id,{Quantity:2}),
  /does not belong to the selected document/);
 const authentic={...base,evaluate:()=>invoiceId} as never;
 const patch:Record<string,unknown>={Quantity:2};
 const updated=await prepareDocumentLineMutation(authentic,lineConfig,line.Id,patch);
 assert.equal(updated.newParent,invoiceId);
 assert.equal(patch.LineTotal,20);
});
