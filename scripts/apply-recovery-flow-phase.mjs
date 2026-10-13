import { readFileSync, writeFileSync } from 'node:fs';
const file = 'apps/server/src/index.ts';
let src = readFileSync(file, 'utf8');
function replace(from, to) {
 const count=src.split(from).length-1;
 if (count!==1) throw Error('Patch anchor mismatch ('+count+'): '+from.slice(0,100));
 src=src.replace(from,to);
}
replace("from './auth.js';", "from './auth.js';\nimport { normalizeRecoveryPolicy, renderRecoveryTemplate, deliverWithFallback } from './recovery-policy.js';");
replace('createHmac, createHash, randomBytes, randomUUID, timingSafeEqual', 'createHmac, createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual');
replace("passwordRecovery: { smtpCredentialId: string; fromEmail: string }", "passwordRecovery: { smtpCredentialId: string; fromEmail: string; policy?: unknown }");
replace("  fromEmail: z.union([z.literal(''), z.string().email()])\n}).strict();", "  fromEmail: z.union([z.literal(''), z.string().email()]),\n  policy: z.object({\n    method: z.enum(['OTP','LINK']),\n    defaultChannel: z.enum(['email','sms','whatsapp']).default('email'),\n    allowedChannels: z.array(z.enum(['email','sms','whatsapp'])).default(['email']),\n    templates: z.record(z.object({subject:z.string().max(240),body:z.string().max(4000)})).optional()\n  }).optional()\n}).strict();");
replace("  token: z.string().regex(/^[A-Za-z0-9_-]{64}$/),", "  token: z.string().regex(/^(?:[A-Za-z0-9_-]{64}|[0-9]{6})$/),");
replace("return res.json({ ...tenant.passwordRecovery, linkReady: Boolean(configuredRecoveryUrl()) });", "return res.json({ ...tenant.passwordRecovery, policy: normalizeRecoveryPolicy(tenant.passwordRecovery.policy), linkReady: Boolean(configuredRecoveryUrl()) });");
replace("      { ...tenant, passwordRecovery: parsed.data }, principal.userId,", "      { ...tenant, passwordRecovery: { ...parsed.data, policy: normalizeRecoveryPolicy(parsed.data.policy) } }, principal.userId,");
replace("  const response = { message: 'If this account supports email recovery, a link will be sent.' };", "  const response = { message: 'If this account supports recovery, a verification message will be sent.' };");
const oldBlock=`  const { smtpCredentialId, fromEmail } = tenant.passwordRecovery;
  if (!smtpCredentialId || !fromEmail) return res.status(202).json(response);
  const credential = tenant.namedCredentials.find((item) =>
    item.id === smtpCredentialId && item.protocol === 'SMTP' && item.enabled !== false);
  if (!credential) return res.status(202).json(response);
  const token = randomBytes(48).toString('base64url');
  const resetUrl = new URL(url.toString());
  resetUrl.searchParams.set('resetEmail', email);
  resetUrl.searchParams.set('resetToken', token);
  try {
    await sendTenantEmail(user.tenantId, tenant, smtpCredentialId, fromEmail, [email],
      'MetaDrive password reset',
      'A password reset was requested. This link expires in 15 minutes.\\n\\n' + resetUrl.toString()
      + '\\n\\nIgnore this message if you did not request it. MFA requirements remain unchanged.');`;
const newBlock=`  const { smtpCredentialId, fromEmail } = tenant.passwordRecovery;
  const policy = normalizeRecoveryPolicy(tenant.passwordRecovery.policy);
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
    await deliverWithFallback(senders, (provider) => console.warn('Password recovery delivery failed via '+provider));`;
replace(oldBlock,newBlock);
replace("passwordReset: { tokenHash: hashToken(token), expiresAt: Date.now() + 15 * 60_000 }", "passwordReset: { tokenHash: verifier, expiresAt: Date.now() + 15 * 60_000 }");
replace("  if (!resetAllowed('redeem:' + (req.ip ?? 'unknown') + ':' + hashToken(email), 8))", "  if (!resetAllowed('redeem:' + (req.ip ?? 'unknown') + ':' + hashToken(email), 8)\n    || !resetAllowed('redeem-email:' + hashToken(email), 8))");
replace(`  const valid = Boolean(user && !user.disabled && tenantData(user.tenantId)
    && request && request.expiresAt > Date.now()
    && timingSafeEqual(Buffer.from(request.tokenHash), Buffer.from(hashToken(parsed.data.token))));`,`  const [salt, digest] = request?.tokenHash.split(':') ?? [];
  const otpDigest = salt && digest && /^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{64}$/.test(digest)
    ? scryptSync(parsed.data.token, salt, 32) : null;
  const valid = Boolean(user && !user.disabled && tenantData(user.tenantId)
    && request && request.expiresAt > Date.now()
    && (otpDigest
      ? timingSafeEqual(Buffer.from(digest,'hex'), otpDigest)
      : parsed.data.token.length===64 && timingSafeEqual(Buffer.from(request.tokenHash), Buffer.from(hashToken(parsed.data.token)))));`);
const importAnchor="import { normalizeRecoveryPolicy, renderRecoveryTemplate, deliverWithFallback } from './recovery-policy.js';";
replace(importAnchor,importAnchor+"\n// Tenant name is resolved from the tenant registry, never from unauthenticated request input.\nfunction tenantInfoForRecovery(tenant: TenantData, tenantId: string): string {\n  return (tenant as unknown as { name?: string }).name || tenantId;\n}");
writeFileSync(file,src);
console.log('Applied backend metadata-driven OTP/link recovery with tenant and platform SMTP fallback.');
