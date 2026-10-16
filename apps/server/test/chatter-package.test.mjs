import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {applyInstallableAppPackages} from '../src/installable-app-packages.mjs';
const catalog=JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
const rights={read:true,create:true,edit:true,delete:true,viewAll:true,modifyAll:true};
const tenant=()=>({
  objects:[{apiName:'Communication_Records__c',label:'Communication Records',kind:'Custom Object',fields:[{apiName:'Name',label:'Name',dataType:'Text(255)',required:true,unique:false}]}],
  apps:[],pages:[],flows:[],
  namedCredentials:[{id:'wa-credential',name:'WhatsApp_Main',protocol:'HTTPS',enabled:true,
    baseUrl:'https://graph.facebook.com/v22.0/1234567890/',configuration:{PhoneNumberId:'1234567890'}}],
  accessControl:{profiles:[
    {id:'system-administrator',objectPermissions:{Communication_Records__c:rights},fieldPermissions:{}},
    {id:'standard-user',objectPermissions:{},fieldPermissions:{},systemPermissions:[]}
  ],users:[{id:'admin-a',profileId:'system-administrator'}],permissionSets:[]},
  records:{Connector_App__c:[{AppKey__c:'whatsapp',Installed__c:true}],Communication_Records__c:[]}
});
test('installed WhatsApp metadata seeds Chatter record page, published Flows and initial admin RBAC',()=>{
  const seeded=applyInstallableAppPackages(tenant(),catalog);
  const page=seeded.pages.find(item=>item.apiName==='UNE_CHATTER');
  assert.equal(page?.pageType,'Record Page');
  assert.equal(page?.targetObject,'Communication_Records__c');
  assert.equal(page?.status,'Active');
  for(const apiName of ['CHATTER_SEND_MESSAGE','CHATTER_ASSIGN_CONVERSATION']){
    const flow=seeded.flows.find(item=>item.apiName===apiName);
    assert.equal(flow?.status,'Active');
    assert.equal(flow?.activeVersion,1);
  }
  assert(seeded.objects.some(item=>item.apiName==='Chatter_Channel_Grant__c'));
  assert(seeded.objects.find(item=>item.apiName==='Communication_Records__c').fields.some(field=>field.apiName==='Channel_Account__c'));
  assert(seeded.accessControl.profiles.some(profile=>profile.id==='chatter-agent'));
  assert.equal(seeded.records.Chatter_Channel_Grant__c.length,1);
  const twice=applyInstallableAppPackages(seeded,catalog);
  assert.equal(twice.records.Chatter_Channel_Grant__c.length,1);
  assert.equal(twice.pages.filter(page=>page.apiName==='UNE_CHATTER').length,1);
});
