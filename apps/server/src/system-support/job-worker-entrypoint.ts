import {randomUUID} from 'node:crypto';
import {SqlPersistence} from '../system-files/sql-persistence.js';
import {RbacEngine} from '../system-files/rbac-engine.js';
import {RecordEngine} from '../system-files/record-engine.js';
import {FlowRuntime} from '../system-files/flow-runtime.js';
import {NamedCredentialService} from './named-credential-service.js';
import {DurableJobService} from './durable-job-service.js';
import {DurableJobWorker,type ClaimedJob} from './durable-job-worker.js';
import {registerFlowJobHandler} from './flow-job-handler.js';
import {applySystemMigrations} from './system-migrations.js';

export async function startDurableJobWorker(env:NodeJS.ProcessEnv=process.env) {
 const db=new SqlPersistence(env.DATABASE_URL??'');
 try {
  await applySystemMigrations(db);
  const rbac=new RbacEngine(db);
  const records=new RecordEngine(db,rbac);
  const credentials=new NamedCredentialService(db,rbac);
  const flows=new FlowRuntime(db,rbac,records,
   (tenant,user,config,vars,key)=>credentials.callout(tenant,user,config,vars,key));
  const service=new DurableJobService(db);
  let authorize:((job:ClaimedJob)=>Promise<boolean>)|undefined;
  const worker=new DurableJobWorker(service,job=>authorize?.(job)??Promise.resolve(false),
   'metadrive-'+randomUUID());
  authorize=registerFlowJobHandler(worker,db,rbac,flows);
  const interval=Number(env.METADRIVE_WORKER_POLL_MS??'5000');
  if(!Number.isInteger(interval)||interval<1000||interval>60000)throw new Error('Invalid worker poll interval');
  let running=true;
  const terminate=()=>{running=false;};
  process.once('SIGTERM',terminate);
  process.once('SIGINT',terminate);
  try {
   while(running){
    try { await worker.runOnce(10); }
    catch(error){console.error('Durable job poll failed',error);}
    if(running)await new Promise<void>(resolve=>setTimeout(resolve,interval));
   }
  } finally {
   process.removeListener('SIGTERM',terminate);
   process.removeListener('SIGINT',terminate);
  }
 } finally {await db.close();}
}
startDurableJobWorker().catch(error=>{console.error('Durable worker startup failed',error);process.exitCode=1;});
