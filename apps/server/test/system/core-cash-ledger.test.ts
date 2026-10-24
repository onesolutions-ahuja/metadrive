import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {enforceManualPaymentGuard} from '../../src/system-files/nodes/RecordPaymentGuard.js';
const invoiceId='22222222-2222-4222-8222-222222222222';
const config={
 invoiceObject:'Invoice',paymentObject:'CashLedger',invoiceField:'Invoice',
 amountField:'Amount',methodField:'Method',statusField:'Status',cashMethod:'Cash',
 settledStatus:'Posted',referenceField:'Reference',invoiceStatusField:'Status',
 invoiceTotalField:'Total',invoicePaidField:'AmountPaid',invoiceNumberField:'InvoiceNumber',
 partialStatus:'PartPaid',paidStatus:'Paid',acceptedInvoiceStatuses:['Issued','PartPaid']
};
function fixture(amountPaid=0,entries:Record<string,unknown>[]=[]){
 const updates:Record<string,unknown>[]=[];
 const client={query:async()=>({rows:[],rowCount:1})};
 const context={
  tenantId:'tenant',userId:'trusted-cashier',
  node:{config:{object:'CashLedger'}},client,
  records:{
   get:async()=>({Id:invoiceId,Status:'Issued',InvoiceNumber:'INV-2026-001',
    Total:100,AmountPaid:amountPaid,Customer:'customer-1',CurrencyCode:'GBP'}),
   update:async(_t:string,_u:string,_o:string,_id:string,fields:Record<string,unknown>)=>{
    updates.push(fields);
   }
  },
  recordQuery:{find:async()=>entries}
 } as never;
 const fields:Record<string,unknown>={
  Invoice:invoiceId,Amount:40,Method:'Cash',Status:'Posted',
  Reference:'request-12345',Direction:'IN',TransactionType:'Receipt',
  User:'untrusted-user',TransactionDate:'2000-01-01',SourceApp:'UntrustedApp'
 };
 return {context,fields,updates};
}
test('CashLedger receipt uses server-authenticated user and server time',async()=>{
 const f=fixture();
 await enforceManualPaymentGuard(f.context,config,f.fields);
 assert.equal(f.fields.User,'trusted-cashier');
 assert.equal(f.fields.SourceApp,'AceAssist');
 assert.equal(f.fields.Customer,'customer-1');
 assert.equal(f.fields.CurrencyCode,'GBP');
 assert.notEqual(f.fields.TransactionDate,'2000-01-01');
 assert.deepEqual(f.updates,[{AmountPaid:40,Status:'PartPaid'}]);
});
test('CashLedger fails closed on legacy unallocated amount paid',async()=>{
 const f=fixture(20);
 await assert.rejects(enforceManualPaymentGuard(f.context,config,f.fields),
  /legacy or unreconciled/);
 assert.equal(f.updates.length,0);
});
test('CashLedger rejects replayed request and mismatched direction',async()=>{
 const f=fixture(40,[{Amount:40,Status:'Posted',Reference:'request-12345'}]);
 await assert.rejects(enforceManualPaymentGuard(f.context,config,f.fields),/already been/);
 const invalid=fixture();invalid.fields.Direction='OUT';
 await assert.rejects(enforceManualPaymentGuard(invalid.context,config,invalid.fields),
  /direction or type/);
});
test('CashLedger seeder and authorised Flow preserve permissions and use shared guard',()=>{
 const root=new URL('../../src/app-seeders/',import.meta.url);
 const seed=readFileSync(new URL('core-cash-ledger.ts',root),'utf8');
 const flow=readFileSync(new URL('core-cash-ledger-flows.ts',root),'utf8');
 assert.match(seed,/core-cash-ledger-v1/);
 assert.match(seed,/Invoice/);
 assert.match(seed,/TransactionDate/);
 assert.match(flow,/manualPaymentGuard/);
 assert.match(flow,/AceAssistCashier/);
 assert.doesNotMatch(flow,/INSERT INTO md_records|INSERT INTO md_record_values/);
});
