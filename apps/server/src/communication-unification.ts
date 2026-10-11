/** Metadata-only conversion; preserve old message records for rollback. */
export const communicationObjectApiName = 'Communication_Records__c';
export const legacyWhatsappObjectApiName = 'WhatsApp_Message__c';
type Row = Record<string, unknown>;
type FlowParts = { triggerObject?: string | null; startConfig?: Record<string, unknown>; elements: Array<{ config: Record<string, unknown> }> };

export function migrateLegacyWhatsappRecords<T extends Row>(source: Record<string, T[]>): Record<string, T[]> {
  const existing = source[communicationObjectApiName] ?? [];
  const oldMessages = source[legacyWhatsappObjectApiName] ?? [];
  const ids = new Set(existing.map(row => row.Id).filter(Boolean));
  const missing = oldMessages.filter(row => !ids.has(row.Id)).map(row => ({
    ...row,
    Event_Type__c: 'Message',
    Communication_Mode__c: 'WhatsApp',
    Source__c: 'Webhook',
    Occurred_At__c: row.Occurred_At__c || row.CreatedDate || new Date().toISOString()
  }) as T);
  return { ...source, [communicationObjectApiName]: [
    ...existing.map(row => row.Event_Type__c ? row
      : { ...row, Event_Type__c: 'API Call', Communication_Mode__c: 'API', Source__c: 'API' } as T),
    ...missing
  ] };
}

function migrateParts<T extends FlowParts>(part: T): T {
  const oldTrigger = part.triggerObject === legacyWhatsappObjectApiName;
  const initial = part.startConfig ?? {};
  const conditions = Array.isArray(initial.entryConditions)
    ? (initial.entryConditions as Row[]).filter(row => row && typeof row === 'object' && !Array.isArray(row))
    : [];
  const filters = [
    { field: 'Event_Type__c', operator: 'Equals', value: 'Message' },
    { field: 'Communication_Mode__c', operator: 'Equals', value: 'WhatsApp' },
    { field: 'Source__c', operator: 'Equals', value: 'Webhook' }
  ].filter(filter => !conditions.some(row => row.field === filter.field));
  const oldLogic = String(initial.conditionLogic ?? 'All');
  let conditionLogic = conditions.length ? oldLogic : 'All';
  if (filters.length && conditions.length && oldLogic.toLowerCase() !== 'all') {
    const expression = oldLogic.toLowerCase() === 'any'
      ? conditions.map((_row, index) => String(index + 1)).join(' OR ')
      : oldLogic;
    conditionLogic = `(${expression}) AND ${filters.map((_row, index) => conditions.length + index + 1).join(' AND ')}`;
  }
  return {
    ...part,
    ...(oldTrigger ? { triggerObject: communicationObjectApiName,
      startConfig: { ...initial, entryConditions: [...conditions, ...filters], conditionLogic } } : {}),
    elements: part.elements.map(element => element.config.object === legacyWhatsappObjectApiName
      ? { ...element, config: { ...element.config, object: communicationObjectApiName } } : element)
  } as T;
}

export function migrateLegacyWhatsappFlow<T extends FlowParts & { versions: FlowParts[] }>(flow: T): T {
  return { ...migrateParts(flow), versions: flow.versions.map(version => migrateParts(version)) } as T;
}

/**
 * Upgrade only the unchanged starter router's Beauty keyword metadata.
 * Customised routing remains untouched; users can still edit outcomes in Flow Builder.
 */
export function addStarterBeautyAlias<T extends {
  apiName: string;
  elements: Array<{ type: string; label: string; config: Record<string, unknown> }>;
}>(flow: T): T {
  if (flow.apiName !== 'WA_ROUTER') return flow;
  let changed = false;
  const elements = flow.elements.map(element => {
    if (element.type !== 'Decision' || element.label !== 'Route by Keyword') return element;
    const outcomes = Array.isArray(element.config.outcomes)
      ? element.config.outcomes as Array<Record<string, unknown>> : [];
    const migrated = outcomes.map(outcome => {
      if (outcome.name !== 'Beauty') return outcome;
      const conditions = Array.isArray(outcome.conditions)
        ? outcome.conditions as Array<Record<string, unknown>> : [];
      if (conditions.length !== 1 || conditions[0].field !== 'Message_Body__c'
        || conditions[0].operator !== 'Starts With' || conditions[0].value !== 'BARBER') return outcome;
      changed = true;
      return { ...outcome, conditionLogic: 'Any', conditions: [
        ...conditions, { field: 'Message_Body__c', operator: 'Starts With', value: 'BEAUTY' }
      ] };
    });
    return changed ? { ...element, config: { ...element.config, outcomes: migrated } } : element;
  });
  return changed ? { ...flow, elements } : flow;
}
