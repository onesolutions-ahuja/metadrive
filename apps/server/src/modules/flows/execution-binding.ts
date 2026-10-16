import { createFlowExecutionEngine } from './execution-engine.js';
import type { FlowExecutionDependencies } from '../../index.js';

/** Single executor binding for manual, scheduled, record, and subflow entry points. */
export function bindFlowExecution(dependencies: FlowExecutionDependencies) {
  return createFlowExecutionEngine(dependencies);
}

/** Preserve the shared record-write policy for every Flow entry point. */
export function wrapFlowExecution(
  implementation: () => ReturnType<typeof createFlowExecutionEngine>,
  withRecordWriteContext: (flowName: string, tenantId: string, userId: string, run: () => Promise<any>) => Promise<any>
) {
  return (...args: Parameters<ReturnType<typeof createFlowExecutionEngine>>) =>
    withRecordWriteContext(args[0].apiName, args[2], args[3], () => implementation()(...args));
}
