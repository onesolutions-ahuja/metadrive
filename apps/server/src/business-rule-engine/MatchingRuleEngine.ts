import type {PoolClient} from 'pg';
import type {RbacEngine} from '../system-files/rbac-engine.js';
type Values=Record<string,unknown>;
type Rule={api_name:string;match_mode:'All'|'Any';action:'Alert'|'Block'};
type RuleField={rule_api:string;field_api:string;case_sensitive:boolean};
export class DuplicateMatchError extends Error {
 constructor(readonly ruleApi:string){super('Potential duplicate record matches rule: '+ruleApi);this.name='DuplicateMatchError';}
}
/** One SQL matching engine. Enforces matches against all tenant records, without exposing inaccessible IDs. */
export class RecordMatching {
 constructor(private readonly rbac:RbacEngine){}
 async check(client:PoolClient,tenantId:string,userId:string,objectApi:string,values:Values|(()=>Promise<Values>),
    excludeId?:string):Promise<Array<{ruleApi:string;recordId:string}>|null>{
  const result=await client.query<Rule>(
   'SELECT api_name,match_mode,action FROM md_matching_rules WHERE tenant_id=$1 AND object_api=$2 AND active=true ORDER BY api_name',
   [tenantId,objectApi]);
  if(!result.rows.length)return null;
  const current=typeof values==='function'?await values():values;
  const columns=await client.query<RuleField>(`SELECT rule_api,field_api,case_sensitive
    FROM md_matching_rule_fields WHERE tenant_id=$1 AND object_api=$2 ORDER BY rule_api,field_api`,
   [tenantId,objectApi]);
  const matches:Array<{ruleApi:string;recordId:string}>=[];
  for(const rule of result.rows){
   const fields=columns.rows.filter(x=>x.rule_api===rule.api_name);
   if(!fields.length)continue;
   const clauses:string[]=[];
   const params:unknown[]=[tenantId,objectApi,excludeId??null];
   for(const field of fields){
    const value=current[field.field_api];
    if(value===null||value===undefined||typeof value!=='string'||!value.trim()){
      if(rule.match_mode==='All'){clauses.length=0;break;}
      continue;
    }
    await this.rbac.require(tenantId,userId,objectApi+'.'+field.field_api,'read');
    params.push(field.field_api,value.trim());
    const col=params.length-1, val=params.length;
    clauses.push(`EXISTS(SELECT 1 FROM md_record_values v WHERE v.tenant_id=r.tenant_id
     AND v.object_api=r.object_api AND v.record_id=r.id AND v.field_api=$${col}
     AND ${field.case_sensitive?'v.value_text=$'+val:'lower(v.value_text)=lower($'+val+')'})`);
   }
   if(!clauses.length)continue;
   const filter=rule.match_mode==='All'?clauses.join(' AND '):'('+clauses.join(' OR ')+')';
   const records=await client.query<{id:string}>(`SELECT r.id FROM md_records r WHERE
     r.tenant_id=$1 AND r.object_api=$2 AND r.is_deleted=false
     AND ($3::uuid IS NULL OR r.id<>$3::uuid)
     AND (${filter}) ORDER BY r.id LIMIT 20`,params);
   if(!records.rows.length)continue;
   if(rule.action==='Block')throw new DuplicateMatchError(rule.api_name);
   for(const record of records.rows)matches.push({ruleApi:rule.api_name,recordId:record.id});
  }
  return matches;
 }
 async save(client:PoolClient,tenantId:string,objectApi:string,recordId:string,
   matches:Array<{ruleApi:string;recordId:string}>|null){
  if(matches===null)return;
  await client.query('DELETE FROM md_duplicate_record_sets WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3',
   [tenantId,objectApi,recordId]);
  for(const match of matches)await client.query(`INSERT INTO md_duplicate_record_sets
   (tenant_id,object_api,rule_api,record_id,matched_record_id) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT DO NOTHING`,[tenantId,objectApi,match.ruleApi,recordId,match.recordId]);
 }
}
