import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {enforceManualPaymentGuard,enforceCashLedgerReversal} from '../../src/system-files/nodes/RecordPaymentGuard.js';
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
  recordQuery:{find:async(_t:string,_u:string,object:string)=>object==='Payment'?[]:entries}
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
  /unreconciled/);
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

test('cash receipt reversal appends an OUT posting and decreases invoice paid total',async()=>{
 const changes:Record<string,unknown>[]=[];
 const queries:string[]=[];
 const invoiceId='22222222-2222-4222-8222-222222222222';
 const originalId='33333333-3333-4333-8333-333333333333';
 const context={
  tenantId:'t',userId:'cashier',node:{config:{object:'CashLedger'}},
  client:{query:async(sql:string)=>{queries.push(sql);return {rows:[]};}},
  records:{
   get:async(_t:string,_u:string,object:string)=>
    object==='CashLedger'?{Invoice:invoiceId,Amount:40,Direction:'IN',
     TransactionType:'Receipt',Status:'Posted',Method:'Cash'}:
    {AmountPaid:40,Total:100,Customer:'customer',CurrencyCode:'GBP'},
   update:async(_t:string,_u:string,_object:string,_id:string,value:Record<string,unknown>)=>
    {changes.push(value);}
  },
  recordQuery:{find:async(_t:string,_u:string,object:string)=>object==='Payment'?[]:[{Id:originalId,Amount:40,Direction:'IN',
   TransactionType:'Receipt',Status:'Posted',Method:'Cash',Reference:'old-request'}]}
 } as never;
 const fields:Record<string,unknown>={ReversalOf:originalId,Reference:'refund-request-001',
  Direction:'OUT',TransactionType:'Refund',Status:'Posted',Method:'Cash',Amount:0};
 await enforceCashLedgerReversal(context,{version:1},fields);
 assert.deepEqual(changes,[{AmountPaid:0,Status:'Issued'}]);
 assert.equal(fields.Amount,40);
 assert.equal(fields.User,'cashier');
 assert.ok(queries.some(query=>query.includes('cash_ledger_guarded')));
});
test('CashLedger reversal flow is explicit and permission-scoped',()=>{
 const source=readFileSync(new URL('../../src/app-seeders/core-cash-ledger-flows.ts',import.meta.url),'utf8');
 assert.match(source,/AceAssistReverseCashLedgerV1/);
 assert.match(source,/cashReversalGuard/);
 assert.match(source,/AceAssistCashier/);
});

test('CashLedger reconciles existing settled Payment without double-posting',async()=>{
 const f=fixture(30);
 (f.context as unknown as {recordQuery:{find:(t:string,u:string,o:string)=>Promise<Record<string,unknown>[]>}})
  .recordQuery.find=async(_t,_u,object)=>object==='Payment'
   ?[{Status:'Settled',Amount:30}]:[];
 await enforceManualPaymentGuard(f.context,config,f.fields);
 assert.deepEqual(f.updates,[{AmountPaid:70,Status:'PartPaid'}]);
});
