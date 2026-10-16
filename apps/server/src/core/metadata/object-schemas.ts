import { z } from 'zod';
import { recordWritePolicySchema } from '../../record-write-policy.js';
import { isValidFlowDateTime, numericFieldValueError } from '../../modules/records/record-values.js';
import type { createPersistedMetadataReadMode } from '../state/metadata-read-mode.js';

/** Single Core Object/Field metadata schema registry with legacy read mode injection. */
export function createCoreObjectSchemas(persistedMetadataReadMode: ReturnType<typeof createPersistedMetadataReadMode>) {
const fieldSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  dataType: z.string().min(1),
  required: z.boolean(),
  unique: z.boolean(),
  externalId: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  description: z.string().optional(),
  helpText: z.string().max(255).optional(),
  picklistValues: z.array(z.string().trim().min(1)).optional(),
  picklistRestricted: z.boolean().optional(),
  controllerFieldApiName: z.string().min(1).optional(),
  valueSettings: z.record(z.array(z.string().trim().min(1))).optional(),
  trackHistory: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
  formula: z.object({ expression: z.string().min(1), returnType: z.string().min(1) }).optional(),
  relationship: z.object({
    type: z.enum(['Lookup', 'Master-Detail', 'Hierarchical']),
    targetObject: z.string().min(1),
    relationshipName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    childRelationshipName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    deleteBehavior: z.enum(['Clear', 'Restrict']).optional(),
    allowReparenting: z.boolean().optional()
  }).optional()
}).superRefine((field, context) => {
  const supportedDataType = /^(?:Text(?:\(\d+\))?|Long Text Area|Number(?:\(\d+,\s*\d+\))?|Currency(?:\(\d+,\s*\d+\))?|Percent(?:\(\d+,\s*\d+\))?|Date|Date\/Time|DateTime|Checkbox|Email|Phone|URL|Geolocation|Picklist|Multi-Select Picklist|AutoNumber|Auto Number|Name|Formula\((?:Number|Currency|Percent|Text|Date|Checkbox)\)|Lookup\([A-Za-z][A-Za-z0-9_]*\)|Master-Detail\([A-Za-z][A-Za-z0-9_]*\))$/.test(field.dataType);
  if (!supportedDataType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: `Unsupported field type "${field.dataType}"` });
  }
  if (field.formula && field.relationship) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship'], message: 'A field cannot be both a formula and a relationship' });
  }
  if (field.formula && !field.dataType.startsWith('Formula(')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Formula fields must use a Formula data type' });
  }
  if (field.dataType.startsWith('Formula(') && !field.formula) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formula'], message: 'Formula data types require a formula definition' });
  }
  if (field.formula && field.dataType !== `Formula(${field.formula.returnType})`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Formula return type must match its data type' });
  }
  if (field.formula && (field.required || field.unique)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['required'], message: 'Formula fields cannot be required or unique' });
  }
  if (field.relationship && field.dataType !== `${field.relationship.type === 'Hierarchical' ? 'Lookup' : field.relationship.type}(${field.relationship.targetObject})`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Relationship field type must match its relationship definition' });
  }
  if (!persistedMetadataReadMode.active && /^(?:Lookup|Master-Detail)\(/.test(field.dataType) !== Boolean(field.relationship)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship'], message: 'Lookup and master-detail field types require a matching relationship definition' });
  }
  if (field.formula && !['Number', 'Currency', 'Percent', 'Text', 'Date', 'Checkbox'].includes(field.formula.returnType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formula', 'returnType'], message: 'Unsupported formula return type' });
  }
  if (field.relationship?.type === 'Master-Detail' && !field.required) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['required'], message: 'Master-detail relationship fields must be required' });
  }
  if (field.relationship?.deleteBehavior !== undefined && field.relationship.type !== 'Lookup') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship', 'deleteBehavior'], message: 'Delete behavior can only be configured on lookup relationships' });
  }
  if (field.relationship?.deleteBehavior === 'Clear' && field.required) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship', 'deleteBehavior'], message: 'Required lookup relationships cannot be cleared when the parent is deleted' });
  }
  if (field.relationship?.allowReparenting !== undefined && field.relationship.type !== 'Master-Detail') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship', 'allowReparenting'], message: 'Reparenting can only be configured on master-detail relationships' });
  }
  const isPicklist = field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist';
  if (field.picklistValues && !isPicklist) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist values can only be configured on Picklist fields' });
  }
  if (!persistedMetadataReadMode.active && field.picklistValues && field.picklistValues.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist fields must define at least one value' });
  }
  if (!persistedMetadataReadMode.active && isPicklist && !field.picklistValues?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist fields must define at least one value' });
  }
  if ((field.picklistRestricted !== undefined || field.controllerFieldApiName !== undefined || field.valueSettings !== undefined) && !isPicklist) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist settings can only be configured on Picklist fields' });
  }
  if (field.picklistValues && new Set(field.picklistValues.map((value) => value.toLowerCase())).size !== field.picklistValues.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist values must be unique' });
  }
  if (field.dataType === 'Multi-Select Picklist' && field.picklistValues?.some((value) => value.includes(';'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Multi-select picklist values cannot contain semicolons' });
  }
  if (field.trackHistory && field.formula) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['trackHistory'], message: 'Formula fields cannot have field history tracking enabled' });
  }
  if ((field.dataType === 'Long Text Area' || field.dataType === 'Multi-Select Picklist' || field.dataType === 'Geolocation') && field.unique) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['unique'], message: 'Long text area, multi-select picklist, and geolocation fields cannot be unique' });
  }
  if (field.externalId && !/^(Text(?:\(\d+\))?|Number(?:\(\d+,\s*\d+\))?|Email|Phone|AutoNumber|Auto Number)$/.test(field.dataType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['externalId'], message: 'External IDs require a text, number, email, phone, or auto-number field' });
  }
  if (field.caseSensitive !== undefined && (!field.unique || !/^(Text(?:\(\d+\))?|Email|Phone)$/.test(field.dataType))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['caseSensitive'], message: 'Case sensitivity can only be configured for unique text, email, or phone fields' });
  }
  if (field.dataType.startsWith('Text(')) {
    const textLength = field.dataType.match(/^Text\((\d+)\)$/);
    if (!textLength || Number(textLength[1]) < 1 || Number(textLength[1]) > 255) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Text field length must be between 1 and 255 characters' });
    }
  }
  if (/^(Number|Currency|Percent)\(/.test(field.dataType)) {
    const numericFormat = field.dataType.match(/^(Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
    if (!numericFormat || Number(numericFormat[2]) < 1 || Number(numericFormat[2]) > 18
      || Number(numericFormat[3]) > Number(numericFormat[2])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataType'], message: 'Numeric precision must be 1–18 digits and scale cannot exceed precision' });
    }
  }
  if (field.defaultValue !== undefined) {
    if (field.formula || field.relationship || field.dataType === 'Geolocation' || field.dataType === 'AutoNumber' || field.dataType === 'Auto Number') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Formula, relationship, geolocation, and auto-number fields cannot have a default value' });
    } else if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType)
      && (typeof field.defaultValue !== 'number' || !Number.isFinite(field.defaultValue))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Numeric fields require a numeric default value' });
    } else if (field.dataType === 'Checkbox' && typeof field.defaultValue !== 'boolean') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Checkbox fields require a true or false default value' });
    } else if (!/^(Number|Currency|Percent)(\(|$)/.test(field.dataType) && field.dataType !== 'Checkbox' && typeof field.defaultValue !== 'string') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'This field type requires a text default value' });
    } else if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType) && typeof field.defaultValue === 'number') {
      const numericError = numericFieldValueError(field.dataType, field.defaultValue);
      if (numericError) context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: numericError });
    } else if (typeof field.defaultValue === 'string') {
      const textLimit = field.dataType.match(/^Text(?:\((\d+)\))?$/);
      const maximumTextLength = textLimit ? Number(textLimit[1] ?? 255) : undefined;
      if (maximumTextLength !== undefined && field.defaultValue.length > maximumTextLength) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: `Default value exceeds the ${maximumTextLength} character limit` });
      }
      if (field.dataType === 'Long Text Area' && field.defaultValue.length > 131072) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Default value exceeds the 131072 character limit' });
      }
      if (field.dataType === 'Date' && (!/^\d{4}-\d{2}-\d{2}$/.test(field.defaultValue)
        || !Number.isFinite(Date.parse(`${field.defaultValue}T00:00:00.000Z`))
        || new Date(`${field.defaultValue}T00:00:00.000Z`).toISOString().slice(0, 10) !== field.defaultValue)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Date defaults must be valid YYYY-MM-DD dates' });
      }
      if ((field.dataType === 'Date/Time' || field.dataType === 'DateTime') && !isValidFlowDateTime(field.defaultValue)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Date/time defaults must be valid date-time values' });
      }
      if (field.dataType === 'Email' && field.defaultValue && !z.string().email().safeParse(field.defaultValue).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Email defaults must be valid email addresses' });
      }
      if (field.dataType === 'URL' && field.defaultValue) {
        let validUrl = false;
        try {
          validUrl = ['http:', 'https:'].includes(new URL(field.defaultValue).protocol);
        } catch {
          validUrl = false;
        }
        if (!validUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'URL defaults must be valid HTTP or HTTPS URLs' });
      }
      const defaultPicklistValues = field.dataType === 'Multi-Select Picklist'
        ? field.defaultValue.split(';')
        : [field.defaultValue];
      if (isPicklist && (!field.picklistValues
        || defaultPicklistValues.some((value) => !field.picklistValues?.includes(value)))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Default value must match configured picklist options' });
      }
      if (field.dataType === 'Multi-Select Picklist' && (defaultPicklistValues.some((value) => !value)
        || new Set(defaultPicklistValues).size !== defaultPicklistValues.length)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultValue'], message: 'Multi-select defaults must contain distinct configured values' });
      }
    }
  }
});
const pageLayoutSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  columns: z.union([z.literal(1), z.literal(2)]),
  fieldApiNames: z.array(z.string())
});
const pageLayoutCustomLinkSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(2000),
  openInNewWindow: z.boolean().default(false)
}).superRefine((link, context) => {
  if (/[\u0000-\u001f\u007f]/.test(link.url)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Custom link URLs cannot contain control characters' });
    return;
  }
  const url = link.url.replace(/\{!Record\.[A-Za-z][A-Za-z0-9_]*\}/g, 'record-value');
  if (/[{}]/.test(url)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Custom link merge fields must use the {!Record.FieldApiName} format' });
    return;
  }
  if (url.startsWith('/') && !url.startsWith('//')) return;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Custom links must use an HTTP(S) URL or an absolute application path' });
  }
});
const pageLayoutSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sections: z.array(pageLayoutSectionSchema),
  relatedLists: z.array(z.string()),
  actions: z.array(z.enum(['New', 'Edit', 'Delete'])),
  customLinks: z.array(pageLayoutCustomLinkSchema).optional()
}).superRefine((layout, context) => {
  if (new Set(layout.actions).size !== layout.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'Page layout actions must be unique' });
  }
  if (new Set((layout.customLinks ?? []).map((link) => link.id)).size !== (layout.customLinks ?? []).length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customLinks'], message: 'Custom link IDs must be unique within a page layout' });
  }
});
const pageLayoutAssignmentSchema = z.object({
  profileId: z.string().min(1),
  recordTypeId: z.string().min(1),
  pageLayoutId: z.string().min(1)
});
const compactLayoutSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  fieldApiNames: z.array(z.string())
});
const compactLayoutAssignmentSchema = z.object({
  profileId: z.string().min(1),
  recordTypeId: z.string().min(1),
  compactLayoutId: z.string().min(1)
});
const recordTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  developerName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
  description: z.string().max(1000).optional(),
  active: z.boolean(),
  isDefault: z.boolean(),
  picklistValues: z.record(z.array(z.string().trim().min(1))).optional()
});
const fieldSetSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,254}$/),
  label: z.string().trim().min(1).max(80),
  fieldApiNames: z.array(z.string())
});
const searchLayoutsSchema = z.object({
  searchResults: z.array(z.string()).optional(),
  lookupDialog: z.array(z.string()).optional(),
  lookupPhoneDialog: z.array(z.string()).optional()
}).strict();
const relatedLookupFilterSchema = z.object({
  id: z.string().min(1),
  fieldApiName: z.string().min(1),
  relatedObject: z.string().min(1),
  relatedFieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null', 'Is Not Null']),
  value: z.string(),
  valueFieldApiName: z.string().min(1).optional(),
  required: z.boolean()
});
const objectActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['Standard', 'Custom']),
  enabled: z.boolean(),
  behavior: z.literal('Set Field Value').optional(),
  fieldApiName: z.string().min(1).max(255).optional(),
  value: z.string().max(131072).optional()
}).superRefine((action, context) => {
  if (action.type === 'Standard' && (action.behavior || action.fieldApiName || action.value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['behavior'], message: 'Standard actions cannot have custom behavior' });
  }
  if (action.type === 'Custom' && action.behavior
    && (!action.fieldApiName || action.value === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldApiName'], message: 'Set Field Value actions require a target field and value' });
  }
  if (action.type === 'Custom' && !action.behavior
    && (action.fieldApiName !== undefined || action.value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['behavior'], message: 'Custom action configuration requires a supported behavior' });
  }
});
const objectSettingsSchema = z.object({
  allowReports: z.boolean(),
  allowActivities: z.boolean(),
  trackFieldHistory: z.boolean(),
  allowInChatter: z.boolean(),
  deploymentStatus: z.enum(['In Development', 'Deployed']),
  recordNameType: z.enum(['Text', 'Auto Number']),
  recordNameFormat: z.string()
});
const customObjectTabSchema = z.object({
  style: z.enum(['Blue', 'Green', 'Orange', 'Purple', 'Red', 'Teal', 'Yellow'])
});
const runtimeRecordSchema = z.object({
  Id: z.string().min(1),
  CreatedDate: z.string().datetime(),
  CreatedById: z.string().min(1).optional(),
  LastModifiedDate: z.string().datetime(),
  LastModifiedById: z.string().min(1).optional(),
  SystemModstamp: z.string().datetime().optional()
}).catchall(z.unknown());
const listViewButtonSchema = z.enum([
  'New',
  'Import',
  'Mass Delete',
  'Change Owner',
  'Printable View',
  'Add to Campaign'
]);
const platformEventSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*__e$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(1000).default(''),
  fields: z.array(fieldSchema).min(1)
}).superRefine((event, context) => {
  const names = new Set<string>();
  event.fields.forEach((field, index) => {
    if (names.has(field.apiName.toLowerCase())) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'apiName'], message: 'Platform event field API names must be unique' });
    }
    names.add(field.apiName.toLowerCase());
    if (field.formula || field.relationship || field.unique || field.defaultValue !== undefined
      || !['Text', 'Long Text Area', 'Number', 'Currency', 'Percent', 'Checkbox', 'Date', 'DateTime', 'Picklist'].some((type) =>
        field.dataType === type || field.dataType.startsWith(`${type}(`))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index], message: 'Platform event fields must use supported scalar types and cannot be formulas, relationships, unique, or defaulted' });
    }
  });
});
const platformEventMessageSchema = z.object({
  id: z.string().uuid(),
  eventApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*__e$/),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  publishedBy: z.string().min(1),
  deliveredFlowApiNames: z.array(z.string()).default([]),
  attempts: z.number().int().nonnegative().default(0),
  retryAt: z.string().datetime().nullable().default(null),
  lastError: z.string().max(1000).default(''),
  processedAt: z.string().datetime().nullable().default(null),
  deadLettered: z.boolean().default(false)
});
const normalizeFieldApiName = (name: string) => name.trim().toLocaleLowerCase();
const objectSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  pluralLabel: z.string().min(1),
  kind: z.enum(['Standard Object', 'Custom Object']),
  description: z.string(),
  fields: z.array(fieldSchema),
  // Revision is platform-managed. Never trust the revision sent in a write body.
  revision: z.number().int().nonnegative().optional(),
  pageLayouts: z.array(pageLayoutSchema).optional(),
  pageLayoutAssignments: z.array(pageLayoutAssignmentSchema).optional(),
  recordTypes: z.array(recordTypeSchema).optional(),
  compactLayouts: z.array(compactLayoutSchema).optional(),
  compactLayoutAssignments: z.array(compactLayoutAssignmentSchema).optional(),
  compactLayout: z.object({ label: z.string().min(1), fieldApiNames: z.array(z.string()) }).optional(),
  fieldSets: z.array(fieldSetSchema).optional(),
  searchLayouts: searchLayoutsSchema.optional(),
  listViewFilter: z.object({ fieldApiName: z.string().min(1), value: z.string() }).optional(),
  relatedLookupFilters: z.array(relatedLookupFilterSchema).optional(),
  relatedLookupFilterLogic: z.record(z.enum(['All', 'Any'])).optional(),
  listViewButtons: z.array(listViewButtonSchema).optional(),
  actions: z.array(objectActionSchema).optional(),
  customTab: customObjectTabSchema.optional(),
  settings: objectSettingsSchema.optional(),
  recordWritePolicy: recordWritePolicySchema.optional()
}).superRefine((object, context) => {
  const listViewButtons = object.listViewButtons ?? [];
  if (new Set(listViewButtons).size !== listViewButtons.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['listViewButtons'], message: 'List view buttons must be unique' });
  }
  const fieldNames = new Set(object.fields.map((field) => normalizeFieldApiName(field.apiName)));
  if (fieldNames.size !== object.fields.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Field API names must be unique' });
  object.fields.forEach((field, index) => {
    const controllerApiName = field.controllerFieldApiName;
    if (!controllerApiName) {
      if (field.valueSettings && Object.keys(field.valueSettings).length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings'], message: 'Dependent picklist values require a controlling field' });
      }
      return;
    }
    const controller = object.fields.find((candidate) => normalizeFieldApiName(candidate.apiName) === normalizeFieldApiName(controllerApiName));
    if ((field.dataType !== 'Picklist' && field.dataType !== 'Multi-Select Picklist') || !controller || normalizeFieldApiName(controller.apiName) === normalizeFieldApiName(field.apiName)
      || !(controller.dataType === 'Picklist' || controller.dataType === 'Checkbox')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'controllerFieldApiName'], message: 'A dependent picklist must use a different Picklist or Checkbox field as its controller' });
      return;
    }
    const controllerValues = controller.dataType === 'Checkbox' ? ['true', 'false'] : controller.picklistValues ?? [];
    for (const [controllerValue, dependentValues] of Object.entries(field.valueSettings ?? {})) {
      if (!controllerValues.includes(controllerValue)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings', controllerValue], message: `Unknown controlling value "${controllerValue}"` });
      }
      if (new Set(dependentValues.map((value) => value.toLocaleLowerCase())).size !== dependentValues.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings', controllerValue], message: 'Dependent picklist values must be unique' });
      }
      if (dependentValues.some((value) => !(field.picklistValues ?? []).includes(value))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'valueSettings', controllerValue], message: 'Dependent values must be in the field picklist value set' });
      }
    }
  });
  if (object.kind === 'Custom Object') {
    const nameField = object.fields.find((field) => normalizeFieldApiName(field.apiName) === 'name');
    if (!nameField) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Custom objects must include a Name field' });
    } else if (nameField.formula || nameField.relationship || !nameField.required) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'The Name field must be required and cannot be a formula or relationship' });
    } else if ((object.settings?.recordNameType ?? 'Text') === 'Auto Number' && nameField.dataType !== 'AutoNumber') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Auto-number record names require an AutoNumber Name field' });
    } else if ((object.settings?.recordNameType ?? 'Text') === 'Text' && !/^Text(?:\(|$)/.test(nameField.dataType)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Text record names require a Text Name field' });
    }
  }
  const trackedFields = object.fields.filter((field) => field.trackHistory);
  if (!object.settings?.trackFieldHistory && trackedFields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Enable field history tracking before selecting fields to track' });
  }
  const checkFields = (names: string[], path: (string | number)[]) => {
    names.forEach((name, index) => {
      if (!fieldNames.has(normalizeFieldApiName(name))) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, index], message: `Unknown field ${name}` });
    });
  };
  object.pageLayouts?.forEach((layout, index) => {
    layout.sections.forEach((section, sectionIndex) => checkFields(section.fieldApiNames, ['pageLayouts', index, 'sections', sectionIndex, 'fieldApiNames']));
  });
  if (object.compactLayout) checkFields(object.compactLayout.fieldApiNames, ['compactLayout', 'fieldApiNames']);
  object.compactLayouts?.forEach((layout, index) => {
    checkFields(layout.fieldApiNames, ['compactLayouts', index, 'fieldApiNames']);
    if (new Set(layout.fieldApiNames).size !== layout.fieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayouts', index, 'fieldApiNames'], message: 'Compact layout fields must be unique' });
    }
  });
  if (object.compactLayouts && new Set(object.compactLayouts.map((layout) => layout.id)).size !== object.compactLayouts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayouts'], message: 'Compact layout IDs must be unique' });
  }
  object.fieldSets?.forEach((fieldSet, index) => {
    checkFields(fieldSet.fieldApiNames, ['fieldSets', index, 'fieldApiNames']);
    if (new Set(fieldSet.fieldApiNames.map(normalizeFieldApiName)).size !== fieldSet.fieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets', index, 'fieldApiNames'], message: 'Field set fields must be unique' });
    }
    if (fieldSet.fieldApiNames.some((name) => !object.fields.some((field) => field.apiName === name))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets', index, 'fieldApiNames'], message: 'Field set fields must use their exact API names' });
    }
  });
  Object.entries(object.searchLayouts ?? {}).forEach(([name, fields]) => {
    checkFields(fields, ['searchLayouts', name]);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['searchLayouts', name], message: 'Search layout fields must be unique' });
    }
  });
  object.relatedLookupFilters?.forEach((filter, index) => {
    if (!fieldNames.has(normalizeFieldApiName(filter.fieldApiName))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedLookupFilters', index, 'fieldApiName'], message: `Unknown field ${filter.fieldApiName}` });
  });
  Object.keys(object.relatedLookupFilterLogic ?? {}).forEach((fieldApiName) => {
    const field = object.fields.find((candidate) => candidate.apiName === fieldApiName);
    if (!field?.relationship || !object.relatedLookupFilters?.some((filter) => filter.fieldApiName === fieldApiName)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedLookupFilterLogic', fieldApiName], message: 'Lookup filter logic requires a relationship field with at least one lookup filter' });
    }
  });
  if (object.recordTypes && object.recordTypes.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'An object must have at least one record type' });
  }
  if (object.recordTypes && !object.recordTypes.some((recordType) => recordType.active)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'An object must have at least one active record type' });
  }
  if (object.recordTypes && object.recordTypes.filter((recordType) => recordType.isDefault).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Exactly one record type must be the default' });
  }
  object.recordTypes?.forEach((recordType, recordTypeIndex) => {
    for (const [fieldApiName, values] of Object.entries(recordType.picklistValues ?? {})) {
      const field = object.fields.find((item) => normalizeFieldApiName(item.apiName) === normalizeFieldApiName(fieldApiName));
      if (!field || (field.dataType !== 'Picklist' && field.dataType !== 'Multi-Select Picklist')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type picklist values reference a non-picklist field "${fieldApiName}"` });
      } else {
        if (field.apiName !== fieldApiName) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type picklist settings must use the exact field API name "${field.apiName}"` });
        }
        if (field.picklistValues && values.some((value) => !field.picklistValues?.includes(value))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type values for "${fieldApiName}" must be in the field's configured picklist values` });
        }
      }
      if (new Set(values.map((value) => value.toLocaleLowerCase())).size !== values.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes', recordTypeIndex, 'picklistValues', fieldApiName], message: `Record type values for "${fieldApiName}" must be unique` });
      }
    }
    for (const field of object.fields) {
      if ((field.dataType !== 'Picklist' && field.dataType !== 'Multi-Select Picklist')
        || typeof field.defaultValue !== 'string') continue;
      const recordTypeValues = recordType.picklistValues?.[field.apiName];
      if (!recordTypeValues) continue;
      const defaultValues = field.dataType === 'Multi-Select Picklist'
        ? field.defaultValue.split(';').filter(Boolean)
        : [field.defaultValue];
      if (defaultValues.some((value) => !recordTypeValues.includes(value))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recordTypes', recordTypeIndex, 'picklistValues', field.apiName],
          message: `Record type "${recordType.label}" must include the default value for "${field.label}"`
        });
      }
    }
  });
  if (object.recordTypes?.some((recordType) => recordType.isDefault && !recordType.active)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'The default record type must be active' });
  }
  if (object.recordTypes && new Set(object.recordTypes.map((recordType) => recordType.id)).size !== object.recordTypes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Record type IDs must be unique' });
  }
  if (object.recordTypes && new Set(object.recordTypes.map((recordType) => recordType.developerName.toLocaleLowerCase())).size !== object.recordTypes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Record type developer names must be unique' });
  }
  if (object.recordTypes && new Set(object.recordTypes.map((recordType) => recordType.label.toLocaleLowerCase())).size !== object.recordTypes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recordTypes'], message: 'Record type labels must be unique' });
  }
  if ((object.settings?.recordNameType ?? 'Text') === 'Auto Number') {
    const format = object.settings?.recordNameFormat ?? '';
    const tokens = format.match(/\{0+\}/g) ?? [];
    if (tokens.length !== 1 || /[{}]/.test(format.replace(/\{0+\}/, ''))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['settings', 'recordNameFormat'],
        message: 'Auto-number display formats must contain exactly one numeric token, such as {0000}'
      });
    }
  } else if (object.settings?.recordNameFormat) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['settings', 'recordNameFormat'], message: 'Text record names cannot have an auto-number display format' });
  }
  if (object.pageLayouts && new Set(object.pageLayouts.map((layout) => layout.id)).size !== object.pageLayouts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts'], message: 'Page layout IDs must be unique' });
  }
  if (object.pageLayouts && object.pageLayouts.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts'], message: 'An object must have at least one page layout' });
  }
  object.pageLayouts?.forEach((layout, index) => {
    if (new Set(layout.sections.map((section) => section.id)).size !== layout.sections.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts', index, 'sections'], message: 'Section IDs must be unique within a page layout' });
    }
    const fieldsInLayout = layout.sections.flatMap((section) => section.fieldApiNames);
    if (new Set(fieldsInLayout).size !== fieldsInLayout.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts', index, 'sections'], message: 'A field can appear only once in a page layout' });
    }
    if (new Set(layout.relatedLists.map((name) => name.toLocaleLowerCase())).size !== layout.relatedLists.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayouts', index, 'relatedLists'], message: 'Related lists must be unique within a page layout' });
    }
    (layout.customLinks ?? []).forEach((link, linkIndex) => {
      const fieldReferences = [...link.url.matchAll(/\{!Record\.([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
      fieldReferences.forEach((fieldName) => {
        if (fieldName !== 'Id' && !fieldNames.has(normalizeFieldApiName(fieldName))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['pageLayouts', index, 'customLinks', linkIndex, 'url'],
            message: `Custom link references unknown field "${fieldName}"`
          });
        }
      });
    });
  });
  if (object.fieldSets && new Set(object.fieldSets.map((fieldSet) => fieldSet.apiName.toLocaleLowerCase())).size !== object.fieldSets.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets'], message: 'Field set API names must be unique' });
  }
  if (object.fieldSets && new Set(object.fieldSets.map((fieldSet) => fieldSet.label.toLocaleLowerCase())).size !== object.fieldSets.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldSets'], message: 'Field set labels must be unique' });
  }
  if (object.actions && new Set(object.actions.map((action) => action.id)).size !== object.actions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'Object action IDs must be unique' });
  }
  const actionLabels = object.actions?.map((action) => action.label.trim().toLocaleLowerCase()) ?? [];
  if (new Set(actionLabels).size !== actionLabels.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'Object action labels must be unique' });
  }
  const standardActions = new Set(['New', 'Edit', 'Delete']);
  object.actions?.forEach((action, index) => {
    const normalizedLabel = action.label.trim().toLocaleLowerCase();
    const reservedStandardAction = [...standardActions].some((label) => label.toLocaleLowerCase() === normalizedLabel);
    if (action.type === 'Custom' && reservedStandardAction) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', index, 'label'], message: 'Custom actions cannot reuse standard action labels' });
    }
    if (action.type === 'Standard' && !standardActions.has(action.label)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', index, 'label'], message: 'Standard actions must use a supported standard action label' });
    }
    if (action.type === 'Custom' && action.behavior === 'Set Field Value') {
      const targetField = object.fields.find((field) => normalizeFieldApiName(field.apiName) === normalizeFieldApiName(action.fieldApiName ?? ''));
      if (!targetField || targetField.formula || targetField.relationship
        || targetField.dataType === 'AutoNumber' || targetField.dataType === 'Auto Number') {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['actions', index, 'fieldApiName'], message: 'Custom actions can update only existing writable, non-formula fields' });
      }
    }
  });
  if (object.relatedLookupFilters && new Set(object.relatedLookupFilters.map((filter) => filter.id)).size !== object.relatedLookupFilters.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedLookupFilters'], message: 'Related lookup filter IDs must be unique' });
  }
  object.pageLayoutAssignments?.forEach((assignment, index) => {
    if (!object.recordTypes?.some((recordType) => recordType.id === assignment.recordTypeId && recordType.active)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayoutAssignments', index, 'recordTypeId'], message: `Unknown or inactive record type ${assignment.recordTypeId}` });
    }
    if (!object.pageLayouts?.some((layout) => layout.id === assignment.pageLayoutId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayoutAssignments', index, 'pageLayoutId'], message: `Unknown page layout ${assignment.pageLayoutId}` });
    }
  });
  if (object.pageLayoutAssignments) {
    const assignmentKeys = object.pageLayoutAssignments.map((assignment) => `${assignment.profileId}:${assignment.recordTypeId}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pageLayoutAssignments'], message: 'Each profile and record type can have only one layout assignment' });
    }
  }
  object.compactLayoutAssignments?.forEach((assignment, index) => {
      if (!object.recordTypes?.some((recordType) => recordType.id === assignment.recordTypeId && recordType.active)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayoutAssignments', index, 'recordTypeId'], message: `Unknown or inactive record type ${assignment.recordTypeId}` });
      }
      if (!object.compactLayouts?.some((layout) => layout.id === assignment.compactLayoutId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayoutAssignments', index, 'compactLayoutId'], message: `Unknown compact layout ${assignment.compactLayoutId}` });
      }
  });
  if (object.compactLayoutAssignments) {
    const assignmentKeys = object.compactLayoutAssignments.map((assignment) => `${assignment.profileId}:${assignment.recordTypeId}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['compactLayoutAssignments'], message: 'Each profile and record type can have only one compact layout assignment' });
    }
  }
});

 return { fieldSchema, pageLayoutSectionSchema, pageLayoutCustomLinkSchema, pageLayoutSchema, pageLayoutAssignmentSchema, compactLayoutSchema, compactLayoutAssignmentSchema, recordTypeSchema, fieldSetSchema, searchLayoutsSchema, relatedLookupFilterSchema, objectActionSchema, objectSettingsSchema, customObjectTabSchema, runtimeRecordSchema, listViewButtonSchema, platformEventSchema, platformEventMessageSchema, normalizeFieldApiName, objectSchema };
}
