import AcetillTerminal from '../../../../../acetill/src/AcetillTerminal';
import * as React from 'react';
import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {StandaloneEntry} from './standaloneEntries';
import './standaloneRuntime.css';
const LazyAceChatter=React.lazy(()=>import('./AceChatterRuntime'));

type DataRow=Record<string,unknown>;
type ObjectInfo={apiName:string;label?:string;fields?:Array<{apiName:string;label?:string;type?:string;required?:boolean}>};
const sections:Record<string,Array<{label:string;object:string}>>={
  acetill:[{label:'Products',object:'Product'},{label:'Customers',object:'Customer'},{label:'Carts',object:'Cart'},{label:'Orders',object:'Order'}],
  aceassist:[{label:'Appointments',object:'Appointment'},{label:'Customers',object:'Customer'},{label:'Quotations',object:'Quotation'},{label:'Quotation lines',object:'QuotationLine'},{label:'Invoices',object:'Invoice'}]
};
const show=(value:unknown)=>value==null?'—':typeof value==='object'?JSON.stringify(value):String(value);

/** Dedicated React product workspaces. Server-side tenant and RBAC rules remain authoritative. */
function LegacyStandaloneRuntime({entry,onLogout}:{entry:StandaloneEntry;onLogout:()=>void}) {
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
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* Clear local session regardless. */}
    onLogout();window.location.assign('/login');
  };

  const [search,setSearch]=useState('');
  const [cart,setCart]=useState<Array<{id:string;name:string;price:number;qty:number}>>([]);
  const [day,setDay]=useState(()=>new Date().toISOString().slice(0,10));
  const [chosen,setChosen]=useState<DataRow|null>(null);
  const visible=rows.filter(row=>Object.values(row).some(v=>String(v??'').toLowerCase().includes(search.toLowerCase())));
  const money=(value:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value);
  const priceOf=(row:DataRow)=>Number(row.Price??row.UnitPrice??row.SalePrice??0);
  const itemName=(row:DataRow)=>String(row.Name??row.Subject??row.Title??row.Id??'Unnamed');
  const startOfWeek=new Date(day+'T12:00:00');
  startOfWeek.setDate(startOfWeek.getDate()-((startOfWeek.getDay()+6)%7));
  const week=Array.from({length:7},(_,index)=>{
    const d=new Date(startOfWeek);d.setDate(d.getDate()+index);return d.toISOString().slice(0,10);
  });
  const workflowInputs=()=>{
    const parsed=JSON.parse(flowInput);
    if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('Inputs must be a JSON object');
    return {...parsed,...(entry.slug==='acetill'?{cartItems:cart.map(item=>({productId:item.id,quantity:item.qty})),cartTotal:cart.reduce((sum,item)=>sum+item.price*item.qty,0)}:{}),...(chosen?{recordId:chosen.Id}:{})};
  };
  const runAction=async(apiName:string)=>{
    try{
      setBusy(true);setError('');setMessage('');
      const result=await apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>('/flows/'+encodeURIComponent(apiName)+'/execute',{
        method:'POST',body:JSON.stringify(workflowInputs())
      });
      setMessage(result.interviewId?'Workflow waiting for further input':JSON.stringify(result.outputs??result));
      setReload(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const actions=<section className="custom-actions">
    <div className="custom-panel-title"><h2>Actions</h2><span>OneEngine workflows</span></div>
    {flowError&&<p role="alert">{flowError}</p>}
    {!flowError&&flowActions.length===0&&<p>No permitted active workflows yet. Configure and activate them in MetaDrive Flow Builder.</p>}
    <div className="custom-action-buttons">{flowActions.map(action=>
      <button key={action.apiName} type="button" disabled={busy} onClick={()=>void runAction(action.apiName)}>{action.label}</button>)}</div>
    <details className="custom-inputs"><summary>Additional workflow inputs</summary>
      <textarea aria-label="Workflow inputs JSON" value={flowInput} onChange={e=>setFlowInput(e.target.value)} rows={4}/></details>
  </section>;
  return <div className={'standalone-product custom-'+entry.slug} style={{'--product-accent':entry.accent} as React.CSSProperties}>
    <header className="standalone-product-header">
      <div className="standalone-product-brand"><span className="standalone-product-mark">{entry.label[0]}</span>
        <span><strong>{entry.label}</strong><small>{entry.tagline}</small></span></div>
      <span className="custom-connected">OneEngine connected</span>
      <button type="button" className="standalone-product-logout" onClick={()=>void logout()}>Sign out</button>
    </header>
    {error&&<div role="alert" className="standalone-product-message">{error}</div>}
    {message&&<div role="status" className="standalone-product-message">{message}</div>}
    {entry.slug==='acetill'?<main className="custom-pos">
      <section className="custom-catalog">
        <div className="custom-heading"><div><span className="custom-eyebrow">POINT OF SALE</span><h1>New sale</h1><p>Choose products from your tenant catalogue</p></div>
          <input aria-label="Search products" placeholder="Search products..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <nav className="custom-tabs" aria-label="POS sections">{tabs.map((tab,i)=>
          <button type="button" key={tab.object} aria-current={selected===i?'page':undefined} onClick={()=>{setSelected(i);setSearch('');}}>{tab.label}</button>)}</nav>
        {!metadata&&!busy?<p className="custom-empty">The {current?.object} object is unavailable to this tenant or user.</p>:
          busy?<p role="status">Loading tenant records…</p>:
          <div className="custom-product-grid">{visible.length===0?<div className="custom-empty">No accessible {current?.label.toLowerCase()} found.</div>:
            visible.map((row,i)=><button className="custom-product" type="button" key={String(row.Id??i)}
              onClick={()=>{
                if(current.object!=='Product'){setChosen(row);return;}
                const id=String(row.Id??'');if(!id)return;
                const price=priceOf(row);if(!Number.isFinite(price)||price<0){setError('Invalid product price');return;}
                setCart(previous=>{const found=previous.find(p=>p.id===id);return found?previous.map(p=>p.id===id?{...p,qty:p.qty+1}:p):[...previous,{id,name:itemName(row),price,qty:1}];});
              }}>
              <span className="custom-product-icon">{itemName(row).slice(0,1).toUpperCase()}</span>
              <strong>{itemName(row)}</strong>
              <small>{current.object==='Product'?money(priceOf(row)):String(row.Status??row.Id??'')}</small>
              <span className="custom-product-add">{current.object==='Product'?'Add +':'Select →'}</span></button>)}</div>}
      </section>
      <aside className="custom-basket"><div className="custom-panel-title"><h2>Current sale</h2><span>{cart.reduce((n,p)=>n+p.qty,0)} items</span></div>
        {cart.length===0?<div className="custom-empty">Your basket is empty. Select products to get started.</div>:
          <div className="custom-cart-lines">{cart.map(item=><div className="custom-cart-line" key={item.id}>
            <div><strong>{item.name}</strong><small>{money(item.price)} each</small></div>
            <div className="custom-qty"><button type="button" onClick={()=>setCart(v=>v.map(x=>x.id===item.id?{...x,qty:x.qty-1}:x).filter(x=>x.qty>0))}>−</button>
              <span>{item.qty}</span><button type="button" onClick={()=>setCart(v=>v.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x))}>+</button></div></div>)}</div>}
        <div className="custom-total"><span>Basket subtotal</span><strong>{money(cart.reduce((sum,item)=>sum+item.price*item.qty,0))}</strong></div>
        <p className="custom-note">Final totals, taxes, inventory and payment approval are determined by your OneEngine workflow—not this preview basket.</p>
        {chosen&&<p>Selected: {itemName(chosen)}</p>}
        {actions}
      </aside>
    </main>:<main className="custom-assist">
      <div className="custom-heading"><div><span className="custom-eyebrow">ACE ASSIST</span><h1>Schedule & visits</h1><p>Your tenant appointments and service activity</p></div>
        <label className="custom-date">Week of <input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label></div>
      <nav className="custom-tabs" aria-label="Booking sections">{tabs.map((tab,i)=><button type="button" key={tab.object}
        aria-current={selected===i?'page':undefined} onClick={()=>{setSelected(i);setChosen(null);}}>{tab.label}</button>)}</nav>
      <div className="custom-assist-layout"><section className="custom-calendar">
        <div className="custom-panel-title"><h2>{current?.label}</h2><button type="button" onClick={()=>setReload(n=>n+1)}>Refresh</button></div>
        {current?.object==='Appointment'?<div className="custom-week">{week.map(date=><div className="custom-day" key={date}>
          <strong>{new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</strong><small>{date.slice(8)}</small>
          {rows.filter(r=>String(r.StartDateTime??r.Start??r.Date??r.AppointmentDate??'').slice(0,10)===date).map((row,i)=>
            <button type="button" key={String(row.Id??i)} className="custom-visit" onClick={()=>setChosen(row)}>
              {itemName(row)}<small>{String(row.Status??'Scheduled')}</small></button>)}
        </div>)}</div>:
          <div className="custom-record-list">{rows.map((row,i)=><button key={String(row.Id??i)} type="button"
            onClick={()=>setChosen(row)}><strong>{itemName(row)}</strong><small>{String(row.Status??row.Id??'')}</small></button>)}</div>}
        {busy&&<p role="status">Loading tenant data…</p>}
        {!metadata&&!busy&&<p className="custom-empty">This object is not available to the signed-in user.</p>}
        {metadata&&!busy&&rows.length===0&&<p className="custom-empty">No accessible records. New appointments are created by your configured workflows.</p>}
      </section><aside className="custom-visit-detail">
        <div className="custom-panel-title"><h2>Visit details</h2><span>OneEngine</span></div>
        {chosen?<dl>{Object.entries(chosen).slice(0,12).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{show(value)}</dd></div>)}</dl>:
          <p className="custom-empty">Select a visit or record to view details.</p>}
        {actions}
      </aside></div>
    </main>}
  </div>;
}

/** Independent Acetill React screen; only UNE backend OneEngine Flows own data changes. */
export default function StandaloneRuntime(props:{entry:StandaloneEntry;onLogout:()=>void}){
  if(props.entry.slug==='acechatter')return <React.Suspense fallback={<div role="status">Opening AceChatter…</div>}><LazyAceChatter onLogout={props.onLogout}/></React.Suspense>;
  if(props.entry.slug!=='acetill')return <LegacyStandaloneRuntime {...props}/>;
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{}
    props.onLogout();
    window.location.assign('/login');
  };
  return <div className="standalone-product" style={{'--product-accent':props.entry.accent} as React.CSSProperties}>
    <header className="standalone-product-header">
      <div className="standalone-product-brand">
        <span className="standalone-product-mark">A</span>
        <span><strong>Acetill</strong><small>Point of sale</small></span>
      </div>
      <button type="button" className="standalone-product-logout" onClick={()=>void logout()}>Sign out</button>
    </header>
    <AcetillTerminal/>
  </div>;
}
