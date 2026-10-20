import type {PoolClient} from 'pg';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {evaluateFlowFormula,flowFormulaReferences,validateFlowFormula} from './flow-formula-runtime.js';
import {FlowCustomError} from './flow-error-runtime.js';

type ActorContext={
  user:Record<string,unknown>;
  profile:Record<string,unknown>;
  timeZone:string;
};
type FieldRow={api_name:string;data_type:string;default_value:string|null};
type ValidationRule={
  rule_api:string;label:string;expression:string;error_message:string;error_field:string|null;
  operations:'Both'|'Create'|'Update';active:boolean;sort_order:number;
};
type DefaultFormula={field_api:string;expression:string;data_type:string;default_value:string|null};
const apiName=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const permittedDefaultTypes=new Set([
  'text','email','phone','url','textarea','longtext','number','currency',
  'percent','boolean','date','datetime','time','picklist'
]);
const scalar=(value:unknown):value is string|number|boolean|null=>
  value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean';

export class DeclarativeBusinessRules {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}

  private async fields(tenantId:string,objectApi:string,client?:PoolClient){
    const {rows}=await (client??this.db).query<FieldRow>(`
      SELECT api_name,data_type,default_value FROM md_field_definitions
      WHERE tenant_id=$1 AND object_api=$2 AND deleted_at IS NULL`,[tenantId,objectApi]);
    return rows;
  }

  private async authorizeMetadata(tenantId:string,userId:string,objectApi:string,
    action:'read'|'manage'){
    if(!apiName.test(objectApi))throw new Error('Invalid object API name');
    await this.rbac.require(tenantId,userId,'ObjectDefinition',action);
    await this.rbac.require(tenantId,userId,objectApi,action==='read'?'read':'edit');
  }

  private validateReferences(expression:string,fields:readonly FieldRow[]){
    validateFlowFormula(expression);
    const known=new Map(fields.map(field=>[field.api_name,field]));
    for(const reference of flowFormulaReferences(expression)){
      const record=/^\$Record(?:__Prior)?\.([A-Za-z][A-Za-z0-9_]*)$/.exec(reference);
      if(record){
        const field=known.get(record[1]);
        if(!field||['encryptedtext','formula','rollup'].includes(field.data_type))
          throw new Error('Invalid formula field reference: '+reference);
        continue;
      }
      if(['$User.Id','$User.Name','$User.Email','$User.TimeZone',
        '$Profile.Id','$Profile.Name'].includes(reference))continue;
      throw new Error('Invalid formula reference: '+reference);
    }
  }

  private async actor(tenantId:string,userId:string,client:PoolClient):Promise<ActorContext>{
    const {rows}=await client.query<{
      id:string;email:string;display_name:string|null;time_zone:string|null;
      profile_id:string|null;profile_name:string|null;
    }>(`SELECT u.id,u.email,u.display_name,u.time_zone,
        p.id AS profile_id,p.api_name AS profile_name
      FROM md_users u LEFT JOIN md_user_profiles membership
        ON membership.tenant_id=u.tenant_id AND membership.user_id=u.id
      LEFT JOIN md_profiles p ON p.tenant_id=membership.tenant_id AND p.id=membership.profile_id
      WHERE u.tenant_id=$1 AND u.id=$2 AND u.enabled=true`,[tenantId,userId]);
    const actor=rows[0];
    if(!actor)throw new Error('Permission denied');
    return {
      user:{Id:actor.id,Email:actor.email,Name:actor.display_name||actor.email,
        TimeZone:actor.time_zone||'UTC'},
      profile:{Id:actor.profile_id,Name:actor.profile_name},
      timeZone:actor.time_zone||'UTC'
    };
  }

  private evaluate(expression:string,current:Record<string,unknown>,prior:Record<string,unknown>|null,
    actor:ActorContext){
    const resolve=(name:string):unknown=>{
      if(name==='$Record')return current;
      if(name==='$Record__Prior')return prior;
      if(name==='$User')return actor.user;
      if(name==='$Profile')return actor.profile;
      if(name.startsWith('$Record.'))return current[name.slice(8)]??null;
      if(name.startsWith('$Record__Prior.'))return prior?.[name.slice(15)]??null;
      if(name.startsWith('$User.'))return actor.user[name.slice(6)]??null;
      if(name.startsWith('$Profile.'))return actor.profile[name.slice(9)]??null;
      throw new Error('Invalid formula reference: '+name);
    };
    return evaluateFlowFormula(expression,resolve,{timeZone:actor.timeZone});
  }

  private convertDefault(value:unknown,type:string,fieldApi:string):unknown{
    if(value===null||value===undefined)return null;
    if(!scalar(value))throw new Error('Invalid formula default result: '+fieldApi);
    if(['number','currency','percent'].includes(type)){
      const number=typeof value==='number'?value:Number(value);
      if(value===''||!Number.isFinite(number))
        throw new Error('Invalid formula default number: '+fieldApi);
      return number;
    }
    if(type==='boolean'){
      if(typeof value!=='boolean')throw new Error('Invalid formula default checkbox: '+fieldApi);
      return value;
    }
    if(type==='date'&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)))
      throw new Error('Invalid formula default date: '+fieldApi);
    if(type==='datetime'&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))
      throw new Error('Invalid formula default datetime: '+fieldApi);
    if(type==='time'&&(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d/.test(value)))
      throw new Error('Invalid formula default time: '+fieldApi);
    return typeof value==='string'?value:String(value);
  }

  /** Resolve formula defaults once, before before-save Flows; input values always win. */
  async applyDefaults(client:PoolClient,tenantId:string,userId:string,objectApi:string,
    input:Record<string,unknown>):Promise<Record<string,unknown>>{
    const {rows}=await client.query<DefaultFormula>(`
      SELECT d.field_api,d.expression,f.data_type,f.default_value
      FROM md_field_default_formulas d JOIN md_field_definitions f
        ON f.tenant_id=d.tenant_id AND f.object_api=d.object_api AND f.api_name=d.field_api
      WHERE d.tenant_id=$1 AND d.object_api=$2 AND f.deleted_at IS NULL
      ORDER BY d.field_api`,[tenantId,objectApi]);
    if(!rows.length)return {...input};
    const actor=await this.actor(tenantId,userId,client);
    const result={...input},defined=new Map(rows.map(row=>[row.field_api,row]));
    const visiting=new Set<string>();
    const resolve=(field:string):unknown=>{
      if(Object.hasOwn(result,field))return result[field];
      const definition=defined.get(field);
      if(!definition)return null;
      if(visiting.has(field))throw new Error('Cyclic formula defaults: '+field);
      visiting.add(field);
      const value=evaluateFlowFormula(definition.expression,name=>{
        if(name==='$Record')return result;
        if(name==='$Record__Prior')return null;
        if(name.startsWith('$Record.'))return resolve(name.slice(8));
        if(name==='$User')return actor.user;
        if(name==='$Profile')return actor.profile;
        if(name.startsWith('$User.'))return actor.user[name.slice(6)]??null;
        if(name.startsWith('$Profile.'))return actor.profile[name.slice(9)]??null;
        throw new Error('Invalid formula default reference: '+name);
      },{timeZone:actor.timeZone});
      visiting.delete(field);
      result[field]=this.convertDefault(value,definition.data_type,field);
      return result[field];
    };
    for(const row of rows)if(!Object.hasOwn(result,row.field_api))resolve(row.field_api);
    return result;
  }

  /** A TRUE formula blocks save; errors share existing field/page API formatting. */
  async validateRecord(client:PoolClient,tenantId:string,userId:string,objectApi:string,
    current:Record<string,unknown>,prior:Record<string,unknown>|null,
    operation:'Create'|'Update'):Promise<void>{
    const {rows}=await client.query<ValidationRule>(`
      SELECT rule_api,label,expression,error_message,error_field,operations,active,sort_order
      FROM md_validation_rules WHERE tenant_id=$1 AND object_api=$2 AND active=true
        AND (operations='Both' OR operations=$3)
      ORDER BY sort_order,rule_api`,[tenantId,objectApi,operation]);
    if(!rows.length)return;
    // Fail closed if metadata changed after activation or the actor lacks field access.
    const fields=await this.fields(tenantId,objectApi,client);
    for(const rule of rows){
      this.validateReferences(rule.expression,fields);
      for(const ref of flowFormulaReferences(rule.expression)){
        const match=/^\$Record(?:__Prior)?\.([A-Za-z][A-Za-z0-9_]*)$/.exec(ref);
        if(match)await this.rbac.require(tenantId,userId,objectApi+'.'+match[1],'read');
      }
    }
    const actor=await this.actor(tenantId,userId,client);
    for(const rule of rows){
      const result=this.evaluate(rule.expression,current,prior,actor);
      if(typeof result!=='boolean')
        throw new Error('Invalid validation rule result: '+rule.rule_api);
      if(result)throw new FlowCustomError(rule.error_message,rule.error_field??undefined);
    }
  }

  async list(tenantId:string,userId:string,objectApi:string){
    await this.authorizeMetadata(tenantId,userId,objectApi,'read');
    const [rules,defaults]=await Promise.all([
      this.db.query<ValidationRule>(`SELECT rule_api,label,expression,error_message,error_field,
        operations,active,sort_order FROM md_validation_rules
        WHERE tenant_id=$1 AND object_api=$2 ORDER BY sort_order,rule_api`,[tenantId,objectApi]),
      this.db.query<{field_api:string;expression:string}>(`SELECT field_api,expression
        FROM md_field_default_formulas WHERE tenant_id=$1 AND object_api=$2 ORDER BY field_api`,
      [tenantId,objectApi])
    ]);
    return {rules:rules.rows.map(row=>({
      apiName:row.rule_api,label:row.label,expression:row.expression,
      errorMessage:row.error_message,errorField:row.error_field,
      operations:row.operations,active:row.active,sortOrder:row.sort_order
    })),defaults:defaults.rows.map(row=>({fieldApiName:row.field_api,expression:row.expression}))};
  }

  async saveRule(tenantId:string,userId:string,objectApi:string,input:unknown){
    await this.authorizeMetadata(tenantId,userId,objectApi,'manage');
    if(!input||typeof input!=='object'||Array.isArray(input))
      throw new Error('Invalid validation rule');
    const rule=input as Record<string,unknown>;
    const {apiName:api,label,expression,errorMessage,errorField,operations,active,sortOrder}=rule;
    if(typeof api!=='string'||!apiName.test(api)||typeof label!=='string'
      ||!label.trim()||label.length>160||typeof expression!=='string'
      ||!expression.trim()||expression.length>4000
      ||typeof errorMessage!=='string'||!errorMessage.trim()||errorMessage.length>1000
      ||(errorField!==undefined&&errorField!==null&&typeof errorField!=='string')
      ||!['Both','Create','Update'].includes(String(operations??'Both'))
      ||(active!==undefined&&typeof active!=='boolean')
      ||(sortOrder!==undefined&&(!Number.isSafeInteger(sortOrder)||Math.abs(Number(sortOrder))>100000)))
      throw new Error('Invalid validation rule');
    const fields=await this.fields(tenantId,objectApi);
    this.validateReferences(expression,fields);
    if(errorField&& !fields.some(field=>field.api_name===errorField))
      throw new Error('Invalid validation error field');
    await this.db.query(`INSERT INTO md_validation_rules
      (tenant_id,object_api,rule_api,label,expression,error_message,error_field,operations,active,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(tenant_id,object_api,rule_api) DO UPDATE SET
      label=EXCLUDED.label,expression=EXCLUDED.expression,error_message=EXCLUDED.error_message,
      error_field=EXCLUDED.error_field,operations=EXCLUDED.operations,active=EXCLUDED.active,
      sort_order=EXCLUDED.sort_order,updated_at=now()`,
      [tenantId,objectApi,api,label.trim(),expression,errorMessage.trim(),errorField||null,
        operations??'Both',active===true,sortOrder??0]);
  }

  async removeRule(tenantId:string,userId:string,objectApi:string,ruleApi:string){
    await this.authorizeMetadata(tenantId,userId,objectApi,'manage');
    if(!apiName.test(ruleApi))throw new Error('Invalid validation rule API name');
    await this.db.query('DELETE FROM md_validation_rules WHERE tenant_id=$1 AND object_api=$2 AND rule_api=$3',
      [tenantId,objectApi,ruleApi]);
  }

  async saveDefault(tenantId:string,userId:string,objectApi:string,fieldApi:string,expression:unknown){
    await this.authorizeMetadata(tenantId,userId,objectApi,'manage');
    if(!apiName.test(fieldApi)||!(expression===null||typeof expression==='string'))
      throw new Error('Invalid formula default');
    const fields=await this.fields(tenantId,objectApi);
    const field=fields.find(item=>item.api_name===fieldApi);
    if(!field||!permittedDefaultTypes.has(field.data_type)||field.default_value!==null)
      throw new Error('Invalid formula default field');
    if(expression===null||!expression.trim()){
      await this.db.query(`DELETE FROM md_field_default_formulas
        WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3`,[tenantId,objectApi,fieldApi]);
      return;
    }
    if(expression.length>4000)throw new Error('Invalid formula default length');
    this.validateReferences(expression,fields);
    if(flowFormulaReferences(expression).includes('$Record.'+fieldApi))
      throw new Error('Cyclic formula defaults: '+fieldApi);
    await this.db.query(`INSERT INTO md_field_default_formulas(tenant_id,object_api,field_api,expression)
      VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,object_api,field_api)
      DO UPDATE SET expression=EXCLUDED.expression,updated_at=now()`,
      [tenantId,objectApi,fieldApi,expression]);
  }
}
