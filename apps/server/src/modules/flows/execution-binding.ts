import { createFlowExecutionEngine } from './execution-engine.js';
import type { FlowExecutionDependencies } from '../../index.js';

/** Single executor binding for manual, scheduled, record, and subflow entry points. */
export function bindFlowExecution(dependencies: FlowExecutionDependencies) {
  return createFlowExecutionEngine(dependencies);
}
