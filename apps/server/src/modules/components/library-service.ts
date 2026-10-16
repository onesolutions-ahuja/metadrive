import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { transform } from 'esbuild';
import { z } from 'zod';
import { hasDefaultComponentExport, scopeLibraryCss } from './component-source.js';
import { libraryComponentVisible, libraryComponentEditable } from '../../component-scope.mjs';
import { bundledLegacyMigrationDecision } from '../../bundled-component-migration.mjs';
import type { PlatformState } from '../../core/state/types.js';

type LibraryComponent = PlatformState['libraryComponents'][number];
type Dependencies = {
  getState: () => PlatformState;
  setState: (state: PlatformState) => void;
  persistState: (state: PlatformState) => unknown;
  bundledCustomComponentsPath: string;
  libraryComponentResizeSchema: z.ZodTypeAny;
  defaultLibraryComponentResize: { defaultWidth: number; defaultHeight: number; minWidth: number; minHeight: number };
  libraryComponentInputSchema: z.ZodTypeAny;
  installableAppCatalog: { coreComponents: any[]; packages?: Array<{ components?: Array<{ apiName: string }> }> };
};

export function createComponentLibraryService(deps: Dependencies) {
  const { getState, setState, persistState, bundledCustomComponentsPath, libraryComponentResizeSchema, defaultLibraryComponentResize, libraryComponentInputSchema, installableAppCatalog } = deps;
type LibraryComponentUsage = { tenantId: string; surface: 'page' | 'dashboard' | 'flow'; label: string };
function containsLibraryComponentReference(value: unknown, apiName: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsLibraryComponentReference(item, apiName));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    (/component(?:api)?name/i.test(key) && item === apiName)
    || containsLibraryComponentReference(item, apiName));
}
function findLibraryComponentUsages(platformState: PlatformState, apiName: string, ownerTenantId: string): LibraryComponentUsage[] {
  const usages: LibraryComponentUsage[] = [];
  for (const [tenantId, tenant] of Object.entries(platformState.tenants)) {
    if (tenantId !== ownerTenantId) continue;
    for (const page of tenant.pages) {
      if (page.components.some((component) => component.type === `Custom:${apiName}`
        || containsLibraryComponentReference(component.properties, apiName))) {
        usages.push({ tenantId, surface: 'page', label: page.label });
      }
    }
    for (const dashboard of tenant.dashboards) {
      if (dashboard.components.some((component) => component.customComponentApiName === apiName)) {
        usages.push({ tenantId, surface: 'dashboard', label: dashboard.label });
      }
    }
    for (const flow of tenant.flows) {
      if (containsLibraryComponentReference([
        flow.startConfig,
        flow.elements.map((element) => element.config),
        flow.resources,
        flow.versions
      ], apiName)) {
        usages.push({ tenantId, surface: 'flow', label: flow.label });
      }
    }
  }
  return usages;
}
function ownedComponentIndex(apiName: string, tenantId: string): number {
  return getState().libraryComponents.findIndex((component) =>
    component.apiName === apiName
    && libraryComponentEditable(component, tenantId, Object.keys(getState().tenants)));
}
function componentNameTaken(apiName: string, tenantId: string): boolean {
  return getState().libraryComponents.some((component) =>
    component.apiName.toLowerCase() === apiName.toLowerCase()
    && (component.trustedBundled === true
      || libraryComponentVisible(component, tenantId, Object.keys(getState().tenants))));
}
function usageBlockerDetails(usages: LibraryComponentUsage[], tenantId: string) {
  const own = usages.filter((usage) => usage.tenantId === tenantId)
    .map(({ surface, label }) => `${surface} "${label}"`);
  const otherTenantCount = new Set(usages.filter((usage) => usage.tenantId !== tenantId).map((usage) => usage.tenantId)).size;
  if (otherTenantCount) own.push(`references in ${otherTenantCount} other tenant${otherTenantCount === 1 ? '' : 's'}`);
  return own;
}

let bundledComponentSync: Promise<void> | null = null;
function syncBundledLibraryComponents(): Promise<void> {
  if (bundledComponentSync) return bundledComponentSync;
  bundledComponentSync = (async () => {
    const manifestPath = resolve(bundledCustomComponentsPath, 'manifest.json');
    // AppExchange package components are seeded only for installed, entitled apps.
    // Do not also initialise them through the legacy global component manifest.
    const appPackageComponentNames = new Set((installableAppCatalog.packages ?? [])
      .flatMap((pkg: any) => (pkg.components ?? []).map((c: any) => c.apiName)));
    const manifest = z.array(z.object({
      apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      label: z.string().trim().min(1).max(80),
      description: z.string().max(500),
      surfaces: z.array(z.enum(['page', 'dashboard', 'flow', 'platform'])).min(1),
      scope: z.literal('platform-system').optional(),
      resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
      jsx: z.string().min(1),
      css: z.string().min(1),
      version: z.number().int().min(1).default(1)
    })).parse(JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))).filter(entry => !appPackageComponentNames.has(entry.apiName)).concat(installableAppCatalog.coreComponents.map((c: any)=>({apiName:c.apiName,label:c.label,description:c.description,surfaces:c.surfaces,resize:c.resize,jsx:c.jsxFile,css:c.cssFile,version:c.version})));
    const imported: LibraryComponent[] = [];
    const trustedUpgrades = new Map<string, LibraryComponent>();
    for (const entry of manifest) {
      const existingBundled = getState().libraryComponents.find((component) =>
      component.apiName.toLowerCase() === entry.apiName.toLowerCase()
      && component.trustedBundled === true);
    const legacyCandidate = getState().libraryComponents.find((component) =>
      component.apiName.toLowerCase() === entry.apiName.toLowerCase()
      && component.trustedBundled !== true);

      const jsxPath = resolve(bundledCustomComponentsPath, entry.jsx);
      const cssPath = resolve(bundledCustomComponentsPath, entry.css);
      const jsxRelativePath = relative(bundledCustomComponentsPath, jsxPath);
      const cssRelativePath = relative(bundledCustomComponentsPath, cssPath);
      if (jsxRelativePath.startsWith('..') || cssRelativePath.startsWith('..')
        || isAbsolute(jsxRelativePath) || isAbsolute(cssRelativePath)) {
        throw new Error(`Component "${entry.apiName}" contains a source path outside the bundled component directory`);
      }
      const jsxSource = readFileSync(jsxPath, 'utf8');
      if (entry.surfaces.includes('platform') && entry.scope !== 'platform-system')
        throw Error('Untrusted platform component descriptor');
      if (existingBundled && existingBundled.jsxSource === jsxSource
        && existingBundled.cssSource === readFileSync(cssPath, 'utf8')
        && existingBundled.scope === entry.scope
        && entry.surfaces.every(surface=>existingBundled.surfaces.includes(surface))
        && (existingBundled.version ?? 1) >= entry.version) continue;
      const cssSource = readFileSync(cssPath, 'utf8');
      if (legacyCandidate) {
        const decision = bundledLegacyMigrationDecision(legacyCandidate, entry.apiName, jsxSource, cssSource);
        if (decision === 'preserve') {
          // A tenant-owned or unknown component must not abort the entire library.
          console.warn('Preserved untrusted bundled-component name collision:', entry.apiName);
          continue;
        }
      }
      const input = libraryComponentInputSchema.parse({
        apiName: entry.apiName,
        label: entry.label,
        description: entry.description,
        surfaces: entry.surfaces.filter(surface=>surface!=='platform'),
        resize: entry.resize,
        jsxSource,
        cssSource, propertyDefinitions: installableAppCatalog.coreComponents.find((c: {apiName:string}) => c.apiName === entry.apiName)?.propertyDefinitions
      });
      const compiled = await transform(input.jsxSource, {
        loader: 'tsx',
        format: 'cjs',
        target: 'es2020',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        sourcefile: `${input.apiName}.tsx`
      });
      if (!hasDefaultComponentExport(compiled.code)) {
        throw new Error(`Bundled component "${input.apiName}" must export a default React component`);
      }
      if (/\brequire\s*\(/.test(compiled.code)) {
        throw new Error(`Bundled component "${input.apiName}" cannot import external modules`);
      }
      const version = entry.version;
      const registered: LibraryComponent = {
        ...input,
        compiledJs: compiled.code,
        scopedCss: scopeLibraryCss(input.cssSource, input.apiName),
        version,
        updatedAt: new Date().toISOString(),
        status: 'Published', publishedVersion: version, revisions: [],
        trustedBundled: true, scope: entry.scope, surfaces: entry.surfaces
      };
      if (legacyCandidate || existingBundled) {
        trustedUpgrades.set(entry.apiName.toLowerCase(), {
          ...(existingBundled ?? {}),
          ...(legacyCandidate ?? {}), ...registered,
          version: Math.max(version, legacyCandidate?.version ?? existingBundled?.version ?? 1),
          publishedVersion: Math.max(version, legacyCandidate?.publishedVersion ?? existingBundled?.publishedVersion ?? 1)
        });
      } else imported.push(registered);
    }
    if (imported.length || trustedUpgrades.size) {
      const nextState = { ...getState(), libraryComponents: [
        ...getState().libraryComponents.map((item) =>
          trustedUpgrades.get(item.apiName.toLowerCase()) ?? item),
        ...imported
      ] };
      persistState(nextState);
      setState(nextState);
    }
  })().catch((error: unknown) => {
    bundledComponentSync = null;
    throw error;
  });
  return bundledComponentSync;
}

  return { findLibraryComponentUsages, ownedComponentIndex, componentNameTaken, usageBlockerDetails, syncBundledLibraryComponents };
}
