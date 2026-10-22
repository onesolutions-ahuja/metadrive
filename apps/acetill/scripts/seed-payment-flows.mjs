/**
 * Acetill payment Flow metadata installer.
 * Run from repository root with DATABASE_URL and --tenant=<tenant-slug>.
 * Installs draft Flows only. Activation requires Flow Builder validation and
 * verified tenant price/permission tests. Never overwrites existing Flow versions.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import pg from 'pg';

const slugArg=process.argv.find(x=>x.startsWith('--tenant='));
const tenantSlug=slugArg?.slice('--tenant='.length);
if(!tenantSlug||!/^[a-zA-Z0-9_-]{2,128}$/.test(tenantSlug))
 throw new Error('Supply --tenant=<tenant-slug>');
const connectionString=process.env.DATABASE_URL??process.env.METADRIVE_DATABASE_URL;
if(!connectionString)throw new Error('DATABASE_URL is required');
const graphs=JSON.parse(readFileSync(fileURLToPath(new URL('../flows/payment-flows.v1.json',import.meta.url)),'utf8'));
const names=['AcetillPaymentCash','AcetillPaymentCard'];
const fields=[
 ['PaymentMethod','Payment Method','text'],
 ['PaymentRequestId','Payment Request ID','text'],
 ['CashReceived','Cash Received','number'],
 ['ChangeDue','Change Due','number'],
 ['PaymentStatus','Payment Status','text']
];
function flatten(value,path,result){
 if(Array.isArray(value)){result.push([path,'array',null]);value.forEach((v,i)=>flatten(v,path+'/'+i,result));return;}
 if(value!==null&&typeof value==='object'){result.push([path,'object',null]);for(const [key,v] of Object.entries(value))flatten(v,path+'/'+key,result);return;}
 result.push([path,value===null?'null':typeof value,value===null?null:String(value)]);
}
const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:10000});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const tenant=await client.query('SELECT id FROM md_tenants WHERE slug=$1',[tenantSlug]);
 if(tenant.rowCount!==1)throw new Error('Tenant not found');
 const tenantId=tenant.rows[0].id;
 for(const object of ['Invoice','InvoiceLine','Product']){
  const found=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[tenantId,object]);
  if(!found.rowCount)throw new Error('Missing required shared Object '+object);
 }
 for(const [api,label,kind] of fields)
  await client.query(`INSERT INTO md_field_definitions
   (tenant_id,object_api,api_name,label,data_type,required)
   VALUES ($1,'Invoice',$2,$3,$4,false)
   ON CONFLICT (tenant_id,object_api,api_name) DO NOTHING`,[tenantId,api,label,kind]);
 for(const name of names){
  const existing=await client.query('SELECT id FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 LIMIT 1',[tenantId,name]);
  if(existing.rowCount){process.stdout.write(name+': existing Flow preserved\\n');continue;}
  const inserted=await client.query(`INSERT INTO md_flow_definitions
   (tenant_id,api_name,label,flow_type,version,active)
   VALUES($1,$2,$3,'Autolaunched Flow',1,false) RETURNING id`,
   [tenantId,name,graphs[name].label]);
  const values=[];flatten(graphs[name],'/builder',values);
  for(const [path,kind,text] of values)
   await client.query(`INSERT INTO md_flow_editor_values
   (tenant_id,flow_id,property_path,value_kind,value_text)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
   [tenantId,inserted.rows[0].id,path,kind,text]);
  process.stdout.write(name+': draft metadata installed\\n');
 }
 await client.query('COMMIT');
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
