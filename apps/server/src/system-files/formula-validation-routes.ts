import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
type FieldRow={object_api:string;api_name:string;data_type:string;related_object:string|null};
export function registerFormulaValidationRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.post('/api/metadata/objects/:apiName/formulas/validate',wrap(async(req,res)=>{
  const actor=req.actor!,object=req.params.apiName,expr=req.body?.expression,returnType=req.body?.returnType;
  await rbac.require(actor.tenant_id,actor.user_id,'FieldDefinition','create');
  await rbac.require(actor.tenant_id,actor.user_id,object,'read');
  if(!api.test(object)||typeof expr!=='string'||!expr.trim()||expr.length>4096)throw Error('Invalid formula');
  if(typeof returnType!=='string'||!['Number','Currency','Percent','Checkbox','Text','Date','Date/Time'].includes(returnType))
    throw Error('Unsupported formula return type');
  // Only recognise arithmetic for numerical formula types, never evaluate arbitrary source.
  if(!['Number','Currency','Percent'].includes(returnType))throw Error('This formula return type has no shared SQL evaluator');
  const references=[...expr.matchAll(/@([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){0,2})/g)].map(m=>m[1]);
  if(!references.length)throw Error('Formula must contain at least one field reference');
  const fields=await db.query<FieldRow>(
   "SELECT object_api,api_name,data_type,related_object FROM md_field_definitions WHERE tenant_id=$1",
   [actor.tenant_id]);
  const byKey=new Map(fields.rows.map(f=>[f.object_api+'.'+f.api_name,f]));
  const checks=new Set<string>();
  for(const ref of references){
   const parts=ref.split('.');
   let field:FieldRow|undefined;
   if(parts.length===1)field=byKey.get(object+'.'+parts[0]);
   else if(parts[0]===object&&parts.length===2)field=byKey.get(object+'.'+parts[1]);
   else{
    let scope=object;
    for(let i=0;i<parts.length-1;i++){
     const rel=byKey.get(scope+'.'+parts[i]);
     if(!rel?.related_object)throw Error('Formula relationship does not exist: '+ref);
     scope=rel.related_object;
    }
    field=byKey.get(scope+'.'+parts[parts.length-1]);
   }
   if(!field)throw Error('Unknown formula field: '+ref);
   if(field.data_type!=='number')throw Error('Formula arithmetic needs Number field: '+ref);
   const k=field.object_api+'.'+field.api_name;
   if(!checks.has(k)){await rbac.require(actor.tenant_id,actor.user_id,k,'read');checks.add(k);}
  }
  let remainder=expr.replace(/@[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){0,2}/g,'1');
  // Restrict grammar to numbers, parentheses and arithmetic operators; reject identifiers/callouts.
  if(/[^\d\s.+*\-/()]/.test(remainder))throw Error('Unsupported formula syntax');
  const tokens=remainder.match(/\d+(?:\.\d+)?|[()+*/-]/g)??[];
  if(!tokens.length||tokens.join('')!==remainder.replace(/\s/g,''))throw Error('Invalid formula tokens');
  let pos=0;
  const primary=():void=>{
   const token=tokens[pos++];
   if(token==='+'||token==='-'){primary();return;}
   if(token==='('){addition();if(tokens[pos++]!==')')throw Error('Unbalanced formula parentheses');return;}
   if(!token||!/^\d+(?:\.\d+)?$/.test(token))throw Error('Invalid formula operand');
  };
  const multiplication=():void=>{primary();while(tokens[pos]==='*'||tokens[pos]==='/'){pos++;primary();}};
  const addition=():void=>{multiplication();while(tokens[pos]==='+'||tokens[pos]==='-'){pos++;multiplication();}};
  addition();if(pos!==tokens.length)throw Error('Invalid formula expression');
  res.json({valid:true,fieldReferences:[...checks]});
 }));
}
