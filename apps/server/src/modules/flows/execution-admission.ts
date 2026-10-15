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
