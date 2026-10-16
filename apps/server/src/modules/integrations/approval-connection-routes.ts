// Domain HTTP routes extracted from the oversized server entrypoint.
// @ts-nocheck
export function registerLegacyApprovalAndIntegrationRoutes(dependencies: Record<string, any>) {
  const { app, requireAnyPermission, requirePermission, getPrincipal, tenantData, state, routeParam, approvalProcessRequestSchema, activeFlowDefinition, approvalProcessSchema, persistTenantRecords, defaultAutomationSettings, automationSettingsSchema, connectorDefinitionRequestSchema, stampRecordAuditFields, integrationConnectionRequestSchema, integrationConnectionSchema, integrationConnectionRecord, publicIntegrationConnection, credentialKeyRing, openIntegrationCredentials, sealIntegrationCredentials, randomUUID, executeConnectorTest, httpsRequest, isPublicAddress, isReservedHostname, lookup, registerConnectorProviderListRoute } = dependencies;
app.put('/api/metadata/approval-processes/:apiName', requireAnyPermission('metadata:write', 'security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const parsed = approvalProcessRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid approval process', details: parsed.error.flatten() });
  if (parsed.data.apiName !== apiName) return res.status(400).json({ error: 'Approval process API name must match the requested resource' });
  const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
  if (!object) return res.status(400).json({ error: `Approval process object "${parsed.data.objectApiName}" does not exist` });
  const inactiveApprover = parsed.data.approverUserIds.find((userId) =>
    !state.users.some((user) => user.id === userId && user.tenantId === principal.tenantId && !user.disabled));
  if (inactiveApprover) return res.status(400).json({ error: `Approval process approver "${inactiveApprover}" must be an active user in this tenant` });
  const existing = tenant.approvalProcesses.find((item) => item.apiName === apiName);
  const activeFlowReferences = existing
    ? tenant.flows
      .map(activeFlowDefinition)
      .filter((flow): flow is FlowMetadata => flow !== undefined && flow.elements.some((element) =>
        element.type === 'Action' && element.config.actionType === 'Submit for Approval'
        && element.config.approvalProcessApiName === apiName))
      .map((flow) => flow.label)
    : [];
  if (activeFlowReferences.length && !parsed.data.active) {
    return res.status(409).json({
      error: `Approval process cannot be deactivated while referenced by active flows: ${activeFlowReferences.join(', ')}`
    });
  }
  if (existing && existing.objectApiName !== parsed.data.objectApiName && activeFlowReferences.length) {
    return res.status(409).json({
      error: `Approval process object cannot change while referenced by active flows: ${activeFlowReferences.join(', ')}`
    });
  }
  const now = new Date().toISOString();
  const approvalProcess = approvalProcessSchema.parse({
    ...parsed.data,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    approvalProcesses: existing
      ? tenant.approvalProcesses.map((item) => item.apiName === apiName ? approvalProcess : item)
      : [...tenant.approvalProcesses, approvalProcess]
  });
  return res.json({ approvalProcess });
});
app.delete('/api/metadata/approval-processes/:apiName', requireAnyPermission('metadata:write', 'security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const approvalProcess = tenant.approvalProcesses.find((item) => item.apiName === apiName);
  if (!approvalProcess) return res.status(404).json({ error: `Approval process "${apiName}" was not found` });
  const flowReferences = tenant.flows
    .filter((flow) => flow.elements.some((element) =>
      element.type === 'Action' && element.config.actionType === 'Submit for Approval'
      && element.config.approvalProcessApiName === apiName))
    .map((flow) => flow.label);
  if (flowReferences.length) return res.status(409).json({ error: `Approval process is referenced by flows: ${flowReferences.join(', ')}` });
  if (tenant.approvalRequests.some((item) => item.flowApiName && item.status === 'Pending'
    && item.processApiName === apiName)) {
    return res.status(409).json({ error: 'Approval process has pending approval requests' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    approvalProcesses: tenant.approvalProcesses.filter((item) => item.apiName !== apiName)
  });
  return res.status(204).end();
});
app.get('/api/metadata/flows/list', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const query = typeof req.query.search === 'string' ? req.query.search.trim().toLocaleLowerCase().slice(0, 160) : '';
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));
  const pageSize = 50;
  const matches = tenant.flows
    .filter((flow) => !query || [flow.label, flow.apiName, flow.flowType, flow.status].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => a.label.localeCompare(b.label));
  const offset = (page - 1) * pageSize;
  const list = matches.slice(offset, offset + pageSize).map((flow) => ({
    apiName: flow.apiName, label: flow.label, flowType: flow.flowType, status: flow.status,
    versionNumber: flow.versionNumber, activeVersion: flow.activeVersion,
    createdAt: flow.createdAt, createdBy: flow.createdBy,
    lastModifiedAt: flow.lastModifiedAt, lastModifiedBy: flow.lastModifiedBy
  }));
  return res.json({ flows: list, total: matches.length, page, pageSize });
});
app.get('/api/metadata/flows', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ flows: tenantData(getPrincipal(res).tenantId)?.flows ?? [] });
});
app.get('/api/metadata/automation-settings', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json(tenantData(getPrincipal(res).tenantId)?.automationSettings ?? defaultAutomationSettings);
});
app.put('/api/metadata/automation-settings', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const parsed = automationSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid automation settings', details: parsed.error.flatten() });
  const tenantId = getPrincipal(res).tenantId;
  const tenant = tenantData(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  persistTenantRecords(tenantId, { ...tenant, automationSettings: parsed.data });
  return res.json(parsed.data);
});
app.get('/api/metadata/flow-logs', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const logs = tenantData(getPrincipal(res).tenantId)?.flowLogs ?? [];
  res.json({ logs: [...logs].sort((left, right) => right.failedAt.localeCompare(left.failedAt)) });
});
app.get('/api/metadata/flow-interviews', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const usersById = new Map(state.users
    .filter((user) => user.tenantId === getPrincipal(res).tenantId)
    .map((user) => [user.id, user.name]));
  const interviews = tenant.interviews
    .map((interview) => {
      const flow = tenant.flows.find((candidate) =>
        candidate.apiName === interview.flowApiName && candidate.versionNumber === interview.versionNumber);
      const screen = flow?.elements.find((element) => element.id === interview.screenElementId);
      return {
        id: interview.id,
        flowApiName: interview.flowApiName,
        flowLabel: flow?.label ?? interview.flowApiName,
        versionNumber: interview.versionNumber,
        kind: interview.kind,
        userId: interview.userId,
        userName: usersById.get(interview.userId) ?? interview.userId,
        screenLabel: screen?.label ?? null,
        recordId: interview.record?.Id ?? null,
        createdAt: interview.createdAt,
        expiresAt: interview.expiresAt,
        waitUntil: interview.waitUntil,
        retryAt: interview.retryAt,
        attempts: interview.attempts
      };
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return res.json({ interviews });
});
app.delete('/api/metadata/flow-interviews/:interviewId', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const interviewId = routeParam(req, 'interviewId');
  if (!tenant.interviews.some((interview) => interview.id === interviewId)) {
    return res.status(404).json({ error: 'Pending Flow interview was not found' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    interviews: tenant.interviews.filter((interview) => interview.id !== interviewId),
    approvalRequests: tenant.approvalRequests.map((request) =>
      request.orchestrationInterviewId === interviewId && request.status === 'Pending'
        ? { ...request, status: 'Canceled' as const, decisionComments: 'Flow interview canceled.',
          decidedAt: new Date().toISOString(), decidedBy: principal.userId }
        : request)
  });
  return res.status(204).end();
});
registerConnectorProviderListRoute(app, { requirePermission, getPrincipal, tenantData });
app.put('/api/connector-providers/:connectorKey', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = connectorDefinitionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid connector provider definition', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const connectorKey = routeParam(req, 'connectorKey');
  const current = tenant.connectorDefinitions.find((item) => item.connectorKey === connectorKey);
  if (!current) return res.status(404).json({ error: 'Connector provider definition was not found' });
  if (parsed.data.connectorKey !== connectorKey) return res.status(400).json({ error: 'Connector key cannot be changed' });
  const definitions = tenant.connectorDefinitions.map((item) => item.connectorKey === connectorKey ? parsed.data : item);
  const now = new Date().toISOString();
  const providerRecords = (tenant.records.ConnectorProvider__c ?? []).map((record) =>
    record.ConnectorKey__c === connectorKey ? stampRecordAuditFields({
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
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    connectorDefinitions: definitions,
    records: { ...tenant.records, ConnectorProvider__c: providerRecords }
  });
  return res.json({ provider: parsed.data });
});
app.get('/api/integration-connections', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenantId = getPrincipal(res).tenantId;
  const tenant = tenantData(tenantId)!;
  const ring = tenant.integrationConnections.some((connection) => connection.credentialsCiphertext) ? credentialKeyRing() : undefined;
  const connections = tenant.integrationConnections.flatMap((connection) => {
    const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey);
    if (!definition) return [];
    return [publicIntegrationConnection(connection, definition, ring ? openIntegrationCredentials(tenantId, connection, ring) : {})];
  });
  res.json({ connections });
});
app.post('/api/integration-connections', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = integrationConnectionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Integration Connection', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === parsed.data.connectorKey && item.status === 'ACTIVE');
  if (!definition) return res.status(422).json({ error: 'Select an active connector provider definition' });
  const credentialNames = new Set(definition.credentialsSchema.filter((field) => field.secret).map((field) => field.name));
  const unknownCredential = Object.keys(parsed.data.credentials).find((name) => !credentialNames.has(name));
  if (unknownCredential) return res.status(400).json({ error: `Credential "${unknownCredential}" is not defined as a secret by this connector provider` });
  const plaintextSecret = Object.keys(parsed.data.configuration).find((name) => credentialNames.has(name));
  if (plaintextSecret) return res.status(400).json({ error: `Secret field "${plaintextSecret}" must be submitted as a credential so it can be encrypted` });
  const credentials = Object.fromEntries(Object.entries(parsed.data.credentials).filter(([, value]) => value.trim()));
  const id = randomUUID();
  const now = new Date().toISOString();
  const encrypted = Object.keys(credentials).length
    ? sealIntegrationCredentials(principal.tenantId, id, credentials)
    : { credentialKeyId: null, credentialIv: null, credentialAuthTag: null, credentialsCiphertext: null };
  const connection = integrationConnectionSchema.parse({
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
    integrationConnectionRecord(connection, principal.userId)
  ];
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    integrationConnections: [...tenant.integrationConnections, connection],
    records: { ...tenant.records, IntegrationConnection__c: records }
  });
  return res.status(201).json({ connection: publicIntegrationConnection(connection, definition, credentials) });
});
app.put('/api/integration-connections/:id', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = integrationConnectionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Integration Connection', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const id = routeParam(req, 'id');
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
  const existingCredentials = openIntegrationCredentials(principal.tenantId, current);
  const credentials = { ...existingCredentials, ...Object.fromEntries(Object.entries(parsed.data.credentials).filter(([, value]) => value.trim())) };
  const now = new Date().toISOString();
  const encrypted = Object.keys(credentials).length
    ? sealIntegrationCredentials(principal.tenantId, id, credentials)
    : { credentialKeyId: null, credentialIv: null, credentialAuthTag: null, credentialsCiphertext: null };
  const updated = integrationConnectionSchema.parse({
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
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    integrationConnections: tenant.integrationConnections.map((item) => item.id === id ? updated : item),
    records: {
      ...tenant.records,
      IntegrationConnection__c: (tenant.records.IntegrationConnection__c ?? []).map((record) =>
        record.Id === id ? integrationConnectionRecord(updated, String(record.OwnerId ?? principal.userId)) : record)
    }
  });
  return res.json({ connection: publicIntegrationConnection(updated, definition, credentials) });
});
app.post('/api/integration-connections/:id/test', requireAnyPermission('metadata:write', 'namedCredentials:manage'), requirePermission('callouts:execute'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const connection = tenant.integrationConnections.find((item) => item.id === routeParam(req, 'id'));
  if (!connection) return res.status(404).json({ error: 'Integration Connection was not found' });
  const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey);
  if (!definition) return res.status(422).json({ error: 'The connector provider definition is unavailable' });

  let result: ConnectorTestResult;
  let credentials: Record<string, string> = {};
  if (connection.status !== 'ACTIVE' || definition.status !== 'ACTIVE') {
    result = { status: 'Failed', message: 'The Integration Connection and provider must both be active before testing.' };
  } else {
    try {
      credentials = openIntegrationCredentials(principal.tenantId, connection);
      result = await executeConnectorTest(definition, connection.configuration, credentials, async (url, method, headers, timeoutMs) =>
        new Promise((resolve, reject) => {
          let responseSize = 0;
          let timer: ReturnType<typeof setTimeout>;
          const request = httpsRequest(url, {
            method,
            headers,
            timeout: timeoutMs,
            maxHeaderSize: 16 * 1024,
            lookup: (hostname, options, callback) => {
              if (isReservedHostname(hostname)) {
                callback(new Error('Connector test host is reserved'), '', 0);
                return;
              }
              void lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
                if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address))) {
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
  const updated = integrationConnectionSchema.parse({
    ...connection,
    testStatus: result.status,
    lastTestedAt,
    lastTestMessage: result.message
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    integrationConnections: tenant.integrationConnections.map((item) => item.id === connection.id ? updated : item),
    records: {
      ...tenant.records,
      IntegrationConnection__c: (tenant.records.IntegrationConnection__c ?? []).map((record) =>
        record.Id === connection.id ? integrationConnectionRecord(updated, String(record.OwnerId ?? principal.userId)) : record)
    }
  });
  return res.json({ result: { ...result, lastTestedAt }, connection: publicIntegrationConnection(updated, definition, credentials) });
});
}
