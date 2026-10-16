import { randomUUID } from 'node:crypto';
import type { FlowMetadata } from '../../index.js';
import type { TenantData } from '../../core/state/types.js';

/** Durable Flow failure logging through canonical tenant persistence. */
export function createFlowFailureRuntime(deps: {
 flowExecutionLogSchema: { parse(v: unknown): TenantData['flowLogs'][number] };
 tenantData: (tenantId: string) => TenantData | undefined;
 persistTenantRecords: (tenantId: string, tenant: TenantData) => void;
}) {
 const { flowExecutionLogSchema, tenantData, persistTenantRecords } = deps;
 type FlowExecutionLog = TenantData['flowLogs'][number];
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

 return { createFlowFailureLog, persistFlowFailure };
}
