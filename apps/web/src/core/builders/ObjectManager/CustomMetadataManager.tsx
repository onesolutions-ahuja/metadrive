import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';

type FieldDefinition={apiName:string;label:string;dataType:'text'|'number'|'boolean'|'date'|'datetime';required:boolean;maxLength?:number};
type Definition={apiName:string;label:string;description:string;fields:FieldDefinition[]};
type MetadataRecord={id:string;recordKey:string;masterLabel:string;values:Record<string,string|number|boolean>};
const emptyField=():FieldDefinition=>({apiName:'Value',label:'Value',dataType:'text',required:false});

export default function CustomMetadataManager({setting}:{setting:string}) {
  const [labels,setLabels]=useState<Array<{apiName:string;language:string;label:string;value:string}>>([]);
  const [definitions,setDefinitions]=useState<Definition[]>([]);
  const [selectedApi,setSelectedApi]=useState('');
  const [records,setRecords]=useState<MetadataRecord[]>([]);
  const [labelDraft,setLabelDraft]=useState({apiName:'',language:'en',label:'',value:''});
  const [definitionDraft,setDefinitionDraft]=useState({apiName:'',label:'',description:'',fields:[emptyField()]});
  const [recordDraft,setRecordDraft]=useState({recordKey:'',masterLabel:'',values:{} as Record<string,unknown>});
  const [scope,setScope]=useState<'organization'|'profile'|'user'>('organization');
  const [ownerId,setOwnerId]=useState('');
  const [settingValues,setSettingValues]=useState<Record<string,unknown>>({});
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=async()=>{
    setError('');
    if(setting==='Custom Labels'){
      const result=await apiRequest<{labels:typeof labels}>('/metadata/custom-labels');
      setLabels(result.labels);
      return;
    }
    const route=setting==='Custom Metadata Types'?'/metadata/custom-metadata-types':'/metadata/custom-settings';
    const result=await apiRequest<{types?:Definition[];settings?:Definition[]}>(route);
    const items=result.types??result.settings??[];
    setDefinitions(items);
    if(items.length&&!items.some((item)=>item.apiName===selectedApi))setSelectedApi(items[0].apiName);
  };

  useEffect(()=>{
    setSelectedApi('');
    void refresh().catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to load metadata'));
  },[setting]);
  useEffect(()=>{
    if(!selectedApi||setting==='Custom Labels')return;
    let active=true;
    const load=async()=>{
      if(setting==='Custom Metadata Types'){
        const result=await apiRequest<{records:MetadataRecord[]}>(`/metadata/custom-metadata-types/${encodeURIComponent(selectedApi)}/records`);
        if(active)setRecords(result.records);
      }else{
        if(scope!=='organization'&&!ownerId){if(active)setSettingValues({});return;}
        const query=new URLSearchParams({scope,...(scope==='organization'?{}:{ownerId})});
        const result=await apiRequest<{values:Record<string,unknown>}>(`/metadata/custom-settings/${encodeURIComponent(selectedApi)}/values?${query}`);
        if(active)setSettingValues(result.values);
      }
    };
    void load().catch((failure:unknown)=>{if(active)setError(failure instanceof Error?failure.message:'Unable to load values');});
    return()=>{active=false;};
  },[selectedApi,setting,scope,ownerId]);

  const saveLabel=async()=>{
    await apiRequest(`/metadata/custom-labels/${encodeURIComponent(labelDraft.apiName)}`,{
      method:'PUT',body:JSON.stringify(labelDraft)
    });
    setNotice('Custom Label saved');
    await refresh();
  };
  const deleteLabel=async(apiName:string,language:string)=>{
    await apiRequest(`/metadata/custom-labels/${encodeURIComponent(apiName)}?${new URLSearchParams({language})}`,{method:'DELETE'});
    setNotice('Custom Label deleted');
    await refresh();
  };
  const saveDefinition=async()=>{
    const endpoint=setting==='Custom Metadata Types'?'/metadata/custom-metadata-types':'/metadata/custom-settings';
    const payload=await apiRequest<{type?:Definition;setting?:Definition}>(endpoint,{
      method:'POST',body:JSON.stringify(definitionDraft)
    });
    const created=payload.type??payload.setting;
    if(created){setSelectedApi(created.apiName);setDefinitions((current)=>[...current,created]);}
    setDefinitionDraft({apiName:'',label:'',description:'',fields:[emptyField()]});
    setNotice(`${setting.slice(0,-1)} created`);
  };
  const saveMetadataRecord=async()=>{
    if(!selectedApi)return;
    await apiRequest(`/metadata/custom-metadata-types/${encodeURIComponent(selectedApi)}/records/${encodeURIComponent(recordDraft.recordKey)}`,{
      method:'PUT',body:JSON.stringify(recordDraft)
    });
    setRecordDraft({recordKey:'',masterLabel:'',values:{}});
    const result=await apiRequest<{records:MetadataRecord[]}>(`/metadata/custom-metadata-types/${encodeURIComponent(selectedApi)}/records`);
    setRecords(result.records);
    setNotice('Custom Metadata record saved');
  };
  const deleteMetadataRecord=async(recordKey:string)=>{
    await apiRequest(`/metadata/custom-metadata-types/${encodeURIComponent(selectedApi)}/records/${encodeURIComponent(recordKey)}`,{method:'DELETE'});
    setRecords((current)=>current.filter((record)=>record.recordKey!==recordKey));
  };
  const saveSettingValues=async()=>{
    if(!selectedApi)return;
    const body={scope,...(scope==='organization'?{}:{ownerId}),values:settingValues};
    await apiRequest(`/metadata/custom-settings/${encodeURIComponent(selectedApi)}/values`,{
      method:'PUT',body:JSON.stringify(body)
    });
    setNotice('Custom Setting values saved');
  };
  const fieldEditor=(fields:FieldDefinition[],onChange:(fields:FieldDefinition[])=>void)=>(
    <div className="metadata-card">
      {fields.map((field,index)=><div className="metadata-row" key={`${index}-${field.apiName}`}>
        <label className="form-label">API Name<input className="form-control" value={field.apiName}
          onChange={(event)=>onChange(fields.map((item,i)=>i===index?{...item,apiName:event.target.value}:item))}/></label>
        <label className="form-label">Label<input className="form-control" value={field.label}
          onChange={(event)=>onChange(fields.map((item,i)=>i===index?{...item,label:event.target.value}:item))}/></label>
        <label className="form-label">Type<select className="form-control" value={field.dataType}
          onChange={(event)=>onChange(fields.map((item,i)=>i===index?{...item,dataType:event.target.value as FieldDefinition['dataType']}:item))}>
          {['text','number','boolean','date','datetime'].map((type)=><option key={type}>{type}</option>)}
        </select></label>
        {field.dataType==='text'&&<label className="form-label">Max Length<input className="form-control" type="number" min={1} max={10000}
          value={field.maxLength??''} onChange={(event)=>onChange(fields.map((item,i)=>i===index?{...item,maxLength:event.target.value?Number(event.target.value):undefined}:item))}/></label>}
        <label className="checkbox-row"><input type="checkbox" checked={field.required}
          onChange={(event)=>onChange(fields.map((item,i)=>i===index?{...item,required:event.target.checked}:item))}/>Required</label>
        {fields.length>1&&<button className="btn" type="button" onClick={()=>onChange(fields.filter((_,i)=>i!==index))}>Remove field</button>}
      </div>)}
      <button className="btn" type="button" onClick={()=>onChange([...fields,emptyField()])}>Add Field</button>
    </div>
  );

  return <section className="surface object-setting-surface">
    <div className="section-toolbar"><div><h2>{setting}</h2><p>Manage tenant-scoped metadata definitions and values.</p></div><button className="btn" onClick={()=>void refresh().catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to reload metadata'))}>Refresh</button></div>
    {error&&<p className="formula-validation-error" role="alert">{error}</p>}
    {notice&&<p className="formula-validation-success" role="status">{notice}</p>}
    {setting==='Custom Labels'?<>
      <div className="metadata-card">
        <h3>Label</h3>
        {(['apiName','language','label','value'] as const).map((key)=><label className="form-label" key={key}>{key}
          {key==='value'?<textarea className="form-control" value={labelDraft[key]} onChange={(event)=>setLabelDraft({...labelDraft,[key]:event.target.value})} maxLength={4000} rows={3}/>
            :<input className="form-control" value={labelDraft[key]} onChange={(event)=>setLabelDraft({...labelDraft,[key]:event.target.value})}/>}
        </label>)}
        <button className="btn btn-brand" onClick={()=>void saveLabel().catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to save Custom Label'))}>Save Label</button>
      </div>
      {labels.map((label)=><div className="metadata-row" key={`${label.apiName}:${label.language}`}>
        <span><strong>{label.label}</strong><small>{label.apiName} · {label.language} · {label.value}</small></span>
        <button className="btn" onClick={()=>setLabelDraft(label)}>Edit</button>
        <button className="btn" onClick={()=>void deleteLabel(label.apiName,label.language).catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to delete label'))}>Delete</button>
      </div>)}
    </>:<>
      <div className="metadata-card">
        <h3>Create Definition</h3>
        <label className="form-label">API Name<input className="form-control" value={definitionDraft.apiName} onChange={(event)=>setDefinitionDraft({...definitionDraft,apiName:event.target.value})}/></label>
        <label className="form-label">Label<input className="form-control" value={definitionDraft.label} onChange={(event)=>setDefinitionDraft({...definitionDraft,label:event.target.value})}/></label>
        <label className="form-label">Description<textarea className="form-control" value={definitionDraft.description} onChange={(event)=>setDefinitionDraft({...definitionDraft,description:event.target.value})}/></label>
        {fieldEditor(definitionDraft.fields,(fields)=>setDefinitionDraft({...definitionDraft,fields}))}
        <button className="btn btn-brand" onClick={()=>void saveDefinition().then(refresh).catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to create definition'))}>Create</button>
      </div>
      <label className="form-label">Definition<select className="form-control" value={selectedApi} onChange={(event)=>setSelectedApi(event.target.value)}>
        <option value="">Select a definition</option>{definitions.map((item)=><option key={item.apiName} value={item.apiName}>{item.label} ({item.apiName})</option>)}
      </select></label>
      {selectedApi&&setting==='Custom Metadata Types'&&<>
        <div className="metadata-card">
          <h3>New Record</h3>
          <label className="form-label">Record Key<input className="form-control" value={recordDraft.recordKey} onChange={(event)=>setRecordDraft({...recordDraft,recordKey:event.target.value})}/></label>
          <label className="form-label">Master Label<input className="form-control" value={recordDraft.masterLabel} onChange={(event)=>setRecordDraft({...recordDraft,masterLabel:event.target.value})}/></label>
          {definitions.find((item)=>item.apiName===selectedApi)?.fields.map((field)=><label className="form-label" key={field.apiName}>{field.label}
            {field.dataType==='boolean'
              ?<input type="checkbox" checked={recordDraft.values[field.apiName]===true}
                onChange={(event)=>setRecordDraft({...recordDraft,values:{...recordDraft.values,[field.apiName]:event.target.checked}})}/>
              :<input className="form-control" type={field.dataType==='number'?'number':field.dataType==='date'?'date':field.dataType==='datetime'?'datetime-local':'text'}
                value={String(recordDraft.values[field.apiName]??'')} onChange={(event)=>setRecordDraft({...recordDraft,values:{...recordDraft.values,[field.apiName]:field.dataType==='number'?(event.target.value===''?undefined:Number(event.target.value)):event.target.value}})}/>}
          </label>)}
          <button className="btn btn-brand" onClick={()=>void saveMetadataRecord().catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to save record'))}>Save Record</button>
        </div>
        {records.map((record)=><div className="metadata-row" key={record.id}><span><strong>{record.masterLabel}</strong><small>{record.recordKey}</small></span>
          <button className="btn" onClick={()=>setRecordDraft({recordKey:record.recordKey,masterLabel:record.masterLabel,values:record.values})}>Edit</button>
          <button className="btn" onClick={()=>void deleteMetadataRecord(record.recordKey).catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to delete record'))}>Delete</button>
        </div>)}
      </>}
      {selectedApi&&setting==='Custom Settings'&&<>
        <div className="metadata-card">
          <h3>Hierarchical Values</h3>
          <label className="form-label">Scope<select className="form-control" value={scope} onChange={(event)=>setScope(event.target.value as typeof scope)}>
            <option value="organization">Organization</option><option value="profile">Profile</option><option value="user">User</option>
          </select></label>
          {scope!=='organization'&&<label className="form-label">{scope==='profile'?'Profile':'User'} ID<input className="form-control" value={ownerId} onChange={(event)=>setOwnerId(event.target.value)}/></label>}
          {definitions.find((item)=>item.apiName===selectedApi)?.fields.map((field)=><label className="form-label" key={field.apiName}>{field.label}
            {field.dataType==='boolean'?<input type="checkbox" checked={settingValues[field.apiName]===true} onChange={(event)=>setSettingValues({...settingValues,[field.apiName]:event.target.checked})}/>
              :<input className="form-control" type={field.dataType==='number'?'number':field.dataType==='date'?'date':field.dataType==='datetime'?'datetime-local':'text'}
                value={String(settingValues[field.apiName]??'')} onChange={(event)=>setSettingValues({...settingValues,[field.apiName]:field.dataType==='number'?(event.target.value===''?undefined:Number(event.target.value)):event.target.value})}/>}
          </label>)}
          <button className="btn btn-brand" onClick={()=>void saveSettingValues().catch((failure:unknown)=>setError(failure instanceof Error?failure.message:'Unable to save settings'))}>Save Values</button>
        </div>
      </>}
    </>}
  </section>;
}
