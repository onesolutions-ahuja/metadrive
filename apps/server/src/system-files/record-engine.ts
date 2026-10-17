import type { SqlPersistence } from './sql-persistence.js';
import type { RbacEngine } from './rbac-engine.js';
export class RecordEngine {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}
  private async validate(tenantId:string,objectApi:string,values:Record<string,unknown>) {
    const {rows}=await this.db.query<{api_name:string}>('SELECT api_name FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2',[tenantId,objectApi]);
    const valid=new Set(rows.map(row=>row.api_name));
    for(const key of Object.keys(values)) if(!valid.has(key)) throw new Error('Unknown field: '+key);
  }
  async create(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create'); await this.validate(tenantId,objectApi,values);
    return this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>('INSERT INTO md_records (tenant_id,object_api) VALUES ($1,$2) RETURNING id',[tenantId,objectApi]);
      for(const [name,value] of Object.entries(values))
        await client.query('INSERT INTO md_record_values (tenant_id,record_id,field_api,value_text) VALUES ($1,$2,$3,$4)',
          [tenantId,rows[0].id,name,value == null ? null : String(value)]);
      return rows[0].id;
    });
  }
  async list(tenantId:string,userId:string,objectApi:string,limit=50,offset=0) {
    await this.rbac.require(tenantId,userId,objectApi,'read');
    return (await this.db.query('SELECT id,created_at FROM md_records WHERE tenant_id=$1 AND object_api=$2 ORDER BY created_at,id LIMIT $3 OFFSET $4',
      [tenantId,objectApi,Math.min(Math.max(limit,1),100),Math.max(offset,0)])).rows;
  }
  async update(tenantId:string,userId:string,objectApi:string,id:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'edit'); await this.validate(tenantId,objectApi,values);
    await this.db.transaction(async client=>{
      const found=await client.query('SELECT id FROM md_records WHERE id=$1 AND tenant_id=$2 AND object_api=$3 FOR UPDATE',[id,tenantId,objectApi]);
      if(!found.rowCount) throw new Error('Record not found');
      for(const [name,value] of Object.entries(values))
        await client.query('INSERT INTO md_record_values (tenant_id,record_id,field_api,value_text) VALUES ($1,$2,$3,$4) ON CONFLICT (record_id,field_api) DO UPDATE SET value_text=EXCLUDED.value_text',
          [tenantId,id,name,value==null?null:String(value)]);
    });
  }
  async remove(tenantId:string,userId:string,objectApi:string,id:string) {
    await this.rbac.require(tenantId,userId,objectApi,'delete');
    const r=await this.db.query('DELETE FROM md_records WHERE id=$1 AND tenant_id=$2 AND object_api=$3',[id,tenantId,objectApi]);
    if(!r.rowCount) throw new Error('Record not found');
  }
}
