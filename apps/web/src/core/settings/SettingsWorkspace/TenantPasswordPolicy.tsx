import {useEffect,useState} from 'react';
import SettingsViewRow from '../SettingsViewRow/SettingsViewRow';

type Policy={min_length:number;require_uppercase:boolean;require_lowercase:boolean;require_number:boolean;
 require_symbol:boolean;max_age_days:number;history_count:number;max_failed_attempts:number;lockout_minutes:number};
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;
const fields:ReadonlyArray<{key:keyof Policy;label:string;min?:number;max?:number}>=[
 {key:'min_length',label:'Minimum password length',min:12,max:128},
 {key:'require_uppercase',label:'Require uppercase letter'},
 {key:'require_lowercase',label:'Require lowercase letter'},
 {key:'require_number',label:'Require number'},
 {key:'require_symbol',label:'Require symbol'},
 {key:'max_age_days',label:'Password lifetime in days (0 disables expiry)',min:0,max:365},
 {key:'history_count',label:'Previous passwords to prevent reusing',min:0,max:24},
 {key:'max_failed_attempts',label:'Failed attempts before lockout',min:3,max:20},
 {key:'lockout_minutes',label:'Lockout duration in minutes',min:1,max:1440}
];
/** Core security settings reuse the shared read-first settings component. */
export default function TenantPasswordPolicy({request,canManage}:{request:Request;canManage:boolean}){
 const [policy,setPolicy]=useState<Policy|null>(null),[draft,setDraft]=useState<Policy|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;
  void request<Policy>('/auth/password-policy').then(p=>{if(active)setPolicy(p);})
   .catch(e=>{if(active)setMessage(e instanceof Error?e.message:String(e));});
  return()=>{active=false;};
 },[request]);
 const save=async()=>{
  if(!draft||busy)return;setBusy(true);setMessage('');
  try{setPolicy(await request<Policy>('/auth/password-policy',{method:'PUT',body:JSON.stringify(draft)}));
   setDraft(null);setMessage('Password policy saved.');
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 };
 return <section className="surface permission-section">
  <h2>Password and login policy</h2>
  <p>Tenant-wide rules apply to password changes and recovery. Configure recovery delivery before enabling expiry.</p>
  {policy?<div className="settings-read-first-section">{fields.map(field=>{
   const value=(draft??policy)[field.key];
   return draft?<label key={field.key} className="form-label">{field.label}
    {typeof value==='boolean'?<input type="checkbox" checked={value} disabled={busy}
     onChange={e=>setDraft({...draft,[field.key]:e.target.checked})}/>
     :<input className="form-control" type="number" min={field.min} max={field.max} step={1}
      value={value} disabled={busy} onChange={e=>setDraft({...draft,[field.key]:Number(e.target.value)})}/>}
   </label>:<SettingsViewRow key={field.key} label={field.label} value={typeof value==='boolean'?(value?'Yes':'No'):value}
    canEdit={canManage} onEdit={()=>{setDraft({...policy});setMessage('');}}/>;
  })}</div>:<p>Loading policy…</p>}
  {draft&&<div className="settings-read-first-toolbar">
   <button type="button" className="btn" disabled={busy} onClick={()=>setDraft(null)}>Cancel</button>
   <button type="button" className="btn btn-brand" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save changes'}</button>
  </div>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
