import assert from 'node:assert/strict';
import {test} from 'node:test';
import {enforceRecordAvailability} from '../../src/system-files/nodes/RecordAvailabilityGuard.js';

const guard={startField:'StartDateTime',endField:'EndDateTime',statusField:'Status',
 excludedStatuses:['Cancelled'],staffFields:['AssignedUser','AssignedTo'],resourceField:'Resource',
 schedule:{object:'StaffAvailability',staff:'OwnerId',active:'Active',
  weekday:'Weekday',start:'StartTime',end:'EndTime'},
 exception:{object:'AvailabilityException',staff:'OwnerId',resource:'Resource',
  active:'Active',start:'StartDateTime',end:'EndDateTime'}};
const record={StartDateTime:'2026-10-22T10:00:00Z',EndDateTime:'2026-10-22T11:00:00Z',
 AssignedUser:'11111111-1111-4111-8111-111111111111',Resource:'room-2',Status:'Scheduled'};
function stub(configured:boolean,covered:boolean,blackout:boolean){
 const queries:Array<{sql:string;values:unknown[]}>= [];
 const client={query:async(sql:string,values:unknown[])=>{
  queries.push({sql,values});
  if(sql.includes('FROM md_users'))return {rows:[{id:'11111111-1111-4111-8111-111111111111'}],rowCount:1};
  if(sql.includes('md_tenant_settings'))return {rows:[{properties:{timezone:'Europe/London'}}],rowCount:1};
  if(sql.includes('BOOL_OR'))return {rows:[{configured,covered}],rowCount:1};
  return {rows:[],rowCount:blackout?1:0};
 }} as never;
 return {client,queries};
}
test('scheduling guard checks tenant staff shifts and resource exceptions',async()=>{
 const {client,queries}=stub(true,true,false);
 await enforceRecordAvailability(client,'tenant',guard,record);
 assert.equal(queries.length,4);
 assert.match(queries[2].sql,/r.tenant_id=\$1/);
 assert.match(queries[3].sql,/value_datetime/);
 assert.deepEqual(queries[3].values[8],['room-2']);
 assert.equal(queries[3].values[9],'11111111-1111-4111-8111-111111111111');
 assert.match(queries[3].sql,/r.owner_id::text/);
 assert.match(queries[2].sql,/r.owner_id::text/);
});
test('configured staff shifts outside allowed time reject appointment',async()=>{
 const {client}=stub(true,false,false);
 await assert.rejects(enforceRecordAvailability(client,'tenant',guard,record),/outside assigned staff/);
});
test('unconfigured shifts inherit tenant business hours; time-off and booked room reject',async()=>{
 const {client}=stub(false,false,true);
 await assert.rejects(enforceRecordAvailability(client,'tenant',guard,record),/unavailable/);
});
test('cancelled appointments skip availability and invalid input fails closed',async()=>{
 const {client,queries}=stub(true,false,true);
 await enforceRecordAvailability(client,'tenant',guard,{...record,Status:'Cancelled'});
 assert.equal(queries.length,0);
 await assert.rejects(enforceRecordAvailability(client,'tenant',guard,{
  ...record,AssignedUser:''}),/requires assigned staff/);
});
