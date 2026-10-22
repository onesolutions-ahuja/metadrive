import {asBusinessLocal} from './businessDateTime';

type Row=Record<string,unknown>;
export type BookingSlotPreview={
 appointments:Row[];shifts:Row[];exceptions:Row[];
 staffId:string;resourceId?:string;durationMinutes:number;timeZone:string;
 excludeId?:string;
};
const toMinutes=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d/.test(value)
 ?Number(value.slice(0,2))*60+Number(value.slice(3,5)):NaN;
const timeLabel=(minutes:number)=>String(Math.floor(minutes/60)).padStart(2,'0')+
 ':'+String(minutes%60).padStart(2,'0');
const enabled=(row:Row)=>row.Active!==false&&row.Active!=='false';
const local=(value:unknown,zone:string):string=>{
 if(typeof value!=='string')return '';
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return value;
 try{return asBusinessLocal(value,zone);}catch{return '';}
};
/** Read-only UX preview from OneEngine Get Records Flow outputs.
 * Saving always rechecks the authenticated, transactional server Flow guards.
 */
export function previewStartSlots(input:{date:string;open:string;close:string;step?:number;
 preview:BookingSlotPreview}):string[]{
 const {date,open,close,preview}=input;
 const step=input.step??30;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)
  ||!/^\d{2}:\d{2}$/.test(open)||!/^\d{2}:\d{2}$/.test(close)
  ||!Number.isSafeInteger(step)||step<5||step>120
  ||!preview.staffId||!preview.timeZone)return [];
 const duration=preview.durationMinutes;
 if(!Number.isFinite(duration)||duration<1||duration>1440)return [];
 const weekday=new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'})
  .format(new Date(date+'T12:00:00Z'));
 const weekly=preview.shifts.filter(row=>enabled(row)&&String(row.OwnerId??'')===preview.staffId);
 const candidate=(slot:number)=>{
  const end=slot+duration;
  if(end>toMinutes(close))return false;
  if(weekly.length&&!weekly.some(row=>
   String(row.Weekday??'')===weekday&&toMinutes(String(row.StartTime??''))<=slot
   &&toMinutes(String(row.EndTime??''))>=end))return false;
  const collides=(row:Row)=>{
   const startLocal=local(row.StartDateTime,preview.timeZone);
   const endLocal=local(row.EndDateTime,preview.timeZone);
   if(!startLocal||!endLocal)return false;
   const startKey=startLocal.slice(0,10),endKey=endLocal.slice(0,10);
   if(startKey!==date&&endKey!==date)return false;
   const begins=toMinutes(startLocal.slice(11,16));
   const finishes=toMinutes(endLocal.slice(11,16));
   return slot<finishes&&end>begins;
  };
  const appointmentBusy=preview.appointments.some(row=>
   enabled(row)&&!['Cancelled','No Show'].includes(String(row.Status??''))
   &&!(preview.excludeId&&String(row.Id??'')===preview.excludeId)
   &&(String(row.AssignedTo??row.AssignedUser??'')===preview.staffId
    ||!!preview.resourceId&&String(row.Resource??'')===preview.resourceId)
   &&collides(row));
  if(appointmentBusy)return false;
  return !preview.exceptions.some(row=>enabled(row)
   &&(String(row.OwnerId??'')===preview.staffId
    ||!!preview.resourceId&&String(row.Resource??'')===preview.resourceId)
   &&collides(row));
 };
 const result:string[]=[];
 for(let slot=toMinutes(open);slot<toMinutes(close);slot+=step)
  if(candidate(slot))result.push(timeLabel(slot));
 return result;
}
