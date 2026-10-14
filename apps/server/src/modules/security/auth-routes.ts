import type { Request, Response } from 'express';
import type { phase3AuthContext, TenantData, LocalUser, PlatformState } from '../../index.js';
import type { RecoveryStage } from '../../recovery-flow.js';
import type { MfaEncryptedSecret } from '../../mfa.js';

export function registerAuthenticationRoutes(ctx: typeof phase3AuthContext): void {
  const {app,jwtService,tenantHostRouting,requestTenantMatches,refreshCookieName,webOrigins,tenantInfoForRecovery,activeFlowDefinition,durableLogouts,TenantProvisioningStoreError,createTenant,tenantIsActive,withSecurityEvent,tenantData,getPrincipal,principalUser,effectivePermissions,requirePermission,tenantForRequestHost,accessAuthentication,cookieValue,setRefreshCookie,clearRefreshCookie,issueRefreshSession,authenticatedLandingBootstrap,issueLoginResponse,mfaLoginChallenges,mfaEnrollments,mfaFailures,mfaChallengeTtlMs,mfaRequiredForUser,sealMfaSecret,openMfaSecret,mfaCredentialReady,newMfaToken,mfaRateLimited,recordMfaFailure,revokeUserRefreshSessions,loginAttempts,userLoginFailures,recordUserLoginFailure,loginSchema,provisioningSchema,provisioningIdempotencyKey,persistState,persistTenantRecords,developerActivationPending,hashPassword,verifyPassword,hashToken,randomBytes,timingSafeEqual,performance,newTotpSecret,totpUri,verifyTotp,normalizeRecoveryPolicy,renderRecoveryTemplate,deliverWithFallback,RECOVERY_FLOW_API,recoveryFlowActions,persistAuthLogoutRevocation,persistenceMode,z} = ctx;
app.get('/api/auth/config', (_req, res) => res.json({
  mode: jwtService.config.mode,
  issuer: jwtService.config.issuer,
  audience: jwtService.config.audience,
  tenantLoginRequired: false,
  tenantResolvedFromEmail: true,
  tenantHostBindingEnabled: tenantHostRouting.enabled
}));

app.post('/api/auth/provision-tenant', async (req: Request, res: Response) => {
  const expected = process.env.METADRIVE_PROVISIONING_KEY;
  const provided = req.header('x-provisioning-key');
  if (!expected) return res.status(503).json({ error: 'Tenant provisioning is disabled until METADRIVE_PROVISIONING_KEY is configured' });
  if (!provided || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid provisioning credential' });
  }
  const parsed = provisioningSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant provisioning request', details: parsed.error.flatten() });
  try {
    const key = provisioningIdempotencyKey(req);
    const { user, created } = await createTenant(parsed.data.tenantId, parsed.data.tenantName,
      parsed.data.adminName, parsed.data.email, parsed.data.password, 'provisioning-key', key,
      parsed.data.developerDomain);
    return res.status(created ? 201 : 200).json({
      tenantId: user.tenantId, administrator: { id: user.id, email: user.email }, replayed: !created
    });
  } catch (error) {
    return res.status(error instanceof TenantProvisioningStoreError ? 503
      : error instanceof Error && error.message.startsWith('Idempotency-Key') ? 400 : 409)
      .json({ error: error instanceof Error ? error.message : 'Unable to create tenant' });
  }
});


const passwordRecoverySettingsSchema = z.object({
  smtpCredentialId: z.union([z.literal(''), z.string().uuid()]),
  fromEmail: z.union([z.literal(''), z.string().email()]),
  policy: z.object({
    method: z.enum(['OTP','LINK']),
    defaultChannel: z.enum(['email','sms','whatsapp']).default('email'),
    allowedChannels: z.array(z.enum(['email','sms','whatsapp'])).default(['email']),
    templates: z.record(z.object({subject:z.string().max(240),body:z.string().max(4000)})).optional()
  }).optional()
}).strict();
const passwordResetRequestSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
const passwordResetConfirmSchema = z.object({
  email: z.string().trim().email().max(254),
  token: z.string().regex(/^(?:[A-Za-z0-9_-]{64}|[0-9]{6})$/),
  newPassword: z.string().min(12).max(256)
}).strict();
const passwordResetRate = new Map<string, { count: number; until: number }>();
function resetAllowed(key: string, max = 3): boolean {
  const now = Date.now();
  if (passwordResetRate.size > 4096) {
    for (const [id, value] of passwordResetRate) if (value.until < now) passwordResetRate.delete(id);
    if (passwordResetRate.size > 4096) passwordResetRate.delete(passwordResetRate.keys().next().value!);
  }
  const previous = passwordResetRate.get(key);
  if (previous && previous.until > now && previous.count >= max) return false;
  passwordResetRate.set(key, {
    count: previous && previous.until > now ? previous.count + 1 : 1,
    until: now + 15 * 60_000
  });
  return true;
}
function configuredRecoveryUrl(): URL | null {
  const raw = process.env.METADRIVE_PASSWORD_RESET_BASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isLocalTest = process.env.NODE_ENV !== 'production'
      && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !isLocalTest) || url.username || url.password
      || url.search || url.hash || url.pathname !== '/' || !webOrigins.has(url.origin)) return null;
    return url;
  } catch { return null; }
}
app.get('/api/auth/password-recovery/settings', accessAuthentication,
  requirePermission('security:manage'), (_req: Request, res: Response) => {
    const tenant = tenantData(getPrincipal(res).tenantId)!;
    return res.json({ ...tenant.passwordRecovery, policy: normalizeRecoveryPolicy(tenant.passwordRecovery.policy), linkReady: Boolean(configuredRecoveryUrl()) });
  });
app.put('/api/auth/password-recovery/settings', accessAuthentication,
  requirePermission('security:manage'), (req: Request, res: Response) => {
    const parsed = passwordRecoverySettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid password-recovery settings' });
    const principal = getPrincipal(res);
    const tenant = tenantData(principal.tenantId)!;
    if (parsed.data.smtpCredentialId) {
      const credential = tenant.namedCredentials.find((item) =>
        item.id === parsed.data.smtpCredentialId && item.protocol === 'SMTP' && item.enabled !== false);
      if (!credential || !parsed.data.fromEmail)
        return res.status(400).json({ error: 'Choose an enabled SMTP Named Credential and valid sender email' });
      if (!configuredRecoveryUrl())
        return res.status(503).json({ error: 'Trusted password-reset web URL is not configured' });
    } else if (parsed.data.fromEmail) {
      return res.status(400).json({ error: 'Sender email requires an SMTP credential' });
    }
    persistTenantRecords(principal.tenantId, withSecurityEvent(
      { ...tenant, passwordRecovery: { ...parsed.data, policy: normalizeRecoveryPolicy(parsed.data.policy) } }, principal.userId,
      'auth.password-recovery.settings.updated'
    ));
    return res.json(parsed.data);
  });
function protectedRecoveryStage(tenant: TenantData, stage: RecoveryStage) {
  const flow = tenant.flows.find((item) => item.apiName === RECOVERY_FLOW_API);
  // The protected default is available to older tenants even before migration.
  const published = flow ? activeFlowDefinition(flow) : undefined;
  if (flow && !published) throw new Error('Protected recovery flow must remain published.');
  return recoveryFlowActions(published ?? defaultRecoveryFlowDefinition(), stage);
}
app.post('/api/auth/password-reset/request', async (req: Request, res: Response) => {
  const response = { message: 'If this account supports recovery, a verification message will be sent.' };
  if (jwtService.config.mode !== 'local') return res.status(202).json(response);
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email' });
  const email = parsed.data.email.toLowerCase();
  const ip = req.ip ?? 'unknown';
  if (!resetAllowed('ip:' + ip, 12) || !resetAllowed('email:' + hashToken(email)))
    return res.status(202).json(response);
  const user = ctx.state.users.find((item) => item.email.trim().toLowerCase() === email);
  const tenant = user && tenantData(user.tenantId);
  const url = configuredRecoveryUrl();
  if (!user || user.disabled || !tenant || !url) return res.status(202).json(response);
  const { smtpCredentialId, fromEmail } = tenant.passwordRecovery;
  const policy = normalizeRecoveryPolicy(tenant.passwordRecovery.policy);
  let flowActions: ReturnType<typeof protectedRecoveryStage>;
  try { flowActions = protectedRecoveryStage(tenant, 'request'); }
  catch { console.warn('Protected recovery Flow is invalid'); return res.status(202).json(response); }
  const generateConfig = flowActions[0].config;
  const sendConfig = flowActions[1].config;
  if (generateConfig.method === 'OTP' || generateConfig.method === 'LINK') policy.method = generateConfig.method;
  if (sendConfig.channel !== 'email') return res.status(202).json(response);
  // A reset channel is available only when its contact is independently verified.
  // Email is supported now; SMS and WhatsApp must not use unverified numbers.
  if (policy.defaultChannel !== 'email') return res.status(202).json(response);
  const token = policy.method === 'OTP'
    ? String(randomInt(0, 1_000_000)).padStart(6, '0')
    : randomBytes(48).toString('base64url');
  const tokenSalt = randomBytes(16).toString('hex');
  const verifier = policy.method === 'OTP'
    ? tokenSalt + ':' + scryptSync(token, tokenSalt, 32).toString('hex')
    : hashToken(token);
  const resetUrl = new URL(url.toString());
  if (policy.method === 'LINK') {
    resetUrl.searchParams.set('resetEmail', email);
    resetUrl.searchParams.set('resetToken', token);
  }
  const template = policy.templates.email;
  // The tenant's published recovery Flow can override the inherited email template.
  if (sendConfig.templateSource === 'FLOW') {
    if (typeof sendConfig.subject === 'string' && sendConfig.subject.length <= 240) template.subject = sendConfig.subject;
    if (typeof sendConfig.body === 'string' && sendConfig.body.length <= 4000) template.body = sendConfig.body;
  }
  const variables = {
    'Tenant.Id': user.tenantId, 'Tenant.Name': tenantInfoForRecovery(tenant, user.tenantId),
    'User.Email': email, 'Verification.Value': policy.method === 'OTP' ? token : resetUrl.toString(),
    'Verification.Method': policy.method, 'Verification.ExpiryMinutes': '15'
  };
  const subject = renderRecoveryTemplate(template.subject, variables);
  const body = renderRecoveryTemplate(template.body, variables);
  const senders: Array<{ provider: 'tenant'|'platform'|'http'; send:()=>Promise<void> }> = [];
  if (smtpCredentialId && fromEmail && tenant.namedCredentials.some((item) =>
    item.id === smtpCredentialId && item.protocol === 'SMTP' && item.enabled !== false)) {
    senders.push({ provider: 'tenant', send: () =>
      sendTenantEmail(user.tenantId, tenant, smtpCredentialId, fromEmail, [email], subject, body) });
  }
  // The fallback credential is owned by a platform tenant, never copied into customer records.
  const platformTenantId = process.env.METADRIVE_RECOVERY_PLATFORM_TENANT_ID;
  const platformCredentialId = process.env.METADRIVE_RECOVERY_PLATFORM_SMTP_CREDENTIAL_ID;
  const platformFrom = process.env.METADRIVE_RECOVERY_PLATFORM_FROM_EMAIL;
  const platformTenant = platformTenantId ? tenantData(platformTenantId) : undefined;
  if (platformTenantId && platformTenant && platformCredentialId && platformFrom
    && platformTenant.namedCredentials.some((item) => item.id === platformCredentialId
      && item.protocol === 'SMTP' && item.enabled !== false)) {
    senders.push({ provider: 'platform', send: () =>
      sendTenantEmail(platformTenantId, platformTenant, platformCredentialId, platformFrom, [email], subject, body) });
  }
  if (!senders.length) return res.status(202).json(response);
  try {
    await deliverWithFallback(senders, (provider) => console.warn('Password recovery delivery failed via '+provider));
    const current = ctx.state.users.find((item) => item.id === user.id && item.tenantId === user.tenantId);
    if (!current || current.disabled || !tenantData(user.tenantId)) return res.status(202).json(response);
    const nextState: PlatformState = {
      ...ctx.state,
      users: ctx.state.users.map((item) => item.id === user.id && item.tenantId === user.tenantId
        ? { ...item, passwordReset: { tokenHash: verifier, expiresAt: Date.now() + 15 * 60_000 } }
        : item),
      tenants: { ...ctx.state.tenants, [user.tenantId]: withSecurityEvent(
        ctx.state.tenants[user.tenantId], user.id, 'auth.password-reset.requested') }
    };
    persistState(nextState);
    ctx.state = nextState;
  } catch {
    // Generic outward result. Do not log tokens, URLs, recipients, or request bodies.
    console.warn('Password recovery delivery/persistence unavailable');
  }
  return res.status(202).json(response);
});
app.post('/api/auth/password-reset/confirm', async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(409).json({ error: 'Password reset is managed by the identity provider' });
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid password-reset request' });
  const email = parsed.data.email.toLowerCase();
  if (!resetAllowed('redeem:' + (req.ip ?? 'unknown') + ':' + hashToken(email), 8)
    || !resetAllowed('redeem-email:' + hashToken(email), 8))
    return res.status(429).json({ error: 'Too many reset attempts' });
  const user = ctx.state.users.find((item) => item.email.toLowerCase() === email);
  const request = user?.passwordReset;
  const [salt, digest] = request?.tokenHash.split(':') ?? [];
  const otpDigest = salt && digest && /^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{64}$/.test(digest)
    ? scryptSync(parsed.data.token, salt, 32) : null;
  const valid = Boolean(user && !user.disabled && tenantData(user.tenantId)
    && request && request.expiresAt > Date.now()
    && (otpDigest
      ? timingSafeEqual(Buffer.from(digest,'hex'), otpDigest)
      : parsed.data.token.length===64 && timingSafeEqual(Buffer.from(request.tokenHash), Buffer.from(hashToken(parsed.data.token)))));
  if (!valid || !user) return res.status(400).json({ error: 'Invalid or expired password-reset code or link' });
  // The tenant's published Flow cannot bypass verification or omit password/session revocation.
  protectedRecoveryStage(tenantData(user.tenantId)!, 'confirm');
  const hashed = await hashPassword(parsed.data.newPassword);
  const nextState: PlatformState = {
    ...ctx.state,
    users: ctx.state.users.map((item) => {
      if (item.id !== user.id || item.tenantId !== user.tenantId) return item;
      const updated: LocalUser = {
        ...item, passwordSalt: hashed.salt, passwordHash: hashed.hash,
        authVersion: (item.authVersion ?? 0) + 1
      };
      delete updated.passwordReset;
      delete updated.lockedUntil;
      return updated;
    }),
    refreshSessions: revokeUserRefreshSessions(user.id, user.tenantId),
    tenants: {
      ...ctx.state.tenants, [user.tenantId]: withSecurityEvent(
        ctx.state.tenants[user.tenantId], user.id, 'auth.password-reset.completed')
    }
  };
  try { persistState(nextState); ctx.state = nextState; }
  catch { return res.status(503).json({ error: 'Unable to complete password reset' }); }
  return res.json({ reset: true, signInRequired: true });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const loginStartedAt = performance.now();
  if (jwtService.config.mode !== 'local') return res.status(501).json({ error: 'Password login is disabled in external OIDC mode' });
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid login request', details: parsed.error.flatten() });
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const limit = loginAttempts.get(key);
  if (limit && limit.resetAt > now && limit.count >= 8) return res.status(429).json({ error: 'Too many login attempts; try again later' });
  const user = ctx.state.users.find((item) => item.email.trim().toLowerCase() === parsed.data.email.toLowerCase());
  const loginHostTenant = tenantForRequestHost(req);
  if (loginHostTenant && (loginHostTenant.status !== 'VERIFIED' || user?.tenantId !== loginHostTenant.tenantId))
    return res.status(401).json({ error: 'Invalid email or password' });
  const passwordStartedAt = performance.now();
  const valid = user && (!user.lockedUntil || user.lockedUntil <= now)
    ? await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash) : false;
  const passwordMs = performance.now() - passwordStartedAt;
  if (!user || user.disabled || !valid || developerActivationPending.has(user.id) || !tenantIsActive(user.tenantId)) {
    const attempts = limit && limit.resetAt > now ? limit.count + 1 : 1;
    loginAttempts.set(key, { count: attempts, resetAt: now + 15 * 60 * 1000 });
    if (user && !user.disabled && !valid && tenantIsActive(user.tenantId) && (!user.lockedUntil || user.lockedUntil <= now))
      recordUserLoginFailure(user);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  loginAttempts.delete(key);
  userLoginFailures.delete(user.id);
  const data = tenantData(user.tenantId);
  if (!data) return res.status(401).json({ error: 'Tenant is unavailable' });
  if (!requestTenantMatches(req, user.tenantId)) return res.status(403).json({ error: 'This account cannot access the requested tenant hostname.' });
  if (mfaRequiredForUser(data, user)) {
    if (mfaRateLimited(user.id)) return res.status(429).json({ error: 'Too many MFA attempts; try later' });
    if (!mfaCredentialReady()) return res.status(503).json({ error: 'MFA encryption is not configured' });
    const pendingSecret = user.mfaSecret ? undefined : newTotpSecret();
    const challengeToken = newMfaToken(mfaLoginChallenges, {
      tenantId: user.tenantId, userId: user.id, expiresAt: Date.now() + mfaChallengeTtlMs,
      attempts: 0, authVersion: user.authVersion ?? 0,
      ...(pendingSecret ? { pendingSecret } : {})
    });
    return res.status(202).json({
      mfa_required: true, challenge_token: challengeToken,
      enrollment_required: Boolean(pendingSecret),
      ...(pendingSecret ? { setup_secret: pendingSecret, setup_uri: totpUri(pendingSecret, user.email) } : {})
    });
  }
  return issueLoginResponse(res, user, data, undefined, { startedAt: loginStartedAt, passwordMs }, false, req.query.landing === '1');
});


app.post('/api/auth/mfa/verify', async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(501).json({ error: 'MFA login is managed by the identity provider' });
  const parsed = z.object({
    challenge_token: z.string().min(32).max(128),
    code: z.string().regex(/^\d{6}$/)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid MFA challenge request' });
  const key = hashToken(parsed.data.challenge_token);
  const challenge = mfaLoginChallenges.get(key);
  const mfaHostTenant = tenantForRequestHost(req);
  if (mfaHostTenant && (mfaHostTenant.status !== 'VERIFIED' || challenge?.tenantId !== mfaHostTenant.tenantId))
    return res.status(401).json({ error: 'MFA challenge is no longer valid' });
  if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
    mfaLoginChallenges.delete(key);
    return res.status(401).json({ error: 'MFA challenge expired; sign in again' });
  }
  const user = ctx.state.users.find((item) =>
    item.id === challenge.userId && item.tenantId === challenge.tenantId && !item.disabled);
  const tenant = tenantData(challenge.tenantId);
  if (!user || !tenant || challenge.authVersion !== (user.authVersion ?? 0) || !mfaRequiredForUser(tenant, user)
    || (Boolean(user.mfaSecret) === Boolean(challenge.pendingSecret))) {
    mfaLoginChallenges.delete(key);
    return res.status(401).json({ error: 'MFA challenge is no longer valid' });
  }
  if (mfaRateLimited(user.id)) return res.status(429).json({ error: 'Too many MFA attempts; try later' });
  challenge.attempts += 1;
  let secret: string;
  try {
    secret = challenge.pendingSecret ?? openMfaSecret(user.tenantId, user.id, user.mfaSecret!);
  } catch {
    mfaLoginChallenges.delete(key);
    return res.status(503).json({ error: 'MFA secret cannot be decrypted' });
  }
  const step = verifyTotp(secret, parsed.data.code, user.mfaLastUsedStep ?? -1);
  if (step === null) {
    recordMfaFailure(user.id);
    if (challenge.attempts >= 5) mfaLoginChallenges.delete(key);
    return res.status(401).json({ error: 'Invalid or already used authenticator code' });
  }
  mfaLoginChallenges.delete(key);
  mfaFailures.delete(user.id);
  let securedUser: LocalUser;
  try {
    securedUser = {
      ...user,
      ...(challenge.pendingSecret ? { mfaSecret: sealMfaSecret(user.tenantId, user.id, secret) } : {}),
      mfaLastUsedStep: step,
      mfaVersion: challenge.pendingSecret ? (user.mfaVersion ?? 0) + 1 : user.mfaVersion
    };
    const nextState = {
      ...ctx.state,
      users: ctx.state.users.map((item) => item.id === user.id ? securedUser : item)
    };
    persistState(nextState);
    ctx.state = nextState;
  } catch {
    return res.status(503).json({ error: 'Unable to persist MFA verification' });
  }
  return issueLoginResponse(res, securedUser, tenant, undefined, undefined, true, req.query.landing === '1');
});

app.get('/api/auth/mfa/status', accessAuthentication, (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const user = principalUser(principal)!;
  return res.json({ mode: tenant.mfaPolicy.mode, enrolled: Boolean(user.mfaSecret) });
});

app.get('/api/auth/mfa/policy', accessAuthentication, requirePermission('security:manage'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  return res.json(tenant.mfaPolicy);
});

app.put('/api/auth/mfa/policy', accessAuthentication, requirePermission('security:manage'), (req: Request, res: Response) => {
  const parsed = z.object({ mode: z.enum(['Off', 'Optional', 'Required']) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid MFA policy' });
  if (jwtService.config.mode !== 'local') return res.status(409).json({ error: 'Configure MFA through your external identity provider' });
  if (parsed.data.mode !== 'Off' && !mfaCredentialReady()) {
    return res.status(503).json({ error: 'Configure persistent MFA encryption keys before enabling MFA' });
  }
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.mfaPolicy.mode !== parsed.data.mode) {
    persistTenantRecords(principal.tenantId, withSecurityEvent(
      { ...tenant, mfaPolicy: parsed.data },
      principal.userId, 'auth.mfa.policy.updated',
      { from: tenant.mfaPolicy.mode, to: parsed.data.mode }
    ));
  }
  return res.json(parsed.data);
});

app.post('/api/auth/mfa/enroll', accessAuthentication, async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(409).json({ error: 'External identity provider manages MFA' });
  const parsed = z.object({ password: z.string().min(1).max(256) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Current password is required' });
  const principal = getPrincipal(res);
  const user = principalUser(principal)!;
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.mfaPolicy.mode === 'Off') return res.status(409).json({ error: 'Enable Optional MFA in tenant settings first' });
  if (user.mfaSecret) return res.status(409).json({ error: 'MFA is already enrolled' });
  if (!mfaCredentialReady()) return res.status(503).json({ error: 'MFA encryption is not configured' });
  if (!await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid current password' });
  }
  const secret = newTotpSecret();
  const enrollmentToken = newMfaToken(mfaEnrollments, {
    userId: user.id, tenantId: user.tenantId,
    secret, attempts: 0, expiresAt: Date.now() + mfaChallengeTtlMs, authVersion: user.authVersion ?? 0
  });
  return res.json({ enrollment_token: enrollmentToken, setup_secret: secret, setup_uri: totpUri(secret, user.email) });
});

app.post('/api/auth/mfa/enroll/confirm', accessAuthentication, (req: Request, res: Response) => {
  const parsed = z.object({ enrollment_token: z.string().min(32).max(128), code: z.string().regex(/^\d{6}$/) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid enrollment confirmation' });
  const principal = getPrincipal(res);
  const user = principalUser(principal)!;
  const tenant = tenantData(principal.tenantId)!;
  const key = hashToken(parsed.data.enrollment_token);
  const enrollment = mfaEnrollments.get(key);
  if (!enrollment || enrollment.userId !== user.id || enrollment.tenantId !== user.tenantId
    || enrollment.expiresAt <= Date.now() || enrollment.attempts >= 5
    || enrollment.authVersion !== (user.authVersion ?? 0) || user.mfaSecret || tenant.mfaPolicy.mode === 'Off') {
    mfaEnrollments.delete(key);
    return res.status(401).json({ error: 'Enrollment expired; start again' });
  }
  enrollment.attempts += 1;
  const step = verifyTotp(enrollment.secret, parsed.data.code);
  if (step === null) {
    if (enrollment.attempts >= 5) mfaEnrollments.delete(key);
    return res.status(401).json({ error: 'Invalid authenticator code' });
  }
  let encrypted: MfaEncryptedSecret;
  try { encrypted = sealMfaSecret(user.tenantId, user.id, enrollment.secret); }
  catch { return res.status(503).json({ error: 'MFA encryption is unavailable' }); }
  const nextState = {
    ...ctx.state,
    users: ctx.state.users.map((item) => item.id === user.id
      ? { ...item, mfaSecret: encrypted, mfaLastUsedStep: step, mfaVersion: (item.mfaVersion ?? 0) + 1 }
      : item),
    refreshSessions: revokeUserRefreshSessions(user.id, user.tenantId)
  };
  persistState(nextState);
  ctx.state = nextState;
  mfaEnrollments.delete(key);
  return res.json({ enrolled: true, reauthenticate: true });
});

app.post('/api/auth/mfa/disable', accessAuthentication, async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(409).json({ error: 'External identity provider manages MFA' });
  const parsed = z.object({ password: z.string().min(1).max(256), code: z.string().regex(/^\d{6}$/) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password and authenticator code are required' });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.mfaPolicy.mode === 'Required') return res.status(409).json({ error: 'Tenant policy requires MFA' });
  const user = principalUser(principal)!;
  if (!user.mfaSecret) return res.status(409).json({ error: 'MFA is not enrolled' });
  if (mfaRateLimited(user.id)) return res.status(429).json({ error: 'Too many MFA attempts; try later' });
  const valid = await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash);
  let step: number | null = null;
  try {
    if (valid) step = verifyTotp(openMfaSecret(user.tenantId, user.id, user.mfaSecret), parsed.data.code, user.mfaLastUsedStep ?? -1);
  } catch { return res.status(503).json({ error: 'MFA secret cannot be decrypted' }); }
  if (step === null) {
    recordMfaFailure(user.id);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const nextState = {
    ...ctx.state,
    users: ctx.state.users.map((item) => {
      if (item.id !== user.id) return item;
      const updated = { ...item };
      delete updated.mfaSecret;
      delete updated.mfaLastUsedStep;
      updated.mfaVersion = (item.mfaVersion ?? 0) + 1;
      return updated;
    }),
    refreshSessions: revokeUserRefreshSessions(user.id, user.tenantId)
  };
  persistState(nextState);
  ctx.state = nextState;
  mfaFailures.delete(user.id);
  return res.json({ enrolled: false, reauthenticate: true });
});

app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(501).json({ error: 'Refresh tokens are managed by the external identity provider' });
  const rawToken = cookieValue(req, refreshCookieName);
  if (!rawToken) return res.status(401).json({ error: 'Refresh token required' });
  const tokenHash = hashToken(rawToken);
  const session = ctx.state.refreshSessions.find((item) => item.tokenHash === tokenHash);
  const refreshHostTenant = tenantForRequestHost(req);
  if (refreshHostTenant && (refreshHostTenant.status !== 'VERIFIED' || session?.tenantId !== refreshHostTenant.tenantId)) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token belongs to a different tenant domain' });
  }
  if (!session) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token is invalid or expired' });
  }
  if (!requestTenantMatches(req, session.tenantId)) return res.status(403).json({ error: 'This session cannot access the requested tenant hostname.' });
  if (session.usedAt !== null || session.revokedAt !== null) {
    // Grace window: the frontend fires ~13 parallel metadata requests on load and
    // multiple tabs may refresh concurrently. The first refresh rotates the cookie,
    // but in-flight siblings still carry the just-used token. Treat reuse within a
    // few seconds as a race (not theft): re-issue from the family's latest live
    // session instead of revoking the whole family.
    const now = Date.now() / 1000;
    const graceSeconds = 15;
    if (session.usedAt !== null && now - session.usedAt < graceSeconds) {
      const latest = ctx.state.refreshSessions
        .filter((item) => item.familyId === session.familyId && item.revokedAt === null && item.usedAt === null && item.expiresAt > now)
        .sort((a, b) => b.expiresAt - a.expiresAt)[0];
      const user = ctx.state.users.find((item) => item.id === session.userId && item.tenantId === session.tenantId && !item.disabled);
      const data = tenantData(session.tenantId);
      if (latest && user && data && (!user.lockedUntil || user.lockedUntil <= Date.now()) && tenantIsActive(session.tenantId)
        && (latest.authVersion ?? 0) === (user.authVersion ?? 0)
        && (!mfaRequiredForUser(data, user) || latest.mfaVerified)) {
        // The old cookie has already been consumed by another tab. Return a
        // fresh cookie as well as an access token, or the next page load will
        // reuse the stale cookie and lose the authenticated session.
        const replacement = issueRefreshSession(user, session.familyId, latest.mfaVerified === true);
        const nextState = {
          ...ctx.state,
          refreshSessions: [...ctx.state.refreshSessions, replacement.session]
        };
        persistState(nextState);
        ctx.state = nextState;
        setRefreshCookie(res, replacement.token);
        const permissions = effectivePermissions(user, data);
        const issued = await jwtService.issue({ userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions, mfaVerified: latest.mfaVerified === true, mfaVersion: user.mfaVersion ?? 0,
          authVersion: user.authVersion ?? 0 });
        return res.json({
          access_token: issued.accessToken, token_type: 'Bearer',
          expires_in: jwtService.config.accessTokenTtlSeconds, expires_at: issued.expiresAt,
          user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions },
    ...(req.query.landing === '1' ? { landing: authenticatedLandingBootstrap(user, data, permissions) } : {})
        });
      }
    }
    const revokedNow = Date.now() / 1000;
    const nextState = {
      ...ctx.state,
      refreshSessions: ctx.state.refreshSessions.map((item) => item.familyId === session.familyId ? { ...item, revokedAt: revokedNow } : item)
    };
    persistState(nextState);
    ctx.state = nextState;
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token reuse detected; token family revoked' });
  }
  if (session.expiresAt <= Date.now() / 1000) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token is expired' });
  }
  const user = ctx.state.users.find((item) => item.id === session.userId && item.tenantId === session.tenantId && !item.disabled);
  const data = tenantData(session.tenantId);
  if (!user || !data || !tenantIsActive(session.tenantId)) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Tenant membership is no longer active' });
  }
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Account temporarily locked' });
  }
  if ((session.authVersion ?? 0) !== (user.authVersion ?? 0)) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Authentication ctx.state has changed; sign in again' });
  }
  if (mfaRequiredForUser(data, user) && !session.mfaVerified) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'MFA verification is required' });
  }
  const now = Date.now() / 1000;
  const nextRefresh = issueRefreshSession(user, session.familyId, session.mfaVerified === true);
  const nextState = {
    ...ctx.state,
    refreshSessions: [...ctx.state.refreshSessions.map((item) => item.tokenHash === tokenHash ? { ...item, usedAt: now } : item), nextRefresh.session]
  };
  persistState(nextState);
  ctx.state = nextState;
  const permissions = effectivePermissions(user, data);
  const issued = await jwtService.issue({ userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions, mfaVerified: session.mfaVerified === true, mfaVersion: user.mfaVersion ?? 0,
    authVersion: user.authVersion ?? 0 });
  setRefreshCookie(res, nextRefresh.token);
  return res.json({
    access_token: issued.accessToken, token_type: 'Bearer',
    expires_in: jwtService.config.accessTokenTtlSeconds, expires_at: issued.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions },
    ...(req.query.landing === '1' ? { landing: authenticatedLandingBootstrap(user, data, permissions) } : {})
  });
});

app.post('/api/auth/logout', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const token = bearerToken(req)!;
  void jwtService.verify(token).then((claims) => {
    const revokedAt = Date.now() / 1000;
    const revokedAccessTokens = { ...ctx.state.revokedAccessTokens };
    if (claims.jti && claims.exp) revokedAccessTokens[claims.jti] = claims.exp;
    const refreshToken = cookieValue(req, refreshCookieName);
    const refreshHash = refreshToken ? hashToken(refreshToken) : '';
    const matchingRefresh = ctx.state.refreshSessions.find((session) =>
      session.tokenHash === refreshHash && session.userId === principal.userId && session.tenantId === principal.tenantId);
    const refreshSessions = ctx.state.refreshSessions.map((session) =>
      session === matchingRefresh ? { ...session, revokedAt } : session
    );
    const nextState = { ...ctx.state, revokedAccessTokens, refreshSessions };
    if (persistenceMode === 'typed') {
      // One SQL INSERT, acknowledged only after commit. The restart overlay
      // prevents a stale platform snapshot from resurrecting the session.
      const previousCommit = ctx.latestStateCommit;
      const revocation = {
        jti: String(claims.jti), tenantId: principal.tenantId, userId: principal.userId,
        refreshHash: matchingRefresh?.tokenHash ?? null,
        accessExpiresAt: Number(claims.exp),
        refreshExpiresAt: matchingRefresh?.expiresAt ?? null, revokedAt
      };
      const durableRevocation = persistAuthLogoutRevocation(revocation).then(() => {
        durableLogouts.push(revocation);
        ctx.authOverlayRevision++;
      });
      ctx.latestStateCommit = Promise.all([previousCommit, durableRevocation]);
      void ctx.latestStateCommit.catch((error: unknown) => {
        console.error('CRITICAL: Durable logout revocation failed', error);
      });
    } else {
      persistState(nextState);
    }
    ctx.state = nextState;
    clearRefreshCookie(res);
    return res.status(204).end();
  }).catch(() => res.status(401).json({ error: 'Access token is invalid or expired' }));
});


registerSessionSecurityRoutes({ app, accessAuthentication, requirePermission, getPrincipal, principalUser,
  tenantData, jwtService, getState: () => ctx.state, setState: (next) => { ctx.state = next; },
  persistState, revokeUserRefreshSessions, withSecurityEvent, effectivePermissions,
  clearRefreshCookie, userLoginFailures });


}
