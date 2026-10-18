import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type SqlApproval={id:string;group_id:string;object_api:string;record_id:string;flow_api:string;submitted_by:string;approver_id:string;status:string;comments:string;decision_comments:string;created_at:Date;decided_at:Date|null;decided_by:string|null};
const shape=(x:SqlApproval)=>({id:x.id,groupId:x.group_id,objectApiName:x.object_api,objectLabel:x.object_api,recordId:x.record_id,recordName:x.record_id,flowApiName:x.flow_api,submittedBy:x.submitted_by,submittedByName:'',approverId:x.approver_id,status:x.status,comments:x.comments,decisionComments:x.decision_comments,createdAt:x.created_at,decidedAt:x.decided_at,decidedBy:x.decided_by});
export function registerApprovalSqlRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.get('/api/approvals/inbox',wrap(async(req,res)=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'ApprovalRequest','read');
  const {rows}=await db.query<SqlApproval>(
   "SELECT * FROM md_approval_requests WHERE tenant_id=$1 AND approver_id=$2 AND status='Pending' ORDER BY created_at DESC LIMIT 100",
   [a.tenant_id,a.user_id]);
  res.json({requests:rows.map(shape)});
 }));
 app.post('/api/approvals/:id/decision',wrap(async(req,res)=>{
  const a=req.actor!,id=req.params.id,decision=req.body?.decision;
  await rbac.require(a.tenant_id,a.user_id,'ApprovalRequest','edit');
  if(!uuid.test(id)||!['Approved','Rejected'].includes(decision))throw Error('Invalid approval decision');
  const {rows}=await db.query<SqlApproval>(
   `UPDATE md_approval_requests SET status=$4,decided_at=now(),decided_by=$2,
     decision_comments=$5 WHERE tenant_id=$1 AND approver_id=$2 AND id=$3 AND status='Pending'
     RETURNING *`,
   [a.tenant_id,a.user_id,id,decision,typeof req.body?.comments==='string'?req.body.comments.slice(0,2000):'']);
  if(!rows[0])throw Error('Pending approval not found');
  res.json({request:shape(rows[0])});
 }));
}
