import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {FlowRuntime} from '../system-files/flow-runtime.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import type {ClaimedJob,DurableJobWorker} from './durable-job-worker.js';

/** Authorize every delivery; queued jobs never acquire implicit system rights. */
export function registerFlowJobHandler(worker:DurableJobWorker,db:SqlPersistence,
  rbac:RbacEngine,flows:FlowRuntime){
 const authorize=async(job:ClaimedJob)=>{
  if(job.job_type!=='flow.execute'||!job.actor_user_id||!job.resource_id||!job.resource_version||
   !/^[A-Za-z][A-Za-z0-9_]*$/.test(job.resource_id))return false;
  const {rows:actors}=await db.query(
   'SELECT 1 FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true',
   [job.tenant_id,job.actor_user_id]);
  if(!actors.length)return false;
  if(job.app_api_name){
   const {rows:apps}=await db.query(`
    SELECT 1 FROM md_apps a
    JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
    JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
    WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
      AND (e.expires_at IS NULL OR e.expires_at>now())
      AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)`,
     [job.tenant_id,job.app_api_name]);
   if(!apps.length)return false;
  }
  const {rows:published}=await db.query(`
    SELECT 1 FROM md_flow_definitions
    WHERE tenant_id=$1 AND api_name=$2 AND version=$3 AND active=true AND archived=false LIMIT 1`,
   [job.tenant_id,job.resource_id,job.resource_version]);
  if(!published.length)return false;
  return rbac.allowed(job.tenant_id,job.actor_user_id,
   'Flow:'+job.resource_id,'execute');
 };
 worker.register('flow.execute',async job=>{
  if(!await authorize(job))throw new Error('Job authorization changed');
  await flows.execute(job.tenant_id,job.resource_id!,job.actor_user_id!,{});
 });
 return authorize;
}
