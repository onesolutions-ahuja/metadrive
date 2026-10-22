import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

const PAYMENT_FIELDS=[
 ['Name','Name','text',null],['Invoice','Invoice','reference','Invoice'],
 ['Amount','Amount','number',null],['Method','Payment Method','picklist',null],
 ['Status','Payment Status','picklist',null],['Reference','Idempotency Reference','text',null],
 ['PaidAt','Payment Time','datetime',null],['Notes','Notes','text',null]
] as const;
const cashGuard={invoiceObject:'Invoice',paymentObject:'Payment',invoiceField:'Invoice',
 amountField:'Amount',methodField:'Method',statusField:'Status',cashMethod:'Cash',
 settledStatus:'Settled',referenceField:'Reference',invoiceStatusField:'Status',
 invoiceTotalField:'Total',invoicePaidField:'AmountPaid',invoiceNumberField:'InvoiceNumber',
 partialStatus:'PartPaid',paidStatus:'Paid',acceptedInvoiceStatuses:['Issued','PartPaid']};
export const ACEASSIST_PAYMENT_APIS=['AceAssistRecordCashPayment','AceAssistLoadPayment'] as const;
async function save(client:PoolClient,tenantId:string,graph:Record<string,unknown>){
 const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
  [tenantId,graph.apiName]);
 if(existing.rowCount)return 0;
 const {rows}=await client.query<{id:string}>(`INSERT INTO md_flow_definitions
  (tenant_id,api_name,label,flow_type,version,active)
  VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
  [tenantId,graph.apiName,graph.label]);
 const entries:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',entries);
 for(const e of entries)await client.query(`
  INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
  VALUES($1,$2,$3,$4,$5)`,[tenantId,rows[0].id,e.path,e.kind,e.text]);
 return 1;
}
export async function seedAceAssistPaymentFlows(client:PoolClient,tenantId:string):Promise<number>{
 const {rowCount}=await client.query(
  'SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
  [tenantId,'Invoice']);
 if(!rowCount)return 0;
 await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
  VALUES($1,'Payment','Payment',false) ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
 for(const [api,label,type,related] of PAYMENT_FIELDS)await client.query(`
  INSERT INTO md_field_definitions
   (tenant_id,object_api,api_name,label,data_type,related_object,required,is_unique)
  VALUES($1,'Payment',$2,$3,$4,$5,$6,$7)
  ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
  [tenantId,api,label,type,related,api==='Reference',api==='Reference']);
 await client.query(`INSERT INTO md_field_definitions
  (tenant_id,object_api,api_name,label,data_type,required,default_value)
  VALUES($1,'Invoice','AmountPaid','Amount Paid','number',false,'0')
  ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId]);
 for(const [field,options] of [
  ['Method',['Cash','Card','Bank Transfer','Other']],
  ['Status',['Pending','Settled','Failed','Refunded']]
 ] as const)
  for(const [index,value] of options.entries())await client.query(`
   INSERT INTO md_field_picklist_values(tenant_id,object_api,field_api,value,sort_order)
   VALUES($1,'Payment',$2,$3,$4) ON CONFLICT DO NOTHING`,
   [tenantId,field,value,(index+1)*10]);
 await client.query(`INSERT INTO md_validation_rules
  (tenant_id,object_api,api_name,label,expression,error_message,error_field_api,active,sort_order)
  VALUES($1,'Payment','PaymentImmutableOnceCreated','Protect settled payment identity',
   'AND(NOT(ISNEW()), OR(ISCHANGED($Record.Amount), ISCHANGED($Record.Invoice), ISCHANGED($Record.Reference), ISCHANGED($Record.Method)))',
   'Settled payment identity is immutable; use a reversal Flow.','Amount',true,100)
  ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId]);
 const input=[
  {name:'recordId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'amount',type:'Variable',dataType:'Number',availableForInput:true},
  {name:'requestId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'paymentId',type:'Variable',dataType:'Text',availableForOutput:true}
 ];
 const create={
  apiName:'AceAssistRecordCashPayment',label:'Ace Assist - Record authorised cash settlement',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
  resources:input,elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Create Records',label:'Verify and settle cash payment',config:{
    object:'Payment',recordSource:'fields',manualPaymentGuard:cashGuard,
    resultVariable:'paymentId',fieldValues:[
     {field:'Name',value:'Cash settlement'},
     {field:'Invoice',value:'{!recordId}'},
     {field:'Amount',value:'{!amount}'},
     {field:'Method',value:'Cash'},{field:'Status',value:'Settled'},
     {field:'Reference',value:'{!requestId}'}]}},
   {id:3,type:'End',label:'Done',config:{}}
  ],connectors:[{from:1,to:2,kind:'normal',label:'Next'},
   {from:2,to:3,kind:'normal',label:'Next'}]
 };
 const list={
  apiName:'AceAssistLoadPayment',label:'Ace Assist - Authorised Payments',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
  resources:[{name:'paymentRecords',type:'Record Collection',dataType:'Payment',availableForOutput:true}],
  elements:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Get Records',label:'Authorised payments',config:{
    object:'Payment',recordLimit:'all',outputVariable:'paymentRecords'}},
   {id:3,type:'End',label:'End',config:{}}
  ],connectors:[{from:1,to:2,kind:'normal',label:'Next'},
   {from:2,to:3,kind:'normal',label:'Next'}]
 };
 let created=0;
 created+=await save(client,tenantId,create);
 created+=await save(client,tenantId,list);
 await client.query(`INSERT INTO md_permission_sets
  (tenant_id,api_name,label,description,navigation_default_access)
  VALUES($1,'AceAssistCashier','Ace Assist Cashier',
   'Record verified cash payments, never provider-card settlements','Deny')
  ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
 const standardRights=[['Payment','read'],['Flow:AceAssistLoadPayment','execute'],
  ...PAYMENT_FIELDS.map(([api])=>['Payment.'+api,'read'])];
 const cashierRights=[
  ['Flow:AceAssistRecordCashPayment','execute'],
  ['Payment','read'],['Payment','create'],['Invoice','read'],['Invoice','edit'],
  ...PAYMENT_FIELDS.flatMap(([api])=>[['Payment.'+api,'read'],['Payment.'+api,'create']]),
  ...['AmountPaid','Status'].flatMap(api=>[['Invoice.'+api,'read'],['Invoice.'+api,'edit']]),
  ...['Total','InvoiceNumber','Customer','Quotation','Subtotal','DiscountAmount','TaxAmount']
   .map(api=>['Invoice.'+api,'read'])
 ];
 for(const [policy,rights] of [['AceAssistUser',standardRights],['AceAssistCashier',cashierRights]] as const)
  for(const [resource,action] of rights)await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name=$4 ON CONFLICT DO NOTHING`,
   [tenantId,resource,action,policy]);
 return created;
}
