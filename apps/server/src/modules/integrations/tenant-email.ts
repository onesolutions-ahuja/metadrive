import type { TenantData } from '../../core/state/types.js';

export function createTenantEmailSender(deps: {
  isIP: typeof import('node:net').isIP;
  isReservedHostname: (host: string) => boolean;
  isPublicAddress: (address: string) => boolean;
  lookup: typeof import('node:dns/promises').lookup;
  namedCredentialPayloadSchema: { parse: (value: unknown) => { username?: string; secret?: string } };
  openCredentialPayload: (tenantId: string, credential: TenantData['namedCredentials'][number]) => unknown;
  nodemailer: typeof import('nodemailer').default;
}) {
  const { isIP, isReservedHostname, isPublicAddress, lookup, namedCredentialPayloadSchema, openCredentialPayload, nodemailer } = deps;
return async function sendTenantEmail(
  tenantId: string,
  tenant: TenantData,
  credentialId: string,
  from: string,
  recipients: string[],
  subject: string,
  text: string,
  html?: string
): Promise<void> {
  const credential = tenant.namedCredentials.find((item) => item.id === credentialId && item.protocol === 'SMTP');
  if (!credential) throw new Error('The selected SMTP Named Credential is unavailable.');
  const target = new URL(credential.baseUrl);
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  const isLoopback = host === 'localhost' || host === '::1'
    || (isIP(host) === 4 && host.startsWith('127.'));
  const allowLocalTestSmtp = process.env.METADRIVE_SMTP_TEST_MODE === 'true' && isLoopback;
  if (!allowLocalTestSmtp && (isReservedHostname(host) || (isIP(host) && !isPublicAddress(host)))) {
    throw new Error(`SMTP host "${host}" is local or reserved and cannot be used.`);
  }
  const addresses = allowLocalTestSmtp
    ? [{ address: host, family: isIP(host) }]
    : isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || (!allowLocalTestSmtp && addresses.some((address) => !isPublicAddress(address.address)))) {
    throw new Error(`SMTP host "${host}" did not resolve exclusively to public IP addresses.`);
  }
  const secretPayload = namedCredentialPayloadSchema.parse(openCredentialPayload(tenantId, credential));
  const address = addresses[0];
  const port = Number(target.port || 25);
  const transporter = nodemailer.createTransport({
    host: address.address,
    port,
    secure: port === 465,
    requireTLS: !allowLocalTestSmtp && port !== 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: host, minVersion: 'TLSv1.2' },
    ...(credential.authType === 'Basic' ? {
      auth: { user: secretPayload.username ?? '', pass: secretPayload.secret ?? '' }
    } : {})
  });
  await transporter.sendMail({ from, to: recipients, subject, text, ...(html ? { html } : {}) });
};
}
