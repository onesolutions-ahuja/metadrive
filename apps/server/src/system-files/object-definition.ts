import type { SqlPersistence } from './sql-persistence.js';
export class ObjectDefinitionService {
  constructor(private readonly db: SqlPersistence) {}
  async register(tenantId: string, apiName: string, label: string, isSystem = false) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)) throw new Error('Invalid object API name');
    const { rows } = await this.db.query<{ id: string }>(
      'INSERT INTO md_object_definitions (tenant_id, api_name, label, is_system) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, api_name) DO UPDATE SET label = EXCLUDED.label RETURNING id',
      [tenantId, apiName, label, isSystem]); return rows[0];
  }
  async addField(tenantId: string, objectApi: string, fieldApi: string, dataType: string, relatedObject?: string) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi)) throw new Error('Invalid field API name');
    const allowed = ['text','number','boolean','date','datetime','reference'];
    if (!allowed.includes(dataType)) throw new Error('Invalid field data type');
    if (dataType === 'reference' && !relatedObject) throw new Error('Reference requires target');
    return this.db.query(
      `INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id,object_api,api_name) DO UPDATE SET data_type=EXCLUDED.data_type,related_object=EXCLUDED.related_object`,
      [tenantId,objectApi,fieldApi,dataType,relatedObject ?? null]);
  }
  async list(tenantId: string) {
    return (await this.db.query('SELECT * FROM md_object_definitions WHERE tenant_id=$1 ORDER BY api_name',[tenantId])).rows;
  }
}
