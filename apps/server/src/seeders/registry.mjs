import {coreMetadataSeed, mergeCoreMetadata, mergeSharedDependency} from './core.mjs';
import {installedAppSeed, listSeedPackages} from './apps.mjs';
import {createHash} from 'node:crypto';

/**
 * Metadata seeder interface. AppExchange owns all installation/licence/RBAC
 * checks and calls versioned* only with an already-open SQL transaction.
 * No runtime path is installed automatically by merely creating this registry.
 */
export function createTenantSeedRegistry({coreTemplate, appCatalog}) {
  if (!coreTemplate || !appCatalog) throw Error('Core template and AppExchange catalog required');
  const registry = {
    availableApps: () => listSeedPackages(appCatalog),
    freshCore: () => coreMetadataSeed(coreTemplate),
    initializeCore: tenant => mergeCoreMetadata(tenant, coreMetadataSeed(coreTemplate)),
    installShared: (tenant, dependency) => mergeSharedDependency(tenant, dependency),
    installApp: (tenant, tenantId, appKey) => installedAppSeed(tenant, appCatalog, tenantId, appKey),
    versionedCore: (client,{tenantId,version,apply}) => applyVersionedSeed(client,{
      tenantId,kind:'core',key:'core',version,definition:coreMetadataSeed(coreTemplate),apply
    }),
    versionedShared: (client,{tenantId,key,version,definition,apply}) => applyVersionedSeed(client,{
      tenantId,kind:'shared',key,version,definition,apply
    }),
    versionedApp: (client,{tenantId,appKey,version,apply}) => {
      const pkg = (appCatalog.packages ?? []).find(item=>item.appKey===appKey);
      if (!pkg) throw Error('AppExchange package not registered: '+appKey);
      // Caller MUST already have checked installed app entitlement and OneEngine.
      return applyVersionedSeed(client,{
        tenantId,kind:'app',key:appKey,version,definition:pkg,apply
      });
    }
  };
  return registry;
}


/** Canonical checksums ensure repeated package versions are deterministic. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function packageChecksum(definition) {
  return createHash('sha256').update(JSON.stringify(canonical(definition))).digest('hex');
}
export function assertSeedIdentity({tenantId,kind,key,version}) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw Error('Tenant ID required');
  if (!['core','shared','app'].includes(kind)) throw Error('Invalid seed package kind');
  if (typeof key !== 'string' || !key.trim() || key.length > 160) throw Error('Invalid seed package key');
  if (typeof version !== 'string' || !version.trim() || version.length > 80) throw Error('Invalid seed package version');
}
/**
 * Caller passes the EXISTING checked-out transaction client after completing
 * installation, licensing and OneEngine security checks. Never creates its own
 * connection, never grants permissions, and never records an uncommitted seed.
 *
 * apply(client) MUST write the tenant-scoped metadata using this same client.
 * If anything fails, transaction rollback includes both metadata and ledger.
 */
export async function applyVersionedSeed(client,{tenantId,kind,key,version,definition,apply}) {
  assertSeedIdentity({tenantId,kind,key,version});
  if (!client?.query || typeof apply !== 'function') throw Error('Transactional SQL client and apply callback required');
  if (definition === undefined) throw Error('Package definition required');
  const checksum = packageChecksum(definition);
  const lockKey = [tenantId,kind,key].join(':');
  // An advisory transaction lock serialises concurrent attempts to seed
  // the same package without locking unrelated tenants or packages.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[lockKey]);
  const current = await client.query(
    'SELECT package_version,definition_checksum FROM md_seed_package_versions WHERE tenant_id=$1 AND package_kind=$2 AND package_key=$3',
    [tenantId,kind,key]);
  const row=current.rows?.[0];
  if (row?.package_version === version && row.definition_checksum?.trim() === checksum)
    return {changed:false,version,checksum};
  if (row?.package_version === version && row.definition_checksum?.trim() !== checksum)
    throw Error('Package version reused with different metadata: ' + kind + '/' + key);
  await apply(client,structuredClone(definition));
  await client.query(
    `INSERT INTO md_seed_package_versions
      (tenant_id,package_kind,package_key,package_version,definition_checksum)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,package_kind,package_key)
     DO UPDATE SET package_version=EXCLUDED.package_version,
       definition_checksum=EXCLUDED.definition_checksum,updated_at=now()`,
    [tenantId,kind,key,version,checksum]);
  return {changed:true,version,checksum};
}

/**
 * Called only from the SQL state writer's active transaction, AFTER the
 * existing AppExchange runtime has resolved installation/activation and
 * merged package metadata into the tenant snapshot. Never installs packages.
 * The ledger commit rolls back together with the state on any failure.
 */
export async function recordInstalledAppPackageVersions(client, state, catalog) {
  // Older production databases predate the additive ledger migration.
  // Initialise only the ledger inside the caller's existing transaction;
  // never touch tenant records or stamp any package as installed.
  await client.query(`CREATE TABLE IF NOT EXISTS md_seed_package_versions (
    tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT,
    package_kind TEXT NOT NULL CHECK (package_kind IN ('core', 'shared', 'app')),
    package_key TEXT NOT NULL CHECK (length(trim(package_key)) BETWEEN 1 AND 160),
    package_version TEXT NOT NULL CHECK (length(trim(package_version)) BETWEEN 1 AND 80),
    definition_checksum CHAR(64) NOT NULL CHECK (definition_checksum ~ '^[a-f0-9]{64}  for (const [tenantId, tenant] of Object.entries(state?.tenants ?? {})) {
    for (const pkg of catalog?.packages ?? []) {
      const app = (tenant.records?.Connector_App__c ?? []).find(
        item=>item.AppKey__c===pkg.appKey && item.Installed__c===true);
      if (!app || (!pkg.installation?.allowInstalledMetadataWithoutLicence
        && !['Trial','Licensed'].includes(app.LicenceStatus__c))) continue;
      // No ledger entry may claim installation before the actual seeded
      // metadata exists in the same tenant-scoped state being committed.
      const containsDefinition=(collection,entry)=>
        (tenant[collection]??[]).some(item=>item.apiName===entry.apiName
          && (collection!=='objects' || (entry.fields??[]).every(field=>
            (item.fields??[]).some(existing=>existing.apiName===field.apiName))));
      const complete=['objects','pages','apps','flows'].every(collection=>
        (pkg[collection]??[]).every(entry=>containsDefinition(collection,entry)))
        && (pkg.extendObjects??[]).every(entry=>containsDefinition('objects',entry));
      // An older installation is allowed to reconcile through the established
      // AppExchange upgrade path. Never stamp an incomplete package as seeded.
      if (!complete) continue;
      await client.query('INSERT INTO metadrive_rel_tenants(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
      const checksum=packageChecksum(pkg);
      await applyVersionedSeed(client,{
        tenantId,kind:'app',key:pkg.appKey,
        version:String(pkg.version ?? 'sha-'+checksum.slice(0,24)),
        definition:pkg,apply:async()=>{}
      });
    }
  }
}
),
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, package_kind, package_key)
  )`);
  await client.query('CREATE INDEX IF NOT EXISTS md_seed_package_versions_kind_idx ON md_seed_package_versions (tenant_id, package_kind, updated_at DESC)');
  for (const [tenantId, tenant] of Object.entries(state?.tenants ?? {})) {
    for (const pkg of catalog?.packages ?? []) {
      const app = (tenant.records?.Connector_App__c ?? []).find(
        item=>item.AppKey__c===pkg.appKey && item.Installed__c===true);
      if (!app || (!pkg.installation?.allowInstalledMetadataWithoutLicence
        && !['Trial','Licensed'].includes(app.LicenceStatus__c))) continue;
      // No ledger entry may claim installation before the actual seeded
      // metadata exists in the same tenant-scoped state being committed.
      const containsDefinition=(collection,entry)=>
        (tenant[collection]??[]).some(item=>item.apiName===entry.apiName
          && (collection!=='objects' || (entry.fields??[]).every(field=>
            (item.fields??[]).some(existing=>existing.apiName===field.apiName))));
      const complete=['objects','pages','apps','flows'].every(collection=>
        (pkg[collection]??[]).every(entry=>containsDefinition(collection,entry)))
        && (pkg.extendObjects??[]).every(entry=>containsDefinition('objects',entry));
      // An older installation is allowed to reconcile through the established
      // AppExchange upgrade path. Never stamp an incomplete package as seeded.
      if (!complete) continue;
      await client.query('INSERT INTO metadrive_rel_tenants(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[tenantId]);
      const checksum=packageChecksum(pkg);
      await applyVersionedSeed(client,{
        tenantId,kind:'app',key:pkg.appKey,
        version:String(pkg.version ?? 'sha-'+checksum.slice(0,24)),
        definition:pkg,apply:async()=>{}
      });
    }
  }
}
