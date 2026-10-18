import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transform} from 'esbuild';
import {loadComponentCatalog,buildBundledComponent} from '../../../scripts/component-catalog.mjs';
import {metadataReference,resolveMetadataProperties} from '../src/core/metadata/Definitions/metadataReferences';
import {buildChatterView} from '../src/core/records/RecordWorkspace/chatterRecordAdapter';
import {presentPageRecords} from '../src/core/records/RecordWorkspace/recordPresentationAdapters';
import type {ObjectMetadata,FlowDefinitionMetadata} from '../src/core/metadata/Definitions/metadata';
import {pageLayoutForRecord} from '../src/core/records/RecordWorkspace/recordMetadataUtils';

const object={id:'object-id',apiName:'RenamedObject',fields:[{id:'field-id',apiName:'RenamedPrice'}]} as ObjectMetadata;
const flow={id:'flow-id',apiName:'RenamedFlow'} as FlowDefinitionMetadata;
test('Object, Field, filters and Flow references survive API renames without rewriting a page',()=>{
 const properties={objectApiName:metadataReference('object-id'),priceFieldApiName:metadataReference('field-id'),
  filters:[{field:metadataReference('field-id'),operator:'equals',value:10}],
  actionFlows:{checkout:{flowApiName:metadataReference('flow-id')}}};
 const result=resolveMetadataProperties(properties,[object],[flow]);
 assert.equal(result.objectApiName,'RenamedObject');assert.equal(result.priceFieldApiName,'RenamedPrice');
 assert.equal((result.filters as {field:string}[])[0].field,'RenamedPrice');
 assert.equal((result.actionFlows as any).checkout.flowApiName,'RenamedFlow');
 assert.equal(properties.objectApiName,metadataReference('object-id'));
});
test('unknown references remain invalid and cannot fall back to a different object or field',()=>{
 const props={objectApiName:metadataReference('deleted'),priceFieldApiName:metadataReference('field-id')};
 assert.deepEqual(resolveMetadataProperties(props,[object],[flow]),props);
 assert.equal(resolveMetadataProperties({objectApiName:'RenamedObject',priceFieldApiName:'Legacy'},[object],[]).priceFieldApiName,'Legacy');
});
const mappings={conversationDirectionFieldApiName:'way',conversationAccountFieldApiName:'account',
 conversationFromFieldApiName:'sender',conversationToFieldApiName:'recipient',conversationOccurredFieldApiName:'time',
 conversationBodyFieldApiName:'content',conversationIncomingValue:'IN',conversationOutgoingValue:'OUT'};
const rows=[{Id:'a',way:'IN',account:'allowed',sender:'123',time:'2026-01-01',content:'First'},
 {Id:'b',way:'OUT',account:'other',recipient:'123',time:'2026-01-02',content:'Private'}];
test('conversation adapter accepts a completely different schema and configured direction values',()=>{
 const result=buildChatterView(rows,mappings);
 assert.equal(result.conversations.length,2);assert.equal(result.messages[0].body,'First');
 assert.equal(result.messages[1].direction,'outbound');
 assert.deepEqual(buildChatterView(rows).messages,[]);
});
test('conversation presentation cannot expose another channel or grant send/assign itself',()=>{
 const result=presentPageRecords('ConversationThread',rows,{userId:'user',viewAll:false,
  grants:[{channelAccountId:'allowed',canRead:true,canSend:false,canAssign:false}]},mappings) as any;
 assert.deepEqual(result.messages.map((m:any)=>m.id),['a']);
 assert.equal(result.conversations[0].canSend,false);assert.equal(result.conversations[0].canAssign,false);
});

async function cartModule(React:unknown,window:unknown={}) {
 const source=await readFile(new URL('../src/one/OneShoppingCart/OneShoppingCart.jsx',import.meta.url),'utf8');
 const built=await transform(source+'\nexport {currency,makeSnapshot,ShoppingCartTill};',{loader:'jsx',format:'cjs'});
 const sandbox={module:{exports:{} as any},React,window,document:{querySelector:()=>null},
  crypto:globalThis.crypto,Intl,URL,BroadcastChannel:undefined};
 vm.runInNewContext(built.code,sandbox);return sandbox.module.exports;
}
test('VAT-enabled cart rejects products without an explicit boolean tax classification',async()=>{
 const source=await readFile(new URL('../src/one/OneShoppingCart/OneShoppingCart.jsx',import.meta.url),'utf8');
 assert.match(source,/vatRate > 0 && typeof vatValue !== "boolean"/);
 assert.match(source,/This product has no verified VAT applicability value/);
 assert.match(source,/vatApplicable: vatValue === true/);
});
test('cart formatting does not invent a currency or an age approval outcome',async()=>{
 const m=await cartModule({});
 assert.throws(()=>m.currency(100,undefined));
 assert.match(m.currency(1234,'EUR'),/12/);
 const snapshot=m.makeSnapshot([{name:'Restricted',quantity:1,unitPriceMinor:200,ageRestricted:true}],'basket');
 assert.equal(snapshot.status,'basket');
});
test('Flow rejection preserves basket and never initiates a second checkout',async()=>{
 const slots:any[]=[];let cursor=0;const scheduled:(()=>void)[]=[];const deps:any[][]=[];
 const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),
  useState:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef:(value:any)=>{const i=cursor++;return slots[i]??(slots[i]={current:value});},
  useEffect:(fn:()=>void,d:any[]=[])=>{const i=cursor++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){deps[i]=d;scheduled.push(fn);}}};
 const events=new Map();const window={addEventListener:(k:string,fn:any)=>events.set(k,fn),removeEventListener:()=>{}};
 const m=await cartModule(React,window);let calls=0;
 const props={viewMode:'basket',currencyCode:'EUR',vatRate:0,nameFieldApiName:'Label',priceFieldApiName:'Amount',
  checkoutStatusOutput:'State',checkoutRequestOutput:'Request',checkoutMessageOutput:'Notice',
  actionFlows:{checkout:{flowApiName:'ConfiguredCheckout'}},
  onAction:async(action:any)=>{calls++;return {outputs:{State:'failed',Request:action.value.requestId,Notice:'Approval refused'}};}};
 const render=()=>{cursor=0;const tree=m.ShoppingCartTill({props});for(const fn of scheduled.splice(0))fn();return tree;};
 render();await new Promise(resolve=>setTimeout(resolve,0));
 slots[0]=[{productId:'item',name:'Restricted',quantity:1,unitPriceMinor:100,vatApplicable:false,ageRestricted:true}];
 const tree=render();
 const find=(node:any):any=>{
  if(!node||typeof node!=='object')return undefined;
  if(node.type==='button'&&node.props.className==='one-btn one-btn--primary')return node;
  for(const child of node.children??[]){for(const item of Array.isArray(child)?child:[child]){const result=find(item);if(result)return result;}}
 };
 const button=find(tree);assert.equal(button.props.disabled,false);button.props.onClick();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls,1);assert.equal(slots[0].length,1);assert.equal(slots[0][0].ageRestricted,true);
 // Another interview using the same Flow cannot change this checkout.
 events.get('metadrive:flow-completed')({detail:{flowApiName:'ConfiguredCheckout',outputs:{State:'complete',Request:'other'}}});
 assert.equal(slots[6],'failed');
});
test('secondary object field bindings resolve only within their selected object',()=>{
 const contacts={id:'contacts',apiName:'People',fields:[{id:'contact-name',apiName:'FullLabel'}]} as ObjectMetadata;
 const p={objectApiName:'RenamedObject',contactsObjectApiName:'metadata:contacts',contactNameFieldApiName:'metadata:contact-name'};
 assert.equal(resolveMetadataProperties(p,[object,contacts],[]).contactNameFieldApiName,'FullLabel');
 assert.equal(resolveMetadataProperties({...p,contactsObjectApiName:'metadata:deleted'},[object,contacts],[]).contactNameFieldApiName,'metadata:contact-name');
});
test('compatibility registration uses the same renderer and all registered JSX compiles',async()=>{
 const {components}=await loadComponentCatalog();
 const alias=components.find((c:any)=>c.apiName==='ChatterInbox');
 const canonical=components.find((c:any)=>c.apiName==='OneConversation');
 assert.equal(alias.jsxFile,canonical.jsxFile);assert.deepEqual(alias.defaults.actionFlows,{});
 for(const definition of components){const built=await buildBundledComponent(definition);assert.ok(built.compiledJs);assert.ok(built.cssSource);}
});

test('record page layout assignments resolve profile, type and wildcard defaults',()=>{
 const layouts=['fallback','specific','type','profile','wildcard'].map(id=>({
   id,label:id,sections:[],actions:['New','Edit'],relatedLists:[],customLinks:[]
 }));
 const object={
   apiName:'Order__c',fields:[],recordTypes:[{id:'retail',isDefault:true}],
   pageLayouts:layouts,pageLayoutAssignments:[
     {profileId:'manager',recordTypeId:'retail',pageLayoutId:'specific'},
     {profileId:'*',recordTypeId:'retail',pageLayoutId:'type'},
     {profileId:'manager',recordTypeId:'*',pageLayoutId:'profile'},
     {profileId:'*',recordTypeId:'*',pageLayoutId:'wildcard'}
   ]
 } as unknown as ObjectMetadata;
 assert.equal(pageLayoutForRecord(object,'retail','manager')?.id,'specific');
 assert.equal(pageLayoutForRecord(object,'retail','cashier')?.id,'type');
 assert.equal(pageLayoutForRecord(object,'wholesale','manager')?.id,'profile');
 assert.equal(pageLayoutForRecord(object,'wholesale','cashier')?.id,'wildcard');
 assert.equal(pageLayoutForRecord({...object,pageLayoutAssignments:[]},'','manager')?.id,'fallback');
 assert.equal(pageLayoutForRecord(object,'','cashier')?.id,'type');
});
