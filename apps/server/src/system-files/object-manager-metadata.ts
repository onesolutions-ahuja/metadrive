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
export type ObjectAction = {
  id:string;label:string;type:'Standard'|'Custom';enabled:boolean;
  behavior?:'Set Field Value'|'Log Call'|'Run Flow'|'Create Related';
  fieldApiName?:string;value?:string;targetObjectApi?:string;
  relationshipFieldApi?:string;flowApiName?:string
};
export type SearchLayoutField={fieldApiName:string;weight:'A'|'B'|'C'|'D'};
export type ObjectManagerConfiguration = {
  pluralLabel:string;
  description:string;
  helpText:string;
  settings:ObjectSettings;
  fieldSets:FieldSet[];
  actions:ObjectAction[];
  searchLayouts:{searchResults?:string[];lookupDialog?:string[];lookupPhoneDialog?:string[];
    searchableFields:SearchLayoutField[]};
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
  if(recordNameType==='Auto Number'&&!/\{0+\}/.test(recordNameFormat)&&!/\{YYYY\}/.test(recordNameFormat))
    throw new Error('Auto Number record names require a {0} or {YYYY} display token');
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
function validateActions(value:unknown,fields:Map<string,string>):ObjectAction[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>100)throw new Error('Invalid object actions');
  const ids=new Set<string>(),labels=new Set<string>();
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid object action');
    const action=item as Record<string,unknown>;
    if(typeof action.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]*$/.test(action.id)||action.id.length>100
      ||typeof action.label!=='string'||!action.label.trim()||action.label.length>80
      ||!['Standard','Custom'].includes(String(action.type))||typeof action.enabled!=='boolean')
      throw new Error('Invalid object action');
    if(ids.has(action.id.toLowerCase())||labels.has(action.label.trim().toLowerCase()))
      throw new Error('Duplicate object action');
    ids.add(action.id.toLowerCase());labels.add(action.label.trim().toLowerCase());
    if(action.type==='Standard')
      return {id:action.id,label:action.label.trim(),type:'Standard' as const,enabled:action.enabled};
    if(action.behavior==='Log Call'){
      if(action.value!==undefined&&(typeof action.value!=='string'||action.value.length>200))
        throw new Error('Invalid quick action call subject');
      return {id:action.id,label:action.label.trim(),type:'Custom' as const,enabled:action.enabled,
        behavior:'Log Call' as const,value:typeof action.value==='string'?action.value:''};
    }
    if(action.behavior==='Run Flow'){
      if(typeof action.flowApiName!=='string'||!apiPattern.test(action.flowApiName))
        throw new Error('Invalid quick action Flow');
      return {id:action.id,label:action.label.trim(),type:'Custom' as const,enabled:action.enabled,
        behavior:'Run Flow' as const,flowApiName:action.flowApiName};
    }
    if(action.behavior==='Create Related'){
      if(typeof action.targetObjectApi!=='string'||!apiPattern.test(action.targetObjectApi)
        ||typeof action.relationshipFieldApi!=='string'||!apiPattern.test(action.relationshipFieldApi))
        throw new Error('Invalid create-related action');
      return {id:action.id,label:action.label.trim(),type:'Custom' as const,enabled:action.enabled,
        behavior:'Create Related' as const,targetObjectApi:action.targetObjectApi,
        relationshipFieldApi:action.relationshipFieldApi};
    }
    const fieldApiName=action.fieldApiName;
    const dataType=typeof fieldApiName==='string'?fields.get(fieldApiName):undefined;
    if(typeof fieldApiName!=='string'||action.behavior!=='Set Field Value'||!dataType
      ||['formula','rollup','autonumber','reference','encryptedtext'].includes(dataType)
      ||typeof action.value!=='string'||action.value.length>10000)
      throw new Error('Custom object actions require a writable field and bounded value');
    return {id:action.id,label:action.label.trim(),type:'Custom' as const,
      enabled:action.enabled,behavior:'Set Field Value' as const,fieldApiName,value:action.value};
  });
}

export class ObjectManagerMetadataService {
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}

  async load(tenantId:string,userId:string,objectApi:string):Promise<ObjectManagerConfiguration> {
    await this.rbac.require(tenantId,userId,'ObjectDefinition','read');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    return this.loadForObjects(tenantId,[objectApi]).then(items=>items.get(objectApi)??{
      pluralLabel:objectApi,description:'',helpText:'',settings:{...defaults},fieldSets:[],actions:[],
      searchLayouts:{searchableFields:[]}
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
    const actions=await this.db.query<{
      object_api:string;action_id:string;label:string;action_type:'Standard'|'Custom';enabled:boolean;
      behavior:string|null;field_api:string|null;value_text:string|null;sort_order:number;
      target_object_api:string|null;relationship_field_api:string|null;flow_api_name:string|null
    }>(`SELECT object_api,action_id,label,action_type,enabled,behavior,field_api,value_text,sort_order,
        target_object_api,relationship_field_api,flow_api_name FROM md_object_actions WHERE tenant_id=$1 AND object_api=ANY($2::text[])
        ORDER BY object_api,sort_order,action_id`,[tenantId,objectApis]);
    const searchFields=await this.db.query<{
      object_api:string;field_api:string;weight:'A'|'B'|'C'|'D'
    }>(`SELECT object_api,field_api,weight FROM md_search_layout_fields
      WHERE tenant_id=$1 AND object_api=ANY($2::text[]) ORDER BY object_api,weight,field_api`,
    [tenantId,objectApis]);
    const searchColumns=await this.db.query<{
      object_api:string;layout_key:'searchResults'|'lookupDialog'|'lookupPhoneDialog';field_api:string
    }>(`SELECT object_api,layout_key,field_api FROM md_search_layout_columns
      WHERE tenant_id=$1 AND object_api=ANY($2::text[]) ORDER BY object_api,layout_key,position`,
    [tenantId,objectApis]);
    const setsByObject=new Map<string,FieldSet[]>();
    for(const row of sets.rows){
      const fieldSets=setsByObject.get(row.object_api)??[];
      let fieldSet=fieldSets.find(item=>item.apiName===row.api_name);
      if(!fieldSet){fieldSet={apiName:row.api_name,label:row.label,fieldApiNames:[]};fieldSets.push(fieldSet);}
      if(row.field_api)fieldSet.fieldApiNames.push(row.field_api);
      setsByObject.set(row.object_api,fieldSets);
    }
    const actionsByObject=new Map<string,ObjectAction[]>();
    for(const row of actions.rows){
      const items=actionsByObject.get(row.object_api)??[];
      items.push({id:row.action_id,label:row.label,type:row.action_type,enabled:row.enabled,
        ...(row.behavior==='Set Field Value'?{behavior:'Set Field Value' as const,
          fieldApiName:row.field_api??undefined,value:row.value_text??''}:{}),
        ...(row.behavior==='Log Call'?{behavior:'Log Call' as const,value:row.value_text??''}:{}),
        ...(row.behavior==='Run Flow'?{behavior:'Run Flow' as const,flowApiName:row.flow_api_name??''}:{}),
        ...(row.behavior==='Create Related'?{behavior:'Create Related' as const,
          targetObjectApi:row.target_object_api??'',relationshipFieldApi:row.relationship_field_api??''}:{})});
      actionsByObject.set(row.object_api,items);
    }
    const searchFieldsByObject=new Map<string,SearchLayoutField[]>();
    for(const row of searchFields.rows){
      const items=searchFieldsByObject.get(row.object_api)??[];
      items.push({fieldApiName:row.field_api,weight:row.weight});
      searchFieldsByObject.set(row.object_api,items);
    }
    const searchColumnsByObject=new Map<string,ObjectManagerConfiguration['searchLayouts']>();
    for(const row of searchColumns.rows){
      const layouts=searchColumnsByObject.get(row.object_api)??{
        searchableFields:[]
      };
      const configured=layouts[row.layout_key]??[];
      configured.push(row.field_api);
      layouts[row.layout_key]=configured;
      searchColumnsByObject.set(row.object_api,layouts);
    }
    for(const [objectApi,layouts] of searchColumnsByObject)
      layouts.searchableFields=searchFieldsByObject.get(objectApi)??[];
    const result=new Map<string,ObjectManagerConfiguration>();
    for(const row of config.rows)result.set(row.object_api,{pluralLabel:row.plural_label,description:row.description,helpText:row.help_text,
      settings:{
        allowReports:row.allow_reports,allowActivities:row.allow_activities,
        trackFieldHistory:row.track_field_history,allowInChatter:row.allow_in_chatter,
        allowSearch:row.allow_search,deploymentStatus:row.deployment_status,
        recordNameType:row.record_name_type,recordNameFormat:row.record_name_format
      },fieldSets:setsByObject.get(row.object_api)??[],actions:actionsByObject.get(row.object_api)??[],
      searchLayouts:searchColumnsByObject.get(row.object_api)??{
        searchableFields:searchFieldsByObject.get(row.object_api)??[]}});
    for(const objectApi of objectApis)if(!result.has(objectApi))result.set(objectApi,{
      pluralLabel:objectApi,description:'',helpText:'',settings:{...defaults},
      fieldSets:setsByObject.get(objectApi)??[],actions:actionsByObject.get(objectApi)??[],
      searchLayouts:searchColumnsByObject.get(objectApi)??{
        searchableFields:searchFieldsByObject.get(objectApi)??[]}
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
    const fieldTypes=new Map(fields.rows.map(field=>[field.api_name,field.data_type]));
    const searchLayouts=input.searchLayouts;
    if(searchLayouts!==undefined){
      if(!searchLayouts||typeof searchLayouts!=='object'||Array.isArray(searchLayouts))
        throw new Error('Invalid search layouts');
      const searchableFields=(searchLayouts as Record<string,unknown>).searchableFields;
      if(searchableFields!==undefined){
        if(!Array.isArray(searchableFields)||searchableFields.length>100)
          throw new Error('Invalid searchable fields');
        const seen=new Set<string>();
        for(const item of searchableFields){
          if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid searchable field');
          const field=item as Record<string,unknown>;
          const allowedType=typeof field.fieldApiName==='string'?fieldTypes.get(field.fieldApiName):undefined;
          if(typeof field.fieldApiName!=='string'
            ||!['text','email','phone','url','picklist'].includes(allowedType??'')
            ||!['A','B','C','D'].includes(String(field.weight))
            ||seen.has(field.fieldApiName))throw new Error('Invalid searchable field');
          seen.add(field.fieldApiName);
        }
        await client.query('DELETE FROM md_search_layout_fields WHERE tenant_id=$1 AND object_api=$2',
          [tenantId,objectApi]);
        for(const item of searchableFields){
          const field=item as Record<string,unknown>;
          await client.query(`INSERT INTO md_search_layout_fields
            (tenant_id,object_api,field_api,weight) VALUES($1,$2,$3,$4)`,
          [tenantId,objectApi,field.fieldApiName,field.weight]);
        }
      }
      for(const layoutKey of ['searchResults','lookupDialog','lookupPhoneDialog'] as const){
        const configured=(searchLayouts as Record<string,unknown>)[layoutKey];
        if(configured===undefined)continue;
        if(!Array.isArray(configured)||configured.length>500
          ||configured.some(field=>typeof field!=='string'||!fieldNames.has(field))
          ||new Set(configured).size!==configured.length)
          throw new Error('Invalid search layout fields');
        await client.query(`DELETE FROM md_search_layout_columns
          WHERE tenant_id=$1 AND object_api=$2 AND layout_key=$3`,[tenantId,objectApi,layoutKey]);
        for(const [position,fieldApi] of configured.entries())
          await client.query(`INSERT INTO md_search_layout_columns
            (tenant_id,object_api,layout_key,position,field_api) VALUES($1,$2,$3,$4,$5)`,
          [tenantId,objectApi,layoutKey,position,fieldApi]);
      }
    }
    const recordName=fields.rows.find(field=>field.api_name==='Name');
    if(settings.recordNameType==='Auto Number'&&recordName?.data_type!=='autonumber')
      throw new Error('The Name field must use Auto Number before enabling Auto Number record names');
    if(settings.recordNameType==='Text'&&recordName?.data_type==='autonumber')
      throw new Error('The Name field uses Auto Number; change its field type to select Text record names');
    const fieldSets=validateFieldSets(input.fieldSets,fieldNames);
    const actions=validateActions(input.actions,fieldTypes);
    for(const action of actions){
      if(action.behavior==='Create Related'){
        const {rowCount}=await client.query(`SELECT 1 FROM md_field_definitions
          WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 AND related_object=$4
            AND data_type='reference' AND deleted_at IS NULL`,
          [tenantId,action.targetObjectApi,action.relationshipFieldApi,objectApi]);
        if(!rowCount)throw new Error('Create-related action requires a valid child relationship');
      }
    }
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
    await client.query('DELETE FROM md_object_actions WHERE tenant_id=$1 AND object_api=$2',[tenantId,objectApi]);
    for(const [index,action] of actions.entries())
      await client.query(`INSERT INTO md_object_actions
        (tenant_id,object_api,action_id,label,action_type,enabled,behavior,field_api,value_text,sort_order,
         target_object_api,relationship_field_api,flow_api_name)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [tenantId,objectApi,action.id,action.label,action.type,action.enabled,
        action.behavior??null,action.fieldApiName??null,action.value??null,index,
        action.targetObjectApi??null,action.relationshipFieldApi??null,action.flowApiName??null]);
    return {pluralLabel,description,helpText,settings,fieldSets,actions};
  }
}
