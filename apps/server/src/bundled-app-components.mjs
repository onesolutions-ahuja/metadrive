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
      if (result.some(item => item.apiName === descriptor.apiName)) continue;
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
      result.push({
        apiName:descriptor.apiName,label:descriptor.label,
        description:descriptor.description,
        surfaces:descriptor.surfaces,resize:descriptor.resize,
        jsxSource,cssSource,compiledJs,scopedCss:cssSource,
        version:1,publishedVersion:1,status:'Published',
        trustedBundled:true,
        updatedAt:new Date().toISOString()
      });
    }
  }
  return result;
}
