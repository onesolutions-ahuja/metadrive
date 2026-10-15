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

test('agent2: trusted generated connector defaults survive fresh-tenant bootstrap',()=>{
  const template={
    objects:[],pages:[],flows:[],
    records:{
      Connector_App__c:[{Id:'package-entry',AppKey__c:'whatsapp',Installed__c:false}],
      UneConnector__c:[{Id:'legacy-entry',Name:'WhatsApp'}],
      ConnectorProvider__c:[{Id:'provider-entry',Name:'Provider'}],
      IntegrationConnection__c:[{Id:'private-connection'}],
      Account:[{Id:'customer'}]
    },
    accessControl:{users:[{id:'authorized'}]}
  };
  const fresh=initializeTenantCore(template,{
    authorizedUserIds:['authorized'],trustedProvisioningDefaults:true
  });
  assert.equal(fresh.records.Connector_App__c.length,1);
  assert.equal(fresh.records.UneConnector__c.length,1);
  assert.equal(fresh.records.ConnectorProvider__c.length,1);
  assert.equal(fresh.records.Account,undefined);
  assert.equal(fresh.records.IntegrationConnection__c,undefined);
  assert.equal(fresh.records.Connector_App__c[0].Installed__c,false);
  assert.notEqual(fresh.records.Connector_App__c,template.records.Connector_App__c);
});
