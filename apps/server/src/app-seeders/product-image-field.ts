import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SqlPersistence } from '../system-files/sql-persistence.js';

export const PRODUCT_IMAGE_FIELD_SEED_VERSION='core-product-image-url-v1';
export const PRODUCT_IMAGE_FIELD={
  objectApi:'Product',apiName:'ImageUrl',label:'Image URL',
  dataType:'text',maxLength:2048
} as const;

/** Shared Product image mapping; preserve fields already configured by each tenant. */
export async function seedFreshProductImageField(client:PoolClient,tenantId:string) {
  await client.query(
    'INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,max_length,required) SELECT $1,$2,$3,$4,$5,$6,false WHERE EXISTS (SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING',
    [tenantId,PRODUCT_IMAGE_FIELD.objectApi,PRODUCT_IMAGE_FIELD.apiName,
      PRODUCT_IMAGE_FIELD.label,PRODUCT_IMAGE_FIELD.dataType,PRODUCT_IMAGE_FIELD.maxLength]);
}

export async function seedProductImageFieldForExistingTenants(db:SqlPersistence) {
  const checksum=createHash('sha256').update(JSON.stringify(PRODUCT_IMAGE_FIELD)).digest('hex');
  return db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:system:migrations']);
    const applied=await client.query<{checksum:string}>(
      'SELECT checksum FROM md_system_migrations WHERE version=$1',[PRODUCT_IMAGE_FIELD_SEED_VERSION]);
    if(applied.rows[0]&&applied.rows[0].checksum!==checksum)
      throw Error('Product image field seed changed after installation');
    const {rows}=await client.query<{id:string}>('SELECT id FROM md_tenants ORDER BY id');
    for(const tenant of rows)await seedFreshProductImageField(client,tenant.id);
    if(!applied.rows[0])await client.query(
      'INSERT INTO md_system_migrations(version,checksum) VALUES($1,$2)',
      [PRODUCT_IMAGE_FIELD_SEED_VERSION,checksum]);
    return rows.length;
  });
}
