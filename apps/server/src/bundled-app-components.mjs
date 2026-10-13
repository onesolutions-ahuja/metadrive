import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { transformSync } from 'esbuild';

/**
 * Registers repository-bundled UI assets from declarative package metadata.
 * Tenant-created JavaScript is never run by this installer.
 */
export function ensureBundledAppComponents(library, tenant, catalog, bundledRoot) {
  const result = [...library];
  const root = resolve(bundledRoot);
  for (const pkg of catalog?.packages ?? []) {
    const licence = (tenant.records?.Connector_App__c ?? []).find(row =>
      row.AppKey__c === pkg.appKey);
    if (!licence || licence.Installed__c !== true
      || !['Trial','Licensed'].includes(licence.LicenceStatus__c)) continue;
    for (const descriptor of pkg.components ?? []) {
      const position = result.findIndex(item => item.apiName === descriptor.apiName);
      const bundleVersion = Number.isInteger(descriptor.version) && descriptor.version > 0 ? descriptor.version : 1;
      // Upgrade only our own signed bundled component. Never overwrite a tenant
      // component with the same API name, or a newer user-maintained version.
      if (position >= 0 && (!result[position].trustedBundled || (result[position].version ?? 1) >= bundleVersion)) continue;
      const readBundled = path => {
        if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\')) throw Error('Invalid app bundle path');
        const full = resolve(root,path);
        if (!full.startsWith(root + sep)) throw Error('App bundle path is outside the signed source tree');
        return readFileSync(full,'utf8');
      };
      const jsxSource = readBundled(descriptor.jsxFile);
      const cssSource = readBundled(descriptor.cssFile);
      const compiledJs = transformSync(jsxSource, {
        loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'
      }).code;
      const component = {
        ...(position >= 0 ? result[position] : {}),
        apiName:descriptor.apiName,label:descriptor.label,
        description:descriptor.description,
        surfaces:descriptor.surfaces,resize:descriptor.resize,
        jsxSource,cssSource,compiledJs,scopedCss:cssSource,
        version:bundleVersion,publishedVersion:bundleVersion,status:'Published',
        trustedBundled:true,
        updatedAt:new Date().toISOString()
      };
      if (position >= 0) result[position] = component;
      else result.push(component);
    }
  }
  return result;
}
