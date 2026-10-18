import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

/** Tenant-scoped SQL registry for optional administrative definitions.
 * Stable identifiers, activation and revisions are relational; validated
 * definition properties are JSONB. No JSON-file runtime fallback.
 */
export const definitionKinds = {
  'platform-events':'platformEvents',
  'email-alerts':'emailAlerts',
  'approval-processes':'approvalProcesses',
  'dashboards':'dashboards',
  'dashboard-folders':'folders',
  'dashboard-territories':'territories',
  'report-folders':'folders',
  'reports':'reports',
  'connector-providers':'providers',
  'integration-connections':'connections'
} as const;
export type DefinitionKind=keyof typeof definitionKinds;
export class SystemDefinitionService {
  constructor(private readonly db:SqlPersistence, private readonly rbac:RbacEngine){}
  async list(tenantId:string,userId:string,kind:DefinitionKind) {
    await this.rbac.require(tenantId,userId,'SystemDefinition:'+kind,'read');
    const {rows}=await this.db.query<{api_name:string;label:string;properties:unknown;revision:number;enabled:boolean}>(`
      SELECT api_name,label,properties,revision,enabled
      FROM md_system_definitions
      WHERE tenant_id=$1 AND kind=$2 AND enabled=true
      ORDER BY label,api_name`,[tenantId,kind]);
    return rows.map(row=>({
      ...(row.properties && typeof row.properties==='object' && !Array.isArray(row.properties) ? row.properties : {}),
      apiName:row.api_name,label:row.label,revision:row.revision,enabled:row.enabled
    }));
  }
  async save(tenantId:string,userId:string,kind:DefinitionKind,value:unknown) {
    await this.rbac.require(tenantId,userId,'SystemDefinition:'+kind,'manage');
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid definition');
    const body=value as Record<string,unknown>;
    if(typeof body.apiName!=='string'||! /^[A-Za-z][A-Za-z0-9_]*$/.test(body.apiName)
      ||typeof body.label!=='string'||!body.label.trim())throw new Error('Invalid definition');
    const {apiName,label,revision,enabled,...properties}=body;
    // Optional metadata must not become an unencrypted credential store.
    const hasSecret=(value:unknown):boolean=>{
      if(Array.isArray(value))return value.some(hasSecret);
      if(value && typeof value==='object')return Object.entries(value).some(([key,v])=>
        /(?:secret|password|access.?token|refresh.?token|private.?key|api.?key)/i.test(key)||hasSecret(v));
      return false;
    };
    if(hasSecret(properties))throw new Error('Credential secrets require the encrypted credential service');
    if(JSON.stringify(properties).length>65536)throw new Error('Invalid definition size');
    const expected=revision===undefined?0:revision;
    if(!Number.isSafeInteger(expected)||Number(expected)<0)throw new Error('Invalid definition revision');
    const {rows}=await this.db.query<{revision:number}>(`
      INSERT INTO md_system_definitions(tenant_id,kind,api_name,label,properties,enabled,revision)
      SELECT $1,$2,$3,$4,$5::jsonb,$6,1 WHERE $7=0
      ON CONFLICT(tenant_id,kind,api_name) DO UPDATE SET
        label=EXCLUDED.label,properties=EXCLUDED.properties,enabled=EXCLUDED.enabled,
        revision=md_system_definitions.revision+1,updated_at=now()
      WHERE md_system_definitions.revision=$7
      RETURNING revision`,[tenantId,kind,apiName,label,JSON.stringify(properties),enabled!==false,expected]);
    if(!rows.length)throw new Error('Definition revision conflict');
    return {apiName,label,revision:rows[0].revision};
  }
}
