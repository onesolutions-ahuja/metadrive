import {useEffect,useState} from 'react';
import {Plus,X} from 'lucide-react';
import type {ObjectMetadata,FlowDefinitionMetadata} from '../../metadata/Definitions/metadata';

/** Optional Builder-only editor. Published runtime does not load this component. */
export default function GlobalQuickActionsEditor({
 apiRequest,objects,flows,onNotify
}:{
 apiRequest:<T>(path:string,init?:RequestInit)=>Promise<T>;
 objects:ObjectMetadata[];flows:FlowDefinitionMetadata[];onNotify:(message:string)=>void
}){
 const [smtpCredentials,setSmtpCredentials] = useState<Array<{id:string;label:string}>>([]);
 useEffect(()=>{
  let active=true;
  void apiRequest<{credentials:Array<{id:string;label:string;protocol:string;enabled:boolean}>}>('/named-credentials')
   .then(result=>{if(active)setSmtpCredentials(result.credentials
     .filter(c=>c.protocol==='SMTP'&&c.enabled).map(c=>({id:c.id,label:c.label})));})
   .catch(()=>{if(active)setSmtpCredentials([]);});
  return ()=>{active=false;};
 },[apiRequest]);
  type GlobalActionDraft={id:string;label:string;enabled:boolean;
    behavior:'Create Record'|'Run Flow'|'Send Email';targetObjectApi?:string;
    flowApiName?:string;credentialId?:string;fromEmail?:string};
  const [globalActions,setGlobalActions] = useState<GlobalActionDraft[]>([]);
  const [globalActionName,setGlobalActionName] = useState('');
  const [globalActionBehavior,setGlobalActionBehavior] = useState<GlobalActionDraft['behavior']>('Create Record');
  const [globalActionTarget,setGlobalActionTarget] = useState('');
  const [globalActionFlow,setGlobalActionFlow] = useState('');
  const [globalActionCredential,setGlobalActionCredential] = useState('');
  const [globalActionSender,setGlobalActionSender] = useState('');
  const [globalActionsError,setGlobalActionsError] = useState('');
  useEffect(()=>{
    let active=true;
    void apiRequest<{actions:GlobalActionDraft[]}>('/metadata/global-actions')
      .then(result=>{if(active)setGlobalActions(result.actions);})
      .catch(error=>{if(active)setGlobalActionsError(error instanceof Error?error.message:'Global actions unavailable');});
    return ()=>{active=false;};
  },[]);
  const saveGlobalActions=async()=>{
    try{
      await apiRequest('/metadata/global-actions',{method:'PUT',body:JSON.stringify({actions:globalActions})});
      setGlobalActionsError('');onNotify('Tenant global Quick Actions saved.');
    }catch(error){
      setGlobalActionsError(error instanceof Error?error.message:'Cannot save global actions');
    }
  };

 return <div className="metadata-card">
        <div className="section-toolbar"><div><h3>Global Quick Actions</h3>
          <p>Available throughout the tenant, subject to per-action OneEngine permissions.</p></div>
          <button className="btn btn-brand" type="button" onClick={()=>void saveGlobalActions()}>Save Global Actions</button>
        </div>
        {globalActionsError&&<div className="records-message" role="alert">{globalActionsError}</div>}
        {globalActions.map(action=><div className="metadata-card" key={action.id}>
          <div className="metadata-row"><label>{action.label} · {action.behavior}</label>
            <label><input type="checkbox" checked={action.enabled}
              onChange={event=>setGlobalActions(current=>current.map(a=>a.id===action.id?{...a,enabled:event.target.checked}:a))}/> Enabled</label>
            <button className="row-menu" type="button" aria-label={`Remove global action ${action.label}`}
              onClick={()=>setGlobalActions(current=>current.filter(a=>a.id!==action.id))}><X size={14}/></button>
          </div>
          {action.behavior==='Create Record'&&<select className="form-control"
            aria-label={`Target object for global ${action.label}`} value={action.targetObjectApi??''}
            onChange={event=>setGlobalActions(current=>current.map(a=>a.id===action.id?{...a,targetObjectApi:event.target.value}:a))}>
            <option value="">Choose Object</option>
            {objects.map(o=><option key={o.apiName} value={o.apiName}>{o.label}</option>)}
          </select>}
          {action.behavior==='Run Flow'&&<select className="form-control"
            aria-label={`Flow for global ${action.label}`} value={action.flowApiName??''}
            onChange={event=>setGlobalActions(current=>current.map(a=>a.id===action.id?{...a,flowApiName:event.target.value}:a))}>
            <option value="">Choose Flow</option>
            {flows.filter(f=>f.status==='Active').map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}
          </select>}
          {action.behavior==='Send Email'&&<>
            <select className="form-control" aria-label={`SMTP credential for global ${action.label}`}
              value={action.credentialId??''} onChange={event=>setGlobalActions(current=>current.map(a=>a.id===action.id?{...a,credentialId:event.target.value}:a))}>
              <option value="">Choose SMTP credential</option>
              {smtpCredentials.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input type="email" className="form-control" aria-label={`Sender for global ${action.label}`}
              placeholder="Verified sender" value={action.fromEmail??''}
              onChange={event=>setGlobalActions(current=>current.map(a=>a.id===action.id?{...a,fromEmail:event.target.value}:a))}/>
          </>}
        </div>)}
        <div className="record-type-create">
          <input className="form-control" aria-label="New global action name" maxLength={80}
            placeholder="Action label" value={globalActionName}
            onChange={event=>setGlobalActionName(event.target.value)}/>
          <select className="form-control" aria-label="New global action behavior" value={globalActionBehavior}
            onChange={event=>setGlobalActionBehavior(event.target.value as GlobalActionDraft['behavior'])}>
            <option value="Create Record">Create Record</option>
            <option value="Run Flow">Run Flow</option>
            <option value="Send Email">Send Email</option>
          </select>
          {globalActionBehavior==='Create Record'&&<select className="form-control"
            aria-label="Global action target Object" value={globalActionTarget} onChange={event=>setGlobalActionTarget(event.target.value)}>
            <option value="">Choose Object</option>
            {objects.map(o=><option key={o.apiName} value={o.apiName}>{o.label}</option>)}
          </select>}
          {globalActionBehavior==='Run Flow'&&<select className="form-control" aria-label="Global action Flow"
            value={globalActionFlow} onChange={event=>setGlobalActionFlow(event.target.value)}>
            <option value="">Choose Flow</option>
            {flows.filter(f=>f.status==='Active').map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}
          </select>}
          {globalActionBehavior==='Send Email'&&<>
            <select className="form-control" aria-label="Global action SMTP credential"
              value={globalActionCredential} onChange={event=>setGlobalActionCredential(event.target.value)}>
              <option value="">Choose SMTP credential</option>
              {smtpCredentials.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input className="form-control" type="email" aria-label="Global action sender"
              value={globalActionSender} onChange={event=>setGlobalActionSender(event.target.value)}
              placeholder="Sender email"/>
          </>}
          <button className="btn" type="button" disabled={!globalActionName.trim()
            ||(globalActionBehavior==='Create Record'&&!globalActionTarget)
            ||(globalActionBehavior==='Run Flow'&&!globalActionFlow)
            ||(globalActionBehavior==='Send Email'&&(!globalActionCredential||!globalActionSender))}
            onClick={()=>{
              const label=globalActionName.trim();
              if(globalActions.some(a=>a.label.toLowerCase()===label.toLowerCase())){
                onNotify('Global action labels must be unique');return;
              }
              setGlobalActions(current=>[...current,{id:'Global_'+crypto.randomUUID().replaceAll('-',''),
                label,enabled:true,behavior:globalActionBehavior,
                ...(globalActionBehavior==='Create Record'?{targetObjectApi:globalActionTarget}:{}),
                ...(globalActionBehavior==='Run Flow'?{flowApiName:globalActionFlow}:{}),
                ...(globalActionBehavior==='Send Email'?{credentialId:globalActionCredential,fromEmail:globalActionSender}:{})}]);
              setGlobalActionName('');
            }}><Plus size={14}/>Add Global Action</button>
        </div>
      </div>;
}
