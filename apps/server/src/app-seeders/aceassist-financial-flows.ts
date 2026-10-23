import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

const link=(from:number,to:number,label='Next')=>({from,to,kind:'normal',label});
const node=(id:number,type:string,label:string,config:Record<string,unknown>={})=>
 ({id,type,label,config});
const graph=(apiName:string,label:string,elements:ReturnType<typeof node>[],
 connectors:ReturnType<typeof link>[],resources:Record<string,unknown>[])=>({
 apiName,label,appApiName:'AceAssist',flowType:'Autolaunched Flow',
 status:'Active',version:1,tests:[],elements,connectors,resources
});
const conversion={
 sourceObject:'Quotation',lineObject:'QuotationLine',sourceField:'Id',
 lineParentField:'Quotation',statusField:'Status',approvedStatuses:['Accepted','Approved'],
 quantityField:'Quantity',unitPriceField:'UnitPrice',discountField:'DiscountAmount',
 taxField:'TaxAmount',lineTotalField:'LineTotal',customerField:'Customer',
 subtotalField:'Subtotal',discountTotalField:'DiscountAmount',taxTotalField:'TaxAmount',
 totalField:'Total',targetSourceField:'Quotation',targetCustomerField:'Customer'
};
const issue={
 lineObject:'InvoiceLine',parentField:'Invoice',quantityField:'Quantity',
 unitPriceField:'UnitPrice',discountField:'DiscountAmount',taxField:'TaxAmount',
 lineTotalField:'LineTotal',subtotalField:'Subtotal',discountTotalField:'DiscountAmount',
 taxTotalField:'TaxAmount',totalField:'Total',statusField:'Status',
 issuedStatus:'Issued',numberField:'InvoiceNumber',formatField:'DocumentNumber'
};
const acceptCondition=(status:string)=>({name:status,label:status,conditions:[
 {field:'{!quotation.Status}',operator:'Equals',value:status}]});
function conversionGraph(){
 return graph('AceAssistConvertQuoteToInvoice','Ace Assist - Convert accepted quotation to draft invoice',[
  node(1,'Start','Start',{executionContext:'User'}),
  node(2,'Get Records','Get quotation',{object:'Quotation',recordLimit:'1',
   outputVariable:'quotation',conditions:[{field:'Id',operator:'Equals',value:'{!recordId}'}]}),
  node(3,'Decision','Quotation accepted?',{outcomes:[
   acceptCondition('Accepted'),acceptCondition('Approved')]}),
  node(4,'Get Records','Existing conversion?',{object:'Invoice',recordLimit:'1',
   outputVariable:'existingInvoice',conditions:[{field:'Quotation',operator:'Equals',value:'{!recordId}'}]}),
  node(5,'Decision','Not already converted?',{outcomes:[
   {name:'New',label:'New',conditions:[{field:'{!existingInvoice}',operator:'IsNull'}]}]}),
  node(6,'Get Records','Quotation lines',{object:'QuotationLine',
   recordLimit:'all',outputVariable:'quotationLines',
   conditions:[{field:'Quotation',operator:'Equals',value:'{!recordId}'}]}),
  node(7,'Create Records','Create draft invoice from verified quotation',{
   object:'Invoice',recordSource:'fields',documentConversion:conversion,
   fieldValues:[
    {field:'Name',value:'Quotation invoice'},
    {field:'Quotation',value:'{!recordId}'},
    {field:'Customer',value:'{!quotation.Customer}'},
    {field:'Status',value:'Draft'},
    {field:'Total',value:'{!quotation.Total}'}]}),
  node(8,'Loop','Copy authorised quotation lines',{
   collection:'quotationLines',loopVariable:'quotationLine',direction:'First to last'}),
  node(9,'Create Records','Create invoice line',{object:'InvoiceLine',recordSource:'fields',documentLineTotals:{parentObject:'Invoice',parentField:'Invoice',quantityField:'Quantity',unitPriceField:'UnitPrice',discountField:'DiscountAmount',taxField:'TaxAmount',lineTotalField:'LineTotal',subtotalField:'Subtotal',discountTotalField:'DiscountAmount',taxTotalField:'TaxAmount',totalField:'Total',statusField:'Status',lockedStatuses:['Issued','PartPaid','Paid','PartiallyPaid'],numberField:'InvoiceNumber'},
   fieldValues:[
    {field:'Name',value:'{!quotationLine.Name}'},
    {field:'Invoice',value:'{!record7.Id}'},
    {field:'Product',value:'{!quotationLine.Product}'},
    {field:'Quantity',value:'{!quotationLine.Quantity}'},
    {field:'UnitPrice',value:'{!quotationLine.UnitPrice}'},
    {field:'DiscountAmount',value:'{!quotationLine.DiscountAmount}'},
    {field:'TaxAmount',value:'{!quotationLine.TaxAmount}'},
    {field:'LineTotal',value:'{!quotationLine.LineTotal}'},
    {field:'Description',value:'{!quotationLine.Description}'}]}),
  node(10,'Update Records','Mark quotation converted',{object:'Quotation',
   recordId:'{!recordId}',fieldValues:[{field:'Status',value:'Converted'}]}),
  node(11,'Assignment','Return new invoice ID',{variable:'invoiceId',operator:'Assign',
   value:'{!record7.Id}'}),
  node(12,'End','Done'),
  node(13,'Custom Error','Quotation is not accepted',{
   errorLocation:'Page',errorMessage:'Only accepted or approved quotations can be converted.'}),
  node(14,'Custom Error','Already converted',{
   errorLocation:'Page',errorMessage:'This quotation already has an invoice.'})
 ],[
  link(1,2),link(2,3),link(3,4,'Accepted'),link(3,4,'Approved'),
  link(3,13,'Default'),link(4,5),link(5,6,'New'),link(5,14,'Default'),
  link(6,7),link(7,8),link(8,9,'For Each'),link(9,8),
  link(8,10,'After Last'),link(10,11),link(11,12),
  link(13,12),link(14,12)
 ],[
  {name:'recordId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'quotation',type:'Record',dataType:'Quotation'},
  {name:'existingInvoice',type:'Record',dataType:'Invoice'},
  {name:'quotationLines',type:'Record Collection',dataType:'QuotationLine'},
  {name:'quotationLine',type:'Record',dataType:'QuotationLine'},
  {name:'invoiceId',type:'Variable',dataType:'Text',availableForOutput:true}
 ]);
}
function issueGraph(){
 return graph('AceAssistIssueInvoice','Ace Assist - Verify and issue invoice',[
  node(1,'Start','Start',{executionContext:'User'}),
  node(2,'Get Records','Read invoice',{object:'Invoice',recordLimit:'1',
   outputVariable:'invoice',conditions:[{field:'Id',operator:'Equals',value:'{!recordId}'}]}),
  node(3,'Decision','Only drafts may be issued',{outcomes:[
   {name:'Draft',label:'Draft',conditions:[
    {field:'{!invoice.Status}',operator:'Equals',value:'Draft'}]}]}),
  node(4,'Update Records','Issue with verified totals and number',{
   object:'Invoice',recordId:'{!recordId}',documentIssue:issue,
   fieldValues:[{field:'Status',value:'Issued'}]}),
  node(5,'End','Done'),
  node(6,'Custom Error','Not a draft',{
   errorLocation:'Page',errorMessage:'Only draft invoices can be issued.'})
 ],[link(1,2),link(2,3),link(3,4,'Draft'),link(3,6,'Default'),link(4,5),link(6,5)],[
  {name:'recordId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'invoice',type:'Record',dataType:'Invoice'}
 ]);
}
function appointmentInvoiceGraph(){
 return graph('AceAssistInvoiceFromAppointment','Ace Assist - Draft invoice from completed appointment',[
  node(1,'Start','Start',{executionContext:'User'}),
  node(2,'Get Records','Load completed appointment',{object:'Appointment',recordLimit:'1',
   outputVariable:'appointment',conditions:[{field:'Id',operator:'Equals',value:'{!recordId}'}]}),
  node(3,'Get Records','Read selected service price',{object:'Product',recordLimit:'1',
   outputVariable:'service',conditions:[{field:'Id',operator:'Equals',value:'{!appointment.ServiceProduct}'}]}),
  node(4,'Decision','Appointment invoiceable?',{outcomes:[
   {name:'Completed',label:'Completed',conditionLogic:'All',conditions:[
    {field:'{!appointment.Status}',operator:'Equals',value:'Completed'},
    {field:'{!service.Active}',operator:'Equals',value:true},
    {field:'{!service.Price}',operator:'GreaterThanOrEqualTo',value:0}]}]}),
  node(5,'Create Records','Create draft from source',{
   object:'Invoice',recordSource:'fields',sourceLinkGuard:{
    sourceObject:'Appointment',sourceField:'Appointment',statusField:'Status',
    customerField:'Customer',targetCustomerField:'Customer',
    allowedStatuses:['Completed']},
   fieldValues:[
    {field:'Name',value:'Service appointment invoice'},
    {field:'Appointment',value:'{!recordId}'},
    {field:'Customer',value:'{!appointment.Customer}'},
    {field:'Status',value:'Draft'},
    {field:'Subtotal',value:'{!service.Price}'},
    {field:'Total',value:'{!service.Price}'}]}),
  node(6,'Create Records','Create billed service line',{object:'InvoiceLine',
   recordSource:'fields',documentLineTotals:{parentObject:'Invoice',parentField:'Invoice',quantityField:'Quantity',unitPriceField:'UnitPrice',discountField:'DiscountAmount',taxField:'TaxAmount',lineTotalField:'LineTotal',subtotalField:'Subtotal',discountTotalField:'DiscountAmount',taxTotalField:'TaxAmount',totalField:'Total',statusField:'Status',lockedStatuses:['Issued','PartPaid','Paid','PartiallyPaid'],numberField:'InvoiceNumber'},fieldValues:[
    {field:'Name',value:'{!service.Name}'},
    {field:'Invoice',value:'{!record5.Id}'},
    {field:'Product',value:'{!service.Id}'},
    {field:'Quantity',value:1},
    {field:'UnitPrice',value:'{!service.Price}'},
    {field:'LineTotal',value:'{!service.Price}'}]}),
  node(7,'Assignment','Return draft invoice',{variable:'invoiceId',operator:'Assign',
   value:'{!record5.Id}'}),
  node(8,'End','End'),
  node(9,'Custom Error','Appointment cannot be billed',{errorLocation:'Page',
   errorMessage:'Only completed appointments with an active priced service can be billed.'})
 ],[
  link(1,2),link(2,3),link(3,4),link(4,5,'Completed'),link(4,9,'Default'),
  link(5,6),link(6,7),link(7,8),link(9,8)
 ],[
  {name:'recordId',type:'Variable',dataType:'Text',availableForInput:true},
  {name:'appointment',type:'Record',dataType:'Appointment'},
  {name:'service',type:'Record',dataType:'Product'},
  {name:'invoiceId',type:'Variable',dataType:'Text',availableForOutput:true}
 ]);
}
export const ACEASSIST_FINANCIAL_FLOW_APIS=[
 'AceAssistConvertQuoteToInvoice','AceAssistIssueInvoice','AceAssistInvoiceFromAppointment'
] as const;
export async function seedAceAssistFinancialFlows(client:PoolClient,tenantId:string):Promise<number>{
 // Additive source link for duplicate-conversion protection; preserve user fields and records.
 const {rowCount}=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
  [tenantId,'Quotation']);
 if(!rowCount)return 0;
 await client.query(`INSERT INTO md_field_definitions
  (tenant_id,object_api,api_name,label,data_type,related_object,required)
  VALUES($1,'Invoice','Quotation','Source Quotation','reference','Quotation',false)
  ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId]);
 // Ordinary Object CRUD must not silently issue incomplete documents or
 // edit an issued amount/identity. Reuse shared declarative validation rules.
 const rules=[
  {api:'AceAssistIssuedHasNumber',label:'Issued invoice must have number',
   expression:'AND($Record.Status = "Issued", ISBLANK($Record.InvoiceNumber))',
   message:'An invoice can only be issued through the authorised numbering Flow.'},
  {api:'AceAssistProtectIssuedInvoice',label:'Protect issued invoice financial identity',
   expression:'AND(NOT(ISNEW()), NOT(ISBLANK(PRIORVALUE($Record.InvoiceNumber))), OR('+
    'ISCHANGED($Record.InvoiceNumber), ISCHANGED($Record.Total), '+
    'ISCHANGED($Record.Subtotal), ISCHANGED($Record.DiscountAmount), '+
    'ISCHANGED($Record.TaxAmount), ISCHANGED($Record.Customer), '+
    'ISCHANGED($Record.Quotation)))',
   message:'Issued invoices are immutable; use an authorised correction or credit note.'}
 ];
 for(const rule of rules)await client.query(`INSERT INTO md_validation_rules
  (tenant_id,object_api,api_name,label,expression,error_message,error_field_api,active,sort_order)
  VALUES($1,'Invoice',$2,$3,$4,$5,'InvoiceNumber',true,100)
  ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
  [tenantId,rule.api,rule.label,rule.expression,rule.message]);
 await client.query(`INSERT INTO md_field_definitions
  (tenant_id,object_api,api_name,label,data_type,related_object,required)
  VALUES($1,'Invoice','Appointment','Source Appointment','reference','Appointment',false)
  ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId]);
 let created=0;
 for(const flow of [conversionGraph(),issueGraph(),appointmentInvoiceGraph()]){
  const prior=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenantId,flow.apiName]);
  if(prior.rowCount)continue;
  const {rows:inserted}=await client.query<{id:string}>(`
   INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
   VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
   [tenantId,flow.apiName,flow.label]);
  const entries:Array<{path:string;kind:string;text:string|null}>=[];
  encodeMetadataValue(flow,'/builder',entries);
  for(const item of entries)await client.query(`
   INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
   VALUES($1,$2,$3,$4,$5)`,[tenantId,inserted[0].id,item.path,item.kind,item.text]);
  created++;
 }
 // User may convert accepted quotes, never issue a final invoice without
 // explicitly assigned finance-issuer permission set. Preserve custom RBAC rules.
 await client.query(`INSERT INTO md_permission_sets
  (tenant_id,api_name,label,description,navigation_default_access)
  VALUES($1,'AceAssistFinanceIssuer','Ace Assist Finance Issuer',
   'Issue verified invoices using OneEngine Flow after explicit assignment','Deny')
  ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
 const standardRights=[
  ['Flow:AceAssistConvertQuoteToInvoice','execute'],
  ['Flow:AceAssistInvoiceFromAppointment','execute'],
  ['Invoice.Appointment','read'],['Invoice.Appointment','create'],
  ['Appointment','read'],['Appointment.Status','read'],['Appointment.Customer','read'],
  ['Appointment.ServiceProduct','read'],['Product','read'],
  ...['Price','Name','Active'].map(x=>['Product.'+x,'read']),
  ['Invoice.Quotation','read'],['Invoice.Quotation','create'],
  ['Invoice.InvoiceNumber','read'],
  ['Quotation','read'],['QuotationLine','read'],['Invoice','read'],['InvoiceLine','read'],
  ...['Quantity','UnitPrice','DiscountAmount','TaxAmount','LineTotal','Name','Product','Description']
   .map(x=>['QuotationLine.'+x,'read']),
  ...['Name','Quotation','Customer','Status','Total','Subtotal','DiscountAmount','TaxAmount']
   .map(x=>['Invoice.'+x,'create'])
 ];
 const issuerRights=[
  ['Flow:AceAssistIssueInvoice','execute'],['Invoice','read'],['Invoice','edit'],
  ['InvoiceLine','read'],['InvoiceNumber','Subtotal','DiscountAmount','TaxAmount','Total','Status']
   .flatMap(x=>[['Invoice.'+x,'read'],['Invoice.'+x,'edit']]),
  ...['Invoice','Quantity','UnitPrice','DiscountAmount','TaxAmount','LineTotal']
   .map(x=>['InvoiceLine.'+x,'read'])
 ];
 for(const [policy,rights] of [['AceAssistUser',standardRights],['AceAssistFinanceIssuer',issuerRights]] as const)
  for(const [resource,action] of rights)await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name=$4 ON CONFLICT DO NOTHING`,
   [tenantId,resource,action,policy]);
 return created;
}
