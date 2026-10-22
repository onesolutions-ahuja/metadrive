import assert from 'node:assert/strict';
import {test} from 'node:test';
import {APPOINTMENT_OBJECTS,APPOINTMENT_STATUSES,seedAppointmentObjects,
 grantAceAssistAppointmentAccess,seedAppointmentObjectsForExistingTenants
} from '../../src/app-seeders/core-appointment-objects.js';

test('Appointment is a standard, Flow-editable object with calendar fields and no fabricated records',async()=>{
 const seen:Array<{sql:string;params:unknown[]}>= [];
 const tx={query:async(sql:string,params:unknown[]=[])=>{
  seen.push({sql,params});return {rows:[]};
 }};
 await seedAppointmentObjects(tx as never,'tenant');
 assert.equal(APPOINTMENT_OBJECTS[0].apiName,'Appointment');
 assert.ok(APPOINTMENT_OBJECTS[0].fields.some(f=>f.apiName==='StartDateTime'&&f.dataType==='datetime'));
 assert.ok(APPOINTMENT_OBJECTS[0].fields.some(f=>f.apiName==='EndDateTime'&&f.dataType==='datetime'));
 assert.ok(APPOINTMENT_OBJECTS[0].fields.some(f=>f.apiName==='Customer'&&f.dataType==='reference'));
 assert.ok(APPOINTMENT_STATUSES.includes('Scheduled'));
 assert.ok(seen.some(x=>x.sql.includes('md_object_definitions')&&x.params.includes('Appointment')));
 assert.equal(seen.filter(x=>x.sql.includes('md_field_definitions')).length,15);
 assert.equal(seen.filter(x=>x.sql.includes('md_field_picklist_values')).length,7);
 assert.ok(seen.every(x=>/ON CONFLICT/.test(x.sql)));
 assert.ok(seen.every(x=>!/INSERT INTO md_records\b/i.test(x.sql)));
});

test('Ace Assist permissions are restricted to appointment object and fields',async()=>{
 const queries:string[]=[];
 const tx={query:async(sql:string)=>{queries.push(sql);return {rows:[]};}};
 await grantAceAssistAppointmentAccess(tx as never,'tenant');
 assert.equal(queries.length,1);
 assert.match(queries[0],/md_permission_rules/);
 assert.match(queries[0],/AceAssistUser/);
 assert.match(queries[0],/Appointment/);
 assert.match(queries[0],/read/);
 assert.match(queries[0],/create/);
 assert.match(queries[0],/edit/);
});

test('Versioned Appointment seeder reconciles existing tenants and keeps their data unchanged',async()=>{
 const queries:string[]=[];
 const tx={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('SELECT id FROM md_tenants'))return {rows:[{id:'tenant'}]};
  return {rows:[]};
 }};
 const db={transaction:async(fn:(client:typeof tx)=>Promise<number>)=>fn(tx)};
 const count=await seedAppointmentObjectsForExistingTenants(db as never);
 assert.equal(count,1);
 assert.ok(queries.some(sql=>sql.includes('INSERT INTO md_system_migrations')));
 assert.ok(queries.every(sql=>!/INSERT INTO md_records\b/i.test(sql)));
});
