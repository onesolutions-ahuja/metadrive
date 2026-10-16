import type { FlowMetadata, ObjectMetadata, StoredNamedCredential, IntegrationConnection, ConnectorDefinition, EmailAlert, ApprovalProcess, FlowPlatformEvent, FlowValidationDependencies } from '../../index.js';
import { validateScreenElement } from './screen-validation.js';

/** Metadata-only validation; never executes a Flow or performs business-data writes. */
export function createFlowValidator(deps: FlowValidationDependencies) {
  const { asConfigRows, validateFlowFormulaSyntax, evaluateFormula, flowLocalDateTimeToInstant, isValidFlowDateTime } = deps;
function validateFlow(
  flow: FlowMetadata,
  objects: ObjectMetadata[] = [],
  credentials: StoredNamedCredential[] = [],
  integrationConnections: IntegrationConnection[] = [],
  connectorDefinitions: ConnectorDefinition[] = [],
  emailAlerts: EmailAlert[] = [],
  formulaContext: { timeZone?: string; locale?: string; corporateCurrency?: string; currencyRates?: Record<string, number> } = {},
  allFlows: FlowMetadata[] = [],
  approvalProcesses: ApprovalProcess[] = [],
  platformEvents: FlowPlatformEvent[] = [],
  tenantId = ''
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const starts = flow.elements.filter((element) => element.type === 'Start');
  if (starts.length !== 1) errors.push('A flow must have exactly one Start element.');
  else if (flow.elements[0]?.id !== starts[0].id) errors.push('Move the Start element to the beginning of the flow.');
  const requiresObject = ['Record-Triggered Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow'].includes(flow.flowType);
  if (flow.flowType === 'Flow Orchestration' && !flow.elements.some((element) => element.type === 'Orchestration Stage')) {
    errors.push('Flow Orchestration must contain at least one Orchestration Stage.');
  }
  if (requiresObject && !flow.triggerObject) errors.push('Select an object for the flow trigger.');
  if (!requiresObject && flow.triggerObject) errors.push('Only triggered flows can select a trigger object.');
  const eventTriggered = flow.flowType === 'Platform Event-Triggered Flow';
  if (eventTriggered && flow.triggerObject && !platformEvents.some((event) => event.apiName === flow.triggerObject)) {
    errors.push(`Platform event "${flow.triggerObject}" does not exist.`);
  } else if (flow.triggerObject && !eventTriggered && !objects.some((object) => object.apiName === flow.triggerObject)) {
    errors.push(`Trigger object "${flow.triggerObject}" does not exist.`);
  }
  if (flow.flowType === 'Record-Triggered Flow') {
    if (!['created', 'updated', 'created-or-updated', 'deleted'].includes(String(flow.startConfig.trigger ?? 'created-or-updated'))) {
      errors.push('Record-triggered flow trigger must be created, updated, created-or-updated, or deleted.');
    }
    if (!['before-save', 'after-save'].includes(String(flow.startConfig.runWhen ?? 'after-save'))) {
      errors.push('Record-triggered flow optimization must be before-save or after-save.');
    }
    if (flow.startConfig.runWhen === 'before-save' && flow.startConfig.trigger === 'deleted') {
      errors.push('Before-save record-triggered flows cannot run when a record is deleted.');
    }
    if (flow.startConfig.updatedRecordBehavior !== undefined
      && !['every-time', 'transition'].includes(String(flow.startConfig.updatedRecordBehavior))) {
      errors.push('Updated-record behavior must be every-time or transition.');
    }
    const triggerOrder = flow.startConfig.triggerOrder;
    if (triggerOrder !== undefined
      && (!Number.isInteger(triggerOrder) || Number(triggerOrder) < 1 || Number(triggerOrder) > 2000)) {
      errors.push('Record-triggered flow trigger order must be an integer from 1 through 2000.');
    }
  }
  if (flow.flowType === 'Schedule-Triggered Flow' && (!flow.startConfig.startDate || !flow.startConfig.startTime || !flow.startConfig.frequency)) {
    errors.push('Configure a start date, start time, and frequency for the schedule.');
  }
  if (flow.flowType === 'Schedule-Triggered Flow') {
    const startDate = String(flow.startConfig.startDate ?? '');
    const startTime = String(flow.startConfig.startTime ?? '');
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
    if (!dateMatch || !timeMatch) {
      errors.push('The schedule start date or time is invalid.');
    } else {
      const [year, month, day] = dateMatch.slice(1).map(Number);
      const civilDate = new Date(Date.UTC(year, month - 1, day));
      if (civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1 || civilDate.getUTCDate() !== day) {
        errors.push('The schedule start date or time is invalid.');
      } else {
        const timeZone = String(flow.startConfig.timeZone ?? 'UTC');
        if (!dashboardTimeZoneSchema.safeParse(timeZone).success) {
          errors.push('The schedule time zone must be a valid IANA time zone.');
        } else {
          const [hour, minute] = timeMatch.slice(1).map(Number);
          if (!flowLocalDateTimeToInstant(civilDate, hour, minute, timeZone)) {
            errors.push(`The schedule start time does not exist in time zone "${timeZone}" because of a daylight-saving transition.`);
          }
        }
      }
    }
  }
  if (flow.flowType === 'Schedule-Triggered Flow' && flow.startConfig.frequency && !['Once', 'Daily', 'Weekly'].includes(String(flow.startConfig.frequency))) {
    errors.push('Schedule frequency must be Once, Daily, or Weekly.');
  }
  const triggerObject = objects.find((object) => object.apiName === flow.triggerObject);
  const triggerPlatformEvent = platformEvents.find((event) => event.apiName === flow.triggerObject);
  const validateConditions = (conditions: unknown, object: { apiName: string; fields: Array<{ apiName: string }> } | undefined, elementLabel: string) => {
    for (const condition of asConfigRows(conditions)) {
      const fieldName = typeof condition.field === 'string' ? condition.field : '';
      const resourceReference = /^\{!?([A-Za-z_$][A-Za-z0-9_.$]*)\}$/.exec(fieldName);
      if (!fieldName) errors.push(`A condition on "${elementLabel}" is missing its field.`);
      else if (!resourceReference && fieldName !== 'Id' && object && !object.fields.some((field) => field.apiName === fieldName)) errors.push(`Field "${fieldName}" on "${elementLabel}" does not exist on "${object.apiName}".`);
      const operator = String(condition.operator ?? 'Equals');
      if (!['Equals', 'Not Equals', 'Not Equal To', 'Is Null', 'Is Not Null', 'Greater Than', 'Less Than', 'Contains', 'Starts With'].includes(operator)) {
        errors.push(`Condition operator "${operator}" on "${elementLabel}" is not supported.`);
      }
      if (resourceReference) {
        const rootName = resourceReference[1].split('.')[0];
        if (!['$Record', '$Prior', '$Record__Prior', '$User', '$Flow'].includes(rootName)
          && !flow.resources.some((resource) => resource.name === rootName)) {
          errors.push(`Resource "${rootName}" on "${elementLabel}" does not exist.`);
        }
      }
    }
  };
  const validateConditionLogic = (logic: unknown, elementLabel: string, conditionCount = 0) => {
    if (logic === undefined || ['All', 'Any'].includes(String(logic))) return;
    try {
      evaluateCustomConditionLogic(String(logic), Array.from({ length: conditionCount }, () => false));
    } catch (error) {
      errors.push(`Condition logic on "${elementLabel}" is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  for (const connector of flow.connectors) {
    if (connector.kind === 'async') {
      const source = flow.elements.find((element) => element.id === connector.from);
      if (flow.flowType !== 'Record-Triggered Flow' || source?.type !== 'Start') {
        errors.push(`Async path "${connector.id}" must start at a record-triggered flow's Start element.`);
      }
      if (flow.startConfig.runWhen === 'before-save') {
        errors.push(`Async path "${connector.id}" requires an after-save flow.`);
      }
      if (flow.startConfig.trigger === 'deleted') {
        errors.push(`Async path "${connector.id}" cannot be used with a delete trigger.`);
      }
      if (connector.scheduledPath) errors.push(`Async path "${connector.id}" cannot define scheduled-path settings.`);
    } else if (connector.kind === 'scheduled') {
      const source = flow.elements.find((element) => element.id === connector.from);
      if (flow.flowType !== 'Record-Triggered Flow' || source?.type !== 'Start') {
        errors.push(`Scheduled path "${connector.id}" must start at a record-triggered flow's Start element.`);
      }
      if (flow.startConfig.runWhen === 'before-save') {
        errors.push(`Scheduled path "${connector.id}" is only available for after-save flows.`);
      }
      if (flow.startConfig.trigger === 'deleted') {
        errors.push(`Scheduled path "${connector.id}" cannot be used with a delete trigger.`);
      }
      const scheduledPath = connector.scheduledPath;
      if (!scheduledPath) {
        errors.push(`Scheduled path "${connector.id}" requires a time source field and offset.`);
      } else {
        const timeSource = triggerObject?.fields.find((field) => field.apiName === scheduledPath.timeSourceFieldApiName);
        if (!timeSource || !['Date', 'DateTime'].includes(timeSource.dataType)) {
          errors.push(`Scheduled path "${connector.id}" requires a Date or DateTime field on "${flow.triggerObject ?? 'the trigger object'}".`);
        }
      }
    } else if (connector.scheduledPath) {
      errors.push(`Connector "${connector.id}" can only define scheduled-path settings when its type is scheduled.`);
    }
    if (connector.kind === 'fault' && flow.elements.find((element) => element.id === connector.from)?.type === 'Start') {
      errors.push(`Fault connector "${connector.id}" cannot originate from Start.`);
    }
  }
  if (flow.connectors.filter((connector) => connector.kind === 'async').length > 1) {
    errors.push('A record-triggered flow may have only one asynchronous path.');
  }
  const faultConnectorSources = new Set(flow.connectors.filter((connector) => connector.kind === 'fault').map((connector) => connector.from));
  for (const sourceId of faultConnectorSources) {
    if (flow.connectors.filter((connector) => connector.from === sourceId && connector.kind === 'fault').length > 1) {
      errors.push(`Element "${flow.elements.find((element) => element.id === sourceId)?.label ?? sourceId}" can have only one fault connector.`);
    }
  }
  for (const resource of flow.resources) {
    if (resource.availableForInput && !['Variable', 'Record', 'Record Collection'].includes(resource.type)) {
      errors.push(`${resource.type} resource "${resource.label}" cannot be available for input.`);
    }
    if (resource.availableForInput && resource.type === 'Variable') {
      const dataType = resource.dataType.toLowerCase();
      const supportedInputType = ['number', 'currency', 'percent'].some((type) => dataType.startsWith(type))
        || ['boolean', 'checkbox', 'date', 'date/time', 'datetime', 'time', 'text', 'string', 'email', 'phone', 'url', 'id', 'picklist', 'multi-select picklist'].includes(dataType);
      if (!supportedInputType) {
        errors.push(`Input variable "${resource.label}" uses unsupported data type "${resource.dataType}".`);
      }
    }
    if (resource.type !== 'Formula') continue;
    if (resource.availableForInput) errors.push(`Formula resource "${resource.label}" cannot be available for input.`);
    if (typeof resource.value !== 'string' || !resource.value.trim()) {
      errors.push(`Formula resource "${resource.label}" requires an expression.`);
      continue;
    }
    try {
      const syntax = validateFlowFormulaSyntax(resource.value);
      // A formula that references a live record, variable or global cannot be
      // executed against fake null inputs during activation. For a constant
      // expression preserve eager value/type checks from the runtime evaluator.
      if (!syntax.hasReferences) evaluateFormula(resource.value, () => null, {
        isNew: false, hasPrior: true, resolvePriorField: () => null,
        timeZone: formulaContext.timeZone,
        locale: formulaContext.locale,
        corporateCurrency: formulaContext.corporateCurrency,
        currencyRates: formulaContext.currencyRates
      });
    } catch (error) {
      errors.push(`Formula resource "${resource.label}" is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  validateConditionLogic(flow.startConfig.conditionLogic, 'Start', asConfigRows(flow.startConfig.entryConditions).length);
  validateConditions(flow.startConfig.entryConditions, triggerObject ?? triggerPlatformEvent, 'Start');
  const elementIds = new Set(flow.elements.map((element) => element.id));
  const adjacency = new Map<number, number[]>();
  for (const connector of flow.connectors) {
    if (!elementIds.has(connector.from) || !elementIds.has(connector.to)) errors.push(`Connector ${connector.id} references a missing element.`);
    if (flow.elements.find((element) => element.id === connector.to)?.type === 'Start') errors.push(`Connector ${connector.id} cannot point to the Start element.`);
    adjacency.set(connector.from, [...(adjacency.get(connector.from) ?? []), connector.to]);
  }
  const reachable = new Set<number>();
  const pending = starts.length === 1 ? [starts[0].id] : [];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined) continue;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(adjacency.get(id) ?? []));
  }
  for (const element of flow.elements) {
    if (element.type !== 'Start' && !reachable.has(element.id)) warnings.push(`Element "${element.label}" cannot be reached from Start.`);
  }
  if (flow.elements.length > 1 && flow.connectors.length === 0) warnings.push('Flow has multiple elements but no connectors.');
  for (const element of flow.elements) {
    if (!['Start', 'End', 'Assignment', 'Decision', 'Loop', 'Collection Filter', 'Collection Sort', 'Transform', 'Get Records', 'Create Records', 'Update Records', 'Delete Records', 'Roll Back Records', 'Publish Platform Event', 'Subflow', 'Screen', 'Wait', 'Action', 'HTTP Callout', 'Orchestration Stage'].includes(element.type)) {
      errors.push(`Flow element type "${element.type}" is not supported.`);
    }
    if (element.type === 'Create Records') {
      const recordSource = element.config.recordSource ?? 'fields';
      if (!['fields', 'collection'].includes(String(recordSource))) {
        errors.push(`Create Records "${element.label}" has an unsupported record source.`);
      }
      if (recordSource === 'collection') {
        const objectName = typeof element.config.object === 'string' ? element.config.object : '';
        const collectionName = typeof element.config.sourceCollection === 'string'
          ? element.config.sourceCollection : '';
        if (!flow.resources.some((resource) => resource.name === collectionName
          && resource.type === 'Record Collection' && resource.isCollection && resource.dataType === objectName)) {
          errors.push(`Create Records "${element.label}" requires a Record Collection of the selected object.`);
        }
        if (asConfigRows(element.config.fieldValues).length
          || (typeof element.config.field === 'string' && element.config.field)) {
          errors.push(`Create Records "${element.label}" cannot mix collection input with individual field assignments.`);
        }
        const outputName = typeof element.config.outputCollection === 'string'
          ? element.config.outputCollection : '';
        if (outputName && !flow.resources.some((resource) => resource.name === outputName
          && resource.type === 'Record Collection' && resource.isCollection
          && resource.dataType === objectName && resource.name !== collectionName)) {
          errors.push(`Create Records "${element.label}" requires a different writable output Record Collection of the same object.`);
        }
      }
    }
    // Validate literal picklist writes against Object Manager metadata before activation.
    if (element.type === 'Create Records' || element.type === 'Update Records') {
      const targetObject = objects.find((object) => object.apiName === element.config.object);
      for (const assignment of asConfigRows(element.config.fieldValues)) {
        const fieldName = typeof assignment.field === 'string' ? assignment.field : '';
        const field = targetObject?.fields.find((candidate) => candidate.apiName === fieldName);
        const value = assignment.value;
        if (field?.dataType === 'Picklist' && Array.isArray(field.picklistValues)
          && field.picklistValues.length > 0 && typeof value === 'string'
          && !value.includes('{!') && !value.startsWith('$')
          && !field.picklistValues.includes(value)) {
          errors.push(`"${element.label}" sets "${fieldName}" to inactive picklist value "${value}" on "${targetObject?.apiName}".`);
        }
      }
    }
    if (element.type === 'Publish Platform Event') {
      const eventApiName = typeof element.config.eventApiName === 'string' ? element.config.eventApiName : '';
      const event = platformEvents.find((candidate) => candidate.apiName === eventApiName);
      if (!event) errors.push(`Publish Platform Event "${element.label}" requires a valid platform event.`);
      const fieldValues = asConfigRows(element.config.fieldValues);
      const fieldNames = fieldValues.map((item) => typeof item.field === 'string' ? item.field : '');
      if (new Set(fieldNames).size !== fieldNames.length) {
        errors.push(`Publish Platform Event "${element.label}" cannot assign the same event field more than once.`);
      }
      for (const fieldName of fieldNames) {
        if (!event?.fields.some((field) => field.apiName === fieldName)) {
          errors.push(`Publish Platform Event "${element.label}" references unknown field "${fieldName}".`);
        }
      }
      if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save') {
        errors.push(`Publish Platform Event "${element.label}" is not available in before-save record-triggered flows.`);
      }
    }
    if (flow.flowType === 'Platform Event-Triggered Flow' && element.type === 'Screen') {
      errors.push(`Screen element "${element.label}" cannot be used in Platform Event-Triggered Flows.`);
    }
    if (element.type === 'Roll Back Records' && !['Screen Flow', 'Autolaunched Flow'].includes(flow.flowType)) {
      errors.push(`Roll Back Records element "${element.label}" is only available in Screen and Autolaunched Flows.`);
    }
    if (element.type === 'Screen' && flow.flowType !== 'Screen Flow') errors.push(`Screen element "${element.label}" is only supported in Screen Flows.`);
    if (element.type === 'Screen') {
      validateScreenElement({ flow, element, objects, tenantId, errors, validateConditions, validateConditionLogic, deps });
    }
    if (element.type === 'Orchestration Stage') {
      const objectApiName = String(element.config.objectApiName ?? '');
      if (!objects.some((object) => object.apiName === objectApiName)) {
        errors.push(`Orchestration Stage "${element.label}" requires an existing target object.`);
      }
      const processApiName = String(element.config.approvalProcessApiName ?? '');
      const process = approvalProcesses.find((item) => item.apiName === processApiName);
      if (processApiName && (!process || !process.active || process.objectApiName !== objectApiName)) {
        errors.push(`Orchestration Stage "${element.label}" requires an active matching approval process.`);
      }
      if (typeof element.config.recordId !== 'string' || !element.config.recordId.trim()) {
        errors.push(`Orchestration Stage "${element.label}" requires a target record ID or Flow reference.`);
      }
      if (!processApiName && (typeof element.config.approverIds !== 'string' || !element.config.approverIds.trim())) {
        errors.push(`Orchestration Stage "${element.label}" requires approvers or an approval process.`);
      }
      if (element.config.approvalMode !== undefined && !['ANY', 'ALL'].includes(String(element.config.approvalMode))) {
        errors.push(`Orchestration Stage "${element.label}" requires ANY or ALL approval mode.`);
      }
      const statusVariable = String(element.config.statusVariable ?? '');
      if (statusVariable && !flow.resources.some((resource) => resource.name === statusVariable
        && resource.type === 'Variable' && resource.dataType === 'Text' && !resource.isCollection)) {
        errors.push(`Orchestration Stage "${element.label}" requires a Text variable for its result.`);
      }
      const routes = flow.connectors.filter((connector) => connector.from === element.id && connector.kind === 'normal');
      for (const decision of ['Approved', 'Rejected']) {
        if (routes.filter((connector) => connector.label.toLowerCase() === decision.toLowerCase()).length !== 1) {
          errors.push(`Orchestration Stage "${element.label}" requires exactly one ${decision} connector.`);
        }
      }
      if (routes.length !== 2 || flow.connectors.some((connector) => connector.from === element.id && connector.kind === 'scheduled')) {
        errors.push(`Orchestration Stage "${element.label}" supports only Approved and Rejected normal paths.`);
      }
      if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save') {
        errors.push(`Orchestration Stage "${element.label}" is not available before save.`);
      }
    }
    if (element.type === 'Action') {
      const actionType = String(element.config.actionType ?? '');
      if (actionType.toLowerCase().includes('apex')) {
        errors.push(`Apex actions are excluded from this platform's Flow Builder scope.`);
      } else if (!['Send Email', 'Email Alert', 'Post to Chatter', 'Custom Notification', 'Outbound Message', 'Submit for Approval'].includes(actionType)) {
        errors.push(`Action "${element.label}" uses unsupported action type "${actionType || '(not selected)'}".`);
      } else if (actionType === 'Send Email') {
        const credentialId = typeof element.config.namedCredentialId === 'string' ? element.config.namedCredentialId : '';
        if (!credentials.some((credential) => credential.id === credentialId && credential.protocol === 'SMTP')) {
          errors.push(`Send Email action "${element.label}" requires an SMTP Named Credential.`);
        } else {
          const credential = credentials.find((item) => item.id === credentialId)!;
          const smtpHost = new URL(credential.baseUrl).hostname.replace(/^\[|\]$/g, '');
          if (!isTestLoopbackSmtpUrl(new URL(credential.baseUrl))
            && (isReservedHostname(smtpHost) || (isIP(smtpHost) && !isPublicAddress(smtpHost)))) {
            errors.push(`Send Email action "${element.label}" cannot use a local, private, or reserved SMTP host.`);
          }
        }
        const fromEmail = typeof element.config.fromEmail === 'string' ? element.config.fromEmail.trim() : '';
        if (!fromEmail || fromEmail.includes('{') || !z.string().email().safeParse(fromEmail).success) {
          errors.push(`Send Email action "${element.label}" requires a valid From email address.`);
        }
        const recipients = typeof element.config.recipients === 'string' ? element.config.recipients.trim() : '';
        if (!recipients) errors.push(`Send Email action "${element.label}" requires at least one recipient.`);
        else if (!recipients.includes('{') && recipients.split(/[;,]/).some((recipient) => !z.string().email().safeParse(recipient.trim()).success)) {
          errors.push(`Send Email action "${element.label}" contains an invalid recipient email address.`);
        }
        if (typeof element.config.subject !== 'string' || !element.config.subject.trim()) {
          errors.push(`Send Email action "${element.label}" requires a subject.`);
        }
        if (typeof element.config.body !== 'string' || !element.config.body.trim()) {
          errors.push(`Send Email action "${element.label}" requires a message body.`);
        }
      } else if (actionType === 'Outbound Message') {
        const credentialId = typeof element.config.namedCredentialId === 'string' ? element.config.namedCredentialId : '';
        if (!credentials.some((credential) => credential.id === credentialId && credential.protocol === 'HTTPS')) {
          errors.push(`Outbound Message "${element.label}" requires an HTTPS Named Credential.`);
        }
        const path = typeof element.config.path === 'string' ? element.config.path.trim() : '';
        if (!path) {
          errors.push(`Outbound Message "${element.label}" requires a relative endpoint path.`);
        } else if (path.startsWith('\\') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/')) {
          errors.push(`Outbound Message "${element.label}" path must be relative to its HTTPS Named Credential.`);
        }
        if (typeof element.config.messageBody !== 'string' || !element.config.messageBody.trim()) {
          errors.push(`Outbound Message "${element.label}" requires a JSON message body.`);
        } else {
          try {
            const parsedBody: unknown = JSON.parse(element.config.messageBody);
            if (!parsedBody || typeof parsedBody !== 'object') {
              errors.push(`Outbound Message "${element.label}" message body must be a JSON object or array.`);
            }
          } catch {
            errors.push(`Outbound Message "${element.label}" message body must be valid JSON.`);
          }
        }
      } else if (actionType === 'Custom Notification') {
        const recipientIds = typeof element.config.recipientIds === 'string' ? element.config.recipientIds.trim() : '';
        if (!recipientIds) errors.push(`Custom Notification "${element.label}" requires at least one recipient user ID or Flow reference.`);
        if (typeof element.config.title !== 'string' || !element.config.title.trim()) {
          errors.push(`Custom Notification "${element.label}" requires a title.`);
        } else if (element.config.title.length > 120) {
          errors.push(`Custom Notification "${element.label}" title cannot exceed 120 characters.`);
        }
        if (typeof element.config.messageBody !== 'string' || !element.config.messageBody.trim()) {
          errors.push(`Custom Notification "${element.label}" requires a message.`);
        } else if (element.config.messageBody.length > 2000) {
          errors.push(`Custom Notification "${element.label}" message cannot exceed 2000 characters.`);
        }
      } else if (actionType === 'Submit for Approval') {
        const objectApiName = typeof element.config.objectApiName === 'string' ? element.config.objectApiName.trim() : '';
        if (!objects.some((object) => object.apiName === objectApiName)) {
          errors.push(`Submit for Approval "${element.label}" requires a valid target object.`);
        }
        const approvalProcessApiName = typeof element.config.approvalProcessApiName === 'string'
          ? element.config.approvalProcessApiName.trim() : '';
        const approvalProcess = approvalProcesses.find((process) => process.apiName === approvalProcessApiName);
        if (approvalProcessApiName && !approvalProcess) {
          errors.push(`Submit for Approval "${element.label}" references an unknown approval process.`);
        } else if (approvalProcess && !approvalProcess.active) {
          errors.push(`Submit for Approval "${element.label}" requires an active approval process.`);
        } else if (approvalProcess && approvalProcess.objectApiName !== objectApiName) {
          errors.push(`Approval process "${approvalProcess.label}" is for "${approvalProcess.objectApiName}", not "${objectApiName}".`);
        }
        if (typeof element.config.recordId !== 'string' || !element.config.recordId.trim()) {
          errors.push(`Submit for Approval "${element.label}" requires a target record ID or Flow reference.`);
        }
        if (!approvalProcessApiName && (typeof element.config.approverIds !== 'string' || !element.config.approverIds.trim())) {
          errors.push(`Submit for Approval "${element.label}" requires at least one approver user ID or Flow reference.`);
        }
        if (element.config.comments !== undefined
          && (typeof element.config.comments !== 'string' || element.config.comments.length > 2000)) {
          errors.push(`Submit for Approval "${element.label}" comments must be at most 2000 characters.`);
        }
      } else if (actionType === 'Email Alert') {
        const emailAlertId = typeof element.config.emailAlertId === 'string' ? element.config.emailAlertId : '';
        const emailAlert = emailAlerts.find((candidate) => candidate.id === emailAlertId);
        if (!emailAlert) {
          errors.push(`Email Alert action "${element.label}" requires a saved Email Alert.`);
        } else if (flow.flowType !== 'Record-Triggered Flow' || flow.triggerObject !== emailAlert.objectApiName) {
          errors.push(`Email Alert action "${element.label}" requires a record-triggered flow on "${emailAlert.objectApiName}".`);
        }
      } else {
        const objectApiName = typeof element.config.objectApiName === 'string' ? element.config.objectApiName.trim() : '';
        const object = objects.find((candidate) => candidate.apiName === objectApiName);
        if (!object) {
          errors.push(`Post to Chatter action "${element.label}" requires a valid target object.`);
        } else if (!object.settings?.allowInChatter) {
          errors.push(`Post to Chatter action "${element.label}" requires Chatter to be enabled for "${object.label}".`);
        }
        if (typeof element.config.recordId !== 'string' || !element.config.recordId.trim()) {
          errors.push(`Post to Chatter action "${element.label}" requires a target record ID or Flow reference.`);
        }
        if (typeof element.config.message !== 'string' || !element.config.message.trim()) {
          errors.push(`Post to Chatter action "${element.label}" requires a message.`);
        } else if (element.config.message.length > 4000) {
          errors.push(`Post to Chatter action "${element.label}" message cannot exceed 4000 characters.`);
        }
      }
    }
    if (element.type === 'HTTP Callout' && flow.startConfig.runWhen === 'before-save') errors.push('HTTP Callouts are not available in before-save record-triggered flows.');
    if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save' && !['Start', 'Assignment', 'Decision'].includes(element.type)) {
      errors.push(`${element.type} element "${element.label}" is not available in before-save record-triggered flows.`);
    }
    if (element.type === 'Assignment') {
      const target = typeof element.config.variable === 'string' ? element.config.variable : '';
      const operator = String(element.config.operator ?? 'Assign');
      if (!['Assign', 'Add', 'Subtract', 'Multiply', 'Divide', 'Add At Beginning', 'Add At End', 'Remove', 'Remove All'].includes(operator)) {
        errors.push(`Assignment "${element.label}" uses unsupported operator "${operator}".`);
      }
      const recordFieldName = /^\$Record\.([A-Za-z][A-Za-z0-9_]*)$/.exec(target)?.[1];
      if (recordFieldName) {
        const field = triggerObject?.fields.find((item) => item.apiName === recordFieldName);
        if (flow.flowType !== 'Record-Triggered Flow' || flow.startConfig.runWhen !== 'before-save') {
          errors.push(`Assignment "${element.label}" can target $Record fields only in before-save record-triggered flows.`);
        } else if (!field) {
          errors.push(`Assignment "${element.label}" references unknown trigger field "${recordFieldName}".`);
        } else if (field.formula || ['AutoNumber', 'Auto Number'].includes(field.dataType)) {
          errors.push(`Assignment "${element.label}" cannot target read-only field "${recordFieldName}".`);
        }
      } else if (!flow.resources.some((resource) => resource.name === target)) {
        errors.push(`Assignment "${element.label}" references unknown variable "${target || '(not selected)'}".`);
      } else {
        const resource = flow.resources.find((item) => item.name === target);
        if (resource?.isCollection && !['Assign', 'Add', 'Add At Beginning', 'Add At End', 'Remove', 'Remove All'].includes(operator)) {
          errors.push(`Assignment "${element.label}" uses an operator unavailable for collection resource "${target}".`);
        }
        if (operator === 'Remove' && !resource?.isCollection) {
          errors.push(`Assignment "${element.label}" uses Remove on a non-collection resource.`);
        }
        if (resource && ['Formula', 'Constant', 'Choice', 'Text Template'].includes(resource.type)) {
          errors.push(`Assignment "${element.label}" cannot target ${resource.type} resource "${target}".`);
        }
      }
    }
    if (element.type === 'Wait') {
      const waitType = String(element.config.waitType ?? 'Duration');
      if (waitType === 'Specific Time') {
        const rawDateTime = typeof element.config.dateTime === 'string' ? element.config.dateTime : '';
        const timeZone = String(element.config.timeZone ?? 'UTC');
        const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(rawDateTime);
        if (explicitZone) {
          if (!isValidFlowDateTime(rawDateTime)) {
            errors.push(`Wait "${element.label}" requires a valid resume date and time.`);
          }
        } else {
          const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(rawDateTime);
          if (!match) {
            errors.push(`Wait "${element.label}" requires a valid resume date and time.`);
          } else if (!dashboardTimeZoneSchema.safeParse(timeZone).success) {
            errors.push(`Wait "${element.label}" requires a valid IANA time zone.`);
          } else {
            const [, yearText, monthText, dayText, hourText, minuteText] = match;
            const year = Number(yearText);
            const month = Number(monthText);
            const day = Number(dayText);
            const civilDate = new Date(Date.UTC(year, month - 1, day));
            if (civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1 || civilDate.getUTCDate() !== day
              || !flowLocalDateTimeToInstant(civilDate, Number(hourText), Number(minuteText), timeZone)) {
              errors.push(`Wait "${element.label}" requires a valid local resume date and time in "${timeZone}".`);
            }
          }
        }
      } else {
        const amount = Number(element.config.amount ?? 1);
        if (!Number.isFinite(amount) || amount <= 0 || !['Minutes', 'Hours', 'Days'].includes(String(element.config.unit ?? 'Hours'))) {
          errors.push(`Wait "${element.label}" requires a positive duration and supported unit.`);
        }
      }
    }
    if (element.type === 'Decision' && (!Array.isArray(element.config.outcomes) || element.config.outcomes.length === 0)) warnings.push(`Decision "${element.label}" has no configured outcomes.`);
    if (['Get Records', 'Create Records', 'Update Records', 'Delete Records'].includes(element.type) && !element.config.object) {
      errors.push(`Select an object for ${element.type} element "${element.label}".`);
    }
    const sourceCollectionName = typeof element.config.collection === 'string' ? element.config.collection : '';
    const sourceCollection = flow.resources.find((resource) => resource.name === sourceCollectionName);
    const elementObjectName = typeof element.config.object === 'string'
      ? element.config.object
      : ['Collection Filter', 'Collection Sort', 'Transform', 'Loop'].includes(element.type) && sourceCollection?.type === 'Record Collection'
        ? sourceCollection.dataType
        : undefined;
    const elementObject = elementObjectName ? objects.find((object) => object.apiName === elementObjectName) : undefined;
    if (elementObjectName && !elementObject) {
      errors.push(`Object "${elementObjectName}" on element "${element.label}" does not exist.`);
    }
    if (element.type === 'Loop') {
      const loopVariable = typeof element.config.loopVariable === 'string' ? element.config.loopVariable.trim() : '';
      const loopResource = flow.resources.find((resource) => resource.name === loopVariable);
      if (!sourceCollection || sourceCollection.type !== 'Record Collection' || !sourceCollection.isCollection || !elementObject) {
        errors.push(`Loop "${element.label}" requires a record collection with a valid object type.`);
      }
      if (!loopResource || loopResource.type !== 'Record' || loopResource.isCollection
        || loopResource.dataType !== sourceCollection?.dataType) {
        errors.push(`Loop "${element.label}" requires a record loop variable with the same object type as its collection.`);
      }
      if (element.config.direction !== undefined
        && !['First to last', 'Last to first'].includes(String(element.config.direction))) {
        errors.push(`Loop "${element.label}" direction must be First to last or Last to first.`);
      }
      const loopConnectors = flow.connectors.filter((connector) =>
        connector.from === element.id && connector.kind === 'normal');
      const forEachConnectors = loopConnectors.filter((connector) =>
        ['for each', 'next'].includes(connector.label.trim().toLowerCase()));
      const afterLastConnectors = loopConnectors.filter((connector) =>
        connector.label.trim().toLowerCase() === 'after last');
      if (loopConnectors.length !== 2 || forEachConnectors.length !== 1 || afterLastConnectors.length !== 1) {
        errors.push(`Loop "${element.label}" must have exactly one For Each and one After Last connector.`);
      }
    }
    validateConditionLogic(element.config.conditionLogic, element.label, asConfigRows(element.config.conditions).length);
    validateConditions(element.config.conditions, elementObject, element.label);
    if (element.type === 'Decision') {
      const decisionObject = objects.find((object) => object.apiName === elementObjectName) ?? triggerObject;
      for (const outcome of asConfigRows(element.config.outcomes)) {
        validateConditionLogic(outcome.conditionLogic ?? asConfigRows(outcome.conditions)[0]?.logic, `${element.label} / ${String(outcome.label ?? outcome.name ?? 'Outcome')}`, asConfigRows(outcome.conditions).length);
        validateConditions(outcome.conditions, decisionObject, `${element.label} / ${String(outcome.label ?? outcome.name ?? 'Outcome')}`);
      }
    }
    if (['Create Records', 'Update Records'].includes(element.type)) {
      for (const fieldValue of asConfigRows(element.config.fieldValues)) {
        const fieldName = typeof fieldValue.field === 'string' ? fieldValue.field : '';
        if (!fieldName) errors.push(`A field assignment on "${element.label}" is missing its field.`);
        else if (elementObject && !elementObject.fields.some((field) => field.apiName === fieldName)) errors.push(`Field "${fieldName}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
      }
    }
    if (element.type === 'Get Records' && element.config.sortField && elementObject && !elementObject.fields.some((field) => field.apiName === element.config.sortField)) {
      errors.push(`Sort field "${String(element.config.sortField)}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
    }
    if (element.type === 'Get Records') {
      const limit = String(element.config.recordLimit ?? '1');
      if (limit !== 'all' && (!/^[1-9][0-9]*$/.test(limit) || Number(limit) > 200)) {
        errors.push(`Get Records "${element.label}" limit must be all or an integer from 1 through 200.`);
      }
    }
    if (element.type === 'Get Records' && element.config.sortOrder !== undefined && !['Ascending', 'Descending'].includes(String(element.config.sortOrder))) {
      errors.push(`Sort order on "${element.label}" must be Ascending or Descending.`);
    }
    if (element.type === 'Get Records' && Array.isArray(element.config.fields)) {
      if (!element.config.fields.length) errors.push(`Select at least one field to store on "${element.label}".`);
      const selectedFields = element.config.fields.filter((field): field is string => typeof field === 'string');
      if (selectedFields.length !== element.config.fields.length || new Set(selectedFields).size !== selectedFields.length) {
        errors.push(`Fields to store on "${element.label}" must be unique field API names.`);
      }
      for (const fieldName of selectedFields) {
        if (elementObject && !elementObject.fields.some((field) => field.apiName === fieldName)) {
          errors.push(`Field "${fieldName}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
        }
      }
    } else if (element.type === 'Get Records' && element.config.fields !== undefined && typeof element.config.fields !== 'string') {
      errors.push(`Fields to store on "${element.label}" must be "all" or a list of field API names.`);
    }
    if (element.type === 'Get Records' && typeof element.config.outputVariable === 'string' && element.config.outputVariable) {
      const resource = flow.resources.find((item) => item.name === element.config.outputVariable);
      const expectedType = element.config.recordLimit === 'all' || Number(element.config.recordLimit ?? 1) > 1 ? 'Record Collection' : 'Record';
      if (!resource || resource.type !== expectedType || resource.dataType !== elementObjectName) {
        errors.push(`Output variable "${element.config.outputVariable}" on "${element.label}" must be a ${expectedType} resource.`);
      }
    }
    if (element.type === 'Subflow') {
      const childApiName = typeof element.config.flowApiName === 'string' ? element.config.flowApiName : '';
      const childFlow = activeFlowDefinition(allFlows.find((candidate) => candidate.apiName === childApiName));
      if (!childFlow || childFlow.status !== 'Active' || childFlow.flowType !== 'Autolaunched Flow') {
        errors.push(`Subflow "${element.label}" must reference an active autolaunched flow.`);
      } else {
        try {
          for (const mapping of parseSubflowMappings(element.config.inputValues, element.label, 'input')) {
            const childInput = childFlow.resources.find((resource) => resource.name === mapping.source && resource.availableForInput);
            if (!childInput) {
              errors.push(`Subflow "${element.label}" input "${mapping.source}" is not an available input on "${childFlow.label}".`);
            }
            const reference = /^\{!?([A-Za-z_$][A-Za-z0-9_.$]*)\}$/.exec(mapping.target);
            const parentResourceName = reference?.[1].split('.')[0];
            if (parentResourceName && !parentResourceName.startsWith('$')
              && !flow.resources.some((resource) => resource.name === parentResourceName)) {
              errors.push(`Subflow "${element.label}" input mapping references undefined parent resource "${parentResourceName}".`);
            }
          }
          for (const mapping of parseSubflowMappings(element.config.outputValues, element.label, 'output')) {
            const childOutput = childFlow.resources.find((resource) => resource.name === mapping.source && resource.availableForOutput);
            if (!childOutput) {
              errors.push(`Subflow "${element.label}" output "${mapping.source}" is not an available output on "${childFlow.label}".`);
              continue;
            }
            const parentOutput = flow.resources.find((resource) => resource.name === mapping.target);
            if (!parentOutput || ['Formula', 'Constant', 'Choice', 'Text Template'].includes(parentOutput.type)) {
              errors.push(`Subflow "${element.label}" output mapping target "${mapping.target}" must be a writable parent resource.`);
            } else if (parentOutput.dataType !== childOutput.dataType || parentOutput.isCollection !== childOutput.isCollection) {
              errors.push(`Subflow "${element.label}" output "${mapping.source}" is incompatible with parent resource "${mapping.target}".`);
            }
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Subflow "${element.label}" has invalid mappings.`);
        }
      }
    }
    if (element.type === 'Collection Filter' || element.type === 'Collection Sort') {
      const outputName = typeof element.config.outputCollection === 'string' ? element.config.outputCollection : '';
      const output = flow.resources.find((resource) => resource.name === outputName);
      if (!sourceCollection || sourceCollection.type !== 'Record Collection' || !elementObject) {
        errors.push(`${element.type} "${element.label}" requires a record collection whose data type is an existing object.`);
      }
      if (!output || output.type !== 'Record Collection' || output.name === sourceCollectionName
        || output.dataType !== sourceCollection?.dataType) {
        errors.push(`${element.type} "${element.label}" requires a different output collection with the same record type.`);
      }
      if (element.type === 'Collection Filter' && !asConfigRows(element.config.conditions).length) {
        errors.push(`Collection Filter "${element.label}" requires at least one condition.`);
      }
      if (element.type === 'Collection Sort') {
        const sortField = typeof element.config.sortField === 'string' ? element.config.sortField : '';
        if (!sortField) {
          errors.push(`Collection Sort "${element.label}" requires a sort field.`);
        } else if (elementObject && !elementObject.fields.some((field) => field.apiName === sortField)) {
          errors.push(`Sort field "${sortField}" on "${element.label}" does not exist on "${elementObject.apiName}".`);
        }
        if (element.config.sortOrder !== undefined && !['Ascending', 'Descending'].includes(String(element.config.sortOrder))) {
          errors.push(`Collection Sort "${element.label}" sort order must be Ascending or Descending.`);
        }
      }
    }
    if (String(element.type) === 'Transform') {
      const outputName = typeof element.config.outputCollection === 'string' ? element.config.outputCollection : '';
      const output = flow.resources.find((resource) => resource.name === outputName);
      const sourceObject = objects.find((object) => object.apiName === sourceCollection?.dataType);
      const targetObject = objects.find((object) => object.apiName === output?.dataType);
      if (!sourceCollection || sourceCollection.type !== 'Record Collection' || !sourceObject) {
        errors.push(`Transform "${element.label}" requires a source record collection with a valid object type.`);
      }
      if (!output || output.type !== 'Record Collection' || output.name === sourceCollectionName || !targetObject) {
        errors.push(`Transform "${element.label}" requires a different output record collection with a valid object type.`);
      }
      const mappings = asConfigRows(element.config.mappings);
      if (!mappings.length) errors.push(`Transform "${element.label}" requires at least one field mapping.`);
      const mappedTargets = new Set<string>();
      for (const mapping of mappings) {
        const sourceField = typeof mapping.sourceField === 'string' ? mapping.sourceField : '';
        const targetField = typeof mapping.targetField === 'string' ? mapping.targetField : '';
        if (!sourceField || (sourceObject && !sourceObject.fields.some((field) => field.apiName === sourceField))) {
          errors.push(`Transform "${element.label}" references a missing source field "${sourceField}".`);
        }
        if (!targetField || (targetObject && !targetObject.fields.some((field) => field.apiName === targetField))) {
          errors.push(`Transform "${element.label}" references a missing target field "${targetField}".`);
        }
        if (targetField && mappedTargets.has(targetField)) {
          errors.push(`Transform "${element.label}" maps more than one source field to "${targetField}".`);
        }
        if (targetField) mappedTargets.add(targetField);
      }
    }
    if (element.type === 'Decision') {
      const outcomes = asConfigRows(element.config.outcomes);
      const outcomeLabels = outcomes.map((outcome) => String(outcome.label ?? '').trim().toLowerCase());
      const outcomeNames = outcomes.map((outcome) => String(outcome.name ?? '').trim().toLowerCase());
      if (outcomeLabels.some((label) => !label)
        || new Set(outcomeLabels).size !== outcomeLabels.length
        || new Set(outcomeNames).size !== outcomeNames.length) {
        errors.push(`Decision "${element.label}" outcomes must have unique, non-empty labels and API names.`);
      }
      const defaultOutcomes = outcomes.filter((outcome) => outcome.name === 'Default');
      if (defaultOutcomes.length !== 1) {
        errors.push(`Decision "${element.label}" must have exactly one default outcome.`);
      }
      const decisionConnectors = flow.connectors.filter((connector) =>
        connector.from === element.id && connector.kind === 'normal');
      for (const outcome of outcomes) {
        const label = String(outcome.label ?? '').trim().toLowerCase();
        const name = String(outcome.name ?? '').trim().toLowerCase();
        const matchingConnectors = decisionConnectors.filter((connector) => {
          const connectorLabel = connector.label.trim().toLowerCase();
          return connectorLabel && (connectorLabel === label || connectorLabel === name);
        });
        if (matchingConnectors.length !== 1) {
          errors.push(`Decision "${element.label}" outcome "${String(outcome.label ?? outcome.name ?? '')}" must have exactly one connector.`);
        }
      }
      for (const connector of decisionConnectors) {
        const connectorLabel = connector.label.trim().toLowerCase();
        const matchingOutcomes = outcomes.filter((outcome) =>
          connectorLabel && (connectorLabel === String(outcome.label ?? '').trim().toLowerCase()
            || connectorLabel === String(outcome.name ?? '').trim().toLowerCase()));
        if (matchingOutcomes.length !== 1) {
          errors.push(`Decision connector "${connector.id}" does not match exactly one outcome on "${element.label}".`);
        }
      }
      for (const outcome of outcomes.filter((candidate) => candidate.name !== 'Default')) {
        const conditions = asConfigRows(outcome.conditions);
        if (!conditions.length) errors.push(`Decision outcome "${String(outcome.label ?? 'Unknown')}" on "${element.label}" requires at least one condition.`);
      }
    }
    if (element.type === 'HTTP Callout') {
      const connectionId = typeof element.config.integrationConnectionId === 'string' ? element.config.integrationConnectionId : '';
      const credentialId = typeof element.config.namedCredentialId === 'string' ? element.config.namedCredentialId : '';
      const connectionResource = typeof element.config.integrationConnectionResource === 'string' ? element.config.integrationConnectionResource.trim() : '';
      const credentialResource = typeof element.config.namedCredentialResource === 'string' ? element.config.namedCredentialResource.trim() : '';
      const resourceBindingPattern = /^\{!?[A-Za-z_$][A-Za-z0-9_$.]*\}$/;
      if (connectionResource && !resourceBindingPattern.test(connectionResource)) {
        errors.push(`Integration Connection resource on HTTP Callout "${element.label}" must be a Flow resource reference.`);
      }
      if (credentialResource && !resourceBindingPattern.test(credentialResource)) {
        errors.push(`Named Credential resource on HTTP Callout "${element.label}" must be a Flow resource reference.`);
      }
      if (connectionResource && credentialResource) {
        errors.push(`HTTP Callout "${element.label}" cannot use both dynamic Integration Connection and Named Credential resources.`);
      }
      const selectedConnection = connectionResource ? undefined : integrationConnections.find((connection) => connection.id === connectionId && connection.status === 'ACTIVE');
      const selectedDefinition = selectedConnection
        ? connectorDefinitions.find((definition) => definition.connectorKey === selectedConnection.connectorKey && definition.status === 'ACTIVE')
        : undefined;
      if (!connectionResource && connectionId && (!selectedConnection || !selectedDefinition)) {
        errors.push(`Select an active Integration Connection for HTTP Callout "${element.label}".`);
      } else if (!connectionResource && !credentialResource && !connectionId && !credentials.some((credential) => credential.id === credentialId)) {
        errors.push(`Select an existing Named Credential or bind a credential resource for HTTP Callout "${element.label}".`);
      }
      const operationName = typeof element.config.operation === 'string' ? element.config.operation : '';
      const operation = operationName && selectedDefinition ? selectedDefinition.operations[operationName] : undefined;
      if (operationName && !operation) errors.push(`HTTP Callout "${element.label}" selects an operation not defined by its provider.`);
      const calloutPath = typeof element.config.path === 'string' && element.config.path.trim()
        ? element.config.path.trim()
        : operation?.path ?? '';
      if (!calloutPath) errors.push(`Set a relative resource path or choose a provider operation for HTTP Callout "${element.label}".`);
      else if (calloutPath.startsWith('\\') || calloutPath.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(calloutPath)
        || (calloutPath.startsWith('/') && calloutPath !== operation?.path)) {
        errors.push(`HTTP Callout "${element.label}" path must remain a relative provider path.`);
      }
      if (element.config.url !== undefined) errors.push(`HTTP Callout "${element.label}" cannot store a raw URL; select a Named Credential or Integration Connection.`);
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(element.config.method ?? 'GET'))) {
        errors.push(`HTTP Callout "${element.label}" uses an unsupported HTTP method.`);
      }
      if (element.config.timeoutMs !== undefined && element.config.timeoutMs !== '' && (!Number.isInteger(Number(element.config.timeoutMs)) || Number(element.config.timeoutMs) < 1000 || Number(element.config.timeoutMs) > 120000)) {
        errors.push(`HTTP Callout "${element.label}" timeout must be between 1,000 and 120,000 milliseconds.`);
      }
      if (element.config.onError !== undefined && !['FAULT_PATH', 'FAIL', 'CONTINUE'].includes(String(element.config.onError))) {
        errors.push(`HTTP Callout "${element.label}" has an unsupported On Error behavior.`);
      }
      if (element.config.queryParameters !== undefined && typeof element.config.queryParameters !== 'string') {
        errors.push(`HTTP Callout "${element.label}" query parameters must be configured as JSON text.`);
      } else if (typeof element.config.queryParameters === 'string' && element.config.queryParameters.trim()) {
        try {
          const queryParameters: unknown = JSON.parse(element.config.queryParameters);
          if (!queryParameters || typeof queryParameters !== 'object' || Array.isArray(queryParameters)) {
            errors.push(`HTTP Callout "${element.label}" query parameters must be a JSON object.`);
          }
        } catch {
          errors.push(`HTTP Callout "${element.label}" query parameters must be valid JSON.`);
        }
      }
      if (element.config.responseMapping !== undefined && typeof element.config.responseMapping !== 'string') {
        errors.push(`HTTP Callout "${element.label}" response mapping must be configured as JSON text.`);
      } else if (typeof element.config.responseMapping === 'string' && element.config.responseMapping.trim()) {
        try {
          const responseMapping: unknown = JSON.parse(element.config.responseMapping);
          if (!responseMapping || typeof responseMapping !== 'object' || Array.isArray(responseMapping)
            || Object.values(responseMapping).some((path) => typeof path !== 'string')) {
            errors.push(`HTTP Callout "${element.label}" response mapping must be a JSON object of output names to response paths.`);
          }
        } catch {
          errors.push(`HTTP Callout "${element.label}" response mapping must be valid JSON.`);
        }
      }
      if (element.config.headers !== undefined && typeof element.config.headers !== 'string') {
        errors.push(`HTTP Callout "${element.label}" headers must be configured as header-name: value lines.`);
      }
      if (typeof element.config.headers === 'string') {
        for (const line of element.config.headers.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
          const separator = line.indexOf(':');
          const name = separator > 0 ? line.slice(0, separator).trim() : '';
          if (!name || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)
            || ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
            errors.push(`HTTP Callout "${element.label}" contains an invalid or restricted request header.`);
            break;
          }
        }
      }
      for (const variableKey of ['responseVariable', 'statusVariable']) {
        const variableName = typeof element.config[variableKey] === 'string' ? element.config[variableKey] as string : '';
        if (variableName && !flow.resources.some((resource) => resource.name === variableName && resource.type !== 'Constant')) {
          errors.push(`Output variable "${variableName}" on HTTP Callout "${element.label}" must be a non-constant resource defined in Manager.`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}


  return validateFlow;
}
