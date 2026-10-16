import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const metadata = JSON.parse(readFileSync(new URL('../data/platform-metadata.json', import.meta.url), 'utf8'));
const objects = new Map(metadata.objects.map(object => [object.apiName, object]));
const externalTargets = new Set(['User']);

test('universal business objects are seeded without duplicate API identities', () => {
  assert.equal(objects.size, metadata.objects.length);
  for (const objectName of ['Account', 'Contact', 'Address', 'Product', 'Order', 'OrderItem', 'Invoice', 'InvoiceItem', 'Payment', 'PaymentAllocation', 'Appointment', 'Resource', 'InventoryTransaction', 'JournalEntry']) {
    assert.ok(objects.has(objectName), `Missing ${objectName}`);
  }
});

test('lookup metadata always points to a known object', () => {
  for (const object of metadata.objects) {
    const names = new Set();
    for (const field of object.fields) {
      assert.ok(!names.has(field.apiName), `Duplicate field ${object.apiName}.${field.apiName}`);
      names.add(field.apiName);
      const match = /^Lookup\(([^)]+)\)$/.exec(field.dataType);
      if (match) assert.ok(objects.has(match[1]) || externalTargets.has(match[1]),
        `Invalid lookup ${object.apiName}.${field.apiName} => ${match[1]}`);
    }
  }
});

test('document header and line records are joined by lookup IDs', () => {
  for (const [header, detail, field] of [
    ['Quotation', 'QuotationItem', 'QuotationId'],
    ['Order', 'OrderItem', 'OrderId'],
    ['Invoice', 'InvoiceItem', 'InvoiceId'],
    ['Payment', 'PaymentAllocation', 'PaymentId'],
    ['Fulfilment', 'FulfilmentItem', 'FulfilmentId'],
    ['Return', 'ReturnItem', 'ReturnId'],
    ['InventoryTransaction', 'InventoryTransactionItem', 'InventoryTransactionId'],
    ['JournalEntry', 'JournalEntryLine', 'JournalEntryId']
  ]) {
    assert.ok(objects.has(header));
    assert.equal(objects.get(detail)?.fields.find(f => f.apiName === field)?.dataType, `Lookup(${header})`);
  }
});
