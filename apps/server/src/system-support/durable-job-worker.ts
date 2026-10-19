import type {DurableJobService} from './durable-job-service.js';

export type ClaimedJob={
 id:string;tenant_id:string;job_type:string;actor_user_id:string|null;
 app_api_name:string|null;resource_id:string|null;resource_version:number|null;attempt:number;execution_scope?:string;
};
export type JobHandler=(job:ClaimedJob)=>Promise<void>;
export type JobAuthorizer=(job:ClaimedJob)=>Promise<boolean>;

/**
 * Shared worker dispatcher. Registration is explicit: an unknown job cannot run.
 * Authorizer must check active tenant/app/licence, published flow and current RBAC.
 * Workers execute jobs only after that check; no implicit system access.
 */
export class DurableJobWorker {
 private readonly handlers=new Map<string,JobHandler>();
 constructor(
  private readonly jobs:DurableJobService,
  private readonly authorize:JobAuthorizer,
  private readonly workerId:string,
 ) {
  if(!workerId || workerId.length>128)throw new Error('Invalid worker ID');
 }
 register(kind:string,handler:JobHandler){
  if(this.handlers.has(kind))throw new Error('Duplicate job handler: '+kind);
  if(!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(kind))throw new Error('Invalid job kind');
  this.handlers.set(kind,handler);
 }
 async runOnce(batch=1){
  const due=await this.jobs.claim(this.workerId,batch);
  let completed=0,failed=0;
  for(const job of due){
   let replayBlocked=false;
   // One job is claimed by default. Heartbeats prevent long Flows from expiring
   // while the worker is still alive; lost leases always fail closed.
   const heartbeat=setInterval(()=>{
    void this.jobs.renewLease(job.tenant_id,job.id,this.workerId).catch(()=>{});
   },20000);
   try {
    if(job.job_type==='flow.execute'&&job.attempt>1)replayBlocked=true;
    const handler=this.handlers.get(job.job_type);
    if(!handler)throw new Error('Unregistered job type');
    if(!await this.authorize(job))throw new Error('Job no longer authorised');
    await handler(job);
    await this.jobs.complete(job.tenant_id,job.id,this.workerId);
    completed++;
   } catch {
    // Never serialize arbitrary error text, secrets or other tenant information.
    try {
     await this.jobs.fail(job.tenant_id,job.id,this.workerId,replayBlocked?'FLOW_RECONCILIATION_REQUIRED':'JOB_EXECUTION_FAILED',
      Math.min(3600,Math.pow(2,Math.min(job.attempt,10))*15));
    } catch {
     // Failed leases are reclaimable by a subsequent worker after expiration.
    }
    failed++;
   } finally {
    clearInterval(heartbeat);
   }
  }
  return {claimed:due.length,completed,failed};
 }
}
