import test from 'node:test';
import assert from 'node:assert/strict';
import {projectNormalizedTree,restoreNormalizedTree,verifyNormalizedTree} from '../src/normalized-state-tree.mjs';

const fixture=()=>({
  tenants:{
    'une':{
      objects:[{apiName:'Product__c',fields:[{apiName:'Price__c',dataType:'Currency(18, 2)'}]}],
      records:{Product__c:[{Id:'rec1',Price__c:13.5,Active__c:false,Stock__c:0,Notes__c:null}], Empty__c:[]},
      flows:[
        {apiName:'ONE_WhatsApp',versions:[{number:20,status:'Inactive',elements:[{config:{message:'Hello\nWorld'}}]},{number:21,status:'Active',elements:[]}],activeVersion:21},
        {apiName:'Kiosk',status:'Inactive',elements:[]}
      ],
      namedCredentials:[{secrets:{accessToken:'encrypted-do-not-display'},disabled:false}],
      pages:[{apiName:'Kiosk',slots:[],showModal:false}],
      accessControl:{profiles:[],sharedWith:null},
      settings:{'__proto__':'value',x:0.001,percent:0.05},
      emptyObject:{}, emptyArray:[],nullable:null
    },
    'another-tenant':{objects:[],records:{},flows:[],pages:[],namedCredentials:[],accessControl:{}}
  },
  libraryComponents:[],
  users:[{id:'u1',roles:[],disabled:false,permissionSetIds:[]}],
  refreshSessions:[{tokenHash:'test',revokedAt:null}],
  revokedAccessTokens:{}
});

test('entire active/inactive Flow history, tenants, users, credentials and records survive typed SQL flattening',()=>{
  const state=fixture();
  const {nodes,digest}=projectNormalizedTree(state);
  assert.ok(nodes.length>50);
  assert.equal(verifyNormalizedTree(state,nodes).digest,digest);
  assert.deepEqual(restoreNormalizedTree(nodes),state);
  assert.ok(nodes.every(r=>!('payload' in r)&&!('jsonb' in r)));
});
test('a changed message or permission cannot silently pass normalized parity',()=>{
  const state=fixture(),{nodes}=projectNormalizedTree(state);
  const tampered=structuredClone(nodes);
  const message=tampered.find(n=>n.stringValue==='Hello\nWorld');
  message.stringValue='Changed';
  assert.throws(()=>verifyNormalizedTree(state,tampered),/differs/);
});
test('restores empty arrays, false/zero/null, Unicode and user-controlled property keys losslessly',()=>{
  const source={custom:Object.fromEntries([['__proto__','safe'],['constructor','safe'],['emoji','🎛️']]),
    boolean:false,zero:0,empty:[],nested:{},nothing:null,messages:['hi\nthere',null,0,true]};
  assert.deepEqual(restoreNormalizedTree(projectNormalizedTree(source).nodes),source);
});
test('rejects duplicate identities, orphaned nodes, incorrect cardinality and non-contiguous array order',()=>{
  const s={a:[1,2]},nodes=projectNormalizedTree(s).nodes;
  assert.throws(()=>restoreNormalizedTree([...nodes,nodes[0]]),/Duplicate/);
  assert.throws(()=>restoreNormalizedTree(nodes.filter(n=>!(n.kind==='number'&&n.numberValue===1))),/Noncontiguous|Orphaned/);
  assert.throws(()=>restoreNormalizedTree(nodes.map(n=>n.kind==='number'?{...n,parentId:999}:n)),/Orphaned/);
});
