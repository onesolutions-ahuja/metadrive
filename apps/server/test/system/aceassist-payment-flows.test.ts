import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {enforceManualPaymentGuard} from '../../src/system-files/nodes/RecordPaymentGuard.js';
const invoiceId='22222222-2222-4222-8222-222222222222';
const paymentConfig={
 invoiceObject:'Invoice',paymentObject:'Payment',invoiceField:'Invoice',amountField:'Amount',
 methodField:'Method',statusField:'Status',cashMethod:'Cash',settledStatus:'Settled',
 referenceField:'Reference',invoiceStatusField:'Status',invoiceTotalField:'Total',
 invoicePaidField:'AmountPaid',invoiceNumberField:'InvoiceNumber',
 partialStatus:'PartPaid',paidStatus:'Paid',acceptedInvoiceStatuses:['Issued','PartPaid']
};
function fixture(options:{paid?:number;amount?:number;invoiceStatus?:string;
 existingRef?:string;method?:string;number?:string|null}={}){
 const updates:Array<Record<string,unknown>>=[];
 const queries:string[]=[];
 const payments=options.paid?[{Amount:options.paid,Status:'Settled',
  Reference:options.existingRef??'prior-request'}]:[];
 const context={tenantId:'tenant',userId:'cashier',node:{config:{object:'Payment'}},
  client:{query:async(sql:string)=>{queries.push(sql);return {rows:[],rowCount:1};}},
  records:{
   get:async()=>({Id:invoiceId,Status:options.invoiceStatus??'Issued',
    Total:100,InvoiceNumber:options.number===undefined?'INV-2026-1':options.number}),
   update:async(_t:string,_u:string,_o:string,_id:string,values:Record<string,unknown>)=>
    {updates.push(values);}
  },
  recordQuery:{find:async()=>payments}
 } as never;
 const fields:Record<string,unknown>={Invoice:invoiceId,Amount:options.amount??40,
  Method:options.method??'Cash',Status:'Settled',Reference:'cash-request-02'};
 return {context,fields,updates,queries};
}
test('cash payment settles invoice partially and updates balance using shared RecordEngine',async()=>{
 const f=fixture({amount:40});
 await enforceManualPaymentGuard(f.context,paymentConfig,f.fields);
 assert.deepEqual(f.updates,[{AmountPaid:40,Status:'PartPaid'}]);
 assert.match(f.queries[0],/pg_advisory_xact_lock/);
});
test('second cash payment settles outstanding balance and marks paid',async()=>{
 const f=fixture({paid:40,amount:60});
 await enforceManualPaymentGuard(f.context,paymentConfig,f.fields);
 assert.deepEqual(f.updates,[{AmountPaid:100,Status:'Paid'}]);
});
test('cash flow rejects overpayment, duplicate request, drafts and unverified card settlement',async()=>{
 const scenarios=[
  fixture({paid:80,amount:30}),fixture({paid:50,existingRef:'cash-request-02'}),
  fixture({invoiceStatus:'Draft'}),fixture({method:'Card'}),fixture({number:null})
 ];
 for(const f of scenarios)await assert.rejects(
  enforceManualPaymentGuard(f.context,paymentConfig,f.fields),
  /exceeds|already been|issued|Only authorised/);
});
test('cash settlement uses tenant metadata and cash-only policy without direct app CRUD',()=>{
 const flow=readFileSync(new URL('../../src/app-seeders/aceassist-payment-flows.ts',import.meta.url),'utf8');
 assert.match(flow,/AceAssistRecordCashPayment/);
 assert.match(flow,/manualPaymentGuard/);
 assert.match(flow,/AceAssistCashier/);
 assert.match(flow,/PaymentImmutableOnceCreated/);
 assert.doesNotMatch(flow,/INSERT INTO md_records|INSERT INTO md_record_values/);
});

test('cash settlement fails closed at payment query pagination boundary',async()=>{
 const f=fixture();
 (f.context as unknown as {recordQuery:{find:()=>Promise<Record<string,unknown>[]>}}).recordQuery.find=async()=>
  Array.from({length:200},(_,i)=>({Amount:1,Status:'Settled',Reference:'previous-'+i}));
 await assert.rejects(enforceManualPaymentGuard(f.context,paymentConfig,f.fields),/safe query limit/);
 assert.deepEqual(f.updates,[]);
});
