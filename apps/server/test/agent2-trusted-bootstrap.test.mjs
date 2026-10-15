import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTenantCore} from '../src/seeders/core.mjs';

test('agent2: trusted provisioning never copies tenant business activity',()=>{
  const template={
    objects:[{apiName:'Account'}],pages:[],flows:[],
    records:{Account:[{Id:'customer'}]},recordShares:[{recordId:'customer'}],
    approvalRequests:[{id:'private'}],activities:[{id:'private'}],
    notifications:[{id:'private'}],fieldHistory:[{id:'private'}],
    securityAudit:[{id:'private'}],
    accessControl:{users:[{id:'authorized'}],permissionSets:[]}
  };
  const fresh=initializeTenantCore(template,{
    authorizedUserIds:['authorized'],trustedProvisioningDefaults:true
  });
  assert.deepEqual(fresh.records,{});
  for(const key of ['recordShares','approvalRequests','activities','notifications','fieldHistory','securityAudit'])
    assert.deepEqual(fresh[key],[]);
  assert.equal(fresh.accessControl.users.length,1);
  assert.equal(template.records.Account.length,1);
});
