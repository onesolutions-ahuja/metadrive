import {readFileSync} from 'node:fs';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {encodeMetadataValue,decodeMetadataValues,type MetadataValueRow} from '../system-files/component-runtime.js';

type FlowTemplate={apiName:string;label:string;appApiName:string;flowType:string;
 status:string;elements:unknown[];connectors:unknown[];resources:unknown[];tests:unknown[]};

/** Copies Acetill's tested Graph contracts without sharing tenant Flow identities.
 * New kiosk Flows are created as drafts. A tenant developer activates them after
 * payment validation, OneEngine assignment and terminal readiness.
 */
export async function seedAceKioskPaymentFlows(db:SqlPersistence):Promise<number>{
 const templates:Record<string,FlowTemplate>=JSON.parse(
  readFileSync(new URL('../../../acekiosk/flows/payment-flows.v1.json',import.meta.url),'utf8')
 );
 const {rows:tenants}=await db.query<{tenant_id:string}>(`
  SELECT i.tenant_id FROM md_app_installations i
  JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceKiosk' AND a.enabled
  JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id
  WHERE e.active AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let created=0;
 for(const {tenant_id:tenantId} of tenants)await db.transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':acekiosk:payment-flows']);
  // Permissions are assignable through OneEngine; never enroll users automatically.
  await client.query(`
   INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
   SELECT $1,s.id,x.resource,x.action,'allow'
   FROM md_permission_sets s CROSS JOIN (VALUES
    ('Flow:AceKioskPaymentCash','execute'),('Flow:AceKioskPaymentCard','execute'),
    ('Product','read'),('Product.Price','read'),('Product.Active','read'),
    ('Order','create'),('OrderLine','create'),
    ('Invoice','create'),('InvoiceLine','create'),
    ('Invoice.Name','create'),('Invoice.Order','create'),('Invoice.Subtotal','create'),
    ('Invoice.Total','create'),('Invoice.Status','create'),
    ('Invoice.Checkout_Request_ID__c','create'),('Invoice.Payment_Method__c','create'),
    ('InvoiceLine.Invoice','create'),('InvoiceLine.Product','create'),
    ('InvoiceLine.Quantity','create'),('InvoiceLine.UnitPrice','create'),
    ('InvoiceLine.LineTotal','create'),
    ('Order.Name','create'),('Order.Total','create'),('Order.Subtotal','create'),
    ('Order.PaymentMethod','create'),('Order.PaymentStatus','create'),
    ('Order.PaymentRequestId','create'),('Order.CashReceived','create'),
    ('Order.ChangeDue','create'),('OrderLine.Order','create'),
    ('OrderLine.Product','create'),('OrderLine.Quantity','create'),
    ('OrderLine.UnitPrice','create'),('OrderLine.LineTotal','create')
   ) AS x(resource,action)
   WHERE s.tenant_id=$1 AND s.api_name='AceKioskUser'
   ON CONFLICT DO NOTHING`,[tenantId]);
  const needed=['Order','OrderLine','Product','Invoice','InvoiceLine'];
  const {rows:found}=await client.query<{api_name:string}>(`
   SELECT api_name FROM md_object_definitions WHERE tenant_id=$1 AND api_name=ANY($2)`,
   [tenantId,needed]);
  if(found.length!==needed.length)return;
  // Shared financial metadata: link Invoice directly to the kitchen Order.
  // Never overwrite user-customised fields or previously issued invoices.
  await client.query(`
    INSERT INTO md_field_definitions
      (tenant_id,object_api,api_name,label,data_type,related_object,required)
    VALUES($1,'Invoice','Order','Kitchen Order','reference','Order',false)
    ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId]);
  for(const name of ['AceKioskPaymentCash','AceKioskPaymentCard']){
   const template=templates[name];
   if(!template||template.apiName!==name||template.appApiName!=='AceKiosk')
    throw Error('Invalid kiosk payment Flow template: '+name);
   const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
     [tenantId,name]);
   if(existing.rowCount){
     // Upgrade only the untouched original kiosk v1. If a tenant has edited its
     // existing Flow, leave it untouched for an explicit administrator merge.
     const {rows:versions}=await client.query<{id:string;version:number;active:boolean}>(`
       SELECT id,version,active FROM md_flow_definitions
       WHERE tenant_id=$1 AND api_name=$2 ORDER BY version DESC`,[tenantId,name]);
     if(versions.length!==1||versions[0].version!==1)continue;
     const {rows:stored}=await client.query<MetadataValueRow>(`
       SELECT property_path,value_kind,value_text FROM md_flow_editor_values
       WHERE tenant_id=$1 AND flow_id=$2`,[tenantId,versions[0].id]);
     const current=decodeMetadataValues(stored).builder as Record<string,unknown>|undefined;
     const source=JSON.parse(readFileSync(
       new URL('../../../acetill/flows/payment-flows.v1.json',import.meta.url),'utf8')) as Record<string,FlowTemplate>;
     const method=name.endsWith('Cash')?'Cash':'Card';
     const original=source['AcetillPayment'+method];
     const baseline:FlowTemplate={
       ...original,apiName:name,label:'AceKiosk Payment '+method,
       appApiName:'AceKiosk',status:'Draft',
       elements:(original.elements as Array<{id:number;label:string;config:Record<string,unknown>}>).map(e=>({
         ...e,label:e.label.replace('Acetill','AceKiosk'),
         config:Array.isArray(e.config?.fieldValues)?{
           ...e.config,fieldValues:(e.config.fieldValues as Array<{field:string;value:unknown}>).map(f=>
             f.field==='Name'&&f.value==='Acetill Sale'?{...f,value:'AceKiosk Order'}:f)
         }:e.config
       }))
     };
     const stable=(value:unknown):string=>JSON.stringify(value,(_key,v)=>
       v&&typeof v==='object'&&!Array.isArray(v)
         ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
     if(!current||stable({...current,status:'Draft'})!==stable(baseline))continue;
     const activated=versions[0].active;
     const nextTemplate={...template,status:activated?'Active':'Draft'};
     // SQL partial unique index allows only one active Flow version.
     if(activated)await client.query(`
       UPDATE md_flow_definitions SET active=false WHERE id=$1 AND tenant_id=$2`,
       [versions[0].id,tenantId]);
     const {rows:upgraded}=await client.query<{id:string}>(`
       INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
       VALUES($1,$2,$3,'Autolaunched Flow',2,$4) RETURNING id`,
       [tenantId,name,template.label,activated]);
     const values:Array<{path:string;kind:string;text:string|null}>=[];
     encodeMetadataValue(nextTemplate,'/builder',values);
     for(const value of values)await client.query(`
       INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
       VALUES($1,$2,$3,$4,$5)`,[tenantId,upgraded[0].id,value.path,value.kind,value.text]);
     created++;
     continue;
   }
   const {rows:flows}=await client.query<{id:string}>(`
    INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
    VALUES($1,$2,$3,'Autolaunched Flow',1,false) RETURNING id`,
    [tenantId,name,template.label]);
   const values:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(template,'/builder',values);
   for(const value of values)await client.query(`
    INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,
    [tenantId,flows[0].id,value.path,value.kind,value.text]);
   created++;
  }
 });
 return created;
}
