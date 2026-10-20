import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {ObjectMetadata} from '../../metadata/Definitions/metadata';
import {appRoutePath} from '../../workspace/Navigation/appRouting';
import {buildAutomationFlow,type AutomationKind,type RecipeInput} from './businessAutomationRecipes';
const empty=(objectApi:string):RecipeInput=>({
 kind:'Assignment',objectApi,apiName:'',label:'',trigger:'created',
 conditions:[],offsetAmount:1,offsetUnit:'Days'
});
export default function BusinessAutomationsPanel({object}:{object:ObjectMetadata}){
 const [draft,setDraft]=useState<RecipeInput>(()=>empty(object.apiName));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [users,setUsers]=useState<Array<{Id:string;Name?:string;Email?:string;IsActive?:boolean}>>([]);
 const [credentials,setCredentials]=useState<Array<{id:string;name:string;label:string;protocol:string;enabled:boolean}>>([]);
 const [flows,setFlows]=useState<Array<{apiName:string;label:string;flowType:string;status:string;triggerObject?:string}>>([]);
 useEffect(()=>{
   let active=true;
   void Promise.allSettled([
     apiRequest<{records:Array<{Id:string;Name?:string;Email?:string;IsActive?:boolean}>}>('/records/User?limit=100'),
     apiRequest<{credentials:Array<{id:string;name:string;label:string;protocol:string;enabled:boolean}>}>('/named-credentials'),
     apiRequest<{flows:Array<{apiName:string;label:string;flowType:string;status:string;triggerObject?:string}>}>('/metadata/flows')
   ]).then(results=>{
     if(!active)return;
     if(results[0].status==='fulfilled')setUsers(results[0].value.records);
     if(results[1].status==='fulfilled')setCredentials(results[1].value.credentials);
     if(results[2].status==='fulfilled')setFlows(results[2].value.flows);
   });
   return()=>{active=false};
 },[]);
 const fields=object.fields;
 const textFields=fields.filter(f=>['Email','Text'].includes(f.dataType));
 const dateFields=fields.filter(f=>['Date','Date/Time','DateTime'].includes(f.dataType));
 const change=(values:Partial<RecipeInput>)=>setDraft(current=>({...current,...values}));
 const create=async()=>{
  setBusy(true);setError('');
  try{
   const payload=buildAutomationFlow({...draft,objectApi:object.apiName});
   const validation=await apiRequest<{valid:boolean;errors?:string[]}>(
     '/metadata/flows/'+encodeURIComponent(payload.apiName)+'/validate',
     {method:'POST',body:JSON.stringify(payload)});
   if(!validation.valid)throw Error((validation.errors??['Automation Flow validation failed']).join('; '));
   const response=await apiRequest<{flow:{apiName:string}}>(
     '/metadata/flows/'+encodeURIComponent(payload.apiName),
     {method:'PUT',body:JSON.stringify(payload)});
   if(!response.flow?.apiName)throw Error('Flow draft was not returned');
   window.location.assign(appRoutePath({kind:'setup',workspace:'flow-builder',resourceApiName:response.flow.apiName}));
  }catch(e){setError(e instanceof Error?e.message:'Unable to create Flow draft');setBusy(false);}
 };
 return <section className="surface object-setting-surface">
  <div className="section-toolbar"><div><h2>Business Automation Recipes</h2>
   <p>Configure an assignment, automatic response or escalation using the shared Flow engine.
    Generated Flows remain drafts until validated and activated in Flow Builder.</p></div></div>
  {error&&<p role="alert">{error}</p>}
  <div className="metadata-card"><h3>Existing record automations</h3>
    <p>These are managed in the shared Flow Builder. Activation and deactivation retain Flow version history.</p>
    {flows.filter(f=>f.flowType==='Record-Triggered Flow'&&f.triggerObject===object.apiName)
      .map(flow=><div key={flow.apiName} className="metadata-row">
      <span><strong>{flow.label}</strong><small>{flow.status} · {flow.apiName}</small></span>
      <a className="btn" href={appRoutePath({kind:'setup',workspace:'flow-builder',resourceApiName:flow.apiName})}>Open in Flow Builder</a>
      </div>)}
    {flows.filter(f=>f.flowType==='Record-Triggered Flow'&&f.triggerObject===object.apiName).length===0
     &&<p>No record-triggered Flows for this object.</p>}
  </div>

  <label className="form-label">Automation type<select className="form-control" value={draft.kind}
   onChange={e=>setDraft({...empty(object.apiName),kind:e.target.value as AutomationKind})}>
   <option>Assignment</option><option>Auto Response</option><option>Escalation</option>
  </select></label>
  <label className="form-label">Label<input className="form-control" value={draft.label}
   onChange={e=>change({label:e.target.value,apiName:e.target.value.trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'')})}/></label>
  <label className="form-label">API name<input className="form-control" value={draft.apiName} onChange={e=>change({apiName:e.target.value})}/></label>
  {draft.kind!=='Escalation'&&<label className="form-label">Run when<select className="form-control" value={draft.trigger}
   onChange={e=>change({trigger:e.target.value as RecipeInput['trigger']})}>
   <option value="created">Record created</option><option value="updated">Record updated</option>
   <option value="created-or-updated">Created or updated</option></select></label>}
  <div className="metadata-card"><h3>Entry conditions</h3>
   <p>Optional; matching records enter the Flow. Use Flow Builder to add more complex decisions.</p>
   {draft.conditions.map((condition,i)=><div key={i} className="form-options">
    <select className="form-control" value={condition.field} onChange={e=>change({conditions:draft.conditions.map((c,j)=>j===i?{...c,field:e.target.value}:c)})}>
     <option value="">Select field</option>{fields.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}</select>
    <select className="form-control" value={condition.operator} onChange={e=>change({conditions:draft.conditions.map((c,j)=>j===i?{...c,operator:e.target.value}:c)})}>
     <option value="Equals">Equals</option><option value="Not Equal To">Not equal</option>
     <option value="Contains">Contains</option></select>
    <input className="form-control" value={condition.value} onChange={e=>change({conditions:draft.conditions.map((c,j)=>j===i?{...c,value:e.target.value}:c)})}/>
    <button className="btn" onClick={()=>change({conditions:draft.conditions.filter((_,j)=>j!==i)})}>Remove</button>
   </div>)}
   <button className="btn" disabled={draft.conditions.length>=20} onClick={()=>change({conditions:[...draft.conditions,{field:'',operator:'Equals',value:''}]})}>Add condition</button>
  </div>
  {draft.kind==='Assignment'&&<div className="metadata-card">
   <h3>Assign record</h3>
   <label className="form-label">Assign to user<select className="form-control" value={draft.assigneeId??''}
    onChange={e=>change({assigneeId:e.target.value})}>
    <option value="">Select user</option>{users.filter(u=>u.IsActive!==false).map(user=>
      <option key={user.Id} value={user.Id}>{user.Name??user.Email??user.Id}</option>)}
   </select></label>
   <p>Owner is updated through the shared RecordEngine and its permission checks.
    Use a creation trigger to avoid reassignment loops.</p>
  </div>}
  {draft.kind==='Auto Response'&&<div className="metadata-card"><h3>Automatic email</h3>
   <label className="form-label">SMTP Named Credential<select className="form-control" value={draft.namedCredentialId??''}
    onChange={e=>change({namedCredentialId:e.target.value})}>
    <option value="">Select configured SMTP connection</option>
    {credentials.filter(c=>c.protocol==='SMTP'&&c.enabled).map(c=>
      <option key={c.id} value={c.id}>{c.label||c.name}</option>)}
   </select></label>
   <label className="form-label">From email<input className="form-control" value={draft.fromEmail??''} onChange={e=>change({fromEmail:e.target.value})}/></label>
   <label className="form-label">Recipient email field<select className="form-control" value={draft.recipientField??''} onChange={e=>change({recipientField:e.target.value})}>
    <option value="">Select field</option>{textFields.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}</select></label>
   <label className="form-label">Subject<input className="form-control" value={draft.subject??''} onChange={e=>change({subject:e.target.value})}/></label>
   <label className="form-label">Message<textarea className="form-control" rows={4} value={draft.body??''} onChange={e=>change({body:e.target.value})}/></label>
  </div>}
  {draft.kind==='Escalation'&&<div className="metadata-card"><h3>Durable scheduled escalation</h3>
   <label className="form-label">Date/time field<select className="form-control" value={draft.dueField??''} onChange={e=>change({dueField:e.target.value})}>
    <option value="">Select field</option>{dateFields.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}</select></label>
   <label className="form-label">Offset<input type="number" className="form-control" value={draft.offsetAmount??1}
    onChange={e=>change({offsetAmount:Number(e.target.value)})}/></label>
   <label className="form-label">Unit<select className="form-control" value={draft.offsetUnit??'Days'} onChange={e=>change({offsetUnit:e.target.value})}>
    <option>Minutes</option><option>Hours</option><option>Days</option></select></label>
   <label className="form-label">Escalation task subject<input className="form-control" value={draft.taskSubject??''} onChange={e=>change({taskSubject:e.target.value})}/></label>
  </div>}
  <div className="modal-actions"><button className="btn btn-brand" disabled={busy||!draft.label||!draft.apiName}
   onClick={()=>void create()}>{busy?'Creating…':'Create Flow Draft'}</button></div>
 </section>;
}
