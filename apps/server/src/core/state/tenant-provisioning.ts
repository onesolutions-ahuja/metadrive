import type { LocalUser, TenantData, TenantRegistryEntry, PlatformState } from './types.js';
import { hashToken, hashPassword } from '../../auth.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { initializeTenantCore } from '../../seeders/core.mjs';
import { roleIdForName, profileIdForRole } from '../../modules/security/role-helpers.js';
import type { CreateTenantProvisioningDependencies } from '../../index.js';

export function createTenantProvisioning(deps: CreateTenantProvisioningDependencies) {
  const provisioningPendingTenants = new Set<string>();

  let provisioningCommitFailed = false;

  let tenantProvisioningSerial: Promise<void> = Promise.resolve();

  class TenantProvisioningStoreError extends Error {
    constructor() { super('Tenant provisioning could not be durably committed. Retry after database recovery.'); }
  }

  function verifySeededTenant(tenantId: string, admin: LocalUser, data: TenantData, developer?: LocalUser, grantTenantDeveloperPolicyToAdmin = false): void {
    if (!data.accessControl.users.some((user) => user.id === admin.id && user.profileId === 'system-administrator'))
      throw new Error('Initial administrator permissions were not provisioned');
    for (const apiName of ['Account', 'Contact', 'User']) {
      if (!data.objects.some((item) => item.apiName === apiName))
        throw new Error('Required tenant object was not provisioned');
    }
    if (!data.accessControl.permissionSets.some((set) => set.id === 'system-administrator'))
      throw new Error('Initial system administrator permission set is missing');
    const expectedIds = new Set([admin.id, ...(developer ? [developer.id] : [])]);
    if (admin.tenantId !== tenantId || (developer && (developer.tenantId !== tenantId || !developer.disabled))
      || data.accessControl.users.length !== expectedIds.size
      || data.accessControl.users.some((user) => !expectedIds.has(user.id)))
      throw new Error('Initial tenant user isolation check failed');
    const initialAdmin = data.accessControl.users.find((user) => user.id === admin.id);
    if (grantTenantDeveloperPolicyToAdmin && (!initialAdmin?.permissionSetIds.includes('oneengine-tenant-developer')
      || !admin.permissionSetIds.includes('oneengine-tenant-developer')))
      throw new Error('Requested initial administrator Tenant Developer grant was not provisioned');
    if (developer && !data.accessControl.users.some((user) =>
      user.id === developer.id && user.profileId === 'system-administrator'
      && user.permissionSetIds.includes('system-administrator')))
      throw new Error('Developer initial permissions were not provisioned');
    // The existing tenant template intentionally seeds a disabled WhatsApp dummy
    // credential, scoped to this tenant. Never inherit a live connection.
    if (data.integrationConnections.length !== 0)
      throw new Error('New tenants must not inherit another tenant integration connection');
  }

  // The disabled developer identity belongs to the tenant; credentials are never shared.
  function developerDomainFor(email: string, preferred?: string): string {
    const domain = (preferred ?? email.split('@')[1] ?? '').trim().toLowerCase();
    if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
      throw new Error('A valid tenant domain is required for the developer account');
    return domain;
  }

  async function createTenant(tenantId: string, name: string, adminName: string, email: string, password: string,
    actorId = 'bootstrap', idempotencyKey?: string, developerDomain?: string,
    grantTenantDeveloperPolicyToAdmin = false): Promise<{ user: LocalUser; created: boolean }> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(tenantId))
      throw new Error('Tenant ID must be 2–63 characters using letters, numbers, underscores, or hyphens');
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedAdminName = adminName.trim();
    // Without a tenant-controlled domain, use a distinct tenant-scoped placeholder
    // rather than claiming "developer@" at a shared email-provider domain.
    const domain = developerDomain ? developerDomainFor(normalizedEmail, developerDomain)
      : developerDomainFor(normalizedEmail, tenantId.toLowerCase() + '.' + normalizedEmail.split('@')[1]);
    const developerEmail = 'developer@' + domain;
    if (developerEmail === normalizedEmail)
      throw new Error('The initial administrator email must differ from the developer seeder email');
    if (!normalizedName || !normalizedAdminName) throw new Error('Tenant and administrator names are required');
    const requestHash = idempotencyKey ? hashToken(actorId + ':' + idempotencyKey) : undefined;
    const previous = tenantProvisioningSerial;
    let release: () => void = () => {};
    tenantProvisioningSerial = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (provisioningCommitFailed)
        throw new TenantProvisioningStoreError();
      if (requestHash && Object.entries(deps.platformStore.state.tenantRegistry).some(([existingId, item]) =>
        item.provisioningRequestHash === requestHash && existingId !== tenantId))
        throw new Error('Idempotency key was already used for another tenant');
      const existing = deps.platformStore.state.tenants[tenantId];
      if (existing) {
        const entry = deps.platformStore.state.tenantRegistry[tenantId];
        const user = deps.platformStore.state.users.find((item) => item.tenantId === tenantId && item.email === normalizedEmail);
        // A retry with the same actor/key must not change passwords or grant
        // permissions; return the original result without creating another user.
        if (requestHash && entry?.provisioningRequestHash === requestHash && user)
          return { user, created: false };
        throw new Error('Tenant already exists');
      }
      if (deps.platformStore.state.users.some((user) => [normalizedEmail, developerEmail].includes(user.email.trim().toLowerCase())))
        throw new Error('Administrator or developer email is already registered. Each email belongs to one tenant.');
      const credentials = await hashPassword(password);
      // The developer gets an unguessable, never-disclosed secret and is disabled.
      // Only tenant security administrators can activate it with a new password.
      const developerCredentials = await hashPassword(randomBytes(32).toString('base64url'));
      // No other provisioning writer can interleave while this hash is calculated.
      const createdAt = new Date().toISOString();
      const admin: LocalUser = {
        id: randomUUID(), tenantId, name: normalizedAdminName, email: normalizedEmail,
        passwordSalt: credentials.salt, passwordHash: credentials.hash,
        role: 'System Administrator', permissionSetIds: ['system-administrator',
          ...(grantTenantDeveloperPolicyToAdmin ? ['oneengine-tenant-developer'] : [])],
        permissionSetGroupIds: [], disabled: false, createdAt
      };
      const developer: LocalUser = {
        id: randomUUID(), tenantId, name: 'Developer', email: developerEmail,
        passwordSalt: developerCredentials.salt, passwordHash: developerCredentials.hash,
        role: 'System Administrator', permissionSetIds: ['system-administrator','oneengine-tenant-developer'],
        permissionSetGroupIds: [], disabled: true, createdAt
      };
      const tenantSeed = initializeTenantCore(deps.defaultTenantData(admin), {authorizedUserIds:[admin.id], trustedProvisioningDefaults:true});
      const developerAccess = {
        id: developer.id, name: developer.name, username: developer.email,
        role: developer.role, roleId: roleIdForName(developer.role, tenantSeed.accessControl.roles),
        profileId: profileIdForRole(developer.role, tenantSeed.accessControl.profiles),
        permissionSetIds: developer.permissionSetIds, permissionSetGroupIds: developer.permissionSetGroupIds,
        timeZone: 'UTC', locale: 'en-GB'
      };
      const data: TenantData = {
        ...tenantSeed,
        records: {
          ...tenantSeed.records,
          Connector_App__c: deps.ensureConnectorAppRecords(tenantSeed.records.Connector_App__c, admin.id),
          ...(!((process.env.METADRIVE_UNIFIED_CONNECTORS === 'true') &&
            process.env.METADRIVE_CREDENTIAL_KEYS && process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID)
            ? { UneConnector__c: tenantSeed.records.UneConnector__c?.length
                ? tenantSeed.records.UneConnector__c : deps.connectorRecords(deps.defaultConnectorSettings, admin.id) }
            : {})
        },
        accessControl: {
          ...tenantSeed.accessControl,
          users: [...tenantSeed.accessControl.users, developerAccess]
        }
      };
      verifySeededTenant(tenantId, admin, data, developer, grantTenantDeveloperPolicyToAdmin);
      const registryEntry: TenantRegistryEntry = {
        name: normalizedName, description: '', status: 'ACTIVE', createdAt, updatedAt: createdAt,
        provisioning: { status: 'READY', version: 1, completedAt: createdAt },
        developerSeed: { userId: developer.id, email: developer.email, seededAt: createdAt },
        ...(requestHash ? { provisioningRequestHash: requestHash } : {})
      };
      // Preserve provenance before opening a second tenant: a legacy unowned
      // component could only have been authored in the existing sole tenant.
      // Do this inside the same durable provisioning commit, never on a later
      // best-effort migration or by guessing ownership with multiple tenants.
      const previousTenantIds = Object.keys(deps.platformStore.state.tenants);
      const libraryComponents = previousTenantIds.length === 1
        ? deps.platformStore.state.libraryComponents.map((component) =>
          component.tenantId || component.trustedBundled
            ? component : { ...component, tenantId: previousTenantIds[0] })
        : deps.platformStore.state.libraryComponents;
      const nextState: PlatformState = {
        ...deps.platformStore.state,
        libraryComponents,
        tenants: { ...deps.platformStore.state.tenants, [tenantId]: data },
        tenantRegistry: { ...deps.platformStore.state.tenantRegistry, [tenantId]: registryEntry },
        tenantManagementAudit: [...deps.platformStore.state.tenantManagementAudit,
          { actorId, tenantId, action: 'CREATED' as const, at: createdAt, next: registryEntry }].slice(-5000),
        users: [...deps.platformStore.state.users, admin, developer]
      };
      provisioningPendingTenants.add(tenantId);
      try {
        // The persisted state contains registry, objects, permission sets and
        // login identity in ONE complete database snapshot/SQL transaction.
        deps.persistState(nextState);
        deps.platformStore.state = nextState;
        const commit = deps.platformStore.latestCommit;
        await commit;
      } catch (error) {
        // Never report success or allow the provisional administrator to log in.
        // Reconcile uncertain writes through the durable SQL state on restart.
        provisioningCommitFailed = true;
        console.error('CRITICAL: tenant provisioning persistence failed', error);
        throw new TenantProvisioningStoreError();
      }
      provisioningPendingTenants.delete(tenantId);
      console.info('Tenant provisioning committed', { tenantId, actorId });
      return { user: admin, created: true };
    } finally {
      release();
    }
  }
  return { createTenant, TenantProvisioningStoreError, provisioningPendingTenants,
    get provisioningCommitFailed() { return provisioningCommitFailed; },
    set provisioningCommitFailed(value: boolean) { provisioningCommitFailed = value; } };
}
