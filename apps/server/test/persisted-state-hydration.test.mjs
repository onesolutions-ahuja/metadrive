import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const objectSchemas = readFileSync(new URL('../src/core/metadata/object-schemas.ts', import.meta.url), 'utf8');
const hydration = readFileSync(new URL('../src/core/state/hydration.ts', import.meta.url), 'utf8');
const refresh = readFileSync(new URL('../src/core/state/refresh.ts', import.meta.url), 'utf8');

test('startup and scheduled-flow reloads share the legacy-safe persisted-state parser', () => {
  assert.match(hydration, /const parsed = parsePersistedPlatformState\(storedState\);/);
  assert.match(refresh, /restoreDurableAuthOverlay\(deps.parsePersistedPlatformState\(committed\)\)/);
  assert.match(hydration, /return deps.persistedMetadataReadMode.parse\(deps.stateSchema, raw\);/);
});

test('new field writes still reject empty picklist metadata', () => {
  assert.match(source, /createCoreObjectSchemas\(persistedMetadataReadMode\)/);
  assert.match(objectSchemas, /if \(!persistedMetadataReadMode.active && isPicklist && !field\.picklistValues\?\.length\)/);
  assert.match(objectSchemas, /Picklist fields must define at least one value/);
});
