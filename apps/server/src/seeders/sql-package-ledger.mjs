import {createHash} from 'node:crypto';

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
