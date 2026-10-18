import { mkdir, writeFile } from 'node:fs/promises';
import { loadComponentCatalog, buildBundledComponent } from '../../scripts/component-catalog.mjs';

const catalog = await loadComponentCatalog();
const components = [];
const index = [];
await mkdir('dist/component-library/components', { recursive: true });
for (const component of catalog.components) {
  const built = { ...component, ...await buildBundledComponent(component) };
  components.push(built);
  index.push({
    apiName: component.apiName,
    label: component.label,
    description: component.description ?? '',
    surfaces: component.surfaces,
    resize: component.resize,
    version: component.version,
    propertyDefinitions: component.propertyDefinitions ?? [],
    scope: component.scope === 'platform-system' ? 'platform-system' : undefined
  });
  await writeFile(`dist/component-library/components/${component.apiName}.json`,JSON.stringify({
    apiName:component.apiName,version:component.version,compiledJs:built.compiledJs,scopedCss:built.cssSource
  }));
}
await writeFile('dist/component-library/catalog-index.json',JSON.stringify({
  schemaVersion:catalog.schemaVersion, components:index
}));
await writeFile('dist/component-library/catalog.json', JSON.stringify({ ...catalog, components }));
console.log(`Bundled ${components.length} component definitions with lazy renderer assets.`);
