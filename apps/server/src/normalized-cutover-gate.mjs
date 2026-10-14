// Pure, read-only compatibility assessment. Never writes state or includes customer values in reports.
import {projectState, restoreState, stateDigest, verifyProjection} from './relational-projection.mjs';
import {forEachTenantSection,identitySnapshotSections} from './platform-state-registry.mjs';

function itemCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value == null ? 0 : 1;
}

export function describeState(state) {
  const sections = {};
  forEachTenantSection(state, ({key,value}) => {
    sections[key] = (sections[key] ?? 0) + itemCount(value);
  });
  const records = Object.values(state.tenants ?? {}).reduce((n, tenant) =>
    n + Object.values(tenant.records ?? {}).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0), 0);
  return {
    tenants: itemCount(state.tenants),
    objects: sections.objects ?? 0,
    records,
    flows: sections.flows ?? 0,
    pages: sections.pages ?? 0,
    namedCredentials: sections.namedCredentials ?? 0,
    users: itemCount(state.users),
    refreshSessions: itemCount(state.refreshSessions),
    sections
  };
}

/** Fail-closed comparison of the complete live state and the staged relational projection.
 * Compares Flows, pages, credentials, RBAC, users, sessions, metadata AND record values.
 * Does not print data or secret-bearing digests; reports only counts and section names.
 */
export function assessCutoverCompatibility(liveState, stagedRows, migration, runtime) {
  const expected = verifyProjection(liveState, projectState(liveState));
  const restored = restoreState(stagedRows);
  const stagedDigest = stateDigest(restored);
  const liveDigest = expected.digest;
  const counts = {live: describeState(liveState), staged: describeState(restored)};
  const changedSections = [];
  const liveTenants = liveState.tenants ?? {};
  const stagedTenants = restored.tenants ?? {};
  const allTenants = new Set([...Object.keys(liveTenants), ...Object.keys(stagedTenants)]);
  for (const tenantId of allTenants) {
    const a = liveTenants[tenantId] ?? {};
    const b = stagedTenants[tenantId] ?? {};
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (stateDigest(a[name] ?? null) !== stateDigest(b[name] ?? null) && !changedSections.includes(name))
        changedSections.push(name);
    }
  }
  for (const name of identitySnapshotSections) {
    if (stateDigest(liveState[name] ?? null) !== stateDigest(restored[name] ?? null))
      changedSections.push(name);
  }
  const errors = [];
  if (liveDigest !== stagedDigest) errors.push('Live and staging state differ');
  if (!migration || migration.source_sha256 !== liveDigest)
    errors.push('Staging source marker does not match current live state');
  if (!runtime || runtime.state_sha256 !== stagedDigest)
    errors.push('Staging runtime checksum does not match staged rows');
  return {
    ready: errors.length === 0,
    errors,
    changedSections: [...new Set(changedSections)].sort(),
    counts,
    // Deliberately omit SHA256 values and stored record contents from output.
  };
}
