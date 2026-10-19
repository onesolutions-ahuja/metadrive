import {useCallback, useEffect, useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';

type GlobalValueSet={
  id:string;
  apiName:string;
  label:string;
  description:string;
  values:Array<{value:string;label:string;active:boolean;sortOrder:number}>;
};

export default function GlobalValueSetManager(){
  const [valueSets,setValueSets]=useState<GlobalValueSet[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [apiName,setApiName]=useState('');
  const [label,setLabel]=useState('');
  const [description,setDescription]=useState('');
  const [values,setValues]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await apiRequest<{valueSets:GlobalValueSet[]}>('/metadata/global-value-sets');
      setValueSets(result.valueSets);
      setError('');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Unable to load Global Value Sets');
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{void load();},[load]);

  const choose=(valueSet:GlobalValueSet)=>{
    setSelectedId(valueSet.id);
    setApiName(valueSet.apiName);
    setLabel(valueSet.label);
    setDescription(valueSet.description);
    setValues(valueSet.values.map(item=>item.value).join('\n'));
    setError('');
  };
  const reset=()=>{
    setSelectedId('');
    setApiName('');
    setLabel('');
    setDescription('');
    setValues('');
    setError('');
  };
  const save=async()=>{
    const nextValues=values.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
    const current=valueSets.find(item=>item.id===selectedId);
    setSaving(true);
    try{
      const body={apiName,label,description,values:nextValues.map(value=>{
        const existing=current?.values.find(item=>item.value===value);
        return existing?{value,label:existing.label,active:existing.active}:{value};
      })};
      const result=selectedId
        ?await apiRequest<{valueSet:GlobalValueSet}>(`/metadata/global-value-sets/${encodeURIComponent(selectedId)}`,
          {method:'PUT',body:JSON.stringify(body)})
        :await apiRequest<{valueSet:GlobalValueSet}>('/metadata/global-value-sets',
          {method:'POST',body:JSON.stringify(body)});
      await load();
      choose(result.valueSet);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Unable to save Global Value Set');
    }finally{
      setSaving(false);
    }
  };
  const remove=async()=>{
    if(!selectedId)return;
    setSaving(true);
    try{
      await apiRequest(`/metadata/global-value-sets/${encodeURIComponent(selectedId)}`,{method:'DELETE'});
      reset();
      await load();
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Unable to delete Global Value Set');
    }finally{
      setSaving(false);
    }
  };

  return <section className="surface object-setting-surface">
    <div className="section-toolbar"><div><h2>Global Value Sets</h2><p>Share picklist values across fields in this tenant.</p></div>
      <button className="btn" type="button" onClick={reset}>New Value Set</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading?<div className="empty-state">Loading Global Value Sets…</div>:<div className="metadata-card">
      <div className="table-scroll"><table className="slds-table"><thead><tr><th>Label</th><th>API Name</th><th>Values</th></tr></thead>
        <tbody>{valueSets.map(valueSet=><tr key={valueSet.id}>
          <td><button className="btn" type="button" onClick={()=>choose(valueSet)}>{valueSet.label}</button></td>
          <td className="api-name">{valueSet.apiName}</td><td>{valueSet.values.length}</td>
        </tr>)}</tbody></table></div>
      {!valueSets.length&&<div className="empty-state">No Global Value Sets are defined.</div>}
    </div>}
    <div className="object-edit-form">
      <label className="form-label">Label<input className="form-control" maxLength={120} value={label} onChange={event=>setLabel(event.target.value)} /></label>
      <label className="form-label">API Name<input className="form-control api-name" maxLength={80} value={apiName} disabled={Boolean(selectedId)} onChange={event=>setApiName(event.target.value)} /></label>
      <label className="form-label">Description<textarea className="form-control" maxLength={4000} rows={2} value={description} onChange={event=>setDescription(event.target.value)} /></label>
      <label className="form-label">Values<textarea className="form-control" rows={8} value={values} onChange={event=>setValues(event.target.value)} placeholder={'North\\nSouth\\nWest'} /></label>
      <p className="permission-help">Enter one value per line. Values already used by records cannot be removed; referenced sets cannot be deleted.</p>
      <div className="toolbar-actions"><button className="btn btn-brand" type="button" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save Value Set'}</button>
        {selectedId&&<button className="btn" type="button" disabled={saving} onClick={()=>void remove()}>Delete</button>}</div>
    </div>
  </section>;
}
