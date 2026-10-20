import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildAutomationFlow,type RecipeInput} from '../../../web/src/core/builders/ObjectManager/businessAutomationRecipes.js';
const user='00000000-0000-4000-8000-000000000001';
const common={
 objectApi:'Ticket__c',apiName:'TicketAutomation',label:'Ticket Automation',
 trigger:'created' as const,conditions:[]};
test('assignment recipe uses shared record update engine and remains a draft',()=>{
 const flow=buildAutomationFlow({...common,kind:'Assignment',assigneeId:user});
 assert.equal(flow.status,'Draft');
 assert.equal(flow.flowType,'Record-Triggered Flow');
 assert.equal(flow.elements[1].type,'Update Records');
 assert.equal((flow.elements[1].config.fieldValues as Array<{field:string}>)[0].field,'OwnerId');
 assert.equal(flow.elements[1].config.recordId,'{!$Record.Id}');
 assert.throws(()=>buildAutomationFlow({...common,kind:'Assignment',
  trigger:'created-or-updated',assigneeId:user}),/record creation/);
});
test('automatic response recipe reuses durable Send Email Action',()=>{
 const flow=buildAutomationFlow({...common,kind:'Auto Response',
  namedCredentialId:user,fromEmail:'service@example.org',recipientField:'CustomerEmail__c',
  subject:'Acknowledged',body:'We have received your request'});
 assert.equal(flow.elements[1].type,'Action');
 assert.equal(flow.elements[1].config.actionType,'Send Email');
 assert.equal(flow.elements[1].config.recipients,'{!$Record.CustomerEmail__c}');
 assert.equal(flow.status,'Draft');
});
test('escalation recipe has an immediate path and a durable scheduled task',()=>{
 const flow=buildAutomationFlow({...common,kind:'Escalation',dueField:'DueDate__c',
  offsetAmount:1,offsetUnit:'Days',taskSubject:'Follow up'});
 assert.equal(flow.elements[1].config.actionType,'Create Task');
 assert.equal(flow.connectors.filter(e=>e.kind==='scheduled').length,1);
 assert.equal(flow.connectors.filter(e=>e.kind==='normal'&&e.from===1).length,1);
 assert.deepEqual(flow.connectors.find(e=>e.kind==='scheduled')?.scheduledPath,{
  timeSourceFieldApiName:'DueDate__c',offsetAmount:1,offsetUnit:'Days'});
 assert.throws(()=>buildAutomationFlow({...common,kind:'Escalation',
  dueField:'DueDate__c',offsetAmount:4000,offsetUnit:'Days',taskSubject:'Follow up'}),/offset/);
});
