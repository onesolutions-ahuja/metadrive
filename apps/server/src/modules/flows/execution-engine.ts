// Metadata-driven Flow executor, hosted by the shared Flow runtime.
// @ts-nocheck - legacy runtime contracts must be migrated to typed shared interfaces.
export function createFlowExecutionEngine(dependencies: Record<string, any>) {
  const { activeFlowDefinition, appendFieldHistory, applyConnectorLifecycle, applyFlowCollectionAssignment, applyRecordDefaults, asConfigRows, assertConnectorLifecycleAccess, assertFieldEditPermissions, assertFlowRuntimeAdmission, calculateFormulaFields, createFlowInterview, deleteRecordCascade, disableOnConnectorUninstall, effectivePermissions, executeFlow, flowConditionsMatch, flowFieldValues, flowInterviewIdentity, flowLocalDateTimeToInstant, flowNeedsRollbackSnapshot, flowPackageAdmission, flowVariablesForUser, formulaContextForUser, hasFieldPermission, hasObjectPermission, hasRecordAccess, hasRecordTypeAccessForUser, isValidFlowDateTime, mapHttpCalloutResponse, normalizeFlowRecordAssignments, normalizeRuntimeValues, numericFieldValueError, parseSubflowMappings, performCustomNotification, performEmailAlert, performHttpCallout, performPostToChatter, performSendEmail, performSubmitForApproval, prepareFlowCreateCollection, principalForUser, resolveFlowValue, runBeforeSaveRecordTriggeredFlows, runRecordTriggeredFlows, sanitizeRecordForRead, scheduledPathTimestamp, stampRecordAuditFields, validateRelationshipReparenting, validateRuntimeRecord, state, installableAppCatalog, randomUUID, dashboardTimeZoneSchema, platformEventMessageSchema } = dependencies;
async function executeFlowImplementation(
  flow: FlowMetadata,
  tenant: TenantData,
  tenantId: string,
  currentUserId: string,
  input: Record<string, unknown> = {},
  record?: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  resume?: { startAt: number; variables: Record<string, unknown>; interviewGuid?: string; interviewStartTime?: string },
  triggerDepth = 0,
  recordEvent?: RecordEvent,
  isClone = false,
  parentInterview?: { interviewGuid: string; interviewStartTime: string },
  allowDraftExecution = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  // Rollback inside a subflow must restore parent DML, so take a single snapshot
  // when the executed flow or any referenced child contains Roll Back Records.
  rollbackSnapshot: TenantData | undefined = flowNeedsRollbackSnapshot(flow, tenant.flows)
    ? structuredClone(tenant) : undefined
): Promise<FlowExecutionResult> {
  if (depth > 10) throw new Error('Flow subflow nesting exceeded the 10-level limit.');
  if (flow.status !== 'Active' && !allowDraftExecution) throw new Error(`Flow "${flow.label}" is not active.`);
  const runningUser = platformStore.state.users.find((user) => user.id === currentUserId
    && user.tenantId === tenantId && !user.disabled);
  if (!runningUser) throw new Error('The Flow running user is not available in this tenant.');
  const runningPrincipal = principalForUser(runningUser, tenant);
  // All dispatchers converge here: manual, scheduled, trigger, subflow and resume.
  // The running identity must already be a live tenant member (checked above).
  // Action/record permissions continue to be checked by OneEngine at each step.
  const appAdmission = flowPackageAdmission(
    flow.apiName, installableAppCatalog.packages,
    tenant.records.Connector_App__c ?? []
  );
  assertFlowRuntimeAdmission({
    tenantId, principalTenantId: runningPrincipal.tenantId,
    principalId: runningPrincipal.userId,
    status: flow.status, allowDraftExecution,
    ...appAdmission
  });
  const interviewGuid = resume?.interviewGuid ?? parentInterview?.interviewGuid ?? randomUUID();
  const interviewStartTime = resume?.interviewStartTime ?? parentInterview?.interviewStartTime ?? new Date().toISOString();
  const context: FlowRuntimeContext = {
    record, prior, recordEvent, isClone, triggerObjectName: flow.triggerObject ?? undefined,
    currentUserId, resourceDefinitions: flow.resources, formulaStack: new Set(),
    debug: debugExecution, debugTrace, rollbackSnapshot,
    ...formulaContextForUser(tenant, currentUserId),
    flowVariables: flowVariablesForUser(tenant, currentUserId, interviewGuid, interviewStartTime),
    variables: { ...Object.fromEntries(flow.resources.map((resource) => [resource.name, resource.value])), ...resume?.variables }
  };
  for (const resource of flow.resources) {
    if (resource.availableForInput && !['Variable', 'Record', 'Record Collection'].includes(resource.type)) {
      throw new Error(`${resource.type} resource "${resource.label}" cannot be available for input.`);
    }
    if (resource.availableForInput && Object.hasOwn(input, resource.name)) context.variables[resource.name] = input[resource.name];
  }
  const unexpectedInput = Object.keys(input).find((name) => !flow.resources.some((resource) => resource.name === name && resource.availableForInput));
  if (unexpectedInput) throw new Error(`Resource "${unexpectedInput}" is not available for input in flow "${flow.label}".`);
  const loopPositions = new Map<number, { items: unknown[]; index: number }>();
  const starts = flow.elements.filter((element) => element.type === 'Start');
  if (starts.length !== 1) throw new Error(`Flow "${flow.label}" must have exactly one Start element.`);
  let currentId: number | undefined = resume?.startAt ?? starts[0].id;
  let steps = 0;
  while (currentId !== undefined) {
    if (++steps > 1000) throw new Error(`Flow "${flow.label}" exceeded the 1,000-step execution limit.`);
    const element = flow.elements.find((candidate) => candidate.id === currentId);
    if (!element) throw new Error(`Flow "${flow.label}" references missing element ${currentId}.`);
    if (debugExecution) debugTrace.push({ flowApiName: flow.apiName, elementId: element.id, type: element.type, label: element.label });
    const config = element.config;
    let nextConnectors = flow.connectors.filter((connector) => connector.from === element.id && connector.kind === 'normal');
    try {
      switch (element.type) {
      case 'Start':
        if (flow.flowType === 'Record-Triggered Flow' && context.record) {
          for (const connector of flow.connectors.filter((item) => item.from === element.id && ['scheduled', 'async'].includes(item.kind))) {
            let waitUntil = new Date();
            if (connector.kind === 'scheduled') {
              const schedule = connector.scheduledPath;
              if (!schedule) throw new Error(`Scheduled path "${connector.id}" is missing its configuration.`);
              const field = tenant.objects.find((object) => object.apiName === flow.triggerObject)
                ?.fields.find((item) => item.apiName === schedule.timeSourceFieldApiName);
              const scheduledAt = scheduledPathTimestamp(
                field, context.record[schedule.timeSourceFieldApiName], context.timeZone ?? 'UTC',
                schedule.offsetAmount, schedule.offsetUnit
              );
              if (!scheduledAt) continue;
              waitUntil = scheduledAt;
            }
            // Each queued branch is a separate durable execution. Reusing the triggering
            // interview identity causes duplicate IDs when a Start has multiple paths.
            tenant.interviews.push(createFlowInterview(flow, currentUserId, {
              status: 'waiting',
              kind: connector.kind === 'async' ? 'async' : 'scheduled',
              waitUntil: waitUntil.toISOString(),
              nextElementId: connector.to,
              variables: structuredClone(context.variables),
              interviewGuid: randomUUID(),
              interviewStartTime: new Date().toISOString(),
              record: structuredClone(context.record),
              prior: context.prior ? structuredClone(context.prior) : undefined,
              recordEvent: context.recordEvent,
              isClone: context.isClone,
              debugTrace: context.debugTrace ?? []
            }));
          }
        }
        break;
      case 'End':
      case 'Assignment': {
        if (element.type === 'Assignment') {
          const variable = typeof config.variable === 'string' ? config.variable : '';
          const recordFieldName = /^\$Record\.([A-Za-z][A-Za-z0-9_]*)$/.exec(variable)?.[1];
          const recordField = recordFieldName ? tenant.objects.find((item) => item.apiName === flow.triggerObject)?.fields.find((item) => item.apiName === recordFieldName) : undefined;
          if (recordFieldName && (flow.flowType !== 'Record-Triggered Flow' || flow.startConfig.runWhen !== 'before-save'
            || !context.record || !recordField || recordField.formula || ['AutoNumber', 'Auto Number'].includes(recordField.dataType))) {
            throw new Error(`Assignment "${element.label}" cannot modify record field "${recordFieldName}" in this flow.`);
          }
          if (!recordFieldName && (!variable || !Object.hasOwn(context.variables, variable))) {
            throw new Error(`Assignment "${element.label}" references an unknown variable.`);
          }
          const variableResource = flow.resources.find((resource) => resource.name === variable);
          if (!recordFieldName && variableResource && ['Formula', 'Constant', 'Choice', 'Text Template'].includes(variableResource.type)) {
            throw new Error(`Assignment "${element.label}" cannot modify a ${variableResource.type} resource.`);
          }
          const previous = recordFieldName ? context.record?.[recordFieldName] : context.variables[variable];
          const value = resolveFlowValue(config.value, context);
          const assign = (next: unknown) => {
            if (recordFieldName && context.record) context.record[recordFieldName] = next;
            else context.variables[variable] = next;
          };
          if (variableResource?.isCollection) {
            assign(applyFlowCollectionAssignment(previous, value, String(config.operator ?? 'Assign'), variableResource.type));
          } else {
          switch (String(config.operator ?? 'Assign')) {
            case 'Assign': assign(value); break;
            case 'Add': assign(Number(previous ?? 0) + Number(value)); break;
            case 'Subtract': assign(Number(previous ?? 0) - Number(value)); break;
            case 'Multiply': assign(Number(previous ?? 0) * Number(value)); break;
            case 'Divide':
              if (Number(value) === 0) throw new Error(`Assignment "${element.label}" cannot divide by zero.`);
              assign(Number(previous ?? 0) / Number(value));
              break;
            case 'Add At Beginning': assign(`${String(value ?? '')}${String(previous ?? '')}`); break;
            case 'Add At End': assign(`${String(previous ?? '')}${String(value ?? '')}`); break;
            case 'Remove All': assign(''); break;
            default: throw new Error(`Unsupported assignment operator "${String(config.operator)}".`);
          }
          }

        }
        break;
      }
      case 'Roll Back Records': {
        Object.assign(tenant, structuredClone(context.rollbackSnapshot ?? tenant));
        const findRestoredRecord = (id: string): RuntimeRecord | undefined =>
          Object.values(tenant.records).flat().find((item) => item.Id === id);
        if (context.record?.Id) {
          context.record = findRestoredRecord(context.record.Id);
        }
        if (context.prior?.Id) {
          context.prior = findRestoredRecord(context.prior.Id);
        }
        break;
      }
      case 'Decision': {
        const outcomes = asConfigRows(config.outcomes);
        let selected: Record<string, unknown> | undefined;
        const source = context.record ?? {};
        for (const outcome of outcomes.filter((item) => item.name !== 'Default')) {
          if (flowConditionsMatch(asConfigRows(outcome.conditions), source, context, outcome.conditionLogic)) {
            selected = outcome;
            break;
          }
        }
        selected ??= outcomes.find((item) => item.name === 'Default');
        if (selected) {
          const routeLabels = [selected.label, selected.name]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim().toLowerCase());
          nextConnectors = nextConnectors.filter((connector) => routeLabels.includes(connector.label.trim().toLowerCase()));
        } else {
          nextConnectors = [];
        }
        break;
      }
      case 'Collection Filter':
      case 'Collection Sort': {
        const collectionName = typeof config.collection === 'string' ? config.collection : '';
        const outputName = typeof config.outputCollection === 'string' ? config.outputCollection : '';
        const sourceResource = flow.resources.find((resource) => resource.name === collectionName);
        const outputResource = flow.resources.find((resource) => resource.name === outputName);
        const source = context.variables[collectionName];
        if (!sourceResource || sourceResource.type !== 'Record Collection' || !Array.isArray(source)) {
          throw new Error(`${element.type} "${element.label}" requires a record collection variable.`);
        }
        if (!outputResource || outputResource.type !== 'Record Collection' || outputName === collectionName
          || outputResource.dataType !== sourceResource.dataType) {
          throw new Error(`${element.type} "${element.label}" requires a different output record collection of the same object type.`);
        }
        if (source.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
          throw new Error(`${element.type} "${element.label}" can only process collections of records.`);
        }
        if (element.type === 'Collection Filter') {
          const conditions = asConfigRows(config.conditions);
          if (!conditions.length) throw new Error(`Collection Filter "${element.label}" requires at least one condition.`);
          context.variables[outputName] = source.filter((item) =>
            flowConditionsMatch(conditions, item as Record<string, unknown>, context, config.conditionLogic));
        } else {
          const field = typeof config.sortField === 'string' ? config.sortField : '';
          if (!field) throw new Error(`Collection Sort "${element.label}" requires a sort field.`);
          const direction = String(config.sortOrder ?? 'Ascending');
          if (!['Ascending', 'Descending'].includes(direction)) throw new Error(`Collection Sort "${element.label}" has an unsupported sort order.`);
          const descending = direction === 'Descending';
          context.variables[outputName] = source.map((item, index) => ({ item: item as Record<string, unknown>, index }))
            .sort((left, right) => {
              const leftValue = left.item[field];
              const rightValue = right.item[field];
              if (leftValue === null || leftValue === undefined || leftValue === '') {
                return rightValue === null || rightValue === undefined || rightValue === '' ? left.index - right.index : 1;
              }
              if (rightValue === null || rightValue === undefined || rightValue === '') return -1;
              const leftNumber = typeof leftValue === 'number' ? leftValue : Number(leftValue);
              const rightNumber = typeof rightValue === 'number' ? rightValue : Number(rightValue);
              const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
                ? leftNumber - rightNumber
                : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' });
              return (descending ? -comparison : comparison) || left.index - right.index;
            })
            .map(({ item }) => item);
        }
        break;
      }
      case 'Transform': {
        const collectionName = typeof config.collection === 'string' ? config.collection : '';
        const outputName = typeof config.outputCollection === 'string' ? config.outputCollection : '';
        const sourceResource = flow.resources.find((resource) => resource.name === collectionName);
        const outputResource = flow.resources.find((resource) => resource.name === outputName);
        const source = context.variables[collectionName];
        const sourceObject = tenant.objects.find((object) => object.apiName === sourceResource?.dataType);
        const targetObject = tenant.objects.find((object) => object.apiName === outputResource?.dataType);
        if (!sourceResource || sourceResource.type !== 'Record Collection' || !sourceObject || !Array.isArray(source)) {
          throw new Error(`Transform "${element.label}" requires a source record collection.`);
        }
        if (!outputResource || outputResource.type !== 'Record Collection' || outputName === collectionName || !targetObject) {
          throw new Error(`Transform "${element.label}" requires a different output record collection with a valid object type.`);
        }
        if (source.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
          throw new Error(`Transform "${element.label}" can only process collections of records.`);
        }
        const mappings = asConfigRows(config.mappings);
        if (!mappings.length) throw new Error(`Transform "${element.label}" requires at least one field mapping.`);
        const targetFields = new Set<string>();
        for (const mapping of mappings) {
          const sourceField = typeof mapping.sourceField === 'string' ? mapping.sourceField : '';
          const targetField = typeof mapping.targetField === 'string' ? mapping.targetField : '';
          if (!sourceField || !sourceObject.fields.some((field) => field.apiName === sourceField)) {
            throw new Error(`Transform "${element.label}" references an unavailable source field.`);
          }
          if (!targetField || !targetObject.fields.some((field) => field.apiName === targetField) || targetFields.has(targetField)) {
            throw new Error(`Transform "${element.label}" has a missing, invalid, or duplicate target field.`);
          }
          targetFields.add(targetField);
        }
        context.variables[outputName] = source.map((item) => Object.fromEntries(mappings.map((mapping) => {
          const sourceField = String(mapping.sourceField);
          const targetField = String(mapping.targetField);
          return [targetField, (item as Record<string, unknown>)[sourceField] ?? null];
        })));
        break;
      }
      case 'Loop': {
        const collectionName = typeof config.collection === 'string' ? config.collection : '';
        const loopVariable = typeof config.loopVariable === 'string' ? config.loopVariable.trim() : '';
        const collection = context.variables[collectionName];
        if (!collectionName || !loopVariable || !Array.isArray(collection)) {
          throw new Error(`Loop "${element.label}" requires a collection variable and a loop variable.`);
        }
        let position = loopPositions.get(element.id);
        if (!position) {
          const items = String(config.direction ?? 'First to last') === 'Last to first' ? [...collection].reverse() : [...collection];
          position = { items, index: 0 };
        } else {
          position.index += 1;
        }
        if (position.index >= position.items.length) {
          loopPositions.delete(element.id);
          nextConnectors = nextConnectors.filter((connector) => connector.label.toLowerCase().includes('after last'));
        } else {
          loopPositions.set(element.id, position);
          context.variables[loopVariable] = position.items[position.index];
          nextConnectors = nextConnectors.filter((connector) =>
            connector.label.toLowerCase().includes('for each') || connector.label.toLowerCase().includes('next'));
        }
        break;
      }
      case 'Publish Platform Event': {
        const eventApiName = typeof config.eventApiName === 'string' ? config.eventApiName : '';
        const event = tenant.platformEvents.find((candidate) => candidate.apiName === eventApiName);
        if (!event) throw new Error(`Publish Platform Event "${element.label}" references an unknown platform event.`);
        const assignments = flowFieldValues(config, context);
        const fieldsByName = new Map(event.fields.map((field) => [field.apiName, field]));
        for (const [fieldName, value] of Object.entries(assignments)) {
          const field = fieldsByName.get(fieldName);
          if (!field) throw new Error(`Platform event "${event.label}" does not contain field "${fieldName}".`);
          if (value === undefined || value === null || value === '') continue;
          if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType)) {
            const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
            if (!Number.isFinite(numeric)) throw new Error(`Platform event field "${fieldName}" must contain a valid number.`);
            const numericError = numericFieldValueError(field.dataType, numeric);
            if (numericError) throw new Error(`Platform event field "${fieldName}" ${numericError.toLocaleLowerCase()}`);
            assignments[fieldName] = numeric;
          } else if (field.dataType === 'Checkbox' && typeof value !== 'boolean') {
            throw new Error(`Platform event field "${fieldName}" must be true or false.`);
          } else if (['Text', 'Long Text Area', 'Picklist'].includes(field.dataType.split('(')[0])) {
            if (typeof value !== 'string') throw new Error(`Platform event field "${fieldName}" must contain text.`);
            const limit = Number(field.dataType.match(/^Text\((\d+)\)$/)?.[1]
              ?? (field.dataType.startsWith('Long Text Area') ? 131072 : 255));
            if (value.length > limit) throw new Error(`Platform event field "${fieldName}" exceeds its ${limit} character limit.`);
            if (field.dataType === 'Picklist' && field.picklistRestricted
              && field.picklistValues && !field.picklistValues.includes(value)) {
              throw new Error(`Platform event field "${fieldName}" must use a configured picklist value.`);
            }
          } else if (field.dataType === 'Date' && (typeof value !== 'string'
            || !/^\d{4}-\d{2}-\d{2}$/.test(value)
            || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
            || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value)) {
            throw new Error(`Platform event field "${fieldName}" must contain a valid date.`);
          } else if (field.dataType === 'DateTime' && (typeof value !== 'string' || !isValidFlowDateTime(value))) {
            throw new Error(`Platform event field "${fieldName}" must contain a valid date and time.`);
          }
        }
        if (tenant.platformEventMessages.filter((message) =>
          message.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).length >= 10_000) {
          throw new Error('Platform event delivery queue is full; retry after pending events are processed.');
        }
        const now = new Date().toISOString();
        const eventUuid = randomUUID();
        const payload: RuntimeRecord = {
          ...assignments,
          Id: eventUuid,
          EventUuid: eventUuid,
          ReplayId: String(tenant.platformEventMessages.length + 1),
          CreatedDate: now,
          LastModifiedDate: now
        };
        tenant.platformEventMessages.push(platformEventMessageSchema.parse({
          id: eventUuid,
          eventApiName,
          payload,
          createdAt: now,
          publishedBy: currentUserId,
          deliveredFlowApiNames: [],
          attempts: 0,
          retryAt: null,
          lastError: '',
          processedAt: null,
          deadLettered: false
        }));
        break;
      }
      case 'Get Records':
      case 'Create Records':
      case 'Update Records':
      case 'Delete Records': {
        const objectName = typeof config.object === 'string' ? config.object : '';
        const object = tenant.objects.find((candidate) => candidate.apiName === objectName);
        if (!object) throw new Error(`${element.type} "${element.label}" references an unknown object.`);
        if (objectName === 'Connector_App__c'
          && (element.type === 'Create Records' || element.type === 'Delete Records')
          && !runningPrincipal.permissions.includes('licence:manage')) {
          throw new Error('Creating or deleting app catalogue records requires the platform licence permission.');
        }
        const objectAction = element.type === 'Get Records' ? 'read'
          : element.type === 'Create Records' ? 'create'
            : element.type === 'Update Records' ? 'edit' : 'delete';
        if (!hasObjectPermission(runningPrincipal, tenant, objectName, objectAction)) {
          throw new Error(`The running user does not have ${objectAction} access to "${objectName}" for "${element.label}".`);
        }
        const records = tenant.records[objectName] ?? [];
        const conditions = asConfigRows(config.conditions);
        const requestedFields = [
          ...conditions.map((condition) => typeof condition.field === 'string' ? condition.field : ''),
          ...(typeof config.sortField === 'string' ? [config.sortField] : []),
          ...(Array.isArray(config.fields) ? config.fields.filter((field): field is string => typeof field === 'string') : [])
        ];
        for (const requestedField of requestedFields) {
          const fieldName = requestedField.split('.')[0];
          if (object.fields.some((field) => field.apiName === fieldName)
            && !hasFieldPermission(runningPrincipal, tenant, objectName, fieldName, 'read')) {
            throw new Error(`The running user does not have read permission for field "${objectName}.${fieldName}" used by "${element.label}".`);
          }
        }
        const matching = records.filter((item) => flowConditionsMatch(conditions, item, context, config.conditionLogic));
        if (element.type === 'Get Records') {
          const readableRecords = matching.filter((item) =>
            hasRecordAccess(runningPrincipal, tenant, objectName, item, 'Read'));
          const sorted = typeof config.sortField === 'string' && config.sortField
            ? [...readableRecords].sort((a, b) => {
                const left = a[config.sortField as string];
                const right = b[config.sortField as string];
                const leftNumber = Number(left);
                const rightNumber = Number(right);
                const comparison = left !== undefined && right !== undefined && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
                  ? leftNumber - rightNumber
                  : String(left ?? '').localeCompare(String(right ?? ''));
                return String(config.sortOrder ?? 'Ascending') === 'Descending' ? -comparison : comparison;
              })
            : readableRecords;
          const project = (item: RuntimeRecord): RuntimeRecord => {
            if (!Array.isArray(config.fields)) return sanitizeRecordForRead(runningPrincipal, tenant, object, item);
            const selectedFields = new Set(config.fields.filter((name): name is string => typeof name === 'string'));
            const projected: RuntimeRecord = {
              Id: item.Id,
              CreatedDate: item.CreatedDate,
              LastModifiedDate: item.LastModifiedDate
            };
            for (const name of selectedFields) {
              if (Object.hasOwn(item, name)) {
                projected[name] = sanitizeRecordForRead(runningPrincipal, tenant, object, item)[name];
              }
            }
            return projected;
          };
          const recordLimit = String(config.recordLimit ?? '1');
          const result = recordLimit === 'all' ? sorted.map(project)
            : recordLimit === '1' ? sorted[0] ? project(sorted[0]) : null
              : sorted.slice(0, Number(recordLimit)).map(project);
          const variableName = typeof config.outputVariable === 'string' && config.outputVariable ? config.outputVariable : `element${element.id}`;
          context.variables[variableName] = result;
        } else if (element.type === 'Create Records') {
          const fromCollection = config.recordSource === 'collection';
          const collectionName = typeof config.sourceCollection === 'string' ? config.sourceCollection : '';
          const configuredBatch = fromCollection
            ? prepareFlowCreateCollection(flow.resources, collectionName, object, context.variables[collectionName])
            : [flowFieldValues(config, context)];
          // Validate the whole input collection first; the same tenant transaction
          // and current-user permissions apply to every DML operation.
          const normalizedBatch = configuredBatch.map((values) => {
            const normalized = normalizeRuntimeValues(object, values);
            assertFieldEditPermissions(runningPrincipal, tenant, object, normalized);
            return normalized;
          });
          const createdRecords: RuntimeRecord[] = [];
          for (const configuredValues of normalizedBatch) {
            const values = applyRecordDefaults(tenantId, tenant, object, configuredValues, currentUserId);
            validateRuntimeRecord(tenantId, tenant, object, values);
            const now = new Date().toISOString();
            let created = calculateFormulaFields(object, stampRecordAuditFields({ ...values, Id: randomUUID(), CreatedDate: now, LastModifiedDate: now }, currentUserId, now), context);
            await runBeforeSaveRecordTriggeredFlows(
              tenantId, tenant, currentUserId, objectName, 'created', created, undefined,
              triggerDepth + 1, context.isClone, context.debug, context.debugTrace, context.rollbackSnapshot
            );
            const beforeSaveValues = normalizeFlowRecordAssignments(object, created, values);
            created = calculateFormulaFields(object, created, context);
            validateRuntimeRecord(tenantId, tenant, object, { ...values, ...beforeSaveValues }, created);
            tenant.records[objectName] = [...(tenant.records[objectName] ?? []), created];
            await runRecordTriggeredFlows(
              tenantId, tenant, currentUserId, objectName, 'created', created, undefined,
              triggerDepth + 1, context.isClone, context.debug, context.debugTrace, context.rollbackSnapshot
            );
            createdRecords.push(created);
          }
          if (fromCollection) {
            const outputCollection = typeof config.outputCollection === 'string' ? config.outputCollection : '';
            if (outputCollection) {
              const output = flow.resources.find((resource) => resource.name === outputCollection
                && resource.type === 'Record Collection' && resource.dataType === objectName && resource.isCollection);
              if (!output) throw new Error(`Create Records "${element.label}" has an invalid output Record Collection resource.`);
              context.variables[outputCollection] = createdRecords;
            }
            context.variables[`record${element.id}`] = createdRecords;
          } else {
            context.variables[`record${element.id}`] = createdRecords[0];
          }
        } else if (element.type === 'Update Records') {
          const values = normalizeRuntimeValues(object, flowFieldValues(config, context));
          assertFieldEditPermissions(runningPrincipal, tenant, object, values);
          const candidates = context.record && objectName === flow.triggerObject && !conditions.length
            ? records.filter((item) => item.Id === context.record?.Id)
            : matching;
          const editableCandidates = candidates.filter((item) =>
            hasRecordAccess(runningPrincipal, tenant, objectName, item, 'Edit'));
          if (editableCandidates.length > 200) throw new Error(`Update Records "${element.label}" exceeded the 200-record transaction limit.`);
          const selectedRecordTypeId = values.RecordTypeId;
          if (typeof selectedRecordTypeId === 'string' && editableCandidates.some((item) =>
            item.RecordTypeId !== selectedRecordTypeId
            && !hasRecordTypeAccessForUser(currentUserId, tenant, objectName, selectedRecordTypeId))) {
            throw new Error(`Record type "${selectedRecordTypeId}" is not assigned to this user for "${objectName}".`);
          }
          const updates = new Map<string, RuntimeRecord>();
          for (const previous of editableCandidates) {
            const now = new Date().toISOString();
            if (objectName === 'Connector_App__c')
              assertConnectorLifecycleAccess(previous, { ...previous, ...values }, runningPrincipal);
            const nextRecord = objectName === 'Connector_App__c'
              ? applyConnectorLifecycle(previous, { ...previous, ...values }, tenant.namedCredentials, tenant.flows,
                  new Date(now), runningPrincipal.permissions.includes('licence:manage'))
              : { ...previous, ...values };
            let updated = calculateFormulaFields(object, stampRecordAuditFields({ ...nextRecord, LastModifiedDate: now }, currentUserId, now, previous), context);
            await runBeforeSaveRecordTriggeredFlows(
              tenantId, tenant, currentUserId, objectName, 'updated', updated, previous,
              triggerDepth + 1, context.isClone, context.debug, context.debugTrace, context.rollbackSnapshot
            );
            const beforeSaveValues = normalizeFlowRecordAssignments(object, updated, previous);
            updated = calculateFormulaFields(object, updated, context);
            validateRelationshipReparenting(object, previous, updated);
            validateRuntimeRecord(tenantId, tenant, object, { ...values, ...beforeSaveValues }, updated);
            updates.set(previous.Id, updated);
          }
          for (const previous of editableCandidates) {
            const updated = updates.get(previous.Id);
            if (updated) appendFieldHistory(tenant, object, previous, updated, currentUserId);
          }
          tenant.records[objectName] = records.map((item) => updates.get(item.Id) ?? item);
          if (objectName === 'Connector_App__c') {
            for (const previous of editableCandidates) {
              const updated = updates.get(previous.Id);
              if (updated) disableOnConnectorUninstall(tenant, previous, updated);
            }
          }
          for (const previous of editableCandidates) {
            const updated = updates.get(previous.Id);
            if (updated) {
              await runRecordTriggeredFlows(
                tenantId, tenant, currentUserId, objectName, 'updated', updated, previous,
                triggerDepth + 1, context.isClone, context.debug, context.debugTrace, context.rollbackSnapshot
              );
            }
          }
          if (context.record && updates.has(context.record.Id)) context.record = updates.get(context.record.Id);
        } else {
          const deletableRecords = matching.filter((item) =>
            hasRecordAccess(runningPrincipal, tenant, objectName, item, 'Delete'));
          if (deletableRecords.length > 200) throw new Error(`Delete Records "${element.label}" exceeded the 200-record transaction limit.`);
          for (const removed of deletableRecords) {
            if ((tenant.records[objectName] ?? []).some((item) => item.Id === removed.Id)) {
              await deleteRecordCascade(
                tenantId, tenant, currentUserId, objectName, removed, triggerDepth + 1, context.debug, context.debugTrace,
                context.rollbackSnapshot
              );
            }
          }
        }
        break;
      }
      case 'Orchestration Stage': {
        // The approval work item and paused interview commit together with the
        // parent Flow transaction. No external orchestration engine is required.
        if (flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save') {
          throw new Error('Orchestration stages cannot execute before record save.');
        }
        const interviewGuid = randomUUID();
        performSubmitForApproval(tenantId, tenant, flow, {
          ...config,
          approvalMode: config.approvalMode === 'ALL' ? 'ALL' : 'ANY',
          orchestrationInterviewId: interviewGuid
        }, context, element.label);
        return {
          status: 'waiting', kind: 'orchestration', stage: element,
          waitUntil: '9999-12-31T23:59:59.999Z', nextElementId: null,
          variables: structuredClone(context.variables),
          interviewGuid, interviewStartTime: new Date().toISOString(),
          record: context.record, prior: context.prior,
          recordEvent: context.recordEvent, isClone: context.isClone,
          debugTrace: context.debugTrace ?? []
        };
      }
      case 'Subflow': {
        const apiName = typeof config.flowApiName === 'string' ? config.flowApiName : '';
        const childFlow = activeFlowDefinition(tenant.flows.find((candidate) => candidate.apiName === apiName));
        if (!childFlow || childFlow.status !== 'Active' || childFlow.flowType !== 'Autolaunched Flow') {
          throw new Error(`Subflow "${element.label}" must reference an active autolaunched flow.`);
        }
        const childInput: Record<string, unknown> = {};
        for (const mapping of parseSubflowMappings(config.inputValues, element.label, 'input')) {
          childInput[mapping.source] = resolveFlowValue(mapping.target, context);
        }
        const childResult = await executeFlow(
          childFlow, tenant, tenantId, currentUserId, childInput, record, prior, depth + 1, undefined, triggerDepth, recordEvent, isClone,
          flowInterviewIdentity(context), false, context.debug === true, context.debugTrace, context.rollbackSnapshot
        );
        if (childResult.status !== 'completed') throw new Error(`Subflow "${element.label}" cannot pause for screen input.`);
        const outputMappings = parseSubflowMappings(config.outputValues, element.label, 'output');
        if (outputMappings.length) {
          for (const mapping of outputMappings) {
            if (!Object.hasOwn(childResult.outputs, mapping.source)) {
              throw new Error(`Subflow "${element.label}" output "${mapping.source}" is not available.`);
            }
            if (!Object.hasOwn(context.variables, mapping.target)) {
              throw new Error(`Subflow "${element.label}" cannot assign output to undefined parent resource "${mapping.target}".`);
            }
            context.variables[mapping.target] = childResult.outputs[mapping.source];
          }
        } else {
          for (const [name, value] of Object.entries(childResult.outputs)) {
            if (Object.hasOwn(context.variables, name)) context.variables[name] = value;
          }
        }
        break;
      }
      case 'Screen':
        if (flow.flowType !== 'Screen Flow') throw new Error(`Screen "${element.label}" can only be used in a Screen Flow.`);
        {
          const configuredOutcomes = asConfigRows(element.config.outcomes).map((outcome, index) => ({
            name: typeof outcome.name === 'string' ? outcome.name : `Outcome_${index + 1}`,
            label: typeof outcome.label === 'string' ? outcome.label : `Outcome ${index + 1}`
          }));
          return {
            status: 'waiting', kind: 'screen', screen: element,
            nextElementId: nextConnectors.length === 1 ? nextConnectors[0].to : null,
            outcomes: configuredOutcomes.length ? configuredOutcomes : [{ name: 'Default', label: 'Next' }],
            variables: context.variables,
            ...flowInterviewIdentity(context),
            record: context.record, prior: context.prior,
            recordEvent: context.recordEvent, isClone: context.isClone,
            debugTrace: context.debugTrace ?? []
          };
        }
      case 'Wait': {
        if (nextConnectors.length > 1) throw new Error(`Wait "${element.label}" has multiple outgoing paths.`);
        let waitUntil: Date;
        if (String(config.waitType ?? 'Duration') === 'Specific Time') {
          const rawDateTime = typeof config.dateTime === 'string' ? config.dateTime : '';
          const timeZone = String(config.timeZone ?? 'UTC');
          const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(rawDateTime);
          let dateTime: Date | undefined;
          if (explicitZone) {
            if (isValidFlowDateTime(rawDateTime)) dateTime = new Date(rawDateTime);
          } else {
            const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(rawDateTime);
            if (match && dashboardTimeZoneSchema.safeParse(timeZone).success) {
              const [, yearText, monthText, dayText, hourText, minuteText] = match;
              const civilDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
              if (civilDate.getUTCFullYear() === Number(yearText)
                && civilDate.getUTCMonth() === Number(monthText) - 1
                && civilDate.getUTCDate() === Number(dayText)) {
                dateTime = flowLocalDateTimeToInstant(civilDate, Number(hourText), Number(minuteText), timeZone);
              }
            }
          }
          if (!dateTime || !Number.isFinite(dateTime.getTime())) throw new Error(`Wait "${element.label}" requires a valid date and time.`);
          waitUntil = dateTime;
        } else {
          const amount = Number(config.amount ?? 1);
          const unit = String(config.unit ?? 'Hours');
          const unitMilliseconds: Record<string, number> = { Minutes: 60_000, Hours: 3_600_000, Days: 86_400_000 };
          if (!Number.isFinite(amount) || amount <= 0 || !unitMilliseconds[unit]) throw new Error(`Wait "${element.label}" requires a positive duration and supported unit.`);
          waitUntil = new Date(Date.now() + amount * unitMilliseconds[unit]);
        }
        if (waitUntil.getTime() <= Date.now()) throw new Error(`Wait "${element.label}" must be scheduled for a future time.`);
        return {
          status: 'waiting', kind: 'wait', waitUntil: waitUntil.toISOString(),
          nextElementId: nextConnectors[0]?.to ?? null, variables: context.variables,
          ...flowInterviewIdentity(context),
          record: context.record, prior: context.prior,
          recordEvent: context.recordEvent, isClone: context.isClone,
          debugTrace: context.debugTrace ?? []
        };
      }
      case 'Action':
        if (String(config.actionType ?? '') === 'Send Email') {
          await performSendEmail(tenantId, tenant, config, context, element.label);
        } else if (String(config.actionType ?? '') === 'Email Alert') {
          await performEmailAlert(tenantId, tenant, config, context, element.label);
        } else if (String(config.actionType ?? '') === 'Post to Chatter') {
          performPostToChatter(tenantId, tenant, config, context, element.label);
        } else if (String(config.actionType ?? '') === 'Custom Notification') {
          performCustomNotification(tenantId, tenant, flow, config, context, element.label);
        } else if (String(config.actionType ?? '') === 'Outbound Message') {
          const runningUser = platformStore.state.users.find((user) =>
            user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
          if (!runningUser || !effectivePermissions(runningUser, tenant).includes('callouts:execute')) {
            throw new Error('The running user does not have permission to send outbound messages.');
          }
          const result = await performHttpCallout(tenantId, tenant, {
            namedCredentialId: config.namedCredentialId,
            method: 'POST',
            path: config.path,
            body: config.messageBody,
            headers: 'Content-Type: application/json'
          }, context, element.label);
          if (result.status < 200 || result.status >= 300) {
            throw new Error(`Outbound Message "${element.label}" received HTTP status ${result.status}.`);
          }
        } else if (String(config.actionType ?? '') === 'Submit for Approval') {
          performSubmitForApproval(tenantId, tenant, flow, config, context, element.label);
        } else {
          throw new Error(`Action "${element.label}" has unsupported action type "${String(config.actionType ?? '')}".`);
        }
        break;
      case 'HTTP Callout': {
        const runningUser = platformStore.state.users.find((user) =>
          user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
        if (!runningUser || !effectivePermissions(runningUser, tenant).includes('callouts:execute')) {
          throw new Error('The running user does not have permission to execute HTTP callouts.');
        }
        let result: { body: unknown; status: number };
        try {
          result = await performHttpCallout(tenantId, tenant, config, context, element.label);
        } catch (error) {
          if (config.onError !== 'CONTINUE') throw error;
          result = { body: { error: error instanceof Error ? error.message : String(error) }, status: 0 };
        }
        const responseVariable = typeof config.responseVariable === 'string' ? config.responseVariable : '';
        const statusVariable = typeof config.statusVariable === 'string' ? config.statusVariable : '';
        if (responseVariable) {
          if (!Object.hasOwn(context.variables, responseVariable)) throw new Error(`HTTP Callout "${element.label}" response variable is not defined in Manager.`);
          context.variables[responseVariable] = mapHttpCalloutResponse(result.body, config.responseMapping, element.label);
        }
        if (statusVariable) {
          if (!Object.hasOwn(context.variables, statusVariable)) throw new Error(`HTTP Callout "${element.label}" status variable is not defined in Manager.`);
          context.variables[statusVariable] = result.status;
        }
        break;
      }
      default:
        throw new Error(`Unknown flow element type "${element.type}".`);
      }
    } catch (error) {
      if (element.type === 'HTTP Callout' && config.onError === 'FAIL') throw error;
      const faultConnectors = flow.connectors.filter((connector) => connector.from === element.id && connector.kind === 'fault');
      if (!faultConnectors.length) throw error;
      if (faultConnectors.length > 1) {
        throw new Error(`Element "${element.label}" has multiple fault connectors.`);
      }
      const message = error instanceof Error ? error.message : String(error);
      context.flow = { FaultMessage: message, FaultCode: 'FLOW_ELEMENT_ERROR' };
      currentId = faultConnectors[0].to;
      continue;
    }
    if (!nextConnectors.length) break;
    if (nextConnectors.length > 1) throw new Error(`Element "${element.label}" has multiple outgoing paths with no deterministic route.`);
    currentId = nextConnectors[0].to;
  }
  return {
    status: 'completed',
    outputs: Object.fromEntries(flow.resources.filter((resource) => resource.availableForOutput).map((resource) => [resource.name, resolveFlowValue(`{${resource.name}}`, context)])),
    variables: context.variables,
    debugTrace: context.debugTrace ?? []
  };
}

function parseSubflowMappings(value: unknown, elementLabel: string, mappingType: 'input' | 'output'): Array<{ source: string; target: string }> {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') throw new Error(`Subflow "${elementLabel}" ${mappingType} mappings must be text assignments.`);
  const mappings: Array<{ source: string; target: string }> = [];
  const sources = new Set<string>();
  for (const entry of value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new Error(`Subflow "${elementLabel}" has an invalid ${mappingType} assignment "${entry}".`);
    const source = entry.slice(0, separator).trim();
    const target = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(source) || !target) {
      throw new Error(`Subflow "${elementLabel}" has an invalid ${mappingType} assignment "${entry}".`);
    }
    if (sources.has(source)) throw new Error(`Subflow "${elementLabel}" maps "${source}" more than once.`);
    sources.add(source);
    mappings.push({ source, target });
  }
  return mappings;
}

 return executeFlowImplementation;
}
