import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

/** SQL job lifecycle primitives; execution policy stays in the shared Flow/action runtime. */
export class DurableJobService {
 constructor(private readonly db:SqlPersistence) {}

 async enqueue(tenantId:string,kind:string,options:{
  actorUserId?:string;appApiName?:string;resourceId?:string;resourceVersion?:number;
  scheduledAt?:Date;idempotencyKey?:string;maxAttempts?:number;recurrenceSeconds?:number;
 }={}) {
  if(!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(kind))throw new Error('Invalid job type');
  if(options.resourceVersion!==undefined&&(!Number.isInteger(options.resourceVersion)||options.resourceVersion<1))
   throw new Error('Invalid resource version');
  if(options.maxAttempts!==undefined&&(!Number.isInteger(options.maxAttempts)||options.maxAttempts<1||options.maxAttempts>100))
   throw new Error('Invalid retry limit');
  if(options.recurrenceSeconds!==undefined&&(!Number.isInteger(options.recurrenceSeconds)||options.recurrenceSeconds<60||options.recurrenceSeconds>31536000))
   throw new Error('Invalid recurring interval');
  const {rows}=await this.db.query<{id:string}>(`
   INSERT INTO md_durable_jobs
    (tenant_id,job_type,actor_user_id,app_api_name,resource_id,resource_version,scheduled_at,idempotency_key,max_attempts,recurrence_seconds)
   VALUES($1,$2,$3,$4,$5,$10,COALESCE($6,now()),$7,COALESCE($8,5),$9)
   ON CONFLICT(tenant_id,job_type,idempotency_key) WHERE idempotency_key IS NOT NULL
   DO UPDATE SET updated_at=md_durable_jobs.updated_at
   RETURNING id
  `,[tenantId,kind,options.actorUserId??null,options.appApiName??null,options.resourceId??null,
    options.scheduledAt??null,options.idempotencyKey??null,options.maxAttempts??null,options.recurrenceSeconds??null,options.resourceVersion??null]);
  return rows[0].id;
 }

 /** SKIP LOCKED allows many workers without duplicate successful leases. */
 async claim(workerId:string,limit=10,leaseSeconds=60) {
  if(!workerId||workerId.length>128)throw new Error('Invalid worker');
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid batch');
  if(!Number.isInteger(leaseSeconds)||leaseSeconds<10||leaseSeconds>3600)throw new Error('Invalid lease');
  return this.db.transaction(async (client:PoolClient)=>{
   const {rows}=await client.query<{id:string;tenant_id:string;job_type:string;actor_user_id:string|null;app_api_name:string|null;resource_id:string|null;resource_version:number|null;attempt:number}>(`
     WITH due AS (
      SELECT id FROM md_durable_jobs
      WHERE ((status='queued' AND scheduled_at<=now())
        OR (status='leased' AND lease_until<now()))
        AND attempt<max_attempts
      ORDER BY scheduled_at,id
      LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE md_durable_jobs j
     SET status='leased',lease_owner=$2,lease_until=now()+($3::integer * interval '1 second'),
         attempt=j.attempt+1,updated_at=now()
     FROM due WHERE j.id=due.id AND j.attempt<j.max_attempts
     RETURNING j.id,j.tenant_id,j.job_type,j.actor_user_id,j.app_api_name,j.resource_id,j.resource_version,j.attempt
   `,[limit,workerId,leaseSeconds]);
   await client.query(`UPDATE md_durable_jobs SET status='failed',lease_owner=NULL,lease_until=NULL,updated_at=now(),error_code='LEASE_EXHAUSTED' WHERE status='leased' AND lease_until<now() AND attempt>=max_attempts`);
   return rows;
  });
 }

 async complete(tenantId:string,id:string,workerId:string) {
  const {rowCount}=await this.db.query(`
   UPDATE md_durable_jobs SET
    status=CASE WHEN recurrence_seconds IS NULL THEN 'completed' ELSE 'queued' END,
    scheduled_at=CASE WHEN recurrence_seconds IS NULL THEN scheduled_at ELSE GREATEST(scheduled_at + recurrence_seconds * interval '1 second',now() + interval '1 second') END,
    attempt=CASE WHEN recurrence_seconds IS NULL THEN attempt ELSE 0 END,
    lease_owner=NULL,lease_until=NULL,updated_at=now()
   WHERE tenant_id=$1 AND id=$2 AND status='leased' AND lease_owner=$3 AND lease_until>now()
  `,[tenantId,id,workerId]);
  if(!rowCount)throw new Error('Job lease missing or expired');
 }

 async fail(tenantId:string,id:string,workerId:string,errorCode:string,retryDelaySeconds=60) {
  if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(errorCode))throw new Error('Invalid error code');
  if(!Number.isInteger(retryDelaySeconds)||retryDelaySeconds<0||retryDelaySeconds>86400)
   throw new Error('Invalid retry delay');
  const {rowCount}=await this.db.query(`
   UPDATE md_durable_jobs SET
    status=CASE WHEN attempt>=max_attempts THEN 'failed' ELSE 'queued' END,
    scheduled_at=now()+($5::integer * interval '1 second'),lease_owner=NULL,lease_until=NULL,
    error_code=$4,updated_at=now()
   WHERE tenant_id=$1 AND id=$2 AND status='leased' AND lease_owner=$3 AND lease_until>now()
  `,[tenantId,id,workerId,errorCode,retryDelaySeconds]);
  if(!rowCount)throw new Error('Job lease missing or expired');
 }

 async cancelApp(tenantId:string,appApiName:string) {
  return this.db.query(`
   UPDATE md_durable_jobs SET status='cancelled',lease_owner=NULL,lease_until=NULL,updated_at=now()
   WHERE tenant_id=$1 AND app_api_name=$2 AND status IN ('queued','leased')
  `,[tenantId,appApiName]);
 }
}
