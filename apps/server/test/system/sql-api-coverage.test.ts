import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSystemServer} from '../../src/system-files/server.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('core SQL runtime registers required builder, user and AppExchange API routes',()=>{
 const app=createSystemServer({} as SqlPersistence);
 const registered=new Set<string>();
 for(const layer of app._router.stack){
  if(!layer.route)continue;
  const methods=Object.keys(layer.route.methods);
  for(const method of methods)registered.add(method.toUpperCase()+' '+layer.route.path);
 }
 for(const route of [
  'GET /api/metadata/permissions','GET /api/metadata/flows','PUT /api/metadata/flows/:apiName',
  'POST /api/metadata/flows/:apiName/activate','GET /api/flows/:apiName/debug-runs',
  'PUT /api/metadata/pages/:apiName','POST /api/metadata/pages/:apiName/activate',
  'PUT /api/metadata/pages/:apiName/components/:componentId/properties',
  'GET /api/auth/users','GET /api/auth/sessions','POST /api/auth/sessions/revoke-all',
  'GET /api/connector-apps/catalog','POST /api/apps/:apiName/install',
  'POST /api/apps/:apiName/update','POST /api/apps/:apiName/uninstall',
  'POST /api/flows/:apiName/screen/start','POST /api/flow-interviews/:id/next',
  'GET /api/notifications','POST /api/notifications/:id/read',
  'GET /api/metadata/route-aliases','PUT /api/metadata/route-aliases/:appId/:slug',
  'DELETE /api/metadata/route-aliases/:appId/:slug','GET /api/routes/resolve/:appId/:slug',
  'POST /api/metadata/flows/:apiName/publish','POST /api/metadata/pages/:apiName/publish',
  'POST /api/auth/password-reset/request','POST /api/auth/password-reset/confirm',
  'POST /api/auth/mfa/verify','GET /api/auth/mfa/status','GET /api/auth/mfa/policy',
  'PUT /api/auth/mfa/policy','POST /api/auth/mfa/enroll','POST /api/auth/mfa/enroll/confirm',
  'POST /api/auth/mfa/disable','PUT /api/auth/password-recovery/settings',
  'GET /api/metadata/flows/:apiName/versions','POST /api/flow-interviews/:id/cancel'
 ])assert.ok(registered.has(route),'Missing SQL endpoint: '+route);
});
