import { createDurableAuthOverlay } from './auth-overlay.js';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { localStateWithoutSqlObjectDefinitions } from '../../local-platform-seed.js';
import type { DurableAuthLogin, AuthLogoutRevocation } from '../../postgres-state.js';
import type { loadAppSeedCatalog } from '../../seeders/catalog.mjs';
import type { createPlatformStateStore } from './store.js';
import { reconcileInstalledAppSeeds } from '../../seeders/apps.mjs';
import { ensureBundledAppComponents } from '../../bundled-app-components.mjs';
import { assertTenantIdentityIsolation } from '../../tenant-identity-isolation.mjs';
import { credentialKeyRing } from '../credential-crypto.js';
import type { PlatformState, TenantData } from './types.js';

export async function initializePlatformState(deps: {
  platformStore: ReturnType<typeof createPlatformStateStore>;
  dataPath: string;
  maintenanceMode: boolean;
  loadState: (snapshot?: unknown) => PlatformState;
  installableAppCatalog: ReturnType<typeof loadAppSeedCatalog>;
  bundledCustomComponentsPath: string;
  persistence: {
    persistenceMode: string;
    readPersistedState: () => Promise<unknown | null>;
    readDurableAuthLogins: () => Promise<DurableAuthLogin[]>;
    readAuthLogoutRevocations: () => Promise<AuthLogoutRevocation[]>;
    persistToPostgres: (snapshot: PlatformState) => Promise<unknown>;
  };
}) {
  const { persistenceMode, readPersistedState, readDurableAuthLogins,
    readAuthLogoutRevocations, persistToPostgres } = deps.persistence;
  const startupStateStartedAt = performance.now();

  const existingPostgresState = await readPersistedState();

  console.info(`Startup persistence read: ${(performance.now() - startupStateStartedAt).toFixed(0)}ms`);

  if (persistenceMode === 'typed' && existingPostgresState === null)
    throw new Error('Typed SQL runtime requires a verified database snapshot; cannot seed from JSON files');

  if (existingPostgresState !== null && persistenceMode !== 'typed') {
    mkdirSync(dirname(deps.dataPath), { recursive: true });
    writeFileSync(deps.dataPath, JSON.stringify(localStateWithoutSqlObjectDefinitions(existingPostgresState as PlatformState)), { encoding: 'utf8', mode: 0o600 });
  } else if (existingPostgresState === null) {
    // Never replace an existing database state with a new empty seed.
    console.log('No PostgreSQL state found; initializing from MetaDrive seed/state file');
  }

  const stateHydrationStartedAt = performance.now();

  deps.platformStore.state = deps.loadState(persistenceMode === 'typed' ? existingPostgresState : undefined);

  // Apply independently durable auth writes before accepting requests or refreshing SQL state.
  const authOverlay = createDurableAuthOverlay({
    persistenceMode,
    durableAuthLogins: deps.maintenanceMode ? [] : await readDurableAuthLogins(),
    durableLogouts: deps.maintenanceMode ? [] : await readAuthLogoutRevocations()
  });

  deps.platformStore.state = authOverlay.restoreDurableAuthOverlay(deps.platformStore.state);

  // One-time legacy migration: former demo Sales/Service defaults were created as
  // ordinary tenant apps, so they remained navigable without installation.
  // Mark only those original defaults as installation-owned, retaining tenant data
  // and customisations. The generic canOpenApp check then hides them until installed.
  for (const tenant of Object.values(deps.platformStore.state.tenants)) {
    tenant.apps = tenant.apps.map((app) => {
      if (app.installationAppKey) return app;
      if (app.apiName === 'SalesApp' && app.label === 'Sales')
        return { ...app, installationAppKey: 'sales' };
      if (app.apiName === 'ServiceApp' && app.label === 'Service')
        return { ...app, installationAppKey: 'service' };
      return app;
    });
  }

  // Repair licensed declarative package metadata without granting extra RBAC permissions.
  if (!deps.maintenanceMode) {
    const nextTenants = { ...deps.platformStore.state.tenants };
    let bundledLibrary = deps.platformStore.state.libraryComponents;
    let repaired = 0;
    for (const [tenantId, tenant] of Object.entries(deps.platformStore.state.tenants)) {
      if (!(tenant.records?.Connector_App__c ?? []).some(row =>
        row.Installed__c === true &&
        deps.installableAppCatalog.packages.some((pkg: { appKey: string; installation?: { allowInstalledMetadataWithoutLicence?: boolean } }) =>
          pkg.appKey === row.AppKey__c && (pkg.installation?.allowInstalledMetadataWithoutLicence === true
            || ['Trial', 'Licensed'].includes(String(row.LicenceStatus__c)))))) continue;
      try {
        const installed = reconcileInstalledAppSeeds(tenant, deps.installableAppCatalog, tenantId) as TenantData;
        if (JSON.stringify(installed) !== JSON.stringify(tenant)) {
          nextTenants[tenantId] = installed;
          repaired++;
        }
        bundledLibrary = ensureBundledAppComponents(
          bundledLibrary, installed, deps.installableAppCatalog, deps.bundledCustomComponentsPath
        );
      } catch (error) {
        console.error('Unable to reconcile licensed app metadata for tenant', tenantId, error);
      }
    }
    if (repaired || bundledLibrary.some((item, index) => item !== deps.platformStore.state.libraryComponents[index])) {
      deps.platformStore.state = { ...deps.platformStore.state, tenants: nextTenants, libraryComponents: bundledLibrary };
      console.info('Reconciled licensed app metadata at startup for tenants:', repaired);
    }
  }

  assertTenantIdentityIsolation(deps.platformStore.state);

  console.info(`Startup state hydration: ${(performance.now() - stateHydrationStartedAt).toFixed(0)}ms`);

  // Remove only legacy internal UI API audit rows; preserve provider and message history.
  let removedInternalApiAuditRecords = 0;

  for (const tenant of Object.values(deps.platformStore.state.tenants)) {
    const entries = tenant.records.Communication_Records__c;
    if (!entries) continue;
    const kept = entries.filter((record) => {
      const internalApiAudit = record.Communication_Mode__c === 'API'
        && record.Direction__c === 'Incoming'
        && String(record.Api_Id__c ?? '').includes(' /api/');
      if (internalApiAudit) removedInternalApiAuditRecords += 1;
      return !internalApiAudit;
    });
    if (kept.length !== entries.length) tenant.records.Communication_Records__c = kept;
  }

  if (removedInternalApiAuditRecords) {
    console.info('Removed legacy internal API audit records:', removedInternalApiAuditRecords);
  }

  try {
    credentialKeyRing();
    console.info('Named Credentials encryption readiness: configured');
  } catch (error) {
    const missingKeys = !process.env.METADRIVE_CREDENTIAL_KEYS;
    const missingActiveId = !process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
    const status = missingKeys && missingActiveId ? 'both variables missing'
      : missingKeys ? 'METADRIVE_CREDENTIAL_KEYS missing'
      : missingActiveId ? 'METADRIVE_CREDENTIAL_ACTIVE_KEY_ID missing'
      : 'invalid environment configuration';
    console.warn('Named Credentials encryption readiness: ' + status);
  }

  if (!deps.maintenanceMode) await persistToPostgres(deps.platformStore.state);
  return authOverlay;
}
