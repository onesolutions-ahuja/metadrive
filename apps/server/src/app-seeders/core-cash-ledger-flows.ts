import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

/** Shared cash receipt Flow. Enforcement runs inside the same record transaction
 * through the platform's SQL-backed manualPaymentGuard; never trust client totals.
 */
export const CASH_LEDGER_RECEIPT_API='AceAssistRecordCashLedgerV1';
export const CASH_LEDGER_LOAD_API='AceAssistLoadCashLedger';
export const CASH_LEDGER_REVERSAL_API='AceAssistReverseCashLedgerV1';
const guard={
 invoiceObject:'Invoice',paymentObject:'CashLedger',invoiceField:'Invoice',
 amountField:'Amount',methodField:'Method',statusField:'Status',cashMethod:'Cash',
 settledStatus:'Posted',referenceField:'Reference',invoiceStatusField:'Status',
 invoiceTotalField:'Total',invoicePaidField:'AmountPaid',invoiceNumberField:'InvoiceNumber',
 partialStatus:'PartPaid',paidStatus:'Paid',acceptedInvoiceStatuses:['Issued','PartPaid']
};
const resources=[
 {name:'recordId',type:'Variable',dataType:'Text',availableForInput:true},
 {name:'amount',type:'Variable',dataType:'Number',availableForInput:true},
 {name:'requestId',type:'Variable',dataType:'Text',availableForInput:true},
 {name:'cashLedgerId',type:'Variable',dataType:'Text',availableForOutput:true}
];
const receipt={
 apiName:CASH_LEDGER_RECEIPT_API,
 label:'OneEngine - Post verified cash receipt to shared ledger',
 appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
 resources,elements:[
  {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
  {id:2,type:'Create Records',label:'Validate and post cash receipt',config:{
   object:'CashLedger',recordSource:'fields',manualPaymentGuard:guard,
   resultVariable:'cashLedgerId',fieldValues:[
    {field:'Name',value:'Cash receipt'},
    {field:'Invoice',value:'{!recordId}'},
    {field:'Amount',value:'{!amount}'},
    {field:'Method',value:'Cash'},
    {field:'Direction',value:'IN'},
    {field:'TransactionType',value:'Receipt'},
    {field:'Status',value:'Posted'},
    {field:'Reference',value:'{!requestId}'}
   ]}},
  {id:3,type:'End',label:'End',config:{}}
 ],connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'}]
};
const reversal={
 apiName:CASH_LEDGER_REVERSAL_API,label:'OneEngine - Reverse a posted cash receipt',
 appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
 resources:[
  {name:'originalId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'requestId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'cashLedgerId',type:'Variable',dataType:'Text',availableForOutput:true}
 ],
 elements:[
  {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
  {id:2,type:'Create Records',label:'Validate and reverse cash receipt',config:{
   object:'CashLedger',recordSource:'fields',cashReversalGuard:{version:1},
   resultVariable:'cashLedgerId',fieldValues:[
    {field:'Name',value:'Cash receipt reversal'},
    {field:'ReversalOf',value:'{!originalId}'},
    {field:'Amount',value:0},
    {field:'Invoice',value:null},
    {field:'Method',value:'Cash'},
    {field:'Direction',value:'OUT'},
    {field:'TransactionType',value:'Refund'},
    {field:'Status',value:'Posted'},
    {field:'Reference',value:'{!requestId}'}
   ]}},
  {id:3,type:'End',label:'Done',config:{}}
 ],
 connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'}]
};
const load={
 apiName:CASH_LEDGER_LOAD_API,label:'OneEngine - List authorised cash ledger entries',
 appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
 resources:[{name:'cashLedgerRecords',type:'Record Collection',dataType:'CashLedger',availableForOutput:true}],
 elements:[
  {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
  {id:2,type:'Get Records',label:'Authorised ledger entries',config:{
   object:'CashLedger',recordLimit:'all',outputVariable:'cashLedgerRecords'}},
  {id:3,type:'End',label:'Done',config:{}}
 ],connectors:[{from:1,to:2,kind:'normal',label:'Next'},{from:2,to:3,kind:'normal',label:'Next'}]
};
export async function seedCashLedgerFlows(client:PoolClient,tenantId:string):Promise<number>{
 const {rowCount}=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
  [tenantId,'CashLedger']);
 if(!rowCount)return 0;
 let created=0;
 for(const graph of [receipt,reversal,load]){
  const prior=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenantId,graph.apiName]);
  if(!prior.rowCount){
   const {rows}=await client.query<{id:string}>(`INSERT INTO md_flow_definitions
    (tenant_id,api_name,label,flow_type,version,active)
    VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
    [tenantId,graph.apiName,graph.label]);
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',entries);
   for(const e of entries)await client.query(`INSERT INTO md_flow_editor_values
    (tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,[tenantId,rows[0].id,e.path,e.kind,e.text]);
   created++;
  }
 }
 // Receipt permissions belong only to the separately assigned cashier set.
 // Not granting write access to AceAssistUser prevents arbitrary posting.
 const cashierRights=[
  ['Flow:'+CASH_LEDGER_RECEIPT_API,'execute'],['Flow:'+CASH_LEDGER_REVERSAL_API,'execute'],['CashLedger','create'],['CashLedger','read'],
  ['Invoice','read'],['Invoice','edit'],
  ...['AmountPaid','Status'].flatMap(api=>[['Invoice.'+api,'read'],['Invoice.'+api,'edit']]),
  ...['Total','InvoiceNumber','Customer','CurrencyCode'].map(api=>['Invoice.'+api,'read']),
  ...['Name','Invoice','Amount','Method','Direction','TransactionType','Status','Reference',
      'User','TransactionDate','SourceApp','Customer','CurrencyCode','ReversalOf']
     .flatMap(api=>[['CashLedger.'+api,'read'],['CashLedger.'+api,'create']])
 ];
 const userRights=[['Flow:'+CASH_LEDGER_LOAD_API,'execute']];
 for(const [policy,rights] of [['AceAssistCashier',cashierRights],['AceAssistUser',userRights]] as const)
  for(const [resource,action] of rights)await client.query(`INSERT INTO md_permission_rules
   (tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name=$4 ON CONFLICT DO NOTHING`,
   [tenantId,resource,action,policy]);
 return created;
}
