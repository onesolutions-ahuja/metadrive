import type {SqlPersistence} from './sql-persistence.js';
import type {PoolClient} from 'pg';
import type {RbacEngine} from './rbac-engine.js';
type FieldDefinition={api_name:string;data_type:string;related_object:string|null;required:boolean;max_length:number|null};
type Storable={value_text:string|null;reference_record_id:string|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RecordEngine {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}
  private async fields(tenantId:string,objectApi:string,client?:PoolClient):Promise<FieldDefinition[]> {
    const {rows}=await (client??this.db).query<FieldDefinition>(
      'SELECT api_name,data_type,related_object,required,max_length FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2',
      [tenantId,objectApi]);
    return rows;
  }
  private async prepare(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>,creating:boolean,client?:PoolClient) {
    if(Object.getPrototypeOf(values)!==Object.prototype && Object.getPrototypeOf(values)!==null) throw new Error('Invalid record');
    const definitions=await this.fields(tenantId,objectApi,client);
    const fields=new Map(definitions.map(f=>[f.api_name,f]));
    if(creating) for(const field of definitions)
      if(field.required && (values[field.api_name]===undefined || values[field.api_name]===null))
        throw new Error('Required field missing: '+field.api_name);
    const prepared=new Map<string,Storable>();
    for(const [key,value] of Object.entries(values)) {
      const field=fields.get(key);
      if(!field) throw new Error('Unknown field: '+key);
      await this.rbac.require(tenantId,userId,objectApi+'.'+key,creating?'create':'edit');
      if(value===null) {if(field.required)throw new Error('Required field cannot be null: '+key);prepared.set(key,{value_text:null,reference_record_id:null});continue;}
      let text:string,reference:string|null=null;
      switch(field.data_type) {
        case 'text':
          if(typeof value!=='string')throw new Error('Invalid text field: '+key);
          if(field.max_length && value.length>field.max_length)throw new Error('Invalid text length: '+key);
          text=value;break;
        case 'number':
          if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Invalid number field: '+key);
          text=String(value);break;
        case 'boolean':
          if(typeof value!=='boolean')throw new Error('Invalid boolean field: '+key);
          text=String(value);break;
        case 'date':
          if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)||
             (!Number.isFinite(Date.parse(value+'T00:00:00.000Z')) || new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value))
            throw new Error('Invalid date field: '+key);
          text=value;break;
        case 'datetime':
          if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||!/Z$|[+-][0-9]{2}:[0-9]{2}$/.test(value))
            throw new Error('Invalid datetime field: '+key);
          text=new Date(value).toISOString();break;
        case 'reference':
          if(typeof value!=='string'||!uuid.test(value)||!field.related_object)throw new Error('Invalid relationship: '+key);
          { const match=await (client??this.db).query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
            [tenantId,field.related_object,value]);
            if(!match.rowCount)throw new Error('Invalid relationship target: '+key); }
          text='';reference=value;break;
        default:throw new Error('Invalid metadata data type: '+field.data_type);
      }
      prepared.set(key,{value_text:reference?null:text,reference_record_id:reference});
    }
    return prepared;
  }
  async create(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create');
    // Reject invalid input before reserving a transaction connection.
    const prepared=await this.prepare(tenantId,userId,objectApi,values,true);
    return this.db.transaction(client=>this.insertPrepared(client,tenantId,objectApi,prepared));
  }
  /** All Flow record mutations share one transaction, including relationship checks. */
  async createInTransaction(client:PoolClient,tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create');
    const prepared=await this.prepare(tenantId,userId,objectApi,values,true,client);
    return this.insertPrepared(client,tenantId,objectApi,prepared);
  }
  private async insertPrepared(client:PoolClient,tenantId:string,objectApi:string,prepared:Map<string,Storable>) {
    const {rows}=await client.query<{id:string}>(
      'INSERT INTO md_records (tenant_id,object_api) VALUES ($1,$2) RETURNING id',
      [tenantId,objectApi]);
    for(const [field,value] of prepared)await client.query(
      'INSERT INTO md_record_values (tenant_id,record_id,object_api,field_api,value_text,reference_record_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId,rows[0].id,objectApi,field,value.value_text,value.reference_record_id]);
    return rows[0].id;
  }
  async list(tenantId:string,userId:string,objectApi:string,limit=50,offset=0) {
    await this.rbac.require(tenantId,userId,objectApi,'read');
    const pageSize=Math.min(Math.max(limit,1),100),start=Math.max(offset,0);
    const {rows}=await this.db.query<{
      id:string;created_at:Date;field_api:string|null;value_text:string|null;reference_record_id:string|null;data_type:string|null
    }>(`
      WITH selected AS (
        SELECT id,created_at FROM md_records WHERE tenant_id=$1 AND object_api=$2
        ORDER BY created_at,id LIMIT $3 OFFSET $4
      )
      SELECT r.id,r.created_at,v.field_api,v.value_text,v.reference_record_id,f.data_type
      FROM selected r
      LEFT JOIN md_record_values v ON v.tenant_id=$1 AND v.record_id=r.id AND v.object_api=$2
      LEFT JOIN md_field_definitions f ON f.tenant_id=$1 AND f.object_api=$2 AND f.api_name=v.field_api
      ORDER BY r.created_at,r.id,v.field_api
    `,[tenantId,objectApi,pageSize,start]);
    const collected=new Map<string,Record<string,unknown>>();
    const allowed=new Map<string,boolean>();
    for(const row of rows) {
      if(!collected.has(row.id))collected.set(row.id,{Id:row.id,CreatedAt:row.created_at});
      if(!row.field_api)continue;
      if(!allowed.has(row.field_api))allowed.set(row.field_api,
        await this.rbac.allowed(tenantId,userId,objectApi+'.'+row.field_api,'read'));
      if(!allowed.get(row.field_api))continue;
      const value=row.reference_record_id??row.value_text;
      collected.get(row.id)![row.field_api]=value===null?null:
        row.data_type==='number'?Number(value):row.data_type==='boolean'?value==='true':value;
    }
    const total=await this.db.query<{total:string}>(
      'SELECT count(*)::text AS total FROM md_records WHERE tenant_id=$1 AND object_api=$2',[tenantId,objectApi]);
    return {records:[...collected.values()],total:Number(total.rows[0]?.total??0)};
  }
  async update(tenantId:string,userId:string,objectApi:string,id:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'edit');
    const prepared=await this.prepare(tenantId,userId,objectApi,values,false);
    await this.db.transaction(async client=>{
      const found=await client.query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 FOR UPDATE',
        [tenantId,objectApi,id]);
      if(!found.rowCount)throw new Error('Record not found');
      for(const [field,value] of prepared)await client.query(`
        INSERT INTO md_record_values (tenant_id,record_id,object_api,field_api,value_text,reference_record_id)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (tenant_id,record_id,field_api)
        DO UPDATE SET value_text=EXCLUDED.value_text,reference_record_id=EXCLUDED.reference_record_id
      `,[tenantId,id,objectApi,field,value.value_text,value.reference_record_id]);
    });
  }
  async remove(tenantId:string,userId:string,objectApi:string,id:string) {
    await this.rbac.require(tenantId,userId,objectApi,'delete');
    const result=await this.db.query('DELETE FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
      [tenantId,objectApi,id]);
    if(!result.rowCount)throw new Error('Record not found');
  }
}
