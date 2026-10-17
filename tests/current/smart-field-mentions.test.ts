import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionGroups, mentionSegments, resolveMentionValue, resolveMentionProperties }
  from '../../apps/web/src/smartFieldMentions';
import { evaluateFormula } from '../../apps/server/src/modules/flows/formula-evaluator';
import { validateFlowFormulaSyntax } from '../../apps/server/src/flow-formula-syntax.mjs';
import type { ObjectMetadata } from '../../apps/web/src/metadata';

const objects = [
  { apiName: 'Customer', label: 'Customer', fields: [
    { apiName: 'Name', label: 'Name', dataType: 'Text' },
    { apiName: 'Email', label: 'Email', dataType: 'Email' }
  ] },
  { apiName: 'Sale', label: 'Sale', fields: [
    { apiName: 'Amount', label: 'Amount', dataType: 'Currency' },
    { apiName: 'Qty', label: 'Quantity', dataType: 'Number' },
    { apiName: 'Name', label: 'Sale Name', dataType: 'Text' }
  ] },
  { apiName: 'Product', label: 'Product', fields: [
    { apiName: 'ImageUrl', label: 'Image URL', dataType: 'URL' }
  ] }
] as ObjectMetadata[];

test('@ search lists the main page object first and filters app objects and field names', () => {
  const groups = mentionGroups(objects, 'Sale', ['Customer', 'Sale', 'Product']);
  assert.deepEqual(groups.map(group => group.label), ['Sale', 'Customer', 'Product']);
  assert.equal(groups[0].primary, true);
  assert.deepEqual(mentionGroups(objects, 'Sale', ['Sale', 'Customer'], 'email')
    .map(group => group.objectApiName), ['Customer']);
  assert.deepEqual(mentionGroups(objects, 'Sale', ['Sale', 'Customer'], 'sale.am')
    .flatMap(group => group.fields.map(field => field.fieldApiName)), ['Amount']);
  assert.deepEqual(mentionGroups(objects, 'Sale', ['Sale', 'Customer'], 'Sale.')
    .map(group => group.objectApiName), ['Sale']);
  assert.deepEqual(mentionGroups(objects, 'Sale', ['Sale', 'Customer'], '', 'number')
    .flatMap(group => group.fields.map(field => field.fieldApiName)), ['Amount', 'Qty']);
  assert.deepEqual(mentionGroups(objects, 'Sale', ['Sale', 'Customer', 'Product'], '', 'image')
    .map(group => group.objectApiName), ['Sale', 'Customer', 'Product']);
});

test('complete metadata references are blue; partial backspaces and emails remain plain', () => {
  assert.deepEqual(mentionSegments('Hello @Customer.Name', objects), [
    { text: 'Hello ', reference: false },
    { text: '@Customer.Name', reference: true }
  ]);
  assert.deepEqual(mentionSegments('Hello @Customer.Nam', objects),
    [{ text: 'Hello @Customer.Nam', reference: false }]);
  assert.deepEqual(mentionSegments('support@example.com', objects),
    [{ text: 'support@example.com', reference: false }]);
  assert.deepEqual(mentionSegments('@Sale.AmountExtra', objects),
    [{ text: '@Sale.AmountExtra', reference: false }]);
});

test('references resolve only fields in permission-filtered context and preserve types', () => {
  const data = { Sale: { Amount: 18, Qty: 3 }, Customer: { Name: 'Sarah' } };
  const permitted = { Sale: ['Amount', 'Qty'], Customer: [] as string[] };
  assert.equal(resolveMentionValue('@Sale.Amount', data, permitted), 18);
  assert.equal(resolveMentionValue('Total @Sale.Amount', data, permitted), 'Total 18');
  assert.equal(resolveMentionValue('Hello @Customer.Name', data, permitted), 'Hello @Customer.Name');
  assert.equal(resolveMentionValue('Hello @Sale.Amoun', data, permitted), 'Hello @Sale.Amoun');
  assert.equal(resolveMentionValue('support@example.com', data, permitted), 'support@example.com');
  assert.deepEqual(resolveMentionProperties({ amount: '@Sale.Amount', greeting: 'Hello @Customer.Name' },
    data, permitted), { amount: 18, greeting: 'Hello @Customer.Name' });
});

test('existing formula grammar evaluates same-object @ references; unrelated objects fail closed', () => {
  assert.deepEqual(validateFlowFormulaSyntax('@Sale.Qty * @Sale.Amount').references,
    ['@Sale.Qty', '@Sale.Amount']);
  assert.equal(evaluateFormula('@Sale.Qty * @Sale.Amount',
    name => ({ Qty: 2, Amount: 15 } as Record<string, number>)[name],
    { sourceObjectApiName: 'Sale' }), 30);
  assert.throws(() => evaluateFormula('@Customer.Name', () => 'x',
    { sourceObjectApiName: 'Sale' }), /active object record context/);
});
