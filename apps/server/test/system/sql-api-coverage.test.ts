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
  'POST /api/apps/:apiName/update','POST /api/apps/:apiName/uninstall'
 ])assert.ok(registered.has(route),'Missing SQL endpoint: '+route);
});
