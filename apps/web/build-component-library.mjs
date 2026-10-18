import { mkdir, writeFile } from 'node:fs/promises';
import { loadComponentCatalog, buildBundledComponent } from '../../scripts/component-catalog.mjs';

const catalog = await loadComponentCatalog();
const components = [];
for (const component of catalog.components) components.push({ ...component, ...await buildBundledComponent(component) });
await mkdir('dist/component-library', { recursive: true });
await writeFile('dist/component-library/catalog.json', JSON.stringify({ ...catalog, components }));
console.log(`Bundled ${components.length} component definitions with local dependencies and styles.`);
