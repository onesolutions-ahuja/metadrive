import type {PoolClient} from 'pg';

/** Reuses the shared SQL Auto Number field and per-object sequence; no app numbering engine.
 * Existing InvoiceNumber/QuotationNumber fields and issued business records are untouched.
 * Administrators edit the field format in Object Manager for future values.
 */
export const ACEASSIST_DOCUMENT_SERIES=[
 {object:'Quotation',api:'DocumentNumber',format:'QT-{YYYY}-{000000}'},
 {object:'Invoice',api:'DocumentNumber',format:'INV-{YYYY}-{000000}'}
] as const;
export async function seedAceAssistDocumentSeries(client:PoolClient,tenantId:string):Promise<void>{
 for(const item of ACEASSIST_DOCUMENT_SERIES){
  const {rowCount}=await client.query(
   'SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenantId,item.object]);
  if(!rowCount)continue;
  await client.query(`INSERT INTO md_field_definitions
   (tenant_id,object_api,api_name,label,data_type,auto_number_format,is_unique,required)
   VALUES($1,$2,$3,'Document Number','autonumber',$4,true,false)
   ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
   [tenantId,item.object,item.api,item.format]);
 }
}
