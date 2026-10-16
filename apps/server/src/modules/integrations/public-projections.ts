import type { IntegrationConnection, ConnectorDefinition, StoredNamedCredential } from '../../index.js';

/** Redact integration secrets before tenant API responses. */
export function publicIntegrationConnection(connection: IntegrationConnection, definition: ConnectorDefinition, credentials: Record<string, string>) {
  return {
    id: connection.id,
    connectorKey: connection.connectorKey,
    name: connection.name,
    configuration: connection.configuration,
    status: connection.status,
    hasCredentials: Object.keys(credentials).length > 0,
    credentialFields: definition.credentialsSchema.map((field) => ({
      name: field.name,
      label: field.label,
      secret: field.secret,
      required: field.required,
      configured: field.secret ? Boolean(credentials[field.name]) : Boolean(connection.configuration[field.name])
    })),
    testStatus: connection.testStatus,
    lastTestedAt: connection.lastTestedAt,
    lastTestMessage: connection.lastTestMessage,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}
export function publicNamedCredential(credential: StoredNamedCredential) {
  return {
    id: credential.id,
    name: credential.name,
    label: credential.label,
    protocol: credential.protocol,
    baseUrl: credential.baseUrl,
    authType: credential.authType,
    headerName: credential.headerName ?? '',
    configuration: credential.configuration ?? {},
    hasSecret: credential.authType !== 'None',
    enabled: credential.enabled !== false,
    keyId: credential.keyId,
    updatedAt: credential.updatedAt
  };
}
