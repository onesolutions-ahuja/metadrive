import assert from 'node:assert/strict';
import {test} from 'node:test';
import {enforceFlowBusinessCalendar} from '../../src/flow-engine/FlowBusinessCalendarGuard.js';

const settings={timezone:'Europe/London',weeklyHours:{
 monday:{closed:false,open:'09:00',close:'17:00'},
 tuesday:{closed:false,open:'09:00',close:'17:00'},
 wednesday:{closed:false,open:'09:00',close:'17:00'},
 thursday:{closed:false,open:'09:00',close:'17:00'},
 friday:{closed:false,open:'09:00',close:'17:00'},
 saturday:{closed:true,open:'09:00',close:'17:00'},
 sunday:{closed:true,open:'09:00',close:'17:00'}},
 holidays:[{date:'2026-10-26',label:'Closed day'}]};
const db={query:async()=>({rows:[{properties:settings}]})} as never;
const guard={startInput:'StartDateTime',endInput:'EndDateTime'};
test('generic Flow calendar guard allows working-hours bookings',async()=>{
 await enforceFlowBusinessCalendar(db,'tenant',guard,{StartDateTime:'2026-10-22T10:00',EndDateTime:'2026-10-22T11:30'});
});
test('generic Flow calendar guard blocks holidays, weekends, invalid slots',async()=>{
 for(const [start,end] of [
  ['2026-10-26T10:00','2026-10-26T11:00'],
  ['2026-10-24T10:00','2026-10-24T11:00'],
  ['2026-10-22T08:00','2026-10-22T09:00'],
  ['2026-10-22T16:30','2026-10-22T18:00'],
  ['2026-10-22T11:00','2026-10-22T10:00']
 ])await assert.rejects(enforceFlowBusinessCalendar(db,'tenant',guard,
  {StartDateTime:start,EndDateTime:end}));
});
test('calendar guard fails closed if tenant has no configured calendar',async()=>{
 const missing={query:async()=>({rows:[]})} as never;
 await assert.rejects(enforceFlowBusinessCalendar(missing,'tenant',guard,
  {StartDateTime:'2026-10-22T10:00',EndDateTime:'2026-10-22T11:00'}));
});
