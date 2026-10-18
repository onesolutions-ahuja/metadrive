import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
type Actor={tenant_id:string;user_id:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
type SubscriptionRow={id:string;dashboard_api:string;created_by:string;label:string;frequency:string;
 local_time:string;time_zone:string;day_of_week:number|null;recipient_user_ids:string[];
 named_credential_id:string|null;from_email:string;active:boolean;save_snapshots:boolean;
 next_run_at:Date;last_run_at:Date|null;last_run_status:string;last_run_error:string|null;created_at:Date;updated_at:Date};
const view=(r:SubscriptionRow)=>({id:r.id,dashboardApiName:r.dashboard_api,createdBy:r.created_by,
 label:r.label,frequency:r.frequency,localTime:r.local_time,timeZone:r.time_zone,dayOfWeek:r.day_of_week,
 recipientUserIds:r.recipient_user_ids,namedCredentialId:r.named_credential_id??'',fromEmail:r.from_email,
 active:r.active,saveSnapshots:r.save_snapshots,nextRunAt:new Date(r.next_run_at).toISOString(),
 lastRunAt:r.last_run_at?new Date(r.last_run_at).toISOString():null,lastRunStatus:r.last_run_status,
 lastRunError:r.last_run_error,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()});
export class DashboardSubscriptionService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 private async dashboard(actor:Actor,dashboard:string,action:'read'|'manage'){
  if(!api.test(dashboard))throw new Error('Invalid dashboard');
  await this.rbac.require(actor.tenant_id,actor.user_id,'SystemDefinition:dashboards',action);
  const found=await this.db.query(
   "SELECT 1 FROM md_system_definitions WHERE tenant_id=$1 AND kind='dashboards' AND api_name=$2 AND enabled=true",
   [actor.tenant_id,dashboard]);
  if(!found.rowCount)throw new Error('Dashboard not found');
 }
 async list(actor:Actor,dashboard:string){
  await this.dashboard(actor,dashboard,'read');
  const {rows}=await this.db.query<SubscriptionRow>(
   'SELECT * FROM md_dashboard_subscriptions WHERE tenant_id=$1 AND dashboard_api=$2 ORDER BY created_at DESC LIMIT 100',
   [actor.tenant_id,dashboard]);
  return {subscriptions:rows.map(view)};
 }
 private async validate(actor:Actor,input:unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid dashboard subscription');
  const p=input as Record<string,unknown>;
  if(typeof p.label!=='string'||!p.label.trim()||p.label.length>160||
   !['Daily','Weekly'].includes(String(p.frequency))||
   typeof p.localTime!=='string'|| !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.localTime)||
   typeof p.timeZone!=='string'||p.timeZone.length>80||
   !Array.isArray(p.recipientUserIds)||p.recipientUserIds.length>100||
   p.recipientUserIds.some(x=>typeof x!=='string'||!uuid.test(x))||
   (p.frequency==='Weekly'&&(!Number.isInteger(p.dayOfWeek)||Number(p.dayOfWeek)<0||Number(p.dayOfWeek)>6))||
   (p.frequency==='Daily'&&p.dayOfWeek!==null)||
   typeof p.namedCredentialId!=='string'||
   (p.namedCredentialId!==''&&!uuid.test(p.namedCredentialId))||
   typeof p.fromEmail!=='string'||p.fromEmail.length>254||
   typeof p.active!=='boolean'||typeof p.saveSnapshots!=='boolean')
   throw new Error('Invalid dashboard subscription');
  if(p.active)throw new Error('Dashboard subscription delivery is not available in SQL runtime');
  const zone=await this.db.query('SELECT 1 FROM pg_timezone_names WHERE name=$1',[p.timeZone]);
  if(!zone.rowCount)throw new Error('Invalid time zone');
  const recipients=await this.db.query<{id:string}>(
   'SELECT id FROM md_users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND enabled=true',
   [actor.tenant_id,p.recipientUserIds]);
  if(recipients.rows.length!==new Set(p.recipientUserIds as string[]).size)throw new Error('Invalid recipients');
  if(p.namedCredentialId){
    const credential=await this.db.query(
     "SELECT id FROM md_named_credentials WHERE tenant_id=$1 AND id=$2 AND protocol='SMTP' AND enabled=true",
     [actor.tenant_id,p.namedCredentialId]);
    if(!credential.rowCount)throw new Error('SMTP credential not found');
  }
  return p;
 }
 async save(actor:Actor,dashboard:string,input:unknown,id?:string){
  await this.dashboard(actor,dashboard,'manage');
  const p=await this.validate(actor,input);
  if(id&&!uuid.test(id))throw new Error('Invalid subscription ID');
  const data=[actor.tenant_id,dashboard,actor.user_id,p.label,p.frequency,p.localTime,p.timeZone,
   p.dayOfWeek,p.recipientUserIds,p.namedCredentialId||null,p.fromEmail,p.active,p.saveSnapshots];
  const statement=id?`
    UPDATE md_dashboard_subscriptions SET label=$4,frequency=$5,local_time=$6,time_zone=$7,
      day_of_week=$8,recipient_user_ids=$9,named_credential_id=$10,from_email=$11,
      active=$12,save_snapshots=$13,updated_at=now()
    WHERE tenant_id=$1 AND dashboard_api=$2 AND id=$14 RETURNING *`:`
    INSERT INTO md_dashboard_subscriptions(tenant_id,dashboard_api,created_by,label,frequency,
      local_time,time_zone,day_of_week,recipient_user_ids,named_credential_id,from_email,active,
      save_snapshots,next_run_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
    RETURNING *`;
  const {rows}=await this.db.query<SubscriptionRow>(statement,id?[...data,id]:data);
  if(!rows[0])throw new Error('Dashboard subscription not found');
  return {subscription:view(rows[0])};
 }
 async remove(actor:Actor,dashboard:string,id:string){
  await this.dashboard(actor,dashboard,'manage');
  if(!uuid.test(id))throw new Error('Invalid subscription ID');
  const {rowCount}=await this.db.query(
   'DELETE FROM md_dashboard_subscriptions WHERE tenant_id=$1 AND dashboard_api=$2 AND id=$3',
   [actor.tenant_id,dashboard,id]);
  if(!rowCount)throw new Error('Dashboard subscription not found');
 }
}
