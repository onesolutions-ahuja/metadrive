import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {applyInstallableAppPackages} from '../src/installable-app-packages.mjs';
import {ensureBundledAppComponents} from '../src/bundled-app-components.mjs';
import {projectState,restoreState,verifyProjection,stateDigest} from '../src/relational-projection.mjs';
import {prepareFlowCreateCollection} from '../src/flow-create-collection.mjs';
import {applyFlowCollectionAssignment} from '../src/flow-collection-assignment.mjs';

const catalog = JSON.parse(readFileSync(new URL('../data/installable-app-packages.json',import.meta.url),'utf8'));
function tenant() {
  const deny = {read:false,create:false,edit:false,delete:false,viewAll:false,modifyAll:false};
  return {
    objects:[{apiName:'Product',label:'Tenant product',kind:'Standard Object',fields:[
      {apiName:'Name',label:'Name',dataType:'Text',required:true}
    ]}],
    records:{Connector_App__c:[
      {Id:'app-license-kiosk',AppKey__c:'kiosk',Installed__c:true,LicenceStatus__c:'Licensed'},
      {Id:'app-license-pos',AppKey__c:'pos',Installed__c:true,LicenceStatus__c:'Licensed'}
    ]},
    flows:[],pages:[],apps:[],
    accessControl:{profiles:[
      {id:'standard-user',apiName:'Standard_User',label:'Standard',systemPermissions:[],objectPermissions:{},fieldPermissions:{},appPermissions:{},tabPermissions:{}},
      {id:'system-administrator',apiName:'System_Administrator',label:'Admin',systemPermissions:[],objectPermissions:{Product:deny},fieldPermissions:{},appPermissions:{},tabPermissions:{}}
    ]}
  };
}
test('Phase 7: app installation, component registry, state snapshot and restore remain lossless',()=>{
  const original=tenant();
  const installed=applyInstallableAppPackages(original,catalog);
  assert.equal(original.pages.length,0,'installer never mutates input');
  assert.equal(installed.objects.find(item=>item.apiName==='Product').label,'Tenant product');
  assert.deepEqual(applyInstallableAppPackages(installed,catalog),installed,'installation is idempotent');
  assert(installed.pages.some(page=>page.apiName==='UNE_KIOSK_CANVAS'));
  assert(installed.pages.some(page=>page.apiName==='UNE_POS'));
  assert(installed.pages.every(page=>new Set(page.components.map(c=>c.id)).size===page.components.length));
  assert.equal(installed.accessControl.profiles.find(p=>p.id==='system-administrator').objectPermissions.Product.read,false);

  const root=new URL('../../web/src/custom-components/',import.meta.url).pathname;
  const library=ensureBundledAppComponents([],installed,catalog,root);
  assert(library.length>5);
  assert.equal(new Set(library.map(c=>c.apiName)).size,library.length);
  assert.deepEqual(ensureBundledAppComponents(library,installed,catalog,root),library);
  assert(library.every(c=>c.trustedBundled===true));

  const source={tenants:{'tenant-test':{...installed,
    // Arbitrary tenant extensions require no application-specific persistence code.
    ...Object.fromEntries(Array.from({length:80},(_,index)=>['extension_'+index,[{id:index,enabled:true}]])),
    customModuleMetadata:[{apiName:'Example',properties:{enabled:true}}],
    customModuleSettings:{layout:'Compact'}
  }},libraryComponents:library,users:[],refreshSessions:[],revokedAccessTokens:{}};
  const rows=projectState(source);
  assert.equal(verifyProjection(source,rows).digest,stateDigest(source));
  assert.deepEqual(restoreState(rows),source);
  assert.throws(()=>projectState({...source,unregisteredRoot:{}}),/unknown top-level key/);
  const changed={...rows,collectionItems:rows.collectionItems.map(row=>
    row.key==='pages' && row.tenantId==='tenant-test' && row.position===0
      ? {...row,payload:{...row.payload,label:'Tampered'}} : row)};
  assert.throws(()=>verifyProjection(source,changed),/round-trip mismatch/);
});
test('Phase 7: Flow record collections use object metadata and retain immutable-field protection',()=>{
  const installed=applyInstallableAppPackages(tenant(),catalog);
  const product=installed.objects.find(object=>object.apiName==='Product');
  const resources=[{name:'batch',type:'Record Collection',isCollection:true,dataType:'Product'}];
  const record={Name:'Coffee'};
  assert.deepEqual(prepareFlowCreateCollection(resources,'batch',product,[record]),[record]);
  assert.throws(()=>prepareFlowCreateCollection(resources,'batch',product,[{Id:'unsafe'}]),/immutable field/);
  assert.throws(()=>prepareFlowCreateCollection(resources,'batch',product,[...Array(201)].map(()=>record)),/200-record/);
  assert.deepEqual(applyFlowCollectionAssignment([{Id:'A'},{Id:'B'}],{Id:'A'},'Remove','Record Collection'),[{Id:'B'}]);
});
