import assert from 'node:assert/strict';
import {test} from 'node:test';
import {enforceRecordOverlap} from '../../src/system-files/nodes/RecordOverlapGuard.js';

const config={startField:'StartDateTime',endField:'EndDateTime',
 groupFields:['AssignedTo'],statusField:'Status',excludedStatuses:['Cancelled']};
const record={StartDateTime:'2026-10-22T09:00:00Z',EndDateTime:'2026-10-22T10:00:00Z',
 AssignedTo:'staff-1',Status:'Scheduled'};
test('metadata interval guard uses a transaction advisory lock and tenant/record predicates',async()=>{
 const queries:Array<{sql:string;values:unknown[]}>= [];
 const client={query:async(sql:string,values:unknown[])=>{
  queries.push({sql,values});return {rowCount:0,rows:[]};
 }} as never;
 await enforceRecordOverlap(client,'tenant','Appointment',config,record);
 assert.match(queries[0].sql,/pg_advisory_xact_lock/);
 assert.match(queries[1].sql,/r.tenant_id=\$1 AND r.object_api=\$2/);
 assert.match(queries[1].sql,/r.is_deleted=false/);
 assert.equal(queries[1].values[5],'staff-1');
});
test('conflicts reject, cancelled records skip, and no assignee fails closed',async()=>{
 const client={query:async(sql:string)=>sql.includes('SELECT 1 FROM md_records')
  ?{rows:[{}],rowCount:1}:{rows:[],rowCount:1}} as never;
 await assert.rejects(enforceRecordOverlap(client,'tenant','Appointment',config,record),/already booked/);
 await enforceRecordOverlap(client,'tenant','Appointment',config,{...record,Status:'Cancelled'});
 await assert.rejects(enforceRecordOverlap(client,'tenant','Appointment',config,{
  ...record,AssignedTo:''}),/requires an assigned/);
});

test('simultaneous bookings lock and check every occupied staff and room',async()=>{
 const requests:Array<{sql:string;values:unknown[]}>= [];
 const client={query:async(sql:string,values:unknown[])=>{
  requests.push({sql,values});return {rows:[],rowCount:0};
 }} as never;
 await enforceRecordOverlap(client,'tenant','Appointment',
  {...config,groupFields:['AssignedTo','Resource']},{...record,Resource:'room-2'});
 const locks=requests.filter(q=>q.sql.includes('pg_advisory_xact_lock'));
 const lookups=requests.filter(q=>q.sql.includes('SELECT 1 FROM md_records'));
 assert.equal(locks.length,2);
 assert.equal(lookups.length,2);
 assert.deepEqual(lookups.map(q=>q.values[5]).sort(),['room-2','staff-1']);
});
