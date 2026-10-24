import * as React from 'react';
import {useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Clock3,FileText,
 Plus,Search,SlidersHorizontal,UserRound,UsersRound,Wallet,FilePlus2} from 'lucide-react';
import {asBusinessLocal} from './businessDateTime';
import {scheduleForDay,type BusinessCalendar} from './aceAssistCalendar';

type Row=Record<string,unknown>;
type Props={
 object:string;rows:Row[];customers:Row[];users:Row[];products:Row[];
 date:string;timeZone:string;loading:boolean;canLoad:boolean;canCreate:boolean;
 hours:BusinessCalendar|null;hoursLoading:boolean;hoursError:string;
 onDateChange:(value:string)=>void;onOpen:(record:Row)=>void;onCreate:()=>void;
 onRefresh:()=>void;
 canInvoiceQuotation:(quote:Row)=>boolean;
 onInvoiceQuotation:(quote:Row)=>void;
};
const recordId=(row:Row)=>String(row.Id??row.id??'');
const safeString=(value:unknown)=>String(value??'');
const timeOf=(value:unknown,timeZone:string)=>{
 if(!value)return '';
 try{return asBusinessLocal(String(value),timeZone);}
 catch{return '';}
};
const dayISO=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),
 String(date.getDate()).padStart(2,'0')].join('-');
function moveDate(day:string,days:number){
 const value=new Date(day+'T12:00:00');
 value.setDate(value.getDate()+days);
 return dayISO(value);
}
function localToday(timeZone:string){
 try{return asBusinessLocal(new Date().toISOString(),timeZone).slice(0,10);}
 catch{return dayISO(new Date());}
}
function amount(value:unknown,currency:unknown){
 const number=Number(value);
 if(!Number.isFinite(number))return '—';
 const code=String(currency??'');
 try{return /^[A-Z]{3}$/.test(code)
  ?new Intl.NumberFormat('en-GB',{style:'currency',currency:code}).format(number)
  :number.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
 catch{return number.toFixed(2);}
}
function statusClass(value:unknown){
 const status=safeString(value).toLowerCase();
 return ['paid','completed','complete'].includes(status)?'complete':
  ['cancelled','canceled','no show','void'].includes(status)?'cancelled':
  ['confirmed','issued'].includes(status)?'confirmed':'pending';
}
export function AceAssistMobileRecords({object,rows,customers,users,products,date,timeZone,
 hours,hoursLoading,hoursError,loading,canLoad,canCreate,onDateChange,onOpen,onCreate,onRefresh,
 canInvoiceQuotation,onInvoiceQuotation}:Props){
 const [search,setSearch]=useState('');
 const [staff,setStaff]=useState('');
 const [service,setService]=useState('');
 const day=new Date(date+'T12:00:00');
 const dates=useMemo(()=>Array.from({length:7},(_,index)=>moveDate(date,index-3)),[date]);
 const customerName=(row:Row)=>safeString(customers.find(c=>recordId(c)===safeString(row.Customer))?.Name
  ??row.CustomerName??row.Name??row.Subject??'Appointment');
 const productName=(row:Row)=>{
  const product=products.find(p=>recordId(p)===safeString(row.ServiceProduct));
  return safeString(product?.Name??row.ServiceName??row.Service??row.Description??'Service appointment');
 };
 const filtered=rows.filter(row=>{
  if(object==='Appointment'){
   if(timeOf(row.StartDateTime,timeZone).slice(0,10)!==date)return false;
   if(staff&&safeString(row.AssignedUser??row.AssignedTo)!==staff)return false;
   if(service&&safeString(row.ServiceProduct)!==service&&
    safeString(row.Service)!==safeString(products.find(p=>recordId(p)===service)?.Name))return false;
   return true;
  }
  const haystack=object==='Customer'
   ?[row.Name,row.Phone,row.Email].map(safeString).join(' ')
   :[row.Name,row.InvoiceNumber,row.QuotationNumber,row.Status,
     customers.find(c=>recordId(c)===safeString(row.Customer))?.Name].map(safeString).join(' ');
  return haystack.toLowerCase().includes(search.toLowerCase().trim());
 }).sort((a,b)=>object==='Appointment'
  ?timeOf(a.StartDateTime,timeZone).localeCompare(timeOf(b.StartDateTime,timeZone)):0);
 const sectionTitle=object==='Appointment'?'Calendar':object==='Invoice'?'Billing':
  object==='Customer'?'Customers':object==='Quotation'?'Quotations':object==='Payment'?'Payments':object;
 const createTitle=object==='Appointment'?'New booking':object==='Customer'?'Add client':
  object==='Quotation'?'New quotation':object==='Invoice'?'New invoice':'New';
 const invoices=object==='Invoice'?rows:[];
 const unpaid=invoices.filter(r=>['issued','partpaid','overdue'].includes(safeString(r.Status).toLowerCase()))
  .map(row=>({row,remaining:Number(row.Total??0)-Number(row.AmountPaid??0)}))
  .filter(x=>Number.isFinite(x.remaining)&&x.remaining>0);
 const currencies=new Set(unpaid.map(x=>safeString(x.row.CurrencyCode)));
 const countToday=rows.filter(r=>timeOf(r.StartDateTime,timeZone).slice(0,10)===date).length;
 return <section className="assist-phone-workspace" aria-label={sectionTitle}>
  <div className="assist-phone-titlebar">
   <div><span className="assist-phone-eyebrow">ACE ASSIST / WORKSPACE</span>
    <h1>{sectionTitle}</h1>
    <p>{object==='Appointment'
     ?'Keep every appointment beautifully organised'
     :object==='Invoice'?'Invoices, balances and payments in one place'
     :object==='Customer'?'Your clients, always within reach'
     :'Business records managed securely through OneEngine'}</p></div>
   {canCreate&&object!=='Payment'&&<button type="button" className="assist-phone-primary"
    onClick={onCreate} aria-label={createTitle}><Plus size={19}/><span>{createTitle}</span></button>}
  </div>
  {object==='Appointment'&&<>
   <div className="assist-phone-date-heading">
    <div><span>YOUR SCHEDULE</span><strong>{day.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</strong></div>
    <div className="assist-phone-date-actions">
     <button type="button" aria-label="Previous day" onClick={()=>onDateChange(moveDate(date,-1))}><ChevronLeft size={19}/></button>
     <button type="button" onClick={()=>onDateChange(localToday(timeZone))}>Today</button>
     <button type="button" aria-label="Next day" onClick={()=>onDateChange(moveDate(date,1))}><ChevronRight size={19}/></button>
    </div>
   </div>
   <div className="assist-phone-date-strip" aria-label="Choose calendar date">
    {dates.map(value=>{
     const candidate=new Date(value+'T12:00:00');
     return <button type="button" key={value}
      className={value===date?'selected':''} aria-pressed={value===date}
      onClick={()=>onDateChange(value)}>
      <small>{candidate.toLocaleDateString('en-GB',{weekday:'short'})}</small>
      <strong>{candidate.getDate()}</strong>
      {value===localToday(timeZone)&&<i aria-label="Today"/>}
     </button>
    })}
   </div>
   <div className="assist-phone-hours" role="status"><Clock3 size={15}/>
    <span>{hoursLoading?'Checking business hours…':hoursError?'Business hours unavailable: '+hoursError:
     !hours?'Business hours are not configured':(()=>{
      const window=scheduleForDay(hours,date);
      return window?'Open '+window.open+'–'+window.close+' · '+hours.timezone:'Closed / holiday · '+hours.timezone;
     })()}</span></div>
   <div className="assist-phone-filter-row">
    <label><UsersRound size={16}/><span className="sr-only">Filter by staff</span>
     <select aria-label="Filter by staff" value={staff} onChange={e=>setStaff(e.target.value)}>
      <option value="">All staff</option>
      {users.map(user=><option key={recordId(user)} value={recordId(user)}>
       {safeString(user.Name??user.Email??recordId(user))}</option>)}
     </select></label>
    <label><SlidersHorizontal size={16}/><span className="sr-only">Filter by service</span>
     <select aria-label="Filter by service" value={service} onChange={e=>setService(e.target.value)}>
      <option value="">All services</option>
      {products.filter(p=>p.IsService!==false&&p.IsService!=='false')
       .map(p=><option key={recordId(p)} value={recordId(p)}>{safeString(p.Name??recordId(p))}</option>)}
     </select></label>
   </div>
   <div className="assist-phone-list-heading"><div>
    <h2>{day.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</h2>
    <p>{canLoad?String(countToday)+' appointment'+(countToday===1?'':'s'):'Permission required'}</p>
   </div><CalendarDays size={20}/></div>
  </>}
  {object==='Invoice'&&<div className="assist-phone-billing-summary">
   <span>OUTSTANDING INVOICES</span>
   <strong>{canLoad?unpaid.length:'—'}</strong>
   <p>{canLoad?(currencies.size>1?'Multiple currencies — balances shown individually':
     'Amount due: '+amount(unpaid.reduce((sum,x)=>sum+x.remaining,0),unpaid[0]?.row.CurrencyCode))
    :'Invoice records are not authorised'}</p>
   <div aria-hidden="true" className="assist-phone-summary-decoration"><Wallet size={66}/></div>
  </div>}
  {object==='Customer'&&<div className="assist-phone-customer-count">
   <UsersRound size={19}/> <strong>{canLoad?rows.length:'—'}</strong> clients in your workspace
  </div>}
  {object!=='Appointment'&&<label className="assist-phone-search"><Search size={19}/>
   <input value={search} onChange={e=>setSearch(e.target.value)}
    placeholder={'Search '+sectionTitle.toLowerCase()} aria-label={'Search '+sectionTitle.toLowerCase()}/>
  </label>}
  <div className="assist-phone-list-heading assist-phone-record-heading">
   <h2>{object==='Appointment'?'Appointments':object==='Invoice'?'Recent invoices':
    object==='Customer'?'Client directory':sectionTitle}</h2>
   <button type="button" onClick={onRefresh} disabled={loading}>Refresh</button>
  </div>
  <div className="assist-phone-records">
   {!canLoad?<div className="assist-phone-empty">
    <FileText size={27}/><strong>Access not available</strong>
    <p>This section needs an authorised OneEngine loading Flow.</p></div>:
    loading?<div className="assist-phone-empty" role="status"><Clock3 size={27}/>
     <strong>Loading records…</strong></div>:
    filtered.length===0?<div className="assist-phone-empty">
     {object==='Appointment'?<CalendarDays size={28}/>:<FileText size={28}/>}
     <strong>{object==='Appointment'?'No appointments for this day':'Nothing to display yet'}</strong>
     <p>{object==='Appointment'?'Choose another day or create a booking.':'Try another search or add a record.'}</p>
     {canCreate&&object!=='Payment'&&<button type="button" onClick={onCreate}>
      <Plus size={15}/> {createTitle}</button>}
    </div>:filtered.map((row,i)=>{
     const isAppointment=object==='Appointment';
     const isDocument=object==='Invoice'||object==='Quotation';
     const status=safeString(row.Status??(isAppointment?'Scheduled':'Draft'));
     const customer=isAppointment?customerName(row):
      safeString(customers.find(c=>recordId(c)===safeString(row.Customer))?.Name??'Customer');
     return <div className="assist-phone-record-row" key={recordId(row)||i}>
      <button type="button" className="assist-phone-record" onClick={()=>onOpen(row)}>
      {isAppointment?<div className="assist-phone-time">
       <strong>{timeOf(row.StartDateTime,timeZone).slice(11,16)||'—'}</strong>
       <span>{timeOf(row.EndDateTime,timeZone).slice(11,16)}</span>
      </div>:<span className="assist-phone-record-icon" aria-hidden="true">
       {object==='Customer'?<UserRound size={23}/>:isDocument?<FileText size={23}/>:<Wallet size={23}/>}
      </span>}
      <span className="assist-phone-record-main">
       <strong>{isAppointment?customer:object==='Customer'
        ?safeString(row.Name??'Client'):isDocument
        ?safeString(row.InvoiceNumber??row.QuotationNumber??row.Name??sectionTitle)
        :safeString(row.Name??'Payment')}</strong>
       <small>{isAppointment?productName(row):
        object==='Customer'?safeString(row.Phone??row.Email??'Client record'):
        isDocument?customer:safeString(row.PaymentDate??row.Method??'Payment record')}</small>
       {isAppointment&&<span className="assist-phone-status-line">
        <i className={'assist-phone-status '+statusClass(row.Status)}>{status}</i>
       </span>}
      </span>
      {isDocument?<span className="assist-phone-record-right">
       <strong>{amount(row.Total,row.CurrencyCode)}</strong>
       <i className={'assist-phone-status '+statusClass(status)}>{status}</i>
      </span>:object==='Customer'?<ChevronRight size={18} className="assist-phone-row-chevron"/>:
       isAppointment?<ChevronRight size={18} className="assist-phone-row-chevron"/>:
       <ChevronRight size={18} className="assist-phone-row-chevron"/>}
     </button>
      {object==='Quotation'&&canInvoiceQuotation(row)&&<button type="button"
       className="assist-phone-quote-invoice" title="Create invoice from quotation"
       aria-label={'Create invoice from quotation '+safeString(row.QuotationNumber??row.DocumentNumber??row.Name??'')}
       onClick={()=>onInvoiceQuotation(row)}><FilePlus2 size={21}/></button>}
     </div>;
    })}
  </div>
 </section>;
}
