import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import {OAuthAuthorizationService} from '../../src/system-support/oauth-authorization-service.js';

test('PKCE start denies privilege escalation before access to stored credentials',async()=>{
 let accessed=false;
 const db={query:async()=>{accessed=true;throw Error('SQL not authorised');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine;
 const service=new OAuthAuthorizationService(db,rbac,{} as NamedCredentialService);
 await assert.rejects(service.start('tenant','actor','123e4567-e89b-42d3-a456-426614174000'),/Permission denied/);
 assert.equal(accessed,false);
});
test('PKCE rejects invalid callback state before SQL or token exchanges',async()=>{
 let accessed=false;
 const db={transaction:async()=>{accessed=true;throw Error('Unexpected transaction');}} as unknown as SqlPersistence;
 const service=new OAuthAuthorizationService(db,{} as RbacEngine,{} as NamedCredentialService);
 await assert.rejects(service.complete('invalid','code'),/Invalid OAuth authorization response/);
 assert.equal(accessed,false);
});
