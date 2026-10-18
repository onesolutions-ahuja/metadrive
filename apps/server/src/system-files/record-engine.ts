import type {SqlPersistence} from './sql-persistence.js';
import type {PoolClient} from 'pg';
import type {RbacEngine} from './rbac-engine.js';
type FieldDefinition={api_name:string;data_type:string;related_object:string|null;required:boolean;max_length:number|null;picklist_restricted?:boolean};
type Storable={value_text:string|null;reference_record_id:string|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RecordEngine {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}
  private async fields(tenantId:string,objectApi:string,client?:PoolClient):Promise<FieldDefinition[]> {
    const {rows}=await (client??this.db).query<FieldDefinition>(
      'SELECT api_name,data_type,related_object,required,max_length,picklist_restricted FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2',
      [tenantId,objectApi]);
    return rows;
  }
  private async prepare(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>,creating:boolean,client?:PoolClient) {
    if(Object.getPrototypeOf(values)!==Object.prototype && Object.getPrototypeOf(values)!==null) throw new Error('Invalid record');
    const definitions=await this.fields(tenantId,objectApi,client);
    const fields=new Map(definitions.map(f=>[f.api_name,f]));
    if(creating) for(const field of definitions)
      if(field.required && field.api_name!=='OwnerId' && (values[field.api_name]===undefined || values[field.api_name]===null))
        throw new Error('Required field missing: '+field.api_name);
    const prepared=new Map<string,Storable>();
    for(const [key,value] of Object.entries(values)) {
      if(key==='OwnerId'){
        if(typeof value!=='string'||!uuid.test(value))throw Error('Invalid record owner');
        await this.rbac.require(tenantId,userId,objectApi+'.OwnerId',creating?'create':'edit');
        const target=await (client??this.db).query<{id:string;queue:boolean}>(
          "SELECT id,false AS queue FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true UNION ALL SELECT queue_id,true AS queue FROM md_queue_objects WHERE tenant_id=$1 AND queue_id=$2 AND object_api=$3",
          [tenantId,value,objectApi]);
        if(!target.rows[0])throw Error('Record owner not found');
        prepared.set('__OwnerId__',{value_text:value,reference_record_id:null});
        prepared.set('__OwnerQueue__',{value_text:String(target.rows[0].queue),reference_record_id:null});
        continue;
      }
      if(key==='RecordTypeId'){
        if(typeof value!=='string'||value.length>128)throw new Error('Invalid record type');
        const {rows}=await (client??this.db).query(
          'SELECT 1 FROM md_object_record_types WHERE tenant_id=$1 AND object_api=$2 AND record_type_id=$3 AND active=true',
          [tenantId,objectApi,value]);
        if(!rows.length)throw new Error('Invalid record type');
        await this.rbac.require(tenantId,userId,'RecordType:'+objectApi+'.'+value,'read');
        prepared.set('__RecordTypeId__',{value_text:value,reference_record_id:null});
        continue;
      }
      const field=fields.get(key);
      if(!field) throw new Error('Unknown field: '+key);
      await this.rbac.require(tenantId,userId,objectApi+'.'+key,creating?'create':'edit');
      if(value===null) {if(field.required)throw new Error('Required field cannot be null: '+key);prepared.set(key,{value_text:null,reference_record_id:null});continue;}
      let text:string,reference:string|null=null;
      switch(field.data_type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'url':
        case 'textarea':
        case 'longtext':
        case 'picklist':
          if(typeof value!=='string')throw new Error('Invalid text field: '+key);
          if(field.max_length && value.length>field.max_length)throw new Error('Invalid text length: '+key);
          if(field.data_type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
            throw new Error('Invalid email field: '+key);
          if(field.data_type==='url'&& !/^https?:\/\/[^\s]+$/i.test(value))
            throw new Error('Invalid URL field: '+key);
          if(field.data_type==='picklist'&&field.picklist_restricted!==false){
            const allowed=await (client??this.db).query(
              'SELECT 1 FROM md_field_picklist_values WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3 AND value=$4',
              [tenantId,objectApi,key,value]);
            if(!allowed.rowCount)throw new Error('Invalid picklist value: '+key);
          }
          text=value;break;
        case 'currency':
        case 'percent':
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
    if(creating&&!prepared.has('__RecordTypeId__')){
      const defaults=await (client??this.db).query<{record_type_id:string}>(
        'SELECT record_type_id FROM md_object_record_types WHERE tenant_id=$1 AND object_api=$2 AND active=true AND is_default=true ORDER BY sort_order LIMIT 1',
        [tenantId,objectApi]);
      if(defaults.rows[0]){
        const selected=defaults.rows[0].record_type_id;
        await this.rbac.require(tenantId,userId,'RecordType:'+objectApi+'.'+selected,'read');
        prepared.set('__RecordTypeId__',{value_text:selected,reference_record_id:null});
      }
    }
    return prepared;
  }
  async create(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create');
    // Reject invalid input before reserving a transaction connection.
    const prepared=await this.prepare(tenantId,userId,objectApi,values,true);
    return this.db.transaction(client=>this.insertPrepared(client,tenantId,userId,objectApi,prepared));
  }
  /** All Flow record mutations share one transaction, including relationship checks. */
  async createInTransaction(client:PoolClient,tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create');
    const prepared=await this.prepare(tenantId,userId,objectApi,values,true,client);
    return this.insertPrepared(client,tenantId,userId,objectApi,prepared);
  }
  private async insertPrepared(client:PoolClient,tenantId:string,userId:string,objectApi:string,prepared:Map<string,Storable>) {
    const selectedType=prepared.get('__RecordTypeId__')?.value_text??null;
    const selectedOwner=prepared.get('__OwnerId__')?.value_text??userId,queue=prepared.get('__OwnerQueue__')?.value_text==='true';
    const {rows}=await client.query<{id:string}>(
      'INSERT INTO md_records (tenant_id,object_api,record_type_id,owner_id,owner_queue_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [tenantId,objectApi,selectedType,queue?null:selectedOwner,queue?selectedOwner:null]);
    for(const [field,value] of prepared){if(field.startsWith('__'))continue;await client.query(
      'INSERT INTO md_record_values (tenant_id,record_id,object_api,field_api,value_text,reference_record_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId,rows[0].id,objectApi,field,value.value_text,value.reference_record_id]);}
    return rows[0].id;
  }
  async list(tenantId:string,userId:string,objectApi:string,limit=50,offset=0) {
    await this.rbac.require(tenantId,userId,objectApi,'read');
    const pageSize=Math.min(Math.max(limit,1),100),start=Math.max(offset,0);
    const {rows}=await this.db.query<{
      id:string;created_at:Date;updated_at:Date;owner_id:string|null;record_type_id:string|null;field_api:string|null;value_text:string|null;reference_record_id:string|null;data_type:string|null
    }>(`
      WITH selected AS (
        SELECT id,created_at,updated_at,COALESCE(owner_id,owner_queue_id) AS owner_id,record_type_id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND md_record_access($1,$5,id,'read')
        ORDER BY created_at,id LIMIT $3 OFFSET $4
      )
      SELECT r.id,r.created_at,r.updated_at,r.owner_id,r.record_type_id,v.field_api,v.value_text,v.reference_record_id,f.data_type
      FROM selected r
      LEFT JOIN md_record_values v ON v.tenant_id=$1 AND v.record_id=r.id AND v.object_api=$2
      LEFT JOIN md_field_definitions f ON f.tenant_id=$1 AND f.object_api=$2 AND f.api_name=v.field_api
      ORDER BY r.created_at,r.id,v.field_api
    `,[tenantId,objectApi,pageSize,start,userId]);
    const collected=new Map<string,Record<string,unknown>>();
    const allowed=new Map<string,boolean>();
    for(const row of rows) {
      if(!collected.has(row.id))collected.set(row.id,{Id:row.id,CreatedAt:row.created_at,LastModifiedDate:row.updated_at,OwnerId:row.owner_id,RecordTypeId:row.record_type_id});
      if(!row.field_api||row.field_api==='OwnerId')continue;
      if(!allowed.has(row.field_api))allowed.set(row.field_api,
        await this.rbac.allowed(tenantId,userId,objectApi+'.'+row.field_api,'read'));
      if(!allowed.get(row.field_api))continue;
      const value=row.reference_record_id??row.value_text;
      collected.get(row.id)![row.field_api]=value===null?null:
        ['number','currency','percent'].includes(String(row.data_type))?Number(value):row.data_type==='boolean'?value==='true':value;
    }
    const total=await this.db.query<{total:string}>(
      "SELECT count(*)::text AS total FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND md_record_access($1,$3,id,'read')",[tenantId,objectApi,userId]);
    return {records:[...collected.values()],total:Number(total.rows[0]?.total??0)};
  }
  /** Single-record read uses the same tenant and field-level grants as list, without pagination. */
  async get(tenantId:string,userId:string,objectApi:string,id:string) {
    if(!uuid.test(id))throw new Error('Invalid record ID');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    const {rows}=await this.db.query<{
      id:string;created_at:Date;updated_at:Date;owner_id:string|null;record_type_id:string|null;
      field_api:string|null;value_text:string|null;reference_record_id:string|null;data_type:string|null
    }>(`SELECT r.id,r.created_at,r.updated_at,COALESCE(r.owner_id,r.owner_queue_id) AS owner_id,r.record_type_id,
      v.field_api,v.value_text,v.reference_record_id,f.data_type
      FROM md_records r
      LEFT JOIN md_record_values v ON v.tenant_id=r.tenant_id AND v.record_id=r.id AND v.object_api=r.object_api
      LEFT JOIN md_field_definitions f ON f.tenant_id=r.tenant_id AND f.object_api=r.object_api AND f.api_name=v.field_api
      WHERE r.tenant_id=$1 AND r.object_api=$2 AND r.id=$3 AND md_record_access($1,$4,r.id,'read') ORDER BY v.field_api`,[tenantId,objectApi,id,userId]);
    if(!rows.length)throw new Error('Record not found');
    const record:Record<string,unknown>={
      Id:rows[0].id,CreatedAt:rows[0].created_at,
      LastModifiedDate:rows[0].updated_at,OwnerId:rows[0].owner_id,RecordTypeId:rows[0].record_type_id
    };
    const visible=rows.filter(row=>row.field_api!==null&&row.field_api!=='OwnerId');
    const fields=visible.map(row=>row.field_api as string);
    const access=await this.rbac.allowedMany(tenantId,userId,
      fields.map(field=>({resource:objectApi+'.'+field,action:'read'})));
    for(const [index,row] of visible.entries()){
      if(!access[index])continue;
      const val=row.reference_record_id??row.value_text;
      record[row.field_api as string]=val===null?null:
        ['number','currency','percent'].includes(String(row.data_type))?Number(val):row.data_type==='boolean'?val==='true':val;
    }
    return record;
  }
  async update(tenantId:string,userId:string,objectApi:string,id:string,values:Record<string,unknown>,ifUnmodifiedSince?:string) {
    if(!uuid.test(id))throw new Error('Invalid record ID');
    const checkDate=ifUnmodifiedSince?new Date(ifUnmodifiedSince):null;
    if(checkDate&&!Number.isFinite(checkDate.getTime()))throw new Error('Invalid record modification precondition');
    await this.rbac.require(tenantId,userId,objectApi,'edit');
    const prepared=await this.prepare(tenantId,userId,objectApi,values,false);
    await this.db.transaction(async client=>{
      const found=await client.query<{updated_at:Date}>("SELECT updated_at FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND md_record_access($1,$4,id,'edit') FOR UPDATE",
        [tenantId,objectApi,id,userId]);
      if(!found.rowCount)throw new Error('Record not found');
      if(checkDate&&new Date(found.rows[0].updated_at).getTime()>checkDate.getTime()+999)
        throw new Error('Record has changed since it was loaded');
      if(prepared.has('__OwnerId__')){
        const queue=prepared.get('__OwnerQueue__')?.value_text==='true',owner=prepared.get('__OwnerId__')?.value_text;
        await client.query('UPDATE md_records SET owner_id=$4,owner_queue_id=$5 WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
          [tenantId,objectApi,id,queue?null:owner,queue?owner:null]);
      }
      if(prepared.has('__RecordTypeId__'))await client.query(
        'UPDATE md_records SET record_type_id=$4,updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
        [tenantId,objectApi,id,prepared.get('__RecordTypeId__')?.value_text]);
      else await client.query('UPDATE md_records SET updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
        [tenantId,objectApi,id]);
      for(const [field,value] of prepared){
        if(field.startsWith('__'))continue;
        const previous=await client.query<{value_text:string|null;reference_record_id:string|null}>(
          'SELECT value_text,reference_record_id FROM md_record_values WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3',
          [tenantId,id,field]);
        const before=previous.rows[0]?.reference_record_id??previous.rows[0]?.value_text??null;
        const after=value.reference_record_id??value.value_text;
        if(before!==after)await client.query(
          'INSERT INTO md_record_history(tenant_id,record_id,object_api,field_api,changed_by,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [tenantId,id,objectApi,field,userId,before,after]);
      }
      for(const [field,value] of prepared){if(field.startsWith('__'))continue;await client.query(`
        INSERT INTO md_record_values (tenant_id,record_id,object_api,field_api,value_text,reference_record_id)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (tenant_id,record_id,field_api)
        DO UPDATE SET value_text=EXCLUDED.value_text,reference_record_id=EXCLUDED.reference_record_id
      `,[tenantId,id,objectApi,field,value.value_text,value.reference_record_id]);}
    });
  }
  async history(tenantId:string,userId:string,objectApi:string,id:string){
    if(!uuid.test(id)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi))throw new Error('Invalid record reference');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    await this.rbac.requireRecord(tenantId,userId,objectApi,id,'read');
    const found=await this.db.query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3',[tenantId,objectApi,id]);
    if(!found.rowCount)throw new Error('Record not found');
    const {rows}=await this.db.query<{id:string;field_api:string;changed_by:string;changed_at:Date;old_value:string|null;new_value:string|null}>(
      'SELECT id,field_api,changed_by,changed_at,old_value,new_value FROM md_record_history WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3 ORDER BY changed_at DESC,id DESC LIMIT 100',
      [tenantId,objectApi,id]);
    const readable=new Map<string,boolean>();
    const history=[];
    for(const row of rows){
      if(!readable.has(row.field_api))readable.set(row.field_api,
        await this.rbac.allowed(tenantId,userId,objectApi+'.'+row.field_api,'read'));
      if(!readable.get(row.field_api))continue;
      history.push({id:row.id,fieldApiName:row.field_api,changedBy:row.changed_by,
        changedAt:new Date(row.changed_at).toISOString(),oldValue:row.old_value,newValue:row.new_value});
    }
    return {history};
  }
  /** Transfer record ownership without bypassing Object/Record permissions or tenant boundaries. */
  async transferOwner(tenantId:string,userId:string,objectApi:string,id:string,ownerId:string,ifUnmodifiedSince?:string){
    if(!uuid.test(id)||!uuid.test(ownerId)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi))
      throw new Error('Invalid record ownership');
    await this.rbac.require(tenantId,userId,objectApi,'edit');
    await this.rbac.require(tenantId,userId,objectApi+'.OwnerId','edit');
    let revisionDate:Date|undefined;
    if(ifUnmodifiedSince){
      revisionDate=new Date(ifUnmodifiedSince);
      if(!Number.isFinite(revisionDate.getTime()))throw new Error('Invalid record modification precondition');
    }
    return this.db.transaction(async client=>{
      const target=await client.query<{id:string;queue:boolean}>("SELECT id,false AS queue FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true UNION ALL SELECT q.queue_id,true AS queue FROM md_queue_objects q WHERE q.tenant_id=$1 AND q.queue_id=$2 AND q.object_api=$3",[tenantId,ownerId,objectApi]);
      if(!target.rowCount)throw new Error('Record owner not found');
      const found=await client.query<{updated_at:Date}>(
        "SELECT updated_at FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND md_record_access($1,$4,id,'edit') FOR UPDATE",
        [tenantId,objectApi,id,userId]);
      if(!found.rows[0])throw new Error('Record not found');
      if(revisionDate&&new Date(found.rows[0].updated_at).getTime()>revisionDate.getTime()+999)
        throw new Error('Record has changed since it was loaded');
      const {rows}=await client.query<{owner_id:string;updated_at:Date}>(
        'UPDATE md_records SET owner_id=$4,owner_queue_id=$5,updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3 RETURNING COALESCE(owner_id,owner_queue_id) AS owner_id,updated_at',
        [tenantId,objectApi,id,target.rows[0].queue?null:ownerId,target.rows[0].queue?ownerId:null]);
      return {Id:id,OwnerId:rows[0].owner_id,LastModifiedDate:rows[0].updated_at};
    });
  }
  async remove(tenantId:string,userId:string,objectApi:string,id:string) {
    await this.rbac.require(tenantId,userId,objectApi,'delete');
    const result=await this.db.query("DELETE FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND md_record_access($1,$4,id,'delete')",
      [tenantId,objectApi,id,userId]);
    if(!result.rowCount)throw new Error('Record not found');
  }
}
