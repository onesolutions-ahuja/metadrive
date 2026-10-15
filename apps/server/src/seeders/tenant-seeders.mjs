import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {applyInstallableAppPackages} from '../installable-app-packages.mjs';

// Definitions are loaded only when explicitly requested. The existing package
// catalog is authoritative; this registry does not copy definitions or grant
// installation/entitlement by itself.
const catalogPath = new URL('../../data/installable-app-packages.json', import.meta.url);
const corePath = new URL('../../data/platform-metadata.json', import.meta.url);
const componentPath = new URL('../../../web/src/custom-components/manifest.json', import.meta.url);

function readJson(url) { return JSON.parse(readFileSync(url, 'utf8')); }

export function listAvailableSeeders() {
  const catalog = readJson(catalogPath);
  return {
    core: { id: 'metadrive-core', source: fileURLToPath(corePath) },
    apps: (catalog.packages ?? []).map(p => ({
      id: p.appKey, version: p.version ?? 1, dependencies: p.dependencies ?? [],
      source: fileURLToPath(catalogPath)
    }))
  };
}

export function coreSeedDefinitions() {
  const metadata = readJson(corePath);
  const components = readJson(componentPath);
  // Core holds reusable definitions, not an instruction to install 42 business
  // objects in every tenant. The installer decides which modules to provision.
  return {
    objectDefinitions: structuredClone(metadata.objects ?? []),
    flowDefinitions: structuredClone(metadata.flows ?? []),
    pageDefinitions: structuredClone(metadata.pages ?? []),
    accessControlTemplates: structuredClone(metadata.accessControl ?? {}),
    sharedComponents: structuredClone(components.filter(c => c.scope === 'platform'))
  };
}

export function appSeedDefinitions(appKey) {
  if (typeof appKey !== 'string' || !appKey.trim()) throw Error('App seeder requires an app key');
  const catalog = readJson(catalogPath);
  const pkg = (catalog.packages ?? []).find(p => p.appKey === appKey);
  if (!pkg) throw Error('Unknown installable app seeder');
  return structuredClone(pkg);
}

// Called only after AppExchange has persisted the tenant's installation record.
// The common engine enforces installed/licensed state and provisions metadata,
// component definitions, RBAC and navigation as declared by the package.
export function seedInstalledTenantApp(tenant, tenantId, appKey) {
  if (!tenantId || typeof tenantId !== 'string') throw Error('Tenant identity is required');
  if (typeof appKey !== 'string' || !appKey.trim()) throw Error('App key is required');
  const catalog = readJson(catalogPath);
  const pkg = (catalog.packages ?? []).find(p => p.appKey === appKey);
  if (!pkg) throw Error('Unknown app seeder');
  const installed = (tenant.records?.Connector_App__c ?? []).some(record =>
    record.AppKey__c === appKey && record.Installed__c === true);
  if (!installed) throw Error('App must first be installed through AppExchange');
  return applyInstallableAppPackages(tenant, {packages:[pkg], retiredPackages:[]}, tenantId);
}

// Never use seeders to reconstruct customer records, tokens, credentials,
// sequence counters or live user accounts after data loss.
