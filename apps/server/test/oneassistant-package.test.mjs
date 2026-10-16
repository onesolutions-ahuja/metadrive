import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {applyInstallableAppPackages} from '../src/installable-app-packages.mjs';

const catalog=JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
const oneAssistant=catalog.packages.find(pkg=>pkg.appKey==='one-assistant');
const oneCatalog={packages:[oneAssistant]};
const standard={id:'standard-user',objectPermissions:{},fieldPermissions:{},systemPermissions:[]};
const admin={id:'system-administrator',objectPermissions:{},fieldPermissions:{}};

function tenant(installed=true) {
 return {
  objects:[
   {apiName:'Appointment',label:'Appointment',kind:'Standard Object',fields:[{apiName:'Name',label:'Name',dataType:'Text(255)',required:true,unique:false}]},
   ...['Contact','Resource','ResourceAvailability','AppointmentResource','Address'].map(apiName=>({apiName,label:apiName,kind:'Standard Object',fields:[{apiName:'Name',label:'Name',dataType:'Text(255)',required:true,unique:false}]}))
  ],
  pages:[],apps:[],flows:[],namedCredentials:[],
  accessControl:{profiles:[structuredClone(admin),structuredClone(standard)],users:[],permissionSets:[]},
  records:{Connector_App__c:installed?[{AppKey__c:'one-assistant',Installed__c:true,LicenceStatus__c:'Trial'}]:[]}
 };
}

test('OneAssistant is an independent metadata-only AppExchange package',()=>{
 assert.ok(oneAssistant,'one-assistant must be registered');
 assert.equal(oneAssistant.apps.length,1);
 assert.equal(oneAssistant.apps[0].apiName,'OneAssistantApp');
 assert.ok(oneAssistant.pages.length>=2);
 assert.ok(oneAssistant.flows.some(flow=>flow.flowType==='Screen Flow'));
 assert.ok(!('records' in oneAssistant),'do not seed tenant customer data');
 assert.equal(JSON.stringify(oneAssistant).includes('kingstonexterior.co.uk'),false,'keep the package tenant-neutral');
 assert.equal(JSON.stringify(oneAssistant).includes('tanha.ahuja2'),false,'no tenant identity in package');
 for (const page of oneAssistant.pages) for (const component of page.components) {
  assert.match(component.type,/^Custom:One[A-Za-z]+$/,'use shared registered One components');
  assert.equal(component.properties.libraryComponentId,component.type.slice('Custom:'.length));
 }
 const intake=oneAssistant.flows.find(flow=>flow.apiName==='ONE_ASSISTANT_BOOKING_REQUEST');
 assert.ok(intake);
 assert.equal(intake.elements.some(element=>element.type==='HTTP Callout'),false,'no mandatory WhatsApp or SMS provider');
 const write=intake.elements.find(element=>element.type==='Create Records');
 assert.equal(write?.config.object,'Appointment');
 assert.ok(write.config.fieldValues.some(field=>field.field==='BookingApprovalStatus__c'&&field.value==='Requested'));
 assert.equal(write.config.fieldValues.some(field=>field.field==='StartDateTime'),false,'an enquiry must never silently reserve a slot');
});

test('OneAssistant is not loaded for tenants without installation',()=>{
 const result=applyInstallableAppPackages(tenant(false),oneCatalog,'other-tenant');
 assert.equal(result.apps.some(app=>app.apiName==='OneAssistantApp'),false);
 assert.equal(result.pages.some(page=>page.apiName==='ONE_ASSISTANT_RECEPTION'),false);
 assert.equal(result.objects.some(obj=>obj.apiName==='BookingService__c'),false);
});

test('OneAssistant installs idempotently and preserves customer edits',()=>{
 const first=applyInstallableAppPackages(tenant(),oneCatalog,'pilot-tenant');
 assert.ok(first.apps.some(app=>app.apiName==='OneAssistantApp'));
 assert.ok(first.pages.some(page=>page.apiName==='ONE_ASSISTANT_RECEPTION'));
 assert.ok(first.objects.some(obj=>obj.apiName==='BookingBusinessHours__c'));
 assert.ok(first.objects.find(obj=>obj.apiName==='Appointment').fields.some(field=>field.apiName==='BookingApprovalStatus__c'));
 assert.ok(first.accessControl.profiles.some(profile=>profile.id==='oneassistant-receptionist'));
 const custom=structuredClone(first);
 custom.pages.find(page=>page.apiName==='ONE_ASSISTANT_RECEPTION').label='Customer custom reception';
 custom.objects.find(obj=>obj.apiName==='BookingService__c').fields.push({
  apiName:'CustomerCustomField__c',label:'Customer custom field',dataType:'Text(255)',required:false,unique:false
 });
 const again=applyInstallableAppPackages(custom,oneCatalog,'pilot-tenant');
 assert.equal(again.apps.filter(app=>app.apiName==='OneAssistantApp').length,1);
 assert.equal(again.pages.filter(page=>page.apiName==='ONE_ASSISTANT_RECEPTION').length,1);
 assert.equal(again.pages.find(page=>page.apiName==='ONE_ASSISTANT_RECEPTION').label,'Customer custom reception');
 assert.ok(again.objects.find(obj=>obj.apiName==='BookingService__c').fields.some(field=>field.apiName==='CustomerCustomField__c'));
});
