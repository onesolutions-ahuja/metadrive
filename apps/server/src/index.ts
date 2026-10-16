import { createFlowExecutionEngine } from './modules/flows/execution-engine.js';
import { parseSubflowMappings } from './modules/flows/subflow-mappings.js';
import { createFlowScheduleCalculations } from './scheduler/flow-schedule-calculations.js';
import { createTenantProvisioning } from './core/state/tenant-provisioning.js';
import { createPersistenceResponseBarrier } from './core/state/response-barrier.js';
import { createPersistedMetadataReadMode } from './core/state/metadata-read-mode.js';
import { createSqlStateRefresh } from './core/state/refresh.js';
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
import { registerFlowsPlatformEventRoutes } from './modules/flows/platform-event-routes.js';
import { registerApprovalsMetadataRoutes } from './modules/approvals/metadata-routes.js';
import { registerFlowsMetadataRoutes } from './modules/flows/metadata-routes.js';
import { registerIntegrationsConnectionRoutes } from './modules/integrations/connection-routes.js';
import { registerIntegrationsConnectorSettingsRoutes } from './modules/integrations/connector-settings-routes.js';
import { registerIntegrationsConnectorAppRoutes } from './modules/integrations/connector-app-routes.js';
import { registerCredentialStatusRoutes } from './modules/integrations/credential-status-routes.js';
import { registerCredentialManagementRoutes } from './modules/integrations/credential-management-routes.js';
import { registerFlowsEmailAlertRoutes } from './modules/flows/email-alert-routes.js';
import { registerFlowDefinitionRoutes } from './modules/flows/definition-routes.js';
import { registerChatterAccessRoutes } from './modules/chatter/access-routes.js';
import { registerFlowsExecutionRoutes } from './modules/flows/execution-routes.js';
import { registerFlowRecordDebugRoutes } from './modules/flows/record-debug-routes.js';
import { registerFlowsInterviewRoutes } from './modules/flows/interview-routes.js';
import { registerAppsMetadataRoutes } from './modules/apps/metadata-routes.js';
import { registerAppsRouteAliasRoutes } from './modules/apps/route-alias-routes.js';
import { registerPageListRoutes } from './modules/pages/list-routes.js';
import { registerPageUpdateRoutes } from './modules/pages/update-routes.js';
import { registerSecurityCurrencyRoutes } from './modules/security/currency-routes.js';
import { registerFlowElementRoutes } from './modules/flows/element-routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { registerPlatformPolicyRoutes } from './modules/security/platform-policy-routes.js';
import { registerHealthAndDiscoveryRoutes } from './modules/security/health-routes.js';
import { roleApiNameForName, roleIdForName, profileIdForRole } from './modules/security/role-helpers.js';
import { createScheduledDispatcher } from './scheduler/dispatcher.js';
import { startPlatformServer } from './bootstrap/startup.js';
import { registerProductionFrontend, registerPlatformErrorHandler } from './bootstrap/frontend.js';
import { credentialKeyRing, sealCredentialPayload, openCredentialPayload, sealIntegrationCredentials, openIntegrationCredentials } from './core/credential-crypto.js';
import { recordWritePolicySchema, withFlowRecordWriteContext, grantedObjectPermission, assertRecordFieldPermissions, lockedRecordWriteAllowed, recordWritePolicyMetadataGuard } from './record-write-policy.js';

import { loadAppSeedCatalog } from './seeders/catalog.mjs';

import { registerReportRoutes } from './modules/reports/routes.js';
import { registerDashboardRoutes } from './modules/dashboards/routes.js';
import { registerDashboardSnapshotRoutes } from './modules/dashboards/snapshot-routes.js';
import { registerComponentLibraryRoutes } from './modules/components/routes.js';
import { canManageReportFolders } from './modules/reports/report-permissions.js';
import { nextDashboardSubscriptionRunAt } from './modules/dashboards/subscription-schedule.js';
import { hasDefaultComponentExport, scopeLibraryCss } from './modules/components/component-source.js';
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
import { transform } from 'esbuild';
import { lookup, resolveTxt } from 'node:dns/promises';
import { normalizeTenantDomain, domainChallenge, matchesDomainChallenge, reservedDomain } from './tenant-domains.mjs';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { executeConnectorTest } from './connector-test.js';
import { applyConnectorLifecycle, connectorEntitlement } from './connector-app-runtime.js';

import { bundledLegacyMigrationDecision } from './bundled-component-migration.mjs';

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
import { canAccessDashboard, canEditDashboard, dashboardFolderAccessLevel, matchesDashboardFilters, type DashboardFolderAccessLevel } from './dashboard-access.js';
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
const fieldSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  dataType: z.string().min(1),
  required: z.boolean(),
  unique: z.boolean(),
  externalId: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  description: z.string().optional(),
  helpText: z.string().max(255).optional(),
  picklistValues: z.array(z.string().trim().min(1)).optional(),
  picklistRestricted: z.boolean().optional(),
  controllerFieldApiName: z.string().min(1).optional(),
  valueSettings: z.record(z.array(z.string().trim().min(1))).optional(),
  trackHistory: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
  formula: z.object({ expression: z.string().min(1), returnType: z.string().min(1) }).optional(),
  relationship: z.object({
    type: z.enum(['Lookup', 'Master-Detail', 'Hierarchical']),
    targetObject: z.string().min(1),
    relationshipName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    childRelationshipName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    deleteBehavior: z.enum(['Clear', 'Restrict']).optional(),
    allowReparenting: z.boolean().optional()
  }).optional()
}).superRefine((field, context) => {
  const supportedDataType = /^(?:Text(?:\(\d+\))?|Long Text Area|Number(?:\(\d+,\s*\d+\))?|Currency(?:\(\d+,\s*\d+\))?|Percent(?:\(\d+,\s*\d+\))?|Date|Date\/Time|DateTime|Checkbox|Email|Phone|URL|Geolocation|Picklist|Multi-Select Picklist|AutoNumber|Auto Number|Name|Formula\((?:Number|Currency|Percent|Text|Date|Checkbox)\)|Lookup\([A-Za-z][A-Za-z0-9_]*\)|Master-Detail\([A-Za-z][A-Za-z0-9_]*\))$/.test(field.dataType);
  if (!supportedDataType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: `Unsupported field type "${field.dataType}"` });
  }
  if (field.formula && field.relationship) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship'], message: 'A field cannot be both a formula and a relationship' });
  }
  if (field.formula && !field.dataType.startsWith('Formula(')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Formula fields must use a Formula data type' });
  }
  if (field.dataType.startsWith('Formula(') && !field.formula) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formula'], message: 'Formula data types require a formula definition' });
  }
  if (field.formula && field.dataType !== `Formula(${field.formula.returnType})`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Formula return type must match its data type' });
  }
  if (field.formula && (field.required || field.unique)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['required'], message: 'Formula fields cannot be required or unique' });
  }
  if (field.relationship && field.dataType !== `${field.relationship.type === 'Hierarchical' ? 'Lookup' : field.relationship.type}(${field.relationship.targetObject})`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Relationship field type must match its relationship definition' });
  }
  if (/^(?:Lookup|Master-Detail)\(/.test(field.dataType) !== Boolean(field.relationship)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship'], message: 'Lookup and master-detail field types require a matching relationship definition' });
  }
  if (field.formula && !['Number', 'Currency', 'Percent', 'Text', 'Date', 'Checkbox'].includes(field.formula.returnType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formula', 'returnType'], message: 'Unsupported formula return type' });
  }
  if (field.relationship?.type === 'Master-Detail' && !field.required) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['required'], message: 'Master-detail relationship fields must be required' });
  }
  if (field.relationship?.deleteBehavior !== undefined && field.relationship.type !== 'Lookup') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship', 'deleteBehavior'], message: 'Delete behavior can only be configured on lookup relationships' });
  }
  if (field.relationship?.deleteBehavior === 'Clear' && field.required) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship', 'deleteBehavior'], message: 'Required lookup relationships cannot be cleared when the parent is deleted' });
  }
  if (field.relationship?.allowReparenting !== undefined && field.relationship.type !== 'Master-Detail') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship', 'allowReparenting'], message: 'Reparenting can only be configured on master-detail relationships' });
  }
  const isPicklist = field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist';
  if (field.picklistValues && !isPicklist) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist values can only be configured on Picklist fields' });
  }
  if (!persistedMetadataReadMode.active && field.picklistValues && field.picklistValues.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist fields must define at least one value' });
  }
  if (!persistedMetadataReadMode.active && isPicklist && !field.picklistValues?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist fields must define at least one value' });
  }
  if ((field.picklistRestricted !== undefined || field.controllerFieldApiName !== undefined || field.valueSettings !== undefined) && !isPicklist) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist settings can only be configured on Picklist fields' });
  }
  if (field.picklistValues && new Set(field.picklistValues.map((value) => value.toLowerCase())).size !== field.picklistValues.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist values must be unique' });
  }
  if (field.dataType === 'Multi-Select Picklist' && field.picklistValues?.some((value) => value.includes(';'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Multi-select picklist values cannot contain semicolons' });
  }
  if (field.trackHistory && field.formula) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['trackHistory'], message: 'Formula fields cannot have field history tracking enabled' });
  }
  if ((field.dataType === 'Long Text Area' || field.dataType === 'Multi-Select Picklist' || field.dataType === 'Geolocation') && field.unique) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['unique'], message: 'Long text area, multi-select picklist, and geolocation fields cannot be unique' });
  }
  if (field.externalId && !/^(Text(?:\(\d+\))?|Number(?:\(\d+,\s*\d+\))?|Email|Phone|AutoNumber|Auto Number)$/.test(field.dataType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['externalId'], message: 'External IDs require a text, number, email, phone, or auto-number field' });
  }
  if (field.caseSensitive !== undefined && (!field.unique || !/^(Text(?:\(\d+\))?|Email|Phone)$/.test(field.dataType))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['caseSensitive'], message: 'Case sensitivity can only be configured for unique text, email, or phone fields' });
  }
  if (field.dataType.startsWith('Text(')) {
    const textLength = field.dataType.match(/^Text\((\d+)\)$/);
    if (!textLength || Number(textLength[1]) < 1 || Number(textLength[1]) > 255) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Text field length must be between 1 and 255 characters' });
    }
  }
  if (/^(Number|Currency|Percent)\(/.test(field.dataType)) {
    const numericFormat = field.dataType.match(/^(Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
    if (!numericFormat || Number(numericFormat[2]) < 1 || Number(numericFormat[2]) > 18
      || Number(numericFormat[3]) > Number(numericFormat[2])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Numeric precision must be 1–18 digits and scale cannot exceed precision' });
    }
  }
  if (field.defaultValue !== undefined) {
    if (field.formula || field.relationship || field.dataType === 'Geolocation' || field.dataType === 'AutoNumber' || field.dataType === 'Auto Number') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Formula, relationship, geolocation, and auto-number fields cannot have a default value' });
    } else if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType)
      && (typeof field.defaultValue !== 'number' || !Number.isFinite(field.defaultValue))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Numeric fields require a numeric default value' });
    } else if (field.dataType === 'Checkbox' && typeof field.defaultValue !== 'boolean') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Checkbox fields require a true or false default value' });
    } else if (!/^(Number|Currency|Percent)(\(|$)/.test(field.dataType) && field.dataType !== 'Checkbox' && typeof field.defaultValue !== 'string') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'This field type requires a text default value' });
    } else if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType) && typeof field.defaultValue === 'number') {
      const numericError = numericFieldValueError(field.dataType, field.defaultValue);
      if (numericError) context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: numericError });
    } else if (typeof field.defaultValue === 'string') {
      const textLimit = field.dataType.match(/^Text(?:\((\d+)\))?$/);
      const maximumTextLength = textLimit ? Number(textLimit[1] ?? 255) : undefined;
      if (maximumTextLength !== undefined && field.defaultValue.length > maximumTextLength) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: `Default value exceeds the ${maximumTextLength} character limit` });
      }
      if (field.dataType === 'Long Text Area' && field.defaultValue.length > 131072) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Default value exceeds the 131072 character limit' });
      }
      if (field.dataType === 'Date' && (!/^\d{4}-\d{2}-\d{2}$/.test(field.defaultValue)
        || !Number.isFinite(Date.parse(`${field.defaultValue}T00:00:00.000Z`))
        || new Date(`${field.defaultValue}T00:00:00.000Z`).toISOString().slice(0, 10) !== field.defaultValue)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Date defaults must be valid YYYY-MM-DD dates' });
      }
      if ((field.dataType === 'Date/Time' || field.dataType === 'DateTime') && !isValidFlowDateTime(field.defaultValue)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Date/time defaults must be valid date-time values' });
      }
      if (field.dataType === 'Email' && field.defaultValue && !z.string().email().safeParse(field.defaultValue).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Email defaults must be valid email addresses' });
      }
      if (field.dataType === 'URL' && field.defaultValue) {
        let validUrl = false;
        try {
          validUrl = ['http:', 'https:'].includes(new URL(field.defaultValue).protocol);
        } catch {
          validUrl = false;
        }
        if (!validUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'URL defaults must be valid HTTP or HTTPS URLs' });
      }
      const defaultPicklistValues = field.dataType === 'Multi-Select Picklist'
        ? field.defaultValue.split(';')
        : [field.defaultValue];
      if (isPicklist && (!field.picklistValues
        || defaultPicklistValues.some((value) => !field.picklistValues?.includes(value)))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Default value must match configured picklist options' });
      }
      if (field.dataType === 'Multi-Select Picklist' && (defaultPicklistValues.some((value) => !value)
        || new Set(defaultPicklistValues).size !== defaultPicklistValues.length)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Multi-select defaults must contain distinct configured values' });
      }
    }
  }
});
const pageLayoutSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  columns: z.union([z.literal(1), z.literal(2)]),
  fieldApiNames: z.array(z.string())
});
const pageLayoutCustomLinkSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(2000),
  openInNewWindow: z.boolean().default(false)
}).superRefine((link, context) => {
  if (/[\u0000-\u001f\u007f]/.test(link.url)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Custom link URLs cannot contain control characters' });
    return;
  }
  const url = link.url.replace(/\{!Record\.[A-Za-z][A-Za-z0-9_]*\}/g, 'record-value');
  if (/[{}]/.test(url)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Custom link merge fields must use the {!Record.FieldApiName} format' });
    return;
  }
  if (url.startsWith('/') && !url.startsWith('//')) return;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Custom links must use an HTTP(S) URL or an absolute application path' });
  }
});
const pageLayoutSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sections: z.array(pageLayoutSectionSchema),
  relatedLists: z.array(z.string()),
  actions: z.array(z.enum(['New', 'Edit', 'Delete'])),
  customLinks: z.array(pageLayoutCustomLinkSchema).optional()
}).superRefine((layout, context) => {
  if (new Set(layout.actions).size !== layout.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'Page layout actions must be unique' });
  }
  if (new Set((layout.customLinks ?? []).map((link) => link.id)).size !== (layout.customLinks ?? []).length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customLinks'], message: 'Custom link IDs must be unique within a page layout' });
  }
});
const pageLayoutAssignmentSchema = z.object({
  profileId: z.string().min(1),
  recordTypeId: z.string().min(1),
  pageLayoutId: z.string().min(1)
});
const compactLayoutSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  fieldApiNames: z.array(z.string())
});
const compactLayoutAssignmentSchema = z.object({
  profileId: z.string().min(1),
  recordTypeId: z.string().min(1),
  compactLayoutId: z.string().min(1)
});
const recordTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  developerName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
  description: z.string().max(1000).optional(),
  active: z.boolean(),
  isDefault: z.boolean(),
  picklistValues: z.record(z.array(z.string().trim().min(1))).optional()
});
const fieldSetSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,254}$/),
  label: z.string().trim().min(1).max(80),
  fieldApiNames: z.array(z.string())
});
const searchLayoutsSchema = z.object({
  searchResults: z.array(z.string()).optional(),
  lookupDialog: z.array(z.string()).optional(),
  lookupPhoneDialog: z.array(z.string()).optional()
}).strict();
const relatedLookupFilterSchema = z.object({
  id: z.string().min(1),
  fieldApiName: z.string().min(1),
  relatedObject: z.string().min(1),
  relatedFieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null', 'Is Not Null']),
  value: z.string(),
  valueFieldApiName: z.string().min(1).optional(),
  required: z.boolean()
});
export type RelatedLookupFilterMetadata = z.infer<typeof relatedLookupFilterSchema>;
const objectActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['Standard', 'Custom']),
  enabled: z.boolean(),
  behavior: z.literal('Set Field Value').optional(),
  fieldApiName: z.string().min(1).max(255).optional(),
  value: z.string().max(131072).optional()
}).superRefine((action, context) => {
  if (action.type === 'Standard' && (action.behavior || action.fieldApiName || action.value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['behavior'], message: 'Standard actions cannot have custom behavior' });
  }
  if (action.type === 'Custom' && action.behavior
    && (!action.fieldApiName || action.value === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldApiName'], message: 'Set Field Value actions require a target field and value' });
  }
  if (action.type === 'Custom' && !action.behavior
    && (action.fieldApiName !== undefined || action.value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['behavior'], message: 'Custom action configuration requires a supported behavior' });
  }
});
const objectSettingsSchema = z.object({
  allowReports: z.boolean(),
  allowActivities: z.boolean(),
  trackFieldHistory: z.boolean(),
  allowInChatter: z.boolean(),
  deploymentStatus: z.enum(['In Development', 'Deployed']),
  recordNameType: z.enum(['Text', 'Auto Number']),
  recordNameFormat: z.string()
});
const customObjectTabSchema = z.object({
  style: z.enum(['Blue', 'Green', 'Orange', 'Purple', 'Red', 'Teal', 'Yellow'])
});
const runtimeRecordSchema = z.object({
  Id: z.string().min(1),
  CreatedDate: z.string().datetime(),
  CreatedById: z.string().min(1).optional(),
  LastModifiedDate: z.string().datetime(),
  LastModifiedById: z.string().min(1).optional(),
  SystemModstamp: z.string().datetime().optional()
}).catchall(z.unknown());
const listViewButtonSchema = z.enum([
  'New',
  'Import',
  'Mass Delete',
  'Change Owner',
  'Printable View',
  'Add to Campaign'
]);
const platformEventSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*__e$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(1000).default(''),
  fields: z.array(fieldSchema).min(1)
}).superRefine((event, context) => {
  const names = new Set<string>();
  event.fields.forEach((field, index) => {
    if (names.has(field.apiName.toLowerCase())) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'apiName'], message: 'Platform event field API names must be unique' });
    }
    names.add(field.apiName.toLowerCase());
    if (field.formula || field.relationship || field.unique || field.defaultValue !== undefined
      || !['Text', 'Long Text Area', 'Number', 'Currency', 'Percent', 'Checkbox', 'Date', 'DateTime', 'Picklist'].some((type) =>
        field.dataType === type || field.dataType.startsWith(`${type}(`))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index], message: 'Platform event fields must use supported scalar types and cannot be formulas, relationships, unique, or defaulted' });
    }
  });
});
const platformEventMessageSchema = z.object({
  id: z.string().uuid(),
  eventApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*__e$/),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  publishedBy: z.string().min(1),
  deliveredFlowApiNames: z.array(z.string()).default([]),
  attempts: z.number().int().nonnegative().default(0),
  retryAt: z.string().datetime().nullable().default(null),
  lastError: z.string().max(1000).default(''),
  processedAt: z.string().datetime().nullable().default(null),
  deadLettered: z.boolean().default(false)
});
const normalizeFieldApiName = (name: string) => name.trim().toLocaleLowerCase();
const objectSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  pluralLabel: z.string().min(1),
  kind: z.enum(['Standard Object', 'Custom Object']),
  description: z.string(),
  fields: z.array(fieldSchema),
  // Revision is platform-managed. Never trust the revision sent in a write body.
  revision: z.number().int().nonnegative().optional(),
  pageLayouts: z.array(pageLayoutSchema).optional(),
  pageLayoutAssignments: z.array(pageLayoutAssignmentSchema).optional(),
  recordTypes: z.array(recordTypeSchema).optional(),
  compactLayouts: z.array(compactLayoutSchema).optional(),
  compactLayoutAssignments: z.array(compactLayoutAssignmentSchema).optional(),
  compactLayout: z.object({ label: z.string().min(1), fieldApiNames: z.array(z.string()) }).optional(),
  fieldSets: z.array(fieldSetSchema).optional(),
  searchLayouts: searchLayoutsSchema.optional(),
  listViewFilter: z.object({ fieldApiName: z.string().min(1), value: z.string() }).optional(),
  relatedLookupFilters: z.array(relatedLookupFilterSchema).optional(),
  relatedLookupFilterLogic: z.record(z.enum(['All', 'Any'])).optional(),
  listViewButtons: z.array(listViewButtonSchema).optional(),
  actions: z.array(objectActionSchema).optional(),
  customTab: customObjectTabSchema.optional(),
  settings: objectSettingsSchema.optional(),
  recordWritePolicy: recordWritePolicySchema.optional()
}).superRefine((object, context) => {
  const listViewButtons = object.listViewButtons ?? [];
  if (new Set(listViewButtons).size !== listViewButtons.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['listViewButtons'], message: 'List view buttons must be unique' });
  }
  const fieldNames = new Set(object.fields.map((field) => normalizeFieldApiName(field.apiName)));
  if (fieldNames.size !== object.fields.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Field API names must be unique' });
  object.fields.forEach((field, index) => {
    const controllerApiName = field.controllerFieldApiName;
    if (!controllerApiName) {
      if (field.valueSettings && Object.keys(field.valueSettings).length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings'], message: 'Dependent picklist values require a controlling field' });
      }
      return;
    }
    const controller = object.fields.find((candidate) => normalizeFieldApiName(candidate.apiName) === normalizeFieldApiName(controllerApiName));
    if ((field.dataType !== 'Picklist' && field.dataType !== 'Multi-Select Picklist') || !controller || normalizeFieldApiName(controller.apiName) === normalizeFieldApiName(field.apiName)
      || !(controller.dataType === 'Picklist' || controller.dataType === 'Checkbox')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'controllerFieldApiName'], message: 'A dependent picklist must use a different Picklist or Checkbox field as its controller' });
      return;
    }
    const controllerValues = controller.dataType === 'Checkbox' ? ['true', 'false'] : controller.picklistValues ?? [];
    for (const [controllerValue, dependentValues] of Object.entries(field.valueSettings ?? {})) {
      if (!controllerValues.includes(controllerValue)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings', controllerValue], message: `Unknown controlling value "${controllerValue}"` });
      }
      if (new Set(dependentValues.map((value) => value.toLocaleLowerCase())).size !== dependentValues.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings', controllerValue], message: 'Dependent picklist values must be unique' });
      }
      if (dependentValues.some((value) => !(field.picklistValues ?? []).includes(value))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings', controllerValue], message: 'Dependent values must be in the field picklist value set' });
      }
    }
  });
  if (object.kind === 'Custom Object') {
    const nameField = object.fields.find((field) => normalizeFieldApiName(field.apiName) === 'name');
    if (!nameField) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Custom objects must include a Name field' });
    } else if (nameField.formula || nameField.relationship || !nameField.required) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'The Name field must be required and cannot be a formula or relationship' });
    } else if ((object.settings?.recordNameType ?? 'Text') === 'Auto Number' && nameField.dataType !== 'AutoNumber') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Auto-number record names require an AutoNumber Name field' });
    } else if ((object.settings?.recordNameType ?? 'Text') === 'Text' && !/^Text(?:\(|$)/.test(nameField.dataType)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Text record names require a Text Name field' });
    }
  }
  const trackedFields = object.fields.filter((field) => field.trackHistory);
  if (!object.settings?.trackFieldHistory && trackedFields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Enable field history tracking before selecting fields to track' });
  }
  const checkFields = (names: string[], path: (string | number)[]) => {
    names.forEach((name, index) => {
      if (!fieldNames.has(normalizeFieldApiName(name))) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, index], message: `Unknown field ${name}` });
    });
  };
  object.pageLayouts?.forEach((layout, index) => {
    layout.sections.forEach((section, sectionIndex) => checkFields(section.fieldApiNames, ['pageLayouts', index, 'sections', sectionIndex, 'fieldApiNames']));
  });
  if (object.compactLayout) checkFields(object.compactLayout.fieldApiNames, ['compactLayout', 'fieldApiNames']);
  object.compactLayouts?.forEach((layout, index) => {
    checkFields(layout.fieldApiNames, ['compactLayouts', index, 'fieldApiNames']);
    if (new Set(layout.fieldApiNames).size !== layout.fieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayouts', index, 'fieldApiNames'], message: 'Compact layout fields must be unique' });
    }
  });
  if (object.compactLayouts && new Set(object.compactLayouts.map((layout) => layout.id)).size !== object.compactLayouts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayouts'], message: 'Compact layout IDs must be unique' });
  }
  object.fieldSets?.forEach((fieldSet, index) => {
    checkFields(fieldSet.fieldApiNames, ['fieldSets', index, 'fieldApiNames']);
    if (new Set(fieldSet.fieldApiNames.map(normalizeFieldApiName)).size !== fieldSet.fieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets', index, 'fieldApiNames'], message: 'Field set fields must be unique' });
    }
    if (fieldSet.fieldApiNames.some((name) => !object.fields.some((field) => field.apiName === name))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets', index, 'fieldApiNames'], message: 'Field set fields must use their exact API names' });
    }
  });
  Object.entries(object.searchLayouts ?? {}).forEach(([name, fields]) => {
    checkFields(fields, ['searchLayouts', name]);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['searchLayouts', name], message: 'Search layout fields must be unique' });
    }
  });
  object.relatedLookupFilters?.forEach((filter, index) => {
    if (!fieldNames.has(normalizeFieldApiName(filter.fieldApiName))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedLookupFilters', index, 'fieldApiName'], message: `Unknown field ${filter.fieldApiName}` });
  });
  Object.keys(object.relatedLookupFilterLogic ?? {}).forEach((fieldApiName) => {
    const field = object.fields.find((candidate) => candidate.apiName === fieldApiName);
    if (!field?.relationship || !object.relatedLookupFilters?.some((filter) => filter.fieldApiName === fieldApiName)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedLookupFilterLogic', fieldApiName], message: 'Lookup filter logic requires a relationship field with at least one lookup filter' });
    }
  });
  if (object.recordTypes && object.recordTypes.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'An object must have at least one record type' });
  }
  if (object.recordTypes && !object.recordTypes.some((recordType) => recordType.active)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'An object must have at least one active record type' });
  }
  if (object.recordTypes && object.recordTypes.filter((recordType) => recordType.isDefault).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Exactly one record type must be the default' });
  }
  object.recordTypes?.forEach((recordType, recordTypeIndex) => {
    for (const [fieldApiName, values] of Object.entries(recordType.picklistValues ?? {})) {
      const field = object.fields.find((item) => normalizeFieldApiName(item.apiName) === normalizeFieldApiName(fieldApiName));
      if (!field || (field.dataType !== 'Picklist' && field.dataType !== 'Multi-Select Picklist')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type picklist values reference a non-picklist field "${fieldApiName}"` });
      } else {
        if (field.apiName !== fieldApiName) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type picklist settings must use the exact field API name "${field.apiName}"` });
        }
        if (field.picklistValues && values.some((value) => !field.picklistValues?.includes(value))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type values for "${fieldApiName}" must be in the field's configured picklist values` });
        }
      }
      if (new Set(values.map((value) => value.toLocaleLowerCase())).size !== values.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type values for "${fieldApiName}" must be unique` });
      }
    }
    for (const field of object.fields) {
      if ((field.dataType !== 'Picklist' && field.dataType !== 'Multi-Select Picklist')
        || typeof field.defaultValue !== 'string') continue;
      const recordTypeValues = recordType.picklistValues?.[field.apiName];
      if (!recordTypeValues) continue;
      const defaultValues = field.dataType === 'Multi-Select Picklist'
        ? field.defaultValue.split(';').filter(Boolean)
        : [field.defaultValue];
      if (defaultValues.some((value) => !recordTypeValues.includes(value))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recordTypes', recordTypeIndex, 'picklistValues', field.apiName],
          message: `Record type "${recordType.label}" must include the default value for "${field.label}"`
        });
      }
    }
  });
  if (object.recordTypes?.some((recordType) => recordType.isDefault && !recordType.active)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'The default record type must be active' });
  }
  if (object.recordTypes && new Set(object.recordTypes.map((recordType) => recordType.id)).size !== object.recordTypes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Record type IDs must be unique' });
  }
  if (object.recordTypes && new Set(object.recordTypes.map((recordType) => recordType.developerName.toLocaleLowerCase())).size !== object.recordTypes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Record type developer names must be unique' });
  }
  if (object.recordTypes && new Set(object.recordTypes.map((recordType) => recordType.label.toLocaleLowerCase())).size !== object.recordTypes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Record type labels must be unique' });
  }
  if ((object.settings?.recordNameType ?? 'Text') === 'Auto Number') {
    const format = object.settings?.recordNameFormat ?? '';
    const tokens = format.match(/\{0+\}/g) ?? [];
    if (tokens.length !== 1 || /[{}]/.test(format.replace(/\{0+\}/, ''))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['settings', 'recordNameFormat'],
        message: 'Auto-number display formats must contain exactly one numeric token, such as {0000}'
      });
    }
  } else if (object.settings?.recordNameFormat) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'recordNameFormat'], message: 'Text record names cannot have an auto-number display format' });
  }
  if (object.pageLayouts && new Set(object.pageLayouts.map((layout) => layout.id)).size !== object.pageLayouts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts'], message: 'Page layout IDs must be unique' });
  }
  if (object.pageLayouts && object.pageLayouts.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts'], message: 'An object must have at least one page layout' });
  }
  object.pageLayouts?.forEach((layout, index) => {
    if (new Set(layout.sections.map((section) => section.id)).size !== layout.sections.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts', index, 'sections'], message: 'Section IDs must be unique within a page layout' });
    }
    const fieldsInLayout = layout.sections.flatMap((section) => section.fieldApiNames);
    if (new Set(fieldsInLayout).size !== fieldsInLayout.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts', index, 'sections'], message: 'A field can appear only once in a page layout' });
    }
    if (new Set(layout.relatedLists.map((name) => name.toLocaleLowerCase())).size !== layout.relatedLists.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts', index, 'relatedLists'], message: 'Related lists must be unique within a page layout' });
    }
    (layout.customLinks ?? []).forEach((link, linkIndex) => {
      const fieldReferences = [...link.url.matchAll(/\{!Record\.([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
      fieldReferences.forEach((fieldName) => {
        if (fieldName !== 'Id' && !fieldNames.has(normalizeFieldApiName(fieldName))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['pageLayouts', index, 'customLinks', linkIndex, 'url'],
            message: `Custom link references unknown field "${fieldName}"`
          });
        }
      });
    });
  });
  if (object.fieldSets && new Set(object.fieldSets.map((fieldSet) => fieldSet.apiName.toLocaleLowerCase())).size !== object.fieldSets.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets'], message: 'Field set API names must be unique' });
  }
  if (object.fieldSets && new Set(object.fieldSets.map((fieldSet) => fieldSet.label.toLocaleLowerCase())).size !== object.fieldSets.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets'], message: 'Field set labels must be unique' });
  }
  if (object.actions && new Set(object.actions.map((action) => action.id)).size !== object.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'Object action IDs must be unique' });
  }
  const actionLabels = object.actions?.map((action) => action.label.trim().toLocaleLowerCase()) ?? [];
  if (new Set(actionLabels).size !== actionLabels.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'Object action labels must be unique' });
  }
  const standardActions = new Set(['New', 'Edit', 'Delete']);
  object.actions?.forEach((action, index) => {
    const normalizedLabel = action.label.trim().toLocaleLowerCase();
    const reservedStandardAction = [...standardActions].some((label) => label.toLocaleLowerCase() === normalizedLabel);
    if (action.type === 'Custom' && reservedStandardAction) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', index, 'label'], message: 'Custom actions cannot reuse standard action labels' });
    }
    if (action.type === 'Standard' && !standardActions.has(action.label)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', index, 'label'], message: 'Standard actions must use a supported standard action label' });
    }
    if (action.type === 'Custom' && action.behavior === 'Set Field Value') {
      const targetField = object.fields.find((field) => normalizeFieldApiName(field.apiName) === normalizeFieldApiName(action.fieldApiName ?? ''));
      if (!targetField || targetField.formula || targetField.relationship
        || targetField.dataType === 'AutoNumber' || targetField.dataType === 'Auto Number') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', index, 'fieldApiName'], message: 'Custom actions can update only existing writable, non-formula fields' });
      }
    }
  });
  if (object.relatedLookupFilters && new Set(object.relatedLookupFilters.map((filter) => filter.id)).size !== object.relatedLookupFilters.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedLookupFilters'], message: 'Related lookup filter IDs must be unique' });
  }
  object.pageLayoutAssignments?.forEach((assignment, index) => {
    if (!object.recordTypes?.some((recordType) => recordType.id === assignment.recordTypeId && recordType.active)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayoutAssignments', index, 'recordTypeId'], message: `Unknown or inactive record type ${assignment.recordTypeId}` });
    }
    if (!object.pageLayouts?.some((layout) => layout.id === assignment.pageLayoutId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayoutAssignments', index, 'pageLayoutId'], message: `Unknown page layout ${assignment.pageLayoutId}` });
    }
  });
  if (object.pageLayoutAssignments) {
    const assignmentKeys = object.pageLayoutAssignments.map((assignment) => `${assignment.profileId}:${assignment.recordTypeId}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayoutAssignments'], message: 'Each profile and record type can have only one layout assignment' });
    }
  }
  object.compactLayoutAssignments?.forEach((assignment, index) => {
      if (!object.recordTypes?.some((recordType) => recordType.id === assignment.recordTypeId && recordType.active)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayoutAssignments', index, 'recordTypeId'], message: `Unknown or inactive record type ${assignment.recordTypeId}` });
      }
      if (!object.compactLayouts?.some((layout) => layout.id === assignment.compactLayoutId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayoutAssignments', index, 'compactLayoutId'], message: `Unknown compact layout ${assignment.compactLayoutId}` });
      }
  });
  if (object.compactLayoutAssignments) {
    const assignmentKeys = object.compactLayoutAssignments.map((assignment) => `${assignment.profileId}:${assignment.recordTypeId}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayoutAssignments'], message: 'Each profile and record type can have only one compact layout assignment' });
    }
  }
});
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
const libraryComponentResizeSchema = z.object({
  defaultWidth: z.number().int().min(80).max(2000),
  defaultHeight: z.number().int().min(40).max(2000),
  minWidth: z.number().int().min(40).max(2000),
  minHeight: z.number().int().min(30).max(2000)
}).superRefine((resize, context) => {
  if (resize.minWidth > resize.defaultWidth) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minWidth'], message: 'Minimum width cannot exceed the default width' });
  }
  if (resize.minHeight > resize.defaultHeight) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minHeight'], message: 'Minimum height cannot exceed the default height' });
  }
});
const defaultLibraryComponentResize = { defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60 };
const propertyDefinitionSchema = z.object({propertyKey:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),label:z.string().min(1).max(100),kind:z.enum(['TEXT','NUMBER','BOOLEAN','COLOR','IMAGE','SELECT','OBJECT_FIELD','FLOW','CURRENCY']),required:z.boolean().optional(),isBindable:z.boolean().optional(),displayOrder:z.number().int().optional(),defaultValue:z.union([z.string(),z.number(),z.boolean()]).optional(),choices:z.array(z.object({key:z.string().min(1),label:z.string().min(1)})).max(200).optional()}); const libraryComponentRevisionSchema = z.object({
  version: z.number().int().positive(), label: z.string().trim().min(1).max(80),
  description: z.string().max(500), surfaces: z.array(z.enum(['page','dashboard','flow','platform'])).min(1),
  resize: libraryComponentResizeSchema, jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000), compiledJs: z.string().min(1).max(500_000),
  scopedCss: z.string().max(150_000), updatedAt: z.string().datetime(), propertyDefinitions:z.array(propertyDefinitionSchema).max(200).optional()
});
const libraryComponentSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  surfaces: z.array(z.enum(['page', 'dashboard', 'flow', 'platform'])).min(1),
  resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
  jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000),
  compiledJs: z.string().min(1).max(500_000),
  scopedCss: z.string().max(150_000),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  status: z.enum(['Draft','Published']).optional(),
  publishedVersion: z.number().int().nonnegative().optional(),
  revisions: z.array(libraryComponentRevisionSchema).max(100).optional(),
  pendingDraft: libraryComponentRevisionSchema.optional(),
  trustedBundled: z.boolean().optional(),
  scope: z.literal('platform-system').optional(),
  tenantId: z.string().min(1).optional(), propertyDefinitions:z.array(propertyDefinitionSchema).max(200).optional()
}).superRefine((component, context) => {
  if (new Set(component.surfaces).size !== component.surfaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['surfaces'], message: 'Component surfaces must be unique' });
  }
  if ((component.scope === 'platform-system' || component.surfaces.includes('platform'))
    && !(component.scope === 'platform-system' && component.trustedBundled === true && component.tenantId === undefined))
    context.addIssue({code:z.ZodIssueCode.custom,path:['scope'],message:'Platform metadata requires unowned trusted bundle'});
});
const libraryComponentInputSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  surfaces: z.array(z.enum(['page', 'dashboard', 'flow'])).min(1),
  resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
  jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000).default(''),
  publicationStatus: z.enum(['Draft','Published']).default('Published'), propertyDefinitions:z.array(propertyDefinitionSchema).max(200).optional()
}).superRefine((component, context) => {
  if (new Set(component.surfaces).size !== component.surfaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['surfaces'], message: 'Component surfaces must be unique' });
  }
});
type LibraryComponent = z.infer<typeof libraryComponentSchema>;
type LibraryComponentRevision = z.infer<typeof libraryComponentRevisionSchema>;
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
const dashboardComponentSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().max(250).default(''),
  footer: z.string().max(250).default(''),
  type: z.enum(['Metric', 'Chart', 'Table', 'Rich Text', 'Image', 'Custom']),
  customComponentApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  reportApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  properties: z.record(z.unknown()).default({}),
  richTextContent: z.string().max(20_000).default(''),
  imageUrl: z.string().max(2_048).default('').refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }, 'Dashboard image URLs must use HTTPS'),
  imageAltText: z.string().max(500).default(''),
  objectApiName: z.string().min(1),
  width: z.enum(['Quarter', 'Half', 'ThreeQuarter', 'Full']).default('Half'),
  height: z.enum(['Short', 'Medium', 'Tall']).default('Medium'),
  aggregation: z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']),
  measureFieldApiName: z.string().nullable(),
  groupByFieldApiName: z.string().nullable(),
  seriesFieldApiName: z.string().nullable().default(null),
  gaugeMin: z.number().finite().default(0),
  gaugeMax: z.number().finite().default(100),
  gaugeRange1EndPercent: z.number().finite().min(0).max(100).default(33),
  gaugeRange2EndPercent: z.number().finite().min(0).max(100).default(67),
  showLegend: z.boolean().default(true),
  showValues: z.boolean().default(true),
  chartDataLabelPosition: z.enum(['Auto', 'Inside', 'Outside']).default('Auto'),
  chartType: z.enum(['Bar', 'Column', 'Horizontal Bar', 'Stacked Bar', 'Stacked Column', '100% Stacked Bar', '100% Stacked Column', 'Line', 'Area', 'Scatter', 'Donut', 'Pie', 'Funnel', 'Gauge']),
  chartSortOrder: z.enum(['Ascending', 'Descending']).default('Descending'),
  chartColorPalette: z.enum(['Salesforce', 'Colorblind Safe', 'Monochrome']).default('Salesforce'),
  chartLimit: z.number().int().min(1).default(8),
  chartXAxisMinimum: z.number().finite().nullable().default(null),
  chartXAxisMaximum: z.number().finite().nullable().default(null),
  chartYAxisMinimum: z.number().finite().nullable().default(null),
  chartYAxisMaximum: z.number().finite().nullable().default(null),
  chartValueFormat: z.enum(['Number', 'Currency', 'Percent']).default('Number'),
  chartCurrencyCode: z.string().regex(/^[A-Z]{3}$/).default('USD').refine((value) => {
    try { new Intl.NumberFormat('en-US', { style: 'currency', currency: value }); return true; } catch { return false; }
  }, 'Currency code must be a valid ISO 4217 currency'),
  chartDecimalPlaces: z.number().int().min(0).max(4).default(2),
  xAxisFieldApiName: z.string().nullable().default(null),
  xAxisTitle: z.string().max(80).default(''),
  yAxisTitle: z.string().max(80).default(''),
  showGridlines: z.boolean().default(true),
  legendPosition: z.enum(['Bottom', 'Right', 'Top']).default('Bottom'),
  displayFieldApiNames: z.array(z.string())
}).superRefine((component, context) => {
  if (component.type === 'Custom' && !component.customComponentApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customComponentApiName'], message: 'Custom dashboard components must reference a library component' });
  }
  if (component.type !== 'Custom' && component.customComponentApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customComponentApiName'], message: 'Only custom components can reference a library component' });
  }
  if (component.type === 'Custom' && component.reportApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reportApiName'], message: 'Custom components cannot use a report source' });
  }
  if (['Rich Text', 'Image'].includes(component.type) && component.reportApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reportApiName'], message: 'Content widgets cannot use a report source' });
  }
  if (component.type === 'Rich Text' && component.imageUrl) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['imageUrl'], message: 'Rich text widgets cannot use an image source' });
  }
  if (component.type === 'Image' && component.richTextContent) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['richTextContent'], message: 'Image widgets cannot contain rich text' });
  }
  if (component.chartXAxisMinimum !== null && component.chartXAxisMaximum !== null
    && component.chartXAxisMinimum >= component.chartXAxisMaximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chartXAxisMaximum'], message: 'X-axis maximum must be greater than its minimum' });
  }
  if (component.chartYAxisMinimum !== null && component.chartYAxisMaximum !== null
    && component.chartYAxisMinimum >= component.chartYAxisMaximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chartYAxisMaximum'], message: 'Y-axis maximum must be greater than its minimum' });
  }
  if (component.gaugeMin >= component.gaugeMax) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['gaugeMax'], message: 'Gauge maximum must be greater than its minimum' });
  }
  if (component.gaugeRange1EndPercent >= component.gaugeRange2EndPercent) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['gaugeRange2EndPercent'], message: 'Gauge range thresholds must be in increasing order' });
  }
});
const dashboardFilterSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  fieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Includes', 'Excludes', 'Is Null', 'Is Not Null']),
  value: z.string().max(500)
});
const reportFilterSchema = z.object({
  id: z.string().min(1),
  fieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With', 'Greater Than', 'Greater Than or Equal To', 'Less Than', 'Less Than or Equal To', 'Includes', 'Excludes', 'Is Null', 'Is Not Null']),
  value: z.string().max(500),
  values: z.array(z.string().max(500)).default([]),
  locked: z.boolean().default(false)
});
const reportDateRangeSchema = z.enum([
  'All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Next 7 Days', 'Next 30 Days',
  'This Week', 'Last Week', 'This Month', 'Last Month', 'This Quarter',
  'Last Quarter', 'This Year', 'Last Year'
]);
const reportStandardFiltersSchema = z.object({
  showMe: z.enum(['All', 'My']).default('All'),
  dateFieldApiName: z.string().min(1).nullable().default(null),
  dateRange: reportDateRangeSchema.default('All Time'),
  statusFieldApiName: z.string().min(1).nullable().default(null),
  statusSelection: z.string().max(80).default('All')
});
const reportCrossFilterSchema = z.object({
  id: z.string().min(1),
  childObjectApiName: z.string().min(1),
  mode: z.enum(['With', 'Without']),
  filters: z.array(reportFilterSchema).default([])
});
const reportRowLimitSchema = z.object({
  limit: z.number().int().min(1).nullable().default(null),
  sortFieldApiName: z.string().min(1).nullable().default(null),
  sortDirection: z.enum(['Ascending', 'Descending']).default('Ascending')
});
const reportSummaryOperationSchema = z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']);
const reportDateGroupingSchema = z.enum(['Day', 'Month', 'Quarter', 'Year']);
type ReportFilterLogicNode =
  | { type: 'filter'; index: number }
  | { type: 'not'; value: ReportFilterLogicNode }
  | { type: 'and' | 'or'; left: ReportFilterLogicNode; right: ReportFilterLogicNode }
  | { type: 'all' | 'any' };
const parseReportFilterLogic = (logic: string, filterCount: number): ReportFilterLogicNode | null => {
  const normalized = logic.trim().toUpperCase();
  if (normalized === 'ALL') return { type: 'all' };
  if (normalized === 'ANY') return { type: 'any' };
  const tokens = logic.match(/\d+|AND|OR|NOT|\(|\)/gi) ?? [];
  if (tokens.join('').toUpperCase() !== normalized.replace(/\s+/g, '')) return null;
  let cursor = 0;
  const parsePrimary = (): ReportFilterLogicNode | null => {
    const token = tokens[cursor];
    if (!token) return null;
    if (token === '(') {
      cursor += 1;
      const nested = parseOr();
      if (!nested || tokens[cursor] !== ')') return null;
      cursor += 1;
      return nested;
    }
    if (!/^\d+$/.test(token)) return null;
    const index = Number(token);
    if (index < 1 || index > filterCount) return null;
    cursor += 1;
    return { type: 'filter', index: index - 1 };
  };
  const parseUnary = (): ReportFilterLogicNode | null => {
    if (tokens[cursor]?.toUpperCase() === 'NOT') {
      cursor += 1;
      const value = parseUnary();
      return value ? { type: 'not', value } : null;
    }
    return parsePrimary();
  };
  const parseAnd = (): ReportFilterLogicNode | null => {
    let left = parseUnary();
    while (left && tokens[cursor]?.toUpperCase() === 'AND') {
      cursor += 1;
      const right = parseUnary();
      if (!right) return null;
      left = { type: 'and', left, right };
    }
    return left;
  };
  const parseOr = (): ReportFilterLogicNode | null => {
    let left = parseAnd();
    while (left && tokens[cursor]?.toUpperCase() === 'OR') {
      cursor += 1;
      const right = parseAnd();
      if (!right) return null;
      left = { type: 'or', left, right };
    }
    return left;
  };
  const parsed = parseOr();
  return parsed && cursor === tokens.length ? parsed : null;
};
const reportSchema = z.object({
  reportType: z.literal('Standard').default('Standard'),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  objectApiName: z.string().min(1),
  fieldApiNames: z.array(z.string().min(1)).min(1),
  groupByFieldApiNames: z.array(z.string().min(1)).max(3),
  filterLogic: z.string().trim().min(1).default('All'),
  format: z.enum(['Tabular', 'Summary', 'Matrix']).default('Tabular'),
  columnGroupByFieldApiName: z.string().min(1).nullable().default(null),
  sortFieldApiName: z.string().min(1).nullable().default(null),
  sortDirection: z.enum(['Ascending', 'Descending']).default('Ascending'),
  filters: z.array(reportFilterSchema),
  standardFilters: reportStandardFiltersSchema.default({}),
  crossFilters: z.array(reportCrossFilterSchema).default([]),
  rowLimit: reportRowLimitSchema.default({}),
  summaryOperations: z.record(z.array(reportSummaryOperationSchema).max(5)).default({}),
  dateGroupings: z.record(reportDateGroupingSchema).default({}),
  bucketFields: z.array(z.object({
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
    label: z.string().trim().min(1).max(80),
    fieldApiName: z.string().min(1),
    ranges: z.array(z.object({
      label: z.string().trim().min(1).max(80),
      lowerBound: z.number().finite().nullable(),
      upperBound: z.number().finite().nullable()
    })).min(1),
    treatBlanksAsZero: z.boolean().default(false)
  })).default([]),
  showDetails: z.boolean().default(true),
  showChart: z.boolean().default(false),
  folderName: z.string().trim().min(1).max(80).default('My Reports'),
  folderId: z.string().uuid().nullable().default(null)
}).superRefine((report, context) => {
  if (new Set(report.fieldApiNames).size !== report.fieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldApiNames'], message: 'Report columns must be unique' });
  }
  if (new Set(report.groupByFieldApiNames).size !== report.groupByFieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupByFieldApiNames'], message: 'Report grouping fields must be unique' });
  }
  if (new Set(report.bucketFields.map((bucket) => bucket.apiName.toLowerCase())).size !== report.bucketFields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields'], message: 'Bucket API names must be unique' });
  }
  for (const [bucketIndex, bucket] of report.bucketFields.entries()) {
    if (new Set(bucket.ranges.map((range) => range.label.toLocaleLowerCase())).size !== bucket.ranges.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket labels must be unique' });
    }
    if (bucket.ranges.some((range) => range.lowerBound !== null && range.upperBound !== null && range.lowerBound >= range.upperBound)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket lower bounds must be less than upper bounds' });
    }
    const orderedRanges = [...bucket.ranges].sort((left, right) =>
      (left.lowerBound ?? Number.NEGATIVE_INFINITY) - (right.lowerBound ?? Number.NEGATIVE_INFINITY));
    if (orderedRanges.some((range, index) => index > 0
      && (orderedRanges[index - 1].upperBound === null
        || range.lowerBound === null
        || orderedRanges[index - 1].upperBound! > range.lowerBound))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket ranges cannot overlap' });
    }
  }
  if (report.sortFieldApiName
    && !report.fieldApiNames.includes(report.sortFieldApiName)
    && !report.groupByFieldApiNames.includes(report.sortFieldApiName)
    && report.columnGroupByFieldApiName !== report.sortFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sortFieldApiName'], message: 'Sort field must be included as a report column or grouping field' });
  }
  if (report.columnGroupByFieldApiName
    && (!report.groupByFieldApiNames.length || report.groupByFieldApiNames.includes(report.columnGroupByFieldApiName))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Matrix reports require a distinct column grouping field and at least one row grouping field' });
  }
  if (report.format === 'Matrix' && !report.columnGroupByFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Matrix reports require a column grouping field' });
  }
  if (report.format === 'Summary' && !report.groupByFieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupByFieldApiNames'], message: 'Summary reports require at least one row grouping' });
  }
  if (!report.showDetails && (report.format === 'Tabular' || !report.groupByFieldApiNames.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['showDetails'], message: 'Detail rows can only be hidden on grouped summary or matrix reports' });
  }
  if (report.showChart && (report.format === 'Tabular' || !report.groupByFieldApiNames.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['showChart'], message: 'Report charts require a grouped summary or matrix report' });
  }
  if (Object.values(report.summaryOperations).some((operations) => new Set(operations).size !== operations.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summaryOperations'], message: 'Summary operations must be unique per field' });
  }
  if (report.rowLimit.limit !== null && (report.format !== 'Tabular' || !report.rowLimit.sortFieldApiName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rowLimit'], message: 'Row limits require a tabular report and a sort field' });
  }
  if (report.rowLimit.sortFieldApiName
    && !report.fieldApiNames.includes(report.rowLimit.sortFieldApiName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rowLimit', 'sortFieldApiName'], message: 'Row limit sort field must be a report column' });
  }
  if (report.standardFilters.dateRange !== 'All Time' && !report.standardFilters.dateFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standardFilters', 'dateFieldApiName'], message: 'A date field is required for the selected date range' });
  }
  if (report.standardFilters.statusSelection !== 'All' && !report.standardFilters.statusFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standardFilters', 'statusFieldApiName'], message: 'A status field is required for the selected status range' });
  }
  if (new Set(report.filters.map((filter) => filter.id)).size !== report.filters.length
    || new Set(report.crossFilters.map((filter) => filter.id)).size !== report.crossFilters.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Report filter identifiers must be unique' });
  }
  if (new Set(report.crossFilters.flatMap((filter) => filter.filters.map((subfilter) => subfilter.id))).size
    !== report.crossFilters.reduce((total, filter) => total + filter.filters.length, 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['crossFilters'], message: 'Cross-filter subfilter identifiers must be unique' });
  }
  if (!parseReportFilterLogic(report.filterLogic, report.filters.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filterLogic'], message: 'Filter logic must use valid filter numbers, AND, OR, NOT, and parentheses' });
  }
  if (report.format !== 'Matrix' && report.columnGroupByFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Column grouping is only supported by Matrix reports' });
  }
  const filterIds = report.filters.map((filter) => filter.id);
  if (new Set(filterIds).size !== filterIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Report filter IDs must be unique' });
  }
});
type ReportDateRange = z.infer<typeof reportDateRangeSchema>;
const reportDateRangeBounds = (range: ReportDateRange, now = new Date()): [number, number] | null => {
  if (range === 'All Time') return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 24 * 60 * 60 * 1000;
  const startOfWeek = today - ((new Date(today).getUTCDay() + 6) % 7) * day;
  const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const startOfQuarter = Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1);
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  switch (range) {
    case 'Today': return [today, today + day];
    case 'Yesterday': return [today - day, today];
    case 'Last 7 Days': return [today - 6 * day, today + day];
    case 'Next 7 Days': return [today + day, today + 8 * day];
    case 'Next 30 Days': return [today + day, today + 31 * day];
    case 'This Week': return [startOfWeek, startOfWeek + 7 * day];
    case 'Last Week': return [startOfWeek - 7 * day, startOfWeek];
    case 'This Month': return [startOfMonth, Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)];
    case 'Last Month': return [Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1), startOfMonth];
    case 'This Quarter': return [startOfQuarter, Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 + 3, 1)];
    case 'Last Quarter': return [Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 - 3, 1), startOfQuarter];
    case 'This Year': return [startOfYear, Date.UTC(now.getUTCFullYear() + 1, 0, 1)];
    case 'Last Year': return [Date.UTC(now.getUTCFullYear() - 1, 0, 1), startOfYear];
  }
};
const evaluateReportFilterLogic = (node: ReportFilterLogicNode, matches: Array<boolean | null>): boolean | null => {
  switch (node.type) {
    case 'all': {
      const active = matches.filter((value): value is boolean => value !== null);
      return active.length === 0 ? null : active.every(Boolean);
    }
    case 'any': {
      const active = matches.filter((value): value is boolean => value !== null);
      return active.length === 0 ? null : active.some(Boolean);
    }
    case 'filter': return matches[node.index] ?? null;
    case 'not': {
      const value = evaluateReportFilterLogic(node.value, matches);
      return value === null ? null : !value;
    }
    case 'and': {
      const left = evaluateReportFilterLogic(node.left, matches);
      const right = evaluateReportFilterLogic(node.right, matches);
      return left === null ? right : right === null ? left : left && right;
    }
    case 'or': {
      const left = evaluateReportFilterLogic(node.left, matches);
      const right = evaluateReportFilterLogic(node.right, matches);
      return left === null ? right : right === null ? left : left || right;
    }
  }
};
function reportFilterMatches(
  record: RuntimeRecord,
  filter: z.infer<typeof reportFilterSchema> | DashboardFilterMetadata
): boolean {
  const actual = record[filter.fieldApiName];
  if (filter.operator === 'Is Null') return actual === null || actual === undefined || actual === '';
  if (filter.operator === 'Is Not Null') return actual !== null && actual !== undefined && actual !== '';
  const filterValues = 'values' in filter && filter.values.length
    ? filter.values.filter((item) => item.trim() !== '')
    : filter.value.trim()
      ? ['Includes', 'Excludes'].includes(filter.operator) ? filter.value.split(';').filter((item) => item.trim() !== '') : [filter.value]
      : [];
  if (!filterValues.length) return true;
  const value = actual === null || actual === undefined ? '' : String(actual);
  const normalizedValue = value.toLocaleLowerCase();
  const multiSelectValues = value.split(';').map((item) => item.toLocaleLowerCase());
  if (filter.operator === 'Includes') return filterValues.some((item) => multiSelectValues.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Excludes') return filterValues.every((item) => !multiSelectValues.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Equals') return filterValues.some((item) => normalizedValue === item.toLocaleLowerCase());
  if (filter.operator === 'Not Equal To') return filterValues.every((item) => normalizedValue !== item.toLocaleLowerCase());
  if (filter.operator === 'Contains') return filterValues.some((item) => normalizedValue.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Does Not Contain') return filterValues.every((item) => !normalizedValue.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Starts With') return filterValues.some((item) => normalizedValue.startsWith(item.toLocaleLowerCase()));
  return filterValues.some((item) => {
    const left = Number(value);
    const right = Number(item);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      if (filter.operator === 'Greater Than') return left > right;
      if (filter.operator === 'Greater Than or Equal To') return left >= right;
      if (filter.operator === 'Less Than') return left < right;
      return left <= right;
    }
    if (filter.operator === 'Greater Than') return value > item;
    if (filter.operator === 'Greater Than or Equal To') return value >= item;
    if (filter.operator === 'Less Than') return value < item;
    return value <= item;
  });
}
const dashboardFolderShareSchema = z.object({
  targetType: z.enum(['User', 'PublicGroup', 'PermissionSetGroup', 'Role', 'RoleAndSubordinates', 'Territory']),
  targetId: z.string().min(1),
  accessLevel: z.enum(['Viewer', 'Editor', 'Manager'])
});
const dashboardFolderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  ownerUserId: z.string().min(1),
  shares: z.array(dashboardFolderShareSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((folder, context) => {
  const shareKeys = folder.shares.map((share) => `${share.targetType}:${share.targetId}`);
  if (new Set(shareKeys).size !== shareKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shares'], message: 'Folder access targets must be unique' });
  }
});
type DashboardFolder = z.infer<typeof dashboardFolderSchema>;
const reportFolderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  ownerUserId: z.string().min(1),
  shares: z.array(dashboardFolderShareSchema).default([]),
  visibility: z.enum(['Private', 'All Users']).default('Private'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((folder, context) => {
  const shareKeys = folder.shares.map((share) => `${share.targetType}:${share.targetId}`);
  if (new Set(shareKeys).size !== shareKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shares'], message: 'Folder access targets must be unique' });
  }
});
type ReportFolder = z.infer<typeof reportFolderSchema>;
const dashboardTerritorySchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentTerritoryId: z.string().uuid().nullable(),
  userIds: z.array(z.string().min(1)).max(200).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((territory, context) => {
  if (new Set(territory.userIds).size !== territory.userIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userIds'], message: 'Territory users must be unique' });
  }
});
type DashboardTerritory = z.infer<typeof dashboardTerritorySchema>;
const dashboardSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  folderName: z.string().trim().min(1).max(80),
  folderId: z.string().uuid().nullable().default(null),
  ownerUserId: z.string().min(1),
  runningUserId: z.string().min(1).nullable().default(null),
  allowViewerToSelectRunningUser: z.boolean().default(false),
  visibility: z.enum(['Private', 'All Users']),
  sharedUserIds: z.array(z.string().min(1)).default([]),
  sharedPermissionSetGroupIds: z.array(z.string().min(1)).default([]),
  filterLogic: z.enum(['All', 'Any']).default('All'),
  refreshIntervalMinutes: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(15), z.literal(60)]).default(0),
  status: z.enum(['Draft', 'Deployed']),
  components: z.array(dashboardComponentSchema),
  filters: z.array(dashboardFilterSchema)
}).superRefine((dashboard, context) => {
  if (dashboard.status === 'Deployed' && dashboard.components.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Add at least one component before publishing a dashboard' });
  }
  const componentIds = dashboard.components.map((component) => component.id);
  if (new Set(componentIds).size !== componentIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Dashboard component IDs must be unique' });
  }
  const filterIds = dashboard.filters.map((filter) => filter.id);
  if (new Set(filterIds).size !== filterIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Dashboard filter IDs must be unique' });
  }
  if (new Set(dashboard.sharedUserIds).size !== dashboard.sharedUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharedUserIds'], message: 'Dashboard user shares must be unique' });
  }
  if (new Set(dashboard.sharedPermissionSetGroupIds).size !== dashboard.sharedPermissionSetGroupIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharedPermissionSetGroupIds'], message: 'Dashboard group shares must be unique' });
  }
  if (dashboard.allowViewerToSelectRunningUser && dashboard.runningUserId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['runningUserId'], message: 'Dashboards with viewer-selected running users cannot have a fixed running user' });
  }
  dashboard.components.forEach((component, index) => {
    if (new Set(component.displayFieldApiNames).size !== component.displayFieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'displayFieldApiNames'], message: 'Displayed table fields must be unique' });
    }
    if (component.type === 'Chart' && !['Gauge', 'Scatter'].includes(component.chartType) && !component.groupByFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'groupByFieldApiName'], message: 'Charts require a grouping field' });
    }
    if (component.type === 'Chart' && component.chartType === 'Scatter' && !component.xAxisFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'xAxisFieldApiName'], message: 'Scatter charts require a numeric x-axis field' });
    }
    if (component.type === 'Chart' && ['Stacked Bar', 'Stacked Column', '100% Stacked Bar', '100% Stacked Column'].includes(component.chartType) && !component.seriesFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'seriesFieldApiName'], message: 'Stacked charts require a series field' });
    }
    if (component.type === 'Chart' && component.seriesFieldApiName
      && component.seriesFieldApiName === component.groupByFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'seriesFieldApiName'], message: 'Chart category and series fields must be different' });
    }
    if (component.type === 'Table' && !component.displayFieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'displayFieldApiNames'], message: 'Tables require at least one displayed field' });
    }
    if (component.aggregation !== 'Count' && !component.measureFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'measureFieldApiName'], message: 'Select a measure field for this aggregation' });
    }
  });
});
const dashboardSnapshotComponentSchema = z.object({
  componentId: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().max(250).default(''),
  footer: z.string().max(250).default(''),
  type: z.enum(['Metric', 'Chart', 'Table', 'Rich Text', 'Image', 'Custom']),
  width: z.enum(['Quarter', 'Half', 'ThreeQuarter', 'Full']).default('Half'),
  height: z.enum(['Short', 'Medium', 'Tall']).default('Medium'),
  customHtml: z.string().max(50_000).nullable().default(null),
  richTextContent: z.string().max(20_000).default(''),
  imageUrl: z.string().max(2_048).default(''),
  imageAltText: z.string().max(500).default(''),
  unavailableReason: z.string().max(300).nullable().default(null),
  chartType: z.enum(['Bar', 'Column', 'Horizontal Bar', 'Stacked Bar', 'Stacked Column', '100% Stacked Bar', '100% Stacked Column', 'Line', 'Area', 'Scatter', 'Donut', 'Pie', 'Funnel', 'Gauge']).nullable(),
  chartSortOrder: z.enum(['Ascending', 'Descending']).default('Descending'),
  chartColorPalette: z.enum(['Salesforce', 'Colorblind Safe', 'Monochrome']).default('Salesforce'),
  chartLimit: z.number().int().min(1).default(8),
  chartXAxisMinimum: z.number().finite().nullable().default(null),
  chartXAxisMaximum: z.number().finite().nullable().default(null),
  chartYAxisMinimum: z.number().finite().nullable().default(null),
  chartYAxisMaximum: z.number().finite().nullable().default(null),
  chartValueFormat: z.enum(['Number', 'Currency', 'Percent']).default('Number'),
  chartCurrencyCode: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  chartDecimalPlaces: z.number().int().min(0).max(4).default(2),
  xAxisFieldApiName: z.string().nullable().default(null),
  xAxisTitle: z.string().max(80).default(''),
  yAxisTitle: z.string().max(80).default(''),
  showGridlines: z.boolean().default(true),
  legendPosition: z.enum(['Bottom', 'Right', 'Top']).default('Bottom'),
  aggregation: z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']),
  gaugeMin: z.number().finite().default(0),
  gaugeMax: z.number().finite().default(100),
  gaugeRange1EndPercent: z.number().finite().min(0).max(100).default(33),
  gaugeRange2EndPercent: z.number().finite().min(0).max(100).default(67),
  showLegend: z.boolean().default(true),
  showValues: z.boolean().default(true),
  chartDataLabelPosition: z.enum(['Auto', 'Inside', 'Outside']).default('Auto'),
  objectApiName: z.string().min(1),
  groupByLabel: z.string().nullable(),
  totalRows: z.number().int().min(0),
  metricValue: z.number().finite().nullable(),
  columns: z.array(z.object({ apiName: z.string(), label: z.string() })),
  buckets: z.array(z.object({ label: z.string(), value: z.number().finite(), series: z.record(z.number().finite()).optional() })),
  rows: z.array(z.record(z.unknown())).max(10)
});
const dashboardSnapshotSchema = z.object({
  id: z.string().min(1),
  dashboardApiName: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  runningUserId: z.string().min(1).optional(),
  subscriptionId: z.string().uuid().optional(),
  filters: z.array(dashboardFilterSchema),
  crossFilter: dashboardFilterSchema.optional(),
  crossFilters: z.array(dashboardFilterSchema).default([]),
  sourceRecordAccess: z.array(z.object({
    objectApiName: z.string().min(1),
    recordId: z.string().min(1)
  })).optional(),
  components: z.array(dashboardSnapshotComponentSchema)
});
const dashboardTimeZoneSchema = z.string().min(1).refine((value) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}, 'A valid IANA time zone is required');
const dashboardSubscriptionSchema = z.object({
  id: z.string().uuid(),
  dashboardApiName: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  frequency: z.enum(['Daily', 'Weekly']),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: dashboardTimeZoneSchema,
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  recipientUserIds: z.array(z.string().min(1)).min(1).max(20),
  namedCredentialId: z.string().uuid(),
  fromEmail: z.string().email().max(254),
  active: z.boolean().default(true),
  saveSnapshots: z.boolean().default(true),
  nextRunAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable().default(null),
  lastRunStatus: z.enum(['Never', 'Success', 'Failed']).default('Never'),
  lastRunError: z.string().max(500).nullable().default(null),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((subscription, context) => {
  if (new Set(subscription.recipientUserIds).size !== subscription.recipientUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientUserIds'], message: 'Recipient users must be unique' });
  }
  if ((subscription.frequency === 'Weekly') !== (subscription.dayOfWeek !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfWeek'], message: 'Weekly schedules require a weekday; daily schedules must omit it' });
  }
});
const objectPermissionFlagsSchema = z.object({
  read: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean(),
  viewAll: z.boolean(), modifyAll: z.boolean()
});
const objectPermissionSchema = objectPermissionFlagsSchema.superRefine((permission, context) => {
  if ((permission.create || permission.edit || permission.delete || permission.viewAll || permission.modifyAll) && !permission.read) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Object write, view-all, and modify-all access require read access' });
  }
});
type ObjectPermission = z.infer<typeof objectPermissionFlagsSchema>;
// Navigation access does not bypass object, field or row permissions.
const navigationGrantSchema = z.record(z.boolean()).optional();
const permissionSetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  apiName: z.string().min(1),
  license: z.string().min(1),
  description: z.string(),
  systemPermissions: z.array(z.string()),
  objectPermissions: z.record(objectPermissionSchema),
  recordTypePermissions: z.record(z.boolean()).default({}),
  appPermissions: navigationGrantSchema,
  tabPermissions: navigationGrantSchema,
  fieldPermissions: z.record(z.object({ read: z.boolean(), edit: z.boolean() }).superRefine((permission, context) => {
    if (permission.edit && !permission.read) context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Field edit access requires read access' });
  }))
});
const profileSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  license: z.string().min(1),
  description: z.string().max(500),
  isStandard: z.boolean(),
  systemPermissions: z.array(z.string()),
  objectPermissions: z.record(objectPermissionSchema),
  recordTypePermissions: z.record(z.boolean()).default({}),
  appPermissions: navigationGrantSchema,
  tabPermissions: navigationGrantSchema,
  navigationDefaultAccess: z.enum(['Allow','Deny']).default('Allow'),
  fieldPermissions: z.record(z.object({ read: z.boolean(), edit: z.boolean() }).superRefine((permission, context) => {
    if (permission.edit && !permission.read) context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Field edit access requires read access' });
  }))
});
const permissionSetGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string(),
  permissionSetIds: z.array(z.string()),
  calculationStatus: z.enum(['Updated', 'Updating', 'Failed']).default('Updated'),
  lastCalculatedAt: z.string().datetime().nullable().default(null),
  mutedSystemPermissions: z.array(z.string()).default([]),
  mutedObjectPermissions: z.record(objectPermissionFlagsSchema.partial()).default({}),
  mutedRecordTypePermissions: z.record(z.boolean()).default({}),
  mutedAppPermissions: navigationGrantSchema,
  mutedTabPermissions: navigationGrantSchema,
  mutedFieldPermissions: z.record(z.object({ read: z.boolean().optional(), edit: z.boolean().optional() })).default({})
});
const accessUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().email(),
  role: z.string().min(1),
  roleId: z.string().optional(),
  profileId: z.string().optional(),
  permissionSetIds: z.array(z.string()),
  permissionSetGroupIds: z.array(z.string()).default([]),
  timeZone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
  currencyIsoCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  userType: z.enum(['internal', 'external']).optional(),
  externalAccountId: z.string().min(1).max(128).optional()
}).superRefine((user, context) => {
  if (!dashboardTimeZoneSchema.safeParse(user.timeZone).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['timeZone'], message: 'User time zone must be a valid IANA time zone' });
  }
  try {
    new Intl.NumberFormat(user.locale);
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['locale'], message: 'User locale must be a valid BCP 47 locale identifier' });
  }
});
const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  parentRoleId: z.string().nullable()
});
const publicGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string().max(500).default(''),
  userIds: z.array(z.string()).default([]),
  roleIds: z.array(z.string()).default([]),
  roleAndSubordinateIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([])
});
const queueSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string().max(500).default(''),
  supportedObjectApiNames: z.array(z.string().min(1)).min(1),
  userIds: z.array(z.string()).default([]),
  roleIds: z.array(z.string()).default([]),
  roleAndSubordinateIds: z.array(z.string()).default([]),
  publicGroupIds: z.array(z.string()).default([])
});
const sharingRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  objectApiName: z.string().min(1),
  active: z.boolean().default(true),
  type: z.enum(['OwnerBased', 'CriteriaBased']),
  ownerRoleIds: z.array(z.string()).default([]),
  criteria: z.array(z.object({
    fieldApiName: z.string().min(1),
    operator: z.enum(['Equals', 'Not Equals', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null']),
    value: z.string().default('')
  })).default([]),
  filterLogic: z.enum(['All', 'Any']).default('All'),
  targetType: z.enum(['User', 'PublicGroup', 'Role', 'RoleAndSubordinates']),
  targetId: z.string().min(1),
  accessLevel: z.enum(['Read', 'Edit'])
}).superRefine((rule, context) => {
  if (rule.type === 'OwnerBased' && !rule.ownerRoleIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerRoleIds'], message: 'Owner-based rules must select at least one source role' });
  }
  if (rule.type === 'CriteriaBased' && !rule.criteria.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'Criteria-based rules must include at least one condition' });
  }
  if (rule.type === 'CriteriaBased' && rule.criteria.some((criterion) => criterion.operator === 'Is Null' && criterion.value !== '')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'Is Null conditions cannot have a value' });
  }
});
const accessControlSchema = z.object({
  profiles: z.array(profileSchema).default([]),
  permissionSets: z.array(permissionSetSchema),
  permissionSetGroups: z.array(permissionSetGroupSchema).default([]),
  roles: z.array(roleSchema).default([]),
  publicGroups: z.array(publicGroupSchema).default([]),
  queues: z.array(queueSchema).default([]),
  sharingRules: z.array(sharingRuleSchema).default([]),
  users: z.array(accessUserSchema)
}).superRefine((access, context) => {
  const profileIds = new Set(access.profiles.map((profile) => profile.id));
  const setIds = new Set(access.permissionSets.map((set) => set.id));
  const groupIds = new Set(access.permissionSetGroups.map((group) => group.id));
  const roleIds = new Set(access.roles.map((role) => role.id));
  const publicGroupIds = new Set(access.publicGroups.map((group) => group.id));
  const duplicate = (values: string[]) => values.some((value, index) => values.indexOf(value) !== index);
  if (duplicate(access.profiles.map((profile) => profile.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Profile IDs must be unique' });
  if (duplicate(access.profiles.map((profile) => profile.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Profile API names must be unique' });
  if (duplicate(access.permissionSets.map((set) => set.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSets'], message: 'Permission set IDs must be unique' });
  if (duplicate(access.permissionSetGroups.map((group) => group.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups'], message: 'Permission set group IDs must be unique' });
  if (duplicate(access.permissionSets.map((set) => set.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSets'], message: 'Permission set API names must be unique' });
  if (duplicate(access.permissionSetGroups.map((group) => group.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups'], message: 'Permission set group API names must be unique' });
  if (duplicate(access.roles.map((role) => role.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role IDs must be unique' });
  if (duplicate(access.roles.map((role) => role.name.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role names must be unique' });
  if (duplicate(access.roles.flatMap((role) => role.apiName ? [role.apiName.toLowerCase()] : []))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role API names must be unique' });
  }
  if (duplicate(access.publicGroups.map((group) => group.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups'], message: 'Public group IDs must be unique' });
  if (duplicate(access.publicGroups.map((group) => group.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups'], message: 'Public group API names must be unique' });
  if (duplicate(access.queues.map((queue) => queue.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Queue IDs must be unique' });
  if (duplicate(access.queues.map((queue) => queue.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Queue API names must be unique' });
  if (duplicate(access.sharingRules.map((rule) => rule.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules'], message: 'Sharing rule IDs must be unique' });
  if (duplicate(access.sharingRules.map((rule) => rule.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules'], message: 'Sharing rule API names must be unique' });
  if (duplicate(access.users.map((user) => user.username.trim().toLowerCase()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['users'], message: 'User email addresses must be unique' });
  }
  for (const [index, role] of access.roles.entries()) {
    if (role.parentRoleId && !roleIds.has(role.parentRoleId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles', index, 'parentRoleId'], message: `Unknown parent role ${role.parentRoleId}` });
    }
    const visited = new Set<string>([role.id]);
    let parentRoleId = role.parentRoleId;
    while (parentRoleId) {
      if (visited.has(parentRoleId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles', index, 'parentRoleId'], message: 'Role hierarchy cannot contain cycles' });
        break;
      }
      visited.add(parentRoleId);
      parentRoleId = access.roles.find((candidate) => candidate.id === parentRoleId)?.parentRoleId ?? null;
    }
  }
  for (const [index, group] of access.permissionSetGroups.entries()) {
    if (group.lastCalculatedAt && Number.isNaN(Date.parse(group.lastCalculatedAt))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'lastCalculatedAt'], message: 'Calculation timestamp must be valid' });
    }
    for (const setId of group.permissionSetIds) {
      if (!setIds.has(setId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'permissionSetIds'], message: `Unknown permission set ${setId}` });
    }
    if (duplicate(group.permissionSetIds)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'permissionSetIds'], message: 'Permission set group members must be unique' });
  }
  for (const [index, group] of access.publicGroups.entries()) {
    for (const roleId of [...group.roleIds, ...group.roleAndSubordinateIds]) {
      if (!roleIds.has(roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index], message: `Unknown role ${roleId}` });
    }
    for (const groupId of group.groupIds) {
      if (!publicGroupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index, 'groupIds'], message: `Unknown public group ${groupId}` });
    }
    if (duplicate(group.userIds) || duplicate(group.roleIds) || duplicate(group.roleAndSubordinateIds) || duplicate(group.groupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index], message: 'Public group members must be unique' });
    }
    const visited = new Set<string>([group.id]);
    const visit = (candidate: typeof group, path: Set<string>) => {
      for (const nestedId of candidate.groupIds) {
        if (path.has(nestedId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index, 'groupIds'], message: 'Public group membership cannot contain cycles' });
          continue;
        }
        const nested = access.publicGroups.find((item) => item.id === nestedId);
        if (nested) visit(nested, new Set([...path, nestedId]));
      }
    };
    visit(group, visited);
  }
  for (const [index, rule] of access.sharingRules.entries()) {
    if (rule.type === 'OwnerBased' && rule.ownerRoleIds.some((roleId) => !roleIds.has(roleId))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'ownerRoleIds'], message: 'Sharing rules must reference existing owner roles' });
    }
    if ((rule.targetType === 'Role' || rule.targetType === 'RoleAndSubordinates') && !roleIds.has(rule.targetId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'targetId'], message: `Unknown target role ${rule.targetId}` });
    }
    if (rule.targetType === 'PublicGroup' && !publicGroupIds.has(rule.targetId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'targetId'], message: `Unknown target public group ${rule.targetId}` });
    }
  }
  for (const [index, queue] of access.queues.entries()) {
    if (duplicate(queue.userIds) || duplicate(queue.roleIds) || duplicate(queue.roleAndSubordinateIds) || duplicate(queue.publicGroupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index], message: 'Queue members must be unique' });
    }
    for (const roleId of [...queue.roleIds, ...queue.roleAndSubordinateIds]) {
      if (!roleIds.has(roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index], message: `Unknown queue member role ${roleId}` });
    }
    for (const groupId of queue.publicGroupIds) {
      if (!publicGroupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index, 'publicGroupIds'], message: `Unknown queue member public group ${groupId}` });
    }
    if (duplicate(queue.supportedObjectApiNames)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index, 'supportedObjectApiNames'], message: 'Queue object assignments must be unique' });
    }
  }
  for (const [index, user] of access.users.entries()) {
    if (user.roleId && !roleIds.has(user.roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'roleId'], message: `Unknown role ${user.roleId}` });
    if (user.profileId && !profileIds.has(user.profileId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'profileId'], message: `Unknown profile ${user.profileId}` });
    for (const setId of user.permissionSetIds) {
      if (!setIds.has(setId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'permissionSetIds'], message: `Unknown permission set ${setId}` });
    }
    for (const groupId of user.permissionSetGroupIds) {
      if (!groupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'permissionSetGroupIds'], message: `Unknown permission set group ${groupId}` });
    }
    if (duplicate(user.permissionSetIds) || duplicate(user.permissionSetGroupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index], message: 'User permission assignments must be unique' });
    }
  }
});
export type ObjectMetadata = z.infer<typeof objectSchema>;
function isNumericField(field: { dataType: string; formula?: { returnType: string } } | undefined): boolean {
  const numericTypes = /^(Number|Currency|Percent)(\(|$)/;
  return Boolean(field && (numericTypes.test(field.dataType)
    || (field.dataType.startsWith('Formula(') && numericTypes.test(field.formula?.returnType ?? ''))));
}
type ReportFilterOperator = z.infer<typeof reportFilterSchema>['operator'];
function reportFilterOperatorAllowed(
  field: { dataType: string; formula?: { returnType: string } },
  operator: ReportFilterOperator
): boolean {
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  const nullOperators: ReportFilterOperator[] = ['Is Null', 'Is Not Null'];
  if (type === 'Multi-Select Picklist') {
    return [...nullOperators, 'Includes', 'Excludes'].includes(operator);
  }
  if (['Picklist', 'Checkbox', 'Reference', 'Id'].includes(type)) {
    return [...nullOperators, 'Equals', 'Not Equal To'].includes(operator);
  }
  if (isNumericField(field) || type === 'Date' || type === 'DateTime') {
    return [...nullOperators, 'Equals', 'Not Equal To', 'Greater Than', 'Greater Than or Equal To',
      'Less Than', 'Less Than or Equal To'].includes(operator);
  }
  return [...nullOperators, 'Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With'].includes(operator);
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
function reportFilterValueError(
  field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] },
  filter: z.infer<typeof reportFilterSchema>
): string | null {
  if (filter.operator === 'Is Null' || filter.operator === 'Is Not Null') return null;
  const values = filter.values.length
    ? filter.values
    : filter.value.trim()
      ? ['Includes', 'Excludes'].includes(filter.operator)
        ? filter.value.split(';').filter((value) => value.trim() !== '')
        : [filter.value]
      : [];
  for (const value of values) {
    const error = dashboardFilterValueError(field, value);
    if (error) return error;
  }
  return null;
}
export type FlowMetadata = z.infer<typeof flowSchema>;
/** The draft in Flow Builder is not necessarily the published executable version. */
function activeFlowDefinition(candidate: FlowMetadata | undefined): FlowMetadata | undefined {
  if (!candidate || candidate.activeVersion === null) return undefined;
  if (candidate.status === 'Active' && candidate.versionNumber === candidate.activeVersion) return candidate;
  const published = candidate.versions.find((version) => version.versionNumber === candidate.activeVersion);
  if (!published) return undefined;
  return {
    ...candidate,
    ...published,
    versionNumber: candidate.activeVersion,
    activeVersion: candidate.activeVersion,
    status: 'Active',
    versions: candidate.versions
  };
}
function flowVersionSnapshot(flow: FlowMetadata, savedAt: string): FlowMetadata['versions'][number] {
  return {
    versionNumber: flow.versionNumber,
    status: flow.status,
    savedAt,
    label: flow.label,
    description: flow.description,
    flowType: flow.flowType,
    triggerObject: flow.triggerObject,
    startConfig: flow.startConfig,
    elements: flow.elements,
    connectors: flow.connectors,
    resources: flow.resources,
    tests: flow.tests
  };
}
function uniqueFlowHistory(flow: FlowMetadata | undefined, savedAt: string): FlowMetadata['versions'] {
  if (!flow) return [];
  const snapshots = new Map<number, FlowMetadata['versions'][number]>();
  for (const version of flow.versions) snapshots.set(version.versionNumber, version);
  // The editable current version is authoritative when both it and a history entry exist.
  snapshots.set(flow.versionNumber, flowVersionSnapshot(flow, savedAt));
  return [...snapshots.values()]
    .map((version) => ({
      ...version,
      status: version.versionNumber === flow.activeVersion
        ? 'Active' as const
        : version.status === 'Draft' ? 'Draft' as const : 'Obsolete' as const
    }))
    .sort((left, right) => left.versionNumber - right.versionNumber);
}
type FlowInterview = z.infer<typeof flowInterviewSchema>;
type PageMetadata = z.infer<typeof pageSchema>;
type DashboardMetadata = z.infer<typeof dashboardSchema>;
type DashboardFilterMetadata = z.infer<typeof dashboardFilterSchema>;
type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
type DashboardSubscription = z.infer<typeof dashboardSubscriptionSchema>;
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
const fieldHistoryEntrySchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  fieldApiName: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  changedBy: z.string().min(1),
  changedAt: z.string().datetime()
});
type FieldHistoryEntry = z.infer<typeof fieldHistoryEntrySchema>;
const advancedRestrictionConditionSchema = z.object({
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  operator: z.enum(['eq', 'ne', 'in', 'notIn', 'isNull', 'notNull']),
  value: z.unknown().optional()
});
const advancedRestrictionRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  tenantId: z.string().min(1),
  objectApiName: z.string().min(1),
  enabled: z.boolean(),
  subjectType: z.enum(['all', 'user', 'role', 'external']),
  subjectId: z.string().optional(),
  conditionLogic: z.enum(['all', 'any']),
  conditions: z.array(advancedRestrictionConditionSchema).min(1).max(16)
});
const sharingSettingSchema = z.object({
  defaultAccess: z.enum(['Private', 'Public Read Only', 'Public Read/Write']),
  grantAccessUsingHierarchies: z.boolean().default(true),
  restrictionRules: z.array(advancedRestrictionRuleSchema).max(100).optional(),
  portalEnabled: z.boolean().optional(),
  portalAccountField: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional()
});
const currencySettingsSchema = z.object({
  corporateCurrency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  standardVatRate: z.number().finite().min(0).max(100).default(20),
  currencies: z.array(z.object({
    currencyIsoCode: z.string().regex(/^[A-Z]{3}$/),
    conversionRate: z.number().finite().positive()
  })).min(1).default([{ currencyIsoCode: 'USD', conversionRate: 1 }])
}).superRefine((settings, context) => {
  const codes = new Set<string>();
  for (const [index, currency] of settings.currencies.entries()) {
    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.currencyIsoCode });
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencies', index, 'currencyIsoCode'],
        message: `Currency code "${currency.currencyIsoCode}" is not a valid ISO 4217 code`
      });
    }
    if (codes.has(currency.currencyIsoCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencies', index, 'currencyIsoCode'],
        message: `Currency code "${currency.currencyIsoCode}" is configured more than once`
      });
    }
    codes.add(currency.currencyIsoCode);
  }
  const corporate = settings.currencies.find((currency) => currency.currencyIsoCode === settings.corporateCurrency);
  if (!corporate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['corporateCurrency'],
      message: 'Corporate currency must be included in the active currency list'
    });
  } else if (corporate.conversionRate !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currencies'],
      message: 'Corporate currency conversion rate must be exactly 1'
    });
  }
});
type CurrencySettings = z.infer<typeof currencySettingsSchema>;
const recordShareSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  userId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  accessLevel: z.enum(['Read', 'Edit']),
  rowCause: z.literal('Manual').default('Manual'),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
}).superRefine((share, context) => {
  if (Boolean(share.userId) === Boolean(share.groupId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'A manual share must target exactly one user or public group' });
  }
});
type SharingSetting = z.infer<typeof sharingSettingSchema>;
type RecordShare = z.infer<typeof recordShareSchema>;
const campaignMemberSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  status: z.enum(['Sent', 'Responded']),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
});
type CampaignMember = z.infer<typeof campaignMemberSchema>;
const recordActivitySchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  kind: z.enum(['Task', 'Call', 'Event']),
  subject: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(''),
  status: z.enum(['Open', 'Completed']).default('Open'),
  dueAt: z.string().datetime().nullable().default(null),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime()
});
type RecordActivity = z.infer<typeof recordActivitySchema>;
const chatterCommentSchema = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime()
});
const chatterPostSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime(),
  comments: z.array(chatterCommentSchema).default([])
});
type ChatterPost = z.infer<typeof chatterPostSchema>;
const customNotificationSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  flowApiName: z.string().min(1),
  sentBy: z.string().min(1),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable().default(null)
});
type CustomNotification = z.infer<typeof customNotificationSchema>;
const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  flowApiName: z.string().min(1),
  processApiName: z.string().nullable().default(null),
  orchestrationInterviewId: z.string().uuid().nullable().default(null),
  approvalMode: z.enum(['ANY', 'ALL']).default('ANY'),
  submittedBy: z.string().min(1),
  submittedByName: z.string().min(1),
  approverId: z.string().min(1),
  status: z.enum(['Pending', 'Approved', 'Rejected', 'Canceled']),
  comments: z.string().max(2000),
  decisionComments: z.string().max(2000).default(''),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable().default(null),
  decidedBy: z.string().nullable().default(null)
});
type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
const approvalProcessShapeSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  objectApiName: z.string().min(1),
  approverUserIds: z.array(z.string().min(1)).min(1),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
const approvalProcessSchema = approvalProcessShapeSchema.superRefine((process, context) => {
  if (new Set(process.approverUserIds).size !== process.approverUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approverUserIds'], message: 'Approvers must be unique' });
  }
});
const approvalProcessRequestSchema = approvalProcessShapeSchema.omit({
  createdAt: true,
  updatedAt: true
}).strict().superRefine((process, context) => {
  if (new Set(process.approverUserIds).size !== process.approverUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approverUserIds'], message: 'Approvers must be unique' });
  }
});
type ApprovalProcess = z.infer<typeof approvalProcessSchema>;
const approvalDecisionSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  comments: z.string().max(2000).default('')
}).strict();
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
const effectivePermissionCache = new WeakMap<TenantData, Map<string, {
  user: LocalUser; platformGrants?: PlatformState['platformPolicies'][string]; permissions: string[];
}>>();
function effectivePermissions(user: LocalUser, data: TenantData): string[] {
  const platformGrants = platformStore.state.platformPolicies[user.id];
  let tenantCache = effectivePermissionCache.get(data);
  if (!tenantCache) {
    tenantCache = new Map();
    effectivePermissionCache.set(data, tenantCache);
  }
  const cached = tenantCache.get(user.id);
  if (cached && cached.user === user && cached.platformGrants === platformGrants) {
    return cached.permissions;
  }
  const accessUser = data.accessControl.users.find((item) => item.id === user.id);
  const profile = data.accessControl.profiles.find((item) =>
    item.id === (accessUser?.profileId ?? profileIdForRole(user.role, data.accessControl.profiles)));
  // RBAC user assignments are authoritative; the login identity is only a
  // fallback for legacy tenant data that has not yet been reconciled.
  const assignedSetIds = accessUser?.permissionSetIds ?? user.permissionSetIds;
  const assignedGroupIds = accessUser?.permissionSetGroupIds ?? user.permissionSetGroupIds;
  const assigned = data.accessControl.permissionSets.filter((set) => assignedSetIds.includes(set.id));
  const permissions = new Set([...(profile?.systemPermissions ?? []), ...assigned.flatMap((set) => set.systemPermissions)]);
  for (const groupId of assignedGroupIds) {
    const group = data.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    if (!group) continue;
    const groupPermissions = new Set(data.accessControl.permissionSets
      .filter((set) => group.permissionSetIds.includes(set.id))
      .flatMap((set) => set.systemPermissions));
    for (const permission of group.mutedSystemPermissions) groupPermissions.delete(permission);
    for (const permission of groupPermissions) permissions.add(permission);
  }
  // Neither a tenant administrator nor a tenant Flow can grant platform authority
  // through editable profile / permission-set metadata.
  for (const permission of permissions) {
    if (permission === 'licence:manage' || permission.startsWith('platform:')) permissions.delete(permission);
  }
  const policies = platformStore.state.platformPolicies[user.id] ?? [];
  if (policies.includes('platform:superadmin')) {
    permissions.add('platform:superadmin');
    permissions.add('licence:manage');
  } else if (policies.includes('licence:manage')) {
    permissions.add('licence:manage');
  }
  const resolved = [...permissions];
  tenantCache.set(user.id, { user, platformGrants, permissions: resolved });
  return resolved;
}
function principalForUser(user: LocalUser, tenant: TenantData): Principal {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roles: [user.role],
    permissions: effectivePermissions(user, tenant)
  };
}
function canSelectDashboardRunningUser(viewer: Principal, tenant: TenantData, targetUserId: string): boolean {
  if (targetUserId === viewer.userId
    || viewer.permissions.includes('dashboards:manage')) return true;
  if (viewer.permissions.includes('data:viewAll')) return true;
  if (!viewer.permissions.includes('dashboards:viewTeam')) return false;
  const viewerMetadata = tenant.accessControl.users.find((item) => item.id === viewer.userId);
  const targetMetadata = tenant.accessControl.users.find((item) => item.id === targetUserId);
  const viewerRoleId = viewerMetadata?.roleId ?? roleIdForName(viewerMetadata?.role ?? '', tenant.accessControl.roles);
  const targetRoleId = targetMetadata?.roleId ?? roleIdForName(targetMetadata?.role ?? '', tenant.accessControl.roles);
  return Boolean(viewerRoleId && targetRoleId
    && targetRoleId !== viewerRoleId
    && roleIsAtOrBelow(targetRoleId, viewerRoleId, tenant.accessControl.roles));
}
function dashboardRunningUserChoices(viewer: Principal, tenant: TenantData): string[] {
  return platformStore.state.users
    .filter((user) => user.tenantId === viewer.tenantId && !user.disabled
      && canSelectDashboardRunningUser(viewer, tenant, user.id))
    .map((user) => user.id);
}
function dashboardRunningPrincipal(
  viewer: Principal,
  tenant: TenantData,
  dashboard: DashboardMetadata,
  selectedRunningUserId?: string
): Principal | undefined {
  if (dashboard.allowViewerToSelectRunningUser) {
    if (!selectedRunningUserId || selectedRunningUserId === viewer.userId) return viewer;
    if (!canSelectDashboardRunningUser(viewer, tenant, selectedRunningUserId)) return undefined;
    const selectedUser = platformStore.state.users.find((item) =>
      item.id === selectedRunningUserId && item.tenantId === viewer.tenantId && !item.disabled);
    return selectedUser ? principalForUser(selectedUser, tenant) : undefined;
  }
  if (selectedRunningUserId && selectedRunningUserId !== dashboard.runningUserId) return undefined;
  if (!dashboard.runningUserId) return viewer;
  const user = platformStore.state.users.find((item) =>
    item.id === dashboard.runningUserId && item.tenantId === viewer.tenantId && !item.disabled);
  return user ? principalForUser(user, tenant) : undefined;
}
function dashboardRunningUserSelectionError(
  viewer: Principal,
  tenant: TenantData,
  dashboard: DashboardMetadata,
  selectedRunningUserId?: string
): string | undefined {
  if (!selectedRunningUserId) return undefined;
  if (!dashboard.allowViewerToSelectRunningUser) {
    return selectedRunningUserId === dashboard.runningUserId
      ? undefined
      : 'This dashboard does not allow choosing a running user';
  }
  if (!canSelectDashboardRunningUser(viewer, tenant, selectedRunningUserId)) {
    return 'You do not have permission to choose this running user';
  }
  const selectedUser = platformStore.state.users.find((item) =>
    item.id === selectedRunningUserId && item.tenantId === viewer.tenantId && !item.disabled);
  if (!selectedUser) return 'The selected running user must be active and belong to this tenant';
  return undefined;
}
function folderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  return folderAccessLevelFromFolders(tenant, tenant.dashboardFolders ?? [], folderId, userId);
}
function folderAccessLevelFromFolders(
  tenant: TenantData,
  folders: readonly DashboardFolder[],
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  const accessUser = tenant.accessControl.users.find((user) => user.id === userId);
  const roleId = accessUser?.roleId
    ?? tenant.accessControl.roles.find((role) => role.name === accessUser?.role)?.id;
  return dashboardFolderAccessLevel(folderId, folders, {
    userId,
    roleId,
    permissionSetGroupIds: accessUser?.permissionSetGroupIds ?? [],
    roles: tenant.accessControl.roles,
    publicGroups: tenant.accessControl.publicGroups,
    territories: tenant.dashboardTerritories ?? []
  });
}
function reportFolderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  const folder = tenant.reportFolders.find((item) => item.id === folderId);
  if (!folder) return null;
  const inheritedPublic = (() => {
    let current: ReportFolder | undefined = folder;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.visibility === 'All Users') return true;
      visited.add(current.id);
      current = current.parentFolderId
        ? tenant.reportFolders.find((item) => item.id === current!.parentFolderId)
        : undefined;
    }
    return false;
  })();
  const shared = folderAccessLevelFromFolders(tenant, tenant.reportFolders, folderId, userId);
  return inheritedPublic && (!shared || shared === 'Viewer') ? 'Viewer' : shared;
}
function reportFolderForUser(
  tenant: TenantData,
  folder: ReportFolder,
  userId: string,
  canManageAll: boolean
): ReportFolder & { accessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...folder,
    accessLevel: canManageAll
      ? 'Manager'
      : reportFolderAccessLevelForUser(tenant, folder.id, userId)
  };
}
function validateReportFolderReferences(
  tenant: TenantData,
  shares: ReportFolder['shares']
): string | null {
  return validateDashboardFolderReferences(tenant, shares);
}
function folderForUser(
  tenant: TenantData,
  folder: DashboardFolder,
  userId: string,
  canManageAll = false
): DashboardFolder & { accessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...folder,
    accessLevel: canManageAll ? 'Manager' : folderAccessLevelForUser(tenant, folder.id, userId)
  };
}
function dashboardForUser(
  tenant: TenantData,
  dashboard: DashboardMetadata,
  userId: string
): DashboardMetadata & { folderAccessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...dashboard,
    folderAccessLevel: folderAccessLevelForUser(tenant, dashboard.folderId, userId)
  };
}
function validateDashboardFolderReferences(
  tenant: TenantData,
  shares: DashboardFolder['shares']
): string | null {
  for (const share of shares) {
    const exists = share.targetType === 'User'
      ? tenant.accessControl.users.some((user) => user.id === share.targetId)
      : share.targetType === 'PublicGroup'
        ? tenant.accessControl.publicGroups.some((group) => group.id === share.targetId)
        : share.targetType === 'PermissionSetGroup'
          ? tenant.accessControl.permissionSetGroups.some((group) => group.id === share.targetId)
          : share.targetType === 'Territory'
            ? tenant.dashboardTerritories.some((territory) => territory.id === share.targetId)
            : tenant.accessControl.roles.some((role) => role.id === share.targetId);
    if (!exists) return `Folder share references unknown ${share.targetType} "${share.targetId}"`;
  }
  return null;
}
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
const registerFlowsPlatformEventRoutesContext = {
  get activeFlowDefinition() { return activeFlowDefinition; },
  get app() { return app; },
  get getPrincipal() { return getPrincipal; },
  get persistTenantRecords() { return persistTenantRecords; },
  get platformEventSchema() { return platformEventSchema; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get tenantData() { return tenantData; }
};
export type FlowsPlatformEventRoutesDependencies = typeof registerFlowsPlatformEventRoutesContext;
registerFlowsPlatformEventRoutes(registerFlowsPlatformEventRoutesContext);
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
const registerFlowsMetadataRoutesContext = {
  get app() { return app; },
  get automationSettingsSchema() { return automationSettingsSchema; },
  get defaultAutomationSettings() { return defaultAutomationSettings; },
  get getPrincipal() { return getPrincipal; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; }
};
export type FlowsMetadataRoutesDependencies = typeof registerFlowsMetadataRoutesContext;
registerFlowsMetadataRoutes(registerFlowsMetadataRoutesContext);
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
const registerFlowsEmailAlertRoutesContext = {
  get app() { return app; },
  get emailAlertRequestSchema() { return emailAlertRequestSchema; },
  get emailAlertSchema() { return emailAlertSchema; },
  get getPrincipal() { return getPrincipal; },
  get persistTenantRecords() { return persistTenantRecords; },
  get randomUUID() { return randomUUID; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get tenantData() { return tenantData; },
  get z() { return z; }
};
export type FlowsEmailAlertRoutesDependencies = typeof registerFlowsEmailAlertRoutesContext;
registerFlowsEmailAlertRoutes(registerFlowsEmailAlertRoutesContext);
const registerFlowDefinitionRoutesContext = {
  get activeFlowDefinition() { return activeFlowDefinition; },
  get app() { return app; },
  get flowSchema() { return flowSchema; },
  get flowVersionSnapshot() { return flowVersionSnapshot; },
  get formulaContextForUser() { return formulaContextForUser; },
  get getPrincipal() { return getPrincipal; },
  get persistState() { return persistState; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requireAnyPermission() { return requireAnyPermission; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get uniqueFlowHistory() { return uniqueFlowHistory; },
  get validateFlow() { return validateFlow; }
};
export type FlowDefinitionRoutesDependencies = typeof registerFlowDefinitionRoutesContext;
registerFlowDefinitionRoutes(registerFlowDefinitionRoutesContext);
// Reuse the same validated permission assignments for all object and field checks
// within a request, instead of repeatedly scanning profiles/sets for every cell.
type AuthGrantContext = {
  profile?: TenantData['accessControl']['profiles'][number];
  directSets: TenantData['accessControl']['permissionSets'];
  groups: Array<{
    group: TenantData['accessControl']['permissionSetGroups'][number];
    sets: TenantData['accessControl']['permissionSets'];
  }>;
};
const requestGrantCache = new WeakMap<Principal, WeakMap<TenantData, AuthGrantContext>>();
function authorizationGrants(principal: Principal, tenant: TenantData): AuthGrantContext | undefined {
  let tenantCache = requestGrantCache.get(principal);
  if (tenantCache?.has(tenant)) return tenantCache.get(tenant);
  const user = principalUser(principal);
  if (!user) return undefined;
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profiles = tenant.accessControl.profiles;
  const profile = profiles.find((item) => item.id ===
    (accessUser?.profileId ?? profileIdForRole(user.role, profiles)));
  const assignedSets = new Set(accessUser?.permissionSetIds ?? user.permissionSetIds);
  const directSets = tenant.accessControl.permissionSets.filter((set) => assignedSets.has(set.id));
  const groupIds = new Set(accessUser?.permissionSetGroupIds ?? user.permissionSetGroupIds);
  const groups = tenant.accessControl.permissionSetGroups
    .filter((group) => groupIds.has(group.id))
    .map((group) => ({
      group,
      sets: tenant.accessControl.permissionSets.filter((set) => group.permissionSetIds.includes(set.id))
    }));
  const resolved: AuthGrantContext = { profile, directSets, groups };
  if (!tenantCache) {
    tenantCache = new WeakMap();
    requestGrantCache.set(principal, tenantCache);
  }
  tenantCache.set(tenant, resolved);
  return resolved;
}
// Profile defaults preserve legacy tenant navigation. Explicit false hides an app/tab.
// Permission set grants are additive; group muting masks only that group's grant.
function canNavigate(principal: Principal, tenant: TenantData, type: 'app' | 'tab', key: string): boolean {
  const grants = authorizationGrants(principal, tenant);
  if (!grants) return false;
  const field = type === 'app' ? 'appPermissions' : 'tabPermissions';
  const mutedField = type === 'app' ? 'mutedAppPermissions' : 'mutedTabPermissions';
  const setting = grants.profile?.[field]?.[key];
  if (setting === true || (setting !== false && grants.profile?.navigationDefaultAccess !== 'Deny')) return true;
  if (grants.directSets.some((set) => set[field]?.[key] === true)) return true;
  return grants.groups.some(({ group, sets }) =>
    group[mutedField]?.[key] !== true && sets.some((set) => set[field]?.[key] === true));
}
function canOpenApp(principal: Principal, tenant: TenantData, appApiName: string): boolean {
  return canNavigate(principal, tenant, 'app', appApiName);
}
function canOpenTab(principal: Principal, tenant: TenantData, objectApiName: string): boolean {
  return canNavigate(principal, tenant, 'tab', objectApiName);
}
function hasObjectPermission(principal: Principal, tenant: TenantData, objectName: string, action: 'read' | 'create' | 'edit' | 'delete'): boolean {
  return grantedObjectPermission(principal, tenant.objects.find(object => object.apiName === objectName), authorizationGrants(principal, tenant), action);
}
function hasObjectWidePermission(principal: Principal, tenant: TenantData, objectName: string, flag: 'viewAll' | 'modifyAll'): boolean {
  const grants = authorizationGrants(principal, tenant);
  if (!grants) return false;
  const hasGrant = (permission?: ObjectPermission, muted?: Partial<ObjectPermission>) =>
    Boolean(permission?.[flag] && !muted?.[flag] && !muted?.read);
  if (hasGrant(grants.profile?.objectPermissions[objectName])) return true;
  if (grants.directSets.some((set) => hasGrant(set.objectPermissions[objectName]))) return true;
  return grants.groups.some(({ group, sets }) => sets.some((set) =>
    hasGrant(set.objectPermissions[objectName], group.mutedObjectPermissions[objectName])));
}
function hasRoleHierarchyAccess(principal: Principal, tenant: TenantData, ownerId: unknown): boolean {
  if (typeof ownerId !== 'string') return false;
  const viewer = tenant.accessControl.users.find((user) => user.id === principal.userId);
  const owner = tenant.accessControl.users.find((user) => user.id === ownerId);
  if (!viewer || !owner) return false;
  const viewerRoleId = viewer.roleId ?? roleIdForName(viewer.role, tenant.accessControl.roles);
  let parentRoleId = owner.roleId ?? roleIdForName(owner.role, tenant.accessControl.roles);
  const visited = new Set<string>();
  while (parentRoleId && !visited.has(parentRoleId)) {
    if (parentRoleId === viewerRoleId) return true;
    visited.add(parentRoleId);
    parentRoleId = tenant.accessControl.roles.find((role) => role.id === parentRoleId)?.parentRoleId ?? '';
  }
  return false;
}
function roleIsAtOrBelow(roleId: string, rootRoleId: string, roles: AccessRole[]): boolean {
  let currentRoleId: string | null | undefined = roleId;
  const visited = new Set<string>();
  while (currentRoleId && !visited.has(currentRoleId)) {
    if (currentRoleId === rootRoleId) return true;
    visited.add(currentRoleId);
    currentRoleId = roles.find((role) => role.id === currentRoleId)?.parentRoleId;
  }
  return false;
}
function publicGroupContainsUser(groupId: string, userId: string, tenant: TenantData, visited = new Set<string>()): boolean {
  if (visited.has(groupId)) return false;
  const group = tenant.accessControl.publicGroups.find((item) => item.id === groupId);
  if (!group) return false;
  visited.add(groupId);
  const member = tenant.accessControl.users.find((item) => item.id === userId);
  if (!member) return false;
  const roleId = member.roleId ?? roleIdForName(member.role, tenant.accessControl.roles);
  if (group.userIds.includes(userId)
    || group.roleIds.includes(roleId)
    || group.roleAndSubordinateIds.some((parentId) => roleIsAtOrBelow(roleId, parentId, tenant.accessControl.roles))) return true;
  return group.groupIds.some((nestedId) => publicGroupContainsUser(nestedId, userId, tenant, new Set(visited)));
}
function queueContainsUser(queue: RecordQueue, userId: string, tenant: TenantData): boolean {
  const member = tenant.accessControl.users.find((item) => item.id === userId);
  if (!member) return false;
  const roleId = member.roleId ?? roleIdForName(member.role, tenant.accessControl.roles);
  return queue.userIds.includes(userId)
    || queue.roleIds.includes(roleId)
    || queue.roleAndSubordinateIds.some((rootRoleId) => roleIsAtOrBelow(roleId, rootRoleId, tenant.accessControl.roles))
    || queue.publicGroupIds.some((groupId) => publicGroupContainsUser(groupId, userId, tenant));
}
function sharingRuleMatchesRecord(rule: SharingRule, record: RuntimeRecord): boolean {
  const conditions = rule.criteria.map((criterion) => {
    const value = record[criterion.fieldApiName];
    const expected = criterion.value;
    switch (criterion.operator) {
      case 'Equals': return String(value ?? '') === expected;
      case 'Not Equals': return String(value ?? '') !== expected;
      case 'Contains': return typeof value === 'string' && value.toLowerCase().includes(expected.toLowerCase());
      case 'Starts With': return typeof value === 'string' && value.toLowerCase().startsWith(expected.toLowerCase());
      case 'Is Null': return value === null || value === undefined || value === '';
      case 'Greater Than': return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > Number(expected);
      case 'Less Than': return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) < Number(expected);
    }
  });
  return rule.filterLogic === 'All' ? conditions.every(Boolean) : conditions.some(Boolean);
}
function sharingRuleGrantsUser(rule: SharingRule, recipientUserId: string, record: RuntimeRecord, tenant: TenantData): boolean {
  if (!rule.active) return false;
  if (rule.type === 'OwnerBased') {
    const owner = tenant.accessControl.users.find((item) => item.id === record.OwnerId);
    if (!owner) return false;
    const ownerRoleId = owner.roleId ?? roleIdForName(owner.role, tenant.accessControl.roles);
    if (!rule.ownerRoleIds.some((roleId) => roleIsAtOrBelow(ownerRoleId, roleId, tenant.accessControl.roles))) return false;
  } else if (!sharingRuleMatchesRecord(rule, record)) return false;

  const recipient = tenant.accessControl.users.find((item) => item.id === recipientUserId);
  if (!recipient) return false;
  const recipientRoleId = recipient.roleId ?? roleIdForName(recipient.role, tenant.accessControl.roles);
  if (rule.targetType === 'User') return rule.targetId === recipientUserId;
  if (rule.targetType === 'PublicGroup') return publicGroupContainsUser(rule.targetId, recipientUserId, tenant);
  if (rule.targetType === 'Role') return recipientRoleId === rule.targetId;
  return roleIsAtOrBelow(recipientRoleId, rule.targetId, tenant.accessControl.roles);
}
// Scope and cache record-share lookups by immutable tenant state snapshot.
// A sharing change replaces TenantData; an old index cannot authorize new data.
const recordShareIndexes = new WeakMap<TenantData, Map<string, TenantData['recordShares']>>();
function recordShareIndex(tenant: TenantData): Map<string, TenantData['recordShares']> {
  const existing = recordShareIndexes.get(tenant);
  if (existing) return existing;
  const index = new Map<string, TenantData['recordShares']>();
  for (const share of tenant.recordShares) {
    const key = JSON.stringify([share.objectApiName, share.recordId]);
    let list = index.get(key);
    if (!list) { list = []; index.set(key, list); }
    list.push(share);
  }
  recordShareIndexes.set(tenant, index);
  return index;
}
function hasRecordAccess(
  principal: Principal,
  tenant: TenantData,
  objectName: string,
  record: RuntimeRecord,
  accessLevel: 'Read' | 'Edit' | 'Delete',
  visited = new Set<string>()
): boolean {
  if (accessLevel !== 'Read' && !lockedRecordWriteAllowed(principal, tenant.objects.find(object => object.apiName === objectName), record)) return false;
  const recordKey = `${objectName}:${record.Id}:${accessLevel}`;
  if (visited.has(recordKey)) return false;
  visited.add(recordKey);
  const objectAction = accessLevel === 'Read' ? 'read' : accessLevel === 'Edit' ? 'edit' : 'delete';
  // WhatsApp channel permission is independent of object-wide grants, ownership and sharing.
  // Other Communication Records (API audit, email, SMS) keep existing RBAC semantics.
  if (objectName === communicationObjectApiName && isWhatsAppMessage(record) &&
      !canAccessChatterRecord(principal.tenantId, principal.userId, tenant, record, 'read')) return false;
  if (!hasObjectPermission(principal, tenant, objectName, objectAction)) return false;
  const advancedSettings = tenant.sharingSettings[objectName];
  const advancedUser = tenant.accessControl.users.find((user) => user.id === principal.userId);
  const advancedRules = advancedSettings?.restrictionRules ?? [];
  if (advancedRules.length || advancedUser?.userType === 'external') {
    const accountField = advancedSettings?.portalAccountField ?? 'AccountId';
    const recordAccountId = accountField === 'Id' ? record.Id : record[accountField];
    const decision = decideAdvancedRecordAccess({
      context: {
        tenantId: principal.tenantId, userId: principal.userId,
        objectApiName: objectName, operation: objectAction,
        userType: advancedUser?.userType === 'external' ? 'external' : 'internal',
        roleIds: advancedUser?.roleId ? [advancedUser.roleId] : [],
        objectPermission: true,
        externalAccessEnabled: advancedSettings?.portalEnabled === true,
        accountId: advancedUser?.externalAccountId
      },
      record: {
        ...record, tenantId: principal.tenantId,
        accountId: recordAccountId,
        portalVisible: advancedSettings?.portalEnabled === true
      },
      ordinaryAuthorized: true, rules: advancedRules
    });
    if (!decision.allowed) return false;
  }
  // Channel grants are a centrally enforced form of record sharing; they do not
  // override object permission checks or higher-priority restriction rules.
  if (objectName === communicationObjectApiName && isWhatsAppMessage(record)) {
    if (accessLevel === 'Delete') return false;
    return canAccessChatterRecord(principal.tenantId, principal.userId, tenant, record,
      accessLevel === 'Edit' ? 'assign' : 'read');
  }
  if (accessLevel === 'Read' && hasObjectWidePermission(principal, tenant, objectName, 'viewAll')) return true;
  if ((accessLevel === 'Edit' || accessLevel === 'Delete')
    && hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')) return true;
  if (accessLevel !== 'Delete') {
    const object = tenant.objects.find((item) => item.apiName === objectName);
    for (const field of object?.fields ?? []) {
      if (field.relationship?.type !== 'Master-Detail' || typeof record[field.apiName] !== 'string') continue;
      const parent = (tenant.records[field.relationship.targetObject] ?? []).find((item) => item.Id === record[field.apiName]);
      if (parent && hasRecordAccess(principal, tenant, field.relationship.targetObject, parent, accessLevel, new Set(visited))) return true;
    }
  }
  const isQueueMember = typeof record.OwnerId === 'string'
    && tenant.accessControl.queues.some((queue) =>
      queue.id === record.OwnerId && queue.supportedObjectApiNames.includes(objectName)
      && queueContainsUser(queue, principal.userId, tenant));
  const isOwner = record.OwnerId === principal.userId || isQueueMember;
  if (isOwner) return true;
  if (accessLevel === 'Delete') return false;
  const defaultAccess = tenant.sharingSettings[objectName]?.defaultAccess ?? 'Private';
  if (tenant.sharingSettings[objectName]?.grantAccessUsingHierarchies !== false
    && (accessLevel === 'Read' || defaultAccess === 'Public Read/Write')
    && hasRoleHierarchyAccess(principal, tenant, record.OwnerId)) return true;
  const share = (recordShareIndex(tenant).get(JSON.stringify([objectName, record.Id])) ?? []).find((item) =>
    item.userId === principal.userId
      || Boolean(item.groupId && publicGroupContainsUser(item.groupId, principal.userId, tenant)));
  if (share && (share.accessLevel === 'Edit' || accessLevel === 'Read')) return true;
  if (accessLevel === 'Read' && typeof record.TerritoryId === 'string'
    && tenant.dashboardTerritories.length) {
    const territorialGrant = resolveAdvancedRecordGrant({
      tenantId: principal.tenantId, userId: principal.userId,
      recordId: record.Id, recordTerritoryId: record.TerritoryId,
      operation: 'read',
      territoryEdges: tenant.dashboardTerritories.map((entry) => ({
        tenantId: principal.tenantId, id: entry.id, parentId: entry.parentTerritoryId
      })),
      territoryMemberships: tenant.dashboardTerritories.flatMap((entry) =>
        entry.userIds.map((userId) => ({
          tenantId: principal.tenantId, userId, territoryId: entry.id,
          accessLevel: 'read', includeSubordinates: true
        })))
    });
    if (territorialGrant.granted) return true;
  }
  if (tenant.accessControl.sharingRules.some((rule) =>
    rule.objectApiName === objectName
    && (rule.accessLevel === 'Edit' || accessLevel === 'Read')
    && sharingRuleGrantsUser(rule, principal.userId, record, tenant))) return true;
  return defaultAccess === 'Public Read/Write'
    || (defaultAccess === 'Public Read Only' && accessLevel === 'Read');
}
function hasFieldPermission(principal: Principal, tenant: TenantData, objectName: string, fieldName: string, action: 'read' | 'edit'): boolean {
  const grants = authorizationGrants(principal, tenant);
  if (!grants) return false;
  const key = `${objectName}.${fieldName}`;
  const grantsField = (
    fieldPermissions: Record<string, { read: boolean; edit: boolean }>,
    objectPermissions: Record<string, ObjectPermission>,
    muted?: Partial<ObjectPermission>
  ) => {
    const explicit = fieldPermissions[key];
    if (explicit) return explicit[action];
    const objectPermission = objectPermissions[objectName];
    return Boolean(objectPermission && (
      objectPermission[action] && !muted?.[action] && !muted?.read
      || objectPermission.modifyAll && !muted?.modifyAll && !muted?.read && !muted?.[action]
      || action === 'read' && objectPermission.viewAll && !muted?.viewAll && !muted?.read
    ));
  };
  if (grants.profile && grantsField(grants.profile.fieldPermissions, grants.profile.objectPermissions)) return true;
  if (grants.directSets.some((set) => grantsField(set.fieldPermissions, set.objectPermissions))) return true;
  return grants.groups.some(({ group, sets }) => {
    if (group.mutedFieldPermissions[key]?.[action]) return false;
    return sets.some((set) => grantsField(set.fieldPermissions, set.objectPermissions, group.mutedObjectPermissions[objectName]));
  });
}
function sanitizeRecordForRead(principal: Principal, tenant: TenantData, object: ObjectMetadata, record: RuntimeRecord): RuntimeRecord {
  const values: Record<string, unknown> = {};
  const systemFields = new Set(['Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 'SystemModstamp', 'RecordTypeId']);
  for (const [key, value] of Object.entries(record)) {
    if (systemFields.has(key) || hasFieldPermission(principal, tenant, object.apiName, key, 'read')) values[key] = value;
  }
  return values as RuntimeRecord;
}
function assertFieldEditPermissions(principal: Principal, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>): void {
  assertRecordFieldPermissions(principal, tenant, object, values, hasFieldPermission);
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
function validateFlowInputValues(flow: FlowMetadata, values: Record<string, unknown>): string | undefined {
  const inputResources = flow.resources.filter((resource) => resource.availableForInput);
  for (const [name, value] of Object.entries(values)) {
    const resource = inputResources.find((candidate) => candidate.name === name);
    if (!resource) return `Resource "${name}" is not available for input`;
    const dataType = resource.dataType.toLowerCase();
    const invalid = (): string => `Input "${resource.label}" must be a valid ${resource.dataType} value`;
    if (['number', 'currency', 'percent'].some((type) => dataType.startsWith(type))) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return invalid();
    } else if (['boolean', 'checkbox'].includes(dataType)) {
      if (typeof value !== 'boolean') return invalid();
    } else if (dataType === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
        || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) return invalid();
    } else if (dataType === 'date/time' || dataType === 'datetime') {
      if (typeof value !== 'string' || !isValidFlowDateTime(value)) return invalid();
    } else if (dataType === 'time') {
      if (typeof value !== 'string' || !isValidFlowTime(value)) return invalid();
    } else if (['text', 'string', 'email', 'phone', 'url', 'id', 'picklist', 'multi-select picklist'].includes(dataType)) {
      if (dataType === 'multi-select picklist'
        ? (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
        : typeof value !== 'string') return invalid();
    } else if (resource.type === 'Record') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();
    } else if (resource.type === 'Record Collection') {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
        return invalid();
      }
    } else {
      return `Input "${resource.label}" uses unsupported data type "${resource.dataType}"`;
    }
  }
  return undefined;
}
const registerFlowsExecutionRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get authoriseChatterFlow() { return authoriseChatterFlow; },
  get authoriseManualCoreFlow() { return authoriseManualCoreFlow; },
  get createFlowInterview() { return createFlowInterview; },
  get executeFlow() { return executeFlow; },
  get formulaContextForUser() { return formulaContextForUser; },
  get getPrincipal() { return getPrincipal; },
  get persistFlowFailure() { return persistFlowFailure; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get sanitizeChatterCallerInput() { return sanitizeChatterCallerInput; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get trustedChatterExecutionFlow() { return trustedChatterExecutionFlow; },
  get validateFlow() { return validateFlow; },
  get validateFlowInputValues() { return validateFlowInputValues; },
  get z() { return z; }
};
export type FlowsExecutionRoutesDependencies = typeof registerFlowsExecutionRoutesContext;
registerFlowsExecutionRoutes(registerFlowsExecutionRoutesContext);
const recordFlowDebugRequestSchema = z.object({
  event: z.enum(['created', 'updated', 'deleted']),
  record: z.record(z.unknown()),
  prior: z.record(z.unknown()).nullable().optional(),
  isClone: z.boolean().default(false)
}).strict();

// Salesforce-style record-trigger testing: run the saved Flow definition
// against a disposable tenant snapshot, with no committed record changes,
// scheduled jobs, notifications or external communications.
const registerFlowRecordDebugRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get app() { return app; },
  get asConfigRows() { return asConfigRows; },
  get executeFlow() { return executeFlow; },
  get flowConditionsMatch() { return flowConditionsMatch; },
  get flowVariablesForUser() { return flowVariablesForUser; },
  get formulaContextForUser() { return formulaContextForUser; },
  get getPrincipal() { return getPrincipal; },
  get hasFieldPermission() { return hasFieldPermission; },
  get hasObjectPermission() { return hasObjectPermission; },
  get hasRecordAccess() { return hasRecordAccess; },
  get randomUUID() { return randomUUID; },
  get recordFlowDebugRequestSchema() { return recordFlowDebugRequestSchema; },
  get requirePermission() { return requirePermission; },
  get routeParam() { return routeParam; },
  get runtimeRecordSchema() { return runtimeRecordSchema; },
  get tenantData() { return tenantData; },
  get validateFlow() { return validateFlow; }
};
export type FlowRecordDebugRoutesDependencies = typeof registerFlowRecordDebugRoutesContext;
registerFlowRecordDebugRoutes(registerFlowRecordDebugRoutesContext);

const registerFlowsInterviewRoutesContext = {
  get accessAuthentication() { return accessAuthentication; },
  get activeFlowDefinition() { return activeFlowDefinition; },
  get app() { return app; },
  get asConfigRows() { return asConfigRows; },
  get createFlowInterview() { return createFlowInterview; },
  get executeFlow() { return executeFlow; },
  get flowConditionsMatch() { return flowConditionsMatch; },
  get flowVariablesForUser() { return flowVariablesForUser; },
  get formulaContextForUser() { return formulaContextForUser; },
  get getPrincipal() { return getPrincipal; },
  get hasObjectPermission() { return hasObjectPermission; },
  get hasRecordAccess() { return hasRecordAccess; },
  get isSafeFlowRegex() { return isSafeFlowRegex; },
  get isValidFlowDateTime() { return isValidFlowDateTime; },
  get isValidFlowTime() { return isValidFlowTime; },
  get persistFlowFailure() { return persistFlowFailure; },
  get persistTenantRecords() { return persistTenantRecords; },
  get requirePermission() { return requirePermission; },
  get resolveFlowValue() { return resolveFlowValue; },
  get routeParam() { return routeParam; },
  get state() { return platformStore.state; },
  set state(next: PlatformState) { platformStore.state = next; },
  get tenantData() { return tenantData; },
  get z() { return z; }
};
export type FlowsInterviewRoutesDependencies = typeof registerFlowsInterviewRoutesContext;
registerFlowsInterviewRoutes(registerFlowsInterviewRoutesContext);

type LibraryComponentUsage = { tenantId: string; surface: 'page' | 'dashboard' | 'flow'; label: string };
function containsLibraryComponentReference(value: unknown, apiName: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsLibraryComponentReference(item, apiName));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    (/component(?:api)?name/i.test(key) && item === apiName)
    || containsLibraryComponentReference(item, apiName));
}
function findLibraryComponentUsages(platformState: PlatformState, apiName: string, ownerTenantId: string): LibraryComponentUsage[] {
  const usages: LibraryComponentUsage[] = [];
  for (const [tenantId, tenant] of Object.entries(platformState.tenants)) {
    if (tenantId !== ownerTenantId) continue;
    for (const page of tenant.pages) {
      if (page.components.some((component) => component.type === `Custom:${apiName}`
        || containsLibraryComponentReference(component.properties, apiName))) {
        usages.push({ tenantId, surface: 'page', label: page.label });
      }
    }
    for (const dashboard of tenant.dashboards) {
      if (dashboard.components.some((component) => component.customComponentApiName === apiName)) {
        usages.push({ tenantId, surface: 'dashboard', label: dashboard.label });
      }
    }
    for (const flow of tenant.flows) {
      if (containsLibraryComponentReference([
        flow.startConfig,
        flow.elements.map((element) => element.config),
        flow.resources,
        flow.versions
      ], apiName)) {
        usages.push({ tenantId, surface: 'flow', label: flow.label });
      }
    }
  }
  return usages;
}
function ownedComponentIndex(apiName: string, tenantId: string): number {
  return platformStore.state.libraryComponents.findIndex((component) =>
    component.apiName === apiName
    && libraryComponentEditable(component, tenantId, Object.keys(platformStore.state.tenants)));
}
function componentNameTaken(apiName: string, tenantId: string): boolean {
  return platformStore.state.libraryComponents.some((component) =>
    component.apiName.toLowerCase() === apiName.toLowerCase()
    && (component.trustedBundled === true
      || libraryComponentVisible(component, tenantId, Object.keys(platformStore.state.tenants))));
}
function usageBlockerDetails(usages: LibraryComponentUsage[], tenantId: string) {
  const own = usages.filter((usage) => usage.tenantId === tenantId)
    .map(({ surface, label }) => `${surface} "${label}"`);
  const otherTenantCount = new Set(usages.filter((usage) => usage.tenantId !== tenantId).map((usage) => usage.tenantId)).size;
  if (otherTenantCount) own.push(`references in ${otherTenantCount} other tenant${otherTenantCount === 1 ? '' : 's'}`);
  return own;
}

let bundledComponentSync: Promise<void> | null = null;
function syncBundledLibraryComponents(): Promise<void> {
  if (bundledComponentSync) return bundledComponentSync;
  bundledComponentSync = (async () => {
    const manifestPath = resolve(bundledCustomComponentsPath, 'manifest.json');
    const manifest = z.array(z.object({
      apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      label: z.string().trim().min(1).max(80),
      description: z.string().max(500),
      surfaces: z.array(z.enum(['page', 'dashboard', 'flow', 'platform'])).min(1),
      scope: z.literal('platform-system').optional(),
      resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
      jsx: z.string().min(1),
      css: z.string().min(1),
      version: z.number().int().min(1).default(1)
    })).parse(JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))).concat(installableAppCatalog.coreComponents.map((c: any)=>({apiName:c.apiName,label:c.label,description:c.description,surfaces:c.surfaces,resize:c.resize,jsx:c.jsxFile,css:c.cssFile,version:c.version})));
    const imported: LibraryComponent[] = [];
    const trustedUpgrades = new Map<string, LibraryComponent>();
    for (const entry of manifest) {
      const existingBundled = platformStore.state.libraryComponents.find((component) =>
      component.apiName.toLowerCase() === entry.apiName.toLowerCase()
      && component.trustedBundled === true);
    const legacyCandidate = platformStore.state.libraryComponents.find((component) =>
      component.apiName.toLowerCase() === entry.apiName.toLowerCase()
      && component.trustedBundled !== true);

      const jsxPath = resolve(bundledCustomComponentsPath, entry.jsx);
      const cssPath = resolve(bundledCustomComponentsPath, entry.css);
      const jsxRelativePath = relative(bundledCustomComponentsPath, jsxPath);
      const cssRelativePath = relative(bundledCustomComponentsPath, cssPath);
      if (jsxRelativePath.startsWith('..') || cssRelativePath.startsWith('..')
        || isAbsolute(jsxRelativePath) || isAbsolute(cssRelativePath)) {
        throw new Error(`Component "${entry.apiName}" contains a source path outside the bundled component directory`);
      }
      const jsxSource = readFileSync(jsxPath, 'utf8');
      if (entry.surfaces.includes('platform') && entry.scope !== 'platform-system')
        throw Error('Untrusted platform component descriptor');
      if (existingBundled && existingBundled.jsxSource === jsxSource
        && existingBundled.cssSource === readFileSync(cssPath, 'utf8')
        && existingBundled.scope === entry.scope
        && entry.surfaces.every(surface=>existingBundled.surfaces.includes(surface))
        && (existingBundled.version ?? 1) >= entry.version) continue;
      const cssSource = readFileSync(cssPath, 'utf8');
      if (legacyCandidate) {
        const decision = bundledLegacyMigrationDecision(legacyCandidate, entry.apiName, jsxSource, cssSource);
        if (decision === 'preserve') {
          // A tenant-owned or unknown component must not abort the entire library.
          console.warn('Preserved untrusted bundled-component name collision:', entry.apiName);
          continue;
        }
      }
      const input = libraryComponentInputSchema.parse({
        apiName: entry.apiName,
        label: entry.label,
        description: entry.description,
        surfaces: entry.surfaces.filter(surface=>surface!=='platform'),
        resize: entry.resize,
        jsxSource,
        cssSource, propertyDefinitions: installableAppCatalog.coreComponents.find((c: {apiName:string}) => c.apiName === entry.apiName)?.propertyDefinitions
      });
      const compiled = await transform(input.jsxSource, {
        loader: 'tsx',
        format: 'cjs',
        target: 'es2020',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        sourcefile: `${input.apiName}.tsx`
      });
      if (!hasDefaultComponentExport(compiled.code)) {
        throw new Error(`Bundled component "${input.apiName}" must export a default React component`);
      }
      if (/\brequire\s*\(/.test(compiled.code)) {
        throw new Error(`Bundled component "${input.apiName}" cannot import external modules`);
      }
      const version = entry.version;
      const registered: LibraryComponent = {
        ...input,
        compiledJs: compiled.code,
        scopedCss: scopeLibraryCss(input.cssSource, input.apiName),
        version,
        updatedAt: new Date().toISOString(),
        status: 'Published', publishedVersion: version, revisions: [],
        trustedBundled: true, scope: entry.scope, surfaces: entry.surfaces
      };
      if (legacyCandidate || existingBundled) {
        trustedUpgrades.set(entry.apiName.toLowerCase(), {
          ...(existingBundled ?? {}),
          ...(legacyCandidate ?? {}), ...registered,
          version: Math.max(version, legacyCandidate?.version ?? existingBundled?.version ?? 1),
          publishedVersion: Math.max(version, legacyCandidate?.publishedVersion ?? existingBundled?.publishedVersion ?? 1)
        });
      } else imported.push(registered);
    }
    if (imported.length || trustedUpgrades.size) {
      const nextState = { ...platformStore.state, libraryComponents: [
        ...platformStore.state.libraryComponents.map((item) =>
          trustedUpgrades.get(item.apiName.toLowerCase()) ?? item),
        ...imported
      ] };
      persistState(nextState);
      platformStore.state = nextState;
    }
  })().catch((error: unknown) => {
    bundledComponentSync = null;
    throw error;
  });
  return bundledComponentSync;
}

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
registerFlowElementRoutes(app, requirePermission);

type FlowRuntimeContext = {
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
type FlowDebugTraceEntry = { flowApiName: string; elementId: number; type: string; label: string };
type RecordEvent = 'created' | 'updated' | 'deleted';
const namedCredentialPayloadSchema = z.object({
  username: z.string().optional(),
  secret: z.string().optional(),
  oauthToken: z.object({accessToken:z.string(),refreshToken:z.string().optional(),
    tokenType:z.literal('Bearer'),expiresAtMs:z.number()}).optional()
});

function asConfigRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function isValidFlowTime(value: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match !== null;
}

function flowVariablesForUser(
  tenant: TenantData,
  userId: string,
  interviewGuid: string = randomUUID(),
  interviewStartTime?: string
): Record<string, unknown> {
  const now = new Date();
  return {
    CurrentDate: formulaLocalDate(now, formulaContextForUser(tenant, userId).timeZone),
    CurrentDateTime: now.toISOString(),
    TriggeringUserId: userId,
    InterviewGuid: interviewGuid,
    InterviewStartTime: interviewStartTime ?? now.toISOString(),
    CompanySettings: {
      StandardVatRate: tenant.currencySettings.standardVatRate,
      CorporateCurrency: tenant.currencySettings.corporateCurrency
    }
  };
}

function flowInterviewIdentity(context: FlowRuntimeContext): { interviewGuid: string; interviewStartTime: string } {
  const interviewGuid = context.flowVariables?.InterviewGuid;
  const interviewStartTime = context.flowVariables?.InterviewStartTime;
  if (typeof interviewGuid !== 'string' || typeof interviewStartTime !== 'string') {
    throw new Error('Flow interview identity is unavailable.');
  }
  return { interviewGuid, interviewStartTime };
}

function resolveFlowResource(name: string, context: FlowRuntimeContext): unknown {
  const resource = context.resourceDefinitions?.find((item) => item.name === name);
  if (!resource) return context.variables[name];
  if (resource.type === 'Text Template') {
    return String(resource.value ?? '').replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
      const resolved = resolveFlowValue(`{${reference}}`, context);
      return resolved === undefined || resolved === null ? '' : String(resolved);
    });
  }
  if (resource.type !== 'Formula') return context.variables[name];
  if (context.formulaStack.has(name)) throw new Error(`Flow formula dependency cycle detected at "${name}".`);
  if (typeof resource.value !== 'string' || !resource.value.trim()) throw new Error(`Flow formula "${resource.label}" has no expression.`);
  context.formulaStack.add(name);
  try {
    const resolveReference = (reference: string) => {
      if (context.record && Object.hasOwn(context.record, reference)) return context.record[reference];
      if (context.prior && Object.hasOwn(context.prior, reference)) return context.prior[reference];
      return resolveFlowValue(`{${reference}}`, context);
    };
    const value = evaluateFormula(resource.value, resolveReference, {
      ...(context.recordEvent ? { isNew: context.recordEvent === 'created' } : {}),
        isClone: context.isClone,
      hasPrior: context.prior !== undefined,
      timeZone: context.timeZone,
      locale: context.locale,
      currentUser: context.currentUser,
      flowVariables: { ...context.flowVariables, ...context.flow },
      corporateCurrency: context.corporateCurrency,
      currencyRates: context.currencyRates,
      userCurrencyIsoCode: context.userCurrencyIsoCode,
      currencyIsoCode: typeof context.record?.CurrencyIsoCode === 'string'
        ? context.record.CurrencyIsoCode
        : context.corporateCurrency,
      resolvePriorField: (reference) => {
        if (context.prior && Object.hasOwn(context.prior, reference)) return context.prior[reference];
        return resolveFlowValue(`{${reference}}`, context);
      }
    });
    switch (resource.dataType) {
      case 'Number':
      case 'Currency':
      case 'Percent': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Flow formula "${resource.label}" did not produce a finite number.`);
        return numeric;
      }
      case 'Boolean':
      case 'Checkbox':
        if (typeof value !== 'boolean') throw new Error(`Flow formula "${resource.label}" must produce a Boolean value.`);
        return value;
      case 'Date': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Flow formula "${resource.label}" did not produce a valid date.`);
        return date.toISOString().slice(0, 10);
      }
      case 'Date/Time': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Flow formula "${resource.label}" did not produce a valid date and time.`);
        return date.toISOString();
      }
      case 'Time':
        if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(value)) {
          throw new Error(`Flow formula "${resource.label}" did not produce a valid time.`);
        }
        return value;
      case 'Text':
        if (value !== null && typeof value !== 'string') {
          throw new Error(`Flow formula "${resource.label}" must produce text.`);
        }
        return value ?? '';
      default:
        return value;
    }
  } finally {
    context.formulaStack.delete(name);
  }
}

function resolveFlowValue(value: unknown, context: FlowRuntimeContext): unknown {
  if (typeof value !== 'string') return value;
  const reference = /^\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}?$/.exec(value.trim());
  const path = reference?.[1];
  if (!path) return value;
  const [root, ...segments] = path.split('.');
  let result: unknown = root === '$Record' ? context.record
    : root === '$Prior' || root === '$Record__Prior' ? context.prior
      : root === '$User' ? context.currentUser ?? { Id: context.currentUserId }
        : root === '$Flow' ? { ...context.flowVariables, ...context.flow }
          : root === '$CompanySettings' ? context.flowVariables?.CompanySettings
          : resolveFlowResource(root, context);
  for (const segment of segments) {
    if (!result || typeof result !== 'object') return undefined;
    result = (result as Record<string, unknown>)[segment];
  }
  return result;
}

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

function resolveFlowTemplate(value: string, context: FlowRuntimeContext): string {
  return value.replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
    const resolved = resolveFlowValue(`{${reference}}`, context);
    if (resolved === undefined) throw new Error(`Flow template references an unavailable value "${reference}".`);
    return resolved === null ? '' : typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
  });
}

/** OAuth transport is deliberately server-side and DNS-pinned to public HTTPS hosts. */
async function safeOAuthTokenRequest(endpoint: URL, params: URLSearchParams): Promise<{ status:number; body:unknown }> {
  assertCalloutHostAllowed(endpoint.hostname, process.env.METADRIVE_PAUSED_CALLOUT_HOSTS);
  validatedOAuthUrl(endpoint.toString());
  const encoded=params.toString();
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];
    let size=0;
    const request=httpsRequest(endpoint,{
      method:'POST',timeout:15000,maxHeaderSize:8192,
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':String(Buffer.byteLength(encoded)),'Accept':'application/json'},
      lookup:(hostname,options,callback)=>{
        void lookup(hostname,{all:true,verbatim:true}).then(addresses=>{
          if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) {
            callback(new Error('OAuth token host failed public DNS validation'),'',0);return;
          }
          const first=addresses[0];
          if(options && typeof options==='object' && 'all' in options && options.all) callback(null,[first]);
          else callback(null,first.address,first.family);
        }).catch(()=>callback(new Error('OAuth token DNS unavailable'),'',0));
      }
    }, incoming=>{
      incoming.on('data',(chunk:Buffer|string)=>{
        const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=data.length;
        if(size>65536){request.destroy(new Error('OAuth response exceeded limit'));return;}
        chunks.push(data);
      });
      incoming.on('end',()=>{
        try {resolve({status:incoming.statusCode??0,body:JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown});}
        catch {reject(new Error('OAuth endpoint returned invalid JSON'));}
      });
      incoming.on('error',()=>reject(new Error('OAuth token response failed')));
    });
    request.on('timeout',()=>request.destroy(new Error('OAuth token request timed out')));
    request.on('error',()=>reject(new Error('OAuth token transport failed')));
    request.end(encoded);
  });
}

function oauthCredentialVault(tenantId:string, credentialId:string):OAuthVault {
  return {
    load:async scope=>{
      if(scope.tenantId!==tenantId || scope.credentialId!==credentialId) throw new Error('OAuth tenant scope mismatch.');
      const credential=tenantData(tenantId)?.namedCredentials.find(row=>row.id===credentialId);
      if(!credential || !['OAuth Client Credentials','OAuth Authorization Code'].includes(credential.authType)
        || credential.enabled===false) throw new Error('OAuth credential unavailable.');
      return openCredentialPayload(tenantId,credential).oauthToken??null;
    },
    save:async (scope,token)=>{
      if(scope.tenantId!==tenantId || scope.credentialId!==credentialId) throw new Error('OAuth tenant scope mismatch.');
      const currentTenant=tenantData(tenantId);
      const current=currentTenant?.namedCredentials.find(row=>row.id===credentialId);
      if(!currentTenant || !current || !['OAuth Client Credentials','OAuth Authorization Code'].includes(current.authType)
        || current.enabled===false) throw new Error('OAuth credential changed during refresh.');
      const payload=openCredentialPayload(tenantId,current);
      const updated=namedCredentialSchema.parse({...current,
        ...sealCredentialPayload(tenantId,current.id,{...payload,oauthToken:token}),
        updatedAt:new Date().toISOString()});
      persistTenantRecords(tenantId,{...currentTenant,namedCredentials:currentTenant.namedCredentials.map(row=>row.id===current.id?updated:row)});
    }
  };
}
function oauthChallengeStore():SqlOAuthChallengeStore {
  const sql=getRouteAliasPool();
  if(!sql) throw new Error('OAuth authorization requires the configured PostgreSQL database.');
  const cipher:ChallengeCipher={
    seal:(tenantId,digest,verifier)=>sealCredentialPayload(tenantId,'oauth-pkce:'+digest,{secret:verifier}),
    open:(tenantId,digest,sealed)=>{
      const synthetic={id:'oauth-pkce:'+digest,name:'OAuth challenge',...sealed} as StoredNamedCredential;
      return openCredentialPayload(tenantId,synthetic).secret??'';
    }
  };
  return new SqlOAuthChallengeStore(sql,cipher);
}
async function oauthAccessTokenForCredential(tenantId:string,credential:StoredNamedCredential):Promise<string> {
  if (!['OAuth Client Credentials','OAuth Authorization Code'].includes(credential.authType) || credential.protocol!=='HTTPS')
    throw new Error('OAuth credential is not configured for HTTPS.');
  const configuration=credential.configuration??{};
  if (!configuration.ClientId || !configuration.OAuthEndpoint) throw new Error('OAuth ClientId/OAuthEndpoint missing.');
  const clientSecret=openCredentialPayload(tenantId,credential).secret;
  if(!clientSecret)throw new Error('OAuth client secret is not configured.');
  return getOAuthAccessToken({tenantId,credentialId:credential.id},{
    tokenUrl:configuration.OAuthEndpoint,clientId:configuration.ClientId,clientSecret,
    scope:configuration.Scope,grantType:credential.authType==='OAuth Client Credentials'?'client_credentials':'authorization_code'
  },oauthCredentialVault(tenantId,credential.id),safeOAuthTokenRequest);
}

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

function compareFlowValue(left: unknown, operator: string, right: unknown): boolean {
  const normalizedLeft = typeof left === 'string' ? left.toLowerCase() : left;
  const normalizedRight = typeof right === 'string' ? right.toLowerCase() : right;
  switch (operator) {
    case 'Equals': return normalizedLeft === normalizedRight || String(left ?? '') === String(right ?? '');
    case 'Not Equals':
    case 'Not Equal To': return !(normalizedLeft === normalizedRight || String(left ?? '') === String(right ?? ''));
    case 'Is Null': return left === null || left === undefined || left === '';
    case 'Is Not Null': return left !== null && left !== undefined && left !== '';
    case 'Greater Than': return Number(left) > Number(right);
    case 'Less Than': return Number(left) < Number(right);
    case 'Contains': return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
    case 'Starts With': return String(left ?? '').toLocaleLowerCase().startsWith(String(right ?? '').toLocaleLowerCase());
    default: throw new Error(`Unsupported flow condition operator "${operator}".`);
  }
}

function flowConditionsMatch(conditions: Array<Record<string, unknown>>, source: Record<string, unknown>, context: FlowRuntimeContext, logicOverride?: unknown): boolean {
  if (!conditions.length) return true;
  const checks = conditions.map((condition) => {
    const field = typeof condition.field === 'string' ? condition.field : '';
    if (!field) throw new Error('A flow condition is missing its field.');
    const left = /^\{!?[A-Za-z_$][A-Za-z0-9_.$]*\}$/.test(field) ? resolveFlowValue(field, context) : source[field];
    return compareFlowValue(left, String(condition.operator ?? 'Equals'), resolveFlowValue(condition.value, context));
  });
  const rawLogic = String(logicOverride ?? conditions[0].logic ?? 'All');
  const logic = rawLogic.toLowerCase();
  if (logic === 'any') return checks.some(Boolean);
  if (logic === 'all') return checks.every(Boolean);
  return evaluateCustomConditionLogic(rawLogic, checks);
}

function flowFieldValues(config: Record<string, unknown>, context: FlowRuntimeContext): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of asConfigRows(config.fieldValues)) {
    if (typeof entry.field !== 'string' || !entry.field) throw new Error('A flow field assignment is missing its field.');
    values[entry.field] = resolveFlowValue(entry.value, context);
  }
  if (!Object.keys(values).length && typeof config.field === 'string' && config.field) {
    values[config.field] = resolveFlowValue(config.value, context);
  }
  return values;
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

type FlowExecutionResult =
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
  const createdAt = result.interviewStartTime;
  const tenantId = platformStore.state.users.find(user => user.id === userId)?.tenantId;
  const idleMinutes = (tenantId ? tenantData(tenantId)?.automationSettings.conversationIdleMinutes : undefined)
    ?? defaultAutomationSettings.conversationIdleMinutes;
  const conversationExpiry = ['screen', 'wait'].includes(result.kind) && typeof result.record?.Conversation_Key__c === 'string' && result.record.Conversation_Key__c
    ? new Date(Date.parse(createdAt) + idleMinutes * 60_000).toISOString()
    : null;
  const expiresAt = conversationExpiry ?? (result.kind === 'screen'
    ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    : (result.kind === 'scheduled' || result.kind === 'async' || result.kind === 'orchestration')
      ? '9999-12-31T23:59:59.999Z'
      : new Date(Date.parse(result.waitUntil) + 7 * 24 * 60 * 60 * 1000).toISOString());
  return {
    id: result.interviewGuid,
    flowApiName: flow.apiName,
    versionNumber: flow.status === 'Active' ? flow.activeVersion ?? flow.versionNumber : flow.versionNumber,
    userId,
    allowDraft: flow.status === 'Draft',
    kind: result.kind,
    recordEvent: result.recordEvent ?? null,
    isClone: result.isClone ?? false,
    screenElementId: result.kind === 'screen' ? result.screen.id : result.kind === 'orchestration' ? result.stage.id : null,
    waitUntil: result.kind === 'screen' ? null : result.waitUntil,
    nextElementId: result.nextElementId,
    variables: result.variables,
    record: result.record ?? null,
    prior: result.prior ?? null,
    createdAt,
    expiresAt,
    history: [],
    retryAt: null,
    attempts: 0
  };
}

function flowRetryDelayMs(attempt: number): number {
  return retryDelayMs(attempt);
}

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
  const runningUser = platformStore.state.users.find((user) => user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
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

function flowNeedsRollbackSnapshot(
  flow: FlowMetadata,
  knownFlows: FlowMetadata[],
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(flow.apiName)) return false;
  visited.add(flow.apiName);
  return flow.elements.some(element => {
    if (element.type === 'Roll Back Records') return true;
    if (element.type !== 'Subflow') return false;
    const target = element.config.flowApiName;
    if (typeof target !== 'string') return false;
    const subflow = knownFlows.find(candidate => candidate.apiName === target);
    return Boolean(subflow && flowNeedsRollbackSnapshot(subflow, knownFlows, visited));
  });
}

async function executeFlow(...args: Parameters<typeof executeFlowImplementation>): Promise<FlowExecutionResult> {
  return withFlowRecordWriteContext(args[0].apiName, args[2], args[3], () => executeFlowImplementation(...args));
}
const executeFlowImplementation = createFlowExecutionEngine({ activeFlowDefinition, appendFieldHistory, applyConnectorLifecycle, applyFlowCollectionAssignment, applyRecordDefaults, asConfigRows, assertConnectorLifecycleAccess, assertFieldEditPermissions, assertFlowRuntimeAdmission, calculateFormulaFields, createFlowInterview, deleteRecordCascade, disableOnConnectorUninstall, effectivePermissions, executeFlow, flowConditionsMatch, flowFieldValues, flowInterviewIdentity, flowLocalDateTimeToInstant, flowNeedsRollbackSnapshot, flowPackageAdmission, flowVariablesForUser, formulaContextForUser, hasFieldPermission, hasObjectPermission, hasRecordAccess, hasRecordTypeAccessForUser, isValidFlowDateTime, mapHttpCalloutResponse, normalizeFlowRecordAssignments, normalizeRuntimeValues, numericFieldValueError, parseSubflowMappings, performCustomNotification, performEmailAlert, performHttpCallout, performPostToChatter, performSendEmail, performSubmitForApproval, prepareFlowCreateCollection, principalForUser, resolveFlowValue, runBeforeSaveRecordTriggeredFlows, runRecordTriggeredFlows, sanitizeRecordForRead, scheduledPathTimestamp, stampRecordAuditFields, validateRelationshipReparenting, validateRuntimeRecord, platformStore, installableAppCatalog, randomUUID, dashboardTimeZoneSchema, platformEventMessageSchema });


async function runRecordTriggeredFlows(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  event: RecordEvent,
  record: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  isClone = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Record-triggered flow recursion exceeded the 10-level limit.');
  for (const flow of orderedRecordTriggeredFlows(tenant, objectName, 'after-save')) {
    const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
    if (event === 'deleted') {
      tenant.interviews = tenant.interviews.filter((interview) =>
        interview.kind !== 'scheduled'
        || interview.flowApiName !== flow.apiName
        || interview.record?.Id !== (prior ?? record).Id);
    }
    if (trigger !== event && trigger !== 'created-or-updated') continue;
    const conditions = asConfigRows(flow.startConfig.entryConditions);
    const source = event === 'deleted' ? prior ?? record : record;
    const context: FlowRuntimeContext = {
      record: source, prior, recordEvent: event, isClone, resourceDefinitions: flow.resources,
      formulaStack: new Set(), variables: {}, currentUserId: userId, debug: debugExecution, debugTrace,
      ...formulaContextForUser(tenant, userId), flowVariables: flowVariablesForUser(tenant, userId)
    };
    const matchesCurrentRecord = flowConditionsMatch(conditions, source, context, flow.startConfig.conditionLogic);
    const transitionAlreadyMatched = event === 'updated'
      && flow.startConfig.updatedRecordBehavior === 'transition'
      && prior
      && flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic);
    if (!transitionAlreadyMatched && !matchesCurrentRecord) {
      tenant.interviews = tenant.interviews.filter((interview) =>
        interview.kind !== 'scheduled'
        || interview.flowApiName !== flow.apiName
        || interview.record?.Id !== source.Id);
    }
    if (!matchesCurrentRecord || transitionAlreadyMatched) continue;
    try {
      const result = await executeFlow(
        flow, tenant, tenantId, userId, {}, source, prior, 0, undefined, depth, event, isClone,
        flowInterviewIdentity(context), false, debugExecution, debugTrace, rollbackSnapshot
      );
      if (result.status === 'waiting') {
        if (result.kind !== 'wait' && result.kind !== 'orchestration') throw new Error(`Record-triggered flow "${flow.label}" cannot pause for screen input.`);
        tenant.interviews.push(createFlowInterview(flow, userId, result));
      }
    } catch (error) {
      if (!debugExecution) persistFlowFailure(tenantId, flow, 'Record-Triggered', error, userId);
      throw error;
    }
  }
}

async function runBeforeSaveRecordTriggeredFlows(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  event: 'created' | 'updated',
  record: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  isClone = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Before-save flow recursion exceeded the 10-level limit.');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) throw new Error(`Before-save flow trigger object "${objectName}" does not exist.`);
  for (const flow of orderedRecordTriggeredFlows(tenant, objectName, 'before-save')) {
    const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
    if (trigger !== event && trigger !== 'created-or-updated') continue;
    const conditions = asConfigRows(flow.startConfig.entryConditions);
    const context: FlowRuntimeContext = {
      record, prior, recordEvent: event, isClone, resourceDefinitions: flow.resources, formulaStack: new Set(),
      debug: debugExecution, debugTrace,
      variables: {}, currentUserId: userId, ...formulaContextForUser(tenant, userId),
      flowVariables: flowVariablesForUser(tenant, userId)
    };
    if (!flowConditionsMatch(conditions, record, context, flow.startConfig.conditionLogic)) continue;
    if (event === 'updated' && flow.startConfig.updatedRecordBehavior === 'transition' && prior
      && flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic)) continue;
    try {
      const result = await executeFlow(
        flow, tenant, tenantId, userId, {}, record, prior, 0, undefined, depth, event, isClone,
        flowInterviewIdentity(context), false, debugExecution, debugTrace, rollbackSnapshot
      );
      if (result.status !== 'completed') {
        throw new Error(`Before-save flow "${flow.label}" cannot pause for user or scheduled input.`);
      }
      Object.assign(record, calculateFormulaFields(object, record, { ...formulaContextForUser(tenant, userId), isClone }));
    } catch (error) {
      if (!debugExecution) persistFlowFailure(tenantId, flow, 'Record-Triggered', error, userId);
      throw error;
    }
  }
}

function orderedRecordTriggeredFlows(
  tenant: TenantData,
  objectName: string,
  runWhen: 'before-save' | 'after-save'
): FlowMetadata[] {
  return tenant.flows
    .map(activeFlowDefinition)
    .filter((flow): flow is FlowMetadata => flow !== undefined
      && flow.flowType === 'Record-Triggered Flow'
      && flow.triggerObject === objectName
      && String(flow.startConfig.runWhen ?? 'after-save') === runWhen)
    .sort((left, right) => {
      const leftOrder = typeof left.startConfig.triggerOrder === 'number' ? left.startConfig.triggerOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.startConfig.triggerOrder === 'number' ? right.startConfig.triggerOrder : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.apiName.localeCompare(right.apiName);
    });
}

const { scheduledOccurrence, nextScheduledOccurrence } = createFlowScheduleCalculations(flowLocalDateTimeToInstant, dashboardLocalParts);

async function resumeDueFlowInterviews(now: Date): Promise<void> {
  for (const [tenantId, tenant] of Object.entries(platformStore.state.tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    for (const interview of [...tenant.interviews]) {
      if (!['wait', 'scheduled', 'async'].includes(interview.kind) || !interview.waitUntil) continue;
      const settings = tenant.automationSettings ?? defaultAutomationSettings;
      const conversationKey = interview.record?.Conversation_Key__c;
      const conversational = interview.kind !== 'async' && typeof conversationKey === 'string' && Boolean(conversationKey);
      const owningFlow = conversational ? tenant.flows.find(flow => flow.apiName === interview.flowApiName) : undefined;
      const sessionRecords = owningFlow?.triggerObject ? (tenant.records[owningFlow.triggerObject] ?? []) : [];
      const lastActivityAt = sessionRecords.reduce((latest, item) => {
        if (item.Conversation_Key__c !== conversationKey || item.Direction__c !== 'Incoming') return latest;
        const timestamp = typeof item.CreatedDate === 'string' ? Date.parse(item.CreatedDate) : NaN;
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, Date.parse(interview.createdAt));
      const expired = conversational
        ? expiredConversationInterview(interview.record, new Date(lastActivityAt).toISOString(), now.getTime(), settings.conversationIdleMinutes)
        : Date.parse(interview.expiresAt) <= now.getTime();
      if (expired || (!settings.autoRetryFailedFlows && interview.attempts > 0)
        || (interview.attempts > 0 && retryBudgetExhausted(interview.attempts, settings.maxRetryAttempts))) {
        const current = tenantData(tenantId);
        if (current) persistTenantRecords(tenantId, {
          ...current, interviews: current.interviews.filter(item => item.id !== interview.id)
        });
        continue;
      }
      if (Date.parse(interview.waitUntil) > now.getTime()
        || (interview.retryAt && Date.parse(interview.retryAt) > now.getTime())) continue;
      const currentTenant = tenantData(tenantId);
      if (!currentTenant) continue;
      const savedFlow = currentTenant.flows.find((item) => item.apiName === interview.flowApiName);
      const activeInterviewFlow = activeFlowDefinition(savedFlow);
      const archivedAsyncVersion = interview.kind === 'async' && savedFlow?.activeVersion !== null
        ? savedFlow?.versions.find((version) => version.versionNumber === interview.versionNumber)
        : undefined;
      const flow = interview.allowDraft && savedFlow?.status === 'Draft'
        && savedFlow.versionNumber === interview.versionNumber
        ? savedFlow
        : activeInterviewFlow?.versionNumber === interview.versionNumber
          ? activeInterviewFlow
          : savedFlow && archivedAsyncVersion
            ? { ...savedFlow, ...archivedAsyncVersion, status: 'Active' as const,
              activeVersion: archivedAsyncVersion.versionNumber, versionNumber: archivedAsyncVersion.versionNumber }
            : undefined;
      const working = structuredClone(currentTenant);
      try {
        if (interview.kind === 'wait' && !conversational && Date.parse(interview.expiresAt) <= now.getTime()) {
          throw new Error('Wait interview expired before it could resume.');
        }
        if (!flow) throw new Error('Wait interview flow version is no longer active.');
        if (interview.nextElementId === null) {
          working.interviews = working.interviews.filter((item) => item.id !== interview.id);
          persistTenantRecords(tenantId, working);
          continue;
        }
        const result = await executeFlow(flow, working, tenantId, interview.userId, {}, interview.record ?? undefined, interview.prior ?? undefined, 0, {
          startAt: interview.nextElementId,
          variables: interview.variables,
          interviewGuid: interview.id,
          interviewStartTime: interview.createdAt
        }, 0, interview.recordEvent ?? undefined, interview.isClone, undefined, interview.allowDraft);
        if (result.status === 'waiting') {
          const updated = createFlowInterview(flow, interview.userId, result);
          working.interviews = working.interviews.map((item) => item.id === interview.id ? updated : item);
        } else {
          working.interviews = working.interviews.filter((item) => item.id !== interview.id);
        }
        persistTenantRecords(tenantId, working);
      } catch (error) {
        console.error(`Wait interview "${interview.id}" failed: ${error instanceof Error ? error.message : String(error)}`);
        const failedTenant = structuredClone(tenantData(tenantId) ?? currentTenant);
        const failedInterview = failedTenant.interviews.find((item) => item.id === interview.id);
        const expired = Date.parse(interview.expiresAt) <= now.getTime();
        if (expired || !settings.autoRetryFailedFlows
          || retryBudgetExhausted((failedInterview?.attempts ?? 0) + 1, settings.maxRetryAttempts)) {
          failedTenant.interviews = failedTenant.interviews.filter((item) => item.id !== interview.id);
        } else if (failedInterview) {
          failedInterview.attempts += 1;
          failedInterview.retryAt = new Date(now.getTime() + flowRetryDelayMs(failedInterview.attempts)).toISOString();
        }
        failedTenant.flowLogs.push(createFlowFailureLog(
          flow ?? { apiName: interview.flowApiName, label: interview.flowApiName },
          interview.kind === 'scheduled' ? 'Scheduled Path' : interview.kind === 'async' ? 'Async Path' : 'Wait Interview',
          error,
          interview.userId
        ));
        persistTenantRecords(tenantId, failedTenant);
      }
    }
  }
}

async function executeDueScheduledFlows(now = new Date()): Promise<void> {
  await resumeDueFlowInterviews(now);
  for (const [tenantId, tenant] of Object.entries(platformStore.state.tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    for (const candidate of [...tenant.flows]) {
      const currentTenant = tenantData(tenantId);
      if (!currentTenant) continue;
      const flow = activeFlowDefinition(candidate);
      if (!flow || flow.flowType !== 'Schedule-Triggered Flow' || !flow.triggerObject) continue;
      const runKey = `${flow.apiName}@${flow.activeVersion ?? flow.versionNumber}`;
      const latestOccurrence = scheduledOccurrence(flow, now);
      const pendingRetry = currentTenant.scheduleRetries[runKey];
      const settings = currentTenant.automationSettings ?? defaultAutomationSettings;
      const autoRetry = settings.autoRetryFailedFlows;
      if (pendingRetry && (!autoRetry
        || retryBudgetExhausted(pendingRetry.attempts, settings.maxRetryAttempts))) {
        const updated = structuredClone(currentTenant);
        updated.scheduleRuns[runKey] = pendingRetry.occurrenceAt;
        delete updated.scheduleRetries[runKey];
        persistTenantRecords(tenantId, updated);
        continue;
      }
      const lastRun = currentTenant.scheduleRuns[runKey];
      const pendingOccurrence = pendingRetry && (!lastRun || Date.parse(pendingRetry.occurrenceAt) > Date.parse(lastRun))
        ? new Date(pendingRetry.occurrenceAt)
        : undefined;
      const occurrence = pendingOccurrence ?? (lastRun
        ? nextScheduledOccurrence(flow, new Date(lastRun), now)
        : latestOccurrence);
      if (pendingRetry && occurrence?.toISOString() === pendingRetry.occurrenceAt
        && Date.parse(pendingRetry.retryAt) > now.getTime()) continue;
      if (!occurrence || (currentTenant.scheduleRuns[runKey] && Date.parse(currentTenant.scheduleRuns[runKey]) >= occurrence.getTime())) continue;
      const working = structuredClone(currentTenant);
      try {
        const objectName = flow.triggerObject;
        const conditions = asConfigRows(flow.startConfig.entryConditions);
        const candidates = working.records[objectName] ?? [];
        if (candidates.length > 2000) throw new Error(`Scheduled flow "${flow.label}" exceeded the 2,000-record execution limit.`);
        for (const record of candidates) {
          const scheduledUserId = platformStore.state.users.find((user) => user.tenantId === tenantId && !user.disabled)?.id ?? 'scheduled-system';
          const context: FlowRuntimeContext = {
            record,
            resourceDefinitions: flow.resources,
            formulaStack: new Set(),
            variables: {},
            currentUserId: scheduledUserId,
            ...formulaContextForUser(working, scheduledUserId),
            flowVariables: flowVariablesForUser(working, scheduledUserId)
          };
          if (flowConditionsMatch(conditions, record, context, flow.startConfig.conditionLogic)) {
            const result = await executeFlow(flow, working, tenantId, context.currentUserId, {}, record, undefined, 0, undefined, 0, undefined, false, flowInterviewIdentity(context));
            if (result.status === 'waiting') {
              if (result.kind !== 'wait') throw new Error('Scheduled flows cannot pause for screen input.');
              working.interviews.push(createFlowInterview(flow, context.currentUserId, result));
            }
          }
        }
        working.scheduleRuns[runKey] = occurrence.toISOString();
        delete working.scheduleRetries[runKey];
        persistTenantRecords(tenantId, working);
      } catch (error) {
        console.error(`Scheduled flow "${flow.apiName}" failed for tenant "${tenantId}": ${error instanceof Error ? error.message : String(error)}`);
        const failedTenant = structuredClone(tenantData(tenantId) ?? currentTenant);
        const attempts = (pendingRetry?.occurrenceAt === occurrence.toISOString() ? pendingRetry.attempts : 0) + 1;
        if (autoRetry && !retryBudgetExhausted(attempts, settings.maxRetryAttempts)) {
          failedTenant.scheduleRetries[runKey] = {
            occurrenceAt: occurrence.toISOString(),
            attempts,
            retryAt: new Date(now.getTime() + flowRetryDelayMs(attempts)).toISOString()
          };
        } else {
          // Mark the failed occurrence handled; a later scheduled occurrence may still run.
          failedTenant.scheduleRuns[runKey] = occurrence.toISOString();
          delete failedTenant.scheduleRetries[runKey];
        }
        failedTenant.flowLogs.push(createFlowFailureLog(flow, 'Scheduled', error, null));
        persistTenantRecords(tenantId, failedTenant);
      }
    }
  }
}

function platformEventFlowMatches(
  flow: FlowMetadata,
  tenant: TenantData,
  userId: string,
  payload: RuntimeRecord
): boolean {
  const context: FlowRuntimeContext = {
    record: payload,
    triggerObjectName: flow.triggerObject ?? undefined,
    currentUserId: userId,
    resourceDefinitions: flow.resources,
    formulaStack: new Set(),
    variables: Object.fromEntries(flow.resources.map((resource) => [resource.name, resource.value])),
    flowVariables: flowVariablesForUser(tenant, userId),
    ...formulaContextForUser(tenant, userId)
  };
  return flowConditionsMatch(
    asConfigRows(flow.startConfig.entryConditions),
    payload,
    context,
    flow.startConfig.conditionLogic
  );
}

async function deliverPendingPlatformEvents(now = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  for (const tenantId of Object.keys(platformStore.state.tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    const snapshot = tenantData(tenantId);
    if (!snapshot) continue;
    const dueMessages = snapshot.platformEventMessages.filter((message) =>
      !message.processedAt && !message.deadLettered
      && (!message.retryAt || Date.parse(message.retryAt) <= now.getTime()));
    for (const queuedMessage of dueMessages) {
      let currentTenant = tenantData(tenantId);
      let message = currentTenant?.platformEventMessages.find((item) => item.id === queuedMessage.id);
      if (!currentTenant || !message || message.processedAt || message.deadLettered) continue;
      const settings = currentTenant.automationSettings ?? defaultAutomationSettings;
      const autoRetry = settings.autoRetryFailedFlows;
      if ((!autoRetry && message.attempts > 0)
        || (message.attempts > 0 && retryBudgetExhausted(message.attempts, settings.maxRetryAttempts))) {
        persistTenantRecords(tenantId, {
          ...currentTenant,
          platformEventMessages: currentTenant.platformEventMessages.map(item =>
            item.id === message?.id ? { ...item, deadLettered: true, retryAt: null } : item)
        });
        continue;
      }
      const subscriberTenant = currentTenant;
      const eventMessage = message;
      const subscribers = subscriberTenant.flows.map(activeFlowDefinition)
        .filter((flow): flow is FlowMetadata => flow !== undefined
        && flow.flowType === 'Platform Event-Triggered Flow'
        && flow.triggerObject === eventMessage.eventApiName
        && platformEventFlowMatches(flow, subscriberTenant, eventMessage.publishedBy, eventMessage.payload as RuntimeRecord));
      if (!subscribers.length) {
        persistTenantRecords(tenantId, {
          ...currentTenant,
          platformEventMessages: currentTenant.platformEventMessages.map((item) => item.id === message?.id
            ? { ...item, processedAt: nowIso, retryAt: null, lastError: '' }
            : item)
        });
        continue;
      }
      for (const subscriber of subscribers) {
        currentTenant = tenantData(tenantId);
        message = currentTenant?.platformEventMessages.find((item) => item.id === queuedMessage.id);
        if (!currentTenant || !message || message.deliveredFlowApiNames.includes(subscriber.apiName)) continue;
        try {
          const working = structuredClone(currentTenant);
          const activeFlow = activeFlowDefinition(working.flows.find((flow) => flow.apiName === subscriber.apiName
            && flow.flowType === 'Platform Event-Triggered Flow'));
          if (!activeFlow) continue;
          const result = await executeFlow(
            activeFlow, working, tenantId, message.publishedBy, {},
            message.payload as RuntimeRecord
          );
          if (result.status === 'waiting') {
            if (result.kind === 'screen') throw new Error('Platform Event-Triggered Flows cannot pause for screen input.');
            working.interviews.push(createFlowInterview(activeFlow, message.publishedBy, result));
          }
          working.platformEventMessages = working.platformEventMessages.map((item) => item.id === message?.id
            ? {
              ...item,
              deliveredFlowApiNames: [...item.deliveredFlowApiNames, activeFlow.apiName],
              attempts: 0,
              retryAt: null,
              lastError: ''
            }
            : item);
          const updatedMessage = working.platformEventMessages.find((item) => item.id === message?.id);
          const allDelivered = subscribers.every((flow) =>
            updatedMessage?.deliveredFlowApiNames.includes(flow.apiName));
          if (allDelivered && updatedMessage) {
            working.platformEventMessages = working.platformEventMessages.map((item) => item.id === updatedMessage.id
              ? { ...item, processedAt: nowIso }
              : item);
          }
          persistTenantRecords(tenantId, working);
        } catch (error) {
          const failedTenant = tenantData(tenantId);
          if (!failedTenant) continue;
          const failedMessage = failedTenant.platformEventMessages.find((item) => item.id === queuedMessage.id);
          if (!failedMessage) continue;
          const attempts = failedMessage.attempts + 1;
          const deadLettered = !autoRetry || retryBudgetExhausted(attempts, settings.maxRetryAttempts);
          const retryAt = deadLettered ? null : new Date(now.getTime() + flowRetryDelayMs(attempts)).toISOString();
          const failure = error instanceof Error ? error.message : String(error);
          persistTenantRecords(tenantId, {
            ...failedTenant,
            platformEventMessages: failedTenant.platformEventMessages.map((item) => item.id === failedMessage.id
              ? { ...item, attempts, retryAt, lastError: failure.slice(0, 1000), deadLettered }
              : item),
            flowLogs: [...failedTenant.flowLogs, createFlowFailureLog(subscriber, 'Platform Event', failure, failedMessage.publishedBy)]
          });
          break;
        }
      }
    }
  }
}

function validateFlow(
  flow: FlowMetadata,
  objects: ObjectMetadata[] = [],
  credentials: StoredNamedCredential[] = [],
  integrationConnections: IntegrationConnection[] = [],
  connectorDefinitions: ConnectorDefinition[] = [],
  emailAlerts: EmailAlert[] = [],
  formulaContext: { timeZone?: string; locale?: string; corporateCurrency?: string; currencyRates?: Record<string, number> } = {},
  allFlows: FlowMetadata[] = [],
  approvalProcesses: ApprovalProcess[] = [],
  platformEvents: z.infer<typeof platformEventSchema>[] = [],
  tenantId = ''
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const starts = flow.elements.filter((element) => element.type === 'Start');
  if (starts.length !== 1) errors.push('A flow must have exactly one Start element.');
  else if (flow.elements[0]?.id !== starts[0].id) errors.push('Move the Start element to the beginning of the flow.');
  const requiresObject = ['Record-Triggered Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow'].includes(flow.flowType);
  if (flow.flowType === 'Flow Orchestration' && !flow.elements.some((element) => element.type === 'Orchestration Stage')) {
    errors.push('Flow Orchestration must contain at least one Orchestration Stage.');
  }
  if (requiresObject && !flow.triggerObject) errors.push('Select an object for the flow trigger.');
  if (!requiresObject && flow.triggerObject) errors.push('Only triggered flows can select a trigger object.');
  const eventTriggered = flow.flowType === 'Platform Event-Triggered Flow';
  if (eventTriggered && flow.triggerObject && !platformEvents.some((event) => event.apiName === flow.triggerObject)) {
    errors.push(`Platform event "${flow.triggerObject}" does not exist.`);
  } else if (flow.triggerObject && !eventTriggered && !objects.some((object) => object.apiName === flow.triggerObject)) {
    errors.push(`Trigger object "${flow.triggerObject}" does not exist.`);
  }
  if (flow.flowType === 'Record-Triggered Flow') {
    if (!['created', 'updated', 'created-or-updated', 'deleted'].includes(String(flow.startConfig.trigger ?? 'created-or-updated'))) {
      errors.push('Record-triggered flow trigger must be created, updated, created-or-updated, or deleted.');
    }
    if (!['before-save', 'after-save'].includes(String(flow.startConfig.runWhen ?? 'after-save'))) {
      errors.push('Record-triggered flow optimization must be before-save or after-save.');
    }
    if (flow.startConfig.runWhen === 'before-save' && flow.startConfig.trigger === 'deleted') {
      errors.push('Before-save record-triggered flows cannot run when a record is deleted.');
    }
    if (flow.startConfig.updatedRecordBehavior !== undefined
      && !['every-time', 'transition'].includes(String(flow.startConfig.updatedRecordBehavior))) {
      errors.push('Updated-record behavior must be every-time or transition.');
    }
    const triggerOrder = flow.startConfig.triggerOrder;
    if (triggerOrder !== undefined
      && (!Number.isInteger(triggerOrder) || Number(triggerOrder) < 1 || Number(triggerOrder) > 2000)) {
      errors.push('Record-triggered flow trigger order must be an integer from 1 through 2000.');
    }
  }
  if (flow.flowType === 'Schedule-Triggered Flow' && (!flow.startConfig.startDate || !flow.startConfig.startTime || !flow.startConfig.frequency)) {
    errors.push('Configure a start date, start time, and frequency for the schedule.');
  }
  if (flow.flowType === 'Schedule-Triggered Flow') {
    const startDate = String(flow.startConfig.startDate ?? '');
    const startTime = String(flow.startConfig.startTime ?? '');
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
    if (!dateMatch || !timeMatch) {
      errors.push('The schedule start date or time is invalid.');
    } else {
      const [year, month, day] = dateMatch.slice(1).map(Number);
      const civilDate = new Date(Date.UTC(year, month - 1, day));
      if (civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1 || civilDate.getUTCDate() !== day) {
        errors.push('The schedule start date or time is invalid.');
      } else {
        const timeZone = String(flow.startConfig.timeZone ?? 'UTC');
        if (!dashboardTimeZoneSchema.safeParse(timeZone).success) {
          errors.push('The schedule time zone must be a valid IANA time zone.');
        } else {
          const [hour, minute] = timeMatch.slice(1).map(Number);
          if (!flowLocalDateTimeToInstant(civilDate, hour, minute, timeZone)) {
            errors.push(`The schedule start time does not exist in time zone "${timeZone}" because of a daylight-saving transition.`);
          }
        }
      }
    }
  }
  if (flow.flowType === 'Schedule-Triggered Flow' && flow.startConfig.frequency && !['Once', 'Daily', 'Weekly'].includes(String(flow.startConfig.frequency))) {
    errors.push('Schedule frequency must be Once, Daily, or Weekly.');
  }
  const triggerObject = objects.find((object) => object.apiName === flow.triggerObject);
  const triggerPlatformEvent = platformEvents.find((event) => event.apiName === flow.triggerObject);
  const validateConditions = (conditions: unknown, object: { apiName: string; fields: Array<{ apiName: string }> } | undefined, elementLabel: string) => {
    for (const condition of asConfigRows(conditions)) {
      const fieldName = typeof condition.field === 'string' ? condition.field : '';
      const resourceReference = /^\{!?([A-Za-z_$][A-Za-z0-9_.$]*)\}$/.exec(fieldName);
      if (!fieldName) errors.push(`A condition on "${elementLabel}" is missing its field.`);
      else if (!resourceReference && fieldName !== 'Id' && object && !object.fields.some((field) => field.apiName === fieldName)) errors.push(`Field "${fieldName}" on "${elementLabel}" does not exist on "${object.apiName}".`);
      const operator = String(condition.operator ?? 'Equals');
      if (!['Equals', 'Not Equals', 'Not Equal To', 'Is Null', 'Is Not Null', 'Greater Than', 'Less Than', 'Contains', 'Starts With'].includes(operator)) {
        errors.push(`Condition operator "${operator}" on "${elementLabel}" is not supported.`);
      }
      if (resourceReference) {
        const rootName = resourceReference[1].split('.')[0];
        if (!['$Record', '$Prior', '$Record__Prior', '$User', '$Flow'].includes(rootName)
          && !flow.resources.some((resource) => resource.name === rootName)) {
          errors.push(`Resource "${rootName}" on "${elementLabel}" does not exist.`);
        }
      }
    }
  };
  const validateConditionLogic = (logic: unknown, elementLabel: string, conditionCount = 0) => {
    if (logic === undefined || ['All', 'Any'].includes(String(logic))) return;
    try {
      evaluateCustomConditionLogic(String(logic), Array.from({ length: conditionCount }, () => false));
    } catch (error) {
      errors.push(`Condition logic on "${elementLabel}" is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  for (const connector of flow.connectors) {
    if (connector.kind === 'async') {
      const source = flow.elements.find((element) => element.id === connector.from);
      if (flow.flowType !== 'Record-Triggered Flow' || source?.type !== 'Start') {
        errors.push(`Async path "${connector.id}" must start at a record-triggered flow's Start element.`);
      }
      if (flow.startConfig.runWhen === 'before-save') {
        errors.push(`Async path "${connector.id}" requires an after-save flow.`);
      }
      if (flow.startConfig.trigger === 'deleted') {
        errors.push(`Async path "${connector.id}" cannot be used with a delete trigger.`);
      }
      if (connector.scheduledPath) errors.push(`Async path "${connector.id}" cannot define scheduled-path settings.`);
    } else if (connector.kind === 'scheduled') {
      const source = flow.elements.find((element) => element.id === connector.from);
      if (flow.flowType !== 'Record-Triggered Flow' || source?.type !== 'Start') {
        errors.push(`Scheduled path "${connector.id}" must start at a record-triggered flow's Start element.`);
      }
      if (flow.startConfig.runWhen === 'before-save') {
        errors.push(`Scheduled path "${connector.id}" is only available for after-save flows.`);
      }
      if (flow.startConfig.trigger === 'deleted') {
        errors.push(`Scheduled path "${connector.id}" cannot be used with a delete trigger.`);
      }
      const scheduledPath = connector.scheduledPath;
      if (!scheduledPath) {
        errors.push(`Scheduled path "${connector.id}" requires a time source field and offset.`);
      } else {
        const timeSource = triggerObject?.fields.find((field) => field.apiName === scheduledPath.timeSourceFieldApiName);
        if (!timeSource || !['Date', 'DateTime'].includes(timeSource.dataType)) {
          errors.push(`Scheduled path "${connector.id}" requires a Date or DateTime field on "${flow.triggerObject ?? 'the trigger object'}".`);
        }
      }
    } else if (connector.scheduledPath) {
      errors.push(`Connector "${connector.id}" can only define scheduled-path settings when its type is scheduled.`);
    }
    if (connector.kind === 'fault' && flow.elements.find((element) => element.id === connector.from)?.type === 'Start') {
      errors.push(`Fault connector "${connector.id}" cannot originate from Start.`);
    }
  }
  if (flow.connectors.filter((connector) => connector.kind === 'async').length > 1) {
    errors.push('A record-triggered flow may have only one asynchronous path.');
  }
  const faultConnectorSources = new Set(flow.connectors.filter((connector) => connector.kind === 'fault').map((connector) => connector.from));
  for (const sourceId of faultConnectorSources) {
    if (flow.connectors.filter((connector) => connector.from === sourceId && connector.kind === 'fault').length > 1) {
      errors.push(`Element "${flow.elements.find((element) => element.id === sourceId)?.label ?? sourceId}" can have only one fault connector.`);
    }
  }
  for (const resource of flow.resources) {
    if (resource.availableForInput && !['Variable', 'Record', 'Record Collection'].includes(resource.type)) {
      errors.push(`${resource.type} resource "${resource.label}" cannot be available for input.`);
    }
    if (resource.availableForInput && resource.type === 'Variable') {
      const dataType = resource.dataType.toLowerCase();
      const supportedInputType = ['number', 'currency', 'percent'].some((type) => dataType.startsWith(type))
        || ['boolean', 'checkbox', 'date', 'date/time', 'datetime', 'time', 'text', 'string', 'email', 'phone', 'url', 'id', 'picklist', 'multi-select picklist'].includes(dataType);
      if (!supportedInputType) {
        errors.push(`Input variable "${resource.label}" uses unsupported data type "${resource.dataType}".`);
      }
    }
    if (resource.type !== 'Formula') continue;
    if (resource.availableForInput) errors.push(`Formula resource "${resource.label}" cannot be available for input.`);
    if (typeof resource.value !== 'string' || !resource.value.trim()) {
      errors.push(`Formula resource "${resource.label}" requires an expression.`);
      continue;
    }
    try {
      const syntax = validateFlowFormulaSyntax(resource.value);
      // A formula that references a live record, variable or global cannot be
      // executed against fake null inputs during activation. For a constant
      // expression preserve eager value/type checks from the runtime evaluator.
      if (!syntax.hasReferences) evaluateFormula(resource.value, () => null, {
        isNew: false, hasPrior: true, resolvePriorField: () => null,
        timeZone: formulaContext.timeZone,
        locale: formulaContext.locale,
        corporateCurrency: formulaContext.corporateCurrency,
        currencyRates: formulaContext.currencyRates
      });
    } catch (error) {
      errors.push(`Formula resource "${resource.label}" is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  validateConditionLogic(flow.startConfig.conditionLogic, 'Start', asConfigRows(flow.startConfig.entryConditions).length);
  validateConditions(flow.startConfig.entryConditions, triggerObject ?? triggerPlatformEvent, 'Start');
  const elementIds = new Set(flow.elements.map((element) => element.id));
  const adjacency = new Map<number, number[]>();
  for (const connector of flow.connectors) {
    if (!elementIds.has(connector.from) || !elementIds.has(connector.to)) errors.push(`Connector ${connector.id} references a missing element.`);
    if (flow.elements.find((element) => element.id === connector.to)?.type === 'Start') errors.push(`Connector ${connector.id} cannot point to the Start element.`);
    adjacency.set(connector.from, [...(adjacency.get(connector.from) ?? []), connector.to]);
  }
  const reachable = new Set<number>();
  const pending = starts.length === 1 ? [starts[0].id] : [];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined) continue;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(adjacency.get(id) ?? []));
  }
  for (const element of flow.elements) {
    if (element.type !== 'Start' && !reachable.has(element.id)) warnings.push(`Element "${element.label}" cannot be reached from Start.`);
  }
  if (flow.elements.length > 1 && flow.connectors.length === 0) warnings.push('Flow has multiple elements but no connectors.');
  for (const element of flow.elements) {
    if (!['Start', 'End', 'Assignment', 'Decision', 'Loop', 'Collection Filter', 'Collection Sort', 'Transform', 'Get Records', 'Create Records', 'Update Records', 'Delete Records', 'Roll Back Records', 'Publish Platform Event', 'Subflow', 'Screen', 'Wait', 'Action', 'HTTP Callout', 'Orchestration Stage'].includes(element.type)) {
      errors.push(`Flow element type "${element.type}" is not supported.`);
    }
    if (element.type === 'Create Records') {
      const recordSource = element.config.recordSource ?? 'fields';
      if (!['fields', 'collection'].includes(String(recordSource))) {
        errors.push(`Create Records "${element.label}" has an unsupported record source.`);
      }
      if (recordSource === 'collection') {
        const objectName = typeof element.config.object === 'string' ? element.config.object : '';
        const collectionName = typeof element.config.sourceCollection === 'string'
          ? element.config.sourceCollection : '';
        if (!flow.resources.some((resource) => resource.name === collectionName
          && resource.type === 'Record Collection' && resource.isCollection && resource.dataType === objectName)) {
          errors.push(`Create Records "${element.label}" requires a Record Collection of the selected object.`);
        }
        if (asConfigRows(element.config.fieldValues).length
          || (typeof element.config.field === 'string' && element.config.field)) {
          errors.push(`Create Records "${element.label}" cannot mix collection input with individual field assignments.`);
        }
        const outputName = typeof element.config.outputCollection === 'string'
          ? element.config.outputCollection : '';
        if (outputName && !flow.resources.some((resource) => resource.name === outputName
          && resource.type === 'Record Collection' && resource.isCollection
          && resource.dataType === objectName && resource.name !== collectionName)) {
          errors.push(`Create Records "${element.label}" requires a different writable output Record Collection of the same object.`);
        }
      }
    }
    // Validate literal picklist writes against Object Manager metadata before activation.
    if (element.type === 'Create Records' || element.type === 'Update Records') {
      const targetObject = objects.find((object) => object.apiName === element.config.object);
      for (const assignment of asConfigRows(element.config.fieldValues)) {
        const fieldName = typeof assignment.field === 'string' ? assignment.field : '';
        const field = targetObject?.fields.find((candidate) => candidate.apiName === fieldName);
        const value = assignment.value;
        if (field?.dataType === 'Picklist' && Array.isArray(field.picklistValues)
          && field.picklistValues.length > 0 && typeof value === 'string'
          && !value.includes('{!') && !value.startsWith('$')
          && !field.picklistValues.includes(value)) {
          errors.push(`"${element.label}" sets "${fieldName}" to inactive picklist value "${value}" on "${targetObject?.apiName}".`);
        }
      }
    }
    if (element.type === 'Publish Platform Event') {
      const eventApiName = typeof element.config.eventApiName === 'string' ? element.config.eventApiName : '';
      const event = platformEvents.find((candidate) => candidate.apiName === eventApiName);
      if (!event) errors.push(`Publish Platform Event "${element.label}" requires a valid platform event.`);
      const fieldValues = asConfigRows(element.config.fieldValues);
      const fieldNames = fieldValues.map((item) => typeof item.field === 'string' ? item.field : '');
      if (new Set(fieldNames).size !== fieldNames.length) {
        errors.push(`Publish Platform Event "${element.label}" cannot assign the same event field more than once.`);
      }
      for (const fieldName of fieldNames) {
        if (!event?.fields.some((field) => field.apiName === fieldName)) {
          errors.push(`Publish Platform Event "${element.label}" references unknown field "${fieldName}".`);
        }
      }
      if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save') {
        errors.push(`Publish Platform Event "${element.label}" is not available in before-save record-triggered flows.`);
      }
    }
    if (flow.flowType === 'Platform Event-Triggered Flow' && element.type === 'Screen') {
      errors.push(`Screen element "${element.label}" cannot be used in Platform Event-Triggered Flows.`);
    }
    if (element.type === 'Roll Back Records' && !['Screen Flow', 'Autolaunched Flow'].includes(flow.flowType)) {
      errors.push(`Roll Back Records element "${element.label}" is only available in Screen and Autolaunched Flows.`);
    }
    if (element.type === 'Screen' && flow.flowType !== 'Screen Flow') errors.push(`Screen element "${element.label}" is only supported in Screen Flows.`);
    if (element.type === 'Screen') {
      if (element.config.layout !== undefined && !['One Column', 'Two Columns'].includes(String(element.config.layout))) {
        errors.push(`Screen "${element.label}" layout must be One Column or Two Columns.`);
      }
      const outcomes = asConfigRows(element.config.outcomes);
      const labels = outcomes.map((outcome) => typeof outcome.label === 'string' ? outcome.label.trim() : '');
      const names = outcomes.map((outcome) => typeof outcome.name === 'string' ? outcome.name.trim() : '');
      const connectors = flow.connectors.filter((connector) => connector.from === element.id && connector.kind !== 'fault');
      if (outcomes.some((outcome) => typeof outcome.label !== 'string' || !outcome.label.trim())) {
        errors.push(`Screen "${element.label}" outcomes must have labels.`);
      }
      if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length
        || new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
        errors.push(`Screen "${element.label}" outcome labels and API names must be unique.`);
      }
      const routeKeys = new Set<string>();
      for (const connector of connectors) {
        if (!outcomes.length) {
          if (connectors.length > 1) errors.push(`Screen "${element.label}" has multiple paths but no configured outcomes.`);
          continue;
        }
        if (!connector.label) {
          if (connectors.length > 1) errors.push(`Screen "${element.label}" has multiple paths but a connector is missing its outcome label.`);
          continue;
        }
        const key = connector.label.toLowerCase();
        if (!outcomes.some((outcome) =>
          String(outcome.label ?? '').toLowerCase() === key || String(outcome.name ?? '').toLowerCase() === key)) {
          errors.push(`Screen connector "${connector.id}" does not match an outcome on "${element.label}".`);
        }
        if (routeKeys.has(key)) errors.push(`Screen "${element.label}" has more than one connector for outcome "${connector.label}".`);
        routeKeys.add(key);
      }
      for (const outcome of outcomes) {
        const label = String(outcome.label ?? '').trim().toLowerCase();
        const name = String(outcome.name ?? '').trim().toLowerCase();
        const matchingConnectors = connectors.filter((connector) => {
          const connectorLabel = connector.label.trim().toLowerCase();
          return connectorLabel && (connectorLabel === label || connectorLabel === name);
        });
        const implicitDefaultPath = outcomes.length === 1 && connectors.length === 1
          && !connectors[0].label && String(outcome.name ?? '').toLowerCase() === 'default';
        if (!implicitDefaultPath && matchingConnectors.length !== 1) {
          errors.push(`Screen "${element.label}" outcome "${String(outcome.label ?? outcome.name ?? '')}" must have exactly one connector.`);
        }
      }
      const fields = asConfigRows(element.config.fields);
      const displayFields = fields.filter((field) => ['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
      for (const field of displayFields) {
        if (field.type === 'Display Text' && (typeof field.text !== 'string' || !field.text.trim())) {
          errors.push(`Display Text component "${String(field.label ?? '')}" on "${element.label}" requires text content.`);
        }
        if (field.type === 'Display Image') {
          const imageUrl = typeof field.imageUrl === 'string' ? field.imageUrl.trim() : '';
          let validHttpsImage = false;
          try {
            const imageAddress = new URL(imageUrl);
            validHttpsImage = imageAddress.protocol === 'https:'
              && Boolean(imageAddress.hostname)
              && !imageAddress.username
              && !imageAddress.password;
          } catch {
            validHttpsImage = false;
          }
          if (!validHttpsImage) errors.push(`Display Image component "${String(field.label ?? '')}" on "${element.label}" requires an HTTPS image URL.`);
          if (typeof field.imageAltText !== 'string' || !field.imageAltText.trim()) {
            errors.push(`Display Image component "${String(field.label ?? '')}" on "${element.label}" requires alternative text.`);
          }
        }
        if (field.type === 'Section') {
          if (typeof field.label !== 'string' || !field.label.trim()) {
            errors.push(`Section component on "${element.label}" requires a label.`);
          }
          if (field.description !== undefined
            && (typeof field.description !== 'string' || field.description.length > 255)) {
            errors.push(`Description on Section component "${String(field.label ?? '')}" must be no longer than 255 characters.`);
          }
          if (field.columns !== undefined && ![1, 2].includes(Number(field.columns))) {
            errors.push(`Section component "${String(field.label ?? '')}" must contain one or two columns.`);
          }
        }
      }
      const inputFields = fields.filter((field) => !['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
      const fieldNames = inputFields.map((field) => typeof field.apiName === 'string'
        ? field.apiName.trim()
        : String(field.label ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''));
      if (new Set(fieldNames.map((name) => name.toLowerCase())).size !== fieldNames.length
        || fieldNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
        errors.push(`Screen "${element.label}" fields must have unique, valid API names.`);
      }
      for (const field of inputFields) {
        if (typeof field.helpText === 'string' && field.helpText.length > 255) {
          errors.push(`Help text on screen field "${String(field.label ?? '')}" exceeds 255 characters.`);
        }
        const type = String(field.type ?? 'Text');
        const supportedTypes = ['Text', 'Password', 'Number', 'Currency', 'Date', 'Time', 'Date/Time', 'Email', 'URL', 'Phone', 'Checkbox', 'Toggle', 'Slider', 'Picklist', 'Multi-Select Picklist', 'Long Text Area', 'Address', 'Name', 'Lookup', 'Choice Lookup', 'Data Table', 'File Upload', 'Repeater', 'Custom Component'];
        if (!supportedTypes.includes(type)) {
          errors.push(`Screen field "${String(field.label ?? '')}" on "${element.label}" uses unsupported data type "${type}".`);
        }
        if (type === 'Custom Component') {
          const apiName = typeof field.componentApiName === 'string' ? field.componentApiName.trim() : '';
          const definition = platformStore.state.libraryComponents.find((component) =>
            component.apiName === apiName && component.surfaces.includes('flow') && component.status !== 'Draft'
            && libraryComponentVisible(component, tenantId, Object.keys(platformStore.state.tenants)));
          if (!definition) {
            errors.push(`Custom screen component "${apiName}" on "${element.label}" must reference a published Flow-enabled registry component.`);
          }
          if (field.componentPropsJson !== undefined) {
            try {
              const parsed = typeof field.componentPropsJson === 'string' && field.componentPropsJson.length <= 32768
                ? JSON.parse(field.componentPropsJson) : null;
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
                || ['__proto__', 'constructor', 'prototype'].some((key) => Object.prototype.hasOwnProperty.call(parsed,key))) {
                throw new Error('Component properties must be a safe object');
              }
            } catch {
              errors.push(`Custom screen component "${apiName}" on "${element.label}" has invalid component properties.`);
            }
          }
        }
        if (['Lookup', 'Choice Lookup'].includes(type) && !objects.some((object) => object.apiName === field.objectApiName)) {
          errors.push(`${type} screen field "${String(field.label ?? '')}" on "${element.label}" requires a valid target object.`);
        }
        if (type === 'Choice Lookup' && field.displayField !== undefined
          && !objects.find((object) => object.apiName === field.objectApiName)?.fields.some((item) => item.apiName === field.displayField)) {
          errors.push(`Choice Lookup screen field "${String(field.label ?? '')}" on "${element.label}" requires a valid choice label field.`);
        }
        if (type === 'Choice Lookup' && field.multipleSelections !== undefined
          && typeof field.multipleSelections !== 'boolean') {
          errors.push(`Choice Lookup screen field "${String(field.label ?? '')}" on "${element.label}" must configure multiple selections as true or false.`);
        }
        if (type === 'Data Table') {
          const collectionName = typeof field.collection === 'string' ? field.collection : '';
          const collection = flow.resources.find((resource) => resource.name === collectionName && resource.type === 'Record Collection');
          if (!collection) errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" requires a Record Collection resource.`);
          const columnNames = Array.isArray(field.columns) ? field.columns.filter((column): column is string => typeof column === 'string') : [];
          if (!columnNames.length || new Set(columnNames).size !== columnNames.length) {
            errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" requires unique columns.`);
          } else if (collection && !objects.find((object) => object.apiName === collection.dataType)?.fields.some((item) => columnNames.includes(item.apiName))) {
            errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" has columns that are not fields on its collection object.`);
          }
        }
        if (type === 'File Upload') {
          const maxFiles = field.maxFiles === undefined ? 1 : field.maxFiles;
          const maxFileSize = field.maxFileSize === undefined ? 512 : field.maxFileSize;
          const allowedTypes = Array.isArray(field.allowedTypes) ? field.allowedTypes : [];
          if (!Number.isInteger(maxFiles) || Number(maxFiles) < 1 || Number(maxFiles) > 10) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" must allow between 1 and 10 files.`);
          }
          if (!Number.isInteger(maxFileSize) || Number(maxFileSize) < 1 || Number(maxFileSize) > 512) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" must limit each file to 1 through 512 KB.`);
          }
          if (allowedTypes.some((mime) => typeof mime !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(mime))) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" has an invalid allowed MIME type.`);
          }
        }
        if (type === 'Repeater') {
          const subfields = asConfigRows(field.subfields);
          if (!subfields.length || subfields.length > 20) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" must define between 1 and 20 subfields.`);
          }
          const subfieldNames = subfields.map((subfield) => typeof subfield.apiName === 'string' ? subfield.apiName.trim() : '');
          if (subfieldNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
            || new Set(subfieldNames.map((name) => name.toLowerCase())).size !== subfieldNames.length) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" subfields must have unique, valid API names.`);
          }
          const allowedSubfieldTypes = ['Text', 'Number', 'Date', 'Email', 'Checkbox'];
          if (subfields.some((subfield) => !allowedSubfieldTypes.includes(String(subfield.type ?? 'Text')))) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" uses an unsupported subfield type.`);
          }
          const minimumRows = field.minimumRows === undefined ? 0 : field.minimumRows;
          const maximumRows = field.maximumRows === undefined ? 10 : field.maximumRows;
          if (!Number.isInteger(minimumRows) || Number(minimumRows) < 0 || Number(minimumRows) > 50
            || !Number.isInteger(maximumRows) || Number(maximumRows) < 1 || Number(maximumRows) > 50
            || Number(minimumRows) > Number(maximumRows)) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" requires valid row limits from 0 to 50.`);
          }
        }
        const displayAs = field.displayAs;
        if (displayAs !== undefined) {
          const supportedDisplays: Record<string, string[]> = {
            Picklist: ['Dropdown', 'Radio Buttons'],
            'Multi-Select Picklist': ['Multi-Select Dropdown', 'Checkbox Group']
          };
          if (!supportedDisplays[type]?.includes(String(displayAs))) {
            errors.push(`Display mode "${String(displayAs)}" is not supported for ${type} screen field "${String(field.label ?? '')}".`);
          }
        }
        const minLength = field.minLength;
        const maxLength = field.maxLength;
        const min = field.min;
        const max = field.max;
        const step = field.step;
        if (minLength !== undefined && (!Number.isInteger(minLength) || Number(minLength) < 0)) {
          errors.push(`Minimum length on screen field "${String(field.label ?? '')}" must be a non-negative integer.`);
        }
        if (maxLength !== undefined && (!Number.isInteger(maxLength) || Number(maxLength) < 0)) {
          errors.push(`Maximum length on screen field "${String(field.label ?? '')}" must be a non-negative integer.`);
        }
        if (typeof minLength === 'number' && typeof maxLength === 'number' && minLength > maxLength) {
          errors.push(`Minimum length exceeds maximum length on screen field "${String(field.label ?? '')}".`);
        }
        if (minLength !== undefined || maxLength !== undefined) {
          if (!['Text', 'Password', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(type)) {
            errors.push(`Length limits are only supported on text screen fields ("${String(field.label ?? '')}").`);
          }
        }
        if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) {
          errors.push(`Minimum value on screen field "${String(field.label ?? '')}" must be a finite number.`);
        }
        if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) {
          errors.push(`Maximum value on screen field "${String(field.label ?? '')}" must be a finite number.`);
        }
        if (typeof min === 'number' && typeof max === 'number' && min > max) {
          errors.push(`Minimum value exceeds maximum value on screen field "${String(field.label ?? '')}".`);
        }
        if (min !== undefined || max !== undefined) {
          if (!['Number', 'Currency', 'Slider'].includes(type)) {
            errors.push(`Numeric limits are only supported on Number, Currency, and Slider screen fields ("${String(field.label ?? '')}").`);
          }
          if (step !== undefined && (typeof step !== 'number' || !Number.isFinite(step) || step <= 0)) {
            errors.push(`Step on screen field "${String(field.label ?? '')}" must be a positive finite number.`);
          }
          if (step !== undefined && !['Number', 'Currency', 'Slider'].includes(type)) {
            errors.push(`Step is only supported on numeric and Slider screen fields ("${String(field.label ?? '')}").`);
          }
        }
        if (field.pattern !== undefined) {
          if (typeof field.pattern !== 'string' || !isSafeFlowRegex(field.pattern) || !['Text', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(type)) {
            errors.push(`Validation pattern on screen field "${String(field.label ?? '')}" uses unsupported syntax or is not on a text field.`);
          } else {
            try {
              new RegExp(`^(?:${field.pattern})$`);
            } catch {
              errors.push(`Validation pattern on screen field "${String(field.label ?? '')}" is invalid.`);
            }
          }
        }
        if (field.validationMessage !== undefined
          && (typeof field.validationMessage !== 'string' || field.validationMessage.length > 255)) {
          errors.push(`Validation message on screen field "${String(field.label ?? '')}" must be at most 255 characters.`);
        }
        const visibilityConditions = asConfigRows(field.visibilityConditions);
        if (visibilityConditions.length) {
          validateConditions(field.visibilityConditions, undefined, `visibility rule for "${String(field.label ?? '')}" on "${element.label}"`);
          validateConditionLogic(field.visibilityLogic, `visibility rule for "${String(field.label ?? '')}" on "${element.label}"`, visibilityConditions.length);
          for (const condition of visibilityConditions) {
            if (typeof condition.field === 'string' && !fieldNames.includes(condition.field)
              && !flow.resources.some((resource) => resource.name === condition.field)) {
              errors.push(`Visibility condition on "${String(field.label ?? '')}" references unknown screen field "${condition.field}".`);
            }
          }
        }
        const defaultValue = field.defaultValue;
        const choices = field.choices;
        if (defaultValue !== undefined && defaultValue !== null && defaultValue !== '') {
          const validType = type === 'Multi-Select Picklist'
            ? Array.isArray(defaultValue) && defaultValue.every((value) => typeof value === 'string')
            : ['Checkbox', 'Toggle'].includes(type)
              ? typeof defaultValue === 'boolean'
              : ['Number', 'Currency', 'Slider'].includes(type)
                ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
                : typeof defaultValue === 'string';
          if (!validType) errors.push(`Default value on ${type} screen field "${String(field.label ?? '')}" has an incompatible value type.`);
          if (type === 'Picklist' && (!Array.isArray(choices) || !choices.includes(defaultValue))) {
            errors.push(`Default value on picklist screen field "${String(field.label ?? '')}" must be one of its configured choices.`);
          }
          if (type === 'Multi-Select Picklist' && Array.isArray(choices)
            && Array.isArray(defaultValue) && defaultValue.some((value) => !choices.includes(value))) {
            errors.push(`Default value on multi-select screen field "${String(field.label ?? '')}" must contain only configured choices.`);
          }
          if (type === 'Date' && typeof defaultValue === 'string'
            && (!/^\d{4}-\d{2}-\d{2}$/.test(defaultValue)
              || !Number.isFinite(Date.parse(`${defaultValue}T00:00:00.000Z`))
              || new Date(`${defaultValue}T00:00:00.000Z`).toISOString().slice(0, 10) !== defaultValue)) {
            errors.push(`Default value on date screen field "${String(field.label ?? '')}" must be a valid date.`);
          }
          if (type === 'Date/Time' && typeof defaultValue === 'string' && !isValidFlowDateTime(defaultValue)) {
            errors.push(`Default value on date/time screen field "${String(field.label ?? '')}" must be a valid date and time.`);
          }
          if (type === 'Time' && typeof defaultValue === 'string' && !isValidFlowTime(defaultValue)) {
            errors.push(`Default value on time screen field "${String(field.label ?? '')}" must be a valid time.`);
          }
          if (type === 'Email' && typeof defaultValue === 'string' && !z.string().email().safeParse(defaultValue).success) {
            errors.push(`Default value on email screen field "${String(field.label ?? '')}" must be a valid email address.`);
          }
          if (type === 'URL' && typeof defaultValue === 'string' && !z.string().url().safeParse(defaultValue).success) {
            errors.push(`Default value on URL screen field "${String(field.label ?? '')}" must be a valid URL.`);
          }
        }
      }
      const choices = inputFields.filter((field) => ['Picklist', 'Multi-Select Picklist'].includes(String(field.type)));
      for (const field of choices) {
        if (!Array.isArray(field.choices) || !field.choices.length || field.choices.some((choice) => typeof choice !== 'string' || !choice.trim())) {
          errors.push(`${String(field.type)} screen field "${String(field.label ?? '')}" on "${element.label}" requires one or more choices.`);
        } else if (new Set(field.choices).size !== field.choices.length) {
          errors.push(`${String(field.type)} screen field "${String(field.label ?? '')}" on "${element.label}" has duplicate choices.`);
        }
      }
    }
    if (element.type === 'Orchestration Stage') {
      const objectApiName = String(element.config.objectApiName ?? '');
      if (!objects.some((object) => object.apiName === objectApiName)) {
        errors.push(`Orchestration Stage "${element.label}" requires an existing target object.`);
      }
      const processApiName = String(element.config.approvalProcessApiName ?? '');
      const process = approvalProcesses.find((item) => item.apiName === processApiName);
      if (processApiName && (!process || !process.active || process.objectApiName !== objectApiName)) {
        errors.push(`Orchestration Stage "${element.label}" requires an active matching approval process.`);
      }
      if (typeof element.config.recordId !== 'string' || !element.config.recordId.trim()) {
        errors.push(`Orchestration Stage "${element.label}" requires a target record ID or Flow reference.`);
      }
      if (!processApiName && (typeof element.config.approverIds !== 'string' || !element.config.approverIds.trim())) {
        errors.push(`Orchestration Stage "${element.label}" requires approvers or an approval process.`);
      }
      if (element.config.approvalMode !== undefined && !['ANY', 'ALL'].includes(String(element.config.approvalMode))) {
        errors.push(`Orchestration Stage "${element.label}" requires ANY or ALL approval mode.`);
      }
      const statusVariable = String(element.config.statusVariable ?? '');
      if (statusVariable && !flow.resources.some((resource) => resource.name === statusVariable
        && resource.type === 'Variable' && resource.dataType === 'Text' && !resource.isCollection)) {
        errors.push(`Orchestration Stage "${element.label}" requires a Text variable for its result.`);
      }
      const routes = flow.connectors.filter((connector) => connector.from === element.id && connector.kind === 'normal');
      for (const decision of ['Approved', 'Rejected']) {
        if (routes.filter((connector) => connector.label.toLowerCase() === decision.toLowerCase()).length !== 1) {
          errors.push(`Orchestration Stage "${element.label}" requires exactly one ${decision} connector.`);
        }
      }
      if (routes.length !== 2 || flow.connectors.some((connector) => connector.from === element.id && connector.kind === 'scheduled')) {
        errors.push(`Orchestration Stage "${element.label}" supports only Approved and Rejected normal paths.`);
      }
      if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save') {
        errors.push(`Orchestration Stage "${element.label}" is not available before save.`);
      }
    }
    if (element.type === 'Action') {
      const actionType = String(element.config.actionType ?? '');
      if (actionType.toLowerCase().includes('apex')) {
        errors.push(`Apex actions are excluded from this platform's Flow Builder scope.`);
      } else if (!['Send Email', 'Email Alert', 'Post to Chatter', 'Custom Notification', 'Outbound Message', 'Submit for Approval'].includes(actionType)) {
        errors.push(`Action "${element.label}" uses unsupported action type "${actionType || '(not selected)'}".`);
      } else if (actionType === 'Send Email') {
        const credentialId = typeof element.config.namedCredentialId === 'string' ? element.config.namedCredentialId : '';
        if (!credentials.some((credential) => credential.id === credentialId && credential.protocol === 'SMTP')) {
          errors.push(`Send Email action "${element.label}" requires an SMTP Named Credential.`);
        } else {
          const credential = credentials.find((item) => item.id === credentialId)!;
          const smtpHost = new URL(credential.baseUrl).hostname.replace(/^\[|\]$/g, '');
          if (!isTestLoopbackSmtpUrl(new URL(credential.baseUrl))
            && (isReservedHostname(smtpHost) || (isIP(smtpHost) && !isPublicAddress(smtpHost)))) {
            errors.push(`Send Email action "${element.label}" cannot use a local, private, or reserved SMTP host.`);
          }
        }
        const fromEmail = typeof element.config.fromEmail === 'string' ? element.config.fromEmail.trim() : '';
        if (!fromEmail || fromEmail.includes('{') || !z.string().email().safeParse(fromEmail).success) {
          errors.push(`Send Email action "${element.label}" requires a valid From email address.`);
        }
        const recipients = typeof element.config.recipients === 'string' ? element.config.recipients.trim() : '';
        if (!recipients) errors.push(`Send Email action "${element.label}" requires at least one recipient.`);
        else if (!recipients.includes('{') && recipients.split(/[;,]/).some((recipient) => !z.string().email().safeParse(recipient.trim()).success)) {
          errors.push(`Send Email action "${element.label}" contains an invalid recipient email address.`);
        }
        if (typeof element.config.subject !== 'string' || !element.config.subject.trim()) {
          errors.push(`Send Email action "${element.label}" requires a subject.`);
        }
        if (typeof element.config.body !== 'string' || !element.config.body.trim()) {
          errors.push(`Send Email action "${element.label}" requires a message body.`);
        }
      } else if (actionType === 'Outbound Message') {
        const credentialId = typeof element.config.namedCredentialId === 'string' ? element.config.namedCredentialId : '';
        if (!credentials.some((credential) => credential.id === credentialId && credential.protocol === 'HTTPS')) {
          errors.push(`Outbound Message "${element.label}" requires an HTTPS Named Credential.`);
        }
        const path = typeof element.config.path === 'string' ? element.config.path.trim() : '';
        if (!path) {
          errors.push(`Outbound Message "${element.label}" requires a relative endpoint path.`);
        } else if (path.startsWith('\\') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/')) {
          errors.push(`Outbound Message "${element.label}" path must be relative to its HTTPS Named Credential.`);
        }
        if (typeof element.config.messageBody !== 'string' || !element.config.messageBody.trim()) {
          errors.push(`Outbound Message "${element.label}" requires a JSON message body.`);
        } else {
          try {
            const parsedBody: unknown = JSON.parse(element.config.messageBody);
            if (!parsedBody || typeof parsedBody !== 'object') {
              errors.push(`Outbound Message "${element.label}" message body must be a JSON object or array.`);
            }
          } catch {
            errors.push(`Outbound Message "${element.label}" message body must be valid JSON.`);
          }
        }
      } else if (actionType === 'Custom Notification') {
        const recipientIds = typeof element.config.recipientIds === 'string' ? element.config.recipientIds.trim() : '';
        if (!recipientIds) errors.push(`Custom Notification "${element.label}" requires at least one recipient user ID or Flow reference.`);
        if (typeof element.config.title !== 'string' || !element.config.title.trim()) {
          errors.push(`Custom Notification "${element.label}" requires a title.`);
        } else if (element.config.title.length > 120) {
          errors.push(`Custom Notification "${element.label}" title cannot exceed 120 characters.`);
        }
        if (typeof element.config.messageBody !== 'string' || !element.config.messageBody.trim()) {
          errors.push(`Custom Notification "${element.label}" requires a message.`);
        } else if (element.config.messageBody.length > 2000) {
          errors.push(`Custom Notification "${element.label}" message cannot exceed 2000 characters.`);
        }
      } else if (actionType === 'Submit for Approval') {
        const objectApiName = typeof element.config.objectApiName === 'string' ? element.config.objectApiName.trim() : '';
        if (!objects.some((object) => object.apiName === objectApiName)) {
          errors.push(`Submit for Approval "${element.label}" requires a valid target object.`);
        }
        const approvalProcessApiName = typeof element.config.approvalProcessApiName === 'string'
          ? element.config.approvalProcessApiName.trim() : '';
        const approvalProcess = approvalProcesses.find((process) => process.apiName === approvalProcessApiName);
        if (approvalProcessApiName && !approvalProcess) {
          errors.push(`Submit for Approval "${element.label}" references an unknown approval process.`);
        } else if (approvalProcess && !approvalProcess.active) {
          errors.push(`Submit for Approval "${element.label}" requires an active approval process.`);
        } else if (approvalProcess && approvalProcess.objectApiName !== objectApiName) {
          errors.push(`Approval process "${approvalProcess.label}" is for "${approvalProcess.objectApiName}", not "${objectApiName}".`);
        }
        if (typeof element.config.recordId !== 'string' || !element.config.recordId.trim()) {
          errors.push(`Submit for Approval "${element.label}" requires a target record ID or Flow reference.`);
        }
        if (!approvalProcessApiName && (typeof element.config.approverIds !== 'string' || !element.config.approverIds.trim())) {
          errors.push(`Submit for Approval "${element.label}" requires at least one approver user ID or Flow reference.`);
        }
        if (element.config.comments !== undefined
          && (typeof element.config.comments !== 'string' || element.config.comments.length > 2000)) {
          errors.push(`Submit for Approval "${element.label}" comments must be at most 2000 characters.`);
        }
      } else if (actionType === 'Email Alert') {
        const emailAlertId = typeof element.config.emailAlertId === 'string' ? element.config.emailAlertId : '';
        const emailAlert = emailAlerts.find((candidate) => candidate.id === emailAlertId);
        if (!emailAlert) {
          errors.push(`Email Alert action "${element.label}" requires a saved Email Alert.`);
        } else if (flow.flowType !== 'Record-Triggered Flow' || flow.triggerObject !== emailAlert.objectApiName) {
          errors.push(`Email Alert action "${element.label}" requires a record-triggered flow on "${emailAlert.objectApiName}".`);
        }
      } else {
        const objectApiName = typeof element.config.objectApiName === 'string' ? element.config.objectApiName.trim() : '';
        const object = objects.find((candidate) => candidate.apiName === objectApiName);
        if (!object) {
          errors.push(`Post to Chatter action "${element.label}" requires a valid target object.`);
        } else if (!object.settings?.allowInChatter) {
          errors.push(`Post to Chatter action "${element.label}" requires Chatter to be enabled for "${object.label}".`);
        }
        if (typeof element.config.recordId !== 'string' || !element.config.recordId.trim()) {
          errors.push(`Post to Chatter action "${element.label}" requires a target record ID or Flow reference.`);
        }
        if (typeof element.config.message !== 'string' || !element.config.message.trim()) {
          errors.push(`Post to Chatter action "${element.label}" requires a message.`);
        } else if (element.config.message.length > 4000) {
          errors.push(`Post to Chatter action "${element.label}" message cannot exceed 4000 characters.`);
        }
      }
    }
    if (element.type === 'HTTP Callout' && flow.startConfig.runWhen === 'before-save') errors.push('HTTP Callouts are not available in before-save record-triggered flows.');
    if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save' && !['Start', 'Assignment', 'Decision'].includes(element.type)) {
      errors.push(`${element.type} element "${element.label}" is not available in before-save record-triggered flows.`);
    }
    if (element.type === 'Assignment') {
      const target = typeof element.config.variable === 'string' ? element.config.variable : '';
      const operator = String(element.config.operator ?? 'Assign');
      if (!['Assign', 'Add', 'Subtract', 'Multiply', 'Divide', 'Add At Beginning', 'Add At End', 'Remove', 'Remove All'].includes(operator)) {
        errors.push(`Assignment "${element.label}" uses unsupported operator "${operator}".`);
      }
      const recordFieldName = /^\$Record\.([A-Za-z][A-Za-z0-9_]*)$/.exec(target)?.[1];
      if (recordFieldName) {
        const field = triggerObject?.fields.find((item) => item.apiName === recordFieldName);
        if (flow.flowType !== 'Record-Triggered Flow' || flow.startConfig.runWhen !== 'before-save') {
          errors.push(`Assignment "${element.label}" can target $Record fields only in before-save record-triggered flows.`);
        } else if (!field) {
          errors.push(`Assignment "${element.label}" references unknown trigger field "${recordFieldName}".`);
        } else if (field.formula || ['AutoNumber', 'Auto Number'].includes(field.dataType)) {
          errors.push(`Assignment "${element.label}" cannot target read-only field "${recordFieldName}".`);
        }
      } else if (!flow.resources.some((resource) => resource.name === target)) {
        errors.push(`Assignment "${element.label}" references unknown variable "${target || '(not selected)'}".`);
      } else {
        const resource = flow.resources.find((item) => item.name === target);
        if (resource?.isCollection && !['Assign', 'Add', 'Add At Beginning', 'Add At End', 'Remove', 'Remove All'].includes(operator)) {
          errors.push(`Assignment "${element.label}" uses an operator unavailable for collection resource "${target}".`);
        }
        if (operator === 'Remove' && !resource?.isCollection) {
          errors.push(`Assignment "${element.label}" uses Remove on a non-collection resource.`);
        }
        if (resource && ['Formula', 'Constant', 'Choice', 'Text Template'].includes(resource.type)) {
          errors.push(`Assignment "${element.label}" cannot target ${resource.type} resource "${target}".`);
        }
      }
    }
    if (element.type === 'Wait') {
      const waitType = String(element.config.waitType ?? 'Duration');
      if (waitType === 'Specific Time') {
        const rawDateTime = typeof element.config.dateTime === 'string' ? element.config.dateTime : '';
        const timeZone = String(element.config.timeZone ?? 'UTC');
        const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(rawDateTime);
        if (explicitZone) {
          if (!isValidFlowDateTime(rawDateTime)) {
            errors.push(`Wait "${element.label}" requires a valid resume date and time.`);
          }
        } else {
          const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(rawDateTime);
          if (!match) {
            errors.push(`Wait "${element.label}" requires a valid resume date and time.`);
          } else if (!dashboardTimeZoneSchema.safeParse(timeZone).success) {
            errors.push(`Wait "${element.label}" requires a valid IANA time zone.`);
          } else {
            const [, yearText, monthText, dayText, hourText, minuteText] = match;
            const year = Number(yearText);
            const month = Number(monthText);
            const day = Number(dayText);
            const civilDate = new Date(Date.UTC(year, month - 1, day));
            if (civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1 || civilDate.getUTCDate() !== day
              || !flowLocalDateTimeToInstant(civilDate, Number(hourText), Number(minuteText), timeZone)) {
              errors.push(`Wait "${element.label}" requires a valid local resume date and time in "${timeZone}".`);
            }
          }
        }
      } else {
        const amount = Number(element.config.amount ?? 1);
        if (!Number.isFinite(amount) || amount <= 0 || !['Minutes', 'Hours', 'Days'].includes(String(element.config.unit ?? 'Hours'))) {
          errors.push(`Wait "${element.label}" requires a positive duration and supported unit.`);
        }
      }
    }
    if (element.type === 'Decision' && (!Array.isArray(element.config.outcomes) || element.config.outcomes.length === 0)) warnings.push(`Decision "${element.label}" has no configured outcomes.`);
    if (['Get Records', 'Create Records', 'Update Records', 'Delete Records'].includes(element.type) && !element.config.object) {
      errors.push(`Select an object for ${element.type} element "${element.label}".`);
    }
    const sourceCollectionName = typeof element.config.collection === 'string' ? element.config.collection : '';
    const sourceCollection = flow.resources.find((resource) => resource.name === sourceCollectionName);
    const elementObjectName = typeof element.config.object === 'string'
      ? element.config.object
      : ['Collection Filter', 'Collection Sort', 'Transform', 'Loop'].includes(element.type) && sourceCollection?.type === 'Record Collection'
        ? sourceCollection.dataType
        : undefined;
    const elementObject = elementObjectName ? objects.find((object) => object.apiName === elementObjectName) : undefined;
    if (elementObjectName && !elementObject) {
      errors.push(`Object "${elementObjectName}" on element "${element.label}" does not exist.`);
    }
    if (element.type === 'Loop') {
      const loopVariable = typeof element.config.loopVariable === 'string' ? element.config.loopVariable.trim() : '';
      const loopResource = flow.resources.find((resource) => resource.name === loopVariable);
      if (!sourceCollection || sourceCollection.type !== 'Record Collection' || !sourceCollection.isCollection || !elementObject) {
        errors.push(`Loop "${element.label}" requires a record collection with a valid object type.`);
      }
      if (!loopResource || loopResource.type !== 'Record' || loopResource.isCollection
        || loopResource.dataType !== sourceCollection?.dataType) {
        errors.push(`Loop "${element.label}" requires a record loop variable with the same object type as its collection.`);
      }
      if (element.config.direction !== undefined
        && !['First to last', 'Last to first'].includes(String(element.config.direction))) {
        errors.push(`Loop "${element.label}" direction must be First to last or Last to first.`);
      }
      const loopConnectors = flow.connectors.filter((connector) =>
        connector.from === element.id && connector.kind === 'normal');
      const forEachConnectors = loopConnectors.filter((connector) =>
        ['for each', 'next'].includes(connector.label.trim().toLowerCase()));
      const afterLastConnectors = loopConnectors.filter((connector) =>
        connector.label.trim().toLowerCase() === 'after last');
      if (loopConnectors.length !== 2 || forEachConnectors.length !== 1 || afterLastConnectors.length !== 1) {
        errors.push(`Loop "${element.label}" must have exactly one For Each and one After Last connector.`);
      }
    }
    validateConditionLogic(element.config.conditionLogic, element.label, asConfigRows(element.config.conditions).length);
    validateConditions(element.config.conditions, elementObject, element.label);
    if (element.type === 'Decision') {
      const decisionObject = objects.find((object) => object.apiName === elementObjectName) ?? triggerObject;
      for (const outcome of asConfigRows(element.config.outcomes)) {
        validateConditionLogic(outcome.conditionLogic ?? asConfigRows(outcome.conditions)[0]?.logic, `${element.label} / ${String(outcome.label ?? outcome.name ?? 'Outcome')}`, asConfigRows(outcome.conditions).length);
        validateConditions(outcome.conditions, decisionObject, `${element.label} / ${String(outcome.label ?? outcome.name ?? 'Outcome')}`);
      }
    }
    if (['Create Records', 'Update Records'].includes(element.type)) {
      for (const fieldValue of asConfigRows(element.config.fieldValues)) {
        const fieldName = typeof fieldValue.field === 'string' ? fieldValue.field : '';
        if (!fieldName) errors.push(`A field assignment on "${element.label}" is missing its field.`);
        else if (elementObject && !elementObject.fields.some((field) => field.apiName === fieldName)) errors.push(`Field "${fieldName}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
      }
    }
    if (element.type === 'Get Records' && element.config.sortField && elementObject && !elementObject.fields.some((field) => field.apiName === element.config.sortField)) {
      errors.push(`Sort field "${String(element.config.sortField)}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
    }
    if (element.type === 'Get Records') {
      const limit = String(element.config.recordLimit ?? '1');
      if (limit !== 'all' && (!/^[1-9][0-9]*$/.test(limit) || Number(limit) > 200)) {
        errors.push(`Get Records "${element.label}" limit must be all or an integer from 1 through 200.`);
      }
    }
    if (element.type === 'Get Records' && element.config.sortOrder !== undefined && !['Ascending', 'Descending'].includes(String(element.config.sortOrder))) {
      errors.push(`Sort order on "${element.label}" must be Ascending or Descending.`);
    }
    if (element.type === 'Get Records' && Array.isArray(element.config.fields)) {
      if (!element.config.fields.length) errors.push(`Select at least one field to store on "${element.label}".`);
      const selectedFields = element.config.fields.filter((field): field is string => typeof field === 'string');
      if (selectedFields.length !== element.config.fields.length || new Set(selectedFields).size !== selectedFields.length) {
        errors.push(`Fields to store on "${element.label}" must be unique field API names.`);
      }
      for (const fieldName of selectedFields) {
        if (elementObject && !elementObject.fields.some((field) => field.apiName === fieldName)) {
          errors.push(`Field "${fieldName}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
        }
      }
    } else if (element.type === 'Get Records' && element.config.fields !== undefined && typeof element.config.fields !== 'string') {
      errors.push(`Fields to store on "${element.label}" must be "all" or a list of field API names.`);
    }
    if (element.type === 'Get Records' && typeof element.config.outputVariable === 'string' && element.config.outputVariable) {
      const resource = flow.resources.find((item) => item.name === element.config.outputVariable);
      const expectedType = element.config.recordLimit === 'all' || Number(element.config.recordLimit ?? 1) > 1 ? 'Record Collection' : 'Record';
      if (!resource || resource.type !== expectedType || resource.dataType !== elementObjectName) {
        errors.push(`Output variable "${element.config.outputVariable}" on "${element.label}" must be a ${expectedType} resource.`);
      }
    }
    if (element.type === 'Subflow') {
      const childApiName = typeof element.config.flowApiName === 'string' ? element.config.flowApiName : '';
      const childFlow = activeFlowDefinition(allFlows.find((candidate) => candidate.apiName === childApiName));
      if (!childFlow || childFlow.status !== 'Active' || childFlow.flowType !== 'Autolaunched Flow') {
        errors.push(`Subflow "${element.label}" must reference an active autolaunched flow.`);
      } else {
        try {
          for (const mapping of parseSubflowMappings(element.config.inputValues, element.label, 'input')) {
            const childInput = childFlow.resources.find((resource) => resource.name === mapping.source && resource.availableForInput);
            if (!childInput) {
              errors.push(`Subflow "${element.label}" input "${mapping.source}" is not an available input on "${childFlow.label}".`);
            }
            const reference = /^\{!?([A-Za-z_$][A-Za-z0-9_.$]*)\}$/.exec(mapping.target);
            const parentResourceName = reference?.[1].split('.')[0];
            if (parentResourceName && !parentResourceName.startsWith('$')
              && !flow.resources.some((resource) => resource.name === parentResourceName)) {
              errors.push(`Subflow "${element.label}" input mapping references undefined parent resource "${parentResourceName}".`);
            }
          }
          for (const mapping of parseSubflowMappings(element.config.outputValues, element.label, 'output')) {
            const childOutput = childFlow.resources.find((resource) => resource.name === mapping.source && resource.availableForOutput);
            if (!childOutput) {
              errors.push(`Subflow "${element.label}" output "${mapping.source}" is not an available output on "${childFlow.label}".`);
              continue;
            }
            const parentOutput = flow.resources.find((resource) => resource.name === mapping.target);
            if (!parentOutput || ['Formula', 'Constant', 'Choice', 'Text Template'].includes(parentOutput.type)) {
              errors.push(`Subflow "${element.label}" output mapping target "${mapping.target}" must be a writable parent resource.`);
            } else if (parentOutput.dataType !== childOutput.dataType || parentOutput.isCollection !== childOutput.isCollection) {
              errors.push(`Subflow "${element.label}" output "${mapping.source}" is incompatible with parent resource "${mapping.target}".`);
            }
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Subflow "${element.label}" has invalid mappings.`);
        }
      }
    }
    if (element.type === 'Collection Filter' || element.type === 'Collection Sort') {
      const outputName = typeof element.config.outputCollection === 'string' ? element.config.outputCollection : '';
      const output = flow.resources.find((resource) => resource.name === outputName);
      if (!sourceCollection || sourceCollection.type !== 'Record Collection' || !elementObject) {
        errors.push(`${element.type} "${element.label}" requires a record collection whose data type is an existing object.`);
      }
      if (!output || output.type !== 'Record Collection' || output.name === sourceCollectionName
        || output.dataType !== sourceCollection?.dataType) {
        errors.push(`${element.type} "${element.label}" requires a different output collection with the same record type.`);
      }
      if (element.type === 'Collection Filter' && !asConfigRows(element.config.conditions).length) {
        errors.push(`Collection Filter "${element.label}" requires at least one condition.`);
      }
      if (element.type === 'Collection Sort') {
        const sortField = typeof element.config.sortField === 'string' ? element.config.sortField : '';
        if (!sortField) {
          errors.push(`Collection Sort "${element.label}" requires a sort field.`);
        } else if (elementObject && !elementObject.fields.some((field) => field.apiName === sortField)) {
          errors.push(`Sort field "${sortField}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
        }
        if (element.config.sortOrder !== undefined && !['Ascending', 'Descending'].includes(String(element.config.sortOrder))) {
          errors.push(`Collection Sort "${element.label}" sort order must be Ascending or Descending.`);
        }
      }
    }
    if (String(element.type) === 'Transform') {
      const outputName = typeof element.config.outputCollection === 'string' ? element.config.outputCollection : '';
      const output = flow.resources.find((resource) => resource.name === outputName);
      const sourceObject = objects.find((object) => object.apiName === sourceCollection?.dataType);
      const targetObject = objects.find((object) => object.apiName === output?.dataType);
      if (!sourceCollection || sourceCollection.type !== 'Record Collection' || !sourceObject) {
        errors.push(`Transform "${element.label}" requires a source record collection with a valid object type.`);
      }
      if (!output || output.type !== 'Record Collection' || output.name === sourceCollectionName || !targetObject) {
        errors.push(`Transform "${element.label}" requires a different output record collection with a valid object type.`);
      }
      const mappings = asConfigRows(element.config.mappings);
      if (!mappings.length) errors.push(`Transform "${element.label}" requires at least one field mapping.`);
      const mappedTargets = new Set<string>();
      for (const mapping of mappings) {
        const sourceField = typeof mapping.sourceField === 'string' ? mapping.sourceField : '';
        const targetField = typeof mapping.targetField === 'string' ? mapping.targetField : '';
        if (!sourceField || (sourceObject && !sourceObject.fields.some((field) => field.apiName === sourceField))) {
          errors.push(`Transform "${element.label}" references a missing source field "${sourceField}".`);
        }
        if (!targetField || (targetObject && !targetObject.fields.some((field) => field.apiName === targetField))) {
          errors.push(`Transform "${element.label}" references a missing target field "${targetField}".`);
        }
        if (targetField && mappedTargets.has(targetField)) {
          errors.push(`Transform "${element.label}" maps more than one source field to "${targetField}".`);
        }
        if (targetField) mappedTargets.add(targetField);
      }
    }
    if (element.type === 'Decision') {
      const outcomes = asConfigRows(element.config.outcomes);
      const outcomeLabels = outcomes.map((outcome) => String(outcome.label ?? '').trim().toLowerCase());
      const outcomeNames = outcomes.map((outcome) => String(outcome.name ?? '').trim().toLowerCase());
      if (outcomeLabels.some((label) => !label)
        || new Set(outcomeLabels).size !== outcomeLabels.length
        || new Set(outcomeNames).size !== outcomeNames.length) {
        errors.push(`Decision "${element.label}" outcomes must have unique, non-empty labels and API names.`);
      }
      const defaultOutcomes = outcomes.filter((outcome) => outcome.name === 'Default');
      if (defaultOutcomes.length !== 1) {
        errors.push(`Decision "${element.label}" must have exactly one default outcome.`);
      }
      const decisionConnectors = flow.connectors.filter((connector) =>
        connector.from === element.id && connector.kind === 'normal');
      for (const outcome of outcomes) {
        const label = String(outcome.label ?? '').trim().toLowerCase();
        const name = String(outcome.name ?? '').trim().toLowerCase();
        const matchingConnectors = decisionConnectors.filter((connector) => {
          const connectorLabel = connector.label.trim().toLowerCase();
          return connectorLabel && (connectorLabel === label || connectorLabel === name);
        });
        if (matchingConnectors.length !== 1) {
          errors.push(`Decision "${element.label}" outcome "${String(outcome.label ?? outcome.name ?? '')}" must have exactly one connector.`);
        }
      }
      for (const connector of decisionConnectors) {
        const connectorLabel = connector.label.trim().toLowerCase();
        const matchingOutcomes = outcomes.filter((outcome) =>
          connectorLabel && (connectorLabel === String(outcome.label ?? '').trim().toLowerCase()
            || connectorLabel === String(outcome.name ?? '').trim().toLowerCase()));
        if (matchingOutcomes.length !== 1) {
          errors.push(`Decision connector "${connector.id}" does not match exactly one outcome on "${element.label}".`);
        }
      }
      for (const outcome of outcomes.filter((candidate) => candidate.name !== 'Default')) {
        const conditions = asConfigRows(outcome.conditions);
        if (!conditions.length) errors.push(`Decision outcome "${String(outcome.label ?? 'Unknown')}" on "${element.label}" requires at least one condition.`);
      }
    }
    if (element.type === 'HTTP Callout') {
      const connectionId = typeof element.config.integrationConnectionId === 'string' ? element.config.integrationConnectionId : '';
      const credentialId = typeof element.config.namedCredentialId === 'string' ? element.config.namedCredentialId : '';
      const connectionResource = typeof element.config.integrationConnectionResource === 'string' ? element.config.integrationConnectionResource.trim() : '';
      const credentialResource = typeof element.config.namedCredentialResource === 'string' ? element.config.namedCredentialResource.trim() : '';
      const resourceBindingPattern = /^\{!?[A-Za-z_$][A-Za-z0-9_$.]*\}$/;
      if (connectionResource && !resourceBindingPattern.test(connectionResource)) {
        errors.push(`Integration Connection resource on HTTP Callout "${element.label}" must be a Flow resource reference.`);
      }
      if (credentialResource && !resourceBindingPattern.test(credentialResource)) {
        errors.push(`Named Credential resource on HTTP Callout "${element.label}" must be a Flow resource reference.`);
      }
      if (connectionResource && credentialResource) {
        errors.push(`HTTP Callout "${element.label}" cannot use both dynamic Integration Connection and Named Credential resources.`);
      }
      const selectedConnection = connectionResource ? undefined : integrationConnections.find((connection) => connection.id === connectionId && connection.status === 'ACTIVE');
      const selectedDefinition = selectedConnection
        ? connectorDefinitions.find((definition) => definition.connectorKey === selectedConnection.connectorKey && definition.status === 'ACTIVE')
        : undefined;
      if (!connectionResource && connectionId && (!selectedConnection || !selectedDefinition)) {
        errors.push(`Select an active Integration Connection for HTTP Callout "${element.label}".`);
      } else if (!connectionResource && !credentialResource && !connectionId && !credentials.some((credential) => credential.id === credentialId)) {
        errors.push(`Select an existing Named Credential or bind a credential resource for HTTP Callout "${element.label}".`);
      }
      const operationName = typeof element.config.operation === 'string' ? element.config.operation : '';
      const operation = operationName && selectedDefinition ? selectedDefinition.operations[operationName] : undefined;
      if (operationName && !operation) errors.push(`HTTP Callout "${element.label}" selects an operation not defined by its provider.`);
      const calloutPath = typeof element.config.path === 'string' && element.config.path.trim()
        ? element.config.path.trim()
        : operation?.path ?? '';
      if (!calloutPath) errors.push(`Set a relative resource path or choose a provider operation for HTTP Callout "${element.label}".`);
      else if (calloutPath.startsWith('\\') || calloutPath.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(calloutPath)
        || (calloutPath.startsWith('/') && calloutPath !== operation?.path)) {
        errors.push(`HTTP Callout "${element.label}" path must remain a relative provider path.`);
      }
      if (element.config.url !== undefined) errors.push(`HTTP Callout "${element.label}" cannot store a raw URL; select a Named Credential or Integration Connection.`);
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(element.config.method ?? 'GET'))) {
        errors.push(`HTTP Callout "${element.label}" uses an unsupported HTTP method.`);
      }
      if (element.config.timeoutMs !== undefined && element.config.timeoutMs !== '' && (!Number.isInteger(Number(element.config.timeoutMs)) || Number(element.config.timeoutMs) < 1000 || Number(element.config.timeoutMs) > 120000)) {
        errors.push(`HTTP Callout "${element.label}" timeout must be between 1,000 and 120,000 milliseconds.`);
      }
      if (element.config.onError !== undefined && !['FAULT_PATH', 'FAIL', 'CONTINUE'].includes(String(element.config.onError))) {
        errors.push(`HTTP Callout "${element.label}" has an unsupported On Error behavior.`);
      }
      if (element.config.queryParameters !== undefined && typeof element.config.queryParameters !== 'string') {
        errors.push(`HTTP Callout "${element.label}" query parameters must be configured as JSON text.`);
      } else if (typeof element.config.queryParameters === 'string' && element.config.queryParameters.trim()) {
        try {
          const queryParameters: unknown = JSON.parse(element.config.queryParameters);
          if (!queryParameters || typeof queryParameters !== 'object' || Array.isArray(queryParameters)) {
            errors.push(`HTTP Callout "${element.label}" query parameters must be a JSON object.`);
          }
        } catch {
          errors.push(`HTTP Callout "${element.label}" query parameters must be valid JSON.`);
        }
      }
      if (element.config.responseMapping !== undefined && typeof element.config.responseMapping !== 'string') {
        errors.push(`HTTP Callout "${element.label}" response mapping must be configured as JSON text.`);
      } else if (typeof element.config.responseMapping === 'string' && element.config.responseMapping.trim()) {
        try {
          const responseMapping: unknown = JSON.parse(element.config.responseMapping);
          if (!responseMapping || typeof responseMapping !== 'object' || Array.isArray(responseMapping)
            || Object.values(responseMapping).some((path) => typeof path !== 'string')) {
            errors.push(`HTTP Callout "${element.label}" response mapping must be a JSON object of output names to response paths.`);
          }
        } catch {
          errors.push(`HTTP Callout "${element.label}" response mapping must be valid JSON.`);
        }
      }
      if (element.config.headers !== undefined && typeof element.config.headers !== 'string') {
        errors.push(`HTTP Callout "${element.label}" headers must be configured as header-name: value lines.`);
      }
      if (typeof element.config.headers === 'string') {
        for (const line of element.config.headers.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
          const separator = line.indexOf(':');
          const name = separator > 0 ? line.slice(0, separator).trim() : '';
          if (!name || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)
            || ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
            errors.push(`HTTP Callout "${element.label}" contains an invalid or restricted request header.`);
            break;
          }
        }
      }
      for (const variableKey of ['responseVariable', 'statusVariable']) {
        const variableName = typeof element.config[variableKey] === 'string' ? element.config[variableKey] as string : '';
        if (variableName && !flow.resources.some((resource) => resource.name === variableName && resource.type !== 'Constant')) {
          errors.push(`Output variable "${variableName}" on HTTP Callout "${element.label}" must be a non-constant resource defined in Manager.`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function dashboardEmailFilterMatches(record: RuntimeRecord, filter: DashboardFilterMetadata): boolean {
  return reportFilterMatches(record, filter);
}

type DashboardCrossFilterResolution =
  | { recordIds: Set<string> }
  | { error: string; status: 400 | 403 };
type ReportCrossFilterResolution =
  | { matchesRecord: (record: RuntimeRecord) => boolean }
  | { error: string; status: 400 | 403 };

function resolveReportCrossFilters(
  principal: Principal,
  tenant: TenantData,
  parentObject: ObjectMetadata,
  crossFilters: z.infer<typeof reportCrossFilterSchema>[],
  matchesFilter: (record: RuntimeRecord, filter: z.infer<typeof reportFilterSchema>) => boolean
): ReportCrossFilterResolution {
  const configured: Array<{
    mode: 'With' | 'Without';
    childRecords: RuntimeRecord[];
    relationshipFieldApiName: string;
    filters: z.infer<typeof reportFilterSchema>[];
  }> = [];
  for (const crossFilter of crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    const relationshipField = childObject?.fields.find((field) =>
      field.relationship?.targetObject === parentObject.apiName);
    if (!childObject || !relationshipField) {
      return { error: `Cross-filter object "${crossFilter.childObjectApiName}" is not a child of "${parentObject.apiName}"`, status: 400 };
    }
    if (!hasObjectPermission(principal, tenant, childObject.apiName, 'read')) {
      return { error: `Missing read permission for cross-filter object "${childObject.apiName}"`, status: 403 };
    }
    if (!hasFieldPermission(principal, tenant, childObject.apiName, relationshipField.apiName, 'read')) {
      return { error: `Missing read permission for relationship field "${childObject.apiName}.${relationshipField.apiName}"`, status: 403 };
    }
    for (const filter of crossFilter.filters) {
      if (!childObject.fields.some((field) => field.apiName === filter.fieldApiName)) {
        return { error: `Cross-filter field "${filter.fieldApiName}" is unavailable on "${childObject.apiName}"`, status: 400 };
      }
      if (!hasFieldPermission(principal, tenant, childObject.apiName, filter.fieldApiName, 'read')) {
        return { error: `Missing read permission for cross-filter field "${childObject.apiName}.${filter.fieldApiName}"`, status: 403 };
      }
    }
    configured.push({
      mode: crossFilter.mode,
      relationshipFieldApiName: relationshipField.apiName,
      filters: crossFilter.filters,
      childRecords: (tenant.records[childObject.apiName] ?? []).filter((record) =>
        hasRecordAccess(principal, tenant, childObject.apiName, record, 'Read'))
        .map((record) => calculateFormulaFields(childObject, record, formulaContextForUser(tenant, principal.userId)))
    });
  }
  return {
    matchesRecord: (record) => configured.every((crossFilter) => {
      const hasMatchingChild = crossFilter.childRecords.some((childRecord) =>
        String(childRecord[crossFilter.relationshipFieldApiName] ?? '') === record.Id
        && crossFilter.filters.every((filter) => matchesFilter(childRecord, filter)));
      return crossFilter.mode === 'With' ? hasMatchingChild : !hasMatchingChild;
    })
  };
}

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
async function dispatchDueIntegrationJobs(): Promise<void> {
  if (persistenceMode === 'jsonb') return;
  const pool = getRouteAliasPool();
  if (!pool) return;
  const outbox = new IntegrationOutbox(pool);
  // Keep the core scheduler running if an additive Module 11 migration has not yet been applied.
  // Enqueueing remains fail-closed until the outbox schema is installed.
  if (!await outbox.ready()) return;
  const workerId = 'metadrive-outbox-' + process.pid;
  for (const tenantId of Object.keys(platformStore.state.tenants)) {
    if (!tenantIsActive(tenantId)) continue;
    await dispatchIntegrationDeliveries({
      outbox, tenantId, workerId, limit: 1,
      dispatch: async delivery => {
        const value = openIntegrationEnvelope(tenantId, delivery.operationKey,
          delivery.encryptedRequest, credentialKeyRing());
        const decoded = z.object({
          label: z.string().min(1).max(255),
          config: z.record(z.unknown()),
          context: z.object({
            currentUserId: z.string().min(1),
            variables: z.record(z.unknown())
          }).passthrough()
        }).parse(value);
        const credentialRef = decoded.config.integrationConnectionId || decoded.config.namedCredentialId;
        if (credentialRef !== delivery.credentialId ||
            decoded.config.idempotencyKey !== delivery.operationKey ||
            decoded.config.deliveryMode !== 'SYNC') {
          throw new CalloutFault('OUTBOX_IDENTITY_MISMATCH', undefined, 1, false);
        }
        const currentTenant = tenantData(tenantId);
        const user = platformStore.state.users.find(item => item.id === decoded.context.currentUserId &&
          item.tenantId === tenantId && !item.disabled);
        if (!currentTenant || !user ||
            !effectivePermissions(user,currentTenant).includes('callouts:execute')) {
          throw new CalloutFault('OUTBOX_PERMISSION_DENIED', undefined, 1, false);
        }
        const restored = { ...decoded.context,
          formulaStack: new Set<string>(), currentUserId:user.id, debug:false,
          rollbackSnapshot:undefined } as FlowRuntimeContext;
        const response = await performHttpCallout(tenantId, currentTenant,
          { ...decoded.config, maxAttempts: 1, deliveryMode:'SYNC' },
          restored, decoded.label);
        return { status: response.status };
      }
    });
  }
}
const dispatchScheduledFlows = createScheduledDispatcher({
  maintenance: maintenanceMode, lease: withSchedulerLease, flush: waitForPersistedState,
  refresh: createSqlStateRefresh({
    persistenceMode, store: platformStore,
    authRevision: () => platformInitialization.authOverlayRevision,
    readPersistedState, waitForPersistedState, parsePersistedPlatformState,
    restoreDurableAuthOverlay: platformInitialization.restoreDurableAuthOverlay
  }),
  events: () => deliverPendingPlatformEvents(),
  flows: () => executeDueScheduledFlows(),
  integrations: () => dispatchDueIntegrationJobs(),
  subscriptions: async () => {
    const now = Date.now();
    const dueSubscriptions = Object.entries(platformStore.state.tenants).flatMap(([tenantId, tenant]) =>
      tenantIsActive(tenantId) ? tenant.dashboardSubscriptions.filter((subscription) =>
        subscription.active && Date.parse(subscription.nextRunAt) <= now)
        .map((subscription) => ({ tenantId, subscriptionId: subscription.id })) : []);
    for (const due of dueSubscriptions) await dispatchDashboardSubscription(due.tenantId, due.subscriptionId);
  }
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
export type { FlowDebugTraceEntry, FlowRuntimeContext };

export type { platformEventSchema, platformEventMessageSchema, PageMetadata, LightningApp, ReportFolder, DashboardTerritory, DashboardSubscription, AccessControl, SharingSetting, CurrencySettings, RecordShare, CampaignMember, RecordActivity, ChatterPost, CustomNotification, ApprovalRequest, ApprovalProcess, FieldHistoryEntry, FlowInterview, FlowExecutionLog, scheduleRetrySchema, automationSettingsSchema, EmailAlert, ConnectorSettings, ConnectorDefinition, AccessProfile };
