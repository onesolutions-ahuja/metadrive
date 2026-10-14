import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const runtime=readFileSync(new URL('../apps/web/src/RegisteredComponent.tsx',import.meta.url),'utf8');
const editor=readFileSync(new URL('../apps/web/src/DashboardBuilder.tsx',import.meta.url),'utf8');
const pageEditor=readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
const metadata=readFileSync(new URL('../apps/web/src/metadata.ts',import.meta.url),'utf8');
test('renderer preserves legacy props and applies shared defaults to both trust paths',()=>{
  assert.match(runtime,/definition\.propertyDefinitions\?\.length/);
  assert.match(runtime,/resolveComponentSettings\(definition\.propertyDefinitions, props\)/);
  assert.match(runtime,/ComponentSandbox definition=\{definition\} props=\{effectiveProps\}/);
  assert.match(runtime,/RegisteredComponentBody definition=\{definition\} props=\{effectiveProps\}/);
});
test('dashboard editor reads registry declared property types when present',()=>{
  assert.match(editor,/definitions=\{libraryComponents\.find\(/);
  assert.match(metadata,/propertyDefinitions\?:/);
});

test('page builder consumes registered property definitions with legacy fallback',()=>{
 assert.match(pageEditor,/definitions=\{libraryComponents\.find\(component => selected\.type/);
 assert.match(pageEditor,/definitions=\{definitions\} addOnly/);
});
