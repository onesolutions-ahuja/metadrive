import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MetadataPackageService,assertMetadataPackageEditable} from '../../src/system-support/metadata-package-service.js';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {ObjectDefinitionService} from '../../src/system-files/object-definition.js';
import type {PageRuntime} from '../../src/system-files/page-runtime.js';
import type {ComponentLibraryService} from '../../src/system-support/component-library-service.js';

function packageArtifact(objects:Array<Record<string,unknown>>){
  const body={
    format:'metadrive-metadata-package',
    schemaVersion:1,
    package:{apiName:'TestSuite',label:'Test Suite',version:1,type:'Managed'},
    dependencies:[],
    contents:{objects,pages:[],components:[]},
  };
  return {...body,digest:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}

const rbac={require:async()=>undefined,allowed:async()=>true} as unknown as RbacEngine;
const serviceFor=(db:SqlPersistence,objects:Array<Record<string,unknown>>=[])=>new MetadataPackageService(db,rbac,
  {list:async()=>objects} as unknown as ObjectDefinitionService,
  {list:async()=>[]} as unknown as PageRuntime,
  {list:async()=>[]} as unknown as ComponentLibraryService);

test('metadata package preview validates digest and reports install readiness',async()=>{
  const db={query:async()=>({rows:[],rowCount:0})} as unknown as SqlPersistence;
  const service=serviceFor(db);
  const pkg=packageArtifact([{apiName:'Inventory__c',label:'Inventory',kind:'Custom Object',fields:[]}]);
  assert.equal((await service.preview('tenant','user',pkg)).canInstall,true);
  await assert.rejects(service.preview('tenant','user',{...pkg,digest:'0'.repeat(64)}),
    /integrity check failed/);
  await assert.rejects(service.preview('tenant','user',packageArtifact([])),/Invalid metadata package/);
});

test('an uninstalled package can be reinstalled with its retained Objects',async()=>{
  const pkg=packageArtifact([{apiName:'Inventory__c',label:'Inventory',kind:'Custom Object',fields:[]}]);
  const db={query:async(sql:string)=>{
    if(sql.includes('md_metadata_package_installations'))
      return {rows:[{version:1,digest:pkg.digest,package_type:'Managed',active:false}]};
    if(sql.includes('SELECT component_type,component_api,component_state,component_digest'))
      return {rows:[{component_type:'object',component_api:'Inventory__c',
        component_state:'Retained',component_digest:'0'.repeat(64)}]};
    return {rows:[]};
  }} as unknown as SqlPersistence;
  const result=await serviceFor(db,[{
    apiName:'Inventory__c',label:'Inventory',kind:'Custom Object',fields:[],
  }]).preview('tenant','user',pkg);
  assert.equal(result.operation,'reinstall');
  assert.equal(result.canInstall,true);
});

test('metadata package preview rejects an omitted relationship dependency',async()=>{
  const db={query:async()=>({rows:[],rowCount:0})} as unknown as SqlPersistence;
  const service=serviceFor(db);
  const pkg=packageArtifact([{
    apiName:'Inventory__c',label:'Inventory',kind:'Custom Object',
    fields:[{apiName:'Warehouse__c',dataType:'reference',relatedObject:'Warehouse__c'}],
  }]);
  await assert.rejects(service.preview('tenant','user',pkg),/omits one or more required dependencies/);
});

test('metadata retrieve exports Flows, Object Manager layouts and portable permission sets',async()=>{
 const object={
  apiName:'Inventory__c',label:'Inventory',kind:'Custom Object',fields:[],
  revision:3,
  pageLayouts:[{id:'source-layout-id',label:'Inventory Layout',sections:[
   {id:'source-section-id',label:'Details',columns:2,fieldApiNames:['Name']}
  ],actions:[],relatedLists:[],customLinks:[]}],
  pageLayoutAssignments:[{profileId:'source-profile-id',recordTypeId:'source-record-type-id',
   pageLayoutId:'source-layout-id'}],
  recordTypes:[{id:'source-record-type-id',developerName:'Standard',label:'Standard',
   description:'',active:true,isDefault:true,picklistValues:{}}]
 };
 const flow={apiName:'Inventory_Automation',label:'Inventory Automation',
  flowType:'Autolaunched Flow',status:'Draft',elements:[],connectors:[],resources:[],
  startConfig:{},tests:[],versionNumber:1};
 const db={query:async()=>({rows:[],rowCount:0})} as unknown as SqlPersistence;
 const packages=new MetadataPackageService(db,rbac,
  {list:async()=>[object],get:async()=>object} as unknown as ObjectDefinitionService,
  {list:async()=>[]} as unknown as PageRuntime,
  {list:async()=>[]} as unknown as ComponentLibraryService,
  {load:async()=>({pluralLabel:'Inventories',description:'',helpText:'',
   settings:{allowReports:true,allowActivities:false,trackFieldHistory:false,allowInChatter:false,
    allowSearch:true,deploymentStatus:'Deployed',recordNameType:'Text',recordNameFormat:''},
   fieldSets:[],actions:[],searchLayouts:{searchableFields:[]}})} as never,
  {list:async()=>[flow]} as never,
  {describe:async()=>({profiles:[{id:'source-profile-id',apiName:'SystemAdministrator'}],
   permissionSets:[{id:'source-set-id',apiName:'Inventory_Access',label:'Inventory Access',
    description:'',license:'',navigationDefaultAccess:'Deny',systemPermissions:[],
    objectPermissions:{},fieldPermissions:{},recordTypePermissions:{},appPermissions:{},
    tabPermissions:{},deniedPermissions:[],advancedRules:[]} ]})} as never);
 const pkg=await packages.export('tenant','user',{
  apiName:'Inventory_Package',label:'Inventory Package',version:1,type:'Unlocked',
  objects:[],pages:[],components:[],flows:['Inventory_Automation'],
  objectConfigurations:['Inventory__c'],permissionSets:['Inventory_Access']
 });
 assert.equal(pkg.contents.flows?.[0]?.apiName,'Inventory_Automation');
 assert.equal(pkg.contents.flows?.[0]?.status,undefined);
 assert.equal(pkg.contents.objectConfigurations?.[0]?.pageLayouts[0]
  &&(pkg.contents.objectConfigurations[0].pageLayouts[0] as Record<string,unknown>).id,undefined);
 assert.deepEqual(pkg.contents.objectConfigurations?.[0]?.pageLayoutAssignments,[{
  profileApiName:'SystemAdministrator',recordTypeDeveloperName:'Standard',
  pageLayoutLabel:'Inventory Layout'
 }]);
 assert.equal(pkg.contents.permissionSets?.[0]?.id,undefined);
 assert.equal(JSON.stringify(pkg).includes('source-profile-id'),false);
 assert.equal(JSON.stringify(pkg).includes('source-set-id'),false);
});

test('metadata retrieve requires Flow read permission before listing Flow definitions',async()=>{
 let flowListCalled=false;
 const restrictedRbac={
  require:async(_tenant:string,_user:string,resource:string,action:string)=>{
   if(resource==='FlowDefinition'&&action==='read')throw Error('Permission denied');
  },
  allowed:async()=>true
 } as unknown as RbacEngine;
 const db={query:async()=>({rows:[],rowCount:0})} as unknown as SqlPersistence;
 const packages=new MetadataPackageService(db,restrictedRbac,
  {list:async()=>[]} as unknown as ObjectDefinitionService,
  {list:async()=>[]} as unknown as PageRuntime,
  {list:async()=>[]} as unknown as ComponentLibraryService,
  undefined,
  {list:async()=>{flowListCalled=true;return [];}} as never);
 await assert.rejects(packages.export('tenant','user',{
  apiName:'Automation_Package',label:'Automation Package',version:1,type:'Unlocked',
  objects:[],pages:[],components:[],flows:['Automation_Flow']
 }),/Permission denied/);
 assert.equal(flowListCalled,false);
});

test('managed package metadata is locked and retained package Objects are unavailable',async()=>{
  const lockedDb={query:async()=>({rows:[{locked:true}],rowCount:1})} as unknown as SqlPersistence;
  await assert.rejects(assertMetadataPackageEditable(lockedDb,'tenant','object','Inventory__c'),
    /Managed package metadata is read-only/);
  const retainedDb={query:async(sql:string)=>{
    if(sql.includes('md_metadata_package_components'))
      return {rows:[{package_object_retained:true}],rowCount:1};
    throw Error('Unexpected query: '+sql);
  }} as unknown as SqlPersistence;
  const records=new RecordEngine(retainedDb,rbac);
  await assert.rejects(records.list('tenant','user','Inventory__c'),/component is uninstalled/);
});
