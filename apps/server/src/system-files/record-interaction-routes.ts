import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void f(req as Req,res).catch(next);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Activity={id:string;object_api:string;record_id:string;kind:string;subject:string;description:string;status:string;due_at:Date|null;created_by:string;created_by_name:string;created_at:Date};
type Chatter={id:string;object_api:string;record_id:string;body:string;created_by:string;created_by_name:string;created_at:Date};
type Comment={id:string;body:string;created_by:string;created_by_name:string;created_at:Date};
const activity=(x:Activity)=>({id:x.id,objectApiName:x.object_api,recordId:x.record_id,kind:x.kind,subject:x.subject,
 description:x.description,status:x.status,dueAt:x.due_at,createdBy:x.created_by,createdByName:x.created_by_name,createdAt:x.created_at});
const comment=(x:Comment)=>({id:x.id,body:x.body,createdBy:x.created_by,createdByName:x.created_by_name,createdAt:x.created_at});
export function registerRecordInteractionRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 async function record(req:Req,permission:'read'|'edit'){
  const a=req.actor!,name=req.params.objectApi,id=req.params.id;
  if(!api.test(name)||!uuid.test(id))throw Error('Invalid record');
  await rbac.require(a.tenant_id,a.user_id,name,permission);
  const found=await db.query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
   [a.tenant_id,name,id]);
  if(!found.rowCount)throw Error('Record not found');
  return a;
 }
 async function loadPost(tenantId:string,object:string,recordId:string,postId:string){
  const {rows}=await db.query<Chatter>(`SELECT p.*,u.email AS created_by_name
    FROM md_chatter_posts p JOIN md_users u ON u.tenant_id=p.tenant_id AND u.id=p.created_by
    WHERE p.tenant_id=$1 AND p.object_api=$2 AND p.record_id=$3 AND p.id=$4`,
   [tenantId,object,recordId,postId]);
  if(!rows[0])throw Error('Chatter post not found');
  const comments=await db.query<Comment>(`SELECT c.id,c.body,c.created_by,u.email AS created_by_name,c.created_at
   FROM md_chatter_comments c JOIN md_users u ON u.tenant_id=c.tenant_id AND u.id=c.created_by
   WHERE c.tenant_id=$1 AND c.post_id=$2 ORDER BY c.created_at,c.id LIMIT 200`,[tenantId,postId]);
  const p=rows[0];
  return {id:p.id,objectApiName:p.object_api,recordId:p.record_id,body:p.body,
   createdBy:p.created_by,createdByName:p.created_by_name,createdAt:p.created_at,comments:comments.rows.map(comment)};
 }
 app.get('/api/records/:objectApi/:id/activities',wrap(async(req,res)=>{
  const a=await record(req,'read'),o=req.params.objectApi,id=req.params.id;
  const {rows}=await db.query<Activity>(`SELECT x.*,u.email AS created_by_name FROM md_record_activities x
   JOIN md_users u ON u.tenant_id=x.tenant_id AND u.id=x.created_by
   WHERE x.tenant_id=$1 AND x.object_api=$2 AND x.record_id=$3 ORDER BY x.created_at DESC LIMIT 100`,
   [a.tenant_id,o,id]);
  res.json({activities:rows.map(activity)});
 }));
 app.post('/api/records/:objectApi/:id/activities',wrap(async(req,res)=>{
  const a=await record(req,'edit'),b=req.body??{};
  if(!['Task','Call','Event'].includes(b.kind)||typeof b.subject!=='string'||!b.subject.trim()||b.subject.length>250
   ||typeof b.description!=='string'||b.description.length>10000||b.status!=='Open'
   ||(b.dueAt!==null&&b.dueAt!==undefined&&(typeof b.dueAt!=='string'||!Number.isFinite(Date.parse(b.dueAt)))))
    throw Error('Invalid activity');
  const {rows}=await db.query<Activity>(`WITH created AS (
   INSERT INTO md_record_activities(tenant_id,object_api,record_id,kind,subject,description,status,due_at,created_by)
   VALUES($1,$2,$3,$4,$5,$6,'Open',$7,$8) RETURNING *
  ) SELECT created.*,u.email AS created_by_name FROM created
   JOIN md_users u ON u.tenant_id=created.tenant_id AND u.id=created.created_by`,
   [a.tenant_id,req.params.objectApi,req.params.id,b.kind,b.subject.trim(),b.description,b.dueAt??null,a.user_id]);
  res.status(201).json({activity:activity(rows[0])});
 }));
 app.patch('/api/records/:objectApi/:id/activities/:activityId',wrap(async(req,res)=>{
  const a=await record(req,'edit'),status=req.body?.status;
  if(!uuid.test(req.params.activityId)||!['Open','Completed'].includes(status))throw Error('Invalid activity status');
  const {rows}=await db.query<Activity>(`WITH updated AS (
   UPDATE md_record_activities SET status=$5 WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3 AND id=$4
   RETURNING *
  ) SELECT updated.*,u.email AS created_by_name FROM updated
   JOIN md_users u ON u.tenant_id=updated.tenant_id AND u.id=updated.created_by`,
   [a.tenant_id,req.params.objectApi,req.params.id,req.params.activityId,status]);
  if(!rows[0])throw Error('Activity not found');
  res.json({activity:activity(rows[0])});
 }));
 app.get('/api/records/:objectApi/:id/chatter',wrap(async(req,res)=>{
  const a=await record(req,'read'),o=req.params.objectApi,id=req.params.id;
  const {rows}=await db.query<{id:string}>(`SELECT id FROM md_chatter_posts WHERE tenant_id=$1 AND object_api=$2
   AND record_id=$3 ORDER BY created_at DESC LIMIT 100`,[a.tenant_id,o,id]);
  const posts=[];
  for(const p of rows)posts.push(await loadPost(a.tenant_id,o,id,p.id));
  res.json({posts});
 }));
 app.post('/api/records/:objectApi/:id/chatter',wrap(async(req,res)=>{
  const a=await record(req,'edit'),body=req.body?.body;
  if(typeof body!=='string'||!body.trim()||body.length>10000)throw Error('Invalid Chatter post');
  const {rows}=await db.query<{id:string}>(`INSERT INTO md_chatter_posts
   (tenant_id,object_api,record_id,body,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
   [a.tenant_id,req.params.objectApi,req.params.id,body.trim(),a.user_id]);
  res.status(201).json({post:await loadPost(a.tenant_id,req.params.objectApi,req.params.id,rows[0].id)});
 }));
 app.post('/api/records/:objectApi/:id/chatter/:postId/comments',wrap(async(req,res)=>{
  const a=await record(req,'edit'),body=req.body?.body,post=req.params.postId;
  if(!uuid.test(post)||typeof body!=='string'||!body.trim()||body.length>10000)throw Error('Invalid Chatter comment');
  const existing=await db.query(`SELECT id FROM md_chatter_posts WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3 AND id=$4`,
   [a.tenant_id,req.params.objectApi,req.params.id,post]);
  if(!existing.rowCount)throw Error('Chatter post not found');
  await db.query(`INSERT INTO md_chatter_comments(tenant_id,post_id,body,created_by)
   VALUES($1,$2,$3,$4)`,[a.tenant_id,post,body.trim(),a.user_id]);
  res.status(201).json({post:await loadPost(a.tenant_id,req.params.objectApi,req.params.id,post)});
 }));
}
