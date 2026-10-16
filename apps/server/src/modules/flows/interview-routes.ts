import type { Request, Response } from "express";
import type { FlowsInterviewRoutesDependencies, FlowRuntimeContext } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowsInterviewRoutes(deps: FlowsInterviewRoutesDependencies): void {
  deps.app.post('/api/flow-interviews/:interviewId/next', deps.accessAuthentication, deps.requirePermission('flows:run'), async (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const interviewId = deps.routeParam(req, 'interviewId');
    const tenant = deps.tenantData(principal.tenantId)!;
    const interview = tenant.interviews.find((item) => item.id === interviewId && item.userId === principal.userId);
    if (!interview) return res.status(404).json({ error: 'Flow interview was not found' });
    if (interview.kind !== 'screen') return res.status(409).json({ error: 'Wait interviews are resumed by the runtime scheduler' });
    if (Date.parse(interview.expiresAt) <= Date.now()) {
      const updated = { ...tenant, interviews: tenant.interviews.filter((item) => item.id !== interviewId) };
      deps.persistTenantRecords(principal.tenantId, updated);
      return res.status(410).json({ error: 'Flow interview has expired' });
    }
    const editable = tenant.flows.find((item) => item.apiName === interview.flowApiName);
    const flow = interview.allowDraft && editable?.status === 'Draft'
      && editable.versionNumber === interview.versionNumber
      ? editable
      : deps.activeFlowDefinition(editable)?.versionNumber === interview.versionNumber
        ? deps.activeFlowDefinition(editable) : undefined;
    if (!flow) return res.status(409).json({ error: 'The flow interview version is no longer active' });
    const values = deps.z.object({
      values: deps.z.record(deps.z.unknown()).default({}),
      outcome: deps.z.string().optional(),
      action: deps.z.enum(['next', 'back']).default('next')
    }).safeParse(req.body);
    if (!values.success) return res.status(400).json({ error: 'Screen values must be provided in a values object' });
    const screen = flow.elements.find((element) => element.id === interview.screenElementId && element.type === 'Screen');
    if (!screen) return res.status(409).json({ error: 'The current screen no longer exists in this flow version' });
    if (values.data.action === 'back') {
      const previous = interview.history.at(-1);
      if (!previous) return res.status(409).json({ error: 'There is no previous screen in this interview.' });
      const previousScreen = flow.elements.find((element) =>
        element.id === previous.screenElementId && element.type === 'Screen');
      if (!previousScreen) return res.status(409).json({ error: 'The previous screen no longer exists in this flow version.' });
      const history = interview.history.slice(0, -1);
      const restored = {
        ...interview,
        screenElementId: previous.screenElementId,
        nextElementId: previous.nextElementId,
        variables: previous.variables,
        record: previous.record,
        prior: previous.prior,
        history
      };
      deps.persistTenantRecords(principal.tenantId, {
        ...tenant,
        interviews: tenant.interviews.map((item) => item.id === interviewId ? restored : item)
      });
      const outcomes = deps.asConfigRows(previousScreen.config.outcomes).map((outcome, index) => ({
        name: typeof outcome.name === 'string' ? outcome.name : `Outcome_${index + 1}`,
        label: typeof outcome.label === 'string' ? outcome.label : `Outcome ${index + 1}`
      }));
      return res.json({
        interviewId,
        screen: previousScreen,
        outcomes: outcomes.length ? outcomes : [{ name: 'Default', label: 'Next' }],
        values: previous.variables,
        canGoBack: history.length > 0
      });
    }
    const configuredOutcomes = deps.asConfigRows(screen.config.outcomes).map((outcome, index) => ({
      name: typeof outcome.name === 'string' ? outcome.name : `Outcome_${index + 1}`,
      label: typeof outcome.label === 'string' ? outcome.label : `Outcome ${index + 1}`
    }));
    const screenOutcomes = configuredOutcomes.length ? configuredOutcomes : [{ name: 'Default', label: 'Next' }];
    const selectedOutcome = values.data.outcome ?? screenOutcomes.find((outcome) => outcome.name === 'Default')?.label ?? screenOutcomes[0].label;
    const outcomeDefinition = screenOutcomes.find((outcome) => outcome.label === selectedOutcome || outcome.name === selectedOutcome);
    if (!outcomeDefinition) return res.status(400).json({ error: `Screen outcome "${selectedOutcome}" does not exist` });
    const screenFields = deps.asConfigRows(screen.config.fields).filter((field) => !['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
    const knownNames = new Set(screenFields.map((field) => typeof field.apiName === 'string' ? field.apiName : String(field.label ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')));
    const unknownName = Object.keys(values.data.values).find((name) => !knownNames.has(name));
    if (unknownName) return res.status(400).json({ error: `Screen field "${unknownName}" does not exist` });
    const visibilityValues = { ...interview.variables, ...values.data.values };
    const visibilityContext: FlowRuntimeContext = {
      record: interview.record ?? undefined,
      prior: interview.prior ?? undefined,
      currentUserId: principal.userId,
      resourceDefinitions: flow.resources,
      formulaStack: new Set(),
      ...deps.formulaContextForUser(tenant, principal.userId),
      flowVariables: deps.flowVariablesForUser(tenant, principal.userId, interview.id, interview.createdAt),
      variables: visibilityValues
    };
    const screenValues: Record<string, unknown> = {};
    for (const field of screenFields) {
      const name = typeof field.apiName === 'string' ? field.apiName : String(field.label ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const visibilityConditions = deps.asConfigRows(field.visibilityConditions);
      if (visibilityConditions.length && !deps.flowConditionsMatch(
        visibilityConditions, visibilityValues, visibilityContext, field.visibilityLogic
      )) continue;
      const value = Object.hasOwn(values.data.values, name) ? values.data.values[name] : field.defaultValue;
      if (field.required === true && (value === undefined || value === null || value === ''
        || (Array.isArray(value) && value.length === 0)
        || (['Checkbox', 'Toggle'].includes(String(field.type)) && value !== true))) {
        return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" is required` });
      }
      if (value !== undefined) {
        const type = String(field.type ?? 'Text');
        if (['Address', 'Name'].includes(type)) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a structured value` });
          }
          const parts = value as Record<string, unknown>;
          const allowedParts = type === 'Address'
            ? ['street', 'city', 'state', 'postalCode', 'country']
            : ['salutation', 'firstName', 'middleName', 'lastName', 'suffix'];
          if (Object.keys(parts).some((part) => !allowedParts.includes(part))
            || Object.values(parts).some((part) => typeof part !== 'string' || part.length > 255)) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains invalid ${type} parts` });
          }
          if (field.required === true && (type === 'Address'
            ? !String(parts.street ?? '').trim() || !String(parts.city ?? '').trim()
            : !String(parts.firstName ?? '').trim() || !String(parts.lastName ?? '').trim())) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" requires ${type === 'Address' ? 'street and city' : 'first and last name'}` });
          }
        }
        if (type === 'Choice Lookup' && value !== '') {
          const objectApiName = typeof field.objectApiName === 'string' ? field.objectApiName : '';
          const targetObject = tenant.objects.find((object) => object.apiName === objectApiName);
          const selectedIds = Array.isArray(value) ? value : [value];
          if (!targetObject || !deps.hasObjectPermission(principal, tenant, objectApiName, 'read')
            || (field.multipleSelections === true ? !Array.isArray(value) : Array.isArray(value))
            || selectedIds.some((id) => typeof id !== 'string' || !id)
            || new Set(selectedIds).size !== selectedIds.length) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an invalid choice selection` });
          }
          const records = tenant.records[objectApiName] ?? [];
          if (selectedIds.some((id) => !records.some((record) =>
            record.Id === id && deps.hasRecordAccess(principal, tenant, objectApiName, record, 'Read')))) {
            return res.status(400).json({ error: `Selected choice for screen field "${String(field.label ?? name)}" was not found or is not readable` });
          }
        }
        if (type === 'Lookup' && value !== '') {
          const objectApiName = typeof field.objectApiName === 'string' ? field.objectApiName : '';
          const targetObject = tenant.objects.find((object) => object.apiName === objectApiName);
          if (typeof value !== 'string' || !targetObject || !deps.hasObjectPermission(principal, tenant, objectApiName, 'read')) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must select a readable record from its target object` });
          }
          const recordExists = objectApiName === 'User'
            ? deps.state.users.some((user) => user.id === value && user.tenantId === principal.tenantId)
            : (tenant.records[objectApiName] ?? []).some((record) =>
              record.Id === value && deps.hasRecordAccess(principal, tenant, objectApiName, record, 'Read'));
          if (!recordExists) return res.status(400).json({ error: `Selected record for screen field "${String(field.label ?? name)}" was not found or is not readable` });
        }
        if (type === 'Data Table') {
          const collectionName = typeof field.collection === 'string' ? field.collection : '';
          const records = interview.variables[collectionName];
          const selectedIds = Array.isArray(value) ? value : [value];
          if (!Array.isArray(records) || selectedIds.some((id) => typeof id !== 'string'
            || !records.some((record) => typeof record === 'object' && record !== null
              && !Array.isArray(record) && (record as Record<string, unknown>).Id === id))
            || new Set(selectedIds).size !== selectedIds.length
            || (field.multiselect !== true && selectedIds.length > 1)) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains a selection outside its configured table` });
          }
        }
        if (type === 'File Upload') {
          const files = Array.isArray(value) ? value : [value];
          const maxFiles = typeof field.maxFiles === 'number' ? field.maxFiles : 1;
          const maxFileSize = (typeof field.maxFileSize === 'number' ? field.maxFileSize : 512) * 1024;
          const allowedTypes = Array.isArray(field.allowedTypes) ? field.allowedTypes : [];
          let totalBytes = 0;
          if (files.length > maxFiles || files.length > 10) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" exceeds its file count limit` });
          }
          for (const file of files) {
            if (typeof file !== 'object' || file === null || Array.isArray(file)) {
              return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an invalid file` });
            }
            const uploaded = file as Record<string, unknown>;
            const content = typeof uploaded.content === 'string' ? uploaded.content : '';
            const dataUrl = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(content);
            if (typeof uploaded.name !== 'string' || !uploaded.name.trim() || uploaded.name.length > 255
              || typeof uploaded.type !== 'string' || !dataUrl || dataUrl[1] !== uploaded.type
              || (allowedTypes.length > 0 && !allowedTypes.includes(uploaded.type))) {
              return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an invalid or disallowed file` });
            }
            const bytes = Buffer.from(dataUrl[2], 'base64');
            if (bytes.toString('base64') !== dataUrl[2] || bytes.length !== uploaded.size
              || bytes.length > maxFileSize || bytes.length > 512 * 1024) {
              return res.status(400).json({ error: `File "${uploaded.name}" exceeds the configured size or has invalid content` });
            }
            totalBytes += bytes.length;
            if (totalBytes > 512 * 1024) {
              return res.status(400).json({ error: `Files on screen field "${String(field.label ?? name)}" exceed the 512 KB total limit` });
            }
          }
        }
        if (type === 'Repeater') {
          if (!Array.isArray(value) || value.length > (typeof field.maximumRows === 'number' ? field.maximumRows : 10)
            || value.length > 50 || value.length < (typeof field.minimumRows === 'number' ? field.minimumRows : 0)) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an invalid number of rows` });
          }
          const subfields = deps.asConfigRows(field.subfields);
          for (const row of value) {
            if (typeof row !== 'object' || row === null || Array.isArray(row)) {
              return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an invalid row` });
            }
            const rowValues = row as Record<string, unknown>;
            if (Object.keys(rowValues).some((key) => !subfields.some((subfield) => subfield.apiName === key))) {
              return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an unknown row value` });
            }
            for (const subfield of subfields) {
              const subfieldName = String(subfield.apiName);
              const subvalue = rowValues[subfieldName];
              const subfieldType = String(subfield.type ?? 'Text');
              if (subfield.required === true && (subvalue === undefined || subvalue === null || subvalue === ''
                || (subfieldType === 'Checkbox' && subvalue !== true))) {
                return res.status(400).json({ error: `Repeater row field "${String(subfield.label ?? subfieldName)}" is required` });
              }
              if (subvalue !== undefined && (
                (subfieldType === 'Text' && (typeof subvalue !== 'string' || subvalue.length > 255))
                || (subfieldType === 'Email' && (typeof subvalue !== 'string' || !deps.z.string().email().safeParse(subvalue).success))
                || (subfieldType === 'Number' && (typeof subvalue !== 'number' || !Number.isFinite(subvalue)))
                || (subfieldType === 'Checkbox' && typeof subvalue !== 'boolean')
                || (subfieldType === 'Date' && (typeof subvalue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(subvalue)
                  || !Number.isFinite(Date.parse(`${subvalue}T00:00:00.000Z`))
                  || new Date(`${subvalue}T00:00:00.000Z`).toISOString().slice(0, 10) !== subvalue))
              )) {
                return res.status(400).json({ error: `Repeater row field "${String(subfield.label ?? subfieldName)}" has an invalid value` });
              }
            }
          }
        }
        if (['Text', 'Password', 'Long Text Area', 'Phone'].includes(type) && typeof value !== 'string') {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be text` });
        }
        if (['Number', 'Currency', 'Slider'].includes(type) && (typeof value !== 'number' || !Number.isFinite(value))) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a number` });
        }
        if (['Checkbox', 'Toggle'].includes(type) && typeof value !== 'boolean') {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be true or false` });
        }
        if (type === 'Email' && (typeof value !== 'string' || !deps.z.string().email().safeParse(value).success)) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a valid email address` });
        }
        if (type === 'Picklist' && (typeof value !== 'string' || !Array.isArray(field.choices) || !field.choices.includes(value))) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be one of its configured choices` });
        }
        if (type === 'Multi-Select Picklist' && (!Array.isArray(value)
          || value.some((choice) => typeof choice !== 'string' || !Array.isArray(field.choices) || !field.choices.includes(choice))
          || new Set(value).size !== value.length)) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must contain unique configured choices` });
        }
        if (type === 'URL' && (typeof value !== 'string' || !deps.z.string().url().safeParse(value).success)) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a valid URL` });
        }
        if (type === 'URL' && typeof value === 'string' && !['http:', 'https:'].includes(new URL(value).protocol)) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must use HTTP or HTTPS` });
        }
        if (typeof value === 'string' && typeof field.minLength === 'number' && value.length < field.minLength) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be at least ${field.minLength} characters` });
        }
        if (typeof value === 'string' && typeof field.maxLength === 'number' && value.length > field.maxLength) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be at most ${field.maxLength} characters` });
        }
        if (typeof value === 'number' && typeof field.min === 'number' && value < field.min) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be at least ${field.min}` });
        }
        if (typeof value === 'number' && typeof field.max === 'number' && value > field.max) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be at most ${field.max}` });
        }
        if (typeof value === 'number' && typeof field.step === 'number') {
          const base = typeof field.min === 'number' ? field.min : 0;
          const steps = (value - base) / field.step;
          if (Math.abs(steps - Math.round(steps)) > 1e-9) {
            return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must use increments of ${field.step}` });
          }
        }
        if (typeof field.pattern === 'string' && field.pattern) {
          let pattern: RegExp;
          try {
            if (!deps.isSafeFlowRegex(field.pattern)) throw new Error('pattern syntax is not supported');
            pattern = new RegExp(`^(?:${field.pattern})$`);
          } catch {
            return res.status(422).json({ error: `Screen field "${String(field.label ?? name)}" has an invalid validation pattern` });
          }
          if (typeof value !== 'string' || value.length > 512 || !pattern.test(value)) {
            return res.status(400).json({ error: String(field.validationMessage || `Screen field "${String(field.label ?? name)}" does not match the required format`) });
          }
        }
        if (type === 'Date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
          || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
          || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value)) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a valid date` });
        }
        if (type === 'Date/Time' && (typeof value !== 'string' || !deps.isValidFlowDateTime(value))) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a valid date and time` });
        }
        if (type === 'Time' && (typeof value !== 'string' || !deps.isValidFlowTime(value))) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a valid time` });
        }
        screenValues[name] = value;
      }
      if (value !== undefined) visibilityValues[name] = value;
    }
    try {
      const working = structuredClone(tenant);
      const variables = { ...interview.variables, ...screenValues };
      const screenConnectors = flow.connectors.filter((connector) => connector.from === screen.id && connector.kind !== 'fault');
      const selectedConnector = screenConnectors.find((connector) =>
        connector.label === outcomeDefinition.label || connector.label === outcomeDefinition.name);
      const nextElementId = screenConnectors.length === 1 && outcomeDefinition.name === 'Default'
        ? screenConnectors[0].to
        : selectedConnector?.to ?? null;
      if (nextElementId === null) {
        working.interviews = working.interviews.filter((item) => item.id !== interviewId);
        const outputContext: FlowRuntimeContext = {
          record: interview.record ?? undefined,
          prior: interview.prior ?? undefined,
          currentUserId: principal.userId,
          resourceDefinitions: flow.resources,
          formulaStack: new Set(),
          ...deps.formulaContextForUser(tenant, principal.userId),
          flowVariables: deps.flowVariablesForUser(tenant, principal.userId, interview.id, interview.createdAt),
          variables
        };
        const outputs = Object.fromEntries(flow.resources.filter((resource) => resource.availableForOutput)
          .map((resource) => [resource.name, deps.resolveFlowValue(`{${resource.name}}`, outputContext)]));
        deps.persistTenantRecords(principal.tenantId, working);
        return res.json({ completed: true, outputs });
      }
      const result = await deps.executeFlow(flow, working, principal.tenantId, principal.userId, {}, interview.record ?? undefined, interview.prior ?? undefined, 0, {
        startAt: nextElementId, variables, interviewGuid: interview.id, interviewStartTime: interview.createdAt
      }, 0, interview.recordEvent ?? undefined, interview.isClone, undefined, true);
      if (result.status === 'waiting') {
        const updatedInterview = deps.createFlowInterview(flow, principal.userId, result);
        updatedInterview.history = [
          ...interview.history,
          {
            screenElementId: screen.id,
            nextElementId: nextElementId,
            variables,
            record: interview.record,
            prior: interview.prior
          }
        ];
        working.interviews = working.interviews.map((item) => item.id === interviewId ? updatedInterview : item);
        deps.persistTenantRecords(principal.tenantId, working);
        return res.status(202).json(result.kind === 'screen'
          ? { interviewId, screen: result.screen, outcomes: result.outcomes, values: result.variables, canGoBack: updatedInterview.history.length > 0 }
          : { interviewId, waitUntil: result.waitUntil });
      }
      working.interviews = working.interviews.filter((item) => item.id !== interviewId);
      deps.persistTenantRecords(principal.tenantId, working);
      return res.json({ completed: true, outputs: result.outputs });
    } catch (error) {
      deps.persistFlowFailure(principal.tenantId, flow, 'Manual', error, principal.userId);
      return res.status(422).json({ error: error instanceof Error ? error.message : 'Flow execution failed' });
    }
  });
}
