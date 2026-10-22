import assert from 'node:assert/strict';
import {test} from 'node:test';
import {seedAceChatterFlowsForTenant} from '../../src/app-seeders/acechatter-flow.js';

test('AceChatter app seeding is tenant-scoped, idempotent and preserves business data',async()=>{
 const seen:Array<{sql:string;params:unknown[]}>=[],flows=new Set<string>();
 let graphRows=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  seen.push({sql,params});
  if(sql.includes('SELECT 1 FROM md_flow_definitions')){
    const name=String(params[1]);return {rows:flows.has(name)?[{exists:true}]:[],rowCount:flows.has(name)?1:0};
  }
  if(sql.includes('INSERT INTO md_flow_definitions')){
    const name=String(params[1]);flows.add(name);
    return {rows:[{id:'flow-'+name}],rowCount:1};
  }
  if(sql.includes('INSERT INTO md_flow_editor_values'))graphRows++;
  return {rows:[],rowCount:1};
 }} as never;
 const first=await seedAceChatterFlowsForTenant(client,'tenant-a');
 assert.equal(first,5);
 assert.equal(graphRows>0,true);
 assert.equal(flows.has('AceChatterLoadConversations'),true);
 assert.equal(flows.has('AceChatterLoadMessages'),true);
 assert.equal(flows.has('AceChatterSendMessage'),true);
 assert.equal(flows.has('AceChatterReceiveWebhook'),true);
 assert.equal(flows.has('AceChatterCreateConversation'),true);
 const before=graphRows;
 const second=await seedAceChatterFlowsForTenant(client,'tenant-a');
 assert.equal(second,0);
 assert.equal(graphRows,before);
 assert.equal(seen.every(call=>!call.sql.includes('INSERT INTO md_records') &&
   !call.sql.includes('INSERT INTO md_permission_assignments')),true);
 const created=seen.filter(call=>call.sql.includes('INSERT INTO md_flow_definitions'));
 assert.equal(created.find(call=>call.params[1]==='AceChatterSendMessage')?.params[3],false,
  'WhatsApp delivery must remain disabled until provider credentials are configured');
 assert.equal(created.filter(call=>call.params[3]===true).length,4);
});
