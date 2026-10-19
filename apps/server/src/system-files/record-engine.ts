import type {SqlPersistence} from './sql-persistence.js';
import type {PoolClient} from 'pg';
import sanitizeHtml from 'sanitize-html';
import type {RbacEngine} from './rbac-engine.js';
import {evaluateFlowFormula,validateFlowFormula} from './flow-formula-runtime.js';
type FieldDefinition={api_name:string;data_type:string;related_object:string|null;relationship_type:string|null;allow_reparenting:boolean;required:boolean;max_length:number|null;precision:number|null;scale:number|null;is_unique:boolean;external_id:boolean;case_sensitive:boolean;default_value:string|null;auto_number_format:string|null;rollup_child_object?:string|null;rollup_relationship_field?:string|null;rollup_operation?:string|null;rollup_source_field?:string|null;formula_expression?:string|null;formula_return_type?:string|null;picklist_restricted?:boolean;controller_field_api_name?:string|null};
type Storable={value_text:string|null;reference_record_id:string|null;value_number?:string|null;value_date?:string|null;value_datetime?:Date|null;value_boolean?:boolean|null;geo_latitude?:number|null;geo_longitude?:number|null;address_street?:string|null;address_city?:string|null;address_state?:string|null;address_postal_code?:string|null;address_country?:string|null;multi_values?:string[];is_unique:boolean;case_sensitive:boolean};
type RecordTriggerHandler=(
  client:PoolClient,tenantId:string,userId:string,objectApi:string,
  operation:'created'|'updated'|'deleted',
  record:Record<string,unknown>|null,prior:Record<string,unknown>|null,
  phase?:'before-save'|'after-save'
)=>Promise<Record<string,unknown>|void>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roundDecimal=(value:number,scale:number)=>{
  const [mantissa,exponentText]=value.toString().toLowerCase().split('e');
  const exponent=exponentText?Number(exponentText):0;
  const negative=mantissa.startsWith('-');
  const unsigned=negative?mantissa.slice(1):mantissa;
  const [whole,fraction='']=unsigned.split('.');
  let units=BigInt(whole+fraction);
  const decimalShift=exponent-fraction.length+scale;
  if(decimalShift>=0)units*=10n**BigInt(decimalShift);
  else{
    const divisor=10n**BigInt(-decimalShift);
    const remainder=units%divisor;
    units/=divisor;
    if(remainder*2n>=divisor)units++;
  }
  const digits=units.toString().padStart(scale+1,'0');
  const decimal=scale?`${digits.slice(0,-scale)}.${digits.slice(-scale)}`:digits;
  const text=`${negative&&units!==0n?'-':''}${decimal}`;
  return {text,value:Number(text),units};
};
export class RecordEngine {
  private recordTrigger?:RecordTriggerHandler;
  constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine) {}
  setRecordTriggerHandler(handler:RecordTriggerHandler) {
    this.recordTrigger=handler;
  }
  private async fields(tenantId:string,objectApi:string,client?:PoolClient):Promise<FieldDefinition[]> {
    const {rows}=await (client??this.db).query<FieldDefinition>(
      `SELECT api_name,data_type,related_object,relationship_type,allow_reparenting,required,max_length,precision,scale,is_unique,external_id,
       formula_expression,formula_return_type,
        case_sensitive,default_value,auto_number_format,picklist_restricted,
        rollup_child_object,rollup_relationship_field,rollup_operation,rollup_source_field,
        (SELECT d.controller_field_api FROM md_field_dependencies d
         WHERE d.tenant_id=md_field_definitions.tenant_id AND d.object_api=md_field_definitions.object_api
           AND d.field_api=md_field_definitions.api_name) AS controller_field_api_name
       FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND deleted_at IS NULL`,
      [tenantId,objectApi]);
    return rows;
  }
  private async rollupParents(client:PoolClient,tenantId:string,childObject:string,recordId:string) {
    const {rows}=await client.query<{
      parent_object:string;relationship_field:string;
    }>(`SELECT object_api AS parent_object,rollup_relationship_field AS relationship_field
      FROM md_field_definitions WHERE tenant_id=$1 AND data_type='rollup'
        AND rollup_child_object=$2 AND deleted_at IS NULL`,
    [tenantId,childObject]);
    const parents=new Map<string,Set<string>>();
    const configs=rows.filter(config=>typeof config.parent_object==='string'
      &&typeof config.relationship_field==='string');
    if(!configs.length)return parents;
    const fields=[...new Set(configs.map(config=>config.relationship_field))];
    const values=await client.query<{field_api:string;reference_record_id:string|null}>(
      `SELECT field_api,reference_record_id FROM md_record_values
       WHERE tenant_id=$1 AND object_api=$2 AND record_id=$3 AND field_api=ANY($4::text[])`,
      [tenantId,childObject,recordId,fields]);
    const parentForField=new Map(configs.map(config=>[config.relationship_field,config.parent_object]));
    for(const value of values.rows){
      const parentObject=parentForField.get(value.field_api);
      if(!parentObject||!value.reference_record_id)continue;
      const ids=parents.get(parentObject)??new Set<string>();
      ids.add(value.reference_record_id);parents.set(parentObject,ids);
    }
    return parents;
  }
  private async refreshRollups(client:PoolClient,tenantId:string,childObject:string,
    parentIds:Map<string,Set<string>>,visited=new Set<string>(),depth=0) {
    if(!parentIds.size)return;
    if(depth>50)throw new Error('Roll-Up Summary nesting limit exceeded');
    const {rows}=await client.query<{
      parent_object:string;field_api:string;relationship_field:string;operation:string;source_field:string|null;
    }>(`SELECT object_api AS parent_object,api_name AS field_api,
        rollup_relationship_field AS relationship_field,rollup_operation AS operation,
        rollup_source_field AS source_field
      FROM md_field_definitions WHERE tenant_id=$1 AND data_type='rollup'
        AND rollup_child_object=$2 AND deleted_at IS NULL`,
    [tenantId,childObject]);
    const rollups=rows.filter(rollup=>typeof rollup.parent_object==='string'
      &&typeof rollup.field_api==='string'&&typeof rollup.relationship_field==='string'
      &&typeof rollup.operation==='string');
    for(const rollup of rollups){
      for(const parentId of parentIds.get(rollup.parent_object)??[]){
        const operation=rollup.operation.toUpperCase();
        if(!['COUNT','SUM','MIN','MAX'].includes(operation))
          throw new Error('Invalid roll-up summary operation');
        if(operation!=='COUNT'&&!rollup.source_field)
          throw new Error('Roll-up summary source field is required');
        const aggregate=operation==='COUNT'?'count(*)::text':
          `${operation.toLowerCase()}(CASE WHEN sv.value_text ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN sv.value_text::numeric END)::text`;
        const parentParameter=operation==='COUNT'?'$4':'$5';
        const result=await client.query<{value:string|null}>(`
          SELECT COALESCE(${aggregate},'0') AS value
          FROM md_records c
          JOIN md_record_values rel ON rel.tenant_id=c.tenant_id AND rel.record_id=c.id
            AND rel.object_api=c.object_api AND rel.field_api=$3
          ${operation==='COUNT'?'':`LEFT JOIN md_record_values sv
            ON sv.tenant_id=c.tenant_id AND sv.record_id=c.id AND sv.object_api=c.object_api
              AND sv.field_api=$4`}
          WHERE c.tenant_id=$1 AND c.object_api=$2 AND rel.reference_record_id=${parentParameter}
        `,operation==='COUNT'
          ?[tenantId,childObject,rollup.relationship_field,parentId]
          :[tenantId,childObject,rollup.relationship_field,rollup.source_field,parentId]);
        await client.query(`INSERT INTO md_record_values
          (tenant_id,record_id,object_api,field_api,value_text,reference_record_id,is_unique,case_sensitive,value_number)
          VALUES($1,$2,$3,$4,$5,NULL,false,false,$5::numeric)
          ON CONFLICT(tenant_id,record_id,field_api) DO UPDATE SET value_text=EXCLUDED.value_text,
            reference_record_id=NULL,geo_latitude=NULL,geo_longitude=NULL,address_street=NULL,
            address_city=NULL,address_state=NULL,address_postal_code=NULL,address_country=NULL,
            value_number=EXCLUDED.value_number,value_date=NULL,value_datetime=NULL,value_boolean=NULL`,
        [tenantId,parentId,rollup.parent_object,rollup.field_api,result.rows[0]?.value??'0']);
        await client.query('UPDATE md_records SET updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
          [tenantId,rollup.parent_object,parentId]);
      }
    }
    const ancestorsByChild=new Map<string,Map<string,Set<string>>>();
    for(const [parentObject,ids] of parentIds)for(const parentId of ids){
      const visitKey=JSON.stringify([childObject,parentObject,parentId]);
      if(visited.has(visitKey))continue;
      visited.add(visitKey);
      const higher=await this.rollupParents(client,tenantId,parentObject,parentId);
      for(const [ancestorObject,ancestorIds] of higher){
        const ancestors=ancestorsByChild.get(parentObject)??new Map<string,Set<string>>();
        const collected=ancestors.get(ancestorObject)??new Set<string>();
        for(const ancestorId of ancestorIds)collected.add(ancestorId);
        ancestors.set(ancestorObject,collected);
        ancestorsByChild.set(parentObject,ancestors);
      }
    }
    for(const [parentObject,ancestors] of ancestorsByChild)
      await this.refreshRollups(client,tenantId,parentObject,ancestors,visited,depth+1);
  }
  private async applyFormulaFields(tenantId:string,userId:string,objectApi:string,
    record:Record<string,unknown>,definitions:readonly FieldDefinition[]) {
    const formulas=new Map(definitions.filter(field=>field.data_type==='formula'
      &&typeof field.formula_expression==='string').map(field=>[field.api_name,field]));
    const calculated=new Map<string,unknown>();
    const calculating=new Set<string>();
    const referenceCache=new Map<string,unknown>();
    const visible=new Map<string,boolean>();
    const canRead=async(targetObject:string,fieldApi:string)=>{
      const key=targetObject+'.'+fieldApi;
      if(!visible.has(key))visible.set(key,await this.rbac.allowed(tenantId,userId,key,'read'));
      return visible.get(key)===true;
    };
    const fetchCrossReference=async(targetObject:string,fieldApi:string)=>{
      const key=targetObject+'.'+fieldApi;
      if(referenceCache.has(key))return;
      const relationship=definitions.find(field=>field.data_type==='reference'
        &&field.related_object===targetObject);
      const recordId=relationship?record[relationship.api_name]:undefined;
      if(!relationship||typeof recordId!=='string'
        ||!await canRead(objectApi,relationship.api_name)||!await canRead(targetObject,fieldApi)){
        referenceCache.set(key,null);return;
      }
      const result=await this.db.query<{
        value_text:string|null;reference_record_id:string|null;data_type:string|null;
      }>(`SELECT v.value_text,v.reference_record_id,f.data_type
        FROM md_records r
        LEFT JOIN md_record_values v ON v.tenant_id=r.tenant_id AND v.record_id=r.id
          AND v.object_api=r.object_api AND v.field_api=$4
        LEFT JOIN md_field_definitions f ON f.tenant_id=v.tenant_id AND f.object_api=v.object_api
          AND f.api_name=v.field_api AND f.deleted_at IS NULL
        WHERE r.tenant_id=$1 AND r.object_api=$2 AND r.id=$3
          AND md_record_access($1,$5,r.id,'read')`,
      [tenantId,targetObject,recordId,fieldApi,userId]);
      const row=result.rows[0];
      const value=!row?null:row.reference_record_id??row.value_text;
      referenceCache.set(key,value===null?null:
        ['number','currency','percent'].includes(String(row?.data_type))?Number(value):
          row?.data_type==='boolean'?value==='true':value);
    };
    const calculate=async(field:FieldDefinition):Promise<unknown>=>{
      if(calculated.has(field.api_name))return calculated.get(field.api_name);
      if(calculating.has(field.api_name))throw new Error('Cyclic formula dependency: '+field.api_name);
      calculating.add(field.api_name);
      const refs=[...field.formula_expression!.matchAll(/@([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)/g)];
      for(const [,targetObject,fieldApi] of refs){
        if(targetObject===objectApi){
          if(!await canRead(objectApi,fieldApi)){calculating.delete(field.api_name);return null;}
          const dependency=formulas.get(fieldApi);
          if(dependency)await calculate(dependency);
        }
        if(targetObject!==objectApi){
          const relationship=definitions.find(item=>item.data_type==='reference'&&item.related_object===targetObject);
          if(!relationship||!await canRead(objectApi,relationship.api_name)
            ||!await canRead(targetObject,fieldApi)){
            calculating.delete(field.api_name);return null;
          }
          await fetchCrossReference(targetObject,fieldApi);
        }
      }
      validateFlowFormula(field.formula_expression!);
      const result=evaluateFlowFormula(field.formula_expression!,name=>{
        const parts=/^([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(name);
        if(!parts)return record[name]??null;
        if(parts[1]===objectApi)
          return calculated.has(parts[2])?calculated.get(parts[2]):record[parts[2]]??null;
        return referenceCache.get(parts[1]+'.'+parts[2])??null;
      });
      calculating.delete(field.api_name);
      calculated.set(field.api_name,result);
      return result;
    };
    for(const field of formulas.values()){
      if(!await canRead(objectApi,field.api_name))continue;
      const value=await calculate(field);
      const returnType=field.formula_return_type?.toLowerCase();
      if(['number','currency','percent'].includes(String(returnType))){
        const number=Number(value);
        if(value!==null&&!Number.isFinite(number))throw new Error('Formula did not return a finite number: '+field.api_name);
        record[field.api_name]=value===null?null:number;
      }else if(returnType==='checkbox'){
        if(value!==null&&typeof value!=='boolean')throw new Error('Formula did not return a checkbox value: '+field.api_name);
        record[field.api_name]=value;
      }else if(returnType==='date'){
        const date=value===null?null:String(value);
        if(date!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(date))
          throw new Error('Formula did not return a date value: '+field.api_name);
        record[field.api_name]=date;
      }else record[field.api_name]=value===null?null:String(value);
    }
  }
  private async prepare(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>,creating:boolean,client?:PoolClient,recordId?:string,deferRequired=false) {
    if(Object.getPrototypeOf(values)!==Object.prototype && Object.getPrototypeOf(values)!==null) throw new Error('Invalid record');
    const definitions=await this.fields(tenantId,objectApi,client);
    const fields=new Map(definitions.map(f=>[f.api_name,f]));
    const inputValues={...values};
    if(creating)for(const field of definitions){
      if(inputValues[field.api_name]===undefined&&field.default_value!==null)
        inputValues[field.api_name]=['number','currency','percent'].includes(field.data_type)
          ?Number(field.default_value):field.data_type==='boolean'?field.default_value==='true':field.default_value;
    }
    if(creating&&!deferRequired) for(const field of definitions)
      if(field.required&&!['formula','autonumber'].includes(field.data_type)
        &&field.api_name!=='OwnerId'&&(inputValues[field.api_name]===undefined||inputValues[field.api_name]===null))
        throw new Error('Required field missing: '+field.api_name);
    const prepared=new Map<string,Storable>();
    for(const [key,value] of Object.entries(inputValues)) {
      if(key==='OwnerId'){
        if(typeof value!=='string'||!uuid.test(value))throw Error('Invalid record owner');
        await this.rbac.require(tenantId,userId,objectApi+'.OwnerId',creating?'create':'edit');
        const target=await (client??this.db).query<{id:string;queue:boolean}>(
          "SELECT id,false AS queue FROM md_users WHERE tenant_id=$1 AND id=$2 AND enabled=true UNION ALL SELECT queue_id,true AS queue FROM md_queue_objects WHERE tenant_id=$1 AND queue_id=$2 AND object_api=$3",
          [tenantId,value,objectApi]);
        if(!target.rows[0])throw Error('Record owner not found');
        prepared.set('__OwnerId__',{value_text:value,reference_record_id:null,is_unique:false,case_sensitive:false});
        prepared.set('__OwnerQueue__',{value_text:String(target.rows[0].queue),reference_record_id:null,is_unique:false,case_sensitive:false});
        continue;
      }
      if(key==='RecordTypeId'){
        if(typeof value!=='string'||value.length>128)throw new Error('Invalid record type');
        const {rows}=await (client??this.db).query(
          'SELECT 1 FROM md_object_record_types WHERE tenant_id=$1 AND object_api=$2 AND record_type_id=$3 AND active=true',
          [tenantId,objectApi,value]);
        if(!rows.length)throw new Error('Invalid record type');
        await this.rbac.require(tenantId,userId,'RecordType:'+objectApi+'.'+value,'read');
        prepared.set('__RecordTypeId__',{value_text:value,reference_record_id:null,is_unique:false,case_sensitive:false});
        continue;
      }
      const field=fields.get(key);
      if(!field) throw new Error('Unknown field: '+key);
      if(field.data_type==='formula'||field.data_type==='autonumber'||field.data_type==='rollup')
        throw new Error('Field is read-only: '+key);
      await this.rbac.require(tenantId,userId,objectApi+'.'+key,creating?'create':'edit');
      const metadata={is_unique:field.is_unique||field.external_id,case_sensitive:field.case_sensitive};
      if(value===null) {
        if(field.required&&!deferRequired)throw new Error('Required field cannot be null: '+key);
        prepared.set(key,{value_text:null,reference_record_id:null,
          ...(field.data_type==='multipicklist'?{multi_values:[]}:{}),...metadata});
        continue;
      }
      let text:string,reference:string|null=null;
      switch(field.data_type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'url':
        case 'textarea':
        case 'longtext':
        case 'richtext':
        case 'picklist':
        case 'multipicklist':
          if(typeof value!=='string')throw new Error('Invalid text field: '+key);
          if(field.max_length!==null&&field.max_length!==undefined&&value.length>field.max_length)
            throw new Error('Invalid text length: '+key);
          if(field.data_type==='phone'&&(value.length>40||!/\d/.test(value)
            ||!/^\+?[0-9().\-\s]*(?:\s*(?:x|ext\.?|#)\s*\d+)?$/i.test(value)))
            throw new Error('Invalid phone field: '+key);
          if(field.data_type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
            throw new Error('Invalid email field: '+key);
          if(field.data_type==='url'&& !/^https?:\/\/[^\s]+$/i.test(value))
            throw new Error('Invalid URL field: '+key);
          if(['picklist','multipicklist'].includes(field.data_type)&&field.picklist_restricted!==false){
            const selected=field.data_type==='multipicklist'?value.split(';'):[value];
            if(new Set(selected).size!==selected.length||selected.some(item=>!item))
              throw new Error('Invalid picklist value: '+key);
            for(const item of selected){
              const allowed=await (client??this.db).query(
                'SELECT 1 FROM md_field_picklist_values WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3 AND value=$4',
                [tenantId,objectApi,key,item]);
              if(!allowed.rowCount)throw new Error('Invalid picklist value: '+key);
            }
          }
          text=field.data_type==='richtext'?sanitizeHtml(value):value;
          if(field.data_type==='richtext'&&field.max_length!==null&&field.max_length!==undefined
            &&text.length>field.max_length)
            throw new Error('Invalid text length: '+key);
          break;
        case 'time': {
          if(typeof value!=='string')throw new Error('Invalid time field: '+key);
          const match=/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
          if(!match)throw new Error('Invalid time field: '+key);
          text=`${match[1]}:${match[2]}:${match[3]??'00'}.${(match[4]??'').padEnd(3,'0')}`;
          break;
        }
        case 'currency':
        case 'percent':
        case 'number':
          if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Invalid number field: '+key);
          let normalized=value;
          if(field.precision!==null&&field.precision!==undefined){
            const scale=field.scale??0;
            const rounded=roundDecimal(value,scale);
            if(!Number.isFinite(rounded.value)||rounded.units>=10n**BigInt(field.precision)
              ||rounded.units<0n)
              throw new Error('Number exceeds field precision or scale: '+key);
            normalized=rounded.value;
            text=rounded.text;
          } else text=String(value);
          if(field.precision===null||field.precision===undefined)text=String(normalized);
          break;
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
          if(recordId&&field.relationship_type==='Master-Detail'&&!field.allow_reparenting){
            const previous=await (client??this.db).query<{reference_record_id:string|null}>(
              'SELECT reference_record_id FROM md_record_values WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3',
              [tenantId,recordId,key]);
            if(previous.rows[0]?.reference_record_id&&previous.rows[0].reference_record_id!==value)
              throw new Error('Master-Detail relationship does not allow reparenting: '+key);
          }
          { const match=await (client??this.db).query('SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
            [tenantId,field.related_object,value]);
            if(!match.rowCount)throw new Error('Invalid relationship target: '+key); }
          text='';reference=value;break;
        case 'geolocation': {
          if(!value||typeof value!=='object'||Array.isArray(value))
            throw new Error('Invalid geolocation field: '+key);
          const coordinates=value as Record<string,unknown>;
          const latitude=coordinates.latitude,longitude=coordinates.longitude;
          const validLatitude=latitude===null||(typeof latitude==='number'&&Number.isFinite(latitude)&&latitude>=-90&&latitude<=90);
          const validLongitude=longitude===null||(typeof longitude==='number'&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180);
          if(!validLatitude||!validLongitude||(field.required&&(latitude===null||longitude===null)))
            throw new Error('Invalid geolocation field: '+key);
          text='';
          prepared.set(key,{value_text:null,reference_record_id:null,
            geo_latitude:latitude as number|null,geo_longitude:longitude as number|null,...metadata});
          continue;
        }
        case 'address': {
          if(!value||typeof value!=='object'||Array.isArray(value)
            ||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))
            throw new Error('Invalid address field: '+key);
          const address=value as Record<string,unknown>;
          const limits:Record<string,number>={street:255,city:40,state:80,postalCode:20,country:80};
          const normalized:Record<string,string|null>={};
          for(const [component,limit] of Object.entries(limits)){
            const componentValue=address[component];
            if(componentValue!==undefined&&componentValue!==null
              &&(typeof componentValue!=='string'||componentValue.length>limit))
              throw new Error('Invalid address component: '+component);
            normalized[component]=typeof componentValue==='string'&&componentValue.trim()
              ?componentValue.trim():null;
          }
          if(Object.keys(address).some(component=>!Object.hasOwn(limits,component)))
            throw new Error('Invalid address component');
          if(field.required&&!Object.values(normalized).some(Boolean))
            throw new Error('Required address field is empty: '+key);
          prepared.set(key,{value_text:null,reference_record_id:null,
            address_street:normalized.street,address_city:normalized.city,address_state:normalized.state,
            address_postal_code:normalized.postalCode,address_country:normalized.country,...metadata});
          continue;
        }
        default:throw new Error('Invalid metadata data type: '+field.data_type);
      }
      prepared.set(key,{value_text:reference?null:text,reference_record_id:reference,
        ...(field.data_type==='number'||field.data_type==='currency'||field.data_type==='percent'
          ?{value_number:text}:{}),
        ...(field.data_type==='date'?{value_date:text}:{}),
        ...(field.data_type==='datetime'?{value_datetime:new Date(text)}:{}),
        ...(field.data_type==='boolean'?{value_boolean:value as boolean}:{}),
        ...(field.data_type==='multipicklist'?{multi_values:(value as string).split(';')}:{}),...metadata});
    }
    for(const field of definitions){
      const controllerApi=field.controller_field_api_name;
      if(!controllerApi||(!Object.hasOwn(values,field.api_name)&&!Object.hasOwn(values,controllerApi)))continue;
      let dependentValue=inputValues[field.api_name];
      if(dependentValue===undefined&&recordId){
        const stored=await (client??this.db).query<{value_text:string|null}>(
          'SELECT value_text FROM md_record_values WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3',
          [tenantId,recordId,field.api_name]);
        dependentValue=stored.rows[0]?.value_text;
      }
      if(dependentValue===undefined||dependentValue===null)continue;
      let controllerValue=inputValues[controllerApi];
      if(controllerValue===undefined&&recordId){
        const stored=await (client??this.db).query<{value_text:string|null}>(
          'SELECT value_text FROM md_record_values WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3',
          [tenantId,recordId,controllerApi]);
        controllerValue=stored.rows[0]?.value_text;
      }
      if(typeof controllerValue==='boolean')controllerValue=String(controllerValue);
      if(typeof controllerValue!=='string'||typeof dependentValue!=='string')
        throw new Error('Invalid dependent picklist value: '+field.api_name);
      const allowed=await (client??this.db).query<{picklist_value:string}>(
        `SELECT picklist_value FROM md_field_dependency_values
         WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3 AND controller_value=$4
           AND picklist_value=ANY($5::text[])`,
        [tenantId,objectApi,field.api_name,controllerValue,[dependentValue]]);
      if(!allowed.rowCount)throw new Error('Invalid dependent picklist value: '+field.api_name);
    }
    if(creating&&!prepared.has('__RecordTypeId__')){
      const defaults=await (client??this.db).query<{record_type_id:string}>(
        'SELECT record_type_id FROM md_object_record_types WHERE tenant_id=$1 AND object_api=$2 AND active=true AND is_default=true ORDER BY sort_order LIMIT 1',
        [tenantId,objectApi]);
      if(defaults.rows[0]){
        const selected=defaults.rows[0].record_type_id;
        await this.rbac.require(tenantId,userId,'RecordType:'+objectApi+'.'+selected,'read');
        prepared.set('__RecordTypeId__',{value_text:selected,reference_record_id:null,is_unique:false,case_sensitive:false});
      }
    }
    return prepared;
  }
  async create(tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create');
    // Reject invalid input before reserving a transaction connection.
    const prepared=await this.prepare(tenantId,userId,objectApi,values,true,undefined,undefined,Boolean(this.recordTrigger));
    return this.db.transaction(async client=>{
      let rowValues={...values};
      if(this.recordTrigger){
        const defaults=await this.fields(tenantId,objectApi,client);
        rowValues={...Object.fromEntries(defaults.filter(field=>field.default_value!==null)
          .map(field=>[field.api_name,['number','currency','percent'].includes(field.data_type)
            ?Number(field.default_value):field.data_type==='boolean'
              ?field.default_value==='true':field.default_value])),...rowValues};
        rowValues=await this.recordTrigger(client,tenantId,userId,objectApi,'created',
          rowValues,null,'before-save')??rowValues;
      }
      const finalValues=this.recordTrigger
        ?await this.prepare(tenantId,userId,objectApi,rowValues,true,client)
        :prepared;
      const id=await this.insertPrepared(client,tenantId,userId,objectApi,finalValues);
      if(this.recordTrigger){
        const record=await this.get(tenantId,userId,objectApi,id,client);
        await this.recordTrigger(client,tenantId,userId,objectApi,'created',record,null,'after-save');
      }
      return id;
    });
  }
  /** All Flow record mutations share one transaction, including relationship checks. */
  async createInTransaction(client:PoolClient,tenantId:string,userId:string,objectApi:string,values:Record<string,unknown>) {
    await this.rbac.require(tenantId,userId,objectApi,'create');
    const prepared=await this.prepare(tenantId,userId,objectApi,values,true,client);
    return this.insertPrepared(client,tenantId,userId,objectApi,prepared);
  }
  /** Shared, atomic CSV/Data Loader import: new records or explicitly selected existing IDs. */
  async importRecords(tenantId:string,userId:string,objectApi:string,records:unknown) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi) || objectApi==='User')
      throw new Error('Invalid import object');
    if(!Array.isArray(records)||records.length===0||records.length>200)
      throw new Error('Invalid import batch size (1-200 records)');
    const ids=new Set<string>();
    const updates=records.map((item:unknown)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)
        ||(Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null))
        throw new Error('Invalid import record');
      const data=item as Record<string,unknown>;
      const id=data.Id;
      if(id!==undefined&&(!('Id' in data)||typeof id!=='string'||!uuid.test(id)))
        throw new Error('Invalid import record ID');
      if(typeof id==='string'){
        if(ids.has(id.toLowerCase()))throw new Error('Duplicate import record ID');
        ids.add(id.toLowerCase());
      }
      const values=Object.fromEntries(Object.entries(data).filter(([key])=>key!=='Id'));
      if(!Object.keys(values).length)throw new Error('Invalid import record without fields');
      return {id,values};
    });
    const mode=updates.every(item=>typeof item.id==='string')?'update'
      :updates.every(item=>item.id===undefined)?'create':null;
    if(!mode)throw new Error('Invalid import batch: cannot mix creates and updates');
    await this.db.transaction(async client=>{
      for(const item of updates){
        if(mode==='update')
          await this.updateInTransaction(client,tenantId,userId,objectApi,item.id as string,item.values);
        else
          await this.createInTransaction(client,tenantId,userId,objectApi,item.values);
      }
    });
    return {count:updates.length,mode};
  }
  private async insertPrepared(client:PoolClient,tenantId:string,userId:string,objectApi:string,prepared:Map<string,Storable>) {
    const selectedType=prepared.get('__RecordTypeId__')?.value_text??null;
    const selectedOwner=prepared.get('__OwnerId__')?.value_text??userId,queue=prepared.get('__OwnerQueue__')?.value_text==='true';
    const {rows}=await client.query<{id:string}>(
      'INSERT INTO md_records (tenant_id,object_api,record_type_id,owner_id,owner_queue_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [tenantId,objectApi,selectedType,queue?null:selectedOwner,queue?selectedOwner:null]);
    const autoFields=await client.query<{api_name:string;auto_number_format:string|null;is_unique:boolean;external_id:boolean;case_sensitive:boolean}>(
      `SELECT api_name,auto_number_format,is_unique,external_id,case_sensitive FROM md_field_definitions
       WHERE tenant_id=$1 AND object_api=$2 AND data_type='autonumber' AND deleted_at IS NULL`,[tenantId,objectApi]);
    const rollupFields=await client.query<{api_name:string}>(
      `SELECT api_name FROM md_field_definitions
       WHERE tenant_id=$1 AND object_api=$2 AND data_type='rollup' AND deleted_at IS NULL`,
      [tenantId,objectApi]);
    for(const field of rollupFields.rows)if(typeof field.api_name==='string')
      prepared.set(field.api_name,{value_text:'0',reference_record_id:null,value_number:'0',is_unique:false,case_sensitive:false});
    for(const field of autoFields.rows){
      if(typeof field.api_name!=='string')continue;
      if(prepared.has(field.api_name))continue;
      const counter=await client.query<{sequence:string}>(`INSERT INTO md_auto_number_counters
        (tenant_id,object_api,field_api,next_value) VALUES($1,$2,$3,2)
        ON CONFLICT(tenant_id,object_api,field_api)
        DO UPDATE SET next_value=md_auto_number_counters.next_value+1
        RETURNING (next_value-1)::text AS sequence`,[tenantId,objectApi,field.api_name]);
      const sequence=counter.rows[0]?.sequence;
      if(!sequence)throw new Error('Unable to allocate auto-number value');
      const format=field.auto_number_format??'{000000}';
      const numberPattern=/\{(0+)\}/;
      const token=numberPattern.exec(format);
      const value=(token?format.replace(numberPattern,sequence.padStart(token[1].length,'0')):sequence)
        .replace(/\{YYYY\}/g,String(new Date().getUTCFullYear()));
      prepared.set(field.api_name,{value_text:value,reference_record_id:null,
        is_unique:field.is_unique||field.external_id,case_sensitive:field.case_sensitive});
    }
    for(const [field,value] of prepared){if(field.startsWith('__'))continue;await client.query(
      `INSERT INTO md_record_values
        (tenant_id,record_id,object_api,field_api,value_text,reference_record_id,is_unique,case_sensitive,
         geo_latitude,geo_longitude,address_street,address_city,address_state,address_postal_code,address_country,
         value_number,value_date,value_datetime,value_boolean)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [tenantId,rows[0].id,objectApi,field,value.value_text,value.reference_record_id,
        value.is_unique,value.case_sensitive,value.geo_latitude??null,value.geo_longitude??null,
        value.address_street??null,value.address_city??null,value.address_state??null,
        value.address_postal_code??null,value.address_country??null,value.value_number??null,
        value.value_date??null,value.value_datetime??null,value.value_boolean??null]);
      if(value.multi_values)for(const [sortOrder,multiValue] of value.multi_values.entries())
        await client.query(`INSERT INTO md_record_multi_values
          (tenant_id,record_id,object_api,field_api,value,sort_order) VALUES($1,$2,$3,$4,$5,$6)`,
        [tenantId,rows[0].id,objectApi,field,multiValue,sortOrder]);
    }
    const parents=await this.rollupParents(client,tenantId,objectApi,rows[0].id);
    await this.refreshRollups(client,tenantId,objectApi,parents);
    return rows[0].id;
  }
  async list(tenantId:string,userId:string,objectApi:string,limit=50,offset=0,
    options:{sortField?:string;sortDirection?:'asc'|'desc';search?:string;filterField?:string;
      filterValue?:string;filterOperator?:'Equals'|'Includes'|'Excludes'}={}) {
    await this.rbac.require(tenantId,userId,objectApi,'read');
    const pageSize=Math.min(Math.max(limit,1),100),start=Math.max(offset,0);
    const definitions=await this.fields(tenantId,objectApi);
    const byApi=new Map(definitions.map(field=>[field.api_name,field]));
    const fieldFor=(name:string|undefined)=>{
      if(name===undefined)return undefined;
      if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))throw new Error('Invalid list field');
      const field=byApi.get(name);
      if(!field||field.data_type==='formula'||field.data_type==='geolocation'||field.data_type==='address')
        throw new Error('Invalid list field');
      return field;
    };
    const sortField=fieldFor(options.sortField);
    const filterField=fieldFor(options.filterField);
    const search=options.search?.trim().slice(0,256)??'';
    const filterValue=options.filterValue;
    const filterOperator=options.filterOperator??'Equals';
    if(!['Equals','Includes','Excludes'].includes(filterOperator)
      ||(filterOperator!=='Equals'&&filterField?.data_type!=='multipicklist'))
      throw new Error('Invalid record list filter operator');
    const multiValues=filterField?.data_type==='multipicklist'&&filterOperator!=='Equals'
      ?filterValue?.split(';'):undefined;
    if(multiValues&&(multiValues.some(value=>!value||value.length>512)
      ||multiValues.length>200||new Set(multiValues).size!==multiValues.length))
      throw new Error('Invalid multi-select list filter');
    if(multiValues){
      const configured=await this.db.query<{value:string}>(
        'SELECT value FROM md_field_picklist_values WHERE tenant_id=$1 AND object_api=$2 AND field_api=$3',
        [tenantId,objectApi,filterField?.api_name]);
      if(multiValues.some(value=>!configured.rows.some(option=>option.value===value)))
        throw new Error('Invalid multi-select list filter');
    }
    if(options.sortDirection!==undefined&&!['asc','desc'].includes(options.sortDirection))
      throw new Error('Invalid sort direction');
    const readable=new Map<string,boolean>();
    const canRead=async(fieldApi:string)=>{
      if(!readable.has(fieldApi))readable.set(fieldApi,
        await this.rbac.allowed(tenantId,userId,objectApi+'.'+fieldApi,'read'));
      return readable.get(fieldApi)===true;
    };
    if(sortField&&!await canRead(sortField.api_name))throw new Error('Field is not readable');
    if(filterField&&!await canRead(filterField.api_name))throw new Error('Field is not readable');
    const searchFields:string[]=[];
    if(search)for(const field of definitions)
      if(field.data_type!=='formula'&&field.data_type!=='geolocation'&&field.data_type!=='address'&&await canRead(field.api_name))
        searchFields.push(field.api_name);
    const predicates:string[]=[];
    const conditionParams:unknown[]=[];
    if(filterField&&filterValue!==undefined){
      conditionParams.push(filterField.api_name);
      const fieldParam='$'+(3+conditionParams.length);
      conditionParams.push(filterValue);
      const valueParam='$'+(3+conditionParams.length);
      if(filterOperator!=='Equals'&&filterField.data_type==='multipicklist'){
        conditionParams[conditionParams.length-1]=multiValues;
        const membership=`COALESCE((SELECT array_agg(mv.value ORDER BY mv.sort_order)
          FROM md_record_multi_values mv WHERE mv.tenant_id=r.tenant_id AND mv.record_id=r.id
            AND mv.object_api=r.object_api AND mv.field_api=${fieldParam}),ARRAY[]::text[]) @> ${valueParam}::text[]`;
        predicates.push(filterOperator==='Includes'
          ?membership
          :`NOT (${membership})`);
      }else if(['number','currency','percent'].includes(filterField.data_type)){
        if(!/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(filterValue))
          throw new Error('Invalid numeric list filter');
        predicates.push(`EXISTS(SELECT 1 FROM md_record_values fv
          WHERE fv.tenant_id=r.tenant_id AND fv.record_id=r.id AND fv.object_api=r.object_api
            AND fv.field_api=${fieldParam}
            AND fv.value_text ~ '^-?[0-9]+(\\.[0-9]+)?$'
            AND fv.value_text::numeric=${valueParam}::numeric)`);
      }else predicates.push(`EXISTS(SELECT 1 FROM md_record_values fv
        WHERE fv.tenant_id=r.tenant_id AND fv.record_id=r.id AND fv.object_api=r.object_api
          AND fv.field_api=${fieldParam}
          AND COALESCE(fv.value_text,fv.reference_record_id::text)=${valueParam})`);
    }
    if(search){
      conditionParams.push(searchFields);
      const fieldsParam='$'+(3+conditionParams.length);
      conditionParams.push(search);
      const searchParam='$'+(3+conditionParams.length);
      predicates.push(`EXISTS(SELECT 1 FROM md_record_values qv
        WHERE qv.tenant_id=r.tenant_id AND qv.record_id=r.id AND qv.object_api=r.object_api
          AND qv.field_api=ANY(${fieldsParam}::text[])
          AND strpos(lower(COALESCE(qv.value_text,qv.reference_record_id::text,'')),lower(${searchParam}))>0)`);
    }
    const where=predicates.length?' AND '+predicates.join(' AND '):'';
    const count=await this.db.query<{total:string}>(`
      SELECT count(*)::text AS total FROM md_records r
      WHERE r.tenant_id=$1 AND r.object_api=$2 AND md_record_access($1,$3,r.id,'read')${where}
    `,[tenantId,objectApi,userId,...conditionParams]);
    const params:unknown[]=[tenantId,objectApi,userId,...conditionParams];
    let orderBy='r.created_at ASC,r.id ASC';
    let sortSelection='NULL::text AS sort_value';
    let resultOrder='r.created_at,r.id,v.field_api';
    let sortJoin='';
    if(sortField){
      params.push(sortField.api_name);
      sortJoin=`LEFT JOIN md_record_values sv ON sv.tenant_id=r.tenant_id AND sv.record_id=r.id
        AND sv.object_api=r.object_api AND sv.field_api=$${params.length}`;
      const direction=options.sortDirection==='desc'?'DESC':'ASC';
      const sortValue=['number','currency','percent'].includes(sortField.data_type)
        ?`CASE WHEN sv.value_text ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN sv.value_text::numeric END`
        :sortField.data_type==='reference'?'sv.reference_record_id::text'
          :sortField.data_type==='boolean'?'sv.value_text'
            :'lower(COALESCE(sv.value_text,sv.reference_record_id::text))';
      sortSelection=`${sortValue} AS sort_value`;
      orderBy=`${sortValue} ${direction} NULLS LAST,r.created_at ASC,r.id ASC`;
      resultOrder=`r.sort_value ${direction} NULLS LAST,r.created_at ASC,r.id ASC,v.field_api`;
    }
    params.push(pageSize,start);
    const limitParam=params.length-1,offsetParam=params.length;
    const {rows}=await this.db.query<{
      id:string;created_at:Date;updated_at:Date;owner_id:string|null;record_type_id:string|null;
      field_api:string|null;value_text:string|null;reference_record_id:string|null;data_type:string|null;
      value_number:string|null;value_date:string|null;value_datetime:Date|null;value_boolean:boolean|null;
      geo_latitude:number|null;geo_longitude:number|null;address_street:string|null;address_city:string|null;
      address_state:string|null;address_postal_code:string|null;address_country:string|null
    }>(`
      WITH selected AS (
        SELECT r.id,r.created_at,r.updated_at,COALESCE(r.owner_id,r.owner_queue_id) AS owner_id,
          r.record_type_id,${sortSelection}
        FROM md_records r ${sortJoin}
        WHERE r.tenant_id=$1 AND r.object_api=$2 AND md_record_access($1,$3,r.id,'read')${where}
        ORDER BY ${orderBy} LIMIT $${limitParam} OFFSET $${offsetParam}
      )
      SELECT r.id,r.created_at,r.updated_at,r.owner_id,r.record_type_id,v.field_api,v.value_text,v.reference_record_id,
        v.value_number,v.value_date,v.value_datetime,v.value_boolean,
        v.geo_latitude,v.geo_longitude,v.address_street,v.address_city,v.address_state,v.address_postal_code,
        v.address_country,f.data_type
      FROM selected r
      LEFT JOIN md_record_values v ON v.tenant_id=$1 AND v.record_id=r.id AND v.object_api=$2
        AND EXISTS(SELECT 1 FROM md_field_definitions active_field
          WHERE active_field.tenant_id=v.tenant_id AND active_field.object_api=v.object_api
            AND active_field.api_name=v.field_api AND active_field.deleted_at IS NULL)
      LEFT JOIN md_field_definitions f ON f.tenant_id=$1 AND f.object_api=$2 AND f.api_name=v.field_api
        AND f.deleted_at IS NULL
      ORDER BY ${resultOrder}
    `,params);
    const collected=new Map<string,Record<string,unknown>>();
    const allowed=new Map<string,boolean>();
    for(const row of rows) {
      if(!collected.has(row.id))collected.set(row.id,{Id:row.id,CreatedAt:row.created_at,LastModifiedDate:row.updated_at,OwnerId:row.owner_id,RecordTypeId:row.record_type_id});
      if(!row.field_api||row.field_api==='OwnerId')continue;
      if(!allowed.has(row.field_api))allowed.set(row.field_api,await canRead(row.field_api));
      if(!allowed.get(row.field_api))continue;
      const value=row.reference_record_id??row.value_text;
      collected.get(row.id)![row.field_api]=row.data_type==='geolocation'
        ?row.geo_latitude===null&&row.geo_longitude===null?null:{latitude:row.geo_latitude,longitude:row.geo_longitude}
        :row.data_type==='address'
          ?[row.address_street,row.address_city,row.address_state,row.address_postal_code,row.address_country].every(item=>item===null)
            ?null:{street:row.address_street,city:row.address_city,state:row.address_state,postalCode:row.address_postal_code,country:row.address_country}
        :value===null?null:
        ['number','currency','percent','rollup'].includes(String(row.data_type))?Number(row.value_number??value):
        row.data_type==='boolean'?(row.value_boolean??value==='true'):
        row.data_type==='date'?(row.value_date??value):
        row.data_type==='datetime'?(row.value_datetime?new Date(row.value_datetime).toISOString():value):value;
    }
    const records=[...collected.values()];
    if(definitions.some(field=>field.data_type==='formula'))
      for(const record of records)await this.applyFormulaFields(tenantId,userId,objectApi,record,definitions);
    return {records,total:Number(count.rows[0]?.total??0)};
  }
  /** Typed SQL filtering with existing Object, Field and Record authorization. */
  async filterTyped(tenantId:string,userId:string,objectApi:string,fieldApi:string,
    operator:'eq'|'lt'|'lte'|'gt'|'gte',raw:string,limit=50,direction:'asc'|'desc'='asc') {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))
      throw new Error('Invalid field reference');
    if(!['eq','lt','lte','gt','gte'].includes(operator))throw new Error('Invalid filter operator');
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid record limit');
    if(direction!=='asc'&&direction!=='desc')throw new Error('Invalid sort direction');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    await this.rbac.require(tenantId,userId,objectApi+'.'+fieldApi,'read');
    const {rows:fields}=await this.db.query<{data_type:string}>(
      'SELECT data_type FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3',
      [tenantId,objectApi,fieldApi]);
    const type=fields[0]?.data_type;
    const columns:Record<string,string>={number:'value_number',currency:'value_number',
      percent:'value_number',date:'value_date',datetime:'value_datetime',boolean:'value_boolean'};
    const column=columns[type];
    if(!column)throw new Error('Invalid typed filter field');
    const casts:Record<string,string>={value_number:'numeric',value_date:'date',
      value_datetime:'timestamptz',value_boolean:'boolean'};
    if(column==='value_boolean' && operator!=='eq')throw new Error('Invalid boolean comparison');
    const ops={eq:'=',lt:'<',lte:'<=',gt:'>',gte:'>='} as const;
    const {rows}=await this.db.query<{id:string}>(`
      SELECT r.id FROM md_records r JOIN md_record_values v
        ON v.tenant_id=r.tenant_id AND v.record_id=r.id AND v.object_api=r.object_api
      WHERE r.tenant_id=$1 AND r.object_api=$2 AND v.field_api=$3
        AND v.${column} ${ops[operator]} $4::${casts[column]}
        AND md_record_access($1,$5,r.id,'read')
      ORDER BY v.${column} ${direction==='desc'?'DESC':'ASC'},r.id LIMIT $6
    `,[tenantId,objectApi,fieldApi,raw,userId,limit]);
    return rows.map(row=>row.id);
  }

  /** Numeric aggregation over only records visible to the actor. */
  async aggregateNumeric(tenantId:string,userId:string,objectApi:string,fieldApi:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))
      throw new Error('Invalid field reference');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    await this.rbac.require(tenantId,userId,objectApi+'.'+fieldApi,'read');
    const {rows:fields}=await this.db.query<{data_type:string}>(
      'SELECT data_type FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3',
      [tenantId,objectApi,fieldApi]);
    if(!['number','currency','percent'].includes(fields[0]?.data_type??''))
      throw new Error('Invalid numeric aggregate field');
    const {rows}=await this.db.query<{count:string;sum:string|null;min:string|null;max:string|null;avg:string|null}>(`
      SELECT count(v.value_number)::text AS count,sum(v.value_number)::text AS sum,
        min(v.value_number)::text AS min,max(v.value_number)::text AS max,
        avg(v.value_number)::text AS avg
      FROM md_record_values v JOIN md_records r
        ON r.tenant_id=v.tenant_id AND r.id=v.record_id AND r.object_api=v.object_api
      WHERE v.tenant_id=$1 AND v.object_api=$2 AND v.field_api=$3
        AND md_record_access($1,$4,r.id,'read')`,
      [tenantId,objectApi,fieldApi,userId]);
    return rows[0]??{count:'0',sum:null,min:null,max:null,avg:null};
  }

  /** Single-record read uses the same tenant and field-level grants as list, without pagination. */
  async get(tenantId:string,userId:string,objectApi:string,id:string,client?:PoolClient) {
    if(!uuid.test(id))throw new Error('Invalid record ID');
    await this.rbac.require(tenantId,userId,objectApi,'read');
    const query=client??this.db;
    const {rows}=await query.query<{
      id:string;created_at:Date;updated_at:Date;owner_id:string|null;record_type_id:string|null;
      field_api:string|null;value_text:string|null;reference_record_id:string|null;data_type:string|null;
      value_number:string|null;value_date:string|null;value_datetime:Date|null;value_boolean:boolean|null;
      geo_latitude:number|null;geo_longitude:number|null;address_street:string|null;address_city:string|null;
      address_state:string|null;address_postal_code:string|null;address_country:string|null
    }>(`SELECT r.id,r.created_at,r.updated_at,COALESCE(r.owner_id,r.owner_queue_id) AS owner_id,r.record_type_id,
      v.field_api,v.value_text,v.reference_record_id,f.data_type,v.value_number,v.value_date,v.value_datetime,v.value_boolean,
      v.geo_latitude,v.geo_longitude,v.address_street,v.address_city,v.address_state,v.address_postal_code,v.address_country
      FROM md_records r
      LEFT JOIN md_record_values v ON v.tenant_id=r.tenant_id AND v.record_id=r.id AND v.object_api=r.object_api
        AND EXISTS(SELECT 1 FROM md_field_definitions active_field
          WHERE active_field.tenant_id=v.tenant_id AND active_field.object_api=v.object_api
            AND active_field.api_name=v.field_api AND active_field.deleted_at IS NULL)
      LEFT JOIN md_field_definitions f ON f.tenant_id=r.tenant_id AND f.object_api=r.object_api
        AND f.api_name=v.field_api AND f.deleted_at IS NULL
      WHERE r.tenant_id=$1 AND r.object_api=$2 AND r.id=$3 AND md_record_access($1,$4,r.id,'read') ORDER BY v.field_api`,
    [tenantId,objectApi,id,userId]);
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
      record[row.field_api as string]=row.data_type==='geolocation'
        ?row.geo_latitude===null&&row.geo_longitude===null?null:{latitude:row.geo_latitude,longitude:row.geo_longitude}
        :row.data_type==='address'
          ?[row.address_street,row.address_city,row.address_state,row.address_postal_code,row.address_country].every(item=>item===null)
            ?null:{street:row.address_street,city:row.address_city,state:row.address_state,postalCode:row.address_postal_code,country:row.address_country}
        :val===null?null:
        ['number','currency','percent','rollup'].includes(String(row.data_type))?Number(row.value_number??val):
        row.data_type==='boolean'?(row.value_boolean??val==='true'):
        row.data_type==='date'?(row.value_date??val):
        row.data_type==='datetime'?(row.value_datetime?new Date(row.value_datetime).toISOString():val):val;
    }
    const definitions=await this.fields(tenantId,objectApi,client);
    if(definitions.some(field=>field.data_type==='formula'))
      await this.applyFormulaFields(tenantId,userId,objectApi,record,definitions);
    return record;
  }
  async updateInTransaction(client:PoolClient,tenantId:string,userId:string,objectApi:string,id:string,
    values:Record<string,unknown>,ifUnmodifiedSince?:string) {
    return this.update(tenantId,userId,objectApi,id,values,ifUnmodifiedSince,client);
  }
  async update(tenantId:string,userId:string,objectApi:string,id:string,values:Record<string,unknown>,
    ifUnmodifiedSince?:string,client?:PoolClient) {
    if(!uuid.test(id))throw new Error('Invalid record ID');
    const checkDate=ifUnmodifiedSince?new Date(ifUnmodifiedSince):null;
    if(checkDate&&!Number.isFinite(checkDate.getTime()))throw new Error('Invalid record modification precondition');
    await this.rbac.require(tenantId,userId,objectApi,'edit');
    const prepared=await this.prepare(tenantId,userId,objectApi,values,false,client,id);
    const write=async(transactionClient:PoolClient,writeValues:Map<string,Storable>)=>{
      const found=await transactionClient.query<{updated_at:Date}>("SELECT updated_at FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND md_record_access($1,$4,id,'edit') FOR UPDATE",
        [tenantId,objectApi,id,userId]);
      if(!found.rowCount)throw new Error('Record not found');
      if(checkDate&&new Date(found.rows[0].updated_at).getTime()>checkDate.getTime()+999)
        throw new Error('Record has changed since it was loaded');
      const affectedParents=await this.rollupParents(transactionClient,tenantId,objectApi,id);
      if(writeValues.has('__OwnerId__')){
        const queue=writeValues.get('__OwnerQueue__')?.value_text==='true',owner=writeValues.get('__OwnerId__')?.value_text;
        await transactionClient.query('UPDATE md_records SET owner_id=$4,owner_queue_id=$5 WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
          [tenantId,objectApi,id,queue?null:owner,queue?owner:null]);
      }
      if(writeValues.has('__RecordTypeId__'))await transactionClient.query(
        'UPDATE md_records SET record_type_id=$4,updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
        [tenantId,objectApi,id,writeValues.get('__RecordTypeId__')?.value_text]);
      else await transactionClient.query('UPDATE md_records SET updated_at=now() WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
        [tenantId,objectApi,id]);
      for(const [field,value] of writeValues){
        if(field.startsWith('__'))continue;
        const previous=await transactionClient.query<{value_text:string|null;reference_record_id:string|null;geo_latitude:number|null;geo_longitude:number|null;address_street:string|null;address_city:string|null;address_state:string|null;address_postal_code:string|null;address_country:string|null}>(
          'SELECT value_text,reference_record_id,geo_latitude,geo_longitude,address_street,address_city,address_state,address_postal_code,address_country FROM md_record_values WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3',
          [tenantId,id,field]);
        const before=previous.rows[0]?.reference_record_id??previous.rows[0]?.value_text
          ??(previous.rows[0]?.geo_latitude!==null&&previous.rows[0]?.geo_latitude!==undefined
            ?`${previous.rows[0].geo_latitude},${previous.rows[0].geo_longitude??''}`:null);
        const after=value.reference_record_id??value.value_text
          ??(value.geo_latitude!==undefined?`${value.geo_latitude??''},${value.geo_longitude??''}`:null);
        const oldAddress=value.address_street!==undefined&&previous.rows[0]
          ?[previous.rows[0].address_street,previous.rows[0].address_city,
            previous.rows[0].address_state,previous.rows[0].address_postal_code,previous.rows[0].address_country].join('|')
          :undefined;
        const newAddress=value.address_street!==undefined?[value.address_street,value.address_city,
          value.address_state,value.address_postal_code,value.address_country].join('|'):undefined;
        if(before!==after||oldAddress!==newAddress)await transactionClient.query(
          'INSERT INTO md_record_history(tenant_id,record_id,object_api,field_api,changed_by,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [tenantId,id,objectApi,field,userId,oldAddress??before,newAddress??after]);
      }
      for(const [field,value] of writeValues){if(field.startsWith('__'))continue;await transactionClient.query(`
        INSERT INTO md_record_values
          (tenant_id,record_id,object_api,field_api,value_text,reference_record_id,is_unique,case_sensitive,
           geo_latitude,geo_longitude,address_street,address_city,address_state,address_postal_code,address_country,
           value_number,value_date,value_datetime,value_boolean)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (tenant_id,record_id,field_api)
        DO UPDATE SET value_text=EXCLUDED.value_text,reference_record_id=EXCLUDED.reference_record_id,
          is_unique=EXCLUDED.is_unique,case_sensitive=EXCLUDED.case_sensitive,
          geo_latitude=EXCLUDED.geo_latitude,geo_longitude=EXCLUDED.geo_longitude,
          address_street=EXCLUDED.address_street,address_city=EXCLUDED.address_city,
          address_state=EXCLUDED.address_state,address_postal_code=EXCLUDED.address_postal_code,
          address_country=EXCLUDED.address_country,value_number=EXCLUDED.value_number,
          value_date=EXCLUDED.value_date,value_datetime=EXCLUDED.value_datetime,
          value_boolean=EXCLUDED.value_boolean
      `,[tenantId,id,objectApi,field,value.value_text,value.reference_record_id,
        value.is_unique,value.case_sensitive,value.geo_latitude??null,value.geo_longitude??null,
        value.address_street??null,value.address_city??null,value.address_state??null,
        value.address_postal_code??null,value.address_country??null,value.value_number??null,
        value.value_date??null,value.value_datetime??null,value.value_boolean??null]);
        if(value.multi_values){
          await transactionClient.query('DELETE FROM md_record_multi_values WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3',
            [tenantId,id,field]);
          for(const [sortOrder,multiValue] of value.multi_values.entries())await transactionClient.query(
            `INSERT INTO md_record_multi_values
              (tenant_id,record_id,object_api,field_api,value,sort_order) VALUES($1,$2,$3,$4,$5,$6)`,
            [tenantId,id,objectApi,field,multiValue,sortOrder]);
        }
      }
      const currentParents=await this.rollupParents(transactionClient,tenantId,objectApi,id);
      for(const [parentObject,parentIds] of currentParents){
        const affected=affectedParents.get(parentObject)??new Set<string>();
        for(const parentId of parentIds)affected.add(parentId);
        affectedParents.set(parentObject,affected);
      }
      await this.refreshRollups(transactionClient,tenantId,objectApi,affectedParents);
    };
    if(client)await write(client,prepared);
    else await this.db.transaction(async transactionClient=>{
      const locked=await transactionClient.query(
        "SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND md_record_access($1,$4,id,'edit') FOR UPDATE",
        [tenantId,objectApi,id,userId]);
      if(!locked.rowCount)throw new Error('Record not found');
      const prior=await this.get(tenantId,userId,objectApi,id,transactionClient);
      let finalPrepared=prepared;
      if(this.recordTrigger){
        const proposed=await this.recordTrigger(transactionClient,tenantId,userId,objectApi,'updated',
          {...prior,...values},prior,'before-save');
        if(proposed){
          const changed={...values};
          for(const [field,value] of Object.entries(proposed))
            if(!['Id','CreatedAt','LastModifiedDate','OwnerId','RecordTypeId'].includes(field)
              &&!Object.is(value,prior[field]))changed[field]=value;
          finalPrepared=await this.prepare(tenantId,userId,objectApi,changed,false,transactionClient,id);
        }
      }
      await write(transactionClient,finalPrepared);
      if(this.recordTrigger){
        const record=await this.get(tenantId,userId,objectApi,id,transactionClient);
        await this.recordTrigger(transactionClient,tenantId,userId,objectApi,'updated',record,prior,'after-save');
      }
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
  private async removeRecordTree(client:PoolClient,tenantId:string,userId:string,objectApi:string,id:string,
    root:boolean,visiting:Set<string>){
    const recordKey=JSON.stringify([objectApi,id]);
    if(visiting.has(recordKey))throw new Error('Master-Detail record cycle detected');
    const record=await client.query<{id:string}>(root
      ?`SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3
         AND md_record_access($1,$4,id,'delete') FOR UPDATE`
      :'SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 FOR UPDATE',
    root?[tenantId,objectApi,id,userId]:[tenantId,objectApi,id]);
    if(!record.rowCount){
      if(root)throw new Error('Record not found');
      return;
    }
    const affectedParents=await this.rollupParents(client,tenantId,objectApi,id);
    visiting.add(recordKey);
    const {rows:references}=await client.query<{
      record_id:string;object_api:string;field_api:string;relationship_type:string;delete_behavior:string|null;required:boolean
    }>(`SELECT r.id AS record_id,r.object_api,f.api_name AS field_api,
        COALESCE(f.relationship_type,'Lookup') AS relationship_type,f.delete_behavior,f.required
      FROM md_record_values v
      JOIN md_records r ON r.tenant_id=v.tenant_id AND r.id=v.record_id
      JOIN md_field_definitions f ON f.tenant_id=v.tenant_id AND f.object_api=v.object_api
        AND f.api_name=v.field_api AND f.deleted_at IS NULL
      WHERE v.tenant_id=$1 AND v.reference_record_id=$2 AND f.related_object=$3
      ORDER BY f.relationship_type,r.object_api,r.id`,
    [tenantId,id,objectApi]);
    if(references.some(reference=>reference.relationship_type==='Lookup'
      &&(reference.delete_behavior==='Restrict'||reference.required)))
      throw new Error('Record delete restricted by a lookup relationship');
    const cascaded=new Set<string>();
    for(const reference of references){
      if(reference.relationship_type!=='Master-Detail')continue;
      const key=JSON.stringify([reference.object_api,reference.record_id]);
      if(cascaded.has(key))continue;
      cascaded.add(key);
      await this.removeRecordTree(client,tenantId,userId,reference.object_api,reference.record_id,false,visiting);
    }
    for(const reference of references){
      if(reference.relationship_type!=='Hierarchical'
        &&!(reference.relationship_type==='Lookup'&&(reference.delete_behavior??'Clear')==='Clear'))continue;
      const cleared=await client.query<{record_id:string;object_api:string;field_api:string}>(
        `UPDATE md_record_values SET value_text=NULL,reference_record_id=NULL
         WHERE tenant_id=$1 AND record_id=$2 AND field_api=$3 AND reference_record_id=$4
         RETURNING record_id,object_api,field_api`,
        [tenantId,reference.record_id,reference.field_api,id]);
      if(!cleared.rowCount)continue;
      await client.query('UPDATE md_records SET updated_at=now() WHERE tenant_id=$1 AND id=$2',
        [tenantId,reference.record_id]);
      await client.query(`INSERT INTO md_record_history
        (tenant_id,record_id,object_api,field_api,changed_by,old_value,new_value)
        VALUES($1,$2,$3,$4,$5,$6,NULL)`,
      [tenantId,reference.record_id,reference.object_api,reference.field_api,userId,id]);
    }
    await client.query('DELETE FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3',
      [tenantId,objectApi,id]);
    await this.refreshRollups(client,tenantId,objectApi,affectedParents);
    visiting.delete(recordKey);
  }
  async remove(tenantId:string,userId:string,objectApi:string,id:string,client?:PoolClient) {
    await this.rbac.require(tenantId,userId,objectApi,'delete');
    if(client)await this.removeRecordTree(client,tenantId,userId,objectApi,id,true,new Set());
    else await this.db.transaction(async transactionClient=>{
      const locked=await transactionClient.query(
        "SELECT id FROM md_records WHERE tenant_id=$1 AND object_api=$2 AND id=$3 AND md_record_access($1,$4,id,'delete') FOR UPDATE",
        [tenantId,objectApi,id,userId]);
      if(!locked.rowCount)throw new Error('Record not found');
      const prior=this.recordTrigger
        ?await this.get(tenantId,userId,objectApi,id,transactionClient):null;
      await this.removeRecordTree(transactionClient,tenantId,userId,objectApi,id,true,new Set());
      if(this.recordTrigger)
        await this.recordTrigger(transactionClient,tenantId,userId,objectApi,'deleted',prior,prior,'after-save');
    });
  }
}
