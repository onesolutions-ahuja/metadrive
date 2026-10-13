/**
 * Recovery delivery policy. Pure policy helpers: never handle credentials or persist OTPs here.
 * Security-critical verification remains in the authenticated backend runtime.
 */
export type RecoveryChannel = 'email' | 'sms' | 'whatsapp';
export type RecoveryMethod = 'OTP' | 'LINK';
export type RecoveryTemplate = { subject: string; body: string };
export type RecoveryDeliveryPolicy = {
  method: RecoveryMethod;
  defaultChannel: RecoveryChannel;
  allowedChannels: RecoveryChannel[];
  templates: Record<RecoveryChannel, RecoveryTemplate>;
  fallback: 'TENANT_PLATFORM_HTTP';
};
export const DEFAULT_RECOVERY_POLICY: RecoveryDeliveryPolicy = {
  method: 'OTP',
  defaultChannel: 'email',
  allowedChannels: ['email'],
  fallback: 'TENANT_PLATFORM_HTTP',
  templates: {
    email: {
      subject: '{!Tenant.Name} — password recovery',
      body: 'Your {!Tenant.Name} password recovery verification is {!Verification.Value}. It expires in {!Verification.ExpiryMinutes} minutes. If you did not request this, ignore this email.'
    },
    sms: { subject: '', body: '{!Tenant.Name}: your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.' },
    whatsapp: { subject: '', body: '{!Tenant.Name}: your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.' }
  }
};
const APPROVED = new Set([
  'Tenant.Id', 'Tenant.Name', 'Verification.Value', 'Verification.Method',
  'Verification.ExpiryMinutes', 'User.Email'
]);
export function renderRecoveryTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{!([^}]+)\}/g, (_, key: string) => {
    if (!APPROVED.has(key)) throw new Error('Unsupported recovery template variable');
    if (!Object.hasOwn(values, key)) throw new Error('Missing recovery template variable');
    return values[key];
  });
}
export function normalizeRecoveryPolicy(value: unknown): RecoveryDeliveryPolicy {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_RECOVERY_POLICY);
  const p = value as Partial<RecoveryDeliveryPolicy>;
  const channel = (p.defaultChannel === 'sms' || p.defaultChannel === 'whatsapp') ? p.defaultChannel : 'email';
  const allowed = Array.isArray(p.allowedChannels)
    ? [...new Set(p.allowedChannels.filter((x) => x === 'email' || x === 'sms' || x === 'whatsapp'))] as RecoveryChannel[]
    : ['email'] as RecoveryChannel[];
  if (!allowed.includes('email')) allowed.unshift('email');
  const templates = structuredClone(DEFAULT_RECOVERY_POLICY.templates);
  for (const key of ['email', 'sms', 'whatsapp'] as const) {
    if (p.templates?.[key]?.subject && p.templates[key].subject.length <= 240) templates[key].subject = p.templates[key].subject;
    if (p.templates?.[key]?.body && p.templates[key].body.length <= 4000) templates[key].body = p.templates[key].body;
  }
  return {
    method: p.method === 'LINK' ? 'LINK' : 'OTP',
    defaultChannel: allowed.includes(channel) ? channel : 'email',
    allowedChannels: allowed,
    fallback: 'TENANT_PLATFORM_HTTP',
    templates
  };
}
export async function deliverWithFallback(
  senders: Array<{ provider: 'tenant' | 'platform' | 'http'; send: () => Promise<void> }>,
  onFailure: (provider: string) => void
): Promise<string> {
  for (const sender of senders) {
    try { await sender.send(); return sender.provider; }
    catch { onFailure(sender.provider); }
  }
  throw new Error('Recovery delivery unavailable');
}
