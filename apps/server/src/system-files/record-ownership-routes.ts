import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {RecordEngine} from './record-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
export function registerRecordOwnershipRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,records:RecordEngine){
 async function check(req:Req,action:'read'|'edit'){
  const a=req.actor!;
  if(!safe.test(req.params.objectApi)||!uuid.test(req.params.id))throw Error('Invalid record');
  await rbac.require(a.tenant_id,a.user_id,req.params.objectApi,action);
  return a;
 }
 app.get('/api/records/:objectApi/:id/history',wrap(async(req,res)=>{
  const a=await check(req,'read');
  const {rows}=await db.query<{id:string;change_type:string;previous_data:Record<string,unknown>;next_data:Record<string,unknown>;changed_by:string;changed_at:Date}>(
   `SELECT id,change_type,previous_data,next_data,changed_by,changed_at
    FROM md_record_change_history WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3
    ORDER BY changed_at DESC,id DESC LIMIT 100`,[a.tenant_id,req.params.objectApi,req.params.id]);
  res.json({history:rows.map(r=>({id:r.id,type:r.change_type,before:r.previous_data,after:r.next_data,
    changedBy:r.changed_by,createdAt:r.changed_at}))});
 }));
 app.put('/api/records/:objectApi/:id/owner',wrap(async(req,res)=>{
  const a=await check(req,'edit'),owner=req.body?.ownerId;
  if(typeof owner!=='string'||!uuid.test(owner))throw Error('Invalid Owner ID');
  await rbac.require(a.tenant_id,a.user_id,'User','read');
  await db.transaction(async client=>{
   const found=await client.query<{owner_id:string|null;updated_at:Date}>(`
    SELECT owner_id,updated_at FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 FOR UPDATE`,
    [a.tenant_id,req.params.objectApi,req.params.id]);
   if(!found.rows[0])throw Error('Record not found');
   const unmodified=req.get('If-Unmodified-Since');
   if(unmodified&&(!Number.isFinite(Date.parse(unmodified))||
    found.rows[0].updated_at.getTime()>Date.parse(unmodified)+999))throw Error('Record changed since last read');
   const user=await client.query('SELECT id FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true',
    [a.tenant_id,owner]);
   if(!user.rowCount)throw Error('Record owner must be an active tenant user');
   if(found.rows[0].owner_id===owner)return;
   await client.query('UPDATE md_records SET owner_id=$4,updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
     [a.tenant_id,req.params.objectApi,req.params.id,owner]);
   await client.query(`INSERT INTO md_record_change_history
    (tenant_id,object_api,record_id,changed_by,change_type,previous_data,next_data)
    VALUES($1,$2,$3,$4,'owner',$5::jsonb,$6::jsonb)`,
    [a.tenant_id,req.params.objectApi,req.params.id,a.user_id,
     JSON.stringify({OwnerId:found.rows[0].owner_id}),JSON.stringify({OwnerId:owner})]);
  });
  res.json({record:await records.get(a.tenant_id,a.user_id,req.params.objectApi,req.params.id)});
 }));
}
