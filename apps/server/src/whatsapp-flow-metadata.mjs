// One-time repair of legacy *editable Flow metadata*. This is not runtime WhatsApp routing.
// Never overwrite user-customised values or message templates.
const extraOutboundFields = [
  ['Event_Type__c', 'Message'],
  ['Communication_Mode__c', 'WhatsApp'],
  ['Source__c', 'Flow']
];

export function repairWhatsappRouterMetadata(input) {
  if (input?.apiName !== 'WA_ROUTER' || !Array.isArray(input.elements) || !Array.isArray(input.connectors)) {
    return { flow: input, changes: [] };
  }
  const flow = structuredClone(input);
  const changes = [];
  const byLabel = (label, type) => flow.elements.find((element) => element.label === label && element.type === type);
  const completed = byLabel('Mark Incoming Message Processed', 'Update Records');
  const markFields = completed?.config?.fieldValues;
  if (Array.isArray(markFields)) {
    for (const field of markFields) {
      if (field.field === 'Status__c' && field.value === 'Processed') {
        field.value = 'Completed'; // Value already defined in Communication Records picklist metadata.
        changes.push('Replace invalid legacy Processed status with Completed');
      }
    }
  }
  const outgoing = byLabel('Log Outgoing WhatsApp Message', 'Create Records');
  const outgoingFields = outgoing?.config?.fieldValues;
  if (Array.isArray(outgoingFields)) {
    for (const [field, value] of extraOutboundFields) {
      if (!outgoingFields.some((entry) => entry.field === field)) {
        outgoingFields.push({ field, value });
        changes.push('Restore outgoing communication field ' + field);
      }
    }
  }
  const errorAssignment = byLabel('Capture Callout Error', 'Assignment');
  const callout = byLabel('Send WhatsApp Reply', 'HTTP Callout');
  const faultConnected = errorAssignment && callout
    && flow.connectors.some((connector) => Number(connector.from) === Number(callout.id)
      && Number(connector.to) === Number(errorAssignment.id) && connector.kind === 'fault');
  if (faultConnected && !byLabel('Record WhatsApp Delivery Failure', 'Update Records')) {
    const id = Math.max(0, ...flow.elements.map((element) => Number(element.id) || 0)) + 1;
    flow.elements.push({
      id, type: 'Update Records', label: 'Record WhatsApp Delivery Failure',
      config: {
        object: 'Communication_Records__c',
        conditions: [{ field: 'Id', operator: 'Equals', value: '{!$Record.Id}' }],
        fieldValues: [
          { field: 'Status__c', value: 'Failed' },
          { field: 'Error__c', value: 'WhatsApp delivery callout failed. Check Flow Debug for details.' }
        ]
      }
    });
    flow.connectors.push({
      id: 'wa-fault-record-' + id,
      from: Number(errorAssignment.id), to: id, kind: 'normal', label: ''
    });
    changes.push('Persist a safe failed status when the WhatsApp callout faults');
  }
  return { flow: changes.length ? flow : input, changes };
}

export function publishRepairedWhatsappVersion(existing, patchedFlow, savedAt) {
  if (existing.apiName !== 'WA_ROUTER' || existing.activeVersion === null
    || existing.status !== 'Active' || existing.activeVersion !== existing.versionNumber) {
    throw Error('Refusing to alter a draft or ambiguous active WhatsApp router');
  }
  const history = new Map((existing.versions ?? []).map((version) => [version.versionNumber, version]));
  history.set(existing.versionNumber, {
    versionNumber: existing.versionNumber,
    status: 'Obsolete',
    savedAt,
    label: existing.label,
    description: existing.description,
    flowType: existing.flowType,
    triggerObject: existing.triggerObject,
    startConfig: existing.startConfig,
    elements: existing.elements,
    connectors: existing.connectors,
    resources: existing.resources
  });
  for (const [number, version] of history) {
    if (version.status === 'Active') history.set(number, { ...version, status: 'Obsolete' });
  }
  const versionNumber = Math.max(existing.versionNumber, ...history.keys()) + 1;
  const current = { ...patchedFlow, status: 'Active', versionNumber, activeVersion: versionNumber };
  const snapshot = {
    versionNumber, status: 'Active', savedAt,
    label: current.label,
    description: current.description,
    flowType: current.flowType,
    triggerObject: current.triggerObject,
    startConfig: current.startConfig,
    elements: current.elements,
    connectors: current.connectors,
    resources: current.resources
  };
  return { ...current, versions: [...history.values(), snapshot].sort((a, b) => a.versionNumber - b.versionNumber) };
}
