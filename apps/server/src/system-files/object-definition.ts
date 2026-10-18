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
  async addField(tenantId:string,objectApi:string,fieldApi:string,dataType:string,relatedObject?:string,label?:string) {
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
    const result=await this.db.query(`
      INSERT INTO md_field_definitions (tenant_id,object_api,api_name,data_type,related_object,max_length,label)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (tenant_id,object_api,api_name) DO NOTHING RETURNING id
    `,[tenantId,objectApi,fieldApi,type,type==='reference'?relatedObject:null,maxLength,label?.trim()||fieldApi]);
    if(!result.rowCount)throw new Error('Field already exists');
    return result;
  }
  /** Only mutable SQL-backed field properties may be edited; unsupported options fail closed. */
  async updateField(tenantId:string,objectApi:string,fieldApi:string,proposal:Record<string,unknown>){
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
    const changed=await this.db.query(
      'UPDATE md_field_definitions SET label=$4 WHERE tenant_id=$1 AND object_api=$2 AND api_name=$3 RETURNING id',
      [tenantId,objectApi,fieldApi,proposal.label.trim()]);
    if(!changed.rowCount)throw new Error('Field not found');
    return this.get(tenantId,objectApi);
  }
  /** Refuse destructive removal if any tenant record contains a value in this field. */
  async deleteField(tenantId:string,objectApi:string,fieldApi:string){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldApi))throw new Error('Invalid field API name');
    await this.db.transaction(async client=>{
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
    const layouts=await this.loadLayoutMetadata(tenantId);
    return objects.map(obj=>({
      id:obj.id,apiName:obj.api_name,label:obj.label,pluralLabel:obj.label,
      kind:obj.is_system?'Standard Object' as const:'Custom Object' as const,
      description:'',
      ...(layouts.get(obj.api_name)??{revision:0,pageLayouts:[],pageLayoutAssignments:[]}),
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
  /** Object layouts are relational SQL metadata, not a client-only object property. */
  private async loadLayoutMetadata(tenantId:string) {
    const names=['md_object_layout_versions','md_object_page_layouts','md_object_page_layout_sections',
      'md_object_page_layout_fields','md_object_page_layout_actions','md_object_page_layout_related_lists',
      'md_object_page_layout_links','md_object_page_layout_assignments'];
    const [versions,layouts,sections,fields,actions,related,links,assignments]=await Promise.all(
      names.map(name=>this.db.query(`SELECT * FROM ${name} WHERE tenant_id=$1`,[tenantId])));
    type Layout={id:string;label:string;sections:{id:string;label:string;columns:1|2;fieldApiNames:string[]}[];
      relatedLists:string[];actions:string[];customLinks:{id:string;label:string;url:string;openInNewWindow:boolean}[]};
    const byObject=new Map<string,{revision:number;pageLayouts:Layout[];pageLayoutAssignments:{profileId:string;recordTypeId:string;pageLayoutId:string}[]}>();
    const get=(name:string)=>{let value=byObject.get(name);if(!value){
      value={revision:0,pageLayouts:[],pageLayoutAssignments:[]};byObject.set(name,value);
    }return value;};
    for(const row of versions.rows)get(row.object_api).revision=Number(row.revision);
    const indexed=new Map<string,Layout>();
    const sectionIndex=new Map<string,Layout['sections'][number]>();
    const key=(...parts:string[])=>JSON.stringify(parts);
    for(const row of [...layouts.rows].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order))){
      const layout:Layout={id:row.layout_id,label:row.label,sections:[],relatedLists:[],actions:[],customLinks:[]};
      get(row.object_api).pageLayouts.push(layout);
      indexed.set(key(row.object_api,row.layout_id),layout);
    }
    for(const row of [...sections.rows].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order))){
      const layout=indexed.get(key(row.object_api,row.layout_id));if(!layout)continue;
      const section={id:row.section_id,label:row.label,columns:Number(row.columns) as 1|2,fieldApiNames:[] as string[]};
      layout.sections.push(section);
      sectionIndex.set(key(row.object_api,row.layout_id,row.section_id),section);
    }
    for(const row of [...fields.rows].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)))
      sectionIndex.get(key(row.object_api,row.layout_id,row.section_id))?.fieldApiNames.push(row.field_api);
    for(const row of [...actions.rows].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)))
      indexed.get(key(row.object_api,row.layout_id))?.actions.push(row.action_name);
    for(const row of [...related.rows].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)))
      indexed.get(key(row.object_api,row.layout_id))?.relatedLists.push(row.list_name);
    for(const row of [...links.rows].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)))
      indexed.get(key(row.object_api,row.layout_id))?.customLinks.push({
        id:row.link_id,label:row.label,url:row.url,openInNewWindow:row.open_in_new_window
      });
    for(const row of assignments.rows)get(row.object_api).pageLayoutAssignments.push({
      profileId:row.profile_id,recordTypeId:row.record_type_id,pageLayoutId:row.layout_id
    });
    return byObject;
  }

  /** Atomic layout replacement with optimistic concurrency and strict referential validation. */
  async replaceLayouts(tenantId:string,objectApi:string,payload:unknown,expectedRevision:number){
    if(!payload||typeof payload!=='object'||Array.isArray(payload)
      ||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
      throw new Error('Invalid page layout request');
    const input=payload as Record<string,unknown>;
    if(!Array.isArray(input.pageLayouts)||!Array.isArray(input.pageLayoutAssignments)
      ||input.pageLayouts.length>100||input.pageLayoutAssignments.length>1000)
      throw new Error('Invalid page layout request');
    const string=(v:unknown,max=128):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
    const list=(v:unknown,max=200):v is string[]=>Array.isArray(v)&&v.length<=max
      &&v.every(item=>string(item))&&new Set(v).size===v.length;
    const {rows:definedFields}=await this.db.query<{api_name:string}>(
      'SELECT api_name FROM md_field_definitions WHERE tenant_id=$1 AND object_api=$2',[tenantId,objectApi]);
    const fieldNames=new Set(definedFields.map(row=>row.api_name));
    type SectionInput={id:string;label:string;columns:1|2;fieldApiNames:string[]};
    type LinkInput={id:string;label:string;url:string;openInNewWindow:boolean};
    type LayoutInput={id:string;label:string;sections:SectionInput[];actions:string[];relatedLists:string[];customLinks:LinkInput[]};
    type AssignmentInput={profileId:string;recordTypeId:string;pageLayoutId:string};
    const normalized:LayoutInput[]=[];
    const layoutIds=new Set<string>();
    for(const raw of input.pageLayouts){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid page layout');
      const layout=raw as Record<string,unknown>;
      if(!string(layout.id)||!string(layout.label,200)||layoutIds.has(layout.id)
        ||!Array.isArray(layout.sections)||layout.sections.length>100
        ||!list(layout.actions)||!list(layout.relatedLists))
        throw new Error('Invalid page layout');
      layoutIds.add(layout.id);
      const sections:SectionInput[]=[];const sectionIds=new Set<string>();const placed=new Set<string>();
      for(const item of layout.sections){
        if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid page layout section');
        const section=item as Record<string,unknown>;
        if(!string(section.id)||sectionIds.has(section.id)||!string(section.label,200)
          ||(section.columns!==1&&section.columns!==2)||!list(section.fieldApiNames))
          throw new Error('Invalid page layout section');
        sectionIds.add(section.id);
        for(const field of section.fieldApiNames as string[]){
          if(!fieldNames.has(field)||placed.has(field))throw new Error('Invalid page layout field: '+field);
          placed.add(field);
        }
        sections.push({id:section.id,label:section.label,columns:section.columns,fieldApiNames:section.fieldApiNames as string[]});
      }
      const linkIds=new Set<string>();const customLinks:LinkInput[]=[];
      const rawLinks=layout.customLinks??[];
      if(!Array.isArray(rawLinks)||rawLinks.length>100)throw new Error('Invalid page layout links');
      for(const item of rawLinks){
        if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid page layout link');
        const link=item as Record<string,unknown>;
        if(!string(link.id)||linkIds.has(link.id)||!string(link.label,200)||!string(link.url,2048)
          ||(!link.url.startsWith('https://')&&!/^\/(?!\/)/.test(link.url))
          ||typeof link.openInNewWindow!=='boolean')throw new Error('Invalid page layout link');
        linkIds.add(link.id);
        customLinks.push({id:link.id,label:link.label,url:link.url,openInNewWindow:link.openInNewWindow});
      }
      normalized.push({id:layout.id,label:layout.label,sections,
        actions:layout.actions as string[],relatedLists:layout.relatedLists as string[],customLinks});
    }
    const assigned:AssignmentInput[]=[];const assignmentKeys=new Set<string>();
    for(const raw of input.pageLayoutAssignments){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid layout assignment');
      const a=raw as Record<string,unknown>;
      if(!string(a.profileId)||!string(a.recordTypeId)||!string(a.pageLayoutId)
        ||!layoutIds.has(a.pageLayoutId))throw new Error('Invalid layout assignment');
      const key=JSON.stringify([a.profileId,a.recordTypeId]);
      if(assignmentKeys.has(key))throw new Error('Invalid duplicate layout assignment');
      assignmentKeys.add(key);
      assigned.push({profileId:a.profileId,recordTypeId:a.recordTypeId,pageLayoutId:a.pageLayoutId});
    }
    await this.db.transaction(async client=>{
      const found=await client.query(
        'SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',[tenantId,objectApi]);
      if(!found.rows.length)throw new Error('Object not found');
      await client.query(`INSERT INTO md_object_layout_versions(tenant_id,object_api)
        VALUES ($1,$2) ON CONFLICT DO NOTHING`,[tenantId,objectApi]);
      const version=await client.query<{revision:number}>(
        'SELECT revision FROM md_object_layout_versions WHERE tenant_id=$1 AND object_api=$2 FOR UPDATE',[tenantId,objectApi]);
      if(version.rows[0].revision!==expectedRevision)throw new Error('Page layout revision conflict');
      await client.query('DELETE FROM md_object_page_layouts WHERE tenant_id=$1 AND object_api=$2',[tenantId,objectApi]);
      for(const [i,layout] of normalized.entries()){
        await client.query(`INSERT INTO md_object_page_layouts
          (tenant_id,object_api,layout_id,label,sort_order) VALUES ($1,$2,$3,$4,$5)`,
          [tenantId,objectApi,layout.id,layout.label,i]);
        for(const [j,section] of layout.sections.entries()){
          await client.query(`INSERT INTO md_object_page_layout_sections
            (tenant_id,object_api,layout_id,section_id,label,columns,sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [tenantId,objectApi,layout.id,section.id,section.label,section.columns,j]);
          for(const [k,field] of section.fieldApiNames.entries())
            await client.query(`INSERT INTO md_object_page_layout_fields
              (tenant_id,object_api,layout_id,section_id,field_api,sort_order)
              VALUES ($1,$2,$3,$4,$5,$6)`,[tenantId,objectApi,layout.id,section.id,field,k]);
        }
        for(const [j,action] of layout.actions.entries())await client.query(`INSERT INTO md_object_page_layout_actions
          (tenant_id,object_api,layout_id,action_name,sort_order) VALUES ($1,$2,$3,$4,$5)`,
          [tenantId,objectApi,layout.id,action,j]);
        for(const [j,name] of layout.relatedLists.entries())await client.query(`INSERT INTO md_object_page_layout_related_lists
          (tenant_id,object_api,layout_id,list_name,sort_order) VALUES ($1,$2,$3,$4,$5)`,
          [tenantId,objectApi,layout.id,name,j]);
        for(const [j,link] of layout.customLinks.entries())await client.query(`INSERT INTO md_object_page_layout_links
          (tenant_id,object_api,layout_id,link_id,label,url,open_in_new_window,sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId,objectApi,layout.id,link.id,link.label,link.url,link.openInNewWindow,j]);
      }
      for(const assignment of assigned)await client.query(`INSERT INTO md_object_page_layout_assignments
        (tenant_id,object_api,profile_id,record_type_id,layout_id) VALUES ($1,$2,$3,$4,$5)`,
        [tenantId,objectApi,assignment.profileId,assignment.recordTypeId,assignment.pageLayoutId]);
      await client.query(`UPDATE md_object_layout_versions SET revision=revision+1,updated_at=now()
        WHERE tenant_id=$1 AND object_api=$2`,[tenantId,objectApi]);
    });
    return this.get(tenantId,objectApi);
  }
}
