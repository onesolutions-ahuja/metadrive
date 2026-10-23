import type {PoolClient} from 'pg';

/** Additive shared data contract for cashier workflows.
 * Workflows operate through generic Objects and OneEngine, never a second POS API. */
export const ACETILL_TILL_FIELDS = [
 {object:'Cart',fields:[
  {api:'HoldReference',type:'text',label:'Hold Reference'},
  {api:'HeldBy',type:'reference',related:'User',label:'Held By'},
  {api:'Location',type:'reference',related:'Location',label:'Store'},
  {api:'HeldAt',type:'datetime',label:'Held At'}
 ]},
 {object:'CartLine',fields:[
  {api:'DiscountAmount',type:'number',label:'Discount Amount'},
  {api:'OriginalUnitPrice',type:'number',label:'Original Unit Price'}
 ]},
 {object:'Product',fields:[
  {api:'AgeRestricted',type:'boolean',label:'Age Restricted',default:'false'},
  {api:'MinimumAge',type:'number',label:'Minimum Age'}
 ]},
 {object:'Invoice',fields:[
  {api:'ReturnReason',type:'picklist',label:'Return Reason'},
  {api:'Cashier',type:'reference',related:'User',label:'Cashier'}
 ]},
 {object:'InvoiceLine',fields:[
  {api:'OriginalInvoiceLine',type:'reference',related:'InvoiceLine',label:'Original Invoice Line'}
 ]}
] as const;

export const RETURN_REASON_OPTIONS=['Faulty','Unwanted','Incorrect Item','Damaged','Other'] as const;

export async function seedAcetillTillFields(client:PoolClient,tenantId:string):Promise<void>{
 for(const object of ACETILL_TILL_FIELDS){
  for(const field of object.fields){
   await client.query(`INSERT INTO md_field_definitions
    (tenant_id,object_api,api_name,label,data_type,related_object,required,default_value)
    VALUES($1,$2,$3,$4,$5,$6,false,$7)
    ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
    [tenantId,object.object,field.api,field.label,field.type,
      'related' in field?field.related:null,'default' in field?field.default:null]);
  }
 }
 for(const [i,reason] of RETURN_REASON_OPTIONS.entries())
  await client.query(`INSERT INTO md_field_picklist_values
    (tenant_id,object_api,field_api,value,sort_order)
    VALUES($1,'Invoice','ReturnReason',$2,$3) ON CONFLICT DO NOTHING`,
    [tenantId,reason,(i+1)*10]);
}
