import {readFileSync} from 'node:fs';

/**
 * Single canonical AppExchange package source. Installation packages contain
 * editable metadata: pages, component props, Object/Field schemas, actions,
 * flows and navigation. Customer data never originates from this catalog.
 */
export function loadAppSeedCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('../../data/installable-app-packages.json',import.meta.url),'utf8'));
  if (!Array.isArray(catalog?.packages)) throw Error('Invalid AppExchange seed catalog');
  // Core component definitions are bootstrap metadata for the existing SQL-backed
  // published registry. They are not an app package and require no app licence.
  const coreCatalog = JSON.parse(readFileSync(
    new URL('../../../web/src/custom-components/one/manifest.json', import.meta.url),'utf8'
  ));
  if (coreCatalog.schemaVersion !== 1 || !Array.isArray(coreCatalog.commonProperties))
    throw Error('Invalid One component catalog version');
  const coreComponents = coreCatalog.components?.map(component => ({
    ...component,
    propertyDefinitions: [component.propertyDefinitions?.[0],
      ...coreCatalog.commonProperties, ...(component.propertyDefinitions ?? []).slice(1)]
  }));
  if (!Array.isArray(coreComponents) || coreComponents.length !== 40)
    throw Error('Invalid One component catalog');
  const names = new Set();
  for (const component of coreComponents) {
    if (!/^One[A-Za-z0-9_]+$/.test(component.apiName) || names.has(component.apiName) ||
        !Array.isArray(component.surfaces) || !component.surfaces.every(s=>['page','dashboard','flow'].includes(s)) ||
        typeof component.jsxFile!=='string' || !component.jsxFile.startsWith('one/') ||
        typeof component.cssFile!=='string' || component.cssFile!=='one/one.css' ||
        !Array.isArray(component.propertyDefinitions))
      throw Error('Invalid or duplicate One component metadata');
    names.add(component.apiName);
  }
  catalog.coreComponents = coreComponents;
  const seen = new Set();
  for (const pkg of catalog.packages) {
    if (typeof pkg.appKey !== 'string' || !pkg.appKey || seen.has(pkg.appKey))
      throw Error('Missing or duplicate AppExchange seed key');
    seen.add(pkg.appKey);
    // A package can declare record Objects but never tenant customer rows.
    if (pkg.records || pkg.users || pkg.refreshSessions || pkg.namedCredentials)
      throw Error('Application seeder must not contain tenant business data or secrets');
  }
  return catalog;
}
