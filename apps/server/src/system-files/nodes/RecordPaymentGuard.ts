import type {FlowNodeContext} from './NodeContext.js';

const valid=/^[A-Za-z][A-Za-z0-9_]*$/;
type Settings={invoiceObject:string;paymentObject:string;invoiceField:string;
 amountField:string;methodField:string;statusField:string;cashMethod:string;
 settledStatus:string;referenceField:string;invoiceStatusField:string;
 invoiceTotalField:string;invoicePaidField:string;
 invoiceNumberField:string;partialStatus:string;paidStatus:string;
 acceptedInvoiceStatuses:string[]};
const money=(value:unknown):number=>{
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*100-Math.round(n*100))>0.00001)
  throw Error('Invalid payment amount');
 return Math.round(n*100);
};
/** Shared SQL-backed settlement check; configuration is supplied by the calling
 * Flow, never hardcoded to an app. Funds are not collected here.
 */
export async function enforceManualPaymentGuard(context:FlowNodeContext,raw:unknown,
 fields:Record<string,unknown>):Promise<void>{
 if(raw===null||raw===undefined)return;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid payment Flow metadata');
 const config=raw as unknown as Settings;
 for(const name of ['invoiceObject','paymentObject','invoiceField','amountField',
  'methodField','statusField','referenceField','invoiceStatusField','invoiceTotalField',
  'invoicePaidField','invoiceNumberField','partialStatus','paidStatus'] as const){
  const v=config[name];if(typeof v!=='string'||!valid.test(v))
   throw Error('Invalid payment Flow field mapping: '+name);
 }
 if(typeof config.cashMethod!=='string'||!config.cashMethod||typeof config.settledStatus!=='string'
  ||!Array.isArray(config.acceptedInvoiceStatuses)
  ||!config.acceptedInvoiceStatuses.length||config.acceptedInvoiceStatuses.length>8)
  throw Error('Invalid payment Flow policy');
 if(String(context.node.config.object)!==config.paymentObject)
  throw Error('Payment Flow Object mismatch');
 const id=fields[config.invoiceField];
 const paymentRef=fields[config.referenceField];
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))
  throw Error('Payment must reference a valid invoice');
 if(typeof paymentRef!=='string'||paymentRef.length<8||paymentRef.length>128)
  throw Error('Payment needs an idempotency reference');
 if(fields[config.methodField]!==config.cashMethod
   ||fields[config.statusField]!==config.settledStatus)
  throw Error('Only authorised cash settlement is supported by this Flow');
 if(config.paymentObject==='CashLedger'){
  if(fields.Direction!=='IN'||fields.TransactionType!=='Receipt')
   throw Error('Cash ledger receipt direction or type is invalid');
  // Actor and timestamp are trusted server values; ignore caller-supplied identity.
  fields.User=context.userId;
  fields.TransactionDate=new Date().toISOString();
  fields.SourceApp='AceAssist';
 }
 const received=money(fields[config.amountField]);
 if(received<=0)throw Error('Payment amount must be positive');
 await context.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
  [context.tenantId+':financial-invoice:'+id]);
 const invoice=await context.records.get(context.tenantId,context.userId,
  config.invoiceObject,id,context.client);
 if(!config.acceptedInvoiceStatuses.includes(String(invoice[config.invoiceStatusField]??''))
   ||!invoice[config.invoiceNumberField])
  throw Error('An issued, numbered invoice is required for settlement');
 if(config.paymentObject==='CashLedger'){
  fields.Customer=invoice.Customer??null;
  fields.CurrencyCode=invoice.CurrencyCode??null;
 }
 const outstanding=money(invoice[config.invoiceTotalField]);
 const entries=await context.recordQuery.find(context.tenantId,context.userId,
  config.paymentObject,[{field:config.invoiceField,operator:'Equals',value:id}],
  undefined,{limit:200},context.client);
 if(entries.length===200)throw Error('Payment history exceeds the safe query limit; reconcile before accepting more payments');
 const existing=entries.filter(entry=>entry[config.statusField]===config.settledStatus);
 if(existing.some(entry=>entry[config.referenceField]===paymentRef))
  throw Error('This payment has already been recorded');
 const paid=existing.reduce((sum,p)=>sum+money(p[config.amountField]),0);
 if(config.paymentObject==='CashLedger'&&money(invoice[config.invoicePaidField]??0)!==paid)
  throw Error('Invoice has legacy or unreconciled payments; reconcile before posting to CashLedger');
 if(paid+received>outstanding)throw Error('Payment exceeds invoice outstanding balance');
 const totalPaid=(paid+received)/100;
 const settled=paid+received===outstanding;
 await context.records.update(context.tenantId,context.userId,config.invoiceObject,id,{
  [config.invoicePaidField]:totalPaid,
  [config.invoiceStatusField]:settled?config.paidStatus:config.partialStatus
 },undefined,context.client);
}
