import { z } from 'zod';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';

import type { FlowRuntimeContext, StoredNamedCredential, NamedCredentialPayload } from '../../index.js';
import { credentialKeyRing, openCredentialPayload, openIntegrationCredentials } from '../../core/credential-crypto.js';
import { assertCalloutHostAllowed } from '../../outbound-callout-policy.js';
import { connectorEntitlement } from '../../connector-app-runtime.js';
import { persistenceMode, getRouteAliasPool } from '../../postgres-state.js';
import { sealIntegrationEnvelope } from '../../connector-envelope.js';
import { IntegrationOutbox } from '../../connector-outbox.js';
import { mayRetry, retryAfterMs } from '../../connector-reliability.js';

type RecordEntry = {
 apiId: string; url: string; authType: string; method: string;
 direction: 'Incoming' | 'Outgoing'; requestBody: string; responseBody: string;
 status: number; error: string; durationMs: number;
};

/** Shared secure HTTP callout runtime. Flow-specific bindings are injected by the caller. */
export function createHttpCalloutExecutor(deps: {
 resolveFlowValue: (value: unknown, context: FlowRuntimeContext) => unknown;
 resolveCalloutUrl: (credential: Pick<StoredNamedCredential, 'baseUrl'>, path: string, context: FlowRuntimeContext) => URL;
 resolveFlowTemplate: (value: string, context: FlowRuntimeContext) => string;
 oauthAccessTokenForCredential: (tenantId: string, credential: StoredNamedCredential) => Promise<string>;
 namedCredentialPayloadSchema: { parse(value: unknown): NamedCredentialPayload };
 isPublicAddress: (address: string) => boolean;
 communicationPayload: (value: unknown) => string;
 communicationSafeUrl: (url: string) => string;
 supportedCommunicationMethod: (method: string) => string;
 communicationError: (body: unknown) => string;
 appendCommunicationRecord: (tenantId: string, requestedOwnerId: string, entry: RecordEntry) => void;
}) {
 const { resolveFlowValue, resolveCalloutUrl, resolveFlowTemplate, oauthAccessTokenForCredential,
  namedCredentialPayloadSchema, isPublicAddress, communicationPayload, communicationSafeUrl,
  supportedCommunicationMethod, communicationError, appendCommunicationRecord } = deps;
async function performHttpCallout(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): Promise<{ body: unknown; status: number }> {
  const connectionSource = typeof config.integrationConnectionResource === 'string' && config.integrationConnectionResource.trim()
    ? resolveFlowValue(config.integrationConnectionResource, context)
    : config.integrationConnectionId;
  const connectionId = typeof connectionSource === 'string' ? connectionSource.trim() : '';
  const connection = connectionId
    ? tenant.integrationConnections.find((item) => item.id === connectionId && item.status === 'ACTIVE')
    : undefined;
  const definition = connection
    ? tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey && item.status === 'ACTIVE')
    : undefined;
  const credentialSource = typeof config.namedCredentialResource === 'string' && config.namedCredentialResource.trim()
    ? resolveFlowValue(config.namedCredentialResource, context)
    : config.namedCredentialId;
  const credentialId = typeof credentialSource === 'string' ? credentialSource.trim() : '';
  const namedCredential = !connectionId
    ? tenant.namedCredentials.find((item) => item.id === credentialId && item.protocol === 'HTTPS')
    : undefined;
  if (!connectionId && !namedCredential) throw new Error(`HTTP Callout "${elementLabel}" references an unavailable Named Credential or Integration Connection.`);
  if (connectionId && (!connection || !definition)) throw new Error(`HTTP Callout "${elementLabel}" references an unavailable Integration Connection or provider.`);
  // Flow-scoped dynamic credentials cannot escape their declared app owners.
  const appScope = config.allowedCredentialAppKeys;
  if (appScope !== undefined) {
    if (!Array.isArray(appScope) || appScope.length === 0 ||
        !appScope.every((key: unknown) => typeof key === 'string' && key.length > 0)) {
      throw new Error('Invalid credential app scope metadata.');
    }
    if (!namedCredential) throw new Error('Scoped Flow requires an existing Named Credential.');
    const owners = (tenant.records.Connector_App__c ?? []).filter(
      (app) => app.CredentialName__c === namedCredential.name
    );
    if (owners.length !== 1 || !appScope.includes(owners[0].AppKey__c)) {
      throw new Error('Flow Named Credential is outside its authorised AppExchange scope.');
    }
  }
  if (namedCredential) {
    const entitlement = connectorEntitlement(tenant.records.Connector_App__c ?? [], namedCredential);
    if (!entitlement.allowed) throw new Error(entitlement.message);
    if (namedCredential.enabled === false) throw new Error('Named Credential is disabled. Enable it in AppExchange.');
  }
  const ring = credentialKeyRing();
  let credential: Pick<StoredNamedCredential, 'baseUrl' | 'authType' | 'headerName' | 'name'>;
  let secretPayload: NamedCredentialPayload;
  let defaultTimeoutMs = 15000;
  let maxAttempts = 1;
  let operationPath: string | undefined;
  let operationMethod: string | undefined;
  let apiId = elementLabel;
  if (connection && definition) {
    const encryptedCredentials = openIntegrationCredentials(tenantId, connection, ring);
    const operationName = typeof config.operation === 'string' ? config.operation : '';
    const operation = operationName ? definition.operations[operationName] : undefined;
    if (operationName && !operation) throw new Error(`HTTP Callout "${elementLabel}" selects unknown operation "${operationName}".`);
    apiId = operationName ? `${definition.connectorKey}.${operationName}` : definition.connectorKey;
    operationPath = operation?.path;
    operationMethod = operation?.method;
    defaultTimeoutMs = definition.timeoutMs;
    maxAttempts = definition.retryPolicy.maxAttempts;
    const passwordField = definition.authCredential ?? definition.credentialsSchema.find((field) => field.secret)?.name;
    const token = (passwordField ? encryptedCredentials[passwordField] : undefined)
      ?? encryptedCredentials.access_token ?? encryptedCredentials.api_key ?? encryptedCredentials.token;
    credential = {
      baseUrl: definition.baseUrl.endsWith('/') ? definition.baseUrl : `${definition.baseUrl}/`,
      authType: definition.authType === 'BEARER' ? 'Bearer'
        : definition.authType === 'BASIC' ? 'Basic'
          : definition.authType === 'API_KEY' ? 'API Key' : 'None',
      headerName: definition.authHeader,
      name: connection.name
    };
    secretPayload = {
      ...(definition.authType === 'BASIC' ? { username: encryptedCredentials.username } : {}),
      ...(token ? { secret: token } : definition.authType === 'BASIC' && encryptedCredentials.password ? { secret: encryptedCredentials.password } : {})
    };
  } else {
    credential = namedCredential!;
    apiId = namedCredential!.name;
    secretPayload = namedCredentialPayloadSchema.parse(openCredentialPayload(tenantId, namedCredential!, ring));
  }
  const pathValue = typeof config.path === 'string' && config.path.trim() ? config.path : operationPath ?? '';
  const relativePath = operationPath && pathValue === operationPath ? operationPath.replace(/^\/+/, '') : pathValue;
  const path = connection
    ? relativePath.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, key: string) =>
      Object.hasOwn(connection.configuration, key) ? encodeURIComponent(connection.configuration[key]) : match)
    : relativePath;
  const target = resolveCalloutUrl(credential, path, context);
  assertCalloutHostAllowed(target.hostname, process.env.METADRIVE_PAUSED_CALLOUT_HOSTS);
  const method = typeof config.method === 'string' ? config.method : operationMethod ?? 'GET';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`HTTP Callout "${elementLabel}" uses an unsupported method.`);
  const queryParametersValue = config.queryParameters;
  let queryParameters: Record<string, unknown> = {};
  if (typeof queryParametersValue === 'string' && queryParametersValue.trim()) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(queryParametersValue);
    } catch {
      throw new Error(`HTTP Callout "${elementLabel}" query parameters must be valid JSON.`);
    }
    const parsedParameters = z.record(z.unknown()).safeParse(decoded);
    if (!parsedParameters.success) throw new Error(`HTTP Callout "${elementLabel}" query parameters must be a JSON object.`);
    queryParameters = parsedParameters.data;
  } else if (queryParametersValue && typeof queryParametersValue === 'object' && !Array.isArray(queryParametersValue)) {
    queryParameters = queryParametersValue as Record<string, unknown>;
  } else if (queryParametersValue !== undefined && queryParametersValue !== '') {
    throw new Error(`HTTP Callout "${elementLabel}" query parameters must be a JSON object.`);
  }
  for (const [key, value] of Object.entries(queryParameters)) {
    if (!key) throw new Error(`HTTP Callout "${elementLabel}" query parameter names cannot be empty.`);
    target.searchParams.set(key, resolveFlowTemplate(typeof value === 'string' ? value : JSON.stringify(value), context));
  }
  const timeoutOverride = config.timeoutMs === undefined || config.timeoutMs === null || config.timeoutMs === ''
    ? defaultTimeoutMs
    : Number(config.timeoutMs);
  if (!Number.isInteger(timeoutOverride) || timeoutOverride < 1000 || timeoutOverride > 120000) {
    throw new Error(`HTTP Callout "${elementLabel}" timeout must be between 1,000 and 120,000 milliseconds.`);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (typeof config.headers === 'string') {
    for (const line of config.headers.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const separator = line.indexOf(':');
      if (separator <= 0) throw new Error(`HTTP Callout "${elementLabel}" has an invalid header line.`);
      const name = line.slice(0, separator).trim();
      const value = resolveFlowTemplate(line.slice(separator + 1).trim(), context);
      if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)
        || ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
        throw new Error(`HTTP Callout "${elementLabel}" contains a restricted request header.`);
      }
      if (/[\r\n]/.test(value)) throw new Error(`HTTP Callout "${elementLabel}" header values cannot contain line breaks.`);
      headers[name] = value;
    }
  } else if (Array.isArray(config.headers)) {
    throw new Error(`HTTP Callout "${elementLabel}" headers must be configured as header-name: value lines.`);
  }
  if (credential.authType === 'Bearer') {
    if (!secretPayload.secret) throw new Error(`Named Credential "${credential.name}" has no configured secret.`);
    headers.Authorization = `Bearer ${secretPayload.secret}`;
  } else if (credential.authType === 'Basic') {
    if (!secretPayload.username || !secretPayload.secret) throw new Error(`Named Credential "${credential.name}" has incomplete Basic authentication data.`);
    headers.Authorization = `Basic ${Buffer.from(`${secretPayload.username}:${secretPayload.secret}`).toString('base64')}`;
  } else if (credential.authType === 'API Key') {
    if (!credential.headerName || !secretPayload.secret) throw new Error(`Named Credential "${credential.name}" has incomplete API Key authentication data.`);
    headers[credential.headerName] = secretPayload.secret;
  } else if (credential.authType === 'OAuth Client Credentials' || credential.authType === 'OAuth Authorization Code') {
    if (!namedCredential) throw new Error('OAuth authentication requires a tenant Named Credential.');
    // Debug must never contact external OAuth token endpoints.
    if (!context.debug && config.deliveryMode !== 'DURABLE_ASYNC') headers.Authorization = `Bearer ${await oauthAccessTokenForCredential(tenantId,namedCredential)}`;
  }
  // Resolve JSON fields individually instead of substituting inside serialized JSON:
  // recipient names, quotes and line breaks must remain valid JSON after mapping.
  const rawBody = config.body === undefined || config.body === null ? '' : String(config.body);
  let body = '';
  if (rawBody) {
    let parsedBody: unknown;
    try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = undefined; }
    if (parsedBody !== undefined && parsedBody !== null && typeof parsedBody === 'object') {
      const resolveBodyFields = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(resolveBodyFields);
        if (item && typeof item === 'object') return Object.fromEntries(
          Object.entries(item).map(([key, value]) => [key, resolveBodyFields(value)]));
        if (typeof item !== 'string') return item;
        const exactReference = /^\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}$/.exec(item);
        if (exactReference) {
          const resolved = resolveFlowValue(item, context);
          if (resolved === undefined) throw new Error(`Flow template references an unavailable value "${exactReference[1]}".`);
          return resolved;
        }
        return resolveFlowTemplate(item, context);
      };
      body = JSON.stringify(resolveBodyFields(parsedBody));
    } else {
      body = resolveFlowTemplate(rawBody, context);
    }
  }
  if (Buffer.byteLength(body, 'utf8') > 256 * 1024) throw new Error(`HTTP Callout "${elementLabel}" request body exceeded the 256 KB limit.`);
  if (body && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  // A metadata-supplied stable key enables safe provider-side deduplication on mutating calls.
  const idempotencyKey = typeof config.idempotencyKey === 'string'
    ? resolveFlowTemplate(config.idempotencyKey, context).trim() : '';
  if (idempotencyKey && (!/^[\x21-\x7e]{1,200}$/.test(idempotencyKey) || idempotencyKey.includes(':')))
    throw new Error(`HTTP Callout "${elementLabel}" has an invalid idempotency key.`);
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (!connection && config.maxAttempts !== undefined) {
    const requestedAttempts = Number(config.maxAttempts);
    if (!Number.isInteger(requestedAttempts) || requestedAttempts < 1 || requestedAttempts > 5)
      throw new Error(`HTTP Callout "${elementLabel}" retry attempts must be between 1 and 5.`);
    maxAttempts = requestedAttempts;
  }
  if (context.debug) return { body: { debugExecution: true, requestBody: communicationPayload(body) }, status: 200 };
  if (config.deliveryMode === 'DURABLE_ASYNC') {
    // Never queue work inside a Flow rollback scope: a later fault could commit an external
    // side-effect after the transaction's local records have been rolled back.
    if (context.rollbackSnapshot) throw new Error('Durable integration delivery cannot run inside a rollback scope.');
    if (persistenceMode === 'jsonb') throw new Error('Durable integration delivery requires SQL-only persistence.');
    if (!idempotencyKey) throw new Error('Durable integration delivery requires a stable idempotency key.');
    if (method === 'GET' && body) throw new Error('GET HTTP Callouts cannot include a request body.');
    const pool = getRouteAliasPool();
    if (!pool) throw new Error('Durable integration delivery requires PostgreSQL.');
    const chosenCredentialId = connection?.id ?? namedCredential?.id;
    if (!chosenCredentialId) throw new Error('Durable integration credential is unavailable.');
    const preparedConfig = {
      ...config, namedCredentialId: namedCredential?.id ?? '',
      integrationConnectionId: connection?.id ?? '',
      namedCredentialResource: '', integrationConnectionResource: '',
      deliveryMode: 'SYNC', maxAttempts: 1, idempotencyKey
    };
    // Encrypt the entire execution snapshot; never queue authorization headers or bearer tokens.
    const snapshot = {
      config: preparedConfig,
      label: elementLabel,
      context: {
        currentUserId: context.currentUserId, currentUser: context.currentUser,
        flowVariables: context.flowVariables, variables: context.variables,
        record: context.record, prior: context.prior, recordEvent: context.recordEvent,
        triggerObjectName: context.triggerObjectName, resourceDefinitions: context.resourceDefinitions,
        timeZone: context.timeZone, locale: context.locale, corporateCurrency: context.corporateCurrency,
        currencyRates: context.currencyRates, userCurrencyIsoCode: context.userCurrencyIsoCode,
        currencyIsoCode: context.currencyIsoCode
      }
    };
    const encryptedRequest = sealIntegrationEnvelope(tenantId, idempotencyKey, snapshot, ring);
    const queuedId = await new IntegrationOutbox(pool).enqueue({
      tenantId, credentialId: chosenCredentialId, operationKey: idempotencyKey,
      method, path: target.pathname, encryptedRequest,
      maxAttempts: Math.max(1, Math.min(5, maxAttempts))
    });
    return { body: { queued: true, deliveryId: queuedId }, status: 202 };
  }
  let lastRetryAfter: string | undefined;
  let attempt = 0;
  let response: { body: unknown; status: number };
  do {
    attempt += 1;
    const attemptStartedAt = Date.now();
    response = await new Promise<{ body: unknown; status: number }>((resolve, reject) => {
    let responseSize = 0;
    let timer: ReturnType<typeof setTimeout>;
    const request = httpsRequest(target, {
      method,
      headers,
      timeout: timeoutOverride,
      maxHeaderSize: 16 * 1024,
      lookup: (hostname, options, callback) => {
        void lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
          if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
            callback(new Error('HTTP Callout DNS resolved to a private or reserved address'), '', 0);
            return;
          }
          const selected = addresses[0];
          if (options && typeof options === 'object' && 'all' in options && options.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        }).catch(() => callback(new Error('HTTP Callout host could not be resolved safely'), '', 0));
      }
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        responseSize += data.length;
        if (responseSize > 1024 * 1024) {
          request.destroy(new Error('HTTP Callout response exceeded the 1 MB limit.'));
          return;
        }
        chunks.push(data);
      });
      incoming.on('end', () => {
        clearTimeout(timer);
        const retryHeader = incoming.headers['retry-after'];
        lastRetryAfter = Array.isArray(retryHeader) ? retryHeader[0] : retryHeader;
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown = text;
        if (text) {
          try { parsed = JSON.parse(text) as unknown; } catch { /* Non-JSON response bodies remain text. */ }
        }
        resolve({ body: parsed, status: incoming.statusCode ?? 0 });
      });
      incoming.on('error', (error) => { clearTimeout(timer); reject(error); });
    });
    timer = setTimeout(() => request.destroy(new Error(`HTTP Callout timed out after ${timeoutOverride} milliseconds.`)), timeoutOverride);
    request.on('error', (error) => { clearTimeout(timer); reject(error); });
    if (body && method !== 'GET') request.write(body);
    else if (body) {
      request.destroy(new Error('GET HTTP Callouts cannot include a request body.'));
      return;
    }
    request.end();
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const calloutError = message.includes('private or reserved') || message.includes('local or reserved') || message.includes('safely') || message.includes('timed out') || message.includes('1 MB limit') || message.includes('cannot include')
          ? new Error(`HTTP Callout "${elementLabel}" failed: ${message}`)
          : new Error(`HTTP Callout "${elementLabel}" failed to reach its HTTPS endpoint.`);
        appendCommunicationRecord(tenantId, context.currentUserId, {
          apiId,
          url: communicationSafeUrl(target.toString()),
          authType: credential.authType,
          method: supportedCommunicationMethod(method),
          direction: 'Outgoing',
          requestBody: communicationPayload(body),
          responseBody: communicationPayload({ error: calloutError.message }),
          status: 0,
          error: calloutError.message,
          durationMs: Date.now() - attemptStartedAt
        });
        throw calloutError;
      });
    appendCommunicationRecord(tenantId, context.currentUserId, {
      apiId,
      url: communicationSafeUrl(target.toString()),
      authType: credential.authType,
      method: supportedCommunicationMethod(method),
      direction: 'Outgoing',
      requestBody: communicationPayload(body),
      responseBody: communicationPayload(response.body),
      status: response.status,
      error: response.status >= 400 ? communicationError(response.body) : '',
      durationMs: Date.now() - attemptStartedAt
    });
    if (attempt < maxAttempts && mayRetry(method, idempotencyKey)
      && [408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
      const backoffMs = Math.min(250 * (2 ** (attempt - 1)), 2000);
      const delayMs = retryAfterMs(lastRetryAfter ? { 'Retry-After': lastRetryAfter } : undefined) ?? backoffMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  } while (attempt < maxAttempts && mayRetry(method, idempotencyKey)
    && [408, 425, 429, 500, 502, 503, 504].includes(response.status));
  if (connection && response.status >= 400) {
    throw new Error(`HTTP Callout "${elementLabel}" received HTTP status ${response.status} from provider "${definition?.name}".`);
  }
  return response;
}

 return performHttpCallout;
}
