import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SystemDefinitionService} from '../../src/system-files/system-definition-service.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import type {DashboardSnapshotService} from '../../src/system-support/dashboard-snapshot-service.js';
import {DashboardSubscriptionService,nextDashboardDeliveryAt} from '../../src/system-support/dashboard-subscription-service.js';

test('dashboard subscriptions use tenant local time and handle daylight saving',()=>{
 assert.equal(nextDashboardDeliveryAt(new Date('2026-10-18T10:30:00Z'),
  'Europe/London','12:00','Daily',null).toISOString(),'2026-10-18T11:00:00.000Z');
 assert.equal(nextDashboardDeliveryAt(new Date('2026-10-18T10:30:00Z'),
  'Europe/London','09:00','Weekly',1).toISOString(),'2026-10-19T08:00:00.000Z');
 assert.equal(nextDashboardDeliveryAt(new Date('2026-10-26T10:30:00Z'),
  'Europe/London','12:00','Daily',null).toISOString(),'2026-10-26T12:00:00.000Z');
 assert.throws(()=>nextDashboardDeliveryAt(new Date(),'Not/A_Zone','10:00','Daily',null));
});
test('dashboard subscriptions deny mail delivery before OneEngine checks pass',async()=>{
 let sqlAccess=false;
 const db={query:async()=>{sqlAccess=true;throw Error('Unexpected SQL');}} as unknown as SqlPersistence;
 const definitions={list:async()=>[{
  apiName:'Demo',status:'Deployed',visibility:'All Users',components:[]}]} as unknown as SystemDefinitionService;
 const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 const svc=new DashboardSubscriptionService(db,rbac,definitions,
  {} as NamedCredentialService,{} as DashboardSnapshotService);
 await assert.rejects(()=>svc.run({tenant_id:'tenant',user_id:'user'},'Demo',
  '123e4567-e89b-42d3-a456-426614174000'),/Permission denied/);
 assert.equal(sqlAccess,false);
});
