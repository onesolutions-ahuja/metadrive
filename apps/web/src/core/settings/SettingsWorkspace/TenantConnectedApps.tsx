import {useEffect,useState} from 'react';
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;
type Client={id?:string;label:string;enabled:boolean;client_type:'public'|'confidential';require_mfa:boolean;redirects:string[];scopes:string[];users:string[]};
type Data={clients:Client[];users:{id:string;email:string}[];scopes:string[]};
const fresh=():Client=>({label:'',enabled:false,client_type:'public',require_mfa:true,redirects:[],scopes:['records:read'],users:[]});
export default function TenantConnectedApps({request}:{request:Request}){
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Client>(fresh),[message,setMessage]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>request<Data>('/security/connected-apps').then(setData);
 useEffect(()=>{void load().catch(e=>setMessage(String(e)));},[]);
 const toggle=(key:'scopes'|'users',v:string)=>setDraft({...draft,[key]:draft[key].includes(v)?draft[key].filter(x=>x!==v):[...draft[key],v]});
 return <section className="surface permission-section"><h2>Connected Apps</h2><p>OAuth authorization code with PKCE (S256), explicit user consent and rotating refresh tokens. Editing an app revokes existing consents. Secret values are shown once.</p>
  {message&&<p role="status">{message}</p>}{secret&&<p role="status">Save this client secret now: <code>{secret}</code> <button className="btn" onClick={()=>setSecret('')}>Dismiss</button></p>}
  {data&&<><label className="form-label">Application<select className="form-control" value={draft.id??''} onChange={e=>{setDraft(data.clients.find(c=>c.id===e.target.value)??fresh());setSecret('');}}><option value="">New connected app</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
  {draft.id&&<p>Client ID: <code>{draft.id}</code></p>}
  {draft.id&&draft.client_type==='confidential'&&<button className="btn" disabled={busy} onClick={()=>{setBusy(true);void request<{clientSecret:string}>('/security/connected-apps/rotate-secret',{method:'POST',body:JSON.stringify({id:draft.id})}).then(r=>{setSecret(r.clientSecret);setMessage('Secret rotated; existing consents revoked.');}).catch(e=>setMessage(String(e))).finally(()=>setBusy(false));}}>Rotate client secret and revoke consents</button>}
  <label className="form-label">Name<input className="form-control" value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
  <label className="form-label">Client type<select className="form-control" disabled={Boolean(draft.id)} value={draft.client_type} onChange={e=>setDraft({...draft,client_type:e.target.value as Client['client_type']})}><option value="public">Public (browser or native app)</option><option value="confidential">Confidential (server stores a secret)</option></select></label>
  <label className="form-label">Exact HTTPS redirect URLs, one per line<textarea className="form-control" value={draft.redirects.join('\n')} onChange={e=>setDraft({...draft,redirects:e.target.value.split('\n')})}/></label>
  <label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>Enabled</label>
  <label className="checkbox-row"><input type="checkbox" checked={draft.require_mfa} onChange={e=>setDraft({...draft,require_mfa:e.target.checked})}/>Require MFA at consent</label>
  <fieldset><legend>Allowed scopes</legend>{data.scopes.map(s=><label className="checkbox-row" key={s}><input type="checkbox" checked={draft.scopes.includes(s)} onChange={()=>toggle('scopes',s)}/>{s}</label>)}</fieldset>
  <fieldset><legend>Allowed users</legend>{data.users.map(u=><label className="checkbox-row" key={u.id}><input type="checkbox" checked={draft.users.includes(u.id)} onChange={()=>toggle('users',u.id)}/>{u.email}</label>)}</fieldset>
  <button className="btn btn-brand" disabled={busy} onClick={()=>{setBusy(true);setMessage('');void request<{id:string;clientSecret?:string}>('/security/connected-apps',{method:'PUT',body:JSON.stringify(draft)}).then(async r=>{setDraft({...draft,id:r.id});setSecret(r.clientSecret??'');setMessage('Saved');await load();}).catch(e=>setMessage(String(e))).finally(()=>setBusy(false));}}>Save connected app</button></>}
 </section>;
}
