import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {ObjectDefinitionService} from './object-definition.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
export function registerObjectLifecycleRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,objects:ObjectDefinitionService){
 const validate=async(req:Req,action:'read'|'edit'|'delete')=>{
  const a=req.actor!,name=req.params.apiName;if(!safe.test(name))throw Error('Invalid Object name');
  await rbac.require(a.tenant_id,a.user_id,'ObjectDefinition',action);
  await rbac.require(a.tenant_id,a.user_id,name,action==='delete'?'delete':'read');
  return a;
 };
 app.get('/api/metadata/objects/:apiName/history',wrap(async(req,res)=>{
  const a=await validate(req,'read'),name=req.params.apiName;
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
  const result=await db.query<{revision:string;changed_at:Date;changed_by:string|null}>(
   'SELECT revision,changed_at,changed_by FROM md_object_revisions WHERE tenant_id=$1 AND object_api=$2 ORDER BY revision DESC LIMIT $3',
   [a.tenant_id,name,limit]);
  res.json({history:result.rows.map(x=>({revision:Number(x.revision),changedAt:x.changed_at,changedBy:x.changed_by}))});
 }));
 app.get('/api/metadata/objects/:apiName/history/:revision',wrap(async(req,res)=>{
  const a=await validate(req,'read'),number=Number(req.params.revision);
  if(!Number.isSafeInteger(number)||number<1)throw Error('Invalid revision');
  const {rows}=await db.query<{snapshot:Record<string,unknown>;revision:string}>(
   'SELECT snapshot,revision FROM md_object_revisions WHERE tenant_id=$1 AND object_api=$2 AND revision=$3',
   [a.tenant_id,req.params.apiName,number]);
  if(!rows[0])throw Error('Object revision not found');
  res.json({change:{revision:number,after:rows[0].snapshot}});
 }));
 app.post('/api/metadata/objects/:apiName/validate',wrap(async(req,res)=>{
  const a=await validate(req,'read'),body=req.body;
  const errors:string[]=[];
  if(!body||typeof body!=='object'||Array.isArray(body))errors.push('Invalid Object metadata');
  else{
   if(body.apiName!==req.params.apiName)errors.push('Object API name does not match');
   if(typeof body.label!=='string'||!body.label.trim())errors.push('Object label required');
   if(!Array.isArray(body.fields))errors.push('Fields must be an array');
   else{
    const names=new Set<string>();
    for(const f of body.fields){
     if(!f||typeof f.apiName!=='string'||!safe.test(f.apiName))errors.push('Invalid field API name');
     else if(names.has(f.apiName))errors.push('Duplicate Field: '+f.apiName);
     else names.add(f.apiName);
    }
   }
  }
  res.json({valid:errors.length===0,errors});
 }));
 app.delete('/api/metadata/objects/:apiName',wrap(async(req,res)=>{
  const a=await validate(req,'delete'),name=req.params.apiName;
  await db.transaction(async client=>{
   const {rows}=await client.query<{is_system:boolean}>(
    'SELECT is_system FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',[a.tenant_id,name]);
   if(!rows[0])throw Error('Object not found');
   if(rows[0].is_system)throw Error('System Object cannot be deleted');
   const count=await client.query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 LIMIT 1',[a.tenant_id,name]);
   if(count.rowCount)throw Error('Cannot delete an Object containing business records');
   const references=await client.query('SELECT id FROM md_field_definitions WHERE tenant_id=$1 AND related_object=$2 LIMIT 1',[a.tenant_id,name]);
   if(references.rowCount)throw Error('Cannot delete referenced Object');
   await client.query('DELETE FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2',[a.tenant_id,name]);
   await client.query('DELETE FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[a.tenant_id,name]);
  });
  res.status(204).end();
 }));
}
