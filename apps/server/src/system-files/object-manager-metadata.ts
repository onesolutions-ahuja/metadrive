import type {PoolClient} from 'pg';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

export type ObjectSettings = {
  allowReports:boolean;
  allowActivities:boolean;
  trackFieldHistory:boolean;
  allowInChatter:boolean;
  allowSearch:boolean;
  deploymentStatus:'In Development'|'Deployed';
  recordNameType:'Text'|'Auto Number';
  recordNameFormat:string;
};
export type FieldSet = {apiName:string;label:string;fieldApiNames:string[]};
export type ObjectManagerConfiguration = {
  pluralLabel:string;
  description:string;
  helpText:string;
  settings:ObjectSettings;
  fieldSets:FieldSet[];
};
const defaults: ObjectSettings = {
  allowReports:true,allowActivities:false,trackFieldHistory:false,allowInChatter:false,
  allowSearch:true,deploymentStatus:'Deployed',recordNameType:'Text',recordNameFormat:''
};
const apiPattern=/^[A-Za-z][A-Za-z0-9_]*$/;

function validateSettings(value:unknown):ObjectSettings {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid object settings');
  const settings=value as Record<string,unknown>;
  for(const key of ['allowReports','allowActivities','trackFieldHistory','allowInChatter','allowSearch'])
    if(settings[key]!==undefined&&typeof settings[key]!=='boolean')throw new Error('Invalid object settings');
  const deploymentStatus=settings.deploymentStatus??defaults.deploymentStatus;
  const recordNameType=settings.recordNameType??defaults.recordNameType;
  const recordNameFormat=settings.recordNameFormat??'';
  if(!['In Development','Deployed'].includes(String(deploymentStatus))
    ||!['Text','Auto Number'].includes(String(recordNameType))
    ||typeof recordNameFormat!=='string'||recordNameFormat.length>80)
    throw new Error('Invalid object settings');
  if(recordNameType==='Auto Number'&&!/\{0+\}/.test(recordNameFormat))
    throw new Error('Auto Number record names require a {0} display token');
  return {
    allowReports:settings.allowReports===undefined?defaults.allowReports:settings.allowReports as boolean,
    allowActivities:settings.allowActivities===undefined?defaults.allowActivities:settings.allowActivities as boolean,
    trackFieldHistory:settings.trackFieldHistory===undefined?defaults.trackFieldHistory:settings.trackFieldHistory as boolean,
    allowInChatter:settings.allowInChatter===undefined?defaults.allowInChatter:settings.allowInChatter as boolean,
    allowSearch:settings.allowSearch===undefined?defaults.allowSearch:settings.allowSearch as boolean,
    deploymentStatus:deploymentStatus as ObjectSettings['deploymentStatus'],
    recordNameType:recordNameType as ObjectSettings['recordNameType'],
    recordNameFormat:recordNameType==='Auto Number'?recordNameFormat:''
  };
}
function validateText(value:unknown,max:number,label:string):string {
  if(value===undefined)return '';
  if(typeof value!=='string'||value.length>max)throw new Error('Invalid object '+label);
  return value.trim();
}
function validateFieldSets(value:unknown,fieldNames:Set<string>):FieldSet[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>200)throw new Error('Invalid field sets');
  const names=new Set<string>();
  const labels=new Set<string>();
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid field set');
    const fieldSet=item as Record<string,unknown>;
    if(typeof fieldSet.apiName!=='string'||!apiPattern.test(fieldSet.apiName)||fieldSet.apiName.length>255
      ||typeof fieldSet.label!=='string'||!fieldSet.label.trim()||fieldSet.label.length>80
      ||!Array.isArray(fieldSet.fieldApiNames)||fieldSet.fieldApiNames.length>500
      ||fieldSet.fieldApiNames.some(name=>typeof name!=='string'||!fieldNames.has(name))
      ||new Set(fieldSet.fieldApiNames).size!==fieldSet.fieldApiNames.length)
      throw new Error('Invalid field set');
    if(names.has(fieldSet.apiName.toLocaleLowerCase())
      ||labels.has(fieldSet.label.trim().toLocaleLowerCase()))throw new Error('Duplicate field set');
    names.add(fieldSet.apiName.toLocaleLowerCase());
    labels.add(fieldSet.label.trim().toLocaleLowerCase());
    return {apiName:fieldSet.apiName,label:fieldSet.label.trim(),fieldApiNames:fieldSet.fieldApiNames as string[]};
  });
}

export class ObjectManagerMetadataService {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}

  async load(tenantId:string,userId:string,objectApi:string):Promise<ObjectManagerConfiguration> {
    await this.rbac.require(tenantId,userId,'ObjectDefinition','read');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    return this.loadForObjects(tenantId,[objectApi]).then(items=>items.get(objectApi)??{
      pluralLabel:objectApi,description:'',helpText:'',settings:{...defaults},fieldSets:[]
    });
  }

  async loadForObjects(tenantId:string,objectApis:readonly string[]) {
    if(!objectApis.length)return new Map<string,ObjectManagerConfiguration>();
    const config=await this.db.query<{
      object_api:string;
      plural_label:string;description:string;help_text:string;allow_reports:boolean;allow_activities:boolean;
      track_field_history:boolean;allow_in_chatter:boolean;allow_search:boolean;
      deployment_status:'In Development'|'Deployed';record_name_type:'Text'|'Auto Number';record_name_format:string
    }>(`SELECT object_api,plural_label,description,help_text,allow_reports,allow_activities,track_field_history,allow_in_chatter,
        allow_search,deployment_status,record_name_type,record_name_format
      FROM md_object_manager_settings WHERE tenant_id=$1 AND object_api=ANY($2::text[])`,[tenantId,objectApis]);
    const sets=await this.db.query<{object_api:string;api_name:string;label:string;field_api:string;sort_order:number}>(
    `SELECT s.object_api,s.api_name,s.label,i.field_api,i.sort_order FROM md_object_field_sets s
       LEFT JOIN md_object_field_set_items i ON i.tenant_id=s.tenant_id
         AND i.object_api=s.object_api AND i.field_set_api=s.api_name
       WHERE s.tenant_id=$1 AND s.object_api=ANY($2::text[]) ORDER BY s.object_api,s.sort_order,i.sort_order`,
      [tenantId,objectApis]);
    const setsByObject=new Map<string,FieldSet[]>();
    for(const row of sets.rows){
      const fieldSets=setsByObject.get(row.object_api)??[];
      let fieldSet=fieldSets.find(item=>item.apiName===row.api_name);
      if(!fieldSet){fieldSet={apiName:row.api_name,label:row.label,fieldApiNames:[]};fieldSets.push(fieldSet);}
      if(row.field_api)fieldSet.fieldApiNames.push(row.field_api);
      setsByObject.set(row.object_api,fieldSets);
    }
    const result=new Map<string,ObjectManagerConfiguration>();
    for(const row of config.rows)result.set(row.object_api,{pluralLabel:row.plural_label,description:row.description,helpText:row.help_text,
      settings:{
        allowReports:row.allow_reports,allowActivities:row.allow_activities,
        trackFieldHistory:row.track_field_history,allowInChatter:row.allow_in_chatter,
        allowSearch:row.allow_search,deploymentStatus:row.deployment_status,
        recordNameType:row.record_name_type,recordNameFormat:row.record_name_format
      },fieldSets:setsByObject.get(row.object_api)??[]});
    for(const objectApi of objectApis)if(!result.has(objectApi))result.set(objectApi,{
      pluralLabel:objectApi,description:'',helpText:'',settings:{...defaults},fieldSets:setsByObject.get(objectApi)??[]
    });
    return result;
  }

  async save(tenantId:string,userId:string,objectApi:string,value:unknown) {
    if(!apiPattern.test(objectApi)||!value||typeof value!=='object'||Array.isArray(value))
      throw new Error('Invalid object configuration');
    await this.rbac.require(tenantId,userId,'ObjectDefinition','manage');
    await this.rbac.require(tenantId,userId,objectApi,'edit');
    return this.db.transaction(client=>this.persistWithin(client,tenantId,objectApi,value));
  }

  async persistWithin(client:PoolClient,tenantId:string,objectApi:string,value:unknown) {
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw new Error('Invalid object configuration');
    const input=value as Record<string,unknown>;
    const settings=validateSettings(input.settings);
    const pluralLabel=validateText(input.pluralLabel,160,'plural label');
    if(!pluralLabel)throw new Error('Invalid object plural label');
    const description=validateText(input.description,1000,'description');
    const helpText=validateText(input.helpText,1000,'help text');
    const object=await client.query<{api_name:string}>(`SELECT api_name FROM md_object_definitions
        WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE`,[tenantId,objectApi]);
      if(!object.rowCount)throw new Error('Object not found');
    const fields=await client.query<{api_name:string;data_type:string}>(`SELECT api_name,data_type
        FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND deleted_at IS NULL`,
    [tenantId,objectApi]);
    const fieldNames=new Set(fields.rows.map(field=>field.api_name));
    const recordName=fields.rows.find(field=>field.api_name==='Name');
    if(settings.recordNameType==='Auto Number'&&recordName?.data_type!=='autonumber')
      throw new Error('The Name field must use Auto Number before enabling Auto Number record names');
    if(settings.recordNameType==='Text'&&recordName?.data_type==='autonumber')
      throw new Error('The Name field uses Auto Number; change its field type to select Text record names');
    const fieldSets=validateFieldSets(input.fieldSets,fieldNames);
    await client.query(`INSERT INTO md_object_manager_settings
        (tenant_id,object_api,plural_label,description,help_text,allow_reports,allow_activities,track_field_history,
         allow_in_chatter,allow_search,deployment_status,record_name_type,record_name_format)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(tenant_id,object_api) DO UPDATE SET plural_label=EXCLUDED.plural_label,
          description=EXCLUDED.description,
          help_text=EXCLUDED.help_text,allow_reports=EXCLUDED.allow_reports,
          allow_activities=EXCLUDED.allow_activities,track_field_history=EXCLUDED.track_field_history,
          allow_in_chatter=EXCLUDED.allow_in_chatter,allow_search=EXCLUDED.allow_search,
          deployment_status=EXCLUDED.deployment_status,record_name_type=EXCLUDED.record_name_type,
          record_name_format=EXCLUDED.record_name_format,updated_at=now()`,
      [tenantId,objectApi,pluralLabel,description,helpText,settings.allowReports,settings.allowActivities,
        settings.trackFieldHistory,settings.allowInChatter,settings.allowSearch,
        settings.deploymentStatus,settings.recordNameType,settings.recordNameFormat]);
    await client.query('DELETE FROM md_object_field_sets WHERE tenant_id=$1 AND object_api=$2',[tenantId,objectApi]);
    for(const [index,fieldSet] of fieldSets.entries()){
      await client.query(`INSERT INTO md_object_field_sets
          (tenant_id,object_api,api_name,label,sort_order) VALUES($1,$2,$3,$4,$5)`,
      [tenantId,objectApi,fieldSet.apiName,fieldSet.label,index]);
      for(const [order,fieldApi] of fieldSet.fieldApiNames.entries())
        await client.query(`INSERT INTO md_object_field_set_items
            (tenant_id,object_api,field_set_api,field_api,sort_order) VALUES($1,$2,$3,$4,$5)`,
        [tenantId,objectApi,fieldSet.apiName,fieldApi,order]);
    }
    return {pluralLabel,description,helpText,settings,fieldSets};
  }
}
