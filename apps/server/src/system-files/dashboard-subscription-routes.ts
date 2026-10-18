import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {sendTenantMail} from './tenant-smtp-outbound.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Config={label:string;frequency:'Daily'|'Weekly';localTime:string;timeZone:string;dayOfWeek:number|null;
 recipientUserIds:string[];namedCredentialId:string;fromEmail:string;active:boolean;saveSnapshots:boolean};
type SubRow={id:string;dashboard_api:string;created_by:string;configuration:Config;
 next_run_at:Date;last_run_at:Date|null;last_run_status:string;last_run_error:string|null;created_at:Date;updated_at:Date};
const shape=(r:SubRow)=>({...r.configuration,id:r.id,dashboardApiName:r.dashboard_api,
 nextRunAt:r.next_run_at,lastRunAt:r.last_run_at,lastRunStatus:r.last_run_status,
 lastRunError:r.last_run_error,createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at});
const zoned=(date:Date,zone:string)=>{
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const p=Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,Number(x.value)]));
 return {year:p.year,month:p.month,day:p.day,hour:p.hour,minute:p.minute};
};
function nextRun(config:Config,now=Date.now()){
 const [hours,minutes]=config.localTime.split(':').map(Number);
 const local=zoned(new Date(now),config.timeZone);
 for(let offset=0;offset<16;offset++){
  const date=new Date(Date.UTC(local.year,local.month-1,local.day+offset));
  if(config.frequency==='Weekly'&&date.getUTCDay()!==config.dayOfWeek)continue;
  let candidate=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hours,minutes);
  for(let i=0;i<4;i++){
   const inZone=zoned(new Date(candidate),config.timeZone);
   const actual=Date.UTC(inZone.year,inZone.month-1,inZone.day,inZone.hour,inZone.minute);
   const desired=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hours,minutes);
   candidate+=desired-actual;
  }
  const check=zoned(new Date(candidate),config.timeZone);
  if(check.year===date.getUTCFullYear()&&check.month===date.getUTCMonth()+1
   &&check.day===date.getUTCDate()&&check.hour===hours&&check.minute===minutes&&candidate>now)
   return new Date(candidate);
 }
 throw Error('No valid upcoming dashboard subscription time');
}
function valid(input:unknown):Config{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid subscription');
 const x=input as Record<string,unknown>;
 if(typeof x.label!=='string'||!x.label.trim()||x.label.length>200
  ||!['Daily','Weekly'].includes(String(x.frequency))
  ||typeof x.localTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.localTime)
  ||typeof x.timeZone!=='string'||x.timeZone.length>100
  ||x.frequency==='Weekly'&&(!Number.isInteger(x.dayOfWeek)||(x.dayOfWeek as number)<0||(x.dayOfWeek as number)>6)
  ||x.frequency==='Daily'&&x.dayOfWeek!==null
  ||!Array.isArray(x.recipientUserIds)||!x.recipientUserIds.length||x.recipientUserIds.length>100
  ||x.recipientUserIds.some(id=>typeof id!=='string'||!uuid.test(id))
  ||new Set(x.recipientUserIds).size!==x.recipientUserIds.length
  ||typeof x.namedCredentialId!=='string'||!uuid.test(x.namedCredentialId)
  ||typeof x.fromEmail!=='string'||!email.test(x.fromEmail)
  ||typeof x.active!=='boolean'||typeof x.saveSnapshots!=='boolean')
  throw Error('Invalid dashboard subscription');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:x.timeZone});}catch{throw Error('Unsupported time zone');}
 return x as Config;
}
export function registerDashboardSubscriptions(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const resource='SystemDefinition:dashboards';
 const lookup=async(req:Req,action:'read'|'manage')=>{
  const a=req.actor!,name=req.params.apiName;
  if(!api.test(name))throw Error('Invalid dashboard name');
  await rbac.require(a.tenant_id,a.user_id,resource,action);
  const {rows}=await db.query<{label:string}>(`SELECT label FROM md_system_definitions
   WHERE tenant_id=$1 AND kind='dashboards' AND api_name=$2 AND enabled=true`,[a.tenant_id,name]);
  if(!rows[0])throw Error('Dashboard not found');
  return {actor:a,label:rows[0].label};
 };
 app.get('/api/metadata/dashboards/:apiName/subscriptions',wrap(async(req,res)=>{
  const {actor}=await lookup(req,'read');
  const manage=await rbac.allowed(actor.tenant_id,actor.user_id,resource,'manage');
  const {rows}=await db.query<SubRow>(`SELECT * FROM md_dashboard_subscriptions
   WHERE tenant_id=$1 AND dashboard_api=$2 AND ($3::boolean OR created_by=$4)
   ORDER BY created_at DESC LIMIT 100`,[actor.tenant_id,req.params.apiName,manage,actor.user_id]);
  res.json({subscriptions:rows.map(shape)});
 }));
 const write=async(req:Req,res:Response,id?:string)=>{
  const {actor}=await lookup(req,'manage'),cfg=valid(req.body);
  const users=await db.query<{id:string}>(`SELECT id FROM md_users
   WHERE tenant_id=$1 AND enabled=true AND id=ANY($2::uuid[])`,[actor.tenant_id,cfg.recipientUserIds]);
  if(users.rows.length!==cfg.recipientUserIds.length)throw Error('Recipients must be active tenant users');
  const credential=await db.query(`SELECT id FROM md_named_credentials
   WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true`,[actor.tenant_id,cfg.namedCredentialId]);
  if(!credential.rowCount)throw Error('SMTP Named Credential is unavailable');
  const when=nextRun(cfg);
  const result=id?
   await db.query<SubRow>(`UPDATE md_dashboard_subscriptions
    SET configuration=$4::jsonb,active=$5,next_run_at=$6,updated_at=now()
    WHERE tenant_id=$1 AND dashboard_api=$2 AND id=$3 RETURNING *`,
    [actor.tenant_id,req.params.apiName,id,JSON.stringify(cfg),cfg.active,when]):
   await db.query<SubRow>(`INSERT INTO md_dashboard_subscriptions
    (tenant_id,dashboard_api,created_by,configuration,active,next_run_at)
    VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
    [actor.tenant_id,req.params.apiName,actor.user_id,JSON.stringify(cfg),cfg.active,when]);
  if(!result.rows[0])throw Error('Subscription not found');
  res.status(id?200:201).json({subscription:shape(result.rows[0])});
 };
 app.post('/api/metadata/dashboards/:apiName/subscriptions',wrap(async(req,res)=>write(req,res)));
 app.put('/api/metadata/dashboards/:apiName/subscriptions/:id',wrap(async(req,res)=>{
  if(!uuid.test(req.params.id))throw Error('Invalid subscription ID');
  await write(req,res,req.params.id);
 }));
 app.delete('/api/metadata/dashboards/:apiName/subscriptions/:id',wrap(async(req,res)=>{
  const {actor}=await lookup(req,'manage');
  if(!uuid.test(req.params.id))throw Error('Invalid subscription ID');
  const r=await db.query(`DELETE FROM md_dashboard_subscriptions
   WHERE tenant_id=$1 AND dashboard_api=$2 AND id=$3 RETURNING id`,
   [actor.tenant_id,req.params.apiName,req.params.id]);
  if(!r.rowCount)throw Error('Subscription not found');
  res.status(204).end();
 }));
 app.post('/api/metadata/dashboards/:apiName/subscriptions/:id/run',wrap(async(req,res)=>{
  const {actor,label}=await lookup(req,'manage'),id=req.params.id;
  if(!uuid.test(id))throw Error('Invalid subscription');
  const {rows}=await db.query<SubRow>(`SELECT * FROM md_dashboard_subscriptions
   WHERE tenant_id=$1 AND dashboard_api=$2 AND id=$3`,[actor.tenant_id,req.params.apiName,id]);
  const sub=rows[0];if(!sub)throw Error('Subscription not found');
  const cfg=sub.configuration;
  if(!sub.active)throw Error('Subscription disabled');
  // Fail closed rather than claiming to have generated a snapshot or delivered a message.
  if(cfg.saveSnapshots)throw Error('Snapshot delivery must use the shared Dashboard snapshot action');
  const attempt=await db.query<{id:string}>(`INSERT INTO md_dashboard_subscription_runs
   (tenant_id,subscription_id,requested_by,status) VALUES($1,$2,$3,'pending') RETURNING id`,
   [actor.tenant_id,id,actor.user_id]);
  const runId=attempt.rows[0].id;
  try{
   const recipients=await db.query<{email:string}>(`SELECT email FROM md_users
    WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND enabled=true`,
    [actor.tenant_id,cfg.recipientUserIds]);
   if(recipients.rows.length!==cfg.recipientUserIds.length)
    throw Error('Subscription recipients no longer active');
   await sendTenantMail(db,actor.tenant_id,cfg.namedCredentialId,cfg.fromEmail,
    recipients.rows.map(x=>x.email),'MetaDrive Dashboard: '+label,
    'Your dashboard '+label+' is available in MetaDrive. Sign in to view permitted live data.');
   await db.transaction(async client=>{
    await client.query(`UPDATE md_dashboard_subscription_runs SET status='success',finished_at=now()
     WHERE tenant_id=$1 AND id=$2`,[actor.tenant_id,runId]);
    await client.query(`UPDATE md_dashboard_subscriptions SET last_run_at=now(),
     last_run_status='Success',last_run_error=NULL,next_run_at=$3,updated_at=now()
     WHERE tenant_id=$1 AND id=$2`,[actor.tenant_id,id,nextRun(cfg)]);
   });
  }catch(e){
   await db.transaction(async client=>{
    await client.query(`UPDATE md_dashboard_subscription_runs SET status='failed',finished_at=now(),error=$3
     WHERE tenant_id=$1 AND id=$2`,[actor.tenant_id,runId,'SMTP delivery failed']);
    await client.query(`UPDATE md_dashboard_subscriptions SET last_run_at=now(),
     last_run_status='Failed',last_run_error=$3,updated_at=now()
     WHERE tenant_id=$1 AND id=$2`,[actor.tenant_id,id,'SMTP delivery failed']);
   });
   throw Error('Subscription delivery failed');
  }
  const updated=await db.query<SubRow>('SELECT * FROM md_dashboard_subscriptions WHERE tenant_id=$1 AND id=$2',
   [actor.tenant_id,id]);
  res.json({subscription:shape(updated.rows[0])});
 }));
}
