import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {sealIntegrationEnvelope,openIntegrationEnvelope} from '../../apps/server/src/connector-envelope.js';
import {connectorEntitlement,activeConnectorFlowReferences,applyConnectorLifecycle}
 from '../../apps/server/src/connector-app-runtime.js';

const now=new Date('2026-10-16T12:00:00Z');
const app={AppKey__c:'booking',Name:'Booking',CredentialName__c:'booking-api',
 Installed__c:true,TrialUsed__c:true,TrialDays__c:14,
 TrialStartedAt__c:'2026-10-10T00:00:00Z',TrialExpiresAt__c:'2026-10-24T00:00:00Z'};
const credential={id:'cred1',name:'booking-api'};

test('encrypted payload cannot be opened from a different tenant or job',()=>{
 const ring={activeKeyId:'v1',keys:new Map([['v1',randomBytes(32)]])};
 const data={text:'SECRET'};
 const sealed=sealIntegrationEnvelope('a','job1',data,ring);
 assert.ok(!sealed.includes('SECRET'));
 assert.deepEqual(openIntegrationEnvelope('a','job1',sealed,ring),data);
 assert.throws(()=>openIntegrationEnvelope('b','job1',sealed,ring),/INVALID/);
 assert.throws(()=>openIntegrationEnvelope('a','job2',sealed,ring),/INVALID/);
});
test('entitlement checks installation, expiry and ambiguous ownership',()=>{
 assert.equal(connectorEntitlement([app],credential,now).allowed,true);
 assert.equal(connectorEntitlement([{...app,Installed__c:false}],credential,now).allowed,false);
 assert.equal(connectorEntitlement([{...app,TrialExpiresAt__c:'2026-01-01T00:00:00Z'}],credential,now).allowed,false);
 assert.equal(connectorEntitlement([app,app],credential,now).allowed,false);
});
test('active Flow references block AppExchange uninstallation',()=>{
 const flows=[{apiName:'Notify',label:'Notify',status:'Active',
  elements:[{type:'HTTP Callout',config:{namedCredentialId:'cred1'}}]}];
 assert.deepEqual(activeConnectorFlowReferences(app,[credential],flows),['Notify']);
 assert.throws(()=>applyConnectorLifecycle(app,{...app,Installed__c:false},
  [credential],flows,now),/Cannot uninstall/);
});
