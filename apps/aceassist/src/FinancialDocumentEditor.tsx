import * as React from 'react';
import {useState} from 'react';
import {SearchRecord} from './AppointmentFields';
import {RecordFieldInput,fieldKind,type RecordField} from '../../web/src/core/metadata/Fields/RecordFieldInput';

type Row=Record<string,unknown>;
export type DocumentType='Quotation'|'Invoice';
type Line={
 key:string;Id?:string;Name:string;Product:string;Description:string;
 Quantity:string;UnitPrice:string;DiscountAmount:string;TaxAmount:string
};
const draft=(source?:Row):Line=>({
 key:source?.Id?String(source.Id):crypto.randomUUID(),
 ...(source?.Id?{Id:String(source.Id)}:{}),
 Name:String(source?.Name??''),Product:String(source?.Product??''),
 Description:String(source?.Description??''),Quantity:String(source?.Quantity??'1'),
 UnitPrice:String(source?.UnitPrice??'0'),
 DiscountAmount:String(source?.DiscountAmount??'0'),
 TaxAmount:String(source?.TaxAmount??'0')
});
const fields=['Name','Product','Description','Quantity','UnitPrice','DiscountAmount','TaxAmount'] as const;
const payload=(line:Line):Row=>Object.fromEntries(fields.map(field=>[
 field,field==='Product'?(line.Product||null):
 ['Quantity','UnitPrice','DiscountAmount','TaxAmount'].includes(field)
  ?Number(line[field]):line[field]
]));
const money=(n:number)=>Number.isFinite(n)?n.toFixed(2):'—';
const cents=(n:string)=>Math.round(Number(n)*100);
function rowAmount(line:Line){
 const subtotal=Math.round(cents(line.UnitPrice)*Number(line.Quantity));
 const discount=cents(line.DiscountAmount),tax=cents(line.TaxAmount);
 return {subtotal,discount,tax,total:subtotal-discount+tax};
}
const validLine=(line:Line):string|null=>{
 if(!line.Name.trim())return 'Enter a name or description for each line item.';
 const quantity=Number(line.Quantity);
 if(!Number.isFinite(quantity)||quantity<=0||quantity>100000
  ||Math.abs(quantity*10000-Math.round(quantity*10000))>0.000001)
  return 'Quantity must be positive with at most four decimal places.';
 for(const [name,value] of [['Unit price',line.UnitPrice],['Discount',line.DiscountAmount],
  ['Tax',line.TaxAmount]]){
  const amount=Number(value);
  if(value.trim()===''||!Number.isFinite(amount)||amount<0||amount>100000000
   ||Math.abs(amount*100-Math.round(amount*100))>0.00001)
   return name+' must be a non-negative amount with at most two decimal places.';
 }
 if(rowAmount(line).discount>rowAmount(line).subtotal)
  return 'A line discount cannot exceed the line subtotal.';
 return null;
};
export type DocumentChanges={
 header:Row;newLines:Row[];updatedLines:Row[];removedLines:Row[]
};
export function FinancialDocumentEditor({
 type,operation,document,storedLines,metadataFields,customers,products,busy,error,
 onCancel,onSave
}:{
 type:DocumentType;operation:'Create'|'Update';document:Row|null;storedLines:Row[];
 metadataFields:RecordField[];customers:Row[];products:Row[];busy:boolean;error:string;
 onCancel:()=>void;onSave:(changes:DocumentChanges)=>Promise<void>
}){
 const [header,setHeader]=useState<Record<string,string>>(()=>
  Object.fromEntries(metadataFields.map(field=>[
   field.apiName,String(document?.[field.apiName]??(field.apiName==='CurrencyCode'?'GBP':''))])));
 const [lines,setLines]=useState<Line[]>(()=>storedLines.length?storedLines.map(draft):[draft()]);
 const [localError,setLocalError]=useState('');
 const isQuote=type==='Quotation';
 const status=String(document?.Status??'Draft');
 const finalised=operation==='Update'&&(isQuote
  ?['Accepted','Approved','Converted'].includes(status):status!=='Draft');
 const canEdit=!busy&&!finalised;
 const currency=header.CurrencyCode?.trim()||String(document?.CurrencyCode??'');
 const setLine=(key:string,field:keyof Line,value:string)=>{
  setLines(all=>all.map(line=>line.key===key?{...line,[field]:value}:line));
  setLocalError('');
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!canEdit)return;
  if(!header.Name?.trim()){setLocalError('Document name is required.');return;}
  if(!header.Customer){setLocalError('Select a customer before saving.');return;}
  if(!lines.length||lines.length>200){
   setLocalError('A financial document requires 1 to 200 line items.');return;
  }
  for(const [index,line] of lines.entries()){
   const problem=validLine(line);
   if(problem){setLocalError('Line '+(index+1)+': '+problem);return;}
  }
  const originalIds=new Set(storedLines.map(line=>String(line.Id??'')));
  const remaining=new Set(lines.flatMap(line=>line.Id?[line.Id]:[]));
  const changed=lines.filter(line=>{
   if(!line.Id)return false;
   const previous=storedLines.find(old=>String(old.Id)===line.Id);
   if(!previous)return false;
   return fields.some(field=>String(previous[field]??(field==='Product'?'':'0'))
    !==String((payload(line))[field]??(field==='Product'?'':'0')));
  });
  if(lines.some(line=>line.Id&&!originalIds.has(line.Id))){
   setLocalError('A line no longer belongs to this document. Reload before editing.');
   return;
  }
  if(operation==='Update'&&isQuote&&['Accepted','Approved','Converted'].includes(header.Status??'')
   &&(changed.length||lines.some(line=>!line.Id)||storedLines.some(line=>!remaining.has(String(line.Id))))){
   setLocalError('Save line changes while the quotation is Draft, then change its status separately.');
   return;
  }
  const headerInput:Row={};
  for(const field of metadataFields){
   const value=header[field.apiName]??'';
   headerInput[field.apiName]=value===''?null:fieldKind(field)==='number'
    ?Number(value):value;
  }
  setLocalError('');
  await onSave({
   header:headerInput,
   newLines:lines.filter(line=>!line.Id).map(line=>payload(line)),
   updatedLines:changed.map(line=>({Id:line.Id,...payload(line)})),
   removedLines:storedLines.filter(line=>!remaining.has(String(line.Id)))
    .map(line=>({Id:String(line.Id)}))
  });
 };
 const total=lines.reduce((acc,line)=>{
  const x=rowAmount(line);
  return {subtotal:acc.subtotal+x.subtotal,discount:acc.discount+x.discount,
   tax:acc.tax+x.tax,total:acc.total+x.total};
 },{subtotal:0,discount:0,tax:0,total:0});
 return <div className="assist-modal-backdrop" role="presentation">
  <section className="assist-modal assist-document-modal" role="dialog" aria-modal="true"
   aria-label={(operation==='Create'?'New ':'Edit ')+type}>
   <header className="assist-modal-heading">
    <div><small>{operation==='Create'?'Create document':'Edit document'}</small>
     <h2>{type} {document?.QuotationNumber??document?.InvoiceNumber??''}</h2></div>
    <button type="button" disabled={busy} onClick={onCancel} aria-label="Close editor">✕</button>
   </header>
   <form className="assist-document-form" onSubmit={event=>void submit(event)}>
    {finalised&&<p role="status" className="assist-document-lock">
     This document is finalised. Its financial contents cannot be edited.</p>}
    <h3>Document details</h3>
    <div className="assist-document-header-fields">
     {metadataFields.map(field=><React.Fragment key={field.apiName}>
      {field.apiName==='Customer'?
       <SearchRecord label="Customer" value={header.Customer??''} options={customers}
        emptyMessage="No authorised customers available"
        onChange={id=>setHeader(previous=>({...previous,Customer:id}))}/>:
       <RecordFieldInput field={field} value={header[field.apiName]??''}
        onChange={value=>setHeader(previous=>({...previous,[field.apiName]:value}))}/>}
     </React.Fragment>)}
    </div>
    <div className="assist-document-line-heading">
     <div><h3>Products and services</h3>
      <p>Line totals and document totals are verified when saved by OneEngine.</p></div>
     <button type="button" disabled={!canEdit||lines.length>=200}
      onClick={()=>setLines(list=>[...list,draft()])}>+ Add line</button>
    </div>
    <div className="assist-document-line-list">
     {lines.map((line,index)=>{
      const amount=rowAmount(line);
      return <fieldset className="assist-document-line" key={line.key} disabled={!canEdit}>
       <legend>Item {index+1}</legend>
       <div className="assist-document-line-main">
        <SearchRecord label="Product / service (optional)" value={line.Product} options={products}
         emptyMessage="Choose a product or enter an item name below"
         onChange={id=>{
          const product=products.find(p=>String(p.Id)===id);
          setLines(previous=>previous.map(old=>old.key===line.key
           ?{...old,Product:id,Name:old.Name||String(product?.Name??''),
              UnitPrice:old.UnitPrice==='0'&&product?.Price!=null
               ?String(product.Price):old.UnitPrice}:old));
         }}/>
        <label>Item name
         <input type="text" required value={line.Name}
          onChange={e=>setLine(line.key,'Name',e.target.value)}/></label>
       </div>
       <label>Description
        <input type="text" value={line.Description}
         onChange={e=>setLine(line.key,'Description',e.target.value)}/></label>
       <div className="assist-document-line-numbers">
        {([['Quantity','Qty'],['UnitPrice','Unit price'],
          ['DiscountAmount','Discount'],['TaxAmount','Tax']] as const)
         .map(([field,label])=><label key={field}>{label}
          <input type="number" inputMode="decimal" required min={field==='Quantity'?'0.0001':'0'}
           step={field==='Quantity'?'0.0001':'0.01'} value={line[field]}
           onChange={e=>setLine(line.key,field,e.target.value)}/></label>)}
        <div className="assist-document-line-total"><span>Line total</span>
         <strong>{currency} {money(amount.total/100)}</strong></div>
       </div>
       <button className="assist-document-remove" type="button" disabled={!canEdit||lines.length===1}
        onClick={()=>setLines(previous=>previous.filter(item=>item.key!==line.key))}>
        Remove item</button>
      </fieldset>;
     })}
    </div>
    <dl className="assist-document-totals">
     <div><dt>Subtotal</dt><dd>{currency} {money(total.subtotal/100)}</dd></div>
     <div><dt>Discount</dt><dd>− {currency} {money(total.discount/100)}</dd></div>
     <div><dt>Tax</dt><dd>{currency} {money(total.tax/100)}</dd></div>
     <div className="assist-document-grand-total"><dt>Total</dt>
      <dd>{currency} {money(total.total/100)}</dd></div>
    </dl>
    {(localError||error)&&<p role="alert" className="assist-document-error">{localError||error}</p>}
    <footer className="assist-modal-footer">
     <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
     <button type="submit" disabled={!canEdit}>{busy?'Saving document…':'Save '+type}</button>
    </footer>
   </form>
  </section>
 </div>;
}
