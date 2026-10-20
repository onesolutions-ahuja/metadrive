import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {FieldMetadata} from '../../metadata/Definitions/metadata';
type Rule={apiName:string;label:string;expression:string;errorMessage:string;errorFieldApi:string|null;active:boolean;sortOrder:number};
type Default={fieldApi:string;expression:string};
const empty:Rule={apiName:'',label:'',expression:'',errorMessage:'',errorFieldApi:null,active:false,sortOrder:0};
export default function DeclarativeRulesManager({objectApi,fields}: {objectApi:string;fields:FieldMetadata[]}) {
 const [rules,setRules]=useState<Rule[]>([]),[defaults,setDefaults]=useState<Default[]>([]);
 const [editing,setEditing]=useState<Rule|null>(null),[draft,setDraft]=useState<Rule>(empty);
 const [field,setField]=useState(''),[expression,setExpression]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const base='/metadata/objects/'+encodeURIComponent(objectApi);
 const reload=async()=>{
   const [a,b]=await Promise.all([
     apiRequest<{rules:Rule[]}>(base+'/validation-rules'),
     apiRequest<{defaults:Default[]}>(base+'/default-formulas')]);
   setRules(a.rules);setDefaults(b.defaults);
 };
 useEffect(()=>{let active=true;Promise.all([
   apiRequest<{rules:Rule[]}>(base+'/validation-rules'),
   apiRequest<{defaults:Default[]}>(base+'/default-formulas')
 ]).then(([a,b])=>{if(active){setRules(a.rules);setDefaults(b.defaults);setError('');}})
 .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load rules');});
 return ()=>{active=false};},[base]);
 const run=async(action:()=>Promise<unknown>)=>{
   setBusy(true);setError('');try{await action();await reload();}
   catch(e){setError(e instanceof Error?e.message:'Unable to save rules');}
   finally{setBusy(false);}
 };
 const editable=fields.filter(f=>!f.formula&&!f.rollup&&
   !['Auto Number','Text (Encrypted)','Lookup Relationship','Master-Detail Relationship'].includes(f.dataType));
 return <section className="surface object-setting-surface">
  <div className="section-toolbar"><div><h2>Validation Rules</h2>
   <p>When a formula evaluates to TRUE, the record save is rejected.</p></div>
   <button className="btn btn-brand" onClick={()=>{setEditing(empty);setDraft(empty)}}>New Rule</button></div>
  {error&&<p role="alert">{error}</p>}
  <div className="table-scroll"><table className="slds-table"><thead><tr><th>Rule</th><th>Status</th><th>Error location</th><th>Actions</th></tr></thead>
   <tbody>{rules.map(r=><tr key={r.apiName}><td>{r.label}<small className="api-name"> {r.apiName}</small></td>
    <td>{r.active?'Active':'Inactive'}</td><td>{r.errorFieldApi??'Top of page'}</td>
    <td><button className="btn" onClick={()=>{setEditing(r);setDraft(r)}}>Edit</button>
    <button className="btn" disabled={busy} onClick={()=>void run(async()=>apiRequest(base+'/validation-rules/'+encodeURIComponent(r.apiName),{method:'DELETE'}))}>Delete</button></td></tr>)}</tbody></table></div>
  {editing&&<div className="metadata-card"><h3>{editing.apiName?'Edit validation rule':'New validation rule'}</h3>
   <label className="form-label">API Name<input className="form-control" value={draft.apiName} disabled={Boolean(editing.apiName)} onChange={e=>setDraft({...draft,apiName:e.target.value})}/></label>
   <label className="form-label">Label<input className="form-control" value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
   <label className="form-label">Error condition formula<textarea className="form-control" rows={4} value={draft.expression} onChange={e=>setDraft({...draft,expression:e.target.value})} placeholder="AND(ISNEW(), ISBLANK($Record.Name))"/></label>
   <label className="form-label">Error message<input className="form-control" value={draft.errorMessage} onChange={e=>setDraft({...draft,errorMessage:e.target.value})}/></label>
   <label className="form-label">Error location<select className="form-control" value={draft.errorFieldApi??''} onChange={e=>setDraft({...draft,errorFieldApi:e.target.value||null})}>
    <option value="">Top of page</option>{fields.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}</select></label>
   <label className="checkbox-row"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Active</label>
   <div className="modal-actions"><button className="btn" onClick={()=>setEditing(null)}>Cancel</button>
    <button className="btn btn-brand" disabled={busy||!draft.apiName||!draft.label||!draft.expression||!draft.errorMessage}
     onClick={()=>void run(async()=>{await apiRequest(base+'/validation-rules/'+encodeURIComponent(draft.apiName),{method:'PUT',body:JSON.stringify(draft)});setEditing(null)})}>Save Rule</button></div></div>}
  <div className="section-toolbar"><div><h2>Formula Defaults</h2><p>Evaluate on creation, before record-triggered Flows. Explicit user values are preserved.</p></div></div>
  <div className="table-scroll"><table className="slds-table"><thead><tr><th>Field</th><th>Expression</th><th>Action</th></tr></thead><tbody>
   {defaults.map(d=><tr key={d.fieldApi}><td>{fields.find(f=>f.apiName===d.fieldApi)?.label??d.fieldApi}</td>
    <td><code>{d.expression}</code></td><td><button className="btn" onClick={()=>{setField(d.fieldApi);setExpression(d.expression)}}>Edit</button>
    <button className="btn" disabled={busy} onClick={()=>void run(()=>apiRequest(base+'/default-formulas/'+encodeURIComponent(d.fieldApi),{method:'DELETE'}))}>Delete</button></td></tr>)}
   </tbody></table></div>
  <div className="metadata-card"><label className="form-label">Target field<select className="form-control" value={field} onChange={e=>{setField(e.target.value);setExpression(defaults.find(d=>d.fieldApi===e.target.value)?.expression??'')}}>
   <option value="">Select field</option>{editable.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}</select></label>
   <label className="form-label">Default formula<textarea className="form-control" rows={3} value={expression} onChange={e=>setExpression(e.target.value)} placeholder="TODAY()"/></label>
   <button className="btn btn-brand" disabled={busy||!field||!expression.trim()} onClick={()=>void run(()=>apiRequest(base+'/default-formulas/'+encodeURIComponent(field),{method:'PUT',body:JSON.stringify({expression})}))}>Save Default</button></div>
 </section>;
}
