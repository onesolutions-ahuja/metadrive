import type { FlowMetadata } from '../../index.js';

/** The draft in Flow Builder is not necessarily the published executable version. */
export function activeFlowDefinition(candidate: FlowMetadata | undefined): FlowMetadata | undefined {
  if (!candidate || candidate.activeVersion === null) return undefined;
  if (candidate.status === 'Active' && candidate.versionNumber === candidate.activeVersion) return candidate;
  const published = candidate.versions.find((version) => version.versionNumber === candidate.activeVersion);
  if (!published) return undefined;
  return {
    ...candidate,
    ...published,
    versionNumber: candidate.activeVersion,
    activeVersion: candidate.activeVersion,
    status: 'Active',
    versions: candidate.versions
  };
}
export function flowVersionSnapshot(flow: FlowMetadata, savedAt: string): FlowMetadata['versions'][number] {
  return {
    versionNumber: flow.versionNumber,
    status: flow.status,
    savedAt,
    label: flow.label,
    description: flow.description,
    flowType: flow.flowType,
    triggerObject: flow.triggerObject,
    startConfig: flow.startConfig,
    elements: flow.elements,
    connectors: flow.connectors,
    resources: flow.resources,
    tests: flow.tests
  };
}
export function uniqueFlowHistory(flow: FlowMetadata | undefined, savedAt: string): FlowMetadata['versions'] {
  if (!flow) return [];
  const snapshots = new Map<number, FlowMetadata['versions'][number]>();
  for (const version of flow.versions) snapshots.set(version.versionNumber, version);
  // The editable current version is authoritative when both it and a history entry exist.
  snapshots.set(flow.versionNumber, flowVersionSnapshot(flow, savedAt));
  return [...snapshots.values()]
    .map((version) => ({
      ...version,
      status: version.versionNumber === flow.activeVersion
        ? 'Active' as const
        : version.status === 'Draft' ? 'Draft' as const : 'Obsolete' as const
    }))
    .sort((left, right) => left.versionNumber - right.versionNumber);
}
