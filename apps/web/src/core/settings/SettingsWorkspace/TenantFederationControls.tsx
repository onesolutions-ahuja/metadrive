import {useEffect,useState} from 'react';
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;
type Provider={id?:string;label:string;protocol:'oidc'|'saml';enabled:boolean;issuer:string;authorization_url:string;token_url:string;jwks_url:string;client_id:string;certificate:string;secret?:string};
const blank:Provider={label:'',protocol:'oidc',enabled:false,issuer:'',authorization_url:'',token_url:'',jwks_url:'',client_id:'',certificate:''};
export default function TenantFederationControls({request,canManage}:{request:Request;canManage:boolean}){
 const [providers,setProviders]=useState<Provider[]>([]),[draft,setDraft]=useState<Provider|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [links,setLinks]=useState<Array<{provider_id:string;subject:string;user_id:string}>>([]),[users,setUsers]=useState<Array<{id:string;name:string;email:string}>>([]);
 const [link,setLink]=useState({provider_id:'',subject:'',user_id:''});
 const [deployment,setDeployment]=useState({callbackUrl:'',configured:false});
 const load=async()=>{const [p,l,u]=await Promise.all([
  request<{providers:Provider[];deployment:typeof deployment}>('/auth/identity-providers'),request<{identities:typeof links}>('/auth/federated-identities'),request<{users:typeof users}>('/auth/user-locks')]);
  setProviders(p.providers);setDeployment(p.deployment);setLinks(l.identities);setUsers(u.users);};
 useEffect(()=>{void load().catch(e=>setMessage(String(e)));},[]);
 const run=async(fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setMessage('');try{await fn();await load();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const saveLink=(value:typeof link,remove=false)=>run(async()=>{await request('/auth/federated-identities',{method:'PUT',body:JSON.stringify({...value,remove})});setMessage(remove?'Link removed.':'Identity linked.');});
 return <section className="surface permission-section"><h2>Single sign-on and social identity</h2>
  <p>Configure an OIDC or SAML identity provider, then explicitly link its subject to a tenant user. Email matches never create accounts or permissions.</p>
  <p>OIDC token and JWKS requests use tenant-linked HTTPS Named Credentials. Saving OIDC settings requires Named Credential management and HTTP Callout execution permissions.</p>
  <p>{deployment.configured?<>Callback URL: <code>{deployment.callbackUrl}</code></>:'The deployment administrator must configure the public HTTPS authentication origin before SSO can run.'}</p>
  {providers.map(p=><div key={p.id}>{p.label} · {p.protocol.toUpperCase()} · {p.enabled?'Enabled':'Disabled'} {canManage&&<button type="button" className="btn" onClick={()=>setDraft({...p})}>Edit provider</button>}
   {p.protocol==='saml'&&deployment.configured&&<p>Service-provider Entity ID: <code>{deployment.callbackUrl}/{p.id}</code></p>}</div>)}
  {canManage&&!draft&&<button type="button" className="btn" onClick={()=>setDraft({...blank})}>Add identity provider</button>}
  {draft&&<div className="settings-edit-row">
   <label className="form-label">Protocol<select className="form-control" value={draft.protocol} onChange={e=>setDraft({...draft,protocol:e.target.value as Provider['protocol']})}><option value="oidc">OpenID Connect (including social providers)</option><option value="saml">SAML 2.0</option></select></label>
   {(['label','issuer','authorization_url',...(draft.protocol==='oidc'?['token_url','jwks_url','client_id','secret']:['certificate'])] as (keyof Provider)[]).map(key=><label className="form-label" key={key}>
    {{label:'Display name',issuer:'Identity provider issuer',authorization_url:'Authorization / SSO URL',token_url:'Token URL',jwks_url:'JWKS URL',client_id:'Client ID',secret:'Client secret (blank preserves saved secret)',certificate:'IdP signing certificate (PEM)'}[key as string]??key}
    {key==='certificate'?<textarea className="form-control" value={String(draft[key]??'')} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>:<input className="form-control" type={key==='secret'?'password':'text'} autoComplete="off" value={String(draft[key]??'')} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}
   </label>)}
   <label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>Enable provider</label>
   <button type="button" className="btn" disabled={busy} onClick={()=>setDraft(null)}>Cancel</button>
   <button type="button" className="btn btn-brand" disabled={busy} onClick={()=>void run(async()=>{await request('/auth/identity-providers',{method:'PUT',body:JSON.stringify(draft)});setDraft(null);setMessage('Identity provider saved.');})}>Save provider</button>
  </div>}
  <h3>Identity links</h3>
  {links.map(l=><div key={l.provider_id+l.subject}>{providers.find(p=>p.id===l.provider_id)?.label} · {l.subject} → {users.find(u=>u.id===l.user_id)?.email??l.user_id}
   {canManage&&<button className="btn" type="button" disabled={busy} onClick={()=>void saveLink(l,true)}>Remove link</button>}</div>)}
  {canManage&&<div className="settings-edit-row">
   <label className="form-label">Provider<select className="form-control" value={link.provider_id} onChange={e=>setLink({...link,provider_id:e.target.value})}><option value="">Choose provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
   <label className="form-label">User<select className="form-control" value={link.user_id} onChange={e=>setLink({...link,user_id:e.target.value})}><option value="">Choose user</option>{users.map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></label>
   <label className="form-label">Provider subject (OIDC sub or SAML NameID)<input className="form-control" value={link.subject} onChange={e=>setLink({...link,subject:e.target.value})}/></label>
   <button className="btn" type="button" disabled={busy||!link.provider_id||!link.user_id||!link.subject} onClick={()=>void saveLink(link)}>Link identity</button>
  </div>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
