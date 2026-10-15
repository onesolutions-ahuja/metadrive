import {readFileSync} from 'node:fs';

/**
 * Single canonical AppExchange package source. Installation packages contain
 * editable metadata: pages, component props, Object/Field schemas, actions,
 * flows and navigation. Customer data never originates from this catalog.
 */
export function loadAppSeedCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('../../data/installable-app-packages.json',import.meta.url),'utf8'));
  if (!Array.isArray(catalog?.packages)) throw Error('Invalid AppExchange seed catalog');
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
