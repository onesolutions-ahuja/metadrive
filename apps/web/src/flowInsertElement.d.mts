import type { FlowDefinitionMetadata, FlowElementMetadata } from './metadata';
export function insertFlowElementAtPath(flow: FlowDefinitionMetadata, fromId: number, element: FlowElementMetadata, connectorId: string | undefined, continuationId: string): FlowDefinitionMetadata;
