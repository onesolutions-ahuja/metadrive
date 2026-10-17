import { z } from 'zod';
import nodemailer from 'nodemailer';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { openCredentialPayload } from '../../core/credential-crypto.js';

import type { NamedCredentialPayload, FlowRuntimeContext } from '../../index.js';

/** Shared SMTP and email Alert execution. No independent communication engine. */
export function createTenantEmailRuntime(deps: {
 getState: () => PlatformState;
 effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
 isReservedHostname: (hostname: string) => boolean;
 isPublicAddress: (address: string) => boolean;
 namedCredentialPayloadSchema: { parse(value: unknown): NamedCredentialPayload };
 resolveFlowTemplate: (template: string, context: FlowRuntimeContext) => string;
}) {
 const { getState, effectivePermissions, isReservedHostname, isPublicAddress,
  namedCredentialPayloadSchema, resolveFlowTemplate } = deps;
async function sendTenantEmail(
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
}

async function performSendEmail(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): Promise<void> {
  const runningUser = getState().users.find((user) => user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser || !effectivePermissions(runningUser, tenant).includes('email:send')) {
    throw new Error('The running user does not have permission to send email.');
  }
  const credentialId = typeof config.namedCredentialId === 'string' ? config.namedCredentialId : '';
  const recipientText = resolveFlowTemplate(String(config.recipients ?? ''), context);
  const recipients = recipientText.split(/[;,]/).map((recipient) => recipient.trim()).filter(Boolean);
  if (!recipients.length || recipients.some((recipient) => !z.string().email().safeParse(recipient).success)) {
    throw new Error(`Send Email "${elementLabel}" requires one or more valid recipient email addresses.`);
  }
  const from = resolveFlowTemplate(String(config.fromEmail ?? ''), context).trim();
  if (!z.string().email().safeParse(from).success) throw new Error(`Send Email "${elementLabel}" requires a valid From email address.`);
  const subject = resolveFlowTemplate(String(config.subject ?? ''), context);
  const text = resolveFlowTemplate(String(config.body ?? ''), context);
  if (!subject.trim()) throw new Error(`Send Email "${elementLabel}" requires a subject.`);
  if (!text.trim()) throw new Error(`Send Email "${elementLabel}" requires a message body.`);
  if (subject.length > 998 || text.length > 1024 * 1024) throw new Error(`Send Email "${elementLabel}" exceeded the supported message size.`);
  if (context.debug) return;
  await sendTenantEmail(tenantId, tenant, credentialId, from, recipients, subject, text);
}

async function performEmailAlert(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): Promise<void> {
  const emailAlertId = typeof config.emailAlertId === 'string' ? config.emailAlertId : '';
  const emailAlert = tenant.emailAlerts.find((candidate) => candidate.id === emailAlertId);
  if (!emailAlert) throw new Error(`Email Alert action "${elementLabel}" references an unavailable Email Alert.`);
  if (context.triggerObjectName !== emailAlert.objectApiName) {
    throw new Error(`Email Alert "${emailAlert.label}" requires a record-triggered flow for "${emailAlert.objectApiName}".`);
  }
  if (!context.record?.Id) {
    throw new Error(`Email Alert "${emailAlert.label}" requires the triggering record.`);
  }
  await performSendEmail(tenantId, tenant, {
    namedCredentialId: emailAlert.namedCredentialId,
    fromEmail: emailAlert.fromEmail,
    recipients: emailAlert.recipients,
    subject: emailAlert.subject,
    body: emailAlert.body
  }, context, emailAlert.label);
}

 return { sendTenantEmail, performSendEmail, performEmailAlert };
}
