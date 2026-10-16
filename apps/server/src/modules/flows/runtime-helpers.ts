import type { FlowMetadata, TenantData } from '../../index.js';
import { activeFlowDefinition } from './versioning.js';
import { isValidFlowDateTime } from '../../modules/records/record-values.js';

export function isValidFlowTime(value: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match !== null;
}

export function validateFlowInputValues(flow: FlowMetadata, values: Record<string, unknown>): string | undefined {
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
export function flowNeedsRollbackSnapshot(
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

export function orderedRecordTriggeredFlows(
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

