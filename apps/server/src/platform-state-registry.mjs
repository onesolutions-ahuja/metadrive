/**
 * Canonical state section registry. The persisted shape is unchanged:
 * this describes existing state, never changes tenant records or grants access.
 * Security-sensitive sections remain validated by their dedicated policies.
 */
export const platformStateSections = Object.freeze([
  {key:'tenants',kind:'tenant-map'},
  {key:'libraryComponents',kind:'collection'},
  {key:'users',kind:'identity-collection'},
  {key:'refreshSessions',kind:'session-collection'},
  {key:'revokedAccessTokens',kind:'token-map'},
  {key:'platformPolicies',kind:'platform-setting',valueType:'object',optional:true},
  {key:'platformPolicyAudit',kind:'platform-setting',valueType:'array',optional:true},
  {key:'tenantRegistry',kind:'platform-setting',valueType:'object',optional:true},
  {key:'tenantManagementAudit',kind:'platform-setting',valueType:'array',optional:true}
]);
export const platformStateSectionKeys = Object.freeze(platformStateSections.map(section=>section.key));
export const platformSettingSections = Object.freeze(platformStateSections.filter(section=>section.kind==='platform-setting'));
export const identitySnapshotSections = Object.freeze(platformStateSections.filter(section=>
  section.kind==='identity-collection'||section.kind==='session-collection'||
  section.kind==='token-map'||section.kind==='collection').map(section=>section.key));

/** Enumerates dynamic tenant metadata without app-specific names or code paths. */
export function forEachTenantSection(state, visit) {
  for (const [tenantId,tenant] of Object.entries(state.tenants ?? {})) {
    for (const [key,value] of Object.entries(tenant)) visit({tenantId,key,value});
  }
}
