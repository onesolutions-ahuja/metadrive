import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const present=(r:{id:string;recipient_id:string;title:string;body:string;flow_api:string|null;sent_by:string|null;created_at:Date;read_at:Date|null})=>
 ({id:r.id,recipientId:r.recipient_id,title:r.title,body:r.body,flowApiName:r.flow_api??'',sentBy:r.sent_by??'',createdAt:r.created_at,readAt:r.read_at});
export function registerNotificationSqlRoutes(app:Express,db:SqlPersistence){
 app.get('/api/notifications',wrap(async(req,res)=>{
  const a=req.actor!;
  const {rows}=await db.query<{id:string;recipient_id:string;title:string;body:string;flow_api:string|null;sent_by:string|null;created_at:Date;read_at:Date|null}>(
   'SELECT id,recipient_id,title,body,flow_api,sent_by,created_at,read_at FROM md_notifications WHERE tenant_id=$1 AND recipient_id=$2 ORDER BY created_at DESC LIMIT 100',
   [a.tenant_id,a.user_id]);
  const unread=await db.query<{count:string}>(
   'SELECT count(*)::text AS count FROM md_notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL',
   [a.tenant_id,a.user_id]);
  res.json({notifications:rows.map(present),unreadCount:Number(unread.rows[0]?.count??0)});
 }));
 app.post('/api/notifications/:id/read',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id;
  if(!uuid.test(id))throw Error('Invalid notification ID');
  const {rows}=await db.query<{id:string;recipient_id:string;title:string;body:string;flow_api:string|null;sent_by:string|null;created_at:Date;read_at:Date|null}>(
   'UPDATE md_notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 RETURNING id,recipient_id,title,body,flow_api,sent_by,created_at,read_at',
   [a.tenant_id,a.user_id,id]);
  if(!rows[0])throw Error('Notification not found');
  res.json({notification:present(rows[0])});
 }));
}
