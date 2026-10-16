import type { Request, Response } from "express";
import type { CredentialManagementRoutesDependencies, NamedCredentialPayload } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerCredentialManagementRoutes(deps: CredentialManagementRoutesDependencies): void {
  deps.app.post('/api/named-credentials/:id/oauth/start',
    deps.requireAnyPermission('namedCredentials:manage','connectorApps:edit'),async(req:Request,res:Response)=>{
    const principal=deps.getPrincipal(res);
    const tenant=deps.tenantData(principal.tenantId);
    const credential=tenant?.namedCredentials.find(item=>item.id===deps.routeParam(req,'id'));
    if(!tenant || !credential)return res.status(404).json({error:'Named Credential not found.'});
    const managed=deps.managedConnector(tenant,credential.name);
    if(managed) {
      if(!deps.connectorRight(principal,'edit') || !deps.connectorRight(principal,'secrets'))
        return res.status(403).json({error:'Missing connector configuration or secret permission.'});
    } else if(!principal.permissions.includes('namedCredentials:manage'))
      return res.status(403).json({error:'Named Credential management permission required.'});
    if(credential.authType!=='OAuth Authorization Code'||credential.protocol!=='HTTPS')
      return res.status(400).json({error:'Credential is not configured for OAuth Authorization Code.'});
    const entitlement=deps.connectorEntitlement(tenant.records.Connector_App__c??[],credential);
    if(!entitlement.allowed)return res.status(403).json({error:entitlement.message});
    if(credential.enabled===false)return res.status(409).json({error:'Enable the connection before authorization.'});
    const conf=credential.configuration??{};
    if(!conf.AuthorizationEndpoint || !conf.OAuthEndpoint || !conf.ClientId)
      return res.status(400).json({error:'OAuth endpoints and ClientId are required.'});
    try {
      const callback=deps.configuredOAuthCallback();
      const url=await deps.beginOAuthAuthorization({
        authorizationUrl:conf.AuthorizationEndpoint,tokenUrl:conf.OAuthEndpoint,
        clientId:conf.ClientId,scope:conf.Scope,redirectUri:callback
      },{tenantId:principal.tenantId,credentialId:credential.id},deps.oauthChallengeStore());
      return res.json({authorizationUrl:url});
    } catch {
      return res.status(503).json({error:'OAuth authorization could not start. Verify the configured callback, encryption and PostgreSQL challenge table.'});
    }
  });
  // The external provider redirects here; an unguessable, SQL-backed one-time state authorizes the callback.
  deps.app.get('/api/oauth/callback',async(req:Request,res:Response)=>{
    const stateValue=typeof req.query.state==='string'?req.query.state:'';
    const code=typeof req.query.code==='string'?req.query.code:'';
    if(!/^[A-Za-z0-9_-]{20,1024}$/.test(stateValue) || !code || code.length>8192)
      return res.status(400).type('text/plain').send('OAuth authorization was not completed.');
    try {
      const stateDigest=deps.createHash('sha256').update(stateValue).digest('hex');
      const challenges=deps.oauthChallengeStore();
      const scope=await challenges.findScope(stateDigest);
      const tenant=scope?deps.tenantData(scope.tenantId):null;
      const credential=tenant?.namedCredentials.find(item=>item.id===scope?.credentialId);
      if(!scope || !credential || credential.authType!=='OAuth Authorization Code'||credential.protocol!=='HTTPS'
        || credential.enabled===false)throw new Error('OAuth session unavailable.');
      const entitlement=deps.connectorEntitlement(tenant?.records.Connector_App__c??[],credential);
      if(!entitlement.allowed)throw new Error('Connector is not licensed.');
      const conf=credential.configuration??{};
      const clientSecret=deps.openCredentialPayload(scope.tenantId,credential).secret;
      if(!clientSecret || !conf.ClientId || !conf.OAuthEndpoint)throw new Error('OAuth settings unavailable.');
      await deps.completeOAuthAuthorization({
        clientId:conf.ClientId,clientSecret,tokenUrl:conf.OAuthEndpoint,scope:conf.Scope
      },scope,{state:stateValue,code},challenges,deps.oauthCredentialVault(scope.tenantId,scope.credentialId),
        deps.safeOAuthTokenRequest);
      res.setHeader('Cache-Control','no-store');
      return res.status(200).type('text/plain').send('Connection authorized. You may close this window.');
    } catch {
      res.setHeader('Cache-Control','no-store');
      return res.status(400).type('text/plain').send('OAuth authorization failed or expired. Start authorization again from Named Credentials.');
    }
  });
  deps.app.post('/api/named-credentials', deps.requireAnyPermission('namedCredentials:manage', 'connectorApps:edit'), (req: Request, res: Response) => {
    const parsed = deps.namedCredentialRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Named Credential', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const managed = deps.managedConnector(tenant, parsed.data.name);
    if (managed && (!deps.connectorRight(principal, 'edit')
      || (parsed.data.secret && !deps.connectorRight(principal, 'secrets'))))
      return res.status(403).json({ error: 'Missing connector configuration or Manage Secrets permission.' });
    if (!managed && !principal.permissions.includes('namedCredentials:manage'))
      return res.status(403).json({ error: 'Missing Named Credentials management permission.' });
    const packageEntitlement = deps.connectorEntitlement(tenant.records.Connector_App__c ?? [],
      {id: '', name: parsed.data.name});
    if (!packageEntitlement.allowed) return res.status(403).json({error:packageEntitlement.message});
    if (tenant.namedCredentials.some((credential) => credential.name === parsed.data.name)) {
      return res.status(409).json({ error: `Named Credential "${parsed.data.name}" already exists` });
    }
    const now = new Date().toISOString();
    const id = deps.randomUUID();
    try {
      const authType = parsed.data.authType;
      const secret = parsed.data.secret;
      const username = parsed.data.username?.trim();
      if (authType !== 'None' && !secret) return res.status(400).json({ error: 'Provide a secret for this authentication type' });
      if (authType === 'Basic' && !username) return res.status(400).json({ error: 'Basic authentication requires a username' });
      const sealed = deps.sealCredentialPayload(principal.tenantId, id, {
        ...(authType === 'Basic' && username ? { username } : {}),
        ...(authType !== 'None' && secret ? { secret } : {})
      });
      const credential = deps.namedCredentialSchema.parse({
        id, name: parsed.data.name, label: parsed.data.label,
        protocol: parsed.data.protocol,
        baseUrl: parsed.data.baseUrl.endsWith('/') ? parsed.data.baseUrl : `${parsed.data.baseUrl}/`,
        authType, headerName: parsed.data.headerName?.trim() || undefined,
        configuration: parsed.data.configuration ?? {},
        enabled: !managed,
        ...sealed, createdAt: now, updatedAt: now
      });
      const updatedTenant = { ...tenant, namedCredentials: [...tenant.namedCredentials, credential] };
      deps.persistTenantRecords(principal.tenantId, updatedTenant);
      return res.status(201).json({ credential: deps.publicNamedCredential(credential) });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create Named Credential' });
    }
  });
  deps.app.put('/api/named-credentials/:id', deps.requireAnyPermission('namedCredentials:manage', 'connectorApps:edit'), (req: Request, res: Response) => {
    const parsed = deps.namedCredentialRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Named Credential', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const existing = tenant.namedCredentials.find((credential) => credential.id === deps.routeParam(req, 'id'));
    if (!existing) return res.status(404).json({ error: 'Named Credential was not found' });
    const managedExisting = deps.managedConnector(tenant, existing.name);
    if (managedExisting && (!deps.connectorRight(principal, 'edit')
      || ((parsed.data.secret || parsed.data.username || parsed.data.authType !== existing.authType) && !deps.connectorRight(principal, 'secrets'))))
      return res.status(403).json({ error: 'Missing connector configuration or Manage Secrets permission.' });
    if (!managedExisting && !principal.permissions.includes('namedCredentials:manage'))
      return res.status(403).json({ error: 'Missing Named Credentials management permission.' });
    if (existing.name !== parsed.data.name && (tenant.records.Connector_App__c ?? []).some((app) => app.CredentialName__c === existing.name)) {
      return res.status(403).json({error:'Managed connector credential API names cannot be changed.'});
    }
    const entitlement = deps.connectorEntitlement(tenant.records.Connector_App__c ?? [], existing);
    if (!entitlement.allowed) return res.status(403).json({error:entitlement.message});
    if (tenant.dashboardSubscriptions.some((subscription) =>
      subscription.namedCredentialId === existing.id && parsed.data.protocol !== 'SMTP')) {
      return res.status(409).json({ error: 'Named Credential is used by a dashboard subscription and must remain SMTP' });
    }
    if (tenant.emailAlerts.some((alert) => alert.namedCredentialId === existing.id && parsed.data.protocol !== 'SMTP')) {
      return res.status(409).json({ error: 'Named Credential is used by an Email Alert and must remain SMTP' });
    }
    if (tenant.namedCredentials.some((credential) => credential.id !== existing.id && credential.name === parsed.data.name)) {
      return res.status(409).json({ error: `Named Credential "${parsed.data.name}" already exists` });
    }
    try {
      const sameAuthType = existing.authType === parsed.data.authType;
      const shouldPreserveSecret = parsed.data.authType !== 'None' && !parsed.data.secret && sameAuthType;
      if (parsed.data.authType !== 'None' && !parsed.data.secret && !shouldPreserveSecret) {
        return res.status(400).json({ error: 'Provide a new secret when changing the authentication type' });
      }
      const payload: NamedCredentialPayload = shouldPreserveSecret
        ? {
            ...deps.openCredentialPayload(principal.tenantId, existing),
            ...(parsed.data.authType === 'Basic' && parsed.data.username?.trim() ? { username: parsed.data.username.trim() } : {})
          }
        : {
            ...(parsed.data.authType === 'Basic' && parsed.data.username?.trim() ? { username: parsed.data.username.trim() } : {}),
            ...(parsed.data.authType !== 'None' && parsed.data.secret ? { secret: parsed.data.secret } : {})
          };
      if (sameAuthType && ['OAuth Client Credentials','OAuth Authorization Code'].includes(parsed.data.authType)
        && JSON.stringify(existing.configuration ?? {}) !== JSON.stringify(parsed.data.configuration ?? {}))
        delete payload.oauthToken;
      if (parsed.data.authType === 'Basic' && !payload.username) {
        return res.status(400).json({ error: 'Basic authentication requires a username and password' });
      }
      const now = new Date().toISOString();
      const sealed = deps.sealCredentialPayload(principal.tenantId, existing.id, payload);
      const credential = deps.namedCredentialSchema.parse({
        ...existing, name: parsed.data.name, label: parsed.data.label,
        protocol: parsed.data.protocol,
        baseUrl: parsed.data.baseUrl.endsWith('/') ? parsed.data.baseUrl : `${parsed.data.baseUrl}/`,
        authType: parsed.data.authType, headerName: parsed.data.headerName?.trim() || undefined,
        configuration: parsed.data.configuration ?? existing.configuration ?? {},
        ...sealed, updatedAt: now
      });
      const updatedTenant = { ...tenant, namedCredentials: tenant.namedCredentials.map((item) => item.id === credential.id ? credential : item) };
      deps.persistTenantRecords(principal.tenantId, updatedTenant);
      return res.json({ credential: deps.publicNamedCredential(credential) });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update Named Credential' });
    }
  });
  deps.app.delete('/api/named-credentials/:id', deps.requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const id = deps.routeParam(req, 'id');
    const existing = tenant.namedCredentials.find((credential) => credential.id === id);
    if (!existing) return res.status(404).json({ error: 'Named Credential was not found' });
    if ((tenant.records.Connector_App__c ?? []).some((app) => app.CredentialName__c === existing.name)) {
      return res.status(409).json({error:'Connector credentials are retained on uninstall and cannot be deleted from this endpoint.'});
    }
    const references = tenant.flows.flatMap((flow) => flow.elements
      .filter((element) => ['HTTP Callout', 'Action'].includes(element.type) && element.config.namedCredentialId === id)
      .map((element) => `${flow.label} / ${element.label}`));
    references.push(...tenant.dashboardSubscriptions
      .filter((subscription) => subscription.namedCredentialId === id)
      .map((subscription) => `Dashboard ${subscription.dashboardApiName} / ${subscription.label}`));
    references.push(...tenant.emailAlerts
      .filter((alert) => alert.namedCredentialId === id)
      .map((alert) => `Email Alert ${alert.label}`));
    if (references.length) return res.status(409).json({ error: `Named Credential is in use by: ${references.join(', ')}` });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant, namedCredentials: tenant.namedCredentials.filter((credential) => credential.id !== id)
    });
    return res.status(204).end();
  });
  deps.app.post('/api/named-credentials/:id/test', deps.requireAnyPermission('namedCredentials:manage', 'connectorApps:test'), async (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const credential = deps.tenantData(principal.tenantId)?.namedCredentials.find((item) => item.id === deps.routeParam(req, 'id'));
    if (!credential) return res.status(404).json({ error: 'Named Credential was not found' });
    const currentTenant = deps.tenantData(principal.tenantId)!;
    const testApp = deps.managedConnector(currentTenant, credential.name);
    if (testApp && !deps.connectorRight(principal, 'test'))
      return res.status(403).json({ error: 'Missing connectorApps:test permission.' });
    if (!testApp && !principal.permissions.includes('namedCredentials:manage'))
      return res.status(403).json({ error: 'Missing Named Credentials management permission.' });
    const entitlement = deps.connectorEntitlement(deps.tenantData(principal.tenantId)?.records.Connector_App__c ?? [], credential);
    if (!entitlement.allowed) return res.status(403).json({ error: entitlement.message });
    if (credential.enabled === false) return res.status(409).json({ error: 'Enable the saved connection before testing.' });
    if (credential.protocol === 'SMTP') {
      try {
        const target = new URL(credential.baseUrl);
        const host = target.hostname;
        if (target.protocol !== 'smtp:' || deps.isReservedHostname(host) || (deps.isIP(host) && !deps.isPublicAddress(host))) {
          return res.status(400).json({ error: 'SMTP test destination must be a public SMTP host' });
        }
        const addresses = await deps.lookup(host, { all: true, verbatim: true });
        if (!addresses.length || addresses.some((address) => !deps.isPublicAddress(address.address))) {
          return res.status(400).json({ connected: false, message: 'SMTP host did not resolve to public IP addresses.' });
        }
        const payload = deps.namedCredentialPayloadSchema.parse(deps.openCredentialPayload(principal.tenantId, credential));
        if (credential.authType === 'Basic' && (!payload.username || !payload.secret)) {
          return res.status(400).json({ error: 'SMTP username and password are required' });
        }
        const port = Number(target.port || 25);
        const transporter = deps.nodemailer.createTransport({
          host: addresses[0].address,
          port,
          secure: port === 465,
          requireTLS: port !== 465,
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 10000,
          tls: { servername: host, minVersion: 'TLSv1.2' },
          ...(credential.authType === 'Basic' ? { auth: { user: payload.username!, pass: payload.secret! } } : {})
        });
        try {
          await transporter.verify();
          return res.json({ connected: true, message: 'SMTP server connection, TLS and authentication verified. No email was sent.' });
        } finally {
          transporter.close();
        }
      } catch {
        return res.json({ connected: false, message: 'SMTP connection or authentication failed. Check host, port, TLS and credentials.' });
      }
    }
    const rawTestPath = typeof testApp?.TestPath__c === 'string' ? testApp.TestPath__c : '';
    const missingTestVariable = [...rawTestPath.matchAll(/\{!([A-Za-z][A-Za-z0-9_]*)\}/g)]
      .find((match) => !credential.configuration?.[match[1]]);
    if (missingTestVariable)
      return res.status(400).json({ error: 'Test endpoint needs a configured ' + missingTestVariable[1] + '.' });
    const expandedTestPath = rawTestPath.replace(/\{!([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, field: string) =>
      encodeURIComponent(credential.configuration?.[field] ?? ''));
    if (expandedTestPath.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(expandedTestPath) || expandedTestPath.includes('..'))
      return res.status(400).json({ error: 'Test endpoint must be a safe relative path.' });
    // A saved credential may already point at the resource named in the connector's
    // metadata test path. Avoid appending the same final segment twice (e.g. phone ID).
    const credentialBase = new URL(credential.baseUrl);
    const baseSegments = credentialBase.pathname.split('/').filter(Boolean);
    const pathPart = expandedTestPath.split(/[?#]/, 1)[0];
    const relativeSegments = pathPart.split('/').filter(Boolean);
    const alreadyAtTarget = relativeSegments.length > 0
      && relativeSegments.length <= baseSegments.length
      && relativeSegments.every((segment, index) =>
        segment === baseSegments[baseSegments.length - relativeSegments.length + index]);
    const resolvedTestPath = alreadyAtTarget
      ? expandedTestPath.slice(pathPart.length) || '?fields=id'
      : expandedTestPath;
    const url = new URL(resolvedTestPath, credential.baseUrl);
    // Graph-style resource endpoints commonly require /resource?fields=..., not
    // /resource/?fields=.... Normalize only the exact already-targeted resource.
    if (alreadyAtTarget && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    const basePathWithoutSlash = credentialBase.pathname.replace(/\/$/, '');
    if (url.origin !== credentialBase.origin
      || !(url.pathname === basePathWithoutSlash || url.pathname.startsWith(credentialBase.pathname)))
      return res.status(400).json({ error: 'Test endpoint must remain inside the configured base URL.' });
    if (url.protocol !== 'https:' || deps.isReservedHostname(url.hostname) || (deps.isIP(url.hostname) && !deps.isPublicAddress(url.hostname))) {
      return res.status(400).json({ error: 'Test destination is not a public HTTPS host' });
    }
    try {
      const payload = deps.openCredentialPayload(principal.tenantId, credential);
      if (credential.authType !== 'None' && !payload.secret) return res.status(400).json({ error: 'Authentication secret is not configured' });
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (credential.authType === 'Bearer') headers.Authorization = `Bearer ${payload.secret}`;
      if (credential.authType === 'OAuth Client Credentials' || credential.authType === 'OAuth Authorization Code')
        headers.Authorization = `Bearer ${await deps.oauthAccessTokenForCredential(principal.tenantId,credential)}`;
      if (credential.authType === 'Basic') headers.Authorization = `Basic ${Buffer.from(`${payload.username ?? ''}:${payload.secret}`).toString('base64')}`;
      if (credential.authType === 'API Key') headers[credential.headerName!] = payload.secret!;
      const status = await new Promise<number>((resolve, reject) => {
        const request = deps.httpsRequest(url, {
          method: testApp?.TestMethod__c === 'HEAD' ? 'HEAD' : 'GET', headers, timeout: 8000, maxHeaderSize: 16384,
          lookup: (hostname, options, callback) => {
            if (deps.isReservedHostname(hostname)) return callback(new Error('Reserved destination'), '', 0);
            void deps.lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
              if (!addresses.length || addresses.some((address) => !deps.isPublicAddress(address.address))) return callback(new Error('Non-public destination'), '', 0);
              const selected = addresses[0];
              if (options && typeof options === 'object' && 'all' in options && options.all) callback(null, [selected]);
              else callback(null, selected.address, selected.family);
            }).catch(() => callback(new Error('DNS resolution failed'), '', 0));
          }
        }, (incoming) => {
          const code = incoming.statusCode ?? 0;
          incoming.destroy();
          resolve(code);
        });
        request.on('timeout', () => request.destroy(new Error('Connection timed out')));
        request.on('error', reject);
        request.end();
      });
      const connected = status >= 200 && status < 300;
      return res.json({ connected, status, message: connected
        ? 'HTTPS endpoint responded successfully.'
        : status === 401 || status === 403 ? 'Endpoint responded but rejected authentication.'
        : 'Endpoint responded with HTTP ' + status + '. Check the API path and permissions.' });
    } catch {
      return res.json({ connected: false, message: 'Unable to reach or authenticate with the HTTPS endpoint. Check the URL, DNS and credentials.' });
    }
  });
  // A base-URL GET is a connectivity probe, not a provider-specific API health check.
  // Providers requiring an endpoint path or POST need a configurable test operation.
  deps.app.post('/api/named-credentials/:id/rotate', deps.requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const credential = tenant.namedCredentials.find((item) => item.id === deps.routeParam(req, 'id'));
    if (!credential) return res.status(404).json({ error: 'Named Credential was not found' });
    try {
      const ring = deps.credentialKeyRing();
      const payload = deps.openCredentialPayload(principal.tenantId, credential, ring);
      const next = deps.namedCredentialSchema.parse({
        ...credential, ...deps.sealCredentialPayload(principal.tenantId, credential.id, payload, ring),
        updatedAt: new Date().toISOString()
      });
      deps.persistTenantRecords(principal.tenantId, {
        ...tenant, namedCredentials: tenant.namedCredentials.map((item) => item.id === next.id ? next : item)
      });
      return res.json({ credential: deps.publicNamedCredential(next) });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to rotate Named Credential encryption' });
    }
  });
}
