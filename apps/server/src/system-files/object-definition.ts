import type {SqlPersistence} from './sql-persistence.js';
type SqlObject={id:string;api_name:string;label:string;is_system:boolean};
type SqlField={object_api:string;api_name:string;data_type:string;related_object:string|null;required:boolean;max_length:number|null};
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
  async create(tenantId:string,apiName:string,label:string,fields:unknown=[]) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!label.trim())throw new Error('Invalid object definition');
    if(!Array.isArray(fields))throw new Error('Invalid object fields');
    const types:Record<string,string>={text:'text',number:'number',checkbox:'boolean',boolean:'boolean',date:'date',datetime:'datetime','date/time':'datetime',lookup:'reference',reference:'reference'};
    const normalized=fields.map((raw:unknown)=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid field definition');
      const field=raw as Record<string,unknown>;
      const name=field.apiName;
      const dataType=typeof field.dataType==='string'?field.dataType:'';
      const key=dataType.toLowerCase().replace(/\s+/g,'');
      const match=/^text\\(([0-9]+)\\)$/.exec(key);
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
      return {apiName:name,dataType:type,relatedObject:type==='reference'?target as string:null,required:field.required===true,maxLength};
    });
    if(new Set(normalized.map(x=>x.apiName.toLowerCase())).size!==normalized.length)
      throw new Error('Duplicate field API name');
    await this.db.transaction(async client=>{
      const inserted=await client.query(
        'INSERT INTO md_object_definitions (tenant_id,api_name,label,is_system) VALUES ($1,$2,$3,false) ON CONFLICT (tenant_id,api_name) DO NOTHING RETURNING id',
        [tenantId,apiName,label]);
      if(!inserted.rowCount)throw new Error('Object already exists');
      for(const field of normalized)await client.query(
        'INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object,required,max_length) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [tenantId,apiName,field.apiName,field.dataType,field.relatedObject,field.required,field.maxLength]);
    });
    return this.get(tenantId,apiName);
  }
  async addField(tenantId:string,objectApi:string,fieldApi:string,dataType:string,relatedObject?:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))throw new Error('Invalid field API name');
    const normalized=dataType.toLowerCase().replace(/\\s+/g,'');
    const lengthMatch=/^text\\(([0-9]+)\\)$/.exec(normalized);
    const types:Record<string,string>={text:'text',number:'number',checkbox:'boolean',boolean:'boolean',date:'date',datetime:'datetime','date/time':'datetime',lookup:'reference',reference:'reference'};
    const type=lengthMatch?'text':types[normalized];
    const maxLength=lengthMatch?Number(lengthMatch[1]):null;
    if(!type)throw new Error('Invalid field data type');
    if(maxLength!==null&&(!Number.isSafeInteger(maxLength)||maxLength<1||maxLength>1000000))
      throw new Error('Invalid text field length');
    if(type==='reference'&&(!relatedObject||!/^[A-Za-z][A-Za-z0-9_]*$/.test(relatedObject)))
      throw new Error('Invalid relationship target');
    const result=await this.db.query(`
      INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object,max_length)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tenant_id,object_api,api_name) DO NOTHING RETURNING id
    `,[tenantId,objectApi,fieldApi,type,type==='reference'?relatedObject:null,maxLength]);
    if(!result.rowCount)throw new Error('Field already exists');
    return result;
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
      'SELECT object_api,api_name,data_type,related_object,required,max_length FROM md_field_definitions WHERE tenant_id=$1 ORDER BY object_api,api_name',[tenantId]);
    const byObject=new Map<string,SqlField[]>();
    for(const field of fields) {
      const list=byObject.get(field.object_api)??[];
      list.push(field);byObject.set(field.object_api,list);
    }
    const typeLabel:Record<string,string>={
      text:'Text',number:'Number',boolean:'Checkbox',date:'Date',datetime:'Date/Time',reference:'Lookup'
    };
    return objects.map(obj=>({
      apiName:obj.api_name,label:obj.label,pluralLabel:obj.label,
      kind:obj.is_system?'Standard Object' as const:'Custom Object' as const,
      description:'',
      fields:(byObject.get(obj.api_name)??[]).map(f=>({
        apiName:f.api_name,label:f.api_name,
        dataType:f.data_type==='text'&&f.max_length?`Text(${f.max_length})`:(typeLabel[f.data_type]??f.data_type),required:f.required,unique:false,
        ...(f.related_object?{relationship:{
          type:'Lookup' as const,targetObject:f.related_object,
          relationshipName:f.api_name,childRelationshipName:f.object_api
        }}:{})
      }))
    }));
  }
}
