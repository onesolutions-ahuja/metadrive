import { z } from 'zod';
import { isIP } from 'node:net';
import { validatedOAuthUrl, type OAuthToken } from '../../connector-oauth.js';

/** Tenant credentials and Email Alert metadata; no Flow or Core startup side effects. */
export function isTestLoopbackSmtpUrl(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  return process.env.METADRIVE_SMTP_TEST_MODE === 'true'
    && (host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.')));
}
export const namedCredentialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  protocol: z.enum(['HTTPS', 'SMTP']).default('HTTPS'),
  baseUrl: z.string().url(),
  authType: z.enum(['None', 'Bearer', 'Basic', 'API Key', 'OAuth Client Credentials', 'OAuth Authorization Code']),
  headerName: z.string().optional(),
  configuration: z.record(z.string()).optional(),
  keyId: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
  enabled: z.boolean().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((credential, context) => {
  const url = new URL(credential.baseUrl);
  const validProtocol = credential.protocol === 'HTTPS'
    ? url.protocol === 'https:'
    : url.protocol === 'smtp:' && ([25, 465, 587, 2525].includes(Number(url.port || 25)) || isTestLoopbackSmtpUrl(url));
  if (!validProtocol || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseUrl'], message: 'Named Credential URL must match its HTTPS or SMTP protocol and cannot include user info, query parameters, or fragments' });
  }
  if (credential.protocol === 'SMTP' && credential.authType !== 'Basic' && credential.authType !== 'None') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authType'], message: 'SMTP credentials support only Basic or unauthenticated SMTP' });
  }
  if (credential.authType === 'API Key' && !credential.headerName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'API Key credentials require an HTTP header name' });
  }
  if (credential.headerName && !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(credential.headerName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'Header name is not a valid HTTP token' });
  }
  if (credential.headerName && ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(credential.headerName.toLowerCase())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'This header cannot be used to transmit an API Key' });
  }
  if (credential.authType === 'OAuth Client Credentials' || credential.authType === 'OAuth Authorization Code') {
    const oauth = credential.configuration ?? {};
    if (credential.authType === 'OAuth Authorization Code') {
      if (!oauth.AuthorizationEndpoint?.trim())
        context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration','AuthorizationEndpoint'],message:'OAuth AuthorizationEndpoint is required' });
      else try { validatedOAuthUrl(oauth.AuthorizationEndpoint); }
      catch { context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration','AuthorizationEndpoint'],message:'OAuth authorization URL must be public HTTPS' }); }
    }
    if (!oauth.ClientId?.trim() || !oauth.OAuthEndpoint?.trim()) {
      context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration'],message:'OAuth ClientId and OAuthEndpoint are required' });
    } else {
      try { validatedOAuthUrl(oauth.OAuthEndpoint); }
      catch { context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration','OAuthEndpoint'],message:'OAuth endpoint must be public HTTPS' }); }
    }
  }
});
export const namedCredentialRequestSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  protocol: z.enum(['HTTPS', 'SMTP']).default('HTTPS'),
  baseUrl: z.string().url(),
  authType: z.enum(['None', 'Bearer', 'Basic', 'API Key', 'OAuth Client Credentials', 'OAuth Authorization Code']),
  headerName: z.string().trim().optional(),
  configuration: z.record(z.string()).optional(),
  username: z.string().max(512).optional(),
  secret: z.string().max(8192).optional()
}).superRefine((credential, context) => {
  const url = new URL(credential.baseUrl);
  for (const [fieldName, fieldValue] of Object.entries(credential.configuration ?? {})) {
    if (/(?:secret|password|token|api_?key|private_?key|authorization)/i.test(fieldName) && fieldValue.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['configuration', fieldName],
        message: 'Sensitive values must use the encrypted credential Secret field, not plain configuration variables' });
    }
  }
  const validProtocol = credential.protocol === 'HTTPS'
    ? url.protocol === 'https:'
    : url.protocol === 'smtp:' && ([25, 465, 587, 2525].includes(Number(url.port || 25)) || isTestLoopbackSmtpUrl(url));
  if (!validProtocol || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseUrl'], message: 'Named Credential URL must match its HTTPS or SMTP protocol and cannot include user info, query parameters, or fragments' });
  }
  if (credential.protocol === 'SMTP' && credential.authType !== 'Basic' && credential.authType !== 'None') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authType'], message: 'SMTP credentials support only Basic or unauthenticated SMTP' });
  }
  if (credential.authType === 'API Key' && !credential.headerName?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'API Key credentials require an HTTP header name' });
  }
  if (credential.authType === 'API Key' && credential.headerName && ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(credential.headerName.toLowerCase())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'This header cannot be used to transmit an API Key' });
  }
  if (credential.authType === 'Basic' && credential.secret && !credential.username?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: 'Basic authentication requires a username' });
  }
  if (credential.authType === 'OAuth Client Credentials' || credential.authType === 'OAuth Authorization Code') {
    const oauth = credential.configuration ?? {};
    if (credential.authType === 'OAuth Authorization Code') {
      if (!oauth.AuthorizationEndpoint?.trim())
        context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration','AuthorizationEndpoint'],message:'OAuth AuthorizationEndpoint is required' });
      else try { validatedOAuthUrl(oauth.AuthorizationEndpoint); }
      catch { context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration','AuthorizationEndpoint'],message:'OAuth authorization URL must be public HTTPS' }); }
    }
    if (!oauth.ClientId?.trim() || !oauth.OAuthEndpoint?.trim()) {
      context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration'],message:'OAuth ClientId and OAuthEndpoint are required' });
    } else {
      try { validatedOAuthUrl(oauth.OAuthEndpoint); }
      catch { context.addIssue({ code:z.ZodIssueCode.custom,path:['configuration','OAuthEndpoint'],message:'OAuth endpoint must be public HTTPS' }); }
    }
  }
});
export type StoredNamedCredential = z.infer<typeof namedCredentialSchema>;
export const emailAlertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  objectApiName: z.string().min(1),
  namedCredentialId: z.string().uuid(),
  fromEmail: z.string().email(),
  recipients: z.string().trim().min(1).max(2000),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(1024 * 1024),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export const emailAlertRequestSchema = emailAlertSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).strict();
export type EmailAlert = z.infer<typeof emailAlertSchema>;
export type NamedCredentialPayload = { username?: string; secret?: string; oauthToken?: OAuthToken };
export type CredentialKeyRing = { activeKeyId: string; keys: Map<string, Buffer> };
