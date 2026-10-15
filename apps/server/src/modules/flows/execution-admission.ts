import { assertTenantResourceAccess } from '../metadata/backend-convergence.js';

/** Shared admission policy for metadata-driven Action and Flow execution.
 * Entitlement, activation and OneEngine are independent mandatory gates.
 * Callers must still enforce Object/Field/Record RBAC for individual steps.
 */
export type ExecutionAdmission = {
  tenantId: string;
  principalTenantId: string;
  principalId: string;
  grants: ReadonlySet<string>;
  requiredPermission: string;
  installed: boolean;
  licensed: boolean;
  activated: boolean;
  published: boolean;
};

export function assertExecutionAdmission(input: ExecutionAdmission): void {
  assertTenantResourceAccess(input);
  if (!input.installed) throw Error('Application is not installed for this tenant');
  if (!input.licensed) throw Error('Application is not entitled for this tenant');
  if (!input.activated) throw Error('Application is not activated for this tenant');
  if (!input.published) throw Error('Flow or Action is not published');
}

/** Live API entry gate for independently authorized, core-owned manual Flows.
 * Draft preview remains allowed by the existing API contract; Obsolete is not runnable.
 * App-owned Flows require the independent installation/licensing gate supplied
 * by their app lifecycle before dispatch.
 */
export function authoriseManualCoreFlow(
  tenantId: string, principalTenantId: string, principalId: string,
  permissions: readonly string[], status: string
): void {
  assertExecutionAdmission({
    tenantId, principalTenantId, principalId,
    grants: new Set(permissions), requiredPermission: 'flows:run',
    installed: true, licensed: true, activated: true,
    published: status === 'Active' || status === 'Draft'
  });
}

/** Central dispatcher gate used by manual, resumed, scheduled and nested Flows.
 * A trusted automatic invocation is restricted to the active definition and
 * current tenant user; Flow steps retain their existing OneEngine checks.
 * Interactive entrypoints additionally require their route-level flows:run grant.
 */
export function assertFlowRuntimeAdmission(input: {
  tenantId: string;
  principalTenantId: string;
  principalId: string;
  status: string;
  allowDraftExecution: boolean;
  installed: boolean;
  licensed: boolean;
  activated: boolean;
}): void {
  assertExecutionAdmission({
    tenantId: input.tenantId,
    principalTenantId: input.principalTenantId,
    principalId: input.principalId,
    grants: new Set(['runtime:dispatch']),
    requiredPermission: 'runtime:dispatch',
    installed: input.installed,
    licensed: input.licensed,
    activated: input.activated,
    published: input.status === 'Active' || (input.allowDraftExecution && input.status === 'Draft')
  });
}
