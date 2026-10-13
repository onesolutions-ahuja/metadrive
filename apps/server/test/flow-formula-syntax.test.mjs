import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFlowFormulaSyntax } from '../src/flow-formula-syntax.mjs';

test('formula syntax supports Salesforce merge-reference notation without running the resource', () => {
  assert.deepEqual(
    validateFlowFormulaSyntax('VALUE({!AmountText}) + VALUE({!$Record.Total__c})'),
    { hasReferences: true, references: ['AmountText', '$Record.Total__c'] }
  );
  assert.deepEqual(
    validateFlowFormulaSyntax('IF({!Approved}, LEFT({!Name}, 2), DATEVALUE({!RequestedDate}))'),
    { hasReferences: true, references: ['Approved', 'Name', 'RequestedDate'] }
  );
  assert.deepEqual(validateFlowFormulaSyntax("CONCATENATE('{!Literal}', ' text')"),
    { hasReferences: false, references: [] });
  assert.deepEqual(validateFlowFormulaSyntax('IF(TRUE(), 1, 2)'),
    { hasReferences: false, references: [] });
});

test('formula syntax rejects unknown functions and malformed lazy branches before activation', () => {
  for (const expression of [
    'IF({!Ready}, VALUE({!Price}), BOGUS({!Code}))',
    'IF(TRUE(), 10, BAD_FUNCTION(1))',
    'IF({!Ready}, 1, )',
    'IF({!Ready}, 1, (2+))',
    'VALUE({!Price',
    'VALUE({!Price}) INVALID',
    'OR({!Ready}, )',
    'CASE({!Key}, 1, "one")'
  ]) {
    assert.throws(() => validateFlowFormulaSyntax(expression), undefined, expression);
  }
});

test('formula syntax accepts operator precedence, safe nesting, and case-insensitive functions', () => {
  for (const expression of [
    '2^3^2',
    'FALSE AND (1 / 0 = 1) OR TRUE',
    '(TRUE() || FALSE()) && !(1 + 2 < 3)',
    "Case({!Code}, 'A', 1, 'B', 2, 0)",
    'ISCHANGED({!$Record.Status__c})',
    'IF({!Ready}, 2.2 + 4*5, 10)',
    'DATEVALUE({!$Flow.CurrentDateTime})'
  ]) {
    assert.doesNotThrow(() => validateFlowFormulaSyntax(expression), expression);
  }
});

test('formula grammar limits input length and recursion depth', () => {
  assert.throws(() => validateFlowFormulaSyntax('('.repeat(150) + '1' + ')'.repeat(150)), /nesting/);
  assert.throws(() => validateFlowFormulaSyntax('1+'.repeat(1001) + '1'), /2,000-token/);
  assert.throws(() => validateFlowFormulaSyntax(' '.repeat(10001) + '1'), /10,000-character/);
});
