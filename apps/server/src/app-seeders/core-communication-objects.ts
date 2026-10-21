import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** Universal communication log metadata; delivery remains in the shared Flow/connector runtime. */
export const COMMUNICATION_OBJECTS=[{apiName:'Communication',label:'Communication',fields:[
  {
    "apiName": "Name",
    "label": "Name",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "Channel",
    "label": "Channel",
    "dataType": "picklist"
  },
  {
    "apiName": "Direction",
    "label": "Direction",
    "dataType": "picklist"
  },
  {
    "apiName": "Status",
    "label": "Status",
    "dataType": "picklist"
  },
  {
    "apiName": "Sender",
    "label": "Sender",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "Recipient",
    "label": "Recipient",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "Subject",
    "label": "Subject",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "Body",
    "label": "Body",
    "dataType": "text",
    "maxLength": 10000
  },
  {
    "apiName": "ExternalMessageId",
    "label": "External Message ID",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "ConversationId",
    "label": "Conversation ID",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "Provider",
    "label": "Provider",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "RelatedObject",
    "label": "Related Object",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "RelatedRecordId",
    "label": "Related Record ID",
    "dataType": "text",
    "maxLength": 500
  },
  {
    "apiName": "Contact",
    "label": "Contact",
    "dataType": "reference",
    "relatedObject": "Contact"
  },
  {
    "apiName": "Customer",
    "label": "Customer",
    "dataType": "reference",
    "relatedObject": "Customer"
  },
  {
    "apiName": "SentAt",
    "label": "Sent At",
    "dataType": "datetime"
  },
  {
    "apiName": "ReceivedAt",
    "label": "Received At",
    "dataType": "datetime"
  },
  {
    "apiName": "DeliveredAt",
    "label": "Delivered At",
    "dataType": "datetime"
  },
  {
    "apiName": "ErrorMessage",
    "label": "Error Message",
    "dataType": "text",
    "maxLength": 2000
  }
]}] as const;
export const COMMUNICATION_OBJECTS_SEED_VERSION='core-communication-objects-v1';

export async function seedCommunicationObjects(client:PoolClient,tenantId:string):Promise<void>{
  for(const object of COMMUNICATION_OBJECTS){
    await client.query('INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system) VALUES($1,$2,$3,false) ON CONFLICT(tenant_id,api_name) DO NOTHING',[tenantId,object.apiName,object.label]);
    for(const field of object.fields){
      await client.query('INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object,max_length,required) VALUES($1,$2,$3,$4,$5,$6,$7,false) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING',
        [tenantId,object.apiName,field.apiName,field.label,field.dataType,'relatedObject' in field?field.relatedObject:null,'maxLength' in field?field.maxLength:null]);
    }
  }
}

export async function seedCommunicationObjectsForExistingTenants(db:SqlPersistence):Promise<number>{
  const checksum=createHash('sha256').update(JSON.stringify(COMMUNICATION_OBJECTS)).digest('hex');
  return db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:system:migrations']);
    const applied=await client.query<{checksum:string}>('SELECT checksum FROM md_system_migrations WHERE version=$1',[COMMUNICATION_OBJECTS_SEED_VERSION]);
    if(applied.rows[0]&&applied.rows[0].checksum!==checksum)throw Error('Core communication seeder changed after application; create new version');
    const {rows:tenants}=await client.query<{id:string}>('SELECT id FROM md_tenants ORDER BY id');
    for(const tenant of tenants)await seedCommunicationObjects(client,tenant.id);
    if(!applied.rows[0])await client.query('INSERT INTO md_system_migrations(version,checksum) VALUES($1,$2)',[COMMUNICATION_OBJECTS_SEED_VERSION,checksum]);
    return tenants.length;
  });
}
