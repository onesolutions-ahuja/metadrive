import assert from 'node:assert/strict';
import test from 'node:test';
import {seedCredentialGrants} from '../src/credential-grant-seeder.mjs';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
const pkg=catalog.packages.find(p=>p.appKey==='whatsapp');
test('declarative credential grant seeder is safe, idempotent and tenant scoped',()=>{
  const tenant={objects:[{apiName:'Chatter_Channel_Grant__c'}],accessControl:{users:[
    {id:'admin-a',profileId:'system-administrator'},{id:'user-b',profileId:'standard-user'}
  ]},records:{Chatter_Channel_Grant__c:[]},namedCredentials:[
    {id:'good',name:'WhatsApp_Main',protocol:'HTTPS',enabled:true,
      baseUrl:'https://graph.facebook.com/v22.0/1234567890/',configuration:{PhoneNumberId:'1234567890'}},
    {id:'wrong',name:'Elsewhere',protocol:'HTTPS',enabled:true,
      baseUrl:'https://other.example.com/v22.0/1234567890/'}
  ]};
  const first=seedCredentialGrants(tenant,pkg.installation.credentialGrantSeeds);
  assert.equal(first.records.Chatter_Channel_Grant__c.length,1);
  assert.equal(first.records.Chatter_Channel_Grant__c[0].User_Id__c,'admin-a');
  assert.equal(first.records.Chatter_Channel_Grant__c[0].Channel_Account__c,'1234567890');
  const again=seedCredentialGrants(first,pkg.installation.credentialGrantSeeds);
  assert.strictEqual(again,first);
  assert.equal(tenant.records.Chatter_Channel_Grant__c.length,0);
});
