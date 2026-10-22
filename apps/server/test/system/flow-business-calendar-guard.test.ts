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

test('calendar guard compares offset-aware instants using the tenant business timezone',async()=>{
 await enforceFlowBusinessCalendar(db,'tenant',guard,{
  StartDateTime:'2026-07-22T09:00:00.000Z',EndDateTime:'2026-07-22T10:00:00.000Z'
 });
 await assert.rejects(enforceFlowBusinessCalendar(db,'tenant',guard,{
  StartDateTime:'2026-01-22T08:00:00.000Z',EndDateTime:'2026-01-22T09:00:00.000Z'
 }));
});
test('record-collection calendar guard validates actual appointment values',async()=>{
 const fromCollection={...guard,collectionInput:'recordsInput'};
 await enforceFlowBusinessCalendar(db,'tenant',fromCollection,{
  recordsInput:[{StartDateTime:'2026-10-22T09:00:00Z',EndDateTime:'2026-10-22T10:00:00Z'}]
 });
 await assert.rejects(enforceFlowBusinessCalendar(db,'tenant',fromCollection,{
  recordsInput:[{StartDateTime:'2026-10-22T05:00:00Z',EndDateTime:'2026-10-22T06:00:00Z'}]
 }));
});
test('business clock disallows DST gaps and repeated times',async()=>{
 const {asBusinessInstant,asBusinessLocal}=await import('../../../aceassist/src/businessDateTime.js');
 assert.equal(asBusinessInstant('2026-07-22T10:00','Europe/London'),'2026-07-22T09:00:00.000Z');
 assert.equal(asBusinessLocal('2026-07-22T09:00:00.000Z','Europe/London'),'2026-07-22T10:00');
 assert.throws(()=>asBusinessInstant('2026-03-29T01:30','Europe/London'));
 assert.throws(()=>asBusinessInstant('2026-10-25T01:30','Europe/London'));
});
