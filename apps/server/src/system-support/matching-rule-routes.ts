import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
type Actor={tenant_id:string;user_id:string};
type Req=Request&{actor?:Actor};
const ident=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const route=(fn:(req:Req,res:Response)=>Promise<void>)=>
 (req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
export function registerMatchingRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const base='/api/metadata/objects/:objectApi/matching-rules';
 const auth=async(req:Req,action:'read'|'manage')=>{
  if(!req.actor)throw new Error('Permission denied');
  if(!ident.test(req.params.objectApi))throw new Error('Invalid object API name');
  await rbac.require(req.actor.tenant_id,req.actor.user_id,'ObjectDefinition',action);
  return req.actor;
 };
 app.get(base,route(async(req,res)=>{
  const actor=await auth(req,'read');
  const [rules,fields]=await Promise.all([
   db.query(`SELECT api_name AS "apiName",label,active,match_mode AS "matchMode",
    action FROM md_matching_rules WHERE tenant_id=$1 AND object_api=$2 ORDER BY api_name`,
    [actor.tenant_id,req.params.objectApi]),
   db.query(`SELECT rule_api AS "ruleApi",field_api AS "fieldApi",case_sensitive AS "caseSensitive"
    FROM md_matching_rule_fields WHERE tenant_id=$1 AND object_api=$2 ORDER BY field_api`,
    [actor.tenant_id,req.params.objectApi])]);
  res.json({rules:rules.rows.map((r:any)=>({...r,fields:fields.rows.filter((f:any)=>f.ruleApi===r.apiName)
   .map((f:any)=>({fieldApi:f.fieldApi,caseSensitive:f.caseSensitive}))}))});
 }));
 app.put(base+'/:ruleApi',route(async(req,res)=>{
  const actor=await auth(req,'manage'),data=req.body;
  if(!ident.test(req.params.ruleApi)||!data||typeof data!=='object'||Array.isArray(data)
   ||typeof data.label!=='string'||!data.label.trim()||data.label.length>160
   ||!['All','Any'].includes(data.matchMode)||!['Alert','Block'].includes(data.action)
   ||typeof data.active!=='boolean'||!Array.isArray(data.fields)
   ||data.fields.length<1||data.fields.length>10
   ||data.fields.some((f:unknown)=>!f||typeof f!=='object'||Array.isArray(f)
    ||!ident.test((f as any).fieldApi)||typeof (f as any).caseSensitive!=='boolean')
   ||new Set(data.fields.map((f:any)=>f.fieldApi)).size!==data.fields.length)
   throw new Error('Invalid matching rule');
  await db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [actor.tenant_id+':'+req.params.objectApi]);
   const keys=data.fields.map((f:any)=>f.fieldApi);
   const found=await client.query<{api_name:string}>(`SELECT api_name FROM md_field_definitions
    WHERE tenant_id=$1 AND object_api=$2 AND deleted_at IS NULL
    AND data_type IN ('text','email','phone','url','picklist')
    AND api_name=ANY($3::text[])`,[actor.tenant_id,req.params.objectApi,keys]);
   if(found.rows.length!==keys.length)throw new Error('Invalid matching field selection');
   await client.query(`INSERT INTO md_matching_rules
    (tenant_id,object_api,api_name,label,active,match_mode,action)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(tenant_id,object_api,api_name)
    DO UPDATE SET label=EXCLUDED.label,active=EXCLUDED.active,
    match_mode=EXCLUDED.match_mode,action=EXCLUDED.action,updated_at=now()`,
    [actor.tenant_id,req.params.objectApi,req.params.ruleApi,data.label.trim(),
    data.active,data.matchMode,data.action]);
   await client.query('DELETE FROM md_matching_rule_fields WHERE tenant_id=$1 AND object_api=$2 AND rule_api=$3',
    [actor.tenant_id,req.params.objectApi,req.params.ruleApi]);
   for(const field of data.fields)await client.query(`INSERT INTO md_matching_rule_fields
    (tenant_id,object_api,rule_api,field_api,case_sensitive) VALUES($1,$2,$3,$4,$5)`,
    [actor.tenant_id,req.params.objectApi,req.params.ruleApi,field.fieldApi,field.caseSensitive]);
  });res.json({saved:true});
 }));
 app.delete(base+'/:ruleApi',route(async(req,res)=>{
  const actor=await auth(req,'manage');
  if(!ident.test(req.params.ruleApi))throw new Error('Invalid matching rule');
  await db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [actor.tenant_id+':'+req.params.objectApi]);
   await client.query('DELETE FROM md_matching_rules WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3',
    [actor.tenant_id,req.params.objectApi,req.params.ruleApi]);
  });
  res.status(204).end();
 }));
 app.get('/api/records/:objectApi/:id/duplicates',route(async(req,res)=>{
  if(!req.actor)throw new Error('Permission denied');
  if(!ident.test(req.params.objectApi)||!/^[0-9a-f-]{36}$/i.test(req.params.id))
   throw new Error('Invalid record');
  await rbac.require(req.actor.tenant_id,req.actor.user_id,req.params.objectApi,'read');
  await rbac.requireRecord(req.actor.tenant_id,req.actor.user_id,req.params.objectApi,req.params.id,'read');
  const {rows}=await db.query(`SELECT d.rule_api AS "ruleApi",d.matched_record_id AS "recordId"
   FROM md_duplicate_record_sets d WHERE d.tenant_id=$1 AND d.object_api=$2 AND d.record_id=$3
   AND md_record_access($1,$4,d.matched_record_id,'read')
   ORDER BY d.created_at DESC LIMIT 100`,
   [req.actor.tenant_id,req.params.objectApi,req.params.id,req.actor.user_id]);
  res.json({duplicates:rows});
 }));
}
