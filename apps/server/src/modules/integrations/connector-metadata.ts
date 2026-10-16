import { z } from 'zod';

export const connectorSettingsSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  fields: z.array(z.object({
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    label: z.string().trim().min(1).max(80),
    value: z.string().max(2000)
  })).max(50)
}).superRefine((connector, context) => {
  const fieldNames = connector.fields.map((field) => field.apiName.toLocaleLowerCase());
  if (new Set(fieldNames).size !== fieldNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Connector field API names must be unique' });
  }
});
export type ConnectorSettings = z.infer<typeof connectorSettingsSchema>;
export export const defaultConnectorSettings: ConnectorSettings[] = [
  {
    apiName: 'WhatsApp', label: 'WhatsApp', fields: [
      { apiName: 'ApiBaseUrl', label: 'API Base URL', value: '' },
      { apiName: 'PhoneNumberId', label: 'Phone Number ID', value: '' },
      { apiName: 'BusinessAccountId', label: 'Business Account ID', value: '' },
      { apiName: 'ApiVersion', label: 'API Version', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'Email', label: 'Email', fields: [
      { apiName: 'Provider', label: 'Email Provider', value: '' },
      { apiName: 'SenderName', label: 'Sender Name', value: '' },
      { apiName: 'SenderEmail', label: 'Sender Email', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'SMS', label: 'SMS', fields: [
      { apiName: 'Provider', label: 'SMS Provider', value: '' },
      { apiName: 'AccountId', label: 'Account ID', value: '' },
      { apiName: 'SenderId', label: 'Sender ID', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'Uber', label: 'Uber', fields: [
      { apiName: 'ClientId', label: 'Client ID', value: '' },
      { apiName: 'Environment', label: 'Environment', value: '' },
      { apiName: 'WebhookUrl', label: 'Webhook URL', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'Deliveroo', label: 'Deliveroo', fields: [
      { apiName: 'MerchantId', label: 'Merchant ID', value: '' },
      { apiName: 'Environment', label: 'Environment', value: '' },
      { apiName: 'WebhookUrl', label: 'Webhook URL', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  }
];
const connectorOperationSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).max(500)
});
const connectorTestSchema = z.object({
  method: z.enum(['GET', 'HEAD']),
  path: z.string().min(1).max(500),
  expectedStatus: z.number().int().min(100).max(599),
  responseValidation: z.object({
    jsonPath: z.string().min(1).max(200),
    equals: z.string().max(500)
  }).optional()
}).strict().superRefine((test, context) => {
  if (test.path.startsWith('//') || test.path.includes('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(test.path)
    || test.path.split(/[/?#]/).some((part) => part === '..')
    || test.path.includes('#')
    || /[\u0000-\u001f\u007f]/.test(test.path)
    || test.path.split(/[/?#]/).some((part) => {
      try { return decodeURIComponent(part) === '..'; } catch { return true; }
    })) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['path'], message: 'Test paths must remain relative and cannot contain URL, traversal, or fragment syntax' });
  }
  if (test.method === 'HEAD' && test.responseValidation) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['responseValidation'], message: 'HEAD tests cannot validate a response body' });
  }
});
export const connectorDefinitionSchema = z.object({
  connectorKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  name: z.string().trim().min(1).max(80),
  authType: z.enum(['NONE', 'BEARER', 'BASIC', 'API_KEY']),
  baseUrl: z.string().url(),
  authHeader: z.string().trim().optional(),
  authCredential: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  credentialsSchema: z.array(z.object({
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    label: z.string().trim().min(1).max(80),
    secret: z.boolean(),
    required: z.boolean().default(true)
  })).max(30),
  operations: z.record(connectorOperationSchema),
  test: connectorTestSchema.optional(),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  retryPolicy: z.object({ maxAttempts: z.number().int().min(1).max(5).default(1) }).default({ maxAttempts: 1 }),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict().superRefine((definition, context) => {
  const url = new URL(definition.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseUrl'], message: 'Connector base URL must be HTTPS and cannot include credentials, query parameters, or fragments' });
  }
  if (definition.authType === 'API_KEY' && (!definition.authHeader
    || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(definition.authHeader)
    || ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(definition.authHeader.toLowerCase()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authHeader'], message: 'API Key authentication requires a safe, valid HTTP header name' });
  }
  if (definition.authType === 'BEARER' || definition.authType === 'API_KEY') {
    const requiredSecrets = definition.credentialsSchema.filter((field) => field.secret && field.required);
    if (!requiredSecrets.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsSchema'], message: `${definition.authType} authentication requires a required secret credential field` });
    }
    if (definition.authCredential
      && !definition.credentialsSchema.some((field) => field.name === definition.authCredential && field.secret && field.required)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['authCredential'], message: 'Authentication credential must name a required secret credential field' });
    }
    if (requiredSecrets.length > 1 && !definition.authCredential) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['authCredential'], message: 'Select which required secret credential is used for authentication' });
    }
  }
  if (definition.authType === 'BASIC') {
    for (const name of ['username', 'password']) {
      if (!definition.credentialsSchema.some((field) => field.name === name && field.secret && field.required)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsSchema'], message: `Basic authentication requires a required secret "${name}" credential field` });
      }
    }
  }
  const credentialNames = definition.credentialsSchema.map((field) => field.name.toLowerCase());
  if (new Set(credentialNames).size !== credentialNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsSchema'], message: 'Credential field names must be unique' });
  }
  for (const [operationName, operation] of Object.entries(definition.operations)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(operationName)
      || operation.path.startsWith('//')
      || operation.path.includes('\\')
      || /^[a-z][a-z0-9+.-]*:/i.test(operation.path)
      || operation.path.split(/[/?#]/).some((part) => part === '..')
      || operation.path.includes('?')
      || operation.path.includes('#')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['operations', operationName], message: 'Operation paths must remain relative and cannot contain URL, traversal, query, or fragment syntax' });
    }
  }
  if (definition.test) {
    for (const [, fieldName] of definition.test.path.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
      const field = definition.credentialsSchema.find((candidate) => candidate.name === fieldName);
      if (!field || field.secret) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['test', 'path'], message: `Test endpoint placeholder "${fieldName}" must refer to a non-secret credential field` });
      }
    }
  }
});
export type ConnectorDefinition = z.infer<typeof connectorDefinitionSchema>;
export export const defaultConnectorDefinitions: ConnectorDefinition[] = [
  {
    connectorKey: 'META_WHATSAPP', name: 'Meta WhatsApp', authType: 'BEARER',
    baseUrl: 'https://graph.facebook.com/v22.0/', authHeader: 'Authorization',
    credentialsSchema: [
      { name: 'access_token', label: 'Access Token', secret: true, required: true },
      { name: 'phone_number_id', label: 'Phone Number ID', secret: false, required: true },
      { name: 'waba_id', label: 'WABA ID', secret: false, required: false }
    ],
    operations: { send_message: { method: 'POST', path: '/{phone_number_id}/messages' } },
    test: { method: 'GET', path: '/{phone_number_id}?fields=id', expectedStatus: 200 },
    timeoutMs: 30000, retryPolicy: { maxAttempts: 3 }, status: 'ACTIVE'
  },
  { connectorKey: 'EMAIL', name: 'Email', authType: 'NONE', baseUrl: 'https://api.example.com', credentialsSchema: [], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' },
  { connectorKey: 'SMS', name: 'SMS', authType: 'API_KEY', baseUrl: 'https://api.example.com', authHeader: 'x-api-key', credentialsSchema: [{ name: 'api_key', label: 'API Key', secret: true, required: true }], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' },
  { connectorKey: 'UBER', name: 'Uber', authType: 'BEARER', baseUrl: 'https://api.uber.com', credentialsSchema: [{ name: 'access_token', label: 'Access Token', secret: true, required: true }], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' },
  { connectorKey: 'DELIVEROO', name: 'Deliveroo', authType: 'NONE', baseUrl: 'https://api.example.com', credentialsSchema: [], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' }
].map((definition) => connectorDefinitionSchema.parse(definition));
export const integrationConnectionSchema = z.object({
  id: z.string().uuid(),
  connectorKey: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  configuration: z.record(z.string().max(2000)).default({}),
  credentialKeyId: z.string().nullable().default(null),
  credentialIv: z.string().nullable().default(null),
  credentialAuthTag: z.string().nullable().default(null),
  credentialsCiphertext: z.string().nullable().default(null),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  testStatus: z.enum(['Connected', 'Failed', 'Not configured', 'Test unavailable']).nullable().default(null),
  lastTestedAt: z.string().datetime().nullable().default(null),
  lastTestMessage: z.string().max(500).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((connection, context) => {
  const encryptedParts = [connection.credentialKeyId, connection.credentialIv, connection.credentialAuthTag, connection.credentialsCiphertext];
  if (encryptedParts.some(Boolean) && encryptedParts.some((part) => !part)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsCiphertext'], message: 'Encrypted credentials are incomplete' });
  }
});
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;
export const integrationConnectionRequestSchema = z.object({
  connectorKey: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  configuration: z.record(z.string().max(2000)).default({}),
  credentials: z.record(z.string().max(8192)).default({}),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict();
export const connectorDefinitionRequestSchema = connectorDefinitionSchema;
