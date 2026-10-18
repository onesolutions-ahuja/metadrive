import type {SqlPersistence} from './sql-persistence.js';
type SqlObject={id:string;api_name:string;label:string;is_system:boolean};
type SqlField={id:string;label:string|null;object_api:string;api_name:string;data_type:string;related_object:string|null;required:boolean;max_length:number|null};
export class ObjectDefinitionService {
  constructor(private readonly db:SqlPersistence) {}
  async register(tenantId:string,apiName:string,label:string,isSystem=false) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!label.trim())throw new Error('Invalid object definition');
    const {rows}=await this.db.query<{id:string}>(
      'INSERT INTO md_object_definitions (tenant_id,api_name,label,is_system) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,api_name) DO UPDATE SET label=EXCLUDED.label RETURNING id',
      [tenantId,apiName,label,isSystem]);
    return rows[0];
  }
  // Atomic tenant-scoped creation: no partially created Objects when a field is invalid.
  async create(tenantId:string,apiName:string,label:string,fields:unknown=[],actorUserId?:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!label.trim())throw new Error('Invalid object definition');
    if(!Array.isArray(fields))throw new Error('Invalid object fields');
    const types:Record<string,string>={text:'text',number:'number',checkbox:'boolean',boolean:'boolean',date:'date',datetime:'datetime','date/time':'datetime',lookup:'reference',reference:'reference'};
    const normalized=fields.map((raw:unknown)=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid field definition');
      const field=raw as Record<string,unknown>;
      const name=field.apiName;
      const dataType=typeof field.dataType==='string'?field.dataType:'';
      const key=dataType.toLowerCase().replace(/\s+/g,'');
      const match=/^text\(([0-9]+)\)$/.exec(key);
      const type=match?'text':types[key];
      const maxLength=match?Number(match[1]):null;
      if(maxLength!==null && (!Number.isSafeInteger(maxLength)||maxLength<1||maxLength>1000000))
        throw new Error('Invalid text field length');
      if(typeof name!=='string'|| !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||!type)throw new Error('Invalid field definition');
      const relationship=field.relationship as Record<string,unknown>|undefined;
      const target=relationship?.targetObject??field.relatedObject;
      if(type==='reference' && (typeof target!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(target)))
        throw new Error('Invalid relationship target');
      if(field.unique===true||field.formula||field.defaultValue!==undefined||field.valueSettings)
        throw new Error('Unsupported field options cannot be saved');
      return {apiName:name,label:typeof field.label==='string'&&field.label.trim()?field.label.trim():name,dataType:type,relatedObject:type==='reference'?target as string:null,required:field.required===true,maxLength};
    });
    if(new Set(normalized.map(x=>x.apiName.toLowerCase())).size!==normalized.length)
      throw new Error('Duplicate field API name');
    await this.db.transaction(async client=>{
      if(actorUserId)await client.query('SELECT set_config($1,$2,true)',['metadrive.actor_user_id',actorUserId]);
      const inserted=await client.query(
        'INSERT INTO md_object_definitions (tenant_id,api_name,label,is_system) VALUES ($1,$2,$3,false) ON CONFLICT (tenant_id,api_name) DO NOTHING RETURNING id',
        [tenantId,apiName,label]);
      if(!inserted.rowCount)throw new Error('Object already exists');
      for(const field of normalized)await client.query(
        'INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object,required,max_length,label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [tenantId,apiName,field.apiName,field.dataType,field.relatedObject,field.required,field.maxLength,field.label]);
    });
    return this.get(tenantId,apiName);
  }
  async addField(tenantId:string,objectApi:string,fieldApi:string,dataType:string,relatedObject?:string,label?:string,actorUserId?:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))throw new Error('Invalid field API name');
    const normalized=dataType.toLowerCase().replace(/\s+/g,'');
    const lengthMatch=/^text\(([0-9]+)\)$/.exec(normalized);
    const types:Record<string,string>={text:'text',number:'number',checkbox:'boolean',boolean:'boolean',date:'date',datetime:'datetime','date/time':'datetime',lookup:'reference',reference:'reference'};
    const type=lengthMatch?'text':types[normalized];
    const maxLength=lengthMatch?Number(lengthMatch[1]):null;
    if(!type)throw new Error('Invalid field data type');
    if(maxLength!==null&&(!Number.isSafeInteger(maxLength)||maxLength<1||maxLength>1000000))
      throw new Error('Invalid text field length');
    if(type==='reference'&&(!relatedObject||!/^[A-Za-z][A-Za-z0-9_]*$/.test(relatedObject)))
      throw new Error('Invalid relationship target');
    const result=await this.db.transaction(async client=>{
      if(actorUserId)await client.query('SELECT set_config($1,$2,true)',['metadrive.actor_user_id',actorUserId]);
      return client.query(`
      INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object,max_length,label)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (tenant_id,object_api,api_name) DO NOTHING RETURNING id
    `,[tenantId,objectApi,fieldApi,type,type==='reference'?relatedObject:null,maxLength,label?.trim()||fieldApi]);
    });
    if(!result.rowCount)throw new Error('Field already exists');
    return result;
  }
  /** Only mutable SQL-backed field properties may be edited; unsupported options fail closed. */
  async updateField(tenantId:string,objectApi:string,fieldApi:string,proposal:Record<string,unknown>,actorUserId?:string){
    if(typeof proposal.label!=='string'||!proposal.label.trim()||proposal.label.length>160
      || (proposal.apiName!==undefined&&proposal.apiName!==fieldApi))
      throw new Error('Invalid field update');
    const original=await this.get(tenantId,objectApi);
    const current=original.fields.find(x=>x.apiName===fieldApi);
    if(!current)throw new Error('Field not found');
    if(proposal.dataType!==undefined&&proposal.dataType!==current.dataType)
      throw new Error('Field datatype migration requires a versioned migration');
    const mutable=new Set(['id','apiName','label','dataType','required','unique','relationship']);
    if(Object.keys(proposal).some(key=>!mutable.has(key))||
      (proposal.required!==undefined&&proposal.required!==current.required)||
      (proposal.unique!==undefined&&proposal.unique!==current.unique)||
      (proposal.relationship!==undefined&&JSON.stringify(proposal.relationship)!==JSON.stringify(current.relationship)))
      throw new Error('Unsupported field update requires a metadata migration');
    const changed=await this.db.transaction(async client=>{
      if(actorUserId)await client.query('SELECT set_config($1,$2,true)',['metadrive.actor_user_id',actorUserId]);
      return client.query(
      'UPDATE md_field_definitions SET label=$4 WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 RETURNING id',
      [tenantId,objectApi,fieldApi,proposal.label.trim()]);
    });
    if(!changed.rowCount)throw new Error('Field not found');
    return this.get(tenantId,objectApi);
  }
  /** Refuse destructive removal if any tenant record contains a value in this field. */
  async deleteField(tenantId:string,objectApi:string,fieldApi:string,actorUserId?:string){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))throw new Error('Invalid field API name');
    await this.db.transaction(async client=>{
      if(actorUserId)await client.query('SELECT set_config($1,$2,true)',['metadrive.actor_user_id',actorUserId]);
      const {rows}=await client.query<{id:string}>(`
        SELECT id FROM md_field_definitions
        WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 FOR UPDATE
      `,[tenantId,objectApi,fieldApi]);
      if(!rows[0])throw new Error('Field not found');
      const usage=await client.query(`
        SELECT 1 FROM md_record_values WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3 LIMIT 1
      `,[tenantId,objectApi,fieldApi]);
      if(usage.rows.length)throw new Error('Field has stored records; removal requires reviewed migration');
      await client.query(
        'DELETE FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3',
        [tenantId,objectApi,fieldApi]);
    });
    return this.get(tenantId,objectApi);
  }
  /** Relational lookup dependencies. No inferred or hardcoded app references. */
  async dependencies(tenantId:string,apiName:string) {
    await this.get(tenantId,apiName);
    const {rows}=await this.db.query<{object_api:string;related_object:string}>(
      'SELECT object_api,related_object FROM md_field_definitions WHERE tenant_id=$1 AND (object_api=$2 OR related_object=$2) AND related_object IS NOT NULL ORDER BY object_api,related_object',
      [tenantId,apiName]);
    return {dependencies:[...new Set(rows.map(row=>row.object_api===apiName?row.related_object:row.object_api))].filter((name):name is string=>Boolean(name)).sort()};
  }
  async fieldDependencies(tenantId:string,apiName:string) {
    const object=await this.get(tenantId,apiName);
    const {rows}=await this.db.query<{api_name:string;related_object:string|null}>(
      'SELECT api_name,related_object FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 ORDER BY api_name',
      [tenantId,apiName]);
    return {fields:object.fields.map(field=>({
      fieldApiName:field.apiName,
      dependencies:rows.filter(row=>row.api_name===field.apiName&&row.related_object!==null).map(row=>row.related_object as string)
    }))};
  }
  /** Immutable snapshots captured by SQL triggers, including changes made by seeders. */
  async history(tenantId:string,apiName:string,limit=100){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!Number.isSafeInteger(limit)||limit<1||limit>100)
      throw new Error('Invalid metadata history');
    const {rows}=await this.db.query<{revision:string;action:string;actor_user_id:string|null;
      created_at:Date;snapshot:unknown}>(`
      SELECT revision::text,action,actor_user_id,created_at,snapshot
      FROM md_object_metadata_history WHERE tenant_id=$1 AND object_api=$2
      ORDER BY revision DESC LIMIT $3`,[tenantId,apiName,limit]);
    return {history:rows.map(r=>({objectApiName:apiName,revision:Number(r.revision),
      action:r.action,actorUserId:r.actor_user_id??'',at:new Date(r.created_at).toISOString(),
      beforeRevision:Number(r.revision)>1?Number(r.revision)-1:null,
      afterRevision:r.snapshot?Number(r.revision):null}))};
  }
  async historyRevision(tenantId:string,apiName:string,revision:number){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!Number.isSafeInteger(revision)||revision<1)
      throw new Error('Invalid metadata revision');
    const {rows}=await this.db.query<{revision:string;snapshot:unknown}>(`
      SELECT revision::text,snapshot FROM md_object_metadata_history
      WHERE tenant_id=$1 AND object_api=$2 AND revision IN ($3::bigint,($3::bigint - 1))
      ORDER BY revision DESC`,[tenantId,apiName,revision]);
    const current=rows.find(r=>Number(r.revision)===revision);
    if(!current)throw new Error('Metadata revision not found');
    const before=rows.find(r=>Number(r.revision)===revision-1);
    return {change:{revision,after:current.snapshot??undefined,before:before?.snapshot??undefined}};
  }
  async get(tenantId:string,apiName:string) {
    const objects=await this.list(tenantId);
    const object=objects.find(item=>item.apiName===apiName);
    if(!object)throw new Error('Object not found');
    return object;
  }
  async list(tenantId:string) {
    const {rows:objects}=await this.db.query<SqlObject>(
      'SELECT id,api_name,label,is_system FROM md_object_definitions WHERE tenant_id=$1 ORDER BY api_name',[tenantId]);
    const {rows:fields}=await this.db.query<SqlField>(
      'SELECT id,object_api,api_name,label,data_type,related_object,required,max_length FROM md_field_definitions WHERE tenant_id=$1 ORDER BY object_api,api_name',[tenantId]);
    const byObject=new Map<string,SqlField[]>();
    for(const field of fields) {
      const list=byObject.get(field.object_api)??[];
      list.push(field);byObject.set(field.object_api,list);
    }
    const typeLabel:Record<string,string>={
      text:'Text',number:'Number',boolean:'Checkbox',date:'Date',datetime:'Date/Time',reference:'Lookup'
    };
    return objects.map(obj=>({
      id:obj.id,apiName:obj.api_name,label:obj.label,pluralLabel:obj.label,
      kind:obj.is_system?'Standard Object' as const:'Custom Object' as const,
      description:'',
      fields:(byObject.get(obj.api_name)??[]).map(f=>({
        id:f.id,apiName:f.api_name,label:f.label??f.api_name,
        dataType:f.data_type==='text'&&f.max_length?`Text(${f.max_length})`:(typeLabel[f.data_type]??f.data_type),required:f.required,unique:false,
        ...(f.related_object?{relationship:{
          type:'Lookup' as const,targetObject:f.related_object,
          relationshipName:f.api_name,childRelationshipName:f.object_api
        }}:{})
      }))
    }));
  }
}
