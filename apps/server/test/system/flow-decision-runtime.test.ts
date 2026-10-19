import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';
import {evaluateFlowDecisionComparison, evaluateFlowDecisionOutcome} from '../../src/system-files/flow-decision-runtime.js';

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

test('authored Flow execution routes through the expanded Decision evaluator', async () => {
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
      {id: 5, type: 'End', label: 'Fallback', config: {}}
    ],
    connectors: [
      {from: 1, to: 2, label: 'Default', kind: 'normal'},
      {from: 2, to: 3, label: 'Matching', kind: 'normal'},
      {from: 2, to: 5, label: 'Default', kind: 'normal'},
      {from: 3, to: 4, label: 'Default', kind: 'normal'}
    ]
  };
  const metadata: Array<{path: string; kind: string; text: string | null}> = [];
  encodeMetadataValue(graph, '/builder', metadata);
  const runId = '00000000-0000-4000-8000-000000000001';
  const client = {query: async (sql: string) => {
    if (sql.includes('SELECT r.flow_id,f.api_name')) return {rows: [{
      flow_id: 'flow-id', api_name: 'DecisionFlow', flow_type: 'Autolaunched Flow',
      started_by: 'user-id', status: 'pending'
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
    if (sql.includes('FROM md_flow_interview_loop_state')) return {rows: []};
    if (sql.includes("UPDATE md_flow_runs SET status='completed'")) return {rows: [], rowCount: 1};
    throw new Error('Unexpected Flow query: ' + sql);
  }};
  const db = {
    query: client.query,
    transaction: async <T>(operation: (transaction: typeof client) => Promise<T>) => operation(client)
  } as unknown as SqlPersistence;
  const rbac = {require: async () => undefined} as unknown as RbacEngine;
  const records = {} as RecordEngine;
  const runtime = new FlowRuntime(db, rbac, records);
  const result = await runtime.advanceInterview('tenant-id', 'user-id', runId, {});
  assert.equal(result.status, 'completed');
  assert.equal((result as {outputs: Record<string, unknown>}).outputs.route, 'matched');
});
