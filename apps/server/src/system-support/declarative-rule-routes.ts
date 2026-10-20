import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import {validateFlowFormula,flowFormulaReferences} from '../system-files/flow-formula-runtime.js';
type Actor={tenant_id:string;user_id:string};
type AuthRequest=Request & {actor?:Actor};
const api=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const route=(fn:(req:AuthRequest,res:Response)=>Promise<void>)=>
  (req:Request,res:Response,next:NextFunction)=>{void fn(req as AuthRequest,res).catch(next);};
function actor(req:AuthRequest):Actor {
  if(!req.actor)throw new Error('Permission denied');
  return req.actor;
}
export function registerDeclarativeRuleRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
  const base='/api/metadata/objects/:objectApi';
  const requireManage=async(req:AuthRequest)=>{
    const a=actor(req);
    if(!api.test(req.params.objectApi))throw new Error('Invalid object API name');
    await rbac.require(a.tenant_id,a.user_id,'ObjectDefinition','manage');
    const {rowCount}=await db.query(
      'SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
      [a.tenant_id,req.params.objectApi]);
    if(!rowCount)throw new Error('Object not found');
    return a;
  };
  app.get(base+'/validation-rules',route(async(req,res)=>{
    const a=await requireManage(req);
    const {rows}=await db.query(
      `SELECT api_name AS "apiName",label,expression,error_message AS "errorMessage",
       error_field_api AS "errorFieldApi",active,sort_order AS "sortOrder"
       FROM md_validation_rules WHERE tenant_id=$1 AND object_api=$2 ORDER BY sort_order,api_name`,
      [a.tenant_id,req.params.objectApi]);res.json({rules:rows});
  }));
  app.put(base+'/validation-rules/:ruleApi',route(async(req,res)=>{
    const a=await requireManage(req),rule=req.body;
    if(!api.test(req.params.ruleApi)||!rule||typeof rule!=='object'||Array.isArray(rule)
      ||typeof rule.label!=='string'||!rule.label.trim()||rule.label.length>160
      ||typeof rule.expression!=='string'||rule.expression.length>4000
      ||typeof rule.errorMessage!=='string'||!rule.errorMessage.trim()||rule.errorMessage.length>1000
      ||(rule.errorFieldApi!==null&&rule.errorFieldApi!==undefined&&!api.test(rule.errorFieldApi))
      ||(rule.active!==undefined&&typeof rule.active!=='boolean')
      ||(rule.sortOrder!==undefined&&(!Number.isSafeInteger(rule.sortOrder)||Math.abs(rule.sortOrder)>1000000)))
      throw new Error('Invalid validation rule');
    validateFlowFormula(rule.expression);
    const fields=flowFormulaReferences(rule.expression)
      .filter(ref=>ref.startsWith('$Record.')||ref.startsWith('$Record__Prior.'))
      .map(ref=>ref.startsWith('$Record.')?ref.slice(8):ref.slice(15));
    if(rule.errorFieldApi)fields.push(rule.errorFieldApi);
    const unique=[...new Set(fields)];
    if(unique.length){
      const found=await db.query<{api_name:string}>(`SELECT api_name FROM md_field_definitions
        WHERE tenant_id=$1 AND object_api=$2 AND deleted_at IS NULL AND api_name=ANY($3::text[])`,
      [a.tenant_id,req.params.objectApi,unique]);
      if(found.rowCount!==unique.length)throw new Error('Invalid validation rule field reference');
    }
    await db.query(`INSERT INTO md_validation_rules
      (tenant_id,object_api,api_name,label,expression,error_message,error_field_api,active,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(tenant_id,object_api,api_name) DO UPDATE SET
       label=EXCLUDED.label,expression=EXCLUDED.expression,error_message=EXCLUDED.error_message,
       error_field_api=EXCLUDED.error_field_api,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,
       updated_at=now()`,
      [a.tenant_id,req.params.objectApi,req.params.ruleApi,rule.label.trim(),
       rule.expression,rule.errorMessage.trim(),rule.errorFieldApi??null,
       rule.active??false,rule.sortOrder??0]);res.json({saved:true});
  }));
  app.delete(base+'/validation-rules/:ruleApi',route(async(req,res)=>{
    const a=await requireManage(req);
    if(!api.test(req.params.ruleApi))throw new Error('Invalid rule API name');
    await db.query('DELETE FROM md_validation_rules WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3',
      [a.tenant_id,req.params.objectApi,req.params.ruleApi]);res.status(204).end();
  }));
  app.get(base+'/default-formulas',route(async(req,res)=>{
    const a=await requireManage(req);
    const {rows}=await db.query(`SELECT field_api AS "fieldApi",expression FROM md_field_default_formulas
      WHERE tenant_id=$1 AND object_api=$2 ORDER BY field_api`,[a.tenant_id,req.params.objectApi]);
    res.json({defaults:rows});
  }));
  app.put(base+'/default-formulas/:fieldApi',route(async(req,res)=>{
    const a=await requireManage(req),field=req.params.fieldApi,expression=req.body?.expression;
    if(!api.test(field)||typeof expression!=='string'||!expression.trim()||expression.length>4000)
      throw new Error('Invalid default formula');
    validateFlowFormula(expression);
    const {rows}=await db.query<{data_type:string}>(
      `SELECT data_type FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2
        AND api_name=$3 AND deleted_at IS NULL`,[a.tenant_id,req.params.objectApi,field]);
    if(!rows.length||['autonumber','formula','rollup','encryptedtext','reference'].includes(rows[0].data_type))
      throw new Error('Invalid default formula target');
    const references=flowFormulaReferences(expression);
    if(references.some(ref=>ref.startsWith('$Record__Prior')||ref==='ISNEW'))
      throw new Error('Invalid default formula reference');
    await db.query(`INSERT INTO md_field_default_formulas(tenant_id,object_api,field_api,expression)
      VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,object_api,field_api)
      DO UPDATE SET expression=EXCLUDED.expression`,[a.tenant_id,req.params.objectApi,field,expression]);
    res.json({saved:true});
  }));
  app.delete(base+'/default-formulas/:fieldApi',route(async(req,res)=>{
    const a=await requireManage(req);
    if(!api.test(req.params.fieldApi))throw new Error('Invalid field API name');
    await db.query('DELETE FROM md_field_default_formulas WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3',
      [a.tenant_id,req.params.objectApi,req.params.fieldApi]);res.status(204).end();
  }));
}
