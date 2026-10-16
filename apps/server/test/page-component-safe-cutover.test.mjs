import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planPageReplacement,planSurfaceReplacement,validateMapping} from '../scripts/migrate-page-components.mjs';
import {loadAppSeedCatalog} from '../src/seeders/catalog.mjs';
const approved={from:'LegacyCard',to:'OneCard',tenantApproved:true,parityVerified:true,metadataSnapshotVerified:true,draftPublishRollbackVerified:true,approvedSurfaces:['page','dashboard','flow']};
const registered=[{apiName:'OneCard',status:'Published',surfaces:['page'],propertyDefinitions:[{propertyKey:'title'}]}];

test('disposable Page Builder page retains bindings, events and responsive settings with published OneCard metadata',()=>{
 const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneCard');
 assert.ok(target,'OneCard must be in the published core component catalog');
 const page={apiName:'MigrationFixture',components:[{
  id:'fixture-card',
  type:'Custom:LegacyCard',
  properties:{
   kind:'Card',title:'Test card',subtitle:'Bound test value',theme:'dark',width:'100%',
   desktopColumns:2,tabletColumns:2,mobileColumns:1,hideOnPhone:false,
   objectApiName:'Contact',fieldApiName:'Name',actionFlowApiName:'CONTACT_SELECTED'
  },
  events:{click:{actionFlowApiName:'CONTACT_SELECTED',inputs:{RecordId:'$event.recordId'}}},
  layout:{x:12,y:24,width:640,height:320,breakpoints:{phone:{width:'100%'},desktop:{width:'50%'}}}
 }]};
 const {page:migrated,changes}=planPageReplacement(page,[approved],[{...target,status:'Published'}]);
 assert.deepEqual(changes,[{from:'LegacyCard',to:'OneCard',id:'fixture-card',surface:'page'}]);
 assert.deepEqual({...migrated.components[0],type:'Custom:LegacyCard'},page.components[0]);
 assert.equal(migrated.components[0].type,'Custom:OneCard');
});

test('Dashboard Builder migration preserves properties, data bindings, events and responsive layout',()=>{
 const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneCard');
 const dashboard={apiName:'MigrationFixture',components:[{
  id:'fixture-dashboard-card',type:'Custom',customComponentApiName:'LegacyCard',
  properties:{kind:'Card',title:'Bound dashboard',subtitle:'Contact summary',objectApiName:'Contact',fieldApiName:'Name',actionFlowApiName:'CONTACT_SELECTED',width:'100%',mobileColumns:1},
  events:{select:{flowApiName:'CONTACT_SELECTED'}},width:'Half',height:'Medium',reportApiName:'CONTACTS'
 }]};
 const {payload,changes}=planSurfaceReplacement(dashboard,'dashboards',[approved],[{...target,status:'Published'}]);
 assert.deepEqual(changes,[{from:'LegacyCard',to:'OneCard',id:'fixture-dashboard-card',surface:'dashboard'}]);
 assert.deepEqual({...payload.components[0],customComponentApiName:'LegacyCard'},dashboard.components[0]);
 assert.equal(payload.components[0].customComponentApiName,'OneCard');
});

test('Screen Flow migration preserves field contracts, input/output values, actions and historical versions',()=>{
 const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneCard');
 const currentField={id:'flow-card',type:'Custom Component',componentApiName:'LegacyCard',apiName:'SelectedCard',label:'Selected card',required:false,
  componentPropsJson:JSON.stringify({kind:'Card',title:'Choose a contact',objectApiName:'Contact',fieldApiName:'Name',actionFlowApiName:'CONTACT_SELECTED'}),
  inputBindings:{recordId:'ContactId'},outputBindings:{selected:'SelectedRecord'},width:480,height:240,columnSpan:2};
 const historicalField={...currentField,componentApiName:'LegacyCard'};
 const flow={apiName:'CONTACT_PICKER',elements:[{id:1,type:'Screen',label:'Choose',config:{fields:[currentField],onNext:{flowApiName:'AFTER_PICK'}}}],
  versions:[{versionNumber:1,status:'Active',elements:[{id:1,type:'Screen',label:'Choose',config:{fields:[historicalField]}}]}]};
 const {payload,changes}=planSurfaceReplacement(flow,'flows',[approved],[{...target,status:'Published'}]);
 assert.equal(changes.length,2);
 assert.ok(changes.every(change=>change.surface==='flow'&&change.to==='OneCard'));
 assert.equal(payload.elements[0].config.fields[0].componentApiName,'OneCard');
 assert.equal(payload.versions[0].elements[0].config.fields[0].componentApiName,'OneCard');
 assert.deepEqual({...payload.elements[0].config.fields[0],componentApiName:'LegacyCard'},currentField);
 assert.deepEqual({...payload.versions[0].elements[0].config.fields[0],componentApiName:'LegacyCard'},historicalField);
});

test('cross-surface migration fails closed on unsupported surfaces and invalid Flow properties',()=>{
 const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneCard');
 assert.throws(()=>planSurfaceReplacement({components:[{type:'Custom',customComponentApiName:'LegacyCard'}]},'dashboards',[approved],[{...target,status:'Published',surfaces:['page']}]),/Missing published dashboard/);
 assert.throws(()=>planSurfaceReplacement({components:[{type:'Custom',customComponentApiName:'LegacyCard'}]},'dashboards',[{...approved,approvedSurfaces:['page']}],[{...target,status:'Published'}]),/not approved for dashboard/);
 assert.throws(()=>planSurfaceReplacement({elements:[{config:{fields:[{type:'Custom Component',componentApiName:'LegacyCard',componentPropsJson:'not-json'}]}}]},'flows',[approved],[{...target,status:'Published'}]),/Invalid Flow component properties JSON/);
});

test('published One-* contracts accept the legacy SystemPanel and AdminField property sets',()=>{
 const legacy=JSON.parse(readFileSync(new URL('../../web/src/custom-components/manifest.json',import.meta.url),'utf8'));
 const catalog=loadAppSeedCatalog();
 const definitions=legacy.map(component=>({
  id:component.apiName,type:'Custom:'+component.apiName,label:component.label,visible:true,
  properties:structuredClone(component.defaults)
 }));
 const mappings=[
  {...approved,from:'SystemPanel',to:'OneCard',approvedSurfaces:['page']},
  {...approved,from:'AdminField',to:'OneInput',approvedSurfaces:['page']}
 ];
 const registered=catalog.coreComponents.map(component=>({...component,status:'Published'}));
 const result=planPageReplacement({components:definitions},mappings,registered);
 assert.deepEqual(result.changes.map(change=>[change.from,change.to]),[['SystemPanel','OneCard'],['AdminField','OneInput']]);
 assert.deepEqual(result.page.components.map(component=>component.properties),definitions.map(component=>component.properties));
});

test('preserves IDs, properties, child references, events and layout',()=>{
 const before={apiName:'Home',components:[{id:'42',type:'Custom:LegacyCard',properties:{title:'Hello'},events:{click:'flow'},position:{x:1,y:2},children:['a']}]};
 const {page,changes}=planPageReplacement(before,[approved],registered);
 assert.equal(changes.length,1);
 assert.equal(page.components[0].type,'Custom:OneCard');
 assert.deepEqual({...page.components[0],type:'Custom:LegacyCard'},before.components[0]);
 assert.equal(before.components[0].type,'Custom:LegacyCard');
});
test('migrates ChatterInbox to inbox mode while preserving saved properties and bindings',()=>{
 const catalog=loadAppSeedCatalog();
 const pkg=catalog.packages.find(item=>item.appKey==='whatsapp');
 const savedPage=structuredClone(pkg.pages.find(item=>item.apiName==='UNE_CHATTER'));
 const instance=savedPage.components[0];
 instance.type='Custom:ChatterInbox';
 instance.properties.libraryComponentId='ChatterInbox';
 delete instance.properties.viewMode;
 const before=structuredClone(instance);
 const target=catalog.coreComponents.find(component=>component.apiName==='OneConversation');
 const mapping={...approved,from:'ChatterInbox',to:'OneConversation',approvedSurfaces:['page'],
  propertyDefaults:{viewMode:'inbox'}};
 const {page,changes}=planPageReplacement(savedPage,[mapping],[{...target,status:'Published'}]);
 assert.deepEqual(changes,[{from:'ChatterInbox',to:'OneConversation',id:'chatter-inbox',surface:'page'}]);
 assert.equal(page.components[0].type,'Custom:OneConversation');
 assert.deepEqual({...page.components[0],type:'Custom:ChatterInbox'},{
  ...before,properties:{...before.properties,libraryComponentId:'OneConversation',viewMode:'inbox'}
 });
});

test('migration property defaults are supported, typed and applied only when absent on each surface',()=>{
 const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneConversation');
 const rule={...approved,from:'LegacyConversation',to:'OneConversation',approvedSurfaces:['page','dashboard','flow'],
  propertyDefaults:{viewMode:'inbox'}};
 const registered=[{...target,status:'Published'}];
 const page=planSurfaceReplacement({components:[{type:'Custom:LegacyConversation',properties:{title:'Saved'}}]},
  'pages',[rule],registered).payload;
 const dashboard=planSurfaceReplacement({components:[{type:'Custom',customComponentApiName:'LegacyConversation',
  properties:{viewMode:'thread',libraryComponentId:'LegacyConversation'}}]},
  'dashboards',[rule],registered).payload;
 const flow=planSurfaceReplacement({elements:[{config:{fields:[{type:'Custom Component',
  componentApiName:'LegacyConversation',componentPropsJson:'{\"title\":\"Saved\",\"libraryComponentId\":\"LegacyConversation\"}'}]}}]},
  'flows',[rule],registered).payload;
 assert.deepEqual(page.components[0].properties,{title:'Saved',viewMode:'inbox'});
 assert.deepEqual(dashboard.components[0].properties,{viewMode:'thread',libraryComponentId:'OneConversation'});
 assert.deepEqual(JSON.parse(flow.elements[0].config.fields[0].componentPropsJson),
  {title:'Saved',libraryComponentId:'OneConversation',viewMode:'inbox'});
 assert.throws(()=>planSurfaceReplacement({components:[{type:'Custom:LegacyConversation',properties:{}}]},
  'pages',[{...rule,propertyDefaults:{viewMode:'invalid'}}],registered),/Invalid migration default/);
});
test('migrates both POS components to OneShoppingCart and updates only the runtime library ID',()=>{
 const catalog=loadAppSeedCatalog();
 const pkg=catalog.packages.find(item=>item.appKey==='uk-offlicence-pos');
 const savedPages=structuredClone(pkg.pages);
 const sources=['RecordCatalogCart','CustomerBasketDisplay'];
 for(let index=0;index<savedPages.length;index++){
  const instance=savedPages[index].components[0],legacyId=sources[index];
  instance.type='Custom:'+legacyId;
  instance.properties.libraryComponentId=legacyId;
 }
 const before=structuredClone(savedPages);
 const mapping=sources.map(from=>({...approved,from,to:'OneShoppingCart',approvedSurfaces:['page']}));
 const target=catalog.coreComponents.find(component=>component.apiName==='OneShoppingCart');
 const registered=[{...target,status:'Published'}];
 const results=savedPages.map(page=>planPageReplacement(page,mapping,registered));
 assert.equal(results.flatMap(result=>result.changes).length,2);
 for(let index=0;index<results.length;index++){
  assert.equal(results[index].page.components[0].type,'Custom:OneShoppingCart');
  const expected=structuredClone(before[index].components[0]);
  expected.properties.libraryComponentId='OneShoppingCart';
  assert.deepEqual({...results[index].page.components[0],type:before[index].components[0].type},expected);
 }
});
test('rejects unknown definitions, missing property parity or incomplete approval',()=>{
 const p={components:[{id:'1',type:'Custom:LegacyCard',properties:{unknown:'x'}}]};
 assert.throws(()=>planPageReplacement(p,[approved],registered),/Property parity mismatch/);
 assert.throws(()=>planPageReplacement(p,[approved],[]),/Missing published/);
 assert.throws(()=>planPageReplacement(p,[{...approved,parityVerified:false}],registered),/Unapproved/);
});
test('mapping is tenant-bound and rejects duplicate or ambiguous names',()=>{
 assert.deepEqual(validateMapping({tenantId:'tenant-1',mappings:[approved]},'tenant-1'),[approved]);
 assert.throws(()=>validateMapping({tenantId:'tenant-2',mappings:[approved]},'tenant-1'),/mismatch/);
 assert.throws(()=>validateMapping({tenantId:'tenant-1',mappings:[approved,approved]},'tenant-1'),/Duplicate/);
});
