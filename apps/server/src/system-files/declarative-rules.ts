import type {PoolClient} from 'pg';
import type {RbacEngine} from './rbac-engine.js';
import {evaluateFlowFormula,flowFormulaReferences,validateFlowFormula} from './flow-formula-runtime.js';

type Values=Record<string,unknown>;
type Rule={api_name:string;expression:string;error_message:string;error_field_api:string|null};
const api=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
export class DeclarativeRuleError extends Error {
  readonly ruleApi:string;
  readonly fieldApi:string|null;
  constructor(rule:Rule) {
    super(rule.error_message);
    this.name='DeclarativeRuleError';
    this.ruleApi=rule.api_name;
    this.fieldApi=rule.error_field_api;
  }
}
/** Shared, server-enforced rule evaluation. No eval(), separate expression language or app logic. */
export class DeclarativeRules {
  constructor(private readonly rbac:RbacEngine){}
  async context(client:PoolClient,tenantId:string,userId:string,objectApi:string,
    current:Values,prior:Values|null,expression:string) {
    validateFlowFormula(expression);
    const references=flowFormulaReferences(expression);
    const {rows}=await client.query<{id:string;email:string;display_name:string;time_zone:string;profile_name:string|null}>(
      `SELECT u.id,u.email,u.display_name,u.time_zone,p.api_name AS profile_name
       FROM md_users u LEFT JOIN md_user_profiles up ON up.tenant_id=u.tenant_id AND up.user_id=u.id
       LEFT JOIN md_profiles p ON p.tenant_id=up.tenant_id AND p.id=up.profile_id
       WHERE u.tenant_id=$1 AND u.id=$2 AND u.enabled=true LIMIT 1`,[tenantId,userId]);
    const actor=rows[0];
    if(!actor)throw new Error('Rule execution actor is unavailable');
    const user={Id:actor.id,Name:actor.display_name,Email:actor.email,TimeZone:actor.time_zone};
    const profile={Name:actor.profile_name};
    for(const reference of references){
      let field:string|null=null;
      if(reference.startsWith('$Record.'))field=reference.slice(8);
      else if(reference.startsWith('$Record__Prior.'))field=reference.slice(15);
      else if(api.test(reference)&&Object.hasOwn(current,reference))field=reference;
      else if(reference.startsWith('$')&&!reference.startsWith('$User.')
        &&!reference.startsWith('$Profile.')
        &&!['$Record','$Record__Prior'].includes(reference))
        throw new Error('Unsupported rule global reference: '+reference);
      if(field){
        if(!api.test(field))throw new Error('Invalid rule field reference');
        await this.rbac.require(tenantId,userId,objectApi+'.'+field,'read');
      }
    }
    const resolve=(name:string):unknown=>{
      if(name==='$Record')return current;
      if(name==='$Record__Prior')return prior;
      if(name==='$User')return user;
      if(name==='$Profile')return profile;
      if(name.startsWith('$Record.'))return current[name.slice(8)]??null;
      if(name.startsWith('$Record__Prior.'))return prior?.[name.slice(15)]??null;
      if(name.startsWith('$User.'))return user[name.slice(6) as keyof typeof user]??null;
      if(name.startsWith('$Profile.'))return profile[name.slice(9) as keyof typeof profile]??null;
      return current[name]??null;
    };
    return {resolve,timeZone:actor.time_zone};
  }
  async defaults(client:PoolClient,tenantId:string,userId:string,objectApi:string,values:Values) {
    const {rows}=await client.query<{field_api:string;expression:string}>(
      `SELECT d.field_api,d.expression FROM md_field_default_formulas d
       JOIN md_field_definitions f ON f.tenant_id=d.tenant_id AND f.object_api=d.object_api
        AND f.api_name=d.field_api AND f.deleted_at IS NULL
       WHERE d.tenant_id=$1 AND d.object_api=$2 ORDER BY d.field_api`,[tenantId,objectApi]);
    const pending=new Map(rows.filter(row=>values[row.field_api]===undefined)
      .map(row=>[row.field_api,row.expression]));
    const visiting=new Set<string>();
    const resolveDefault=async (field:string):Promise<void>=>{
      if(!pending.has(field))return;
      if(visiting.has(field))throw new Error('Cyclic formula default: '+field);
      visiting.add(field);
      const expression=pending.get(field)!;
      for(const ref of flowFormulaReferences(expression)){
        const name=ref.startsWith('$Record.')?ref.slice(8):ref;
        if(pending.has(name))await resolveDefault(name);
      }
      const ctx=await this.context(client,tenantId,userId,objectApi,values,null,expression);
      const result=evaluateFlowFormula(expression,ctx.resolve,{timeZone:ctx.timeZone});
      if(result!==undefined)values[field]=result;
      pending.delete(field);
      visiting.delete(field);
    };
    for(const field of [...pending.keys()])await resolveDefault(field);
    return values;
  }
  async validate(client:PoolClient,tenantId:string,userId:string,objectApi:string,
    current:Values,prior:Values|null) {
    const {rows}=await client.query<Rule>(
      `SELECT api_name,expression,error_message,error_field_api FROM md_validation_rules
       WHERE tenant_id=$1 AND object_api=$2 AND active=true ORDER BY sort_order,api_name`,
      [tenantId,objectApi]);
    for(const rule of rows){
      const ctx=await this.context(client,tenantId,userId,objectApi,current,prior,rule.expression);
      const invalid=evaluateFlowFormula(rule.expression,ctx.resolve,{timeZone:ctx.timeZone});
      if(typeof invalid!=='boolean')throw new Error('Validation rule must return Checkbox: '+rule.api_name);
      if(invalid)throw new DeclarativeRuleError(rule);
    }
  }
}
