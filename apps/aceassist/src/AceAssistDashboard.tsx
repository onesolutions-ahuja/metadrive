import * as React from 'react';
import {asBusinessLocal} from './businessDateTime';
import {CalendarDays,ReceiptText,WalletCards,UserRound,FilePlus2,
 ArrowRight,Clock3} from 'lucide-react';

type Row=Record<string,unknown>;
type ObjectName='Appointment'|'Customer'|'Quotation'|'Invoice';
type Props={
 appointments:Row[];invoices:Row[];customers:Row[];
 actions:ReadonlySet<string>;timeZone:string;invoicesLoading:boolean;
 onOpen:(object:ObjectName,row?:Row)=>void;
 onCreate:(object:ObjectName)=>void;
 onCalendar:()=>void;onBilling:()=>void;
};
const id=(row:Row)=>String(row.Id??row.id??'');
function businessClock(value:unknown,timeZone:string){
 if(!value)return '';
 try{return asBusinessLocal(String(value),timeZone);}
 catch{return '';}
}
function todayKey(timeZone:string){
 try{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
   .formatToParts(new Date());
  const item=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return [item('year'),item('month'),item('day')].join('-');
 }catch{return new Date().toISOString().slice(0,10);}
}
function money(amount:number,currency:unknown){
 const iso=typeof currency==='string'&&/^[A-Z]{3}$/.test(currency)?currency:'';
 try{return iso?new Intl.NumberFormat(undefined,{style:'currency',currency:iso}).format(amount):
  amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
 catch{return amount.toFixed(2);}
}
function statusLabel(value:unknown){return String(value??'Scheduled');}
function statusClass(value:unknown){
 const status=statusLabel(value).toLowerCase();
 return status==='completed'||status==='paid'?'complete':
  status==='cancelled'||status==='no show'?'cancelled':
  status==='confirmed'?'confirmed':'pending';
}
export function AceAssistDashboard({appointments,invoices,customers,actions,timeZone,invoicesLoading,
 onOpen,onCreate,onCalendar,onBilling}:Props){
 const today=todayKey(timeZone);
 const todays=appointments.filter(row=>businessClock(row.StartDateTime,timeZone).slice(0,10)===today)
  .sort((a,b)=>businessClock(a.StartDateTime,timeZone).localeCompare(businessClock(b.StartDateTime,timeZone)));
 const outstanding=invoices.filter(row=>['Issued','PartPaid','Overdue'].includes(String(row.Status??'')))
  .map(row=>({...row,remaining:Math.max(0,Number(row.Total??0)-Number(row.AmountPaid??0))}) as Row&{remaining:number})
  .filter(row=>Number.isFinite(row.remaining)&&row.remaining>0);
 const outstandingCurrencies=new Set(outstanding.map(row=>String(row.CurrencyCode??'')));
 const next=todays.find(row=>statusLabel(row.Status)!=='Completed'&&statusLabel(row.Status)!=='Cancelled'
  &&statusLabel(row.Status)!=='No Show'&&businessClock(row.StartDateTime,timeZone).slice(11)>=
   new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()));
 const customer=(row:Row)=>customers.find(c=>id(c)===String(row.Customer??''))?.Name
  ??row.CustomerName??row.Name??row.Subject??'Appointment';
 const service=(row:Row)=>String(row.ServiceName??row.Service??row.Description??'Scheduled service');
 const canCreate=(object:ObjectName)=>actions.has(
  object==='Quotation'||object==='Invoice'
   ?'AceAssistCreateDocumentV1'+object
   :'AceAssistCreate'+(object==='Appointment'?'V3':'V2')+object
 )&&actions.has('AceAssistLoad'+object);
 return <div className="assist-home">
  <section className="assist-home-hello">
   <div><span className="custom-eyebrow">YOUR WORKSPACE</span>
    <h1>Good to see you</h1>
    <p>{new Date(today+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})} · Appointments and billing in one place</p></div>
   <button type="button" onClick={onCalendar}>Open calendar <ArrowRight size={16} aria-hidden="true"/></button>
  </section>
  <section className="assist-home-metrics" aria-label="Business overview">
   <button type="button" onClick={onCalendar} className="assist-metric">
    <span className="assist-metric-icon" aria-hidden="true"><CalendarDays size={21}/></span>
    <strong>{actions.has('AceAssistLoadAppointment')?todays.length:'—'}</strong><small>Appointments today</small>
   </button>
   <button type="button" onClick={onBilling} className="assist-metric">
    <span className="assist-metric-icon" aria-hidden="true"><ReceiptText size={21}/></span><strong>{invoicesLoading?'…':actions.has('AceAssistLoadInvoice')?outstanding.length:'—'}</strong><small>Unpaid invoices</small>
   </button>
   <button type="button" onClick={onBilling} className="assist-metric">
    <span className="assist-metric-icon" aria-hidden="true"><WalletCards size={21}/></span>
    <strong>{invoicesLoading?'…':actions.has('AceAssistLoadInvoice')?
     outstandingCurrencies.size>1?'Multiple currencies':
     outstanding.length?money(outstanding.reduce((sum,row)=>sum+row.remaining,0),outstanding[0].CurrencyCode):'0.00':'—'}</strong>
    <small>Outstanding balance</small>
   </button>
  </section>
  <div className="assist-home-columns">
   <section className="assist-home-panel">
    <div className="assist-home-panel-heading"><h2>Today's appointments</h2>
     <button type="button" onClick={onCalendar}>View all →</button></div>
    {next&&<button type="button" className="assist-next" onClick={()=>onOpen('Appointment',next)}>
     <span className="assist-next-time"><Clock3 size={13}/>{businessClock(next.StartDateTime,timeZone).slice(11,16)}</span>
     <span><small>UP NEXT</small><strong>{String(customer(next))}</strong>
      <span>{service(next)}</span></span><span aria-hidden="true">→</span></button>}
    <div className="assist-home-list">
     {!actions.has('AceAssistLoadAppointment')?
      <p className="assist-home-empty">Appointment access is not enabled for this user.</p>:
      todays.length===0?<p className="assist-home-empty">No appointments scheduled for today.</p>:
      todays.slice(0,7).map((row,index)=><button type="button" key={id(row)||index}
       className="assist-home-appointment" onClick={()=>onOpen('Appointment',row)}>
       <time>{businessClock(row.StartDateTime,timeZone).slice(11,16)||'—'}</time>
       <span><strong>{String(customer(row))}</strong><small>{service(row)}</small></span>
       <em className={'assist-status '+statusClass(row.Status)}>{statusLabel(row.Status)}</em>
      </button>)}
    </div>
   </section>
   <section className="assist-home-panel">
    <div className="assist-home-panel-heading"><h2>Payments to follow up</h2>
     <button type="button" onClick={onBilling}>Billing →</button></div>
    {!actions.has('AceAssistLoadInvoice')?<p className="assist-home-empty">Invoice access is not enabled for this user.</p>:
     invoicesLoading?<p className="assist-home-empty">Loading authorised invoices…</p>:
     outstanding.length===0?<p className="assist-home-empty">No outstanding issued invoices.</p>:
     outstanding.slice(0,5).map(row=><button type="button" key={id(row)} className="assist-home-invoice"
      onClick={()=>onOpen('Invoice',row)}>
      <span><strong>{String(row.InvoiceNumber??row.Name??'Invoice')}</strong>
       <small>{String(customers.find(c=>id(c)===String(row.Customer??''))?.Name??'Customer')}</small></span>
      <strong>{money(row.remaining,row.CurrencyCode)}</strong><span aria-hidden="true">→</span>
     </button>)}
    <p className="assist-home-note">Only posted invoice balances are shown. Card collections require verified settlement.</p>
   </section>
  </div>
  <section className="assist-home-panel assist-home-quick">
   <h2>Quick actions</h2><div className="assist-quick-grid">
    {([['Appointment','New appointment','booking'],['Customer','Add customer','client'],
      ['Invoice','Create invoice','invoice'],['Quotation','New quotation','quotation']] as const)
     .map(([object,label,icon])=><button type="button" key={object} disabled={!canCreate(object)}
      title={!canCreate(object)?'Not permitted: creation Flow unavailable':undefined}
      onClick={()=>onCreate(object)}><span aria-hidden="true">
       {icon==='booking'?<CalendarDays size={21}/>:icon==='client'?<UserRound size={21}/>:
        icon==='invoice'?<ReceiptText size={21}/>:<FilePlus2 size={21}/>}
      </span><strong>{label}</strong></button>)}
   </div>
  </section>
 </div>;
}
