import * as React from 'react';
import {useEffect,useMemo,useState} from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import {ACEASSIST_STANDALONE_ENTRY} from './standalone-entry';
import {SearchRecord,DateSlotPicker} from './AppointmentFields';
import {AceAssistDashboard} from './AceAssistDashboard';
import {AceAssistMobileRecords} from './AceAssistMobileRecords';
import {House,CalendarDays,ReceiptText,UsersRound,Grid2X2,LogOut,ArrowLeft} from 'lucide-react';
import {FinancialDocumentEditor,type DocumentChanges,type DocumentType} from './FinancialDocumentEditor';
import {RecordFieldInput,fieldKind,type RecordField} from '../../web/src/core/metadata/Fields/RecordFieldInput';
import NotificationBell from '../../web/src/core/automation/Notifications/NotificationBell';
import {DocumentPrint} from '../../web/src/core/components/DocumentPrint/DocumentPrint';
import {asBusinessInstant,asBusinessLocal} from './businessDateTime';
import {checkBusinessHours,dateKey,scheduleForDay,type BusinessCalendar} from './aceAssistCalendar';
import './aceassist.css';

type Row=Record<string,unknown>;
type Field=RecordField;
type ObjectInfo={apiName:string;label?:string;fields?:Field[]};
type Operation='Create'|'Update'|'Delete';
type FlowResponse={outputs?:Record<string,unknown>;variables?:Record<string,unknown>;
  interviewId?:string;status?:string};
type Tab={object:string;label:string};
const tabs:Tab[]=[
 {object:'Appointment',label:'Appointments'},
 {object:'Customer',label:'Customers'},
 {object:'Quotation',label:'Quotations'},
 {object:'Invoice',label:'Invoices'},
 {object:'Payment',label:'Payments'}
];
const isFinancialDocument=(name:string):name is DocumentType=>
 name==='Quotation'||name==='Invoice';
const documentHeaders:Record<DocumentType,readonly string[]>={
 Quotation:['Name','Customer','IssueDate','ExpiryDate','CurrencyCode','TermsAndConditions','Notes','Status'],
 Invoice:['Name','Customer','InvoiceDate','DueDate','CurrencyCode','Notes']
};
const documentFlow=(operation:'Create'|'Update',object:DocumentType)=>
 'AceAssist'+operation+'DocumentV1'+object;
const inputFields:Record<string,string[]>={
 Appointment:['Name','StartDateTime','EndDateTime','Status','Customer','Service','Location','AssignedTo','Description','Notes'],
 Customer:['Name','Email','Phone','BillingAddress','ShippingAddress','Active'],
 Quotation:['Name','Customer','IssueDate','ExpiryDate','Status','Notes','CurrencyCode','Subtotal','DiscountAmount','TaxAmount','Total'],
 QuotationLine:['Name','Quotation','Product','Description','Quantity','UnitPrice','DiscountAmount','TaxAmount','LineTotal'],
 Invoice:['Name','Customer','InvoiceDate','DueDate','Status','Notes','CurrencyCode','Subtotal','DiscountAmount','TaxAmount','Total'],
 InvoiceLine:['Name','Invoice','Product','Description','Quantity','UnitPrice','DiscountAmount','TaxAmount','LineTotal']
};
const show=(v:unknown)=>v==null?'—':typeof v==='object'?JSON.stringify(v):String(v);
const title=(r:Row)=>String(r.Name??r.Subject??r.Title??r.Id??'Record');
const scalar=(value:string,field:Field):unknown=>{
 const kind=fieldKind(field);
 if(['number','currency','percent'].includes(kind))return value===''?null:Number(value);
 if(kind==='boolean')return value==='true';
 return value===''?null:value;
};
const formatInput=(v:unknown,field:Field,timeZone?:string)=>{
 if(v==null)return '';
 if(fieldKind(field)==='datetime')return timeZone?
  asBusinessLocal(String(v),timeZone):String(v).slice(0,16);
 return String(v);
};
const readOnlyField=(f:Field)=>fieldKind(f)==='readonly'||f.readOnly===true;
const targetObject=(f:Field)=>f.relationship?.targetObject??f.relatedObject;
const idOf=(v:Row)=>String(v.Id??v.id??'');
/** Presentation-only duration preview. Authoritative booking validation is server-side. */
function withServiceEnd(form:Record<string,string>,product?:Row):Record<string,string>{
 const duration=Number(product?.DurationMinutes);
 if(!form.StartDateTime||!Number.isSafeInteger(duration)||duration<1||duration>1440)return form;
 const start=new Date(form.StartDateTime+':00Z');
 if(!Number.isFinite(start.getTime()))return form;
 return {...form,EndDateTime:new Date(start.getTime()+duration*60000).toISOString().slice(0,16)};
}

export default function AceAssistRuntime({entry,onLogout}:{
 entry:typeof ACEASSIST_STANDALONE_ENTRY;onLogout:()=>void
}) {
 const [objects,setObjects]=useState<ObjectInfo[]>([]);
 const [actions,setActions]=useState<Set<string>>(new Set());
 const [selected,setSelected]=useState(0);
 const [screen,setScreen]=useState<'home'|'records'|'more'>('home');
 const [dashboardInvoices,setDashboardInvoices]=useState<Row[]>([]);
 const [dashboardLoading,setDashboardLoading]=useState(false);
 const [rows,setRows]=useState<Row[]>([]);
 const [relatedRows,setRelatedRows]=useState<Row[]>([]);
 const [documentLines,setDocumentLines]=useState<Row[]>([]);
 const [relatedLoading,setRelatedLoading]=useState(false);
 const [lookupRows,setLookupRows]=useState<Record<string,Row[]>>({});
 const [selfId,setSelfId]=useState('');
 const [activeTenant,setActiveTenant]=useState('');
 const [returnToAppointment,setReturnToAppointment]=useState(false);
 const [appointmentDraft,setAppointmentDraft]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [cashInvoice,setCashInvoice]=useState<Row|null>(null);
 const [printingDocument,setPrintingDocument]=useState<Row|null>(null);
 const [printingObject,setPrintingObject]=useState<'Quotation'|'Invoice'>('Invoice');
 const [cashAmount,setCashAmount]=useState('');
 const [cashRequestId,setCashRequestId]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [weekOf,setWeekOf]=useState(()=>dateKey(new Date()));
 const [chosen,setChosen]=useState<Row|null>(null);
 const [editing,setEditing]=useState<Operation|null>(null);
 const [editingObject,setEditingObject]=useState('');
 const [form,setForm]=useState<Record<string,string>>({});
 const [reload,setReload]=useState(0);
 const [calendarStaffFilter,setCalendarStaffFilter]=useState('');
 const [calendarServiceFilter,setCalendarServiceFilter]=useState('');
 const [calendarView,setCalendarView]=useState<'day'|'week'|'month'>(()=>
  typeof window!=='undefined'&&typeof window.matchMedia==='function'
   &&window.matchMedia('(max-width: 650px)').matches?'day':'week');
 const [hours,setHours]=useState<BusinessCalendar|null>(null);
 const [hoursError,setHoursError]=useState('');
 const [hoursLoading,setHoursLoading]=useState(true);
 const [hoursReload,setHoursReload]=useState(0);
 const current=tabs[selected];
 const metadata=objects.find(x=>x.apiName.toLowerCase()===current.object.toLowerCase());
 const dynamicFlow=(operation:'Create'|'Update',object:string)=>
  'AceAssist'+operation+(object==='Appointment'?'V3':'V2')+object;
 const canDynamic=(operation:'Create'|'Update',object:string)=>actions.has(dynamicFlow(operation,object));
 const visibleFields=(object:string)=>{
  const definition=objects.find(x=>x.apiName===object);
  const dynamic=canDynamic('Create',object)&&canDynamic('Update',object);
  return (definition?.fields??[]).filter(f=>f.apiName!=='Id'&&!readOnlyField(f)
   &&(dynamic||inputFields[object]?.includes(f.apiName))
   && !(object==='Appointment'&&
    ((f.apiName==='Service'&&definition?.fields?.some(x=>x.apiName==='ServiceProduct'))||
     (f.apiName==='AssignedTo'&&definition?.fields?.some(x=>x.apiName==='AssignedUser')))));
 };
 const fields=useMemo(()=>visibleFields(current.object),[objects,actions,current.object]);
 const documentFields=(object:DocumentType,operation:'Create'|'Update')=>
  (objects.find(x=>x.apiName===object)?.fields??[])
   .filter(field=>documentHeaders[object].includes(field.apiName)
    &&(operation==='Update'||field.apiName!=='Status')&&!readOnlyField(field));
 const flowName=(operation:'Load'|Operation)=>'AceAssist'+operation+current.object;
 const can=(operation:'Load'|Operation)=>current.object==='Appointment'&&
  (operation==='Create'||operation==='Update')?false:actions.has(flowName(operation));
 const loaded=useMemo(()=>new Set(objects.map(x=>x.apiName.toLowerCase())),[objects]);
 useEffect(()=>{
  let alive=true;
  void Promise.all([
   apiRequest<{objects:ObjectInfo[]}>('/metadata/objects'),
   apiRequest<{actions:Array<{apiName:string}>}>('/flows/available-actions?product='+encodeURIComponent(entry.appId))
  ]).then(([o,f])=>{if(alive){setObjects(o.objects??[]);setActions(new Set((f.actions??[]).map(x=>x.apiName)));}})
    .catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});
  void apiRequest<{user:{id:string;tenantId?:string}}>('/auth/me')
   .then(r=>{if(alive){setSelfId(r.user?.id??'');setActiveTenant(r.user?.tenantId??'');}})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});
  return()=>{alive=false;};
 },[entry.appId]);
 useEffect(()=>{
  let alive=true;
  setHoursError('');
  setHoursLoading(true);
  void apiRequest<{calendar:BusinessCalendar|null}>('/tenant/business-calendar',{cache:'no-store'})
   .then(r=>{
    if(!alive)return;
    if(!r||!Object.hasOwn(r,'calendar'))
     throw Error('Business calendar API returned an invalid response');
    const value=r.calendar;
    if(value!==null&&(!value||typeof value.timezone!=='string'
      ||!value.weeklyHours||typeof value.weeklyHours!=='object'
      ||!Array.isArray(value.holidays)))
     throw Error('Business calendar API returned invalid settings');
    setHours(value);
   })
   .catch(e=>{if(alive){setHours(null);setHoursError(e instanceof Error?e.message:String(e));}})
   .finally(()=>{if(alive)setHoursLoading(false);});
  return()=>{alive=false;};
 },[hoursReload]);
 useEffect(()=>{
  // Re-fetch the authenticated tenant's settings when the app is revisited.
  const onVisible=()=>{if(document.visibilityState==='visible')setHoursReload(n=>n+1);};
  document.addEventListener('visibilitychange',onVisible);
  const onCalendarSaved=()=>setHoursReload(n=>n+1);
  window.addEventListener('metadrive:business-calendar-saved',onCalendarSaved);
  return()=>{
   document.removeEventListener('visibilitychange',onVisible);
   window.removeEventListener('metadrive:business-calendar-saved',onCalendarSaved);
  };
 },[]);
 const fetchRows=async(operation:'Load',object:string)=>{
  const api='AceAssist'+operation+object;
  const res=await apiRequest<FlowResponse>('/flows/'+encodeURIComponent(api)+'/execute',
    {method:'POST',body:JSON.stringify({})});
  const output=(res.outputs??res.variables??{});
  const collection=object.charAt(0).toLowerCase()+object.slice(1)+'Records';
  const v=output[collection];
  if(!Array.isArray(v))throw Error('Get Records Flow did not return '+collection+'. Check Flow output permissions.');
  return v.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)) as Row[];
 };
 useEffect(()=>{
  let alive=true;
  setRows([]);setError('');
  if(!loaded.has(current.object.toLowerCase())||!can('Load'))return;
  setBusy(true);
  void fetchRows('Load',current.object).then(data=>{if(alive){
   setRows(data);
   setChosen(previous=>previous?data.find(row=>idOf(row)===idOf(previous))??null:null);
  }})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));})
   .finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[current.object,loaded,actions,reload]);
 useEffect(()=>{
  let alive=true;
  if(screen!=='home'||!actions.has('AceAssistLoadInvoice'))return;
  setDashboardLoading(true);
  void fetchRows('Load','Invoice').then(data=>{if(alive)setDashboardInvoices(data);})
   .catch(cause=>{if(alive){setDashboardInvoices([]);
    setError(cause instanceof Error?cause.message:String(cause));}})
   .finally(()=>{if(alive)setDashboardLoading(false);});
  return()=>{alive=false;};
 },[screen,actions,reload]);
 useEffect(()=>{
  let alive=true;
  // Lookups must follow the record currently being edited, not only the active
  // navigation tab. A QuotationLine/InvoiceLine editor needs Product and its
  // parent document even when the user opened it from a different tab.
  const lookupFor=editing?editingObject:current.object;
  const lookupDefinition=objects.find(x=>x.apiName.toLowerCase()===lookupFor.toLowerCase());
  const lookupFields=(lookupDefinition?.fields??[]).filter(field=>
   field.apiName!=='Id'&&!readOnlyField(field));
  const relations=[...new Set([...lookupFields
    .map(field=>targetObject(field)??(['Customer','Quotation','Invoice'].includes(field.apiName)?field.apiName:'')),
    ...(lookupFor==='Appointment'?['User','Product','Customer']:[]),
    ...(['QuotationLine','InvoiceLine'].includes(lookupFor)?['Product']:[]),
    ...(isFinancialDocument(lookupFor)?['Product','Customer']:[])
   ].filter(x=>x&&x!==lookupFor&&loaded.has(x.toLowerCase())
      &&actions.has('AceAssistLoad'+x)))];
  if(!relations.length)return;
  // Keep authorised choices available when another optional lookup fails.
  void Promise.allSettled(relations.map(async target=>({
   target,data:await fetchRows('Load',target)
  }))).then(results=>{
   if(!alive)return;
   const succeeded=results.filter((result):result is PromiseFulfilledResult<{target:string;data:Row[]}>=>result.status==='fulfilled');
   setLookupRows(previous=>({...previous,...Object.fromEntries(succeeded.map(result=>[
    result.value.target,result.value.data
   ]))}));
   const failed=results.flatMap((result,index)=>result.status==='rejected'
    ?[relations[index]+': '+(result.reason instanceof Error?result.reason.message:String(result.reason))]:[]);
   if(failed.length)setError('Some lookup choices could not be loaded: '+failed.join('; '));
  });
  return()=>{alive=false;};
 },[fields,current.object,editing,editingObject,objects,loaded,actions,reload]);
 useEffect(()=>{
  let alive=true;
  setRelatedRows([]);setRelatedLoading(false);
  if(!chosen||!isFinancialDocument(current.object))return;
  const child=current.object+'Line';
  if(!actions.has('AceAssistLoad'+child))return;
  setRelatedLoading(true);
  void fetchRows('Load',child).then(data=>{
   if(alive)setRelatedRows(data.filter(x=>String(x[current.object]??'')===String(chosen.Id??'')));
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));})
   .finally(()=>{if(alive)setRelatedLoading(false);});
  return()=>{alive=false;};
 },[current.object,chosen?.Id,actions,reload]);
 const runRecordAction=async(apiName:string,record:Row)=>{
  if(!actions.has(apiName)||busy)return;
  setBusy(true);setError('');
  try{
   const response=await apiRequest<FlowResponse>('/flows/'+encodeURIComponent(apiName)+'/execute',
    {method:'POST',body:JSON.stringify({recordId:record.Id})});
   if(response.interviewId)throw Error('The Flow requires additional input');
   setNotice('Workflow completed: '+apiName);
   if(apiName==='AceAssistInvoiceFromAppointment'||apiName==='AceAssistConvertQuoteToInvoice'){
    setScreen('records');setSelected(tabs.findIndex(tab=>tab.object==='Invoice'));setChosen(null);
   }
   setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 // Staff shifts and time-off are read through the same authorised Get Records Flow API.
 useEffect(()=>{
  let alive=true;
  const targets=['StaffAvailability','AvailabilityException']
   .filter(object=>actions.has('AceAssistLoad'+object));
  if(!targets.length)return;
  void Promise.all(targets.map(async object=>({object,data:await fetchRows('Load',object)})))
   .then(results=>{if(alive)setLookupRows(previous=>({
    ...previous,...Object.fromEntries(results.map(item=>[item.object,item.data]))
   }));})
   .catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:String(cause));});
  return()=>{alive=false;};
 },[actions,reload]);
 const openCashPayment=(invoice:Row)=>{
  const outstanding=Math.round((Number(invoice.Total??0)-Number(invoice.AmountPaid??0))*100)/100;
  setCashInvoice(invoice);setCashAmount(outstanding>0?String(outstanding):'');
  setCashRequestId(window.crypto.randomUUID());setError('');setNotice('');
 };
 const submitCashPayment=async(event:React.FormEvent)=>{
  event.preventDefault();if(!cashInvoice||busy||!actions.has('AceAssistRecordCashPayment'))return;
  const amount=Number(cashAmount);
  if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>0.00001){
   setError('Enter a positive amount with at most two decimal places.');return;
  }
  setBusy(true);setError('');
  try{
   const response=await apiRequest<FlowResponse>('/flows/AceAssistRecordCashPayment/execute',{
    method:'POST',body:JSON.stringify({recordId:cashInvoice.Id,amount,requestId:cashRequestId})});
   if(response.interviewId)throw Error('Cash settlement has not completed');
   setCashInvoice(null);setNotice('Cash settlement recorded by authorised Flow.');
   setReload(x=>x+1);
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(false);}
 };
 const startEdit=(operation:Operation,row?:Row,object=current.object)=>{
  if(isFinancialDocument(object)&&operation!=='Delete'){
   if(!actions.has(documentFlow(operation,object))){
    setError('Authorised document saving Flow is not installed or accessible.');return;
   }
   if(operation==='Create'){
    setDocumentLines([]);setChosen(null);setEditingObject(object);
    setEditing('Create');setError('');setNotice('');return;
   }
   if(!row?.Id){setError('Select a document before editing.');return;}
   if(!actions.has('AceAssistLoad'+object+'Line')){
    setError('Authorised document line loading Flow is unavailable.');return;
   }
   setBusy(true);setError('');
   void fetchRows('Load',object+'Line').then(data=>{
    setDocumentLines(data.filter(line=>String(line[object]??'')===String(row.Id)));
    setChosen(row);setEditingObject(object);setEditing('Update');
    setNotice('');setError('');
   }).catch(e=>setError(e instanceof Error?e.message:String(e)))
    .finally(()=>setBusy(false));
   return;
  }
  const values:Record<string,string>={};
  for(const field of visibleFields(object)){
   const existing=row?.[field.apiName]??(operation==='Create'?field.defaultValue:undefined);
   values[field.apiName]=formatInput(existing,field,hours?.timezone);
  }
  if(object==='Appointment'&&operation==='Create'){
   if(visibleFields(object).some(f=>f.apiName==='AssignedUser'))values.AssignedUser=selfId;
   else values.AssignedTo=selfId;
  }
  if(object==='Customer'&&operation==='Create'&&!values.Active)values.Active='true';
  setForm(values);setChosen(row??null);setEditingObject(object);
  setEditing(operation);setError('');setNotice('');
 };
 const saveDocument=async(changes:DocumentChanges)=>{
  if(!editing||editing==='Delete'||!isFinancialDocument(editingObject)||busy)return;
  const api=documentFlow(editing,editingObject);
  if(!actions.has(api)){setError('Document Flow access is unavailable.');return;}
  const id=String(chosen?.Id??'');
  if(editing==='Update'&&!id){setError('Document ID is missing.');return;}
  const input=editing==='Create'
   ?{...changes.header,lineInputs:changes.newLines}
   :{recordId:id,...changes.header,
     removedLines:changes.removedLines,updatedLines:changes.updatedLines,newLines:changes.newLines};
  setBusy(true);setError('');
  try{
   const response=await apiRequest<FlowResponse>('/flows/'+encodeURIComponent(api)+'/execute',
    {method:'POST',body:JSON.stringify(input)});
   const documentId=response.outputs?.documentId??response.variables?.documentId;
   if(response.interviewId||typeof documentId!=='string'||!documentId)
    throw Error('Document Flow did not confirm saving. Check the Flow execution log.');
   setEditing(null);setChosen(null);setDocumentLines([]);
   setNotice(editingObject+' and line items saved together.');
   setReload(count=>count+1);
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(false);}
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(!editing||busy)return;
  const dynamic=editing!=='Delete'&&canDynamic(editing,editingObject);
  if(editingObject==='Appointment'&&!dynamic&&editing!=='Delete'){
   setError('Safe booking Flow V3 is unavailable. Ask your administrator to run the AceAssist app seeder.');
   return;
  }
  const mutationFlow=dynamic?dynamicFlow(editing as 'Create'|'Update',editingObject):
   'AceAssist'+editing+editingObject;
 if(!actions.has(mutationFlow)){setError('The '+editing+' Flow is not available to this user.');return;}
  if(editing==='Delete'&&!chosen?.Id)return;
  if(editing!=='Delete'&&editingObject==='Appointment'){
   const violation=checkBusinessHours(hours,form.StartDateTime??'',form.EndDateTime??'');
   if(violation){setError(violation);return;}
  }
  const payload:Record<string,unknown>={};
  if(editing!=='Create')payload.recordId=chosen?.Id;
  if(editing!=='Delete'){
   for(const field of visibleFields(editingObject)){
    if(fieldKind(field)==='readonly')continue;
    const raw=form[field.apiName]??'';
    payload[field.apiName]=fieldKind(field)==='datetime'&&raw
      ?asBusinessInstant(raw,hours?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone)
      :scalar(raw,field);
   }
  }
  const input=dynamic?{
   recordsInput:[{...payload,...(editing==='Update'?{Id:String(chosen?.Id??'')}:{} )}]
  }:payload;
  setBusy(true);setError('');
  try{
   const response=await apiRequest<FlowResponse>('/flows/'+encodeURIComponent(mutationFlow)+'/execute',
    {method:'POST',body:JSON.stringify(input)});
   if(response.interviewId)throw Error('Workflow requires further input; no record change confirmed.');
   setNotice(editing+' '+editingObject.toLowerCase()+' completed.');
   if(returnToAppointment&&editingObject==='Customer'){
    const returned=response.outputs?.createdRecords??response.variables?.createdRecords;
    const first=Array.isArray(returned)?returned[0] as Row|undefined:undefined;
    const addedId=String(first?.Id??response.outputs?.createdRecordId??response.variables?.createdRecordId??'');
    if(!addedId)throw Error('Customer was saved but the Flow did not return the new record ID');
    setSelected(0);setScreen('records');setEditing('Create');setEditingObject('Appointment');
    setForm({...appointmentDraft,Customer:addedId});setReturnToAppointment(false);
   }else setEditing(null);
   setReload(v=>v+1);
  }catch(ex){setError(ex instanceof Error?ex.message:String(ex));}
  finally{setBusy(false);}
 };

 const openSection=(object:string,row?:Row)=>{
  const index=tabs.findIndex(tab=>tab.object===object);
  if(index<0||!actions.has('AceAssistLoad'+object))return;
  setScreen('records');setSelected(index);setChosen(row??null);
  setEditing(null);setReturnToAppointment(false);setNotice('');setError('');
 };
 const openHome=()=>{
  setScreen('home');setSelected(0);setChosen(null);setEditing(null);
  setReturnToAppointment(false);setNotice('');setError('');
 };
 const openMore=()=>{setScreen('more');setEditing(null);setChosen(null);setNotice('');};
 const openCreate=(object:'Appointment'|'Customer'|'Quotation'|'Invoice')=>{
  const index=tabs.findIndex(tab=>tab.object===object);
  if(index<0)return;
  const authorised=isFinancialDocument(object)?actions.has(documentFlow('Create',object)):
   actions.has('AceAssistCreate'+(object==='Appointment'?'V3':'V2')+object);
  if(!authorised||!actions.has('AceAssistLoad'+object))return;
  setSelected(index);setScreen('records');
  startEdit('Create',undefined,object);
 };
 const displayStart=(value:unknown)=>{
  if(!value)return '';
  try{return asBusinessLocal(String(value),hours?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone);}
  catch{return '';}
 };
 const calendarCustomer=(row:Row)=>{
  const customer=lookupRows.Customer?.find(item=>idOf(item)===String(row.Customer??''));
  return String(customer?.Name??row.CustomerName??row.Name??row.Subject??'Appointment');
 };
 const filteredAppointments=rows.filter(row=>{
  if(calendarStaffFilter&&String(row.AssignedUser??row.AssignedTo??'')!==calendarStaffFilter)return false;
  if(calendarServiceFilter){
   const service=lookupRows.Product?.find(product=>idOf(product)===calendarServiceFilter);
   if(String(row.ServiceProduct??'')!==calendarServiceFilter&&
    (!service||String(row.Service??'')!==String(service.Name??'')))return false;
  }
  return true;
 });
 const changeCalendarDate=(direction:-1|1)=>{
  const day=new Date(weekOf+'T12:00:00');
  if(calendarView==='month')day.setMonth(day.getMonth()+direction);
  else day.setDate(day.getDate()+direction*(calendarView==='week'?7:1));
  setWeekOf(dateKey(day));
 };
 const goToBusinessToday=()=>{
  try{setWeekOf(asBusinessLocal(new Date().toISOString(),
   hours?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0,10));}
  catch{setWeekOf(dateKey(new Date()));}
 };
 const monday=new Date(weekOf+'T12:00:00');
 monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
 const startOfCalendar=new Date(calendarView==='day'?weekOf+'T12:00:00':monday);
 if(calendarView==='month'){
  startOfCalendar.setDate(1);
  startOfCalendar.setDate(startOfCalendar.getDate()-(startOfCalendar.getDay()+6)%7);
 }
 const daysToShow=calendarView==='day'?1:calendarView==='month'?42:7;
 const week=Array.from({length:daysToShow},(_,i)=>{
  const d=new Date(startOfCalendar);d.setDate(d.getDate()+i);return dateKey(d);
 });
 const logout=async()=>{
  try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* clear local session */}
  onLogout();window.location.assign('/login');
 };
 return <div className={'standalone-product custom-'+entry.slug}
   style={{'--product-accent':entry.accent} as React.CSSProperties}>
  <header className="standalone-product-header">
   <div className="standalone-product-brand"><span className="standalone-product-mark">A</span>
    <span><strong>{entry.label}</strong><small>{entry.tagline}</small></span></div>
   <span className="custom-connected">OneEngine connected</span>
   <NotificationBell/>
   <button type="button" className="standalone-product-logout" onClick={()=>void logout()}>Sign out</button>
  </header>
  <main className="custom-assist">
   {screen==='records'&&<div className="custom-heading"><div><span className="custom-eyebrow">ACE ASSIST</span>
    <h1>{current.object==='Appointment'?'Calendar':current.label}</h1><p>Live tenant Objects · OneEngine Flows</p></div>
    <label className="custom-date">{calendarView==='day'?'Date':calendarView==='month'?'Month of':'Week of'}
      <input type="date" value={weekOf} onChange={e=>setWeekOf(e.target.value)}/></label>
   </div>}
   {error&&<p role="alert" className="standalone-product-message">{error}</p>}
   {notice&&<p role="status" className="standalone-product-message">{notice}</p>}
   <nav className="custom-tabs" aria-label="Booking sections">
    <button type="button" aria-current={screen==='home'?'page':undefined}
     onClick={openHome}>Home</button>{tabs.map((tab,i)=>
    <button key={tab.object} type="button" aria-current={screen==='records'&&i===selected?'page':undefined}
     disabled={!loaded.has(tab.object.toLowerCase())||!actions.has('AceAssistLoad'+tab.object)}
     onClick={()=>openSection(tab.object)}>{tab.label}</button>)}</nav>
   {screen==='home'&&<AceAssistDashboard
    appointments={rows} invoices={dashboardInvoices} customers={lookupRows.Customer??[]}
    actions={actions} invoicesLoading={dashboardLoading}
    timeZone={hours?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone}
    onCalendar={()=>openSection('Appointment')} onBilling={()=>openSection('Invoice')}
    onOpen={(object,row)=>openSection(object,row)} onCreate={openCreate}/>}
   {screen==='more'&&<section className="assist-more">
    <div className="assist-more-heading"><span className="assist-phone-eyebrow">ACE ASSIST / WORKSPACE</span>
     <h1>More</h1><p>Manage your business with OneEngine.</p></div>
    <div className="assist-more-links">{tabs.filter(tab=>!['Appointment','Customer','Invoice'].includes(tab.object))
     .map(tab=><button key={tab.object} type="button"
      disabled={!loaded.has(tab.object.toLowerCase())||!actions.has('AceAssistLoad'+tab.object)}
      onClick={()=>openSection(tab.object)}>{tab.label} <span aria-hidden="true">→</span></button>)}</div>
    <button type="button" className="assist-more-signout" onClick={()=>void logout()}>
     <LogOut size={18}/> Sign out</button>
   </section>}
   {screen==='records'&&<AceAssistMobileRecords
    object={current.object} rows={rows} customers={lookupRows.Customer??[]}
    users={lookupRows.User??[]} products={lookupRows.Product??[]}
    date={weekOf} timeZone={hours?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone}
    hours={hours} hoursLoading={hoursLoading} hoursError={hoursError}
    loading={busy} canLoad={can('Load')}
    canCreate={isFinancialDocument(current.object)
      ?actions.has(documentFlow('Create',current.object))
      :can('Create')||canDynamic('Create',current.object)}
    onDateChange={setWeekOf} onOpen={setChosen}
    onCreate={()=>startEdit('Create')}
    onRefresh={()=>{setReload(n=>n+1);setHoursReload(n=>n+1);}}/>}
   {screen==='records'&&<div className="custom-assist-layout"><section className="custom-calendar">
    <div className="custom-panel-title"><h2>{current.label}</h2>
     <div className="custom-panel-toolbar">
      {current.object==='Appointment'&&<label className="assist-view-control">
       View <select value={calendarView} onChange={e=>setCalendarView(e.target.value as 'day'|'week'|'month')}>
        <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
       </select></label>}
      {current.object==='Appointment'&&<div className="assist-date-navigation">
       <button type="button" onClick={()=>changeCalendarDate(-1)} aria-label="Previous period">‹</button>
       <button type="button" onClick={goToBusinessToday}>Today</button>
       <button type="button" onClick={()=>changeCalendarDate(1)} aria-label="Next period">›</button>
      </div>}
      <button type="button" onClick={()=>{setReload(n=>n+1);setHoursReload(n=>n+1);}} disabled={busy}>Refresh</button>
      <button type="button" onClick={()=>startEdit('Create')}
       disabled={isFinancialDocument(current.object)
        ?!actions.has(documentFlow('Create',current.object))||busy:
        !(can('Create')||canDynamic('Create',current.object))||busy}>
       New {current.object}</button>
     </div></div>
    {current.object==='Appointment'&&<div className="assist-calendar-filters">
     <label>Staff<select value={calendarStaffFilter} onChange={e=>setCalendarStaffFilter(e.target.value)}>
       <option value="">All staff</option>{(lookupRows.User??[]).map(user=>
        <option key={idOf(user)} value={idOf(user)}>{String(user.Name??user.Email??idOf(user))}</option>)}
      </select></label>
     <label>Service<select value={calendarServiceFilter} onChange={e=>setCalendarServiceFilter(e.target.value)}>
       <option value="">All services</option>{(lookupRows.Product??[])
        .filter(product=>product.Active!==false&&product.Active!=='false'
         &&product.IsService!==false&&product.IsService!=='false')
        .map(product=><option key={idOf(product)} value={idOf(product)}>{String(product.Name??idOf(product))}</option>)}
      </select></label>
    </div>}
    {current.object==='Appointment'&&<p className="custom-calendar-hours">
     {hoursLoading?'Loading business hours…':hoursError?'Unable to load business hours: '+hoursError
      :hours?'Business hours · '+hours.timezone
      :'No saved business hours found for the signed-in tenant'}
     {!hoursLoading&&!hours&&!hoursError&&activeTenant&&
      <span className="custom-calendar-tenant"> · Tenant: {activeTenant}. Check Company Settings in this same tenant.</span>}
    </p>}
    {!loaded.has(current.object.toLowerCase())&&<p className="custom-empty">Object unavailable to this user.</p>}
    {loaded.has(current.object.toLowerCase())&&!can('Load')&&<p className="custom-empty">
     No authorised Get Records Flow. Ask an administrator to install or activate AceAssistLoad{current.object}.
    </p>}
    {current.object==='Appointment'&&can('Load')?<div className={'custom-week assist-view-'+calendarView}>
     {week.map(date=>{const window=hours?scheduleForDay(hours,date):null;
      return <div className="custom-day" key={date} aria-label={date}>
       <strong>{new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</strong>
       <small>{date.slice(8)}</small>
       <small>{hoursLoading?'Loading…':!hours?'Hours unavailable':window?window.open+'–'+window.close:'Closed / holiday'}</small>
       {filteredAppointments.filter(row=>displayStart(row.StartDateTime).slice(0,10)===date)
        .map((row,i)=><button key={String(row.Id??i)} type="button" className="custom-visit"
        onClick={()=>setChosen(row)}><strong>{calendarCustomer(row)}</strong>
        <small>{displayStart(row.StartDateTime).slice(11,16)} · {String(row.ServiceName??row.Service??'Appointment')}</small>
        <small>{String(row.Status??'Scheduled')}</small></button>)}
      </div>;
     })}</div>:<div className="custom-record-list">
     {rows.map((row,i)=><button key={String(row.Id??i)} type="button" onClick={()=>setChosen(row)}>
      <strong>{title(row)}</strong><small>{String(row.Status??row.Id??'')}</small>
     </button>)}
    </div>}
    {current.object==='Appointment'&&!busy&&rows.length>0&&filteredAppointments.length===0&&
     <p className="custom-empty">No appointments match the selected staff and service filters.</p>}
    {busy&&<p role="status">Running OneEngine Flow…</p>}
    {!busy&&rows.length===0&&can('Load')&&<p className="custom-empty">No accessible records.</p>}
   </section>
   <aside className={'custom-visit-detail'+(!chosen?' custom-detail-empty':'')}>
    <button type="button" className="assist-detail-back" onClick={()=>setChosen(null)}>
     <ArrowLeft size={19}/> Back to {current.label}</button>
    <div className="custom-panel-title"><h2>{isFinancialDocument(current.object)?current.object:'Record'} details</h2>
     <span>OneEngine</span></div>
    {chosen?<><section className="assist-phone-detail-card" aria-label="Selected record">
      <span className="assist-phone-eyebrow">{current.label} / DETAILS</span>
      <div className="assist-phone-detail-title">
       <h1>{current.object==='Appointment'?calendarCustomer(chosen):
        current.object==='Customer'?String(chosen.Name??'Client'):
        String(chosen.InvoiceNumber??chosen.QuotationNumber??chosen.Name??current.object)}</h1>
       {chosen.Status!=null&&<span className="assist-phone-status">
        {String(chosen.Status)}</span>}
      </div>
      <dl>
       {current.object==='Appointment'&&<>
        <div><dt>Service</dt><dd>{String(chosen.ServiceName??chosen.Service??'Appointment')}</dd></div>
        <div><dt>Start</dt><dd>{displayStart(chosen.StartDateTime).replace('T',' · ')||'—'}</dd></div>
        <div><dt>End</dt><dd>{displayStart(chosen.EndDateTime).replace('T',' · ')||'—'}</dd></div>
       </>}
       {current.object==='Customer'&&<>
        <div><dt>Phone</dt><dd>{show(chosen.Phone)}</dd></div>
        <div><dt>Email</dt><dd>{show(chosen.Email)}</dd></div>
       </>}
       {isFinancialDocument(current.object)&&<>
        <div><dt>Customer</dt><dd>{String(lookupRows.Customer?.find(row=>
         idOf(row)===String(chosen.Customer??''))?.Name??'—')}</dd></div>
        <div><dt>Total</dt><dd>{String(chosen.CurrencyCode??'')} {show(chosen.Total)}</dd></div>
        {current.object==='Invoice'&&<div><dt>Paid</dt><dd>{String(chosen.CurrencyCode??'')} {show(chosen.AmountPaid)}</dd></div>}
       </>}
      </dl>
     </section>
     <dl className="assist-raw-details">{Object.entries(chosen).slice(0,14).map(([key,val])=>
      <div key={key}><dt>{key}</dt><dd>{show(val)}</dd></div>)}</dl>
      {isFinancialDocument(current.object)&&<section className="assist-related-list">
       <h3>Line items</h3>
       {!actions.has('AceAssistLoad'+current.object+'Line')
        ?<p>No authorised line lookup Flow.</p>
        :relatedLoading?<p>Loading line items…</p>
        :relatedRows.length?relatedRows.map(line=><div className="assist-related-item" key={idOf(line)}>
         <strong>{title(line)}</strong>
         <span>{String(line.Quantity??'')} × {Number(line.UnitPrice??0).toFixed(2)}
          {' = '}{Number(line.LineTotal??0).toFixed(2)}</span>
        </div>):<p>No line items attached to this document.</p>}
       {chosen.Total!=null&&<p className="assist-related-total">Total: {String(chosen.CurrencyCode??'')}
        {' '}{Number(chosen.Total).toFixed(2)}</p>}
      </section>}
      <div className="custom-action-buttons">
       <button type="button" onClick={()=>startEdit('Update',chosen)}
        disabled={isFinancialDocument(current.object)
         ?!actions.has(documentFlow('Update',current.object))||busy
          ||!actions.has('AceAssistLoad'+current.object+'Line')
         :!(can('Update')||canDynamic('Update',current.object))||busy}>
        {isFinancialDocument(current.object)?'Edit document & items':'Edit'}</button>
       {current.object==='Appointment'&&String(chosen.Status??'')==='Completed'
        &&actions.has('AceAssistInvoiceFromAppointment')&&
        <button type="button" disabled={busy}
         onClick={()=>void runRecordAction('AceAssistInvoiceFromAppointment',chosen)}>Create invoice</button>}
       {['Quotation','Invoice'].includes(current.object)
        &&actions.has('AceAssistLoad'+current.object+'Line')&&
        <button type="button" disabled={busy}
         onClick={()=>{setPrintingDocument(chosen);
          setPrintingObject(current.object as 'Quotation'|'Invoice');}}>
         Print / Save PDF</button>}
       {current.object==='Quotation'&&actions.has('AceAssistSendQuotationWhatsApp')&&
        <button type="button" disabled={busy}
         onClick={()=>void runRecordAction('AceAssistSendQuotationWhatsApp',chosen)}>Send quotation via WhatsApp</button>}
       {current.object==='Invoice'&&actions.has('AceAssistSendInvoiceWhatsApp')&&
        <button type="button" disabled={busy}
         onClick={()=>void runRecordAction('AceAssistSendInvoiceWhatsApp',chosen)}>Send invoice via WhatsApp</button>}
       {current.object==='Quotation'&&actions.has('AceAssistConvertQuoteToInvoice')&&
        <button type="button" disabled={busy} onClick={()=>void runRecordAction('AceAssistConvertQuoteToInvoice',chosen)}>Convert to invoice</button>}
       {current.object==='Invoice'&&actions.has('AceAssistIssueInvoice')&&String(chosen.Status??'')==='Draft'&&
        <button type="button" disabled={busy}
         onClick={()=>void runRecordAction('AceAssistIssueInvoice',chosen)}>Issue invoice</button>}
       {current.object==='Invoice'&&actions.has('AceAssistRecordCashPayment')
        &&['Issued','PartPaid'].includes(String(chosen.Status??''))&&
        <button type="button" disabled={busy} onClick={()=>openCashPayment(chosen)}>
         Record cash payment</button>}
       <button type="button" onClick={()=>startEdit('Delete',chosen)} disabled={!can('Delete')||busy}>Delete</button>
      </div>
     </>:<p className="custom-empty">Select a record to edit or view details.</p>}

   </aside></div>}
  </main>
  <nav className="assist-mobile-nav" aria-label="Primary navigation">
   <button type="button" aria-current={screen==='home'?'page':undefined}
    onClick={openHome}><House size={21} strokeWidth={2}/><span>Home</span></button>
   <button type="button" aria-current={screen==='records'&&current.object==='Appointment'?'page':undefined}
    disabled={!actions.has('AceAssistLoadAppointment')} onClick={()=>openSection('Appointment')}>
    <CalendarDays size={21} strokeWidth={2}/><span>Calendar</span></button>
   <button type="button" aria-current={screen==='records'&&current.object==='Invoice'?'page':undefined}
    disabled={!actions.has('AceAssistLoadInvoice')} onClick={()=>openSection('Invoice')}>
    <ReceiptText size={21} strokeWidth={2}/><span>Billing</span></button>
   <button type="button" aria-current={screen==='records'&&current.object==='Customer'?'page':undefined}
    disabled={!actions.has('AceAssistLoadCustomer')} onClick={()=>openSection('Customer')}>
    <UsersRound size={21} strokeWidth={2}/><span>Clients</span></button>
   <button type="button" aria-current={screen==='more'||screen==='records'&&!['Appointment','Invoice','Customer'].includes(current.object)?'page':undefined}
    onClick={openMore}><Grid2X2 size={21} strokeWidth={2}/><span>More</span></button>
  </nav>

  {printingDocument&&<DocumentPrint objectLabel={printingObject}
   document={printingDocument} lines={relatedRows}
   onClose={()=>setPrintingDocument(null)}/>}
  {cashInvoice&&<div className="assist-modal-backdrop" role="presentation">
   <section className="assist-modal" role="dialog" aria-modal="true"
    aria-label="Record cash settlement">
    <header className="assist-modal-heading"><h2>Record cash payment</h2>
     <button type="button" disabled={busy} onClick={()=>setCashInvoice(null)}>Close</button></header>
    <form className="custom-crud-form" onSubmit={e=>void submitCashPayment(e)}>
     <p>Invoice: {String(cashInvoice.InvoiceNumber??cashInvoice.Name??'')}</p>
     <p>Outstanding: {Math.max(0,Number(cashInvoice.Total??0)-Number(cashInvoice.AmountPaid??0)).toFixed(2)}</p>
     <label>Cash received
      <input type="number" min="0.01" step="0.01" required
       value={cashAmount} onChange={event=>setCashAmount(event.target.value)}/>
     </label>
     <p>Only record cash actually received. Card payments require a verified provider callback.</p>
     {error&&<p role="alert">{error}</p>}
     <footer className="assist-modal-footer">
      <button type="button" disabled={busy} onClick={()=>setCashInvoice(null)}>Cancel</button>
      <button type="submit" disabled={busy}>{busy?'Recording…':'Record payment'}</button>
     </footer>
    </form>
   </section>
  </div>}
  {editing&&editing!=='Delete'&&isFinancialDocument(editingObject)&&
   <FinancialDocumentEditor
    key={editingObject+':'+editing+':'+String(chosen?.Id??'new')}
    type={editingObject} operation={editing}
    document={editing==='Update'?chosen:null} storedLines={documentLines}
    metadataFields={documentFields(editingObject,editing)}
    customers={lookupRows.Customer??[]} products={lookupRows.Product??[]}
    busy={busy} error={error}
    onCancel={()=>setEditing(null)} onSave={saveDocument}/>}
  {editing&&(!isFinancialDocument(editingObject)||editing==='Delete')&&
   <div className="assist-modal-backdrop" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setEditing(null);setReturnToAppointment(false);}}}>
   <section className="assist-modal" role="dialog" aria-modal="true"
    aria-label={editing+' '+editingObject}>
    <header className="assist-modal-heading"><h2>{editing==='Create'?'New':editing} {editingObject}</h2>
     <button type="button" aria-label="Close" disabled={busy}
      onClick={()=>{setEditing(null);setReturnToAppointment(false);}}>✕</button></header>
    <form className="custom-crud-form" onSubmit={e=>void submit(e)}>
     {editing==='Delete'?<p>Delete this record? This action cannot be undone.</p>:
      visibleFields(editingObject)
       .filter(field=>editingObject!=='Appointment'||editing!=='Create'||!['CompletedAt','ExternalBookingId','Resource','Status','TimeZone','ReminderAt','Name','EndDateTime'].includes(field.apiName))
       .map(field=><React.Fragment key={field.apiName}>
        {editingObject==='Appointment'&&['AssignedTo','AssignedUser'].includes(field.apiName)?
         <SearchRecord label="Assigned to" value={form[field.apiName]??''}
          options={selfId&&!lookupRows.User?.some(x=>idOf(x)===selfId)
           ?[{Id:selfId,Name:'Me (current user)'},...(lookupRows.User??[])]:lookupRows.User??[]}
          emptyMessage="No authorised tenant users found"
          onChange={id=>setForm(x=>({...x,[field.apiName]:id}))}/>:
        editingObject==='Appointment'&&field.apiName==='Customer'?
         <SearchRecord label="Customer" value={form.Customer??''}
          options={lookupRows.Customer??[]}
          onChange={id=>setForm(x=>({...x,Customer:id}))}
          addNew={()=>{setAppointmentDraft(form);setReturnToAppointment(true);setEditingObject('Customer');
            setForm({Active:'true'});setChosen(null);}}/>:
        editingObject==='Appointment'&&['Service','ServiceProduct'].includes(field.apiName)?
         <SearchRecord label="Service" value={form[field.apiName]??''}
          options={(lookupRows.Product??[]).filter(r=>r.Active!==false&&r.Active!=='false'
           &&r.IsService!==false&&r.IsService!=='false')} emptyMessage="No available services"
          onChange={id=>{const product=(lookupRows.Product??[]).find(row=>idOf(row)===id);
           const value=field.apiName==='Service'?String(product?.Name??id):id;
           setForm(x=>withServiceEnd({...x,[field.apiName]:value},product));}}/>:
        editingObject==='Appointment'&&['StartDateTime','EndDateTime'].includes(field.apiName)?
         <DateSlotPicker label={field.apiName==='StartDateTime'?'Appointment date and time':'End date and time'}
          value={form[field.apiName]??''} calendar={hours}
          preview={field.apiName==='StartDateTime'?{
           appointments:rows,shifts:lookupRows.StaffAvailability??[],
           exceptions:lookupRows.AvailabilityException??[],
           staffId:form.AssignedUser??form.AssignedTo??selfId,
           resourceId:form.Resource??'',
           durationMinutes:Number((lookupRows.Product??[]).find(product=>
            idOf(product)===(form.ServiceProduct??'')
            ||String(product.Name??'')===(form.Service??''))?.DurationMinutes??30),
           timeZone:hours?.timezone??'UTC',excludeId:chosen?.Id?String(chosen.Id):undefined
          }:undefined}
          startDate={form.StartDateTime?.slice(0,10)}
          minTime={field.apiName==='EndDateTime'?form.StartDateTime?.slice(11,16):undefined}
          onChange={v=>setForm(x=>{
           const next={...x,[field.apiName]:v};
           if(field.apiName!=='StartDateTime')return next;
           const selectedProduct=(lookupRows.Product??[]).find(r=>idOf(r)===next.ServiceProduct
            ||String(r.Name??'')===next.Service);
           return withServiceEnd(next,selectedProduct);
          })}/>:
        fieldKind(field)==='reference'?
         <SearchRecord label={field.label??field.apiName} value={form[field.apiName]??''}
          options={(lookupRows[targetObject(field)??'']??[]).filter(row=>
           targetObject(field)!=='BookableResource'||row.Active!==false&&row.Active!=='false')}
          emptyMessage="No accessible records available for selection"
          onChange={id=>setForm(x=>({...x,[field.apiName]:id}))}/>:
         <RecordFieldInput field={editingObject==='Appointment'&&field.apiName==='Location'?{...field,label:'Address'}:field} value={form[field.apiName]??''}
          onChange={v=>setForm(x=>({...x,[field.apiName]:v}))}/>}
       </React.Fragment>)}
     {error&&<p role="alert">{error}</p>}
     <footer className="assist-modal-footer">
      <button type="button" onClick={()=>{setEditing(null);setReturnToAppointment(false);}} disabled={busy}>Cancel</button>
      <button type="submit" disabled={busy}>{busy?'Saving…':editing==='Delete'?'Delete':'Save'}</button>
     </footer>
    </form>
   </section>
  </div>}
 </div>;
}
