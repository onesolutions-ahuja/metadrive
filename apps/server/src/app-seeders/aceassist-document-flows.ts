import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

/** A single OneEngine interview/SQL transaction saves both the document header
 * and its child lines. All record operations still use caller RBAC and the
 * shared DocumentFinancialGuard, including recalculation and issue locks.
 */
type DocumentType='Quotation'|'Invoice';
type DocumentAction='Create'|'Update';
const connector=(from:number,to:number,label='Next')=>({from,to,kind:'normal',label});
const node=(id:number,type:string,label:string,config:Record<string,unknown>={})=>
 ({id,type,label,config});
const headerFields:Record<DocumentType,readonly string[]>={
 Quotation:['Name','Customer','IssueDate','ExpiryDate','CurrencyCode','TermsAndConditions','Notes'],
 Invoice:['Name','Customer','InvoiceDate','DueDate','CurrencyCode','Notes']
};
export const ACEASSIST_CREATE_INVOICE_FROM_QUOTATION='AceAssistCreateInvoiceFromQuotationV1';
export const aceAssistDocumentFlowApi=(action:DocumentAction,type:DocumentType)=>
 'AceAssist'+action+'DocumentV1'+type;

function linesNode(id:number,type:DocumentType,parent:string,loopVariable:string){
 return node(id,'Create Records','Add '+type.toLowerCase()+' line',{
  object:type+'Line',recordSource:'fields',expectedParentId:parent,
  fieldValues:[
   {field:'Name',value:'{!'+loopVariable+'.Name}'},
   {field:type,value:parent},
   {field:'Product',value:'{!'+loopVariable+'.Product}'},
   {field:'Description',value:'{!'+loopVariable+'.Description}'},
   {field:'Quantity',value:'{!'+loopVariable+'.Quantity}'},
   {field:'UnitPrice',value:'{!'+loopVariable+'.UnitPrice}'},
   {field:'DiscountAmount',value:'{!'+loopVariable+'.DiscountAmount}'},
   {field:'TaxAmount',value:'{!'+loopVariable+'.TaxAmount}'}
  ]});
}
export function buildAceAssistDocumentGraph(type:DocumentType,action:DocumentAction){
 const lineType=type+'Line';
 const resource=(name:string,dataType:string,kind='Variable',availableForOutput=false)=>
  ({name,type:kind,dataType,availableForInput:!availableForOutput,
   ...(kind==='Record Collection'?{isCollection:true}:{}),
   ...(availableForOutput?{availableForOutput:true}: {})});
 const output=resource('documentId','Text','Variable',true);
 const start=node(1,'Start','Start',{executionContext:'User'});
 let elements:ReturnType<typeof node>[],connectors:ReturnType<typeof connector>[],
  resources:Record<string,unknown>[];
 if(action==='Create'){
  elements=[
   start,
   node(2,'Create Records','Create draft '+type,{
    object:type,recordSource:'fields',
    fieldValues:[...headerFields[type].map(field=>({field,value:'{!'+field+'}'})),
     {field:'Status',value:'Draft'}]
   }),
   node(3,'Loop','Add document lines',{collection:'lineInputs',
    loopVariable:'lineInput',direction:'First to last'}),
   linesNode(4,type,'{!record2.Id}','lineInput'),
   node(5,'Assignment','Return document ID',{
    variable:'documentId',operator:'Assign',value:'{!record2.Id}'}),
   node(6,'End','Done')
  ];
  connectors=[connector(1,2),connector(2,3),connector(3,4,'For Each'),
   connector(4,3),connector(3,5,'After Last'),connector(5,6)];
  resources=[...headerFields[type].map(field=>resource(field,'Text')),
   resource('lineInputs',lineType,'Record Collection'),
   {name:'lineInput',type:'Record',dataType:lineType},output];
 }else{
  const allowed=type==='Invoice'?[{name:'Draft',label:'Draft',conditions:[
   {field:'{!document.Status}',operator:'Equals',value:'Draft'}]}]:[
   {name:'Editable',label:'Editable',conditionLogic:'All',conditions:[
    ...['Accepted','Approved','Converted'].map(value=>({
     field:'{!document.Status}',operator:'NotEquals',value}))]}];
  elements=[
   start,
   node(2,'Get Records','Load current document',{object:type,recordLimit:'1',
    outputVariable:'document',conditions:[{field:'Id',operator:'Equals',value:'{!recordId}'}]}),
   node(3,'Decision','Document is editable?',{outcomes:allowed}),
   node(4,'Update Records','Save selected document header',{object:type,
    recordId:'{!recordId}',fieldValues:[
     ...headerFields[type].map(field=>({field,value:'{!'+field+'}'})),
     ...(type==='Quotation'?[{field:'Status',value:'{!Status}'}]:[])
    ]}),
   node(5,'Delete Records','Remove deleted lines',{object:lineType,
    recordSource:'collection',collection:'removedLines',expectedParentId:'{!recordId}'}),
   node(6,'Update Records','Update existing lines',{object:lineType,
    recordSource:'collection',collection:'updatedLines',fieldSource:'record',
    expectedParentId:'{!recordId}'}),
   node(7,'Loop','Add new lines',{collection:'newLines',
    loopVariable:'newLine',direction:'First to last'}),
   linesNode(8,type,'{!recordId}','newLine'),
   node(9,'Assignment','Return document ID',{
    variable:'documentId',operator:'Assign',value:'{!recordId}'}),
   node(10,'End','Done'),
   node(11,'Custom Error','Document locked',{errorLocation:'Page',
    errorMessage:'This document is finalised and cannot be edited.'})
  ];
  connectors=[connector(1,2),connector(2,3),connector(3,4,type==='Invoice'?'Draft':'Editable'),
   connector(3,11,'Default'),connector(4,5),connector(5,6),connector(6,7),
   connector(7,8,'For Each'),connector(8,7),connector(7,9,'After Last'),
   connector(9,10),connector(11,10)];
  resources=[resource('recordId','Text'),
   ...headerFields[type].map(field=>resource(field,'Text')),
   ...(type==='Quotation'?[resource('Status','Text')]:[]),
   resource('removedLines',lineType,'Record Collection'),
   resource('updatedLines',lineType,'Record Collection'),
   resource('newLines',lineType,'Record Collection'),
   {name:'document',type:'Record',dataType:type},
   {name:'newLine',type:'Record',dataType:lineType},output];
 }
 return {apiName:aceAssistDocumentFlowApi(action,type),
  label:'Ace Assist - '+action+' '+type+' with lines (atomic)',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,
  elements,connectors,resources,tests:[]};
}

/** Creates an editable invoice draft from a quotation, with source validation and
 * duplicate protection inside the shared OneEngine transaction.
 */
export function buildAceAssistQuoteInvoiceGraph(){
 const base=buildAceAssistDocumentGraph('Invoice','Create');
 return {...base,apiName:ACEASSIST_CREATE_INVOICE_FROM_QUOTATION,
  label:'Ace Assist - Create invoice from quotation',
  elements:base.elements.map(element=>element.id!==2?element:{
   ...element,config:{
    ...element.config,
    sourceLinkGuard:{
     sourceObject:'Quotation',sourceField:'Quotation',statusField:'Status',
     customerField:'Customer',targetCustomerField:'Customer',
     allowedStatuses:['Draft','Sent','Accepted','Approved','Open','Pending','Expired','']
    },
    fieldValues:[
     ...(element.config.fieldValues as Array<{field:string;value:string}>),
     {field:'Quotation',value:'{!Quotation}'}
    ]
   }
  }),
  resources:[
   ...base.resources,{name:'Quotation',type:'Variable',dataType:'Text',availableForInput:true}
  ]
 };
}

/** Additive only: preserve tenant-edited Flow definitions. No global rights
 * and no automatic permission-set assignment to a user.
 */
export async function seedAceAssistDocumentFlows(client:PoolClient,tenantId:string){
 let created=0;
 for(const type of ['Quotation','Invoice'] as const){
  const {rows:objects}=await client.query<{api_name:string}>(
   'SELECT api_name FROM md_object_definitions WHERE tenant_id=$1 AND api_name=ANY($2::text[])',
   [tenantId,[type,type+'Line']]);
  if(objects.length!==2)continue;
  for(const action of ['Create','Update'] as const){
   const flow=buildAceAssistDocumentGraph(type,action);
   const prior=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
    [tenantId,flow.apiName]);
   if(!prior.rowCount){
    const {rows}=await client.query<{id:string}>(`
     INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
     VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
     [tenantId,flow.apiName,flow.label]);
    const entries:Array<{path:string;kind:string;text:string|null}>=[];
    encodeMetadataValue(flow,'/builder',entries);
    for(const entry of entries)await client.query(`
     INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
     VALUES($1,$2,$3,$4,$5)`,
     [tenantId,rows[0].id,entry.path,entry.kind,entry.text]);
    created++;
   }
   await client.query(`
    INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
    SELECT $1,p.id,$2,'execute','allow' FROM md_permission_sets p
    WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser'
    ON CONFLICT DO NOTHING`,
    [tenantId,'Flow:'+flow.apiName]);
  }
 }
 // Add a new Flow API; never overwrite the tenant's existing document Flows.
 const {rows:quoteObjects}=await client.query<{api_name:string}>(
  'SELECT api_name FROM md_object_definitions WHERE tenant_id=$1 AND api_name=ANY($2::text[])',
  [tenantId,['Quotation','QuotationLine','Invoice','InvoiceLine']]);
 if(quoteObjects.length===4){
  await client.query(`INSERT INTO md_field_definitions
   (tenant_id,object_api,api_name,label,data_type,related_object,required)
   VALUES($1,'Invoice','Quotation','Source Quotation','reference','Quotation',false)
   ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId]);
  const flow=buildAceAssistQuoteInvoiceGraph();
  const prior=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenantId,flow.apiName]);
  if(!prior.rowCount){
   const {rows}=await client.query<{id:string}>(`
    INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
    VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
    [tenantId,flow.apiName,flow.label]);
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(flow,'/builder',entries);
   for(const entry of entries)await client.query(`
    INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,
    [tenantId,rows[0].id,entry.path,entry.kind,entry.text]);
   created++;
  }
  await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,p.id,$2,'execute','allow' FROM md_permission_sets p
   WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser'
   ON CONFLICT DO NOTHING`,[tenantId,'Flow:'+flow.apiName]);
 }
 return created;
}
