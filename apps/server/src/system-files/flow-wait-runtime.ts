type FlowWaitConfig=Record<string,unknown>;
type ScheduledPathConfig={timeSourceFieldApiName:unknown;offsetAmount:unknown;offsetUnit:unknown};

function localTimeInZone(dateTime:string,timeZone:string):Date {
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime);
 if(!match)throw new Error('Wait date and time is invalid');
 const [year,month,day,hour,minute]=match.slice(1).map(Number);
 const target=Date.UTC(year,month-1,day,hour,minute);
 const formatter=new Intl.DateTimeFormat('en-US',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  hourCycle:'h23'
 });
 const candidates=new Set<number>();
 for(let offset=-36;offset<=36;offset+=6){
  const instant=target+offset*60*60*1000;
  const parts=Object.fromEntries(formatter.formatToParts(instant)
   .filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const represented=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute);
  candidates.add(target-(represented-instant));
 }
 const matching=[...candidates].filter(instant=>{
  const parts=Object.fromEntries(formatter.formatToParts(instant)
   .filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  return parts.year===year&&parts.month===month&&parts.day===day
   &&parts.hour===hour&&parts.minute===minute;
 }).sort((left,right)=>left-right);
 if(!matching.length)throw new Error('Wait local time does not exist in this time zone');
 return new Date(matching[0]);
}

export function resolveFlowLocalDateTime(date:string,time:string,timeZone:string):Date {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
  throw new Error('Flow local schedule time is invalid');
 return localTimeInZone(date+'T'+time,timeZone);
}

export function resolveFlowWaitUntil(config:FlowWaitConfig,now=new Date()):Date {
 let waitUntil:Date;
 if((config.waitType??'Duration')==='Specific Time'){
  if(typeof config.dateTime!=='string'||typeof config.timeZone!=='string'
    ||config.timeZone.length>100)throw new Error('Wait time configuration is invalid');
  waitUntil=localTimeInZone(config.dateTime,config.timeZone);
 }else if((config.waitType??'Duration')==='Duration'){
  const amount=Number(config.amount);
  const unit=String(config.unit??'Hours');
  const multiplier=unit==='Minutes'?60:unit==='Hours'?3600:unit==='Days'?86400:0;
  if(!Number.isFinite(amount)||amount<=0||amount>365||!multiplier)
   throw new Error('Wait duration configuration is invalid');
  waitUntil=new Date(now.getTime()+amount*multiplier*1000);
 }else throw new Error('Wait type is invalid');
 if(!Number.isFinite(waitUntil.getTime())||waitUntil.getTime()<=now.getTime()
  ||waitUntil.getTime()-now.getTime()>365*86400*1000)
  throw new Error('Wait time must be within the next 365 days');
 return waitUntil;
}

export function resolveFlowScheduledPathAt(record:Record<string,unknown>,
 config:ScheduledPathConfig,now=new Date()):Date|null {
 const field=config.timeSourceFieldApiName;
 if(typeof field!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(field))
  throw new Error('Scheduled Path requires a valid time source field');
 const value=record[field];
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string')throw new Error('Scheduled Path time source must be a Date or DateTime');
 let source:number;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const parsed=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)
   throw new Error('Scheduled Path Date value is invalid');
  source=parsed.getTime();
 }else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)){
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))throw new Error('Scheduled Path DateTime value is invalid');
  source=parsed.getTime();
 }else throw new Error('Scheduled Path time source must be a Date or timezone-qualified DateTime');
 const amount=Number(config.offsetAmount),unit=String(config.offsetUnit);
 const multiplier=unit==='Minutes'?60000:unit==='Hours'?3600000:unit==='Days'?86400000:0;
 if(!Number.isSafeInteger(amount)||Math.abs(amount)>3650||!multiplier)
  throw new Error('Scheduled Path offset is invalid');
 const due=source+amount*multiplier;
 if(!Number.isFinite(due))throw new Error('Scheduled Path time is outside the supported range');
 return new Date(Math.max(due,now.getTime()));
}
