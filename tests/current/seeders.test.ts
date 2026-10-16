import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {loadAppSeedCatalog} from '../../apps/server/src/seeders/catalog.mjs';
import {ensureBundledAppComponents} from '../../apps/server/src/bundled-app-components.mjs';
import {coreMetadataSeed,mergeCoreMetadata} from '../../apps/server/src/seeders/core.mjs';

test('One component registry follows the canonical catalog without hardcoded counts',()=>{
 const catalog=loadAppSeedCatalog();
 const expected=catalog.coreComponents;
 const library=ensureBundledAppComponents([],{records:{Connector_App__c:[]}},catalog,
   resolve('apps/web/src/custom-components'));
 assert.ok(expected.length>0);
 assert.equal(library.length,expected.length);
 assert.equal(new Set(library.map(row=>row.apiName)).size,expected.length);
 for(const component of library){
   assert.equal(component.trustedBundled,true);
   assert.equal(component.status,'Published');
   assert.ok(component.compiledJs);
   assert.ok(['page','dashboard','flow'].every(surface=>component.surfaces.includes(surface)));
 }
 const seededAgain=ensureBundledAppComponents(library,{records:{Connector_App__c:[]}},catalog,
   resolve('apps/web/src/custom-components'));
 assert.deepEqual(seededAgain,library);
});

test('repeated Core seeding preserves tenant records and edited metadata',()=>{
 const template={objects:[{apiName:'Appointment__c',label:'Default'}],
   pages:[{apiName:'BookingPage',label:'Default'}],flows:[],
   accessControl:{permissionSets:[]}};
 const initial=coreMetadataSeed(template);
 const tenant={...initial,objects:[{apiName:'Appointment__c',label:'Tenant customised'}],
   records:{Appointment__c:[{Id:'record1',Name:'Saved booking'}]}};
 const again=mergeCoreMetadata(tenant,initial);
 assert.equal(again.objects.length,1);
 assert.equal(again.objects[0].label,'Tenant customised');
 assert.deepEqual(again.records,tenant.records);
 assert.deepEqual(mergeCoreMetadata(again,initial),again);
});
