import type {SqlPersistence} from './sql-persistence.js';
type SqlObject={id:string;api_name:string;label:string;is_system:boolean};
type SqlField={object_api:string;api_name:string;data_type:string;related_object:string|null;required:boolean};
export class ObjectDefinitionService {
  constructor(private readonly db:SqlPersistence) {}
  async register(tenantId:string,apiName:string,label:string,isSystem=false) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)||!label.trim())throw new Error('Invalid object definition');
    const {rows}=await this.db.query<{id:string}>(
      'INSERT INTO md_object_definitions (tenant_id,api_name,label,is_system) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,api_name) DO UPDATE SET label=EXCLUDED.label RETURNING id',
      [tenantId,apiName,label,isSystem]);
    return rows[0];
  }
  async addField(tenantId:string,objectApi:string,fieldApi:string,dataType:string,relatedObject?:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))throw new Error('Invalid field API name');
    if(!['text','number','boolean','date','datetime','reference'].includes(dataType))throw new Error('Invalid field data type');
    if(dataType==='reference'&&!relatedObject)throw new Error('Invalid relationship target');
    return this.db.query(`
      INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (tenant_id,object_api,api_name)
      DO UPDATE SET data_type=EXCLUDED.data_type,related_object=EXCLUDED.related_object
    `,[tenantId,objectApi,fieldApi,dataType,relatedObject??null]);
  }
  async list(tenantId:string) {
    const {rows:objects}=await this.db.query<SqlObject>(
      'SELECT id,api_name,label,is_system FROM md_object_definitions WHERE tenant_id=$1 ORDER BY api_name',[tenantId]);
    const {rows:fields}=await this.db.query<SqlField>(
      'SELECT object_api,api_name,data_type,related_object,required FROM md_field_definitions WHERE tenant_id=$1 ORDER BY object_api,api_name',[tenantId]);
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
        dataType:typeLabel[f.data_type]??f.data_type,required:f.required,unique:false,
        ...(f.related_object?{relationship:{
          type:'Lookup' as const,targetObject:f.related_object,
          relationshipName:f.api_name,childRelationshipName:f.object_api
        }}:{})
      }))
    }));
  }
}
