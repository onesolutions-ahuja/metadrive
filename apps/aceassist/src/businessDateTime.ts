/** Convert between timezone-qualified instants and the tenant's wall clock.
 * Ambiguous/nonexistent DST times are rejected instead of silently shifted. */
const localPattern=/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
function clockFormat(timeZone:string){
 return new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
}
function clock(instant:Date,formatter:Intl.DateTimeFormat):string {
 const values=Object.fromEntries(formatter.formatToParts(instant).map(x=>[x.type,x.value]));
 return values.year+'-'+values.month+'-'+values.day+'T'+values.hour+':'+values.minute;
}
export function asBusinessLocal(value:string,timeZone:string):string {
 if(localPattern.test(value))return value;
 const instant=new Date(value);
 if(!Number.isFinite(instant.getTime()))throw Error('Invalid stored date and time');
 return clock(instant,clockFormat(timeZone));
}
export function asBusinessInstant(local:string,timeZone:string):string {
 const match=localPattern.exec(local);
 if(!match)throw Error('Choose a valid appointment date and time');
 const [,year,month,day,hour,minute]=match;
 const guess=Date.UTC(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute));
 const formatter=clockFormat(timeZone);
 const instants:string[]=[];
 for(let offset=-14*60;offset<=14*60;offset+=15){
  const candidate=new Date(guess-offset*60000);
  if(clock(candidate,formatter)===local)instants.push(candidate.toISOString());
  if(instants.length>1)break;
 }
 if(instants.length!==1)throw Error(instants.length?'Ambiguous local time due to daylight-saving change':
  'Nonexistent or invalid local time');
 return instants[0];
}
