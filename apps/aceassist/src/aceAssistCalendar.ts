export type CalendarHours={closed:boolean;open:string;close:string};
export type BusinessCalendar={
 timezone:string;weeklyHours:Record<string,CalendarHours>;
 holidays:Array<{date:string;label:string}>;
};
const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export const dateKey=(value:Date)=>[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),
 String(value.getDate()).padStart(2,'0')].join('-');
export function scheduleForDay(calendar:BusinessCalendar,date:string):CalendarHours|null{
 const index=new Date(date+'T12:00:00').getDay();
 if(calendar.holidays.some(x=>x.date===date))return null;
 const hours=calendar.weeklyHours[days[index]];
 return !hours||hours.closed?null:hours;
}
/** Client-side early validation; server-side Flow policies remain authoritative. */
export function checkBusinessHours(calendar:BusinessCalendar|null,start:string,end:string):string|null {
 if(!calendar)return 'Business hours are not configured or not accessible. Configure Company Settings before booking.';
 if(!start||!end)return 'Appointment start and end are required.';
 if(start>=end)return 'End must be after start.';
 const startDate=start.slice(0,10),endDate=end.slice(0,10);
 if(startDate!==endDate)return 'Appointments must be within one local business day.';
 const hours=scheduleForDay(calendar,startDate);
 if(!hours)return 'This date is outside business hours or is a holiday.';
 if(start.slice(11,16)<hours.open||end.slice(11,16)>hours.close)
  return 'Appointment must be between '+hours.open+' and '+hours.close+
   ' ('+calendar.timezone+').';
 return null;
}
export const businessCalendarDays=days;
