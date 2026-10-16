import type { Request, Response } from "express";
import type { ConnectorTestResult } from "../../connector-test.js";
import type { IntegrationsConnectionRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerIntegrationsConnectionRoutes(deps: IntegrationsConnectionRoutesDependencies): void {
  deps.app.get('/api/connector-providers', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = deps.tenantData(deps.getPrincipal(res).tenantId)!;
    res.json({ providers: tenant.connectorDefinitions });
  });
  deps.app.put('/api/connector-providers/:connectorKey', deps.requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
    const parsed = deps.connectorDefinitionRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid connector provider definition', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const connectorKey = deps.routeParam(req, 'connectorKey');
    const current = tenant.connectorDefinitions.find((item) => item.connectorKey === connectorKey);
    if (!current) return res.status(404).json({ error: 'Connector provider definition was not found' });
    if (parsed.data.connectorKey !== connectorKey) return res.status(400).json({ error: 'Connector key cannot be changed' });
    const definitions = tenant.connectorDefinitions.map((item) => item.connectorKey === connectorKey ? parsed.data : item);
    const now = new Date().toISOString();
    const providerRecords = (tenant.records.ConnectorProvider__c ?? []).map((record) =>
      record.ConnectorKey__c === connectorKey ? deps.stampRecordAuditFields({
        ...record,
        Name: parsed.data.name,
        AuthType__c: parsed.data.authType,
        BaseUrl__c: parsed.data.baseUrl,
        AuthCredential__c: parsed.data.authCredential ?? '',
        CredentialsSchema__c: JSON.stringify(parsed.data.credentialsSchema),
        Operations__c: JSON.stringify(parsed.data.operations),
        Test__c: parsed.data.test ? JSON.stringify(parsed.data.test) : '',
        TimeoutMs__c: parsed.data.timeoutMs,
        RetryPolicy__c: JSON.stringify(parsed.data.retryPolicy),
        Status__c: parsed.data.status,
        LastModifiedDate: now
      }, principal.userId, now, record) : record
    );
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      connectorDefinitions: definitions,
      records: { ...tenant.records, ConnectorProvider__c: providerRecords }
    });
    return res.json({ provider: parsed.data });
  });
  deps.app.get('/api/integration-connections', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenantId = deps.getPrincipal(res).tenantId;
    const tenant = deps.tenantData(tenantId)!;
    const ring = tenant.integrationConnections.some((connection) => connection.credentialsCiphertext) ? deps.credentialKeyRing() : undefined;
    const connections = tenant.integrationConnections.flatMap((connection) => {
      const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey);
      if (!definition) return [];
      return [deps.publicIntegrationConnection(connection, definition, ring ? deps.openIntegrationCredentials(tenantId, connection, ring) : {})];
    });
    res.json({ connections });
  });
  deps.app.post('/api/integration-connections', deps.requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
    const parsed = deps.integrationConnectionRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Integration Connection', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === parsed.data.connectorKey && item.status === 'ACTIVE');
    if (!definition) return res.status(422).json({ error: 'Select an active connector provider definition' });
    const credentialNames = new Set(definition.credentialsSchema.filter((field) => field.secret).map((field) => field.name));
    const unknownCredential = Object.keys(parsed.data.credentials).find((name) => !credentialNames.has(name));
    if (unknownCredential) return res.status(400).json({ error: `Credential "${unknownCredential}" is not defined as a secret by this connector provider` });
    const plaintextSecret = Object.keys(parsed.data.configuration).find((name) => credentialNames.has(name));
    if (plaintextSecret) return res.status(400).json({ error: `Secret field "${plaintextSecret}" must be submitted as a credential so it can be encrypted` });
    const credentials = Object.fromEntries(Object.entries(parsed.data.credentials).filter(([, value]) => value.trim()));
    const id = deps.randomUUID();
    const now = new Date().toISOString();
    const encrypted = Object.keys(credentials).length
      ? deps.sealIntegrationCredentials(principal.tenantId, id, credentials)
      : { credentialKeyId: null, credentialIv: null, credentialAuthTag: null, credentialsCiphertext: null };
    const connection = deps.integrationConnectionSchema.parse({
      id,
      connectorKey: parsed.data.connectorKey,
      name: parsed.data.name,
      configuration: parsed.data.configuration,
      ...encrypted,
      status: parsed.data.status,
      testStatus: null,
      lastTestedAt: null,
      lastTestMessage: null,
      createdAt: now,
      updatedAt: now
    });
    const records = [
      ...(tenant.records.IntegrationConnection__c ?? []),
      deps.integrationConnectionRecord(connection, principal.userId)
    ];
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      integrationConnections: [...tenant.integrationConnections, connection],
      records: { ...tenant.records, IntegrationConnection__c: records }
    });
    return res.status(201).json({ connection: deps.publicIntegrationConnection(connection, definition, credentials) });
  });
  deps.app.put('/api/integration-connections/:id', deps.requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
    const parsed = deps.integrationConnectionRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Integration Connection', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const id = deps.routeParam(req, 'id');
    const current = tenant.integrationConnections.find((item) => item.id === id);
    if (!current) return res.status(404).json({ error: 'Integration Connection was not found' });
    if (current.connectorKey !== parsed.data.connectorKey) return res.status(400).json({ error: 'An Integration Connection cannot change its provider' });
    const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === current.connectorKey);
    if (!definition) return res.status(422).json({ error: 'The connector provider definition is unavailable' });
    const credentialNames = new Set(definition.credentialsSchema.filter((field) => field.secret).map((field) => field.name));
    const unknownCredential = Object.keys(parsed.data.credentials).find((name) => !credentialNames.has(name));
    if (unknownCredential) return res.status(400).json({ error: `Credential "${unknownCredential}" is not defined as a secret by this connector provider` });
    const plaintextSecret = Object.keys(parsed.data.configuration).find((name) => credentialNames.has(name));
    if (plaintextSecret) return res.status(400).json({ error: `Secret field "${plaintextSecret}" must be submitted as a credential so it can be encrypted` });
    const existingCredentials = deps.openIntegrationCredentials(principal.tenantId, current);
    const credentials = { ...existingCredentials, ...Object.fromEntries(Object.entries(parsed.data.credentials).filter(([, value]) => value.trim())) };
    const now = new Date().toISOString();
    const encrypted = Object.keys(credentials).length
      ? deps.sealIntegrationCredentials(principal.tenantId, id, credentials)
      : { credentialKeyId: null, credentialIv: null, credentialAuthTag: null, credentialsCiphertext: null };
    const updated = deps.integrationConnectionSchema.parse({
      ...current,
      name: parsed.data.name,
      configuration: parsed.data.configuration,
      ...encrypted,
      status: parsed.data.status,
      testStatus: null,
      lastTestedAt: null,
      lastTestMessage: null,
      updatedAt: now
    });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      integrationConnections: tenant.integrationConnections.map((item) => item.id === id ? updated : item),
      records: {
        ...tenant.records,
        IntegrationConnection__c: (tenant.records.IntegrationConnection__c ?? []).map((record) =>
          record.Id === id ? deps.integrationConnectionRecord(updated, String(record.OwnerId ?? principal.userId)) : record)
      }
    });
    return res.json({ connection: deps.publicIntegrationConnection(updated, definition, credentials) });
  });
  deps.app.post('/api/integration-connections/:id/test', deps.requireAnyPermission('metadata:write', 'namedCredentials:manage'), deps.requirePermission('callouts:execute'), async (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const connection = tenant.integrationConnections.find((item) => item.id === deps.routeParam(req, 'id'));
    if (!connection) return res.status(404).json({ error: 'Integration Connection was not found' });
    const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey);
    if (!definition) return res.status(422).json({ error: 'The connector provider definition is unavailable' });

    let result: ConnectorTestResult;
    let credentials: Record<string, string> = {};
    if (connection.status !== 'ACTIVE' || definition.status !== 'ACTIVE') {
      result = { status: 'Failed', message: 'The Integration Connection and provider must both be active before testing.' };
    } else {
      try {
        credentials = deps.openIntegrationCredentials(principal.tenantId, connection);
        result = await deps.executeConnectorTest(definition, connection.configuration, credentials, async (url, method, headers, timeoutMs) =>
          new Promise((resolve, reject) => {
            let responseSize = 0;
            let timer: ReturnType<typeof setTimeout>;
            const request = deps.httpsRequest(url, {
              method,
              headers,
              timeout: timeoutMs,
              maxHeaderSize: 16 * 1024,
              lookup: (hostname, options, callback) => {
                if (deps.isReservedHostname(hostname)) {
                  callback(new Error('Connector test host is reserved'), '', 0);
                  return;
                }
                void deps.lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
                  if (!addresses.length || addresses.some((address) => !deps.isPublicAddress(address.address))) {
                    callback(new Error('Connector test DNS resolved to a private or reserved address'), '', 0);
                    return;
                  }
                  const selected = addresses[0];
                  if (options && typeof options === 'object' && 'all' in options && options.all) callback(null, [selected]);
                  else callback(null, selected.address, selected.family);
                }).catch(() => callback(new Error('Connector test host could not be resolved safely'), '', 0));
              }
            }, (incoming) => {
              const chunks: Buffer[] = [];
              incoming.on('data', (chunk: Buffer | string) => {
                const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                responseSize += data.length;
                if (responseSize > 64 * 1024) {
                  request.destroy(new Error('Connector test response exceeded the size limit'));
                  return;
                }
                chunks.push(data);
              });
              incoming.on('end', () => {
                clearTimeout(timer);
                const text = Buffer.concat(chunks).toString('utf8');
                let body: unknown = text;
                if (text) {
                  try { body = JSON.parse(text) as unknown; } catch { /* Keep non-JSON response content internal to validation. */ }
                }
                resolve({ status: incoming.statusCode ?? 0, body, headers: incoming.headers });
              });
              incoming.on('error', (error) => { clearTimeout(timer); reject(error); });
            });
            timer = setTimeout(() => request.destroy(Object.assign(new Error('Connector test timed out'), { code: 'ETIMEDOUT' })), timeoutMs);
            request.on('error', (error) => { clearTimeout(timer); reject(error); });
            request.end();
          })
        );
      } catch (error) {
        result = {
          status: 'Failed',
          message: error instanceof Error && error.message.includes('could not be decrypted')
            ? 'Saved credentials could not be decrypted; verify the credential encryption configuration.'
            : 'Connection test could not be completed; verify the saved credentials and configuration.'
        };
      }
    }

    const lastTestedAt = new Date().toISOString();
    const updated = deps.integrationConnectionSchema.parse({
      ...connection,
      testStatus: result.status,
      lastTestedAt,
      lastTestMessage: result.message
    });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant,
      integrationConnections: tenant.integrationConnections.map((item) => item.id === connection.id ? updated : item),
      records: {
        ...tenant.records,
        IntegrationConnection__c: (tenant.records.IntegrationConnection__c ?? []).map((record) =>
          record.Id === connection.id ? deps.integrationConnectionRecord(updated, String(record.OwnerId ?? principal.userId)) : record)
      }
    });
    return res.json({ result: { ...result, lastTestedAt }, connection: deps.publicIntegrationConnection(updated, definition, credentials) });
  });
}
