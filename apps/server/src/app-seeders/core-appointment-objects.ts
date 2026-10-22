import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** Reusable standard scheduling Object. Data and booking behaviour stay in Records and Flows. */
export const APPOINTMENT_OBJECTS=[{
  apiName:'Appointment',label:'Appointment',fields:[
    {apiName:'Name',label:'Name',dataType:'text',maxLength:500},
    {apiName:'StartDateTime',label:'Start Date and Time',dataType:'datetime'},
    {apiName:'EndDateTime',label:'End Date and Time',dataType:'datetime'},
    {apiName:'Status',label:'Status',dataType:'picklist'},
    {apiName:'Customer',label:'Customer',dataType:'reference',relatedObject:'Customer'},
    {apiName:'Contact',label:'Contact',dataType:'reference',relatedObject:'Contact'},
    {apiName:'Service',label:'Service',dataType:'text',maxLength:255},
    {apiName:'Location',label:'Location',dataType:'text',maxLength:255},
    {apiName:'AssignedTo',label:'Assigned To',dataType:'text',maxLength:255},
    {apiName:'Description',label:'Description',dataType:'text',maxLength:4000},
    {apiName:'Notes',label:'Notes',dataType:'text',maxLength:4000},
    {apiName:'TimeZone',label:'Time Zone',dataType:'text',maxLength:100},
    {apiName:'ExternalBookingId',label:'External Booking ID',dataType:'text',maxLength:255},
    {apiName:'ReminderAt',label:'Reminder At',dataType:'datetime'},
    {apiName:'CompletedAt',label:'Completed At',dataType:'datetime'}
  ]
}] as const;

export const APPOINTMENT_STATUSES=[
 'Scheduled','Confirmed','In Progress','Completed','Cancelled','No Show','Rescheduled'
] as const;
export const APPOINTMENT_OBJECTS_SEED_VERSION='core-appointment-objects-v1';

/** Idempotent, non-destructive metadata creation. No demo bookings or changes to custom fields. */
export async function seedAppointmentObjects(client:PoolClient,tenantId:string):Promise<void>{
 for(const object of APPOINTMENT_OBJECTS){
  await client.query(
   'INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system) VALUES($1,$2,$3,false) ON CONFLICT(tenant_id,api_name) DO NOTHING',
   [tenantId,object.apiName,object.label]);
  for(const field of object.fields){
   await client.query(
    'INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object,max_length,required) VALUES($1,$2,$3,$4,$5,$6,$7,false) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING',
    [tenantId,object.apiName,field.apiName,field.label,field.dataType,
     'relatedObject' in field?field.relatedObject:null,
     'maxLength' in field?field.maxLength:null]);
  }
 }
 for(const [index,value] of APPOINTMENT_STATUSES.entries()){
  await client.query(
   'INSERT INTO md_field_picklist_values(tenant_id,object_api,field_api,value,sort_order) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
   [tenantId,'Appointment','Status',value,(index+1)*10]);
 }
}

/** Ace Assist users get Appointment object and field CRUD only, not platform-wide access. */
export async function grantAceAssistAppointmentAccess(client:PoolClient,tenantId:string):Promise<void>{
 await client.query(`
  INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
  SELECT s.tenant_id,s.id,permissions.resource,permissions.action,'allow'
  FROM md_permission_sets s
  CROSS JOIN LATERAL (
   SELECT 'Appointment'::text AS resource,action
   FROM unnest(ARRAY['read','create','edit']::text[]) AS action
   UNION ALL
   SELECT 'Appointment.'||f.api_name AS resource,action
   FROM md_field_definitions f
   CROSS JOIN unnest(ARRAY['read','create','edit']::text[]) AS action
   WHERE f.tenant_id=s.tenant_id AND f.object_api='Appointment' AND f.deleted_at IS NULL
  ) AS permissions
  WHERE s.tenant_id=$1 AND s.api_name='AceAssistUser'
  ON CONFLICT DO NOTHING`,[tenantId]);
}

/** Versioned reconciliation for all existing tenants, safely rerunnable on startup. */
export async function seedAppointmentObjectsForExistingTenants(db:SqlPersistence):Promise<number>{
 const checksum=createHash('sha256').update(JSON.stringify([
  APPOINTMENT_OBJECTS,APPOINTMENT_STATUSES])).digest('hex');
 return db.transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
   ['metadrive:system:migrations']);
  const applied=await client.query<{checksum:string}>(
   'SELECT checksum FROM md_system_migrations WHERE version=$1',
   [APPOINTMENT_OBJECTS_SEED_VERSION]);
  if(applied.rows[0]&&applied.rows[0].checksum!==checksum)
   throw new Error('Core appointment seeder changed after application; add new version');
  const {rows:tenants}=await client.query<{id:string}>(
   'SELECT id FROM md_tenants ORDER BY id');
  for(const tenant of tenants){
   await seedAppointmentObjects(client,tenant.id);
   await grantAceAssistAppointmentAccess(client,tenant.id);
  }
  if(!applied.rows[0])await client.query(
   'INSERT INTO md_system_migrations(version,checksum) VALUES($1,$2)',
   [APPOINTMENT_OBJECTS_SEED_VERSION,checksum]);
  return tenants.length;
 });
}
