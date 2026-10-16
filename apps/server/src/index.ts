import { fieldHistoryEntrySchema, advancedRestrictionConditionSchema, advancedRestrictionRuleSchema, sharingSettingSchema, currencySettingsSchema, recordShareSchema, campaignMemberSchema, recordActivitySchema, chatterCommentSchema, chatterPostSchema, customNotificationSchema, approvalRequestSchema, approvalProcessShapeSchema, approvalProcessSchema, approvalProcessRequestSchema, approvalDecisionSchema, type FieldHistoryEntry, type CurrencySettings, type SharingSetting, type RecordShare, type CampaignMember, type RecordActivity, type ChatterPost, type CustomNotification, type ApprovalRequest, type ApprovalProcess } from './core/metadata/shared-data-schemas.js';
import { objectPermissionFlagsSchema, objectPermissionSchema, navigationGrantSchema, permissionSetSchema, profileSchema, permissionSetGroupSchema, accessUserSchema, roleSchema, publicGroupSchema, queueSchema, sharingRuleSchema, accessControlSchema, type ObjectPermission } from './core/security/access-control-schema.js';
import { createCoreObjectSchemas } from './core/metadata/object-schemas.js';
import { createFlowContextRuntime } from './modules/flows/flow-context-runtime.js';
import { createCoreRecordAccess } from './core/security/record-access.js';
import { createCorePermissionRuntime } from './core/security/permission-runtime.js';
import { reportFolderSchema, type ReportFolder } from './modules/reports/folder-schema.js';
import { createOAuthRuntime } from './modules/integrations/oauth-runtime.js';
import { createReportFilterValidation } from './modules/reports/filter-validation.js';
import { createHttpCalloutExecutor } from './modules/integrations/http-callout-executor.js';
import { createTenantEmailRuntime } from './modules/integrations/tenant-email-runtime.js';
import { createSchedulerRuntime } from './scheduler/runtime-bootstrap.js';
function sendTenantEmail(...args: Parameters<ReturnType<typeof createTenantEmailRuntime>['sendTenantEmail']>): Promise<void> {
 return tenantEmailRuntime.sendTenantEmail(...args);
}
import { createFlowRouteRegistrar } from './modules/flows/route-registry.js';
import { createFlowValidator } from './modules/flows/validation.js';
import { createRecordTriggerHandlers } from './modules/flows/record-trigger-handlers.js';
import { createFlowInterview as buildFlowInterview } from './modules/flows/interview-factory.js';
import { activeFlowDefinition, flowVersionSnapshot, uniqueFlowHistory } from './modules/flows/versioning.js';
import { isValidFlowTime, validateFlowInputValues, flowNeedsRollbackSnapshot, orderedRecordTriggeredFlows } from './modules/flows/runtime-helpers.js';
import { createDashboardRunningUserHelpers } from './modules/dashboards/running-users.js';
import { dashboardComponentSchema, dashboardFilterSchema, dashboardFolderShareSchema, dashboardFolderSchema, dashboardTerritorySchema, dashboardSchema, dashboardSnapshotSchema, dashboardSubscriptionSchema, dashboardTimeZoneSchema, type DashboardFolder, type DashboardTerritory, type DashboardMetadata, type DashboardFilterMetadata, type DashboardSnapshot, type DashboardSubscription } from './modules/dashboards/schemas.js';
import { folderAccessLevelForUser, folderAccessLevelFromFolders, folderForUser, dashboardForUser, validateDashboardFolderReferences } from './modules/dashboards/folder-access.js';
import { createFlowSchedulingRuntime } from './scheduler/flow-scheduling.js';

import { bindFlowExecution, wrapFlowExecution } from './modules/flows/execution-binding.js';
import { parseSubflowMappings } from './modules/flows/subflow-mappings.js';
import { createFlowScheduleCalculations } from './scheduler/flow-schedule-calculations.js';
import { createTenantProvisioning } from './core/state/tenant-provisioning.js';
import { createPersistenceResponseBarrier } from './core/state/response-barrier.js';
import { createPersistedMetadataReadMode } from './core/state/metadata-read-mode.js';
import type { TenantData, SecurityAuditEvent, MfaEncryptedSecret, LocalUser, RefreshSession, TenantDomainRecord, TenantRegistryEntry, TenantManagementAuditEvent, PlatformState } from './core/state/types.js';
export type { TenantData, SecurityAuditEvent, MfaEncryptedSecret, LocalUser, RefreshSession, TenantDomainRecord, TenantRegistryEntry, TenantManagementAuditEvent, PlatformState } from './core/state/types.js';
import { createPlatformStateSchema } from './core/state/schema.js';
import { createTenantDefaults } from './core/state/tenant-defaults.js';
import { createStateHydration } from './core/state/hydration.js';
import { initializePlatformState } from './core/state/initialization.js';
import { createTenantDataService } from './core/state/tenant-data.js';
import { createTenantBootstrap } from './core/state/bootstrap-tenant.js';
import { createPlatformStateStore } from './core/state/store.js';
import { registerIntegrationsWebhookRoutes } from './modules/integrations/webhook-routes.js';
import { registerTenantRegistryRoutes } from './modules/tenants/registry-routes.js';
import { registerTenantProvisioningRoutes } from './modules/tenants/provisioning-routes.js';
import { registerTenantsDomainRoutes } from './modules/tenants/domain-routes.js';
import { registerTenantLifecycleRoutes } from './modules/tenants/lifecycle-routes.js';
import { registerTenantRetentionRoutes } from './modules/tenants/retention-routes.js';
import { registerApprovalsDecisionRoutes } from './modules/approvals/decision-routes.js';
import { registerObjectsListRoutes } from './modules/objects/list-routes.js';
import { registerApprovalsMetadataRoutes } from './modules/approvals/metadata-routes.js';
import { registerIntegrationsConnectionRoutes } from './modules/integrations/connection-routes.js';
import { registerIntegrationsConnectorSettingsRoutes } from './modules/integrations/connector-settings-routes.js';
import { registerIntegrationsConnectorAppRoutes } from './modules/integrations/connector-app-routes.js';
import { registerCredentialStatusRoutes } from './modules/integrations/credential-status-routes.js';
import { registerCredentialManagementRoutes } from './modules/integrations/credential-management-routes.js';
import { registerChatterAccessRoutes } from './modules/chatter/access-routes.js';
import { registerAppsMetadataRoutes } from './modules/apps/metadata-routes.js';
import { registerAppsRouteAliasRoutes } from './modules/apps/route-alias-routes.js';
import { registerPageListRoutes } from './modules/pages/list-routes.js';
import { registerPageUpdateRoutes } from './modules/pages/update-routes.js';
import { registerSecurityCurrencyRoutes } from './modules/security/currency-routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { registerPlatformPolicyRoutes } from './modules/security/platform-policy-routes.js';
import { registerHealthAndDiscoveryRoutes } from './modules/security/health-routes.js';
import { roleApiNameForName, roleIdForName, profileIdForRole } from './modules/security/role-helpers.js';

import { startPlatformServer } from './bootstrap/startup.js';
import { registerProductionFrontend, registerPlatformErrorHandler } from './bootstrap/frontend.js';
import { credentialKeyRing, sealCredentialPayload, openCredentialPayload, sealIntegrationCredentials, openIntegrationCredentials } from './core/credential-crypto.js';
import { recordWritePolicySchema, withFlowRecordWriteContext, grantedObjectPermission, assertRecordFieldPermissions, lockedRecordWriteAllowed, recordWritePolicyMetadataGuard } from './record-write-policy.js';

import { loadAppSeedCatalog } from './seeders/catalog.mjs';

import { registerReportRoutes } from './modules/reports/routes.js';
import { registerDashboardRoutes } from './modules/dashboards/routes.js';
import { registerDashboardSnapshotRoutes } from './modules/dashboards/snapshot-routes.js';
import { registerComponentLibraryRoutes } from './modules/components/routes.js';
import { createComponentLibraryService } from './modules/components/library-service.js';
import { libraryComponentResizeSchema, defaultLibraryComponentResize, libraryComponentSchema, libraryComponentInputSchema, type LibraryComponent, type LibraryComponentRevision } from './modules/components/library-schema.js';
import { canManageReportFolders, createReportFolderPermissions } from './modules/reports/report-permissions.js';
import { createReportCrossFilterResolver } from './modules/reports/cross-filter.js';
import { nextDashboardSubscriptionRunAt } from './modules/dashboards/subscription-schedule.js';
import { validateProtectedAdministrationPageUpdate, isProtectedAdministrationPage } from './modules/metadata/platform-admin-pages.mjs';
import { registerAuthenticationRoutes } from './modules/security/auth-routes.js';
import { registerPageDeletionRoute } from './modules/metadata/page-deletion-route.mjs';
import { pageComponentSchema } from './modules/metadata/page-component-schema.js';

import { registerIdentityProfileRoute } from './modules/security/identity-profile-route.js';
import { registerSessionSecurityRoutes } from './modules/security/session-routes.js';
import { registerSecurityMetadataRoutes } from './modules/security/metadata-routes.js';
import { createAccessAuthentication } from './modules/security/access-authentication.js';
import { tenantForRequestHost as resolveTenantForRequestHost } from './modules/security/request-auth.js';

import { validateObjectRelationships, validateRelatedLookupFilters, validateRelatedLists, containsFieldReference, flowUsesObject, findFieldDependencies, findObjectDependencies } from './modules/objects/dependencies.js';
import { registerObjectMetadataRoutes } from './modules/objects/routes.js';
import { registerRecordRoutes } from './modules/records/routes.js';
import { applyRecordDefaults as applyMetadataRecordDefaults } from './modules/records/record-defaults.js';
import { validateRuntimeRecord as validateMetadataRecord } from './modules/records/runtime-validation.js';

import { calculateFormulaFields } from './modules/records/formula-fields.js';
import { sanitizeRecordValues, withCaseClosedDate, recordUnmodified } from './modules/records/record-input.js';
import { stampRecordAuditFields, recordActionEnabled } from './modules/records/record-actions.js';
import { autoNumberSequenceKey } from './modules/records/auto-number.js';
import { numericFieldValueError, validateFieldChange, validateExistingFieldValues, isValidFlowDateTime, normalizeRuntimeValues, normalizeFlowRecordAssignments } from './modules/records/record-values.js';
import { validateRelationshipReparenting } from './modules/records/field-rules.js';
import { validateObjectLayoutProfileAssignments } from './modules/objects/metadata-validation.js';
import { resolvePageAssignment } from './modules/pages/page-assignment.js';
import { pickDashboardSnapshotProperties } from './modules/dashboards/snapshot-properties.js';
import { evaluateFormula, formulaLocalDate, isSafeFlowRegex } from './modules/flows/formula-evaluator.js';
import { evaluateCustomConditionLogic } from './modules/flows/condition-logic.js';
import { authoriseManualCoreFlow, assertFlowRuntimeAdmission } from './modules/flows/execution-admission.js';
import { flowPackageAdmission } from './modules/flows/package-admission.js';
import { dashboardLocalParts, flowLocalDateTimeToInstant } from './core/local-time.js';
import cors from 'cors';
import { validateFlowFormulaSyntax } from './flow-formula-syntax.mjs';
import { prepareFlowCreateCollection } from './flow-create-collection.mjs';
import { applyFlowCollectionAssignment } from './flow-collection-assignment.mjs';
import { readPersistedState, persistToPostgres, waitForPersistedState, persistenceMode, checkDatabaseConnection, withSchedulerLease, getRouteAliasPool, readAuthLogoutRevocations, persistAuthLogoutRevocation, readDurableAuthLogins, persistDurableAuthLogin, type DurableAuthLogin } from './postgres-state.js';

import { validateRouteAliasInput, routeAliasDestination, rowToRouteAlias, validAliasSlug, validRouteIdentifier } from './route-aliases.mjs';
import { libraryComponentVisible, libraryComponentEditable } from './component-scope.mjs';
import { tenantUsageSnapshot } from './tenant-usage.mjs';
import { decideAdvancedRecordAccess, resolveAdvancedRecordGrant, validateAdvancedSharingMetadata } from './advanced-sharing-policy.mjs';
import { conversationKeyForIncoming, defaultAutomationSettings, expiredConversationInterview, retryDelayMs, retryBudgetExhausted, shouldTriggerInboundMessage, activeConversationContext, sameConversationSession } from './automation-policy.js';
import { assertCalloutHostAllowed } from './outbound-callout-policy.js';
import { mayRetry, retryAfterMs, CalloutFault } from './connector-reliability.js';
import { sealIntegrationEnvelope, openIntegrationEnvelope } from './connector-envelope.js';
import { IntegrationOutbox } from './connector-outbox.js';
import { dispatchIntegrationDeliveries } from './connector-delivery-worker.js';
import { getOAuthAccessToken, beginOAuthAuthorization, completeOAuthAuthorization, validatedOAuthUrl, type OAuthVault, type OAuthToken } from './connector-oauth.js';
import { SqlOAuthChallengeStore, type ChallengeCipher } from './connector-oauth-challenges.js';
import { mappedTenantOrigin, tenantForRequest, tenantHostConfig } from './tenant-host-routing.js';
import { communicationObjectApiName } from './communication-unification.js';
import { canAccessChatterRecord, chatterScopeForUser, isWhatsAppMessage } from './chatter-authorisation.js';
import { authoriseChatterFlow } from './chatter-flow-authorisation.js';
import { sanitizeChatterCallerInput, trustedChatterExecutionFlow } from './modules/flows/chatter-request-input.mjs';
import express, { type NextFunction, type Request, type Response } from 'express';
import { lookup, resolveTxt } from 'node:dns/promises';
import { normalizeTenantDomain, domainChallenge, matchesDomainChallenge, reservedDomain } from './tenant-domains.mjs';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { executeConnectorTest } from './connector-test.js';
import { applyConnectorLifecycle, connectorEntitlement } from './connector-app-runtime.js';


import nodemailer from 'nodemailer';
import pg from 'pg';
import { installTenantRecoveryCentre } from './tenant-recovery-centre.mjs';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { appNavigationEntrySchema } from './app-navigation-schema.js';
import { newTotpSecret, totpUri, verifyTotp } from './mfa.js';
import { createRefreshToken, hashPassword, hashToken, JwtService, verifyPassword, type Principal } from './auth.js';
import { normalizeRecoveryPolicy, renderRecoveryTemplate, deliverWithFallback } from './recovery-policy.js';
import { RECOVERY_FLOW_API, defaultRecoveryFlowDefinition, recoveryFlowActions } from './recovery-flow.js';
// Tenant name is resolved from the tenant registry, never from unauthenticated request input.
function tenantInfoForRecovery(tenant: TenantData, tenantId: string): string {
  return platformStore.state.tenantRegistry[tenantId]?.name ?? tenantId;
}

import { canAccessDashboard, canEditDashboard, matchesDashboardFilters, type DashboardFolderAccessLevel } from './dashboard-access.js';
const app = express();
const port = Number(process.env.PORT ?? 3001);
const schedulePollInterval = Number(process.env.METADRIVE_SCHEDULE_POLL_MS ?? 30_000);
if (!Number.isInteger(schedulePollInterval) || schedulePollInterval < 100 || schedulePollInterval > 3_600_000) {
  throw new Error('METADRIVE_SCHEDULE_POLL_MS must be an integer between 100 and 3600000');
}
const dataPath = resolve(process.env.METADRIVE_DATA_PATH ?? 'data/platform-state.json');
const bundledCustomComponentsPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/src/custom-components');
const webOrigins = new Set([
  ...(process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','),
  ...(process.env.WEB_ORIGINS ?? '').split(',')
].map((origin) => origin.trim()).filter(Boolean));
const tenantHostRouting = tenantHostConfig(
  process.env.METADRIVE_TENANT_HOSTS, process.env.METADRIVE_SHARED_API_HOSTS
);
function requestTenantMatches(req: Request, tenantId: string): boolean {
  const route = tenantForRequest(tenantHostRouting, req.header('host'), req.header('origin'));
  return route.allowed && (route.tenantId === null || route.tenantId === tenantId);
}
const refreshCookieName = 'metadrive_refresh';
const isProduction = process.env.NODE_ENV === 'production';
const jwtService = await JwtService.create();
// Canonical origins are fixed. A verified customer domain may call its own
// same-host API over HTTPS without a deployment-time CORS whitelist update.
// Cross-origin use of a customer's domain is never allowed.
app.use(cors((req, callback) => {
  const origin = req.header('origin');
  let allowed = !origin || webOrigins.has(origin) || origin === 'http://localhost:4173'
    || (origin !== undefined && mappedTenantOrigin(tenantHostRouting, origin));
  if (!allowed && origin) {
    try {
      const url = new URL(origin);
      const binding = tenantForRequestHost(req);
      allowed = url.protocol === 'https:' && url.port === '' && url.hostname === req.hostname
        && url.pathname === '/' && !url.search && !url.hash
        && !url.username && !url.password && binding?.status === 'VERIFIED';
    } catch { allowed = false; }
  }
  callback(null, { origin: allowed, credentials: true, exposedHeaders: ['Server-Timing'] });
}));
app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
// Explicit maintenance barrier for Aiven cutover; no API traffic or scheduled
// dispatch may modify the DB while the in-place migration is running.
const maintenanceMode = process.env.METADRIVE_MAINTENANCE_MODE === 'true';
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!maintenanceMode || req.path === '/health') return next();
  res.setHeader('Retry-After', '120');
  return res.status(503).json({ error: 'MetaDrive database maintenance in progress' });
});
// In all SQL modes, acknowledge API writes only after the database transaction
// commits. Otherwise a fast API response followed by restart loses records/Flows.
// Legacy JSONB response semantics remain unchanged.
const platformStore = createPlatformStateStore({ maintenance: maintenanceMode, persistenceMode, dataPath, persistToPostgres });
const persistState = platformStore.persistState;
app.use(createPersistenceResponseBarrier({
  persistenceMode, get latestCommit() { return platformStore.latestCommit; }
}));
app.use((req: Request, res: Response, next: NextFunction) => {
  // Only explicitly identified external API traffic belongs in Communication Records.
  // Browser, internal automation and platform API requests must not be logged here.
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/auth/') || req.get('x-metadrive-request-source') === 'web-app'
    || req.get('x-metadrive-external-api') !== 'true') return next();
  const startedAt = Date.now();
  let responseBody: unknown;
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return sendJson(body);
  }) as typeof res.json;
  res.on('finish', () => {
    const principal = res.locals.principal as Principal | undefined;
    if (!principal || !tenantData(principal.tenantId)) return;
    const authorization = req.get('authorization') ?? '';
    const authType = authorization.toLowerCase().startsWith('bearer ') ? 'Bearer'
      : authorization.toLowerCase().startsWith('basic ') ? 'Basic'
        : req.get('x-api-key') ? 'API Key'
          : authorization ? 'Other' : 'None';
    const routePath = req.route?.path;
    const apiId = `${req.method} ${typeof routePath === 'string' ? routePath : req.path}`;
    const requestUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
    const isCommunicationRecordsEndpoint = /^\/api\/records\/Communication_Records__c(?:\/|$)/i.test(req.path);
    try {
      appendCommunicationRecord(principal.tenantId, principal.userId, {
        apiId,
        url: communicationSafeUrl(requestUrl),
        authType,
        method: supportedCommunicationMethod(req.method),
        direction: 'Incoming',
        requestBody: isCommunicationRecordsEndpoint ? '' : communicationPayload(req.body),
        responseBody: isCommunicationRecordsEndpoint ? '' : communicationPayload(responseBody),
        status: res.statusCode,
        error: res.statusCode >= 400 ? communicationError(responseBody) : '',
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      console.error(`Failed to record incoming API request "${apiId}": ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  next();
});
// Meta webhook transport is a platform primitive; routing and replies remain in editable Flows.
// Configure these four values on Render before enabling the callback.
const registerIntegrationsWebhookRoutesContext = {
  get activeConversationContext() { return activeConversationContext; },
  get app() { return app; },
  get applyRecordDefaults() { return applyRecordDefaults; },
  get calculateFormulaFields() { return calculateFormulaFields; },
  get communicationObjectApiName() { return communicationObjectApiName; },
  get conversationKeyForIncoming() { return conversationKeyForIncoming; },
  get createHmac() { return createHmac; },
  get formulaContextForUser() { return formulaContextForUser; },
  get persistTenantRecords() { return persistTenantRecords; },
  get randomUUID() { return randomUUID; },
  get runBeforeSaveRecordTriggeredFlows() { return runBeforeSaveRecordTriggeredFlows; },
  get runRecordTriggeredFlows() { return runRecordTriggeredFlows; },
  get sameConversationSession() { return sameConversationSession; },
  get sanitizeRecordValues() { return sanitizeRecordValues; },
  get shouldTriggerInboundMessage() { return shouldTriggerInboundMessage; },
  get stampRecordAuditFields() { return stampRecordAuditFields; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get tenantIsActive() { return tenantIsActive; },
  get timingSafeEqual() { return timingSafeEqual; },
  get validateRuntimeRecord() { return validateRuntimeRecord; },
  get waitForPersistedState() { return waitForPersistedState; }
};
export type IntegrationsWebhookRoutesDependencies = typeof registerIntegrationsWebhookRoutesContext;
registerIntegrationsWebhookRoutes(registerIntegrationsWebhookRoutesContext);
// Persisted legacy metadata may contain incomplete picklists. Keep the API available
// for administrators to repair them; all new metadata writes remain strictly validated.
const persistedMetadataReadMode = createPersistedMetadataReadMode();
const { fieldSchema, pageLayoutSectionSchema, pageLayoutCustomLinkSchema, pageLayoutSchema, pageLayoutAssignmentSchema, compactLayoutSchema, compactLayoutAssignmentSchema, recordTypeSchema, fieldSetSchema, searchLayoutsSchema, relatedLookupFilterSchema, objectActionSchema, objectSettingsSchema, customObjectTabSchema, runtimeRecordSchema, listViewButtonSchema, platformEventSchema, platformEventMessageSchema, normalizeFieldApiName, objectSchema } = createCoreObjectSchemas(persistedMetadataReadMode);
export type RelatedLookupFilterMetadata = z.infer<typeof relatedLookupFilterSchema>;
const flowElementSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.unknown()).default({})
});
function isTestLoopbackSmtpUrl(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  return process.env.METADRIVE_SMTP_TEST_MODE === 'true'
    && (host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.')));
}
const namedCredentialSchema = z.object({
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
const namedCredentialRequestSchema = z.object({
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
const emailAlertSchema = z.object({
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
const emailAlertRequestSchema = emailAlertSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).strict();
type EmailAlert = z.infer<typeof emailAlertSchema>;
export type NamedCredentialPayload = { username?: string; secret?: string; oauthToken?: OAuthToken };
type CredentialKeyRing = { activeKeyId: string; keys: Map<string, Buffer> };
const flowConnectorSchema = z.object({
  id: z.string().min(1),
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  label: z.string().default(''),
  kind: z.enum(['normal', 'fault', 'scheduled', 'async']).default('normal'),
  scheduledPath: z.object({
    timeSourceFieldApiName: z.string().min(1),
    offsetAmount: z.number().int(),
    offsetUnit: z.enum(['Minutes', 'Hours', 'Days'])
  }).optional()
});
const flowResourceSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['Variable', 'Record', 'Record Collection', 'Formula', 'Constant', 'Choice', 'Text Template']),
  dataType: z.string().min(1),
  isCollection: z.boolean(),
  availableForInput: z.boolean(),
  availableForOutput: z.boolean(),
  value: z.unknown().optional()
});
// Declarative, version-safe Flow Test cases. Tests never run during normal
// record processing; authoring and explicit debug/run-tests actions are isolated.
const flowTestCaseSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  input: z.record(z.unknown()).default({}),
  event: z.enum(['created', 'updated', 'deleted']).optional(),
  record: z.record(z.unknown()).optional(),
  prior: z.record(z.unknown()).nullable().optional(),
  isClone: z.boolean().default(false),
  expectedStatus: z.enum(['completed', 'waiting', 'skipped']).default('completed'),
  expectedOutputs: z.record(z.unknown()).default({})
}).strict();
const flowVersionSchema = z.object({
  versionNumber: z.number().int().positive(),
  status: z.enum(['Draft', 'Active', 'Obsolete']),
  savedAt: z.string().datetime(),
  label: z.string().optional(),
  description: z.string().optional(),
  flowType: z.enum(['Screen Flow', 'Record-Triggered Flow', 'Autolaunched Flow', 'Flow Orchestration', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow']).optional(),
  triggerObject: z.string().nullable().optional(),
  startConfig: z.record(z.unknown()).optional(),
  elements: z.array(flowElementSchema),
  connectors: z.array(flowConnectorSchema),
  resources: z.array(flowResourceSchema),
  tests: z.array(flowTestCaseSchema).max(100).optional()
});
const flowSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
  lastModifiedAt: z.string().optional(),
  lastModifiedBy: z.string().optional(),
  flowType: z.enum(['Screen Flow', 'Record-Triggered Flow', 'Autolaunched Flow', 'Flow Orchestration', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow']),
  status: z.enum(['Draft', 'Active']),
  versionNumber: z.number().int().positive(),
  activeVersion: z.number().int().positive().nullable(),
  triggerObject: z.string().nullable(),
  startConfig: z.record(z.unknown()),
  elements: z.array(flowElementSchema).min(1),
  connectors: z.array(flowConnectorSchema),
  resources: z.array(flowResourceSchema),
  versions: z.array(flowVersionSchema),
  tests: z.array(flowTestCaseSchema).max(100).optional()
}).superRefine((flow, context) => {
  if (flow.tests && new Set(flow.tests.map((item) => item.id)).size !== flow.tests.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests'], message: 'Flow Test IDs must be unique' });
  }
  if (flow.tests) {
    flow.tests.forEach((item, index) => {
      if (flow.flowType === 'Record-Triggered Flow') {
        if (!item.event || !item.record) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests', index], message: 'Record-triggered tests require an event and record sample' });
        }
      } else if (item.event || item.record || item.prior) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests', index], message: 'Only record-triggered Flow tests can contain record/trigger fixtures' });
      }
    });
  }
  const ids = new Set<number>();
  for (const [index, element] of flow.elements.entries()) {
    if (ids.has(element.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'id'], message: 'Element IDs must be unique' });
    ids.add(element.id);
    if (element.type === 'Screen' && flow.flowType !== 'Screen Flow') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'type'], message: 'Screen elements are only supported in Screen Flows' });
    }
  }
  for (const [index, connector] of flow.connectors.entries()) {
    if (!ids.has(connector.from) || !ids.has(connector.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['connectors', index], message: 'Connectors must reference existing elements' });
    }
  }
  if (new Set(flow.connectors.map((connector) => connector.id)).size !== flow.connectors.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['connectors'], message: 'Connector IDs must be unique' });
  }
  if (new Set(flow.resources.map((resource) => resource.name.toLowerCase())).size !== flow.resources.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['resources'], message: 'Resource API names must be unique without regard to case' });
  }
  const startElements = flow.elements.filter((element) => element.type === 'Start');
  if (startElements.length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements'], message: 'A flow must have exactly one Start element' });
  } else if (flow.elements[0]?.id !== startElements[0].id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements'], message: 'The Start element must be first in the flow' });
  }
  for (const [index, element] of flow.elements.entries()) {
    if (element.type !== 'Screen') continue;
    const fields = Array.isArray(element.config.fields) ? element.config.fields : [];
    const names = fields.map((field) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return '';
      const item = field as Record<string, unknown>;
      return typeof item.apiName === 'string' && item.apiName
        ? item.apiName
        : typeof item.label === 'string' ? item.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') : '';
    });
    if (names.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'config', 'fields'], message: 'Screen fields must have valid API names and labels' });
    }
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'config', 'fields'], message: 'Screen field API names must be unique' });
    }
  }
  if (!['Record-Triggered Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow'].includes(flow.flowType) && flow.triggerObject) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['triggerObject'], message: 'Only triggered flows can have a trigger object' });
  }
  if (flow.activeVersion !== null && flow.activeVersion > flow.versionNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['activeVersion'], message: 'Active version cannot exceed the current flow version' });
  }
});
const flowInterviewSchema = z.object({
  id: z.string().uuid(),
  flowApiName: z.string(),
  versionNumber: z.number().int().positive(),
  userId: z.string(),
  kind: z.enum(['screen', 'wait', 'scheduled', 'async', 'orchestration']),
  // Persist record-trigger formula context across process restarts and version changes.
  recordEvent: z.enum(['created', 'updated', 'deleted']).nullable().default(null),
  isClone: z.boolean().default(false),
  screenElementId: z.number().int().positive().nullable(),
  waitUntil: z.string().datetime().nullable(),
  nextElementId: z.number().int().positive().nullable(),
  variables: z.record(z.unknown()),
  record: runtimeRecordSchema.nullable(),
  prior: runtimeRecordSchema.nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  history: z.array(z.object({
    screenElementId: z.number().int().positive(),
    nextElementId: z.number().int().positive().nullable(),
    variables: z.record(z.unknown()),
    record: runtimeRecordSchema.nullable(),
    prior: runtimeRecordSchema.nullable()
  })).default([]),
  retryAt: z.string().datetime().nullable().default(null),
  attempts: z.number().int().nonnegative().default(0),
  allowDraft: z.boolean().default(false)
});
const automationSettingsSchema = z.object({
  autoRetryFailedFlows: z.boolean().default(false),
  maxRetryAttempts: z.number().int().min(1).max(20).default(10),
  conversationIdleMinutes: z.number().int().min(1).max(1440).default(15)
});
const scheduleRetrySchema = z.object({
  occurrenceAt: z.string().datetime(),
  attempts: z.number().int().positive(),
  retryAt: z.string().datetime()
});
const flowExecutionLogSchema = z.object({
  id: z.string().uuid(),
  flowApiName: z.string(),
  flowLabel: z.string(),
  trigger: z.enum(['Manual', 'Scheduled', 'Record-Triggered', 'Platform Event', 'Scheduled Path', 'Async Path', 'Wait Interview']),
  failedAt: z.string().datetime(),
  error: z.string(),
  userId: z.string().nullable()
});
const pageActivationAssignmentSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['Org Default', 'App Default', 'App and Profile', 'App, Record Type, and Profile']),
  appId: z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_]*$/).nullable(),
  profileId: z.string().min(1).nullable(),
  recordTypeId: z.string().min(1).nullable(),
  formFactors: z.array(z.enum(['Desktop', 'Phone'])).min(1)
}).superRefine((assignment, context) => {
  if (new Set(assignment.formFactors).size !== assignment.formFactors.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formFactors'], message: 'Form factors must be unique' });
  }
  if (assignment.scope === 'Org Default' && (assignment.appId || assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Org Default assignments cannot target an app, profile, or record type' });
  }
  if (assignment.scope === 'App Default' && !assignment.appId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['appId'], message: 'App Default assignments require an app' });
  }
  if (assignment.scope === 'App Default' && (assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App Default assignments cannot target a profile or record type' });
  }
  if (assignment.scope === 'App and Profile' && (!assignment.appId || !assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App and Profile assignments require an app and profile, and cannot target a record type' });
  }
  if (assignment.scope === 'App, Record Type, and Profile' && (!assignment.appId || !assignment.profileId || !assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App, record type, and profile assignments require all three values' });
  }
});
const lightningAppSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  navigationItems: z.array(z.string().min(1)).min(1),
  navigationPageApiNames: z.array(z.string().min(1)).default([]),
  navigationOrder: z.array(appNavigationEntrySchema).default([]),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0176d3'),
  utilityItems: z.array(z.enum(['Notes', 'History'])).default([])
}).superRefine((app, context) => {
  if (new Set(app.navigationItems).size !== app.navigationItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationItems'], message: 'Navigation items must be unique' });
  }
  if (new Set(app.navigationPageApiNames).size !== app.navigationPageApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationPageApiNames'], message: 'Navigation pages must be unique' });
  }
  const navigationKeys = app.navigationOrder.map((item) => `${item.type}:${item.apiName}`);
  if (new Set(navigationKeys).size !== navigationKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationOrder'], message: 'Navigation order entries must be unique' });
  }
  if (app.navigationOrder.length) {
    const expectedNavigationKeys = [
      ...app.navigationItems.map((apiName) => `Object:${apiName}`),
      ...app.navigationPageApiNames.map((apiName) => `App Page:${apiName}`)
    ].sort();
    if (navigationKeys.some((key) => !expectedNavigationKeys.includes(key))
      || navigationKeys.length !== expectedNavigationKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationOrder'], message: 'Navigation order must include every selected item exactly once' });
    }
  }
  if (new Set(app.utilityItems).size !== app.utilityItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['utilityItems'], message: 'Utility items must be unique' });
  }
});
const pageTemplateSchema = z.enum(['one-region', 'header-main', 'main-sidebar', 'header-main-sidebar']);
const pageTemplateRegions: Record<z.infer<typeof pageTemplateSchema>, string[]> = {
  'one-region': ['main'],
  'header-main': ['header', 'main'],
  'main-sidebar': ['main', 'sidebar'],
  'header-main-sidebar': ['header', 'main', 'sidebar']
};
const pageSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  updatedAt: z.string().datetime().optional(),
  targetObject: z.string(),
  pageType: z.enum(['Record Page', 'App Page', 'Home Page']),
  layoutMode: z.enum(['template', 'free-canvas']).default('template'),
  template: pageTemplateSchema.default('one-region'),
  canvasWidth: z.number().int().min(320).max(7680).default(1920),
  canvasHeight: z.number().int().min(320).max(7680).default(1080),
  status: z.enum(['Draft', 'Active']),
  devices: z.array(z.enum(['Desktop', 'Phone'])).min(1),
  components: z.array(pageComponentSchema.extend({
    region: z.enum(['header', 'main', 'sidebar', 'footer']).default('main'),
    position: z.object({
      x: z.number().int().min(0).max(7680),
      y: z.number().int().min(0).max(7680),
      width: z.number().int().min(1).max(7680),
      height: z.number().int().min(1).max(7680)
    }).optional()
  })),
  activationAssignments: z.array(pageActivationAssignmentSchema).optional(),
  scope: z.enum(['tenant','platform-system']).optional(), ownerNamespace: z.string().max(128).optional(),
  definitionVersion: z.number().int().positive().optional(), overridePolicy: z.enum(['presentation-only','none']).optional(),
  requiredPermissions: z.array(z.string().min(1)).optional()
}).superRefine((page, context) => {
  const ids = page.components.map((component) => component.id); if (page.pageType === 'Record Page' && !page.targetObject.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetObject'], message: 'Record Pages require a target object' });
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Component IDs must be unique' });
  page.components.forEach((component, index) => {
    if (page.layoutMode === 'template' && !pageTemplateRegions[page.template].includes(component.region)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'region'], message: 'Component region must exist in the selected page template' });
    }
    if (page.layoutMode === 'free-canvas') {
      const position = component.position;
      if (!position) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'position'], message: 'Free Canvas components require a position and size' });
      } else if (position.x + position.width > page.canvasWidth || position.y + position.height > page.canvasHeight) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'position'], message: 'Component position and size must fit inside the Free Canvas' });
      }
      if (page.pageType !== 'Home Page' || !component.type.startsWith('Custom:')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'Free Canvas is available on Home Pages and supports custom library components' });
      }
    }
    if (['Field Section', 'Record Field'].includes(component.type)
      && (page.pageType !== 'Record Page' || page.layoutMode !== 'template')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'Dynamic Forms components are only available on template-based Record Pages' });
    }
    if (page.pageType !== 'Record Page'
      && !['Accordion', 'Tabs', 'Report Chart', 'Dashboard'].includes(component.type)
      && !component.type.startsWith('Custom:')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'This component is only available on Record Pages' });
    }
  });
  if (page.layoutMode === 'free-canvas' && page.pageType !== 'Home Page') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['layoutMode'], message: 'Free Canvas is only available on Home Pages' });
  }
  const assignments = page.activationAssignments ?? [];
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (new Set(assignmentIds).size !== assignmentIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments'], message: 'Activation assignment IDs must be unique' });
  assignments.forEach((assignment, index) => {
    if (page.pageType !== 'Record Page' && assignment.scope === 'App, Record Type, and Profile') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Record type activation assignments are only valid on Record Pages' });
    }
    if (page.pageType === 'Home Page' && assignment.scope === 'Org Default') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Home Pages must be assigned to an app or app and profile' });
    }
    if (page.pageType === 'App Page') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'App Pages are added to app navigation instead of using activation assignments' });
    }
    for (const other of assignments.slice(index + 1)) {
      if (assignment.scope === other.scope
        && assignment.appId === other.appId
        && assignment.profileId === other.profileId
        && assignment.recordTypeId === other.recordTypeId
        && assignment.formFactors.some((formFactor) => other.formFactors.includes(formFactor))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Activation assignments cannot overlap for the same target and form factor' });
        break;
      }
    }
  });
});
type LightningPage = z.infer<typeof pageSchema>;

import { reportFilterSchema, reportDateRangeSchema, reportStandardFiltersSchema, reportCrossFilterSchema, reportRowLimitSchema, reportSummaryOperationSchema, reportDateGroupingSchema, parseReportFilterLogic, reportSchema, reportDateRangeBounds, evaluateReportFilterLogic, reportFilterMatches } from './modules/reports/report-metadata.js';

export type ObjectMetadata = z.infer<typeof objectSchema>;
function isNumericField(field: { dataType: string; formula?: { returnType: string } } | undefined): boolean {
  const numericTypes = /^(Number|Currency|Percent)(\(|$)/;
  return Boolean(field && (numericTypes.test(field.dataType)
    || (field.dataType.startsWith('Formula(') && numericTypes.test(field.formula?.returnType ?? ''))));
}
function dashboardFilterOperatorAllowed(
  field: { dataType: string; formula?: { returnType: string } },
  operator: DashboardFilterMetadata['operator']
): boolean {
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  if (['Includes', 'Excludes'].includes(operator) && type !== 'Multi-Select Picklist') return false;
  const nullOperators: DashboardFilterMetadata['operator'][] = ['Is Null', 'Is Not Null'];
  if (type === 'Checkbox' || type === 'Picklist') {
    return [...nullOperators, 'Equals', 'Not Equal To'].includes(operator);
  }
  if (type === 'Multi-Select Picklist') {
    return [...nullOperators, 'Equals', 'Not Equal To', 'Contains', 'Includes', 'Excludes'].includes(operator);
  }
  if (isNumericField(field) || type === 'Date' || type === 'DateTime') {
    return !['Contains', 'Starts With'].includes(operator);
  }
  return true;
}
function dashboardFilterValueError(
  field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] },
  value: string
): string | null {
  if (!value.trim()) return null;
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  if (isNumericField(field) && !Number.isFinite(Number(value))) return 'Enter a valid number';
  if (type === 'Date') {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== value) return 'Enter a valid date';
  }
  if (type === 'DateTime' && !Number.isFinite(new Date(value).getTime())) return 'Enter a valid date and time';
  if (type === 'Checkbox' && !['true', 'false'].includes(value.toLocaleLowerCase())) return 'Choose true or false';
  if (type === 'Picklist' && field.picklistValues?.length && !field.picklistValues.includes(value)) {
    return 'Choose a configured picklist value';
  }
  if (type === 'Multi-Select Picklist' && field.picklistValues?.length
    && value.split(';').some((item) => !field.picklistValues!.includes(item))) {
    return 'Choose configured picklist values';
  }
  return null;
}
const { reportFilterOperatorAllowed, reportFilterValueError } = createReportFilterValidation({ isNumericField, dashboardFilterValueError });
export type FlowMetadata = z.infer<typeof flowSchema>;
export type FlowPlatformEvent = z.infer<typeof platformEventSchema>;
export type FlowInterview = z.infer<typeof flowInterviewSchema>;
type PageMetadata = z.infer<typeof pageSchema>;

type ReportMetadata = z.infer<typeof reportSchema>;
type AccessControl = z.infer<typeof accessControlSchema>;
type AccessProfile = z.infer<typeof profileSchema>;
type AccessRole = z.infer<typeof roleSchema>;
type PublicGroup = z.infer<typeof publicGroupSchema>;
type RecordQueue = z.infer<typeof queueSchema>;
type SharingRule = z.infer<typeof sharingRuleSchema>;
export type RuntimeRecord = z.infer<typeof runtimeRecordSchema>;
function sanitizeDashboardRichText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'li', 'ol', 'p', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false
  });
}
const connectorSettingsSchema = z.object({
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
type ConnectorSettings = z.infer<typeof connectorSettingsSchema>;
const defaultConnectorSettings: ConnectorSettings[] = [
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
const connectorDefinitionSchema = z.object({
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
type ConnectorDefinition = z.infer<typeof connectorDefinitionSchema>;
const defaultConnectorDefinitions: ConnectorDefinition[] = [
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
const integrationConnectionSchema = z.object({
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
const integrationConnectionRequestSchema = z.object({
  connectorKey: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  configuration: z.record(z.string().max(2000)).default({}),
  credentials: z.record(z.string().max(8192)).default({}),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict();
const connectorDefinitionRequestSchema = connectorDefinitionSchema;
type FlowExecutionLog = z.infer<typeof flowExecutionLogSchema>;
type LightningApp = z.infer<typeof lightningAppSchema>;

const defaultLightningApps = (): LightningApp[] => [
  { apiName: 'Records', label: 'Records', description: 'Browse and manage customer records.', navigationItems: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#0176d3', utilityItems: ['Notes', 'History'] },
  { apiName: 'SalesApp', label: 'Sales', description: 'Manage sales accounts and opportunities.', navigationItems: ['Account', 'Contact', 'Lead', 'Opportunity'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Lead', 'Opportunity'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#0176d3', utilityItems: ['Notes', 'History'] },
  { apiName: 'ServiceApp', label: 'Service', description: 'Manage customer support cases.', navigationItems: ['Account', 'Contact', 'Case'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Case'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#7526a8', utilityItems: ['Notes', 'History'] }
].map((app) => lightningAppSchema.parse(app));
function appendFieldHistory(tenant: TenantData, object: ObjectMetadata, previous: RuntimeRecord, updated: RuntimeRecord, userId: string): void {
  if (!object.settings?.trackFieldHistory) return;
  const changedAt = new Date().toISOString();
  const entries = object.fields.filter((field) => field.trackHistory && !Object.is(previous[field.apiName], updated[field.apiName]))
    .map((field) => ({
      id: randomUUID(),
      objectApiName: object.apiName,
      recordId: updated.Id,
      fieldApiName: field.apiName,
      oldValue: previous[field.apiName] ?? null,
      newValue: updated[field.apiName] ?? null,
      changedBy: userId,
      changedAt
    }));
  if (entries.length) tenant.fieldHistory.push(...entries);
}

const createPlatformStateSchemaContext = {
  get accessControlSchema() { return accessControlSchema; },
  get approvalProcessSchema() { return approvalProcessSchema; },
  get approvalRequestSchema() { return approvalRequestSchema; },
  get automationSettingsSchema() { return automationSettingsSchema; },
  get campaignMemberSchema() { return campaignMemberSchema; },
  get chatterPostSchema() { return chatterPostSchema; },
  get connectorDefinitionSchema() { return connectorDefinitionSchema; },
  get connectorSettingsSchema() { return connectorSettingsSchema; },
  get currencySettingsSchema() { return currencySettingsSchema; },
  get customNotificationSchema() { return customNotificationSchema; },
  get dashboardFolderSchema() { return dashboardFolderSchema; },
  get dashboardSchema() { return dashboardSchema; },
  get dashboardSnapshotSchema() { return dashboardSnapshotSchema; },
  get dashboardSubscriptionSchema() { return dashboardSubscriptionSchema; },
  get dashboardTerritorySchema() { return dashboardTerritorySchema; },
  get defaultConnectorDefinitions() { return defaultConnectorDefinitions; },
  get defaultConnectorSettings() { return defaultConnectorSettings; },
  get defaultLightningApps() { return defaultLightningApps; },
  get emailAlertSchema() { return emailAlertSchema; },
  get fieldHistoryEntrySchema() { return fieldHistoryEntrySchema; },
  get flowExecutionLogSchema() { return flowExecutionLogSchema; },
  get flowInterviewSchema() { return flowInterviewSchema; },
  get flowSchema() { return flowSchema; },
  get integrationConnectionSchema() { return integrationConnectionSchema; },
  get libraryComponentSchema() { return libraryComponentSchema; },
  get lightningAppSchema() { return lightningAppSchema; },
  get namedCredentialSchema() { return namedCredentialSchema; },
  get objectSchema() { return objectSchema; },
  get pageSchema() { return pageSchema; },
  get platformEventMessageSchema() { return platformEventMessageSchema; },
  get platformEventSchema() { return platformEventSchema; },
  get recordActivitySchema() { return recordActivitySchema; },
  get recordShareSchema() { return recordShareSchema; },
  get reportFolderSchema() { return reportFolderSchema; },
  get reportSchema() { return reportSchema; },
  get runtimeRecordSchema() { return runtimeRecordSchema; },
  get scheduleRetrySchema() { return scheduleRetrySchema; },
  get sharingSettingSchema() { return sharingSettingSchema; }
};
export type CreatePlatformStateSchemaDependencies = typeof createPlatformStateSchemaContext;
const { stateSchema } = createPlatformStateSchema(createPlatformStateSchemaContext);

export type ObjectMetadataChange = {
  objectApiName: string; revision: number; action: 'CREATED' | 'UPDATED' | 'DELETED' | 'FIELD_CREATED' | 'FIELD_UPDATED' | 'FIELD_DELETED';
  actorUserId: string; at: string; before?: ObjectMetadata; after?: ObjectMetadata;
};

const fullObjectPermissions = { read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true };
const systemAdminPermissions = [
  'metadata:read', 'metadata:write', 'security:read', 'security:manage',
  'objects:manage', 'flows:manage', 'flows:run', 'namedCredentials:manage',
  'connectorApps:view', 'connectorApps:edit', 'connectorApps:secrets', 'connectorApps:test', 'connectorApps:install',
  'reports:manage', 'pages:manage',
  'components:manage', 'dashboards:manage', 'dashboards:viewTeam', 'data:viewAll', 'email:send', 'callouts:execute', 'notifications:send', 'approvals:manage'
];
const salesPermissions = ['metadata:read'];
const supportPermissions = ['metadata:read', 'namedCredentials:manage'];
const connectorAppCatalog = z.object({
  object: objectSchema,
  packages: z.array(z.record(z.unknown())),
  flows: z.array(flowSchema)
}).parse(JSON.parse(readFileSync(new URL('../data/connector-apps.json', import.meta.url), 'utf8')));
const installableAppCatalog = loadAppSeedCatalog();
function ensureConnectorAppRecords(records: RuntimeRecord[] | undefined, ownerId: string): RuntimeRecord[] {
  const existing = [...(records ?? [])];
  const now = new Date().toISOString();
  for (const values of connectorAppCatalog.packages) {
    const position = existing.findIndex((record) => record.AppKey__c === values.AppKey__c);
    if (position >= 0) {
      const previous = existing[position];
      const added = Object.fromEntries(Object.entries(values).filter(([key]) => previous[key] === undefined));
      // Upgrade only the original placeholder history mapping, never tenant-customised views.
      const legacyPlaceholder = previous.RecordObject__c === 'Communication_Records__c'
        && previous.RecordFilterField__c === 'Source__c'
        && values.RecordObject__c === '' && values.RecordFilterField__c === '';
      existing[position] = runtimeRecordSchema.parse({
        ...previous, ...added,
        ...(legacyPlaceholder ? { RecordObject__c: '', RecordFilterField__c: '', RecordFilterValue__c: '' } : {}),
        // Upgrade only the shipped legacy WhatsApp probe; keep custom tenant test paths.
        ...(previous.AppKey__c === 'whatsapp' && previous.TestPath__c === '{!PhoneNumberId}'
          ? { TestPath__c: values.TestPath__c } : {})
      });
      continue;
    }
    existing.push(runtimeRecordSchema.parse({
      ...values, Id: randomUUID(), OwnerId: ownerId, RecordTypeId: 'master',
      CreatedDate: now, LastModifiedDate: now
    }));
  }
  return existing;
}
const baseObjects: ObjectMetadata[] = [
  connectorAppCatalog.object,
  { apiName: 'User', label: 'User', pluralLabel: 'Users', kind: 'Standard Object', description: 'Platform users who belong to this tenant.', fields: [
    { apiName: 'Name', label: 'Full Name', dataType: 'Text(121)', required: true, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: true, unique: true },
    { apiName: 'Username', label: 'Username', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false },
    { apiName: 'UserRoleId', label: 'User Role', dataType: 'Text(18)', required: false, unique: false }
  ] },
  { apiName: 'Account', label: 'Account', pluralLabel: 'Accounts', kind: 'Standard Object', description: 'Companies and organizations that you do business with.', fields: [
    { apiName: 'Name', label: 'Account Name', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Type', label: 'Account Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Channel Partner / Reseller', 'Technology Partner', 'Other'], picklistRestricted: true },
    { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
    { apiName: 'AnnualRevenue', label: 'Annual Revenue', dataType: 'Currency(18, 0)', required: false, unique: false },
    { apiName: 'NumberOfEmployees', label: 'Employees', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'Website', label: 'Website', dataType: 'URL', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Account Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Accounts' } },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false }
  ] },
  { apiName: 'Contact', label: 'Contact', pluralLabel: 'Contacts', kind: 'Standard Object', description: 'People associated with your accounts.', fields: [
    { apiName: 'Name', label: 'Contact Name', dataType: 'Name', required: true, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Contacts' } },
    { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Contact Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedContacts' } }
  ], listViewButtons: ['New', 'Change Owner', 'Import', 'Add to Campaign'] },
  { apiName: 'Lead', label: 'Lead', pluralLabel: 'Leads', kind: 'Standard Object', description: 'Prospective customers and the sources that introduced them.', fields: [
    { apiName: 'FirstName', label: 'First Name', dataType: 'Text(40)', required: false, unique: false },
    { apiName: 'LastName', label: 'Last Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Company', label: 'Company', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Street', label: 'Street', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'LeadSource', label: 'Lead Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'], picklistRestricted: true },
    { apiName: 'Status', label: 'Lead Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['New', 'Working', 'Qualified', 'Unqualified'], picklistRestricted: true, defaultValue: 'New' },
    { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
    { apiName: 'Rating', label: 'Rating', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Hot', 'Warm', 'Cold'], picklistRestricted: true },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Lead Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Leads' } }
  ] },
  { apiName: 'Opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', kind: 'Standard Object', description: 'Potential revenue and deals in progress.', fields: [
    { apiName: 'Name', label: 'Opportunity Name', dataType: 'Text(120)', required: true, unique: false },
    { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Existing Business', 'New Business'], picklistRestricted: true },
    { apiName: 'LeadSource', label: 'Lead Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'], picklistRestricted: true },
    { apiName: 'Amount', label: 'Amount', dataType: 'Currency(16, 2)', required: false, unique: false },
    { apiName: 'CloseDate', label: 'Close Date', dataType: 'Date', required: true, unique: false },
    { apiName: 'NextStep', label: 'Next Step', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'StageName', label: 'Stage', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Id. Decision Makers', 'Perception Analysis', 'Proposal/Price Quote', 'Negotiation/Review', 'Closed Won', 'Closed Lost'], picklistRestricted: true },
    { apiName: 'Probability', label: 'Probability (%)', dataType: 'Percent(3, 0)', required: false, unique: false },
    { apiName: 'Fiscal', label: 'Fiscal Period', dataType: 'Text(30)', required: false, unique: false },
    { apiName: 'Age', label: 'Age', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Opportunities' } },
    { apiName: 'OwnerId', label: 'Opportunity Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Opportunities' } },
    { apiName: 'OwnerRole', label: 'Owner Role', dataType: 'Text(80)', required: false, unique: false }
  ] },
  { apiName: 'Case', label: 'Case', pluralLabel: 'Cases', kind: 'Standard Object', description: 'Customer questions, feedback, and product issues.', fields: [
    { apiName: 'CaseNumber', label: 'Case Number', dataType: 'Auto Number', required: true, unique: true },
    { apiName: 'Subject', label: 'Subject', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['New', 'Working', 'Escalated', 'Closed'], picklistRestricted: true },
    { apiName: 'Priority', label: 'Case Priority', dataType: 'Picklist', required: true, unique: false, picklistValues: ['High', 'Medium', 'Low'], picklistRestricted: true },
    { apiName: 'CreatedDate', label: 'Date/Time Opened', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'Age', label: 'Age', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'IsOpen', label: 'Open', dataType: 'Checkbox', required: false, unique: false },
    { apiName: 'IsClosed', label: 'Closed', dataType: 'Checkbox', required: false, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Cases' } },
    { apiName: 'OwnerId', label: 'Case Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedCases' } }
  ] },
  { apiName: 'Campaign', label: 'Campaign', pluralLabel: 'Campaigns', kind: 'Standard Object', description: 'Marketing initiatives and their associated contacts.', fields: [
    { apiName: 'Name', label: 'Campaign Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Conference', 'Webinar', 'Email', 'Advertisement', 'Direct Mail', 'Other'], picklistRestricted: true },
    { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Planned', 'In Progress', 'Completed', 'Aborted'], picklistRestricted: true, defaultValue: 'Planned' },
    { apiName: 'StartDate', label: 'Start Date', dataType: 'Date', required: false, unique: false },
    { apiName: 'EndDate', label: 'End Date', dataType: 'Date', required: false, unique: false },
    { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false, defaultValue: true },
    { apiName: 'OwnerId', label: 'Campaign Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Campaigns' } }
  ] },
  { apiName: 'Renewal__c', label: 'Renewal', pluralLabel: 'Renewals', kind: 'Custom Object', description: 'Tracks upcoming customer contract renewals.', fields: [
    { apiName: 'Name', label: 'Renewal Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Account__c', label: 'Account', dataType: 'Lookup(Account)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Renewals' } },
    { apiName: 'Renewal_Date__c', label: 'Renewal Date', dataType: 'Date', required: true, unique: false },
    { apiName: 'ARR__c', label: 'Annual Recurring Revenue', dataType: 'Currency(16, 2)', required: false, unique: false }
  ] },
  { apiName: 'Communication_Records__c', label: 'Communication Records', pluralLabel: 'Communication Records', kind: 'Custom Object', description: 'Unified messages and API audit activity with metadata-driven channel filtering.', fields: [
    { apiName: 'Name', label: 'Communication ID', dataType: 'AutoNumber', required: true, unique: false },
    { apiName: 'Api_Id__c', label: 'API ID', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Url__c', label: 'URL', dataType: 'URL', required: false, unique: false },
    { apiName: 'Auth_Type__c', label: 'Authentication Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['None', 'Bearer', 'Basic', 'API Key', 'Other'], picklistRestricted: true },
    { apiName: 'Method__c', label: 'HTTP Method', dataType: 'Picklist', required: false, unique: false, picklistValues: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'], picklistRestricted: true },
    { apiName: 'Direction__c', label: 'Direction', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Incoming', 'Outgoing'], picklistRestricted: true },
    { apiName: 'Request_Body__c', label: 'Request Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Response_Body__c', label: 'Response Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Event_Type__c', label: 'Event Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['API Call', 'Message'], picklistRestricted: true },
    { apiName: 'Communication_Mode__c', label: 'Communication Mode', dataType: 'Picklist', required: false, unique: false, picklistValues: ['API', 'WhatsApp', 'SMS', 'Email', 'Other'], picklistRestricted: true },
    { apiName: 'Source__c', label: 'Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['API', 'Webhook', 'Flow', 'Other'], picklistRestricted: true },
    { apiName: 'Message_Body__c', label: 'Message Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'From_Number__c', label: 'From Number', dataType: 'Phone', required: false, unique: false },
    { apiName: 'To_Number__c', label: 'To Number', dataType: 'Phone', required: false, unique: false },
    { apiName: 'Conversation_Key__c', label: 'Conversation Key', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Channel_Account__c', label: 'WhatsApp Channel Account', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Assigned_User__c', label: 'Assigned User', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Contact_Name__c', label: 'Contact Name', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Read_At__c', label: 'Read At', dataType: 'Date/Time', required: false, unique: false },
    { apiName: 'Media_URL__c', label: 'Media URL', dataType: 'URL', required: false, unique: false },
    { apiName: 'Media_Name__c', label: 'Media Name', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Media_Type__c', label: 'Media Type', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'Conversation_Context__c', label: 'Conversation Context', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'Status__c', label: 'Processing Status', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Received', 'Pending', 'Processing', 'Sent', 'Completed', 'Failed', 'Expired'], picklistRestricted: true },
    { apiName: 'Provider_Message_Id__c', label: 'Provider Message ID', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Status_Code__c', label: 'HTTP Status Code', dataType: 'Number(3, 0)', required: false, unique: false },
    { apiName: 'Error__c', label: 'Error', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Duration_Ms__c', label: 'Duration (ms)', dataType: 'Number(12, 0)', required: false, unique: false },
    { apiName: 'Occurred_At__c', label: 'Occurred At', dataType: 'Date/Time', required: false, unique: false }
  ], settings: {
    allowReports: true, allowActivities: false, trackFieldHistory: false, allowInChatter: false,
    deploymentStatus: 'Deployed', recordNameType: 'Auto Number', recordNameFormat: 'ONECOM-{000000000000000000000}'
  }, searchLayouts: { searchResults: ['Name', 'Api_Id__c', 'Url__c', 'Auth_Type__c', 'Method__c', 'Direction__c', 'Request_Body__c', 'Response_Body__c', 'Source__c', 'Status_Code__c', 'Error__c', 'Duration_Ms__c', 'Occurred_At__c'] },
    listViewFilter: { fieldApiName: 'Event_Type__c', value: 'API Call' } },
  { apiName: 'ConnectorProvider__c', label: 'Connector Provider', pluralLabel: 'Connector Providers', kind: 'Standard Object', description: 'Metadata definitions for external API connector providers.', fields: [
    { apiName: 'Name', label: 'Provider Name', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'ConnectorKey__c', label: 'Connector Key', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'AuthType__c', label: 'Authentication Type', dataType: 'Picklist', required: true, unique: false, picklistValues: ['NONE', 'BEARER', 'BASIC', 'API_KEY'], picklistRestricted: true },
    { apiName: 'BaseUrl__c', label: 'Base URL', dataType: 'URL', required: true, unique: false },
    { apiName: 'AuthCredential__c', label: 'Authentication Credential Field', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'CredentialsSchema__c', label: 'Credentials Schema', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Operations__c', label: 'Operations', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Test__c', label: 'Connection Test', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'TimeoutMs__c', label: 'Timeout (ms)', dataType: 'Number(9, 0)', required: true, unique: false, defaultValue: 30000 },
    { apiName: 'RetryPolicy__c', label: 'Retry Policy', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['ACTIVE', 'INACTIVE'], picklistRestricted: true, defaultValue: 'ACTIVE' }
  ] },
  { apiName: 'IntegrationConnection__c', label: 'Integration Connection', pluralLabel: 'Integration Connections', kind: 'Standard Object', description: 'Tenant-owned configured connections to external connector providers.', fields: [
    { apiName: 'Name', label: 'Connection Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'ConnectorKey__c', label: 'Connector Key', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Configuration__c', label: 'Connector Configuration', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['ACTIVE', 'INACTIVE'], picklistRestricted: true, defaultValue: 'ACTIVE' },
    { apiName: 'TestStatus__c', label: 'Test Status', dataType: 'Text(30)', required: false, unique: false },
    { apiName: 'LastTestedAt__c', label: 'Last Tested At', dataType: 'Date/Time', required: false, unique: false }
  ] },
  { apiName: 'UneConnector__c', label: 'Une Connector', pluralLabel: 'Une Connectors', kind: 'Standard Object', description: 'Legacy connector settings records.', fields: [
    { apiName: 'Name', label: 'Connector Name', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'ConnectorType__c', label: 'Connector Type', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Not Configured', 'Configured'], picklistRestricted: true, defaultValue: 'Not Configured' },
    { apiName: 'Configuration__c', label: 'Configuration Values', dataType: 'Long Text Area', required: false, unique: false, description: 'Connector configuration values stored as JSON metadata.' }
  ] }
];
const createTenantDefaultsContext = {
  get accessControlSchema() { return accessControlSchema; },
  get baseObjects() { return baseObjects; },
  get connectorAppCatalog() { return connectorAppCatalog; },
  get connectorDefinitionRecords() { return connectorDefinitionRecords; },
  get connectorRecords() { return connectorRecords; },
  get defaultConnectorDefinitions() { return defaultConnectorDefinitions; },
  get defaultConnectorSettings() { return defaultConnectorSettings; },
  get defaultLightningApps() { return defaultLightningApps; },
  get ensureConnectorAppRecords() { return ensureConnectorAppRecords; },
  get flowSchema() { return flowSchema; },
  get fullObjectPermissions() { return fullObjectPermissions; },
  get pageSchema() { return pageSchema; },
  get salesPermissions() { return salesPermissions; },
  get seedWhatsappDummyCredential() { return seedWhatsappDummyCredential; },
  get supportPermissions() { return supportPermissions; },
  get systemAdminPermissions() { return systemAdminPermissions; },
  get whatsappContextFlow() { return whatsappContextFlow; },
  get whatsappRouterFlow() { return whatsappRouterFlow; },
  get withObjectDefaults() { return withObjectDefaults; }
};
export type CreateTenantDefaultsDependencies = typeof createTenantDefaultsContext;
const { buildDefaultProfiles, defaultTenantData } = createTenantDefaults(createTenantDefaultsContext);
function connectorRecords(settings: ConnectorSettings[], ownerId: string): RuntimeRecord[] {
  const now = new Date().toISOString();
  return settings.map((setting) => stampRecordAuditFields({
    Id: randomUUID(),
    Name: setting.label,
    ConnectorType__c: setting.apiName,
    Status__c: setting.fields.some((field) => field.value.trim()) ? 'Configured' : 'Not Configured',
    Configuration__c: JSON.stringify(Object.fromEntries(setting.fields.map((field) => [field.apiName, field.value]))),
    OwnerId: ownerId,
    RecordTypeId: 'master',
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now));
}
function connectorDefinitionRecords(definitions: ConnectorDefinition[], ownerId: string): RuntimeRecord[] {
  const now = new Date().toISOString();
  return definitions.map((definition) => stampRecordAuditFields({
    Id: randomUUID(),
    Name: definition.name,
    ConnectorKey__c: definition.connectorKey,
    AuthType__c: definition.authType,
    BaseUrl__c: definition.baseUrl,
    AuthCredential__c: definition.authCredential ?? '',
    CredentialsSchema__c: JSON.stringify(definition.credentialsSchema),
    Operations__c: JSON.stringify(definition.operations),
    Test__c: definition.test ? JSON.stringify(definition.test) : '',
    TimeoutMs__c: definition.timeoutMs,
    RetryPolicy__c: JSON.stringify(definition.retryPolicy),
    Status__c: definition.status,
    OwnerId: ownerId,
    RecordTypeId: 'master',
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now));
}
function integrationConnectionRecord(connection: IntegrationConnection, ownerId: string): RuntimeRecord {
  return stampRecordAuditFields({
    Id: connection.id,
    Name: connection.name,
    ConnectorKey__c: connection.connectorKey,
    Configuration__c: JSON.stringify(connection.configuration),
    Status__c: connection.status,
    TestStatus__c: connection.testStatus ?? '',
    LastTestedAt__c: connection.lastTestedAt ?? '',
    OwnerId: ownerId,
    RecordTypeId: 'master',
    CreatedDate: connection.createdAt,
    LastModifiedDate: connection.updatedAt
  }, ownerId, connection.updatedAt);
}
const whatsappDummyCredentialId = '11111111-1111-4111-8111-111111111111';
function whatsappRouterFlow(): FlowMetadata {
  return flowSchema.parse({
    apiName: 'WA_ROUTER', label: 'WhatsApp Router',
    description: 'Editable starter WhatsApp router. Change keywords, replies, record actions and credential in Flow Builder.',
    flowType: 'Record-Triggered Flow', status: 'Draft', versionNumber: 1, activeVersion: null,
    triggerObject: communicationObjectApiName,
    startConfig: { trigger: 'created', runWhen: 'after-save', conditionLogic: 'All', entryConditions: [{ field: 'Direction__c', operator: 'Equals', value: 'Incoming' },
      { field: 'Event_Type__c', operator: 'Equals', value: 'Message' },
      { field: 'Communication_Mode__c', operator: 'Equals', value: 'WhatsApp' },
      { field: 'Source__c', operator: 'Equals', value: 'Webhook' }] },
    elements: [
      { id: 1, type: 'Start', label: 'Incoming WhatsApp Message', config: { trigger: 'created', runWhen: 'after-save' } },
      { id: 2, type: 'Decision', label: 'Route by Keyword', config: { outcomes: [
        { name: 'Beauty', label: 'Beauty', conditionLogic: 'Any', conditions: [
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' },
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BEAUTY' }
        ] },
        { name: 'Roof', label: 'Roof', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ROOF' }] },
        { name: 'Accounts', label: 'Accounts', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ACCOUNTANT' }] },
        { name: 'Legal', label: 'Legal', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'LAWYER' }] },
        { name: 'Default', label: 'Default Outcome', conditions: [] }
      ] } },
      { id: 3, type: 'Assignment', label: 'Set Beauty Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Beauty. Edit this reply and next steps in Flow Builder.' } },
      { id: 4, type: 'Assignment', label: 'Set Roof Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Roof Cleaning. Edit this reply and next steps in Flow Builder.' } },
      { id: 5, type: 'Assignment', label: 'Set Accounts Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Accounts. Edit this reply and next steps in Flow Builder.' } },
      { id: 6, type: 'Assignment', label: 'Set Legal Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Legal. Edit this reply and next steps in Flow Builder.' } },
      { id: 7, type: 'Assignment', label: 'Set Default Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Please reply BARBER, ROOF, ACCOUNTANT or LAWYER.' } },
      { id: 8, type: 'HTTP Callout', label: 'Send WhatsApp Reply', config: {
        namedCredentialId: whatsappDummyCredentialId, method: 'POST', path: 'messages',
        headers: 'Content-Type: application/json',
        body: '{"messaging_product":"whatsapp","to":"{!$Record.From_Number__c}","type":"text","text":{"body":"{!ReplyText}"}}',
        statusVariable: 'CalloutStatus', onError: 'FAULT_PATH'
      } },
      { id: 9, type: 'Create Records', label: 'Log Outgoing WhatsApp Message', config: { object: communicationObjectApiName, fieldValues: [
        { field: 'Event_Type__c', value: 'Message' }, { field: 'Communication_Mode__c', value: 'WhatsApp' },
        { field: 'Source__c', value: 'Flow' },
        { field: 'Direction__c', value: 'Outgoing' }, { field: 'From_Number__c', value: '{!$Record.To_Number__c}' },
        { field: 'To_Number__c', value: '{!$Record.From_Number__c}' }, { field: 'Message_Body__c', value: '{!ReplyText}' },
        { field: 'Conversation_Key__c', value: '{!$Record.Conversation_Key__c}' }, { field: 'Status__c', value: 'Sent' }
      ] } },
      { id: 10, type: 'Update Records', label: 'Mark Incoming Message Processed', config: { object: communicationObjectApiName, conditions: [{ field: 'Id', operator: 'Equals', value: '{!$Record.Id}' }], fieldValues: [{ field: 'Status__c', value: 'Sent' }] } },
      { id: 11, type: 'Assignment', label: 'Capture Callout Error', config: { variable: 'FlowError', operator: 'Assign', value: '{!$Flow.FaultMessage}' } },
      { id: 12, type: 'Update Records', label: 'Record WhatsApp Delivery Failure', config: {
        object: communicationObjectApiName, conditions: [{ field: 'Id', operator: 'Equals', value: '{!$Record.Id}' }],
        fieldValues: [
          { field: 'Status__c', value: 'Failed' },
          { field: 'Error__c', value: 'WhatsApp delivery callout failed. Check Flow Debug for details.' }
        ]
      } }
    ],
    connectors: [
      { id: 'wa-start-route', from: 1, to: 2, label: '', kind: 'normal' },
      { id: 'wa-route-beauty', from: 2, to: 3, label: 'Beauty', kind: 'normal' },
      { id: 'wa-route-roof', from: 2, to: 4, label: 'Roof', kind: 'normal' },
      { id: 'wa-route-accounts', from: 2, to: 5, label: 'Accounts', kind: 'normal' },
      { id: 'wa-route-legal', from: 2, to: 6, label: 'Legal', kind: 'normal' },
      { id: 'wa-route-default', from: 2, to: 7, label: 'Default Outcome', kind: 'normal' },
      { id: 'wa-beauty-send', from: 3, to: 8, label: '', kind: 'normal' },
      { id: 'wa-roof-send', from: 4, to: 8, label: '', kind: 'normal' },
      { id: 'wa-accounts-send', from: 5, to: 8, label: '', kind: 'normal' },
      { id: 'wa-legal-send', from: 6, to: 8, label: '', kind: 'normal' },
      { id: 'wa-default-send', from: 7, to: 8, label: '', kind: 'normal' },
      { id: 'wa-send-log', from: 8, to: 9, label: '', kind: 'normal' },
      { id: 'wa-log-update', from: 9, to: 10, label: '', kind: 'normal' },
      { id: 'wa-send-fault', from: 8, to: 11, label: '', kind: 'fault' },
      { id: 'wa-fault-record-12', from: 11, to: 12, label: '', kind: 'normal' }
    ],
    resources: [
      { name: 'ReplyText', label: 'Reply Text', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: false, value: '' },
      { name: 'CalloutStatus', label: 'Callout Status', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: false, value: 0 },
      { name: 'FlowError', label: 'Flow Error', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '' }
    ], versions: []
  });
}
function whatsappContextFlow(): FlowMetadata {
  return flowSchema.parse({
    apiName: 'WA_CONTEXT', label: 'WhatsApp Conversation Context',
    description: 'Editable session selection. New keywords change the active topic without deleting other topics.',
    flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: 1,
    triggerObject: communicationObjectApiName,
    startConfig: { trigger: 'created', runWhen: 'before-save', conditionLogic: 'All',
      entryConditions: [
        { field: 'Event_Type__c', operator: 'Equals', value: 'Message' },
        { field: 'Communication_Mode__c', operator: 'Equals', value: 'WhatsApp' },
        { field: 'Source__c', operator: 'Equals', value: 'Webhook' },
        { field: 'Direction__c', operator: 'Equals', value: 'Incoming' }
      ] },
    elements: [
      { id: 1, type: 'Start', label: 'Inbound WhatsApp', config: { trigger: 'created', runWhen: 'before-save' } },
      { id: 2, type: 'Decision', label: 'Choose Context', config: { outcomes: [
        { name: 'Beauty', label: 'Beauty', conditionLogic: 'Any', conditions: [
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BEAUTY' },
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' }
        ] },
        { name: 'Legal', label: 'Legal', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'LAWYER' }] },
        { name: 'Roof', label: 'Roof', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ROOF' }] },
        { name: 'Accounts', label: 'Accounts', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ACCOUNTANT' }] },
        { name: 'Default', label: 'Keep Current Context', conditions: [] }
      ] } },
      { id: 3, type: 'Assignment', label: 'Use Beauty', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Beauty' } },
      { id: 4, type: 'Assignment', label: 'Use Legal', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Legal' } },
      { id: 5, type: 'Assignment', label: 'Use Roof', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Roof' } },
      { id: 6, type: 'Assignment', label: 'Use Accounts', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Accounts' } },
      { id: 7, type: 'End', label: 'Keep Session', config: {} }
    ],
    connectors: [
      { id: 'c-start', from: 1, to: 2, label: '', kind: 'normal' },
      { id: 'c-beauty', from: 2, to: 3, label: 'Beauty', kind: 'normal' },
      { id: 'c-legal', from: 2, to: 4, label: 'Legal', kind: 'normal' },
      { id: 'c-roof', from: 2, to: 5, label: 'Roof', kind: 'normal' },
      { id: 'c-accounts', from: 2, to: 6, label: 'Accounts', kind: 'normal' },
      { id: 'c-default', from: 2, to: 7, label: 'Default Outcome', kind: 'normal' },
      { id: 'c-beauty-end', from: 3, to: 7, label: '', kind: 'normal' },
      { id: 'c-legal-end', from: 4, to: 7, label: '', kind: 'normal' },
      { id: 'c-roof-end', from: 5, to: 7, label: '', kind: 'normal' },
      { id: 'c-accounts-end', from: 6, to: 7, label: '', kind: 'normal' }
    ],
    resources: [], versions: []
  });
}
// One-time, idempotent migration from legacy UNE connector records to the Flow credential store.
// No legacy record is deleted until runtime dependencies have been migrated and tested.
function migrateUneConnectorCredentials(
  tenantId: string,
  records: Record<string, any>[],
  definitions: ConnectorDefinition[],
  current: StoredNamedCredential[]
): StoredNamedCredential[] {
  if (!process.env.METADRIVE_CREDENTIAL_KEYS || !process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID) return current;
  const result = [...current];
  for (const record of records) {
    const label = String(record.Name ?? '').trim();
    if (!label) continue;
    let configuration: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(String(record.Configuration__c || '{}'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        configuration = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
      }
    } catch { continue; }
    const requestedName = String(configuration.NamedCredential ?? '').trim();
    const name = requestedName && /^[A-Za-z][A-Za-z0-9_]*$/.test(requestedName)
      ? requestedName
      : label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^A-Za-z]+/, 'Connector_').toUpperCase();
    const existing = result.find((credential) =>
      credential.name.toUpperCase() === name.toUpperCase()
      || (label.toLowerCase() === 'email' && credential.protocol === 'SMTP')
      || (label.toLowerCase() === 'whatsapp' && credential.name === 'WhatsApp_Dummy'));
    if (existing) {
      const index = result.indexOf(existing);
      result[index] = { ...existing, configuration: { ...existing.configuration, ...configuration } };
      continue;
    }
    const provider = definitions.find((definition) =>
      definition.name.toLowerCase() === label.toLowerCase()
      || (label.toLowerCase() === 'uber eats' && definition.name.toLowerCase() === 'uber')
      || (label.toLowerCase() === 'whatsapp' && definition.name.toLowerCase().includes('whatsapp')));
    const candidateUrl = String(configuration.ApiBaseUrl || configuration.BaseUrl || provider?.baseUrl || '');
    let baseUrl = 'https://placeholder.invalid/';
    try {
      const parsedUrl = new URL(candidateUrl);
      if (parsedUrl.protocol === 'https:' && !parsedUrl.username && !parsedUrl.password && !parsedUrl.search && !parsedUrl.hash) {
        baseUrl = parsedUrl.toString();
      }
    } catch { /* Leave the placeholder URL until the tenant configures the provider. */ }
    const id = randomUUID();
    const now = new Date().toISOString();
    result.push(namedCredentialSchema.parse({
      id, name, label, protocol: 'HTTPS', baseUrl,
      authType: 'None', configuration,
      ...sealCredentialPayload(tenantId, id, {}),
      createdAt: now, updatedAt: now
    }));
  }
  return result;
}
function seedWhatsappDummyCredential(tenantId: string, current: StoredNamedCredential[]): StoredNamedCredential[] {
  if (current.some((credential) => credential.id === whatsappDummyCredentialId || credential.name === 'WhatsApp_Dummy')) return current;
  if (!process.env.METADRIVE_CREDENTIAL_KEYS || !process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID) return current;
  const now = new Date().toISOString();
  return [...current, namedCredentialSchema.parse({
    id: whatsappDummyCredentialId, name: 'WhatsApp_Dummy', label: 'WhatsApp Dummy — update before activation',
    protocol: 'HTTPS', baseUrl: 'https://graph.facebook.com/v22.0/000000000000000/', authType: 'None',
    ...sealCredentialPayload(tenantId, whatsappDummyCredentialId, {}), createdAt: now, updatedAt: now
  })];
}

function relationshipApiName(label: string): string {
  const normalized = label.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z]/.test(normalized) ? normalized : `Related_${normalized}`;
}
function withObjectDefaults(object: ObjectMetadata): ObjectMetadata {
  const fieldsWithOwner = object.apiName !== 'User' && !object.fields.some((field) => field.apiName === 'OwnerId')
    ? [...object.fields, fieldSchema.parse({
        apiName: 'OwnerId',
        label: `${object.label} Owner`,
        dataType: 'Lookup(User)',
        required: true,
        unique: false,
        relationship: {
          type: 'Lookup',
          targetObject: 'User',
          relationshipName: 'Owner',
childRelationshipName: relationshipApiName(
  `Owned${object.pluralLabel.replace(/[^a-zA-Z0-9_]/g, '')}`
)
        }
      })]
    : object.fields;
  const sourceFields = object.fields.some((field) => /^Currency(?:\(|$)/.test(field.dataType))
    && !fieldsWithOwner.some((field) => field.apiName === 'CurrencyIsoCode')
    ? [...fieldsWithOwner, fieldSchema.parse({
        apiName: 'CurrencyIsoCode',
        label: 'Currency ISO Code',
        dataType: 'Text(3)',
        required: false,
        unique: false
      })]
    : fieldsWithOwner;
  const fields = sourceFields.map((field) => {
    const standardDefinition = object.kind === 'Standard Object'
      ? baseObjects.find((candidate) => candidate.apiName === object.apiName)?.fields.find((candidate) => candidate.apiName === field.apiName)
      : undefined;
    const enrichedField = field.picklistValues || !standardDefinition?.picklistValues
      ? field
      : { ...field, picklistValues: standardDefinition.picklistValues, picklistRestricted: standardDefinition.picklistRestricted };
    if (enrichedField.relationship || enrichedField.formula) return enrichedField;
    const relationshipMatch = /^(Lookup|Master-Detail|Hierarchical)\(([^)]+)\)$/.exec(enrichedField.dataType);
    if (!relationshipMatch) return enrichedField;
    return {
      ...enrichedField,
      relationship: {
        type: relationshipMatch[1] as 'Lookup' | 'Master-Detail' | 'Hierarchical',
        targetObject: relationshipMatch[2],
        relationshipName: field.apiName.replace(/(__c|Id)$/, ''),
        childRelationshipName: relationshipApiName(object.pluralLabel)
      }
    };
  });
  const fieldApiNames = fields.map((field) => field.apiName);
  const nameField = fields.find((field) => field.apiName === 'Name')?.apiName ?? fieldApiNames[0];
  const pageLayouts = object.pageLayouts ?? [
    { id: `${object.apiName}-default`, label: 'Default Layout', sections: [{ id: 'record-information', label: 'Record Information', columns: 2, fieldApiNames }], relatedLists: [], actions: ['New', 'Edit', 'Delete'] }
  ];
  const recordTypes = object.recordTypes ?? [{ id: 'master', label: 'Master', developerName: 'Master', active: true, isDefault: true }];
  const compactLayout = object.compactLayout ?? { label: 'System Default', fieldApiNames: fieldApiNames.slice(0, 5) };
  const compactLayouts = object.compactLayouts ?? [{
    id: `${object.apiName}-compact-default`,
    ...compactLayout
  }];
  return {
    ...object,
    fields,
    pageLayouts,
    recordTypes,
    pageLayoutAssignments: object.pageLayoutAssignments ?? [{
      profileId: '*',
      recordTypeId: recordTypes.find((recordType) => recordType.isDefault)?.id ?? recordTypes[0]?.id ?? 'master',
      pageLayoutId: pageLayouts[0]?.id ?? `${object.apiName}-default`
    }],
    compactLayout,
    compactLayouts,
    compactLayoutAssignments: object.compactLayoutAssignments ?? [{
      profileId: '*',
      recordTypeId: recordTypes.find((recordType) => recordType.isDefault)?.id ?? recordTypes[0]?.id ?? 'master',
      compactLayoutId: compactLayouts[0]?.id ?? `${object.apiName}-compact-default`
    }],
    fieldSets: object.fieldSets ?? [],
    searchLayouts: object.searchLayouts ?? {
      searchResults: fieldApiNames.slice(0, 5),
      lookupDialog: nameField ? [nameField] : [],
      lookupPhoneDialog: nameField ? [nameField] : []
    },
    relatedLookupFilters: object.relatedLookupFilters ?? [],
    listViewButtons: object.listViewButtons ?? ['New', 'Change Owner', 'Import'],
    actions: object.actions ?? [
      { id: 'new', label: 'New', type: 'Standard', enabled: true },
      { id: 'edit', label: 'Edit', type: 'Standard', enabled: true },
      { id: 'delete', label: 'Delete', type: 'Standard', enabled: true }
    ],
    settings: object.settings ?? {
      allowReports: true,
      allowActivities: true,
      trackFieldHistory: false,
      allowInChatter: false,
      deploymentStatus: 'Deployed',
      recordNameType: 'Text',
      recordNameFormat: ''
    }
  };
}
function ensureCommunicationFields(object: ObjectMetadata): ObjectMetadata {
  if (object.apiName !== 'Communication_Records__c') return object;
  const defaults = baseObjects.find((item) => item.apiName === object.apiName)!;
  const existingFields = new Set(object.fields.map((field) => field.apiName));
  const addedFields = defaults.fields.filter((field) => !existingFields.has(field.apiName));
  const updatedFields = object.fields.map(field => {
    if (field.apiName === 'Occurred_At__c' && field.required) return { ...field, required: false };
    if (field.apiName === 'Status__c' && field.picklistValues && !field.picklistValues.includes('Expired')) {
      return { ...field, picklistValues: [...field.picklistValues, 'Expired'] };
    }
    return field;
  });
  if (!addedFields.length && updatedFields.every((field, index) => field === object.fields[index])) return object;
  const fieldApiNames = addedFields.map((field) => field.apiName);
  return {
    ...object,
    description: object.description || defaults.description,
    fields: [...updatedFields, ...addedFields],
    pageLayouts: object.pageLayouts?.map((layout, index) => index === 0 ? {
      ...layout,
      sections: layout.sections.map((section, sectionIndex) => sectionIndex === 0
        ? { ...section, fieldApiNames: [...new Set([...section.fieldApiNames, ...fieldApiNames])] }
        : section)
    } : layout)
  };
}
function ensureLeadStreetField(object: ObjectMetadata): ObjectMetadata {
  if (object.apiName !== 'Lead' || object.fields.some((field) => field.apiName === 'Street')) return object;
  const streetField = baseObjects.find((item) => item.apiName === 'Lead')
    ?.fields.find((field) => field.apiName === 'Street');
  if (!streetField) throw new Error('Standard Lead Street field metadata is missing');
  return { ...object, fields: [...object.fields, streetField] };
}
const createStateHydrationContext = {
  get baseObjects() { return baseObjects; },
  get buildDefaultProfiles() { return buildDefaultProfiles; },
  get chatterPostSchema() { return chatterPostSchema; },
  get connectorAppCatalog() { return connectorAppCatalog; },
  get connectorDefinitionRecords() { return connectorDefinitionRecords; },
  get connectorRecords() { return connectorRecords; },
  get dataPath() { return dataPath; },
  get defaultConnectorDefinitions() { return defaultConnectorDefinitions; },
  get ensureCommunicationFields() { return ensureCommunicationFields; },
  get ensureConnectorAppRecords() { return ensureConnectorAppRecords; },
  get ensureLeadStreetField() { return ensureLeadStreetField; },
  get flowSchema() { return flowSchema; },
  get fullObjectPermissions() { return fullObjectPermissions; },
  get persistedMetadataReadMode() { return persistedMetadataReadMode; },
  get installableAppCatalog() { return installableAppCatalog; },
  get integrationConnectionRecord() { return integrationConnectionRecord; },
  get maintenanceMode() { return maintenanceMode; },
  get migrateUneConnectorCredentials() { return migrateUneConnectorCredentials; },
  get persistState() { return persistState; },
  get recordActivitySchema() { return recordActivitySchema; },
  get seedWhatsappDummyCredential() { return seedWhatsappDummyCredential; },
  get stateSchema() { return stateSchema; },
  get supportPermissions() { return supportPermissions; },
  get systemAdminPermissions() { return systemAdminPermissions; },
  get whatsappContextFlow() { return whatsappContextFlow; },
  get whatsappRouterFlow() { return whatsappRouterFlow; },
  get withObjectDefaults() { return withObjectDefaults; }
};
export type CreateStateHydrationDependencies = typeof createStateHydrationContext;
const { loadState, parsePersistedPlatformState } = createStateHydration(createStateHydrationContext);

const initializePlatformStateContext = {
  persistence: { persistenceMode, readPersistedState, readDurableAuthLogins,
    readAuthLogoutRevocations, persistToPostgres },
  get bundledCustomComponentsPath() { return bundledCustomComponentsPath; },
  get dataPath() { return dataPath; },
  get installableAppCatalog() { return installableAppCatalog; },
  get loadState() { return loadState; },
  get maintenanceMode() { return maintenanceMode; },
  get platformStore() { return platformStore; }
};
const platformInitialization = await initializePlatformState(initializePlatformStateContext);

function publicIntegrationConnection(connection: IntegrationConnection, definition: ConnectorDefinition, credentials: Record<string, string>) {
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
function publicNamedCredential(credential: StoredNamedCredential) {
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
// No schema/tenant is visible to a new tenant until its first durable commit.
// Serialize provisioning within an instance; SQL modes also use optimistic
// revisions to reject cross-instance stale writers rather than lose data.
const createTenantProvisioningContext = {
  get defaultTenantData() { return defaultTenantData; },
  get connectorRecords() { return connectorRecords; },
  get defaultConnectorSettings() { return defaultConnectorSettings; },
  get ensureConnectorAppRecords() { return ensureConnectorAppRecords; },
  get persistState() { return persistState; },
  get platformStore() { return platformStore; }
};
export type CreateTenantProvisioningDependencies = typeof createTenantProvisioningContext;
const tenantProvisioning = createTenantProvisioning(createTenantProvisioningContext);

const createTenantBootstrapContext = {
  get createTenant() { return tenantProvisioning.createTenant; },
  get persistState() { return persistState; },
  get platformStore() { return platformStore; }
};
const { bootstrapTenant } = createTenantBootstrap(createTenantBootstrapContext);
// During guarded database maintenance, bootstrap must never mutate persisted state.
// Existing users and tenants are loaded read-only; bootstrap resumes after maintenance.
if (!maintenanceMode) await bootstrapTenant();
const createTenantDataServiceContext = {
  get bundledCustomComponentsPath() { return bundledCustomComponentsPath; },
  get installableAppCatalog() { return installableAppCatalog; },
  get persistState() { return persistState; },
  get platformStore() { return platformStore; },
  get provisioningPendingTenants() { return tenantProvisioning.provisioningPendingTenants; }
};
const { tenantIsActive, tenantData, persistTenantRecords } = createTenantDataService(createTenantDataServiceContext);
function withSecurityEvent(
  tenant: TenantData,
  actorUserId: string,
  action: string,
  details?: Record<string, string>,
  targetUserId?: string
): TenantData {
  const event: SecurityAuditEvent = {
    id: randomUUID(), at: new Date().toISOString(), actorUserId, action,
    ...(targetUserId ? { targetUserId } : {}),
    ...(details ? { details } : {})
  };
  // No passwords, bearer tokens, MFA secrets, raw request bodies, or network identifiers.
  return { ...tenant, securityAudit: [...tenant.securityAudit, event].slice(-5000) };
}

function getPrincipal(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw new Error('Authenticated principal was not established');
  return principal;
}
function principalUser(principal: Principal): LocalUser | undefined {
  return platformStore.state.users.find((user) => user.id === principal.userId && user.tenantId === principal.tenantId && !user.disabled);
}
// In-memory, tenant-reference/versioned authorization cache. No TTL-based stale grants:
// tenant metadata updates replace the tenant object; identity changes replace the
// LocalUser object; platform policy changes replace the policy array.
const { effectivePermissions, principalForUser } = createCorePermissionRuntime(() => platformStore.state);

const { reportFolderAccessLevelForUser, reportFolderForUser, validateReportFolderReferences } = createReportFolderPermissions({ folderAccessLevelFromFolders, validateDashboardFolderReferences });
const { canSelectDashboardRunningUser, dashboardRunningUserChoices, dashboardRunningPrincipal, dashboardRunningUserSelectionError } = createDashboardRunningUserHelpers({
  getUsers: () => platformStore.state.users,
  toPrincipal: principalForUser,
  isRoleAtOrBelow: roleIsAtOrBelow
});

function requirePermission(permission: string) {
  return requireAnyPermission(permission);
}
function requireAnyPermission(...permissions: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = getPrincipal(res);
    const data = tenantData(principal.tenantId);
    const user = principalUser(principal);
    if (!data || !user) return res.status(403).json({ error: 'Tenant membership is no longer active' });
    const effective = effectivePermissions(user, data);
    if (!permissions.some((permission) => effective.includes(permission))) {
      return res.status(403).json({ error: `Missing required permission: ${permissions.join(' or ')}` });
    }
    next();
  };
}
const tenantForRequestHost = (req: Request) => resolveTenantForRequestHost(req, platformStore.state.tenantRegistry);
const accessAuthentication = createAccessAuthentication({
  jwtService, getState: () => platformStore.state, tenantIsActive, requestTenantMatches,
  mfaRequiredForUser, effectivePermissions
});
function cookieValue(req: Request, name: string): string | undefined {
  const header = req.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
function setRefreshCookie(res: Response, token: string): void {
  const age = jwtService.config.refreshTokenTtlSeconds;
  res.setHeader('Set-Cookie', `${refreshCookieName}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=${isProduction ? 'None' : 'Lax'}; Max-Age=${age}${isProduction ? '; Secure' : ''}`);
}
function clearRefreshCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${refreshCookieName}=; Path=/api/auth; HttpOnly; SameSite=${isProduction ? 'None' : 'Lax'}; Max-Age=0${isProduction ? '; Secure' : ''}`);
}
function issueRefreshSession(user: LocalUser, previousFamilyId?: string, mfaVerified = false): { token: string; session: RefreshSession } {
  const token = createRefreshToken();
  return {
    token,
    session: {
      tokenHash: hashToken(token), familyId: previousFamilyId ?? randomUUID(),
      userId: user.id, tenantId: user.tenantId,
      expiresAt: Date.now() / 1000 + jwtService.config.refreshTokenTtlSeconds,
      usedAt: null, revokedAt: null, mfaVerified, authVersion: user.authVersion ?? 0
    }
  };
}
// Match the existing tenant metadata:read gate and /auth/me field-level RBAC.
// No business records or credentials are included in this optional payload.
function authenticatedLandingBootstrap(user: LocalUser, tenant: TenantData, permissions: string[]) {
  const principal: Principal = {
    userId: user.id, tenantId: user.tenantId, email: user.email,
    roles: [user.role], permissions
  };
  const accessUser = tenant.accessControl.users.find(item => item.id === user.id);
  const profileId = accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles);
  const fieldAccess = Object.fromEntries(tenant.objects.flatMap(object => object.fields.map(field => [
    `${object.apiName}.${field.apiName}`,
    {
      read: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'read'),
      edit: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'edit')
    }
  ])));
  const recordTypeAccess = Object.fromEntries(tenant.objects.flatMap(object => (object.recordTypes ?? [])
    .filter(recordType => recordType.active)
    .map(recordType => [`${object.apiName}.${recordType.id}`,
      hasRecordTypeAccessForUser(user.id, tenant, object.apiName, recordType.id)])));
  const canReadMetadata = permissions.includes('metadata:read');
  return {
    objects: canReadMetadata ? tenant.objects : [],
    pages: canReadMetadata ? tenant.pages : [],
    apps: canReadMetadata ? tenant.apps : [],
    user: { profileId, permissions, fieldAccess, recordTypeAccess }
  };
}
async function issueLoginResponse(res: Response, user: LocalUser, data: TenantData, familyId?: string,
  loginTiming?: { startedAt: number; passwordMs: number }, mfaVerified = false, includeLanding = false): Promise<void> {
  // JWT iat is second-granular. When reactivated in the same second as a
  // suspension, wait until a fresh token is strictly newer than the revocation.
  if (user.authRevokedBefore !== undefined && user.authRevokedBefore >= Math.floor(Date.now() / 1000)) {
    await new Promise<void>((resolve) => setTimeout(resolve,
      Math.max(0, (user.authRevokedBefore! + 1) * 1000 - Date.now() + 5)));
  }
  const permissions = effectivePermissions(user, data);
  const tokenStartedAt = performance.now();
  const issued = await jwtService.issue({
    userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions, mfaVerified,
    mfaVersion: user.mfaVersion ?? 0, authVersion: user.authVersion ?? 0
  });
  const tokenMs = performance.now() - tokenStartedAt;
  const refresh = issueRefreshSession(user, familyId, mfaVerified);
  const sessionStateStartedAt = performance.now();
  if (persistenceMode === 'typed') {
    const securityEvent: SecurityAuditEvent = {
      id: randomUUID(), at: new Date().toISOString(),
      actorUserId: user.id, action: 'auth.login.succeeded'
    };
    const durableEntry: DurableAuthLogin = {
      ...refresh.session, mfaVerified, authVersion: user.authVersion ?? 0,
      auditId: securityEvent.id, auditAt: securityEvent.at
    };
    try {
      // A single durable SQL INSERT replaces full graph serialization,
      // projection, delta verification and the congested state-write pool.
      await persistDurableAuthLogin(durableEntry);
    } catch (error) {
      console.error('Secure login session persistence failed', error);
      return void res.status(503).json({ error: 'Unable to establish a durable session' });
    }
    platformInitialization.durableAuthLogins.push(durableEntry);
    platformInitialization.authOverlayRevision++;
    // Merge onto the latest state after awaiting SQL; concurrent metadata
    // changes must not be overwritten by an older captured state object.
    const latestTenant = platformStore.state.tenants[user.tenantId];
    platformStore.state = {
      ...platformStore.state,
      refreshSessions: [...platformStore.state.refreshSessions, refresh.session],
      tenants: {
        ...platformStore.state.tenants,
        [user.tenantId]: {
          ...latestTenant,
          securityAudit: [...latestTenant.securityAudit, securityEvent].slice(-5000)
        }
      }
    };
    // Authentication has already committed to its own SQL session table.
    // No unrelated metadata commit may delay acknowledgment of this token.
    res.locals.authSqlCommitted = true;
  } else {
    const nextState = {
      ...platformStore.state,
      refreshSessions: [...platformStore.state.refreshSessions, refresh.session],
      tenants: {
        ...platformStore.state.tenants, [user.tenantId]: withSecurityEvent(data, user.id, 'auth.login.succeeded')
      },
      revokedAccessTokens: Object.fromEntries(
        Object.entries(platformStore.state.revokedAccessTokens).filter(([, expiry]) => expiry > Date.now() / 1000))
    };
    persistState(nextState);
    platformStore.state = nextState;
  }
  const sessionStateMs = performance.now() - sessionStateStartedAt;
  setRefreshCookie(res, refresh.token);
  if (loginTiming) {
    // Distinguish password verification, signing and synchronous whole-state
    // serialisation/local-file persistence. The async PostgreSQL commit is
    // enqueued here, not awaited, and must not be reported as complete.
    const ms = (value: number) => Math.max(0, value).toFixed(1);
    res.setHeader('Server-Timing',
      `password;dur=${ms(loginTiming.passwordMs)},signing;dur=${ms(tokenMs)},state-write;dur=${ms(sessionStateMs)},login;dur=${ms(performance.now() - loginTiming.startedAt)}`);
  }
  res.json({
    access_token: issued.accessToken,
    token_type: 'Bearer',
    expires_in: jwtService.config.accessTokenTtlSeconds,
    expires_at: issued.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions },
    ...(includeLanding ? { landing: authenticatedLandingBootstrap(user, data, permissions) } : {})
  });
}

type MfaLoginChallenge = {
  userId: string; tenantId: string; expiresAt: number; attempts: number; pendingSecret?: string; authVersion: number;
};
type MfaEnrollment = { userId: string; tenantId: string; expiresAt: number; attempts: number; secret: string; authVersion: number };
const mfaLoginChallenges = new Map<string, MfaLoginChallenge>();
const mfaEnrollments = new Map<string, MfaEnrollment>();
const mfaFailures = new Map<string, { count: number; resetAt: number }>();
const mfaChallengeTtlMs = 5 * 60 * 1000;
function mfaRequiredForUser(tenant: TenantData, user: LocalUser): boolean {
  return tenant.mfaPolicy.mode === 'Required'
    || (tenant.mfaPolicy.mode === 'Optional' && Boolean(user.mfaSecret));
}
function sealMfaSecret(tenantId: string, userId: string, secret: string): MfaEncryptedSecret {
  const ring = credentialKeyRing();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(Buffer.from('metadrive:mfa:v1:' + tenantId + ':' + userId));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    keyId: ring.activeKeyId,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}
function openMfaSecret(tenantId: string, userId: string, envelope: MfaEncryptedSecret): string {
  const key = credentialKeyRing().keys.get(envelope.keyId);
  if (!key) throw new Error('MFA encryption key is unavailable');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from('metadrive:mfa:v1:' + tenantId + ':' + userId));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}
function mfaCredentialReady(): boolean {
  try { credentialKeyRing(); return true; } catch { return false; }
}
function newMfaToken<T extends { expiresAt: number }>(store: Map<string, T>, value: T): string {
  const now = Date.now();
  for (const [key, item] of store) if (item.expiresAt <= now) store.delete(key);
  // Bound pending challenges even if a credentialed client repeatedly requests new ones.
  if (store.size >= 2048) store.delete(store.keys().next().value!);
  const raw = randomBytes(32).toString('base64url');
  store.set(hashToken(raw), value);
  return raw;
}
function mfaRateLimited(userId: string): boolean {
  const failure = mfaFailures.get(userId);
  return Boolean(failure && failure.resetAt > Date.now() && failure.count >= 8);
}
function recordMfaFailure(userId: string): void {
  const previous = mfaFailures.get(userId);
  const now = Date.now();
  mfaFailures.set(userId, {
    count: previous && previous.resetAt > now ? previous.count + 1 : 1,
    resetAt: now + 15 * 60 * 1000
  });
}
function revokeUserRefreshSessions(userId: string, tenantId: string): RefreshSession[] {
  const now = Date.now() / 1000;
  return platformStore.state.refreshSessions.map((session) =>
    session.userId === userId && session.tenantId === tenantId && session.revokedAt === null
      ? { ...session, revokedAt: now }
      : session);
}
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const userLoginFailures = new Map<string, { count: number; until: number }>();
function recordUserLoginFailure(user: LocalUser): void {
  const now = Date.now();
  const previous = userLoginFailures.get(user.id);
  const count = previous && previous.until > now ? previous.count + 1 : 1;
  userLoginFailures.set(user.id, { count, until: now + 15 * 60_000 });
  if (userLoginFailures.size > 4096) {
    for (const [id, item] of userLoginFailures) if (item.until <= now) userLoginFailures.delete(id);
  }
  if (count < 8 || (user.lockedUntil ?? 0) > now) return;
  const tenant = tenantData(user.tenantId);
  if (!tenant) return;
  const nextState: PlatformState = {
    ...platformStore.state,
    users: platformStore.state.users.map((item) => item.id === user.id && item.tenantId === user.tenantId
      ? { ...item, lockedUntil: now + 15 * 60_000, authVersion: (item.authVersion ?? 0) + 1 }
      : item),
    refreshSessions: revokeUserRefreshSessions(user.id, user.tenantId),
    tenants: { ...platformStore.state.tenants, [user.tenantId]: withSecurityEvent(
      tenant, user.id, 'auth.account.auto-locked') }
  };
  persistState(nextState);
  platformStore.state = nextState;
}
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
});
const provisioningSchema = z.object({
  tenantId: z.string().min(2).max(63),
  tenantName: z.string().trim().min(1).max(120),
  adminName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(256),
  developerDomain: z.string().trim().min(4).max(253).optional()
});
function provisioningIdempotencyKey(req: Request): string | undefined {
  const key = req.header('Idempotency-Key');
  if (key !== undefined && !/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    throw new Error('Idempotency-Key must be 16–128 ASCII letters, numbers, dashes or underscores');
  return key;
}
registerHealthAndDiscoveryRoutes(app, { checkDatabaseConnection, jwtService, maintenanceMode, persistenceMode });
const developerActivationPending = new Set<string>();
export const phase3AuthContext = {
  app,
  jwtService,
  tenantHostRouting,
  requestTenantMatches,
  refreshCookieName,
  webOrigins,
  tenantInfoForRecovery,
  activeFlowDefinition,
  durableLogouts: platformInitialization.durableLogouts,
  TenantProvisioningStoreError: tenantProvisioning.TenantProvisioningStoreError,
  createTenant: tenantProvisioning.createTenant,
  tenantIsActive,
  withSecurityEvent,
  tenantData,
  getPrincipal,
  principalUser,
  effectivePermissions,
  requirePermission,
  tenantForRequestHost,
  accessAuthentication,
  cookieValue,
  setRefreshCookie,
  clearRefreshCookie,
  issueRefreshSession,
  authenticatedLandingBootstrap,
  issueLoginResponse,
  mfaLoginChallenges,
  mfaEnrollments,
  mfaFailures,
  mfaChallengeTtlMs,
  mfaRequiredForUser,
  sealMfaSecret,
  openMfaSecret,
  mfaCredentialReady,
  newMfaToken,
  mfaRateLimited,
  recordMfaFailure,
  revokeUserRefreshSessions,
  loginAttempts,
  userLoginFailures,
  recordUserLoginFailure,
  loginSchema,
  provisioningSchema,
  provisioningIdempotencyKey,
  persistState,
  persistTenantRecords,
  developerActivationPending,
  hashPassword,
  verifyPassword,
  hashToken,
  randomBytes,
  timingSafeEqual,
  performance,
  newTotpSecret,
  totpUri,
  verifyTotp,
  normalizeRecoveryPolicy,
  renderRecoveryTemplate,
  deliverWithFallback,
  RECOVERY_FLOW_API,
  recoveryFlowActions,
  defaultRecoveryFlowDefinition,
  randomInt,
  scryptSync,
  sendTenantEmail,
  persistAuthLogoutRevocation,
  persistenceMode,
  z,
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get latestStateCommit() { return platformStore.latestCommit; },
  set latestStateCommit(v: Promise<unknown>) { platformStore.latestCommit = v; },
  get authOverlayRevision() { return platformInitialization.authOverlayRevision; },
  set authOverlayRevision(v: number) { platformInitialization.authOverlayRevision = v; }
};
registerAuthenticationRoutes(phase3AuthContext);
registerSessionSecurityRoutes({ app, accessAuthentication, requirePermission, getPrincipal, principalUser,
  tenantData, jwtService, getState: () => platformStore.state, setState: (next) => { platformStore.state = next; },
  persistState, revokeUserRefreshSessions, withSecurityEvent, effectivePermissions,
  clearRefreshCookie, userLoginFailures });
// MD-01A: separate, audited platform policies. All lookups use the current in-memory
// platform state; no additional database read is introduced on guarded requests.
const platformPolicySchema = z.object({
  policies: z.array(z.enum(['platform:superadmin', 'licence:manage'])).max(2)
}).strict();
function activePlatformSuperadmins(): string[] {
  return platformStore.state.users.filter((user) => !user.disabled
    && (platformStore.state.platformPolicies[user.id] ?? []).includes('platform:superadmin')).map((user) => user.id);
}
function savePlatformPolicies(actorId: string, userId: string, policies: Array<'platform:superadmin' | 'licence:manage'>) {
  const previous = platformStore.state.platformPolicies[userId] ?? [];
  const next = [...new Set(policies)];
  const nextState: PlatformState = {
    ...platformStore.state,
    platformPolicies: { ...platformStore.state.platformPolicies, [userId]: next },
    platformPolicyAudit: [...platformStore.state.platformPolicyAudit, {
      actorId, userId, previous, next, at: new Date().toISOString()
    }].slice(-2000)
  };
  persistState(nextState);
  platformStore.state = nextState;
}
registerPlatformPolicyRoutes(app, {
  accessAuthentication, getPrincipal, principalUser, activePlatformSuperadmins,
  savePlatformPolicies, getState: () => platformStore.state, parsePolicies: (v) => platformPolicySchema.safeParse(v), routeParam
});
// MD-03.1: platform-only tenant directory and lifecycle. Tenant-editable
// profiles/permission sets never confer this policy; no impersonation or secrets.
const tenantManagementCreateSchema = provisioningSchema.strict();
const tenantManagementUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional()
}).strict().refine((value) => Object.keys(value).length > 0);
function tenantRegistryEntry(tenantId: string): TenantRegistryEntry {
  const saved = platformStore.state.tenantRegistry[tenantId];
  if (saved) return saved;
  // Older tenants pre-date the registry: display them without changing their data.
  const earliest = platformStore.state.users.filter((user) => user.tenantId === tenantId)
    .map((user) => user.createdAt).sort()[0] ?? new Date(0).toISOString();
  return { name: tenantId, description: '', status: 'ACTIVE', createdAt: earliest, updatedAt: earliest };
}
function tenantSummary(tenantId: string) {
  const entry = tenantRegistryEntry(tenantId);
  const users = platformStore.state.users.filter((user) => user.tenantId === tenantId);
  return {
    tenantId, name: entry.name, description: entry.description, status: entry.status,
    archivedAt: entry.archivedAt ?? null, retentionUntil: entry.retentionUntil ?? null, legalHold: entry.legalHold ?? false,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    domains: (entry.domains ?? []).filter((domain) => domain.status !== 'REVOKED'),
    // Provisioning request fingerprints remain server-side, never exposed in API responses.
    provisioning: entry.provisioning ?? { status: 'READY' as const, version: 0, completedAt: entry.createdAt },
    developerAccount: entry.developerSeed ? {
      email: entry.developerSeed.email,
      activated: Boolean(entry.developerSeed.activatedAt)
    } : null,
    userCount: users.length,
    activeUserCount: users.filter((user) => !user.disabled).length
  };
}
function requirePlatformTenantAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (!getPrincipal(res).permissions.includes('platform:superadmin')) {
    res.status(403).json({ error: 'Platform administrator policy required.' });
    return;
  }
  next();
}
function commitTenantChange(actorId: string, tenantId: string,
  action: TenantManagementAuditEvent['action'], next: TenantRegistryEntry,
  previous?: TenantRegistryEntry) {
  const nextState: PlatformState = {
    ...platformStore.state,
    tenantRegistry: { ...platformStore.state.tenantRegistry, [tenantId]: next },
    tenantManagementAudit: [...platformStore.state.tenantManagementAudit,
      { actorId, tenantId, action, at: new Date().toISOString(), ...(previous ? { previous } : {}), next }
    ].slice(-5000),
    ...(['SUSPENDED', 'ARCHIVED'].includes(action) ? {
      // Access JWTs are stateless; advance every tenant user's revocation epoch
      // so pre-suspension bearer tokens cannot revive after reactivation.
      users: platformStore.state.users.map((user) => user.tenantId === tenantId
        ? { ...user, authRevokedBefore: Math.max(user.authRevokedBefore ?? 0, Math.floor(Date.now() / 1000)) }
        : user),
      refreshSessions: platformStore.state.refreshSessions.map((session) =>
        session.tenantId === tenantId ? { ...session, revokedAt: Date.now() / 1000 } : session)
    } : {})
  };
  persistState(nextState);
  platformStore.state = nextState;
}
// MD-03.8: on-demand usage only for the selected tenant. Counts are
// informational; targets cannot silently disable users or tenant workflows.
const tenantUsageTargetSchema = z.object({
  users: z.number().int().min(1).max(1000000000).nullable().optional(),
  records: z.number().int().min(1).max(1000000000).nullable().optional(),
  objects: z.number().int().min(1).max(1000000000).nullable().optional(),
  flows: z.number().int().min(1).max(1000000000).nullable().optional()
}).strict();
function tenantUsageFor(tenantId: string) {
  return tenantUsageSnapshot({
    tenantId, tenant: platformStore.state.tenants[tenantId],
    users: platformStore.state.users, registry: tenantRegistryEntry(tenantId)
  });
}
const registerTenantRegistryRoutesContext = {
  get TenantProvisioningStoreError() { return tenantProvisioning.TenantProvisioningStoreError; },
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get commitTenantChange() { return commitTenantChange; },
  get createTenant() { return tenantProvisioning.createTenant; },
  get getPrincipal() { return getPrincipal; },
  get provisioningIdempotencyKey() { return provisioningIdempotencyKey; },
  get provisioningPendingTenants() { return tenantProvisioning.provisioningPendingTenants; },
  get requirePermission() { return requirePermission; },
  get requirePlatformTenantAdmin() { return requirePlatformTenantAdmin; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get tenantManagementCreateSchema() { return tenantManagementCreateSchema; },
  get tenantRegistryEntry() { return tenantRegistryEntry; },
  get tenantSummary() { return tenantSummary; },
  get tenantUsageFor() { return tenantUsageFor; },
  get tenantUsageTargetSchema() { return tenantUsageTargetSchema; }
};
export type TenantRegistryRoutesDependencies = typeof registerTenantRegistryRoutesContext;
registerTenantRegistryRoutes(registerTenantRegistryRoutesContext);
// MD-03.3: activation belongs to the tenant's security administrators only.
// A platform superadmin cannot activate an account in another tenant through
// the platform directory, nor obtain its password or silently impersonate it.
const activateDeveloperSchema = z.object({
  password: z.string().min(12).max(256)
}).strict();
const registerTenantProvisioningRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get activateDeveloperSchema() { return activateDeveloperSchema; },
  get app() { return app; },
  get commitTenantChange() { return commitTenantChange; },
  get developerActivationPending() { return developerActivationPending; },
  get getPrincipal() { return getPrincipal; },
  get hasObjectPermission() { return hasObjectPermission; },
  get hashPassword() { return hashPassword; },
  get jwtService() { return jwtService; },
  get latestStateCommit() { return platformStore.latestCommit; },
  get persistState() { return persistState; },
  get provisioningCommitFailed() { return tenantProvisioning.provisioningCommitFailed; },
  set provisioningCommitFailed(next: boolean) { tenantProvisioning.provisioningCommitFailed = next; },
  get provisioningPendingTenants() { return tenantProvisioning.provisioningPendingTenants; },
  get requirePlatformTenantAdmin() { return requirePlatformTenantAdmin; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get tenantManagementUpdateSchema() { return tenantManagementUpdateSchema; },
  get tenantRegistryEntry() { return tenantRegistryEntry; },
  get tenantSummary() { return tenantSummary; },
  get withSecurityEvent() { return withSecurityEvent; }
};
export type TenantProvisioningRoutesDependencies = typeof registerTenantProvisioningRoutesContext;
registerTenantProvisioningRoutes(registerTenantProvisioningRoutesContext);
// MD-03.5: domain ownership uses TXT DNS proofs. TLS/host attachment is
// configured at the edge; a verified domain is NOT an SSL certificate claim.
const addTenantDomainSchema = z.object({ hostname: z.string().min(4).max(253) }).strict();
const domainCheckInFlight = new Set<string>();
const domainCheckLastAttempt = new Map<string, number>();
let domainCommitUncertain = false;
function domainContext(req: Request, res: Response, platform: boolean): string | undefined {
  const tenantId = platform ? routeParam(req, 'tenantId') : getPrincipal(res).tenantId;
  return Object.hasOwn(platformStore.state.tenants, tenantId) && !tenantProvisioning.provisioningPendingTenants.has(tenantId)
    ? tenantId : undefined;
}
function checkedDomain(hostname: string): string | null {
  try { return normalizeTenantDomain(hostname); } catch { return null; }
}
function domainResponse(record: TenantDomainRecord) {
  return { ...record, verification: domainChallenge(record.hostname, record.verificationToken),
    hosting: 'Attach this hostname to the HTTPS application service and complete provider TLS validation separately.' };
}
async function saveDomainChange(actorId: string, tenantId: string,
  action: TenantManagementAuditEvent['action'], updated: TenantRegistryEntry, previous: TenantRegistryEntry) {
  if (domainCommitUncertain) throw new Error('Previous domain persistence is uncertain; restart and reconcile');
  commitTenantChange(actorId, tenantId, action, updated, previous);
  const committed = platformStore.latestCommit;
  try { await committed; } catch {
    domainCommitUncertain = true;
    throw new Error('Domain change persistence failed; restart and reconcile before further writes');
  }
}
function listTenantDomains(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  return res.json({ domains: (tenantRegistryEntry(tenantId).domains ?? [])
    .filter((item) => item.status !== 'REVOKED').map(domainResponse) });
}
async function addTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const parsed = addTenantDomainSchema.safeParse(req.body);
  const hostname = parsed.success ? checkedDomain(parsed.data.hostname) : null;
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  if (reservedDomain(hostname, webOrigins))
    return res.status(409).json({ error: 'Platform-owned hostnames cannot be registered to tenants' });
  if (Object.values(platformStore.state.tenantRegistry).some((entry) =>
    entry.domains?.some((domain) => domain.hostname === hostname && domain.status !== 'REVOKED')))
    return res.status(409).json({ error: 'Domain is already registered' });
  const previous = tenantRegistryEntry(tenantId);
  if ((previous.domains ?? []).filter((item) => item.status !== 'REVOKED').length >= 5)
    return res.status(409).json({ error: 'Maximum five active domains per tenant' });
  if ((previous.domains?.length ?? 0) >= 5000)
    return res.status(409).json({ error: 'Domain registration history requires archival' });
  const now = new Date().toISOString();
  const domain: TenantDomainRecord = {
    hostname, status: 'PENDING', verificationToken: randomBytes(32).toString('hex'), createdAt: now
  };
  const updated: TenantRegistryEntry = {
    ...previous, updatedAt: now,
    domains: [...(previous.domains ?? []).filter((item) => item.hostname !== hostname), domain]
  };
  try {
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_ADDED', updated, previous);
    return res.status(201).json({ domain: domainResponse(domain) });
  } catch { return res.status(503).json({ error: 'Unable to persist tenant domain' }); }
}
async function verifyTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const hostname = checkedDomain(routeParam(req, 'hostname'));
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  const current = tenantRegistryEntry(tenantId).domains?.find((item) => item.hostname === hostname && item.status !== 'REVOKED');
  if (!current) return res.status(404).json({ error: 'Domain does not belong to this tenant' });
  if (current.status === 'VERIFIED') return res.json({ domain: domainResponse(current) });
  const lock = tenantId + ':' + hostname;
  const nowMs = Date.now();
  if (domainCheckInFlight.has(lock) || nowMs - (domainCheckLastAttempt.get(lock) ?? 0) < 30_000)
    return res.status(429).json({ error: 'DNS verification may be retried after 30 seconds' });
  domainCheckInFlight.add(lock);
  domainCheckLastAttempt.set(lock, nowMs);
  if (domainCheckLastAttempt.size > 1000)
    for (const [key, at] of domainCheckLastAttempt)
      if (nowMs - at > 60_000) domainCheckLastAttempt.delete(key);
  try {
    const proof = domainChallenge(hostname, current.verificationToken);
    let txt: string[][];
    try { txt = await resolveTxt(proof.host); }
    catch { return res.status(409).json({ error: 'DNS TXT record is not available yet', verification: proof }); }
    if (!matchesDomainChallenge(txt, proof.value))
      return res.status(409).json({ error: 'DNS TXT ownership proof does not match', verification: proof });
    // DNS await can interleave with a domain deletion/re-registration.
    const previous = tenantRegistryEntry(tenantId);
    const latest = previous.domains?.find((item) => item.hostname === hostname && item.status !== 'REVOKED');
    if (!latest || latest.verificationToken !== current.verificationToken)
      return res.status(409).json({ error: 'Domain registration changed while verifying; retry' });
    if (latest.status === 'VERIFIED') return res.json({ domain: domainResponse(latest) });
    const now = new Date().toISOString();
    const verified: TenantDomainRecord = { ...latest, status: 'VERIFIED', verifiedAt: now };
    const updated: TenantRegistryEntry = {
      ...previous, updatedAt: now,
      domains: previous.domains!.map((item) => item.hostname === hostname ? verified : item)
    };
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_VERIFIED', updated, previous);
    return res.json({ domain: domainResponse(verified) });
  } catch { return res.status(503).json({ error: 'Unable to persist domain verification' }); }
  finally { domainCheckInFlight.delete(lock); }
}
async function removeTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const hostname = checkedDomain(routeParam(req, 'hostname'));
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  const previous = tenantRegistryEntry(tenantId);
  if (!previous.domains?.some((record) => record.hostname === hostname && record.status !== 'REVOKED'))
    return res.status(404).json({ error: 'Domain does not belong to this tenant' });
  const updated: TenantRegistryEntry = {
    ...previous, updatedAt: new Date().toISOString(),
    domains: previous.domains.map((item) => item.hostname === hostname
      ? { ...item, status: 'REVOKED' as const, revokedAt: new Date().toISOString() } : item)
  };
  try {
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_REMOVED', updated, previous);
    return res.json({ removed: true, hostname });
  } catch { return res.status(503).json({ error: 'Unable to remove tenant domain' }); }
}
const registerTenantsDomainRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get addTenantDomain() { return addTenantDomain; },
  get app() { return app; },
  get listTenantDomains() { return listTenantDomains; },
  get removeTenantDomain() { return removeTenantDomain; },
  get requirePermission() { return requirePermission; },
  get requirePlatformTenantAdmin() { return requirePlatformTenantAdmin; },
  get verifyTenantDomain() { return verifyTenantDomain; }
};
export type TenantsDomainRoutesDependencies = typeof registerTenantsDomainRoutesContext;
registerTenantsDomainRoutes(registerTenantsDomainRoutesContext);
const registerTenantLifecycleRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get commitTenantChange() { return commitTenantChange; },
  get getPrincipal() { return getPrincipal; },
  get provisioningPendingTenants() { return tenantProvisioning.provisioningPendingTenants; },
  get requirePlatformTenantAdmin() { return requirePlatformTenantAdmin; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantIsActive() { return tenantIsActive; },
  get tenantRegistryEntry() { return tenantRegistryEntry; },
  get tenantSummary() { return tenantSummary; }
};
export type TenantLifecycleRoutesDependencies = typeof registerTenantLifecycleRoutesContext;
registerTenantLifecycleRoutes(registerTenantLifecycleRoutesContext);
// MD-03.6: Retention controls are metadata only. No background or automatic purge.
// Retention and legal holds are auditable and platform-scoped, even for archived tenants.
const tenantRetentionSchema = z.object({
  retentionUntil: z.string().datetime().nullable(),
  legalHold: z.boolean()
}).strict();
const registerTenantRetentionRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get commitTenantChange() { return commitTenantChange; },
  get getPrincipal() { return getPrincipal; },
  get provisioningPendingTenants() { return tenantProvisioning.provisioningPendingTenants; },
  get requirePlatformTenantAdmin() { return requirePlatformTenantAdmin; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantRegistryEntry() { return tenantRegistryEntry; },
  get tenantRetentionSchema() { return tenantRetentionSchema; },
  get tenantSummary() { return tenantSummary; }
};
export type TenantRetentionRoutesDependencies = typeof registerTenantRetentionRoutesContext;
registerTenantRetentionRoutes(registerTenantRetentionRoutesContext);
// MD-03.7: An isolated platform-control database contains recovery cases and
// one-time factors. Never point it at the normal tenant application database.
// No runtime table migrations, startup grants, or privileged side doors.
const recoveryConfigured = process.env.METADRIVE_RECOVERY_ENABLED === 'true'
  && !!process.env.METADRIVE_RECOVERY_DATABASE_URL
  && !!process.env.METADRIVE_RECOVERY_SMTP_URL
  && !!process.env.METADRIVE_RECOVERY_FROM_EMAIL;
const recoveryDatabaseUrl = process.env.METADRIVE_RECOVERY_DATABASE_URL;
if (recoveryConfigured && process.env.DATABASE_URL) {
  const normal = new URL(process.env.DATABASE_URL);
  const separate = new URL(recoveryDatabaseUrl!);
  if (normal.hostname === separate.hostname && normal.pathname === separate.pathname
      && normal.port === separate.port) {
    throw new Error('Recovery must have a dedicated platform-control database, never the tenant application DB');
  }
}
const recoveryPool = recoveryConfigured ? new pg.Pool({
  connectionString: recoveryDatabaseUrl, max: 4,
  idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000
}) : undefined;
const recoverySmtp = recoveryConfigured ? new URL(process.env.METADRIVE_RECOVERY_SMTP_URL!) : undefined;
if (recoverySmtp && (!['smtp:', 'smtps:'].includes(recoverySmtp.protocol)
    || !recoverySmtp.username || !recoverySmtp.password)) {
  throw new Error('Recovery delivery requires authenticated SMTP with TLS');
}
const recoveryMailer = recoverySmtp
  ? nodemailer.createTransport({
      host: recoverySmtp.hostname,
      port: Number(recoverySmtp.port || (recoverySmtp.protocol === 'smtps:' ? 465 : 587)),
      secure: recoverySmtp.protocol === 'smtps:',
      requireTLS: recoverySmtp.protocol !== 'smtps:',
      tls: { servername: recoverySmtp.hostname, minVersion: 'TLSv1.2' },
      auth: { user: decodeURIComponent(recoverySmtp.username),
        pass: decodeURIComponent(recoverySmtp.password) }
    })
  : undefined;
installTenantRecoveryCentre(app, {
  pool: recoveryPool,
  deliver: recoveryMailer ? async (mail: { to: string; subject: string; text: string }) => {
    await recoveryMailer.sendMail({
      from: process.env.METADRIVE_RECOVERY_FROM_EMAIL!,
      to: mail.to, subject: mail.subject, text: mail.text
    });
  } : undefined,
  verifyDomain: async (record: TenantDomainRecord) => {
    const challenge = domainChallenge(record.hostname, record.verificationToken);
    return matchesDomainChallenge(await resolveTxt(challenge.host), challenge.value);
  },
  auth: accessAuthentication,
  tenantAdmin: requirePermission('security:manage'),
  platformAdmin: requirePlatformTenantAdmin,
  principal: getPrincipal,
  isCurrentOperator: (userId: string) => {
    const operator = platformStore.state.users.find(item => item.id === userId && !item.disabled);
    return Boolean(operator && operator.mfaSecret && tenantIsActive(operator.tenantId)
      && (platformStore.state.platformPolicies[operator.id] ?? []).includes('platform:superadmin'));
  },
  tenantUser: (tenantId: string, userId: string) =>
    platformStore.state.users.find(user => user.tenantId === tenantId && user.id === userId
      && !user.disabled && !((platformStore.state.platformPolicies[user.id] ?? []).includes('platform:superadmin'))),
  domains: (tenantId: string) => platformStore.state.tenantRegistry[tenantId]?.domains ?? [],
  // Every recovery action requires a new TOTP proof, even when tenant MFA
  // policy is only Optional. A cross-instance SQL uniqueness constraint blocks
  // replay and platform policies alone never count as MFA.
  freshMfa: async (res: Response, code: unknown) => {
    const principal = getPrincipal(res);
    const user = principalUser(principal);
    if (!recoveryPool || !user || !user.mfaSecret || typeof code !== 'string'
      || !/^\d{6}$/.test(code) || !tenantIsActive(user.tenantId))
      throw new Error('Verified fresh MFA is required');
    const secret = openMfaSecret(user.tenantId, user.id, user.mfaSecret);
    const step = verifyTotp(secret, code, user.mfaLastUsedStep ?? -1);
    if (step === null) throw new Error('Invalid or previously used MFA code');
    const reserved = await recoveryPool.query(
      'INSERT INTO tenant_recovery_mfa_steps(user_id,time_step) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
      [user.id, step]);
    if (reserved.rows.length !== 1) throw new Error('MFA code was already used');
    return { id: user.id, active: true, trustedMfa: true };
  },
  // Only the authenticated, token-redeeming claimant may apply this one-case
  // repair. Platform support cannot choose a password or get a tenant session.
  applyRestrictedRepair: async ({tenantId,userId,caseId}: {
    tenantId: string; userId: string; caseId: string
  }) => {
    const user = platformStore.state.users.find(item => item.id === userId && item.tenantId === tenantId && !item.disabled);
    const tenant = platformStore.state.tenants[tenantId];
    if (!user || !tenant || !tenantIsActive(tenantId)
      || !tenant.accessControl.profiles.some(profile => profile.id === 'system-administrator')
      || !tenant.accessControl.users.some(item => item.id === userId))
      throw new Error('Restricted tenant repair cannot be applied');
    const nextTenant = withSecurityEvent({
      ...tenant,
      accessControl: {
        ...tenant.accessControl,
        users: tenant.accessControl.users.map(item => item.id === userId
          ? {...item, profileId: 'system-administrator', role: 'System Administrator'} : item)
      }
    }, userId, 'security.recovery.admin-restored', {caseId}, userId);
    const now = Math.floor(Date.now() / 1000);
    const nextState: PlatformState = {
      ...platformStore.state,
      tenants: {...platformStore.state.tenants, [tenantId]: nextTenant},
      users: platformStore.state.users.map(item => item.id === userId && item.tenantId === tenantId
        ? {...item, role: 'System Administrator', authVersion: (item.authVersion ?? 0) + 1,
           authRevokedBefore: now} : item),
      refreshSessions: platformStore.state.refreshSessions.map(session => session.userId === userId && session.tenantId === tenantId
        ? {...session, revokedAt: now} : session)
    };
    persistState(nextState);
    platformStore.state = nextState;
    await platformStore.latestCommit;
  }
});

registerIdentityProfileRoute({ app, accessAuthentication, getPrincipal, principalUser, tenantData,
  profileIdForRole, hasFieldPermission, hasRecordTypeAccessForUser, effectivePermissions });
registerNotificationRoutes(app, { accessAuthentication, getPrincipal, tenantData, routeParam, persistTenantRecords });
const registerApprovalsDecisionRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get activeFlowDefinition() { return activeFlowDefinition; },
  get app() { return app; },
  get approvalDecisionSchema() { return approvalDecisionSchema; },
  get customNotificationSchema() { return customNotificationSchema; },
  get getPrincipal() { return getPrincipal; },
  get hasFieldPermission() { return hasFieldPermission; },
  get hasRecordAccess() { return hasRecordAccess; },
  get persistTenantRecords() { return persistTenantRecords; },
  get randomUUID() { return randomUUID; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; }
};
export type ApprovalsDecisionRoutesDependencies = typeof registerApprovalsDecisionRoutesContext;
registerApprovalsDecisionRoutes(registerApprovalsDecisionRoutesContext);
app.use('/api/metadata', accessAuthentication);
app.use('/api/connector-settings', accessAuthentication);
app.use('/api/connector-providers', accessAuthentication);
app.use('/api/integration-connections', accessAuthentication);
app.use('/api/named-credentials', accessAuthentication);
app.use('/api/component-library', accessAuthentication);
const registerObjectsListRoutesContext = {
  get app() { return app; },
  get getPrincipal() { return getPrincipal; },
  get requirePermission() { return requirePermission; },
  get tenantData() { return tenantData; }
};
export type ObjectsListRoutesDependencies = typeof registerObjectsListRoutesContext;
registerObjectsListRoutes(registerObjectsListRoutesContext);
const flowRouteServices = {
  get accessAuthentication() { return accessAuthentication; },
  get activeFlowDefinition() { return activeFlowDefinition; },
  get app() { return app; },
  get asConfigRows() { return asConfigRows; },
  get authoriseChatterFlow() { return authoriseChatterFlow; },
  get authoriseManualCoreFlow() { return authoriseManualCoreFlow; },
  get automationSettingsSchema() { return automationSettingsSchema; },
  get createFlowInterview() { return createFlowInterview; },
  get defaultAutomationSettings() { return defaultAutomationSettings; },
  get emailAlertRequestSchema() { return emailAlertRequestSchema; },
  get emailAlertSchema() { return emailAlertSchema; },
  get executeFlow() { return executeFlow; },
  get flowConditionsMatch() { return flowConditionsMatch; },
  get flowSchema() { return flowSchema; },
  get flowVariablesForUser() { return flowVariablesForUser; },
  get flowVersionSnapshot() { return flowVersionSnapshot; },
  get formulaContextForUser() { return formulaContextForUser; },
  get getPrincipal() { return getPrincipal; },
  get hasFieldPermission() { return hasFieldPermission; },
  get hasObjectPermission() { return hasObjectPermission; },
  get hasRecordAccess() { return hasRecordAccess; },
  get isSafeFlowRegex() { return isSafeFlowRegex; },
  get isValidFlowDateTime() { return isValidFlowDateTime; },
  get isValidFlowTime() { return isValidFlowTime; },
  get persistFlowFailure() { return persistFlowFailure; },
  get persistState() { return persistState; },
  get persistTenantRecords() { return persistTenantRecords; },
  get platformEventSchema() { return platformEventSchema; },
  get randomUUID() { return randomUUID; },
  get recordFlowDebugRequestSchema() { return recordFlowDebugRequestSchema; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get resolveFlowValue() { return resolveFlowValue; },
  get routeParam() { return routeParam; },
  get runtimeRecordSchema() { return runtimeRecordSchema; },
  get sanitizeChatterCallerInput() { return sanitizeChatterCallerInput; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get trustedChatterExecutionFlow() { return trustedChatterExecutionFlow; },
  get uniqueFlowHistory() { return uniqueFlowHistory; },
  get validateFlow() { return validateFlow; },
  get validateFlowInputValues() { return validateFlowInputValues; },
  get z() { return z; },
};
export type FlowRouteServices = typeof flowRouteServices;
const flowRouteRegistrar = createFlowRouteRegistrar(flowRouteServices);
flowRouteRegistrar.platformEvents();
// Metadata mutations share a single version and bounded, tenant-owned history.
// Writes still go through the current typed SQL/Aiven persistence implementation.
const metadataVersion = (object: ObjectMetadata | undefined): number => object?.revision ?? 0;
const objectMetadataRouteDependencies = { app, fieldSchema, relatedLookupFilterSchema, objectSchema, validateObjectRelationships, validateRelatedLookupFilters, validateRelatedLists, containsFieldReference, flowUsesObject, findFieldDependencies, findObjectDependencies, fullObjectPermissions, withObjectDefaults, tenantData, getPrincipal, requirePermission, requireAnyPermission, metadataVersion, persistTenantRecords, routeParam, formulaContextForUser, validateFieldChange, validateExistingFieldValues, validateObjectLayoutProfileAssignments, evaluateFormula, z };
export type ObjectMetadataRoutesDependencies = typeof objectMetadataRouteDependencies;
app.use('/api/metadata/objects', accessAuthentication, recordWritePolicyMetadataGuard(getPrincipal, tenantData));
registerObjectMetadataRoutes(objectMetadataRouteDependencies);
const registerApprovalsMetadataRoutesContext = {
  get activeFlowDefinition() { return activeFlowDefinition; },
  get app() { return app; },
  get approvalProcessRequestSchema() { return approvalProcessRequestSchema; },
  get approvalProcessSchema() { return approvalProcessSchema; },
  get getPrincipal() { return getPrincipal; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; }
};
export type ApprovalsMetadataRoutesDependencies = typeof registerApprovalsMetadataRoutesContext;
registerApprovalsMetadataRoutes(registerApprovalsMetadataRoutesContext);
flowRouteRegistrar.metadata();
const registerIntegrationsConnectionRoutesContext = {
  get app() { return app; },
  get connectorDefinitionRequestSchema() { return connectorDefinitionRequestSchema; },
  get credentialKeyRing() { return credentialKeyRing; },
  get executeConnectorTest() { return executeConnectorTest; },
  get getPrincipal() { return getPrincipal; },
  get httpsRequest() { return httpsRequest; },
  get integrationConnectionRecord() { return integrationConnectionRecord; },
  get integrationConnectionRequestSchema() { return integrationConnectionRequestSchema; },
  get integrationConnectionSchema() { return integrationConnectionSchema; },
  get isPublicAddress() { return isPublicAddress; },
  get isReservedHostname() { return isReservedHostname; },
  get lookup() { return lookup; },
  get openIntegrationCredentials() { return openIntegrationCredentials; },
  get persistTenantRecords() { return persistTenantRecords; },
  get publicIntegrationConnection() { return publicIntegrationConnection; },
  get randomUUID() { return randomUUID; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get sealIntegrationCredentials() { return sealIntegrationCredentials; },
  get stampRecordAuditFields() { return stampRecordAuditFields; },
  get tenantData() { return tenantData; }
};
export type IntegrationsConnectionRoutesDependencies = typeof registerIntegrationsConnectionRoutesContext;
registerIntegrationsConnectionRoutes(registerIntegrationsConnectionRoutesContext);
const registerIntegrationsConnectorSettingsRoutesContext = {
  get app() { return app; },
  get connectorSettingsSchema() { return connectorSettingsSchema; },
  get getPrincipal() { return getPrincipal; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get stampRecordAuditFields() { return stampRecordAuditFields; },
  get tenantData() { return tenantData; },
  get z() { return z; }
};
export type IntegrationsConnectorSettingsRoutesDependencies = typeof registerIntegrationsConnectorSettingsRoutesContext;
registerIntegrationsConnectorSettingsRoutes(registerIntegrationsConnectorSettingsRoutesContext);

type ConnectorRight = 'view' | 'edit' | 'secrets' | 'test' | 'install';
function connectorRight(principal: Principal, right: ConnectorRight): boolean {
  // Legacy installations retain access; new profiles can grant each permission independently.
  return principal.permissions.includes('connectorApps:' + right)
    || (principal.permissions.includes('namedCredentials:manage') && principal.permissions.includes('security:manage'));
}
function managedConnector(tenant: TenantData, credentialName: string): RuntimeRecord | undefined {
  return (tenant.records.Connector_App__c ?? []).find((item) => item.CredentialName__c === credentialName);
}
function disableOnConnectorUninstall(tenant: TenantData, previous: RuntimeRecord, next: RuntimeRecord) {
  // Every installation transition, including reinstall, starts with callouts disabled.
  // Configuration and encrypted secret bytes are preserved.
  if (previous.Installed__c !== next.Installed__c) {
    tenant.namedCredentials = tenant.namedCredentials.map((credential) =>
      credential.name === previous.CredentialName__c ? { ...credential, enabled: false } : credential);
  }
}
function assertConnectorLifecycleAccess(previous: RuntimeRecord, requested: RuntimeRecord, principal: Principal) {
  if ((previous.Installed__c !== requested.Installed__c || requested.TrialRequested__c === true)
    && !connectorRight(principal, 'install')) {
    throw new Error('Missing connectorApps:install permission to install, uninstall or start a trial.');
  }
}
// AppExchange is a tenant-scoped package catalogue, not an ordinary privately-owned
// business record list. Require connector viewing rights, then return only metadata
// for the authenticated tenant (never credentials or records from other tenants).
const registerIntegrationsConnectorAppRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get applyConnectorLifecycle() { return applyConnectorLifecycle; },
  get connectorEntitlement() { return connectorEntitlement; },
  get connectorRight() { return connectorRight; },
  get ensureConnectorAppRecords() { return ensureConnectorAppRecords; },
  get getPrincipal() { return getPrincipal; },
  get namedCredentialSchema() { return namedCredentialSchema; },
  get persistTenantRecords() { return persistTenantRecords; },
  get publicNamedCredential() { return publicNamedCredential; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get tenantData() { return tenantData; },
  get z() { return z; }
};
export type IntegrationsConnectorAppRoutesDependencies = typeof registerIntegrationsConnectorAppRoutesContext;
registerIntegrationsConnectorAppRoutes(registerIntegrationsConnectorAppRoutesContext);
// Operator-controlled activation: connectorApps:edit grants configuration access, not activation.
const registerCredentialStatusRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get connectorEntitlement() { return connectorEntitlement; },
  get connectorRight() { return connectorRight; },
  get credentialKeyRing() { return credentialKeyRing; },
  get effectivePermissions() { return effectivePermissions; },
  get getPrincipal() { return getPrincipal; },
  get managedConnector() { return managedConnector; },
  get namedCredentialSchema() { return namedCredentialSchema; },
  get persistTenantRecords() { return persistTenantRecords; },
  get principalUser() { return principalUser; },
  get publicNamedCredential() { return publicNamedCredential; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get tenantData() { return tenantData; },
  get z() { return z; }
};
export type CredentialStatusRoutesDependencies = typeof registerCredentialStatusRoutesContext;
registerCredentialStatusRoutes(registerCredentialStatusRoutesContext);
function configuredOAuthCallback():string {
  const raw=process.env.METADRIVE_OAUTH_CALLBACK_URL;
  if(!raw)throw new Error('OAuth callback URL is not configured.');
  const parsed=validatedOAuthUrl(raw);
  if(parsed.pathname!=='/api/oauth/callback' || parsed.search || parsed.hash)
    throw new Error('OAuth callback URL must identify the dedicated /api/oauth/callback endpoint.');
  return parsed.toString();
}
// Setup permission controls connection authorization. This endpoint never exposes tokens.
const registerCredentialManagementRoutesContext = {
  get app() { return app; },
  get beginOAuthAuthorization() { return beginOAuthAuthorization; },
  get completeOAuthAuthorization() { return completeOAuthAuthorization; },
  get configuredOAuthCallback() { return configuredOAuthCallback; },
  get connectorEntitlement() { return connectorEntitlement; },
  get connectorRight() { return connectorRight; },
  get createHash() { return createHash; },
  get credentialKeyRing() { return credentialKeyRing; },
  get getPrincipal() { return getPrincipal; },
  get httpsRequest() { return httpsRequest; },
  get isIP() { return isIP; },
  get isPublicAddress() { return isPublicAddress; },
  get isReservedHostname() { return isReservedHostname; },
  get lookup() { return lookup; },
  get managedConnector() { return managedConnector; },
  get namedCredentialPayloadSchema() { return namedCredentialPayloadSchema; },
  get namedCredentialRequestSchema() { return namedCredentialRequestSchema; },
  get namedCredentialSchema() { return namedCredentialSchema; },
  get nodemailer() { return nodemailer; },
  get oauthAccessTokenForCredential() { return oauthAccessTokenForCredential; },
  get oauthChallengeStore() { return oauthChallengeStore; },
  get oauthCredentialVault() { return oauthCredentialVault; },
  get openCredentialPayload() { return openCredentialPayload; },
  get persistTenantRecords() { return persistTenantRecords; },
  get publicNamedCredential() { return publicNamedCredential; },
  get randomUUID() { return randomUUID; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get safeOAuthTokenRequest() { return safeOAuthTokenRequest; },
  get sealCredentialPayload() { return sealCredentialPayload; },
  get tenantData() { return tenantData; }
};
export type CredentialManagementRoutesDependencies = typeof registerCredentialManagementRoutesContext;
registerCredentialManagementRoutes(registerCredentialManagementRoutesContext);
flowRouteRegistrar.emailAlerts();
flowRouteRegistrar.definitions();
// Reuse the same validated permission assignments for all object and field checks
// within a request, instead of repeatedly scanning profiles/sets for every cell.
const coreRecordAccess = createCoreRecordAccess({ principalUser });
const { authorizationGrants, canNavigate, canOpenApp, canOpenTab, hasObjectPermission, hasObjectWidePermission,
 hasRoleHierarchyAccess, publicGroupContainsUser, queueContainsUser, sharingRuleMatchesRecord,
 sharingRuleGrantsUser, recordShareIndex, hasRecordAccess, sanitizeRecordForRead, assertFieldEditPermissions } = coreRecordAccess;
function roleIsAtOrBelow(...args: Parameters<typeof coreRecordAccess.roleIsAtOrBelow>): boolean {
 return coreRecordAccess.roleIsAtOrBelow(...args);
}
function hasFieldPermission(...args: Parameters<typeof coreRecordAccess.hasFieldPermission>): boolean {
 return coreRecordAccess.hasFieldPermission(...args);
}

function profileIdForPrincipal(principal: Principal, tenant: TenantData): string {
  const user = principalUser(principal);
  if (!user) return '';
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  return accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles);
}

function resolveActiveLightningRecordPage(
  tenant: TenantData,
  objectApiName: string,
  appId: string,
  recordTypeId: string | undefined,
  profileId: string,
  formFactor: 'Desktop' | 'Phone'
): LightningPage | undefined {
  const match = resolvePageAssignment(tenant.pages, {
    pageType: 'Record Page', objectApiName, appId, recordTypeId, profileId, formFactor
  });
  if (match) return match;
  // Normal activation metadata is authoritative; no application-specific fallback.
  return undefined;
}

function resolveActiveLightningHomePage(
  tenant: TenantData,
  appId: string,
  profileId: string,
  formFactor: 'Desktop' | 'Phone'
): LightningPage | undefined {
  return resolvePageAssignment(tenant.pages, {
    pageType: 'Home Page', appId, profileId, formFactor
  });
}

function hasRecordTypeAccessForUser(userId: string, tenant: TenantData, objectName: string, recordTypeId: string): boolean {
  const user = tenant.accessControl.users.find((item) => item.id === userId);
  if (!user) return false;
  const key = `${objectName}.${recordTypeId}`;
  const profile = tenant.accessControl.profiles.find((item) =>
    item.id === (user.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles)));
  if (profile && profile.recordTypePermissions[key] !== false) return true;
  const sets = tenant.accessControl.permissionSets;
  if (sets.some((set) => user.permissionSetIds.includes(set.id) && set.recordTypePermissions[key] === true)) return true;
  return user.permissionSetGroupIds.some((groupId) => {
    const group = tenant.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    return Boolean(group && group.mutedRecordTypePermissions[key] !== true
      && sets.some((set) => group.permissionSetIds.includes(set.id) && set.recordTypePermissions[key] === true));
  });
}

function allocateAutoNumberSequence(tenantId: string, tenant: TenantData, object: ObjectMetadata, field: ObjectMetadata['fields'][number]): number {
  const latestTenant = tenantData(tenantId);
  if (!latestTenant) throw new Error(`Tenant "${tenantId}" is unavailable for auto-number allocation.`);
  const key = autoNumberSequenceKey(object.apiName, field.apiName);
  const sequence = Math.max(latestTenant.autoNumberSequences[key] ?? 0, tenant.autoNumberSequences[key] ?? 0) + 1;
  persistTenantRecords(tenantId, {
    ...latestTenant,
    autoNumberSequences: { ...latestTenant.autoNumberSequences, [key]: sequence }
  });
  tenant.autoNumberSequences = { ...tenant.autoNumberSequences, [key]: sequence };
  return sequence;
}
function applyRecordDefaults(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, userId: string): Record<string, unknown> {
  return applyMetadataRecordDefaults(tenantId, tenant, object, values, userId, {users:platformStore.state.users,hasRecordTypeAccessForUser,allocateAutoNumberSequence});
}
function redactCommunicationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCommunicationValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|authorization|token|api[-_]?key|credential|cookie/i.test(key)
        ? '[REDACTED]'
        : redactCommunicationValue(item)
    ]));
  }
  return value;
}

function communicationPayload(value: unknown): string {
  if (value === undefined || value === null) return '';
  let payload: unknown = value;
  if (typeof value === 'string') {
    try { payload = JSON.parse(value) as unknown; } catch { /* Plain-text payloads are retained as text. */ }
  }
  const serialized = typeof payload === 'string'
    ? payload
    : JSON.stringify(redactCommunicationValue(payload));
  const maximumLength = 120_000;
  return serialized.length > maximumLength ? `${serialized.slice(0, maximumLength - 15)}...[TRUNCATED]` : serialized;
}

function communicationSafeUrl(value: string): string {
  const url = new URL(value);
  for (const [key] of url.searchParams) {
    if (/password|secret|authorization|token|api[-_]?key|credential|cookie/i.test(key)) {
      url.searchParams.set(key, '[REDACTED]');
    }
  }
  return url.toString();
}

function supportedCommunicationMethod(method: string): string {
  const supportedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return supportedMethods.includes(method.toUpperCase()) ? method.toUpperCase() : 'OTHER';
}

function communicationError(responseBody: unknown): string {
  if (typeof responseBody === 'string') return responseBody.slice(0, 120_000);
  if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
    const response = responseBody as Record<string, unknown>;
    const error = response.error ?? response.message;
    return error === undefined ? '' : communicationPayload(error);
  }
  return '';
}

function appendCommunicationRecord(
  tenantId: string,
  requestedOwnerId: string,
  entry: {
    apiId: string;
    url: string;
    authType: string;
    method: string;
    direction: 'Incoming' | 'Outgoing';
    requestBody: string;
    responseBody: string;
    status: number;
    error: string;
    durationMs: number;
  }
): void {
  const tenant = tenantData(tenantId);
  const object = tenant?.objects.find((item) => item.apiName === 'Communication_Records__c');
  if (!tenant || !object) throw new Error(`Communication Records is unavailable for tenant "${tenantId}".`);
  const ownerId = platformStore.state.users.find((user) => user.id === requestedOwnerId && user.tenantId === tenantId && !user.disabled)?.id
    ?? platformStore.state.users.find((user) => user.tenantId === tenantId && !user.disabled)?.id;
  if (!ownerId) throw new Error(`No active owner is available for Communication Records in tenant "${tenantId}".`);
  const now = new Date().toISOString();
  const values = applyRecordDefaults(tenantId, tenant, object, {
    Api_Id__c: entry.apiId.slice(0, 255),
    Event_Type__c: 'API Call', Communication_Mode__c: 'API', Source__c: 'API',
    Url__c: entry.url,
    Auth_Type__c: entry.authType,
    Method__c: entry.method,
    Direction__c: entry.direction,
    Request_Body__c: entry.requestBody,
    Response_Body__c: entry.responseBody,
    Status_Code__c: entry.status,
    Error__c: entry.error,
    Duration_Ms__c: entry.durationMs,
    Occurred_At__c: now
  }, ownerId);
  validateRuntimeRecord(tenantId, tenant, object, values);
  const record = stampRecordAuditFields({
    ...values,
    Id: randomUUID(),
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now);
  persistTenantRecords(tenantId, {
    ...tenant,
    records: {
      ...tenant.records,
      Communication_Records__c: [...(tenant.records.Communication_Records__c ?? []), record]
    }
  });
}

function createFlowFailureLog(
  flow: Pick<FlowMetadata, 'apiName' | 'label'>,
  trigger: FlowExecutionLog['trigger'],
  error: unknown,
  userId: string | null
): FlowExecutionLog {
  return flowExecutionLogSchema.parse({
    id: randomUUID(),
    flowApiName: flow.apiName,
    flowLabel: flow.label,
    trigger,
    failedAt: new Date().toISOString(),
    error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    userId
  });
}
function persistFlowFailure(
  tenantId: string,
  flow: Pick<FlowMetadata, 'apiName' | 'label'>,
  trigger: FlowExecutionLog['trigger'],
  error: unknown,
  userId: string | null
): void {
  const tenant = tenantData(tenantId);
  if (!tenant) throw new Error(`Cannot record flow failure: tenant "${tenantId}" was not found.`);
  const log = createFlowFailureLog(flow, trigger, error, userId);
  persistTenantRecords(tenantId, { ...tenant, flowLogs: [...tenant.flowLogs, log] });
}
async function deleteRecordCascade(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  record: RuntimeRecord,
  depth = 0,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Relationship cascade depth exceeded the 10-level limit.');
  const user = platformStore.state.users.find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
  if (!user) throw new Error('The user initiating this deletion is no longer active.');
  const principal: Principal = {
    userId: user.id, tenantId, email: user.email, roles: [user.role], permissions: effectivePermissions(user, tenant)
  };
  if (!hasRecordAccess(principal, tenant, objectName, record, 'Delete')) {
    throw new Error(`Missing record-level delete access for "${objectName}" record "${record.Id}".`);
  }
  await runRecordTriggeredFlows(
    tenantId, tenant, userId, objectName, 'deleted', record, record, depth, false, debugExecution, debugTrace, rollbackSnapshot
  );
  for (const childObject of tenant.objects) {
    for (const field of childObject.fields) {
      if (!field.relationship || field.relationship.targetObject !== objectName) continue;
      const children = (tenant.records[childObject.apiName] ?? []).filter((item) => item[field.apiName] === record.Id);
      if (!children.length) continue;
      if (field.relationship.type === 'Master-Detail') {
        for (const child of children) {
          await deleteRecordCascade(
            tenantId, tenant, userId, childObject.apiName, child, depth + 1, debugExecution, debugTrace, rollbackSnapshot
          );
        }
      } else {
        if (field.relationship.deleteBehavior === 'Restrict') {
          throw new Error(`Cannot delete this record while lookup "${field.relationship.relationshipName}" (${childObject.apiName}.${field.apiName}) has related records.`);
        }
        if (field.required) throw new Error(`Cannot delete this record while required lookup "${childObject.apiName}.${field.apiName}" is populated.`);
        for (const child of children) {
          if (!hasRecordAccess(principal, tenant, childObject.apiName, child, 'Edit')) {
            throw new Error(`Missing record-level edit access to clear "${childObject.apiName}.${field.apiName}" on child record "${child.Id}".`);
          }
          assertFieldEditPermissions(principal, tenant, childObject, { [field.apiName]: null });
        }
        const childIds = new Set(children.map((child) => child.Id));
        const now = new Date().toISOString();
        tenant.records[childObject.apiName] = (tenant.records[childObject.apiName] ?? []).map((child) => {
          if (!childIds.has(child.Id)) return child;
          const updated = stampRecordAuditFields({ ...child, [field.apiName]: null, LastModifiedDate: now }, userId, now, child);
          appendFieldHistory(tenant, childObject, child, updated, userId);
          return updated;
        });
        for (const child of children) {
          const updated = tenant.records[childObject.apiName].find((item) => item.Id === child.Id);
          if (updated) {
            await runRecordTriggeredFlows(
              tenantId, tenant, userId, childObject.apiName, 'updated', updated, child,
              depth + 1, false, debugExecution, debugTrace, rollbackSnapshot
            );
          }
        }
      }
    }
  }
  tenant.records[objectName] = (tenant.records[objectName] ?? []).filter((item) => item.Id !== record.Id);
  tenant.recordShares = tenant.recordShares.filter((share) =>
    share.objectApiName !== objectName || share.recordId !== record.Id);
  if (objectName === 'Campaign') tenant.campaignMembers = tenant.campaignMembers.filter((member) => member.campaignId !== record.Id);
  if (objectName === 'Contact') tenant.campaignMembers = tenant.campaignMembers.filter((member) => member.contactId !== record.Id);
}
function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const recordRoutesDependencies = { app, accessAuthentication, accessControlSchema, recordShareSchema, recordActivitySchema, chatterCommentSchema, chatterPostSchema, appendFieldHistory, profileIdForRole, persistState, getState: () => platformStore.state, setState: (next: PlatformState) => { platformStore.state = next; }, tenantIsActive, withSecurityEvent, tenantData, getPrincipal, principalUser, effectivePermissions, disableOnConnectorUninstall, assertConnectorLifecycleAccess, canOpenApp, hasObjectPermission, hasObjectWidePermission, queueContainsUser, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, assertFieldEditPermissions, profileIdForPrincipal, resolveActiveLightningRecordPage, hasRecordTypeAccessForUser, applyRecordDefaults, persistTenantRecords, deleteRecordCascade, routeParam, formulaContextForUser, validateRuntimeRecord, runRecordTriggeredFlows, runBeforeSaveRecordTriggeredFlows, calculateFormulaFields, sanitizeRecordValues, withCaseClosedDate, recordUnmodified, stampRecordAuditFields, recordActionEnabled, normalizeFlowRecordAssignments, validateRelationshipReparenting, waitForPersistedState, randomUUID, applyConnectorLifecycle, z, hashPassword };
export type RecordRoutesDependencies = typeof recordRoutesDependencies;
registerRecordRoutes(recordRoutesDependencies);
// Data-source-neutral Chatter channel grants come from server-owned tenant records.
// Never accept account grants, user IDs, or view-all flags from browser properties.
const registerChatterAccessRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get chatterScopeForUser() { return chatterScopeForUser; },
  get communicationObjectApiName() { return communicationObjectApiName; },
  get getPrincipal() { return getPrincipal; },
  get hasObjectPermission() { return hasObjectPermission; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; }
};
export type ChatterAccessRoutesDependencies = typeof registerChatterAccessRoutesContext;
registerChatterAccessRoutes(registerChatterAccessRoutesContext);
flowRouteRegistrar.execution();
const recordFlowDebugRequestSchema = z.object({
  event: z.enum(['created', 'updated', 'deleted']),
  record: z.record(z.unknown()),
  prior: z.record(z.unknown()).nullable().optional(),
  isClone: z.boolean().default(false)
}).strict();

// Salesforce-style record-trigger testing: run the saved Flow definition
// against a disposable tenant snapshot, with no committed record changes,
// scheduled jobs, notifications or external communications.
flowRouteRegistrar.recordDebug();

flowRouteRegistrar.interviews();

const { findLibraryComponentUsages, ownedComponentIndex, componentNameTaken, usageBlockerDetails, syncBundledLibraryComponents } =
  createComponentLibraryService({
    getState: () => platformStore.state,
    setState: (state) => { platformStore.state = state; },
    persistState, bundledCustomComponentsPath, libraryComponentResizeSchema,
    defaultLibraryComponentResize, libraryComponentInputSchema, installableAppCatalog
  });

registerComponentLibraryRoutes({
  app, libraryComponentInputSchema, persistState, tenantData, getPrincipal, requirePermission, canOpenApp, canOpenTab, routeParam, findLibraryComponentUsages, ownedComponentIndex, componentNameTaken, usageBlockerDetails, syncBundledLibraryComponents,
  getState: () => platformStore.state, setState: (next) => { platformStore.state = next; }
});

registerDashboardRoutes({
 app, dashboardFolderShareSchema, dashboardFolderSchema, dashboardTerritorySchema, dashboardSchema, dashboardTimeZoneSchema, dashboardSubscriptionSchema, isNumericField, dashboardFilterOperatorAllowed, dashboardFilterValueError, sanitizeDashboardRichText, persistState, tenantData, getPrincipal, principalUser, effectivePermissions, dashboardRunningUserChoices, dashboardRunningPrincipal, dashboardRunningUserSelectionError, folderAccessLevelForUser, folderForUser, dashboardForUser, validateDashboardFolderReferences, requirePermission, requireAnyPermission, hasObjectPermission, hasRecordAccess, sanitizeRecordForRead, persistTenantRecords, routeParam, formulaContextForUser, dashboardRelationshipPaths, dispatchDashboardSubscription, nextDashboardSubscriptionRunAt, calculateFormulaFields, libraryComponentVisible, randomUUID, canAccessDashboard, canEditDashboard,
 getState: () => platformStore.state, setState: (next) => { platformStore.state = next; }
});

registerDashboardSnapshotRoutes({
 app, dashboardFilterSchema, reportFilterMatches, dashboardSnapshotSchema, dashboardFilterOperatorAllowed, dashboardFilterValueError, sanitizeDashboardRichText, tenantData, getPrincipal, dashboardRunningPrincipal, dashboardRunningUserSelectionError, reportFolderAccessLevelForUser, dashboardForUser, requirePermission, hasObjectPermission, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, persistTenantRecords, routeParam, formulaContextForUser, resolveDashboardCrossFilters, calculateFormulaFields, pickDashboardSnapshotProperties, libraryComponentVisible, randomUUID, sanitizeHtml, canAccessDashboard, matchesDashboardFilters,
 getState: () => platformStore.state, setState: (next) => { platformStore.state = next; }
});
const resolveReportCrossFilters = createReportCrossFilterResolver({hasObjectPermission, hasFieldPermission, hasRecordAccess, calculateFormulaFields, formulaContextForUser});
registerReportRoutes({
 app, runtimeRecordSchema, dashboardFilterSchema, parseReportFilterLogic, reportSchema, reportDateRangeBounds, evaluateReportFilterLogic, reportFilterMatches, dashboardFolderShareSchema, reportFolderSchema, isNumericField, reportFilterOperatorAllowed, dashboardFilterOperatorAllowed, dashboardFilterValueError, reportFilterValueError, persistState, tenantData, getPrincipal, dashboardRunningPrincipal, dashboardRunningUserSelectionError, reportFolderAccessLevelForUser, reportFolderForUser, validateReportFolderReferences, dashboardForUser, requirePermission, accessAuthentication, hasObjectPermission, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, persistTenantRecords, routeParam, formulaContextForUser, resolveReportCrossFilters, resolveDashboardCrossFilters, canManageReportFolders, calculateFormulaFields, randomUUID, canAccessDashboard, matchesDashboardFilters,
 getState: () => platformStore.state, setState: (next) => { platformStore.state = next; }
});
const registerAppsMetadataRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get canOpenApp() { return canOpenApp; },
  get canOpenTab() { return canOpenTab; },
  get getPrincipal() { return getPrincipal; },
  get lightningAppSchema() { return lightningAppSchema; },
  get persistState() { return persistState; },
  get profileIdForPrincipal() { return profileIdForPrincipal; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get resolveActiveLightningHomePage() { return resolveActiveLightningHomePage; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; }
};
export type AppsMetadataRoutesDependencies = typeof registerAppsMetadataRoutesContext;
registerAppsMetadataRoutes(registerAppsMetadataRoutesContext);

// Route aliases live only in tenant-keyed SQL metadata, never in platform state JSONB.
// The dedicated migration is intentionally explicit; missing schema fails closed.
function aliasDatabaseUnavailable(res: Response): Response {
  return res.status(503).json({ error: 'Route aliases require the approved SQL metadata migration' });
}
function aliasContext(principal: Principal, tenant: TenantData) {
  return {
    apps: tenant.apps, pages: tenant.pages, objects: tenant.objects,
    canOpenApp: (appId: string) => canOpenApp(principal, tenant, appId),
    canOpenTab: (objectId: string) => canOpenTab(principal, tenant, objectId)
  };
}
const registerAppsRouteAliasRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get aliasContext() { return aliasContext; },
  get aliasDatabaseUnavailable() { return aliasDatabaseUnavailable; },
  get app() { return app; },
  get canOpenApp() { return canOpenApp; },
  get getPrincipal() { return getPrincipal; },
  get getRouteAliasPool() { return getRouteAliasPool; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeAliasDestination() { return routeAliasDestination; },
  get routeParam() { return routeParam; },
  get rowToRouteAlias() { return rowToRouteAlias; },
  get tenantData() { return tenantData; },
  get validAliasSlug() { return validAliasSlug; },
  get validRouteIdentifier() { return validRouteIdentifier; },
  get validateRouteAliasInput() { return validateRouteAliasInput; }
};
export type AppsRouteAliasRoutesDependencies = typeof registerAppsRouteAliasRoutesContext;
registerAppsRouteAliasRoutes(registerAppsRouteAliasRoutesContext);

const registerPageListRoutesContext = {
  get app() { return app; },
  get getPrincipal() { return getPrincipal; },
  get isProtectedAdministrationPage() { return isProtectedAdministrationPage; },
  get requirePermission() { return requirePermission; },
  get tenantData() { return tenantData; }
};
export type PageListRoutesDependencies = typeof registerPageListRoutesContext;
registerPageListRoutes(registerPageListRoutesContext);
registerPageDeletionRoute(app,{permission:requireAnyPermission('metadata:write','pages:manage'),getPrincipal,getState:()=>platformStore.state,isProtected:isProtectedAdministrationPage,commit:async(next:PlatformState)=>{const prior=platformStore.state;platformStore.state=next;try{persistState(next);await platformStore.latestCommit}catch(error){platformStore.state=prior;throw error}}});
const registerPageUpdateRoutesContext = {
  get app() { return app; },
  get canAccessDashboard() { return canAccessDashboard; },
  get dashboardForUser() { return dashboardForUser; },
  get getPrincipal() { return getPrincipal; },
  get libraryComponentVisible() { return libraryComponentVisible; },
  get pageSchema() { return pageSchema; },
  get persistState() { return persistState; },
  get requireAnyPermission() { return requireAnyPermission; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get validateProtectedAdministrationPageUpdate() { return validateProtectedAdministrationPageUpdate; }
};
export type PageUpdateRoutesDependencies = typeof registerPageUpdateRoutesContext;
registerPageUpdateRoutes(registerPageUpdateRoutesContext);
const registerSecurityCurrencyRoutesContext = {
  get app() { return app; },
  get currencySettingsSchema() { return currencySettingsSchema; },
  get getPrincipal() { return getPrincipal; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requirePermission() { return requirePermission; },
  get tenantData() { return tenantData; }
};
export type SecurityCurrencyRoutesDependencies = typeof registerSecurityCurrencyRoutesContext;
registerSecurityCurrencyRoutes(registerSecurityCurrencyRoutesContext);
registerSecurityMetadataRoutes({
  app, requirePermission, tenantData, getPrincipal, getState: () => platformStore.state,
  setState: (next) => { platformStore.state = next; }, accessControlSchema, roleSchema, sharingSettingSchema,
  validateAdvancedSharingMetadata, profileIdForRole, withSecurityEvent,
  effectivePermissions, persistState, persistTenantRecords, roleApiNameForName, routeParam
});
flowRouteRegistrar.elements();

export type FlowRuntimeContext = {
  record?: RuntimeRecord;
  prior?: RuntimeRecord;
  recordEvent?: RecordEvent;
  triggerObjectName?: string;
  flow?: { FaultMessage: string; FaultCode: string };
  resourceDefinitions?: FlowMetadata['resources'];
  formulaStack: Set<string>;
  variables: Record<string, unknown>;
  currentUserId: string;
  currentUser?: Record<string, unknown>;
  flowVariables?: Record<string, unknown>;
  isClone?: boolean;
  debug?: boolean;
  debugTrace?: FlowDebugTraceEntry[];
  rollbackSnapshot?: TenantData;
  timeZone?: string;
  locale?: string;
  corporateCurrency?: string;
  currencyRates?: Record<string, number>;
  userCurrencyIsoCode?: string;
  currencyIsoCode?: string;
};
export type FlowDebugTraceEntry = { flowApiName: string; elementId: number; type: string; label: string };
export type RecordEvent = 'created' | 'updated' | 'deleted';
const namedCredentialPayloadSchema = z.object({
  username: z.string().optional(),
  secret: z.string().optional(),
  oauthToken: z.object({accessToken:z.string(),refreshToken:z.string().optional(),
    tokenType:z.literal('Bearer'),expiresAtMs:z.number()}).optional()
});

const { asConfigRows, flowVariablesForUser, flowInterviewIdentity, resolveFlowResource,
 resolveFlowValue, resolveFlowTemplate, compareFlowValue, flowConditionsMatch, flowFieldValues } =
 createFlowContextRuntime({ formulaContextForUser });

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    return !(first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19 || second === 51))
      || (first === 203 && second === 0)
      || (first === 255 && second === 255));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return (firstHextet & 0xe000) === 0x2000
      && !normalized.startsWith('2001:db8:')
      && !normalized.startsWith('2001:0000:')
      && !normalized.startsWith('2001:0:');
  }
  return false;
}

function isReservedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ['localhost', 'local', 'internal', 'test', 'invalid', 'example'].includes(host)
    || ['.localhost', '.local', '.internal', '.test', '.invalid', '.example', '.example.com', '.example.net', '.example.org'].some((suffix) => host.endsWith(suffix));
}

function resolveCalloutUrl(credential: Pick<StoredNamedCredential, 'baseUrl'>, path: string, context: FlowRuntimeContext): URL {
  if (!path || path.startsWith('/') || path.startsWith('\\') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new Error('HTTP Callout path must be relative to its Named Credential base URL.');
  }
  const expandedPath = path.replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
    const value = resolveFlowValue(`{${reference}}`, context);
    if (value === undefined || value === null) throw new Error(`HTTP Callout path references an unavailable flow value "${reference}".`);
    return encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  if (expandedPath.split(/[/?#]/).some((segment) => segment === '..')) throw new Error('HTTP Callout path cannot traverse outside the Named Credential base path.');
  const base = new URL(credential.baseUrl);
  // Named Credential base URLs represent a directory, even when configured without
  // a trailing slash (for example the WhatsApp phone-number endpoint).
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const target = new URL(expandedPath, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new Error('HTTP Callout target must remain within its Named Credential base URL.');
  }
  if (target.protocol !== 'https:' || target.username || target.password || target.hash) {
    throw new Error('HTTP Callout target must be a safe HTTPS URL.');
  }
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (isReservedHostname(host)) {
    throw new Error('HTTP Callout targets on local or reserved hostnames are not allowed.');
  }
  if (isIP(host) && !isPublicAddress(host)) throw new Error('HTTP Callout targets on private or reserved IP addresses are not allowed.');
  return target;
}

const { safeOAuthTokenRequest, oauthCredentialVault, oauthChallengeStore, oauthAccessTokenForCredential } = createOAuthRuntime({
 isPublicAddress, tenantData, persistTenantRecords, namedCredentialSchema
});

const performHttpCallout = createHttpCalloutExecutor({
  resolveFlowValue, resolveCalloutUrl, resolveFlowTemplate, oauthAccessTokenForCredential,
  namedCredentialPayloadSchema, isPublicAddress, communicationPayload, communicationSafeUrl,
  supportedCommunicationMethod, communicationError, appendCommunicationRecord
});

function mapHttpCalloutResponse(body: unknown, mappingValue: unknown, elementLabel: string): unknown {
  if (mappingValue === undefined || mappingValue === '') return body;
  let mapping: unknown = mappingValue;
  if (typeof mappingValue === 'string') {
    try {
      mapping = JSON.parse(mappingValue);
    } catch {
      throw new Error(`HTTP Callout "${elementLabel}" response mapping must be valid JSON.`);
    }
  }
  const parsed = z.record(z.string()).safeParse(mapping);
  if (!parsed.success) throw new Error(`HTTP Callout "${elementLabel}" response mapping must be a JSON object of output names to response paths.`);
  return Object.fromEntries(Object.entries(parsed.data).map(([outputName, responsePath]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(outputName)) throw new Error(`HTTP Callout "${elementLabel}" response mapping contains an invalid output name.`);
    const pathParts = responsePath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    const mappedValue = pathParts.reduce<unknown>((value, part) => {
      if (!value || typeof value !== 'object') return undefined;
      return Array.isArray(value) && /^\d+$/.test(part)
        ? value[Number(part)]
        : (value as Record<string, unknown>)[part];
    }, body);
    return [outputName, mappedValue ?? null];
  }));
}

function formulaContextForUser(tenant: TenantData, userId: string): {
  timeZone: string;
  locale: string;
  currentUser: Record<string, unknown>;
  corporateCurrency: string;
  currencyRates: Record<string, number>;
  userCurrencyIsoCode: string;
} {
  const user = tenant.accessControl.users.find((candidate) => candidate.id === userId);
  return {
    timeZone: user?.timeZone ?? 'UTC',
    locale: user?.locale ?? 'en-US',
    currentUser: user ? {
      Id: user.id,
      Name: user.name,
      Username: user.username,
      Email: user.username,
      UserRoleId: user.roleId ?? tenant.accessControl.roles.find((role) => role.name === user.role)?.id,
      ProfileId: user.profileId,
      LocaleSidKey: user.locale,
      TimeZoneSidKey: user.timeZone,
      CurrencyIsoCode: user.currencyIsoCode ?? tenant.currencySettings.corporateCurrency
    } : { Id: userId },
    corporateCurrency: tenant.currencySettings.corporateCurrency,
    userCurrencyIsoCode: user?.currencyIsoCode ?? tenant.currencySettings.corporateCurrency,
    currencyRates: Object.fromEntries(tenant.currencySettings.currencies.map((currency) => [
      currency.currencyIsoCode, currency.conversionRate
    ]))
  };
}

function validateRuntimeRecord(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, current?: RuntimeRecord): void {
  validateMetadataRecord(tenantId, tenant, object, values, current, platformStore.state.users);
}

export type FlowExecutionResult =
  | { status: 'completed'; outputs: Record<string, unknown>; variables: Record<string, unknown>; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'screen'; screen: FlowMetadata['elements'][number]; nextElementId: number | null; outcomes: Array<{ name: string; label: string }>; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; recordEvent?: RecordEvent; isClone?: boolean; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'orchestration'; stage: FlowMetadata['elements'][number]; waitUntil: string; nextElementId: null; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; recordEvent?: RecordEvent; isClone?: boolean; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'wait' | 'scheduled' | 'async'; waitUntil: string; nextElementId: number | null; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; recordEvent?: RecordEvent; isClone?: boolean; debugTrace: FlowDebugTraceEntry[] };

function scheduledPathTimestamp(
  field: ObjectMetadata['fields'][number] | undefined,
  value: unknown,
  timeZone: string,
  offsetAmount: number,
  offsetUnit: 'Minutes' | 'Hours' | 'Days'
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value);
  let baseTime: Date | undefined;
  if (field?.dataType === 'Date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (date.toISOString().slice(0, 10) === raw) {
        baseTime = flowLocalDateTimeToInstant(date, 0, 0, timeZone);
      }
    }
  } else if (field?.dataType === 'DateTime') {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
      const parsed = new Date(raw);
      if (Number.isFinite(parsed.getTime())) baseTime = parsed;
    } else {
      const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);
      if (match) {
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        if (date.toISOString().slice(0, 10) === raw.slice(0, 10)) {
          baseTime = flowLocalDateTimeToInstant(date, Number(match[4]), Number(match[5]), timeZone);
        }
      }
    }
  }
  if (!baseTime) throw new Error(`Scheduled path time source contains an invalid ${field?.dataType ?? 'date/time'} value.`);
  const unitMilliseconds = { Minutes: 60_000, Hours: 3_600_000, Days: 86_400_000 }[offsetUnit];
  const timestamp = baseTime.getTime() + offsetAmount * unitMilliseconds;
  if (!Number.isFinite(timestamp)) throw new Error('Scheduled path offset is outside the supported date range.');
  return new Date(Math.max(timestamp, Date.now()));
}

function createFlowInterview(flow: FlowMetadata, userId: string, result: Extract<FlowExecutionResult, { status: 'waiting' }>): FlowInterview {
  return buildFlowInterview(flow, userId, result, {
    getTenantIdForUser: (id) => platformStore.state.users.find(user => user.id === id)?.tenantId,
    tenantData
  });
}

function flowRetryDelayMs(attempt: number): number {
  return retryDelayMs(attempt);
}

const tenantEmailRuntime = createTenantEmailRuntime({
 getState: () => platformStore.state, effectivePermissions, isReservedHostname, isPublicAddress,
 namedCredentialPayloadSchema, resolveFlowTemplate
});
const { performSendEmail, performEmailAlert } = tenantEmailRuntime;

function performPostToChatter(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const runningUser = platformStore.state.users.find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser) throw new Error('The running user is no longer active.');
  const principal = principalForUser(runningUser, tenant);
  const objectApiName = typeof config.objectApiName === 'string' ? config.objectApiName : '';
  const object = tenant.objects.find((candidate) => candidate.apiName === objectApiName);
  if (!object) throw new Error(`Post to Chatter "${elementLabel}" references an unavailable object.`);
  if (!object.settings?.allowInChatter) {
    throw new Error(`Chatter is disabled for object "${object.label}".`);
  }
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) {
    throw new Error(`The running user does not have edit permission for object "${objectApiName}".`);
  }
  const recordId = resolveFlowTemplate(String(config.recordId ?? ''), context).trim();
  const record = (tenant.records[objectApiName] ?? []).find((candidate) => candidate.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) {
    throw new Error(`Post to Chatter "${elementLabel}" requires edit access to its target record.`);
  }
  const body = resolveFlowTemplate(String(config.message ?? ''), context);
  const post = chatterPostSchema.parse({
    id: randomUUID(),
    objectApiName,
    recordId,
    body,
    createdBy: runningUser.id,
    createdByName: runningUser.name,
    createdAt: new Date().toISOString(),
    comments: []
  });
  tenant.chatterPosts.push(post);
}

function performCustomNotification(
  tenantId: string,
  tenant: TenantData,
  flow: FlowMetadata,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const runningUser = platformStore.state.users.find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser || !effectivePermissions(runningUser, tenant).includes('notifications:send')) {
    throw new Error('The running user does not have permission to send custom notifications.');
  }
  const recipientText = resolveFlowTemplate(String(config.recipientIds ?? ''), context);
  const recipientIds = [...new Set(recipientText.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean))];
  if (!recipientIds.length) throw new Error(`Custom Notification "${elementLabel}" requires at least one recipient user ID.`);
  const recipients = recipientIds.map((recipientId) => platformStore.state.users.find((user) =>
    user.id === recipientId && user.tenantId === tenantId && !user.disabled));
  const missingRecipientIndex = recipients.findIndex((recipient) => !recipient);
  if (missingRecipientIndex >= 0) {
    throw new Error(`Custom Notification "${elementLabel}" recipient "${recipientIds[missingRecipientIndex]}" is not an active user in this tenant.`);
  }
  const title = resolveFlowTemplate(String(config.title ?? ''), context);
  const body = resolveFlowTemplate(String(config.messageBody ?? ''), context);
  const createdAt = new Date().toISOString();
  const notifications = recipients.map((recipient) => {
    if (!recipient) throw new Error(`Custom Notification "${elementLabel}" contains an invalid recipient.`);
    return customNotificationSchema.parse({
      id: randomUUID(),
      recipientId: recipient.id,
      title,
      body,
      flowApiName: flow.apiName,
      sentBy: runningUser.id,
      createdAt,
      readAt: null
    });
  });
  tenant.notifications.push(...notifications);
}

function performSubmitForApproval(
  tenantId: string,
  tenant: TenantData,
  flow: FlowMetadata,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): string {
  const submitter = platformStore.state.users.find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!submitter) throw new Error('The running user is no longer active.');
  const principal = principalForUser(submitter, tenant);
  const objectApiName = typeof config.objectApiName === 'string' ? config.objectApiName.trim() : '';
  const object = tenant.objects.find((candidate) => candidate.apiName === objectApiName);
  if (!object) throw new Error(`Submit for Approval "${elementLabel}" references an unavailable object.`);
  const processApiName = typeof config.approvalProcessApiName === 'string' ? config.approvalProcessApiName : '';
  const approvalProcess = processApiName
    ? tenant.approvalProcesses.find((item) => item.apiName === processApiName && item.active)
    : undefined;
  if (processApiName && !approvalProcess) {
    throw new Error(`Submit for Approval "${elementLabel}" references an unavailable or inactive approval process.`);
  }
  if (approvalProcess && approvalProcess.objectApiName !== objectApiName) {
    throw new Error(`Approval process "${approvalProcess.label}" is for "${approvalProcess.objectApiName}", not "${objectApiName}".`);
  }
  const recordId = resolveFlowTemplate(String(config.recordId ?? ''), context).trim();
  const record = (tenant.records[objectApiName] ?? []).find((candidate) => candidate.Id === recordId);
  if (!record || !hasObjectPermission(principal, tenant, objectApiName, 'edit')
    || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) {
    throw new Error(`Submit for Approval "${elementLabel}" requires edit access to its target record.`);
  }
  const approverText = approvalProcess
    ? approvalProcess.approverUserIds.join(',')
    : resolveFlowTemplate(String(config.approverIds ?? ''), context);
  const approverIds = [...new Set(approverText.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean))];
  if (!approverIds.length) throw new Error(`Submit for Approval "${elementLabel}" requires at least one approver.`);
  const approvers = approverIds.map((approverId) => platformStore.state.users.find((user) =>
    user.id === approverId && user.tenantId === tenantId && !user.disabled));
  const missingApproverIndex = approvers.findIndex((approver) => !approver);
  if (missingApproverIndex >= 0) {
    throw new Error(`Submit for Approval "${elementLabel}" approver "${approverIds[missingApproverIndex]}" is not an active user in this tenant.`);
  }
  for (const approver of approvers) {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    const approverPrincipal = principalForUser(approver, tenant);
    if (!hasObjectPermission(approverPrincipal, tenant, objectApiName, 'read')
      || !hasRecordAccess(approverPrincipal, tenant, objectApiName, record, 'Read')) {
      throw new Error(`Submit for Approval "${elementLabel}" approver "${approver.name}" cannot access the target record.`);
    }
  }
  const comments = resolveFlowTemplate(String(config.comments ?? ''), context);
  if (comments.length > 2000) throw new Error(`Submit for Approval "${elementLabel}" comments cannot exceed 2000 characters.`);
  const groupId = randomUUID();
  const createdAt = new Date().toISOString();
  const requests = approvers.map((approver) => {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    return approvalRequestSchema.parse({
      id: randomUUID(),
      groupId,
      objectApiName,
      recordId,
      flowApiName: flow.apiName,
      processApiName: typeof config.approvalProcessApiName === 'string' ? config.approvalProcessApiName : null,
      orchestrationInterviewId: typeof config.orchestrationInterviewId === 'string' ? config.orchestrationInterviewId : null,
      approvalMode: config.approvalMode === 'ALL' ? 'ALL' : 'ANY',
      submittedBy: submitter.id,
      submittedByName: submitter.name,
      approverId: approver.id,
      status: 'Pending',
      comments,
      decisionComments: '',
      createdAt,
      decidedAt: null,
      decidedBy: null
    });
  });
  const notifications = approvers.map((approver) => {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    return customNotificationSchema.parse({
      id: randomUUID(),
      recipientId: approver.id,
      title: `Approval requested: ${object.label}`,
      body: `${submitter.name} submitted ${String(record.Name ?? recordId)} for your approval.`,
      flowApiName: flow.apiName,
      sentBy: submitter.id,
      createdAt,
      readAt: null
    });
  });
  tenant.approvalRequests.push(...requests);
  tenant.notifications.push(...notifications);
  return groupId;
}

const executeFlow = wrapFlowExecution(() => executeFlowImplementation, withFlowRecordWriteContext);
const flowExecutionDependencies = {  activeFlowDefinition, appendFieldHistory, applyConnectorLifecycle, applyFlowCollectionAssignment, applyRecordDefaults, asConfigRows, assertConnectorLifecycleAccess, assertFieldEditPermissions, assertFlowRuntimeAdmission, calculateFormulaFields, createFlowInterview, deleteRecordCascade, disableOnConnectorUninstall, effectivePermissions, executeFlow, flowConditionsMatch, flowFieldValues, flowInterviewIdentity, flowLocalDateTimeToInstant, flowNeedsRollbackSnapshot, flowPackageAdmission, flowVariablesForUser, formulaContextForUser, hasFieldPermission, hasObjectPermission, hasRecordAccess, hasRecordTypeAccessForUser, isValidFlowDateTime, mapHttpCalloutResponse, normalizeFlowRecordAssignments, normalizeRuntimeValues, numericFieldValueError, parseSubflowMappings, performCustomNotification, performEmailAlert, performHttpCallout, performPostToChatter, performSendEmail, performSubmitForApproval, prepareFlowCreateCollection, principalForUser, resolveFlowValue, runBeforeSaveRecordTriggeredFlows, runRecordTriggeredFlows, sanitizeRecordForRead, scheduledPathTimestamp, stampRecordAuditFields, validateRelationshipReparenting, validateRuntimeRecord, platformStore, installableAppCatalog, randomUUID, dashboardTimeZoneSchema, platformEventMessageSchema  };
export type FlowExecutionDependencies = typeof flowExecutionDependencies;
const executeFlowImplementation = bindFlowExecution(() => flowExecutionDependencies);


async function runRecordTriggeredFlows(...args: Parameters<typeof recordTriggerHandlers.runRecordTriggeredFlows>) {
  return recordTriggerHandlers.runRecordTriggeredFlows(...args);
}
async function runBeforeSaveRecordTriggeredFlows(...args: Parameters<typeof recordTriggerHandlers.runBeforeSaveRecordTriggeredFlows>) {
  return recordTriggerHandlers.runBeforeSaveRecordTriggeredFlows(...args);
}
const recordTriggerDependencies = { orderedRecordTriggeredFlows, asConfigRows, flowConditionsMatch, formulaContextForUser, flowVariablesForUser, flowInterviewIdentity, executeFlow, createFlowInterview, persistFlowFailure, calculateFormulaFields };
export type RecordTriggerDependencies = typeof recordTriggerDependencies;
const recordTriggerHandlers = createRecordTriggerHandlers(recordTriggerDependencies);

const { scheduledOccurrence, nextScheduledOccurrence } = createFlowScheduleCalculations(flowLocalDateTimeToInstant, dashboardLocalParts);

const { resumeDueFlowInterviews, executeDueScheduledFlows, deliverPendingPlatformEvents } = createFlowSchedulingRuntime({
  getState: () => platformStore.state, activeFlowDefinition, tenantIsActive, tenantData, persistTenantRecords,
  createFlowFailureLog, asConfigRows, flowVariablesForUser, flowInterviewIdentity,
  flowConditionsMatch, formulaContextForUser, createFlowInterview, flowRetryDelayMs, executeFlow
});

const flowValidationDependencies = { asConfigRows, validateFlowFormulaSyntax, evaluateFormula, flowLocalDateTimeToInstant, isValidFlowDateTime, isValidFlowTime, libraryComponentVisible, z, dashboardTimeZoneSchema, evaluateCustomConditionLogic, isTestLoopbackSmtpUrl, isReservedHostname, isIP, isPublicAddress, activeFlowDefinition, parseSubflowMappings, isSafeFlowRegex, getState: () => platformStore.state };
export type FlowValidationDependencies = typeof flowValidationDependencies;
const validateFlow = createFlowValidator(flowValidationDependencies);

function dashboardEmailFilterMatches(record: RuntimeRecord, filter: DashboardFilterMetadata): boolean {
  return reportFilterMatches(record, filter);
}

type DashboardCrossFilterResolution =
  | { recordIds: Set<string> }
  | { error: string; status: 400 | 403 };

type DashboardRelationshipStep = {
  sourceObjectApiName: string;
  targetObjectApiName: string;
  fieldApiName: string;
  direction: 'forward' | 'reverse';
};

function dashboardRelationshipPaths(
  tenant: TenantData,
  sourceObjectApiName: string,
  targetObjectApiName: string,
  maxDepth = 3
): DashboardRelationshipStep[][] {
  if (sourceObjectApiName === targetObjectApiName) return [[]];
  const paths: DashboardRelationshipStep[][] = [];
  const queue: Array<{ objectApiName: string; path: DashboardRelationshipStep[]; visited: Set<string> }> = [
    { objectApiName: sourceObjectApiName, path: [], visited: new Set([sourceObjectApiName]) }
  ];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= maxDepth) continue;
    const object = tenant.objects.find((item) => item.apiName === current.objectApiName);
    if (!object) continue;
    const edges: DashboardRelationshipStep[] = [
      ...object.fields.filter((field) => field.relationship).map((field) => ({
        sourceObjectApiName: object.apiName,
        targetObjectApiName: field.relationship!.targetObject,
        fieldApiName: field.apiName,
        direction: 'forward' as const
      })),
      ...tenant.objects.flatMap((relatedObject) => relatedObject.fields
        .filter((field) => field.relationship?.targetObject === object.apiName)
        .map((field) => ({
          sourceObjectApiName: object.apiName,
          targetObjectApiName: relatedObject.apiName,
          fieldApiName: field.apiName,
          direction: 'reverse' as const
        })))
    ];
    for (const edge of edges) {
      if (current.visited.has(edge.targetObjectApiName)) continue;
      const path = [...current.path, edge];
      if (edge.targetObjectApiName === targetObjectApiName) paths.push(path);
      else queue.push({ objectApiName: edge.targetObjectApiName, path, visited: new Set([...current.visited, edge.targetObjectApiName]) });
    }
  }
  return paths;
}

function resolveDashboardCrossFilters(
  principal: Principal,
  tenant: TenantData,
  sourceObjectApiName: string,
  crossFilters: DashboardFilterMetadata[],
  matchesFilter: (record: RuntimeRecord, filter: DashboardFilterMetadata) => boolean
): DashboardCrossFilterResolution {
  const sourceObject = tenant.objects.find((item) => item.apiName === sourceObjectApiName);
  if (!sourceObject) return { error: `Dashboard object "${sourceObjectApiName}" is unavailable`, status: 400 };
  const groups = new Map<string, DashboardFilterMetadata[]>();
  for (const filter of crossFilters) {
    const targetObject = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    if (!targetObject || !targetObject.fields.some((field) => field.apiName === filter.fieldApiName)) {
      return { error: `Dashboard cross-filter field "${filter.objectApiName}.${filter.fieldApiName}" is unavailable`, status: 400 };
    }
    if (!hasObjectPermission(principal, tenant, filter.objectApiName, 'read')
      || !hasFieldPermission(principal, tenant, filter.objectApiName, filter.fieldApiName, 'read')) {
      return { error: `Missing read permission for dashboard cross-filter "${filter.objectApiName}.${filter.fieldApiName}"`, status: 403 };
    }
    const key = `${filter.objectApiName}\0${filter.fieldApiName}\0${filter.operator}`;
    groups.set(key, [...(groups.get(key) ?? []), filter]);
  }
  const visibleRecordsByObject = new Map<string, RuntimeRecord[]>();
  const visibleRecords = (objectApiName: string) => {
    let records = visibleRecordsByObject.get(objectApiName);
    if (!records) {
      const object = tenant.objects.find((item) => item.apiName === objectApiName);
      records = (tenant.records[objectApiName] ?? []).filter((record) =>
        hasRecordAccess(principal, tenant, objectApiName, record, 'Read'))
        .map((record) => object
          ? calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId))
          : record);
      visibleRecordsByObject.set(objectApiName, records);
    }
    return records;
  };
  for (const objectApiName of new Set([sourceObjectApiName, ...[...groups.values()].map((filters) => filters[0].objectApiName)])) {
    if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) {
      return { error: `Missing read permission for dashboard cross-filter object "${objectApiName}"`, status: 403 };
    }
  }
  const compiledGroups = [...groups.values()].map((filters) => {
    const targetObjectApiName = filters[0].objectApiName;
    const paths = dashboardRelationshipPaths(tenant, sourceObjectApiName, targetObjectApiName);
    const accessiblePaths: DashboardRelationshipStep[][] = [];
    for (const path of paths) {
      let inaccessible: DashboardRelationshipStep | undefined;
      for (const step of path) {
        const fieldObjectApiName = step.direction === 'forward' ? step.sourceObjectApiName : step.targetObjectApiName;
        const field = tenant.objects.find((item) => item.apiName === fieldObjectApiName)?.fields
          .find((item) => item.apiName === step.fieldApiName);
        if (!field || !hasFieldPermission(principal, tenant, fieldObjectApiName, step.fieldApiName, 'read')) {
          inaccessible = step;
          break;
        }
      }
      if (inaccessible) {
        const fieldObjectApiName = inaccessible.direction === 'forward'
          ? inaccessible.sourceObjectApiName : inaccessible.targetObjectApiName;
        return { error: `Missing read permission for relationship field "${fieldObjectApiName}.${inaccessible.fieldApiName}"`, status: 403 as const };
      }
      for (const objectApiName of path.flatMap((step) => [step.sourceObjectApiName, step.targetObjectApiName])) {
        if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) {
          return { error: `Missing read permission for dashboard cross-filter object "${objectApiName}"`, status: 403 as const };
        }
      }
      accessiblePaths.push(path);
    }
    return { filters, targetObjectApiName, paths: accessiblePaths };
  });
  const sourceRecords = visibleRecords(sourceObjectApiName);
  const matchesPath = (record: RuntimeRecord, path: DashboardRelationshipStep[], targetFilters: DashboardFilterMetadata[]) => {
    let currentRecords = [record];
    for (const step of path) {
      if (step.direction === 'forward') {
        const targetIds = new Set(currentRecords.map((item) => String(item[step.fieldApiName] ?? '')).filter(Boolean));
        currentRecords = visibleRecords(step.targetObjectApiName).filter((item) => targetIds.has(item.Id));
      } else {
        const sourceIds = new Set(currentRecords.map((item) => item.Id));
        currentRecords = visibleRecords(step.targetObjectApiName).filter((item) => sourceIds.has(String(item[step.fieldApiName] ?? '')));
      }
      if (!currentRecords.length) return false;
    }
    return currentRecords.some((item) => targetFilters.some((filter) => matchesFilter(item, filter)));
  };
  const recordIds = new Set<string>();
  for (const record of sourceRecords) {
    const matchesAllGroups = compiledGroups.every((group) => {
      if ('error' in group) return false;
      if (group.targetObjectApiName === sourceObjectApiName) {
        return group.filters.some((filter) => matchesFilter(record, filter));
      }
      if (!group.paths.length) return true;
      return group.paths.some((path) => matchesPath(record, path, group.filters));
    });
    if (matchesAllGroups) recordIds.add(record.Id);
  }
  const compiledError = compiledGroups.find((group) => 'error' in group);
  if (compiledError && 'error' in compiledError && typeof compiledError.error === 'string'
    && compiledError.status === 403) {
    return { error: compiledError.error, status: 403 };
  }
  return { recordIds };
}

function scheduledDashboardEmailBody(
  dashboard: DashboardMetadata,
  tenant: TenantData,
  recipient: LocalUser,
  subscription: DashboardSubscription,
  runAt: Date
): { text: string; html: string; snapshot: DashboardSnapshot } {
  const recipientAccess = tenant.accessControl.users.find((user) => user.id === recipient.id);
  if (!recipientAccess || !canAccessDashboard(dashboardForUser(tenant, dashboard, recipient.id), recipient.id, recipientAccess.permissionSetGroupIds, false)) {
    throw new Error(`Recipient "${recipient.email}" no longer has dashboard access.`);
  }
  const principal: Principal = {
    userId: recipient.id,
    tenantId: recipient.tenantId,
    email: recipient.email,
    roles: [recipient.role],
    permissions: effectivePermissions(recipient, tenant)
  };
  const lines = [
    `${dashboard.label} — scheduled dashboard snapshot`,
    `Run time: ${runAt.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}`,
    `Data is evaluated using ${recipient.name}'s current access permissions.`,
    ''
  ];
  const htmlSections: string[] = [];
  const snapshotComponents: DashboardSnapshot['components'] = [];
  const sourceRecordAccess = new Map<string, { objectApiName: string; recordId: string }>();
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!);
  const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const baseSnapshotComponent = (component: DashboardMetadata['components'][number], unavailableReason: string | null = null) => ({
    componentId: component.id,
    title: component.title,
    subtitle: component.subtitle,
    footer: component.footer,
    type: component.type,
    width: component.width,
    height: component.height,
    customHtml: null,
    richTextContent: component.type === 'Rich Text' ? sanitizeDashboardRichText(component.richTextContent) : '',
    imageUrl: component.type === 'Image' ? component.imageUrl : '',
    imageAltText: component.type === 'Image' ? component.imageAltText : '',
    unavailableReason,
    chartType: component.type === 'Chart' ? component.chartType : null,
    chartSortOrder: component.chartSortOrder,
    chartColorPalette: component.chartColorPalette,
    chartLimit: component.chartLimit,
    chartXAxisMinimum: component.chartXAxisMinimum,
    chartXAxisMaximum: component.chartXAxisMaximum,
    chartYAxisMinimum: component.chartYAxisMinimum,
    chartYAxisMaximum: component.chartYAxisMaximum,
    chartValueFormat: component.chartValueFormat,
    chartCurrencyCode: component.chartCurrencyCode,
    chartDecimalPlaces: component.chartDecimalPlaces,
    xAxisFieldApiName: component.xAxisFieldApiName,
    xAxisTitle: component.xAxisTitle,
    yAxisTitle: component.yAxisTitle,
    showGridlines: component.showGridlines,
    legendPosition: component.legendPosition,
    aggregation: component.aggregation,
    gaugeMin: component.gaugeMin,
    gaugeMax: component.gaugeMax,
    gaugeRange1EndPercent: component.gaugeRange1EndPercent,
    gaugeRange2EndPercent: component.gaugeRange2EndPercent,
    showLegend: component.showLegend,
    showValues: component.showValues,
    chartDataLabelPosition: component.chartDataLabelPosition,
    objectApiName: component.objectApiName,
    groupByLabel: null,
    totalRows: 0,
    metricValue: null,
    columns: [],
    buckets: [],
    rows: []
  });
  for (const component of dashboard.components) {
    lines.push(`${component.title} (${component.type})`);
    if (component.type === 'Rich Text') {
      const richTextContent = sanitizeDashboardRichText(component.richTextContent);
      const plainText = sanitizeHtml(richTextContent, { allowedTags: [], allowedAttributes: {} });
      lines.push(plainText, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><div>${richTextContent}</div></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        type: 'Rich Text',
        richTextContent
      });
      continue;
    }
    if (component.type === 'Image') {
      const imageUrl = component.imageUrl;
      lines.push(`${component.imageAltText || 'Image'}${imageUrl ? `: ${imageUrl}` : ''}`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(component.imageAltText)}" style="display:block;max-width:100%;height:auto">` : '<p>Image URL is not configured.</p>'}</section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        type: 'Image',
        imageUrl,
        imageAltText: component.imageAltText
      });
      continue;
    }
    if (component.type === 'Custom') {
      lines.push('Open the dashboard to view this custom component.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Open the dashboard to view this registered custom component.</p></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component, 'Registered custom components are not executed during scheduled runs.'),
        type: 'Custom'
      });
      continue;
    }
    const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (!object || (component.reportApiName && !report)
      || (report && (report.objectApiName !== component.objectApiName
        || reportFolderAccessLevelForUser(tenant, report.folderId, recipient.id) === null))
      || !hasObjectPermission(principal, tenant, component.objectApiName, 'read')) {
      lines.push('This component is unavailable under your current access permissions.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Unavailable under your current access permissions.</p></section>`);
      snapshotComponents.push(baseSnapshotComponent(component, 'Unavailable under the recipient current access permissions.'));
      continue;
    }
    const activeDashboardFilters = dashboard.filters.filter((filter) =>
      filter.objectApiName === object.apiName
      && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'));
    const neededFields = [
      ...(component.aggregation !== 'Count' && component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType !== 'Gauge' && component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType === 'Scatter' && component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
      ...(component.type === 'Chart' && component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.type === 'Table' ? component.displayFieldApiNames : []),
      ...(report?.fieldApiNames ?? []),
      ...(report?.groupByFieldApiNames ?? []),
      ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
      ...(report?.filters.map((filter) => filter.fieldApiName) ?? []),
      ...activeDashboardFilters.map((filter) => filter.fieldApiName)
    ];
    const unreadableField = neededFields.find((fieldApiName) =>
      !object.fields.some((field) => field.apiName === fieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, fieldApiName, 'read'));
    if (unreadableField) {
      lines.push('This component is unavailable under your current field permissions.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Unavailable under your current field permissions.</p></section>`);
      snapshotComponents.push(baseSnapshotComponent(component, 'Unavailable under the recipient current field permissions.'));
      continue;
    }
    const records = (tenant.records[object.apiName] ?? []).filter((record) =>
      hasRecordAccess(principal, tenant, object.apiName, record, 'Read'))
      .map((record) => calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId)))
      .filter((record) =>
        (report?.filters ?? []).every((filter) => reportFilterMatches(record, filter))
        && matchesDashboardFilters(activeDashboardFilters, dashboard.filterLogic, (filter) => dashboardEmailFilterMatches(record, filter)));
    for (const record of records) {
      sourceRecordAccess.set(`${object.apiName}:${record.Id}`, { objectApiName: object.apiName, recordId: record.Id });
    }
    const aggregateValue = (items: RuntimeRecord[]) => {
      if (component.aggregation === 'Count') return items.length;
      const values = items.map((record) => Number(record[component.measureFieldApiName ?? '']))
        .filter(Number.isFinite);
      if (!values.length) return 0;
      if (component.aggregation === 'Sum') return values.reduce((sum, value) => sum + value, 0);
      if (component.aggregation === 'Average') return values.reduce((sum, value) => sum + value, 0) / values.length;
      return component.aggregation === 'Minimum' ? Math.min(...values) : Math.max(...values);
    };
    if (component.type === 'Metric') {
      const aggregate = aggregateValue(records);
      const value = formatNumber(aggregate);
      lines.push(`Value: ${value}`, `${records.length.toLocaleString()} matching records`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><strong style="display:block;color:#0176d3;font-size:30px">${escapeHtml(value)}</strong><p style="margin:6px 0 0;color:#5c5c5c">${records.length.toLocaleString()} matching records</p></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        totalRows: records.length,
        metricValue: aggregate
      });
    } else if (component.type === 'Chart') {
      if (component.chartType === 'Gauge') {
        const value = aggregateValue(records);
        lines.push(`Value: ${formatNumber(value)} / ${formatNumber(component.gaugeMin)}-${formatNumber(component.gaugeMax)}`,
          `${records.length.toLocaleString()} matching records`, '');
        const percent = Math.max(0, Math.min(100, (value - component.gaugeMin) / (component.gaugeMax - component.gaugeMin) * 100));
        htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><strong style="font-size:24px">${escapeHtml(formatNumber(value))} / ${escapeHtml(formatNumber(component.gaugeMin))}-${escapeHtml(formatNumber(component.gaugeMax))}</strong><div style="position:relative;height:10px;margin:10px 0;background:linear-gradient(to right,#c23934 0 ${component.gaugeRange1EndPercent}%,#fe9339 ${component.gaugeRange1EndPercent}% ${component.gaugeRange2EndPercent}%,#2e844a ${component.gaugeRange2EndPercent}% 100%);border-radius:6px"><div style="position:absolute;left:calc(${percent}% - 1px);top:-4px;width:2px;height:18px;background:#181818;border:1px solid #fff"></div></div><p style="margin:0;color:#5c5c5c">${records.length.toLocaleString()} matching records</p></section>`);
        snapshotComponents.push({
          ...baseSnapshotComponent(component),
          totalRows: records.length,
          groupByLabel: null,
          buckets: [{ label: component.title, value }]
        });
      } else {
        const groupFieldApiName = component.chartType === 'Scatter'
          ? component.xAxisFieldApiName
          : component.groupByFieldApiName;
        const groups = new Map<string, RuntimeRecord[]>();
        for (const record of records) {
          const label = String(record[groupFieldApiName ?? ''] ?? '—');
          groups.set(label, [...(groups.get(label) ?? []), record]);
        }
        const buckets = [...groups].map(([label, items]) => ({
          label,
          value: aggregateValue(items),
          ...(component.seriesFieldApiName ? {
            series: Object.fromEntries([...new Set(items.map((record) => String(record[component.seriesFieldApiName!] ?? '—')))]
              .map((seriesName) => [seriesName, aggregateValue(items.filter((record) =>
                String(record[component.seriesFieldApiName!] ?? '—') === seriesName))]))
          } : {})
        }))
          .sort((left, right) => component.chartSortOrder === 'Ascending' ? left.value - right.value : right.value - left.value)
          .slice(0, component.chartLimit);
        const maxValue = Math.max(1, ...buckets.map((bucket) => Math.abs(bucket.value)));
        const bucketRows = buckets.map((bucket) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(bucket.label)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatNumber(bucket.value))}</td><td style="width:40% ;padding:6px 8px;border-bottom:1px solid #eee"><div style="height:10px;width:${Math.min(100, Math.abs(bucket.value) / maxValue * 100)}%;background:#0176d3;border-radius:5px"></div></td></tr>`).join('');
        const bucketLines = buckets.map(({ label, value }) => `${label}: ${formatNumber(value)}`);
        lines.push(...(bucketLines.length ? bucketLines : ['No matching records.']), '');
        htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0 0 10px;color:#5c5c5c">${escapeHtml(component.chartType)}${component.groupByFieldApiName ? ` · ${escapeHtml(object.fields.find((field) => field.apiName === component.groupByFieldApiName)?.label ?? component.groupByFieldApiName)}` : ''}</p>${bucketRows ? `<table role="presentation" style="width:100%;border-collapse:collapse">${bucketRows}</table>` : '<p>No matching records.</p>'}</section>`);
        snapshotComponents.push({
          ...baseSnapshotComponent(component),
          totalRows: records.length,
          groupByLabel: groupFieldApiName
            ? object.fields.find((field) => field.apiName === groupFieldApiName)?.label ?? groupFieldApiName
            : null,
          buckets
        });
      }
    } else {
      const columns = component.displayFieldApiNames.flatMap((fieldApiName) => {
        const field = object.fields.find((candidate) => candidate.apiName === fieldApiName);
        return field ? [field] : [];
      });
      const tableRows = records.slice(0, 10).map((record) => `<tr>${columns.map((field) => `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(record[field.apiName])}</td>`).join('')}</tr>`).join('');
      lines.push(`${records.length.toLocaleString()} matching records. First ${Math.min(10, records.length)} shown.`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0 0 10px;color:#5c5c5c">${records.length.toLocaleString()} matching records; first ${Math.min(10, records.length)} shown.</p>${tableRows ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>${columns.map((field) => `<th scope="col" style="padding:6px 8px;border-bottom:1px solid #d8dde6;text-align:left">${escapeHtml(field.label)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></div>` : '<p>No matching records.</p>'}</section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        totalRows: records.length,
        columns: columns.map((field) => ({ apiName: field.apiName, label: field.label })),
        rows: records.slice(0, 10).map((record) => {
          const readable = sanitizeRecordForRead(principal, tenant, object, record);
          return Object.fromEntries(columns.map((field) => [field.apiName, readable[field.apiName] ?? null]));
        })
      });
    }
  }
  const dashboardUrl = new URL(`/une/setup/dashboard-builder/${encodeURIComponent(dashboard.apiName)}`,
    process.env.WEB_APP_URL ?? 'http://localhost:5174').toString();
  lines.push('Open dashboard:', dashboardUrl);
  const text = lines.join('\n').slice(0, 100_000);
  dashboard.components.forEach((component, index) => {
    const section = htmlSections[index];
    if (!section) return;
    const heading = `<h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2>`;
    const subtitle = component.subtitle
      ? `<p style="margin:0 0 10px;color:#5c5c5c">${escapeHtml(component.subtitle)}</p>`
      : '';
    const footer = component.footer
      ? `<p style="margin:10px 0 0;color:#5c5c5c">${escapeHtml(component.footer)}</p>`
      : '';
    htmlSections[index] = section
      .replace(heading, `${heading}${subtitle}`)
      .replace('</section>', `${footer}</section>`);
    if (component.subtitle) lines.push(`Subtitle: ${component.subtitle}`);
    if (component.footer) lines.push(`Footer: ${component.footer}`);
  });
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f3f3;font-family:Arial,sans-serif;color:#181818"><main style="max-width:760px;margin:0 auto"><header style="padding:20px;background:#0176d3;color:#fff;border-radius:8px"><h1 style="margin:0;font-size:22px">${escapeHtml(dashboard.label)}</h1><p style="margin:8px 0 0">Scheduled dashboard snapshot · ${escapeHtml(runAt.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' }))}</p><p style="margin:8px 0 0">Data evaluated with ${escapeHtml(recipient.name)}'s current permissions.</p></header>${htmlSections.join('')}<p style="margin:20px 0;text-align:center"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#0176d3;color:#fff;text-decoration:none;border-radius:5px">Open dashboard</a></p></main></body></html>`;
  const snapshot = dashboardSnapshotSchema.parse({
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    label: `${subscription.label.slice(0, 45)} · ${runAt.toISOString()}`,
    createdAt: runAt.toISOString(),
    createdBy: recipient.id,
    runningUserId: recipient.id,
    subscriptionId: subscription.id,
    filters: dashboard.filters,
    sourceRecordAccess: [...sourceRecordAccess.values()],
    components: snapshotComponents
  });
  return { text, html: html.slice(0, 100_000), snapshot };
}

const dashboardSubscriptionDispatches = new Set<string>();
async function dispatchDashboardSubscription(tenantId: string, subscriptionId: string, manual = false): Promise<void> {
  const key = `${tenantId}:${subscriptionId}`;
  if (dashboardSubscriptionDispatches.has(key)) throw new Error('This dashboard subscription is already being delivered.');
  dashboardSubscriptionDispatches.add(key);
  try {
    const tenant = tenantData(tenantId);
    const subscription = tenant?.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (!tenant || !subscription || (!manual && !subscription.active)) return;
    const runAt = new Date();
    if (!manual && Date.parse(subscription.nextRunAt) > runAt.getTime()) return;
    const dashboard = tenant.dashboards.find((item) => item.apiName === subscription.dashboardApiName && item.status === 'Deployed');
    const creator = platformStore.state.users.find((item) => item.id === subscription.createdBy && item.tenantId === tenantId && !item.disabled);
    if (!dashboard) throw new Error('The subscribed dashboard is no longer deployed.');
    if (!creator || !effectivePermissions(creator, tenant).includes('email:send')) {
      throw new Error('The subscription owner is no longer active or lacks email:send permission.');
    }
    const failures: string[] = [];
    for (const userId of subscription.recipientUserIds) {
      const recipient = platformStore.state.users.find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
      if (!recipient) {
        failures.push('A scheduled recipient is no longer active.');
        continue;
      }
      try {
        const body = scheduledDashboardEmailBody(dashboard, tenant, recipient, subscription, runAt);
        if (subscription.saveSnapshots) {
          const snapshotTenant = tenantData(tenantId);
          if (!snapshotTenant) throw new Error('The tenant is no longer available for scheduled snapshot storage.');
          const recipientSnapshots = [
            ...snapshotTenant.dashboardSnapshots.filter((snapshot) =>
              snapshot.subscriptionId === subscription.id && snapshot.createdBy === recipient.id),
            body.snapshot
          ].slice(-30);
          const retainedIds = new Set(recipientSnapshots.map((snapshot) => snapshot.id));
          persistTenantRecords(tenantId, {
            ...snapshotTenant,
            dashboardSnapshots: [
              ...snapshotTenant.dashboardSnapshots.filter((snapshot) =>
                snapshot.subscriptionId !== subscription.id || snapshot.createdBy !== recipient.id),
              ...recipientSnapshots.filter((snapshot) => retainedIds.has(snapshot.id))
            ]
          });
        }
        await sendTenantEmail(
          tenantId,
          tenant,
          subscription.namedCredentialId,
          subscription.fromEmail,
          [recipient.email],
          `${dashboard.label} — scheduled dashboard`,
          body.text,
          body.html
        );
      } catch (error) {
        failures.push(`${recipient.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const currentTenant = tenantData(tenantId);
    if (!currentTenant) return;
    const latest = currentTenant.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (!latest) return;
    const lastRunAt = runAt.toISOString();
    const failed = failures.length > 0;
    const updated: DashboardSubscription = {
      ...latest,
      ...(manual ? {} : { nextRunAt: nextDashboardSubscriptionRunAt(latest, runAt) }),
      lastRunAt,
      lastRunStatus: failed ? 'Failed' : 'Success',
      lastRunError: failed ? failures.join('; ').slice(0, 500) : null,
      updatedAt: lastRunAt
    };
    persistTenantRecords(tenantId, {
      ...currentTenant,
      dashboardSubscriptions: currentTenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? updated : item)
    });
  } catch (error) {
    const tenant = tenantData(tenantId);
    const subscription = tenant?.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (tenant && subscription) {
      const now = new Date().toISOString();
      persistTenantRecords(tenantId, {
        ...tenant,
        dashboardSubscriptions: tenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? {
          ...item,
          ...(manual ? {} : { nextRunAt: nextDashboardSubscriptionRunAt(item, new Date(now)) }),
          lastRunAt: now,
          lastRunStatus: 'Failed',
          lastRunError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          updatedAt: now
        } : item)
      });
    }
    if (manual) throw error;
    console.error(`Dashboard subscription "${subscriptionId}" failed for tenant "${tenantId}": ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dashboardSubscriptionDispatches.delete(key);
  }
}
const dispatchScheduledFlows = createSchedulerRuntime({
 maintenance: maintenanceMode, lease: withSchedulerLease, flush: waitForPersistedState,
 refresh: {
  persistenceMode, store: platformStore, authRevision: () => platformInitialization.authOverlayRevision,
  readPersistedState, waitForPersistedState, parsePersistedPlatformState,
  restoreDurableAuthOverlay: platformInitialization.restoreDurableAuthOverlay
 },
 events: deliverPendingPlatformEvents, flows: executeDueScheduledFlows,
 integrationHandler: { getState: () => platformStore.state, tenantData, effectivePermissions, performHttpCallout },
 integration: { persistenceMode, pool: getRouteAliasPool(), tenantIds: () => Object.keys(platformStore.state.tenants), tenantIsActive },
 subscriptions: { tenants: () => platformStore.state.tenants, tenantIsActive, dispatch: dispatchDashboardSubscription }
});
// Register static frontend and final error handling after API routes.
const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
registerProductionFrontend(app, frontendDist);
registerPlatformErrorHandler(app);
startPlatformServer({
  app, port, issuer: jwtService.config.issuer, maintenanceMode, schedulePollInterval,
  hooks: { syncComponents: syncBundledLibraryComponents, dispatchScheduledFlows }
});
export { app, libraryComponentInputSchema, persistState, tenantData, getPrincipal, requirePermission, canOpenApp, canOpenTab, routeParam, findLibraryComponentUsages, ownedComponentIndex, componentNameTaken, usageBlockerDetails, syncBundledLibraryComponents };
export type { LibraryComponent, LibraryComponentRevision };
export { dashboardFolderShareSchema, dashboardFolderSchema, dashboardTerritorySchema, dashboardSchema, dashboardTimeZoneSchema, dashboardSubscriptionSchema, isNumericField, dashboardFilterOperatorAllowed, dashboardFilterValueError, sanitizeDashboardRichText, principalUser, effectivePermissions, dashboardRunningUserChoices, dashboardRunningPrincipal, dashboardRunningUserSelectionError, folderAccessLevelForUser, folderForUser, dashboardForUser, validateDashboardFolderReferences, requireAnyPermission, hasObjectPermission, hasRecordAccess, sanitizeRecordForRead, persistTenantRecords, formulaContextForUser, dashboardRelationshipPaths, dispatchDashboardSubscription, nextDashboardSubscriptionRunAt, calculateFormulaFields, libraryComponentVisible, randomUUID, canAccessDashboard, canEditDashboard, dashboardFilterSchema, reportFilterMatches, dashboardSnapshotSchema, reportFolderAccessLevelForUser, hasFieldPermission, resolveDashboardCrossFilters, pickDashboardSnapshotProperties, sanitizeHtml, matchesDashboardFilters };
export type { DashboardFolder, DashboardFilterMetadata, DashboardSnapshot };
export { runtimeRecordSchema, parseReportFilterLogic, reportSchema, reportDateRangeBounds, evaluateReportFilterLogic, reportFolderSchema, reportFilterOperatorAllowed, reportFilterValueError, reportFolderForUser, validateReportFolderReferences, accessAuthentication, resolveReportCrossFilters, canManageReportFolders };
export type { DashboardMetadata, ReportMetadata };


export type { platformEventSchema, platformEventMessageSchema, PageMetadata, LightningApp, ReportFolder, DashboardTerritory, DashboardSubscription, AccessControl, SharingSetting, CurrencySettings, RecordShare, CampaignMember, RecordActivity, ChatterPost, CustomNotification, ApprovalRequest, ApprovalProcess, FieldHistoryEntry, FlowExecutionLog, scheduleRetrySchema, automationSettingsSchema, EmailAlert, ConnectorSettings, ConnectorDefinition, AccessProfile };

export type FlowSchedulerDependencies = {
  getState: () => typeof platformStore.state;
  activeFlowDefinition: typeof activeFlowDefinition;
  tenantIsActive: typeof tenantIsActive;
  tenantData: typeof tenantData;
  persistTenantRecords: typeof persistTenantRecords;
  createFlowFailureLog: typeof createFlowFailureLog;
  asConfigRows: typeof asConfigRows;
  flowVariablesForUser: typeof flowVariablesForUser;
  flowInterviewIdentity: typeof flowInterviewIdentity;
  flowConditionsMatch: typeof flowConditionsMatch;
  formulaContextForUser: typeof formulaContextForUser;
  createFlowInterview: typeof createFlowInterview;
  flowRetryDelayMs: typeof flowRetryDelayMs;
  executeFlow: typeof executeFlow;
};
export type IntegrationDeliveryDependencies = {
  getState: () => typeof platformStore.state;
  tenantData: typeof tenantData;
  effectivePermissions: typeof effectivePermissions;
  performHttpCallout: typeof performHttpCallout;
};

export type FlowsPlatformEventRoutesDependencies = Pick<FlowRouteServices, 'activeFlowDefinition' | 'app' | 'getPrincipal' | 'persistTenantRecords' | 'platformEventSchema' | 'requireAnyPermission' | 'requirePermission' | 'routeParam' | 'tenantData'>;
export type FlowsMetadataRoutesDependencies = Pick<FlowRouteServices, 'app' | 'automationSettingsSchema' | 'defaultAutomationSettings' | 'getPrincipal' | 'persistTenantRecords' | 'requireAnyPermission' | 'requirePermission' | 'routeParam' | 'state' | 'tenantData'>;
export type FlowsEmailAlertRoutesDependencies = Pick<FlowRouteServices, 'app' | 'emailAlertRequestSchema' | 'emailAlertSchema' | 'getPrincipal' | 'persistTenantRecords' | 'randomUUID' | 'requireAnyPermission' | 'requirePermission' | 'routeParam' | 'tenantData' | 'z'>;
export type FlowDefinitionRoutesDependencies = Pick<FlowRouteServices, 'activeFlowDefinition' | 'app' | 'flowSchema' | 'flowVersionSnapshot' | 'formulaContextForUser' | 'getPrincipal' | 'persistState' | 'persistTenantRecords' | 'requireAnyPermission' | 'requirePermission' | 'routeParam' | 'state' | 'tenantData' | 'uniqueFlowHistory' | 'validateFlow'>;
export type FlowsExecutionRoutesDependencies = Pick<FlowRouteServices, 'accessAuthentication' | 'app' | 'authoriseChatterFlow' | 'authoriseManualCoreFlow' | 'createFlowInterview' | 'executeFlow' | 'formulaContextForUser' | 'getPrincipal' | 'persistFlowFailure' | 'persistTenantRecords' | 'requirePermission' | 'routeParam' | 'sanitizeChatterCallerInput' | 'state' | 'tenantData' | 'trustedChatterExecutionFlow' | 'validateFlow' | 'validateFlowInputValues' | 'z'>;
export type FlowRecordDebugRoutesDependencies = Pick<FlowRouteServices, 'accessAuthentication' | 'app' | 'asConfigRows' | 'executeFlow' | 'flowConditionsMatch' | 'flowVariablesForUser' | 'formulaContextForUser' | 'getPrincipal' | 'hasFieldPermission' | 'hasObjectPermission' | 'hasRecordAccess' | 'randomUUID' | 'recordFlowDebugRequestSchema' | 'requirePermission' | 'routeParam' | 'runtimeRecordSchema' | 'tenantData' | 'validateFlow'>;
export type FlowsInterviewRoutesDependencies = Pick<FlowRouteServices, 'accessAuthentication' | 'activeFlowDefinition' | 'app' | 'asConfigRows' | 'createFlowInterview' | 'executeFlow' | 'flowConditionsMatch' | 'flowVariablesForUser' | 'formulaContextForUser' | 'getPrincipal' | 'hasObjectPermission' | 'hasRecordAccess' | 'isSafeFlowRegex' | 'isValidFlowDateTime' | 'isValidFlowTime' | 'persistFlowFailure' | 'persistTenantRecords' | 'requirePermission' | 'resolveFlowValue' | 'routeParam' | 'state' | 'tenantData' | 'z'>;
