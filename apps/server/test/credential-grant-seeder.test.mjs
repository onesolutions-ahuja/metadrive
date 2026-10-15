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

test('explicit tenant-matched approved user receives all trusted credential grants, never another tenant',()=>{
  const directive=pkg.installation.credentialGrantSeeds;
  const tenant={objects:[{apiName:'Chatter_Channel_Grant__c'}],accessControl:{users:[
    {id:'target',username:'support@unesolutions.co.uk',profileId:'executive'},
    {id:'other',username:'other@example.com',profileId:'executive'}
  ]},records:{Chatter_Channel_Grant__c:[]},namedCredentials:[
    {id:'a',name:'Channel A',protocol:'HTTPS',enabled:true,baseUrl:'https://graph.facebook.com/v22.0/',configuration:{PhoneNumberId:'1234567890'}},
    {id:'b',name:'Channel B',protocol:'HTTPS',enabled:true,baseUrl:'https://graph.facebook.com/v22.0/',configuration:{PhoneNumberId:'9876543210'}},
    {id:'bad',name:'Other provider',protocol:'HTTPS',enabled:true,baseUrl:'https://untrusted.example/v22.0/',configuration:{PhoneNumberId:'1234567890'}}
  ]};
  const mismatched=seedCredentialGrants(tenant,directive,'other-tenant');
  assert.strictEqual(mismatched,tenant);
  const seeded=seedCredentialGrants(tenant,directive,'unesolutions-dev');
  assert.equal(seeded.records.Chatter_Channel_Grant__c.length,2);
  assert(seeded.records.Chatter_Channel_Grant__c.every(row=>row.User_Id__c==='target'&&row.Can_Read__c===true&&row.Can_Send__c===true&&row.Can_Assign__c===true));
  assert.strictEqual(seedCredentialGrants(seeded,directive,'unesolutions-dev'),seeded);
});
