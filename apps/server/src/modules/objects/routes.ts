import { removeObjectMetadata } from './remove-object.js';
import { pageComponentFeatureEnabled } from './metadata-validation.js';
import { metadataPrecondition as checkMetadataPrecondition, commitObjectMetadata as persistObjectMetadataRevision } from './metadata-revisions.js';
/** All Object Manager metadata HTTP routes, kept as a cohesive module. */
import type { Request, Response } from 'express';
import type { ObjectMetadata, ObjectMetadataChange, TenantData, ObjectMetadataRoutesDependencies } from '../../index.js';

export function registerObjectMetadataRoutes(deps: ObjectMetadataRoutesDependencies): void {
 const { app, fieldSchema, relatedLookupFilterSchema, objectSchema, validateObjectRelationships, validateRelatedLookupFilters, validateRelatedLists, containsFieldReference, flowUsesObject, findFieldDependencies, findObjectDependencies, fullObjectPermissions, withObjectDefaults, tenantData, getPrincipal, requirePermission, requireAnyPermission, metadataVersion, persistTenantRecords, routeParam, formulaContextForUser, validateFieldChange, validateExistingFieldValues, validateObjectLayoutProfileAssignments, evaluateFormula, z } = deps;
// Auto-grants follow editable metadata administration privileges, never an identity or named-policy bypass.
const grantsMetadataCrud = (entry: { systemPermissions: string[] }) =>
  entry.systemPermissions.includes('metadata:write') && entry.systemPermissions.includes('objects:manage');
const fullFieldMetadataPermissions = { read: true, edit: true, create: true, delete: true };
const metadataPrecondition = (req: Request, res: Response, current: ObjectMetadata) =>
  checkMetadataPrecondition(req, res, current, metadataVersion);
const commitObjectMetadata = (
  tenantId: string, actorUserId: string, updatedTenant: TenantData,
  action: ObjectMetadataChange['action'], before?: ObjectMetadata, after?: ObjectMetadata
) => persistObjectMetadataRevision(tenantId, actorUserId, updatedTenant, action,
  before, after, metadataVersion, persistTenantRecords);
app.get('/api/metadata/objects/:apiName/history', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const object = tenant.objects.find((candidate) => candidate.apiName === apiName);
  const history = (tenant.metadataHistory ?? []).filter((entry) => entry.objectApiName === apiName);
  if (!object && !history.length) return res.status(404).json({ error: 'Object not found' });
  const parsed = z.coerce.number().int().min(1).max(100).safeParse(req.query.limit ?? 30);
  if (!parsed.success) return res.status(400).json({ error: 'History limit must be between 1 and 100' });
  return res.json({
    objectApiName: apiName, revision: metadataVersion(object),
    history: history.slice(-parsed.data).reverse().map(({ before, after, ...summary }) => ({
      ...summary, beforeRevision: before ? metadataVersion(before) : null,
      afterRevision: after ? metadataVersion(after) : null
    }))
  });
});
app.get('/api/metadata/objects/:apiName/history/:revision', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  const event = (tenant.metadataHistory ?? []).find((entry) =>
    entry.objectApiName === routeParam(req, 'apiName') && String(entry.revision) === routeParam(req, 'revision'));
  if (!event) return res.status(404).json({ error: 'Metadata revision not found' });
  return res.json({ change: event });
});
app.get('/api/metadata/objects/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const object = tenantData(getPrincipal(res).tenantId)?.objects.find((item) => item.apiName === req.params.apiName);
  if (!object) return res.status(404).json({ error: `Object "${req.params.apiName}" was not found` });
  res.set('ETag', `"${metadataVersion(object)}"`);
  return res.json({ object });
});
app.post('/api/metadata/objects', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const parsed = objectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid object metadata', details: parsed.error.flatten() });
  if (parsed.data.kind !== 'Custom Object' || !parsed.data.apiName.endsWith('__c')) {
    return res.status(400).json({ error: 'New objects must be custom objects with an API name ending in __c' });
  }
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.objects.some((item) => item.apiName.toLowerCase() === parsed.data.apiName.toLowerCase())) return res.status(409).json({ error: 'Object API name already exists' });
  const knownObjects = new Set([...tenant.objects.map((item) => item.apiName), parsed.data.apiName]);
  const invalidRelationship = parsed.data.fields.find((field) => field.relationship && !knownObjects.has(field.relationship.targetObject));
  if (invalidRelationship) return res.status(400).json({ error: `Relationship target "${invalidRelationship.relationship?.targetObject}" does not exist` });
  const object = withObjectDefaults(parsed.data);
  const invalidRelatedList = validateRelatedLists(object, [...tenant.objects, object]);
  if (invalidRelatedList) return res.status(400).json({ error: invalidRelatedList });
  const assignmentError = validateObjectLayoutProfileAssignments(object, tenant.accessControl.profiles);
  if (assignmentError) return res.status(400).json({ error: assignmentError });
  const relationshipError = validateObjectRelationships(object, [...tenant.objects, object]);
  if (relationshipError) return res.status(400).json({ error: relationshipError });
  const lookupFilterError = validateRelatedLookupFilters(object, [...tenant.objects, object]);
  if (lookupFilterError) return res.status(400).json({ error: lookupFilterError });
  const updated = {
    ...tenant,
    objects: [...tenant.objects, object],
    accessControl: {
      ...tenant.accessControl,
      profiles: tenant.accessControl.profiles.map((profile) =>
        grantsMetadataCrud(profile)
          ? {
            ...profile,
            objectPermissions: { ...profile.objectPermissions, [object.apiName]: { ...fullObjectPermissions } },
            fieldPermissions: { ...profile.fieldPermissions, ...Object.fromEntries(object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { ...fullFieldMetadataPermissions }])) }
          }
          : profile),
      permissionSets: tenant.accessControl.permissionSets.map((permissionSet) =>
        grantsMetadataCrud(permissionSet)
          ? {
            ...permissionSet,
            objectPermissions: { ...permissionSet.objectPermissions, [object.apiName]: { ...fullObjectPermissions } },
            fieldPermissions: { ...permissionSet.fieldPermissions, ...Object.fromEntries(object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { ...fullFieldMetadataPermissions }])) }
          }
          : permissionSet)
    }
  };
  const created = commitObjectMetadata(principal.tenantId, principal.userId, updated, 'CREATED', undefined, object)!;
  return res.status(201).json({ object: created });
});
// Dry-run schema validation never mutates records, versions or audit history.
app.post('/api/metadata/objects/:apiName/validate', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const current = tenant.objects.find((candidate) => candidate.apiName === routeParam(req, 'apiName'));
  if (!current) return res.status(404).json({ error: 'Object not found' });
  const parsed = objectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ valid: false, errors: parsed.error.issues.map((issue) => issue.message) });
  const candidate = withObjectDefaults(parsed.data);
  const errors: string[] = [];
  if (candidate.apiName !== current.apiName || candidate.kind !== current.kind) errors.push('Object identity and type cannot change');
  for (const field of current.fields) {
    if (!candidate.fields.some((item) => item.apiName === field.apiName)) errors.push(`Field "${field.apiName}" must be removed using the field delete endpoint`);
  }
  for (const field of candidate.fields) {
    const error = validateFieldChange(current.fields.find((item) => item.apiName === field.apiName), field, tenant.records[current.apiName] ?? []);
    if (error) errors.push(error);
  }
  const knownObjects = tenant.objects.map((item) => item.apiName === current.apiName ? candidate : item);
  for (const error of [
    validateExistingFieldValues(candidate, tenant.records[current.apiName] ?? []),
    validateObjectRelationships(candidate, knownObjects),
    validateRelatedLookupFilters(candidate, knownObjects),
    validateRelatedLists(candidate, knownObjects, current)
  ]) if (error) errors.push(error);
  if (!metadataPrecondition(req, res, current)) return;
  return res.status(errors.length ? 422 : 200).json({
    valid: errors.length === 0, revision: metadataVersion(current), errors
  });
});
app.put('/api/metadata/objects/:apiName', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const parsed = objectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid object metadata', details: parsed.error.flatten() });
  if (parsed.data.apiName !== req.params.apiName) return res.status(400).json({ error: 'Object API name cannot be changed through this endpoint' });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const current = tenant.objects.find((item) => item.apiName === req.params.apiName);
  if (!current) return res.status(404).json({ error: `Object "${req.params.apiName}" was not found` });
  if (parsed.data.kind !== current.kind) return res.status(400).json({ error: 'Object type cannot be changed after creation' });
  if (!metadataPrecondition(req, res, current)) return;
  const systemManagedFields = current.fields.filter((field) =>
    field.apiName === 'CurrencyIsoCode' && !parsed.data.fields.some((candidate) => candidate.apiName === field.apiName));
  const objectInput = systemManagedFields.length
    ? { ...parsed.data, fields: [...parsed.data.fields, ...systemManagedFields] }
    : parsed.data;
  const removedField = current.fields.find((field) => !objectInput.fields.some((candidate) => candidate.apiName === field.apiName));
  if (removedField) return res.status(400).json({ error: `Field "${removedField.apiName}" cannot be removed through object save; delete it from Fields & Relationships` });
  const object = withObjectDefaults(objectInput);
  const invalidRelatedList = validateRelatedLists(object, tenant.objects.map((item) =>
    item.apiName === object.apiName ? object : item), current);
  if (invalidRelatedList) return res.status(400).json({ error: invalidRelatedList });
  const assignmentError = validateObjectLayoutProfileAssignments(object, tenant.accessControl.profiles);
  if (assignmentError) return res.status(400).json({ error: assignmentError });
  const relationshipError = validateObjectRelationships(object, tenant.objects);
  if (relationshipError) return res.status(400).json({ error: relationshipError });
  const candidateObjects = tenant.objects.map((item) => item.apiName === object.apiName ? object : item);
  const lookupFilterError = validateRelatedLookupFilters(object, candidateObjects);
  if (lookupFilterError) return res.status(400).json({ error: lookupFilterError });
  const incompatiblePage = tenant.pages.find((page) => page.targetObject === object.apiName
    && page.components.some((component) => !pageComponentFeatureEnabled(component.type, object.settings)));
  if (incompatiblePage) return res.status(409).json({ error: `Object feature settings conflict with components on Lightning page "${incompatiblePage.label}"` });
  if (current.settings?.allowReports !== false && object.settings?.allowReports === false) {
    const referencedReport = tenant.reports.find((report) => report.objectApiName === object.apiName);
    if (referencedReport) {
      return res.status(409).json({ error: `Remove report "${referencedReport.label}" before disabling reports for "${object.label}"` });
    }
    const referencedDashboard = tenant.dashboards.find((dashboard) =>
      dashboard.filters.some((filter) => filter.objectApiName === object.apiName)
      || dashboard.components.some((component) => component.type !== 'Custom' && component.objectApiName === object.apiName));
    if (referencedDashboard) {
      return res.status(409).json({ error: `Remove dashboard references from "${referencedDashboard.label}" before disabling reports for "${object.label}"` });
    }
  }
  const invalidRecordType = (tenant.records[object.apiName] ?? []).find((record) =>
    typeof record.RecordTypeId === 'string' && !object.recordTypes?.some((recordType) => recordType.id === record.RecordTypeId && recordType.active));
  if (invalidRecordType) return res.status(409).json({ error: `Record type "${String(invalidRecordType.RecordTypeId)}" is assigned to existing records and cannot be removed or deactivated` });
  const removedRecordTypes = (current.recordTypes ?? []).filter((recordType) =>
    !object.recordTypes?.some((candidate) => candidate.id === recordType.id && candidate.active));
  for (const recordType of removedRecordTypes) {
    const pageDependency = tenant.pages.find((page) => page.targetObject === object.apiName
      && page.activationAssignments?.some((assignment) => assignment.recordTypeId === recordType.id));
    if (pageDependency) return res.status(409).json({
      error: `Record type "${recordType.label}" is assigned to Lightning page "${pageDependency.label}"`
    });
    const flowDependency = tenant.flows.find((flow) => flowUsesObject(flow, object.apiName)
      && containsFieldReference([flow.startConfig, flow.elements.map((element) => element.config), flow.resources], recordType.id));
    if (flowDependency) return res.status(409).json({
      error: `Record type "${recordType.label}" is referenced by flow "${flowDependency.label}"`
    });
  }
  const invalidRecordTypeAssignment = [
    ...tenant.accessControl.profiles.flatMap((profile) => Object.keys(profile.recordTypePermissions)),
    ...tenant.accessControl.permissionSets.flatMap((set) => Object.keys(set.recordTypePermissions)),
    ...tenant.accessControl.permissionSetGroups.flatMap((group) => Object.keys(group.mutedRecordTypePermissions))
  ].find((key) => key.startsWith(`${object.apiName}.`)
    && !object.recordTypes?.some((recordType) => recordType.id === key.slice(object.apiName.length + 1) && recordType.active));
  if (invalidRecordTypeAssignment) {
    return res.status(409).json({ error: `Record type access "${invalidRecordTypeAssignment}" must be removed before the record type is deactivated or removed` });
  }
  const knownObjects = new Set([...tenant.objects.map((item) => item.apiName), object.apiName]);
  const invalidRelationship = object.fields.find((field) => field.relationship && !knownObjects.has(field.relationship.targetObject));
  if (invalidRelationship) return res.status(400).json({ error: `Relationship target "${invalidRelationship.relationship?.targetObject}" does not exist` });
  for (const field of object.fields) {
    const currentField = current.fields.find((item) => item.apiName === field.apiName);
    const fieldError = validateFieldChange(currentField, field, tenant.records[object.apiName] ?? []);
    if (fieldError) return res.status(409).json({ error: fieldError });
  }
  const existingValuesError = validateExistingFieldValues(object, tenant.records[object.apiName] ?? []);
  if (existingValuesError) return res.status(409).json({ error: existingValuesError });
  const addedFieldPermissions = Object.fromEntries(object.fields
    .filter((field) => !current.fields.some((currentField) => currentField.apiName === field.apiName))
    .map((field) => [`${object.apiName}.${field.apiName}`, { ...fullFieldMetadataPermissions }]));
  const updated = {
    ...tenant,
    objects: tenant.objects.map((item) => item.apiName === object.apiName ? object : item),
    accessControl: {
      ...tenant.accessControl,
      permissionSets: tenant.accessControl.permissionSets.map((set) => grantsMetadataCrud(set)
        ? { ...set, fieldPermissions: { ...set.fieldPermissions, ...addedFieldPermissions } }
        : set)
    }
  };
  const saved = commitObjectMetadata(principal.tenantId, principal.userId, updated, 'UPDATED', current, object)!;
  return res.json({ object: saved });
});
app.delete('/api/metadata/objects/:apiName', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const object = tenant.objects.find((item) => item.apiName === apiName);
  if (!object) return res.status(404).json({ error: `Object "${apiName}" was not found` });
  if (object.kind !== 'Custom Object') return res.status(403).json({ error: 'Standard objects cannot be deleted' });
  if ((tenant.records[apiName] ?? []).length) return res.status(409).json({ error: 'Delete or export this object’s records before deleting the object' });
  if (!metadataPrecondition(req, res, object)) return;
  const dependencies = findObjectDependencies(tenant, apiName);
  if (dependencies.length) return res.status(409).json({
    error: `Object "${apiName}" is still referenced by ${dependencies.join('; ')}`,
    dependencies
  });
  const updatedTenant = removeObjectMetadata(tenant, apiName);
  commitObjectMetadata(principal.tenantId, principal.userId, updatedTenant, 'DELETED', object);
  return res.status(204).end();
});
app.post('/api/metadata/objects/:apiName/formulas/validate', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const object = tenant.objects.find((item) => item.apiName === apiName);
  if (!object) return res.status(404).json({ error: `Object "${apiName}" was not found` });
  const parsed = z.object({
    expression: z.string().trim().min(1).max(10_000),
    returnType: z.enum(['Number', 'Currency', 'Percent', 'Text', 'Date', 'Checkbox'])
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid formula validation request', details: parsed.error.flatten() });
  const sampleValue = (field: ObjectMetadata['fields'][number]): unknown => {
    const type = field.formula?.returnType ?? field.dataType;
    if (/^(Number|Currency|Percent)(?:\(|$)/.test(type)) return 1;
    if (type === 'Checkbox') return true;
    if (type === 'Date') return '2026-01-15';
    if (type === 'Date/Time') return '2026-01-15T12:00:00.000Z';
    return 'Sample';
  };
  const resolveField = (name: string): unknown => {
    const fieldName = name.replace(/^\$Record\./, '');
    const field = object.fields.find((item) => item.apiName === fieldName);
    if (!field) throw new Error(`Field "${fieldName}" does not exist on "${object.label}".`);
    return sampleValue(field);
  };
  try {
    const result = evaluateFormula(parsed.data.expression, resolveField, {
      ...formulaContextForUser(tenant, principal.userId),
      isNew: false,
      isClone: false,
      hasPrior: true,
      resolvePriorField: resolveField,
      sourceObjectApiName: object.apiName
    });
    if (['Number', 'Currency', 'Percent'].includes(parsed.data.returnType) && !Number.isFinite(Number(result))) {
      throw new Error(`Formula does not produce a valid ${parsed.data.returnType} value.`);
    }
    if (parsed.data.returnType === 'Date' && !Number.isFinite(new Date(String(result)).getTime())) {
      throw new Error('Formula does not produce a valid Date value.');
    }
    return res.json({ valid: true });
  } catch (error) {
    return res.status(422).json({
      valid: false,
      error: error instanceof Error ? error.message : 'Formula could not be validated'
    });
  }
});
app.post('/api/metadata/objects/:apiName/fields', requireAnyPermission('fields:create', 'metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const object = tenant.objects.find((item) => item.apiName === req.params.apiName);
  if (!object) return res.status(404).json({ error: `Object "${req.params.apiName}" was not found` });
  const parsed = z.union([
    fieldSchema,
    z.object({
      field: fieldSchema,
      relatedLookupFilters: z.array(relatedLookupFilterSchema).optional(),
      relatedLookupFilterLogic: z.record(z.enum(['All', 'Any'])).optional(),
      pageLayoutIds: z.array(z.string().min(1)).optional()
    }).strict()
  ]).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid field metadata', details: parsed.error.flatten() });
  if (!metadataPrecondition(req, res, object)) return;
  const field = 'field' in parsed.data ? parsed.data.field : parsed.data;
  const relatedLookupFilters = 'field' in parsed.data ? parsed.data.relatedLookupFilters ?? [] : [];
  const relatedLookupFilterLogic = 'field' in parsed.data ? parsed.data.relatedLookupFilterLogic ?? {} : {};
  const pageLayoutIds = 'field' in parsed.data ? parsed.data.pageLayoutIds ?? [] : [];
  if (!field.apiName.endsWith('__c')) return res.status(400).json({ error: 'New custom field API names must end in __c' });
  if (object.fields.some((item) => item.apiName === field.apiName)) return res.status(409).json({ error: 'Field API name already exists' });
  if (field.relationship && !tenant.objects.some((item) => item.apiName === field.relationship?.targetObject)) {
    return res.status(400).json({ error: `Relationship target "${field.relationship.targetObject}" does not exist` });
  }
  if (relatedLookupFilters.some((filter) => filter.fieldApiName !== field.apiName)) {
    return res.status(400).json({ error: 'New field lookup filters must reference the field being created' });
  }
  if (new Set(pageLayoutIds).size !== pageLayoutIds.length
    || pageLayoutIds.some((id) => !object.pageLayouts?.some((layout) => layout.id === id))) {
    return res.status(400).json({ error: 'Field creation references an unknown or duplicate page layout' });
  }
  const fieldError = validateFieldChange(undefined, field, tenant.records[object.apiName] ?? []);
  if (fieldError) return res.status(409).json({ error: fieldError });
  if (field.trackHistory && !object.settings?.trackFieldHistory) return res.status(400).json({ error: 'Enable object field history tracking before tracking individual fields' });
  const updatedObject = {
    ...object,
    fields: [...object.fields, field],
    pageLayouts: object.pageLayouts?.map((layout) => pageLayoutIds.includes(layout.id)
      ? {
        ...layout,
        sections: layout.sections.length
          ? layout.sections.map((section, index) => index === 0
            ? { ...section, fieldApiNames: [...section.fieldApiNames, field.apiName] }
            : section)
          : [{ id: `${layout.id}-record-information`, label: 'Record Information', columns: 2 as const, fieldApiNames: [field.apiName] }]
      }
      : layout),
    relatedLookupFilters: [...(object.relatedLookupFilters ?? []), ...relatedLookupFilters],
    ...(Object.keys({ ...object.relatedLookupFilterLogic, ...relatedLookupFilterLogic }).length
      ? { relatedLookupFilterLogic: { ...object.relatedLookupFilterLogic, ...relatedLookupFilterLogic } }
      : {})
  };
  const objectValidation = objectSchema.safeParse(updatedObject);
  if (!objectValidation.success) return res.status(400).json({ error: 'Invalid object metadata', details: objectValidation.error.flatten() });
  const relationshipError = validateObjectRelationships(updatedObject, tenant.objects);
  if (relationshipError) return res.status(400).json({ error: relationshipError });
  const lookupFilterError = validateRelatedLookupFilters(updatedObject, tenant.objects);
  if (lookupFilterError) return res.status(400).json({ error: lookupFilterError });
  const fieldKey = `${object.apiName}.${field.apiName}`;
  const updatedTenant = {
    ...tenant,
    objects: tenant.objects.map((item) => item.apiName === object.apiName ? updatedObject : item),
    accessControl: {
      ...tenant.accessControl,
      permissionSets: tenant.accessControl.permissionSets.map((set) => grantsMetadataCrud(set)
        ? { ...set, fieldPermissions: { ...set.fieldPermissions, [fieldKey]: { ...fullFieldMetadataPermissions } } }
        : set)
    }
  };
  const saved = commitObjectMetadata(principal.tenantId, principal.userId, updatedTenant, 'FIELD_CREATED', object, updatedObject)!;
  return res.status(201).json({ object: saved, field });
});
app.get('/api/metadata/objects/:apiName/field-dependencies', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const object = tenant.objects.find((item) => item.apiName === apiName);
  if (!object) return res.status(404).json({ error: `Object "${apiName}" was not found` });
  return res.json({
    fields: object.fields.map((field) => ({
      fieldApiName: field.apiName,
      dependencies: findFieldDependencies(tenant, apiName, field.apiName)
    })).filter((item) => item.dependencies.length > 0)
  });
});
app.get('/api/metadata/objects/:apiName/dependencies', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  if (!tenant.objects.some((item) => item.apiName === apiName)) {
    return res.status(404).json({ error: `Object "${apiName}" was not found` });
  }
  return res.json({ dependencies: findObjectDependencies(tenant, apiName) });
});
app.put('/api/metadata/objects/:apiName/fields/:fieldApiName', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const object = tenant.objects.find((item) => item.apiName === req.params.apiName);
  if (!object) return res.status(404).json({ error: `Object "${req.params.apiName}" was not found` });
  if (!metadataPrecondition(req, res, object)) return;
  const existing = object.fields.find((item) => item.apiName === req.params.fieldApiName);
  if (!existing) return res.status(404).json({ error: `Field "${req.params.fieldApiName}" was not found` });
  const parsed = fieldSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid field metadata', details: parsed.error.flatten() });
  if (parsed.data.apiName !== existing.apiName) return res.status(400).json({ error: 'Field API names cannot be changed through this endpoint' });
  const fieldError = validateFieldChange(existing, parsed.data, tenant.records[object.apiName] ?? []);
  if (fieldError) return res.status(409).json({ error: fieldError });
  if (parsed.data.trackHistory && !object.settings?.trackFieldHistory) return res.status(400).json({ error: 'Enable object field history tracking before tracking individual fields' });
  if (parsed.data.relationship && !tenant.objects.some((item) => item.apiName === parsed.data.relationship?.targetObject)) {
    return res.status(400).json({ error: `Relationship target "${parsed.data.relationship.targetObject}" does not exist` });
  }
  const updatedObject = { ...object, fields: object.fields.map((item) => item.apiName === existing.apiName ? parsed.data : item) };
  const objectValidation = objectSchema.safeParse(updatedObject);
  if (!objectValidation.success) return res.status(400).json({ error: 'Invalid object metadata', details: objectValidation.error.flatten() });
  const existingValuesError = validateExistingFieldValues(updatedObject, tenant.records[object.apiName] ?? []);
  if (existingValuesError) return res.status(409).json({ error: existingValuesError });
  const relationshipError = validateObjectRelationships(updatedObject, tenant.objects);
  if (relationshipError) return res.status(400).json({ error: relationshipError });
  const lookupFilterError = validateRelatedLookupFilters(updatedObject, tenant.objects);
  if (lookupFilterError) return res.status(400).json({ error: lookupFilterError });
  const updatedTenant = { ...tenant, objects: tenant.objects.map((item) => item.apiName === object.apiName ? updatedObject : item) };
  const saved = commitObjectMetadata(principal.tenantId, principal.userId, updatedTenant, 'FIELD_UPDATED', object, updatedObject)!;
  return res.json({ object: saved, field: parsed.data });
});
app.delete('/api/metadata/objects/:apiName/fields/:fieldApiName', requireAnyPermission('fields:delete', 'metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const fieldApiName = routeParam(req, 'fieldApiName');
  const object = tenant.objects.find((item) => item.apiName === apiName);
  if (!object) return res.status(404).json({ error: `Object "${apiName}" was not found` });
  if (!metadataPrecondition(req, res, object)) return;
  const field = object.fields.find((item) => item.apiName === fieldApiName);
  if (!field) return res.status(404).json({ error: `Field "${fieldApiName}" was not found` });
  if (!fieldApiName.endsWith('__c')) return res.status(403).json({ error: 'Standard fields cannot be deleted' });
  // Never erase populated record values as a side effect of deleting field metadata.
  if ((tenant.records[apiName] ?? []).some((record) => record[fieldApiName] !== undefined && record[fieldApiName] !== null && record[fieldApiName] !== '')) {
    return res.status(409).json({ error: `Field "${fieldApiName}" contains business data and cannot be deleted` });
  }
  const dependencies = findFieldDependencies(tenant, apiName, fieldApiName);
  if (dependencies.length) return res.status(409).json({ error: `Field "${fieldApiName}" is referenced by ${dependencies.join(', ')}` });

  const relatedLookupFilterLogic = Object.fromEntries(
    Object.entries(object.relatedLookupFilterLogic ?? {}).filter(([name]) => name !== fieldApiName)
  );
  const updatedObject = {
    ...object,
    fields: object.fields.filter((item) => item.apiName !== fieldApiName),
    relatedLookupFilterLogic: Object.keys(relatedLookupFilterLogic).length ? relatedLookupFilterLogic : undefined
  };
  const updatedTenant: TenantData = {
    ...tenant,
    objects: tenant.objects.map((item) => item.apiName === apiName ? updatedObject : item),
    fieldHistory: tenant.fieldHistory.filter((entry) => entry.objectApiName !== apiName || entry.fieldApiName !== fieldApiName),
    records: {
      ...tenant.records,
      [apiName]: (tenant.records[apiName] ?? []).map((record) => {
        const updatedRecord = { ...record };
        delete updatedRecord[fieldApiName];
        return updatedRecord;
      })
    },
    accessControl: {
      ...tenant.accessControl,
      profiles: tenant.accessControl.profiles.map((profile) => ({
        ...profile,
        fieldPermissions: Object.fromEntries(Object.entries(profile.fieldPermissions)
          .filter(([key]) => key !== `${apiName}.${fieldApiName}`))
      })),
      permissionSets: tenant.accessControl.permissionSets.map((set) => ({
        ...set,
        fieldPermissions: Object.fromEntries(Object.entries(set.fieldPermissions).filter(([key]) => key !== `${apiName}.${fieldApiName}`))
      })),
      permissionSetGroups: tenant.accessControl.permissionSetGroups.map((group) => ({
        ...group,
        mutedFieldPermissions: Object.fromEntries(Object.entries(group.mutedFieldPermissions).filter(([key]) => key !== `${apiName}.${fieldApiName}`))
      }))
    }
  };
  const saved = commitObjectMetadata(principal.tenantId, principal.userId, updatedTenant, 'FIELD_DELETED', object, updatedObject)!;
  return res.json({ object: saved });
});
}
