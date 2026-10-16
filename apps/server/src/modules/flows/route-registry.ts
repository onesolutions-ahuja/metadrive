import type { FlowRouteServices, PlatformState } from '../../index.js';
import { registerFlowsPlatformEventRoutes } from './platform-event-routes.js';
import { registerFlowsMetadataRoutes } from './metadata-routes.js';
import { registerFlowsEmailAlertRoutes } from './email-alert-routes.js';
import { registerFlowDefinitionRoutes } from './definition-routes.js';
import { registerFlowsExecutionRoutes } from './execution-routes.js';
import { registerFlowRecordDebugRoutes } from './record-debug-routes.js';
import { registerFlowsInterviewRoutes } from './interview-routes.js';
import { registerFlowElementRoutes } from './element-routes.js';

/** Centralised Flow route dependency wiring; order is controlled by the existing API bootstrap. */
export function createFlowRouteRegistrar(deps: FlowRouteServices) {
  const registerFlowsPlatformEventRoutesContext = {
  get activeFlowDefinition() { return deps.activeFlowDefinition; },
  get app() { return deps.app; },
  get getPrincipal() { return deps.getPrincipal; },
  get persistTenantRecords() { return deps.persistTenantRecords; },
  get platformEventSchema() { return deps.platformEventSchema; },
  get requireAnyPermission() { return deps.requireAnyPermission; },
  get requirePermission() { return deps.requirePermission; },
  get routeParam() { return deps.routeParam; },
  get tenantData() { return deps.tenantData; }
  };
  const registerFlowsMetadataRoutesContext = {
  get app() { return deps.app; },
  get automationSettingsSchema() { return deps.automationSettingsSchema; },
  get defaultAutomationSettings() { return deps.defaultAutomationSettings; },
  get getPrincipal() { return deps.getPrincipal; },
  get persistTenantRecords() { return deps.persistTenantRecords; },
  get requireAnyPermission() { return deps.requireAnyPermission; },
  get requirePermission() { return deps.requirePermission; },
  get routeParam() { return deps.routeParam; },
  get state() { return deps.state; },
  set state(next: PlatformState) { deps.state = next; },
  get tenantData() { return deps.tenantData; }
  };
  const registerFlowsEmailAlertRoutesContext = {
  get app() { return deps.app; },
  get emailAlertRequestSchema() { return deps.emailAlertRequestSchema; },
  get emailAlertSchema() { return deps.emailAlertSchema; },
  get getPrincipal() { return deps.getPrincipal; },
  get persistTenantRecords() { return deps.persistTenantRecords; },
  get randomUUID() { return deps.randomUUID; },
  get requireAnyPermission() { return deps.requireAnyPermission; },
  get requirePermission() { return deps.requirePermission; },
  get routeParam() { return deps.routeParam; },
  get tenantData() { return deps.tenantData; },
  get z() { return deps.z; }
  };
  const registerFlowDefinitionRoutesContext = {
  get activeFlowDefinition() { return deps.activeFlowDefinition; },
  get app() { return deps.app; },
  get flowSchema() { return deps.flowSchema; },
  get flowVersionSnapshot() { return deps.flowVersionSnapshot; },
  get formulaContextForUser() { return deps.formulaContextForUser; },
  get getPrincipal() { return deps.getPrincipal; },
  get persistState() { return deps.persistState; },
  get persistTenantRecords() { return deps.persistTenantRecords; },
  get requireAnyPermission() { return deps.requireAnyPermission; },
  get requirePermission() { return deps.requirePermission; },
  get routeParam() { return deps.routeParam; },
  get state() { return deps.state; },
  set state(next: PlatformState) { deps.state = next; },
  get tenantData() { return deps.tenantData; },
  get uniqueFlowHistory() { return deps.uniqueFlowHistory; },
  get validateFlow() { return deps.validateFlow; }
  };
  const registerFlowsExecutionRoutesContext = {
  get accessAuthentication() { return deps.accessAuthentication; },
  get app() { return deps.app; },
  get authoriseChatterFlow() { return deps.authoriseChatterFlow; },
  get authoriseManualCoreFlow() { return deps.authoriseManualCoreFlow; },
  get createFlowInterview() { return deps.createFlowInterview; },
  get executeFlow() { return deps.executeFlow; },
  get formulaContextForUser() { return deps.formulaContextForUser; },
  get getPrincipal() { return deps.getPrincipal; },
  get persistFlowFailure() { return deps.persistFlowFailure; },
  get persistTenantRecords() { return deps.persistTenantRecords; },
  get requirePermission() { return deps.requirePermission; },
  get routeParam() { return deps.routeParam; },
  get sanitizeChatterCallerInput() { return deps.sanitizeChatterCallerInput; },
  get state() { return deps.state; },
  set state(next: PlatformState) { deps.state = next; },
  get tenantData() { return deps.tenantData; },
  get trustedChatterExecutionFlow() { return deps.trustedChatterExecutionFlow; },
  get validateFlow() { return deps.validateFlow; },
  get validateFlowInputValues() { return deps.validateFlowInputValues; },
  get z() { return deps.z; }
  };
  const registerFlowRecordDebugRoutesContext = {
  get accessAuthentication() { return deps.accessAuthentication; },
  get app() { return deps.app; },
  get asConfigRows() { return deps.asConfigRows; },
  get executeFlow() { return deps.executeFlow; },
  get flowConditionsMatch() { return deps.flowConditionsMatch; },
  get flowVariablesForUser() { return deps.flowVariablesForUser; },
  get formulaContextForUser() { return deps.formulaContextForUser; },
  get getPrincipal() { return deps.getPrincipal; },
  get hasFieldPermission() { return deps.hasFieldPermission; },
  get hasObjectPermission() { return deps.hasObjectPermission; },
  get hasRecordAccess() { return deps.hasRecordAccess; },
  get randomUUID() { return deps.randomUUID; },
  get recordFlowDebugRequestSchema() { return deps.recordFlowDebugRequestSchema; },
  get requirePermission() { return deps.requirePermission; },
  get routeParam() { return deps.routeParam; },
  get runtimeRecordSchema() { return deps.runtimeRecordSchema; },
  get tenantData() { return deps.tenantData; },
  get validateFlow() { return deps.validateFlow; }
  };
  const registerFlowsInterviewRoutesContext = {
  get accessAuthentication() { return deps.accessAuthentication; },
  get activeFlowDefinition() { return deps.activeFlowDefinition; },
  get app() { return deps.app; },
  get asConfigRows() { return deps.asConfigRows; },
  get createFlowInterview() { return deps.createFlowInterview; },
  get executeFlow() { return deps.executeFlow; },
  get flowConditionsMatch() { return deps.flowConditionsMatch; },
  get flowVariablesForUser() { return deps.flowVariablesForUser; },
  get formulaContextForUser() { return deps.formulaContextForUser; },
  get getPrincipal() { return deps.getPrincipal; },
  get hasObjectPermission() { return deps.hasObjectPermission; },
  get hasRecordAccess() { return deps.hasRecordAccess; },
  get isSafeFlowRegex() { return deps.isSafeFlowRegex; },
  get isValidFlowDateTime() { return deps.isValidFlowDateTime; },
  get isValidFlowTime() { return deps.isValidFlowTime; },
  get persistFlowFailure() { return deps.persistFlowFailure; },
  get persistTenantRecords() { return deps.persistTenantRecords; },
  get requirePermission() { return deps.requirePermission; },
  get resolveFlowValue() { return deps.resolveFlowValue; },
  get routeParam() { return deps.routeParam; },
  get state() { return deps.state; },
  set state(next: PlatformState) { deps.state = next; },
  get tenantData() { return deps.tenantData; },
  get z() { return deps.z; }
  };
  return {
      platformEvents: () => registerFlowsPlatformEventRoutes(registerFlowsPlatformEventRoutesContext),
      metadata: () => registerFlowsMetadataRoutes(registerFlowsMetadataRoutesContext),
      emailAlerts: () => registerFlowsEmailAlertRoutes(registerFlowsEmailAlertRoutesContext),
      definitions: () => registerFlowDefinitionRoutes(registerFlowDefinitionRoutesContext),
      execution: () => registerFlowsExecutionRoutes(registerFlowsExecutionRoutesContext),
      recordDebug: () => registerFlowRecordDebugRoutes(registerFlowRecordDebugRoutesContext),
      interviews: () => registerFlowsInterviewRoutes(registerFlowsInterviewRoutesContext),
    elements: () => registerFlowElementRoutes(deps.app, deps.requirePermission)
  };
}
