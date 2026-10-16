import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const load = (path) => readFileSync(new URL(path,import.meta.url),'utf8');
const server=load('../apps/server/src/index.ts');
const componentSchemas=load('../apps/server/src/modules/components/library-schema.ts');
const componentRoutes=load('../apps/server/src/modules/components/routes.ts');
const runtime=load('../apps/web/src/RegisteredComponent.tsx');
const page=load('../apps/web/src/pageBuilderView.tsx');
const flow=load('../apps/web/src/FlowBuilder.tsx');
const dashboard=load('../apps/web/src/DashboardBuilder.tsx');
const library=load('../apps/web/src/ComponentLibrary.tsx');

test('existing central component registration keeps RBAC and accepts typed properties',()=>{
  assert.match(componentRoutes,/app\.post\('\/api\/component-library', requirePermission\('components:manage'\)/);
  assert.match(componentRoutes,/app\.put\('\/api\/component-library\/:apiName', requirePermission\('components:manage'\)/);
  assert.match(componentSchemas,/propertyDefinitions:z\.array\(propertyDefinitionSchema\)/);
  assert.match(componentRoutes,/propertyDefinitions: parsed\.data\.propertyDefinitions/);
});
test('trusted and sandboxed components share metadata default resolver',()=>{
  assert.match(runtime,/resolveComponentSettings\(definition\.propertyDefinitions, props\)/);
  assert.match(runtime,/ComponentSandbox definition=\{definition\} props=\{effectiveProps\}/);
  assert.match(runtime,/RegisteredComponentBody definition=\{definition\} props=\{effectiveProps\}/);
});
test('existing builders read same registered property contract',()=>{
  for(const code of [page,flow,dashboard]) assert.match(code,/\?\.propertyDefinitions/);
  assert.match(library,/setPropertyDefinitions/);
  assert.match(componentRoutes,/import \{ libraryRevision, nextLibraryRevision, libraryHistory \}/);
  assert.match(load('../apps/server/src/modules/metadata/component-revisions.mjs'),/function libraryRevision\(component\)/);
});
