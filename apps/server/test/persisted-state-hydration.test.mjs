import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('startup and scheduled-flow reloads share the legacy-safe persisted-state parser', () => {
  assert.match(source, /const parsed = parsePersistedPlatformState\(storedState\);/);
  assert.match(source, /restoreDurableAuthOverlay\(parsePersistedPlatformState\(committed\)\)/);
  assert.match(source, /function parsePersistedPlatformState\(raw: unknown\)[\s\S]*?hydratingPersistedMetadata = true;[\s\S]*?return stateSchema\.parse\(raw\);[\s\S]*?hydratingPersistedMetadata = previous;/);
});

test('new field writes still reject empty picklist metadata', () => {
  assert.match(source, /if \(!hydratingPersistedMetadata && isPicklist && !field\.picklistValues\?\.length\)/);
  assert.match(source, /Picklist fields must define at least one value/);
});
