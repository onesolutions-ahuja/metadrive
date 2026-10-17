import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionGroups, mentionSegments, validateMentionPath, resolveMentionValue,
  resolveMentionProperties, loadedMentionContext, loadMentionContext } from '../../apps/web/src/smartFieldMentions';
import { explicitMentionRecordId } from '../../apps/web/src/useRelationshipMentionContext';
import { dashboardMentionContext, htmlSafeMentionContext } from '../../apps/web/src/builders/dashboardMentionContext';
import { evaluateFormula } from '../../apps/server/src/modules/flows/formula-evaluator';
import { validateFlowFormulaSyntax } from '../../apps/server/src/flow-formula-syntax.mjs';
import type { ObjectMetadata } from '../../apps/web/src/metadata';

const field = (apiName: string, dataType = 'Text', label = apiName) =>
  ({ apiName, label, dataType, required: false, unique: false });
const link = (apiName: string, name: string, targetObject: string) => ({
  ...field(apiName, 'Lookup(' + targetObject + ')'),
  relationship: { type: 'Lookup' as const, targetObject, relationshipName: name, childRelationshipName: name + 's' }
});
const objects = [
  { apiName: 'Sale', label: 'Sale', fields: [
    field('Amount', 'Currency'), field('Qty', 'Number'), field('Name'),
    link('CustomerId', 'Customer', 'Customer'), link('BillingCustomerId', 'BillingCustomer', 'Customer')
  ] },
  { apiName: 'Customer', label: 'Customer', fields: [
    field('Name'), field('Email', 'Email'), link('AccountId', 'Account', 'Account')
  ] },
  { apiName: 'Account', label: 'Account', fields: [field('Name')] },
  { apiName: 'Product', label: 'Product', fields: [field('ImageUrl', 'URL')] }
] as ObjectMetadata[];

test('picker lists only current fields then actual lookup paths, not unrelated app Objects', () => {
  const groups = mentionGroups(objects, 'Sale', ['Sale', 'Customer', 'Product']);
  assert.equal(groups[0].path, 'Sale');
  assert.equal(groups[0].primary, true);
  assert.deepEqual(groups.map(group => group.path), [
    'Sale', 'Sale.Customer', 'Sale.BillingCustomer',
    'Sale.Customer.Account', 'Sale.BillingCustomer.Account'
  ]);
  assert.ok(!groups.some(group => group.objectApiName === 'Product'));
  const customer = groups.find(group => group.path === 'Sale.Customer')!;
  assert.equal(customer.fields.find(f => f.fieldApiName === 'Name')?.reference, '@Sale.Customer.Name');
  assert.equal(groups.find(group => group.path === 'Sale.BillingCustomer')?.fields[0].reference,
    '@Sale.BillingCustomer.Name');
  assert.deepEqual(mentionGroups(objects, 'Sale', [], 'sale.customer.na')
    .flatMap(group => group.fields.map(f => f.fieldApiName)), ['Name']);
  assert.deepEqual(mentionGroups(objects, 'Sale', [], 'email')
    .map(group => group.path), ['Sale.Customer', 'Sale.BillingCustomer']);
  assert.deepEqual(mentionGroups(objects, 'Sale', [], '', 'number')
    .flatMap(group => group.fields.map(f => f.fieldApiName)), ['Amount', 'Qty']);
  assert.deepEqual(mentionGroups(objects, '', ['Customer']).map(group => group.path), []);
});

test('Object metadata offers Sale ID, customer relationship ID and related Customer fields under @Sale',()=>{
 const paths=mentionGroups(objects,'Sale',[], 'sale', 'text');
 const sale=paths.find(group=>group.path==='Sale');
 assert(sale?.fields.some(field=>field.reference==='@Sale.Id'&&field.fieldLabel==='Record ID'));
 assert(sale?.fields.some(field=>field.reference==='@Sale.CustomerId'));
 assert(paths.some(group=>group.path==='Sale.Customer'
   &&group.fields.some(field=>field.reference==='@Sale.Customer.Name')));
 assert(validateMentionPath('@Sale.Id',objects,'Sale'));
 assert(validateMentionPath('@Sale.CustomerId',objects,'Sale'));
 assert.deepEqual(mentionSegments('@Sale.Id',objects,'text','Sale'),
   [{text:'@Sale.Id',reference:true}]);
 const saleRecord={Id:'s1',CustomerId:'c1'};
 const mention=loadedMentionContext(objects,'Sale',saleRecord,{Sale:[saleRecord],Customer:[],Account:[],Product:[]},
  {id:'@Sale.Id',customer:'@Sale.CustomerId'});
 assert.equal(resolveMentionValue('@Sale.Id',mention.records,mention.fields),'s1');
 assert.equal(resolveMentionValue('@Sale.CustomerId',mention.records,mention.fields),'c1');
});

test('field is blue only for a valid, full path from the root object', () => {
  assert.deepEqual(mentionSegments('Dear @Sale.Customer.Name', objects, 'text', 'Sale'), [
    { text: 'Dear ', reference: false },
    { text: '@Sale.Customer.Name', reference: true }
  ]);
  for (const input of ['Dear @Sale.Customer.Nam', '@Sale.Unknown.Name',
    '@Customer.Name', '@Product.ImageUrl', 'support@example.com', '@Sale.Customer.NameX']) {
    assert.deepEqual(mentionSegments(input, objects, 'text', 'Sale'),
      [{ text: input, reference: false }]);
  }
  assert.equal(validateMentionPath('@Sale.Customer.Name', objects, 'Sale', 'formula'), null);
  assert.deepEqual(mentionGroups(objects, 'Sale', [], '', 'formula').map(group => group.path), ['Sale']);
  assert.ok(validateMentionPath('@Customer.Name', objects, 'Customer'));
  assert.equal(validateMentionPath('@Sale.Customer.Name', objects, 'Sale')?.steps[0].lookupField, 'CustomerId');
  assert.equal(validateMentionPath('@Sale.Product.ImageUrl', objects, 'Sale'), null);
});

test('resolves by lookup ID, never a random first Customer; missing records and FLS fail closed', () => {
  const sale = { Id: 's-2', CustomerId: 'c-2', BillingCustomerId: 'c-1', Amount: 18, Qty: 3 };
  const data = { Sale: [sale], Customer: [
    { Id: 'c-1', Name: 'Other' }, { Id: 'c-2', Name: 'Sarah' }
  ], Account: [], Product: [] };
  const props = { greeting: 'Hello @Sale.Customer.Name', billing: '@Sale.BillingCustomer.Name',
    amount: '@Sale.Amount' };
  const context = loadedMentionContext(objects, 'Sale', sale, data, props);
  assert.equal(resolveMentionValue(props.greeting, context.records, context.fields), 'Hello Sarah');
  assert.equal(resolveMentionValue(props.billing, context.records, context.fields), 'Other');
  assert.equal(resolveMentionValue(props.amount, context.records, context.fields), 18);
  assert.deepEqual(resolveMentionProperties(props, context.records, context.fields),
    { greeting: 'Hello Sarah', billing: 'Other', amount: 18 });
  const blocked = loadedMentionContext(objects, 'Sale', sale,
    { ...data, Customer: [{ Id: 'c-2' }] }, props);
  assert.equal(resolveMentionValue(props.greeting, blocked.records, blocked.fields), props.greeting);
  assert.equal(resolveMentionValue(props.greeting, {}, {}), props.greeting);
  assert.equal(resolveMentionValue(props.greeting, {}, {}, objects, 'Sale'), 'Hello ');
  assert.equal(resolveMentionValue('Hello @Sale.Customer.Nam', {}, {}, objects, 'Sale'),
    'Hello @Sale.Customer.Nam');
  assert.equal(resolveMentionValue('support@example.com', context.records, context.fields), 'support@example.com');
});

test('cross-object async loading uses only exact lookup IDs with bounded fetches', async () => {
  const sale = { Id: 'sale', CustomerId: 'customer-2', BillingCustomerId: 'customer-1' };
  const calls: string[] = [];
  const context = await loadMentionContext(objects, 'Sale', sale,
    { label: '@Sale.Customer.Name', billing: '@Sale.BillingCustomer.Name' }, async (obj, id) => {
      calls.push(obj + ':' + id);
      return { Id: id, Name: id };
    });
  assert.deepEqual(calls, ['Customer:customer-2', 'Customer:customer-1']);
  assert.equal(resolveMentionValue('@Sale.Customer.Name', context.records, context.fields), 'customer-2');
  assert.equal(resolveMentionValue('@Sale.BillingCustomer.Name', context.records, context.fields), 'customer-1');
});

test('explicit record context is mandatory on a multi-record page', () => {
  assert.equal(explicitMentionRecordId({}), '');
  assert.equal(explicitMentionRecordId({ recordId: 'sale-5' }), 'sale-5');
  assert.equal(explicitMentionRecordId({ filters: [{ field: 'Id', operator: 'Equals', value: 'sale-5' }] }), 'sale-5');
  assert.equal(explicitMentionRecordId({ filters: [{ field: 'Status', operator: 'Equals', value: 'Open' }] }), '');
});

test('direct same-object formulas still work via the existing evaluator', () => {
  assert.deepEqual(validateFlowFormulaSyntax('@Sale.Qty * @Sale.Amount').references,
    ['@Sale.Qty', '@Sale.Amount']);
  assert.equal(evaluateFormula('@Sale.Qty * @Sale.Amount',
    name => ({ Qty: 2, Amount: 15 } as Record<string, number>)[name],
    { sourceObjectApiName: 'Sale' }), 30);
  assert.throws(() => evaluateFormula('@Customer.Name', () => 'x',
    { sourceObjectApiName: 'Sale' }), /active object record context/);
});


test('Dashboard relationship fields need one source record and escape dynamic HTML safely', () => {
  const rows = { Sale: [
    { Id: 's-1', CustomerId: 'c-1' }, { Id: 's-2', CustomerId: 'c-2' }
  ], Customer: [
    { Id: 'c-1', Name: 'Wrong record' }, { Id: 'c-2', Name: '<script>alert(1)</script>' }
  ] };
  const props = { heading: '@Sale.Customer.Name' };
  const unspecified = dashboardMentionContext(objects, 'Sale', rows, props);
  assert.equal(resolveMentionValue(props.heading, unspecified.records, unspecified.fields), props.heading);
  assert.equal(resolveMentionValue(props.heading, unspecified.records, unspecified.fields, objects, 'Sale'), '');
  const explicit = dashboardMentionContext(objects, 'Sale', rows, props, 's-2');
  assert.equal(resolveMentionValue(props.heading, explicit.records, explicit.fields), '<script>alert(1)</script>');
  const escaped = htmlSafeMentionContext(explicit);
  assert.equal(resolveMentionValue(props.heading, escaped.records, escaped.fields),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
});
