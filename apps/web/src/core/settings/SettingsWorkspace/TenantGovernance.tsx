import {useEffect,useState} from 'react';
import TenantConnectedApps from './TenantConnectedApps';
import TenantLicenses from './TenantLicenses';
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;
type Audit={id:string;actor_user_id:string|null;table_name:string;operation:string;row_identifier:string;changed_fields:string[];created_at:string};
export default function TenantGovernance({request,canManage}:{request:Request;canManage:boolean}){
 const [tab,setTab]=useState('audit');
 return <section className="surface permission-section"><h2>Security governance</h2><div className="permission-tabs">{['audit','monitoring','licences','connected apps'].map(t=><button className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
 {tab==='audit'&&<AuditTrail request={request}/>}{tab==='monitoring'&&<Monitoring request={request}/>}{tab==='licences'&&<TenantLicenses request={request} canManage={canManage}/>}{tab==='connected apps'&&<TenantConnectedApps request={request}/>}
 </section>;
}
function AuditTrail({request}:{request:Request}){
 const [events,setEvents]=useState<Audit[]>([]),[next,setNext]=useState<string|null>(null),[exportCursor,setExportCursor]=useState<string|null>(null),[table,setTable]=useState(''),[global,setGlobal]=useState(false),[tables,setTables]=useState<{table_name:string}[]>([]),[message,setMessage]=useState('');
 const params=()=>new URLSearchParams({...table?{table}:{},...global?{global:'true'}:{}});
 const load=async(before?:string)=>{const p=params();if(before)p.set('before',before);const r=await request<{events:Audit[];nextCursor:string|null}>('/security/audit?'+p);setEvents(before?[...events,...r.events]:r.events);setNext(r.nextCursor);};
 useEffect(()=>{void request<{tables:typeof tables}>('/security/audit/coverage').then(r=>setTables(r.tables)).catch(e=>setMessage(String(e)));},[]);
 useEffect(()=>{setExportCursor(null);void load().catch(e=>setMessage(String(e)));},[table,global]);
 const download=async()=>{const p=params();if(exportCursor)p.set('before',exportCursor);const r=await request<{csv:string;nextCursor:string|null}>('/security/audit/export?'+p);const url=URL.createObjectURL(new Blob([r.csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='setup-audit.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportCursor(r.nextCursor);setMessage(r.nextCursor?'More export rows are available. Download the next page.':'Export complete for this page range.');};
 return <><h3>Setup Audit Trail</h3><p>Append-only history of setup row changes. Values and secrets are excluded. Each change records its actor and correlation ID; background and migration changes can have no user actor.</p>
 <label className="form-label">Setup table<select className="form-control" value={table} onChange={e=>setTable(e.target.value)}><option value="">All setup tables</option>{tables.map(t=><option key={t.table_name}>{t.table_name}</option>)}</select></label>
 <label className="checkbox-row"><input type="checkbox" checked={global} onChange={e=>setGlobal(e.target.checked)}/>Global setup (platform permission required)</label>
 <button className="btn" onClick={()=>void download().catch(e=>setMessage(String(e)))}>{exportCursor?'Download next 5,000 CSV rows':'Export CSV (up to 5,000 rows)'}</button>
 {message&&<p role="status">{message}</p>}<table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Setup table</th><th>Operation</th><th>Row</th><th>Changed fields</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleString()}</td><td>{e.actor_user_id??'System'}</td><td>{e.table_name}</td><td>{e.operation}</td><td>{e.row_identifier}</td><td>{e.changed_fields.join(', ')}</td></tr>)}</tbody></table>
 {next&&<button className="btn" onClick={()=>void load(next).catch(e=>setMessage(String(e)))}>Load older changes</button>}</>;
}
type Rule={id?:string;label:string;enabled:boolean;event_type:string;method:string;path_prefix:string;threshold:number;window_seconds:number;response:string;flow_api:string|null;service_user_id:string|null};
type Monitor={events:{id:string;created_at:string;event_type:string;resource:string;method:string;status_code:number;elapsed_ms:number}[];rules:Rule[];settings:{enabled:boolean;retention_days:number};summary:{requests:number;errors:number;average_ms:number};nextCursor:string|null};
const emptyRule=():Rule=>({label:'',enabled:false,event_type:'api',method:'*',path_prefix:'/api',threshold:100,window_seconds:60,response:'Block',flow_api:null,service_user_id:null});
function Monitoring({request}:{request:Request}){
 const [data,setData]=useState<Monitor|null>(null),[draft,setDraft]=useState<Rule>(emptyRule),[message,setMessage]=useState(''),[users,setUsers]=useState<{id:string;email:string}[]>([]),[flows,setFlows]=useState<{apiName:string;label:string}[]>([]);
 const load=async(before?:string)=>{const r=await request<Monitor>('/security/monitoring'+(before?'?before='+encodeURIComponent(before):''));setData(before&&data?{...r,events:[...data.events,...r.events]}:r);};
 useEffect(()=>{void load().catch(e=>setMessage(String(e)));void request<{users:typeof users}>('/security/licenses').then(r=>setUsers(r.users)).catch(()=>{});void request<{flows:typeof flows}>('/metadata/flows/list?page=1&search=').then(r=>setFlows(r.flows)).catch(()=>{});},[]);
 const save=(path:string,input:unknown)=>{setMessage('');void request(path,{method:'PUT',body:JSON.stringify(input)}).then(()=>load()).then(()=>setMessage('Saved')).catch(e=>setMessage(String(e)));};
 return <><h3>Event Monitoring and Transaction Security</h3><p>Rules count authenticated requests per user and time window. Blocking starts at the threshold. Flow responses run once per window through the durable Flow worker, using the selected service identity.</p>{message&&<p role="status">{message}</p>}
 {data&&<><p>Last 24 hours: {data.summary.requests} requests, {data.summary.errors} errors, average {data.summary.average_ms} ms</p>
 <label className="checkbox-row"><input type="checkbox" checked={data.settings.enabled} onChange={e=>setData({...data,settings:{...data.settings,enabled:e.target.checked}})}/>Record request events (rules remain enforced)</label>
 <label className="form-label">Event retention days<input className="form-control" type="number" min="90" max="3650" value={data.settings.retention_days} onChange={e=>setData({...data,settings:{...data.settings,retention_days:Number(e.target.value)}})}/></label>
 <button className="btn" onClick={()=>save('/security/monitoring',data.settings)}>Save monitoring settings</button> <button className="btn" onClick={()=>void request('/security/monitoring/prune',{method:'POST'}).then(()=>load()).catch(e=>setMessage(String(e)))}>Remove events older than retention</button>
 <label className="form-label">Transaction rule<select className="form-control" value={draft.id??''} onChange={e=>setDraft(data.rules.find(r=>r.id===e.target.value)??emptyRule())}><option value="">New rule</option>{data.rules.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
 <label className="form-label">Rule name<input className="form-control" value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
 <label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>Enabled</label>
 {(['event_type','method','response'] as const).map((key,i)=><label className="form-label" key={key}>{['Event','HTTP method','Response'][i]}<select className="form-control" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}>{[['api','metadata','login'],['*','GET','POST','PUT','PATCH','DELETE'],['Block','RevokeSessions','Flow']][i].map(v=><option key={v}>{v}</option>)}</select></label>)}
 <label className="form-label">Request path prefix<input className="form-control" value={draft.path_prefix} onChange={e=>setDraft({...draft,path_prefix:e.target.value})}/></label>
 {(['threshold','window_seconds'] as const).map((key,i)=><label className="form-label" key={key}>{['Request threshold','Window in seconds'][i]}<input className="form-control" type="number" min="1" value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/></label>)}
 {draft.response==='Flow'&&<><label className="form-label">Published Flow<select className="form-control" value={draft.flow_api??''} onChange={e=>setDraft({...draft,flow_api:e.target.value||null})}><option value="">Select Flow</option>{flows.map(f=><option key={f.apiName} value={f.apiName}>{f.label||f.apiName}</option>)}</select></label><label className="form-label">Service user<select className="form-control" value={draft.service_user_id??''} onChange={e=>setDraft({...draft,service_user_id:e.target.value||null})}><option value="">Select user</option>{users.map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select></label></>}
 <button className="btn btn-brand" onClick={()=>save('/security/monitoring/rules',draft)}>Save rule</button>
 <table className="data-table"><thead><tr><th>Time</th><th>Event</th><th>Request</th><th>Status</th><th>Milliseconds</th></tr></thead><tbody>{data.events.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleString()}</td><td>{e.event_type}</td><td>{e.method} {e.resource}</td><td>{e.status_code||'In progress'}</td><td>{e.elapsed_ms}</td></tr>)}</tbody></table>
 {data.nextCursor&&<button className="btn" onClick={()=>void load(data.nextCursor!).catch(e=>setMessage(String(e)))}>Load older events</button>}</>}
 </>;
}
