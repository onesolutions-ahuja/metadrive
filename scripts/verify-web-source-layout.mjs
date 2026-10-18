import assert from 'node:assert/strict';
import { readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { loadComponentCatalog, webSourceRoot } from './component-catalog.mjs';

const entries = await readdir(webSourceRoot, { withFileTypes: true });
assert.deepEqual(entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), ['core', 'one']);
assert.deepEqual(entries.filter(entry => entry.isFile()).map(entry => entry.name).sort(), ['README.md', 'main.tsx']);
const { components } = await loadComponentCatalog();
const registered = components.filter(component => component.apiName.startsWith('One'));
assert.equal(registered.length, 41, 'Keep the existing registered component catalog intact');
for (const component of registered) {
  const prefix = `one/${component.apiName}/`;
  assert.equal(component.jsxFile, prefix + component.apiName + '.jsx');
  assert.equal(component.cssFile, prefix + component.apiName + '.css');
  for (const file of [component.jsxFile, component.cssFile, prefix + 'component.json']) await access(path.join(webSourceRoot, file));
}
console.log(`Web layout verified: Core, One and ${registered.length} component folders.`);
