import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Actor={tenant_id:string;user_id:string};
type Req=Request&{actor?:Actor};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
type Kind='flow'|'page';
export function registerBuilderSqlRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const permission=(kind:Kind)=>kind==='flow'?'FlowDefinition':'PageDefinition';
 async function save(req:Req,res:Response,kind:Kind){
  const a=req.actor!,name=req.params.apiName,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,permission(kind),'edit');
  if(!safe.test(name)||!body||typeof body!=='object'||Array.isArray(body)||body.apiName!==name)throw Error('Invalid definition');
  if(JSON.stringify(body).length>65536)throw Error('Definition too large');
  if(kind==='flow'&&(!Array.isArray(body.elements)||!Array.isArray(body.connectors)||!Array.isArray(body.resources)
    ||!['Draft','Active'].includes(body.status)))throw Error('Invalid Flow definition');
  if(kind==='page'&&(!Array.isArray(body.components)||!['Draft','Active'].includes(body.status)))throw Error('Invalid Page definition');
  // Store only drafts; publishing requires graph/renderer verification and cannot be inferred from a UI flag.
  if(body.status!=='Draft')throw Error('Publishing requires validated runtime activation');
  const {rows}=await db.query<{revision:number}>(`
   INSERT INTO md_builder_drafts(tenant_id,kind,api_name,definition)
   VALUES($1,$2,$3,$4::jsonb)
   ON CONFLICT(tenant_id,kind,api_name) DO UPDATE
   SET definition=EXCLUDED.definition,revision=md_builder_drafts.revision+1,updated_at=now()
   RETURNING revision`,[a.tenant_id,kind,name,JSON.stringify(body)]);
  res.json({[kind]:{...body,revision:rows[0].revision}});
 }
 for(const [kind,path] of [['flow','flows'],['page','pages']] as const){
  app.put('/api/metadata/'+path+'/:apiName',wrap((req,res)=>save(req,res,kind)));
  app.post('/api/metadata/'+path+'/:apiName/validate',wrap(async(req,res)=>{
   const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,permission(kind),'read');
   const body=req.body;
   const valid=body&&typeof body==='object'&&!Array.isArray(body)&&body.apiName===req.params.apiName;
   res.json({valid:Boolean(valid),errors:valid?[]:[{message:'Invalid definition'}]});
  }));
  app.delete('/api/metadata/'+path+'/:apiName',wrap(async(req,res)=>{
   const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,permission(kind),'delete');
   const result=await db.query('DELETE FROM md_builder_drafts WHERE tenant_id=$1 AND kind=$2 AND api_name=$3 AND published=false',[a.tenant_id,kind,req.params.apiName]);
   if(!result.rowCount)throw Error('Draft not found');
   res.status(204).end();
  }));
 }
 app.post('/api/metadata/flows/:apiName/deactivate',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'FlowDefinition','edit');
  const result=await db.query('UPDATE md_flow_definitions SET active=false WHERE tenant_id=$1 AND api_name=$2 AND active=true RETURNING id',[a.tenant_id,req.params.apiName]);
  if(!result.rowCount)throw Error('Active flow not found');
  res.status(204).end();
 }));
}
