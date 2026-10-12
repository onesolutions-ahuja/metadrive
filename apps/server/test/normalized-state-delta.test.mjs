import assert from 'node:assert/strict';
import test from 'node:test';
import {planNormalizedDelta, verifyDeltaReadback} from '../src/normalized-state-delta.mjs';
import {projectNormalizedTree, restoreNormalizedTree} from '../src/normalized-state-tree.mjs';

test('login session + audit append writes only added typed SQL nodes', () => {
  const base={users:[{id:'one'}],tenants:{alpha:{securityEvents:[{id:'e1',action:'login'}],objects:[{apiName:'Account',fields:[]}],records:{Account:[]}}},refreshSessions:[{id:'old'}]};
  const projected=projectNormalizedTree(base).nodes;
  const next=structuredClone(base);
  next.tenants.alpha.securityEvents.push({id:'e2',action:'login'});
  next.refreshSessions.push({id:'new'});
  const plan=planNormalizedDelta(projected,projectNormalizedTree(next).nodes);
  assert.equal(plan.deleted.length,0);
  assert.equal(plan.updated.length,0);
  assert.ok(plan.inserted.length>0);
  assert.deepEqual(restoreNormalizedTree(plan.nodes),next);
  verifyDeltaReadback(plan.inserted,plan.inserted.map(row=>({
    node_id:row.nodeId,parent_id:row.parentId,slot_key:row.slotKey,ordinal:row.ordinal,
    kind:row.kind,string_value:row.stringValue,number_value:row.numberValue,bool_value:row.boolValue
  })));
});
test('object reordering and array deletion retain correct tree and minimal changes', () => {
  const a={tenant:{names:['a','b','c'],setting:{foo:1,bar:2}}};
  const b={tenant:{setting:{bar:2,foo:4},names:['a','c']}};
  const first=planNormalizedDelta(projectNormalizedTree(a).nodes,projectNormalizedTree(b).nodes);
  assert.deepEqual(restoreNormalizedTree(first.nodes),b);
  assert.ok(first.updated.length>0);
  const c={tenant:{setting:{bar:2,foo:4},names:['a','c','d']}};
  const second=planNormalizedDelta(first.nodes,projectNormalizedTree(c).nodes);
  assert.deepEqual(restoreNormalizedTree(second.nodes),c);
  assert.equal(second.deleted.length,0);
});
test('changing parent type correctly retires old children',()=>{
  const a={value:{one:1,two:2}};
  const b={value:['first']};
  const plan=planNormalizedDelta(projectNormalizedTree(a).nodes,projectNormalizedTree(b).nodes);
  assert.deepEqual(restoreNormalizedTree(plan.nodes),b);
  assert.equal(plan.deleted.length,2);
});

test('large metadata graphs retain unchanged rows for login append',()=>{
  const users=Array.from({length:4500},(_,i)=>({id:'u'+i,email:'u'+i+'@example.test',role:'reader',enabled:true}));
  const before={users,tenants:{a:{securityEvents:[]}},refreshSessions:[]};
  const original=projectNormalizedTree(before).nodes;
  assert.ok(original.length>19000,'Regress against production-sized graphs');
  const after={...before,tenants:{a:{securityEvents:[{action:'auth.login.succeeded',actor:'u1'}]}},
    refreshSessions:[{id:'refresh-1',userId:'u1',tenantId:'a'}]};
  const delta=planNormalizedDelta(original,projectNormalizedTree(after).nodes);
  assert.equal(delta.deleted.length,0);
  assert.equal(delta.updated.length,0);
  assert.ok(delta.inserted.length<30,'An auth append must not rewrite metadata');
  assert.deepEqual(restoreNormalizedTree(delta.nodes),after);
});\n