export type FlowRecordResource = { name: string; type: string; dataType: string; isCollection: boolean };
export function prepareFlowCreateCollection(resources: FlowRecordResource[], sourceCollection: string, object: { apiName: string; fields: Array<{ apiName: string }> }, sourceValues: unknown): Record<string, unknown>[];
