import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** Shared metadata: locations are reusable by POS, purchasing and other apps.
 * Never mutate a published Core v1 seeder checksum. */
export const LOCATION_SRN_FIELDS = [
  {object:'Location',label:'Location',fields:[
    {api:'Name',label:'Name',type:'text'},
    {api:'Code',label:'Code',type:'text'},
    {api:'Active',label:'Active',type:'boolean'}
  ]},
  {object:'Invoice',fields:[
    {api:'InvoiceType',label:'Invoice Type (SALE / SRN)',type:'text'},
    {api:'ReferenceInvoice',label:'Reference Invoice',type:'reference',related:'Invoice'},
    {api:'Location',label:'Store / Location',type:'reference',related:'Location'}
  ]},
  {object:'Purchase',fields:[
    {api:'Location',label:'Store / Location',type:'reference',related:'Location'}
  ]}
] as const;

export async function seedLocationSrnMetadata(client:PoolClient,tenantId:string):Promise<void>{
  await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
    VALUES($1,'Location','Location',false) ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
  for(const object of LOCATION_SRN_FIELDS) for(const field of object.fields){
    await client.query(`INSERT INTO md_field_definitions
      (tenant_id,object_api,api_name,label,data_type,related_object,required)
      VALUES($1,$2,$3,$4,$5,$6,false)
      ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
      [tenantId,object.object,field.api,field.label,field.type,'related' in field?field.related:null]);
  }
}

/** Called inside a licensed Acetill installation transaction.
 * Create Store1 only when no location already exists, preserving tenant data. */
export async function seedAcetillDefaultLocation(client:PoolClient,tenantId:string):Promise<void>{
  await seedLocationSrnMetadata(client,tenantId);
  const existing=await client.query(`SELECT 1 FROM md_records
    WHERE tenant_id=$1 AND object_api='Location' AND is_deleted=false LIMIT 1`,[tenantId]);
  if(existing.rowCount)return;
  const {rows}=await client.query<{id:string}>(`INSERT INTO md_records(tenant_id,object_api)
    VALUES($1,'Location') RETURNING id`,[tenantId]);
  await client.query(`INSERT INTO md_record_values
    (tenant_id,record_id,object_api,field_api,value_text)
    VALUES($1,$2,'Location','Name','Store1'),
          ($1,$2,'Location','Code','STORE1'),
          ($1,$2,'Location','Active','true')`,[tenantId,rows[0].id]);
}

export const LOCATION_SRN_SEED_VERSION='core-location-srn-v1';
export async function seedLocationSrnForExistingTenants(db:SqlPersistence):Promise<number>{
  const checksum=createHash('sha256').update(JSON.stringify(LOCATION_SRN_FIELDS)).digest('hex');
  return db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:system:migrations']);
    const applied=await client.query<{checksum:string}>(`SELECT checksum
      FROM md_system_migrations WHERE version=$1`,[LOCATION_SRN_SEED_VERSION]);
    if(applied.rows[0]&&applied.rows[0].checksum!==checksum)
      throw Error('Location seeder changed after application; use a new version');
    const {rows:tenants}=await client.query<{id:string}>(`SELECT id FROM md_tenants ORDER BY id`);
    for(const tenant of tenants){
      await seedLocationSrnMetadata(client,tenant.id);
      // Backfill Store1 only for tenants where Acetill is installed.
      const installed=await client.query(`SELECT 1 FROM md_app_installations i
        JOIN md_apps a ON a.id=i.app_id
        WHERE i.tenant_id=$1 AND a.api_name='Acetill' LIMIT 1`,[tenant.id]);
      if(installed.rowCount)await seedAcetillDefaultLocation(client,tenant.id);
    }
    if(!applied.rows[0])await client.query(`INSERT INTO md_system_migrations(version,checksum)
      VALUES($1,$2)`,[LOCATION_SRN_SEED_VERSION,checksum]);
    return tenants.length;
  });
}
