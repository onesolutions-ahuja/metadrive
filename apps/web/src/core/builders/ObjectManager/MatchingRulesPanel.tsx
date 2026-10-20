import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {ObjectMetadata} from '../../metadata/Definitions/metadata';
type Rule={apiName:string;label:string;active:boolean;action:'Alert'|'Block';matchMode:'All'|'Any';
 fields:Array<{fieldApi:string;caseSensitive:boolean}>};
const empty:Rule={apiName:'',label:'',active:false,action:'Alert',matchMode:'All',fields:[]};
export default function MatchingRulesPanel({object}: {object:ObjectMetadata}){
 const [rules,setRules]=useState<Rule[]>([]);
 const [draft,setDraft]=useState<Rule|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const url='/metadata/objects/'+encodeURIComponent(object.apiName)+'/matching-rules';
 const load=async()=>{const data=await apiRequest<{rules:Rule[]}>(url);setRules(data.rules)};
 useEffect(()=>{let mounted=true;apiRequest<{rules:Rule[]}>(url)
  .then(x=>{if(mounted){setRules(x.rules);setError('')}})
  .catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Unable to load rules')});
  return()=>{mounted=false}},[url]);
 const execute=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');
  try{await fn();await load();setDraft(null)}catch(e){setError(e instanceof Error?e.message:'Save failed')}
  finally{setBusy(false)}};
 const candidates=object.fields.filter(f=>['Text','Email','Phone','URL','Picklist'].includes(f.dataType));
 return <section className="surface object-setting-surface">
  <div className="section-toolbar"><div><h2>Duplicate & Matching Rules</h2>
   <p>Compare selected fields to existing records. Block a match or save it as a duplicate alert.</p></div>
   <button className="btn btn-brand" onClick={()=>setDraft({...empty,fields:[]})}>New Rule</button></div>
  {error&&<p role="alert">{error}</p>}
  <div className="table-scroll"><table className="slds-table"><thead><tr><th>Name</th><th>Criteria</th><th>Action</th><th>Status</th><th>Manage</th></tr></thead>
   <tbody>{rules.map(rule=><tr key={rule.apiName}>
    <td>{rule.label}<small className="api-name"> {rule.apiName}</small></td>
    <td>{rule.matchMode}: {rule.fields.map(f=>f.fieldApi).join(', ')}</td>
    <td>{rule.action}</td><td>{rule.active?'Active':'Inactive'}</td>
    <td><button className="btn" onClick={()=>setDraft({...rule,fields:rule.fields.map(f=>({...f}))})}>Edit</button>
    <button className="btn" disabled={busy} onClick={()=>void execute(()=>apiRequest(url+'/'+encodeURIComponent(rule.apiName),{method:'DELETE'}))}>Delete</button></td>
   </tr>)}</tbody></table></div>
  {draft&&<div className="metadata-card"><h3>{draft.apiName?'Edit matching rule':'Create matching rule'}</h3>
   <label className="form-label">API Name<input className="form-control" disabled={rules.some(r=>r.apiName===draft.apiName)}
    value={draft.apiName} onChange={e=>setDraft({...draft,apiName:e.target.value})}/></label>
   <label className="form-label">Label<input className="form-control" value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
   <label className="form-label">When fields match<select className="form-control" value={draft.matchMode}
    onChange={e=>setDraft({...draft,matchMode:e.target.value as Rule['matchMode']})}>
     <option value="All">All selected fields</option><option value="Any">Any selected field</option></select></label>
   <label className="form-label">On duplicate<select className="form-control" value={draft.action}
    onChange={e=>setDraft({...draft,action:e.target.value as Rule['action']})}>
     <option value="Alert">Alert: allow save and log duplicate</option><option value="Block">Block: reject save</option></select></label>
   <div className="form-label">Matching fields</div>
   {candidates.map(f=>{const current=draft.fields.find(item=>item.fieldApi===f.apiName);
    return <div className="checkbox-row" key={f.apiName}>
     <label><input type="checkbox" checked={Boolean(current)} onChange={e=>setDraft({...draft,
      fields:e.target.checked?[...draft.fields,{fieldApi:f.apiName,caseSensitive:false}]:draft.fields.filter(item=>item.fieldApi!==f.apiName)})}/>{f.label}</label>
     {current&&<label><input type="checkbox" checked={current.caseSensitive} onChange={e=>setDraft({...draft,
      fields:draft.fields.map(item=>item.fieldApi===f.apiName?{...item,caseSensitive:e.target.checked}:item)})}/>Case sensitive</label>}
    </div>})}
   <label className="checkbox-row"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Active</label>
   <div className="modal-actions"><button className="btn" onClick={()=>setDraft(null)}>Cancel</button>
    <button className="btn btn-brand" disabled={busy||!draft.label.trim()||!draft.apiName||!draft.fields.length}
     onClick={()=>void execute(()=>apiRequest(url+'/'+encodeURIComponent(draft.apiName),{method:'PUT',body:JSON.stringify(draft)}))}>Save Rule</button>
   </div></div>}
 </section>;
}
