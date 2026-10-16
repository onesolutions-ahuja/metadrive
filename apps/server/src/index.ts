import { resolveActiveLightningRecordPage, resolveActiveLightningHomePage, hasRecordTypeAccessForUser } from './modules/pages/activation-access.js';
import { withSecurityEvent } from './core/security/security-audit.js';
import { connectorRight, managedConnector, disableOnConnectorUninstall, assertConnectorLifecycleAccess } from './modules/integrations/connector-lifecycle.js';
import { appendFieldHistory } from './modules/records/field-history.js';
import { createRecordCascadeRuntime } from './modules/records/record-cascade.js';
import { createFlowFailureRuntime } from './modules/flows/failure-runtime.js';
import { publicIntegrationConnection, publicNamedCredential } from './modules/integrations/public-projections.js';
import { isNumericField, dashboardFilterOperatorAllowed, dashboardFilterValueError, sanitizeDashboardRichText } from './modules/dashboards/filter-validation.js';
import { createPlatformTenantRuntime } from './modules/tenants/platform-runtime.js';
import { createAuthenticationRuntime } from './modules/security/auth-runtime.js';
function mfaRequiredForUser(...args: Parameters<ReturnType<typeof createAuthenticationRuntime>['mfaRequiredForUser']>): boolean {
 return authenticationRuntime.mfaRequiredForUser(...args);
}
import { createFlowInterviewRuntime } from './modules/flows/interview-runtime.js';
function formulaContextForUser(...args: Parameters<ReturnType<typeof createFlowInterviewRuntime>['formulaContextForUser']>): ReturnType<ReturnType<typeof createFlowInterviewRuntime>['formulaContextForUser']> {
 return flowInterviewRuntime.formulaContextForUser(...args);
}
function scheduledPathTimestamp(...args: Parameters<ReturnType<typeof createFlowInterviewRuntime>['scheduledPathTimestamp']>): ReturnType<ReturnType<typeof createFlowInterviewRuntime>['scheduledPathTimestamp']> {
 return flowInterviewRuntime.scheduledPathTimestamp(...args);
}
function createFlowInterview(...args: Parameters<ReturnType<typeof createFlowInterviewRuntime>['createFlowInterview']>): ReturnType<ReturnType<typeof createFlowInterviewRuntime>['createFlowInterview']> {
 return flowInterviewRuntime.createFlowInterview(...args);
}
function flowRetryDelayMs(...args: Parameters<ReturnType<typeof createFlowInterviewRuntime>['flowRetryDelayMs']>): ReturnType<ReturnType<typeof createFlowInterviewRuntime>['flowRetryDelayMs']> {
 return flowInterviewRuntime.flowRetryDelayMs(...args);
}
import { createTenantSeedHelpers } from './seeders/tenant-seed-helpers.js';
import { createCoreObjectSeedCatalog } from './seeders/core-objects.js';
import { createFlowActionRuntime } from './modules/flows/action-runtime.js';
function performPostToChatter(...args: Parameters<ReturnType<typeof createFlowActionRuntime>['performPostToChatter']>): ReturnType<ReturnType<typeof createFlowActionRuntime>['performPostToChatter']> {
 return flowActionRuntime.performPostToChatter(...args);
}
function performCustomNotification(...args: Parameters<ReturnType<typeof createFlowActionRuntime>['performCustomNotification']>): ReturnType<ReturnType<typeof createFlowActionRuntime>['performCustomNotification']> {
 return flowActionRuntime.performCustomNotification(...args);
}
function performSubmitForApproval(...args: Parameters<ReturnType<typeof createFlowActionRuntime>['performSubmitForApproval']>): ReturnType<ReturnType<typeof createFlowActionRuntime>['performSubmitForApproval']> {
 return flowActionRuntime.performSubmitForApproval(...args);
}
import { createHttpSafetyRuntime } from './modules/integrations/http-safety.js';
import { createTenantDomainRuntime } from './modules/tenants/domain-runtime.js';
import { createCommunicationAuditRuntime } from './modules/integrations/communication-audit.js';
function redactCommunicationValue(...args: Parameters<ReturnType<typeof createCommunicationAuditRuntime>['redactCommunicationValue']>): ReturnType<ReturnType<typeof createCommunicationAuditRuntime>['redactCommunicationValue']> {
 return communicationAuditRuntime.redactCommunicationValue(...args);
}
function communicationPayload(...args: Parameters<ReturnType<typeof createCommunicationAuditRuntime>['communicationPayload']>): ReturnType<ReturnType<typeof createCommunicationAuditRuntime>['communicationPayload']> {
 return communicationAuditRuntime.communicationPayload(...args);
}
function communicationSafeUrl(...args: Parameters<ReturnType<typeof createCommunicationAuditRuntime>['communicationSafeUrl']>): ReturnType<ReturnType<typeof createCommunicationAuditRuntime>['communicationSafeUrl']> {
 return communicationAuditRuntime.communicationSafeUrl(...args);
}
function supportedCommunicationMethod(...args: Parameters<ReturnType<typeof createCommunicationAuditRuntime>['supportedCommunicationMethod']>): ReturnType<ReturnType<typeof createCommunicationAuditRuntime>['supportedCommunicationMethod']> {
 return communicationAuditRuntime.supportedCommunicationMethod(...args);
}
function communicationError(...args: Parameters<ReturnType<typeof createCommunicationAuditRuntime>['communicationError']>): ReturnType<ReturnType<typeof createCommunicationAuditRuntime>['communicationError']> {
 return communicationAuditRuntime.communicationError(...args);
}
function appendCommunicationRecord(...args: Parameters<ReturnType<typeof createCommunicationAuditRuntime>['appendCommunicationRecord']>): ReturnType<ReturnType<typeof createCommunicationAuditRuntime>['appendCommunicationRecord']> {
 return communicationAuditRuntime.appendCommunicationRecord(...args);
}
import { createDashboardRuntime } from './modules/dashboards/runtime.js';
function dashboardEmailFilterMatches(...args: Parameters<ReturnType<typeof createDashboardRuntime>['dashboardEmailFilterMatches']>): ReturnType<ReturnType<typeof createDashboardRuntime>['dashboardEmailFilterMatches']> {
 return dashboardRuntime.dashboardEmailFilterMatches(...args);
}
function dashboardRelationshipPaths(...args: Parameters<ReturnType<typeof createDashboardRuntime>['dashboardRelationshipPaths']>): ReturnType<ReturnType<typeof createDashboardRuntime>['dashboardRelationshipPaths']> {
 return dashboardRuntime.dashboardRelationshipPaths(...args);
}
function resolveDashboardCrossFilters(...args: Parameters<ReturnType<typeof createDashboardRuntime>['resolveDashboardCrossFilters']>): ReturnType<ReturnType<typeof createDashboardRuntime>['resolveDashboardCrossFilters']> {
 return dashboardRuntime.resolveDashboardCrossFilters(...args);
}
function dispatchDashboardSubscription(...args: Parameters<ReturnType<typeof createDashboardRuntime>['dispatchDashboardSubscription']>): ReturnType<ReturnType<typeof createDashboardRuntime>['dispatchDashboardSubscription']> {
 return dashboardRuntime.dispatchDashboardSubscription(...args);
}
import { pageActivationAssignmentSchema, lightningAppSchema, pageTemplateSchema, pageTemplateRegions, pageSchema, createPageSchema } from './modules/pages/schemas.js';
import { connectorSettingsSchema, defaultConnectorSettings, connectorOperationSchema, connectorTestSchema, connectorDefinitionSchema, defaultConnectorDefinitions, integrationConnectionSchema, integrationConnectionRequestSchema, connectorDefinitionRequestSchema, type ConnectorSettings, type ConnectorDefinition, type IntegrationConnection } from './modules/integrations/connector-schemas.js';
export type { IntegrationConnection } from './modules/integrations/connector-schemas.js';
import { isTestLoopbackSmtpUrl, namedCredentialSchema, namedCredentialRequestSchema, emailAlertSchema, emailAlertRequestSchema, type StoredNamedCredential, type EmailAlert, type NamedCredentialPayload, type CredentialKeyRing } from './modules/integrations/credential-schemas.js';
export type { StoredNamedCredential, NamedCredentialPayload } from './modules/integrations/credential-schemas.js';
import { fieldHistoryEntrySchema, advancedRestrictionConditionSchema, advancedRestrictionRuleSchema, sharingSettingSchema, currencySettingsSchema, recordShareSchema, campaignMemberSchema, recordActivitySchema, chatterCommentSchema, chatterPostSchema, customNotificationSchema, approvalRequestSchema, approvalProcessShapeSchema, approvalProcessSchema, approvalProcessRequestSchema, approvalDecisionSchema, type FieldHistoryEntry, type CurrencySettings, type SharingSetting, type RecordShare, type CampaignMember, type RecordActivity, type ChatterPost, type CustomNotification, type ApprovalRequest, type ApprovalProcess } from './core/metadata/shared-data-schemas.js';
import { objectPermissionFlagsSchema, objectPermissionSchema, navigationGrantSchema, permissionSetSchema, profileSchema, permissionSetGroupSchema, accessUserSchema, roleSchema, publicGroupSchema, queueSchema, sharingRuleSchema, accessControlSchema, type ObjectPermission } from './core/security/access-control-schema.js';
import { createCoreObjectSchemas } from './core/metadata/object-schemas.js';
import { createFlowSchemas } from './modules/flows/schemas.js';
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
const persistedMetadataReadMode = createPersistedMetadataReadMode(); const persistedPageSchema = createPageSchema(persistedMetadataReadMode);
const { fieldSchema, pageLayoutSectionSchema, pageLayoutCustomLinkSchema, pageLayoutSchema, pageLayoutAssignmentSchema, compactLayoutSchema, compactLayoutAssignmentSchema, recordTypeSchema, fieldSetSchema, searchLayoutsSchema, relatedLookupFilterSchema, objectActionSchema, objectSettingsSchema, customObjectTabSchema, runtimeRecordSchema, listViewButtonSchema, platformEventSchema, platformEventMessageSchema, normalizeFieldApiName, objectSchema } = createCoreObjectSchemas(persistedMetadataReadMode);
export type RelatedLookupFilterMetadata = z.infer<typeof relatedLookupFilterSchema>;
const { flowElementSchema, flowConnectorSchema, flowResourceSchema, flowTestCaseSchema, flowVersionSchema, flowSchema, flowInterviewSchema, automationSettingsSchema, scheduleRetrySchema, flowExecutionLogSchema } = createFlowSchemas(runtimeRecordSchema);
type LightningPage = z.infer<typeof pageSchema>;
import { reportFilterSchema, reportDateRangeSchema, reportStandardFiltersSchema, reportCrossFilterSchema, reportRowLimitSchema, reportSummaryOperationSchema, reportDateGroupingSchema, parseReportFilterLogic, reportSchema, reportDateRangeBounds, evaluateReportFilterLogic, reportFilterMatches } from './modules/reports/report-metadata.js';

export type ObjectMetadata = z.infer<typeof objectSchema>;
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
type FlowExecutionLog = z.infer<typeof flowExecutionLogSchema>;
type LightningApp = z.infer<typeof lightningAppSchema>;
const defaultLightningApps = (): LightningApp[] => [
  { apiName: 'Records', label: 'Records', description: 'Browse and manage customer records.', navigationItems: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#0176d3', utilityItems: ['Notes', 'History'] },
  { apiName: 'SalesApp', label: 'Sales', description: 'Manage sales accounts and opportunities.', navigationItems: ['Account', 'Contact', 'Lead', 'Opportunity'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Lead', 'Opportunity'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#0176d3', utilityItems: ['Notes', 'History'] },
  { apiName: 'ServiceApp', label: 'Service', description: 'Manage customer support cases.', navigationItems: ['Account', 'Contact', 'Case'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Case'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#7526a8', utilityItems: ['Notes', 'History'] }
].map((app) => lightningAppSchema.parse(app));
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
  get pageSchema() { return persistedPageSchema; },
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
const { ensureConnectorAppRecords, baseObjects } = createCoreObjectSeedCatalog({ connectorAppCatalog, runtimeRecordSchema });
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
const { connectorRecords, connectorDefinitionRecords, integrationConnectionRecord, whatsappDummyCredentialId, whatsappRouterFlow, whatsappContextFlow, migrateUneConnectorCredentials, seedWhatsappDummyCredential, relationshipApiName, withObjectDefaults, ensureCommunicationFields, ensureLeadStreetField } = createTenantSeedHelpers({ baseObjects, fieldSchema, flowSchema, namedCredentialSchema });
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
const authenticationRuntime = createAuthenticationRuntime({
 platformStore, platformInitialization, jwtService, refreshCookieName, isProduction,
 effectivePermissions, hasFieldPermission, hasRecordTypeAccessForUser, tenantData, persistState, withSecurityEvent
});
const { cookieValue, setRefreshCookie, clearRefreshCookie, issueRefreshSession, authenticatedLandingBootstrap, issueLoginResponse, mfaLoginChallenges, mfaEnrollments, mfaFailures, mfaChallengeTtlMs, sealMfaSecret, openMfaSecret, mfaCredentialReady, newMfaToken, mfaRateLimited, recordMfaFailure, revokeUserRefreshSessions, loginAttempts, userLoginFailures, recordUserLoginFailure, loginSchema } = authenticationRuntime;
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
const { platformPolicySchema, activePlatformSuperadmins, savePlatformPolicies, tenantManagementCreateSchema, tenantManagementUpdateSchema, tenantRegistryEntry, tenantSummary, requirePlatformTenantAdmin, commitTenantChange, tenantUsageTargetSchema, tenantUsageFor } = createPlatformTenantRuntime({
 getState: () => platformStore.state, setState: state => { platformStore.state = state; },
 persistState, getPrincipal, provisioningSchema
});
registerPlatformPolicyRoutes(app, {
  accessAuthentication, getPrincipal, principalUser, activePlatformSuperadmins,
  savePlatformPolicies, getState: () => platformStore.state, parsePolicies: (v) => platformPolicySchema.safeParse(v), routeParam
});
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
const {listTenantDomains, addTenantDomain, verifyTenantDomain, removeTenantDomain} = createTenantDomainRuntime({
 getState: () => platformStore.state, getLatestCommit: () => platformStore.latestCommit,
 isProvisioningPending: tenantId => tenantProvisioning.provisioningPendingTenants.has(tenantId),
 getPrincipal, routeParam, tenantRegistryEntry, commitTenantChange, webOrigins
});
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
const communicationAuditRuntime = createCommunicationAuditRuntime({
 tenantData, getUsers: () => platformStore.state.users,
 applyRecordDefaults, validateRuntimeRecord, persistTenantRecords
});
const { createFlowFailureLog, persistFlowFailure } = createFlowFailureRuntime({
 flowExecutionLogSchema, tenantData, persistTenantRecords
});
let recordCascadeRuntime: ReturnType<typeof createRecordCascadeRuntime>;
async function deleteRecordCascade(...args: Parameters<ReturnType<typeof createRecordCascadeRuntime>['deleteRecordCascade']>): Promise<void> {
 return recordCascadeRuntime.deleteRecordCascade(...args);
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

const { isPublicAddress, isReservedHostname, resolveCalloutUrl, mapHttpCalloutResponse } = createHttpSafetyRuntime({ resolveFlowValue });
const { safeOAuthTokenRequest, oauthCredentialVault, oauthChallengeStore, oauthAccessTokenForCredential } = createOAuthRuntime({
 isPublicAddress, tenantData, persistTenantRecords, namedCredentialSchema
});

const performHttpCallout = createHttpCalloutExecutor({
  resolveFlowValue, resolveCalloutUrl, resolveFlowTemplate, oauthAccessTokenForCredential,
  namedCredentialPayloadSchema, isPublicAddress, communicationPayload, communicationSafeUrl,
  supportedCommunicationMethod, communicationError, appendCommunicationRecord
});

const flowInterviewRuntime = createFlowInterviewRuntime({ getUsers: () => platformStore.state.users, tenantData });
function validateRuntimeRecord(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, current?: RuntimeRecord): void {
  validateMetadataRecord(tenantId, tenant, object, values, current, platformStore.state.users);
}

export type FlowExecutionResult =
  | { status: 'completed'; outputs: Record<string, unknown>; variables: Record<string, unknown>; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'screen'; screen: FlowMetadata['elements'][number]; nextElementId: number | null; outcomes: Array<{ name: string; label: string }>; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; recordEvent?: RecordEvent; isClone?: boolean; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'orchestration'; stage: FlowMetadata['elements'][number]; waitUntil: string; nextElementId: null; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; recordEvent?: RecordEvent; isClone?: boolean; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'wait' | 'scheduled' | 'async'; waitUntil: string; nextElementId: number | null; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; recordEvent?: RecordEvent; isClone?: boolean; debugTrace: FlowDebugTraceEntry[] };

const tenantEmailRuntime = createTenantEmailRuntime({
 getState: () => platformStore.state, effectivePermissions, isReservedHostname, isPublicAddress,
 namedCredentialPayloadSchema, resolveFlowTemplate
});
const { performSendEmail, performEmailAlert } = tenantEmailRuntime;

const flowActionRuntime = createFlowActionRuntime({
 getUsers: () => platformStore.state.users, principalForUser,
 hasObjectPermission, hasRecordAccess, effectivePermissions, resolveFlowTemplate
});
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
recordCascadeRuntime = createRecordCascadeRuntime({
 getUsers: () => platformStore.state.users, effectivePermissions, hasRecordAccess,
 assertFieldEditPermissions, runRecordTriggeredFlows, appendFieldHistory
});

const { scheduledOccurrence, nextScheduledOccurrence } = createFlowScheduleCalculations(flowLocalDateTimeToInstant, dashboardLocalParts);

const { resumeDueFlowInterviews, executeDueScheduledFlows, deliverPendingPlatformEvents } = createFlowSchedulingRuntime({
  getState: () => platformStore.state, activeFlowDefinition, tenantIsActive, tenantData, persistTenantRecords,
  createFlowFailureLog, asConfigRows, flowVariablesForUser, flowInterviewIdentity,
  flowConditionsMatch, formulaContextForUser, createFlowInterview, flowRetryDelayMs, executeFlow
});

const flowValidationDependencies = { asConfigRows, validateFlowFormulaSyntax, evaluateFormula, flowLocalDateTimeToInstant, isValidFlowDateTime, isValidFlowTime, libraryComponentVisible, z, dashboardTimeZoneSchema, evaluateCustomConditionLogic, isTestLoopbackSmtpUrl, isReservedHostname, isIP, isPublicAddress, activeFlowDefinition, parseSubflowMappings, isSafeFlowRegex, getState: () => platformStore.state };
export type FlowValidationDependencies = typeof flowValidationDependencies;
const validateFlow = createFlowValidator(flowValidationDependencies);

const dashboardRuntime = createDashboardRuntime({
  getUsers: () => platformStore.state.users, tenantData, persistTenantRecords,
  hasObjectPermission, hasRecordAccess, hasFieldPermission, effectivePermissions, sendTenantEmail,
  formulaContextForUser, sanitizeDashboardRichText, reportFolderAccessLevelForUser, sanitizeRecordForRead
});
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
