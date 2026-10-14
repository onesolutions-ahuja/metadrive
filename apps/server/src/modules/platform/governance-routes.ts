import type { Request, Response, NextFunction } from 'express';
import type { platformGovernanceContext, PlatformState, LocalUser, TenantRegistryEntry, TenantManagementAuditEvent, TenantDomainRecord } from '../../index.js';

export function registerPlatformGovernanceRoutes(ctx: typeof platformGovernanceContext) {
  const { app, jwtService, webOrigins, persistState, provisioningPendingTenants, TenantProvisioningStoreError, createTenant, tenantIsActive, withSecurityEvent, tenantData, getPrincipal, principalUser, requirePermission, accessAuthentication, provisioningSchema, provisioningIdempotencyKey, developerActivationPending, z, timingSafeEqual, tenantUsageSnapshot, normalizeTenantDomain, domainChallenge, reservedDomain, randomBytes, resolveTxt, hashPassword, routeParam } = ctx;
// MD-01A: separate, audited platform policies. All lookups use the current in-memory
// platform ctx.state; no additional database read is introduced on guarded requests.
const platformPolicySchema = z.object({
  policies: z.array(z.enum(['platform:superadmin', 'licence:manage'])).max(2)
}).strict();
function activePlatformSuperadmins(): string[] {
  return ctx.state.users.filter((user) => !user.disabled
    && (ctx.state.platformPolicies[user.id] ?? []).includes('platform:superadmin')).map((user) => user.id);
}
function savePlatformPolicies(actorId: string, userId: string, policies: Array<'platform:superadmin' | 'licence:manage'>) {
  const previous = ctx.state.platformPolicies[userId] ?? [];
  const next = [...new Set(policies)];
  const nextState: PlatformState = {
    ...ctx.state,
    platformPolicies: { ...ctx.state.platformPolicies, [userId]: next },
    platformPolicyAudit: [...ctx.state.platformPolicyAudit, {
      actorId, userId, previous, next, at: new Date().toISOString()
    }].slice(-2000)
  };
  persistState(nextState);
  ctx.state = nextState;
}
// A tightly controlled one-time bootstrap is required for the first platform
// operator. It cannot be initiated merely with tenant security:manage.
app.post('/api/platform/policies/bootstrap', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const configuredEmail = process.env.METADRIVE_PLATFORM_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const secret = process.env.METADRIVE_PLATFORM_BOOTSTRAP_KEY;
  if (!configuredEmail || !secret || secret.length < 24)
    return res.status(503).json({ error: 'Platform policy bootstrap is not configured.' });
  const user = principalUser(principal);
  if (!user || user.email.trim().toLowerCase() !== configuredEmail)
    return res.status(403).json({ error: 'Platform policy bootstrap is not permitted for this user.' });
  const supplied = req.header('x-platform-bootstrap-key');
  if (!supplied || supplied.length !== secret.length
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)))
    return res.status(403).json({ error: 'Invalid platform policy bootstrap credential.' });
  if (activePlatformSuperadmins().length)
    return res.status(409).json({ error: 'A platform administrator already exists.' });
  try {
    savePlatformPolicies(user.id, user.id, ['platform:superadmin']);
    return res.json({ policies: ctx.state.platformPolicies[user.id] });
  } catch {
    return res.status(503).json({ error: 'Unable to persist platform policy.' });
  }
});
app.get('/api/platform/policies', accessAuthentication, (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  if (!principal.permissions.includes('platform:superadmin'))
    return res.status(403).json({ error: 'Platform administrator policy required.' });
  return res.json({ users: ctx.state.users.filter((user) => (ctx.state.platformPolicies[user.id] ?? []).length)
    .map((user) => ({ id: user.id, email: user.email, disabled: user.disabled, policies: ctx.state.platformPolicies[user.id] })) });
});
app.put('/api/platform/policies/:userId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  if (!principal.permissions.includes('platform:superadmin'))
    return res.status(403).json({ error: 'Platform administrator policy required.' });
  const parsed = platformPolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid platform policies.' });
  const userId = routeParam(req, 'userId');
  const target = ctx.state.users.find((user) => user.id === userId && !user.disabled);
  if (!target) return res.status(404).json({ error: 'Active platform user not found.' });
  const requested = [...new Set(parsed.data.policies)];
  if ((ctx.state.platformPolicies[userId] ?? []).includes('platform:superadmin')
    && !requested.includes('platform:superadmin')
    && activePlatformSuperadmins().every((id) => id === userId)) {
    return res.status(409).json({ error: 'The last active platform administrator cannot be removed.' });
  }
  try {
    savePlatformPolicies(principal.userId, userId, requested);
    return res.json({ userId, policies: requested });
  } catch {
    return res.status(503).json({ error: 'Unable to persist platform policies.' });
  }
});

// MD-03.1: platform-only tenant directory and lifecycle. Tenant-editable
// profiles/permission sets never confer this policy; no impersonation or secrets.
const tenantManagementCreateSchema = provisioningSchema.strict();
const tenantManagementUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional()
}).strict().refine((value) => Object.keys(value).length > 0);
function tenantRegistryEntry(tenantId: string): TenantRegistryEntry {
  const saved = ctx.state.tenantRegistry[tenantId];
  if (saved) return saved;
  // Older tenants pre-date the registry: display them without changing their data.
  const earliest = ctx.state.users.filter((user) => user.tenantId === tenantId)
    .map((user) => user.createdAt).sort()[0] ?? new Date(0).toISOString();
  return { name: tenantId, description: '', status: 'ACTIVE', createdAt: earliest, updatedAt: earliest };
}
function tenantSummary(tenantId: string) {
  const entry = tenantRegistryEntry(tenantId);
  const users = ctx.state.users.filter((user) => user.tenantId === tenantId);
  return {
    tenantId, name: entry.name, description: entry.description, status: entry.status,
    archivedAt: entry.archivedAt ?? null, retentionUntil: entry.retentionUntil ?? null, legalHold: entry.legalHold ?? false,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    domains: (entry.domains ?? []).filter((domain) => domain.status !== 'REVOKED'),
    // Provisioning request fingerprints remain server-side, never exposed in API responses.
    provisioning: entry.provisioning ?? { status: 'READY' as const, version: 0, completedAt: entry.createdAt },
    developerAccount: entry.developerSeed ? {
      email: entry.developerSeed.email,
      activated: Boolean(entry.developerSeed.activatedAt)
    } : null,
    userCount: users.length,
    activeUserCount: users.filter((user) => !user.disabled).length
  };
}
function requirePlatformTenantAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (!getPrincipal(res).permissions.includes('platform:superadmin')) {
    res.status(403).json({ error: 'Platform administrator policy required.' });
    return;
  }
  next();
}
function commitTenantChange(actorId: string, tenantId: string,
  action: TenantManagementAuditEvent['action'], next: TenantRegistryEntry,
  previous?: TenantRegistryEntry) {
  const nextState: PlatformState = {
    ...ctx.state,
    tenantRegistry: { ...ctx.state.tenantRegistry, [tenantId]: next },
    tenantManagementAudit: [...ctx.state.tenantManagementAudit,
      { actorId, tenantId, action, at: new Date().toISOString(), ...(previous ? { previous } : {}), next }
    ].slice(-5000),
    ...(['SUSPENDED', 'ARCHIVED'].includes(action) ? {
      // Access JWTs are stateless; advance every tenant user's revocation epoch
      // so pre-suspension bearer tokens cannot revive after reactivation.
      users: ctx.state.users.map((user) => user.tenantId === tenantId
        ? { ...user, authRevokedBefore: Math.max(user.authRevokedBefore ?? 0, Math.floor(Date.now() / 1000)) }
        : user),
      refreshSessions: ctx.state.refreshSessions.map((session) =>
        session.tenantId === tenantId ? { ...session, revokedAt: Date.now() / 1000 } : session)
    } : {})
  };
  persistState(nextState);
  ctx.state = nextState;
}
// MD-03.8: on-demand usage only for the selected tenant. Counts are
// informational; targets cannot silently disable users or tenant workflows.
const tenantUsageTargetSchema = z.object({
  users: z.number().int().min(1).max(1000000000).nullable().optional(),
  records: z.number().int().min(1).max(1000000000).nullable().optional(),
  objects: z.number().int().min(1).max(1000000000).nullable().optional(),
  flows: z.number().int().min(1).max(1000000000).nullable().optional()
}).strict();
function tenantUsageFor(tenantId: string) {
  return tenantUsageSnapshot({
    tenantId, tenant: ctx.state.tenants[tenantId],
    users: ctx.state.users, registry: tenantRegistryEntry(tenantId)
  });
}
app.get('/api/tenant/usage', accessAuthentication, requirePermission('security:read'),
  (_req: Request, res: Response) => {
    const tenantId = getPrincipal(res).tenantId;
    if (!tenantData(tenantId)) return res.status(404).json({ error: 'Tenant unavailable' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ usage: tenantUsageFor(tenantId) });
  });
app.get('/api/platform/tenants/:tenantId/usage', accessAuthentication, requirePlatformTenantAdmin,
  (req: Request, res: Response) => {
    const tenantId = routeParam(req, 'tenantId');
    if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    if (provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ usage: tenantUsageFor(tenantId) });
  });
app.patch('/api/platform/tenants/:tenantId/usage-targets', accessAuthentication, requirePlatformTenantAdmin,
  (req: Request, res: Response) => {
    const tenantId = routeParam(req, 'tenantId');
    if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    if (provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
    const parsed = tenantUsageTargetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid advisory target settings', details: parsed.error.flatten() });
    const previous = tenantRegistryEntry(tenantId);
    const usageTargets = Object.fromEntries(
      Object.entries(parsed.data).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    );
    const next: TenantRegistryEntry = { ...previous, usageTargets,
      updatedAt: new Date().toISOString() };
    commitTenantChange(getPrincipal(res).userId, tenantId, 'USAGE_TARGETS_UPDATED', next, previous);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ usage: tenantUsageFor(tenantId) });
  });
app.get('/api/platform/tenants', accessAuthentication, requirePlatformTenantAdmin, (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0,120);
  const status = String(req.query.status ?? 'ALL');
  if (!['ALL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) return res.status(400).json({ error: 'Invalid tenant status filter' });
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 25);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    return res.status(400).json({ error: 'Invalid pagination parameters' });
  // Filter/sort cheap registry metadata first; count users only for one page.
  // This avoids scanning the entire identity store once per tenant.
  const matchedIds = Object.keys(ctx.state.tenants)
    .filter((tenantId) => !provisioningPendingTenants.has(tenantId))
    .filter((tenantId) => {
      const metadata = ctx.state.tenantRegistry[tenantId];
      const name = metadata?.name ?? tenantId;
      const tenantStatus = metadata?.status ?? 'ACTIVE';
      return (status === 'ALL' || tenantStatus === status)
        && (!query || (tenantId + ' ' + name).toLowerCase().includes(query));
    })
    .sort((a, b) => (ctx.state.tenantRegistry[a]?.name ?? a).localeCompare(ctx.state.tenantRegistry[b]?.name ?? b)
      || a.localeCompare(b));
  const offset = (page - 1) * pageSize;
  return res.json({ tenants: matchedIds.slice(offset, offset + pageSize).map(tenantSummary),
    total: matchedIds.length, page, pageSize });
});
app.post('/api/platform/tenants', accessAuthentication, requirePlatformTenantAdmin, async (req: Request, res: Response) => {
  const parsed = tenantManagementCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant creation request', details: parsed.error.flatten() });
  try {
    const key = provisioningIdempotencyKey(req);
    const { user, created } = await createTenant(parsed.data.tenantId, parsed.data.tenantName,
      parsed.data.adminName, parsed.data.email, parsed.data.password, getPrincipal(res).userId, key,
      parsed.data.developerDomain);
    return res.status(created ? 201 : 200).json({ tenant: tenantSummary(user.tenantId), replayed: !created });
  } catch (error) {
    return res.status(error instanceof TenantProvisioningStoreError ? 503
      : error instanceof Error && error.message.startsWith('Idempotency-Key') ? 400 : 409)
      .json({ error: error instanceof Error ? error.message : 'Unable to create tenant' });
  }
});
// MD-03.3: activation belongs to the tenant's security administrators only.
// A platform superadmin cannot activate an account in another tenant through
// the platform directory, nor obtain its password or silently impersonate it.
const activateDeveloperSchema = z.object({
  password: z.string().min(12).max(256)
}).strict();
app.get('/api/tenant/developer-account', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  if (!principal.permissions.includes('security:manage') || !hasObjectPermission(principal, tenant, 'User', 'read'))
    return res.status(403).json({ error: 'Tenant user administration permission required' });
  const seed = ctx.state.tenantRegistry[principal.tenantId]?.developerSeed;
  if (!seed) return res.json({ seeded: false });
  const user = ctx.state.users.find((item) => item.id === seed.userId && item.tenantId === principal.tenantId);
  return res.json({
    seeded: true, userId: seed.userId, email: user?.email ?? seed.email,
    active: Boolean(user && !user.disabled), activated: Boolean(seed.activatedAt),
    initialPermissions: 'System Administrator', tenantControlled: true
  });
});
app.post('/api/tenant/developer-account/activate', accessAuthentication, async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local')
    return res.status(501).json({ error: 'Developer credentials are managed by the identity provider' });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  if (!principal.permissions.includes('security:manage') || !hasObjectPermission(principal, tenant, 'User', 'edit'))
    return res.status(403).json({ error: 'Tenant user administration permission required' });
  const seed = ctx.state.tenantRegistry[principal.tenantId]?.developerSeed;
  if (!seed) return res.status(404).json({ error: 'No developer seeder exists for this tenant' });
  if (seed.activatedAt) return res.status(409).json({
    error: 'Developer was already activated. Manage its access through tenant User and RBAC settings.'
  });
  if (developerActivationPending.has(seed.userId)) return res.status(409).json({ error: 'Developer activation already in progress' });
  const parsed = activateDeveloperSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A new password of 12–256 characters is required' });
  developerActivationPending.add(seed.userId);
  try {
    const credentials = await hashPassword(parsed.data.password);
    const now = new Date().toISOString();
    const current = ctx.state.users.find((item) => item.id === seed.userId && item.tenantId === principal.tenantId);
    const currentSeed = ctx.state.tenantRegistry[principal.tenantId]?.developerSeed;
    if (!current || !currentSeed || currentSeed.activatedAt) return res.status(409).json({
      error: 'Developer identity changed during activation'
    });
    const changed: LocalUser = { ...current, disabled: false,
      passwordSalt: credentials.salt, passwordHash: credentials.hash,
      authVersion: (current.authVersion ?? 0) + 1,
      authRevokedBefore: Math.floor(Date.now() / 1000) };
    const nextState: PlatformState = {
      ...ctx.state,
      users: ctx.state.users.map((item) => item.id === changed.id ? changed : item),
      tenants: {
        ...ctx.state.tenants,
        [principal.tenantId]: withSecurityEvent(tenant, principal.userId,
          'tenant.developer.activated', { developerUserId: changed.id }, changed.id)
      },
      tenantRegistry: { ...ctx.state.tenantRegistry,
        [principal.tenantId]: {
          ...ctx.state.tenantRegistry[principal.tenantId],
          developerSeed: { ...currentSeed, email: changed.email, activatedAt: now }
        }
      },
      refreshSessions: ctx.state.refreshSessions.map((item) => item.userId === changed.id
        ? { ...item, revokedAt: Date.now() / 1000 } : item)
    };
    persistState(nextState);
    ctx.state = nextState;
    await ctx.latestStateCommit;
    return res.json({ activated: true, userId: changed.id, email: changed.email });
  } catch (error) {
    console.error('CRITICAL: developer activation commit failed', error);
    // Fail closed if durability cannot be established until ctx.state is reconciled.
    ctx.provisioningCommitFailed = true;
    return res.status(503).json({ error: 'Developer activation could not be durably committed' });
  } finally {
    // Keep the login path closed after a persistence failure.
    if (!ctx.provisioningCommitFailed) developerActivationPending.delete(seed.userId);
  }
});

app.get('/api/platform/tenants/:tenantId/provisioning', accessAuthentication, requirePlatformTenantAdmin,
  (req: Request, res: Response) => {
    const tenantId = routeParam(req, 'tenantId');
    const tenant = Object.hasOwn(ctx.state.tenants, tenantId) ? ctx.state.tenants[tenantId] : undefined;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (provisioningPendingTenants.has(tenantId))
      return res.status(202).json({ tenantId, status: 'PROVISIONING' });
    const registry = tenantRegistryEntry(tenantId);
    return res.json({
      tenantId,
      status: registry.provisioning?.status ?? 'READY',
      version: registry.provisioning?.version ?? 0,
      completedAt: registry.provisioning?.completedAt ?? registry.createdAt,
      initialized: {
        developerAccount: registry.developerSeed ? {
          email: registry.developerSeed.email, activated: Boolean(registry.developerSeed.activatedAt)
        } : null,
        objects: tenant.objects.length, profiles: tenant.accessControl.profiles.length,
        permissionSets: tenant.accessControl.permissionSets.length,
        initialAdministrator: tenant.accessControl.users.length > 0
      }
    });
  });
app.get('/api/platform/tenants/:tenantId', accessAuthentication, requirePlatformTenantAdmin, (req: Request, res: Response) => {
  const tenantId = routeParam(req, 'tenantId');
  if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
  if (provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
  return res.json({ tenant: tenantSummary(tenantId) });
});
app.patch('/api/platform/tenants/:tenantId', accessAuthentication, requirePlatformTenantAdmin, (req: Request, res: Response) => {
  const tenantId = routeParam(req, 'tenantId');
  if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
  if (provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
  const parsed = tenantManagementUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant update', details: parsed.error.flatten() });
  const previous = tenantRegistryEntry(tenantId);
  const next = { ...previous, ...parsed.data, updatedAt: new Date().toISOString() };
  commitTenantChange(getPrincipal(res).userId, tenantId, 'UPDATED', next, previous);
  return res.json({ tenant: tenantSummary(tenantId) });
});
// MD-03.5: domain ownership uses TXT DNS proofs. TLS/host attachment is
// configured at the edge; a verified domain is NOT an SSL certificate claim.
const addTenantDomainSchema = z.object({ hostname: z.string().min(4).max(253) }).strict();
const domainCheckInFlight = new Set<string>();
const domainCheckLastAttempt = new Map<string, number>();
ctx.domainCommitUncertain = false;
function domainContext(req: Request, res: Response, platform: boolean): string | undefined {
  const tenantId = platform ? routeParam(req, 'tenantId') : getPrincipal(res).tenantId;
  return Object.hasOwn(ctx.state.tenants, tenantId) && !provisioningPendingTenants.has(tenantId)
    ? tenantId : undefined;
}
function checkedDomain(hostname: string): string | null {
  try { return normalizeTenantDomain(hostname); } catch { return null; }
}
function domainResponse(record: TenantDomainRecord) {
  return { ...record, verification: domainChallenge(record.hostname, record.verificationToken),
    hosting: 'Attach this hostname to the HTTPS application service and complete provider TLS validation separately.' };
}
async function saveDomainChange(actorId: string, tenantId: string,
  action: TenantManagementAuditEvent['action'], updated: TenantRegistryEntry, previous: TenantRegistryEntry) {
  if (ctx.domainCommitUncertain) throw new Error('Previous domain persistence is uncertain; restart and reconcile');
  commitTenantChange(actorId, tenantId, action, updated, previous);
  const committed = ctx.latestStateCommit;
  try { await committed; } catch {
    ctx.domainCommitUncertain = true;
    throw new Error('Domain change persistence failed; restart and reconcile before further writes');
  }
}
function listTenantDomains(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  return res.json({ domains: (tenantRegistryEntry(tenantId).domains ?? [])
    .filter((item) => item.status !== 'REVOKED').map(domainResponse) });
}
async function addTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (ctx.domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const parsed = addTenantDomainSchema.safeParse(req.body);
  const hostname = parsed.success ? checkedDomain(parsed.data.hostname) : null;
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  if (reservedDomain(hostname, webOrigins))
    return res.status(409).json({ error: 'Platform-owned hostnames cannot be registered to tenants' });
  if (Object.values(ctx.state.tenantRegistry).some((entry) =>
    entry.domains?.some((domain) => domain.hostname === hostname && domain.status !== 'REVOKED')))
    return res.status(409).json({ error: 'Domain is already registered' });
  const previous = tenantRegistryEntry(tenantId);
  if ((previous.domains ?? []).filter((item) => item.status !== 'REVOKED').length >= 5)
    return res.status(409).json({ error: 'Maximum five active domains per tenant' });
  if ((previous.domains?.length ?? 0) >= 5000)
    return res.status(409).json({ error: 'Domain registration history requires archival' });
  const now = new Date().toISOString();
  const domain: TenantDomainRecord = {
    hostname, status: 'PENDING', verificationToken: randomBytes(32).toString('hex'), createdAt: now
  };
  const updated: TenantRegistryEntry = {
    ...previous, updatedAt: now,
    domains: [...(previous.domains ?? []).filter((item) => item.hostname !== hostname), domain]
  };
  try {
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_ADDED', updated, previous);
    return res.status(201).json({ domain: domainResponse(domain) });
  } catch { return res.status(503).json({ error: 'Unable to persist tenant domain' }); }
}
async function verifyTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (ctx.domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const hostname = checkedDomain(routeParam(req, 'hostname'));
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  const current = tenantRegistryEntry(tenantId).domains?.find((item) => item.hostname === hostname && item.status !== 'REVOKED');
  if (!current) return res.status(404).json({ error: 'Domain does not belong to this tenant' });
  if (current.status === 'VERIFIED') return res.json({ domain: domainResponse(current) });
  const lock = tenantId + ':' + hostname;
  const nowMs = Date.now();
  if (domainCheckInFlight.has(lock) || nowMs - (domainCheckLastAttempt.get(lock) ?? 0) < 30_000)
    return res.status(429).json({ error: 'DNS verification may be retried after 30 seconds' });
  domainCheckInFlight.add(lock);
  domainCheckLastAttempt.set(lock, nowMs);
  if (domainCheckLastAttempt.size > 1000)
    for (const [key, at] of domainCheckLastAttempt)
      if (nowMs - at > 60_000) domainCheckLastAttempt.delete(key);
  try {
    const proof = domainChallenge(hostname, current.verificationToken);
    let txt: string[][];
    try { txt = await resolveTxt(proof.host); }
    catch { return res.status(409).json({ error: 'DNS TXT record is not available yet', verification: proof }); }
    if (!matchesDomainChallenge(txt, proof.value))
      return res.status(409).json({ error: 'DNS TXT ownership proof does not match', verification: proof });
    // DNS await can interleave with a domain deletion/re-registration.
    const previous = tenantRegistryEntry(tenantId);
    const latest = previous.domains?.find((item) => item.hostname === hostname && item.status !== 'REVOKED');
    if (!latest || latest.verificationToken !== current.verificationToken)
      return res.status(409).json({ error: 'Domain registration changed while verifying; retry' });
    if (latest.status === 'VERIFIED') return res.json({ domain: domainResponse(latest) });
    const now = new Date().toISOString();
    const verified: TenantDomainRecord = { ...latest, status: 'VERIFIED', verifiedAt: now };
    const updated: TenantRegistryEntry = {
      ...previous, updatedAt: now,
      domains: previous.domains!.map((item) => item.hostname === hostname ? verified : item)
    };
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_VERIFIED', updated, previous);
    return res.json({ domain: domainResponse(verified) });
  } catch { return res.status(503).json({ error: 'Unable to persist domain verification' }); }
  finally { domainCheckInFlight.delete(lock); }
}
async function removeTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (ctx.domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const hostname = checkedDomain(routeParam(req, 'hostname'));
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  const previous = tenantRegistryEntry(tenantId);
  if (!previous.domains?.some((record) => record.hostname === hostname && record.status !== 'REVOKED'))
    return res.status(404).json({ error: 'Domain does not belong to this tenant' });
  const updated: TenantRegistryEntry = {
    ...previous, updatedAt: new Date().toISOString(),
    domains: previous.domains.map((item) => item.hostname === hostname
      ? { ...item, status: 'REVOKED' as const, revokedAt: new Date().toISOString() } : item)
  };
  try {
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_REMOVED', updated, previous);
    return res.json({ removed: true, hostname });
  } catch { return res.status(503).json({ error: 'Unable to remove tenant domain' }); }
}
app.get('/api/platform/tenants/:tenantId/domains', accessAuthentication, requirePlatformTenantAdmin,
  (req, res) => listTenantDomains(req, res, true));
app.post('/api/platform/tenants/:tenantId/domains', accessAuthentication, requirePlatformTenantAdmin,
  (req, res) => { void addTenantDomain(req, res, true); });
app.post('/api/platform/tenants/:tenantId/domains/:hostname/verify', accessAuthentication, requirePlatformTenantAdmin,
  (req, res) => { void verifyTenantDomain(req, res, true); });
app.delete('/api/platform/tenants/:tenantId/domains/:hostname', accessAuthentication, requirePlatformTenantAdmin,
  (req, res) => { void removeTenantDomain(req, res, true); });
// Tenants can manage only their own records with security:manage; platform
// superadmin policy never acts as tenant-admin impersonation.
app.get('/api/tenant/domains', accessAuthentication, requirePermission('security:manage'),
  (req, res) => listTenantDomains(req, res, false));
app.post('/api/tenant/domains', accessAuthentication, requirePermission('security:manage'),
  (req, res) => { void addTenantDomain(req, res, false); });
app.post('/api/tenant/domains/:hostname/verify', accessAuthentication, requirePermission('security:manage'),
  (req, res) => { void verifyTenantDomain(req, res, false); });
app.delete('/api/tenant/domains/:hostname', accessAuthentication, requirePermission('security:manage'),
  (req, res) => { void removeTenantDomain(req, res, false); });

app.post('/api/platform/tenants/:tenantId/:operation', accessAuthentication, requirePlatformTenantAdmin, (req: Request, res: Response) => {
  const tenantId = routeParam(req, 'tenantId');
  const operation = routeParam(req, 'operation');
  if (!['suspend', 'reactivate', 'archive', 'restore'].includes(operation))
    return res.status(404).json({ error: 'Unknown tenant operation' });
  if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
  if (provisioningPendingTenants.has(tenantId)) return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
  const previous = tenantRegistryEntry(tenantId);
  const desired = operation === 'archive' ? 'ARCHIVED' : operation === 'restore' ? 'SUSPENDED'
    : operation === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
  if (operation === 'archive' && previous.status !== 'SUSPENDED')
    return res.status(409).json({ error: 'Suspend the tenant before archiving' });
  if (operation === 'restore' && previous.status !== 'ARCHIVED')
    return res.status(409).json({ error: 'Only archived tenants can be restored' });
  if (operation === 'reactivate' && previous.status === 'ARCHIVED')
    return res.status(409).json({ error: 'Restore the archived tenant before reactivation' });
  if (previous.status === desired) return res.status(409).json({ error: 'Tenant is already ' + desired.toLowerCase() });
  if (desired === 'SUSPENDED' && operation === 'suspend') {
    const remaining = ctx.state.users.filter((user) => !user.disabled && user.tenantId !== tenantId
      && tenantIsActive(user.tenantId) && (ctx.state.platformPolicies[user.id] ?? []).includes('platform:superadmin'));
    if (remaining.length === 0) return res.status(409).json({
      error: 'Cannot suspend the tenant hosting the last active platform administrator.'
    });
  }
  const next: TenantRegistryEntry = { ...previous, status: desired,
    ...(operation === 'archive' ? { archivedAt: new Date().toISOString() } : {}),
    ...(operation === 'restore' ? { archivedAt: undefined } : {}),
    updatedAt: new Date().toISOString() };
  const action: TenantManagementAuditEvent['action'] = operation === 'archive' ? 'ARCHIVED'
    : operation === 'restore' ? 'RESTORED' : operation === 'suspend' ? 'SUSPENDED' : 'REACTIVATED';
  commitTenantChange(getPrincipal(res).userId, tenantId, action, next, previous);
  return res.json({ tenant: tenantSummary(tenantId) });
});

// MD-03.6: Retention controls are metadata only. No background or automatic purge.
// Retention and legal holds are auditable and platform-scoped, even for archived tenants.
const tenantRetentionSchema = z.object({
  retentionUntil: z.string().datetime().nullable(),
  legalHold: z.boolean()
}).strict();
app.patch('/api/platform/tenants/:tenantId/retention', accessAuthentication, requirePlatformTenantAdmin,
  (req: Request, res: Response) => {
    const tenantId = routeParam(req, 'tenantId');
    if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    if (provisioningPendingTenants.has(tenantId))
      return res.status(409).json({ error: 'Tenant provisioning is not yet ready' });
    const parsed = tenantRetentionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid retention policy' });
    if (parsed.data.retentionUntil && Date.parse(parsed.data.retentionUntil) <= Date.now())
      return res.status(400).json({ error: 'Retention deadline must be in the future' });
    const previous = tenantRegistryEntry(tenantId);
    const next: TenantRegistryEntry = { ...previous,
      ...(parsed.data.retentionUntil === null ? { retentionUntil: undefined } : { retentionUntil: parsed.data.retentionUntil }),
      legalHold: parsed.data.legalHold, updatedAt: new Date().toISOString() };
    commitTenantChange(getPrincipal(res).userId, tenantId, 'RETENTION_UPDATED', next, previous);
    return res.json({ tenant: tenantSummary(tenantId) });
  });
// No destructive endpoint: absence is intentional until an independently verified
// erasure ceremony and physical backup retention policy exist.

app.get('/api/platform/tenants/:tenantId/lifecycle-audit', accessAuthentication, requirePlatformTenantAdmin,
  (req: Request, res: Response) => {
    const tenantId = routeParam(req, 'tenantId');
    if (!Object.hasOwn(ctx.state.tenants, tenantId)) return res.status(404).json({ error: 'Tenant not found' });
    // Do not expose historical registry snapshots: they can contain domain ownership challenges.
    const events = ctx.state.tenantManagementAudit.filter((event) => event.tenantId === tenantId)
      .slice(-100).reverse().map(({ actorId, action, at }) => ({ actorId, action, at }));
    return res.json({ tenantId, events });
  });

// MD-03.7: An isolated platform-control database contains recovery cases and
// one-time factors. Never point it at the normal tenant application database.
// No runtime table migrations, startup grants, or privileged side doors.

  return { requirePlatformTenantAdmin };
}
