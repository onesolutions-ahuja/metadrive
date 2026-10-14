import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectState,restoreState,stateDigest} from '../src/relational-projection.mjs';
import {restoreState as restoreModule} from '../src/platform-state-restore.mjs';

const fixture=()=>({
  tenants:{'tenant-a':{objects:[],records:{Product:[{Id:'p1',Name:'A'}]},pages:[{apiName:'Welcome'}],customSettings:{color:'blue'}}},
  libraryComponents:[{apiName:'Card'}],users:[],refreshSessions:[],revokedAccessTokens:{},
  platformPolicies:{restricted:true},platformPolicyAudit:[],tenantRegistry:{},tenantManagementAudit:[]
});
test('extracted state restoration retains public export and a lossless round trip',()=>{
  const source=fixture(),rows=projectState(source);
  assert.equal(restoreModule,restoreState);
  assert.equal(stateDigest(restoreState(rows)),stateDigest(source));
  assert.deepEqual(restoreState(rows),source);
});
test('restore refuses unknown or duplicate platform settings',()=>{
  const rows=projectState(fixture());
  assert.throws(()=>restoreState({...rows,platformSettings:[...rows.platformSettings,{key:'fake',payload:{}}]}),/unknown or duplicate platform setting/);
  assert.throws(()=>restoreState({...rows,platformSettings:[...rows.platformSettings,rows.platformSettings[0]]}),/unknown or duplicate platform setting/);
});
test('restore refuses incompatible platform metadata shape',()=>{
  const rows=projectState(fixture());
  const wrong=rows.platformSettings.map(item=>item.key==='platformPolicyAudit'?{...item,payload:{}}:item);
  assert.throws(()=>restoreState({...rows,platformSettings:wrong}),/must be an array/);
});
