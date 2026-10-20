import type {Request,Response,NextFunction,Express} from 'express';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import {DeclarativeBusinessRules} from '../system-files/declarative-business-rules.js';

type Actor={tenant_id:string;user_id:string};
type AuthorizedRequest=Request & {actor?:Actor};
const wrap=(handler:(req:AuthorizedRequest,res:Response)=>Promise<void>)=>
  (req:Request,res:Response,next:NextFunction)=>
    Promise.resolve(handler(req as AuthorizedRequest,res)).catch(next);
const actor=(req:AuthorizedRequest):Actor=>{
  if(!req.actor)throw new Error('Permission denied');
  return req.actor;
};

/** Object Manager metadata API; published rules are enforced by the shared RecordEngine. */
export function registerDeclarativeBusinessRuleRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
  const rules=new DeclarativeBusinessRules(db,rbac);
  app.get('/api/metadata/objects/:apiName/business-rules',wrap(async(req,res)=>{
    const {tenant_id,user_id}=actor(req);
    res.json(await rules.list(tenant_id,user_id,req.params.apiName));
  }));
  app.put('/api/metadata/objects/:apiName/validation-rules/:ruleApi',wrap(async(req,res)=>{
    const {tenant_id,user_id}=actor(req);
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)
      ||req.body.apiName!==req.params.ruleApi)throw new Error('Invalid validation rule');
    await rules.saveRule(tenant_id,user_id,req.params.apiName,req.body);
    res.json(await rules.list(tenant_id,user_id,req.params.apiName));
  }));
  app.delete('/api/metadata/objects/:apiName/validation-rules/:ruleApi',wrap(async(req,res)=>{
    const {tenant_id,user_id}=actor(req);
    await rules.removeRule(tenant_id,user_id,req.params.apiName,req.params.ruleApi);
    res.status(204).end();
  }));
  app.put('/api/metadata/objects/:apiName/default-formulas/:fieldApi',wrap(async(req,res)=>{
    const {tenant_id,user_id}=actor(req);
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)
      ||!Object.hasOwn(req.body,'expression'))throw new Error('Invalid formula default');
    await rules.saveDefault(tenant_id,user_id,req.params.apiName,req.params.fieldApi,
      req.body.expression);
    res.json(await rules.list(tenant_id,user_id,req.params.apiName));
  }));
}
