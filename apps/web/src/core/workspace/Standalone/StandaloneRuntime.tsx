import * as React from 'react';
import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {StandaloneEntry} from './standaloneEntries';
import './standaloneRuntime.css';

type DataRow=Record<string,unknown>;
type ObjectInfo={apiName:string;label?:string;fields?:Array<{apiName:string;label?:string;type?:string;required?:boolean}>};
const sections:Record<string,Array<{label:string;object:string}>>={
  acetill:[{label:'Products',object:'Product'},{label:'Customers',object:'Customer'},{label:'Carts',object:'Cart'},{label:'Orders',object:'Order'}],
  aceassist:[{label:'Appointments',object:'Appointment'},{label:'Customers',object:'Customer'},{label:'Quotations',object:'Quotation'},{label:'Quotation lines',object:'QuotationLine'},{label:'Invoices',object:'Invoice'}]
};
const show=(value:unknown)=>value==null?'—':typeof value==='object'?JSON.stringify(value):String(value);

/** Dedicated React product workspaces. Server-side tenant and RBAC rules remain authoritative. */
export default function StandaloneRuntime({entry,onLogout}:{entry:StandaloneEntry;onLogout:()=>void}) {
  const tabs=sections[entry.slug]??[];
  const [objects,setObjects]=useState<ObjectInfo[]>([]);
  const [selected,setSelected]=useState(0);
  const [rows,setRows]=useState<DataRow[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [flowInput,setFlowInput]=useState('{}');
  const [flowActions,setFlowActions]=useState<Array<{apiName:string;label:string}>>([]);
  const [flowError,setFlowError]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    let active=true;
    void apiRequest<{actions:Array<{apiName:string;label:string}>}>(
      '/flows/available-actions?product='+encodeURIComponent(entry.appId)
    ).then(response=>{if(active){setFlowActions(response.actions??[]);setFlowError('');}})
      .catch(e=>{if(active){setFlowActions([]);setFlowError(e instanceof Error?e.message:String(e));}});
    return()=>{active=false;};
  },[entry.appId]);
  const current=tabs[selected];
  const metadata=objects.find(o=>o.apiName.toLowerCase()===current?.object.toLowerCase());
  useEffect(()=>{
    let active=true;setBusy(true);setError('');
    void apiRequest<{objects:ObjectInfo[]}>('/metadata/objects').then(response=>{
      if(active)setObjects(response.objects??[]);
    }).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    let active=true;setRows([]);setMessage('');
    if(!metadata)return;
    setBusy(true);setError('');
    void apiRequest<{records:DataRow[]}>(`/records/${encodeURIComponent(metadata.apiName)}?limit=50`).then(response=>{
      if(active)setRows(response.records??[]);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[metadata?.apiName,reload]);
  const execute=async(flow:string)=>{
    try{
      const values=JSON.parse(flowInput);
      if(!values||Array.isArray(values)||typeof values!=='object')throw Error('Flow inputs must be an object');
      setBusy(true);setError('');setMessage('');
      const result=await apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>('/flows/'+encodeURIComponent(flow)+'/execute',{method:'POST',body:JSON.stringify(values)});
      setMessage(result.interviewId?'Flow paused; no completion confirmed':`Flow response: ${JSON.stringify(result.outputs??result)}`);
      setReload(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* Clear local session regardless. */}
    onLogout();window.location.assign('/login');
  };
  return <div className="standalone-product" style={{'--product-accent':entry.accent} as React.CSSProperties}>
    <header className="standalone-product-header">
      <div className="standalone-product-brand"><span className="standalone-product-mark">{entry.label[0]}</span><span><strong>{entry.label}</strong><small>{entry.tagline}</small></span></div>
      <button type="button" className="standalone-product-logout" onClick={()=>void logout()}>Sign out</button>
    </header>
    <nav className="standalone-product-nav" aria-label={entry.label+' sections'}>
      {tabs.map((tab,i)=><button key={tab.object} type="button" aria-current={selected===i?'page':undefined} onClick={()=>setSelected(i)}>{tab.label}</button>)}
    </nav>
    <main className="standalone-product-content">
      <h1>{current?.label??entry.label}</h1>
      <p>Live tenant records are read-only here. All business changes run through centrally authorised OneEngine workflows.</p>
      {error&&<p role="alert" className="standalone-product-message">{error}</p>}
      {message&&<p role="status" className="standalone-product-message">{message}</p>}
      {!metadata&&!busy&&<p role="status">The {current?.object} object is not available to this user or tenant. Check Object Manager and permissions.</p>}
      {metadata&&<>
        <div style={{marginBottom:16}}>
          <button type="button" disabled={busy} onClick={()=>setReload(v=>v+1)}>Refresh</button>
        </div>
        {busy?<p role="status">Loading records…</p>:rows.length===0?<p>No accessible records.</p>:
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{Object.keys(rows[0]).slice(0,8).map(key=><th key={key} scope="col" style={{padding:10,textAlign:'left'}}>{key}</th>)}</tr></thead>
          <tbody>{rows.map((row,i)=><tr key={String(row.Id??i)}>{Object.keys(rows[0]).slice(0,8).map(key=><td key={key} style={{padding:10,borderTop:'1px solid #8884'}}>{show(row[key])}</td>)}</tr>)}</tbody>
        </table></div>}
      </>}
      <section style={{marginTop:32}}>
        <h2>Backend workflows</h2><p>Only active OneEngine flows authorised for this user appear here. Administrators manage them in Flow Builder.</p>
        {flowError&&<p role="alert">Could not load workflows: {flowError}</p>}
        {!flowError&&flowActions.length===0&&<p>No active, permitted workflows configured for this frontend.</p>}
        <label>Flow inputs (JSON)<textarea style={{display:'block',width:'100%',maxWidth:650}} rows={3} value={flowInput} onChange={e=>setFlowInput(e.target.value)}/></label>
        <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:12}}>{flowActions.map(action=>
          <button type="button" key={action.apiName} disabled={busy} onClick={()=>void execute(action.apiName)}>{action.label}</button>)}</div>
      </section>
    </main>
  </div>;
}
