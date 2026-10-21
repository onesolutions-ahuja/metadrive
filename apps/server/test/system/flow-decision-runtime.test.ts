import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {evaluateFlowDecisionComparison, evaluateFlowDecisionOutcome} from '../../src/system-files/flow-decision-runtime.js';
import {validateFlowDraft} from '../../src/system-files/flow-validation.js';

test('Flow Decision supports Salesforce scalar comparison operators', () => {
  assert.equal(evaluateFlowDecisionComparison('alpha-beta', 'beta', 'Contains'), true);
  assert.equal(evaluateFlowDecisionComparison('alpha-beta', 'alpha', 'Starts With'), true);
  assert.equal(evaluateFlowDecisionComparison(5, 5, 'Greater Than or Equal To'), true);
  assert.equal(evaluateFlowDecisionComparison(4, 5, 'Less Than'), true);
  assert.equal(evaluateFlowDecisionComparison(null, '', 'Is Null'), true);
  assert.equal(evaluateFlowDecisionComparison('value', null, 'Is Not Null'), true);
});

test('Flow Decision evaluates custom condition logic with AND precedence and grouping', () => {
  const conditions = [
    {field: true, operator: 'Equals', value: true},
    {field: false, operator: 'Equals', value: true},
    {field: true, operator: 'Equals', value: true}
  ];
  const resolve = (value: unknown) => value;
  assert.equal(evaluateFlowDecisionOutcome(conditions, '1 AND (2 OR 3)', resolve), true);
  assert.equal(evaluateFlowDecisionOutcome(conditions, '1 AND 2 OR 3', resolve), true);
  assert.equal(evaluateFlowDecisionOutcome(conditions, '1 AND 2', resolve), false);
});

test('Flow Decision handles Was Set and Is Changed using explicit resource state', () => {
  const vars = new Map<string, unknown>([['present', null]]);
  const resolve = (value: unknown) => typeof value === 'string' && value.startsWith('@')
    ? vars.get(value.slice(1)) : value;
  const wasSet = (value: unknown) => typeof value === 'string' && value.startsWith('@')
    && vars.has(value.slice(1));
  assert.equal(evaluateFlowDecisionOutcome([
    {field: '@present', operator: 'Was Set'}
  ], 'All', resolve, wasSet), true);
  assert.equal(evaluateFlowDecisionOutcome([
    {field: '@present', operator: 'Is Changed', value: 'before'}
  ], 'All', resolve, wasSet), true);
  assert.equal(evaluateFlowDecisionOutcome([
    {field: 'new value', priorValue: null, operator: 'Was Set'}
  ], 'All', resolve), true);
  assert.equal(evaluateFlowDecisionOutcome([
    {field: null, priorValue: 'old value', operator: 'Was Set'}
  ], 'All', resolve), false);
});

test('Flow Decision rejects malformed custom logic and missing prior values', () => {
  const resolve = (value: unknown) => value;
  assert.throws(() => evaluateFlowDecisionOutcome([
    {field: 1, operator: 'Equals', value: 1}
  ], '1 OR (', resolve), /Invalid custom Decision logic/);
  assert.throws(() => evaluateFlowDecisionOutcome([
    {field: 1, operator: 'Is Changed'}
  ], 'All', resolve), /prior value/);
  assert.throws(() => evaluateFlowDecisionOutcome([
    {field: 1, operator: 'Equals', value: 1}
  ], '', resolve), /custom Decision logic/);
});

test('Flow validation gates Is Changed and Was Set to valid record-trigger fields', async()=>{
  const rbac={require:async()=>undefined} as unknown as RbacEngine;
  const graph={
    apiName:'TriggerDecision',
    flowType:'Record-Triggered Flow',
    resources:[],
    elements:[
      {id:1,type:'Start',config:{object:'Account',trigger:'updated',runWhen:'after-save'}},
      {id:2,type:'Decision',config:{outcomes:[
        {name:'WasSet',label:'Was Set',conditionLogic:'All',conditions:[
          {field:'{!$Record.Name}',operator:'Was Set'}
        ]},
        {name:'Default',label:'Default',conditionLogic:'All',conditions:[]}
      ]}},
      {id:3,type:'End',config:{}}
    ],
    connectors:[
      {from:1,to:2,label:'Default',kind:'normal'},
      {from:2,to:3,label:'Was Set',kind:'normal'},
      {from:2,to:3,label:'Default',kind:'normal'}
    ]
  };
  const valid=await validateFlowDraft(rbac,'tenant-id','user-id','TriggerDecision',graph);
  assert.equal(valid.valid,true,valid.errors.join('; '));
  const formulaGraph={...graph,resources:[{
    name:'changed',type:'Formula',dataType:'Boolean',value:'ISCHANGED({!$Record.Name})'
  }]};
  const formulaValid=await validateFlowDraft(
    rbac,'tenant-id','user-id','TriggerDecision',formulaGraph);
  assert.equal(formulaValid.valid,true,formulaValid.errors.join('; '));
  const formulaInvalid=await validateFlowDraft(rbac,'tenant-id','user-id','TriggerDecision',{
    ...formulaGraph,flowType:'Autolaunched Flow'
  });
  assert.equal(formulaInvalid.valid,false);
  assert.ok(formulaInvalid.errors.some(error=>error.includes('only supported in Record-Triggered Flows')));
  const invalid=await validateFlowDraft(rbac,'tenant-id','user-id','TriggerDecision',{
    ...graph,elements:graph.elements.map(element=>element.id===2
      ?{...element,config:{outcomes:[{name:'Changed',label:'Changed',conditions:[
        {field:'Name',operator:'Is Changed'}
      ]},{name:'Default',label:'Default',conditions:[]}]}}
      :element)
  });
  assert.equal(invalid.valid,false);
  assert.ok(invalid.errors.some(error=>error.includes('valid record field')));
});

test('authored Flow routes Decision outcomes and executes Custom Notification actions', async () => {
  const graph = {
    flowType: 'Autolaunched Flow',
    resources: [{name: 'route', availableForOutput: true}],
    elements: [
      {id: 1, type: 'Start', label: 'Start', config: {}},
      {id: 2, type: 'Decision', label: 'Decision', config: {outcomes: [
        {name: 'Matching', label: 'Matching', conditionLogic: '1 AND (2 OR 3)', conditions: [
          {field: '@fruit', operator: 'Contains', value: 'pear'},
          {field: '@fruit', operator: 'Starts With', value: 'pear'},
          {field: '@fruit', operator: 'Is Null'}
        ]},
        {name: 'Default', label: 'Default', conditionLogic: 'All', conditions: []}
      ]}},
      {id: 3, type: 'Assignment', label: 'Matched', config: {variable: 'route', value: 'matched'}},
      {id: 4, type: 'End', label: 'Matched End', config: {}},
      {id: 5, type: 'End', label: 'Fallback', config: {}},
      {id: 6, type: 'Action', label: 'Notify', config: {
        actionType: 'Custom Notification', recipientIds: '{!$User.Id}',
        title: 'Matched {!$User.Name}', messageBody: 'Decision branch matched for {!$User.Email}'
      }},
      {id: 7, type: 'Action', label: 'Create Task', config: {
        actionType: 'Create Task', objectApiName: 'Account',
        recordId: '00000000-0000-4000-8000-000000000003', subject: 'Follow up'
      }},
      {id: 8, type: 'Action', label: 'Post to Chatter', config: {
        actionType: 'Post to Chatter', objectApiName: 'Account',
        recordId: '00000000-0000-4000-8000-000000000003', message: 'Flow matched'
      }}
    ],
    connectors: [
      {from: 1, to: 2, label: 'Default', kind: 'normal'},
      {from: 2, to: 6, label: 'Matching', kind: 'normal'},
      {from: 2, to: 5, label: 'Default', kind: 'normal'},
      {from: 6, to: 7, label: 'Default', kind: 'normal'},
      {from: 7, to: 8, label: 'Default', kind: 'normal'},
      {from: 8, to: 3, label: 'Default', kind: 'normal'},
      {from: 3, to: 4, label: 'Default', kind: 'normal'}
    ]
  };
  const metadata: Array<{path: string; kind: string; text: string | null}> = [];
  encodeMetadataValue(graph, '/builder', metadata);
  const runId = '00000000-0000-4000-8000-000000000001';
  let notifications=0;
  let notificationValues:unknown[]|undefined;
  let tasks=0;
  let posts=0;
  const client = {query: async (sql: string, values?: unknown[]) => {
    if (sql.includes('SELECT r.flow_id,f.api_name')) return {rows: [{
      flow_id: 'flow-id', api_name: 'DecisionFlow', flow_type: 'Autolaunched Flow',
      started_by: '00000000-0000-4000-8000-000000000001',
      initiated_by: '00000000-0000-4000-8000-000000000001',
      execution_context: 'User', system_context_approved_by: null, status: 'pending'
    }]};
    if (sql.includes('FROM md_flow_editor_values')) return {rows: metadata.map(row => ({
      property_path: row.path, value_kind: row.kind, value_text: row.text
    }))};
    if (sql.includes('SELECT current_element,history_elements')) return {rows: []};
    if (sql.includes('INSERT INTO md_flow_interview_state')) return {rows: [], rowCount: 1};
    if (sql.includes('FROM md_flow_run_inputs')) return {rows: [{
      api_name: 'fruit', value_text: 'pear pie', data_type: 'string'
    }]};
    if (sql.includes('FROM md_flow_interview_values')) return {rows: []};
    if (sql.includes('FROM md_flow_interview_records')) return {rows: []};
    if (sql.includes('FROM md_flow_interview_record_fields')) return {rows: []};
    if (sql.includes('SELECT u.id,u.email, u.display_name')||sql.includes('SELECT u.id,u.email,u.display_name')) return {rows:[{
      id:'00000000-0000-4000-8000-000000000001',email:'flow@example.invalid',display_name:'Flow User',
      time_zone:'UTC',has_currency_settings:false,currency_iso_code:null,conversion_rate:null
    }]};
    if (sql.startsWith('SAVEPOINT ')) return {rows: []};
    if (sql.startsWith('RELEASE SAVEPOINT ')||sql.startsWith('ROLLBACK TO SAVEPOINT ')) return {rows: []};
    if (sql.includes('INSERT INTO md_notifications')) {
      notifications++;notificationValues=values;
      return {rows: [],rowCount:1};
    }
    if (sql.includes('INSERT INTO md_record_activities')) { tasks++; return {rows: [],rowCount:1}; }
    if (sql.includes('INSERT INTO md_record_chatter_posts')) { posts++; return {rows: [],rowCount:1}; }
    if (sql.includes('FROM md_flow_interview_loop_state')) return {rows: []};
    if (sql.includes("UPDATE md_flow_runs SET status='completed'")) return {rows: [], rowCount: 1};
    if (sql.includes("UPDATE md_flow_runs SET status='failed'")) return {rows: [], rowCount: 1};
    throw new Error('Unexpected Flow query: ' + sql);
  }};
  const db = {
    query: client.query,
    transaction: async <T>(operation: (transaction: typeof client) => Promise<T>) => operation(client)
  } as unknown as SqlPersistence;
  const rbac = {require: async () => undefined,requireRecord:async()=>undefined} as unknown as RbacEngine;
  const records = {} as RecordEngine;
  const runtime = new FlowRuntime(db, rbac, records);
  const result = await runtime.advanceInterview('tenant-id', '00000000-0000-4000-8000-000000000001', runId, {});
  assert.equal(result.status, 'completed');
  assert.equal((result as {outputs: Record<string, unknown>}).outputs.route, 'matched');
  assert.equal(notifications,1);
  assert.deepEqual(notificationValues,[
    'tenant-id',['00000000-0000-4000-8000-000000000001'],
    'Matched Flow User','Decision branch matched for flow@example.invalid','DecisionFlow',
    '00000000-0000-4000-8000-000000000001'
  ]);
  assert.equal(tasks,1);
  assert.equal(posts,1);
});

test('Flow Get Records ignores unselected optional field mappings for Invoice', async()=>{
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const sqlCalls:string[]=[];
 const db={query:async(sql:string)=>{
  sqlCalls.push(sql);
  if(sql.includes('FROM md_object_definitions'))return {rows:[{api_name:'Invoice'}]};
  if(sql.includes('FROM md_field_definitions'))return {rows:[{object_api:'Invoice',api_name:'Name'}]};
  return {rows:[]};
 }} as unknown as SqlPersistence;
 const graph={
  apiName:'GenericBlankFields',flowType:'Autolaunched Flow',
  resources:[{name:'invoice',type:'Record',dataType:'Invoice'}],
  elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'Get Records',config:{object:'Invoice',recordLimit:1,
    outputVariable:'invoice',conditions:[],fields:['Name',''],sortField:''}},
   {id:3,type:'End',config:{}}
  ],
  connectors:[{from:1,to:2},{from:2,to:3}]
 };
 const result=await validateFlowDraft(rbac,'tenant-id','user-id','GenericBlankFields',graph,db);
 assert.equal(result.errors.some(error=>error==='Flow data action references an unavailable field: Invoice.'),false,
  result.errors.join('; '));
 assert.ok(sqlCalls.some(sql=>sql.includes('FROM md_field_definitions')));
 const invalid=structuredClone(graph);
 (invalid.elements[1].config as {fields:string[]}).fields=['GenuinelyMissingField'];
 const failed=await validateFlowDraft(rbac,'tenant-id','user-id','GenericBlankFields',invalid,db);
 assert.ok(failed.errors.some(error=>error.includes('Invoice.GenuinelyMissingField')));
});
