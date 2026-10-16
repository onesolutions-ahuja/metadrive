import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateFormula, formulaLocalDate, isSafeFlowRegex } from '../src/modules/flows/formula-evaluator.js';
import { evaluateCustomConditionLogic } from '../src/modules/flows/condition-logic.js';
import { dashboardLocalParts, flowLocalDateTimeToInstant } from '../src/core/local-time.js';

test('extracted evaluator preserves arithmetic and record-field resolution', () => {
  assert.equal(evaluateFormula('2 + 3 * 4', () => null), 14);
  assert.equal(evaluateFormula('Amount * 2', (field) => field === 'Amount' ? 5 : null), 10);
});

test('formula regex validation remains fail-closed', () => {
  assert.equal(isSafeFlowRegex('^[A-Z]+$'), true);
  assert.equal(isSafeFlowRegex('(a+)+'), false);
});

test('Flow condition expressions retain numbered, strict parsing', () => {
  assert.equal(evaluateCustomConditionLogic('1 AND (2 OR 3)', [true, false, true]), true);
  assert.equal(evaluateCustomConditionLogic('1 AND 2', [true, false]), false);
  assert.throws(() => evaluateCustomConditionLogic('3', [true, false]), /condition 3/);
});

test('timezone utilities preserve civil-time and daylight-saving boundaries', () => {
  const civilDate = new Date('2026-03-29T00:00:00.000Z');
  assert.equal(flowLocalDateTimeToInstant(civilDate, 1, 30, 'Europe/London'), undefined);
  const instant = flowLocalDateTimeToInstant(civilDate, 2, 30, 'Europe/London');
  assert.equal(instant?.toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(formulaLocalDate(instant!, 'Europe/London'), '2026-03-29');
  assert.equal(dashboardLocalParts(instant!, 'Europe/London').hour, '02');
});
