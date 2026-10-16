import type { Request, Response } from "express";
import type { IntegrationsWebhookRoutesDependencies, TenantData } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerIntegrationsWebhookRoutes(deps: IntegrationsWebhookRoutesDependencies): void {
  deps.app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const expected = process.env.METADRIVE_WHATSAPP_VERIFY_TOKEN;
    const supplied = req.query['hub.verify_token'];
    if (!expected || typeof supplied !== 'string' || req.query['hub.mode'] !== 'subscribe') {
      return res.sendStatus(403);
    }
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    if (left.length !== right.length || !deps.timingSafeEqual(left, right)) return res.sendStatus(403);
    const challenge = req.query['hub.challenge'];
    if (typeof challenge !== 'string' || !/^\d+$/.test(challenge)) return res.sendStatus(400);
    return res.status(200).type('text/plain').send(challenge);
  });
  deps.app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    const reject = (status: number, reason: string) => { console.warn('[WhatsApp webhook] rejected', { status, reason }); return res.sendStatus(status); };
    console.info('[WhatsApp webhook] delivery received');
    const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.METADRIVE_WHATSAPP_APP_SECRET;
    const signature = req.get('x-hub-signature-256');
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!appSecret) return reject(503, 'app_secret_not_configured');
    if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !rawBody) return reject(403, 'missing_or_invalid_signature');
    const digest = 'sha256=' + deps.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const supplied = Buffer.from(signature.toLowerCase());
    const expected = Buffer.from(digest);
    if (supplied.length !== expected.length || !deps.timingSafeEqual(supplied, expected)) return reject(403, 'signature_mismatch');
    const payload = req.body as { object?: unknown; entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string; display_phone_number?: string }; messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } }> } }> }> };
    if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) { console.info('[WhatsApp webhook] ignored unsupported payload'); return res.sendStatus(200); }
    const phoneIds = [...new Set(payload.entry.flatMap(entry => (entry.changes ?? []).filter(change => (change.value?.messages?.length ?? 0) > 0).map(change => change.value?.metadata?.phone_number_id?.trim()).filter((id): id is string => Boolean(id))))];
    if (!phoneIds.length) { console.info('[WhatsApp webhook] no inbound messages'); return res.sendStatus(200); }
    if (phoneIds.length !== 1) return reject(503, 'multiple_phone_ids_in_delivery');
    const phoneId = phoneIds[0];
    // Match only the phone ID in a trusted Meta Graph API URL path, never a substring.
    const matchesMetaPhoneUrl = (rawUrl: string | undefined): boolean => {
      if (!rawUrl) return false;
      try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'graph.facebook.com' || url.username || url.password || url.port) return false;
        const segments = url.pathname.split('/').filter(Boolean);
        return /^v\d+\.\d+$/.test(segments[0] ?? '') && segments[1] === phoneId && (segments.length === 2 || (segments.length === 3 && segments[2] === 'messages'));
      } catch { return false; }
    };
    const matchesNamedCredential = (data: TenantData, credentialRef: unknown): boolean => {
      if (typeof credentialRef !== 'string' || !credentialRef.trim()) return false;
      const ref = credentialRef.trim();
      return data.namedCredentials.some(credential =>
        (credential.id === ref || credential.name === ref)
        && credential.protocol === 'HTTPS'
        && matchesMetaPhoneUrl(credential.baseUrl)
      );
    };
    const matches = Object.entries(deps.state.tenants).filter(([tenantId, data]) =>
      deps.tenantIsActive(tenantId) && data.namedCredentials.some(credential => {
        const config = credential.configuration ?? {};
        return (credential.name.toLowerCase().includes('whatsapp') || credential.label.toLowerCase().includes('whatsapp'))
          && (config.PhoneNumberId === phoneId || config.phone_number_id === phoneId
            || matchesMetaPhoneUrl(config.ApiBaseUrl) || matchesMetaPhoneUrl(credential.baseUrl));
      }) || (data.records.UneConnector__c ?? []).some(record => {
        if (String(record.ConnectorType__c ?? '').toLowerCase() !== 'whatsapp') return false;
        if (typeof record.Configuration__c !== 'string') return false;
        try {
          const configuration: unknown = JSON.parse(record.Configuration__c);
          if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return false;
          const values = configuration as Record<string, unknown>;
          return values.PhoneNumberId === phoneId || (typeof values.ApiBaseUrl === 'string' && matchesMetaPhoneUrl(values.ApiBaseUrl)) || matchesNamedCredential(data, values.NamedCredential);
        } catch { return false; }
      })
      || data.connectorSettings.some(setting => {
        if (setting.apiName !== 'WhatsApp') return false;
        const fields = Object.fromEntries(setting.fields.map(field => [field.apiName, field.value.trim()]));
        return fields.PhoneNumberId === phoneId || matchesMetaPhoneUrl(fields.ApiBaseUrl) || matchesNamedCredential(data, fields.NamedCredential);
      })
      || data.integrationConnections.some(connection => {
        if (connection.connectorKey.toUpperCase() !== 'WHATSAPP' || connection.status !== 'ACTIVE') return false;
        return connection.configuration.phone_number_id?.trim() === phoneId
          || matchesMetaPhoneUrl(connection.configuration.base_url)
          || matchesMetaPhoneUrl(connection.configuration.api_base_url);
      })
    );
    if (matches.length !== 1) {
      // Structural diagnostics only: never log IDs, phone numbers, URLs, tokens, or credentials.
      const connectorDiagnostics = Object.values(deps.state.tenants).map(data => {
        const records = data.records.UneConnector__c ?? [];
        const whatsappRecords = records.filter(record => String(record.ConnectorType__c ?? '').trim().toLowerCase() === 'whatsapp');
        const shapes = whatsappRecords.map(record => {
          if (typeof record.Configuration__c !== 'string') return 'configuration_not_string';
          try {
            const parsed: unknown = JSON.parse(record.Configuration__c);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'configuration_not_object';
            const config = parsed as Record<string, unknown>;
            const rawUrl = typeof config.ApiBaseUrl === 'string' ? config.ApiBaseUrl : '';
            let urlShape = 'missing';
            if (rawUrl) {
              try {
                const url = new URL(rawUrl);
                const segments = url.pathname.split('/').filter(Boolean);
                urlShape = url.hostname === 'graph.facebook.com'
                  ? (segments.length === 2 ? 'graph_two_segments' : segments.length === 3 ? 'graph_three_segments' : 'graph_other_segments')
                  : 'non_graph_host';
              } catch { urlShape = 'invalid_url'; }
            }
            return {
              hasPhoneNumberId: typeof config.PhoneNumberId === 'string' && Boolean(config.PhoneNumberId.trim()),
              urlShape,
              matchesPhoneNumberId: typeof config.PhoneNumberId === 'string' && config.PhoneNumberId.trim() === phoneId,
              matchesApiBaseUrl: matchesMetaPhoneUrl(rawUrl)
            };
          } catch { return 'invalid_configuration_json'; }
        });
        return { connectorRecords: records.length, whatsappRecords: whatsappRecords.length, shapes,
          legacyWhatsAppSettings: data.connectorSettings.filter(item => item.apiName === 'WhatsApp').length,
          activeIntegrationConnections: data.integrationConnections.filter(item => item.connectorKey.toUpperCase() === 'WHATSAPP' && item.status === 'ACTIVE').length };
      });
      console.warn('[WhatsApp webhook] tenant mapping diagnostics', JSON.stringify({ tenantCount: connectorDiagnostics.length, matchCount: matches.length, connectors: connectorDiagnostics }));
      return reject(503, matches.length ? 'ambiguous_phone_tenant_mapping' : 'phone_tenant_mapping_not_configured');
    }
    const [tenantId, tenant] = matches[0];
    const users = deps.state.users.filter(user => user.tenantId === tenantId && !user.disabled);
    const systemUser = users.find(user => user.role === 'System Administrator') ?? users.find(user => user.permissionSetIds.includes('system-administrator'));
    if (!systemUser) return reject(503, 'tenant_system_administrator_unavailable');
    const userId = systemUser.id;
    const object = tenant.objects.find(item => item.apiName === deps.communicationObjectApiName);
    if (!object) return reject(503, 'message_object_missing');
    let working = tenant;
    let received = 0;
    let saved = 0;
    let duplicate = 0;
    let unsupported = 0;
    try {
      for (const entry of payload.entry) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          for (const message of value?.messages ?? []) {
            if (!message.id || !message.from) continue;
            received++;
            if ((working.records[object.apiName] ?? []).some(item => item.Event_Type__c === 'Message' && item.Communication_Mode__c === 'WhatsApp' && item.Provider_Message_Id__c === message.id)) { duplicate++; continue; }
            const body = message.type === 'text' ? message.text?.body : undefined;
            if (!body) { unsupported++; continue; } // Unsupported message types are acknowledged.
            // Do not re-execute an old delivery after an outage or redelivery.
            // Keep the event as an Expired record for audit, without running its Flow.
            const fresh = deps.shouldTriggerInboundMessage(
              message.timestamp, Date.now(), working.automationSettings.conversationIdleMinutes
            );
            working = structuredClone(deps.tenantData(tenantId) ?? working);
            const currentContext = deps.activeConversationContext(
              working.records[object.apiName] ?? [], message.from, Date.now(),
              working.automationSettings.conversationIdleMinutes
            );
            const conversationKey = deps.conversationKeyForIncoming(
              working.records[object.apiName] ?? [], message.from, Date.now(),
              working.automationSettings.conversationIdleMinutes, currentContext
            );
            const nowForIncoming = new Date().toISOString();
            const values = deps.applyRecordDefaults(tenantId, working, object, deps.sanitizeRecordValues(object, {
              Event_Type__c: 'Message', Communication_Mode__c: 'WhatsApp', Source__c: 'Webhook',
              Direction__c: 'Incoming', From_Number__c: message.from,
              Channel_Account__c: phoneId,
              To_Number__c: value?.metadata?.display_phone_number ?? '',
              Message_Body__c: body, Conversation_Key__c: conversationKey,
              Conversation_Context__c: currentContext,
              Status__c: fresh ? 'Received' : 'Expired', Provider_Message_Id__c: message.id, Occurred_At__c: nowForIncoming,
              ...(message.timestamp && /^\\d+$/.test(message.timestamp) ? { Occurred_At__c: new Date(Number(message.timestamp) * 1000).toISOString() } : {})
            }), userId);
            deps.validateRuntimeRecord(tenantId, working, object, values);
            const now = new Date().toISOString();
            let record = deps.calculateFormulaFields(object, deps.stampRecordAuditFields({
              ...values, Id: deps.randomUUID(), CreatedDate: now, LastModifiedDate: now
            }, userId, now), deps.formulaContextForUser(working, userId));
            if (fresh) await deps.runBeforeSaveRecordTriggeredFlows(tenantId, working, userId, object.apiName, 'created', record);
            const selectedContext = typeof record.Conversation_Context__c === 'string' ? record.Conversation_Context__c : '';
            if (fresh && selectedContext && selectedContext !== currentContext) {
              record.Conversation_Key__c = deps.conversationKeyForIncoming(
                working.records[object.apiName] ?? [], message.from, Date.now(),
                working.automationSettings.conversationIdleMinutes, selectedContext
              );
            }
            record = deps.calculateFormulaFields(object, record, deps.formulaContextForUser(working, userId));
            working.records[object.apiName] = [...(working.records[object.apiName] ?? []), record];
            // Each inbound message refreshes active conversational interviews; 15 minutes is inactivity, not total age.
            const renewedExpiry = new Date(Date.now() + working.automationSettings.conversationIdleMinutes * 60_000).toISOString();
            working.interviews = working.interviews.map(interview =>
              deps.sameConversationSession(interview.record, record)
                && (interview.kind === 'wait' || interview.kind === 'scheduled')
                ? { ...interview, expiresAt: renewedExpiry } : interview
            );
            saved++;
            // Commit inbound identity BEFORE external flow callouts. Meta redeliveries must never resend replies.
            deps.persistTenantRecords(tenantId, working);
            await deps.waitForPersistedState();
            if (!fresh) {
              console.info('[WhatsApp webhook] stale inbound delivery archived without executing flow');
              working = deps.tenantData(tenantId) ?? working;
              continue;
            }
            try {
              await deps.runRecordTriggeredFlows(tenantId, working, userId, object.apiName, 'created', record);
              const latestRecords = deps.tenantData(tenantId)?.records[deps.communicationObjectApiName] ?? [];
              const pendingIds = new Set((working.records[deps.communicationObjectApiName] ?? []).map(row => row.Id));
              working.records[deps.communicationObjectApiName] = [
                ...(working.records[deps.communicationObjectApiName] ?? []),
                ...latestRecords.filter(row => !pendingIds.has(row.Id))
              ];
              deps.persistTenantRecords(tenantId, working);
            } catch (flowError) {
              // The triggered flow already writes a Failed Flow Log; keep it rather than
              // returning 500 to Meta and replaying a previously successful outbound callout.
              const latest = structuredClone(deps.tenantData(tenantId) ?? working);
              latest.records[object.apiName] = (latest.records[object.apiName] ?? []).map(item =>
                item.Id === record.Id ? { ...item, Status__c: 'Failed' } : item);
              deps.persistTenantRecords(tenantId, latest);
              console.error('[WhatsApp webhook] flow failed after inbound was saved', {
                reason: flowError instanceof Error ? flowError.message : String(flowError)
              });
            }
            working = deps.tenantData(tenantId) ?? working;
          }
        }
      }
      console.info('[WhatsApp webhook] processed', { received, saved, duplicate, unsupported });
      return res.sendStatus(200);
    } catch (error) {
      console.error('[WhatsApp webhook] processing failed', { reason: error instanceof Error ? error.name : 'unknown_error', received, saved });
      return res.sendStatus(500); // Meta retries unsuccessful deliveries.
    }
  });
}
