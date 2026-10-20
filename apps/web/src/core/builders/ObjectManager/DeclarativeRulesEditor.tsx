import {useEffect,useMemo,useState} from 'react';
import type {FieldMetadata} from '../../metadata/Definitions/metadata';

type Rule={
  apiName:string;
  label:string;
  expression:string;
  errorMessage:string;
  errorField:string|null;
  operations:'Both'|'Create'|'Update';
  active:boolean;
  sortOrder:number;
};
type Default={fieldApiName:string;expression:string};
type Payload={rules:Rule[];defaults:Default[]};
const blank=():Rule=>({apiName:'',label:'',expression:'',errorMessage:'',
  errorField:null,operations:'Both',active:false,sortOrder:0});

export default function DeclarativeRulesEditor({
  objectApi,fields,apiRequest,onNotify
}:{
  objectApi:string;
  fields:FieldMetadata[];
  apiRequest:<T>(path:string,init?:RequestInit)=>Promise<T>;
  onNotify:(message:string)=>void;
}){
  const [data,setData]=useState<Payload>({rules:[],defaults:[]});
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'rules'|'defaults'>('rules');
  const [editing,setEditing]=useState<Rule>(blank());
  const [selectedDefault,setSelectedDefault]=useState('');
  const [defaultFormula,setDefaultFormula]=useState('');
  const [busy,setBusy]=useState(false);
  const root=`/metadata/objects/${encodeURIComponent(objectApi)}`;
  useEffect(()=>{
    let alive=true;
    setLoading(true);
    setData({rules:[],defaults:[]});
    setEditing(blank());
    void apiRequest<Payload>(root+'/business-rules').then(payload=>{
      if(alive)setData(payload);
    }).catch((error:unknown)=>{
      if(alive)onNotify(error instanceof Error?error.message:'Unable to load business rules');
    }).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[objectApi]);
  const defaultFields=useMemo(()=>fields.filter(field=>field.defaultValue===undefined &&
    !['Formula','Roll-Up Summary','Auto Number','AutoNumber','Text (Encrypted)',
      'Multi-Select Picklist','Rich Text Area','Geolocation','Address']
      .some(type=>field.dataType.startsWith(type))&&!field.relationship),[fields]);
  useEffect(()=>{
    if(!defaultFields.some(field=>field.apiName===selectedDefault))
      setSelectedDefault(defaultFields[0]?.apiName??'');
  },[defaultFields,selectedDefault]);
  useEffect(()=>{
    setDefaultFormula(data.defaults.find(item=>item.fieldApiName===selectedDefault)?.expression??'');
  },[data.defaults,selectedDefault]);
  const update=(key:keyof Rule,value:unknown)=>setEditing(rule=>({...rule,[key]:value}));
  const saveRule=async()=>{
    setBusy(true);
    try{
      const saved=await apiRequest<Payload>(
        root+'/validation-rules/'+encodeURIComponent(editing.apiName),{
          method:'PUT',body:JSON.stringify(editing)});
      setData(saved);
      onNotify('Validation rule saved');
    }catch(error){
      onNotify(error instanceof Error?error.message:'Unable to save validation rule');
    }finally{setBusy(false);}
  };
  const removeRule=async()=>{
    if(!editing.apiName)return;
    setBusy(true);
    try{
      await apiRequest<void>(root+'/validation-rules/'+encodeURIComponent(editing.apiName),{
        method:'DELETE'});
      setData(current=>({...current,rules:current.rules.filter(item=>item.apiName!==editing.apiName)}));
      setEditing(blank());
      onNotify('Validation rule deleted');
    }catch(error){
      onNotify(error instanceof Error?error.message:'Unable to delete validation rule');
    }finally{setBusy(false);}
  };
  const saveDefault=async()=>{
    if(!selectedDefault)return;
    setBusy(true);
    try{
      const saved=await apiRequest<Payload>(
        root+'/default-formulas/'+encodeURIComponent(selectedDefault),{
          method:'PUT',body:JSON.stringify({expression:defaultFormula.trim()||null})});
      setData(saved);
      onNotify('Formula default saved');
    }catch(error){
      onNotify(error instanceof Error?error.message:'Unable to save formula default');
    }finally{setBusy(false);}
  };
  return <section className="surface object-setting-surface">
    <div className="section-toolbar">
      <div><h2>Declarative Business Rules</h2>
        <p>Configure server-enforced validation and calculated defaults without code or SQL.</p></div>
      <div className="toolbar-actions">
        <button className="btn" type="button" onClick={()=>setTab('rules')}
          aria-pressed={tab==='rules'}>Validation Rules</button>
        <button className="btn" type="button" onClick={()=>setTab('defaults')}
          aria-pressed={tab==='defaults'}>Formula Defaults</button>
      </div>
    </div>
    {loading?<p>Loading object rules…</p>:tab==='rules'?<>
      <div className="section-toolbar">
        <div><h3>Validation Rules</h3>
          <p>A rule that evaluates to TRUE blocks a create or update transaction.</p></div>
        <button className="btn btn-brand" type="button" onClick={()=>setEditing(blank())}>New Rule</button>
      </div>
      <div className="table-scroll">
        <table className="slds-table"><thead><tr>
          <th>Rule</th><th>Enabled</th><th>When</th><th>Order</th></tr></thead>
          <tbody>{data.rules.map(rule=><tr key={rule.apiName}>
            <td><button className="field-link" type="button"
              onClick={()=>setEditing({...rule})}>{rule.label}</button></td>
            <td>{rule.active?'Active':'Inactive'}</td><td>{rule.operations}</td>
            <td>{rule.sortOrder}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="metadata-card">
        <div className="metadata-card-header">
          <h3>{data.rules.some(rule=>rule.apiName===editing.apiName)?'Edit Rule':'New Rule'}</h3>
        </div>
        <label className="form-label">API Name
          <input className="form-control" value={editing.apiName}
            disabled={data.rules.some(rule=>rule.apiName===editing.apiName)}
            onChange={event=>update('apiName',event.target.value)} placeholder="Check_Discount"/>
        </label>
        <label className="form-label">Label
          <input className="form-control" value={editing.label}
            onChange={event=>update('label',event.target.value)} placeholder="Check discount is valid"/>
        </label>
        <label className="form-label">Validation formula
          <textarea className="form-control" rows={4} value={editing.expression}
            onChange={event=>update('expression',event.target.value)}
            placeholder="AND({!$Record.Discount} > 20, ISNEW())"/>
        </label>
        <p className="permission-help">Use {'{!$Record.FieldApi}'}, {'{!$User.Id}'} and
          {' {!$Profile.Id}'}. ISNEW(), ISCHANGED() and PRIORVALUE() are supported.</p>
        <label className="form-label">Error message
          <input className="form-control" value={editing.errorMessage}
            onChange={event=>update('errorMessage',event.target.value)}
            placeholder="The discount is too high"/>
        </label>
        <label className="form-label">Display error on
          <select className="form-control" value={editing.errorField??''}
            onChange={event=>update('errorField',event.target.value||null)}>
            <option value="">Page (top)</option>
            {fields.map(field=><option key={field.apiName} value={field.apiName}>
              {field.label} ({field.apiName})</option>)}
          </select>
        </label>
        <label className="form-label">Apply to
          <select className="form-control" value={editing.operations}
            onChange={event=>update('operations',event.target.value)}>
            <option value="Both">Create and Update</option>
            <option value="Create">Create only</option>
            <option value="Update">Update only</option>
          </select>
        </label>
        <label className="form-label">Evaluation order
          <input className="form-control" type="number" step="1" value={editing.sortOrder}
            onChange={event=>update('sortOrder',Number(event.target.value))}/>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={editing.active}
            onChange={event=>update('active',event.target.checked)}/> Active
        </label>
        <div className="toolbar-actions">
          <button className="btn btn-brand" disabled={busy||!editing.apiName||!editing.expression}
            type="button" onClick={()=>void saveRule()}>Save Rule</button>
          {data.rules.some(rule=>rule.apiName===editing.apiName)&&
            <button className="btn" disabled={busy} type="button"
              onClick={()=>void removeRule()}>Delete Rule</button>}
        </div>
      </div>
    </>:<>
      <div className="section-toolbar"><div><h3>Formula Default Values</h3>
        <p>Computed on record creation only when the user has not supplied that field.</p></div></div>
      <div className="metadata-card">
        <label className="form-label">Field
          <select className="form-control" value={selectedDefault}
            onChange={event=>setSelectedDefault(event.target.value)}>
            {defaultFields.map(field=><option key={field.apiName} value={field.apiName}>
              {field.label} ({field.apiName})</option>)}
          </select>
        </label>
        <label className="form-label">Formula
          <textarea className="form-control" rows={4} value={defaultFormula}
            onChange={event=>setDefaultFormula(event.target.value)}
            placeholder={'IF({!$Record.IsPreferred}, 10, 0)'}/>
        </label>
        <p className="permission-help">Use a formula to calculate a value during creation.
          Formulas can reference other fields and the current user. Clear the formula to remove it.
          Existing literal defaults are configured in Fields & Relationships.</p>
        <button className="btn btn-brand" type="button" disabled={busy||!selectedDefault}
          onClick={()=>void saveDefault()}>Save Default</button>
      </div>
    </>}
  </section>;
}
