import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { transformSync } from 'esbuild';

/** Iterates installed, entitled package component descriptors from metadata. */
export function* installedComponentDescriptors(tenant, catalog) {
  const installations = new Map();
  const ambiguousKeys = new Set();
  for (const row of tenant.records?.Connector_App__c ?? []) {
    // Duplicate installation records are inconsistent tenant metadata.
    // Fail closed regardless of row ordering; never initialise optional bundles.
    if (installations.has(row.AppKey__c)) ambiguousKeys.add(row.AppKey__c);
    else installations.set(row.AppKey__c, row);
  }
  for (const pkg of catalog?.packages ?? []) {
    if (ambiguousKeys.has(pkg.appKey)) continue;
    const licence = installations.get(pkg.appKey);
    if (!licence || licence.Installed__c !== true ||
        !['Trial','Licensed'].includes(licence.LicenceStatus__c)) continue;
    for (const descriptor of pkg.components ?? []) yield descriptor;
  }
}

function readTrustedAsset(root, path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\'))
    throw Error('Invalid app bundle path');
  const full = resolve(root, path);
  if (!full.startsWith(root + sep))
    throw Error('App bundle path is outside the signed source tree');
  return readFileSync(full, 'utf8');
}

/** Drop obsolete global bundles only when metadata opts into retirement.
 * Never strip tenant-owned or currently packaged registrations. */
export function pruneRetiredTrustedComponents(library, catalog) {
  const activeNames = new Set((catalog?.packages ?? [])
    .flatMap(pkg => pkg.components ?? []).map(component => component.apiName));
  const prefixes = (catalog?.retiredTrustedComponentPrefixes ?? [])
    .filter(prefix => typeof prefix === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(prefix));
  return library.filter(item => !(
    item?.trustedBundled === true && item.tenantId == null &&
    !activeNames.has(item.apiName) &&
    prefixes.some(prefix => typeof item.apiName === 'string' && item.apiName.startsWith(prefix))
  ));
}

/**
 * Metadata-driven component registration. Keep existing trusted-bundle version
 * rules: tenant-owned and newer components are never overwritten.
 * The Map avoids repeated scans as the component library grows.
 */
export function ensureBundledAppComponents(library, tenant, catalog, bundledRoot) {
  // Historical removals are supplied by the versioned package catalog,
  // never by app-name conditions inside the shared registry engine.
  const descriptors = [...installedComponentDescriptors(tenant, catalog)];
  const result = pruneRetiredTrustedComponents(library, catalog);
  const root = resolve(bundledRoot);
  const positions = new Map(result.map((component, index) => [component.apiName, index]));
  for (const descriptor of descriptors) {
    const position = positions.get(descriptor.apiName);
    const current = position === undefined ? undefined : result[position];
    const bundleVersion = Number.isInteger(descriptor.version) && descriptor.version > 0
      ? descriptor.version : 1;
    if (current && (!current.trustedBundled || (current.version ?? 1) >= bundleVersion))
      continue;
    const jsxSource = readTrustedAsset(root, descriptor.jsxFile);
    const cssSource = readTrustedAsset(root, descriptor.cssFile);
    const compiledJs = transformSync(jsxSource, {
      loader:'jsx', format:'cjs', jsx:'transform', target:'es2020'
    }).code;
    const component = {
      ...(current ?? {}),
      apiName:descriptor.apiName, label:descriptor.label,
      description:descriptor.description,
      surfaces:descriptor.surfaces, resize:descriptor.resize,
      ...(descriptor.propertyDefinitions ? {propertyDefinitions:descriptor.propertyDefinitions} : {}),
      jsxSource, cssSource, compiledJs, scopedCss:cssSource,
      version:bundleVersion, publishedVersion:bundleVersion, status:'Published',
      trustedBundled:true, updatedAt:new Date().toISOString()
    };
    if (position === undefined) {
      positions.set(component.apiName, result.length);
      result.push(component);
    } else result[position] = component;
  }
  return result;
}
