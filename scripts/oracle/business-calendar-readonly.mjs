/**
 * Read-only SQL inspection for the authenticated tenant displayed by Ace Assist.
 * Never print raw secrets, database URLs, tenant settings JSON, or customer data.
 * Executes on the OCI runner using the *running* API process's SQL configuration.
 */
import {createHash} from 'node:crypto';
import pg from 'pg';

const tenantId=process.argv[2]??'';
if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(tenantId))
 throw Error('Invalid tenant UUID');
const raw=process.env.DATABASE_URL;
if(!raw)throw Error('Live DATABASE_URL unavailable');
let client;
const output=(key,value)=>console.log(key+': '+JSON.stringify(value));
try {
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol))
  throw Error('Invalid SQL URL scheme');
 const override=process.env.METADRIVE_DB_NAME_OVERRIDE?.trim();
 if(override){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(override))throw Error('Invalid DB name override');
  url.pathname='/'+override;
 }
 let ssl;
 const caRaw=process.env.METADRIVE_DB_CA_CERT?.trim();
 if(caRaw){
  const ca=caRaw.includes('BEGIN CERTIFICATE')
   ?caRaw.replace(/\\n/g,'\n'):Buffer.from(caRaw,'base64').toString('utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----')||
     !ca.includes('-----END CERTIFICATE-----'))throw Error('Invalid configured CA');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslrootcert');
  ssl={ca,rejectUnauthorized:true,servername:url.hostname};
 }
 // Clone the same SQL connection selection as SqlPersistence without printing it.
 client=new pg.Client({connectionString:url.toString(),...(ssl?{ssl}:{}),
  connectionTimeoutMillis:10000,application_name:'metadrive-oci-calendar-readonly'});
 await client.connect();
 await client.query('BEGIN READ ONLY');
 await client.query("SET LOCAL statement_timeout = '5000ms'");
 const info=await client.query(
  'SELECT current_database() AS db, current_schema() AS db_schema, current_setting(\'transaction_read_only\') AS read_only');
 const db=info.rows[0];
 output('read_only_transaction',db.read_only==='on');
 output('database_fingerprint',createHash('sha256').update(db.db).digest('hex').slice(0,12));
 output('database_override_enabled',Boolean(override));
 output('schema',db.db_schema);
 const tenant=await client.query('SELECT EXISTS(SELECT 1 FROM md_tenants WHERE id=$1) AS found',[tenantId]);
 output('tenant_exists_in_live_database',tenant.rows[0].found);
 const keys=await client.query(
  'SELECT setting_key FROM md_tenant_settings WHERE tenant_id=$1 ORDER BY setting_key',[tenantId]);
 output('setting_keys_for_tenant',keys.rows.map(row=>row.setting_key));
 const result=await client.query(
  "SELECT properties,revision,updated_at FROM md_tenant_settings WHERE tenant_id=$1 AND setting_key='business-calendar'",
  [tenantId]);
 output('business_calendar_row_exists',result.rows.length===1);
 if(result.rows.length){
  const row=result.rows[0];
  const properties=row.properties;
  output('calendar_revision',row.revision);
  output('calendar_last_updated',row.updated_at instanceof Date
   ?row.updated_at.toISOString():String(row.updated_at));
  output('calendar_format_valid',Boolean(properties&&typeof properties==='object'
   &&typeof properties.timezone==='string'&&properties.weeklyHours
   &&typeof properties.weeklyHours==='object'&&Array.isArray(properties.holidays)));
  if(properties&&typeof properties==='object'){
   output('configured_weekdays',Object.keys(properties.weeklyHours??{}));
   output('configured_timezone_present',typeof properties.timezone==='string');
  }
 }
 const events=await client.query(
  "SELECT count(*)::integer AS updates,max(created_at) AS latest FROM md_security_events WHERE tenant_id=$1 AND action='tenant.business-calendar.updated'",
  [tenantId]);
 output('successful_calendar_save_audit_events',events.rows[0].updates);
 output('last_save_audit',events.rows[0].latest??null);
 const constraint=await client.query(
  "SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid='md_tenant_settings'::regclass AND c.contype='c'");
 output('calendar_allowed_by_setting_constraints',constraint.rows.every(row=>
  !row.definition?.includes('setting_key')||row.definition.includes('business-calendar')));
 const others=await client.query(
  "SELECT count(*)::integer AS count FROM md_tenant_settings WHERE setting_key='business-calendar'");
 output('calendar_rows_in_database_total',others.rows[0].count);
 await client.query('ROLLBACK');
 output('diagnostic_completed',true);
} catch(error){
 // Do not print error messages or exception structures; PG exceptions sometimes
 // include server/connection detail. SQLSTATE code is safe for diagnosis.
 output('diagnostic_error_code',
  typeof error?.code==='string'?error.code:'UNCLASSIFIED');
 process.exitCode=1;
} finally {
 if(client)await client.end().catch(()=>{});
}
