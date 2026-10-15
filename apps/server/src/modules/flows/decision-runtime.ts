import { assertExecutionAdmission, type ExecutionAdmission } from './execution-admission.js';
import { evaluateCustomConditionLogic } from './condition-logic.js';

/** Small shared entry point for approved Flow decisions. The caller supplies
 * tenant-filtered condition results and performs all step-level RBAC checks.
 * No app-specific runtime, external workflow engine or persistence is created.
 */
export function evaluateAuthorisedFlowDecision(
  admission: ExecutionAdmission, expression: string, checks: readonly boolean[]
): boolean {
  assertExecutionAdmission(admission);
  return evaluateCustomConditionLogic(expression, [...checks]);
}
