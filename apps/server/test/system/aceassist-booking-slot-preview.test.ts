import assert from 'node:assert/strict';
import {test} from 'node:test';
import {previewStartSlots,type BookingSlotPreview} from '../../../aceassist/src/bookingSlotPreview.js';

const base:BookingSlotPreview={appointments:[],shifts:[],exceptions:[],
 staffId:'staff-1',resourceId:'room-1',durationMinutes:60,timeZone:'UTC'};
const booking=(start:string,end:string,overrides:Record<string,unknown>={})=>({
 StartDateTime:'2026-10-22T'+start+':00Z',EndDateTime:'2026-10-22T'+end+':00Z',
 AssignedTo:'staff-1',Resource:'room-1',Status:'Scheduled',...overrides
});
const times=(preview:BookingSlotPreview)=>previewStartSlots({
 date:'2026-10-22',open:'09:00',close:'12:00',preview
});
test('staff booking preview hides overlapping appointments and never exceeds closing time',()=>{
 const values=times({...base,appointments:[booking('10:30','11:30')]});
 assert.deepEqual(values,['09:00','09:30']);
});
test('another member of staff using the same room blocks its shared slots',()=>{
 const values=times({...base,appointments:[booking('10:00','11:00',{AssignedTo:'staff-2'})]});
 assert.equal(values.includes('10:00'),false);
 assert.equal(values.includes('09:00'),true);
});
test('configured shifts restrict the preliminary slots',()=>{
 const shift={OwnerId:'staff-1',Weekday:'Thursday',StartTime:'10:00',EndTime:'12:00',Active:true};
 assert.deepEqual(times({...base,shifts:[shift]}),['10:00','10:30','11:00']);
});
test('staff time off blocks slots, cancelled appointments do not',()=>{
 const exception={OwnerId:'staff-1',Active:true,
  StartDateTime:'2026-10-22T10:00:00Z',EndDateTime:'2026-10-22T11:00:00Z'};
 const values=times({...base,exceptions:[exception],appointments:[
  booking('09:00','10:00',{Status:'Cancelled'})]});
 assert.equal(values.includes('09:00'),true);
 assert.equal(values.includes('10:00'),false);
});
