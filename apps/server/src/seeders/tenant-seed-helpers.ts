import { randomUUID } from 'node:crypto';
import { sealCredentialPayload } from '../core/credential-crypto.js';
import { communicationObjectApiName } from '../communication-unification.js';
import type { ObjectMetadata, FlowMetadata, RuntimeRecord, StoredNamedCredential, ConnectorSettings, ConnectorDefinition, IntegrationConnection } from '../index.js';

/** Versioned tenant seed helpers for shared Objects, Flows, communications and connectors. */
export function createTenantSeedHelpers(deps: {
 fieldSchema: { parse(value: unknown): ObjectMetadata['fields'][number] };
 flowSchema: { parse(value: unknown): FlowMetadata };
 namedCredentialSchema: { parse(value: unknown): StoredNamedCredential };
}) {
 const { fieldSchema, flowSchema, namedCredentialSchema } = deps;
function connectorRecords(settings: ConnectorSettings[], ownerId: string): RuntimeRecord[] {
  const now = new Date().toISOString();
  return settings.map((setting) => stampRecordAuditFields({
    Id: randomUUID(),
    Name: setting.label,
    ConnectorType__c: setting.apiName,
    Status__c: setting.fields.some((field) => field.value.trim()) ? 'Configured' : 'Not Configured',
    Configuration__c: JSON.stringify(Object.fromEntries(setting.fields.map((field) => [field.apiName, field.value]))),
    OwnerId: ownerId,
    RecordTypeId: 'master',
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now));
}
function connectorDefinitionRecords(definitions: ConnectorDefinition[], ownerId: string): RuntimeRecord[] {
  const now = new Date().toISOString();
  return definitions.map((definition) => stampRecordAuditFields({
    Id: randomUUID(),
    Name: definition.name,
    ConnectorKey__c: definition.connectorKey,
    AuthType__c: definition.authType,
    BaseUrl__c: definition.baseUrl,
    AuthCredential__c: definition.authCredential ?? '',
    CredentialsSchema__c: JSON.stringify(definition.credentialsSchema),
    Operations__c: JSON.stringify(definition.operations),
    Test__c: definition.test ? JSON.stringify(definition.test) : '',
    TimeoutMs__c: definition.timeoutMs,
    RetryPolicy__c: JSON.stringify(definition.retryPolicy),
    Status__c: definition.status,
    OwnerId: ownerId,
    RecordTypeId: 'master',
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now));
}
function integrationConnectionRecord(connection: IntegrationConnection, ownerId: string): RuntimeRecord {
  return stampRecordAuditFields({
    Id: connection.id,
    Name: connection.name,
    ConnectorKey__c: connection.connectorKey,
    Configuration__c: JSON.stringify(connection.configuration),
    Status__c: connection.status,
    TestStatus__c: connection.testStatus ?? '',
    LastTestedAt__c: connection.lastTestedAt ?? '',
    OwnerId: ownerId,
    RecordTypeId: 'master',
    CreatedDate: connection.createdAt,
    LastModifiedDate: connection.updatedAt
  }, ownerId, connection.updatedAt);
}
const whatsappDummyCredentialId = '11111111-1111-4111-8111-111111111111';
function whatsappRouterFlow(): FlowMetadata {
  return flowSchema.parse({
    apiName: 'WA_ROUTER', label: 'WhatsApp Router',
    description: 'Editable starter WhatsApp router. Change keywords, replies, record actions and credential in Flow Builder.',
    flowType: 'Record-Triggered Flow', status: 'Draft', versionNumber: 1, activeVersion: null,
    triggerObject: communicationObjectApiName,
    startConfig: { trigger: 'created', runWhen: 'after-save', conditionLogic: 'All', entryConditions: [{ field: 'Direction__c', operator: 'Equals', value: 'Incoming' },
      { field: 'Event_Type__c', operator: 'Equals', value: 'Message' },
      { field: 'Communication_Mode__c', operator: 'Equals', value: 'WhatsApp' },
      { field: 'Source__c', operator: 'Equals', value: 'Webhook' }] },
    elements: [
      { id: 1, type: 'Start', label: 'Incoming WhatsApp Message', config: { trigger: 'created', runWhen: 'after-save' } },
      { id: 2, type: 'Decision', label: 'Route by Keyword', config: { outcomes: [
        { name: 'Beauty', label: 'Beauty', conditionLogic: 'Any', conditions: [
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' },
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BEAUTY' }
        ] },
        { name: 'Roof', label: 'Roof', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ROOF' }] },
        { name: 'Accounts', label: 'Accounts', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ACCOUNTANT' }] },
        { name: 'Legal', label: 'Legal', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'LAWYER' }] },
        { name: 'Default', label: 'Default Outcome', conditions: [] }
      ] } },
      { id: 3, type: 'Assignment', label: 'Set Beauty Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Beauty. Edit this reply and next steps in Flow Builder.' } },
      { id: 4, type: 'Assignment', label: 'Set Roof Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Roof Cleaning. Edit this reply and next steps in Flow Builder.' } },
      { id: 5, type: 'Assignment', label: 'Set Accounts Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Accounts. Edit this reply and next steps in Flow Builder.' } },
      { id: 6, type: 'Assignment', label: 'Set Legal Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Welcome to Legal. Edit this reply and next steps in Flow Builder.' } },
      { id: 7, type: 'Assignment', label: 'Set Default Reply', config: { variable: 'ReplyText', operator: 'Assign', value: 'Please reply BARBER, ROOF, ACCOUNTANT or LAWYER.' } },
      { id: 8, type: 'HTTP Callout', label: 'Send WhatsApp Reply', config: {
        namedCredentialId: whatsappDummyCredentialId, method: 'POST', path: 'messages',
        headers: 'Content-Type: application/json',
        body: '{"messaging_product":"whatsapp","to":"{!$Record.From_Number__c}","type":"text","text":{"body":"{!ReplyText}"}}',
        statusVariable: 'CalloutStatus', onError: 'FAULT_PATH'
      } },
      { id: 9, type: 'Create Records', label: 'Log Outgoing WhatsApp Message', config: { object: communicationObjectApiName, fieldValues: [
        { field: 'Event_Type__c', value: 'Message' }, { field: 'Communication_Mode__c', value: 'WhatsApp' },
        { field: 'Source__c', value: 'Flow' },
        { field: 'Direction__c', value: 'Outgoing' }, { field: 'From_Number__c', value: '{!$Record.To_Number__c}' },
        { field: 'To_Number__c', value: '{!$Record.From_Number__c}' }, { field: 'Message_Body__c', value: '{!ReplyText}' },
        { field: 'Conversation_Key__c', value: '{!$Record.Conversation_Key__c}' }, { field: 'Status__c', value: 'Sent' }
      ] } },
      { id: 10, type: 'Update Records', label: 'Mark Incoming Message Processed', config: { object: communicationObjectApiName, conditions: [{ field: 'Id', operator: 'Equals', value: '{!$Record.Id}' }], fieldValues: [{ field: 'Status__c', value: 'Sent' }] } },
      { id: 11, type: 'Assignment', label: 'Capture Callout Error', config: { variable: 'FlowError', operator: 'Assign', value: '{!$Flow.FaultMessage}' } },
      { id: 12, type: 'Update Records', label: 'Record WhatsApp Delivery Failure', config: {
        object: communicationObjectApiName, conditions: [{ field: 'Id', operator: 'Equals', value: '{!$Record.Id}' }],
        fieldValues: [
          { field: 'Status__c', value: 'Failed' },
          { field: 'Error__c', value: 'WhatsApp delivery callout failed. Check Flow Debug for details.' }
        ]
      } }
    ],
    connectors: [
      { id: 'wa-start-route', from: 1, to: 2, label: '', kind: 'normal' },
      { id: 'wa-route-beauty', from: 2, to: 3, label: 'Beauty', kind: 'normal' },
      { id: 'wa-route-roof', from: 2, to: 4, label: 'Roof', kind: 'normal' },
      { id: 'wa-route-accounts', from: 2, to: 5, label: 'Accounts', kind: 'normal' },
      { id: 'wa-route-legal', from: 2, to: 6, label: 'Legal', kind: 'normal' },
      { id: 'wa-route-default', from: 2, to: 7, label: 'Default Outcome', kind: 'normal' },
      { id: 'wa-beauty-send', from: 3, to: 8, label: '', kind: 'normal' },
      { id: 'wa-roof-send', from: 4, to: 8, label: '', kind: 'normal' },
      { id: 'wa-accounts-send', from: 5, to: 8, label: '', kind: 'normal' },
      { id: 'wa-legal-send', from: 6, to: 8, label: '', kind: 'normal' },
      { id: 'wa-default-send', from: 7, to: 8, label: '', kind: 'normal' },
      { id: 'wa-send-log', from: 8, to: 9, label: '', kind: 'normal' },
      { id: 'wa-log-update', from: 9, to: 10, label: '', kind: 'normal' },
      { id: 'wa-send-fault', from: 8, to: 11, label: '', kind: 'fault' },
      { id: 'wa-fault-record-12', from: 11, to: 12, label: '', kind: 'normal' }
    ],
    resources: [
      { name: 'ReplyText', label: 'Reply Text', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: false, value: '' },
      { name: 'CalloutStatus', label: 'Callout Status', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: false, value: 0 },
      { name: 'FlowError', label: 'Flow Error', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '' }
    ], versions: []
  });
}
function whatsappContextFlow(): FlowMetadata {
  return flowSchema.parse({
    apiName: 'WA_CONTEXT', label: 'WhatsApp Conversation Context',
    description: 'Editable session selection. New keywords change the active topic without deleting other topics.',
    flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: 1,
    triggerObject: communicationObjectApiName,
    startConfig: { trigger: 'created', runWhen: 'before-save', conditionLogic: 'All',
      entryConditions: [
        { field: 'Event_Type__c', operator: 'Equals', value: 'Message' },
        { field: 'Communication_Mode__c', operator: 'Equals', value: 'WhatsApp' },
        { field: 'Source__c', operator: 'Equals', value: 'Webhook' },
        { field: 'Direction__c', operator: 'Equals', value: 'Incoming' }
      ] },
    elements: [
      { id: 1, type: 'Start', label: 'Inbound WhatsApp', config: { trigger: 'created', runWhen: 'before-save' } },
      { id: 2, type: 'Decision', label: 'Choose Context', config: { outcomes: [
        { name: 'Beauty', label: 'Beauty', conditionLogic: 'Any', conditions: [
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BEAUTY' },
          { field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' }
        ] },
        { name: 'Legal', label: 'Legal', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'LAWYER' }] },
        { name: 'Roof', label: 'Roof', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ROOF' }] },
        { name: 'Accounts', label: 'Accounts', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'ACCOUNTANT' }] },
        { name: 'Default', label: 'Keep Current Context', conditions: [] }
      ] } },
      { id: 3, type: 'Assignment', label: 'Use Beauty', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Beauty' } },
      { id: 4, type: 'Assignment', label: 'Use Legal', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Legal' } },
      { id: 5, type: 'Assignment', label: 'Use Roof', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Roof' } },
      { id: 6, type: 'Assignment', label: 'Use Accounts', config: { variable: '$Record.Conversation_Context__c', operator: 'Assign', value: 'Accounts' } },
      { id: 7, type: 'End', label: 'Keep Session', config: {} }
    ],
    connectors: [
      { id: 'c-start', from: 1, to: 2, label: '', kind: 'normal' },
      { id: 'c-beauty', from: 2, to: 3, label: 'Beauty', kind: 'normal' },
      { id: 'c-legal', from: 2, to: 4, label: 'Legal', kind: 'normal' },
      { id: 'c-roof', from: 2, to: 5, label: 'Roof', kind: 'normal' },
      { id: 'c-accounts', from: 2, to: 6, label: 'Accounts', kind: 'normal' },
      { id: 'c-default', from: 2, to: 7, label: 'Default Outcome', kind: 'normal' },
      { id: 'c-beauty-end', from: 3, to: 7, label: '', kind: 'normal' },
      { id: 'c-legal-end', from: 4, to: 7, label: '', kind: 'normal' },
      { id: 'c-roof-end', from: 5, to: 7, label: '', kind: 'normal' },
      { id: 'c-accounts-end', from: 6, to: 7, label: '', kind: 'normal' }
    ],
    resources: [], versions: []
  });
}
// One-time, idempotent migration from legacy UNE connector records to the Flow credential store.
// No legacy record is deleted until runtime dependencies have been migrated and tested.
function migrateUneConnectorCredentials(
  tenantId: string,
  records: Record<string, any>[],
  definitions: ConnectorDefinition[],
  current: StoredNamedCredential[]
): StoredNamedCredential[] {
  if (!process.env.METADRIVE_CREDENTIAL_KEYS || !process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID) return current;
  const result = [...current];
  for (const record of records) {
    const label = String(record.Name ?? '').trim();
    if (!label) continue;
    let configuration: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(String(record.Configuration__c || '{}'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        configuration = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
      }
    } catch { continue; }
    const requestedName = String(configuration.NamedCredential ?? '').trim();
    const name = requestedName && /^[A-Za-z][A-Za-z0-9_]*$/.test(requestedName)
      ? requestedName
      : label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^A-Za-z]+/, 'Connector_').toUpperCase();
    const existing = result.find((credential) =>
      credential.name.toUpperCase() === name.toUpperCase()
      || (label.toLowerCase() === 'email' && credential.protocol === 'SMTP')
      || (label.toLowerCase() === 'whatsapp' && credential.name === 'WhatsApp_Dummy'));
    if (existing) {
      const index = result.indexOf(existing);
      result[index] = { ...existing, configuration: { ...existing.configuration, ...configuration } };
      continue;
    }
    const provider = definitions.find((definition) =>
      definition.name.toLowerCase() === label.toLowerCase()
      || (label.toLowerCase() === 'uber eats' && definition.name.toLowerCase() === 'uber')
      || (label.toLowerCase() === 'whatsapp' && definition.name.toLowerCase().includes('whatsapp')));
    const candidateUrl = String(configuration.ApiBaseUrl || configuration.BaseUrl || provider?.baseUrl || '');
    let baseUrl = 'https://placeholder.invalid/';
    try {
      const parsedUrl = new URL(candidateUrl);
      if (parsedUrl.protocol === 'https:' && !parsedUrl.username && !parsedUrl.password && !parsedUrl.search && !parsedUrl.hash) {
        baseUrl = parsedUrl.toString();
      }
    } catch { /* Leave the placeholder URL until the tenant configures the provider. */ }
    const id = randomUUID();
    const now = new Date().toISOString();
    result.push(namedCredentialSchema.parse({
      id, name, label, protocol: 'HTTPS', baseUrl,
      authType: 'None', configuration,
      ...sealCredentialPayload(tenantId, id, {}),
      createdAt: now, updatedAt: now
    }));
  }
  return result;
}
function seedWhatsappDummyCredential(tenantId: string, current: StoredNamedCredential[]): StoredNamedCredential[] {
  if (current.some((credential) => credential.id === whatsappDummyCredentialId || credential.name === 'WhatsApp_Dummy')) return current;
  if (!process.env.METADRIVE_CREDENTIAL_KEYS || !process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID) return current;
  const now = new Date().toISOString();
  return [...current, namedCredentialSchema.parse({
    id: whatsappDummyCredentialId, name: 'WhatsApp_Dummy', label: 'WhatsApp Dummy — update before activation',
    protocol: 'HTTPS', baseUrl: 'https://graph.facebook.com/v22.0/000000000000000/', authType: 'None',
    ...sealCredentialPayload(tenantId, whatsappDummyCredentialId, {}), createdAt: now, updatedAt: now
  })];
}

function relationshipApiName(label: string): string {
  const normalized = label.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z]/.test(normalized) ? normalized : `Related_${normalized}`;
}
function withObjectDefaults(object: ObjectMetadata): ObjectMetadata {
  const fieldsWithOwner = object.apiName !== 'User' && !object.fields.some((field) => field.apiName === 'OwnerId')
    ? [...object.fields, fieldSchema.parse({
        apiName: 'OwnerId',
        label: `${object.label} Owner`,
        dataType: 'Lookup(User)',
        required: true,
        unique: false,
        relationship: {
          type: 'Lookup',
          targetObject: 'User',
          relationshipName: 'Owner',
childRelationshipName: relationshipApiName(
  `Owned${object.pluralLabel.replace(/[^a-zA-Z0-9_]/g, '')}`
)
        }
      })]
    : object.fields;
  const sourceFields = object.fields.some((field) => /^Currency(?:\(|$)/.test(field.dataType))
    && !fieldsWithOwner.some((field) => field.apiName === 'CurrencyIsoCode')
    ? [...fieldsWithOwner, fieldSchema.parse({
        apiName: 'CurrencyIsoCode',
        label: 'Currency ISO Code',
        dataType: 'Text(3)',
        required: false,
        unique: false
      })]
    : fieldsWithOwner;
  const fields = sourceFields.map((field) => {
    const standardDefinition = object.kind === 'Standard Object'
      ? baseObjects.find((candidate) => candidate.apiName === object.apiName)?.fields.find((candidate) => candidate.apiName === field.apiName)
      : undefined;
    const enrichedField = field.picklistValues || !standardDefinition?.picklistValues
      ? field
      : { ...field, picklistValues: standardDefinition.picklistValues, picklistRestricted: standardDefinition.picklistRestricted };
    if (enrichedField.relationship || enrichedField.formula) return enrichedField;
    const relationshipMatch = /^(Lookup|Master-Detail|Hierarchical)\(([^)]+)\)$/.exec(enrichedField.dataType);
    if (!relationshipMatch) return enrichedField;
    return {
      ...enrichedField,
      relationship: {
        type: relationshipMatch[1] as 'Lookup' | 'Master-Detail' | 'Hierarchical',
        targetObject: relationshipMatch[2],
        relationshipName: field.apiName.replace(/(__c|Id)$/, ''),
        childRelationshipName: relationshipApiName(object.pluralLabel)
      }
    };
  });
  const fieldApiNames = fields.map((field) => field.apiName);
  const nameField = fields.find((field) => field.apiName === 'Name')?.apiName ?? fieldApiNames[0];
  const pageLayouts = object.pageLayouts ?? [
    { id: `${object.apiName}-default`, label: 'Default Layout', sections: [{ id: 'record-information', label: 'Record Information', columns: 2, fieldApiNames }], relatedLists: [], actions: ['New', 'Edit', 'Delete'] }
  ];
  const recordTypes = object.recordTypes ?? [{ id: 'master', label: 'Master', developerName: 'Master', active: true, isDefault: true }];
  const compactLayout = object.compactLayout ?? { label: 'System Default', fieldApiNames: fieldApiNames.slice(0, 5) };
  const compactLayouts = object.compactLayouts ?? [{
    id: `${object.apiName}-compact-default`,
    ...compactLayout
  }];
  return {
    ...object,
    fields,
    pageLayouts,
    recordTypes,
    pageLayoutAssignments: object.pageLayoutAssignments ?? [{
      profileId: '*',
      recordTypeId: recordTypes.find((recordType) => recordType.isDefault)?.id ?? recordTypes[0]?.id ?? 'master',
      pageLayoutId: pageLayouts[0]?.id ?? `${object.apiName}-default`
    }],
    compactLayout,
    compactLayouts,
    compactLayoutAssignments: object.compactLayoutAssignments ?? [{
      profileId: '*',
      recordTypeId: recordTypes.find((recordType) => recordType.isDefault)?.id ?? recordTypes[0]?.id ?? 'master',
      compactLayoutId: compactLayouts[0]?.id ?? `${object.apiName}-compact-default`
    }],
    fieldSets: object.fieldSets ?? [],
    searchLayouts: object.searchLayouts ?? {
      searchResults: fieldApiNames.slice(0, 5),
      lookupDialog: nameField ? [nameField] : [],
      lookupPhoneDialog: nameField ? [nameField] : []
    },
    relatedLookupFilters: object.relatedLookupFilters ?? [],
    listViewButtons: object.listViewButtons ?? ['New', 'Change Owner', 'Import'],
    actions: object.actions ?? [
      { id: 'new', label: 'New', type: 'Standard', enabled: true },
      { id: 'edit', label: 'Edit', type: 'Standard', enabled: true },
      { id: 'delete', label: 'Delete', type: 'Standard', enabled: true }
    ],
    settings: object.settings ?? {
      allowReports: true,
      allowActivities: true,
      trackFieldHistory: false,
      allowInChatter: false,
      deploymentStatus: 'Deployed',
      recordNameType: 'Text',
      recordNameFormat: ''
    }
  };
}
function ensureCommunicationFields(object: ObjectMetadata): ObjectMetadata {
  if (object.apiName !== 'Communication_Records__c') return object;
  const defaults = baseObjects.find((item) => item.apiName === object.apiName)!;
  const existingFields = new Set(object.fields.map((field) => field.apiName));
  const addedFields = defaults.fields.filter((field) => !existingFields.has(field.apiName));
  const updatedFields = object.fields.map(field => {
    if (field.apiName === 'Occurred_At__c' && field.required) return { ...field, required: false };
    if (field.apiName === 'Status__c' && field.picklistValues && !field.picklistValues.includes('Expired')) {
      return { ...field, picklistValues: [...field.picklistValues, 'Expired'] };
    }
    return field;
  });
  if (!addedFields.length && updatedFields.every((field, index) => field === object.fields[index])) return object;
  const fieldApiNames = addedFields.map((field) => field.apiName);
  return {
    ...object,
    description: object.description || defaults.description,
    fields: [...updatedFields, ...addedFields],
    pageLayouts: object.pageLayouts?.map((layout, index) => index === 0 ? {
      ...layout,
      sections: layout.sections.map((section, sectionIndex) => sectionIndex === 0
        ? { ...section, fieldApiNames: [...new Set([...section.fieldApiNames, ...fieldApiNames])] }
        : section)
    } : layout)
  };
}
function ensureLeadStreetField(object: ObjectMetadata): ObjectMetadata {
  if (object.apiName !== 'Lead' || object.fields.some((field) => field.apiName === 'Street')) return object;
  const streetField = baseObjects.find((item) => item.apiName === 'Lead')
    ?.fields.find((field) => field.apiName === 'Street');
  if (!streetField) throw new Error('Standard Lead Street field metadata is missing');
  return { ...object, fields: [...object.fields, streetField] };
}

 return { connectorRecords, connectorDefinitionRecords, integrationConnectionRecord, whatsappDummyCredentialId, whatsappRouterFlow, whatsappContextFlow, migrateUneConnectorCredentials, seedWhatsappDummyCredential, relationshipApiName, withObjectDefaults, ensureCommunicationFields, ensureLeadStreetField };
}
