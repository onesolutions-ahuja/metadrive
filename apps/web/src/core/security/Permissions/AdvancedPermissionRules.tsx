import {useState} from 'react';
type Rule={resource:string;action:string;effect:'allow'|'deny'};
type Policy={systemPermissions:string[];deniedPermissions?:string[];advancedRules?:Rule[];inheritedPermissionSetIds?:string[]};
export default function AdvancedPermissionRules({policy,onChange}:{policy:Policy;onChange:(patch:Partial<Policy>)=>void}){
 const [resource,setResource]=useState(''),[action,setAction]=useState('read'),[effect,setEffect]=useState<'allow'|'deny'>('deny');
 const add=()=>{
  if(!resource.trim()||!action.trim())return;
  onChange({advancedRules:[...(policy.advancedRules??[]).filter(r=>r.resource!==resource.trim()||r.action!==action.trim()),
   {resource:resource.trim(),action:action.trim(),effect}]});
  setResource('');
 };
 return <section aria-label="Advanced permission rules">
  <h3 className="permission-section-heading">Advanced permission rules</h3>
  <p className="permission-help">Explicit denials take precedence over all grants. Changing your own assignments or increasing your own effective access is blocked. A second authorized administrator can restore a revoked permission.</p>
  <label className="checkbox-row"><input type="checkbox" checked={policy.systemPermissions.includes('*:*')}
   onChange={e=>onChange({systemPermissions:e.target.checked?[...policy.systemPermissions,'*:*']:policy.systemPermissions.filter(p=>p!=='*:*')})}/>
   Full starting access, with individual restrictions</label>
  {(policy.deniedPermissions??[]).map(token=><div key={token} className="settings-row">
   <span>Deny {token}</span><button type="button" className="btn"
    onClick={()=>onChange({deniedPermissions:policy.deniedPermissions?.filter(p=>p!==token)})}>Remove explicit denial</button>
  </div>)}
  {(policy.advancedRules??[]).map((r,index)=><div key={r.resource+':'+r.action} className="settings-row">
   <span>{r.effect} {r.resource} / {r.action}</span><button type="button" className="btn"
    onClick={()=>onChange({advancedRules:policy.advancedRules?.filter((_,i)=>i!==index)})}>Remove rule</button>
  </div>)}
  <p className="permission-help">For restrictions on full starting access, restore the corresponding checkbox above. Resource and action names also support existing custom Flow and record policies.</p>
  <div className="permission-form-grid">
   <label className="form-label">Resource<input className="form-control" value={resource} onChange={e=>setResource(e.target.value)} placeholder="Flow:Checkout"/></label>
   <label className="form-label">Action<input className="form-control" value={action} onChange={e=>setAction(e.target.value)} list="rbac-actions"/>
    <datalist id="rbac-actions">{['read','create','edit','delete','execute','manage','viewAll','modifyAll'].map(a=><option key={a} value={a}/>)}</datalist></label>
   <label className="form-label">Effect<select className="form-control" value={effect} onChange={e=>setEffect(e.target.value as 'allow'|'deny')}>
    <option value="deny">Deny</option><option value="allow">Allow</option></select></label>
   <button type="button" className="btn" disabled={!resource.trim()||!action.trim()} onClick={add}>Add permission rule</button>
  </div>
 </section>;
}
