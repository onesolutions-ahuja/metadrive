import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addComponentProperty,
  displayComponentPropertyName,
  parseComponentProperties,
  validateComponentPropertyName
} from '../src/componentProperties';

test('empty and valid Flow component properties load without data loss', () => {
  assert.deepEqual(parseComponentProperties(undefined), { properties: {}, error: '' });
  const raw = '{"title":"Checkout","count":3,"enabled":true,"items":[{"id":"one"}]}';
  const parsed = parseComponentProperties(raw);
  assert.equal(parsed.error, '');
  assert.deepEqual(parsed.properties, {
    title: 'Checkout', count: 3, enabled: true, items: [{ id: 'one' }]
  });
});

test('invalid JSON, arrays, and prototype keys fail closed', () => {
  assert.match(parseComponentProperties('{invalid').error, /invalid JSON/);
  assert.match(parseComponentProperties('[]').error, /plain object/);
  assert.match(parseComponentProperties('{"__proto__":{"polluted":true}}').error, /forbidden key/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('component property names avoid host props and unsafe keys', () => {
  assert.match(validateComponentPropertyName('onAction'), /reserved/);
  assert.match(validateComponentPropertyName('__proto__'), /letter/);
  assert.match(validateComponentPropertyName('bad-name'), /letter/);
  assert.match(validateComponentPropertyName('title', { title: 'Old' }), /already exists/);
  assert.equal(validateComponentPropertyName('brandName', {}), '');
});

test('typed property insertion is non-destructive', () => {
  const original = { title: 'Menu', items: [{ name: 'Burger' }] };
  const text = addComponentProperty(original, 'brandName', 'text');
  const number = addComponentProperty(text, 'columns', 'number');
  const boolean = addComponentProperty(number, 'showPrices', 'boolean');
  assert.deepEqual(boolean, {
    title: 'Menu', items: [{ name: 'Burger' }], brandName: '', columns: 0, showPrices: false
  });
  assert.deepEqual(original, { title: 'Menu', items: [{ name: 'Burger' }] });
  assert.throws(() => addComponentProperty(boolean, 'columns', 'number'), /already exists/);
});

test('API field names display as readable property captions', () => {
  assert.equal(displayComponentPropertyName('brandName'), 'Brand Name');
  assert.equal(displayComponentPropertyName('image_height'), 'Image height');
});
