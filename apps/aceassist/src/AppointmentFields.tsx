import * as React from 'react';
import {useMemo,useState} from 'react';
import {scheduleForDay,type BusinessCalendar} from './aceAssistCalendar';
import {previewStartSlots,type BookingSlotPreview} from './bookingSlotPreview';
type Row=Record<string,unknown>;
const display=(r:Row)=>String(r.Name??r.DisplayName??r.Email??r.email??r.Title??r.Id??'');
export function SearchRecord({label,value,options,onChange,addNew,emptyMessage}:{
 label:string;value:string;options:Row[];onChange:(id:string)=>void;
 addNew?:()=>void;emptyMessage?:string
}){
 const [query,setQuery]=useState('');
 const [expanded,setExpanded]=useState(false);
 const selected=options.find(r=>String(r.Id??r.id)===value || String(r.Name??'')===value);
 const results=options.filter(r=>display(r).toLowerCase().includes(query.toLowerCase())
  ||String(r.Email??'').toLowerCase().includes(query.toLowerCase())).slice(0,40);
 return <div className="assist-lookup">
  <label>{label}<input type="search" role="combobox" aria-expanded={expanded}
   aria-autocomplete="list" autoComplete="off" value={expanded?query:selected?display(selected):query}
   placeholder={'Search '+label.toLowerCase()} onFocus={()=>{setExpanded(true);setQuery('');}}
   onChange={e=>{setQuery(e.target.value);setExpanded(true);}} /></label>
  {expanded&&<div className="assist-lookup-menu" role="listbox">
   {addNew&&<button type="button" className="assist-lookup-new"
    onClick={()=>{setExpanded(false);addNew();}}>+ Add new {label.toLowerCase()}</button>}
   {results.map(row=><button role="option" aria-selected={String(row.Id??row.id)===value}
    type="button" key={String(row.Id??row.id)} onClick={()=>{
     onChange(String(row.Id??row.id));setQuery('');setExpanded(false);
    }}>{display(row)}</button>)}
   {!results.length&&<small>{emptyMessage??'No matching records'}</small>}
   <button type="button" className="assist-lookup-close" onClick={()=>setExpanded(false)}>Close results</button>
  </div>}
 </div>;
}
export function DateSlotPicker({label,value,onChange,calendar,startDate,minTime,preview}:{
 label:string;value:string;onChange:(v:string)=>void;calendar:BusinessCalendar|null;
 startDate?:string;minTime?:string;preview?:BookingSlotPreview
}){
 const date=value.slice(0,10),time=value.slice(11,16);
 const hours=calendar&&date?scheduleForDay(calendar,date):null;
 const slots=useMemo(()=>{
  if(!hours||!/^\d{2}:\d{2}$/.test(hours.open)||!/^\d{2}:\d{2}$/.test(hours.close))return [];
  const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const out:string[]=[];
  for(let v=minutes(hours.open);v<minutes(hours.close);v+=30)
   out.push(String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0'));
  const safeTimes=preview&&date
   ?previewStartSlots({date,open:hours.open,close:hours.close,preview}):null;
  return out.filter(x=>(!minTime||date!==startDate||x>minTime)
   &&(!safeTimes||safeTimes.includes(x)));
 },[hours?.open,hours?.close,date,startDate,minTime,preview]);
 return <div className="assist-date-slot"><label>{label}
  <input type="date" value={date} onChange={e=>onChange(e.target.value?e.target.value+'T':'')}
   required min={label.startsWith('End')?startDate:undefined}/></label>
  <label>Time slot<select value={time} required disabled={!date||!slots.length}
    onChange={e=>onChange(date+'T'+e.target.value)}>
   <option value="">Select a slot</option>
   {slots.map(x=><option key={x} value={x}>{x}</option>)}
  </select></label>
  {date&&!hours&&<small>No bookable hours on this date</small>}
  {date&&hours&&preview&&<small>Preliminary slot choices; availability is verified again when saving.</small>}
 </div>;
}
