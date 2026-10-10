import cors from 'cors';
import { readPersistedState, persistToPostgres } from './postgres-state.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { transform } from 'esbuild';
import { lookup } from 'node:dns/promises';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { executeConnectorTest, type ConnectorTestResult } from './connector-test.js';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import nodemailer from 'nodemailer';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import {
  createRefreshToken,
  hashPassword,
  hashToken,
  JwtService,
  verifyPassword,
  type Principal
} from './auth.js';
import {
  canAccessDashboard,
  canEditDashboard,
  dashboardFolderAccessLevel,
  matchesDashboardFilters,
  type DashboardFolderAccessLevel
} from './dashboard-access.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const schedulePollInterval = Number(process.env.METADRIVE_SCHEDULE_POLL_MS ?? 30_000);
if (!Number.isInteger(schedulePollInterval) || schedulePollInterval < 100 || schedulePollInterval > 3_600_000) {
  throw new Error('METADRIVE_SCHEDULE_POLL_MS must be an integer between 100 and 3600000');
}
const dataPath = resolve(process.env.METADRIVE_DATA_PATH ?? 'data/platform-state.json');
const bundledCustomComponentsPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/src/custom-components');
const webOrigins = new Set([
  ...(process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','),
  ...(process.env.WEB_ORIGINS ?? '').split(',')
].map((origin) => origin.trim()).filter(Boolean));
const refreshCookieName = 'metadrive_refresh';
const isProduction = process.env.NODE_ENV === 'production';
const jwtService = await JwtService.create();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || webOrigins.has(origin) || origin === 'http://localhost:4173') return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api') || req.get('x-metadrive-request-source') === 'web-app') return next();
  const startedAt = Date.now();
  let responseBody: unknown;
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return sendJson(body);
  }) as typeof res.json;
  res.on('finish', () => {
    const principal = res.locals.principal as Principal | undefined;
    if (!principal || !tenantData(principal.tenantId)) return;
    const authorization = req.get('authorization') ?? '';
    const authType = authorization.toLowerCase().startsWith('bearer ') ? 'Bearer'
      : authorization.toLowerCase().startsWith('basic ') ? 'Basic'
        : req.get('x-api-key') ? 'API Key'
          : authorization ? 'Other' : 'None';
    const routePath = req.route?.path;
    const apiId = `${req.method} ${typeof routePath === 'string' ? routePath : req.path}`;
    const requestUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
    const isCommunicationRecordsEndpoint = /^\/api\/records\/Communication_Records__c(?:\/|$)/i.test(req.path);
    try {
      appendCommunicationRecord(principal.tenantId, principal.userId, {
        apiId,
        url: communicationSafeUrl(requestUrl),
        authType,
        method: supportedCommunicationMethod(req.method),
        direction: 'Incoming',
        requestBody: isCommunicationRecordsEndpoint ? '' : communicationPayload(req.body),
        responseBody: isCommunicationRecordsEndpoint ? '' : communicationPayload(responseBody),
        status: res.statusCode,
        error: res.statusCode >= 400 ? communicationError(responseBody) : '',
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      console.error(`Failed to record incoming API request "${apiId}": ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  next();
});

function numericFieldValueError(dataType: string, value: number): string | null {
  const format = dataType.match(/^(Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
  if (!format) return null;
  const precision = Number(format[2]);
  const scale = Number(format[3]);
  if (precision < 1 || precision > 18 || scale < 0 || scale > precision) return 'Numeric precision and scale are outside supported limits.';
  if (Math.abs(value) >= 10 ** (precision - scale)) return `Value exceeds the ${precision}-digit precision.`;
  const [mantissa, exponentText = '0'] = Math.abs(value).toString().toLowerCase().split('e');
  const fractionalDigits = mantissa.split('.')[1]?.length ?? 0;
  const valueScale = Math.max(0, fractionalDigits - Number(exponentText));
  if (valueScale > scale) return `Value exceeds the ${scale}-digit scale.`;
  return null;
}

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
  if (/^(?:Lookup|Master-Detail)\(/.test(field.dataType) !== Boolean(field.relationship)) {
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
  if (field.picklistValues && field.picklistValues.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['picklistValues'], message: 'Picklist fields must define at least one value' });
  }
  if (isPicklist && !field.picklistValues?.length) {
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
type RelatedLookupFilterMetadata = z.infer<typeof relatedLookupFilterSchema>;
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
  pageLayouts: z.array(pageLayoutSchema).optional(),
  pageLayoutAssignments: z.array(pageLayoutAssignmentSchema).optional(),
  recordTypes: z.array(recordTypeSchema).optional(),
  compactLayouts: z.array(compactLayoutSchema).optional(),
  compactLayoutAssignments: z.array(compactLayoutAssignmentSchema).optional(),
  compactLayout: z.object({ label: z.string().min(1), fieldApiNames: z.array(z.string()) }).optional(),
  fieldSets: z.array(fieldSetSchema).optional(),
  searchLayouts: searchLayoutsSchema.optional(),
  relatedLookupFilters: z.array(relatedLookupFilterSchema).optional(),
  relatedLookupFilterLogic: z.record(z.enum(['All', 'Any'])).optional(),
  listViewButtons: z.array(listViewButtonSchema).optional(),
  actions: z.array(objectActionSchema).optional(),
  customTab: customObjectTabSchema.optional(),
  settings: objectSettingsSchema.optional()
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
const flowElementSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.unknown()).default({})
});
function isTestLoopbackSmtpUrl(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  return process.env.METADRIVE_SMTP_TEST_MODE === 'true'
    && (host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.')));
}

const namedCredentialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  protocol: z.enum(['HTTPS', 'SMTP']).default('HTTPS'),
  baseUrl: z.string().url(),
  authType: z.enum(['None', 'Bearer', 'Basic', 'API Key']),
  headerName: z.string().optional(),
  keyId: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((credential, context) => {
  const url = new URL(credential.baseUrl);
  const validProtocol = credential.protocol === 'HTTPS'
    ? url.protocol === 'https:'
    : url.protocol === 'smtp:' && ([25, 465, 587, 2525].includes(Number(url.port || 25)) || isTestLoopbackSmtpUrl(url));
  if (!validProtocol || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseUrl'], message: 'Named Credential URL must match its HTTPS or SMTP protocol and cannot include user info, query parameters, or fragments' });
  }
  if (credential.protocol === 'SMTP' && credential.authType !== 'Basic' && credential.authType !== 'None') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authType'], message: 'SMTP credentials support only Basic or unauthenticated SMTP' });
  }
  if (credential.authType === 'API Key' && !credential.headerName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'API Key credentials require an HTTP header name' });
  }
  if (credential.headerName && !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(credential.headerName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'Header name is not a valid HTTP token' });
  }
  if (credential.headerName && ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(credential.headerName.toLowerCase())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'This header cannot be used to transmit an API Key' });
  }
});
const namedCredentialRequestSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  protocol: z.enum(['HTTPS', 'SMTP']).default('HTTPS'),
  baseUrl: z.string().url(),
  authType: z.enum(['None', 'Bearer', 'Basic', 'API Key']),
  headerName: z.string().trim().optional(),
  username: z.string().max(512).optional(),
  secret: z.string().max(8192).optional()
}).superRefine((credential, context) => {
  const url = new URL(credential.baseUrl);
  const validProtocol = credential.protocol === 'HTTPS'
    ? url.protocol === 'https:'
    : url.protocol === 'smtp:' && ([25, 465, 587, 2525].includes(Number(url.port || 25)) || isTestLoopbackSmtpUrl(url));
  if (!validProtocol || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseUrl'], message: 'Named Credential URL must match its HTTPS or SMTP protocol and cannot include user info, query parameters, or fragments' });
  }
  if (credential.protocol === 'SMTP' && credential.authType !== 'Basic' && credential.authType !== 'None') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authType'], message: 'SMTP credentials support only Basic or unauthenticated SMTP' });
  }
  if (credential.authType === 'API Key' && !credential.headerName?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'API Key credentials require an HTTP header name' });
  }
  if (credential.authType === 'API Key' && credential.headerName && ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(credential.headerName.toLowerCase())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'This header cannot be used to transmit an API Key' });
  }
  if (credential.authType === 'Basic' && credential.secret && !credential.username?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: 'Basic authentication requires a username' });
  }
});
type StoredNamedCredential = z.infer<typeof namedCredentialSchema>;
const emailAlertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  objectApiName: z.string().min(1),
  namedCredentialId: z.string().uuid(),
  fromEmail: z.string().email(),
  recipients: z.string().trim().min(1).max(2000),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(1024 * 1024),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
const emailAlertRequestSchema = emailAlertSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).strict();
type EmailAlert = z.infer<typeof emailAlertSchema>;
type NamedCredentialPayload = { username?: string; secret?: string };
type CredentialKeyRing = { activeKeyId: string; keys: Map<string, Buffer> };
const flowConnectorSchema = z.object({
  id: z.string().min(1),
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  label: z.string().default(''),
  kind: z.enum(['normal', 'fault', 'scheduled']).default('normal'),
  scheduledPath: z.object({
    timeSourceFieldApiName: z.string().min(1),
    offsetAmount: z.number().int(),
    offsetUnit: z.enum(['Minutes', 'Hours', 'Days'])
  }).optional()
});
const flowResourceSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['Variable', 'Record', 'Record Collection', 'Formula', 'Constant', 'Choice', 'Text Template']),
  dataType: z.string().min(1),
  isCollection: z.boolean(),
  availableForInput: z.boolean(),
  availableForOutput: z.boolean(),
  value: z.unknown().optional()
});
const flowVersionSchema = z.object({
  versionNumber: z.number().int().positive(),
  status: z.enum(['Draft', 'Active', 'Obsolete']),
  savedAt: z.string().datetime(),
  label: z.string().optional(),
  description: z.string().optional(),
  flowType: z.enum(['Screen Flow', 'Record-Triggered Flow', 'Autolaunched Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow']).optional(),
  triggerObject: z.string().nullable().optional(),
  startConfig: z.record(z.unknown()).optional(),
  elements: z.array(flowElementSchema),
  connectors: z.array(flowConnectorSchema),
  resources: z.array(flowResourceSchema)
});
const flowSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  description: z.string().default(''),
  flowType: z.enum(['Screen Flow', 'Record-Triggered Flow', 'Autolaunched Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow']),
  status: z.enum(['Draft', 'Active']),
  versionNumber: z.number().int().positive(),
  activeVersion: z.number().int().positive().nullable(),
  triggerObject: z.string().nullable(),
  startConfig: z.record(z.unknown()),
  elements: z.array(flowElementSchema).min(1),
  connectors: z.array(flowConnectorSchema),
  resources: z.array(flowResourceSchema),
  versions: z.array(flowVersionSchema)
}).superRefine((flow, context) => {
  const ids = new Set<number>();
  for (const [index, element] of flow.elements.entries()) {
    if (ids.has(element.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'id'], message: 'Element IDs must be unique' });
    ids.add(element.id);
    if (element.type === 'Screen' && flow.flowType !== 'Screen Flow') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'type'], message: 'Screen elements are only supported in Screen Flows' });
    }
  }
  for (const [index, connector] of flow.connectors.entries()) {
    if (!ids.has(connector.from) || !ids.has(connector.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['connectors', index], message: 'Connectors must reference existing elements' });
    }
  }
  if (new Set(flow.connectors.map((connector) => connector.id)).size !== flow.connectors.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['connectors'], message: 'Connector IDs must be unique' });
  }
  if (new Set(flow.resources.map((resource) => resource.name.toLowerCase())).size !== flow.resources.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['resources'], message: 'Resource API names must be unique without regard to case' });
  }
  const startElements = flow.elements.filter((element) => element.type === 'Start');
  if (startElements.length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements'], message: 'A flow must have exactly one Start element' });
  } else if (flow.elements[0]?.id !== startElements[0].id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements'], message: 'The Start element must be first in the flow' });
  }
  for (const [index, element] of flow.elements.entries()) {
    if (element.type !== 'Screen') continue;
    const fields = Array.isArray(element.config.fields) ? element.config.fields : [];
    const names = fields.map((field) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return '';
      const item = field as Record<string, unknown>;
      return typeof item.apiName === 'string' && item.apiName
        ? item.apiName
        : typeof item.label === 'string' ? item.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') : '';
    });
    if (names.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'config', 'fields'], message: 'Screen fields must have valid API names and labels' });
    }
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'config', 'fields'], message: 'Screen field API names must be unique' });
    }
  }
  if (!['Record-Triggered Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow'].includes(flow.flowType) && flow.triggerObject) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['triggerObject'], message: 'Only triggered flows can have a trigger object' });
  }
  if (flow.activeVersion !== null && flow.activeVersion > flow.versionNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['activeVersion'], message: 'Active version cannot exceed the current flow version' });
  }
});
const flowInterviewSchema = z.object({
  id: z.string().uuid(),
  flowApiName: z.string(),
  versionNumber: z.number().int().positive(),
  userId: z.string(),
  kind: z.enum(['screen', 'wait', 'scheduled']),
  screenElementId: z.number().int().positive().nullable(),
  waitUntil: z.string().datetime().nullable(),
  nextElementId: z.number().int().positive().nullable(),
  variables: z.record(z.unknown()),
  record: runtimeRecordSchema.nullable(),
  prior: runtimeRecordSchema.nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  history: z.array(z.object({
    screenElementId: z.number().int().positive(),
    nextElementId: z.number().int().positive().nullable(),
    variables: z.record(z.unknown()),
    record: runtimeRecordSchema.nullable(),
    prior: runtimeRecordSchema.nullable()
  })).default([]),
  retryAt: z.string().datetime().nullable().default(null),
  attempts: z.number().int().nonnegative().default(0),
  allowDraft: z.boolean().default(false)
});
const scheduleRetrySchema = z.object({
  occurrenceAt: z.string().datetime(),
  attempts: z.number().int().positive(),
  retryAt: z.string().datetime()
});
const flowExecutionLogSchema = z.object({
  id: z.string().uuid(),
  flowApiName: z.string(),
  flowLabel: z.string(),
  trigger: z.enum(['Manual', 'Scheduled', 'Record-Triggered', 'Platform Event', 'Scheduled Path', 'Wait Interview']),
  failedAt: z.string().datetime(),
  error: z.string(),
  userId: z.string().nullable()
});
const pageComponentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  properties: z.record(z.unknown()).default({}),
  visible: z.boolean()
});
const libraryComponentResizeSchema = z.object({
  defaultWidth: z.number().int().min(80).max(2000),
  defaultHeight: z.number().int().min(40).max(2000),
  minWidth: z.number().int().min(40).max(2000),
  minHeight: z.number().int().min(30).max(2000)
}).superRefine((resize, context) => {
  if (resize.minWidth > resize.defaultWidth) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minWidth'], message: 'Minimum width cannot exceed the default width' });
  }
  if (resize.minHeight > resize.defaultHeight) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minHeight'], message: 'Minimum height cannot exceed the default height' });
  }
});
const defaultLibraryComponentResize = { defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60 };
const libraryComponentSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  surfaces: z.array(z.enum(['page', 'dashboard', 'flow'])).min(1),
  resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
  jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000),
  compiledJs: z.string().min(1).max(500_000),
  scopedCss: z.string().max(150_000),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime()
}).superRefine((component, context) => {
  if (new Set(component.surfaces).size !== component.surfaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['surfaces'], message: 'Component surfaces must be unique' });
  }
});
const libraryComponentInputSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  surfaces: z.array(z.enum(['page', 'dashboard', 'flow'])).min(1),
  resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
  jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000).default('')
}).superRefine((component, context) => {
  if (new Set(component.surfaces).size !== component.surfaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['surfaces'], message: 'Component surfaces must be unique' });
  }
});
type LibraryComponent = z.infer<typeof libraryComponentSchema>;
const pageActivationAssignmentSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['Org Default', 'App Default', 'App and Profile', 'App, Record Type, and Profile']),
  appId: z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_]*$/).nullable(),
  profileId: z.string().min(1).nullable(),
  recordTypeId: z.string().min(1).nullable(),
  formFactors: z.array(z.enum(['Desktop', 'Phone'])).min(1)
}).superRefine((assignment, context) => {
  if (new Set(assignment.formFactors).size !== assignment.formFactors.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formFactors'], message: 'Form factors must be unique' });
  }
  if (assignment.scope === 'Org Default' && (assignment.appId || assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Org Default assignments cannot target an app, profile, or record type' });
  }
  if (assignment.scope === 'App Default' && !assignment.appId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['appId'], message: 'App Default assignments require an app' });
  }
  if (assignment.scope === 'App Default' && (assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App Default assignments cannot target a profile or record type' });
  }
  if (assignment.scope === 'App and Profile' && (!assignment.appId || !assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App and Profile assignments require an app and profile, and cannot target a record type' });
  }
  if (assignment.scope === 'App, Record Type, and Profile' && (!assignment.appId || !assignment.profileId || !assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App, record type, and profile assignments require all three values' });
  }
});
const lightningAppSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  navigationItems: z.array(z.string().min(1)).min(1),
  navigationPageApiNames: z.array(z.string().min(1)).default([]),
  navigationOrder: z.array(z.object({
    type: z.enum(['Object', 'App Page']),
    apiName: z.string().min(1)
  })).default([]),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0176d3'),
  utilityItems: z.array(z.enum(['Notes', 'History'])).default([])
}).superRefine((app, context) => {
  if (new Set(app.navigationItems).size !== app.navigationItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationItems'], message: 'Navigation items must be unique' });
  }
  if (new Set(app.navigationPageApiNames).size !== app.navigationPageApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationPageApiNames'], message: 'Navigation pages must be unique' });
  }
  const navigationKeys = app.navigationOrder.map((item) => `${item.type}:${item.apiName}`);
  if (new Set(navigationKeys).size !== navigationKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationOrder'], message: 'Navigation order entries must be unique' });
  }
  if (app.navigationOrder.length) {
    const expectedNavigationKeys = [
      ...app.navigationItems.map((apiName) => `Object:${apiName}`),
      ...app.navigationPageApiNames.map((apiName) => `App Page:${apiName}`)
    ].sort();
    if (navigationKeys.some((key) => !expectedNavigationKeys.includes(key))
      || navigationKeys.length !== expectedNavigationKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationOrder'], message: 'Navigation order must include every selected item exactly once' });
    }
  }
  if (new Set(app.utilityItems).size !== app.utilityItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['utilityItems'], message: 'Utility items must be unique' });
  }
});
const pageTemplateSchema = z.enum(['one-region', 'header-main', 'main-sidebar', 'header-main-sidebar']);
const pageTemplateRegions: Record<z.infer<typeof pageTemplateSchema>, string[]> = {
  'one-region': ['main'],
  'header-main': ['header', 'main'],
  'main-sidebar': ['main', 'sidebar'],
  'header-main-sidebar': ['header', 'main', 'sidebar']
};
const pageSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  updatedAt: z.string().datetime().optional(),
  targetObject: z.string().min(1),
  pageType: z.enum(['Record Page', 'App Page', 'Home Page']),
  layoutMode: z.enum(['template', 'free-canvas']).default('template'),
  template: pageTemplateSchema.default('one-region'),
  canvasWidth: z.number().int().min(320).max(7680).default(1920),
  canvasHeight: z.number().int().min(320).max(7680).default(1080),
  status: z.enum(['Draft', 'Active']),
  devices: z.array(z.enum(['Desktop', 'Phone'])).min(1),
  components: z.array(pageComponentSchema.extend({
    region: z.enum(['header', 'main', 'sidebar', 'footer']).default('main'),
    position: z.object({
      x: z.number().int().min(0).max(7680),
      y: z.number().int().min(0).max(7680),
      width: z.number().int().min(1).max(7680),
      height: z.number().int().min(1).max(7680)
    }).optional()
  })),
  activationAssignments: z.array(pageActivationAssignmentSchema).optional()
}).superRefine((page, context) => {
  const ids = page.components.map((component) => component.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Component IDs must be unique' });
  page.components.forEach((component, index) => {
    if (page.layoutMode === 'template' && !pageTemplateRegions[page.template].includes(component.region)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'region'], message: 'Component region must exist in the selected page template' });
    }
    if (page.layoutMode === 'free-canvas') {
      const position = component.position;
      if (!position) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'position'], message: 'Free Canvas components require a position and size' });
      } else if (position.x + position.width > page.canvasWidth || position.y + position.height > page.canvasHeight) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'position'], message: 'Component position and size must fit inside the Free Canvas' });
      }
      if (page.pageType !== 'Home Page' || !component.type.startsWith('Custom:')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'Free Canvas is available on Home Pages and supports custom library components' });
      }
    }
    if (['Field Section', 'Record Field'].includes(component.type)
      && (page.pageType !== 'Record Page' || page.layoutMode !== 'template')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'Dynamic Forms components are only available on template-based Record Pages' });
    }
    if (page.pageType !== 'Record Page'
      && !['Accordion', 'Tabs', 'Report Chart'].includes(component.type)
      && !component.type.startsWith('Custom:')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'This component is only available on Record Pages' });
    }
  });
  if (page.layoutMode === 'free-canvas' && page.pageType !== 'Home Page') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['layoutMode'], message: 'Free Canvas is only available on Home Pages' });
  }
  const assignments = page.activationAssignments ?? [];
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (new Set(assignmentIds).size !== assignmentIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments'], message: 'Activation assignment IDs must be unique' });
  assignments.forEach((assignment, index) => {
    if (page.pageType !== 'Record Page' && assignment.scope === 'App, Record Type, and Profile') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Record type activation assignments are only valid on Record Pages' });
    }
    if (page.pageType === 'Home Page' && assignment.scope === 'Org Default') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Home Pages must be assigned to an app or app and profile' });
    }
    if (page.pageType === 'App Page') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'App Pages are added to app navigation instead of using activation assignments' });
    }
    for (const other of assignments.slice(index + 1)) {
      if (assignment.scope === other.scope
        && assignment.appId === other.appId
        && assignment.profileId === other.profileId
        && assignment.recordTypeId === other.recordTypeId
        && assignment.formFactors.some((formFactor) => other.formFactors.includes(formFactor))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Activation assignments cannot overlap for the same target and form factor' });
        break;
      }
    }
  });
});
type LightningPage = z.infer<typeof pageSchema>;
const dashboardComponentSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().max(250).default(''),
  footer: z.string().max(250).default(''),
  type: z.enum(['Metric', 'Chart', 'Table', 'Rich Text', 'Image', 'Custom']),
  customComponentApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  reportApiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  properties: z.record(z.unknown()).default({}),
  richTextContent: z.string().max(20_000).default(''),
  imageUrl: z.string().max(2_048).default('').refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }, 'Dashboard image URLs must use HTTPS'),
  imageAltText: z.string().max(500).default(''),
  objectApiName: z.string().min(1),
  width: z.enum(['Quarter', 'Half', 'ThreeQuarter', 'Full']).default('Half'),
  height: z.enum(['Short', 'Medium', 'Tall']).default('Medium'),
  aggregation: z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']),
  measureFieldApiName: z.string().nullable(),
  groupByFieldApiName: z.string().nullable(),
  seriesFieldApiName: z.string().nullable().default(null),
  gaugeMin: z.number().finite().default(0),
  gaugeMax: z.number().finite().default(100),
  gaugeRange1EndPercent: z.number().finite().min(0).max(100).default(33),
  gaugeRange2EndPercent: z.number().finite().min(0).max(100).default(67),
  showLegend: z.boolean().default(true),
  showValues: z.boolean().default(true),
  chartDataLabelPosition: z.enum(['Auto', 'Inside', 'Outside']).default('Auto'),
  chartType: z.enum(['Bar', 'Column', 'Horizontal Bar', 'Stacked Bar', 'Stacked Column', '100% Stacked Bar', '100% Stacked Column', 'Line', 'Area', 'Scatter', 'Donut', 'Pie', 'Funnel', 'Gauge']),
  chartSortOrder: z.enum(['Ascending', 'Descending']).default('Descending'),
  chartColorPalette: z.enum(['Salesforce', 'Colorblind Safe', 'Monochrome']).default('Salesforce'),
  chartLimit: z.number().int().min(1).default(8),
  chartXAxisMinimum: z.number().finite().nullable().default(null),
  chartXAxisMaximum: z.number().finite().nullable().default(null),
  chartYAxisMinimum: z.number().finite().nullable().default(null),
  chartYAxisMaximum: z.number().finite().nullable().default(null),
  chartValueFormat: z.enum(['Number', 'Currency', 'Percent']).default('Number'),
  chartCurrencyCode: z.string().regex(/^[A-Z]{3}$/).default('USD').refine((value) => {
    try { new Intl.NumberFormat('en-US', { style: 'currency', currency: value }); return true; } catch { return false; }
  }, 'Currency code must be a valid ISO 4217 currency'),
  chartDecimalPlaces: z.number().int().min(0).max(4).default(2),
  xAxisFieldApiName: z.string().nullable().default(null),
  xAxisTitle: z.string().max(80).default(''),
  yAxisTitle: z.string().max(80).default(''),
  showGridlines: z.boolean().default(true),
  legendPosition: z.enum(['Bottom', 'Right', 'Top']).default('Bottom'),
  displayFieldApiNames: z.array(z.string())
}).superRefine((component, context) => {
  if (component.type === 'Custom' && !component.customComponentApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customComponentApiName'], message: 'Custom dashboard components must reference a library component' });
  }
  if (component.type !== 'Custom' && component.customComponentApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customComponentApiName'], message: 'Only custom components can reference a library component' });
  }
  if (component.type === 'Custom' && component.reportApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reportApiName'], message: 'Custom components cannot use a report source' });
  }
  if (['Rich Text', 'Image'].includes(component.type) && component.reportApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reportApiName'], message: 'Content widgets cannot use a report source' });
  }
  if (component.type === 'Rich Text' && component.imageUrl) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['imageUrl'], message: 'Rich text widgets cannot use an image source' });
  }
  if (component.type === 'Image' && component.richTextContent) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['richTextContent'], message: 'Image widgets cannot contain rich text' });
  }
  if (component.chartXAxisMinimum !== null && component.chartXAxisMaximum !== null
    && component.chartXAxisMinimum >= component.chartXAxisMaximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chartXAxisMaximum'], message: 'X-axis maximum must be greater than its minimum' });
  }
  if (component.chartYAxisMinimum !== null && component.chartYAxisMaximum !== null
    && component.chartYAxisMinimum >= component.chartYAxisMaximum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chartYAxisMaximum'], message: 'Y-axis maximum must be greater than its minimum' });
  }
  if (component.gaugeMin >= component.gaugeMax) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['gaugeMax'], message: 'Gauge maximum must be greater than its minimum' });
  }
  if (component.gaugeRange1EndPercent >= component.gaugeRange2EndPercent) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['gaugeRange2EndPercent'], message: 'Gauge range thresholds must be in increasing order' });
  }
});
const dashboardFilterSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  fieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Includes', 'Excludes', 'Is Null', 'Is Not Null']),
  value: z.string().max(500)
});
const reportFilterSchema = z.object({
  id: z.string().min(1),
  fieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With', 'Greater Than', 'Greater Than or Equal To', 'Less Than', 'Less Than or Equal To', 'Includes', 'Excludes', 'Is Null', 'Is Not Null']),
  value: z.string().max(500),
  values: z.array(z.string().max(500)).default([]),
  locked: z.boolean().default(false)
});
const reportDateRangeSchema = z.enum([
  'All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Next 7 Days', 'Next 30 Days',
  'This Week', 'Last Week', 'This Month', 'Last Month', 'This Quarter',
  'Last Quarter', 'This Year', 'Last Year'
]);
const reportStandardFiltersSchema = z.object({
  showMe: z.enum(['All', 'My']).default('All'),
  dateFieldApiName: z.string().min(1).nullable().default(null),
  dateRange: reportDateRangeSchema.default('All Time'),
  statusFieldApiName: z.string().min(1).nullable().default(null),
  statusSelection: z.string().max(80).default('All')
});
const reportCrossFilterSchema = z.object({
  id: z.string().min(1),
  childObjectApiName: z.string().min(1),
  mode: z.enum(['With', 'Without']),
  filters: z.array(reportFilterSchema).default([])
});
const reportRowLimitSchema = z.object({
  limit: z.number().int().min(1).nullable().default(null),
  sortFieldApiName: z.string().min(1).nullable().default(null),
  sortDirection: z.enum(['Ascending', 'Descending']).default('Ascending')
});
const reportSummaryOperationSchema = z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']);
const reportDateGroupingSchema = z.enum(['Day', 'Month', 'Quarter', 'Year']);
type ReportFilterLogicNode =
  | { type: 'filter'; index: number }
  | { type: 'not'; value: ReportFilterLogicNode }
  | { type: 'and' | 'or'; left: ReportFilterLogicNode; right: ReportFilterLogicNode }
  | { type: 'all' | 'any' };
const parseReportFilterLogic = (logic: string, filterCount: number): ReportFilterLogicNode | null => {
  const normalized = logic.trim().toUpperCase();
  if (normalized === 'ALL') return { type: 'all' };
  if (normalized === 'ANY') return { type: 'any' };
  const tokens = logic.match(/\d+|AND|OR|NOT|\(|\)/gi) ?? [];
  if (tokens.join('').toUpperCase() !== normalized.replace(/\s+/g, '')) return null;
  let cursor = 0;
  const parsePrimary = (): ReportFilterLogicNode | null => {
    const token = tokens[cursor];
    if (!token) return null;
    if (token === '(') {
      cursor += 1;
      const nested = parseOr();
      if (!nested || tokens[cursor] !== ')') return null;
      cursor += 1;
      return nested;
    }
    if (!/^\d+$/.test(token)) return null;
    const index = Number(token);
    if (index < 1 || index > filterCount) return null;
    cursor += 1;
    return { type: 'filter', index: index - 1 };
  };
  const parseUnary = (): ReportFilterLogicNode | null => {
    if (tokens[cursor]?.toUpperCase() === 'NOT') {
      cursor += 1;
      const value = parseUnary();
      return value ? { type: 'not', value } : null;
    }
    return parsePrimary();
  };
  const parseAnd = (): ReportFilterLogicNode | null => {
    let left = parseUnary();
    while (left && tokens[cursor]?.toUpperCase() === 'AND') {
      cursor += 1;
      const right = parseUnary();
      if (!right) return null;
      left = { type: 'and', left, right };
    }
    return left;
  };
  const parseOr = (): ReportFilterLogicNode | null => {
    let left = parseAnd();
    while (left && tokens[cursor]?.toUpperCase() === 'OR') {
      cursor += 1;
      const right = parseAnd();
      if (!right) return null;
      left = { type: 'or', left, right };
    }
    return left;
  };
  const parsed = parseOr();
  return parsed && cursor === tokens.length ? parsed : null;
};
const reportSchema = z.object({
  reportType: z.literal('Standard').default('Standard'),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  objectApiName: z.string().min(1),
  fieldApiNames: z.array(z.string().min(1)).min(1),
  groupByFieldApiNames: z.array(z.string().min(1)).max(3),
  filterLogic: z.string().trim().min(1).default('All'),
  format: z.enum(['Tabular', 'Summary', 'Matrix']).default('Tabular'),
  columnGroupByFieldApiName: z.string().min(1).nullable().default(null),
  sortFieldApiName: z.string().min(1).nullable().default(null),
  sortDirection: z.enum(['Ascending', 'Descending']).default('Ascending'),
  filters: z.array(reportFilterSchema),
  standardFilters: reportStandardFiltersSchema.default({}),
  crossFilters: z.array(reportCrossFilterSchema).default([]),
  rowLimit: reportRowLimitSchema.default({}),
  summaryOperations: z.record(z.array(reportSummaryOperationSchema).max(5)).default({}),
  dateGroupings: z.record(reportDateGroupingSchema).default({}),
  bucketFields: z.array(z.object({
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
    label: z.string().trim().min(1).max(80),
    fieldApiName: z.string().min(1),
    ranges: z.array(z.object({
      label: z.string().trim().min(1).max(80),
      lowerBound: z.number().finite().nullable(),
      upperBound: z.number().finite().nullable()
    })).min(1),
    treatBlanksAsZero: z.boolean().default(false)
  })).default([]),
  showDetails: z.boolean().default(true),
  showChart: z.boolean().default(false),
  folderName: z.string().trim().min(1).max(80).default('My Reports'),
  folderId: z.string().uuid().nullable().default(null)
}).superRefine((report, context) => {
  if (new Set(report.fieldApiNames).size !== report.fieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldApiNames'], message: 'Report columns must be unique' });
  }
  if (new Set(report.groupByFieldApiNames).size !== report.groupByFieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupByFieldApiNames'], message: 'Report grouping fields must be unique' });
  }
  if (new Set(report.bucketFields.map((bucket) => bucket.apiName.toLowerCase())).size !== report.bucketFields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields'], message: 'Bucket API names must be unique' });
  }
  for (const [bucketIndex, bucket] of report.bucketFields.entries()) {
    if (new Set(bucket.ranges.map((range) => range.label.toLocaleLowerCase())).size !== bucket.ranges.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket labels must be unique' });
    }
    if (bucket.ranges.some((range) => range.lowerBound !== null && range.upperBound !== null && range.lowerBound >= range.upperBound)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket lower bounds must be less than upper bounds' });
    }
    const orderedRanges = [...bucket.ranges].sort((left, right) =>
      (left.lowerBound ?? Number.NEGATIVE_INFINITY) - (right.lowerBound ?? Number.NEGATIVE_INFINITY));
    if (orderedRanges.some((range, index) => index > 0
      && (orderedRanges[index - 1].upperBound === null
        || range.lowerBound === null
        || orderedRanges[index - 1].upperBound! > range.lowerBound))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bucketFields', bucketIndex, 'ranges'], message: 'Bucket ranges cannot overlap' });
    }
  }
  if (report.sortFieldApiName
    && !report.fieldApiNames.includes(report.sortFieldApiName)
    && !report.groupByFieldApiNames.includes(report.sortFieldApiName)
    && report.columnGroupByFieldApiName !== report.sortFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sortFieldApiName'], message: 'Sort field must be included as a report column or grouping field' });
  }
  if (report.columnGroupByFieldApiName
    && (!report.groupByFieldApiNames.length || report.groupByFieldApiNames.includes(report.columnGroupByFieldApiName))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Matrix reports require a distinct column grouping field and at least one row grouping field' });
  }
  if (report.format === 'Matrix' && !report.columnGroupByFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Matrix reports require a column grouping field' });
  }
  if (report.format === 'Summary' && !report.groupByFieldApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupByFieldApiNames'], message: 'Summary reports require at least one row grouping' });
  }
  if (!report.showDetails && (report.format === 'Tabular' || !report.groupByFieldApiNames.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['showDetails'], message: 'Detail rows can only be hidden on grouped summary or matrix reports' });
  }
  if (report.showChart && (report.format === 'Tabular' || !report.groupByFieldApiNames.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['showChart'], message: 'Report charts require a grouped summary or matrix report' });
  }
  if (Object.values(report.summaryOperations).some((operations) => new Set(operations).size !== operations.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summaryOperations'], message: 'Summary operations must be unique per field' });
  }
  if (report.rowLimit.limit !== null && (report.format !== 'Tabular' || !report.rowLimit.sortFieldApiName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rowLimit'], message: 'Row limits require a tabular report and a sort field' });
  }
  if (report.rowLimit.sortFieldApiName
    && !report.fieldApiNames.includes(report.rowLimit.sortFieldApiName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rowLimit', 'sortFieldApiName'], message: 'Row limit sort field must be a report column' });
  }
  if (report.standardFilters.dateRange !== 'All Time' && !report.standardFilters.dateFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standardFilters', 'dateFieldApiName'], message: 'A date field is required for the selected date range' });
  }
  if (report.standardFilters.statusSelection !== 'All' && !report.standardFilters.statusFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standardFilters', 'statusFieldApiName'], message: 'A status field is required for the selected status range' });
  }
  if (new Set(report.filters.map((filter) => filter.id)).size !== report.filters.length
    || new Set(report.crossFilters.map((filter) => filter.id)).size !== report.crossFilters.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Report filter identifiers must be unique' });
  }
  if (new Set(report.crossFilters.flatMap((filter) => filter.filters.map((subfilter) => subfilter.id))).size
    !== report.crossFilters.reduce((total, filter) => total + filter.filters.length, 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['crossFilters'], message: 'Cross-filter subfilter identifiers must be unique' });
  }
  if (!parseReportFilterLogic(report.filterLogic, report.filters.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filterLogic'], message: 'Filter logic must use valid filter numbers, AND, OR, NOT, and parentheses' });
  }
  if (report.format !== 'Matrix' && report.columnGroupByFieldApiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columnGroupByFieldApiName'], message: 'Column grouping is only supported by Matrix reports' });
  }
  const filterIds = report.filters.map((filter) => filter.id);
  if (new Set(filterIds).size !== filterIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Report filter IDs must be unique' });
  }
});
type ReportDateRange = z.infer<typeof reportDateRangeSchema>;
const reportDateRangeBounds = (range: ReportDateRange, now = new Date()): [number, number] | null => {
  if (range === 'All Time') return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 24 * 60 * 60 * 1000;
  const startOfWeek = today - ((new Date(today).getUTCDay() + 6) % 7) * day;
  const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const startOfQuarter = Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1);
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  switch (range) {
    case 'Today': return [today, today + day];
    case 'Yesterday': return [today - day, today];
    case 'Last 7 Days': return [today - 6 * day, today + day];
    case 'Next 7 Days': return [today + day, today + 8 * day];
    case 'Next 30 Days': return [today + day, today + 31 * day];
    case 'This Week': return [startOfWeek, startOfWeek + 7 * day];
    case 'Last Week': return [startOfWeek - 7 * day, startOfWeek];
    case 'This Month': return [startOfMonth, Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)];
    case 'Last Month': return [Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1), startOfMonth];
    case 'This Quarter': return [startOfQuarter, Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 + 3, 1)];
    case 'Last Quarter': return [Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 - 3, 1), startOfQuarter];
    case 'This Year': return [startOfYear, Date.UTC(now.getUTCFullYear() + 1, 0, 1)];
    case 'Last Year': return [Date.UTC(now.getUTCFullYear() - 1, 0, 1), startOfYear];
  }
};
const evaluateReportFilterLogic = (node: ReportFilterLogicNode, matches: Array<boolean | null>): boolean | null => {
  switch (node.type) {
    case 'all': {
      const active = matches.filter((value): value is boolean => value !== null);
      return active.length === 0 ? null : active.every(Boolean);
    }
    case 'any': {
      const active = matches.filter((value): value is boolean => value !== null);
      return active.length === 0 ? null : active.some(Boolean);
    }
    case 'filter': return matches[node.index] ?? null;
    case 'not': {
      const value = evaluateReportFilterLogic(node.value, matches);
      return value === null ? null : !value;
    }
    case 'and': {
      const left = evaluateReportFilterLogic(node.left, matches);
      const right = evaluateReportFilterLogic(node.right, matches);
      return left === null ? right : right === null ? left : left && right;
    }
    case 'or': {
      const left = evaluateReportFilterLogic(node.left, matches);
      const right = evaluateReportFilterLogic(node.right, matches);
      return left === null ? right : right === null ? left : left || right;
    }
  }
};
function reportFilterMatches(
  record: RuntimeRecord,
  filter: z.infer<typeof reportFilterSchema> | DashboardFilterMetadata
): boolean {
  const actual = record[filter.fieldApiName];
  if (filter.operator === 'Is Null') return actual === null || actual === undefined || actual === '';
  if (filter.operator === 'Is Not Null') return actual !== null && actual !== undefined && actual !== '';
  const filterValues = 'values' in filter && filter.values.length
    ? filter.values.filter((item) => item.trim() !== '')
    : filter.value.trim()
      ? ['Includes', 'Excludes'].includes(filter.operator) ? filter.value.split(';').filter((item) => item.trim() !== '') : [filter.value]
      : [];
  if (!filterValues.length) return true;
  const value = actual === null || actual === undefined ? '' : String(actual);
  const normalizedValue = value.toLocaleLowerCase();
  const multiSelectValues = value.split(';').map((item) => item.toLocaleLowerCase());
  if (filter.operator === 'Includes') return filterValues.some((item) => multiSelectValues.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Excludes') return filterValues.every((item) => !multiSelectValues.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Equals') return filterValues.some((item) => normalizedValue === item.toLocaleLowerCase());
  if (filter.operator === 'Not Equal To') return filterValues.every((item) => normalizedValue !== item.toLocaleLowerCase());
  if (filter.operator === 'Contains') return filterValues.some((item) => normalizedValue.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Does Not Contain') return filterValues.every((item) => !normalizedValue.includes(item.toLocaleLowerCase()));
  if (filter.operator === 'Starts With') return filterValues.some((item) => normalizedValue.startsWith(item.toLocaleLowerCase()));
  return filterValues.some((item) => {
    const left = Number(value);
    const right = Number(item);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      if (filter.operator === 'Greater Than') return left > right;
      if (filter.operator === 'Greater Than or Equal To') return left >= right;
      if (filter.operator === 'Less Than') return left < right;
      return left <= right;
    }
    if (filter.operator === 'Greater Than') return value > item;
    if (filter.operator === 'Greater Than or Equal To') return value >= item;
    if (filter.operator === 'Less Than') return value < item;
    return value <= item;
  });
}
const dashboardFolderShareSchema = z.object({
  targetType: z.enum(['User', 'PublicGroup', 'PermissionSetGroup', 'Role', 'RoleAndSubordinates', 'Territory']),
  targetId: z.string().min(1),
  accessLevel: z.enum(['Viewer', 'Editor', 'Manager'])
});
const dashboardFolderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  ownerUserId: z.string().min(1),
  shares: z.array(dashboardFolderShareSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((folder, context) => {
  const shareKeys = folder.shares.map((share) => `${share.targetType}:${share.targetId}`);
  if (new Set(shareKeys).size !== shareKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shares'], message: 'Folder access targets must be unique' });
  }
});
type DashboardFolder = z.infer<typeof dashboardFolderSchema>;
const reportFolderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  ownerUserId: z.string().min(1),
  shares: z.array(dashboardFolderShareSchema).default([]),
  visibility: z.enum(['Private', 'All Users']).default('Private'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((folder, context) => {
  const shareKeys = folder.shares.map((share) => `${share.targetType}:${share.targetId}`);
  if (new Set(shareKeys).size !== shareKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shares'], message: 'Folder access targets must be unique' });
  }
});
type ReportFolder = z.infer<typeof reportFolderSchema>;
const dashboardTerritorySchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentTerritoryId: z.string().uuid().nullable(),
  userIds: z.array(z.string().min(1)).max(200).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((territory, context) => {
  if (new Set(territory.userIds).size !== territory.userIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userIds'], message: 'Territory users must be unique' });
  }
});
type DashboardTerritory = z.infer<typeof dashboardTerritorySchema>;

const dashboardSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  folderName: z.string().trim().min(1).max(80),
  folderId: z.string().uuid().nullable().default(null),
  ownerUserId: z.string().min(1),
  runningUserId: z.string().min(1).nullable().default(null),
  allowViewerToSelectRunningUser: z.boolean().default(false),
  visibility: z.enum(['Private', 'All Users']),
  sharedUserIds: z.array(z.string().min(1)).default([]),
  sharedPermissionSetGroupIds: z.array(z.string().min(1)).default([]),
  filterLogic: z.enum(['All', 'Any']).default('All'),
  refreshIntervalMinutes: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(15), z.literal(60)]).default(0),
  status: z.enum(['Draft', 'Deployed']),
  components: z.array(dashboardComponentSchema),
  filters: z.array(dashboardFilterSchema)
}).superRefine((dashboard, context) => {
  if (dashboard.status === 'Deployed' && dashboard.components.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Add at least one component before publishing a dashboard' });
  }
  const componentIds = dashboard.components.map((component) => component.id);
  if (new Set(componentIds).size !== componentIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Dashboard component IDs must be unique' });
  }
  const filterIds = dashboard.filters.map((filter) => filter.id);
  if (new Set(filterIds).size !== filterIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['filters'], message: 'Dashboard filter IDs must be unique' });
  }
  if (new Set(dashboard.sharedUserIds).size !== dashboard.sharedUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharedUserIds'], message: 'Dashboard user shares must be unique' });
  }
  if (new Set(dashboard.sharedPermissionSetGroupIds).size !== dashboard.sharedPermissionSetGroupIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharedPermissionSetGroupIds'], message: 'Dashboard group shares must be unique' });
  }
  if (dashboard.allowViewerToSelectRunningUser && dashboard.runningUserId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['runningUserId'], message: 'Dashboards with viewer-selected running users cannot have a fixed running user' });
  }
  dashboard.components.forEach((component, index) => {
    if (new Set(component.displayFieldApiNames).size !== component.displayFieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'displayFieldApiNames'], message: 'Displayed table fields must be unique' });
    }
    if (component.type === 'Chart' && !['Gauge', 'Scatter'].includes(component.chartType) && !component.groupByFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'groupByFieldApiName'], message: 'Charts require a grouping field' });
    }
    if (component.type === 'Chart' && component.chartType === 'Scatter' && !component.xAxisFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'xAxisFieldApiName'], message: 'Scatter charts require a numeric x-axis field' });
    }
    if (component.type === 'Chart' && ['Stacked Bar', 'Stacked Column', '100% Stacked Bar', '100% Stacked Column'].includes(component.chartType) && !component.seriesFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'seriesFieldApiName'], message: 'Stacked charts require a series field' });
    }
    if (component.type === 'Chart' && component.seriesFieldApiName
      && component.seriesFieldApiName === component.groupByFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'seriesFieldApiName'], message: 'Chart category and series fields must be different' });
    }
    if (component.type === 'Table' && !component.displayFieldApiNames.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'displayFieldApiNames'], message: 'Tables require at least one displayed field' });
    }
    if (component.aggregation !== 'Count' && !component.measureFieldApiName) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'measureFieldApiName'], message: 'Select a measure field for this aggregation' });
    }
  });
});
const dashboardSnapshotComponentSchema = z.object({
  componentId: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().max(250).default(''),
  footer: z.string().max(250).default(''),
  type: z.enum(['Metric', 'Chart', 'Table', 'Rich Text', 'Image', 'Custom']),
  width: z.enum(['Quarter', 'Half', 'ThreeQuarter', 'Full']).default('Half'),
  height: z.enum(['Short', 'Medium', 'Tall']).default('Medium'),
  customHtml: z.string().max(50_000).nullable().default(null),
  richTextContent: z.string().max(20_000).default(''),
  imageUrl: z.string().max(2_048).default(''),
  imageAltText: z.string().max(500).default(''),
  unavailableReason: z.string().max(300).nullable().default(null),
  chartType: z.enum(['Bar', 'Column', 'Horizontal Bar', 'Stacked Bar', 'Stacked Column', '100% Stacked Bar', '100% Stacked Column', 'Line', 'Area', 'Scatter', 'Donut', 'Pie', 'Funnel', 'Gauge']).nullable(),
  chartSortOrder: z.enum(['Ascending', 'Descending']).default('Descending'),
  chartColorPalette: z.enum(['Salesforce', 'Colorblind Safe', 'Monochrome']).default('Salesforce'),
  chartLimit: z.number().int().min(1).default(8),
  chartXAxisMinimum: z.number().finite().nullable().default(null),
  chartXAxisMaximum: z.number().finite().nullable().default(null),
  chartYAxisMinimum: z.number().finite().nullable().default(null),
  chartYAxisMaximum: z.number().finite().nullable().default(null),
  chartValueFormat: z.enum(['Number', 'Currency', 'Percent']).default('Number'),
  chartCurrencyCode: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  chartDecimalPlaces: z.number().int().min(0).max(4).default(2),
  xAxisFieldApiName: z.string().nullable().default(null),
  xAxisTitle: z.string().max(80).default(''),
  yAxisTitle: z.string().max(80).default(''),
  showGridlines: z.boolean().default(true),
  legendPosition: z.enum(['Bottom', 'Right', 'Top']).default('Bottom'),
  aggregation: z.enum(['Count', 'Sum', 'Average', 'Minimum', 'Maximum']),
  gaugeMin: z.number().finite().default(0),
  gaugeMax: z.number().finite().default(100),
  gaugeRange1EndPercent: z.number().finite().min(0).max(100).default(33),
  gaugeRange2EndPercent: z.number().finite().min(0).max(100).default(67),
  showLegend: z.boolean().default(true),
  showValues: z.boolean().default(true),
  chartDataLabelPosition: z.enum(['Auto', 'Inside', 'Outside']).default('Auto'),
  objectApiName: z.string().min(1),
  groupByLabel: z.string().nullable(),
  totalRows: z.number().int().min(0),
  metricValue: z.number().finite().nullable(),
  columns: z.array(z.object({ apiName: z.string(), label: z.string() })),
  buckets: z.array(z.object({ label: z.string(), value: z.number().finite(), series: z.record(z.number().finite()).optional() })),
  rows: z.array(z.record(z.unknown())).max(10)
});
const dashboardSnapshotSchema = z.object({
  id: z.string().min(1),
  dashboardApiName: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  runningUserId: z.string().min(1).optional(),
  subscriptionId: z.string().uuid().optional(),
  filters: z.array(dashboardFilterSchema),
  crossFilter: dashboardFilterSchema.optional(),
  crossFilters: z.array(dashboardFilterSchema).default([]),
  sourceRecordAccess: z.array(z.object({
    objectApiName: z.string().min(1),
    recordId: z.string().min(1)
  })).optional(),
  components: z.array(dashboardSnapshotComponentSchema)
});
const dashboardTimeZoneSchema = z.string().min(1).refine((value) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}, 'A valid IANA time zone is required');
const dashboardSubscriptionSchema = z.object({
  id: z.string().uuid(),
  dashboardApiName: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  frequency: z.enum(['Daily', 'Weekly']),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: dashboardTimeZoneSchema,
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  recipientUserIds: z.array(z.string().min(1)).min(1).max(20),
  namedCredentialId: z.string().uuid(),
  fromEmail: z.string().email().max(254),
  active: z.boolean().default(true),
  saveSnapshots: z.boolean().default(true),
  nextRunAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable().default(null),
  lastRunStatus: z.enum(['Never', 'Success', 'Failed']).default('Never'),
  lastRunError: z.string().max(500).nullable().default(null),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((subscription, context) => {
  if (new Set(subscription.recipientUserIds).size !== subscription.recipientUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientUserIds'], message: 'Recipient users must be unique' });
  }
  if ((subscription.frequency === 'Weekly') !== (subscription.dayOfWeek !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfWeek'], message: 'Weekly schedules require a weekday; daily schedules must omit it' });
  }
});
const objectPermissionFlagsSchema = z.object({
  read: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean(),
  viewAll: z.boolean(), modifyAll: z.boolean()
});
const objectPermissionSchema = objectPermissionFlagsSchema.superRefine((permission, context) => {
  if ((permission.create || permission.edit || permission.delete || permission.viewAll || permission.modifyAll) && !permission.read) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Object write, view-all, and modify-all access require read access' });
  }
});
type ObjectPermission = z.infer<typeof objectPermissionFlagsSchema>;
const permissionSetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  apiName: z.string().min(1),
  license: z.string().min(1),
  description: z.string(),
  systemPermissions: z.array(z.string()),
  objectPermissions: z.record(objectPermissionSchema),
  recordTypePermissions: z.record(z.boolean()).default({}),
  fieldPermissions: z.record(z.object({ read: z.boolean(), edit: z.boolean() }).superRefine((permission, context) => {
    if (permission.edit && !permission.read) context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Field edit access requires read access' });
  }))
});
const profileSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  license: z.string().min(1),
  description: z.string().max(500),
  isStandard: z.boolean(),
  systemPermissions: z.array(z.string()),
  objectPermissions: z.record(objectPermissionSchema),
  recordTypePermissions: z.record(z.boolean()).default({}),
  fieldPermissions: z.record(z.object({ read: z.boolean(), edit: z.boolean() }).superRefine((permission, context) => {
    if (permission.edit && !permission.read) context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Field edit access requires read access' });
  }))
});
const permissionSetGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string(),
  permissionSetIds: z.array(z.string()),
  calculationStatus: z.enum(['Updated', 'Updating', 'Failed']).default('Updated'),
  lastCalculatedAt: z.string().datetime().nullable().default(null),
  mutedSystemPermissions: z.array(z.string()).default([]),
  mutedObjectPermissions: z.record(objectPermissionFlagsSchema.partial()).default({}),
  mutedRecordTypePermissions: z.record(z.boolean()).default({}),
  mutedFieldPermissions: z.record(z.object({ read: z.boolean().optional(), edit: z.boolean().optional() })).default({})
});
const accessUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().email(),
  role: z.string().min(1),
  roleId: z.string().optional(),
  profileId: z.string().optional(),
  permissionSetIds: z.array(z.string()),
  permissionSetGroupIds: z.array(z.string()).default([]),
  timeZone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
  currencyIsoCode: z.string().regex(/^[A-Z]{3}$/).optional()
}).superRefine((user, context) => {
  if (!dashboardTimeZoneSchema.safeParse(user.timeZone).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['timeZone'], message: 'User time zone must be a valid IANA time zone' });
  }
  try {
    new Intl.NumberFormat(user.locale);
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['locale'], message: 'User locale must be a valid BCP 47 locale identifier' });
  }
});
const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  parentRoleId: z.string().nullable()
});
const publicGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string().max(500).default(''),
  userIds: z.array(z.string()).default([]),
  roleIds: z.array(z.string()).default([]),
  roleAndSubordinateIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([])
});
const queueSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string().max(500).default(''),
  supportedObjectApiNames: z.array(z.string().min(1)).min(1),
  userIds: z.array(z.string()).default([]),
  roleIds: z.array(z.string()).default([]),
  roleAndSubordinateIds: z.array(z.string()).default([]),
  publicGroupIds: z.array(z.string()).default([])
});
const sharingRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  objectApiName: z.string().min(1),
  active: z.boolean().default(true),
  type: z.enum(['OwnerBased', 'CriteriaBased']),
  ownerRoleIds: z.array(z.string()).default([]),
  criteria: z.array(z.object({
    fieldApiName: z.string().min(1),
    operator: z.enum(['Equals', 'Not Equals', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null']),
    value: z.string().default('')
  })).default([]),
  filterLogic: z.enum(['All', 'Any']).default('All'),
  targetType: z.enum(['User', 'PublicGroup', 'Role', 'RoleAndSubordinates']),
  targetId: z.string().min(1),
  accessLevel: z.enum(['Read', 'Edit'])
}).superRefine((rule, context) => {
  if (rule.type === 'OwnerBased' && !rule.ownerRoleIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerRoleIds'], message: 'Owner-based rules must select at least one source role' });
  }
  if (rule.type === 'CriteriaBased' && !rule.criteria.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'Criteria-based rules must include at least one condition' });
  }
  if (rule.type === 'CriteriaBased' && rule.criteria.some((criterion) => criterion.operator === 'Is Null' && criterion.value !== '')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'Is Null conditions cannot have a value' });
  }
});
const accessControlSchema = z.object({
  profiles: z.array(profileSchema).default([]),
  permissionSets: z.array(permissionSetSchema),
  permissionSetGroups: z.array(permissionSetGroupSchema).default([]),
  roles: z.array(roleSchema).default([]),
  publicGroups: z.array(publicGroupSchema).default([]),
  queues: z.array(queueSchema).default([]),
  sharingRules: z.array(sharingRuleSchema).default([]),
  users: z.array(accessUserSchema)
}).superRefine((access, context) => {
  const profileIds = new Set(access.profiles.map((profile) => profile.id));
  const setIds = new Set(access.permissionSets.map((set) => set.id));
  const groupIds = new Set(access.permissionSetGroups.map((group) => group.id));
  const roleIds = new Set(access.roles.map((role) => role.id));
  const publicGroupIds = new Set(access.publicGroups.map((group) => group.id));
  const duplicate = (values: string[]) => values.some((value, index) => values.indexOf(value) !== index);
  if (duplicate(access.profiles.map((profile) => profile.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Profile IDs must be unique' });
  if (duplicate(access.profiles.map((profile) => profile.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Profile API names must be unique' });
  if (duplicate(access.permissionSets.map((set) => set.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSets'], message: 'Permission set IDs must be unique' });
  if (duplicate(access.permissionSetGroups.map((group) => group.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups'], message: 'Permission set group IDs must be unique' });
  if (duplicate(access.permissionSets.map((set) => set.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSets'], message: 'Permission set API names must be unique' });
  if (duplicate(access.permissionSetGroups.map((group) => group.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups'], message: 'Permission set group API names must be unique' });
  if (duplicate(access.roles.map((role) => role.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role IDs must be unique' });
  if (duplicate(access.roles.map((role) => role.name.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role names must be unique' });
  if (duplicate(access.roles.flatMap((role) => role.apiName ? [role.apiName.toLowerCase()] : []))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role API names must be unique' });
  }
  if (duplicate(access.publicGroups.map((group) => group.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups'], message: 'Public group IDs must be unique' });
  if (duplicate(access.publicGroups.map((group) => group.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups'], message: 'Public group API names must be unique' });
  if (duplicate(access.queues.map((queue) => queue.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Queue IDs must be unique' });
  if (duplicate(access.queues.map((queue) => queue.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Queue API names must be unique' });
  if (duplicate(access.sharingRules.map((rule) => rule.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules'], message: 'Sharing rule IDs must be unique' });
  if (duplicate(access.sharingRules.map((rule) => rule.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules'], message: 'Sharing rule API names must be unique' });
  if (duplicate(access.users.map((user) => user.username.trim().toLowerCase()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['users'], message: 'User email addresses must be unique' });
  }
  for (const [index, role] of access.roles.entries()) {
    if (role.parentRoleId && !roleIds.has(role.parentRoleId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles', index, 'parentRoleId'], message: `Unknown parent role ${role.parentRoleId}` });
    }
    const visited = new Set<string>([role.id]);
    let parentRoleId = role.parentRoleId;
    while (parentRoleId) {
      if (visited.has(parentRoleId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles', index, 'parentRoleId'], message: 'Role hierarchy cannot contain cycles' });
        break;
      }
      visited.add(parentRoleId);
      parentRoleId = access.roles.find((candidate) => candidate.id === parentRoleId)?.parentRoleId ?? null;
    }
  }
  for (const [index, group] of access.permissionSetGroups.entries()) {
    if (group.lastCalculatedAt && Number.isNaN(Date.parse(group.lastCalculatedAt))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'lastCalculatedAt'], message: 'Calculation timestamp must be valid' });
    }
    for (const setId of group.permissionSetIds) {
      if (!setIds.has(setId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'permissionSetIds'], message: `Unknown permission set ${setId}` });
    }
    if (duplicate(group.permissionSetIds)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'permissionSetIds'], message: 'Permission set group members must be unique' });
  }
  for (const [index, group] of access.publicGroups.entries()) {
    for (const roleId of [...group.roleIds, ...group.roleAndSubordinateIds]) {
      if (!roleIds.has(roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index], message: `Unknown role ${roleId}` });
    }
    for (const groupId of group.groupIds) {
      if (!publicGroupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index, 'groupIds'], message: `Unknown public group ${groupId}` });
    }
    if (duplicate(group.userIds) || duplicate(group.roleIds) || duplicate(group.roleAndSubordinateIds) || duplicate(group.groupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index], message: 'Public group members must be unique' });
    }
    const visited = new Set<string>([group.id]);
    const visit = (candidate: typeof group, path: Set<string>) => {
      for (const nestedId of candidate.groupIds) {
        if (path.has(nestedId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index, 'groupIds'], message: 'Public group membership cannot contain cycles' });
          continue;
        }
        const nested = access.publicGroups.find((item) => item.id === nestedId);
        if (nested) visit(nested, new Set([...path, nestedId]));
      }
    };
    visit(group, visited);
  }
  for (const [index, rule] of access.sharingRules.entries()) {
    if (rule.type === 'OwnerBased' && rule.ownerRoleIds.some((roleId) => !roleIds.has(roleId))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'ownerRoleIds'], message: 'Sharing rules must reference existing owner roles' });
    }
    if ((rule.targetType === 'Role' || rule.targetType === 'RoleAndSubordinates') && !roleIds.has(rule.targetId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'targetId'], message: `Unknown target role ${rule.targetId}` });
    }
    if (rule.targetType === 'PublicGroup' && !publicGroupIds.has(rule.targetId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'targetId'], message: `Unknown target public group ${rule.targetId}` });
    }
  }
  for (const [index, queue] of access.queues.entries()) {
    if (duplicate(queue.userIds) || duplicate(queue.roleIds) || duplicate(queue.roleAndSubordinateIds) || duplicate(queue.publicGroupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index], message: 'Queue members must be unique' });
    }
    for (const roleId of [...queue.roleIds, ...queue.roleAndSubordinateIds]) {
      if (!roleIds.has(roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index], message: `Unknown queue member role ${roleId}` });
    }
    for (const groupId of queue.publicGroupIds) {
      if (!publicGroupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index, 'publicGroupIds'], message: `Unknown queue member public group ${groupId}` });
    }
    if (duplicate(queue.supportedObjectApiNames)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index, 'supportedObjectApiNames'], message: 'Queue object assignments must be unique' });
    }
  }
  for (const [index, user] of access.users.entries()) {
    if (user.roleId && !roleIds.has(user.roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'roleId'], message: `Unknown role ${user.roleId}` });
    if (user.profileId && !profileIds.has(user.profileId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'profileId'], message: `Unknown profile ${user.profileId}` });
    for (const setId of user.permissionSetIds) {
      if (!setIds.has(setId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'permissionSetIds'], message: `Unknown permission set ${setId}` });
    }
    for (const groupId of user.permissionSetGroupIds) {
      if (!groupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'permissionSetGroupIds'], message: `Unknown permission set group ${groupId}` });
    }
    if (duplicate(user.permissionSetIds) || duplicate(user.permissionSetGroupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index], message: 'User permission assignments must be unique' });
    }
  }
});

type ObjectMetadata = z.infer<typeof objectSchema>;
function isNumericField(field: { dataType: string; formula?: { returnType: string } } | undefined): boolean {
  const numericTypes = /^(Number|Currency|Percent)(\(|$)/;
  return Boolean(field && (numericTypes.test(field.dataType)
    || (field.dataType.startsWith('Formula(') && numericTypes.test(field.formula?.returnType ?? ''))));
}
type ReportFilterOperator = z.infer<typeof reportFilterSchema>['operator'];
function reportFilterOperatorAllowed(
  field: { dataType: string; formula?: { returnType: string } },
  operator: ReportFilterOperator
): boolean {
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  const nullOperators: ReportFilterOperator[] = ['Is Null', 'Is Not Null'];
  if (type === 'Multi-Select Picklist') {
    return [...nullOperators, 'Includes', 'Excludes'].includes(operator);
  }
  if (['Picklist', 'Checkbox', 'Reference', 'Id'].includes(type)) {
    return [...nullOperators, 'Equals', 'Not Equal To'].includes(operator);
  }
  if (isNumericField(field) || type === 'Date' || type === 'DateTime') {
    return [...nullOperators, 'Equals', 'Not Equal To', 'Greater Than', 'Greater Than or Equal To',
      'Less Than', 'Less Than or Equal To'].includes(operator);
  }
  return [...nullOperators, 'Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With'].includes(operator);
}
function dashboardFilterOperatorAllowed(
  field: { dataType: string; formula?: { returnType: string } },
  operator: DashboardFilterMetadata['operator']
): boolean {
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  if (['Includes', 'Excludes'].includes(operator) && type !== 'Multi-Select Picklist') return false;
  const nullOperators: DashboardFilterMetadata['operator'][] = ['Is Null', 'Is Not Null'];
  if (type === 'Checkbox' || type === 'Picklist') {
    return [...nullOperators, 'Equals', 'Not Equal To'].includes(operator);
  }
  if (type === 'Multi-Select Picklist') {
    return [...nullOperators, 'Equals', 'Not Equal To', 'Contains', 'Includes', 'Excludes'].includes(operator);
  }
  if (isNumericField(field) || type === 'Date' || type === 'DateTime') {
    return !['Contains', 'Starts With'].includes(operator);
  }
  return true;
}
function dashboardFilterValueError(
  field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] },
  value: string
): string | null {
  if (!value.trim()) return null;
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  if (isNumericField(field) && !Number.isFinite(Number(value))) return 'Enter a valid number';
  if (type === 'Date') {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())
      || date.toISOString().slice(0, 10) !== value) return 'Enter a valid date';
  }
  if (type === 'DateTime' && !Number.isFinite(new Date(value).getTime())) return 'Enter a valid date and time';
  if (type === 'Checkbox' && !['true', 'false'].includes(value.toLocaleLowerCase())) return 'Choose true or false';
  if (type === 'Picklist' && field.picklistValues?.length && !field.picklistValues.includes(value)) {
    return 'Choose a configured picklist value';
  }
  if (type === 'Multi-Select Picklist' && field.picklistValues?.length
    && value.split(';').some((item) => !field.picklistValues!.includes(item))) {
    return 'Choose configured picklist values';
  }
  return null;
}
function reportFilterValueError(
  field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] },
  filter: z.infer<typeof reportFilterSchema>
): string | null {
  if (filter.operator === 'Is Null' || filter.operator === 'Is Not Null') return null;
  const values = filter.values.length
    ? filter.values
    : filter.value.trim()
      ? ['Includes', 'Excludes'].includes(filter.operator)
        ? filter.value.split(';').filter((value) => value.trim() !== '')
        : [filter.value]
      : [];
  for (const value of values) {
    const error = dashboardFilterValueError(field, value);
    if (error) return error;
  }
  return null;
}
type FlowMetadata = z.infer<typeof flowSchema>;
type FlowInterview = z.infer<typeof flowInterviewSchema>;
type PageMetadata = z.infer<typeof pageSchema>;
type DashboardMetadata = z.infer<typeof dashboardSchema>;
type DashboardFilterMetadata = z.infer<typeof dashboardFilterSchema>;
type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
type DashboardSubscription = z.infer<typeof dashboardSubscriptionSchema>;
type ReportMetadata = z.infer<typeof reportSchema>;
type AccessControl = z.infer<typeof accessControlSchema>;
type AccessProfile = z.infer<typeof profileSchema>;
type AccessRole = z.infer<typeof roleSchema>;
type PublicGroup = z.infer<typeof publicGroupSchema>;
type RecordQueue = z.infer<typeof queueSchema>;
type SharingRule = z.infer<typeof sharingRuleSchema>;
type RuntimeRecord = z.infer<typeof runtimeRecordSchema>;
function sanitizeDashboardRichText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'li', 'ol', 'p', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false
  });
}
const fieldHistoryEntrySchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  fieldApiName: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  changedBy: z.string().min(1),
  changedAt: z.string().datetime()
});
type FieldHistoryEntry = z.infer<typeof fieldHistoryEntrySchema>;
const sharingSettingSchema = z.object({
  defaultAccess: z.enum(['Private', 'Public Read Only', 'Public Read/Write']),
  grantAccessUsingHierarchies: z.boolean().default(true)
});
const currencySettingsSchema = z.object({
  corporateCurrency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  currencies: z.array(z.object({
    currencyIsoCode: z.string().regex(/^[A-Z]{3}$/),
    conversionRate: z.number().finite().positive()
  })).min(1).default([{ currencyIsoCode: 'USD', conversionRate: 1 }])
}).superRefine((settings, context) => {
  const codes = new Set<string>();
  for (const [index, currency] of settings.currencies.entries()) {
    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.currencyIsoCode });
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencies', index, 'currencyIsoCode'],
        message: `Currency code "${currency.currencyIsoCode}" is not a valid ISO 4217 code`
      });
    }
    if (codes.has(currency.currencyIsoCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencies', index, 'currencyIsoCode'],
        message: `Currency code "${currency.currencyIsoCode}" is configured more than once`
      });
    }
    codes.add(currency.currencyIsoCode);
  }
  const corporate = settings.currencies.find((currency) => currency.currencyIsoCode === settings.corporateCurrency);
  if (!corporate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['corporateCurrency'],
      message: 'Corporate currency must be included in the active currency list'
    });
  } else if (corporate.conversionRate !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currencies'],
      message: 'Corporate currency conversion rate must be exactly 1'
    });
  }
});
type CurrencySettings = z.infer<typeof currencySettingsSchema>;
const recordShareSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  userId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  accessLevel: z.enum(['Read', 'Edit']),
  rowCause: z.literal('Manual').default('Manual'),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
}).superRefine((share, context) => {
  if (Boolean(share.userId) === Boolean(share.groupId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'A manual share must target exactly one user or public group' });
  }
});
type SharingSetting = z.infer<typeof sharingSettingSchema>;
type RecordShare = z.infer<typeof recordShareSchema>;
const campaignMemberSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  status: z.enum(['Sent', 'Responded']),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
});
type CampaignMember = z.infer<typeof campaignMemberSchema>;
const recordActivitySchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  kind: z.enum(['Task', 'Call', 'Event']),
  subject: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(''),
  status: z.enum(['Open', 'Completed']).default('Open'),
  dueAt: z.string().datetime().nullable().default(null),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime()
});
type RecordActivity = z.infer<typeof recordActivitySchema>;
const chatterCommentSchema = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime()
});
const chatterPostSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime(),
  comments: z.array(chatterCommentSchema).default([])
});
type ChatterPost = z.infer<typeof chatterPostSchema>;
const customNotificationSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  flowApiName: z.string().min(1),
  sentBy: z.string().min(1),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable().default(null)
});
type CustomNotification = z.infer<typeof customNotificationSchema>;
const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  flowApiName: z.string().min(1),
  processApiName: z.string().nullable().default(null),
  submittedBy: z.string().min(1),
  submittedByName: z.string().min(1),
  approverId: z.string().min(1),
  status: z.enum(['Pending', 'Approved', 'Rejected', 'Canceled']),
  comments: z.string().max(2000),
  decisionComments: z.string().max(2000).default(''),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable().default(null),
  decidedBy: z.string().nullable().default(null)
});
type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
const approvalProcessShapeSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  objectApiName: z.string().min(1),
  approverUserIds: z.array(z.string().min(1)).min(1),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
const approvalProcessSchema = approvalProcessShapeSchema.superRefine((process, context) => {
  if (new Set(process.approverUserIds).size !== process.approverUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approverUserIds'], message: 'Approvers must be unique' });
  }
});
const approvalProcessRequestSchema = approvalProcessShapeSchema.omit({
  createdAt: true,
  updatedAt: true
}).strict().superRefine((process, context) => {
  if (new Set(process.approverUserIds).size !== process.approverUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approverUserIds'], message: 'Approvers must be unique' });
  }
});
type ApprovalProcess = z.infer<typeof approvalProcessSchema>;
const approvalDecisionSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  comments: z.string().max(2000).default('')
}).strict();
const connectorSettingsSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  fields: z.array(z.object({
    apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    label: z.string().trim().min(1).max(80),
    value: z.string().max(2000)
  })).max(50)
}).superRefine((connector, context) => {
  const fieldNames = connector.fields.map((field) => field.apiName.toLocaleLowerCase());
  if (new Set(fieldNames).size !== fieldNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Connector field API names must be unique' });
  }
});
type ConnectorSettings = z.infer<typeof connectorSettingsSchema>;
const defaultConnectorSettings: ConnectorSettings[] = [
  {
    apiName: 'WhatsApp', label: 'WhatsApp', fields: [
      { apiName: 'ApiBaseUrl', label: 'API Base URL', value: '' },
      { apiName: 'PhoneNumberId', label: 'Phone Number ID', value: '' },
      { apiName: 'BusinessAccountId', label: 'Business Account ID', value: '' },
      { apiName: 'ApiVersion', label: 'API Version', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'Email', label: 'Email', fields: [
      { apiName: 'Provider', label: 'Email Provider', value: '' },
      { apiName: 'SenderName', label: 'Sender Name', value: '' },
      { apiName: 'SenderEmail', label: 'Sender Email', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'SMS', label: 'SMS', fields: [
      { apiName: 'Provider', label: 'SMS Provider', value: '' },
      { apiName: 'AccountId', label: 'Account ID', value: '' },
      { apiName: 'SenderId', label: 'Sender ID', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'Uber', label: 'Uber', fields: [
      { apiName: 'ClientId', label: 'Client ID', value: '' },
      { apiName: 'Environment', label: 'Environment', value: '' },
      { apiName: 'WebhookUrl', label: 'Webhook URL', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  },
  {
    apiName: 'Deliveroo', label: 'Deliveroo', fields: [
      { apiName: 'MerchantId', label: 'Merchant ID', value: '' },
      { apiName: 'Environment', label: 'Environment', value: '' },
      { apiName: 'WebhookUrl', label: 'Webhook URL', value: '' },
      { apiName: 'NamedCredential', label: 'Named Credential', value: '' }
    ]
  }
];
const connectorOperationSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).max(500)
});
const connectorTestSchema = z.object({
  method: z.enum(['GET', 'HEAD']),
  path: z.string().min(1).max(500),
  expectedStatus: z.number().int().min(100).max(599),
  responseValidation: z.object({
    jsonPath: z.string().min(1).max(200),
    equals: z.string().max(500)
  }).optional()
}).strict().superRefine((test, context) => {
  if (test.path.startsWith('//') || test.path.includes('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(test.path)
    || test.path.split(/[/?#]/).some((part) => part === '..')
    || test.path.includes('#')
    || /[\u0000-\u001f\u007f]/.test(test.path)
    || test.path.split(/[/?#]/).some((part) => {
      try { return decodeURIComponent(part) === '..'; } catch { return true; }
    })) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['path'], message: 'Test paths must remain relative and cannot contain URL, traversal, or fragment syntax' });
  }
  if (test.method === 'HEAD' && test.responseValidation) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['responseValidation'], message: 'HEAD tests cannot validate a response body' });
  }
});
const connectorDefinitionSchema = z.object({
  connectorKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  name: z.string().trim().min(1).max(80),
  authType: z.enum(['NONE', 'BEARER', 'BASIC', 'API_KEY']),
  baseUrl: z.string().url(),
  authHeader: z.string().trim().optional(),
  authCredential: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  credentialsSchema: z.array(z.object({
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    label: z.string().trim().min(1).max(80),
    secret: z.boolean(),
    required: z.boolean().default(true)
  })).max(30),
  operations: z.record(connectorOperationSchema),
  test: connectorTestSchema.optional(),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  retryPolicy: z.object({ maxAttempts: z.number().int().min(1).max(5).default(1) }).default({ maxAttempts: 1 }),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict().superRefine((definition, context) => {
  const url = new URL(definition.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseUrl'], message: 'Connector base URL must be HTTPS and cannot include credentials, query parameters, or fragments' });
  }
  if (definition.authType === 'API_KEY' && (!definition.authHeader
    || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(definition.authHeader)
    || ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(definition.authHeader.toLowerCase()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authHeader'], message: 'API Key authentication requires a safe, valid HTTP header name' });
  }
  if (definition.authType === 'BEARER' || definition.authType === 'API_KEY') {
    const requiredSecrets = definition.credentialsSchema.filter((field) => field.secret && field.required);
    if (!requiredSecrets.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsSchema'], message: `${definition.authType} authentication requires a required secret credential field` });
    }
    if (definition.authCredential
      && !definition.credentialsSchema.some((field) => field.name === definition.authCredential && field.secret && field.required)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['authCredential'], message: 'Authentication credential must name a required secret credential field' });
    }
    if (requiredSecrets.length > 1 && !definition.authCredential) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['authCredential'], message: 'Select which required secret credential is used for authentication' });
    }
  }
  if (definition.authType === 'BASIC') {
    for (const name of ['username', 'password']) {
      if (!definition.credentialsSchema.some((field) => field.name === name && field.secret && field.required)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsSchema'], message: `Basic authentication requires a required secret "${name}" credential field` });
      }
    }
  }
  const credentialNames = definition.credentialsSchema.map((field) => field.name.toLowerCase());
  if (new Set(credentialNames).size !== credentialNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsSchema'], message: 'Credential field names must be unique' });
  }
  for (const [operationName, operation] of Object.entries(definition.operations)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(operationName)
      || operation.path.startsWith('//')
      || operation.path.includes('\\')
      || /^[a-z][a-z0-9+.-]*:/i.test(operation.path)
      || operation.path.split(/[/?#]/).some((part) => part === '..')
      || operation.path.includes('?')
      || operation.path.includes('#')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['operations', operationName], message: 'Operation paths must remain relative and cannot contain URL, traversal, query, or fragment syntax' });
    }
  }
  if (definition.test) {
    for (const [, fieldName] of definition.test.path.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
      const field = definition.credentialsSchema.find((candidate) => candidate.name === fieldName);
      if (!field || field.secret) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['test', 'path'], message: `Test endpoint placeholder "${fieldName}" must refer to a non-secret credential field` });
      }
    }
  }
});
type ConnectorDefinition = z.infer<typeof connectorDefinitionSchema>;
const defaultConnectorDefinitions: ConnectorDefinition[] = [
  {
    connectorKey: 'META_WHATSAPP', name: 'Meta WhatsApp', authType: 'BEARER',
    baseUrl: 'https://graph.facebook.com/v22.0/', authHeader: 'Authorization',
    credentialsSchema: [
      { name: 'access_token', label: 'Access Token', secret: true, required: true },
      { name: 'phone_number_id', label: 'Phone Number ID', secret: false, required: true },
      { name: 'waba_id', label: 'WABA ID', secret: false, required: false }
    ],
    operations: { send_message: { method: 'POST', path: '/{phone_number_id}/messages' } },
    test: { method: 'GET', path: '/{phone_number_id}?fields=id', expectedStatus: 200 },
    timeoutMs: 30000, retryPolicy: { maxAttempts: 3 }, status: 'ACTIVE'
  },
  { connectorKey: 'EMAIL', name: 'Email', authType: 'NONE', baseUrl: 'https://api.example.com', credentialsSchema: [], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' },
  { connectorKey: 'SMS', name: 'SMS', authType: 'API_KEY', baseUrl: 'https://api.example.com', authHeader: 'x-api-key', credentialsSchema: [{ name: 'api_key', label: 'API Key', secret: true, required: true }], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' },
  { connectorKey: 'UBER', name: 'Uber', authType: 'BEARER', baseUrl: 'https://api.uber.com', credentialsSchema: [{ name: 'access_token', label: 'Access Token', secret: true, required: true }], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' },
  { connectorKey: 'DELIVEROO', name: 'Deliveroo', authType: 'NONE', baseUrl: 'https://api.example.com', credentialsSchema: [], operations: {}, timeoutMs: 30000, retryPolicy: { maxAttempts: 1 }, status: 'ACTIVE' }
].map((definition) => connectorDefinitionSchema.parse(definition));
const integrationConnectionSchema = z.object({
  id: z.string().uuid(),
  connectorKey: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  configuration: z.record(z.string().max(2000)).default({}),
  credentialKeyId: z.string().nullable().default(null),
  credentialIv: z.string().nullable().default(null),
  credentialAuthTag: z.string().nullable().default(null),
  credentialsCiphertext: z.string().nullable().default(null),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  testStatus: z.enum(['Connected', 'Failed', 'Not configured', 'Test unavailable']).nullable().default(null),
  lastTestedAt: z.string().datetime().nullable().default(null),
  lastTestMessage: z.string().max(500).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((connection, context) => {
  const encryptedParts = [connection.credentialKeyId, connection.credentialIv, connection.credentialAuthTag, connection.credentialsCiphertext];
  if (encryptedParts.some(Boolean) && encryptedParts.some((part) => !part)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialsCiphertext'], message: 'Encrypted credentials are incomplete' });
  }
});
type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;
const integrationConnectionRequestSchema = z.object({
  connectorKey: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  configuration: z.record(z.string().max(2000)).default({}),
  credentials: z.record(z.string().max(8192)).default({}),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict();
const connectorDefinitionRequestSchema = connectorDefinitionSchema;
type FlowExecutionLog = z.infer<typeof flowExecutionLogSchema>;
type LightningApp = z.infer<typeof lightningAppSchema>;
type TenantData = { objects: ObjectMetadata[]; flows: FlowMetadata[]; platformEvents: z.infer<typeof platformEventSchema>[]; platformEventMessages: z.infer<typeof platformEventMessageSchema>[]; pages: PageMetadata[]; apps: LightningApp[]; dashboards: DashboardMetadata[]; dashboardFolders: DashboardFolder[]; reportFolders: ReportFolder[]; dashboardTerritories: DashboardTerritory[]; dashboardSnapshots: DashboardSnapshot[]; dashboardSubscriptions: DashboardSubscription[]; reports: ReportMetadata[]; accessControl: AccessControl; sharingSettings: Record<string, SharingSetting>; currencySettings: CurrencySettings; recordShares: RecordShare[]; campaignMembers: CampaignMember[]; activities: RecordActivity[]; chatterPosts: ChatterPost[]; notifications: CustomNotification[]; approvalRequests: ApprovalRequest[]; approvalProcesses: ApprovalProcess[]; records: Record<string, RuntimeRecord[]>; autoNumberSequences: Record<string, number>; fieldHistory: FieldHistoryEntry[]; interviews: FlowInterview[]; flowLogs: FlowExecutionLog[]; scheduleRuns: Record<string, string>; scheduleRetries: Record<string, z.infer<typeof scheduleRetrySchema>>; namedCredentials: StoredNamedCredential[]; emailAlerts: EmailAlert[]; connectorSettings: ConnectorSettings[]; connectorDefinitions: ConnectorDefinition[]; integrationConnections: IntegrationConnection[] };
function autoNumberFormatForField(object: ObjectMetadata, field: ObjectMetadata['fields'][number]): string {
  return field.apiName === 'Name' && object.settings?.recordNameType === 'Auto Number'
    ? object.settings.recordNameFormat
    : field.dataType === 'AutoNumber' ? 'REC-{00000}' : 'REC-{000000}';
}
function formatAutoNumber(format: string, sequence: number): string {
  return format.replace(/\{(0+)\}/, (_match, digits: string) => String(sequence).padStart(digits.length, '0'));
}
function autoNumberSequenceFromValue(format: string, value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const token = /\{0+\}/.exec(format);
  if (!token || token.index === undefined) return undefined;
  const prefix = format.slice(0, token.index);
  const suffix = format.slice(token.index + token[0].length);
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escape(prefix)}(\\d+)${escape(suffix)}$`).exec(value);
  if (!match) return undefined;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) ? sequence : undefined;
}
function autoNumberSequenceKey(objectApiName: string, fieldApiName: string): string {
  return `${objectApiName}.${fieldApiName}`;
}
function migrateAutoNumberSequences(
  objects: ObjectMetadata[],
  records: Record<string, RuntimeRecord[]>,
  existingSequences: Record<string, number>
): Record<string, number> {
  const sequences = { ...existingSequences };
  for (const object of objects) {
    for (const field of object.fields) {
      if (field.dataType !== 'AutoNumber' && field.dataType !== 'Auto Number') continue;
      const key = autoNumberSequenceKey(object.apiName, field.apiName);
      const format = autoNumberFormatForField(object, field);
      const highestExisting = (records[object.apiName] ?? []).reduce((highest, record) =>
        Math.max(highest, autoNumberSequenceFromValue(format, record[field.apiName]) ?? 0), 0);
      sequences[key] = Math.max(sequences[key] ?? 0, highestExisting);
    }
  }
  return sequences;
}
const defaultLightningApps = (): LightningApp[] => [
  { apiName: 'Records', label: 'Records', description: 'Browse and manage customer records.', navigationItems: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Lead', 'Opportunity', 'Case'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#0176d3', utilityItems: ['Notes', 'History'] },
  { apiName: 'SalesApp', label: 'Sales', description: 'Manage sales accounts and opportunities.', navigationItems: ['Account', 'Contact', 'Lead', 'Opportunity'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Lead', 'Opportunity'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#0176d3', utilityItems: ['Notes', 'History'] },
  { apiName: 'ServiceApp', label: 'Service', description: 'Manage customer support cases.', navigationItems: ['Account', 'Contact', 'Case'], navigationPageApiNames: [], navigationOrder: ['Account', 'Contact', 'Case'].map((apiName) => ({ type: 'Object' as const, apiName })), brandColor: '#7526a8', utilityItems: ['Notes', 'History'] }
].map((app) => lightningAppSchema.parse(app));

function validateFieldChange(current: ObjectMetadata['fields'][number] | undefined, next: ObjectMetadata['fields'][number], records: RuntimeRecord[]): string | null {
  const currentFamily = current?.dataType.match(/^(Text|Number|Currency|Percent)(?:\(|$)/)?.[1] ?? current?.dataType;
  const nextFamily = next.dataType.match(/^(Text|Number|Currency|Percent)(?:\(|$)/)?.[1] ?? next.dataType;
  if (current && currentFamily !== nextFamily) {
    return `Field "${next.apiName}" data type cannot be changed after creation`;
  }
  if (current?.relationship && JSON.stringify(current.relationship) !== JSON.stringify(next.relationship)) {
    return `Relationship definition for "${next.apiName}" cannot be changed after creation`;
  }
  if ((!current || !current.required) && next.required) {
    const missingValue = records.some((record) => record[next.apiName] === undefined || record[next.apiName] === null || record[next.apiName] === '');
    if (missingValue) return `Field "${next.apiName}" cannot be made required while records have no value`;
  }
  if ((!current || !current.unique) && next.unique) {
    const values = new Set<string>();
    for (const record of records) {
      const value = record[next.apiName];
      if (value === undefined || value === null || value === '') continue;
      const key = uniqueFieldValueKey(next, value);
      if (values.has(key)) return `Field "${next.apiName}" cannot be made unique while duplicate values exist`;
      values.add(key);
    }
  }
  return null;
}

function uniqueFieldValueKey(field: ObjectMetadata['fields'][number], value: unknown): string {
  if (typeof value === 'string' && field.caseSensitive !== true) return `string:${value.toLocaleLowerCase('en-US')}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

function validateExistingFieldValues(object: ObjectMetadata, records: RuntimeRecord[]): string | null {
  for (const record of records) {
    const recordType = object.recordTypes?.find((item) => item.id === record.RecordTypeId);
    for (const field of object.fields) {
      const value = record[field.apiName];
      if (value === undefined || value === null || value === '') continue;
      if (/^Text(?:\(|$)/.test(field.dataType)) {
        const length = Number(field.dataType.match(/^Text\((\d+)\)$/)?.[1] ?? 255);
        if (String(value).length > length) return `Field "${field.apiName}" cannot be shortened because existing records exceed its new length`;
      }
      if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType) && typeof value === 'number') {
        if (numericFieldValueError(field.dataType, value)) return `Field "${field.apiName}" cannot use this precision or scale while existing records contain incompatible values`;
      }
      if (field.dataType === 'Long Text Area' && String(value).length > 131072) {
        return `Field "${field.apiName}" cannot use this limit while existing records exceed it`;
      }
      if (field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist') {
        const allowedValues = recordType?.picklistValues?.[field.apiName] ?? field.picklistValues;
        const values = field.dataType === 'Multi-Select Picklist' ? String(value).split(';') : [String(value)];
        if (field.picklistRestricted && allowedValues !== undefined && values.some((item) => !allowedValues.includes(item))) {
          return `Field "${field.apiName}" cannot remove a picklist value that is used by an existing record`;
        }
        if (field.controllerFieldApiName) {
          const controllerValue = record[field.controllerFieldApiName];
          const dependentValues = field.valueSettings?.[String(controllerValue ?? '')] ?? [];
          if (values.some((item) => !dependentValues.includes(item))) {
            return `Field "${field.apiName}" cannot change its dependency mapping while existing records use incompatible values`;
          }
        }
      }
    }
  }
  return null;
}

function validateObjectRelationships(object: ObjectMetadata, knownObjects: ObjectMetadata[]): string | null {
  const masterDetails = object.fields.filter((field) => field.relationship?.type === 'Master-Detail');
  if (masterDetails.length > 2) return 'An object can have at most two master-detail relationships';
  if (masterDetails.length && object.kind !== 'Custom Object') return 'Master-detail relationship fields can only be created on custom objects';
  const hierarchicalRelationships = object.fields.filter((field) => field.relationship?.type === 'Hierarchical');
  if (hierarchicalRelationships.length > 1) return 'The User object can have at most one hierarchical relationship';
  if (hierarchicalRelationships.length && object.apiName !== 'User') return 'Hierarchical relationships can only be created on the User object';
  const relationshipNames = new Set<string>();
  const childRelationshipNames = new Set<string>();
  for (const field of object.fields) {
    if (!field.relationship) continue;
    if (!knownObjects.some((candidate) => candidate.apiName === field.relationship?.targetObject)) {
      return `Relationship target "${field.relationship.targetObject}" does not exist`;
    }
    if (field.relationship.type === 'Hierarchical' && field.relationship.targetObject !== 'User') {
      return 'Hierarchical relationships must reference the User object';
    }
    if (field.relationship.type === 'Master-Detail' && field.relationship.targetObject === object.apiName) {
      return 'An object cannot be its own master-detail parent';
    }
    const relationshipName = field.relationship.relationshipName.toLowerCase();
    if (relationshipNames.has(relationshipName)) return `Relationship name "${field.relationship.relationshipName}" is already in use on "${object.apiName}"`;
    relationshipNames.add(relationshipName);
    const childRelationshipName = `${field.relationship.targetObject}:${field.relationship.childRelationshipName.toLowerCase()}`;
    if (childRelationshipNames.has(childRelationshipName)) return `Child relationship name "${field.relationship.childRelationshipName}" is already in use on "${field.relationship.targetObject}"`;
    childRelationshipNames.add(childRelationshipName);
  }
  return null;
}

function validateRelatedLookupFilters(object: ObjectMetadata, knownObjects: ObjectMetadata[]): string | null {
  for (const filter of object.relatedLookupFilters ?? []) {
    const lookupField = object.fields.find((field) => field.apiName === filter.fieldApiName);
    if (!lookupField?.relationship) {
      return `Related lookup filter "${filter.id}" must use a relationship field on "${object.apiName}"`;
    }
    if (lookupField.relationship.targetObject !== filter.relatedObject) {
      return `Related lookup filter "${filter.id}" must target "${lookupField.relationship.targetObject}"`;
    }
    const relatedObject = knownObjects.find((candidate) => candidate.apiName === filter.relatedObject);
    if (!relatedObject) return `Related lookup filter "${filter.id}" references unknown object "${filter.relatedObject}"`;
    if (!relatedObject.fields.some((field) => field.apiName === filter.relatedFieldApiName)) {
      return `Related lookup filter "${filter.id}" references unknown field "${filter.relatedFieldApiName}" on "${filter.relatedObject}"`;
    }
    const relatedField = relatedObject.fields.find((field) => field.apiName === filter.relatedFieldApiName)!;
    const category = (field: ObjectMetadata['fields'][number]): 'text' | 'number' | 'date' | 'boolean' | 'other' => {
      const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
      if (['Text', 'Long Text Area', 'Email', 'Phone', 'URL', 'Picklist', 'Multi-Select Picklist', 'Name', 'AutoNumber', 'Auto Number'].includes(type)) return 'text';
      if (['Number', 'Currency', 'Percent'].includes(type)) return 'number';
      if (['Date', 'Date/Time', 'DateTime'].includes(type)) return 'date';
      if (type === 'Checkbox') return 'boolean';
      return 'other';
    };
    const relatedCategory = category(relatedField);
    if (['Contains', 'Starts With'].includes(filter.operator) && relatedCategory !== 'text') {
      return `Related lookup filter "${filter.id}" uses ${filter.operator} with a non-text field`;
    }
    if (['Greater Than', 'Less Than'].includes(filter.operator) && !['number', 'date'].includes(relatedCategory)) {
      return `Related lookup filter "${filter.id}" uses ${filter.operator} with an unsupported field type`;
    }
    if (filter.valueFieldApiName) {
      const sourceField = object.fields.find((field) => field.apiName === filter.valueFieldApiName);
      if (!sourceField) {
        return `Related lookup filter "${filter.id}" references unknown field "${filter.valueFieldApiName}" on "${object.apiName}"`;
      }
      if (category(sourceField) !== relatedCategory) {
        return `Related lookup filter "${filter.id}" compares incompatible field types`;
      }
    } else if (['Greater Than', 'Less Than'].includes(filter.operator)) {
      if (relatedCategory === 'number' && !Number.isFinite(Number(filter.value))) {
        return `Related lookup filter "${filter.id}" requires a numeric comparison value`;
      }
      if (relatedCategory === 'date' && !Number.isFinite(Date.parse(filter.value))) {
        return `Related lookup filter "${filter.id}" requires a valid date comparison value`;
      }
    }
  }
  return null;
}

function matchesRelatedLookupFilter(
  actualValue: unknown,
  expectedValue: unknown,
  operator: z.infer<typeof relatedLookupFilterSchema>['operator']
): boolean {
  const actual = actualValue === undefined || actualValue === null ? '' : String(actualValue);
  const expected = expectedValue === undefined || expectedValue === null ? '' : String(expectedValue);
  if (operator === 'Is Null') return actual === '';
  if (operator === 'Is Not Null') return actual !== '';
  if (operator === 'Equals') return actual === expected;
  if (operator === 'Not Equal To') return actual !== expected;
  if (operator === 'Contains') return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if (operator === 'Starts With') return actual.toLocaleLowerCase().startsWith(expected.toLocaleLowerCase());
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return operator === 'Greater Than' ? actualNumber > expectedNumber : actualNumber < expectedNumber;
  }
  return operator === 'Greater Than'
    ? actual.localeCompare(expected) > 0
    : actual.localeCompare(expected) < 0;
}

function validateRelatedLists(object: ObjectMetadata, knownObjects: ObjectMetadata[], current?: ObjectMetadata): string | null {
  const allowedNames = new Set(knownObjects.flatMap((childObject) => childObject.fields.flatMap((field) =>
    field.relationship?.targetObject === object.apiName
      ? [field.relationship.childRelationshipName, childObject.pluralLabel]
      : []
  ).map((name) => name.toLocaleLowerCase())));
  for (const layout of object.pageLayouts ?? []) {
    const existing = current?.pageLayouts?.find((item) => item.id === layout.id)?.relatedLists ?? [];
    const invalid = layout.relatedLists.find((name) =>
      !allowedNames.has(name.toLocaleLowerCase()) && !existing.includes(name));
    if (invalid) return `Related list "${invalid}" is not a relationship on "${object.label}"`;
  }
  return null;
}

function appendFieldHistory(tenant: TenantData, object: ObjectMetadata, previous: RuntimeRecord, updated: RuntimeRecord, userId: string): void {
  if (!object.settings?.trackFieldHistory) return;
  const changedAt = new Date().toISOString();
  const entries = object.fields.filter((field) => field.trackHistory && !Object.is(previous[field.apiName], updated[field.apiName]))
    .map((field) => ({
      id: randomUUID(),
      objectApiName: object.apiName,
      recordId: updated.Id,
      fieldApiName: field.apiName,
      oldValue: previous[field.apiName] ?? null,
      newValue: updated[field.apiName] ?? null,
      changedBy: userId,
      changedAt
    }));
  if (entries.length) tenant.fieldHistory.push(...entries);
}

function containsFieldReference(value: unknown, apiName: string): boolean {
  if (typeof value === 'string') {
    const escapedName = apiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_])${escapedName}($|[^A-Za-z0-9_])`).test(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsFieldReference(item, apiName));
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsFieldReference(item, apiName));
  return false;
}

function flowUsesObject(flow: FlowMetadata, objectApiName: string): boolean {
  return flow.triggerObject === objectApiName
    || containsFieldReference(flow.startConfig, objectApiName)
    || flow.elements.some((element) =>
      element.config.object === objectApiName || element.config.objectApiName === objectApiName)
    || flow.resources.some((resource) => resource.dataType === objectApiName);
}

function findFieldDependencies(tenant: TenantData, objectApiName: string, fieldApiName: string): string[] {
  const dependencies: string[] = [];
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (object) {
    if (object.pageLayouts?.some((layout) => layout.sections.some((section) => section.fieldApiNames.includes(fieldApiName)))) dependencies.push('a page layout');
    if (object.actions?.some((action) => action.fieldApiName === fieldApiName)) dependencies.push('a custom object action');
    if (object.compactLayout?.fieldApiNames.includes(fieldApiName)
      || object.compactLayouts?.some((layout) => layout.fieldApiNames.includes(fieldApiName))) dependencies.push('a compact layout');
    if (object.fieldSets?.some((fieldSet) => fieldSet.fieldApiNames.includes(fieldApiName))) dependencies.push('a field set');
    if (Object.values(object.searchLayouts ?? {}).some((fields) => fields.includes(fieldApiName))) dependencies.push('a search layout');
    if (object.fields.some((field) => field.apiName !== fieldApiName && field.formula && containsFieldReference(field.formula.expression, fieldApiName))) {
      dependencies.push('a formula field');
    }
    if (object.fields.some((field) => field.apiName !== fieldApiName && field.controllerFieldApiName === fieldApiName)) {
      dependencies.push('a dependent picklist');
    }
    if (object.recordTypes?.some((recordType) => Object.hasOwn(recordType.picklistValues ?? {}, fieldApiName))) {
      dependencies.push('record type picklist settings');
    }
    const relationshipField = object.fields.find((field) => field.apiName === fieldApiName && field.relationship);
    const relationship = relationshipField?.relationship;
    if (relationship && tenant.objects.some((candidate) =>
      candidate.apiName === relationship.targetObject
      && candidate.pageLayouts?.some((layout) => layout.relatedLists.includes(relationship.childRelationshipName)))) {
      dependencies.push('a related list on a page layout');
    }
  }
  for (const candidate of tenant.objects) {
    if (candidate.relatedLookupFilters?.some((filter) =>
      (candidate.apiName === objectApiName && filter.fieldApiName === fieldApiName)
      || (candidate.apiName === objectApiName && filter.valueFieldApiName === fieldApiName)
      || (filter.relatedObject === objectApiName && filter.relatedFieldApiName === fieldApiName))) {
      dependencies.push(`a related lookup filter on ${candidate.label}`);
    }
  }
  for (const flow of tenant.flows) {
    const flowConfigs = flow.elements.map((element) => element.config);
    if (flowUsesObject(flow, objectApiName)
      && containsFieldReference([flow.startConfig, flowConfigs, flow.resources, flow.versions], fieldApiName)) {
      dependencies.push(`flow ${flow.label}`);
    }
  }
  for (const page of tenant.pages) {
    if (page.targetObject === objectApiName && page.components.some((component) => containsFieldReference(component.properties, fieldApiName))) {
      dependencies.push(`Lightning page ${page.label}`);
    }
  }
  for (const report of tenant.reports) {
    const referencesBaseField = report.objectApiName === objectApiName && (
      report.fieldApiNames.includes(fieldApiName)
      || report.groupByFieldApiNames.includes(fieldApiName)
      || report.columnGroupByFieldApiName === fieldApiName
      || report.sortFieldApiName === fieldApiName
      || report.rowLimit.sortFieldApiName === fieldApiName
      || report.filters.some((filter) => filter.fieldApiName === fieldApiName)
      || report.standardFilters.dateFieldApiName === fieldApiName
    );
    const referencesCrossFilterField = report.crossFilters.some((crossFilter) =>
      crossFilter.childObjectApiName === objectApiName
      && crossFilter.filters.some((filter) => filter.fieldApiName === fieldApiName));
    const usesCrossFilterRelationship = report.crossFilters.some((crossFilter) =>
      crossFilter.childObjectApiName === objectApiName
      && object?.fields.some((field) => field.apiName === fieldApiName
        && field.relationship?.targetObject === report.objectApiName));
    if (referencesBaseField || referencesCrossFilterField || usesCrossFilterRelationship) {
      dependencies.push(`report ${report.label}`);
    }
  }
  for (const dashboard of tenant.dashboards) {
    const referencesFilter = dashboard.filters.some((filter) =>
      filter.objectApiName === objectApiName && filter.fieldApiName === fieldApiName);
    const referencesComponent = dashboard.components.some((component) =>
      component.objectApiName === objectApiName
      && (component.measureFieldApiName === fieldApiName
        || component.groupByFieldApiName === fieldApiName
        || component.xAxisFieldApiName === fieldApiName
        || component.displayFieldApiNames.includes(fieldApiName)
        || containsFieldReference(component.properties, fieldApiName)));
    if (referencesFilter || referencesComponent) dependencies.push(`dashboard ${dashboard.label}`);
  }
  return [...new Set(dependencies)];
}

function findObjectDependencies(tenant: TenantData, objectApiName: string): string[] {
  const dependencies: string[] = [];
  const add = (description: string) => {
    if (!dependencies.includes(description)) dependencies.push(description);
  };
  for (const candidate of tenant.objects) {
    if (candidate.apiName !== objectApiName && candidate.fields.some((field) =>
      field.relationship?.targetObject === objectApiName)) {
      const fields = candidate.fields
        .filter((field) => field.relationship?.targetObject === objectApiName)
        .map((field) => field.apiName);
      add(`relationship field${fields.length === 1 ? '' : 's'} ${fields.join(', ')} on ${candidate.label}`);
    }
    if (candidate.apiName !== objectApiName && candidate.relatedLookupFilters?.some((filter) =>
      filter.relatedObject === objectApiName)) {
      add(`related lookup filter on ${candidate.label}`);
    }
    if (candidate.apiName !== objectApiName && candidate.pageLayouts?.some((layout) =>
      layout.relatedLists.some((relatedList) => tenant.objects
        .find((child) => child.apiName === objectApiName)?.fields.some((field) =>
          field.relationship?.targetObject === candidate.apiName
          && field.relationship.childRelationshipName === relatedList)))) {
      add(`related list on ${candidate.label}`);
    }
  }
  for (const app of tenant.apps ?? []) {
    if (app.navigationItems.includes(objectApiName)) add(`Lightning app ${app.label} navigation`);
  }
  for (const flow of tenant.flows) {
    if (flowUsesObject(flow, objectApiName)
      || containsFieldReference([flow.startConfig, flow.elements.map((element) => element.config), flow.resources, flow.versions], objectApiName)) {
      add(`flow ${flow.label}`);
    }
  }
  for (const page of tenant.pages) {
    if (page.targetObject === objectApiName
      || page.components.some((component) => containsFieldReference(component.properties, objectApiName))) {
      add(`Lightning page ${page.label}`);
    }
  }
  for (const report of tenant.reports) {
    if (report.objectApiName === objectApiName
      || report.crossFilters.some((crossFilter) => crossFilter.childObjectApiName === objectApiName)) {
      add(`report ${report.label}`);
    }
  }
  for (const dashboard of tenant.dashboards) {
    if (dashboard.filters.some((filter) => filter.objectApiName === objectApiName)
      || dashboard.components.some((component) => component.objectApiName === objectApiName
        || containsFieldReference(component.properties, objectApiName))) {
      add(`dashboard ${dashboard.label}`);
    }
  }
  for (const process of tenant.approvalProcesses) {
    if (process.objectApiName === objectApiName) add(`approval process ${process.label}`);
  }
  for (const alert of tenant.emailAlerts) {
    if (alert.objectApiName === objectApiName) add(`email alert ${alert.label}`);
  }
  for (const rule of tenant.accessControl.sharingRules) {
    if (rule.objectApiName === objectApiName) add(`sharing rule ${rule.label}`);
  }
  return dependencies;
}

type LocalUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  role: string;
  permissionSetIds: string[];
  permissionSetGroupIds: string[];
  disabled: boolean;
  createdAt: string;
};
type RefreshSession = {
  tokenHash: string;
  familyId: string;
  userId: string;
  tenantId: string;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
};
type PlatformState = {
  tenants: Record<string, TenantData>;
  libraryComponents: LibraryComponent[];
  users: LocalUser[];
  refreshSessions: RefreshSession[];
  revokedAccessTokens: Record<string, number>;
};
const stateSchema = z.object({
  libraryComponents: z.array(libraryComponentSchema).default([]),
  tenants: z.record(z.object({
    objects: z.array(objectSchema),
    flows: z.array(flowSchema),
    platformEvents: z.array(platformEventSchema).default([]),
    platformEventMessages: z.array(platformEventMessageSchema).default([]),
    pages: z.array(pageSchema),
    apps: z.array(lightningAppSchema).default(defaultLightningApps),
    dashboards: z.array(dashboardSchema).default([]),
    dashboardFolders: z.array(dashboardFolderSchema).default([]),
    reportFolders: z.array(reportFolderSchema).default([]),
    dashboardTerritories: z.array(dashboardTerritorySchema).default([]),
    dashboardSnapshots: z.array(dashboardSnapshotSchema).default([]),
    dashboardSubscriptions: z.array(dashboardSubscriptionSchema).default([]),
    reports: z.array(reportSchema).default([]),
    accessControl: accessControlSchema,
    sharingSettings: z.record(sharingSettingSchema).default({}),
    currencySettings: currencySettingsSchema.default({ corporateCurrency: 'USD', currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }] }),
    recordShares: z.array(recordShareSchema).default([]),
    campaignMembers: z.array(campaignMemberSchema).default([]),
    activities: z.array(recordActivitySchema).default([]),
    chatterPosts: z.array(chatterPostSchema).default([]),
    notifications: z.array(customNotificationSchema).default([]),
    approvalRequests: z.array(approvalRequestSchema).default([]),
    approvalProcesses: z.array(approvalProcessSchema).default([]),
    records: z.record(z.array(runtimeRecordSchema)).default({}),
    autoNumberSequences: z.record(z.number().int().nonnegative()).default({}),
    fieldHistory: z.array(fieldHistoryEntrySchema).default([]),
    interviews: z.array(flowInterviewSchema).default([]),
    flowLogs: z.array(flowExecutionLogSchema).default([]),
    scheduleRuns: z.record(z.string().datetime()).default({}),
    scheduleRetries: z.record(scheduleRetrySchema).default({}),
    namedCredentials: z.array(namedCredentialSchema).default([]),
    emailAlerts: z.array(emailAlertSchema).default([]),
    connectorSettings: z.array(connectorSettingsSchema).default(defaultConnectorSettings),
    connectorDefinitions: z.array(connectorDefinitionSchema).default(defaultConnectorDefinitions),
    integrationConnections: z.array(integrationConnectionSchema).default([])
  })),
  users: z.array(z.object({
    id: z.string(), tenantId: z.string(), name: z.string(), email: z.string().email(),
    passwordSalt: z.string(), passwordHash: z.string(), role: z.string(),
    permissionSetIds: z.array(z.string()), permissionSetGroupIds: z.array(z.string()).default([]),
    disabled: z.boolean(), createdAt: z.string().datetime()
  })),
  refreshSessions: z.array(z.object({
    tokenHash: z.string(), familyId: z.string(), userId: z.string(), tenantId: z.string(),
    expiresAt: z.number(), usedAt: z.number().nullable(), revokedAt: z.number().nullable()
  })),
  revokedAccessTokens: z.record(z.number())
}).superRefine((state, context) => {
  const emails = new Set<string>();
  state.users.forEach((user, index) => {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (emails.has(normalizedEmail)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['users', index, 'email'],
        message: `Email "${normalizedEmail}" must be unique across all tenants`
      });
    }
    emails.add(normalizedEmail);
  });
});
const fullObjectPermissions = { read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true };
const systemAdminPermissions = [
  'metadata:read', 'metadata:write', 'security:read', 'security:manage',
  'objects:manage', 'flows:manage', 'flows:run', 'namedCredentials:manage', 'reports:manage', 'pages:manage',
  'components:manage', 'dashboards:manage', 'dashboards:viewTeam', 'data:viewAll', 'email:send', 'callouts:execute', 'notifications:send', 'approvals:manage'
];
const salesPermissions = ['metadata:read'];
const supportPermissions = ['metadata:read'];

const baseObjects: ObjectMetadata[] = [
  { apiName: 'User', label: 'User', pluralLabel: 'Users', kind: 'Standard Object', description: 'Platform users who belong to this tenant.', fields: [
    { apiName: 'Name', label: 'Full Name', dataType: 'Text(121)', required: true, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: true, unique: true },
    { apiName: 'Username', label: 'Username', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false },
    { apiName: 'UserRoleId', label: 'User Role', dataType: 'Text(18)', required: false, unique: false }
  ] },
  { apiName: 'Account', label: 'Account', pluralLabel: 'Accounts', kind: 'Standard Object', description: 'Companies and organizations that you do business with.', fields: [
    { apiName: 'Name', label: 'Account Name', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Type', label: 'Account Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Channel Partner / Reseller', 'Technology Partner', 'Other'], picklistRestricted: true },
    { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
    { apiName: 'AnnualRevenue', label: 'Annual Revenue', dataType: 'Currency(18, 0)', required: false, unique: false },
    { apiName: 'NumberOfEmployees', label: 'Employees', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'Website', label: 'Website', dataType: 'URL', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Account Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Accounts' } },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false }
  ] },
  { apiName: 'Contact', label: 'Contact', pluralLabel: 'Contacts', kind: 'Standard Object', description: 'People associated with your accounts.', fields: [
    { apiName: 'Name', label: 'Contact Name', dataType: 'Name', required: true, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Contacts' } },
    { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Contact Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedContacts' } }
  ], listViewButtons: ['New', 'Change Owner', 'Import', 'Add to Campaign'] },
  { apiName: 'Lead', label: 'Lead', pluralLabel: 'Leads', kind: 'Standard Object', description: 'Prospective customers and the sources that introduced them.', fields: [
    { apiName: 'FirstName', label: 'First Name', dataType: 'Text(40)', required: false, unique: false },
    { apiName: 'LastName', label: 'Last Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Company', label: 'Company', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Street', label: 'Street', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'LeadSource', label: 'Lead Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'], picklistRestricted: true },
    { apiName: 'Status', label: 'Lead Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['New', 'Working', 'Qualified', 'Unqualified'], picklistRestricted: true, defaultValue: 'New' },
    { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
    { apiName: 'Rating', label: 'Rating', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Hot', 'Warm', 'Cold'], picklistRestricted: true },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Lead Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Leads' } }
  ] },
  { apiName: 'Opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', kind: 'Standard Object', description: 'Potential revenue and deals in progress.', fields: [
    { apiName: 'Name', label: 'Opportunity Name', dataType: 'Text(120)', required: true, unique: false },
    { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Existing Business', 'New Business'], picklistRestricted: true },
    { apiName: 'LeadSource', label: 'Lead Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'], picklistRestricted: true },
    { apiName: 'Amount', label: 'Amount', dataType: 'Currency(16, 2)', required: false, unique: false },
    { apiName: 'CloseDate', label: 'Close Date', dataType: 'Date', required: true, unique: false },
    { apiName: 'NextStep', label: 'Next Step', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'StageName', label: 'Stage', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Id. Decision Makers', 'Perception Analysis', 'Proposal/Price Quote', 'Negotiation/Review', 'Closed Won', 'Closed Lost'], picklistRestricted: true },
    { apiName: 'Probability', label: 'Probability (%)', dataType: 'Percent(3, 0)', required: false, unique: false },
    { apiName: 'Fiscal', label: 'Fiscal Period', dataType: 'Text(30)', required: false, unique: false },
    { apiName: 'Age', label: 'Age', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Opportunities' } },
    { apiName: 'OwnerId', label: 'Opportunity Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Opportunities' } },
    { apiName: 'OwnerRole', label: 'Owner Role', dataType: 'Text(80)', required: false, unique: false }
  ] },
  { apiName: 'Case', label: 'Case', pluralLabel: 'Cases', kind: 'Standard Object', description: 'Customer questions, feedback, and product issues.', fields: [
    { apiName: 'CaseNumber', label: 'Case Number', dataType: 'Auto Number', required: true, unique: true },
    { apiName: 'Subject', label: 'Subject', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['New', 'Working', 'Escalated', 'Closed'], picklistRestricted: true },
    { apiName: 'Priority', label: 'Case Priority', dataType: 'Picklist', required: true, unique: false, picklistValues: ['High', 'Medium', 'Low'], picklistRestricted: true },
    { apiName: 'CreatedDate', label: 'Date/Time Opened', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'Age', label: 'Age', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'IsOpen', label: 'Open', dataType: 'Checkbox', required: false, unique: false },
    { apiName: 'IsClosed', label: 'Closed', dataType: 'Checkbox', required: false, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Cases' } },
    { apiName: 'OwnerId', label: 'Case Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedCases' } }
  ] },
  { apiName: 'Campaign', label: 'Campaign', pluralLabel: 'Campaigns', kind: 'Standard Object', description: 'Marketing initiatives and their associated contacts.', fields: [
    { apiName: 'Name', label: 'Campaign Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Conference', 'Webinar', 'Email', 'Advertisement', 'Direct Mail', 'Other'], picklistRestricted: true },
    { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Planned', 'In Progress', 'Completed', 'Aborted'], picklistRestricted: true, defaultValue: 'Planned' },
    { apiName: 'StartDate', label: 'Start Date', dataType: 'Date', required: false, unique: false },
    { apiName: 'EndDate', label: 'End Date', dataType: 'Date', required: false, unique: false },
    { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false, defaultValue: true },
    { apiName: 'OwnerId', label: 'Campaign Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Campaigns' } }
  ] },
  { apiName: 'Renewal__c', label: 'Renewal', pluralLabel: 'Renewals', kind: 'Custom Object', description: 'Tracks upcoming customer contract renewals.', fields: [
    { apiName: 'Name', label: 'Renewal Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Account__c', label: 'Account', dataType: 'Lookup(Account)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Renewals' } },
    { apiName: 'Renewal_Date__c', label: 'Renewal Date', dataType: 'Date', required: true, unique: false },
    { apiName: 'ARR__c', label: 'Annual Recurring Revenue', dataType: 'Currency(16, 2)', required: false, unique: false }
  ] },
  { apiName: 'WhatsApp_Message__c', label: 'WhatsApp Message', pluralLabel: 'WhatsApp Messages', kind: 'Custom Object', description: 'Editable WhatsApp inbound/outbound message records used by metadata-driven Flows.', fields: [
    { apiName: 'Name', label: 'Message Reference', dataType: 'AutoNumber', required: true, unique: false },
    { apiName: 'Direction__c', label: 'Direction', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Incoming', 'Outgoing'], picklistRestricted: true },
    { apiName: 'From_Number__c', label: 'From Number', dataType: 'Phone', required: false, unique: false },
    { apiName: 'To_Number__c', label: 'To Number', dataType: 'Phone', required: false, unique: false },
    { apiName: 'Message_Body__c', label: 'Message Body', dataType: 'Long Text Area', required: true, unique: false },
    { apiName: 'Conversation_Key__c', label: 'Conversation Key', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Received', 'Pending', 'Sent', 'Failed'], picklistRestricted: true, defaultValue: 'Received' },
    { apiName: 'Provider_Message_Id__c', label: 'Provider Message ID', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Occurred_At__c', label: 'Occurred At', dataType: 'Date/Time', required: false, unique: false }
  ], settings: {
    allowReports: true, allowActivities: false, trackFieldHistory: true, allowInChatter: false,
    deploymentStatus: 'Deployed', recordNameType: 'Auto Number', recordNameFormat: 'WAM-{000000}'
  } },
  { apiName: 'Communication_Records__c', label: 'Communication Records', pluralLabel: 'Communication Records', kind: 'Custom Object', description: 'Audit log of incoming API requests and outgoing external API callouts.', fields: [
    { apiName: 'Name', label: 'Communication ID', dataType: 'AutoNumber', required: true, unique: false },
    { apiName: 'Api_Id__c', label: 'API ID', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Url__c', label: 'URL', dataType: 'URL', required: false, unique: false },
    { apiName: 'Auth_Type__c', label: 'Authentication Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['None', 'Bearer', 'Basic', 'API Key', 'Other'], picklistRestricted: true },
    { apiName: 'Method__c', label: 'HTTP Method', dataType: 'Picklist', required: false, unique: false, picklistValues: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'], picklistRestricted: true },
    { apiName: 'Direction__c', label: 'Direction', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Incoming', 'Outgoing'], picklistRestricted: true },
    { apiName: 'Request_Body__c', label: 'Request Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Response_Body__c', label: 'Response Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status_Code__c', label: 'HTTP Status Code', dataType: 'Number(3, 0)', required: false, unique: false },
    { apiName: 'Error__c', label: 'Error', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Duration_Ms__c', label: 'Duration (ms)', dataType: 'Number(12, 0)', required: false, unique: false },
    { apiName: 'Occurred_At__c', label: 'Occurred At', dataType: 'Date/Time', required: true, unique: false }
  ], settings: {
    allowReports: true, allowActivities: false, trackFieldHistory: false, allowInChatter: false,
    deploymentStatus: 'Deployed', recordNameType: 'Auto Number', recordNameFormat: 'ONECOM-{000000000000000000000}'
  } },
  { apiName: 'ConnectorProvider__c', label: 'Connector Provider', pluralLabel: 'Connector Providers', kind: 'Standard Object', description: 'Metadata definitions for external API connector providers.', fields: [
    { apiName: 'Name', label: 'Provider Name', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'ConnectorKey__c', label: 'Connector Key', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'AuthType__c', label: 'Authentication Type', dataType: 'Picklist', required: true, unique: false, picklistValues: ['NONE', 'BEARER', 'BASIC', 'API_KEY'], picklistRestricted: true },
    { apiName: 'BaseUrl__c', label: 'Base URL', dataType: 'URL', required: true, unique: false },
    { apiName: 'AuthCredential__c', label: 'Authentication Credential Field', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'CredentialsSchema__c', label: 'Credentials Schema', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Operations__c', label: 'Operations', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Test__c', label: 'Connection Test', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'TimeoutMs__c', label: 'Timeout (ms)', dataType: 'Number(9, 0)', required: true, unique: false, defaultValue: 30000 },
    { apiName: 'RetryPolicy__c', label: 'Retry Policy', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['ACTIVE', 'INACTIVE'], picklistRestricted: true, defaultValue: 'ACTIVE' }
  ] },
  { apiName: 'IntegrationConnection__c', label: 'Integration Connection', pluralLabel: 'Integration Connections', kind: 'Standard Object', description: 'Tenant-owned configured connections to external connector providers.', fields: [
    { apiName: 'Name', label: 'Connection Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'ConnectorKey__c', label: 'Connector Key', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Configuration__c', label: 'Connector Configuration', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['ACTIVE', 'INACTIVE'], picklistRestricted: true, defaultValue: 'ACTIVE' },
    { apiName: 'TestStatus__c', label: 'Test Status', dataType: 'Text(30)', required: false, unique: false },
    { apiName: 'LastTestedAt__c', label: 'Last Tested At', dataType: 'Date/Time', required: false, unique: false }
  ] },
  { apiName: 'UneConnector__c', label: 'Une Connector', pluralLabel: 'Une Connectors', kind: 'Standard Object', description: 'Legacy connector settings records.', fields: [
    { apiName: 'Name', label: 'Connector Name', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'ConnectorType__c', label: 'Connector Type', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Not Configured', 'Configured'], picklistRestricted: true, defaultValue: 'Not Configured' },
    { apiName: 'Configuration__c', label: 'Configuration Values', dataType: 'Long Text Area', required: false, unique: false, description: 'Connector configuration values stored as JSON metadata.' }
  ] }
];

function buildDefaultProfiles(objects: ObjectMetadata[], permissionSets: AccessControl['permissionSets']): AccessProfile[] {
  const allAccess = Object.fromEntries(objects.map((object) => [object.apiName, { ...fullObjectPermissions }]));
  const adminSet = permissionSets.find((set) => set.id === 'system-administrator');
  const adminFields = Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])));
  const salesSet = permissionSets.find((set) => set.id === 'sales-user');
  const supportSet = permissionSets.find((set) => set.id === 'support-agent');
  return [
    {
      id: 'system-administrator', label: 'System Administrator', apiName: 'System_Administrator', license: 'MetaDrive',
      description: 'Full administrative access to setup and tenant data.', isStandard: true,
      systemPermissions: [...new Set([...(adminSet?.systemPermissions ?? []), ...systemAdminPermissions])],
      objectPermissions: { ...allAccess, ...(adminSet?.objectPermissions ?? {}) },
      recordTypePermissions: { ...(adminSet?.recordTypePermissions ?? {}) },
      fieldPermissions: { ...adminFields, ...(adminSet?.fieldPermissions ?? {}) }
    },
    {
      id: 'standard-user', label: 'Standard User', apiName: 'Standard_User', license: 'MetaDrive',
      description: 'Tenant user with only the access granted by assigned permission sets.', isStandard: true,
      systemPermissions: [], objectPermissions: {}, recordTypePermissions: {}, fieldPermissions: {}
    },
    ...(salesSet ? [{
      ...salesSet, id: 'sales-manager', label: 'Sales Manager', apiName: 'Sales_Manager', isStandard: false
    }] : []),
    ...(supportSet ? [{
      ...supportSet, id: 'support-agent', label: 'Support Agent', apiName: 'Support_Agent', isStandard: false
    }] : [])
  ];
}

function defaultRoles(): AccessRole[] {
  return [
    { id: 'role-executive', name: 'Executive', apiName: 'Executive', parentRoleId: null },
    { id: 'role-sales-manager', name: 'Sales Manager', apiName: 'Sales_Manager', parentRoleId: 'role-executive' },
    { id: 'role-sales-representative', name: 'Sales Representative', apiName: 'Sales_Representative', parentRoleId: 'role-sales-manager' },
    { id: 'role-support-manager', name: 'Support Manager', apiName: 'Support_Manager', parentRoleId: 'role-executive' },
    { id: 'role-support-agent', name: 'Support Agent', apiName: 'Support_Agent', parentRoleId: 'role-support-manager' },
    { id: 'role-standard-user', name: 'Standard User', apiName: 'Standard_User', parentRoleId: 'role-executive' }
  ];
}

function roleApiNameForName(name: string): string {
  const apiName = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return /^[A-Za-z]/.test(apiName) ? apiName : `Role_${apiName}`;
}

function roleIdForName(name: string, roles: AccessRole[]): string {
  const normalized = name.trim().toLowerCase();
  const knownId = normalized === 'system administrator' || normalized === 'executive' ? 'role-executive'
    : normalized === 'sales manager' ? 'role-sales-manager'
      : normalized === 'sales representative' || normalized === 'sales user' ? 'role-sales-representative'
        : normalized === 'support manager' ? 'role-support-manager'
          : normalized === 'support agent' ? 'role-support-agent'
            : normalized === 'standard user' ? 'role-standard-user'
              : '';
  return roles.find((role) => role.id === knownId)?.id
    ?? roles.find((role) => role.name.toLowerCase() === normalized)?.id
    ?? roles.find((role) => role.id === 'role-standard-user')?.id
    ?? roles[0]?.id
    ?? '';
}

function profileIdForRole(role: string, profiles: AccessProfile[]): string {
  const roleKey = role.trim().toLowerCase();
  const knownId = roleKey === 'system administrator' ? 'system-administrator'
    : roleKey === 'sales manager' ? 'sales-manager'
      : roleKey === 'support agent' ? 'support-agent'
        : '';
  return profiles.find((profile) => profile.id === knownId)?.id
    ?? profiles.find((profile) => profile.label.toLowerCase() === roleKey)?.id
    ?? profiles.find((profile) => profile.id === 'standard-user')?.id
    ?? profiles[0]?.id
    ?? '';
}

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
    triggerObject: 'WhatsApp_Message__c',
    startConfig: { trigger: 'created', runWhen: 'after-save', conditionLogic: 'All', entryConditions: [{ field: 'Direction__c', operator: 'Equals', value: 'Incoming' }] },
    elements: [
      { id: 1, type: 'Start', label: 'Incoming WhatsApp Message', config: { trigger: 'created', runWhen: 'after-save' } },
      { id: 2, type: 'Decision', label: 'Route by Keyword', config: { outcomes: [
        { name: 'Beauty', label: 'Beauty', conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' }] },
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
      { id: 9, type: 'Create Records', label: 'Log Outgoing WhatsApp Message', config: { object: 'WhatsApp_Message__c', fieldValues: [
        { field: 'Direction__c', value: 'Outgoing' }, { field: 'From_Number__c', value: '{!$Record.To_Number__c}' },
        { field: 'To_Number__c', value: '{!$Record.From_Number__c}' }, { field: 'Message_Body__c', value: '{!ReplyText}' },
        { field: 'Conversation_Key__c', value: '{!$Record.Conversation_Key__c}' }, { field: 'Status__c', value: 'Sent' }
      ] } },
      { id: 10, type: 'Update Records', label: 'Mark Incoming Message Processed', config: { object: 'WhatsApp_Message__c', conditions: [{ field: 'Id', operator: 'Equals', value: '{!$Record.Id}' }], fieldValues: [{ field: 'Status__c', value: 'Sent' }] } },
      { id: 11, type: 'Assignment', label: 'Capture Callout Error', config: { variable: 'FlowError', operator: 'Assign', value: '{!$Flow.FaultMessage}' } }
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
      { id: 'wa-send-fault', from: 8, to: 11, label: '', kind: 'fault' }
    ],
    resources: [
      { name: 'ReplyText', label: 'Reply Text', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: false, value: '' },
      { name: 'CalloutStatus', label: 'Callout Status', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: false, value: 0 },
      { name: 'FlowError', label: 'Flow Error', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '' }
    ], versions: []
  });
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

function defaultTenantData(admin?: Pick<LocalUser, 'id' | 'tenantId' | 'name' | 'email' | 'role' | 'permissionSetIds'>): TenantData {
  const objects = baseObjects.map(withObjectDefaults);
  const allAccess = Object.fromEntries(objects.map((object) => [object.apiName, { ...fullObjectPermissions }]));
  const permissionSets = [
    { id: 'system-administrator', label: 'System Administrator', apiName: 'System_Administrator', license: 'MetaDrive', description: 'Full administrative access.', systemPermissions: systemAdminPermissions, objectPermissions: allAccess, recordTypePermissions: {}, fieldPermissions: Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }]))) },
    { id: 'sales-user', label: 'Sales User', apiName: 'Sales_User', license: 'MetaDrive', description: 'Manage accounts and opportunities.', systemPermissions: salesPermissions, objectPermissions: {
      Account: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
      Contact: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
      Campaign: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
      Opportunity: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
    }, recordTypePermissions: {}, fieldPermissions: { 'Opportunity.Amount': { read: true, edit: true }, 'Opportunity.StageName': { read: true, edit: true } } },
    { id: 'support-agent', label: 'Support Agent', apiName: 'Support_Agent', license: 'MetaDrive', description: 'Work on customer cases.', systemPermissions: supportPermissions, objectPermissions: {
      Account: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
      Contact: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
      Case: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
    }, recordTypePermissions: {}, fieldPermissions: { 'Case.Priority': { read: true, edit: true }, 'Case.Status': { read: true, edit: true } }
    }
  ];
  // Dedicated, assignable OneEngine permission set for credential administration.
  // A flow author does not receive this permission merely by editing flows.
  // Named Credentials uses existing RBAC system permissions.
  const profiles = buildDefaultProfiles(objects, permissionSets);
  const accessControl = accessControlSchema.parse({
    profiles,
    permissionSets,
    permissionSetGroups: [],
    roles: defaultRoles(),
    users: admin ? [{
      ...admin, username: admin.email, roleId: roleIdForName(admin.role, defaultRoles()),
      profileId: profileIdForRole(admin.role, profiles)
    }] : []
  });
  const flow = flowSchema.parse({
    apiName: 'Renewal_Risk_Evaluation', label: 'Renewal Risk Evaluation', flowType: 'Record-Triggered Flow',
    status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: 'Renewal__c',
    startConfig: { trigger: 'created-or-updated', runWhen: 'after-save', entryConditions: [] },
    elements: [
      { id: 1, type: 'Start', label: 'Record-Triggered Flow', config: { trigger: 'created-or-updated', runWhen: 'after-save' } },
      { id: 2, type: 'Decision', label: 'Renewal at risk?', config: { outcomes: [{ name: 'At_Risk', label: 'At Risk', conditions: [] }, { name: 'Default', label: 'Default Outcome', conditions: [] }] } },
      { id: 3, type: 'Update Records', label: 'Update Renewal Status', config: { object: 'Renewal__c', field: 'Status__c', value: 'At Risk' } }
    ],
    connectors: [
      { id: 'connector-1', from: 1, to: 2, label: '', kind: 'normal' },
      { id: 'connector-2', from: 2, to: 3, label: 'At Risk', kind: 'normal' }
    ],
    resources: [{ name: 'recordId', label: 'Record ID', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false }],
    versions: []
  });
  const page = pageSchema.parse({
    apiName: 'Account_Record_Page', label: 'Account Record Page', targetObject: 'Account',
    pageType: 'Record Page', template: 'header-main-sidebar', status: 'Draft', devices: ['Desktop', 'Phone'],
    components: [
      { id: 'highlights-panel', type: 'Highlights Panel', label: 'Highlights Panel', properties: { variant: 'compact' }, visible: true, region: 'header' },
      { id: 'record-tabs', type: 'Tabs', label: 'Tabs', properties: { tabs: ['Related', 'Details', 'News'] }, visible: true, region: 'main' },
      { id: 'related-list', type: 'Related List', label: 'Related List', properties: { relatedLists: ['Contacts', 'Opportunities', 'Cases'] }, visible: true, region: 'sidebar' }
    ],
    activationAssignments: [
      { id: 'account-default-desktop', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Desktop'] },
      { id: 'account-default-phone', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Phone'] }
    ]
  });
  return {
    objects, flows: [flow, whatsappRouterFlow()], platformEvents: [], platformEventMessages: [], pages: [page], apps: defaultLightningApps(), dashboards: [], dashboardFolders: [], reportFolders: [], dashboardTerritories: [], dashboardSnapshots: [], dashboardSubscriptions: [], reports: [], accessControl,
    currencySettings: { corporateCurrency: 'USD', currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }] },
    sharingSettings: Object.fromEntries(objects.map((object) => [object.apiName, {
      defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true
    }])),
    recordShares: [], campaignMembers: [], activities: [], chatterPosts: [], notifications: [], approvalRequests: [], approvalProcesses: [],
    records: {
      UneConnector__c: connectorRecords(defaultConnectorSettings, admin?.id ?? 'system'),
      ConnectorProvider__c: connectorDefinitionRecords(defaultConnectorDefinitions, admin?.id ?? 'system'),
      IntegrationConnection__c: [],
      WhatsApp_Message__c: []
    },
    autoNumberSequences: {},
    fieldHistory: [], interviews: [], flowLogs: [], scheduleRuns: {}, scheduleRetries: {}, namedCredentials: seedWhatsappDummyCredential(admin?.tenantId ?? 'bootstrap', []), emailAlerts: [],
    connectorSettings: structuredClone(defaultConnectorSettings),
    connectorDefinitions: structuredClone(defaultConnectorDefinitions),
    integrationConnections: []
  };
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
  if (!addedFields.length) return object;
  const fieldApiNames = addedFields.map((field) => field.apiName);
  return {
    ...object,
    description: object.description || defaults.description,
    fields: [...object.fields, ...addedFields],
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

const initialState: PlatformState = { tenants: {}, libraryComponents: [], users: [], refreshSessions: [], revokedAccessTokens: {} };
function migrateStoredLeadStreetField(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (!state.tenants || typeof state.tenants !== 'object' || Array.isArray(state.tenants)) return false;
  const streetField = baseObjects.find((item) => item.apiName === 'Lead')
    ?.fields.find((field) => field.apiName === 'Street');
  if (!streetField) throw new Error('Standard Lead Street field metadata is missing');
  let changed = false;
  for (const tenant of Object.values(state.tenants as Record<string, unknown>)) {
    if (!tenant || typeof tenant !== 'object' || Array.isArray(tenant)) continue;
    const objects = (tenant as Record<string, unknown>).objects;
    if (!Array.isArray(objects)) continue;
    const lead = objects.find((object) => object && typeof object === 'object'
      && !Array.isArray(object) && (object as Record<string, unknown>).apiName === 'Lead');
    if (!lead || typeof lead !== 'object' || Array.isArray(lead)) continue;
    const leadRecord = lead as Record<string, unknown>;
    if (!Array.isArray(leadRecord.fields)
      || leadRecord.fields.some((field) => field && typeof field === 'object'
        && !Array.isArray(field) && (field as Record<string, unknown>).apiName === 'Street')) continue;
    leadRecord.fields = [...leadRecord.fields, structuredClone(streetField)];
    changed = true;
  }
  return changed;
}
function loadState(): PlatformState {
  try {
    const storedState: unknown = JSON.parse(readFileSync(dataPath, 'utf8'));
    const leadStreetFieldAdded = migrateStoredLeadStreetField(storedState);
    const parsed = stateSchema.parse(storedState);
    const tenants = Object.fromEntries(Object.entries(parsed.tenants).map(([tenantId, tenant]) => {
      const storedObjects = tenant.objects.map((object) => {
        const ensured = withObjectDefaults(ensureLeadStreetField(ensureCommunicationFields(object)));
        const baseline = baseObjects.find((candidate) => candidate.apiName === object.apiName);
        if (!baseline || !['ConnectorProvider__c', 'IntegrationConnection__c'].includes(object.apiName)) return ensured;
        return {
          ...ensured,
          fields: [
            ...ensured.fields,
            ...baseline.fields.filter((field) => !ensured.fields.some((existing) => existing.apiName === field.apiName))
          ]
        };
      });
      const objects = [
        ...storedObjects,
        ...baseObjects.filter((object) => ['Campaign', 'UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c', 'Communication_Records__c', 'WhatsApp_Message__c'].includes(object.apiName)
          && !storedObjects.some((stored) => stored.apiName === object.apiName)).map(withObjectDefaults)
      ];
      const records = tenant.records ?? {};
      if (!records.Communication_Records__c) records.Communication_Records__c = [];
      if (!records.WhatsApp_Message__c) records.WhatsApp_Message__c = [];
      const ownerId = parsed.users.find((user) => user.tenantId === tenantId && !user.disabled)?.id ?? 'system';
      if (!(records.UneConnector__c?.length)) records.UneConnector__c = connectorRecords(tenant.connectorSettings, ownerId);
      const previousProviderRecords = records.ConnectorProvider__c ?? [];
      const connectorDefinitions = (tenant.connectorDefinitions ?? structuredClone(defaultConnectorDefinitions)).map((definition) => {
        const previousRecord = previousProviderRecords.find((record) => record.ConnectorKey__c === definition.connectorKey);
        const baseline = defaultConnectorDefinitions.find((candidate) => candidate.connectorKey === definition.connectorKey);
        if (previousRecord?.Test__c === undefined && !definition.test && baseline?.test
          && definition.authType === baseline.authType && definition.baseUrl === baseline.baseUrl) {
          return { ...definition, test: baseline.test };
        }
        return definition;
      });
      records.ConnectorProvider__c = connectorDefinitions.flatMap((definition) => {
        const previous = previousProviderRecords.find((record) => record.ConnectorKey__c === definition.connectorKey);
        if (!previous) return connectorDefinitionRecords([definition], ownerId);
        return [{
          ...previous,
          AuthCredential__c: definition.authCredential ?? '',
          Test__c: definition.test ? JSON.stringify(definition.test) : ''
        }];
      });
      const previousConnections = records.IntegrationConnection__c ?? [];
      records.IntegrationConnection__c = (tenant.integrationConnections ?? []).map((connection) =>
        integrationConnectionRecord(connection, String(previousConnections.find((record) => record.Id === connection.id)?.OwnerId ?? ownerId)));
      const defaultProfiles = buildDefaultProfiles(objects, tenant.accessControl.permissionSets);
      const connectorObjectNames = ['UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c', 'Communication_Records__c', 'WhatsApp_Message__c'];
      const connectorObjectPermissions = Object.fromEntries(connectorObjectNames.map((apiName) => [apiName, { ...fullObjectPermissions }]));
      const connectorFieldPermissions = Object.fromEntries(objects
        .filter((object) => connectorObjectNames.includes(object.apiName))
        .flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])));
      const profiles = [
        ...defaultProfiles.filter((profile) => !tenant.accessControl.profiles.some((existing) => existing.id === profile.id)),
        ...tenant.accessControl.profiles
      ].map((profile) => profile.id === 'system-administrator'
        ? {
          ...profile,
          systemPermissions: [...new Set([...profile.systemPermissions, ...systemAdminPermissions])],
          objectPermissions: { ...connectorObjectPermissions, ...profile.objectPermissions },
          fieldPermissions: {
            ...connectorFieldPermissions,
            ...profile.fieldPermissions
          }
        }
        : profile.id === 'sales-manager'
          ? { ...profile, objectPermissions: { ...profile.objectPermissions, Campaign: profile.objectPermissions.Campaign ?? { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false } } }
          : profile);
      const roles = [
        ...defaultRoles().filter((role) => !tenant.accessControl.roles.some((existing) => existing.id === role.id)),
        ...tenant.accessControl.roles.map((role) => ({ ...role, apiName: role.apiName ?? roleApiNameForName(role.name) }))
      ];
      const profileIds = new Set(profiles.map((profile) => profile.id));
      const accessUsers = tenant.accessControl.users.map((user) => ({
        ...user,
        roleId: user.roleId && roles.some((role) => role.id === user.roleId)
          ? user.roleId : roleIdForName(user.role, roles),
        profileId: user.role === 'System Administrator' ? 'system-administrator' : user.profileId && profileIds.has(user.profileId) ? user.profileId : profileIdForRole(user.role, profiles)
      }));
      // The login identity store is authoritative for tenant membership. Keep every
      // authenticated tenant identity represented in RBAC without replacing existing grants.
      const syncedAccessUsers = [
        ...accessUsers,
        ...parsed.users.filter((identity) => identity.tenantId === tenantId
          && !accessUsers.some((entry) => entry.id === identity.id)).map((identity) => ({
          id: identity.id,
          name: identity.name,
          username: identity.email,
          role: identity.role,
          roleId: roleIdForName(identity.role, roles),
          profileId: profileIdForRole(identity.role, profiles),
          permissionSetIds: identity.permissionSetIds.filter((id) => tenant.accessControl.permissionSets.some((set) => set.id === id)),
          permissionSetGroupIds: identity.permissionSetGroupIds,
        }))
      ];
      const dashboardFolders = [...(tenant.dashboardFolders ?? [])];
      const reportFolders = [...(tenant.reportFolders ?? [])];
      const legacyReportFolderId = tenant.reports.length
        ? (reportFolders.find((folder) => folder.label === 'Legacy Reports')?.id ?? randomUUID())
        : '';
      if (tenant.reports.length && !reportFolders.some((folder) => folder.id === legacyReportFolderId)) {
        const now = new Date().toISOString();
        reportFolders.push({
          id: legacyReportFolderId,
          label: 'Legacy Reports',
          parentFolderId: null,
          ownerUserId: ownerId,
          shares: [],
          visibility: 'All Users',
          createdAt: now,
          updatedAt: now
        });
      }
      const reports = tenant.reports.map((report) => report.folderId && reportFolders.some((folder) => folder.id === report.folderId)
        ? report
        : { ...report, folderId: legacyReportFolderId || null });
      const legacyFolderIds = new Map<string, string>();
      const dashboards = tenant.dashboards.map((dashboard) => {
        if (dashboard.folderId) return dashboard;
        const folderKey = `${dashboard.ownerUserId}\0${dashboard.folderName.toLocaleLowerCase()}`;
        let folderId = legacyFolderIds.get(folderKey);
        if (!folderId) {
          folderId = randomUUID();
          legacyFolderIds.set(folderKey, folderId);
          const now = new Date().toISOString();
          dashboardFolders.push({
            id: folderId,
            label: dashboard.folderName,
            parentFolderId: null,
            ownerUserId: dashboard.ownerUserId,
            shares: [],
            createdAt: now,
            updatedAt: now
          });
        }
        return { ...dashboard, folderId };
      });
      return [tenantId, {
      ...tenant,
      records,
      autoNumberSequences: migrateAutoNumberSequences(objects, records, tenant.autoNumberSequences),
      apps: tenant.apps,
      fieldHistory: tenant.fieldHistory ?? [],
      interviews: tenant.interviews ?? [],
      flowLogs: tenant.flowLogs ?? [],
      scheduleRuns: tenant.scheduleRuns ?? {},
      scheduleRetries: tenant.scheduleRetries ?? {},
      notifications: tenant.notifications ?? [],
      approvalRequests: tenant.approvalRequests ?? [],
      approvalProcesses: tenant.approvalProcesses ?? [],
      namedCredentials: seedWhatsappDummyCredential(tenantId, tenant.namedCredentials ?? []),
      connectorDefinitions,
      integrationConnections: tenant.integrationConnections ?? [],
      dashboards,
      dashboardFolders,
      reportFolders,
      dashboardTerritories: tenant.dashboardTerritories ?? [],
      dashboardSnapshots: tenant.dashboardSnapshots ?? [],
      dashboardSubscriptions: tenant.dashboardSubscriptions ?? [],
      reports,
      sharingSettings: Object.fromEntries(objects.map((object) => [
        object.apiName,
        tenant.sharingSettings?.[object.apiName] ?? { defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true }
      ])),
      recordShares: tenant.recordShares ?? [],
      campaignMembers: tenant.campaignMembers ?? [],
      activities: (tenant.activities ?? []).map((activity) => recordActivitySchema.parse(activity)),
      chatterPosts: (tenant.chatterPosts ?? []).map((post) => chatterPostSchema.parse(post)),
      accessControl: {
        ...tenant.accessControl,
        profiles: profiles.map((profile) => profile.id === 'system-administrator'
          ? { ...profile, objectPermissions: { ...profile.objectPermissions, Campaign: profile.objectPermissions.Campaign ?? { ...fullObjectPermissions } } }
          : profile.id === 'sales-manager'
            ? { ...profile, objectPermissions: { ...profile.objectPermissions, Campaign: profile.objectPermissions.Campaign ?? { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false } } }
            : profile),
        roles,
        users: syncedAccessUsers,
        permissionSets: tenant.accessControl.permissionSets.map((set) => set.id === 'system-administrator'
          ? {
            ...set,
            objectPermissions: { ...set.objectPermissions, ...connectorObjectPermissions, Campaign: set.objectPermissions.Campaign ?? { ...fullObjectPermissions } },
            fieldPermissions: { ...Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }]))), ...connectorFieldPermissions, ...set.fieldPermissions }
          }
          : set.id === 'sales-user'
            ? { ...set, objectPermissions: { ...set.objectPermissions, Campaign: set.objectPermissions.Campaign ?? { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false } } }
            : set),
      },
      objects,
      flows: tenant.flows.some((existingFlow) => existingFlow.apiName === 'WA_ROUTER') ? tenant.flows : [...tenant.flows, whatsappRouterFlow()],
      pages: tenant.pages.map((page) => ({
        ...page,
        activationAssignments: page.activationAssignments ?? (page.status === 'Active' && page.pageType === 'Record Page' ? [
          { id: `${page.apiName}-default-desktop`, scope: 'Org Default' as const, appId: null, profileId: null, recordTypeId: null, formFactors: ['Desktop' as const] },
          { id: `${page.apiName}-default-phone`, scope: 'Org Default' as const, appId: null, profileId: null, recordTypeId: null, formFactors: ['Phone' as const] }
        ] : [])
      }))
    }]; }));
    const tenantsWithLibraryManagement = Object.fromEntries(Object.entries(tenants).map(([tenantId, tenant]) => [tenantId, {
      ...tenant,
      accessControl: {
        ...tenant.accessControl,
        users: tenant.accessControl.users.map((user) => ({ ...user, permissionSetIds: user.permissionSetIds.filter((id) => id !== 'oneengine-named-credentials') })),
        permissionSets: tenant.accessControl.permissionSets.map((set) => set.id === 'system-administrator'
          ? {
            ...set,
            systemPermissions: [...new Set([...set.systemPermissions, ...systemAdminPermissions])],
            objectPermissions: { ...set.objectPermissions, UneConnector__c: set.objectPermissions.UneConnector__c ?? { ...fullObjectPermissions } },
            fieldPermissions: {
              ...Object.fromEntries(tenant.objects.find((object) => object.apiName === 'UneConnector__c')!.fields.map((field) => [
                `UneConnector__c.${field.apiName}`, { read: true, edit: true }
              ])),
              ...set.fieldPermissions
            }
          }
          : set).filter((set) => set.id !== 'oneengine-named-credentials')
      }
    }]));
    const migrated = {
      ...parsed,
      users: parsed.users.map((user) => ({ ...user, permissionSetIds: user.permissionSetIds.filter((id) => id !== 'oneengine-named-credentials') })),
      tenants: tenantsWithLibraryManagement,
      libraryComponents: parsed.libraryComponents ?? []
    };
    if (leadStreetFieldAdded || JSON.stringify(migrated) !== JSON.stringify(parsed)) persistState(migrated);
    return migrated;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      persistState(initialState);
      return structuredClone(initialState);
    }
    throw new Error(`Cannot load platform state from ${dataPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function persistState(next: PlatformState): void {
  mkdirSync(dirname(dataPath), { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, dataPath);
  void persistToPostgres(next);
}
const existingPostgresState = await readPersistedState();
if (existingPostgresState !== null) {
  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, JSON.stringify(existingPostgresState), { encoding: 'utf8', mode: 0o600 });
} else {
  // Never replace an existing database state with a new empty seed.
  // On first deployment, seed from the existing local MetaDrive state when present.
  console.log('No PostgreSQL state found; initializing from MetaDrive seed/state file');
}
let state = loadState();
try {
  credentialKeyRing();
  console.info('Named Credentials encryption readiness: configured');
} catch (error) {
  const missingKeys = !process.env.METADRIVE_CREDENTIAL_KEYS;
  const missingActiveId = !process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
  const status = missingKeys && missingActiveId ? 'both variables missing'
    : missingKeys ? 'METADRIVE_CREDENTIAL_KEYS missing'
    : missingActiveId ? 'METADRIVE_CREDENTIAL_ACTIVE_KEY_ID missing'
    : 'invalid environment configuration';
  console.warn('Named Credentials encryption readiness: ' + status);
}

await persistToPostgres(state);

function credentialKeyRing(): CredentialKeyRing {
  const serializedKeys = process.env.METADRIVE_CREDENTIAL_KEYS;
  const activeKeyId = process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
  if (!serializedKeys || !activeKeyId) {
    throw new Error('Named Credentials require METADRIVE_CREDENTIAL_KEYS and METADRIVE_CREDENTIAL_ACTIVE_KEY_ID');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw new Error('METADRIVE_CREDENTIAL_KEYS must be a JSON object of key IDs and base64-encoded 32-byte keys');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('METADRIVE_CREDENTIAL_KEYS must be a JSON object of key IDs and base64-encoded 32-byte keys');
  }
  const keys = new Map<string, Buffer>();
  for (const [keyId, encodedKey] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || typeof encodedKey !== 'string') {
      throw new Error('Credential encryption key IDs and values are invalid');
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new Error(`Credential encryption key "${keyId}" must be a canonical base64-encoded 32-byte key`);
    }
    keys.set(keyId, key);
  }
  if (!keys.has(activeKeyId)) throw new Error('METADRIVE_CREDENTIAL_ACTIVE_KEY_ID must identify a configured encryption key');
  return { activeKeyId, keys };
}

function credentialAad(tenantId: string, credentialId: string): Buffer {
  return Buffer.from(`metadrive:named-credential:v1:${tenantId}:${credentialId}`, 'utf8');
}

function sealCredentialPayload(tenantId: string, credentialId: string, payload: NamedCredentialPayload, ring = credentialKeyRing()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(credentialAad(tenantId, credentialId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    keyId: ring.activeKeyId,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function openCredentialPayload(tenantId: string, credential: StoredNamedCredential, ring = credentialKeyRing()): NamedCredentialPayload {
  const key = ring.keys.get(credential.keyId);
  if (!key) throw new Error(`Credential encryption key "${credential.keyId}" is unavailable; configure it before using or rotating Named Credentials.`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(credential.iv, 'base64'));
    decipher.setAAD(credentialAad(tenantId, credential.id));
    decipher.setAuthTag(Buffer.from(credential.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(credential.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    const payload: unknown = JSON.parse(plaintext);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid credential payload');
    return payload as NamedCredentialPayload;
  } catch {
    throw new Error(`Named Credential "${credential.name}" could not be decrypted; verify the encryption key configuration.`);
  }
}

function sealIntegrationCredentials(tenantId: string, connectionId: string, credentials: Record<string, string>, ring = credentialKeyRing()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(Buffer.from(`metadrive:integration-connection:v1:${tenantId}:${connectionId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return {
    credentialKeyId: ring.activeKeyId,
    credentialIv: iv.toString('base64'),
    credentialAuthTag: cipher.getAuthTag().toString('base64'),
    credentialsCiphertext: ciphertext.toString('base64')
  };
}

function openIntegrationCredentials(tenantId: string, connection: IntegrationConnection, ring = credentialKeyRing()): Record<string, string> {
  if (!connection.credentialKeyId || !connection.credentialIv || !connection.credentialAuthTag || !connection.credentialsCiphertext) return {};
  const key = ring.keys.get(connection.credentialKeyId);
  if (!key) throw new Error(`Credential encryption key "${connection.credentialKeyId}" is unavailable; configure it before using this Integration Connection.`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(connection.credentialIv, 'base64'));
    decipher.setAAD(Buffer.from(`metadrive:integration-connection:v1:${tenantId}:${connection.id}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(connection.credentialAuthTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(connection.credentialsCiphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    const payload: unknown = JSON.parse(plaintext);
    const parsed = z.record(z.string()).safeParse(payload);
    if (!parsed.success) throw new Error('Invalid integration credential payload');
    return parsed.data;
  } catch {
    throw new Error(`Integration Connection "${connection.name}" could not be decrypted; verify the encryption key configuration.`);
  }
}

function publicIntegrationConnection(connection: IntegrationConnection, definition: ConnectorDefinition, credentials: Record<string, string>) {
  return {
    id: connection.id,
    connectorKey: connection.connectorKey,
    name: connection.name,
    configuration: connection.configuration,
    status: connection.status,
    hasCredentials: Object.keys(credentials).length > 0,
    credentialFields: definition.credentialsSchema.map((field) => ({
      name: field.name,
      label: field.label,
      secret: field.secret,
      required: field.required,
      configured: field.secret ? Boolean(credentials[field.name]) : Boolean(connection.configuration[field.name])
    })),
    testStatus: connection.testStatus,
    lastTestedAt: connection.lastTestedAt,
    lastTestMessage: connection.lastTestMessage,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

function publicNamedCredential(credential: StoredNamedCredential) {
  return {
    id: credential.id,
    name: credential.name,
    label: credential.label,
    protocol: credential.protocol,
    baseUrl: credential.baseUrl,
    authType: credential.authType,
    headerName: credential.headerName ?? '',
    hasSecret: credential.authType !== 'None',
    keyId: credential.keyId,
    updatedAt: credential.updatedAt
  };
}

async function createTenant(tenantId: string, name: string, adminName: string, email: string, password: string): Promise<LocalUser> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(tenantId)) throw new Error('Tenant ID must be 2–63 characters using letters, numbers, underscores, or hyphens');
  if (state.tenants[tenantId]) throw new Error('Tenant already exists');
  const normalizedEmail = email.trim().toLowerCase();
  const credentials = await hashPassword(password);
  if (state.users.some((user) => user.email.trim().toLowerCase() === normalizedEmail)) {
    throw new Error('Email is already registered. Each email can belong to only one tenant.');
  }
  if (state.tenants[tenantId]) throw new Error('Tenant already exists');
  const userId = randomUUID();
  const admin: LocalUser = {
    id: userId, tenantId, name: adminName, email: normalizedEmail,
    passwordSalt: credentials.salt, passwordHash: credentials.hash,
    role: 'System Administrator', permissionSetIds: ['system-administrator'],
    permissionSetGroupIds: [],
    disabled: false, createdAt: new Date().toISOString()
  };
  const nextState = {
    ...state,
    tenants: { ...state.tenants, [tenantId]: defaultTenantData(admin) },
    users: [...state.users, admin]
  };
  persistState(nextState);
  state = nextState;
  console.info(`Created tenant "${name}" (${tenantId}) with initial administrator ${admin.email}`);
  return admin;
}

async function bootstrapTenant(): Promise<void> {
  if (state.users.length) return;
  const tenantId = process.env.METADRIVE_BOOTSTRAP_TENANT_ID;
  const tenantName = process.env.METADRIVE_BOOTSTRAP_TENANT_NAME;
  const adminName = process.env.METADRIVE_BOOTSTRAP_ADMIN_NAME ?? 'Organization Administrator';
  const email = process.env.METADRIVE_BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.METADRIVE_BOOTSTRAP_ADMIN_PASSWORD;
  if (!tenantId && !tenantName && !email && !password) return;
  if (!tenantId || !tenantName || !email || !password) {
    throw new Error('Set METADRIVE_BOOTSTRAP_TENANT_ID, METADRIVE_BOOTSTRAP_TENANT_NAME, METADRIVE_BOOTSTRAP_ADMIN_EMAIL, and METADRIVE_BOOTSTRAP_ADMIN_PASSWORD together');
  }
  await createTenant(tenantId, tenantName, adminName, email, password);
}
await bootstrapTenant();

function tenantData(tenantId: string): TenantData | undefined {
  return state.tenants[tenantId];
}
function getPrincipal(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw new Error('Authenticated principal was not established');
  return principal;
}
function principalUser(principal: Principal): LocalUser | undefined {
  return state.users.find((user) => user.id === principal.userId && user.tenantId === principal.tenantId && !user.disabled);
}
function effectivePermissions(user: LocalUser, data: TenantData): string[] {
  const accessUser = data.accessControl.users.find((item) => item.id === user.id);
  const profile = data.accessControl.profiles.find((item) =>
    item.id === (accessUser?.profileId ?? profileIdForRole(user.role, data.accessControl.profiles)));
  const assigned = data.accessControl.permissionSets.filter((set) => user.permissionSetIds.includes(set.id));
  const permissions = new Set([...(profile?.systemPermissions ?? []), ...assigned.flatMap((set) => set.systemPermissions)]);
  for (const groupId of user.permissionSetGroupIds) {
    const group = data.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    if (!group) continue;
    const groupPermissions = new Set(data.accessControl.permissionSets
      .filter((set) => group.permissionSetIds.includes(set.id))
      .flatMap((set) => set.systemPermissions));
    for (const permission of group.mutedSystemPermissions) groupPermissions.delete(permission);
    for (const permission of groupPermissions) permissions.add(permission);
  }
  return [...permissions];
}
function principalForUser(user: LocalUser, tenant: TenantData): Principal {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roles: [user.role],
    permissions: effectivePermissions(user, tenant)
  };
}
function canSelectDashboardRunningUser(viewer: Principal, tenant: TenantData, targetUserId: string): boolean {
  if (targetUserId === viewer.userId
    || viewer.permissions.includes('dashboards:manage')) return true;
  if (viewer.permissions.includes('data:viewAll')) return true;
  if (!viewer.permissions.includes('dashboards:viewTeam')) return false;
  const viewerMetadata = tenant.accessControl.users.find((item) => item.id === viewer.userId);
  const targetMetadata = tenant.accessControl.users.find((item) => item.id === targetUserId);
  const viewerRoleId = viewerMetadata?.roleId ?? roleIdForName(viewerMetadata?.role ?? '', tenant.accessControl.roles);
  const targetRoleId = targetMetadata?.roleId ?? roleIdForName(targetMetadata?.role ?? '', tenant.accessControl.roles);
  return Boolean(viewerRoleId && targetRoleId
    && targetRoleId !== viewerRoleId
    && roleIsAtOrBelow(targetRoleId, viewerRoleId, tenant.accessControl.roles));
}
function dashboardRunningUserChoices(viewer: Principal, tenant: TenantData): string[] {
  return state.users
    .filter((user) => user.tenantId === viewer.tenantId && !user.disabled
      && canSelectDashboardRunningUser(viewer, tenant, user.id))
    .map((user) => user.id);
}
function dashboardRunningPrincipal(
  viewer: Principal,
  tenant: TenantData,
  dashboard: DashboardMetadata,
  selectedRunningUserId?: string
): Principal | undefined {
  if (dashboard.allowViewerToSelectRunningUser) {
    if (!selectedRunningUserId || selectedRunningUserId === viewer.userId) return viewer;
    if (!canSelectDashboardRunningUser(viewer, tenant, selectedRunningUserId)) return undefined;
    const selectedUser = state.users.find((item) =>
      item.id === selectedRunningUserId && item.tenantId === viewer.tenantId && !item.disabled);
    return selectedUser ? principalForUser(selectedUser, tenant) : undefined;
  }
  if (selectedRunningUserId && selectedRunningUserId !== dashboard.runningUserId) return undefined;
  if (!dashboard.runningUserId) return viewer;
  const user = state.users.find((item) =>
    item.id === dashboard.runningUserId && item.tenantId === viewer.tenantId && !item.disabled);
  return user ? principalForUser(user, tenant) : undefined;
}
function dashboardRunningUserSelectionError(
  viewer: Principal,
  tenant: TenantData,
  dashboard: DashboardMetadata,
  selectedRunningUserId?: string
): string | undefined {
  if (!selectedRunningUserId) return undefined;
  if (!dashboard.allowViewerToSelectRunningUser) {
    return selectedRunningUserId === dashboard.runningUserId
      ? undefined
      : 'This dashboard does not allow choosing a running user';
  }
  if (!canSelectDashboardRunningUser(viewer, tenant, selectedRunningUserId)) {
    return 'You do not have permission to choose this running user';
  }
  const selectedUser = state.users.find((item) =>
    item.id === selectedRunningUserId && item.tenantId === viewer.tenantId && !item.disabled);
  if (!selectedUser) return 'The selected running user must be active and belong to this tenant';
  return undefined;
}
function folderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  return folderAccessLevelFromFolders(tenant, tenant.dashboardFolders ?? [], folderId, userId);
}
function folderAccessLevelFromFolders(
  tenant: TenantData,
  folders: readonly DashboardFolder[],
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  const accessUser = tenant.accessControl.users.find((user) => user.id === userId);
  const roleId = accessUser?.roleId
    ?? tenant.accessControl.roles.find((role) => role.name === accessUser?.role)?.id;
  return dashboardFolderAccessLevel(folderId, folders, {
    userId,
    roleId,
    permissionSetGroupIds: accessUser?.permissionSetGroupIds ?? [],
    roles: tenant.accessControl.roles,
    publicGroups: tenant.accessControl.publicGroups,
    territories: tenant.dashboardTerritories ?? []
  });
}
function reportFolderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  const folder = tenant.reportFolders.find((item) => item.id === folderId);
  if (!folder) return null;
  const inheritedPublic = (() => {
    let current: ReportFolder | undefined = folder;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.visibility === 'All Users') return true;
      visited.add(current.id);
      current = current.parentFolderId
        ? tenant.reportFolders.find((item) => item.id === current!.parentFolderId)
        : undefined;
    }
    return false;
  })();
  const shared = folderAccessLevelFromFolders(tenant, tenant.reportFolders, folderId, userId);
  return inheritedPublic && (!shared || shared === 'Viewer') ? 'Viewer' : shared;
}
function reportFolderForUser(
  tenant: TenantData,
  folder: ReportFolder,
  userId: string,
  canManageAll: boolean
): ReportFolder & { accessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...folder,
    accessLevel: canManageAll
      ? 'Manager'
      : reportFolderAccessLevelForUser(tenant, folder.id, userId)
  };
}
function validateReportFolderReferences(
  tenant: TenantData,
  shares: ReportFolder['shares']
): string | null {
  return validateDashboardFolderReferences(tenant, shares);
}
function folderForUser(
  tenant: TenantData,
  folder: DashboardFolder,
  userId: string,
  canManageAll = false
): DashboardFolder & { accessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...folder,
    accessLevel: canManageAll ? 'Manager' : folderAccessLevelForUser(tenant, folder.id, userId)
  };
}
function dashboardForUser(
  tenant: TenantData,
  dashboard: DashboardMetadata,
  userId: string
): DashboardMetadata & { folderAccessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...dashboard,
    folderAccessLevel: folderAccessLevelForUser(tenant, dashboard.folderId, userId)
  };
}
function validateDashboardFolderReferences(
  tenant: TenantData,
  shares: DashboardFolder['shares']
): string | null {
  for (const share of shares) {
    const exists = share.targetType === 'User'
      ? tenant.accessControl.users.some((user) => user.id === share.targetId)
      : share.targetType === 'PublicGroup'
        ? tenant.accessControl.publicGroups.some((group) => group.id === share.targetId)
        : share.targetType === 'PermissionSetGroup'
          ? tenant.accessControl.permissionSetGroups.some((group) => group.id === share.targetId)
          : share.targetType === 'Territory'
            ? tenant.dashboardTerritories.some((territory) => territory.id === share.targetId)
            : tenant.accessControl.roles.some((role) => role.id === share.targetId);
    if (!exists) return `Folder share references unknown ${share.targetType} "${share.targetId}"`;
  }
  return null;
}
function requirePermission(permission: string) {
  return requireAnyPermission(permission);
}
function requireAnyPermission(...permissions: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = getPrincipal(res);
    const data = tenantData(principal.tenantId);
    const user = principalUser(principal);
    if (!data || !user) return res.status(403).json({ error: 'Tenant membership is no longer active' });
    const effective = effectivePermissions(user, data);
    if (!permissions.some((permission) => effective.includes(permission))) {
      return res.status(403).json({ error: `Missing required permission: ${permissions.join(' or ')}` });
    }
    next();
  };
}

function bearerToken(req: Request): string | undefined {
  const authorization = req.header('authorization');
  if (!authorization) return undefined;
  const [scheme, token, ...extra] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && extra.length === 0 ? token : undefined;
}
function accessAuthentication(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Bearer access token required' });
    return;
  }
  void jwtService.verify(token).then((claims) => {
    const tokenId = claims.jti;
    const tenantId = claims.tenant_id;
    const userId = claims.sub;
    if (!tokenId || !tenantId || !userId) {
      res.status(401).json({ error: 'Access token is missing identity claims' });
      return;
    }
    const revokedUntil = state.revokedAccessTokens[tokenId];
    if (revokedUntil && revokedUntil > Date.now() / 1000) {
      res.status(401).json({ error: 'Access token has been revoked' });
      return;
    }
    const user = state.users.find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
    if (!user || !state.tenants[tenantId]) {
      res.status(401).json({ error: 'Tenant membership is no longer active' });
      return;
    }
    res.locals.principal = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: claims.roles,
      permissions: effectivePermissions(user, state.tenants[tenantId])
    } satisfies Principal;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Access token is invalid or expired' });
  });
}

function cookieValue(req: Request, name: string): string | undefined {
  const header = req.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
function setRefreshCookie(res: Response, token: string): void {
  const age = jwtService.config.refreshTokenTtlSeconds;
  res.setHeader('Set-Cookie', `${refreshCookieName}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=${isProduction ? 'None' : 'Lax'}; Max-Age=${age}${isProduction ? '; Secure' : ''}`);
}
function clearRefreshCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${refreshCookieName}=; Path=/api/auth; HttpOnly; SameSite=${isProduction ? 'None' : 'Lax'}; Max-Age=0${isProduction ? '; Secure' : ''}`);
}
function issueRefreshSession(user: LocalUser, previousFamilyId?: string): { token: string; session: RefreshSession } {
  const token = createRefreshToken();
  return {
    token,
    session: {
      tokenHash: hashToken(token), familyId: previousFamilyId ?? randomUUID(),
      userId: user.id, tenantId: user.tenantId,
      expiresAt: Date.now() / 1000 + jwtService.config.refreshTokenTtlSeconds,
      usedAt: null, revokedAt: null
    }
  };
}
async function issueLoginResponse(res: Response, user: LocalUser, data: TenantData, familyId?: string): Promise<void> {
  const permissions = effectivePermissions(user, data);
  const issued = await jwtService.issue({
    userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions
  });
  const refresh = issueRefreshSession(user, familyId);
  const nextState = {
    ...state,
    refreshSessions: [...state.refreshSessions, refresh.session],
    revokedAccessTokens: Object.fromEntries(Object.entries(state.revokedAccessTokens).filter(([, expiry]) => expiry > Date.now() / 1000))
  };
  persistState(nextState);
  state = nextState;
  setRefreshCookie(res, refresh.token);
  res.json({
    access_token: issued.accessToken,
    token_type: 'Bearer',
    expires_in: jwtService.config.accessTokenTtlSeconds,
    expires_at: issued.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions }
  });
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
});
const provisioningSchema = z.object({
  tenantId: z.string().min(2).max(63),
  tenantName: z.string().min(1).max(120),
  adminName: z.string().min(1).max(120),
  email: z.string().email().max(254),
  password: z.string().min(12).max(256)
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'metadrive-api', authMode: jwtService.config.mode }));
app.get('/.well-known/openid-configuration', (_req, res) => res.json(jwtService.discovery()));
app.get('/.well-known/jwks.json', (_req, res) => { void jwtService.jwks().then((body) => res.json(body)); });
app.get('/jwks.json', (_req, res) => { void jwtService.jwks().then((body) => res.json(body)); });
app.get('/api/auth/config', (_req, res) => res.json({
  mode: jwtService.config.mode,
  issuer: jwtService.config.issuer,
  audience: jwtService.config.audience,
  tenantLoginRequired: false,
  tenantResolvedFromEmail: true
}));

app.post('/api/auth/provision-tenant', async (req: Request, res: Response) => {
  const expected = process.env.METADRIVE_PROVISIONING_KEY;
  const provided = req.header('x-provisioning-key');
  if (!expected) return res.status(503).json({ error: 'Tenant provisioning is disabled until METADRIVE_PROVISIONING_KEY is configured' });
  if (!provided || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid provisioning credential' });
  }
  const parsed = provisioningSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant provisioning request', details: parsed.error.flatten() });
  try {
    const user = await createTenant(parsed.data.tenantId, parsed.data.tenantName, parsed.data.adminName, parsed.data.email, parsed.data.password);
    return res.status(201).json({ tenantId: user.tenantId, administrator: { id: user.id, email: user.email } });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : 'Unable to create tenant' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(501).json({ error: 'Password login is disabled in external OIDC mode' });
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid login request', details: parsed.error.flatten() });
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const limit = loginAttempts.get(key);
  if (limit && limit.resetAt > now && limit.count >= 8) return res.status(429).json({ error: 'Too many login attempts; try again later' });
  const user = state.users.find((item) => item.email.trim().toLowerCase() === parsed.data.email.toLowerCase());
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash) : false;
  if (!user || user.disabled || !valid) {
    const attempts = limit && limit.resetAt > now ? limit.count + 1 : 1;
    loginAttempts.set(key, { count: attempts, resetAt: now + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  loginAttempts.delete(key);
  const data = tenantData(user.tenantId);
  if (!data) return res.status(401).json({ error: 'Tenant is unavailable' });
  return issueLoginResponse(res, user, data);
});

app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(501).json({ error: 'Refresh tokens are managed by the external identity provider' });
  const rawToken = cookieValue(req, refreshCookieName);
  if (!rawToken) return res.status(401).json({ error: 'Refresh token required' });
  const tokenHash = hashToken(rawToken);
  const session = state.refreshSessions.find((item) => item.tokenHash === tokenHash);
  if (!session) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token is invalid or expired' });
  }
  if (session.usedAt !== null || session.revokedAt !== null) {
    // Grace window: the frontend fires ~13 parallel metadata requests on load and
    // multiple tabs may refresh concurrently. The first refresh rotates the cookie,
    // but in-flight siblings still carry the just-used token. Treat reuse within a
    // few seconds as a race (not theft): re-issue from the family's latest live
    // session instead of revoking the whole family.
    const now = Date.now() / 1000;
    const graceSeconds = 15;
    if (session.usedAt !== null && now - session.usedAt < graceSeconds) {
      const latest = state.refreshSessions
        .filter((item) => item.familyId === session.familyId && item.revokedAt === null && item.usedAt === null && item.expiresAt > now)
        .sort((a, b) => b.expiresAt - a.expiresAt)[0];
      const user = state.users.find((item) => item.id === session.userId && item.tenantId === session.tenantId && !item.disabled);
      const data = tenantData(session.tenantId);
      if (latest && user && data) {
        // Race, not theft: issue a fresh access token WITHOUT rotating.
        // We only store hashes so we can't re-set the cookie to the latest raw
        // token — but the racing tab still holds a cookie within grace, and it
        // converges on the next refresh. State is left untouched.
        const permissions = effectivePermissions(user, data);
        const issued = await jwtService.issue({ userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions });
        return res.json({
          access_token: issued.accessToken, token_type: 'Bearer',
          expires_in: jwtService.config.accessTokenTtlSeconds, expires_at: issued.expiresAt,
          user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions }
        });
      }
    }
    const revokedNow = Date.now() / 1000;
    const nextState = {
      ...state,
      refreshSessions: state.refreshSessions.map((item) => item.familyId === session.familyId ? { ...item, revokedAt: revokedNow } : item)
    };
    persistState(nextState);
    state = nextState;
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token reuse detected; token family revoked' });
  }
  if (session.expiresAt <= Date.now() / 1000) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token is expired' });
  }
  const user = state.users.find((item) => item.id === session.userId && item.tenantId === session.tenantId && !item.disabled);
  const data = tenantData(session.tenantId);
  if (!user || !data) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Tenant membership is no longer active' });
  }
  const now = Date.now() / 1000;
  const nextRefresh = issueRefreshSession(user, session.familyId);
  const nextState = {
    ...state,
    refreshSessions: [...state.refreshSessions.map((item) => item.tokenHash === tokenHash ? { ...item, usedAt: now } : item), nextRefresh.session]
  };
  persistState(nextState);
  state = nextState;
  const permissions = effectivePermissions(user, data);
  const issued = await jwtService.issue({ userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions });
  setRefreshCookie(res, nextRefresh.token);
  return res.json({
    access_token: issued.accessToken, token_type: 'Bearer',
    expires_in: jwtService.config.accessTokenTtlSeconds, expires_at: issued.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions }
  });
});

app.post('/api/auth/logout', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const token = bearerToken(req)!;
  void jwtService.verify(token).then((claims) => {
    const revokedAccessTokens = { ...state.revokedAccessTokens };
    if (claims.jti && claims.exp) revokedAccessTokens[claims.jti] = claims.exp;
    const refreshToken = cookieValue(req, refreshCookieName);
    const refreshHash = refreshToken ? hashToken(refreshToken) : '';
    const refreshSessions = state.refreshSessions.map((session) =>
      session.tokenHash === refreshHash && session.userId === principal.userId && session.tenantId === principal.tenantId
        ? { ...session, revokedAt: Date.now() / 1000 }
        : session
    );
    const nextState = { ...state, revokedAccessTokens, refreshSessions };
    persistState(nextState);
    state = nextState;
    clearRefreshCookie(res);
    return res.status(204).end();
  }).catch(() => res.status(401).json({ error: 'Access token is invalid or expired' }));
});

app.get('/api/auth/me', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'User is not active' });
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(401).json({ error: 'Tenant is unavailable' });
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profileId = accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles);
  const fieldAccess = Object.fromEntries(tenant.objects.flatMap((object) => object.fields.map((field) => [
    `${object.apiName}.${field.apiName}`,
    {
      read: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'read'),
      edit: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'edit')
    }
  ])));
  const recordTypeAccess = Object.fromEntries(tenant.objects.flatMap((object) => (object.recordTypes ?? [])
    .filter((recordType) => recordType.active)
    .map((recordType) => [`${object.apiName}.${recordType.id}`, hasRecordTypeAccessForUser(user.id, tenant, object.apiName, recordType.id)])));
  return res.json({ user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, profileId, permissions: effectivePermissions(user, tenant), fieldAccess, recordTypeAccess } });
});

app.get('/api/notifications', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const notifications = tenant.notifications
    .filter((notification) => notification.recipientId === principal.userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return res.json({ notifications, unreadCount: notifications.filter((notification) => !notification.readAt).length });
});

app.post('/api/notifications/:id/read', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const notification = tenant.notifications.find((item) =>
    item.id === routeParam(req, 'id') && item.recipientId === principal.userId);
  if (!notification) return res.status(404).json({ error: 'Notification was not found' });
  const updated = { ...notification, readAt: notification.readAt ?? new Date().toISOString() };
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    notifications: tenant.notifications.map((item) => item.id === updated.id ? updated : item)
  });
  return res.json({ notification: updated });
});

app.get('/api/approvals/inbox', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const canManage = principal.permissions.includes('approvals:manage');
  const requests = tenant.approvalRequests
    .filter((item) => item.status === 'Pending' && (item.approverId === principal.userId || canManage))
    .filter((item) => {
      const object = tenant.objects.find((candidate) => candidate.apiName === item.objectApiName);
      const record = tenant.records[item.objectApiName]?.find((candidate) => candidate.Id === item.recordId);
      return Boolean(object && record && hasRecordAccess(principal, tenant, item.objectApiName, record, 'Read'));
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item) => {
      const object = tenant.objects.find((candidate) => candidate.apiName === item.objectApiName)!;
      const record = tenant.records[item.objectApiName]!.find((candidate) => candidate.Id === item.recordId)!;
      return {
        ...item,
        objectLabel: object.label,
        recordName: object.fields.some((field) => field.apiName === 'Name'
          && hasFieldPermission(principal, tenant, item.objectApiName, field.apiName, 'read'))
          ? String(record.Name ?? item.recordId)
          : item.recordId
      };
    });
  return res.json({ requests });
});

app.post('/api/approvals/:id/decision', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const parsed = approvalDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid approval decision', details: parsed.error.flatten() });
  const requestId = routeParam(req, 'id');
  const request = tenant.approvalRequests.find((item) =>
    item.id === requestId && item.status === 'Pending'
    && (item.approverId === principal.userId || principal.permissions.includes('approvals:manage')));
  if (!request) return res.status(404).json({ error: 'Pending approval request was not found' });
  const record = tenant.records[request.objectApiName]?.find((candidate) => candidate.Id === request.recordId);
  if (!record || !hasRecordAccess(principal, tenant, request.objectApiName, record, 'Read')) {
    return res.status(404).json({ error: 'Pending approval request was not found' });
  }
  const now = new Date().toISOString();
  const decided = {
    ...request,
    status: parsed.data.decision,
    decisionComments: parsed.data.comments,
    decidedAt: now,
    decidedBy: principal.userId
  };
  const requests = tenant.approvalRequests.map((item) => item.groupId !== request.groupId || item.status !== 'Pending'
    ? item
    : item.id === request.id
      ? decided
      : { ...item, status: 'Canceled' as const, decisionComments: 'Resolved by another approver.', decidedAt: now, decidedBy: principal.userId });
  const submitter = state.users.find((user) => user.id === request.submittedBy && user.tenantId === principal.tenantId && !user.disabled);
  const notifications = submitter ? [...tenant.notifications, customNotificationSchema.parse({
    id: randomUUID(),
    recipientId: submitter.id,
    title: `Approval ${parsed.data.decision.toLowerCase()}`,
    body: `${request.objectApiName} ${request.recordId} was ${parsed.data.decision.toLowerCase()} by ${state.users.find((user) => user.id === principal.userId)?.name ?? 'an approver'}.`,
    flowApiName: request.flowApiName,
    sentBy: principal.userId,
    createdAt: now,
    readAt: null
  })] : tenant.notifications;
  persistTenantRecords(principal.tenantId, { ...tenant, approvalRequests: requests, notifications });
  return res.json({ request: decided });
});

app.use('/api/metadata', accessAuthentication);
app.use('/api/connector-settings', accessAuthentication);
app.use('/api/connector-providers', accessAuthentication);
app.use('/api/integration-connections', accessAuthentication);
app.use('/api/named-credentials', accessAuthentication);
app.use('/api/component-library', accessAuthentication);

app.get('/api/metadata/objects', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ objects: tenantData(getPrincipal(res).tenantId)?.objects ?? [] });
});
app.get('/api/metadata/platform-events', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ platformEvents: tenantData(getPrincipal(res).tenantId)?.platformEvents ?? [] });
});
app.put('/api/metadata/platform-events/:apiName', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const parsed = platformEventSchema.safeParse({ ...req.body, apiName: routeParam(req, 'apiName') });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid platform event metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const existing = tenant.platformEvents.find((event) => event.apiName === parsed.data.apiName);
  const duplicate = tenant.platformEvents.find((event) =>
    event.apiName.toLowerCase() === parsed.data.apiName.toLowerCase() && event.apiName !== parsed.data.apiName);
  if (duplicate) return res.status(409).json({ error: 'Platform event API name already exists' });
  if (existing && tenant.flows.some((flow) => flow.status === 'Active'
    && flow.flowType === 'Platform Event-Triggered Flow' && flow.triggerObject === existing.apiName)) {
    const changedFields = JSON.stringify(existing.fields) !== JSON.stringify(parsed.data.fields);
    if (changedFields) return res.status(409).json({ error: 'Platform event fields cannot change while an active triggered flow subscribes to this event' });
  }
  const updated = {
    ...tenant,
    platformEvents: existing
      ? tenant.platformEvents.map((event) => event.apiName === existing.apiName ? parsed.data : event)
      : [...tenant.platformEvents, parsed.data]
  };
  persistTenantRecords(principal.tenantId, updated);
  return res.status(existing ? 200 : 201).json({ platformEvent: parsed.data });
});
app.delete('/api/metadata/platform-events/:apiName', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const event = tenant.platformEvents.find((candidate) => candidate.apiName === apiName);
  if (!event) return res.status(404).json({ error: 'Platform event was not found' });
  const references = tenant.flows.filter((flow) => flow.triggerObject === apiName
    || flow.elements.some((element) => element.type === 'Publish Platform Event' && element.config.eventApiName === apiName));
  if (references.length) return res.status(409).json({
    error: `Platform event is referenced by flows: ${references.map((flow) => flow.label).join(', ')}`
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    platformEvents: tenant.platformEvents.filter((candidate) => candidate.apiName !== apiName),
    platformEventMessages: tenant.platformEventMessages.filter((message) => message.eventApiName !== apiName)
  });
  return res.status(204).end();
});
app.get('/api/metadata/objects/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const object = tenantData(getPrincipal(res).tenantId)?.objects.find((item) => item.apiName === req.params.apiName);
  if (!object) return res.status(404).json({ error: `Object "${req.params.apiName}" was not found` });
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
  const invalidProfileAssignment = object.pageLayoutAssignments?.find((assignment) =>
    assignment.profileId !== '*' && !tenant.accessControl.profiles.some((profile) => profile.id === assignment.profileId));
  if (invalidProfileAssignment) return res.status(400).json({ error: `Page layout assignment references unknown profile "${invalidProfileAssignment.profileId}"` });
  const invalidCompactProfileAssignment = object.compactLayoutAssignments?.find((assignment) =>
    assignment.profileId !== '*' && !tenant.accessControl.profiles.some((profile) => profile.id === assignment.profileId));
  if (invalidCompactProfileAssignment) return res.status(400).json({ error: `Compact layout assignment references unknown profile "${invalidCompactProfileAssignment.profileId}"` });
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
        profile.id === 'system-administrator'
          ? {
            ...profile,
            objectPermissions: { ...profile.objectPermissions, [object.apiName]: { ...fullObjectPermissions } },
            fieldPermissions: { ...profile.fieldPermissions, ...Object.fromEntries(object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])) }
          }
          : profile),
      permissionSets: tenant.accessControl.permissionSets.map((permissionSet) =>
        permissionSet.id === 'system-administrator'
          ? {
            ...permissionSet,
            objectPermissions: { ...permissionSet.objectPermissions, [object.apiName]: { ...fullObjectPermissions } },
            fieldPermissions: { ...permissionSet.fieldPermissions, ...Object.fromEntries(object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])) }
          }
          : permissionSet)
    }
  };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updated } };
  persistState(nextState);
  state = nextState;
  return res.status(201).json({ object });
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
  const invalidProfileAssignment = object.pageLayoutAssignments?.find((assignment) =>
    assignment.profileId !== '*' && !tenant.accessControl.profiles.some((profile) => profile.id === assignment.profileId));
  if (invalidProfileAssignment) return res.status(400).json({ error: `Page layout assignment references unknown profile "${invalidProfileAssignment.profileId}"` });
  const invalidCompactProfileAssignment = object.compactLayoutAssignments?.find((assignment) =>
    assignment.profileId !== '*' && !tenant.accessControl.profiles.some((profile) => profile.id === assignment.profileId));
  if (invalidCompactProfileAssignment) return res.status(400).json({ error: `Compact layout assignment references unknown profile "${invalidCompactProfileAssignment.profileId}"` });
  const relationshipError = validateObjectRelationships(object, tenant.objects);
  if (relationshipError) return res.status(400).json({ error: relationshipError });
  const candidateObjects = tenant.objects.map((item) => item.apiName === object.apiName ? object : item);
  const lookupFilterError = validateRelatedLookupFilters(object, candidateObjects);
  if (lookupFilterError) return res.status(400).json({ error: lookupFilterError });
  const incompatiblePage = tenant.pages.find((page) => page.targetObject === object.apiName && page.components.some((component) =>
    (component.type === 'Activities' && !object.settings?.allowActivities)
    || (component.type === 'Chatter' && !object.settings?.allowInChatter)
    || (component.type === 'Report Chart' && !object.settings?.allowReports)));
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
    .map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }]));
  const updated = {
    ...tenant,
    objects: tenant.objects.map((item) => item.apiName === object.apiName ? object : item),
    accessControl: {
      ...tenant.accessControl,
      permissionSets: tenant.accessControl.permissionSets.map((set) => set.id === 'system-administrator'
        ? { ...set, fieldPermissions: { ...set.fieldPermissions, ...addedFieldPermissions } }
        : set)
    }
  };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updated } };
  persistState(nextState);
  state = nextState;
  return res.json({ object });
});
app.delete('/api/metadata/objects/:apiName', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const object = tenant.objects.find((item) => item.apiName === apiName);
  if (!object) return res.status(404).json({ error: `Object "${apiName}" was not found` });
  if (object.kind !== 'Custom Object') return res.status(403).json({ error: 'Standard objects cannot be deleted' });
  if ((tenant.records[apiName] ?? []).length) return res.status(409).json({ error: 'Delete or export this object’s records before deleting the object' });
  const dependencies = findObjectDependencies(tenant, apiName);
  if (dependencies.length) return res.status(409).json({
    error: `Object "${apiName}" is still referenced by ${dependencies.join('; ')}`,
    dependencies
  });
  const updatedTenant: TenantData = {
    ...tenant,
    objects: tenant.objects.filter((item) => item.apiName !== apiName),
    records: Object.fromEntries(Object.entries(tenant.records).filter(([name]) => name !== apiName)),
    fieldHistory: tenant.fieldHistory.filter((entry) => entry.objectApiName !== apiName),
    activities: tenant.activities.filter((activity) => activity.objectApiName !== apiName),
    chatterPosts: tenant.chatterPosts.filter((post) => post.objectApiName !== apiName),
    approvalRequests: tenant.approvalRequests.filter((request) => request.objectApiName !== apiName),
    sharingSettings: Object.fromEntries(Object.entries(tenant.sharingSettings).filter(([name]) => name !== apiName)),
    recordShares: tenant.recordShares.filter((share) => share.objectApiName !== apiName),
    accessControl: {
      ...tenant.accessControl,
      profiles: tenant.accessControl.profiles.map((profile) => ({
        ...profile,
        objectPermissions: Object.fromEntries(Object.entries(profile.objectPermissions).filter(([name]) => name !== apiName)),
        fieldPermissions: Object.fromEntries(Object.entries(profile.fieldPermissions).filter(([name]) => !name.startsWith(`${apiName}.`)))
      })),
      permissionSets: tenant.accessControl.permissionSets.map((permissionSet) => {
        return {
          ...permissionSet,
          objectPermissions: Object.fromEntries(Object.entries(permissionSet.objectPermissions).filter(([name]) => name !== apiName)),
          fieldPermissions: Object.fromEntries(Object.entries(permissionSet.fieldPermissions).filter(([name]) => !name.startsWith(`${apiName}.`)))
        };
      }),
      permissionSetGroups: tenant.accessControl.permissionSetGroups.map((group) => ({
        ...group,
        mutedObjectPermissions: Object.fromEntries(Object.entries(group.mutedObjectPermissions).filter(([name]) => name !== apiName)),
        mutedFieldPermissions: Object.fromEntries(Object.entries(group.mutedFieldPermissions).filter(([name]) => !name.startsWith(`${apiName}.`)))
      }))
    }
  };
  persistTenantRecords(principal.tenantId, updatedTenant);
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
      resolvePriorField: resolveField
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
app.post('/api/metadata/objects/:apiName/fields', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
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
      permissionSets: tenant.accessControl.permissionSets.map((set) => set.id === 'system-administrator'
        ? { ...set, fieldPermissions: { ...set.fieldPermissions, [fieldKey]: { read: true, edit: true } } }
        : set)
    }
  };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.status(201).json({ object: updatedObject, field });
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
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({ object: updatedObject, field: parsed.data });
});
app.delete('/api/metadata/objects/:apiName/fields/:fieldApiName', requireAnyPermission('metadata:write', 'objects:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const fieldApiName = routeParam(req, 'fieldApiName');
  const object = tenant.objects.find((item) => item.apiName === apiName);
  if (!object) return res.status(404).json({ error: `Object "${apiName}" was not found` });
  const field = object.fields.find((item) => item.apiName === fieldApiName);
  if (!field) return res.status(404).json({ error: `Field "${fieldApiName}" was not found` });
  if (!fieldApiName.endsWith('__c')) return res.status(403).json({ error: 'Standard fields cannot be deleted' });
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
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.json({ object: updatedObject });
});
app.get('/api/metadata/approval-processes', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId);
  return res.json({ approvalProcesses: tenant?.approvalProcesses ?? [] });
});
app.put('/api/metadata/approval-processes/:apiName', requireAnyPermission('metadata:write', 'security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const parsed = approvalProcessRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid approval process', details: parsed.error.flatten() });
  if (parsed.data.apiName !== apiName) return res.status(400).json({ error: 'Approval process API name must match the requested resource' });
  const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
  if (!object) return res.status(400).json({ error: `Approval process object "${parsed.data.objectApiName}" does not exist` });
  const inactiveApprover = parsed.data.approverUserIds.find((userId) =>
    !state.users.some((user) => user.id === userId && user.tenantId === principal.tenantId && !user.disabled));
  if (inactiveApprover) return res.status(400).json({ error: `Approval process approver "${inactiveApprover}" must be an active user in this tenant` });
  const existing = tenant.approvalProcesses.find((item) => item.apiName === apiName);
  const activeFlowReferences = existing
    ? tenant.flows
      .filter((flow) => flow.status === 'Active' && flow.elements.some((element) =>
        element.type === 'Action' && element.config.actionType === 'Submit for Approval'
        && element.config.approvalProcessApiName === apiName))
      .map((flow) => flow.label)
    : [];
  if (activeFlowReferences.length && !parsed.data.active) {
    return res.status(409).json({
      error: `Approval process cannot be deactivated while referenced by active flows: ${activeFlowReferences.join(', ')}`
    });
  }
  if (existing && existing.objectApiName !== parsed.data.objectApiName && activeFlowReferences.length) {
    return res.status(409).json({
      error: `Approval process object cannot change while referenced by active flows: ${activeFlowReferences.join(', ')}`
    });
  }
  const now = new Date().toISOString();
  const approvalProcess = approvalProcessSchema.parse({
    ...parsed.data,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    approvalProcesses: existing
      ? tenant.approvalProcesses.map((item) => item.apiName === apiName ? approvalProcess : item)
      : [...tenant.approvalProcesses, approvalProcess]
  });
  return res.json({ approvalProcess });
});
app.delete('/api/metadata/approval-processes/:apiName', requireAnyPermission('metadata:write', 'security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const approvalProcess = tenant.approvalProcesses.find((item) => item.apiName === apiName);
  if (!approvalProcess) return res.status(404).json({ error: `Approval process "${apiName}" was not found` });
  const flowReferences = tenant.flows
    .filter((flow) => flow.elements.some((element) =>
      element.type === 'Action' && element.config.actionType === 'Submit for Approval'
      && element.config.approvalProcessApiName === apiName))
    .map((flow) => flow.label);
  if (flowReferences.length) return res.status(409).json({ error: `Approval process is referenced by flows: ${flowReferences.join(', ')}` });
  if (tenant.approvalRequests.some((item) => item.flowApiName && item.status === 'Pending'
    && item.processApiName === apiName)) {
    return res.status(409).json({ error: 'Approval process has pending approval requests' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    approvalProcesses: tenant.approvalProcesses.filter((item) => item.apiName !== apiName)
  });
  return res.status(204).end();
});
app.get('/api/metadata/flows', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ flows: tenantData(getPrincipal(res).tenantId)?.flows ?? [] });
});
app.get('/api/metadata/flow-logs', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const logs = tenantData(getPrincipal(res).tenantId)?.flowLogs ?? [];
  res.json({ logs: [...logs].sort((left, right) => right.failedAt.localeCompare(left.failedAt)) });
});
app.get('/api/metadata/flow-interviews', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const usersById = new Map(state.users
    .filter((user) => user.tenantId === getPrincipal(res).tenantId)
    .map((user) => [user.id, user.name]));
  const interviews = tenant.interviews
    .map((interview) => {
      const flow = tenant.flows.find((candidate) =>
        candidate.apiName === interview.flowApiName && candidate.versionNumber === interview.versionNumber);
      const screen = flow?.elements.find((element) => element.id === interview.screenElementId);
      return {
        id: interview.id,
        flowApiName: interview.flowApiName,
        flowLabel: flow?.label ?? interview.flowApiName,
        versionNumber: interview.versionNumber,
        kind: interview.kind,
        userId: interview.userId,
        userName: usersById.get(interview.userId) ?? interview.userId,
        screenLabel: screen?.label ?? null,
        recordId: interview.record?.Id ?? null,
        createdAt: interview.createdAt,
        expiresAt: interview.expiresAt,
        waitUntil: interview.waitUntil,
        retryAt: interview.retryAt,
        attempts: interview.attempts
      };
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return res.json({ interviews });
});
app.delete('/api/metadata/flow-interviews/:interviewId', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
  const interviewId = routeParam(req, 'interviewId');
  if (!tenant.interviews.some((interview) => interview.id === interviewId)) {
    return res.status(404).json({ error: 'Pending Flow interview was not found' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    interviews: tenant.interviews.filter((interview) => interview.id !== interviewId)
  });
  return res.status(204).end();
});
app.get('/api/connector-providers', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  res.json({ providers: tenant.connectorDefinitions });
});
app.put('/api/connector-providers/:connectorKey', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = connectorDefinitionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid connector provider definition', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const connectorKey = routeParam(req, 'connectorKey');
  const current = tenant.connectorDefinitions.find((item) => item.connectorKey === connectorKey);
  if (!current) return res.status(404).json({ error: 'Connector provider definition was not found' });
  if (parsed.data.connectorKey !== connectorKey) return res.status(400).json({ error: 'Connector key cannot be changed' });
  const definitions = tenant.connectorDefinitions.map((item) => item.connectorKey === connectorKey ? parsed.data : item);
  const now = new Date().toISOString();
  const providerRecords = (tenant.records.ConnectorProvider__c ?? []).map((record) =>
    record.ConnectorKey__c === connectorKey ? stampRecordAuditFields({
      ...record,
      Name: parsed.data.name,
      AuthType__c: parsed.data.authType,
      BaseUrl__c: parsed.data.baseUrl,
      AuthCredential__c: parsed.data.authCredential ?? '',
      CredentialsSchema__c: JSON.stringify(parsed.data.credentialsSchema),
      Operations__c: JSON.stringify(parsed.data.operations),
      Test__c: parsed.data.test ? JSON.stringify(parsed.data.test) : '',
      TimeoutMs__c: parsed.data.timeoutMs,
      RetryPolicy__c: JSON.stringify(parsed.data.retryPolicy),
      Status__c: parsed.data.status,
      LastModifiedDate: now
    }, principal.userId, now, record) : record
  );
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    connectorDefinitions: definitions,
    records: { ...tenant.records, ConnectorProvider__c: providerRecords }
  });
  return res.json({ provider: parsed.data });
});
app.get('/api/integration-connections', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenantId = getPrincipal(res).tenantId;
  const tenant = tenantData(tenantId)!;
  const ring = tenant.integrationConnections.some((connection) => connection.credentialsCiphertext) ? credentialKeyRing() : undefined;
  const connections = tenant.integrationConnections.flatMap((connection) => {
    const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey);
    if (!definition) return [];
    return [publicIntegrationConnection(connection, definition, ring ? openIntegrationCredentials(tenantId, connection, ring) : {})];
  });
  res.json({ connections });
});
app.post('/api/integration-connections', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = integrationConnectionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Integration Connection', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === parsed.data.connectorKey && item.status === 'ACTIVE');
  if (!definition) return res.status(422).json({ error: 'Select an active connector provider definition' });
  const credentialNames = new Set(definition.credentialsSchema.filter((field) => field.secret).map((field) => field.name));
  const unknownCredential = Object.keys(parsed.data.credentials).find((name) => !credentialNames.has(name));
  if (unknownCredential) return res.status(400).json({ error: `Credential "${unknownCredential}" is not defined as a secret by this connector provider` });
  const plaintextSecret = Object.keys(parsed.data.configuration).find((name) => credentialNames.has(name));
  if (plaintextSecret) return res.status(400).json({ error: `Secret field "${plaintextSecret}" must be submitted as a credential so it can be encrypted` });
  const credentials = Object.fromEntries(Object.entries(parsed.data.credentials).filter(([, value]) => value.trim()));
  const id = randomUUID();
  const now = new Date().toISOString();
  const encrypted = Object.keys(credentials).length
    ? sealIntegrationCredentials(principal.tenantId, id, credentials)
    : { credentialKeyId: null, credentialIv: null, credentialAuthTag: null, credentialsCiphertext: null };
  const connection = integrationConnectionSchema.parse({
    id,
    connectorKey: parsed.data.connectorKey,
    name: parsed.data.name,
    configuration: parsed.data.configuration,
    ...encrypted,
    status: parsed.data.status,
    testStatus: null,
    lastTestedAt: null,
    lastTestMessage: null,
    createdAt: now,
    updatedAt: now
  });
  const records = [
    ...(tenant.records.IntegrationConnection__c ?? []),
    integrationConnectionRecord(connection, principal.userId)
  ];
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    integrationConnections: [...tenant.integrationConnections, connection],
    records: { ...tenant.records, IntegrationConnection__c: records }
  });
  return res.status(201).json({ connection: publicIntegrationConnection(connection, definition, credentials) });
});
app.put('/api/integration-connections/:id', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = integrationConnectionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Integration Connection', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const id = routeParam(req, 'id');
  const current = tenant.integrationConnections.find((item) => item.id === id);
  if (!current) return res.status(404).json({ error: 'Integration Connection was not found' });
  if (current.connectorKey !== parsed.data.connectorKey) return res.status(400).json({ error: 'An Integration Connection cannot change its provider' });
  const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === current.connectorKey);
  if (!definition) return res.status(422).json({ error: 'The connector provider definition is unavailable' });
  const credentialNames = new Set(definition.credentialsSchema.filter((field) => field.secret).map((field) => field.name));
  const unknownCredential = Object.keys(parsed.data.credentials).find((name) => !credentialNames.has(name));
  if (unknownCredential) return res.status(400).json({ error: `Credential "${unknownCredential}" is not defined as a secret by this connector provider` });
  const plaintextSecret = Object.keys(parsed.data.configuration).find((name) => credentialNames.has(name));
  if (plaintextSecret) return res.status(400).json({ error: `Secret field "${plaintextSecret}" must be submitted as a credential so it can be encrypted` });
  const existingCredentials = openIntegrationCredentials(principal.tenantId, current);
  const credentials = { ...existingCredentials, ...Object.fromEntries(Object.entries(parsed.data.credentials).filter(([, value]) => value.trim())) };
  const now = new Date().toISOString();
  const encrypted = Object.keys(credentials).length
    ? sealIntegrationCredentials(principal.tenantId, id, credentials)
    : { credentialKeyId: null, credentialIv: null, credentialAuthTag: null, credentialsCiphertext: null };
  const updated = integrationConnectionSchema.parse({
    ...current,
    name: parsed.data.name,
    configuration: parsed.data.configuration,
    ...encrypted,
    status: parsed.data.status,
    testStatus: null,
    lastTestedAt: null,
    lastTestMessage: null,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    integrationConnections: tenant.integrationConnections.map((item) => item.id === id ? updated : item),
    records: {
      ...tenant.records,
      IntegrationConnection__c: (tenant.records.IntegrationConnection__c ?? []).map((record) =>
        record.Id === id ? integrationConnectionRecord(updated, String(record.OwnerId ?? principal.userId)) : record)
    }
  });
  return res.json({ connection: publicIntegrationConnection(updated, definition, credentials) });
});
app.post('/api/integration-connections/:id/test', requireAnyPermission('metadata:write', 'namedCredentials:manage'), requirePermission('callouts:execute'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const connection = tenant.integrationConnections.find((item) => item.id === routeParam(req, 'id'));
  if (!connection) return res.status(404).json({ error: 'Integration Connection was not found' });
  const definition = tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey);
  if (!definition) return res.status(422).json({ error: 'The connector provider definition is unavailable' });

  let result: ConnectorTestResult;
  let credentials: Record<string, string> = {};
  if (connection.status !== 'ACTIVE' || definition.status !== 'ACTIVE') {
    result = { status: 'Failed', message: 'The Integration Connection and provider must both be active before testing.' };
  } else {
    try {
      credentials = openIntegrationCredentials(principal.tenantId, connection);
      result = await executeConnectorTest(definition, connection.configuration, credentials, async (url, method, headers, timeoutMs) =>
        new Promise((resolve, reject) => {
          let responseSize = 0;
          let timer: ReturnType<typeof setTimeout>;
          const request = httpsRequest(url, {
            method,
            headers,
            timeout: timeoutMs,
            maxHeaderSize: 16 * 1024,
            lookup: (hostname, options, callback) => {
              if (isReservedHostname(hostname)) {
                callback(new Error('Connector test host is reserved'), '', 0);
                return;
              }
              void lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
                if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address))) {
                  callback(new Error('Connector test DNS resolved to a private or reserved address'), '', 0);
                  return;
                }
                const selected = addresses[0];
                if (options && typeof options === 'object' && 'all' in options && options.all) callback(null, [selected]);
                else callback(null, selected.address, selected.family);
              }).catch(() => callback(new Error('Connector test host could not be resolved safely'), '', 0));
            }
          }, (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer | string) => {
              const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              responseSize += data.length;
              if (responseSize > 64 * 1024) {
                request.destroy(new Error('Connector test response exceeded the size limit'));
                return;
              }
              chunks.push(data);
            });
            incoming.on('end', () => {
              clearTimeout(timer);
              const text = Buffer.concat(chunks).toString('utf8');
              let body: unknown = text;
              if (text) {
                try { body = JSON.parse(text) as unknown; } catch { /* Keep non-JSON response content internal to validation. */ }
              }
              resolve({ status: incoming.statusCode ?? 0, body, headers: incoming.headers });
            });
            incoming.on('error', (error) => { clearTimeout(timer); reject(error); });
          });
          timer = setTimeout(() => request.destroy(Object.assign(new Error('Connector test timed out'), { code: 'ETIMEDOUT' })), timeoutMs);
          request.on('error', (error) => { clearTimeout(timer); reject(error); });
          request.end();
        })
      );
    } catch (error) {
      result = {
        status: 'Failed',
        message: error instanceof Error && error.message.includes('could not be decrypted')
          ? 'Saved credentials could not be decrypted; verify the credential encryption configuration.'
          : 'Connection test could not be completed; verify the saved credentials and configuration.'
      };
    }
  }

  const lastTestedAt = new Date().toISOString();
  const updated = integrationConnectionSchema.parse({
    ...connection,
    testStatus: result.status,
    lastTestedAt,
    lastTestMessage: result.message
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    integrationConnections: tenant.integrationConnections.map((item) => item.id === connection.id ? updated : item),
    records: {
      ...tenant.records,
      IntegrationConnection__c: (tenant.records.IntegrationConnection__c ?? []).map((record) =>
        record.Id === connection.id ? integrationConnectionRecord(updated, String(record.OwnerId ?? principal.userId)) : record)
    }
  });
  return res.json({ result: { ...result, lastTestedAt }, connection: publicIntegrationConnection(updated, definition, credentials) });
});
app.get('/api/connector-settings', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  const templates = new Map(tenant.connectorSettings.map((connector) => [connector.apiName, connector]));
  const connectorObject = tenant.objects.find((item) => item.apiName === 'UneConnector__c');
  const configurationField = connectorObject?.fields.find((field) => field.apiName === 'Configuration__c');
  const connectors = (tenant.records.UneConnector__c ?? []).map((record) => {
    const label = String(record.Name ?? 'Une Connector');
    const rawApiName = String(record.ConnectorType__c ?? label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''));
    const apiName = /^[A-Za-z][A-Za-z0-9_]*$/.test(rawApiName) ? rawApiName : 'UneConnector';
    let values: Record<string, string> = {};
    if (typeof record.Configuration__c === 'string' && record.Configuration__c) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(record.Configuration__c);
      } catch {
        throw new Error(`Configuration values for "${label}" must contain valid JSON.`);
      }
      const parsedValues = z.record(z.string()).safeParse(decoded);
      if (!parsedValues.success) throw new Error(`Configuration values for "${label}" must be a JSON object of string values.`);
      values = parsedValues.data;
    }
    const fieldsByName = new Map((templates.get(apiName)?.fields ?? []).map((field) => [field.apiName, field]));
    const fields = Object.entries(values).map(([fieldApiName, value]) => ({
      apiName: fieldApiName,
      label: fieldsByName.get(fieldApiName)?.label ?? fieldApiName.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
      value
    }));
    for (const field of templates.get(apiName)?.fields ?? []) {
      if (!fieldsByName.has(field.apiName) || !values[field.apiName]) {
        if (!fields.some((entry) => entry.apiName === field.apiName)) fields.push({ ...field, value: values[field.apiName] ?? '' });
      }
    }
    return connectorSettingsSchema.parse({ apiName, label, fields });
  });
  if (!configurationField) throw new Error('Une Connectors object is missing its Configuration Values field.');
  res.json({ connectors });
});
app.put('/api/connector-settings/:apiName', requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = connectorSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid connector settings', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existing = (tenant.records.UneConnector__c ?? []).find((record) => record.ConnectorType__c === apiName);
  if (!existing) return res.status(404).json({ error: 'Connector settings record was not found' });
  if (parsed.data.apiName !== apiName || parsed.data.label !== existing.Name) {
    return res.status(400).json({ error: 'Connector name and type cannot be changed in connector settings' });
  }
  const configuration = Object.fromEntries(parsed.data.fields.map((field) => [field.apiName, field.value]));
  const now = new Date().toISOString();
  const updatedRecord = stampRecordAuditFields({
    ...existing,
    Configuration__c: JSON.stringify(configuration),
    Status__c: parsed.data.fields.some((field) => field.value.trim()) ? 'Configured' : 'Not Configured',
    LastModifiedDate: now
  }, principal.userId, now, existing);
  const updatedTenant = {
    ...tenant,
    connectorSettings: tenant.connectorSettings.some((item) => item.apiName === apiName)
      ? tenant.connectorSettings.map((item) => item.apiName === apiName ? parsed.data : item)
      : [...tenant.connectorSettings, parsed.data],
    records: {
      ...tenant.records,
      UneConnector__c: tenant.records.UneConnector__c.map((record) => record.Id === existing.Id ? updatedRecord : record)
    }
  };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.json({ connector: parsed.data });
});
// Report credential readiness without exposing encryption keys or other tenants' data.
app.get('/api/named-credentials/readiness', (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  const user = principalUser(principal);
  if (!tenant || !user) return res.status(403).json({ error: 'Tenant membership is no longer active' });
  const canManage = effectivePermissions(user, tenant).includes('namedCredentials:manage');
  let encryptionReady = false;
  try {
    credentialKeyRing();
    encryptionReady = true;
  } catch {
    // Missing or invalid encryption configuration is reported without key material.
  }
  return res.json({ canManage, encryptionReady });
});
app.get('/api/named-credentials', requireAnyPermission('metadata:read', 'namedCredentials:manage'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  res.json({ credentials: tenant.namedCredentials.map(publicNamedCredential) });
});
app.post('/api/named-credentials', requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = namedCredentialRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Named Credential', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.namedCredentials.some((credential) => credential.name === parsed.data.name)) {
    return res.status(409).json({ error: `Named Credential "${parsed.data.name}" already exists` });
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  try {
    const authType = parsed.data.authType;
    const secret = parsed.data.secret;
    const username = parsed.data.username?.trim();
    if (authType !== 'None' && !secret) return res.status(400).json({ error: 'Provide a secret for this authentication type' });
    if (authType === 'Basic' && !username) return res.status(400).json({ error: 'Basic authentication requires a username' });
    const sealed = sealCredentialPayload(principal.tenantId, id, {
      ...(authType === 'Basic' && username ? { username } : {}),
      ...(authType !== 'None' && secret ? { secret } : {})
    });
    const credential = namedCredentialSchema.parse({
      id, name: parsed.data.name, label: parsed.data.label,
      protocol: parsed.data.protocol,
      baseUrl: parsed.data.baseUrl.endsWith('/') ? parsed.data.baseUrl : `${parsed.data.baseUrl}/`,
      authType, headerName: parsed.data.headerName?.trim() || undefined,
      ...sealed, createdAt: now, updatedAt: now
    });
    const updatedTenant = { ...tenant, namedCredentials: [...tenant.namedCredentials, credential] };
    persistTenantRecords(principal.tenantId, updatedTenant);
    return res.status(201).json({ credential: publicNamedCredential(credential) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create Named Credential' });
  }
});
app.put('/api/named-credentials/:id', requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
  const parsed = namedCredentialRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Named Credential', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const existing = tenant.namedCredentials.find((credential) => credential.id === routeParam(req, 'id'));
  if (!existing) return res.status(404).json({ error: 'Named Credential was not found' });
  if (tenant.dashboardSubscriptions.some((subscription) =>
    subscription.namedCredentialId === existing.id && parsed.data.protocol !== 'SMTP')) {
    return res.status(409).json({ error: 'Named Credential is used by a dashboard subscription and must remain SMTP' });
  }
  if (tenant.emailAlerts.some((alert) => alert.namedCredentialId === existing.id && parsed.data.protocol !== 'SMTP')) {
    return res.status(409).json({ error: 'Named Credential is used by an Email Alert and must remain SMTP' });
  }
  if (tenant.namedCredentials.some((credential) => credential.id !== existing.id && credential.name === parsed.data.name)) {
    return res.status(409).json({ error: `Named Credential "${parsed.data.name}" already exists` });
  }
  try {
    const sameAuthType = existing.authType === parsed.data.authType;
    const shouldPreserveSecret = parsed.data.authType !== 'None' && !parsed.data.secret && sameAuthType;
    if (parsed.data.authType !== 'None' && !parsed.data.secret && !shouldPreserveSecret) {
      return res.status(400).json({ error: 'Provide a new secret when changing the authentication type' });
    }
    if (parsed.data.authType !== 'None' && parsed.data.secret === '') {
      return res.status(400).json({ error: 'Secret cannot be empty' });
    }
    const payload = shouldPreserveSecret
      ? {
          ...openCredentialPayload(principal.tenantId, existing),
          ...(parsed.data.authType === 'Basic' && parsed.data.username?.trim() ? { username: parsed.data.username.trim() } : {})
        }
      : {
          ...(parsed.data.authType === 'Basic' && parsed.data.username?.trim() ? { username: parsed.data.username.trim() } : {}),
          ...(parsed.data.authType !== 'None' && parsed.data.secret ? { secret: parsed.data.secret } : {})
        };
    if (parsed.data.authType === 'Basic' && !payload.username) {
      return res.status(400).json({ error: 'Basic authentication requires a username and password' });
    }
    const now = new Date().toISOString();
    const sealed = sealCredentialPayload(principal.tenantId, existing.id, payload);
    const credential = namedCredentialSchema.parse({
      ...existing, name: parsed.data.name, label: parsed.data.label,
      protocol: parsed.data.protocol,
      baseUrl: parsed.data.baseUrl.endsWith('/') ? parsed.data.baseUrl : `${parsed.data.baseUrl}/`,
      authType: parsed.data.authType, headerName: parsed.data.headerName?.trim() || undefined,
      ...sealed, updatedAt: now
    });
    const updatedTenant = { ...tenant, namedCredentials: tenant.namedCredentials.map((item) => item.id === credential.id ? credential : item) };
    persistTenantRecords(principal.tenantId, updatedTenant);
    return res.json({ credential: publicNamedCredential(credential) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update Named Credential' });
  }
});
app.delete('/api/named-credentials/:id', requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const id = routeParam(req, 'id');
  const existing = tenant.namedCredentials.find((credential) => credential.id === id);
  if (!existing) return res.status(404).json({ error: 'Named Credential was not found' });
  const references = tenant.flows.flatMap((flow) => flow.elements
    .filter((element) => ['HTTP Callout', 'Action'].includes(element.type) && element.config.namedCredentialId === id)
    .map((element) => `${flow.label} / ${element.label}`));
  references.push(...tenant.dashboardSubscriptions
    .filter((subscription) => subscription.namedCredentialId === id)
    .map((subscription) => `Dashboard ${subscription.dashboardApiName} / ${subscription.label}`));
  references.push(...tenant.emailAlerts
    .filter((alert) => alert.namedCredentialId === id)
    .map((alert) => `Email Alert ${alert.label}`));
  if (references.length) return res.status(409).json({ error: `Named Credential is in use by: ${references.join(', ')}` });
  persistTenantRecords(principal.tenantId, {
    ...tenant, namedCredentials: tenant.namedCredentials.filter((credential) => credential.id !== id)
  });
  return res.status(204).end();
});
app.post('/api/named-credentials/:id/test', requirePermission('namedCredentials:manage'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const credential = tenantData(principal.tenantId)?.namedCredentials.find((item) => item.id === routeParam(req, 'id'));
  if (!credential) return res.status(404).json({ error: 'Named Credential was not found' });
  if (credential.protocol !== 'HTTPS') return res.status(400).json({ error: 'SMTP connection testing is not supported by this HTTPS probe' });
  const url = new URL(credential.baseUrl);
  if (url.protocol !== 'https:' || isReservedHostname(url.hostname) || (isIP(url.hostname) && !isPublicAddress(url.hostname))) {
    return res.status(400).json({ error: 'Test destination is not a public HTTPS host' });
  }
  try {
    const payload = openCredentialPayload(principal.tenantId, credential);
    if (credential.authType !== 'None' && !payload.secret) return res.status(400).json({ error: 'Authentication secret is not configured' });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (credential.authType === 'Bearer') headers.Authorization = `Bearer ${payload.secret}`;
    if (credential.authType === 'Basic') headers.Authorization = `Basic ${Buffer.from(`${payload.username ?? ''}:${payload.secret}`).toString('base64')}`;
    if (credential.authType === 'API Key') headers[credential.headerName!] = payload.secret!;
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpsRequest(url, {
        method: 'GET', headers, timeout: 8000, maxHeaderSize: 16384,
        lookup: (hostname, options, callback) => {
          if (isReservedHostname(hostname)) return callback(new Error('Reserved destination'), '', 0);
          void lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
            if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address))) return callback(new Error('Non-public destination'), '', 0);
            const selected = addresses[0];
            if (options && typeof options === 'object' && 'all' in options && options.all) callback(null, [selected]);
            else callback(null, selected.address, selected.family);
          }).catch(() => callback(new Error('DNS resolution failed'), '', 0));
        }
      }, (incoming) => {
        const code = incoming.statusCode ?? 0;
        incoming.destroy();
        resolve(code);
      });
      request.on('timeout', () => request.destroy(new Error('Connection timed out')));
      request.on('error', reject);
      request.end();
    });
    const connected = status >= 200 && status < 300;
    return res.json({ connected, status, message: connected
      ? 'HTTPS endpoint responded successfully.'
      : status === 401 || status === 403 ? 'Endpoint responded but rejected authentication.'
      : 'Endpoint responded with HTTP ' + status + '. Check the API path and permissions.' });
  } catch {
    return res.json({ connected: false, message: 'Unable to reach or authenticate with the HTTPS endpoint. Check the URL, DNS and credentials.' });
  }
});
// A base-URL GET is a connectivity probe, not a provider-specific API health check.
// Providers requiring an endpoint path or POST need a configurable test operation.
app.post('/api/named-credentials/:id/rotate', requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const credential = tenant.namedCredentials.find((item) => item.id === routeParam(req, 'id'));
  if (!credential) return res.status(404).json({ error: 'Named Credential was not found' });
  try {
    const ring = credentialKeyRing();
    const payload = openCredentialPayload(principal.tenantId, credential, ring);
    const next = namedCredentialSchema.parse({
      ...credential, ...sealCredentialPayload(principal.tenantId, credential.id, payload, ring),
      updatedAt: new Date().toISOString()
    });
    persistTenantRecords(principal.tenantId, {
      ...tenant, namedCredentials: tenant.namedCredentials.map((item) => item.id === next.id ? next : item)
    });
    return res.json({ credential: publicNamedCredential(next) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to rotate Named Credential encryption' });
  }
});
app.get('/api/metadata/email-alerts', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ emailAlerts: tenantData(getPrincipal(res).tenantId)?.emailAlerts ?? [] });
});
app.post('/api/metadata/email-alerts', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const parsed = emailAlertRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Email Alert', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.emailAlerts.some((alert) => alert.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return res.status(409).json({ error: `Email Alert "${parsed.data.name}" already exists` });
  }
  const object = tenant.objects.find((candidate) => candidate.apiName === parsed.data.objectApiName);
  if (!object) return res.status(400).json({ error: `Email Alert object "${parsed.data.objectApiName}" does not exist` });
  const credential = tenant.namedCredentials.find((candidate) =>
    candidate.id === parsed.data.namedCredentialId && candidate.protocol === 'SMTP');
  if (!credential) return res.status(400).json({ error: 'Email Alert requires an SMTP Named Credential' });
  const recipients = parsed.data.recipients.split(/[;,]/).map((recipient) => recipient.trim()).filter(Boolean);
  if (!recipients.length || recipients.some((recipient) =>
    !recipient.includes('{') && !z.string().email().safeParse(recipient).success)) {
    return res.status(400).json({ error: 'Email Alert requires valid recipient addresses or Flow record references' });
  }
  const now = new Date().toISOString();
  const emailAlert = emailAlertSchema.parse({ ...parsed.data, id: randomUUID(), createdAt: now, updatedAt: now });
  persistTenantRecords(principal.tenantId, { ...tenant, emailAlerts: [...tenant.emailAlerts, emailAlert] });
  return res.status(201).json({ emailAlert });
});
app.put('/api/metadata/email-alerts/:id', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const parsed = emailAlertRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Email Alert', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const existing = tenant.emailAlerts.find((alert) => alert.id === routeParam(req, 'id'));
  if (!existing) return res.status(404).json({ error: 'Email Alert was not found' });
  if (tenant.emailAlerts.some((alert) =>
    alert.id !== existing.id && alert.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return res.status(409).json({ error: `Email Alert "${parsed.data.name}" already exists` });
  }
  if (!tenant.objects.some((candidate) => candidate.apiName === parsed.data.objectApiName)) {
    return res.status(400).json({ error: `Email Alert object "${parsed.data.objectApiName}" does not exist` });
  }
  if (!tenant.namedCredentials.some((candidate) =>
    candidate.id === parsed.data.namedCredentialId && candidate.protocol === 'SMTP')) {
    return res.status(400).json({ error: 'Email Alert requires an SMTP Named Credential' });
  }
  const recipients = parsed.data.recipients.split(/[;,]/).map((recipient) => recipient.trim()).filter(Boolean);
  if (!recipients.length || recipients.some((recipient) =>
    !recipient.includes('{') && !z.string().email().safeParse(recipient).success)) {
    return res.status(400).json({ error: 'Email Alert requires valid recipient addresses or Flow record references' });
  }
  const emailAlert = emailAlertSchema.parse({ ...parsed.data, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
  persistTenantRecords(principal.tenantId, {
    ...tenant, emailAlerts: tenant.emailAlerts.map((alert) => alert.id === emailAlert.id ? emailAlert : alert)
  });
  return res.json({ emailAlert });
});
app.delete('/api/metadata/email-alerts/:id', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const id = routeParam(req, 'id');
  const emailAlert = tenant.emailAlerts.find((alert) => alert.id === id);
  if (!emailAlert) return res.status(404).json({ error: 'Email Alert was not found' });
  const references = tenant.flows.flatMap((flow) => flow.elements
    .filter((element) => element.type === 'Action' && element.config.actionType === 'Email Alert'
      && element.config.emailAlertId === id)
    .map((element) => `${flow.label} / ${element.label}`));
  if (references.length) return res.status(409).json({ error: `Email Alert is in use by: ${references.join(', ')}` });
  persistTenantRecords(principal.tenantId, {
    ...tenant, emailAlerts: tenant.emailAlerts.filter((alert) => alert.id !== id)
  });
  return res.status(204).end();
});
app.put('/api/metadata/flows/:apiName', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const parsed = flowSchema.safeParse({ ...req.body, apiName: req.params.apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid flow metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const existing = tenant.flows.find((flow) => flow.apiName === req.params.apiName);
  const requested = parsed.data;
  if (existing?.status === 'Active'
    && tenant.interviews.some((interview) => interview.flowApiName === existing.apiName)) {
    return res.status(409).json({ error: 'Flow cannot be edited while its interviews are pending; wait for them to finish or expire.' });
  }
  const now = new Date().toISOString();
  const versionNumber = existing ? existing.versionNumber + 1 : 1;
  const versions = existing ? [...existing.versions, {
    versionNumber: existing.versionNumber,
    status: existing.status,
    savedAt: now,
    label: existing.label,
    description: existing.description,
    flowType: existing.flowType,
    triggerObject: existing.triggerObject,
    startConfig: existing.startConfig,
    elements: existing.elements,
    connectors: existing.connectors,
    resources: existing.resources
  }] : [];
  const nextFlow = {
    ...requested,
    versionNumber,
    activeVersion: requested.status === 'Active' ? requested.activeVersion : null,
    versions
  };
  if (requested.status === 'Active') {
    const validation = validateFlow(nextFlow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections, tenant.connectorDefinitions, tenant.emailAlerts,
      formulaContextForUser(tenant, principal.userId),
      [...tenant.flows.filter((flow) => flow.apiName !== nextFlow.apiName), nextFlow], tenant.approvalProcesses, tenant.platformEvents);
    if (validation.errors.length) return res.status(422).json({ error: 'Flow validation failed', details: validation.errors });
    nextFlow.activeVersion = versionNumber;
    nextFlow.versions = [...versions, {
      versionNumber, status: 'Active', savedAt: now,
      label: nextFlow.label,
      description: nextFlow.description,
      flowType: nextFlow.flowType,
      triggerObject: nextFlow.triggerObject,
      startConfig: nextFlow.startConfig,
      elements: nextFlow.elements, connectors: nextFlow.connectors, resources: nextFlow.resources
    }];
  }
  const updatedTenant = { ...tenant, flows: existing ? tenant.flows.map((flow) => flow.apiName === nextFlow.apiName ? nextFlow : flow) : [...tenant.flows, nextFlow] };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({ flow: nextFlow });
});
app.post('/api/metadata/flows/:apiName/deactivate', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const existing = tenant.flows.find((flow) => flow.apiName === routeParam(req, 'apiName'));
  if (!existing) return res.status(404).json({ error: 'Flow was not found' });
  if (existing.status !== 'Active' || existing.activeVersion === null) {
    return res.status(409).json({ error: 'Flow is not active' });
  }
  if (tenant.interviews.some((interview) => interview.flowApiName === existing.apiName)) {
    return res.status(409).json({ error: 'Flow cannot be deactivated while its interviews are pending; wait for them to finish or expire.' });
  }
  const activeSubflowReferences = tenant.flows
    .filter((candidate) => candidate.apiName !== existing.apiName && candidate.status === 'Active')
    .flatMap((candidate) => candidate.elements
      .filter((element) => element.type === 'Subflow' && element.config.flowApiName === existing.apiName)
      .map((element) => `${candidate.label} / ${element.label}`));
  if (activeSubflowReferences.length) {
    return res.status(409).json({
      error: `Flow cannot be deactivated while referenced by active subflows: ${activeSubflowReferences.join(', ')}`
    });
  }
  const versionNumber = existing.versionNumber + 1;
  const activeVersionSnapshot = {
    versionNumber: existing.versionNumber,
    status: 'Active' as const,
    savedAt: new Date().toISOString(),
    label: existing.label,
    description: existing.description,
    flowType: existing.flowType,
    triggerObject: existing.triggerObject,
    startConfig: existing.startConfig,
    elements: existing.elements,
    connectors: existing.connectors,
    resources: existing.resources
  };
  const versions = [
    ...existing.versions.filter((version) => version.versionNumber !== existing.versionNumber),
    activeVersionSnapshot
  ];
  const flow = {
    ...existing,
    status: 'Draft' as const,
    versionNumber,
    activeVersion: null,
    versions
  };
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    flows: tenant.flows.map((candidate) => candidate.apiName === flow.apiName ? flow : candidate)
  });
  return res.json({ flow });
});
app.delete('/api/metadata/flows/:apiName', requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const flow = tenant.flows.find((candidate) => candidate.apiName === apiName);
  if (!flow) return res.status(404).json({ error: 'Flow was not found' });
  const references = tenant.flows
    .filter((candidate) => candidate.apiName !== apiName)
    .flatMap((candidate) => candidate.elements
      .filter((element) => element.type === 'Subflow' && element.config.flowApiName === apiName)
      .map((element) => `${candidate.label} / ${element.label}`));
  if (references.length) return res.status(409).json({ error: `Flow is referenced by subflows: ${references.join(', ')}` });
  if (tenant.interviews.some((interview) => interview.flowApiName === apiName)) {
    return res.status(409).json({ error: 'Flow cannot be deleted while its interviews are pending; wait for them to finish or expire.' });
  }
  if (flow.status === 'Active') return res.status(409).json({ error: 'Deactivate the flow before deleting it.' });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    flows: tenant.flows.filter((candidate) => candidate.apiName !== apiName),
    scheduleRuns: Object.fromEntries(Object.entries(tenant.scheduleRuns).filter(([key]) => !key.startsWith(`${apiName}@`))),
    scheduleRetries: Object.fromEntries(Object.entries(tenant.scheduleRetries).filter(([key]) => !key.startsWith(`${apiName}@`)))
  });
  return res.status(204).end();
});
app.post('/api/metadata/flows/:apiName/validate', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const parsed = flowSchema.safeParse({ ...req.body, apiName: req.params.apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid flow metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const validation = validateFlow(parsed.data, tenant.objects, tenant.namedCredentials, tenant.integrationConnections, tenant.connectorDefinitions, tenant.emailAlerts,
    formulaContextForUser(tenant, principal.userId),
    [...tenant.flows.filter((flow) => flow.apiName !== parsed.data.apiName), parsed.data], tenant.approvalProcesses, tenant.platformEvents);
  return res.json(validation);
});
function hasObjectPermission(principal: Principal, tenant: TenantData, objectName: string, action: 'read' | 'create' | 'edit' | 'delete'): boolean {
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (object?.kind === 'Custom Object' && object.settings?.deploymentStatus === 'In Development'
    && !principal.permissions.includes('objects:manage')
    && !principal.permissions.includes('metadata:write')) return false;
  const user = principalUser(principal);
  if (!user) return false;
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profile = tenant.accessControl.profiles.find((item) =>
    item.id === (accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles)));
  const grants: Array<{ permission: ObjectPermission; muted?: Partial<ObjectPermission> }> = [];
  const addGrants = (permissions: Record<string, ObjectPermission>, muted?: Partial<ObjectPermission>) => {
    const permission = permissions[objectName];
    if (permission) grants.push({ permission, muted });
  };
  if (profile) addGrants(profile.objectPermissions);
  tenant.accessControl.permissionSets
    .filter((set) => user.permissionSetIds.includes(set.id))
    .forEach((set) => addGrants(set.objectPermissions));
  user.permissionSetGroupIds.forEach((groupId) => {
    const group = tenant.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    if (!group) return;
    tenant.accessControl.permissionSets
      .filter((set) => group.permissionSetIds.includes(set.id))
      .forEach((set) => addGrants(set.objectPermissions, group.mutedObjectPermissions[objectName]));
  });
  const hasGrant = ({ permission, muted }: typeof grants[number]) => {
    if (permission[action] && !muted?.[action] && !muted?.read) return true;
    if (action === 'read') {
      return (permission.viewAll && !muted?.viewAll || permission.modifyAll && !muted?.modifyAll)
        && !muted?.read;
    }
    return action !== 'create'
      && permission.modifyAll
      && !muted?.modifyAll
      && !muted?.[action]
      && !muted?.read;
  };
  return grants.some(hasGrant);
}

function hasObjectWidePermission(principal: Principal, tenant: TenantData, objectName: string, flag: 'viewAll' | 'modifyAll'): boolean {
  const user = principalUser(principal);
  if (!user) return false;
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profile = tenant.accessControl.profiles.find((item) =>
    item.id === (accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles)));
  const hasGrant = (permissions: Record<string, ObjectPermission>, muted?: Partial<ObjectPermission>) => {
    const permission = permissions[objectName];
    return Boolean(permission?.[flag] && !muted?.[flag] && !muted?.read);
  };
  if (profile && hasGrant(profile.objectPermissions)) return true;
  if (tenant.accessControl.permissionSets.some((set) =>
    user.permissionSetIds.includes(set.id) && hasGrant(set.objectPermissions))) return true;
  return user.permissionSetGroupIds.some((groupId) => {
    const group = tenant.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    return Boolean(group && tenant.accessControl.permissionSets.some((set) =>
      group.permissionSetIds.includes(set.id) && hasGrant(set.objectPermissions, group.mutedObjectPermissions[objectName])));
  });
}

function hasRoleHierarchyAccess(principal: Principal, tenant: TenantData, ownerId: unknown): boolean {
  if (typeof ownerId !== 'string') return false;
  const viewer = tenant.accessControl.users.find((user) => user.id === principal.userId);
  const owner = tenant.accessControl.users.find((user) => user.id === ownerId);
  if (!viewer || !owner) return false;
  const viewerRoleId = viewer.roleId ?? roleIdForName(viewer.role, tenant.accessControl.roles);
  let parentRoleId = owner.roleId ?? roleIdForName(owner.role, tenant.accessControl.roles);
  const visited = new Set<string>();
  while (parentRoleId && !visited.has(parentRoleId)) {
    if (parentRoleId === viewerRoleId) return true;
    visited.add(parentRoleId);
    parentRoleId = tenant.accessControl.roles.find((role) => role.id === parentRoleId)?.parentRoleId ?? '';
  }
  return false;
}

function roleIsAtOrBelow(roleId: string, rootRoleId: string, roles: AccessRole[]): boolean {
  let currentRoleId: string | null | undefined = roleId;
  const visited = new Set<string>();
  while (currentRoleId && !visited.has(currentRoleId)) {
    if (currentRoleId === rootRoleId) return true;
    visited.add(currentRoleId);
    currentRoleId = roles.find((role) => role.id === currentRoleId)?.parentRoleId;
  }
  return false;
}

function publicGroupContainsUser(groupId: string, userId: string, tenant: TenantData, visited = new Set<string>()): boolean {
  if (visited.has(groupId)) return false;
  const group = tenant.accessControl.publicGroups.find((item) => item.id === groupId);
  if (!group) return false;
  visited.add(groupId);
  const member = tenant.accessControl.users.find((item) => item.id === userId);
  if (!member) return false;
  const roleId = member.roleId ?? roleIdForName(member.role, tenant.accessControl.roles);
  if (group.userIds.includes(userId)
    || group.roleIds.includes(roleId)
    || group.roleAndSubordinateIds.some((parentId) => roleIsAtOrBelow(roleId, parentId, tenant.accessControl.roles))) return true;
  return group.groupIds.some((nestedId) => publicGroupContainsUser(nestedId, userId, tenant, new Set(visited)));
}

function queueContainsUser(queue: RecordQueue, userId: string, tenant: TenantData): boolean {
  const member = tenant.accessControl.users.find((item) => item.id === userId);
  if (!member) return false;
  const roleId = member.roleId ?? roleIdForName(member.role, tenant.accessControl.roles);
  return queue.userIds.includes(userId)
    || queue.roleIds.includes(roleId)
    || queue.roleAndSubordinateIds.some((rootRoleId) => roleIsAtOrBelow(roleId, rootRoleId, tenant.accessControl.roles))
    || queue.publicGroupIds.some((groupId) => publicGroupContainsUser(groupId, userId, tenant));
}

function sharingRuleMatchesRecord(rule: SharingRule, record: RuntimeRecord): boolean {
  const conditions = rule.criteria.map((criterion) => {
    const value = record[criterion.fieldApiName];
    const expected = criterion.value;
    switch (criterion.operator) {
      case 'Equals': return String(value ?? '') === expected;
      case 'Not Equals': return String(value ?? '') !== expected;
      case 'Contains': return typeof value === 'string' && value.toLowerCase().includes(expected.toLowerCase());
      case 'Starts With': return typeof value === 'string' && value.toLowerCase().startsWith(expected.toLowerCase());
      case 'Is Null': return value === null || value === undefined || value === '';
      case 'Greater Than': return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > Number(expected);
      case 'Less Than': return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) < Number(expected);
    }
  });
  return rule.filterLogic === 'All' ? conditions.every(Boolean) : conditions.some(Boolean);
}

function sharingRuleGrantsUser(rule: SharingRule, recipientUserId: string, record: RuntimeRecord, tenant: TenantData): boolean {
  if (!rule.active) return false;
  if (rule.type === 'OwnerBased') {
    const owner = tenant.accessControl.users.find((item) => item.id === record.OwnerId);
    if (!owner) return false;
    const ownerRoleId = owner.roleId ?? roleIdForName(owner.role, tenant.accessControl.roles);
    if (!rule.ownerRoleIds.some((roleId) => roleIsAtOrBelow(ownerRoleId, roleId, tenant.accessControl.roles))) return false;
  } else if (!sharingRuleMatchesRecord(rule, record)) return false;

  const recipient = tenant.accessControl.users.find((item) => item.id === recipientUserId);
  if (!recipient) return false;
  const recipientRoleId = recipient.roleId ?? roleIdForName(recipient.role, tenant.accessControl.roles);
  if (rule.targetType === 'User') return rule.targetId === recipientUserId;
  if (rule.targetType === 'PublicGroup') return publicGroupContainsUser(rule.targetId, recipientUserId, tenant);
  if (rule.targetType === 'Role') return recipientRoleId === rule.targetId;
  return roleIsAtOrBelow(recipientRoleId, rule.targetId, tenant.accessControl.roles);
}

function hasRecordAccess(
  principal: Principal,
  tenant: TenantData,
  objectName: string,
  record: RuntimeRecord,
  accessLevel: 'Read' | 'Edit' | 'Delete',
  visited = new Set<string>()
): boolean {
  const recordKey = `${objectName}:${record.Id}:${accessLevel}`;
  if (visited.has(recordKey)) return false;
  visited.add(recordKey);
  const objectAction = accessLevel === 'Read' ? 'read' : accessLevel === 'Edit' ? 'edit' : 'delete';
  if (!hasObjectPermission(principal, tenant, objectName, objectAction)) return false;
  if (accessLevel === 'Read' && hasObjectWidePermission(principal, tenant, objectName, 'viewAll')) return true;
  if ((accessLevel === 'Edit' || accessLevel === 'Delete')
    && hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')) return true;
  if (accessLevel !== 'Delete') {
    const object = tenant.objects.find((item) => item.apiName === objectName);
    for (const field of object?.fields ?? []) {
      if (field.relationship?.type !== 'Master-Detail' || typeof record[field.apiName] !== 'string') continue;
      const parent = (tenant.records[field.relationship.targetObject] ?? []).find((item) => item.Id === record[field.apiName]);
      if (parent && hasRecordAccess(principal, tenant, field.relationship.targetObject, parent, accessLevel, new Set(visited))) return true;
    }
  }
  const isQueueMember = typeof record.OwnerId === 'string'
    && tenant.accessControl.queues.some((queue) =>
      queue.id === record.OwnerId && queue.supportedObjectApiNames.includes(objectName)
      && queueContainsUser(queue, principal.userId, tenant));
  const isOwner = record.OwnerId === principal.userId || isQueueMember;
  if (isOwner) return true;
  if (accessLevel === 'Delete') return false;
  const defaultAccess = tenant.sharingSettings[objectName]?.defaultAccess ?? 'Private';
  if (tenant.sharingSettings[objectName]?.grantAccessUsingHierarchies !== false
    && (accessLevel === 'Read' || defaultAccess === 'Public Read/Write')
    && hasRoleHierarchyAccess(principal, tenant, record.OwnerId)) return true;
  const share = tenant.recordShares.find((item) =>
    item.objectApiName === objectName && item.recordId === record.Id
    && (item.userId === principal.userId
      || Boolean(item.groupId && publicGroupContainsUser(item.groupId, principal.userId, tenant))));
  if (share && (share.accessLevel === 'Edit' || accessLevel === 'Read')) return true;
  if (tenant.accessControl.sharingRules.some((rule) =>
    rule.objectApiName === objectName
    && (rule.accessLevel === 'Edit' || accessLevel === 'Read')
    && sharingRuleGrantsUser(rule, principal.userId, record, tenant))) return true;
  return defaultAccess === 'Public Read/Write'
    || (defaultAccess === 'Public Read Only' && accessLevel === 'Read');
}

function hasFieldPermission(principal: Principal, tenant: TenantData, objectName: string, fieldName: string, action: 'read' | 'edit'): boolean {
  const user = principalUser(principal);
  if (!user) return false;
  const key = `${objectName}.${fieldName}`;
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profile = tenant.accessControl.profiles.find((item) =>
    item.id === (accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles)));
  const sets = tenant.accessControl.permissionSets;
  const grantsField = (
    fieldPermissions: Record<string, { read: boolean; edit: boolean }>,
    objectPermissions: Record<string, ObjectPermission>,
    muted?: Partial<ObjectPermission>
  ) => {
    const explicit = fieldPermissions[key];
    if (explicit) return explicit[action];
    const objectPermission = objectPermissions[objectName];
    return Boolean(objectPermission && (
      objectPermission[action] && !muted?.[action] && !muted?.read
      || objectPermission.modifyAll && !muted?.modifyAll && !muted?.read && !muted?.[action]
      || action === 'read' && objectPermission.viewAll && !muted?.viewAll && !muted?.read
    ));
  };
  if (profile && grantsField(profile.fieldPermissions, profile.objectPermissions)) return true;
  if (sets.some((set) => user.permissionSetIds.includes(set.id) && grantsField(set.fieldPermissions, set.objectPermissions))) return true;
  return user.permissionSetGroupIds.some((groupId) => {
    const group = tenant.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    if (!group || group.mutedFieldPermissions[key]?.[action]) return false;
    return sets.some((set) => group.permissionSetIds.includes(set.id)
      && grantsField(set.fieldPermissions, set.objectPermissions, group.mutedObjectPermissions[objectName]));
  });
}

function sanitizeRecordForRead(principal: Principal, tenant: TenantData, object: ObjectMetadata, record: RuntimeRecord): RuntimeRecord {
  const values: Record<string, unknown> = {};
  const systemFields = new Set(['Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 'SystemModstamp', 'RecordTypeId']);
  for (const [key, value] of Object.entries(record)) {
    if (systemFields.has(key) || hasFieldPermission(principal, tenant, object.apiName, key, 'read')) values[key] = value;
  }
  return values as RuntimeRecord;
}

function assertFieldEditPermissions(principal: Principal, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>): void {
  for (const fieldName of Object.keys(values)) {
    if (fieldName === 'RecordTypeId') continue;
    if (!hasFieldPermission(principal, tenant, object.apiName, fieldName, 'edit')) {
      throw new Error(`Missing edit permission for field "${object.apiName}.${fieldName}".`);
    }
  }
}

function sanitizeRecordValues(object: ObjectMetadata, input: Record<string, unknown>): Record<string, unknown> {
  const allowedFields = new Set(object.fields.map((field) => field.apiName));
  const readOnlyFields = new Set([
    'Id',
    'CreatedDate',
    'CreatedById',
    'LastModifiedDate',
    'LastModifiedById',
    'SystemModstamp',
    ...(object.apiName === 'Opportunity' ? ['Age', 'Fiscal', 'OwnerRole'] : []),
    ...(object.apiName === 'Case' ? ['Age', 'IsOpen', 'IsClosed'] : [])
  ]);
  const values: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(input)) {
    if (!allowedFields.has(fieldName) && fieldName !== 'RecordTypeId') throw new Error(`Field "${fieldName}" does not exist on "${object.apiName}".`);
    if (readOnlyFields.has(fieldName)) throw new Error(`Field "${fieldName}" on "${object.apiName}" is read-only.`);
    values[fieldName] = value;
  }
  return normalizeRuntimeValues(object, values);
}

function stampRecordAuditFields(record: RuntimeRecord, userId: string, timestamp: string, previous?: RuntimeRecord): RuntimeRecord {
  return {
    ...record,
    CreatedById: previous?.CreatedById ?? userId,
    LastModifiedById: userId,
    SystemModstamp: timestamp
  };
}

function withCaseClosedDate(objectApiName: string, record: RuntimeRecord, previous?: RuntimeRecord): RuntimeRecord {
  if (objectApiName !== 'Case') return record;
  const isClosed = /^closed(?:\b|[\s_-])/i.test(String(record.Status ?? ''));
  if (!isClosed) return { ...record, ClosedDate: null };
  const wasClosed = /^closed(?:\b|[\s_-])/i.test(String(previous?.Status ?? ''));
  const closedDate = wasClosed
    ? typeof previous?.ClosedDate === 'string' ? previous.ClosedDate : previous?.LastModifiedDate
    : record.LastModifiedDate;
  return { ...record, ClosedDate: closedDate ?? record.LastModifiedDate };
}

function recordActionEnabled(object: ObjectMetadata, action: 'New' | 'Edit' | 'Delete', recordTypeId?: string, profileId?: string): boolean {
  if (object.actions && !object.actions.some((item) => item.type === 'Standard' && item.label === action && item.enabled)) return false;
  if (action === 'New' && object.listViewButtons && !object.listViewButtons.includes('New')) return false;
  const selectedRecordTypeId = recordTypeId
    ?? object.recordTypes?.find((item) => item.active && item.isDefault)?.id
    ?? object.recordTypes?.find((item) => item.active)?.id;
  const assignments = object.pageLayoutAssignments ?? [];
  const assignment = assignments.find((item) => item.profileId === profileId && item.recordTypeId === selectedRecordTypeId)
    ?? assignments.find((item) => item.profileId === '*' && item.recordTypeId === selectedRecordTypeId);
  const layout = object.pageLayouts?.find((item) => item.id === assignment?.pageLayoutId) ?? object.pageLayouts?.[0];
  return !layout || layout.actions.includes(action);
}

function profileIdForPrincipal(principal: Principal, tenant: TenantData): string {
  const user = principalUser(principal);
  if (!user) return '';
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  return accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles);
}

function resolveActiveLightningRecordPage(
  tenant: TenantData,
  objectApiName: string,
  appId: string,
  recordTypeId: string | undefined,
  profileId: string,
  formFactor: 'Desktop' | 'Phone'
): LightningPage | undefined {
  const matches: Array<{ page: LightningPage; specificity: number }> = [];
  for (const page of tenant.pages) {
    if (page.status !== 'Active' || page.pageType !== 'Record Page'
      || page.targetObject !== objectApiName || !page.devices.includes(formFactor)) continue;
    for (const assignment of page.activationAssignments ?? []) {
      if (!assignment.formFactors.includes(formFactor)) continue;
      const matchesAssignment = assignment.scope === 'Org Default'
        ? 1
        : assignment.scope === 'App Default' && assignment.appId === appId
          ? 2
          : assignment.scope === 'App and Profile'
            && assignment.appId === appId
            && assignment.profileId === profileId
            ? 3
          : assignment.scope === 'App, Record Type, and Profile'
            && assignment.appId === appId
            && assignment.recordTypeId === recordTypeId
            && assignment.profileId === profileId
            ? 4
            : 0;
      if (matchesAssignment) matches.push({ page, specificity: matchesAssignment });
    }
  }
  matches.sort((left, right) => right.specificity - left.specificity);
  return matches[0]?.page;
}

function resolveActiveLightningHomePage(
  tenant: TenantData,
  appId: string,
  profileId: string,
  formFactor: 'Desktop' | 'Phone'
): LightningPage | undefined {
  const matches: Array<{ page: LightningPage; specificity: number }> = [];
  for (const page of tenant.pages) {
    if (page.status !== 'Active' || page.pageType !== 'Home Page' || !page.devices.includes(formFactor)) continue;
    for (const assignment of page.activationAssignments ?? []) {
      if (!assignment.formFactors.includes(formFactor) || assignment.appId !== appId) continue;
      if (assignment.scope === 'App Default') matches.push({ page, specificity: 1 });
      else if (assignment.scope === 'App and Profile' && assignment.profileId === profileId) {
        matches.push({ page, specificity: 2 });
      }
    }
  }
  matches.sort((left, right) => right.specificity - left.specificity);
  return matches[0]?.page;
}

function hasRecordTypeAccessForUser(userId: string, tenant: TenantData, objectName: string, recordTypeId: string): boolean {
  const user = tenant.accessControl.users.find((item) => item.id === userId);
  if (!user) return false;
  const key = `${objectName}.${recordTypeId}`;
  const profile = tenant.accessControl.profiles.find((item) =>
    item.id === (user.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles)));
  if (profile && profile.recordTypePermissions[key] !== false) return true;
  const sets = tenant.accessControl.permissionSets;
  if (sets.some((set) => user.permissionSetIds.includes(set.id) && set.recordTypePermissions[key] === true)) return true;
  return user.permissionSetGroupIds.some((groupId) => {
    const group = tenant.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    return Boolean(group && group.mutedRecordTypePermissions[key] !== true
      && sets.some((set) => group.permissionSetIds.includes(set.id) && set.recordTypePermissions[key] === true));
  });
}

function allocateAutoNumberSequence(tenantId: string, tenant: TenantData, object: ObjectMetadata, field: ObjectMetadata['fields'][number]): number {
  const latestTenant = tenantData(tenantId);
  if (!latestTenant) throw new Error(`Tenant "${tenantId}" is unavailable for auto-number allocation.`);
  const key = autoNumberSequenceKey(object.apiName, field.apiName);
  const sequence = Math.max(latestTenant.autoNumberSequences[key] ?? 0, tenant.autoNumberSequences[key] ?? 0) + 1;
  persistTenantRecords(tenantId, {
    ...latestTenant,
    autoNumberSequences: { ...latestTenant.autoNumberSequences, [key]: sequence }
  });
  tenant.autoNumberSequences = { ...tenant.autoNumberSequences, [key]: sequence };
  return sequence;
}
function applyRecordDefaults(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, userId: string): Record<string, unknown> {
  const result = { ...values };
  if (object.fields.some((field) => field.apiName === 'CurrencyIsoCode')
    && result.CurrencyIsoCode === undefined) {
    result.CurrencyIsoCode = tenant.currencySettings.corporateCurrency;
  }
  if (object.recordTypes?.length) {
    const activeRecordTypes = object.recordTypes.filter((recordType) => recordType.active);
    if (result.RecordTypeId === undefined) {
      const defaultRecordType = activeRecordTypes.find((recordType) => recordType.isDefault
        && hasRecordTypeAccessForUser(userId, tenant, object.apiName, recordType.id));
      const firstAvailable = activeRecordTypes.find((recordType) =>
        hasRecordTypeAccessForUser(userId, tenant, object.apiName, recordType.id));
      const selectedRecordType = defaultRecordType ?? firstAvailable;
      if (!selectedRecordType) throw new Error(`No available record type is assigned for "${object.apiName}".`);
      result.RecordTypeId = selectedRecordType.id;
    } else if (typeof result.RecordTypeId !== 'string' || !activeRecordTypes.some((recordType) =>
      recordType.id === result.RecordTypeId && hasRecordTypeAccessForUser(userId, tenant, object.apiName, recordType.id))) {
      throw new Error(`Record type "${String(result.RecordTypeId)}" is not assigned to this user for "${object.apiName}".`);
    }
  }
  for (const field of object.fields) {
    if (result[field.apiName] === undefined && field.defaultValue !== undefined) result[field.apiName] = field.defaultValue;
    if (field.dataType === 'AutoNumber' || field.dataType === 'Auto Number') {
      if (result[field.apiName] !== undefined) throw new Error(`Auto-number field "${field.apiName}" cannot be supplied.`);
      const sequence = allocateAutoNumberSequence(tenantId, tenant, object, field);
      result[field.apiName] = formatAutoNumber(autoNumberFormatForField(object, field), sequence);
    }
  }
  if (object.fields.some((field) => field.apiName === 'OwnerId') && result.OwnerId === undefined) result.OwnerId = userId;
  const ownerField = object.fields.find((field) => field.apiName === 'OwnerId');
  const ownerTenantId = state.users.find((user) => user.id === userId)?.tenantId;
  const owner = typeof result.OwnerId === 'string'
    ? state.users.find((user) => user.id === result.OwnerId && user.tenantId === ownerTenantId && !user.disabled)
    : undefined;
  if (ownerField && typeof result.OwnerId === 'string'
    && !(owner && tenant.accessControl.users.some((member) => member.id === owner.id))
    && !tenant.accessControl.queues.some((queue) => queue.id === result.OwnerId && queue.supportedObjectApiNames.includes(object.apiName))) {
    throw new Error(`Owner "${result.OwnerId}" is not an eligible user or queue for "${object.apiName}".`);
  }
  return normalizeRuntimeValues(object, result);
}

function redactCommunicationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCommunicationValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|authorization|token|api[-_]?key|credential|cookie/i.test(key)
        ? '[REDACTED]'
        : redactCommunicationValue(item)
    ]));
  }
  return value;
}

function communicationPayload(value: unknown): string {
  if (value === undefined || value === null) return '';
  let payload: unknown = value;
  if (typeof value === 'string') {
    try { payload = JSON.parse(value) as unknown; } catch { /* Plain-text payloads are retained as text. */ }
  }
  const serialized = typeof payload === 'string'
    ? payload
    : JSON.stringify(redactCommunicationValue(payload));
  const maximumLength = 120_000;
  return serialized.length > maximumLength ? `${serialized.slice(0, maximumLength - 15)}...[TRUNCATED]` : serialized;
}

function communicationSafeUrl(value: string): string {
  const url = new URL(value);
  for (const [key] of url.searchParams) {
    if (/password|secret|authorization|token|api[-_]?key|credential|cookie/i.test(key)) {
      url.searchParams.set(key, '[REDACTED]');
    }
  }
  return url.toString();
}

function supportedCommunicationMethod(method: string): string {
  const supportedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return supportedMethods.includes(method.toUpperCase()) ? method.toUpperCase() : 'OTHER';
}

function communicationError(responseBody: unknown): string {
  if (typeof responseBody === 'string') return responseBody.slice(0, 120_000);
  if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
    const response = responseBody as Record<string, unknown>;
    const error = response.error ?? response.message;
    return error === undefined ? '' : communicationPayload(error);
  }
  return '';
}

function appendCommunicationRecord(
  tenantId: string,
  requestedOwnerId: string,
  entry: {
    apiId: string;
    url: string;
    authType: string;
    method: string;
    direction: 'Incoming' | 'Outgoing';
    requestBody: string;
    responseBody: string;
    status: number;
    error: string;
    durationMs: number;
  }
): void {
  const tenant = tenantData(tenantId);
  const object = tenant?.objects.find((item) => item.apiName === 'Communication_Records__c');
  if (!tenant || !object) throw new Error(`Communication Records is unavailable for tenant "${tenantId}".`);
  const ownerId = state.users.find((user) => user.id === requestedOwnerId && user.tenantId === tenantId && !user.disabled)?.id
    ?? state.users.find((user) => user.tenantId === tenantId && !user.disabled)?.id;
  if (!ownerId) throw new Error(`No active owner is available for Communication Records in tenant "${tenantId}".`);
  const now = new Date().toISOString();
  const values = applyRecordDefaults(tenantId, tenant, object, {
    Api_Id__c: entry.apiId.slice(0, 255),
    Url__c: entry.url,
    Auth_Type__c: entry.authType,
    Method__c: entry.method,
    Direction__c: entry.direction,
    Request_Body__c: entry.requestBody,
    Response_Body__c: entry.responseBody,
    Status_Code__c: entry.status,
    Error__c: entry.error,
    Duration_Ms__c: entry.durationMs,
    Occurred_At__c: now
  }, ownerId);
  validateRuntimeRecord(tenantId, tenant, object, values);
  const record = stampRecordAuditFields({
    ...values,
    Id: randomUUID(),
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now);
  persistTenantRecords(tenantId, {
    ...tenant,
    records: {
      ...tenant.records,
      Communication_Records__c: [...(tenant.records.Communication_Records__c ?? []), record]
    }
  });
}

function persistTenantRecords(tenantId: string, tenant: TenantData): void {
  const currentSequences = state.tenants[tenantId]?.autoNumberSequences ?? {};
  const autoNumberSequences = { ...tenant.autoNumberSequences };
  for (const [key, sequence] of Object.entries(currentSequences)) {
    autoNumberSequences[key] = Math.max(autoNumberSequences[key] ?? 0, sequence);
  }
  const updatedTenant = { ...tenant, autoNumberSequences };
  const nextState = { ...state, tenants: { ...state.tenants, [tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
}
function createFlowFailureLog(
  flow: Pick<FlowMetadata, 'apiName' | 'label'>,
  trigger: FlowExecutionLog['trigger'],
  error: unknown,
  userId: string | null
): FlowExecutionLog {
  return flowExecutionLogSchema.parse({
    id: randomUUID(),
    flowApiName: flow.apiName,
    flowLabel: flow.label,
    trigger,
    failedAt: new Date().toISOString(),
    error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    userId
  });
}
function persistFlowFailure(
  tenantId: string,
  flow: Pick<FlowMetadata, 'apiName' | 'label'>,
  trigger: FlowExecutionLog['trigger'],
  error: unknown,
  userId: string | null
): void {
  const tenant = tenantData(tenantId);
  if (!tenant) throw new Error(`Cannot record flow failure: tenant "${tenantId}" was not found.`);
  const log = createFlowFailureLog(flow, trigger, error, userId);
  persistTenantRecords(tenantId, { ...tenant, flowLogs: [...tenant.flowLogs, log] });
}
async function deleteRecordCascade(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  record: RuntimeRecord,
  depth = 0,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Relationship cascade depth exceeded the 10-level limit.');
  const user = state.users.find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
  if (!user) throw new Error('The user initiating this deletion is no longer active.');
  const principal: Principal = {
    userId: user.id, tenantId, email: user.email, roles: [user.role], permissions: effectivePermissions(user, tenant)
  };
  if (!hasRecordAccess(principal, tenant, objectName, record, 'Delete')) {
    throw new Error(`Missing record-level delete access for "${objectName}" record "${record.Id}".`);
  }
  await runRecordTriggeredFlows(
    tenantId, tenant, userId, objectName, 'deleted', record, record, depth, false, debugExecution, debugTrace, rollbackSnapshot
  );
  for (const childObject of tenant.objects) {
    for (const field of childObject.fields) {
      if (!field.relationship || field.relationship.targetObject !== objectName) continue;
      const children = (tenant.records[childObject.apiName] ?? []).filter((item) => item[field.apiName] === record.Id);
      if (!children.length) continue;
      if (field.relationship.type === 'Master-Detail') {
        for (const child of children) {
          await deleteRecordCascade(
            tenantId, tenant, userId, childObject.apiName, child, depth + 1, debugExecution, debugTrace, rollbackSnapshot
          );
        }
      } else {
        if (field.relationship.deleteBehavior === 'Restrict') {
          throw new Error(`Cannot delete this record while lookup "${field.relationship.relationshipName}" (${childObject.apiName}.${field.apiName}) has related records.`);
        }
        if (field.required) throw new Error(`Cannot delete this record while required lookup "${childObject.apiName}.${field.apiName}" is populated.`);
        for (const child of children) {
          if (!hasRecordAccess(principal, tenant, childObject.apiName, child, 'Edit')) {
            throw new Error(`Missing record-level edit access to clear "${childObject.apiName}.${field.apiName}" on child record "${child.Id}".`);
          }
          assertFieldEditPermissions(principal, tenant, childObject, { [field.apiName]: null });
        }
        const childIds = new Set(children.map((child) => child.Id));
        const now = new Date().toISOString();
        tenant.records[childObject.apiName] = (tenant.records[childObject.apiName] ?? []).map((child) => {
          if (!childIds.has(child.Id)) return child;
          const updated = stampRecordAuditFields({ ...child, [field.apiName]: null, LastModifiedDate: now }, userId, now, child);
          appendFieldHistory(tenant, childObject, child, updated, userId);
          return updated;
        });
        for (const child of children) {
          const updated = tenant.records[childObject.apiName].find((item) => item.Id === child.Id);
          if (updated) {
            await runRecordTriggeredFlows(
              tenantId, tenant, userId, childObject.apiName, 'updated', updated, child,
              depth + 1, false, debugExecution, debugTrace, rollbackSnapshot
            );
          }
        }
      }
    }
  }
  tenant.records[objectName] = (tenant.records[objectName] ?? []).filter((item) => item.Id !== record.Id);
  tenant.recordShares = tenant.recordShares.filter((share) =>
    share.objectApiName !== objectName || share.recordId !== record.Id);
  if (objectName === 'Campaign') tenant.campaignMembers = tenant.campaignMembers.filter((member) => member.campaignId !== record.Id);
  if (objectName === 'Contact') tenant.campaignMembers = tenant.campaignMembers.filter((member) => member.contactId !== record.Id);
}
function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function canManageRecordShares(principal: Principal, tenant: TenantData, objectName: string, record: RuntimeRecord): boolean {
  return record.OwnerId === principal.userId
    || hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')
    || principal.permissions.includes('security:manage');
}

app.get('/api/records/:objectName/:recordId/shares', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  const users = new Map(state.users.filter((user) => user.tenantId === principal.tenantId).map((user) => [user.id, user]));
  const groups = new Map(tenant.accessControl.publicGroups.map((group) => [group.id, group]));
  const shares = tenant.recordShares
    .filter((share) => share.objectApiName === objectName && share.recordId === recordId)
    .map((share) => ({
      ...share,
      targetLabel: share.userId ? users.get(share.userId)?.name ?? 'Unknown User'
        : groups.get(share.groupId ?? '')?.label ?? 'Unknown Public Group'
    }));
  return res.json({ shares });
});

app.post('/api/records/:objectName/:recordId/shares', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  const input = z.object({
    userId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    accessLevel: z.enum(['Read', 'Edit'])
  }).strict().superRefine((value, context) => {
    if (Boolean(value.userId) === Boolean(value.groupId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'Specify exactly one active user or public group' });
    }
  }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'A target user or public group and Read or Edit access level are required' });
  const targetUser = input.data.userId ? state.users.find((user) =>
    user.id === input.data.userId && user.tenantId === principal.tenantId && !user.disabled) : undefined;
  const targetGroup = input.data.groupId
    ? tenant.accessControl.publicGroups.find((group) => group.id === input.data.groupId) : undefined;
  if (input.data.userId && !targetUser) return res.status(400).json({ error: 'Shares can only be granted to an active user in this tenant' });
  if (input.data.groupId && !targetGroup) return res.status(400).json({ error: 'Shares can only be granted to an existing public group in this tenant' });
  if (targetUser?.id === record.OwnerId) return res.status(400).json({ error: 'The record owner already has full access' });
  const target = targetUser ? { userId: targetUser.id } : { groupId: targetGroup!.id };
  const share = recordShareSchema.parse({
    id: randomUUID(), objectApiName: objectName, recordId, ...target, accessLevel: input.data.accessLevel, rowCause: 'Manual',
    createdBy: principal.userId, createdAt: new Date().toISOString()
  });
  const recordShares = [
    ...tenant.recordShares.filter((item) => !(item.objectApiName === objectName && item.recordId === recordId
      && item.userId === target.userId && item.groupId === target.groupId)),
    share
  ];
  persistTenantRecords(principal.tenantId, { ...tenant, recordShares });
  return res.status(201).json({ share });
});

app.delete('/api/records/:objectName/:recordId/shares/:userId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const userId = routeParam(req, 'userId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  if (!tenant.recordShares.some((share) => share.objectApiName === objectName && share.recordId === recordId && share.userId === userId)) {
    return res.status(404).json({ error: 'Manual record share was not found' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    recordShares: tenant.recordShares.filter((share) =>
      !(share.objectApiName === objectName && share.recordId === recordId && share.userId === userId))
  });
  return res.status(204).end();
});

app.delete('/api/records/:objectName/:recordId/shares/groups/:groupId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const groupId = routeParam(req, 'groupId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  if (!tenant.recordShares.some((share) => share.objectApiName === objectName && share.recordId === recordId && share.groupId === groupId)) {
    return res.status(404).json({ error: 'Manual public-group record share was not found' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    recordShares: tenant.recordShares.filter((share) =>
      !(share.objectApiName === objectName && share.recordId === recordId && share.groupId === groupId))
  });
  return res.status(204).end();
});

app.get('/api/records/:objectName', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  if (!tenant.objects.some((object) => object.apiName === objectName)) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectName}"` });
  if (objectName === 'User') {
    const object = tenant.objects.find((item) => item.apiName === 'User')!;
    const records = state.users.filter((user) => user.tenantId === principal.tenantId).map((user) => sanitizeRecordForRead(principal, tenant, object, ({
      Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: !user.disabled,
      UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
    })));
    return res.json({ records });
  }
  const object = tenant.objects.find((item) => item.apiName === objectName)!;
  return res.json({ records: (tenant.records[objectName] ?? [])
    .filter((record) => hasRecordAccess(principal, tenant, objectName, record, 'Read'))
    .map((record) => sanitizeRecordForRead(principal, tenant, object, record)) });
});
app.get('/api/records/:objectName/:recordId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  if (!tenant.objects.some((object) => object.apiName === objectName)) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectName}"` });
  const object = tenant.objects.find((item) => item.apiName === objectName)!;
  const requestedAppId = req.query.appId;
  const appId = typeof requestedAppId === 'string' && requestedAppId ? requestedAppId : 'Records';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(appId)) return res.status(400).json({ error: 'Invalid app API name' });
  if (!tenant.apps.some((app) => app.apiName === appId)) return res.status(400).json({ error: `Unknown Lightning app "${appId}"` });
  const requestedFormFactor = req.query.formFactor;
  if (requestedFormFactor !== undefined && requestedFormFactor !== 'Desktop' && requestedFormFactor !== 'Phone') {
    return res.status(400).json({ error: 'Form factor must be Desktop or Phone' });
  }
  const formFactor = requestedFormFactor === 'Phone' ? 'Phone' : 'Desktop';
  const resolvePage = (recordTypeId?: string) => resolveActiveLightningRecordPage(
    tenant,
    objectName,
    appId,
    recordTypeId,
    profileIdForPrincipal(principal, tenant),
    formFactor
  );
  if (objectName === 'User') {
    const user = state.users.find((item) => item.id === routeParam(req, 'recordId') && item.tenantId === principal.tenantId);
    if (!user) return res.status(404).json({ error: 'Record was not found' });
    const lightningPage = resolvePage();
    return res.json({ record: sanitizeRecordForRead(principal, tenant, object, ({
      Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: !user.disabled,
      UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
    })), ...(lightningPage ? { lightningPage } : {}) });
  }
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectName, record, 'Read')) return res.status(404).json({ error: 'Record was not found' });
  const recordTypeId = typeof record.RecordTypeId === 'string'
    ? record.RecordTypeId
    : object.recordTypes?.find((recordType) => recordType.active && recordType.isDefault)?.id
      ?? object.recordTypes?.find((recordType) => recordType.active)?.id;
  const lightningPage = resolvePage(recordTypeId);
  return res.json({
    record: sanitizeRecordForRead(principal, tenant, object, record),
    ...(lightningPage ? { lightningPage } : {})
  });
});
const activityInputSchema = z.object({
  kind: z.enum(['Task', 'Call', 'Event']),
  subject: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(''),
  status: z.enum(['Open', 'Completed']).default('Open'),
  dueAt: z.string().datetime().nullable().default(null)
}).strict();
const chatterPostInputSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
function interactionRecord(principal: Principal, tenant: TenantData, objectApiName: string, recordId: string, permission: 'read' | 'edit') {
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return { error: { status: 404, message: `Object "${objectApiName}" was not found` } } as const;
  const featureEnabled = object.settings?.allowActivities;
  if (permission === 'read' && !hasObjectPermission(principal, tenant, objectApiName, 'read')) {
    return { error: { status: 403, message: `Missing read permission for object "${objectApiName}"` } } as const;
  }
  if (permission === 'edit' && !hasObjectPermission(principal, tenant, objectApiName, 'edit')) {
    return { error: { status: 403, message: `Missing edit permission for object "${objectApiName}"` } } as const;
  }
  if (!featureEnabled) return { error: { status: 409, message: `Activities are disabled for object "${object.label}"` } } as const;
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, permission === 'read' ? 'Read' : 'Edit')) {
    return { error: { status: 404, message: 'Record was not found' } } as const;
  }
  return { object, record } as const;
}
app.get('/api/records/:objectName/:recordId/activities', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const context = interactionRecord(principal, tenant, objectApiName, recordId, 'read');
  if ('error' in context && context.error) return res.status(context.error.status).json({ error: context.error.message });
  const activities = tenant.activities
    .filter((activity) => activity.objectApiName === objectApiName && activity.recordId === recordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return res.json({ activities });
});
app.post('/api/records/:objectName/:recordId/activities', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const context = interactionRecord(principal, tenant, objectApiName, recordId, 'edit');
  if ('error' in context && context.error) return res.status(context.error.status).json({ error: context.error.message });
  const parsed = activityInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid activity', details: parsed.error.flatten() });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'Authenticated user is no longer active' });
  const activity = recordActivitySchema.parse({
    ...parsed.data, id: randomUUID(), objectApiName, recordId,
    createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString()
  });
  persistTenantRecords(principal.tenantId, { ...tenant, activities: [...tenant.activities, activity] });
  return res.status(201).json({ activity });
});
app.patch('/api/records/:objectName/:recordId/activities/:activityId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const context = interactionRecord(principal, tenant, objectApiName, recordId, 'edit');
  if ('error' in context && context.error) return res.status(context.error.status).json({ error: context.error.message });
  const parsed = z.object({ status: z.enum(['Open', 'Completed']) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid activity update', details: parsed.error.flatten() });
  const activityId = routeParam(req, 'activityId');
  const activity = tenant.activities.find((item) => item.id === activityId
    && item.objectApiName === objectApiName && item.recordId === recordId);
  if (!activity) return res.status(404).json({ error: 'Activity was not found' });
  const updatedActivity = { ...activity, status: parsed.data.status };
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    activities: tenant.activities.map((item) => item.id === activityId ? updatedActivity : item)
  });
  return res.json({ activity: updatedActivity });
});
app.get('/api/records/:objectName/:recordId/chatter', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectApiName}"` });
  if (!object.settings?.allowInChatter) return res.status(409).json({ error: `Chatter is disabled for object "${object.label}"` });
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Read')) return res.status(404).json({ error: 'Record was not found' });
  const posts = tenant.chatterPosts
    .filter((post) => post.objectApiName === objectApiName && post.recordId === record.Id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return res.json({ posts });
});
app.post('/api/records/:objectName/:recordId/chatter', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectApiName}"` });
  if (!object.settings?.allowInChatter) return res.status(409).json({ error: `Chatter is disabled for object "${object.label}"` });
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  const parsed = chatterPostInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Chatter post', details: parsed.error.flatten() });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'Authenticated user is no longer active' });
  const post = chatterPostSchema.parse({
    ...parsed.data, id: randomUUID(), objectApiName, recordId: record.Id,
    createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString(), comments: []
  });
  persistTenantRecords(principal.tenantId, { ...tenant, chatterPosts: [...tenant.chatterPosts, post] });
  return res.status(201).json({ post });
});
app.post('/api/records/:objectName/:recordId/chatter/:postId/comments', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectApiName}"` });
  if (!object.settings?.allowInChatter) return res.status(409).json({ error: `Chatter is disabled for object "${object.label}"` });
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  const parsed = chatterPostInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Chatter comment', details: parsed.error.flatten() });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'Authenticated user is no longer active' });
  const postId = routeParam(req, 'postId');
  const post = tenant.chatterPosts.find((item) => item.id === postId
    && item.objectApiName === objectApiName && item.recordId === record.Id);
  if (!post) return res.status(404).json({ error: 'Chatter post was not found' });
  const comment = chatterCommentSchema.parse({
    ...parsed.data, id: randomUUID(), createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString()
  });
  const updatedPost = { ...post, comments: [...post.comments, comment] };
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    chatterPosts: tenant.chatterPosts.map((item) => item.id === postId ? updatedPost : item)
  });
  return res.status(201).json({ post: updatedPost });
});
app.get('/api/records/:objectName/:recordId/history', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectName}"` });
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectName, record, 'Read')) return res.status(404).json({ error: 'Record was not found' });
  const fieldLabels = new Map(object.fields.map((field) => [field.apiName, field.label]));
  const users = new Map(state.users.map((user) => [user.id, user.name]));
  const history = tenant.fieldHistory.filter((entry) => entry.objectApiName === objectName && entry.recordId === recordId
    && hasFieldPermission(principal, tenant, objectName, entry.fieldApiName, 'read'))
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt))
    .map((entry) => ({
      ...entry,
      fieldLabel: fieldLabels.get(entry.fieldApiName) ?? entry.fieldApiName,
      changedByName: users.get(entry.changedBy) ?? 'Unknown User'
    }));
  return res.json({ history });
});
app.post('/api/campaigns/:campaignId/members', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const campaignObject = tenant.objects.find((object) => object.apiName === 'Campaign');
  const contactObject = tenant.objects.find((object) => object.apiName === 'Contact');
  if (!campaignObject || !contactObject) return res.status(404).json({ error: 'Campaign or Contact object is unavailable' });
  if (!contactObject.listViewButtons?.includes('Add to Campaign')) return res.status(403).json({ error: 'Add to Campaign is not enabled for Contact list views' });
  if (!hasObjectPermission(principal, tenant, 'Campaign', 'edit') || !hasObjectPermission(principal, tenant, 'Contact', 'read')) {
    return res.status(403).json({ error: 'Adding contacts requires Campaign edit and Contact read permissions' });
  }
  const campaignId = routeParam(req, 'campaignId');
  const campaign = (tenant.records.Campaign ?? []).find((record) => record.Id === campaignId);
  if (!campaign || !hasRecordAccess(principal, tenant, 'Campaign', campaign, 'Edit')) return res.status(404).json({ error: 'Campaign was not found' });
  if (campaign.IsActive === false) return res.status(422).json({ error: 'Contacts cannot be added to an inactive campaign' });
  if (!recordActionEnabled(campaignObject, 'Edit', typeof campaign.RecordTypeId === 'string' ? campaign.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Edit is not enabled for Campaign' });
  }
  const parsed = z.object({ contactIds: z.array(z.string().min(1)).min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide at least one Contact ID', details: parsed.error.flatten() });
  const contactIds = [...new Set(parsed.data.contactIds)];
  const contacts = tenant.records.Contact ?? [];
  const accessibleContacts = contactIds.map((id) => contacts.find((record) => record.Id === id))
    .filter((record): record is RuntimeRecord => Boolean(record && hasRecordAccess(principal, tenant, 'Contact', record, 'Read')));
  if (accessibleContacts.length !== contactIds.length) return res.status(404).json({ error: 'One or more Contacts were not found or are not accessible' });
  const existingContactIds = new Set(tenant.campaignMembers.filter((member) => member.campaignId === campaignId).map((member) => member.contactId));
  const newMembers = accessibleContacts.filter((contact) => !existingContactIds.has(contact.Id)).map((contact) => ({
    id: randomUUID(),
    campaignId,
    contactId: contact.Id,
    status: 'Sent' as const,
    createdBy: principal.userId,
    createdAt: new Date().toISOString()
  }));
  persistTenantRecords(principal.tenantId, { ...tenant, campaignMembers: [...tenant.campaignMembers, ...newMembers] });
  return res.status(201).json({ addedCount: newMembers.length, alreadyMemberCount: contactIds.length - newMembers.length });
});
app.post('/api/records/:objectName', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'ConnectorProvider__c' || objectName === 'IntegrationConnection__c') {
    return res.status(403).json({ error: 'Manage connector definitions and Integration Connections in Une Connectors Setup' });
  }
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be provisioned through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'create')) return res.status(403).json({ error: `Missing create permission for object "${objectName}"` });
  const parsed = z.record(z.unknown()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Record values must be an object' });
  const requestedCloneId = req.query.cloneFromId;
  if (requestedCloneId !== undefined && (typeof requestedCloneId !== 'string' || !requestedCloneId.trim())) {
    return res.status(400).json({ error: 'cloneFromId must be a non-empty record ID' });
  }
  const cloneSource = typeof requestedCloneId === 'string'
    ? (tenant.records[objectName] ?? []).find((record) => record.Id === requestedCloneId)
    : undefined;
  if (typeof requestedCloneId === 'string'
    && (!cloneSource || !hasRecordAccess(principal, tenant, objectName, cloneSource, 'Read'))) {
    return res.status(404).json({ error: 'Clone source record was not found' });
  }
  const recordTypeId = typeof parsed.data.RecordTypeId === 'string'
    ? parsed.data.RecordTypeId
    : typeof cloneSource?.RecordTypeId === 'string' ? cloneSource.RecordTypeId : undefined;
  if (recordTypeId && !hasRecordTypeAccessForUser(principal.userId, tenant, objectName, recordTypeId)) {
    return res.status(403).json({ error: `Record type "${recordTypeId}" is not assigned to this user for "${objectName}".` });
  }
  if (!recordActionEnabled(object, 'New', recordTypeId, profileIdForPrincipal(principal, tenant))) return res.status(403).json({ error: 'New is not enabled for this object, list view, or page layout' });
  try {
    const working = structuredClone(tenant);
    const cloneValues: Record<string, unknown> = {};
    if (cloneSource) {
      for (const field of object.fields) {
        if (['Id', 'OwnerId', 'CreatedDate', 'LastModifiedDate'].includes(field.apiName) || field.formula
          || field.dataType === 'AutoNumber' || field.dataType === 'Auto Number'
          || !Object.hasOwn(cloneSource, field.apiName)
          || !hasFieldPermission(principal, tenant, objectName, field.apiName, 'read')
          || !hasFieldPermission(principal, tenant, objectName, field.apiName, 'edit')) continue;
        cloneValues[field.apiName] = cloneSource[field.apiName];
      }
      if (recordTypeId) cloneValues.RecordTypeId = recordTypeId;
    }
    const sanitized = sanitizeRecordValues(object, { ...cloneValues, ...parsed.data });
    assertFieldEditPermissions(principal, tenant, object, sanitized);
    if (sanitized.OwnerId !== undefined && sanitized.OwnerId !== principal.userId) {
      const queue = typeof sanitized.OwnerId === 'string'
        ? tenant.accessControl.queues.find((item) => item.id === sanitized.OwnerId
          && item.supportedObjectApiNames.includes(objectName))
        : undefined;
      if (!queue || (!queueContainsUser(queue, principal.userId, tenant)
        && !hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')
        && !principal.permissions.includes('security:manage'))) {
        return res.status(403).json({ error: 'Records can only be assigned to a queue you belong to or one you can manage' });
      }
    }
    const values = applyRecordDefaults(principal.tenantId, working, object, sanitized, principal.userId);
    validateRuntimeRecord(principal.tenantId, working, object, values);
    const now = new Date().toISOString();
    const isClone = cloneSource !== undefined;
    let record = calculateFormulaFields(object, stampRecordAuditFields({ ...values, Id: randomUUID(), CreatedDate: now, LastModifiedDate: now }, principal.userId, now), {
      ...formulaContextForUser(working, principal.userId), isClone
    });
    await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record, undefined, 0, isClone);
    const beforeSaveValues = normalizeFlowRecordAssignments(object, record, values);
    record = calculateFormulaFields(object, record, { ...formulaContextForUser(working, principal.userId), isClone });
    record = withCaseClosedDate(objectName, record);
    validateRuntimeRecord(principal.tenantId, working, object, { ...values, ...beforeSaveValues }, record);
    working.records[objectName] = [...(working.records[objectName] ?? []), record];
    await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record, undefined, 0, isClone);
    persistTenantRecords(principal.tenantId, working);
    return res.status(201).json({ record: sanitizeRecordForRead(principal, working, object, working.records[objectName].find((item) => item.Id === record.Id) ?? record) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record creation failed' });
  }
});
app.post('/api/records/:objectName/import', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be provisioned through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'create')) return res.status(403).json({ error: `Missing create permission for object "${objectName}"` });
  if (!object.listViewButtons?.includes('Import')) return res.status(403).json({ error: 'Import is not enabled for this object' });
  const parsed = z.object({ records: z.array(z.record(z.unknown())).min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Import requires at least one record row', details: parsed.error.flatten() });
  const working = structuredClone(tenant);
  const created: RuntimeRecord[] = [];
  try {
    for (const [index, row] of parsed.data.records.entries()) {
      if (Object.hasOwn(row, 'OwnerId')) throw new Error(`Row ${index + 1}: OwnerId cannot be set during import.`);
      const values = sanitizeRecordValues(object, row);
      assertFieldEditPermissions(principal, tenant, object, values);
      const recordTypeId = typeof values.RecordTypeId === 'string' ? values.RecordTypeId : undefined;
      if (recordTypeId && !hasRecordTypeAccessForUser(principal.userId, tenant, objectName, recordTypeId)) {
        throw new Error(`Row ${index + 1}: Record type "${recordTypeId}" is not assigned to this user.`);
      }
      if (!recordActionEnabled(object, 'New', recordTypeId, profileIdForPrincipal(principal, tenant))) {
        throw new Error(`Row ${index + 1}: New is not enabled for this object, list view, or page layout.`);
      }
      const defaulted = applyRecordDefaults(principal.tenantId, working, object, values, principal.userId);
      validateRuntimeRecord(principal.tenantId, working, object, defaulted);
      const now = new Date().toISOString();
      let record = calculateFormulaFields(object, stampRecordAuditFields({ ...defaulted, Id: randomUUID(), CreatedDate: now, LastModifiedDate: now }, principal.userId, now), formulaContextForUser(working, principal.userId));
      await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record);
      const beforeSaveValues = normalizeFlowRecordAssignments(object, record, defaulted);
      record = calculateFormulaFields(object, record, formulaContextForUser(working, principal.userId));
      record = withCaseClosedDate(objectName, record);
      validateRuntimeRecord(principal.tenantId, working, object, { ...defaulted, ...beforeSaveValues }, record);
      working.records[objectName] = [...(working.records[objectName] ?? []), record];
      created.push(record);
    }
    for (const record of created) {
      await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record);
    }
    persistTenantRecords(principal.tenantId, working);
    const savedRecords = created.map((record) => working.records[objectName].find((item) => item.Id === record.Id) ?? record);
    return res.status(201).json({ records: savedRecords.map((record) => sanitizeRecordForRead(principal, working, object, record)), count: savedRecords.length });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record import failed' });
  }
});
app.put('/api/records/:objectName/:recordId/owner', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be managed through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectName}"` });
  if (!hasObjectWidePermission(principal, tenant, objectName, 'modifyAll') && !principal.permissions.includes('security:manage')) {
    return res.status(403).json({ error: 'Changing record ownership requires Modify All or security management access' });
  }
  const parsed = z.object({ ownerId: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid ownerId is required' });
  const ownerField = object.fields.find((field) => field.apiName === 'OwnerId' && field.relationship?.targetObject === 'User');
  if (!ownerField) return res.status(400).json({ error: `Object "${objectName}" does not support record ownership` });
  if (!object.listViewButtons?.includes('Change Owner')) {
    return res.status(403).json({ error: 'Change Owner is not enabled for this object’s list views' });
  }
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  if (!recordActionEnabled(object, 'Edit', typeof existing.RecordTypeId === 'string' ? existing.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Edit is not enabled for this object or page layout' });
  }
  const owner = state.users.find((user) => user.id === parsed.data.ownerId && user.tenantId === principal.tenantId && !user.disabled);
  const ownerQueue = tenant.accessControl.queues.find((queue) =>
    queue.id === parsed.data.ownerId && queue.supportedObjectApiNames.includes(objectName));
  if (!owner && !ownerQueue) return res.status(422).json({ error: 'The selected owner is not an active tenant user or eligible queue' });
  try {
    const working = structuredClone(tenant);
    const values = sanitizeRecordValues(object, { [ownerField.apiName]: parsed.data.ownerId });
    assertFieldEditPermissions(principal, tenant, object, values);
    const now = new Date().toISOString();
    let updated = calculateFormulaFields(object, stampRecordAuditFields({ ...existing, ...values, LastModifiedDate: now }, principal.userId, now, existing), formulaContextForUser(working, principal.userId));
    await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    const beforeSaveValues = normalizeFlowRecordAssignments(object, updated, existing);
    updated = calculateFormulaFields(object, updated, formulaContextForUser(working, principal.userId));
    updated = withCaseClosedDate(objectName, updated, existing);
    validateRuntimeRecord(principal.tenantId, working, object, { ...values, ...beforeSaveValues }, updated);
    appendFieldHistory(working, object, existing, updated, principal.userId);
    working.records[objectName] = (working.records[objectName] ?? []).map((item) => item.Id === existing.Id ? updated : item);
    await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    persistTenantRecords(principal.tenantId, working);
    return res.json({ record: sanitizeRecordForRead(principal, working, object, working.records[objectName].find((item) => item.Id === existing.Id) ?? updated) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record ownership change failed' });
  }
});
app.put('/api/records/:objectName/:recordId', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'ConnectorProvider__c' || objectName === 'IntegrationConnection__c') {
    return res.status(403).json({ error: 'Manage connector definitions and Integration Connections in Une Connectors Setup' });
  }
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be managed through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectName}"` });
  const parsed = z.record(z.unknown()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Record values must be an object' });
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  if (Object.hasOwn(parsed.data, 'OwnerId')) {
    return res.status(403).json({ error: 'OwnerId cannot be changed through record updates; use a dedicated ownership operation to transfer ownership' });
  }
  if (!recordActionEnabled(object, 'Edit', typeof existing.RecordTypeId === 'string' ? existing.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Edit is not enabled for this object or page layout' });
  }
  if (typeof parsed.data.RecordTypeId === 'string'
    && parsed.data.RecordTypeId !== existing.RecordTypeId
    && !hasRecordTypeAccessForUser(principal.userId, tenant, objectName, parsed.data.RecordTypeId)) {
    return res.status(403).json({ error: `Record type "${parsed.data.RecordTypeId}" is not assigned to this user for "${objectName}".` });
  }
  try {
    const working = structuredClone(tenant);
    const values = sanitizeRecordValues(object, parsed.data);
    assertFieldEditPermissions(principal, tenant, object, values);
    if (object.fields.some((field) => field.dataType === 'AutoNumber' || field.dataType === 'Auto Number')) {
      for (const field of object.fields.filter((item) => item.dataType === 'AutoNumber' || item.dataType === 'Auto Number')) {
        if (Object.hasOwn(values, field.apiName)) throw new Error(`Auto-number field "${field.apiName}" cannot be changed.`);
      }
    }
    const now = new Date().toISOString();
    let updated = calculateFormulaFields(object, stampRecordAuditFields({ ...existing, ...values, LastModifiedDate: now }, principal.userId, now, existing), formulaContextForUser(working, principal.userId));
    await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    const beforeSaveValues = normalizeFlowRecordAssignments(object, updated, existing);
    updated = calculateFormulaFields(object, updated, formulaContextForUser(working, principal.userId));
    validateRelationshipReparenting(object, existing, updated);
    validateRuntimeRecord(principal.tenantId, working, object, { ...values, ...beforeSaveValues }, updated);
    appendFieldHistory(working, object, existing, updated, principal.userId);
    working.records[objectName] = (working.records[objectName] ?? []).map((item) => item.Id === existing.Id ? updated : item);
    await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    persistTenantRecords(principal.tenantId, working);
    return res.json({ record: sanitizeRecordForRead(principal, working, object, working.records[objectName].find((item) => item.Id === existing.Id) ?? updated) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record update failed' });
  }
});
app.delete('/api/records/:objectName/:recordId', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'ConnectorProvider__c' || objectName === 'IntegrationConnection__c') {
    return res.status(403).json({ error: 'Manage connector definitions and Integration Connections in Une Connectors Setup' });
  }
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be managed through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'delete')) return res.status(403).json({ error: `Missing delete permission for object "${objectName}"` });
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Delete')) return res.status(404).json({ error: 'Record was not found' });
  if (!recordActionEnabled(object, 'Delete', typeof existing.RecordTypeId === 'string' ? existing.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Delete is not enabled for this object or page layout' });
  }
  try {
    const working = structuredClone(tenant);
    await deleteRecordCascade(principal.tenantId, working, principal.userId, objectName, existing);
    persistTenantRecords(principal.tenantId, working);
    return res.status(204).end();
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record deletion failed' });
  }
});
function validateFlowInputValues(flow: FlowMetadata, values: Record<string, unknown>): string | undefined {
  const inputResources = flow.resources.filter((resource) => resource.availableForInput);
  for (const [name, value] of Object.entries(values)) {
    const resource = inputResources.find((candidate) => candidate.name === name);
    if (!resource) return `Resource "${name}" is not available for input`;
    const dataType = resource.dataType.toLowerCase();
    const invalid = (): string => `Input "${resource.label}" must be a valid ${resource.dataType} value`;
    if (['number', 'currency', 'percent'].some((type) => dataType.startsWith(type))) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return invalid();
    } else if (['boolean', 'checkbox'].includes(dataType)) {
      if (typeof value !== 'boolean') return invalid();
    } else if (dataType === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
        || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) return invalid();
    } else if (dataType === 'date/time' || dataType === 'datetime') {
      if (typeof value !== 'string' || !isValidFlowDateTime(value)) return invalid();
    } else if (dataType === 'time') {
      if (typeof value !== 'string' || !isValidFlowTime(value)) return invalid();
    } else if (['text', 'string', 'email', 'phone', 'url', 'id', 'picklist', 'multi-select picklist'].includes(dataType)) {
      if (dataType === 'multi-select picklist'
        ? (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
        : typeof value !== 'string') return invalid();
    } else if (resource.type === 'Record') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();
    } else if (resource.type === 'Record Collection') {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
        return invalid();
      }
    } else {
      return `Input "${resource.label}" uses unsupported data type "${resource.dataType}"`;
    }
  }
  return undefined;
}

app.post('/api/flows/:apiName/execute', accessAuthentication, requirePermission('flows:run'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const flow = tenant.flows.find((item) => item.apiName === apiName);
  if (!flow) return res.status(404).json({ error: `Flow "${apiName}" was not found` });
  if (flow.flowType !== 'Autolaunched Flow' && flow.flowType !== 'Screen Flow') return res.status(400).json({ error: 'Only autolaunched and screen flows can be invoked through this endpoint' });
  const input = z.record(z.unknown()).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Flow input values must be an object' });
  const inputError = validateFlowInputValues(flow, input.data);
  if (inputError) return res.status(400).json({ error: inputError });
  const validation = validateFlow(
    flow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections,
    tenant.connectorDefinitions, tenant.emailAlerts, formulaContextForUser(tenant, principal.userId), tenant.flows,
    tenant.approvalProcesses, tenant.platformEvents
  );
  if (!validation.valid) return res.status(422).json({ error: 'Flow execution validation failed', details: validation.errors });
  try {
    const working = structuredClone(tenant);
    const result = await executeFlow(flow, working, principal.tenantId, principal.userId, input.data, undefined, undefined, 0, undefined, 0, undefined, false, undefined, true);
    if (result.status === 'waiting') {
      const interview = createFlowInterview(flow, principal.userId, result);
      working.interviews = [...working.interviews, interview];
      persistTenantRecords(principal.tenantId, working);
      return res.status(202).json(result.kind === 'screen'
        ? { interviewId: interview.id, screen: result.screen, outcomes: result.outcomes, values: result.variables }
        : { interviewId: interview.id, waitUntil: result.waitUntil });
    }
    persistTenantRecords(principal.tenantId, working);
    return res.json({ outputs: result.outputs });
  } catch (error) {
    persistFlowFailure(principal.tenantId, flow, 'Manual', error, principal.userId);
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Flow execution failed' });
  }
});
app.post('/api/flows/:apiName/debug', accessAuthentication, requirePermission('flows:run'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const flow = tenant.flows.find((item) => item.apiName === apiName);
  if (!flow) return res.status(404).json({ error: `Flow "${apiName}" was not found` });
  if (flow.flowType !== 'Autolaunched Flow' && flow.flowType !== 'Screen Flow') {
    return res.status(400).json({ error: 'Only autolaunched and screen flows can be debugged from Flow Builder' });
  }
  const input = z.record(z.unknown()).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Flow debug inputs must be an object' });
  const inputError = validateFlowInputValues(flow, input.data);
  if (inputError) return res.status(400).json({ error: inputError });
  const validation = validateFlow(
    flow, tenant.objects, tenant.namedCredentials, tenant.integrationConnections,
    tenant.connectorDefinitions, tenant.emailAlerts, formulaContextForUser(tenant, principal.userId), tenant.flows,
    tenant.approvalProcesses, tenant.platformEvents
  );
  if (!validation.valid) return res.status(422).json({ error: 'Flow debug validation failed', details: validation.errors });
  const debugTrace: FlowDebugTraceEntry[] = [];
  try {
    const working = structuredClone(tenant);
    const result = await executeFlow(
      flow, working, principal.tenantId, principal.userId, input.data,
      undefined, undefined, 0, undefined, 0, undefined, false, undefined, true, true, debugTrace
    );
    return res.json({ ...result, sideEffectsSimulated: true });
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : 'Flow debug failed',
      debugTrace,
      sideEffectsSimulated: true
    });
  }
});
app.post('/api/flow-interviews/:interviewId/next', accessAuthentication, requirePermission('flows:run'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const interviewId = routeParam(req, 'interviewId');
  const tenant = tenantData(principal.tenantId)!;
  const interview = tenant.interviews.find((item) => item.id === interviewId && item.userId === principal.userId);
  if (!interview) return res.status(404).json({ error: 'Flow interview was not found' });
  if (interview.kind !== 'screen') return res.status(409).json({ error: 'Wait interviews are resumed by the runtime scheduler' });
  if (Date.parse(interview.expiresAt) <= Date.now()) {
    const updated = { ...tenant, interviews: tenant.interviews.filter((item) => item.id !== interviewId) };
    persistTenantRecords(principal.tenantId, updated);
    return res.status(410).json({ error: 'Flow interview has expired' });
  }
  const flow = tenant.flows.find((item) => item.apiName === interview.flowApiName
    && ((item.status === 'Active' && item.activeVersion === interview.versionNumber)
      || (item.status === 'Draft' && item.versionNumber === interview.versionNumber)));
  if (!flow) return res.status(409).json({ error: 'The flow interview version is no longer active' });
  const values = z.object({
    values: z.record(z.unknown()).default({}),
    outcome: z.string().optional(),
    action: z.enum(['next', 'back']).default('next')
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
    persistTenantRecords(principal.tenantId, {
      ...tenant,
      interviews: tenant.interviews.map((item) => item.id === interviewId ? restored : item)
    });
    const outcomes = asConfigRows(previousScreen.config.outcomes).map((outcome, index) => ({
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
  const configuredOutcomes = asConfigRows(screen.config.outcomes).map((outcome, index) => ({
    name: typeof outcome.name === 'string' ? outcome.name : `Outcome_${index + 1}`,
    label: typeof outcome.label === 'string' ? outcome.label : `Outcome ${index + 1}`
  }));
  const screenOutcomes = configuredOutcomes.length ? configuredOutcomes : [{ name: 'Default', label: 'Next' }];
  const selectedOutcome = values.data.outcome ?? screenOutcomes.find((outcome) => outcome.name === 'Default')?.label ?? screenOutcomes[0].label;
  const outcomeDefinition = screenOutcomes.find((outcome) => outcome.label === selectedOutcome || outcome.name === selectedOutcome);
  if (!outcomeDefinition) return res.status(400).json({ error: `Screen outcome "${selectedOutcome}" does not exist` });
  const screenFields = asConfigRows(screen.config.fields).filter((field) => !['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
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
    ...formulaContextForUser(tenant, principal.userId),
    flowVariables: flowVariablesForUser(tenant, principal.userId, interview.id, interview.createdAt),
    variables: visibilityValues
  };
  const screenValues: Record<string, unknown> = {};
  for (const field of screenFields) {
    const name = typeof field.apiName === 'string' ? field.apiName : String(field.label ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const visibilityConditions = asConfigRows(field.visibilityConditions);
    if (visibilityConditions.length && !flowConditionsMatch(
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
        if (!targetObject || !hasObjectPermission(principal, tenant, objectApiName, 'read')
          || (field.multipleSelections === true ? !Array.isArray(value) : Array.isArray(value))
          || selectedIds.some((id) => typeof id !== 'string' || !id)
          || new Set(selectedIds).size !== selectedIds.length) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" contains an invalid choice selection` });
        }
        const records = tenant.records[objectApiName] ?? [];
        if (selectedIds.some((id) => !records.some((record) =>
          record.Id === id && hasRecordAccess(principal, tenant, objectApiName, record, 'Read')))) {
          return res.status(400).json({ error: `Selected choice for screen field "${String(field.label ?? name)}" was not found or is not readable` });
        }
      }
      if (type === 'Lookup' && value !== '') {
        const objectApiName = typeof field.objectApiName === 'string' ? field.objectApiName : '';
        const targetObject = tenant.objects.find((object) => object.apiName === objectApiName);
        if (typeof value !== 'string' || !targetObject || !hasObjectPermission(principal, tenant, objectApiName, 'read')) {
          return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must select a readable record from its target object` });
        }
        const recordExists = objectApiName === 'User'
          ? state.users.some((user) => user.id === value && user.tenantId === principal.tenantId)
          : (tenant.records[objectApiName] ?? []).some((record) =>
            record.Id === value && hasRecordAccess(principal, tenant, objectApiName, record, 'Read'));
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
        const subfields = asConfigRows(field.subfields);
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
              || (subfieldType === 'Email' && (typeof subvalue !== 'string' || !z.string().email().safeParse(subvalue).success))
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
      if (type === 'Email' && (typeof value !== 'string' || !z.string().email().safeParse(value).success)) {
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
      if (type === 'URL' && (typeof value !== 'string' || !z.string().url().safeParse(value).success)) {
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
          if (!isSafeFlowRegex(field.pattern)) throw new Error('pattern syntax is not supported');
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
      if (type === 'Date/Time' && (typeof value !== 'string' || !isValidFlowDateTime(value))) {
        return res.status(400).json({ error: `Screen field "${String(field.label ?? name)}" must be a valid date and time` });
      }
      if (type === 'Time' && (typeof value !== 'string' || !isValidFlowTime(value))) {
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
        ...formulaContextForUser(tenant, principal.userId),
        flowVariables: flowVariablesForUser(tenant, principal.userId, interview.id, interview.createdAt),
        variables
      };
      const outputs = Object.fromEntries(flow.resources.filter((resource) => resource.availableForOutput)
        .map((resource) => [resource.name, resolveFlowValue(`{${resource.name}}`, outputContext)]));
      persistTenantRecords(principal.tenantId, working);
      return res.json({ completed: true, outputs });
    }
    const result = await executeFlow(flow, working, principal.tenantId, principal.userId, {}, interview.record ?? undefined, interview.prior ?? undefined, 0, {
      startAt: nextElementId, variables, interviewGuid: interview.id, interviewStartTime: interview.createdAt
    }, 0, undefined, false, undefined, true);
    if (result.status === 'waiting') {
      const updatedInterview = createFlowInterview(flow, principal.userId, result);
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
      persistTenantRecords(principal.tenantId, working);
      return res.status(202).json(result.kind === 'screen'
        ? { interviewId, screen: result.screen, outcomes: result.outcomes, values: result.variables, canGoBack: updatedInterview.history.length > 0 }
        : { interviewId, waitUntil: result.waitUntil });
    }
    working.interviews = working.interviews.filter((item) => item.id !== interviewId);
    persistTenantRecords(principal.tenantId, working);
    return res.json({ completed: true, outputs: result.outputs });
  } catch (error) {
    persistFlowFailure(principal.tenantId, flow, 'Manual', error, principal.userId);
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Flow execution failed' });
  }
});
function hasDefaultComponentExport(compiledJs: string): boolean {
  return /\bexports\.default\b|\bdefault\s*:/.test(compiledJs);
}

function scopeLibraryCss(cssSource: string, apiName: string): string {
  const root = postcss.parse(cssSource, { from: `${apiName}.css` });
  const scopeClass = `metadrive-component-${apiName.toLowerCase()}`;
  root.walkRules((rule) => {
    let parent = rule.parent;
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
      parent = parent.parent;
    }
    rule.selector = selectorParser((selectors) => {
      selectors.each((selector) => {
        const rootPseudo = selector.nodes[0]?.type === 'pseudo' && selector.nodes[0].value === ':root';
        if (rootPseudo) {
          selector.nodes.splice(0, 1, selectorParser.className({ value: scopeClass }));
        } else {
          selector.prepend(selectorParser.combinator({ value: ' ' }));
          selector.prepend(selectorParser.className({ value: scopeClass }));
        }
      });
    }).processSync(rule.selector);
  });
  return root.toString();
}

type LibraryComponentUsage = { tenantId: string; surface: 'page' | 'dashboard' | 'flow'; label: string };
function containsLibraryComponentReference(value: unknown, apiName: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsLibraryComponentReference(item, apiName));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    (/component(?:api)?name/i.test(key) && item === apiName)
    || containsLibraryComponentReference(item, apiName));
}
function findLibraryComponentUsages(platformState: PlatformState, apiName: string): LibraryComponentUsage[] {
  const usages: LibraryComponentUsage[] = [];
  for (const [tenantId, tenant] of Object.entries(platformState.tenants)) {
    for (const page of tenant.pages) {
      if (page.components.some((component) => component.type === `Custom:${apiName}`
        || containsLibraryComponentReference(component.properties, apiName))) {
        usages.push({ tenantId, surface: 'page', label: page.label });
      }
    }
    for (const dashboard of tenant.dashboards) {
      if (dashboard.components.some((component) => component.customComponentApiName === apiName)) {
        usages.push({ tenantId, surface: 'dashboard', label: dashboard.label });
      }
    }
    for (const flow of tenant.flows) {
      if (containsLibraryComponentReference([
        flow.startConfig,
        flow.elements.map((element) => element.config),
        flow.resources,
        flow.versions
      ], apiName)) {
        usages.push({ tenantId, surface: 'flow', label: flow.label });
      }
    }
  }
  return usages;
}
function usageBlockerDetails(usages: LibraryComponentUsage[], tenantId: string) {
  const own = usages.filter((usage) => usage.tenantId === tenantId)
    .map(({ surface, label }) => `${surface} "${label}"`);
  const otherTenantCount = new Set(usages.filter((usage) => usage.tenantId !== tenantId).map((usage) => usage.tenantId)).size;
  if (otherTenantCount) own.push(`references in ${otherTenantCount} other tenant${otherTenantCount === 1 ? '' : 's'}`);
  return own;
}

let bundledComponentSync: Promise<void> | null = null;
function syncBundledLibraryComponents(): Promise<void> {
  if (bundledComponentSync) return bundledComponentSync;
  bundledComponentSync = (async () => {
    const manifestPath = resolve(bundledCustomComponentsPath, 'manifest.json');
    const manifest = z.array(z.object({
      apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      label: z.string().trim().min(1).max(80),
      description: z.string().max(500),
      surfaces: z.array(z.enum(['page', 'dashboard', 'flow'])).min(1),
      resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
      jsx: z.string().min(1),
      css: z.string().min(1)
    })).parse(JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')));
    const imported: LibraryComponent[] = [];
    for (const entry of manifest) {
      if (state.libraryComponents.some((component) => component.apiName.toLowerCase() === entry.apiName.toLowerCase())) continue;
      const jsxPath = resolve(bundledCustomComponentsPath, entry.jsx);
      const cssPath = resolve(bundledCustomComponentsPath, entry.css);
      const jsxRelativePath = relative(bundledCustomComponentsPath, jsxPath);
      const cssRelativePath = relative(bundledCustomComponentsPath, cssPath);
      if (jsxRelativePath.startsWith('..') || cssRelativePath.startsWith('..')
        || isAbsolute(jsxRelativePath) || isAbsolute(cssRelativePath)) {
        throw new Error(`Component "${entry.apiName}" contains a source path outside the bundled component directory`);
      }
      const input = libraryComponentInputSchema.parse({
        apiName: entry.apiName,
        label: entry.label,
        description: entry.description,
        surfaces: entry.surfaces,
        resize: entry.resize,
        jsxSource: readFileSync(jsxPath, 'utf8'),
        cssSource: readFileSync(cssPath, 'utf8')
      });
      const compiled = await transform(input.jsxSource, {
        loader: 'tsx',
        format: 'cjs',
        target: 'es2020',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        sourcefile: `${input.apiName}.tsx`
      });
      if (!hasDefaultComponentExport(compiled.code)) {
        throw new Error(`Bundled component "${input.apiName}" must export a default React component`);
      }
      if (/\brequire\s*\(/.test(compiled.code)) {
        throw new Error(`Bundled component "${input.apiName}" cannot import external modules`);
      }
      imported.push({
        ...input,
        compiledJs: compiled.code,
        scopedCss: scopeLibraryCss(input.cssSource, input.apiName),
        version: 1,
        updatedAt: new Date().toISOString()
      });
    }
    if (imported.length) {
      const nextState = { ...state, libraryComponents: [...state.libraryComponents, ...imported] };
      persistState(nextState);
      state = nextState;
    }
  })().catch((error: unknown) => {
    bundledComponentSync = null;
    throw error;
  });
  return bundledComponentSync;
}

app.get('/api/component-library', requirePermission('metadata:read'), async (_req: Request, res: Response) => {
  try {
    await syncBundledLibraryComponents();
  } catch (error) {
    console.error('Unable to register bundled custom components', error);
    return res.status(500).json({ error: `Unable to register bundled custom components: ${error instanceof Error ? error.message : String(error)}` });
  }
  const principal = getPrincipal(res);
  res.json({
    components: state.libraryComponents,
    canManage: principal.permissions.includes('components:manage')
  });
});
app.post('/api/component-library', requirePermission('components:manage'), async (req: Request, res: Response) => {
  const parsed = libraryComponentInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid custom component metadata', details: parsed.error.flatten() });
  if (state.libraryComponents.some((component) => component.apiName.toLowerCase() === parsed.data.apiName.toLowerCase())) {
    return res.status(409).json({ error: `A library component named "${parsed.data.apiName}" already exists` });
  }
  try {
    const compiled = await transform(parsed.data.jsxSource, {
      loader: 'tsx',
      format: 'cjs',
      target: 'es2020',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      sourcefile: `${parsed.data.apiName}.tsx`
    });
    if (!hasDefaultComponentExport(compiled.code)) {
      return res.status(400).json({ error: 'The JSX file must export a default React component' });
    }
    if (/\brequire\s*\(/.test(compiled.code)) {
      return res.status(400).json({ error: 'Custom components must be self-contained and cannot import external modules' });
    }
    const scopedCss = scopeLibraryCss(parsed.data.cssSource, parsed.data.apiName);
    const component: LibraryComponent = {
      ...parsed.data,
      compiledJs: compiled.code,
      scopedCss,
      version: 1,
      updatedAt: new Date().toISOString()
    };
    const nextState = { ...state, libraryComponents: [...state.libraryComponents, component] };
    persistState(nextState);
    state = nextState;
    return res.status(201).json({ component });
  } catch (error) {
    return res.status(400).json({ error: `Unable to compile component: ${error instanceof Error ? error.message : String(error)}` });
  }
});
app.put('/api/component-library/:apiName', requirePermission('components:manage'), async (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const parsed = libraryComponentInputSchema.safeParse({ ...req.body, apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid custom component metadata', details: parsed.error.flatten() });
  const existingIndex = state.libraryComponents.findIndex((component) => component.apiName === apiName);
  if (existingIndex < 0) return res.status(404).json({ error: 'Library component was not found' });
  const principal = getPrincipal(res);
  const existing = state.libraryComponents[existingIndex];
  const usages = findLibraryComponentUsages(state, apiName);
  const unavailableSurfaces = existing.surfaces.filter((surface) =>
    !parsed.data.surfaces.includes(surface) && usages.some((usage) => usage.surface === surface));
  if (unavailableSurfaces.length) {
    const blockers = usageBlockerDetails(usages.filter((usage) => unavailableSurfaces.includes(usage.surface)), principal.tenantId);
    return res.status(409).json({
      error: `Cannot remove ${unavailableSurfaces.join(', ')} surface${unavailableSurfaces.length === 1 ? '' : 's'} while components are in use: ${blockers.join('; ')}`,
      dependencies: blockers
    });
  }
  try {
    const compiled = await transform(parsed.data.jsxSource, {
      loader: 'tsx',
      format: 'cjs',
      target: 'es2020',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      sourcefile: `${apiName}.tsx`
    });
    if (!hasDefaultComponentExport(compiled.code)) {
      return res.status(400).json({ error: 'The JSX file must export a default React component' });
    }
    if (/\brequire\s*\(/.test(compiled.code)) {
      return res.status(400).json({ error: 'Custom components must be self-contained and cannot import external modules' });
    }
    const component: LibraryComponent = {
      ...parsed.data,
      compiledJs: compiled.code,
      scopedCss: scopeLibraryCss(parsed.data.cssSource, apiName),
      version: state.libraryComponents[existingIndex].version + 1,
      updatedAt: new Date().toISOString()
    };
    const libraryComponents = [...state.libraryComponents];
    libraryComponents[existingIndex] = component;
    const nextState = { ...state, libraryComponents };
    persistState(nextState);
    state = nextState;
    return res.json({ component });
  } catch (error) {
    return res.status(400).json({ error: `Unable to compile component: ${error instanceof Error ? error.message : String(error)}` });
  }
});
app.delete('/api/component-library/:apiName', requirePermission('components:manage'), (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  if (!state.libraryComponents.some((component) => component.apiName === apiName)) return res.status(404).json({ error: 'Library component was not found' });
  const principal = getPrincipal(res);
  const usages = findLibraryComponentUsages(state, apiName);
  if (usages.length) {
    const dependencies = usageBlockerDetails(usages, principal.tenantId);
    return res.status(409).json({
      error: `This component is still used by ${dependencies.join('; ')}. Remove those references before deleting it.`,
      dependencies
    });
  }
  const nextState = { ...state, libraryComponents: state.libraryComponents.filter((component) => component.apiName !== apiName) };
  persistState(nextState);
  state = nextState;
  return res.status(204).end();
});

const dashboardFolderInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  shares: z.array(dashboardFolderShareSchema).default([])
});
app.get('/api/metadata/dashboard-folders', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const canManageAll = principal.permissions.includes('dashboards:manage');
  return res.json({
    folders: (tenant.dashboardFolders ?? [])
      .filter((folder) => canManageAll || folderAccessLevelForUser(tenant, folder.id, principal.userId) !== null)
      .map((folder) => folderForUser(tenant, folder, principal.userId, canManageAll)),
    canManageAll
  });
});
app.post('/api/metadata/dashboard-folders', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const parsed = dashboardFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId) {
    const parent = tenant.dashboardFolders.find((folder) => folder.id === parsed.data.parentFolderId);
    if (!parent) return res.status(400).json({ error: 'Parent dashboard folder was not found' });
    const parentLevel = folderAccessLevelForUser(tenant, parent.id, principal.userId);
    if (!principal.permissions.includes('dashboards:manage') && parentLevel !== 'Manager') {
      return res.status(403).json({ error: 'Manager access to the parent folder is required to create a subfolder' });
    }
  } else if (!principal.permissions.includes('metadata:write') && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Metadata write access or dashboard administration is required to create a top-level folder' });
  }
  const duplicate = tenant.dashboardFolders.some((folder) =>
    folder.parentFolderId === parsed.data.parentFolderId && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase());
  if (duplicate) return res.status(409).json({ error: 'A folder with this name already exists at that level' });
  const shareError = validateDashboardFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const now = new Date().toISOString();
  const folder = dashboardFolderSchema.parse({
    ...parsed.data,
    id: randomUUID(),
    ownerUserId: principal.userId,
    createdAt: now,
    updatedAt: now
  });
  const updatedTenant = { ...tenant, dashboardFolders: [...tenant.dashboardFolders, folder] };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.status(201).json({ folder: folderForUser(updatedTenant, folder, principal.userId, principal.permissions.includes('dashboards:manage')) });
});
app.put('/api/metadata/dashboard-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const current = tenant.dashboardFolders.find((folder) => folder.id === folderId);
  if (!current) return res.status(404).json({ error: 'Dashboard folder was not found' });
  if (current.ownerUserId !== principal.userId
    && folderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager'
    && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Manager access to this folder is required to update it or its grants' });
  }
  const parsed = dashboardFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId === folderId) return res.status(400).json({ error: 'A folder cannot be its own parent' });
  if (parsed.data.parentFolderId) {
    const parent = tenant.dashboardFolders.find((folder) => folder.id === parsed.data.parentFolderId);
    if (!parent) return res.status(400).json({ error: 'Parent dashboard folder was not found' });
    if (folderAccessLevelForUser(tenant, parent.id, principal.userId) !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Manager access to the destination folder is required' });
    }
    let ancestor: DashboardFolder | undefined = parent;
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor.id)) {
      if (ancestor.id === folderId) return res.status(400).json({ error: 'A folder cannot be moved beneath one of its descendants' });
      visited.add(ancestor.id);
      ancestor = ancestor.parentFolderId
        ? tenant.dashboardFolders.find((folder) => folder.id === ancestor!.parentFolderId)
        : undefined;
    }
  }
  const duplicate = tenant.dashboardFolders.some((folder) =>
    folder.id !== folderId && folder.parentFolderId === parsed.data.parentFolderId
    && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase());
  if (duplicate) return res.status(409).json({ error: 'A folder with this name already exists at that level' });
  const shareError = validateDashboardFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const folder = dashboardFolderSchema.parse({ ...current, ...parsed.data, updatedAt: new Date().toISOString() });
  const updatedTenant = {
    ...tenant,
    dashboardFolders: tenant.dashboardFolders.map((item) => item.id === folderId ? folder : item)
  };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.json({ folder: folderForUser(updatedTenant, folder, principal.userId, principal.permissions.includes('dashboards:manage')) });
});
app.delete('/api/metadata/dashboard-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const folder = tenant.dashboardFolders.find((item) => item.id === folderId);
  if (!folder) return res.status(404).json({ error: 'Dashboard folder was not found' });
  if (folder.ownerUserId !== principal.userId
    && folderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager'
    && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Manager access to this folder is required to delete it' });
  }
  if (tenant.dashboardFolders.some((item) => item.parentFolderId === folderId)
    || tenant.dashboards.some((dashboard) => dashboard.folderId === folderId)) {
    return res.status(409).json({ error: 'Move dashboards and subfolders before deleting this folder' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardFolders: tenant.dashboardFolders.filter((item) => item.id !== folderId)
  });
  return res.status(204).end();
});

const dashboardTerritoryInputSchema = z.array(z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentTerritoryId: z.string().uuid().nullable(),
  userIds: z.array(z.string().min(1))
}));
app.get('/api/metadata/dashboard-territories', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const user = principalUser(principal);
  if (!user) return res.status(403).json({ error: 'Tenant membership is no longer active' });
  const permissions = effectivePermissions(user, tenant);
  return res.json({
    territories: tenant.dashboardTerritories ?? [],
    canManage: permissions.includes('dashboards:manage') || permissions.includes('metadata:write')
  });
});
app.put('/api/metadata/dashboard-territories', requireAnyPermission('dashboards:manage', 'metadata:write'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const parsed = dashboardTerritoryInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard territories', details: parsed.error.flatten() });
  const ids = new Set(parsed.data.map((territory) => territory.id));
  if (ids.size !== parsed.data.length) return res.status(400).json({ error: 'Territory IDs must be unique' });
  const userIds = new Set(tenant.accessControl.users.map((user) => user.id));
  for (const territory of parsed.data) {
    if (territory.parentTerritoryId && !ids.has(territory.parentTerritoryId)) {
      return res.status(400).json({ error: `Territory "${territory.label}" references an unknown parent` });
    }
    if (territory.userIds.some((userId) => !userIds.has(userId))) {
      return res.status(400).json({ error: `Territory "${territory.label}" references an unknown tenant user` });
    }
    const visited = new Set<string>([territory.id]);
    let parentId = territory.parentTerritoryId;
    while (parentId) {
      if (visited.has(parentId)) return res.status(400).json({ error: 'Territory hierarchy cannot contain cycles' });
      visited.add(parentId);
      parentId = parsed.data.find((candidate) => candidate.id === parentId)?.parentTerritoryId ?? null;
    }
  }
  const retainedIds = new Set(parsed.data.map((territory) => territory.id));
  const removedGrant = tenant.dashboardFolders.some((folder) =>
    folder.shares.some((share) => share.targetType === 'Territory' && !retainedIds.has(share.targetId)));
  if (removedGrant) return res.status(409).json({ error: 'Remove folder grants before deleting their territories' });
  const now = new Date().toISOString();
  const existingById = new Map((tenant.dashboardTerritories ?? []).map((territory) => [territory.id, territory]));
  const dashboardTerritories = parsed.data.map((territory) => {
    const existing = existingById.get(territory.id);
    return dashboardTerritorySchema.parse({
      ...territory,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  });
  persistTenantRecords(principal.tenantId, { ...tenant, dashboardTerritories });
  return res.json({ territories: dashboardTerritories });
});

app.get('/api/metadata/dashboards', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  const dashboards = tenant?.dashboards ?? [];
  const canManageAll = principal.permissions.includes('dashboards:manage');
  const accessUser = tenant?.accessControl.users.find((user) => user.id === principal.userId);
  return res.json({
    dashboards: dashboards.filter((dashboard) => canAccessDashboard(
      dashboardForUser(tenant!, dashboard, principal.userId),
      principal.userId,
      accessUser?.permissionSetGroupIds ?? [],
      canManageAll
    )).map((dashboard) => dashboardForUser(tenant!, dashboard, principal.userId)),
    userId: principal.userId,
    runningUserIds: dashboardRunningUserChoices(principal, tenant!),
    canCreate: principal.permissions.includes('metadata:write') || canManageAll,
    canManageAll,
    canSchedule: principal.permissions.includes('email:send')
  });
});
app.get('/api/metadata/dashboards/:apiName/data/:objectName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const viewer = getPrincipal(res);
  const tenant = tenantData(viewer.tenantId)!;
  const dashboard = tenant.dashboards.find((item) => item.apiName === routeParam(req, 'apiName'));
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const viewerAccess = tenant.accessControl.users.find((user) => user.id === viewer.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, viewer.userId), viewer.userId, viewerAccess?.permissionSetGroupIds ?? [], viewer.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  const objectApiName = routeParam(req, 'objectName');
  const referencedObjects = new Set([
    ...dashboard.components.map((component) => component.objectApiName),
    ...dashboard.filters.map((filter) => filter.objectApiName)
  ]);
  const sourceObjects = [...new Set(dashboard.components.map((component) => component.objectApiName))];
  const targets = [...new Set([...sourceObjects, ...dashboard.filters.map((filter) => filter.objectApiName)])];
  sourceObjects.forEach((source) => targets.forEach((target) => {
    dashboardRelationshipPaths(tenant, source, target).forEach((path) => path.forEach((step) => {
      referencedObjects.add(step.sourceObjectApiName);
      referencedObjects.add(step.targetObjectApiName);
    }));
  }));
  if (!referencedObjects.has(objectApiName)) return res.status(404).json({ error: 'Dashboard data object was not found' });
  const requestedRunningUserId = typeof req.query.runningUserId === 'string' ? req.query.runningUserId : undefined;
  if (req.query.runningUserId !== undefined && requestedRunningUserId === undefined) {
    return res.status(400).json({ error: 'runningUserId must be a single user ID' });
  }
  if (requestedRunningUserId !== undefined && !requestedRunningUserId.trim()) {
    return res.status(400).json({ error: 'runningUserId cannot be empty' });
  }
  const runningUserError = dashboardRunningUserSelectionError(viewer, tenant, dashboard, requestedRunningUserId);
  if (runningUserError) return res.status(403).json({ error: runningUserError });
  const executionPrincipal = dashboardRunningPrincipal(viewer, tenant, dashboard, requestedRunningUserId);
  if (!executionPrincipal) return res.status(409).json({ error: 'The dashboard running user is no longer active' });
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(executionPrincipal, tenant, objectApiName, 'read')) {
    return res.status(403).json({ error: `The dashboard running user cannot read object "${objectApiName}"` });
  }
  if (objectApiName === 'User') {
    const formulaContext = formulaContextForUser(tenant, executionPrincipal.userId);
    const records = state.users.filter((user) => user.tenantId === viewer.tenantId && !user.disabled).map((user) => {
      const record = calculateFormulaFields(object, {
        Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: true,
        UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
      }, formulaContext);
      return sanitizeRecordForRead(executionPrincipal, tenant, object, record);
    });
    return res.json({ records });
  }
  const formulaContext = formulaContextForUser(tenant, executionPrincipal.userId);
  return res.json({
    records: (tenant.records[objectApiName] ?? [])
      .filter((record) => hasRecordAccess(executionPrincipal, tenant, objectApiName, record, 'Read'))
      .map((record) => sanitizeRecordForRead(executionPrincipal, tenant, object,
        calculateFormulaFields(object, record, formulaContext)))
  });
});
const dashboardSubscriptionInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  frequency: z.enum(['Daily', 'Weekly']),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: dashboardTimeZoneSchema,
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  recipientUserIds: z.array(z.string().min(1)).min(1).max(20),
  namedCredentialId: z.string().uuid(),
  fromEmail: z.string().email().max(254),
  active: z.boolean().default(true),
  saveSnapshots: z.boolean().default(true)
}).superRefine((subscription, context) => {
  if ((subscription.frequency === 'Weekly') !== (subscription.dayOfWeek !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfWeek'], message: 'Weekly schedules require a weekday only' });
  }
  if (new Set(subscription.recipientUserIds).size !== subscription.recipientUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientUserIds'], message: 'Recipient users must be unique' });
  }
});
app.get('/api/metadata/dashboards/:apiName/subscriptions', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const dashboard = tenant.dashboards.find((item) => item.apiName === routeParam(req, 'apiName'));
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const accessUser = tenant.accessControl.users.find((user) => user.id === principal.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, principal.userId), principal.userId, accessUser?.permissionSetGroupIds ?? [], principal.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  return res.json({
    subscriptions: tenant.dashboardSubscriptions.filter((item) =>
      item.dashboardApiName === dashboard.apiName
      && (item.createdBy === principal.userId || principal.permissions.includes('dashboards:manage')))
  });
});
app.post('/api/metadata/dashboards/:apiName/subscriptions', requireAnyPermission('metadata:write', 'dashboards:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const dashboard = tenant.dashboards.find((item) => item.apiName === routeParam(req, 'apiName'));
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  if (dashboard.ownerUserId !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the dashboard owner or a dashboard administrator can manage subscriptions' });
  }
  if (!principal.permissions.includes('email:send')) return res.status(403).json({ error: 'The email:send permission is required' });
  if (dashboard.status !== 'Deployed') return res.status(409).json({ error: 'Publish the dashboard before scheduling a subscription' });
  const input = dashboardSubscriptionInputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid dashboard subscription', details: input.error.flatten() });
  if (!tenant.namedCredentials.some((item) => item.id === input.data.namedCredentialId && item.protocol === 'SMTP')) {
    return res.status(400).json({ error: 'Select an available SMTP Named Credential' });
  }
  for (const userId of input.data.recipientUserIds) {
    const user = state.users.find((item) => item.id === userId && item.tenantId === principal.tenantId && !item.disabled);
    const access = tenant.accessControl.users.find((item) => item.id === userId);
    if (!user || !access || !canAccessDashboard(dashboardForUser(tenant, dashboard, userId), userId, access.permissionSetGroupIds, false)) {
      return res.status(400).json({ error: 'Every recipient must be an active tenant user with access to this dashboard' });
    }
  }
  const now = new Date().toISOString();
  const subscription = dashboardSubscriptionSchema.parse({
    ...input.data,
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    nextRunAt: nextDashboardSubscriptionRunAt(input.data, new Date()),
    lastRunAt: null,
    lastRunStatus: 'Never',
    lastRunError: null,
    createdBy: principal.userId,
    createdAt: now,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSubscriptions: [...tenant.dashboardSubscriptions, subscription]
  });
  return res.status(201).json({ subscription });
});
app.put('/api/metadata/dashboards/:apiName/subscriptions/:subscriptionId', requireAnyPermission('metadata:write', 'dashboards:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const subscriptionId = routeParam(req, 'subscriptionId');
  const current = tenant.dashboardSubscriptions.find((item) => item.id === subscriptionId && item.dashboardApiName === apiName);
  if (!current) return res.status(404).json({ error: 'Dashboard subscription was not found' });
  if (current.createdBy !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the subscription owner or a dashboard administrator can update it' });
  }
  if (!principal.permissions.includes('email:send')) return res.status(403).json({ error: 'The email:send permission is required' });
  const dashboard = tenant.dashboards.find((item) => item.apiName === apiName);
  if (!dashboard || dashboard.status !== 'Deployed') return res.status(409).json({ error: 'Publish the dashboard before updating a subscription' });
  const input = dashboardSubscriptionInputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid dashboard subscription', details: input.error.flatten() });
  if (!tenant.namedCredentials.some((item) => item.id === input.data.namedCredentialId && item.protocol === 'SMTP')) {
    return res.status(400).json({ error: 'Select an available SMTP Named Credential' });
  }
  for (const userId of input.data.recipientUserIds) {
    const user = state.users.find((item) => item.id === userId && item.tenantId === principal.tenantId && !item.disabled);
    const access = tenant.accessControl.users.find((item) => item.id === userId);
    if (!user || !access || !canAccessDashboard(dashboardForUser(tenant, dashboard, userId), userId, access.permissionSetGroupIds, false)) {
      return res.status(400).json({ error: 'Every recipient must be an active tenant user with access to this dashboard' });
    }
  }
  const updated = dashboardSubscriptionSchema.parse({
    ...current, ...input.data,
    nextRunAt: nextDashboardSubscriptionRunAt(input.data, new Date()),
    lastRunAt: current.lastRunAt, lastRunStatus: current.lastRunStatus, lastRunError: current.lastRunError,
    updatedAt: new Date().toISOString()
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSubscriptions: tenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? updated : item)
  });
  return res.json({ subscription: updated });
});
app.delete('/api/metadata/dashboards/:apiName/subscriptions/:subscriptionId', requireAnyPermission('metadata:write', 'dashboards:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const subscriptionId = routeParam(req, 'subscriptionId');
  const current = tenant.dashboardSubscriptions.find((item) => item.id === subscriptionId && item.dashboardApiName === apiName);
  if (!current) return res.status(404).json({ error: 'Dashboard subscription was not found' });
  if (current.createdBy !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the subscription owner or a dashboard administrator can delete it' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSubscriptions: tenant.dashboardSubscriptions.filter((item) => item.id !== subscriptionId)
  });
  return res.status(204).end();
});
app.post('/api/metadata/dashboards/:apiName/subscriptions/:subscriptionId/run', requireAnyPermission('metadata:write', 'dashboards:manage'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const subscription = tenant.dashboardSubscriptions.find((item) =>
    item.id === routeParam(req, 'subscriptionId') && item.dashboardApiName === routeParam(req, 'apiName'));
  if (!subscription) return res.status(404).json({ error: 'Dashboard subscription was not found' });
  if (subscription.createdBy !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the subscription owner or a dashboard administrator can run it' });
  }
  if (!principal.permissions.includes('email:send')) return res.status(403).json({ error: 'The email:send permission is required' });
  await dispatchDashboardSubscription(principal.tenantId, subscription.id, true);
  const updated = tenantData(principal.tenantId)!.dashboardSubscriptions.find((item) => item.id === subscription.id);
  if (updated?.lastRunStatus === 'Failed') {
    return res.status(502).json({ error: updated.lastRunError ?? 'Dashboard subscription delivery failed', subscription: updated });
  }
  return res.json({ subscription: updated });
});
app.put('/api/metadata/dashboards/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existing = tenant.dashboards.find((dashboard) => dashboard.apiName === apiName);
  if (existing && !canEditDashboard(
    dashboardForUser(tenant, existing, principal.userId),
    principal.userId,
    principal.permissions.includes('dashboards:manage')
  )) {
    return res.status(403).json({ error: 'Dashboard editor access is required to change its metadata' });
  }
  if (!existing && !principal.permissions.includes('metadata:write') && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Metadata write access is required to create a dashboard' });
  }
  const parsed = dashboardSchema.safeParse({
    ...req.body,
    apiName,
    ownerUserId: existing?.ownerUserId ?? principal.userId
  });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard metadata', details: parsed.error.flatten() });
  const ownsDashboard = existing?.ownerUserId === principal.userId
    || principal.permissions.includes('dashboards:manage');
  if (existing && !ownsDashboard && (
    parsed.data.visibility !== existing.visibility
    || [...parsed.data.sharedUserIds].sort().join('\0') !== [...existing.sharedUserIds].sort().join('\0')
    || [...parsed.data.sharedPermissionSetGroupIds].sort().join('\0') !== [...existing.sharedPermissionSetGroupIds].sort().join('\0')
  )) {
    return res.status(403).json({ error: 'Only the dashboard owner or an administrator can change dashboard-level sharing' });
  }
  if (parsed.data.runningUserId !== (existing?.runningUserId ?? null) && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only a dashboard administrator can change the dashboard running user' });
  }
  if (parsed.data.allowViewerToSelectRunningUser !== (existing?.allowViewerToSelectRunningUser ?? false)
    && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only a dashboard administrator can configure running-user selection' });
  }
  if (parsed.data.runningUserId && !state.users.some((user) =>
    user.id === parsed.data.runningUserId && user.tenantId === principal.tenantId && !user.disabled)) {
    return res.status(400).json({ error: 'The selected dashboard running user must be an active user in this tenant' });
  }
  if (parsed.data.folderId) {
    const folder = tenant.dashboardFolders.find((item) => item.id === parsed.data.folderId);
    if (!folder) return res.status(400).json({ error: 'Select an existing dashboard folder' });
    const folderLevel = folderAccessLevelForUser(tenant, folder.id, principal.userId);
    const isMoving = existing?.folderId !== parsed.data.folderId;
    if ((isMoving || !ownsDashboard)
      && folderLevel !== 'Editor' && folderLevel !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Editor access to the destination dashboard folder is required' });
    }
    if (isMoving && existing?.folderId
      && folderAccessLevelForUser(tenant, existing.folderId, principal.userId) !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Manager access to the current folder is required to move this dashboard' });
    }
    let folderPath = folder.label;
    let ancestorId = folder.parentFolderId;
    const pathVisited = new Set([folder.id]);
    while (ancestorId && !pathVisited.has(ancestorId)) {
      pathVisited.add(ancestorId);
      const ancestor = tenant.dashboardFolders.find((item) => item.id === ancestorId);
      if (!ancestor) break;
      folderPath = `${ancestor.label}/${folderPath}`;
      ancestorId = ancestor.parentFolderId;
    }
    parsed.data.folderName = folderPath;
  } else if (existing?.folderId) {
    if (folderAccessLevelForUser(tenant, existing.folderId, principal.userId) !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Manager access to the current folder is required to move this dashboard out of it' });
    }
    parsed.data.folderName = 'Private Reports';
  }
  if (existing?.status === 'Deployed' && parsed.data.status === 'Draft'
    && tenant.dashboardSubscriptions.some((subscription) => subscription.dashboardApiName === apiName && subscription.active)) {
    return res.status(409).json({ error: 'Pause or delete active dashboard subscriptions before unpublishing this dashboard' });
  }
  const conflictingName = tenant.dashboards.find((dashboard) =>
    dashboard.apiName.toLowerCase() === parsed.data.apiName.toLowerCase() && dashboard.apiName !== parsed.data.apiName);
  if (conflictingName) return res.status(409).json({ error: `Dashboard API name "${parsed.data.apiName}" conflicts with "${conflictingName.apiName}"` });
  const unknownSharedUser = parsed.data.sharedUserIds.find((userId) =>
    !tenant.accessControl.users.some((user) => user.id === userId));
  if (unknownSharedUser) return res.status(400).json({ error: `Dashboard sharing references unknown tenant user "${unknownSharedUser}"` });
  const unknownSharedGroup = parsed.data.sharedPermissionSetGroupIds.find((groupId) =>
    !tenant.accessControl.permissionSetGroups.some((group) => group.id === groupId));
  if (unknownSharedGroup) return res.status(400).json({ error: `Dashboard sharing references unknown permission set group "${unknownSharedGroup}"` });
  for (const [index, component] of parsed.data.components.entries()) {
    if (component.type === 'Custom') {
      const registered = state.libraryComponents.find((item) =>
        item.apiName === component.customComponentApiName && item.surfaces.includes('dashboard'));
      if (!registered) return res.status(422).json({ error: `Custom dashboard component "${component.customComponentApiName ?? component.title}" is not available in the component library` });
    }
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (component.reportApiName && !report) return res.status(422).json({ error: `Dashboard component "${component.title}" references an unavailable report` });
    if (report && report.objectApiName !== component.objectApiName) {
      return res.status(422).json({ error: `Dashboard component "${component.title}" must use the report's source object "${report.objectApiName}"` });
    }
    if (report) {
      const reportFields = new Set([...report.fieldApiNames, ...report.groupByFieldApiNames, ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : [])]);
      const unavailableField = [
        ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
        ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
        ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
        ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
        ...component.displayFieldApiNames
      ].find((fieldApiName) => !reportFields.has(fieldApiName));
      if (unavailableField) {
        return res.status(422).json({ error: `Dashboard component "${component.title}" references field "${unavailableField}" that is not included in report "${report.label}"` });
      }
      if (component.type === 'Chart' && component.groupByFieldApiName
        && !report.groupByFieldApiNames.includes(component.groupByFieldApiName)) {
        return res.status(422).json({ error: `Dashboard chart "${component.title}" must group by a field summarized by report "${report.label}"` });
      }
      if (component.type === 'Chart' && component.seriesFieldApiName
        && !report.groupByFieldApiNames.includes(component.seriesFieldApiName)) {
        return res.status(422).json({ error: `Dashboard chart "${component.title}" must use a series field summarized by report "${report.label}"` });
      }
      if (component.type === 'Chart' && component.chartType === 'Scatter'
        && !report.groupByFieldApiNames.includes(component.xAxisFieldApiName ?? '')) {
        return res.status(422).json({ error: `Scatter chart "${component.title}" must use a field grouped by report "${report.label}" for its x-axis` });
      }
    }
    if (component.type === 'Custom') continue;
    if (component.type === 'Rich Text' || component.type === 'Image') continue;
    const object = tenant.objects.find((candidate) => candidate.apiName === component.objectApiName);
    if (!object) return res.status(400).json({ error: `Dashboard component "${component.title}" references unknown object "${component.objectApiName}"` });
    if (!object.settings?.allowReports) return res.status(422).json({ error: `Reports must be enabled for "${object.label}" before using it on a dashboard` });
    const fieldNames = new Set(object.fields.map((field) => field.apiName));
    const selectedFields = [
      ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
      ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
      ...component.displayFieldApiNames
    ];
    const unknownField = selectedFields.find((fieldName) => !fieldNames.has(fieldName));
    if (unknownField) return res.status(400).json({ error: `Dashboard component "${component.title}" references unknown field "${unknownField}" on "${object.label}"` });
    if (component.aggregation !== 'Count') {
      const measure = object.fields.find((field) => field.apiName === component.measureFieldApiName);
      if (!isNumericField(measure)) {
        return res.status(422).json({ error: `Dashboard component "${component.title}" requires a numeric measure field for ${component.aggregation}` });
      }
    }
    if (component.type === 'Chart' && component.groupByFieldApiName && !fieldNames.has(component.groupByFieldApiName)) {
      return res.status(400).json({ error: `Dashboard chart "${component.title}" references an unknown grouping field` });
    }
    if (component.type === 'Chart' && component.chartType === 'Scatter') {
      const xField = object.fields.find((field) => field.apiName === component.xAxisFieldApiName);
      if (!isNumericField(xField)) {
        return res.status(422).json({ error: `Scatter chart "${component.title}" requires a numeric x-axis field` });
      }
    }
  }
  for (const filter of parsed.data.filters) {
    const object = tenant.objects.find((candidate) => candidate.apiName === filter.objectApiName);
    const field = object?.fields.find((candidate) => candidate.apiName === filter.fieldApiName);
    if (!object || !object.settings?.allowReports || !field) {
      return res.status(400).json({ error: `Dashboard filter references unknown field "${filter.fieldApiName}" on "${filter.objectApiName}"` });
    }
    if (!dashboardFilterOperatorAllowed(field, filter.operator)) {
      return res.status(422).json({ error: `Operator "${filter.operator}" is not valid for dashboard filter field "${object.apiName}.${field.apiName}"` });
    }
    const invalidValue = dashboardFilterValueError(field, filter.value);
    if (invalidValue) return res.status(422).json({ error: `Dashboard filter value is invalid for "${object.apiName}.${field.apiName}": ${invalidValue}` });
  }
  const dashboardToSave = {
    ...parsed.data,
    components: parsed.data.components.map((component) => component.type === 'Rich Text'
      ? { ...component, richTextContent: sanitizeDashboardRichText(component.richTextContent) }
      : component)
  };
  const updatedTenant = {
    ...tenant,
    dashboards: tenant.dashboards.some((dashboard) => dashboard.apiName === parsed.data.apiName)
      ? tenant.dashboards.map((dashboard) => dashboard.apiName === parsed.data.apiName ? dashboardToSave : dashboard)
      : [...tenant.dashboards, dashboardToSave]
  };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({ dashboard: dashboardForUser(updatedTenant, dashboardToSave, principal.userId) });
});
app.delete('/api/metadata/dashboards/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existing = tenant.dashboards.find((dashboard) => dashboard.apiName === apiName);
  if (!existing) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  if (!canEditDashboard(
    dashboardForUser(tenant, existing, principal.userId),
    principal.userId,
    principal.permissions.includes('dashboards:manage')
  )) {
    return res.status(403).json({ error: 'Dashboard editor access is required to delete it' });
  }
  const updatedTenant = {
    ...tenant,
    dashboards: tenant.dashboards.filter((dashboard) => dashboard.apiName !== apiName),
    dashboardSnapshots: tenant.dashboardSnapshots.filter((snapshot) => snapshot.dashboardApiName !== apiName),
    dashboardSubscriptions: tenant.dashboardSubscriptions.filter((subscription) => subscription.dashboardApiName !== apiName)
  };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.status(204).end();
});
app.get('/api/metadata/dashboards/:apiName/snapshots', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const dashboard = tenant.dashboards.find((item) => item.apiName === apiName);
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const accessUser = tenant.accessControl.users.find((user) => user.id === principal.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, principal.userId), principal.userId, accessUser?.permissionSetGroupIds ?? [], principal.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  const snapshots = (tenant.dashboardSnapshots ?? [])
    .filter((snapshot) => snapshot.dashboardApiName === apiName && snapshot.createdBy === principal.userId)
    .filter((snapshot) => {
      const runningPrincipal = !dashboard.runningUserId && snapshot.runningUserId === principal.userId
        ? principal
        : dashboardRunningPrincipal(principal, tenant, dashboard, snapshot.runningUserId);
      if (!runningPrincipal) return false;
      const dataComponents = snapshot.components.filter((component) =>
        component.type === 'Metric' || component.type === 'Chart' || component.type === 'Table');
      if (dataComponents.length && !snapshot.sourceRecordAccess) return false;
      if (snapshot.sourceRecordAccess?.some((source) => {
        const object = tenant.objects.find((item) => item.apiName === source.objectApiName);
        const record = tenant.records[source.objectApiName]?.find((item) => item.Id === source.recordId);
        return !object || !record || !hasRecordAccess(runningPrincipal, tenant, source.objectApiName, record, 'Read');
      })) return false;
      return snapshot.components.every((snapshotComponent) => {
        const component = dashboard.components.find((item) => item.id === snapshotComponent.componentId);
        if (!component) return false;
        if (component.type === 'Rich Text' || component.type === 'Image' || component.type === 'Custom') return true;
        const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
        if (!object || !hasObjectPermission(runningPrincipal, tenant, object.apiName, 'read')) return false;
        const report = component.reportApiName
          ? tenant.reports.find((item) => item.apiName === component.reportApiName)
          : undefined;
        if (component.reportApiName && (!report
          || reportFolderAccessLevelForUser(tenant, report.folderId, principal.userId) === null)) return false;
        const fieldApiNames = new Set([
          ...snapshotComponent.columns.map((column) => column.apiName),
          ...component.displayFieldApiNames,
          ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
          ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
          ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
          ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
          ...(report?.fieldApiNames ?? []),
          ...(report?.groupByFieldApiNames ?? []),
          ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
          ...(report?.filters.map((filter) => filter.fieldApiName) ?? []),
          ...dashboard.filters.filter((filter) => filter.objectApiName === object.apiName)
            .map((filter) => filter.fieldApiName)
        ]);
        return [...fieldApiNames].every((fieldApiName) =>
          object.fields.some((field) => field.apiName === fieldApiName)
          && hasFieldPermission(runningPrincipal, tenant, object.apiName, fieldApiName, 'read'));
      });
    });
  return res.json({
      snapshots: snapshots
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((snapshot) => {
          const responseSnapshot = { ...snapshot };
          delete responseSnapshot.sourceRecordAccess;
          return responseSnapshot;
        })
    });
});
app.post('/api/metadata/dashboards/:apiName/snapshots', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const viewer = getPrincipal(res);
  const tenant = tenantData(viewer.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const dashboard = tenant.dashboards.find((item) => item.apiName === apiName);
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const accessUser = tenant.accessControl.users.find((user) => user.id === viewer.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, viewer.userId), viewer.userId, accessUser?.permissionSetGroupIds ?? [], viewer.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  if (dashboard.status !== 'Deployed') return res.status(409).json({ error: 'Publish the dashboard before creating a snapshot' });
  const input = z.object({
    label: z.string().trim().min(1).max(80),
    runningUserId: z.string().min(1).optional(),
    filters: z.array(dashboardFilterSchema).optional(),
    crossFilter: dashboardFilterSchema.optional(),
    crossFilters: z.array(dashboardFilterSchema).optional(),
    customComponents: z.array(z.object({
      componentId: z.string().min(1),
      html: z.string().max(50_000)
    }).strict()).default([])
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Snapshot label or filters are invalid', details: input.error.flatten() });
  const runningUserError = dashboardRunningUserSelectionError(viewer, tenant, dashboard, input.data.runningUserId);
  if (runningUserError) return res.status(403).json({ error: runningUserError });
  const principal = dashboardRunningPrincipal(viewer, tenant, dashboard, input.data.runningUserId);
  if (!principal) return res.status(409).json({ error: 'The dashboard running user is no longer active' });
  const requestedFilters = input.data.filters ?? dashboard.filters;
  const invalidFilter = requestedFilters.find((filter) => {
    const configured = dashboard.filters.find((item) => item.id === filter.id);
    return !configured || configured.objectApiName !== filter.objectApiName || configured.fieldApiName !== filter.fieldApiName
      || configured.operator !== filter.operator;
  });
  if (invalidFilter) return res.status(400).json({ error: 'Snapshot filters must match filters configured on the dashboard' });
  const snapshotFilters = dashboard.filters.map((filter) => ({
    ...filter,
    value: requestedFilters.find((item) => item.id === filter.id)?.value ?? filter.value
  }));
  for (const filter of snapshotFilters) {
    const object = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    const field = object?.fields.find((item) => item.apiName === filter.fieldApiName);
    if (!field || !object?.settings?.allowReports) {
      return res.status(409).json({ error: `Dashboard filter field "${filter.objectApiName}.${filter.fieldApiName}" is no longer available` });
    }
    if (!dashboardFilterOperatorAllowed(field, filter.operator)) {
      return res.status(409).json({ error: `Dashboard filter operator "${filter.operator}" is no longer valid for "${filter.objectApiName}.${field.apiName}"` });
    }
    const invalidValue = field ? dashboardFilterValueError(field, filter.value) : null;
    if (invalidValue) return res.status(400).json({ error: `Snapshot filter value is invalid for "${filter.fieldApiName}": ${invalidValue}` });
  }
  const crossFilters = [...(input.data.crossFilters ?? []), ...(input.data.crossFilter ? [input.data.crossFilter] : [])];
  const customComponents = new Map(input.data.customComponents.map((item) => [item.componentId, item.html]));
  if (customComponents.size !== input.data.customComponents.length) {
    return res.status(400).json({ error: 'Custom component snapshots must have unique component IDs' });
  }
  const dashboardCustomComponents = dashboard.components.filter((component) => component.type === 'Custom');
  if (dashboardCustomComponents.some((component) => !customComponents.has(component.id))
    || [...customComponents.keys()].some((componentId) => !dashboardCustomComponents.some((component) => component.id === componentId))) {
    return res.status(400).json({ error: 'Capture each registered custom dashboard component exactly once' });
  }
  if (crossFilters.some((crossFilter) => !dashboard.components.some((component) =>
    component.type === 'Chart'
    && component.objectApiName === crossFilter.objectApiName
    && (component.groupByFieldApiName === crossFilter.fieldApiName
      || component.seriesFieldApiName === crossFilter.fieldApiName)))) {
    return res.status(400).json({ error: 'Snapshot cross-filter must use a chart grouping field on this dashboard' });
  }
  const invalidCrossFilter = crossFilters.find((filter) => {
    const object = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    const field = object?.fields.find((item) => item.apiName === filter.fieldApiName);
    return !field || !dashboardFilterOperatorAllowed(field, filter.operator)
      || Boolean(field && dashboardFilterValueError(field, filter.value));
  });
  if (invalidCrossFilter) {
    return res.status(400).json({ error: `Snapshot cross-filter is invalid for "${invalidCrossFilter.objectApiName}.${invalidCrossFilter.fieldApiName}"` });
  }
  const matchesFilter = (record: RuntimeRecord, filter: DashboardFilterMetadata) => reportFilterMatches(record, filter);
  const components: DashboardSnapshot['components'] = [];
  const sourceRecordAccess = new Map<string, { objectApiName: string; recordId: string }>();
  for (const component of dashboard.components) {
    if (component.type === 'Rich Text') {
      const richTextContent = sanitizeDashboardRichText(component.richTextContent);
      components.push({
        componentId: component.id,
        title: component.title,
        subtitle: component.subtitle,
        footer: component.footer,
        type: 'Rich Text',
        width: component.width,
        height: component.height,
        customHtml: null,
        richTextContent,
        imageUrl: '',
        imageAltText: '',
        unavailableReason: null,
        chartType: null,
        chartSortOrder: component.chartSortOrder,
        chartColorPalette: component.chartColorPalette,
        chartLimit: component.chartLimit,
        chartXAxisMinimum: component.chartXAxisMinimum,
        chartXAxisMaximum: component.chartXAxisMaximum,
        chartYAxisMinimum: component.chartYAxisMinimum,
        chartYAxisMaximum: component.chartYAxisMaximum,
        chartValueFormat: component.chartValueFormat,
        chartCurrencyCode: component.chartCurrencyCode,
        chartDecimalPlaces: component.chartDecimalPlaces,
        xAxisFieldApiName: null,
        xAxisTitle: '',
        yAxisTitle: '',
        showGridlines: false,
        legendPosition: component.legendPosition,
        aggregation: component.aggregation,
        gaugeMin: component.gaugeMin,
        gaugeMax: component.gaugeMax,
        gaugeRange1EndPercent: component.gaugeRange1EndPercent,
        gaugeRange2EndPercent: component.gaugeRange2EndPercent,
        showLegend: false,
        showValues: false,
        chartDataLabelPosition: component.chartDataLabelPosition,
        objectApiName: 'Content',
        groupByLabel: null,
        totalRows: 0,
        metricValue: null,
        columns: [],
        buckets: [],
        rows: []
      });
      continue;
    }
    if (component.type === 'Image') {
      components.push({
        componentId: component.id,
        title: component.title,
        subtitle: component.subtitle,
        footer: component.footer,
        type: 'Image',
        width: component.width,
        height: component.height,
        customHtml: null,
        richTextContent: '',
        imageUrl: component.imageUrl,
        imageAltText: component.imageAltText,
        unavailableReason: null,
        chartType: null,
        chartSortOrder: component.chartSortOrder,
        chartColorPalette: component.chartColorPalette,
        chartLimit: component.chartLimit,
        chartXAxisMinimum: component.chartXAxisMinimum,
        chartXAxisMaximum: component.chartXAxisMaximum,
        chartYAxisMinimum: component.chartYAxisMinimum,
        chartYAxisMaximum: component.chartYAxisMaximum,
        chartValueFormat: component.chartValueFormat,
        chartCurrencyCode: component.chartCurrencyCode,
        chartDecimalPlaces: component.chartDecimalPlaces,
        xAxisFieldApiName: null,
        xAxisTitle: '',
        yAxisTitle: '',
        showGridlines: false,
        legendPosition: component.legendPosition,
        aggregation: component.aggregation,
        gaugeMin: component.gaugeMin,
        gaugeMax: component.gaugeMax,
        gaugeRange1EndPercent: component.gaugeRange1EndPercent,
        gaugeRange2EndPercent: component.gaugeRange2EndPercent,
        showLegend: false,
        showValues: false,
        chartDataLabelPosition: component.chartDataLabelPosition,
        objectApiName: 'Content',
        groupByLabel: null,
        totalRows: 0,
        metricValue: null,
        columns: [],
        buckets: [],
        rows: []
      });
      continue;
    }
    if (component.type === 'Custom') {
      const registered = state.libraryComponents.find((item) =>
        item.apiName === component.customComponentApiName && item.surfaces.includes('dashboard'));
      if (!registered) return res.status(409).json({ error: `Custom dashboard component "${component.customComponentApiName}" is no longer available` });
      const capturedHtml = customComponents.get(component.id);
      if (capturedHtml === undefined) return res.status(400).json({ error: `Custom dashboard component "${component.title}" was not captured` });
      const sanitizedHtml = sanitizeHtml(capturedHtml, {
        allowedTags: [
          'a', 'b', 'blockquote', 'br', 'caption', 'code', 'dd', 'div', 'dl', 'dt', 'em',
          'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'li', 'ol', 'p', 'pre', 'small', 'span',
          'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
          'ul', 'style'
        ],
        allowedAttributes: {
          '*': ['class', 'title', 'role', 'aria-label', 'style'],
          a: ['href', 'target', 'rel'],
          td: ['colspan', 'rowspan'],
          th: ['colspan', 'rowspan', 'scope']
        },
        allowedSchemes: ['mailto'],
        allowProtocolRelative: false
      });
      components.push({
        componentId: component.id,
        title: component.title,
        subtitle: component.subtitle,
        footer: component.footer,
        type: 'Custom',
        width: component.width,
        height: component.height,
        customHtml: sanitizedHtml,
        richTextContent: '',
        imageUrl: '',
        imageAltText: '',
        unavailableReason: null,
        chartType: null,
        chartSortOrder: component.chartSortOrder,
        chartColorPalette: component.chartColorPalette,
        chartLimit: component.chartLimit,
        chartXAxisMinimum: component.chartXAxisMinimum,
        chartXAxisMaximum: component.chartXAxisMaximum,
        chartYAxisMinimum: component.chartYAxisMinimum,
        chartYAxisMaximum: component.chartYAxisMaximum,
        chartValueFormat: component.chartValueFormat,
        chartCurrencyCode: component.chartCurrencyCode,
        chartDecimalPlaces: component.chartDecimalPlaces,
        xAxisFieldApiName: null,
        xAxisTitle: '',
        yAxisTitle: '',
        showGridlines: false,
        legendPosition: component.legendPosition,
        aggregation: component.aggregation,
        gaugeMin: component.gaugeMin,
        gaugeMax: component.gaugeMax,
        gaugeRange1EndPercent: component.gaugeRange1EndPercent,
        gaugeRange2EndPercent: component.gaugeRange2EndPercent,
        showLegend: false,
        showValues: false,
        chartDataLabelPosition: component.chartDataLabelPosition,
        objectApiName: component.objectApiName,
        groupByLabel: null,
        totalRows: 0,
        metricValue: null,
        columns: [],
        buckets: [],
        rows: []
      });
      continue;
    }
    const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
    if (!object) return res.status(409).json({ error: `Dashboard object "${component.objectApiName}" is no longer available` });
    if (!hasObjectPermission(principal, tenant, object.apiName, 'read')) {
      return res.status(403).json({ error: `Missing read permission for dashboard object "${object.apiName}"` });
    }
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (component.reportApiName && !report) return res.status(409).json({ error: `Dashboard report "${component.reportApiName}" is no longer available` });
    const reportFilters = report?.filters ?? [];
    const activeDashboardFilters = snapshotFilters.filter((filter) =>
      filter.objectApiName === object.apiName
      && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'));
    const crossFilterResolution = resolveDashboardCrossFilters(principal, tenant, object.apiName, crossFilters, matchesFilter);
    if ('error' in crossFilterResolution) return res.status(crossFilterResolution.status).json({ error: crossFilterResolution.error });
    const selectedFieldNames = new Set([
      ...(report?.fieldApiNames ?? []),
      ...(report?.groupByFieldApiNames ?? []),
      ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
      ...reportFilters.map((filter) => filter.fieldApiName),
      ...activeDashboardFilters.map((filter) => filter.fieldApiName),
      ...(component.aggregation !== 'Count' && component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType !== 'Gauge' && component.groupByFieldApiName
        ? [component.groupByFieldApiName] : []),
       ...(component.type === 'Chart' && component.chartType === 'Scatter' && component.xAxisFieldApiName
        ? [component.xAxisFieldApiName] : []),
      ...(component.type === 'Chart' && ['Stacked Bar', 'Stacked Column'].includes(component.chartType)
        && component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.type === 'Table' ? component.displayFieldApiNames : [])
    ]);
    const inaccessibleField = [...selectedFieldNames].find((fieldApiName) =>
      !object.fields.some((field) => field.apiName === fieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, fieldApiName, 'read'));
    if (inaccessibleField) {
      return res.status(403).json({ error: `Missing read permission for dashboard field "${object.apiName}.${inaccessibleField}"` });
    }
    const formulaContext = formulaContextForUser(tenant, principal.userId);
    const sourceRecords = (tenant.records[object.apiName] ?? [])
      .filter((record) => hasRecordAccess(principal, tenant, object.apiName, record, 'Read'))
      .map((record) => calculateFormulaFields(object, record, formulaContext));
    const records = sourceRecords.filter((record) => hasRecordAccess(principal, tenant, object.apiName, record, 'Read')
      && reportFilters.every((filter) => reportFilterMatches(record, filter))
      && matchesDashboardFilters(
        snapshotFilters.filter((filter) => filter.objectApiName === object.apiName
          && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null')),
        dashboard.filterLogic,
        (filter) => matchesFilter(record, filter)
      )
      && (!crossFilters.length || crossFilterResolution.recordIds.has(record.Id)));
    for (const record of records) {
      sourceRecordAccess.set(`${object.apiName}:${record.Id}`, { objectApiName: object.apiName, recordId: record.Id });
    }
    const numericValuesFor = (items: RuntimeRecord[]) => component.measureFieldApiName
      ? items
        .map((record) => record[component.measureFieldApiName!])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite)
      : [];
    const numericValues = numericValuesFor(records);
    const metricValue = component.aggregation === 'Count' ? records.length
      : component.aggregation === 'Sum' ? numericValues.reduce((sum, value) => sum + value, 0)
        : component.aggregation === 'Average' ? numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : 0
          : component.aggregation === 'Minimum' ? numericValues.length ? Math.min(...numericValues) : 0
            : numericValues.length ? Math.max(...numericValues) : 0;
    const groups = new Map<string, RuntimeRecord[]>();
    const groupFieldApiName = component.type === 'Chart' && component.chartType === 'Scatter'
      ? component.xAxisFieldApiName
      : component.groupByFieldApiName;
    if (groupFieldApiName) {
      for (const record of records) {
        const label = String(record[groupFieldApiName] ?? '—');
        groups.set(label, [...(groups.get(label) ?? []), record]);
      }
    }
    let buckets = [...groups.entries()].map(([label, items]) => {
      const values = numericValuesFor(items);
      const value = component.aggregation === 'Count' ? items.length
        : component.aggregation === 'Sum' ? values.reduce((sum, item) => sum + item, 0)
          : component.aggregation === 'Average' ? values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0
            : component.aggregation === 'Minimum' ? values.length ? Math.min(...values) : 0
              : values.length ? Math.max(...values) : 0;
      const series = component.seriesFieldApiName
        ? Object.fromEntries([...new Set(items.map((record) => String(record[component.seriesFieldApiName!] ?? '—')))]
            .map((seriesName) => {
              const seriesRecords = items.filter((record) => String(record[component.seriesFieldApiName!] ?? '—') === seriesName);
              const seriesValues = numericValuesFor(seriesRecords);
              const seriesValue = component.aggregation === 'Count' ? seriesRecords.length
                : component.aggregation === 'Sum' ? seriesValues.reduce((sum, item) => sum + item, 0)
                  : component.aggregation === 'Average' ? seriesValues.length ? seriesValues.reduce((sum, item) => sum + item, 0) / seriesValues.length : 0
                    : component.aggregation === 'Minimum' ? seriesValues.length ? Math.min(...seriesValues) : 0
                      : seriesValues.length ? Math.max(...seriesValues) : 0;
              return [seriesName, seriesValue];
            }))
        : undefined;
      return { label, value, ...(series ? { series } : {}) };
    });
    if (component.type === 'Chart' && component.chartType === 'Gauge') {
      buckets = [{ label: component.title, value: metricValue }];
    } else {
      buckets = buckets
        .sort((left, right) => component.chartSortOrder === 'Ascending'
          ? left.value - right.value : right.value - left.value)
        .slice(0, component.chartLimit);
    }
    const columns = object.fields.filter((field) => component.displayFieldApiNames.includes(field.apiName))
      .map((field) => ({ apiName: field.apiName, label: field.label }));
    const rows = component.type === 'Table'
      ? records.slice(0, 10).map((record) => {
          const readable = sanitizeRecordForRead(principal, tenant, object, record);
          return Object.fromEntries(columns.map((field) => [field.apiName, readable[field.apiName] ?? null]));
        })
      : [];
    components.push({
      componentId: component.id,
      title: component.title,
      subtitle: component.subtitle,
      footer: component.footer,
      type: component.type,
      width: component.width,
      height: component.height,
      customHtml: null,
      richTextContent: '',
      imageUrl: '',
      imageAltText: '',
      unavailableReason: null,
      chartType: component.type === 'Chart' ? component.chartType : null,
      chartSortOrder: component.chartSortOrder,
      chartColorPalette: component.chartColorPalette,
      chartLimit: component.chartLimit,
      chartXAxisMinimum: component.chartXAxisMinimum,
      chartXAxisMaximum: component.chartXAxisMaximum,
      chartYAxisMinimum: component.chartYAxisMinimum,
      chartYAxisMaximum: component.chartYAxisMaximum,
      chartValueFormat: component.chartValueFormat,
      chartCurrencyCode: component.chartCurrencyCode,
      chartDecimalPlaces: component.chartDecimalPlaces,
      xAxisFieldApiName: component.xAxisFieldApiName,
      xAxisTitle: component.xAxisTitle,
      yAxisTitle: component.yAxisTitle,
      showGridlines: component.showGridlines,
      legendPosition: component.legendPosition,
      aggregation: component.aggregation,
      gaugeMin: component.gaugeMin,
      gaugeMax: component.gaugeMax,
      gaugeRange1EndPercent: component.gaugeRange1EndPercent,
      gaugeRange2EndPercent: component.gaugeRange2EndPercent,
      showLegend: component.showLegend,
      showValues: component.showValues,
      chartDataLabelPosition: component.chartDataLabelPosition,
      objectApiName: component.objectApiName,
      groupByLabel: groupFieldApiName
        ? object.fields.find((field) => field.apiName === groupFieldApiName)?.label ?? groupFieldApiName
        : null,
      totalRows: records.length,
      metricValue: component.type === 'Metric' ? metricValue : null,
      columns,
      buckets: component.type === 'Chart' ? buckets : [],
      rows
    });
  }
  const parsedSnapshot = dashboardSnapshotSchema.parse({
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    label: input.data.label,
    createdAt: new Date().toISOString(),
    createdBy: viewer.userId,
    runningUserId: principal.userId,
    filters: snapshotFilters,
    crossFilter: crossFilters.length === 1 ? crossFilters[0] : undefined,
    crossFilters,
    sourceRecordAccess: [...sourceRecordAccess.values()],
    components
  });
  const updatedTenant = { ...tenant, dashboardSnapshots: [...(tenant.dashboardSnapshots ?? []), parsedSnapshot] };
  persistTenantRecords(principal.tenantId, updatedTenant);
  const responseSnapshot = { ...parsedSnapshot };
  delete responseSnapshot.sourceRecordAccess;
  return res.status(201).json({ snapshot: responseSnapshot });
});
app.delete('/api/metadata/dashboards/:apiName/snapshots/:snapshotId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const snapshotId = routeParam(req, 'snapshotId');
  const snapshot = (tenant.dashboardSnapshots ?? []).find((item) =>
    item.id === snapshotId && item.dashboardApiName === apiName && item.createdBy === principal.userId);
  if (!snapshot) return res.status(404).json({ error: 'Dashboard snapshot was not found' });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSnapshots: tenant.dashboardSnapshots.filter((item) => item.id !== snapshotId)
  });
  return res.status(204).end();
});
const reportFolderInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable().default(null),
  shares: z.array(dashboardFolderShareSchema).default([]),
  visibility: z.enum(['Private', 'All Users']).default('Private')
});
const canManageReportFolders = (principal: Principal) =>
  principal.permissions.includes('metadata:write') || principal.permissions.includes('reports:manage');
app.get('/api/metadata/report-folders', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const canManageAll = canManageReportFolders(principal);
  return res.json({
    folders: tenant.reportFolders
      .filter((folder) => canManageAll || reportFolderAccessLevelForUser(tenant, folder.id, principal.userId) !== null)
      .map((folder) => reportFolderForUser(tenant, folder, principal.userId, canManageAll)),
    canManageAll
  });
});
app.post('/api/metadata/report-folders', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!canManageReportFolders(principal)) return res.status(403).json({ error: 'Report management permission is required' });
  const parsed = reportFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId && !tenant.reportFolders.some((folder) => folder.id === parsed.data.parentFolderId)) {
    return res.status(400).json({ error: 'Parent report folder was not found' });
  }
  if (tenant.reportFolders.some((folder) =>
    folder.parentFolderId === parsed.data.parentFolderId && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase())) {
    return res.status(409).json({ error: 'A report folder with this name already exists at that level' });
  }
  const shareError = validateReportFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const now = new Date().toISOString();
  const folder = reportFolderSchema.parse({
    ...parsed.data,
    id: randomUUID(),
    ownerUserId: principal.userId,
    createdAt: now,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, { ...tenant, reportFolders: [...tenant.reportFolders, folder] });
  return res.status(201).json({ folder: reportFolderForUser(tenantData(principal.tenantId)!, folder, principal.userId, true) });
});
app.put('/api/metadata/report-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const current = tenant.reportFolders.find((folder) => folder.id === folderId);
  if (!current) return res.status(404).json({ error: 'Report folder was not found' });
  if (!canManageReportFolders(principal)
    && reportFolderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager') {
    return res.status(403).json({ error: 'Manager access to this report folder is required' });
  }
  const parsed = reportFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId === folderId) return res.status(400).json({ error: 'A report folder cannot be its own parent' });
  if (parsed.data.parentFolderId && !tenant.reportFolders.some((folder) => folder.id === parsed.data.parentFolderId)) {
    return res.status(400).json({ error: 'Parent report folder was not found' });
  }
  let parentId = parsed.data.parentFolderId;
  const visited = new Set<string>([folderId]);
  while (parentId) {
    if (visited.has(parentId)) return res.status(400).json({ error: 'Report folder nesting cannot contain a cycle' });
    visited.add(parentId);
    parentId = tenant.reportFolders.find((folder) => folder.id === parentId)?.parentFolderId ?? null;
  }
  if (tenant.reportFolders.some((folder) => folder.id !== folderId
    && folder.parentFolderId === parsed.data.parentFolderId
    && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase())) {
    return res.status(409).json({ error: 'A report folder with this name already exists at that level' });
  }
  const shareError = validateReportFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const updated = reportFolderSchema.parse({ ...current, ...parsed.data, updatedAt: new Date().toISOString() });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    reportFolders: tenant.reportFolders.map((folder) => folder.id === folderId ? updated : folder)
  });
  return res.json({ folder: reportFolderForUser(tenantData(principal.tenantId)!, updated, principal.userId, canManageReportFolders(principal)) });
});
app.delete('/api/metadata/report-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const folder = tenant.reportFolders.find((item) => item.id === folderId);
  if (!folder) return res.status(404).json({ error: 'Report folder was not found' });
  if (!canManageReportFolders(principal)
    && reportFolderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager') {
    return res.status(403).json({ error: 'Manager access to this report folder is required' });
  }
  if (tenant.reports.some((report) => report.folderId === folderId)
    || tenant.reportFolders.some((item) => item.parentFolderId === folderId)) {
    return res.status(409).json({ error: 'Report folders containing reports or subfolders cannot be deleted' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    reportFolders: tenant.reportFolders.filter((item) => item.id !== folderId)
  });
  return res.status(204).end();
});
app.get('/api/metadata/reports', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  return res.json({
    reports: tenant.reports.filter((report) =>
      reportFolderAccessLevelForUser(tenant, report.folderId, principal.userId) !== null)
  });
});
const executeReport = (req: Request, res: Response, previewReport?: ReportMetadata) => {
  const viewer = getPrincipal(res);
  const tenant = tenantData(viewer.tenantId)!;
  const apiName = previewReport?.apiName ?? routeParam(req, 'apiName');
  const report = previewReport ?? tenant.reports.find((item) => item.apiName === apiName);
  if (!report) return res.status(404).json({ error: 'Report was not found' });
  if (!previewReport && reportFolderAccessLevelForUser(tenant, report.folderId, viewer.userId) === null) {
    return res.status(404).json({ error: 'Report was not found' });
  }
  const object = tenant.objects.find((item) => item.apiName === report.objectApiName);
  if (!object) return res.status(409).json({ error: `Report object "${report.objectApiName}" is no longer available` });
  if (!object.settings?.allowReports) return res.status(409).json({ error: `Reports are disabled for object "${object.label}"` });
  const runOptions = req.method === 'POST'
    ? z.object({
        dashboardFilters: z.array(dashboardFilterSchema).default([]),
          dashboardFilterLogic: z.enum(['All', 'Any']).default('All'),
          dashboardCrossFilter: dashboardFilterSchema.optional(),
        dashboardCrossFilters: z.array(dashboardFilterSchema).default([]),
        reportFilterOverrides: z.array(z.object({
          id: z.string().min(1),
          value: z.string().max(500).optional(),
          values: z.array(z.string().max(500)).optional()
        })).default([]),
        dashboardApiName: z.string().min(1).optional(),
        dashboardRunningUserId: z.string().min(1).optional(),
        offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(5000).default(100)
    }).safeParse(req.body ?? {})
    : { success: true as const, data: { dashboardFilters: [], dashboardFilterLogic: 'All' as const, dashboardCrossFilter: undefined, dashboardCrossFilters: [], reportFilterOverrides: [], dashboardApiName: undefined, dashboardRunningUserId: undefined, offset: 0, limit: 100 } };
  if (!runOptions.success) return res.status(400).json({ error: 'Invalid report run options', details: runOptions.error.flatten() });
  if (runOptions.data.dashboardRunningUserId && !runOptions.data.dashboardApiName) {
    return res.status(400).json({ error: 'dashboardRunningUserId can only be used with a dashboard report run' });
  }
  let principal = viewer;
  let dashboardForRun: DashboardMetadata | undefined;
  if (runOptions.data.dashboardApiName) {
    const dashboard = tenant.dashboards.find((item) => item.apiName === runOptions.data.dashboardApiName);
    if (!dashboard || !canAccessDashboard(dashboardForUser(tenant, dashboard, viewer.userId), viewer.userId,
      tenant.accessControl.users.find((user) => user.id === viewer.userId)?.permissionSetGroupIds ?? [],
      viewer.permissions.includes('dashboards:manage'))) {
      return res.status(404).json({ error: 'Dashboard was not found' });
    }
    if (!dashboard.components.some((component) =>
      component.reportApiName === apiName && component.objectApiName === report.objectApiName)) {
      return res.status(403).json({ error: 'This report is not a data source on the requested dashboard' });
    }
    const runningUserError = dashboardRunningUserSelectionError(viewer, tenant, dashboard, runOptions.data.dashboardRunningUserId);
    if (runningUserError) return res.status(403).json({ error: runningUserError });
    const runningPrincipal = dashboardRunningPrincipal(viewer, tenant, dashboard, runOptions.data.dashboardRunningUserId);
    if (!runningPrincipal) return res.status(409).json({ error: 'The dashboard running user is no longer active' });
    principal = runningPrincipal;
    dashboardForRun = dashboard;
  }
  const mismatchedFilter = runOptions.data.dashboardFilters
    .find((filter) => filter.objectApiName !== report.objectApiName);
  if (mismatchedFilter) return res.status(400).json({ error: 'Dashboard filters must target the report object' });
  if (dashboardForRun) {
    const configuredDashboard = dashboardForRun;
    const staleDashboardFilter = configuredDashboard.filters.find((filter) => {
      if (filter.objectApiName !== report.objectApiName) return false;
      const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
      return !field || !dashboardFilterOperatorAllowed(field, filter.operator)
        || Boolean(field && dashboardFilterValueError(field, filter.value));
    });
    if (staleDashboardFilter) {
      return res.status(409).json({
        error: `Dashboard filter "${staleDashboardFilter.id}" is no longer valid for report "${report.label}"`
      });
    }
    const invalidDashboardFilter = runOptions.data.dashboardFilters.find((filter) => {
      const configured = configuredDashboard.filters.find((item) => item.id === filter.id);
      return !configured
        || configured.objectApiName !== filter.objectApiName
        || configured.fieldApiName !== filter.fieldApiName
        || configured.operator !== filter.operator;
    });
    if (invalidDashboardFilter) {
      return res.status(400).json({ error: `Filter "${invalidDashboardFilter.id}" is not configured on dashboard "${configuredDashboard.apiName}"` });
    }
    const invalidFilterValue = runOptions.data.dashboardFilters.find((filter) => {
      const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
      return field && dashboardFilterValueError(field, filter.value);
    });
    if (invalidFilterValue) {
      const field = object.fields.find((item) => item.apiName === invalidFilterValue.fieldApiName)!;
      return res.status(400).json({
        error: `Dashboard filter value is invalid for "${object.apiName}.${field.apiName}": ${dashboardFilterValueError(field, invalidFilterValue.value)}`
      });
    }
  }
  const reportFilterIds = new Set(report.filters.map((filter) => filter.id));
  const invalidOverride = runOptions.data.reportFilterOverrides.find((override) => !reportFilterIds.has(override.id));
  if (invalidOverride) return res.status(400).json({ error: `Unknown report filter override "${invalidOverride.id}"` });
  const lockedOverride = runOptions.data.reportFilterOverrides.find((override) => {
    const filter = report.filters.find((item) => item.id === override.id);
    const savedValues = filter ? (filter.values.length ? filter.values : filter.value.trim() ? [filter.value] : []) : [];
    const overriddenValues = override.values ?? savedValues;
    return filter?.locked && (
      (override.value !== undefined && filter.value !== override.value)
      || (override.values !== undefined && JSON.stringify([...savedValues].sort()) !== JSON.stringify([...overriddenValues].sort()))
    );
  });
  if (lockedOverride) return res.status(403).json({ error: `Report filter "${lockedOverride.id}" is locked` });
  if (!hasObjectPermission(principal, tenant, object.apiName, 'read')) {
    return res.status(403).json({ error: `Missing read permission for report object "${object.apiName}"` });
  }
  const activeDashboardFilters = runOptions.data.dashboardFilters.filter((filter) =>
    filter.value.trim() !== '' || filter.operator === 'Is Null' || filter.operator === 'Is Not Null');
  const reportFilterValues = new Map(runOptions.data.reportFilterOverrides.map((filter) => [filter.id, filter]));
  const filtersWithRunValues = report.filters.map((filter) => ({
    ...filter,
    value: reportFilterValues.get(filter.id)?.value ?? filter.value,
    values: reportFilterValues.get(filter.id)?.values ?? filter.values
  }));
  const invalidReportFilterValue = filtersWithRunValues.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && reportFilterValueError(field, filter);
  });
  if (invalidReportFilterValue) {
    const field = object.fields.find((item) => item.apiName === invalidReportFilterValue.fieldApiName)!;
    return res.status(400).json({
      error: `Filter value is invalid for "${object.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidReportFilterValue)}`
    });
  }
  const allFilters = [...filtersWithRunValues, ...activeDashboardFilters];
  const selectedFields = [...new Set([
    ...report.fieldApiNames,
    ...report.groupByFieldApiNames,
    ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
    ...allFilters.map((filter) => filter.fieldApiName),
    ...(report.standardFilters.dateFieldApiName ? [report.standardFilters.dateFieldApiName] : []),
    ...(report.standardFilters.statusFieldApiName ? [report.standardFilters.statusFieldApiName] : [])
  ])];
  const inaccessibleField = selectedFields.find((fieldApiName) => {
    const bucket = report.bucketFields.find((item) => `Bucket_${item.apiName}` === fieldApiName);
    const sourceFieldApiName = bucket?.fieldApiName ?? fieldApiName;
    return !object.fields.some((field) => field.apiName === sourceFieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, sourceFieldApiName, 'read');
  });
  if (inaccessibleField) {
    return res.status(403).json({ error: `Missing read permission for report field "${object.apiName}.${inaccessibleField}"` });
  }
  const crossFilters = [...runOptions.data.dashboardCrossFilters, ...(runOptions.data.dashboardCrossFilter ? [runOptions.data.dashboardCrossFilter] : [])];
  if (dashboardForRun) {
    const configuredDashboard = dashboardForRun;
    const invalidCrossFilter = crossFilters.find((filter) => !configuredDashboard.components.some((component) =>
      component.type === 'Chart'
      && component.objectApiName === filter.objectApiName
      && (component.groupByFieldApiName === filter.fieldApiName
        || component.seriesFieldApiName === filter.fieldApiName)));
    if (invalidCrossFilter) {
      return res.status(400).json({ error: 'Dashboard cross-filters must use a chart grouping or series field on this dashboard' });
    }
  }
  const invalidCrossFilter = crossFilters.find((filter) => {
    const crossFilterObject = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    const field = crossFilterObject?.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && (!dashboardFilterOperatorAllowed(field, filter.operator)
      || Boolean(dashboardFilterValueError(field, filter.value)));
  });
  if (invalidCrossFilter) {
    const crossFilterObject = tenant.objects.find((item) => item.apiName === invalidCrossFilter.objectApiName);
    const field = crossFilterObject?.fields.find((item) => item.apiName === invalidCrossFilter.fieldApiName);
    return res.status(400).json({
      error: field
        ? `Dashboard cross-filter is invalid for "${invalidCrossFilter.objectApiName}.${field.apiName}"`
        : `Dashboard cross-filter field "${invalidCrossFilter.objectApiName}.${invalidCrossFilter.fieldApiName}" is unavailable`
    });
  }
  const sourceRecords = object.apiName === 'User'
    ? state.users.filter((user) => user.tenantId === principal.tenantId).map((user) => runtimeRecordSchema.parse({
        Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: !user.disabled, UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
      }))
    : tenant.records[object.apiName] ?? [];
  const calculatedSourceRecords = sourceRecords.map((record) =>
    calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId)));
  const reportRunTimestamp = Date.now();
  const reportSourceRecords = object.apiName === 'Opportunity'
    ? calculatedSourceRecords.map((record) => {
        const closeDate = record.CloseDate === null || record.CloseDate === undefined
          ? Number.NaN : new Date(`${String(record.CloseDate)}T00:00:00.000Z`).getTime();
        const createdDate = new Date(String(record.CreatedDate)).getTime();
        const isClosed = /^Closed(?:\b|[\s_-])/i.test(String(record.StageName ?? ''));
        const ageEnd = isClosed && Number.isFinite(closeDate) ? closeDate : reportRunTimestamp;
        const owner = tenant.accessControl.users.find((user) => user.id === record.OwnerId);
        const ownerRole = tenant.accessControl.roles.find((role) =>
          role.id === owner?.roleId || role.name === owner?.role);
        return {
          ...record,
          Fiscal: Number.isFinite(closeDate)
            ? `FY${new Date(closeDate).getUTCFullYear()} Q${Math.floor(new Date(closeDate).getUTCMonth() / 3) + 1}`
            : null,
          Age: Number.isFinite(createdDate) ? Math.max(0, Math.floor((ageEnd - createdDate) / 86_400_000)) : null,
          OwnerRole: ownerRole?.name ?? owner?.role ?? null
        };
      })
    : object.apiName === 'Case'
      ? calculatedSourceRecords.map((record) => {
          const createdDate = new Date(String(record.CreatedDate)).getTime();
          const isClosed = /^closed(?:\b|[\s_-])/i.test(String(record.Status ?? ''));
          const closedDate = record.ClosedDate === null || record.ClosedDate === undefined
            ? Number.NaN : new Date(String(record.ClosedDate)).getTime();
          const lastModifiedDate = new Date(String(record.LastModifiedDate)).getTime();
          const ageEnd = isClosed
            ? Number.isFinite(closedDate) ? closedDate : lastModifiedDate
            : reportRunTimestamp;
          return {
            ...record,
            Age: Number.isFinite(createdDate) && Number.isFinite(ageEnd)
              ? Math.max(0, Math.floor((ageEnd - createdDate) / 86_400_000))
              : null,
            IsOpen: !isClosed,
            IsClosed: isClosed
          };
        })
    : calculatedSourceRecords;
  const matches = (
    record: RuntimeRecord,
    filter: ReportMetadata['filters'][number] | DashboardFilterMetadata
  ) => reportFilterMatches(record, filter);
  const visibleSourceRecords = object.apiName === 'User'
    ? reportSourceRecords
    : reportSourceRecords.filter((record) => hasRecordAccess(principal, tenant, object.apiName, record, 'Read'));
  const crossFilterResolution = resolveDashboardCrossFilters(principal, tenant, object.apiName, crossFilters, matches);
  if ('error' in crossFilterResolution) {
    return res.status(crossFilterResolution.status).json({ error: crossFilterResolution.error });
  }
  const logic = parseReportFilterLogic(report.filterLogic, report.filters.length);
  if (!logic) return res.status(409).json({ error: 'Saved report filter logic is invalid' });
  const activeReportFilterMatches = (record: RuntimeRecord) => {
    const result = evaluateReportFilterLogic(logic, filtersWithRunValues.map((filter) =>
      filter.value.trim() || filter.values.length > 0 || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'
        ? matches(record, filter)
        : null));
    return result ?? true;
  };
  const dateBounds = reportDateRangeBounds(report.standardFilters.dateRange);
  const reportCrossFilterResolution = resolveReportCrossFilters(principal, tenant, object, report.crossFilters, matches);
  if ('error' in reportCrossFilterResolution) {
    return res.status(reportCrossFilterResolution.status).json({ error: reportCrossFilterResolution.error });
  }
  const matchedRecords = visibleSourceRecords.filter((record) => (
    report.filters.length === 0 || activeReportFilterMatches(record)
  )
    && (report.standardFilters.showMe !== 'My' || record.OwnerId === principal.userId)
    && (!dateBounds || !report.standardFilters.dateFieldApiName || (() => {
      const value = record[report.standardFilters.dateFieldApiName!];
      const timestamp = value === null || value === undefined || value === '' ? Number.NaN : new Date(String(value)).getTime();
      return Number.isFinite(timestamp) && timestamp >= dateBounds[0] && timestamp < dateBounds[1];
    })())
    && (report.standardFilters.statusSelection === 'All' || !report.standardFilters.statusFieldApiName || (() => {
      const value = String(record[report.standardFilters.statusFieldApiName!] ?? '');
      const isClosed = /^closed(?:\b|[\s_-])/i.test(value);
      if (report.standardFilters.statusSelection === 'Closed') return isClosed;
      if (report.standardFilters.statusSelection === 'Open') return value !== '' && !isClosed;
      return value.toLocaleLowerCase() === report.standardFilters.statusSelection.toLocaleLowerCase();
    })())
    && matchesDashboardFilters(
      activeDashboardFilters,
      runOptions.data.dashboardFilterLogic,
      (filter) => matches(record, filter)
    )
    && (!crossFilters.length || crossFilterResolution.recordIds.has(record.Id))
    && reportCrossFilterResolution.matchesRecord(record));
  const visibleRecords = matchedRecords.map((record) => {
    const bucketValues: Record<string, unknown> = {};
    for (const bucket of report.bucketFields) {
      const raw = (record as RuntimeRecord)[bucket.fieldApiName];
      const numericValue = raw === null || raw === undefined || raw === ''
        ? bucket.treatBlanksAsZero ? 0 : Number.NaN
        : Number(raw);
      const range = Number.isFinite(numericValue)
        ? bucket.ranges.find((candidate) =>
          (candidate.lowerBound === null || numericValue >= candidate.lowerBound)
          && (candidate.upperBound === null || numericValue < candidate.upperBound))
        : undefined;
      bucketValues[`Bucket_${bucket.apiName}`] = range?.label ?? null;
    }
    return { ...record, ...bucketValues } as RuntimeRecord;
  });
  const configuredSortField = report.rowLimit.limit !== null
    ? report.rowLimit.sortFieldApiName
    : report.sortFieldApiName;
  const sortField = configuredSortField
    ? object.fields.find((field) => field.apiName === configuredSortField)
    : undefined;
  const isBucketSort = Boolean(configuredSortField && report.bucketFields.some((bucket) => `Bucket_${bucket.apiName}` === configuredSortField));
  const sortDirection = (report.rowLimit.limit !== null ? report.rowLimit.sortDirection : report.sortDirection) === 'Descending' ? -1 : 1;
  const compareSortValues = (leftValue: unknown, rightValue: unknown): number => {
    if (leftValue === null || leftValue === undefined || leftValue === '') return rightValue === null || rightValue === undefined || rightValue === '' ? 0 : -1;
    if (rightValue === null || rightValue === undefined || rightValue === '') return 1;
    if (isNumericField(sortField)) {
      return (Number(leftValue) - Number(rightValue)) * sortDirection;
    }
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * sortDirection;
  };
  if (sortField || isBucketSort) {
    visibleRecords.sort((left, right) =>
      compareSortValues((left as RuntimeRecord)[configuredSortField!], (right as RuntimeRecord)[configuredSortField!])
      || left.Id.localeCompare(right.Id));
  }
  if (report.rowLimit.limit !== null) visibleRecords.splice(report.rowLimit.limit);
  const numericSummaryFields = report.fieldApiNames.filter((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    return isNumericField(field);
  });
  type NumericSummary = { sums: Record<string, number>; counts: Record<string, number>; minimums: Record<string, number>; maximums: Record<string, number> };
  const summarizeNumericFields = (records: RuntimeRecord[]): NumericSummary => {
    const summary: NumericSummary = { sums: {}, counts: {}, minimums: {}, maximums: {} };
    report.fieldApiNames.forEach((fieldApiName) => {
      summary.counts[fieldApiName] = records.filter((record) =>
        record[fieldApiName] !== null && record[fieldApiName] !== undefined && record[fieldApiName] !== '').length;
    });
    numericSummaryFields.forEach((fieldApiName) => {
      const values = records
        .map((record) => record[fieldApiName])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite);
      summary.sums[fieldApiName] = values.reduce((total, value) => total + value, 0);
      summary.counts[fieldApiName] = values.length;
      if (values.length) {
        summary.minimums[fieldApiName] = values.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY);
        summary.maximums[fieldApiName] = values.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY);
      }
    });
    return summary;
  };
  const addRecordToSummary = (summary: NumericSummary, record: RuntimeRecord) => {
    report.fieldApiNames.forEach((fieldApiName) => {
      const rawValue = record[fieldApiName];
      if (rawValue !== null && rawValue !== undefined && rawValue !== '') summary.counts[fieldApiName] += 1;
    });
    numericSummaryFields.forEach((fieldApiName) => {
      const rawValue = record[fieldApiName];
      if (rawValue === null || rawValue === undefined || rawValue === '') return;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return;
      summary.sums[fieldApiName] += value;
      summary.minimums[fieldApiName] = fieldApiName in summary.minimums ? Math.min(summary.minimums[fieldApiName], value) : value;
      summary.maximums[fieldApiName] = fieldApiName in summary.maximums ? Math.max(summary.maximums[fieldApiName], value) : value;
    });
  };
  const groupValueFor = (record: RuntimeRecord, fieldApiName: string): unknown => {
    const value = record[fieldApiName];
    const granularity = report.dateGroupings[fieldApiName];
    if (value === null || value === undefined || !granularity) return value ?? null;
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime())) return value;
    if (granularity === 'Day') return date.toISOString().slice(0, 10);
    const year = date.getUTCFullYear();
    if (granularity === 'Year') return String(year);
    if (granularity === 'Quarter') return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    if (granularity === 'Month') return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return date.toISOString().slice(0, 10);
  };
  const grouped = new Map<string, { groupValues: Record<string, unknown>; rowCount: number } & NumericSummary>();
  const subtotals = new Map<string, { groupValues: Record<string, unknown>; groupLevel: number; rowCount: number } & NumericSummary>();
  if (report.groupByFieldApiNames.length) {
    visibleRecords.forEach((record) => {
      const groupingFields = [...report.groupByFieldApiNames, ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : [])];
      const groupValues = Object.fromEntries(groupingFields.map((fieldApiName) => [
        fieldApiName,
        groupValueFor(record, fieldApiName)
      ]));
      const key = JSON.stringify(groupingFields.map((fieldApiName) => groupValues[fieldApiName]));
      const group = grouped.get(key) ?? { groupValues, rowCount: 0, ...summarizeNumericFields([]) };
      group.rowCount += 1;
      addRecordToSummary(group, record);
      grouped.set(key, group);

      for (let groupLevel = 1; groupLevel < report.groupByFieldApiNames.length; groupLevel += 1) {
        const subtotalFields = report.groupByFieldApiNames.slice(0, groupLevel);
        const subtotalValues = Object.fromEntries(subtotalFields.map((fieldApiName) => [
          fieldApiName,
          groupValueFor(record, fieldApiName)
        ]));
        if (report.columnGroupByFieldApiName) {
          subtotalValues[report.columnGroupByFieldApiName] = groupValueFor(record, report.columnGroupByFieldApiName);
        }
        const subtotalKey = JSON.stringify([
          groupLevel,
          ...subtotalFields.map((fieldApiName) => subtotalValues[fieldApiName]),
          ...(report.columnGroupByFieldApiName ? [subtotalValues[report.columnGroupByFieldApiName]] : [])
        ]);
        const subtotal = subtotals.get(subtotalKey) ?? {
          groupValues: subtotalValues,
          groupLevel,
          rowCount: 0,
          ...summarizeNumericFields([])
        };
        subtotal.rowCount += 1;
        addRecordToSummary(subtotal, record);
        subtotals.set(subtotalKey, subtotal);
      }
    });
  }
  const summaryTotals = {
    rowCount: visibleRecords.length,
    ...summarizeNumericFields(visibleRecords)
  };
  const rows = report.showDetails || runOptions.data.dashboardApiName
    ? visibleRecords.slice(runOptions.data.offset, runOptions.data.offset + runOptions.data.limit).map((record) => {
    const readable = sanitizeRecordForRead(principal, tenant, object, record);
    const outputFields = new Set([...report.fieldApiNames, ...report.groupByFieldApiNames, ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : [])]);
    return Object.fromEntries([...outputFields].map((fieldApiName) => {
      const value = report.bucketFields.some((bucket) => `Bucket_${bucket.apiName}` === fieldApiName)
        ? (record as RuntimeRecord)[fieldApiName] ?? null
        : readable[fieldApiName] ?? null;
      if (runOptions.data.dashboardApiName || typeof value !== 'string') return [fieldApiName, value];
      const field = object.fields.find((item) => item.apiName === fieldApiName);
      const targetObjectApiName = field?.relationship?.targetObject;
      if (!targetObjectApiName) return [fieldApiName, value];
      const targetObject = tenant.objects.find((item) => item.apiName === targetObjectApiName);
      if (!targetObject || !hasObjectPermission(principal, tenant, targetObjectApiName, 'read')
        || !hasFieldPermission(principal, tenant, targetObjectApiName, 'Name', 'read')) {
        return [fieldApiName, null];
      }
      if (targetObjectApiName === 'User') {
        const relatedUser = state.users.find((user) => user.id === value && user.tenantId === principal.tenantId);
        return [fieldApiName, relatedUser?.name ?? null];
      }
      const relatedRecord = (tenant.records[targetObjectApiName] ?? []).find((item) => item.Id === value);
      if (!relatedRecord || !hasRecordAccess(principal, tenant, targetObjectApiName, relatedRecord, 'Read')) {
        return [fieldApiName, null];
      }
      return [fieldApiName, sanitizeRecordForRead(principal, tenant, targetObject, relatedRecord).Name ?? null];
    }));
    })
    : [];
  const summaryRows = [...grouped.values()];
  const subtotalRows = [...subtotals.values()].sort((left, right) => {
    const leftKey = JSON.stringify(report.groupByFieldApiNames.slice(0, left.groupLevel)
      .map((fieldApiName) => left.groupValues[fieldApiName]));
    const rightKey = JSON.stringify(report.groupByFieldApiNames.slice(0, right.groupLevel)
      .map((fieldApiName) => right.groupValues[fieldApiName]));
    return left.groupLevel - right.groupLevel || leftKey.localeCompare(rightKey)
      || String(left.groupValues[report.columnGroupByFieldApiName ?? ''] ?? '')
        .localeCompare(String(right.groupValues[report.columnGroupByFieldApiName ?? ''] ?? ''));
  });
  if (sortField) {
    summaryRows.sort((left, right) => {
      const leftValue = left.groupValues[sortField.apiName] ?? left.sums[sortField.apiName];
      const rightValue = right.groupValues[sortField.apiName] ?? right.sums[sortField.apiName];
      const comparison = report.dateGroupings[sortField.apiName]
        ? String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        : compareSortValues(leftValue, rightValue);
      return comparison
        || JSON.stringify(left.groupValues).localeCompare(JSON.stringify(right.groupValues));
    });
  } else {
    summaryRows.sort((left, right) => JSON.stringify(left.groupValues).localeCompare(JSON.stringify(right.groupValues)));
  }
  return res.json({
    report,
    rows,
    summaryRows,
    subtotalRows,
    summaryTotals,
    totalRows: visibleRecords.length,
    offset: runOptions.data.offset,
    pageSize: runOptions.data.limit,
    truncated: (report.showDetails || Boolean(runOptions.data.dashboardApiName))
      && visibleRecords.length > runOptions.data.offset + rows.length,
    generatedAt: new Date().toISOString()
  });
};
app.post('/api/reports/preview', accessAuthentication, (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body?.report);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid report preview configuration', details: parsed.error.flatten() });
  }
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
  if (!object || !object.settings?.allowReports) {
    return res.status(422).json({ error: `Reports are not enabled for object "${parsed.data.objectApiName}"` });
  }
  const fieldNames = new Set(object.fields.map((field) => field.apiName));
  const bucketApiNames = new Set(parsed.data.bucketFields.map((bucket) => `Bucket_${bucket.apiName}`));
  const referencedFields = [
    ...parsed.data.fieldApiNames,
    ...parsed.data.groupByFieldApiNames,
    ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : []),
    ...parsed.data.filters.map((filter) => filter.fieldApiName),
    ...Object.keys(parsed.data.summaryOperations),
    ...Object.keys(parsed.data.dateGroupings),
    ...(parsed.data.standardFilters.dateFieldApiName ? [parsed.data.standardFilters.dateFieldApiName] : []),
    ...(parsed.data.standardFilters.statusFieldApiName ? [parsed.data.standardFilters.statusFieldApiName] : [])
  ];
  const unknownField = referencedFields.find((fieldApiName) => !fieldNames.has(fieldApiName) && !bucketApiNames.has(fieldApiName));
  if (unknownField) {
    return res.status(400).json({ error: `Report references unknown field "${unknownField}" on "${object.label}"` });
  }
  const invalidBucket = parsed.data.bucketFields.find((bucket) => {
    const source = object.fields.find((field) => field.apiName === bucket.fieldApiName);
    return !source || !isNumericField(source) || fieldNames.has(`Bucket_${bucket.apiName}`);
  });
  if (invalidBucket) return res.status(422).json({ error: `Bucket "${invalidBucket.label}" requires a numeric source field and a unique generated field name` });
  if (parsed.data.standardFilters.showMe === 'My' && !fieldNames.has('OwnerId')) {
    return res.status(422).json({ error: `The "${object.label}" report type does not support the My records standard filter` });
  }
  if (parsed.data.standardFilters.dateFieldApiName) {
    const dateField = object.fields.find((field) => field.apiName === parsed.data.standardFilters.dateFieldApiName);
    if (!dateField || !/^(Date|DateTime)(\(|$)/.test(dateField.dataType)) {
      return res.status(422).json({ error: 'The standard report date filter must use a Date or DateTime field' });
    }
  }
  if (parsed.data.standardFilters.statusFieldApiName) {
    const statusField = object.fields.find((field) => field.apiName === parsed.data.standardFilters.statusFieldApiName);
    if (!statusField?.picklistValues?.length || !['Status', 'StageName'].includes(statusField.apiName)) {
      return res.status(422).json({ error: 'The standard report status filter must use a Status or StageName picklist field' });
    }
    if (!['All', 'Open', 'Closed'].includes(parsed.data.standardFilters.statusSelection)
      && !statusField.picklistValues.includes(parsed.data.standardFilters.statusSelection)) {
      return res.status(422).json({ error: `Unknown status value "${parsed.data.standardFilters.statusSelection}" for "${statusField.label}"` });
    }
  }
  const invalidFilterOperator = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return !field || !reportFilterOperatorAllowed(field, filter.operator);
  });
  if (invalidFilterOperator) {
    return res.status(422).json({ error: `Operator "${invalidFilterOperator.operator}" is not valid for report field "${invalidFilterOperator.fieldApiName}"` });
  }
  const invalidFilterValue = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && reportFilterValueError(field, filter);
  });
  if (invalidFilterValue) {
    const field = object.fields.find((item) => item.apiName === invalidFilterValue.fieldApiName)!;
    return res.status(422).json({
      error: `Filter value is invalid for "${object.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidFilterValue)}`
    });
  }
  for (const crossFilter of parsed.data.crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    if (!childObject?.fields.some((field) => field.relationship?.targetObject === object.apiName)) {
      return res.status(422).json({ error: `Cross-filter object "${crossFilter.childObjectApiName}" is not related as a child of "${object.apiName}"` });
    }
    const invalidSubfilter = crossFilter.filters.find((filter) => {
      const field = childObject.fields.find((item) => item.apiName === filter.fieldApiName);
      return !field || !reportFilterOperatorAllowed(field, filter.operator) || Boolean(reportFilterValueError(field, filter));
    });
    if (invalidSubfilter) {
      return res.status(422).json({
        error: `Invalid cross-filter condition on "${childObject.apiName}.${invalidSubfilter.fieldApiName}"`
      });
    }
  }
  const invalidSummaryField = Object.keys(parsed.data.summaryOperations).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    const bucket = parsed.data.bucketFields.find((item) => `Bucket_${item.apiName}` === fieldApiName);
    const operations = parsed.data.summaryOperations[fieldApiName];
    return !parsed.data.fieldApiNames.includes(fieldApiName)
      || (bucket ? operations.some((operation) => operation !== 'Count') : !field)
      || (operations.some((operation) => operation !== 'Count') && !isNumericField(field));
  });
  if (invalidSummaryField) {
    return res.status(422).json({ error: `Only Count can summarize a nonnumeric report column: "${invalidSummaryField}"` });
  }
  const invalidDateGrouping = Object.keys(parsed.data.dateGroupings).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    return (!parsed.data.groupByFieldApiNames.includes(fieldApiName)
      && parsed.data.columnGroupByFieldApiName !== fieldApiName)
      || !field
      || !/^(Date|DateTime)(\(|$)/.test(field.dataType);
  });
  if (invalidDateGrouping) {
    return res.status(422).json({ error: `Date grouping requires a grouped Date or DateTime field: "${invalidDateGrouping}"` });
  }
  const report = {
    ...parsed.data,
    dateGroupings: {
      ...Object.fromEntries([...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : [])]
        .filter((fieldApiName) => {
          const field = object.fields.find((item) => item.apiName === fieldApiName);
          return Boolean(field && /^(Date|DateTime)(\(|$)/.test(field.dataType));
        })
        .map((fieldApiName) => [fieldApiName, 'Day' as const])),
      ...parsed.data.dateGroupings
    }
  };
  return executeReport(req, res, report);
});
app.get('/api/reports/:apiName/run', accessAuthentication, (req: Request, res: Response) => executeReport(req, res));
app.post('/api/reports/:apiName/run', accessAuthentication, (req: Request, res: Response) => executeReport(req, res));
app.put('/api/metadata/reports/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existingReport = tenant.reports.find((report) => report.apiName === apiName);
  const requestedGroupings = Array.isArray(req.body?.groupByFieldApiNames)
    ? new Set(req.body.groupByFieldApiNames.filter((field: unknown): field is string => typeof field === 'string'))
    : null;
  if (existingReport && requestedGroupings) {
    const invalidatedChart = tenant.dashboards
      .flatMap((dashboard) => dashboard.components.map((component) => ({ dashboard, component })))
      .find(({ component }) => component.reportApiName === apiName
        && component.type === 'Chart'
        && component.groupByFieldApiName
        && !requestedGroupings.has(component.groupByFieldApiName));
    if (invalidatedChart) {
      return res.status(409).json({
        error: `This report update would invalidate dashboard component "${invalidatedChart.component.title}" on "${invalidatedChart.dashboard.label}"`
      });
    }
  }
  const parsed = reportSchema.safeParse({ ...req.body, apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid report metadata', details: parsed.error.flatten() });
  const conflictingName = tenant.reports.find((report) =>
    report.apiName.toLowerCase() === parsed.data.apiName.toLowerCase() && report.apiName !== parsed.data.apiName);
  if (conflictingName) return res.status(409).json({ error: `Report API name "${parsed.data.apiName}" conflicts with "${conflictingName.apiName}"` });
  const object = tenant.objects.find((item) => item.apiName === parsed.data.objectApiName);
  if (!object || !object.settings?.allowReports) {
    return res.status(422).json({ error: `Reports are not enabled for object "${parsed.data.objectApiName}"` });
  }
  const fieldNames = new Set(object.fields.map((field) => field.apiName));
  const bucketApiNames = new Set(parsed.data.bucketFields.map((bucket) => `Bucket_${bucket.apiName}`));
  const unknownField = [...parsed.data.fieldApiNames, ...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : []),   ...parsed.data.filters.map((filter) => filter.fieldApiName),
  ...Object.keys(parsed.data.summaryOperations), ...Object.keys(parsed.data.dateGroupings),
  ...(parsed.data.standardFilters.dateFieldApiName ? [parsed.data.standardFilters.dateFieldApiName] : []),
  ...(parsed.data.standardFilters.statusFieldApiName ? [parsed.data.standardFilters.statusFieldApiName] : [])]
    .find((fieldApiName) => !fieldNames.has(fieldApiName) && !bucketApiNames.has(fieldApiName));
  if (unknownField) return res.status(400).json({ error: `Report references unknown field "${unknownField}" on "${object.label}"` });
  const invalidBucket = parsed.data.bucketFields.find((bucket) => {
    const source = object.fields.find((field) => field.apiName === bucket.fieldApiName);
    return !source || !isNumericField(source) || fieldNames.has(`Bucket_${bucket.apiName}`);
  });
  if (invalidBucket) return res.status(422).json({ error: `Bucket "${invalidBucket.label}" requires a numeric source field and a unique generated field name` });
  const invalidFilterOperator = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return !field || !reportFilterOperatorAllowed(field, filter.operator);
  });
  if (invalidFilterOperator) return res.status(422).json({ error: `Operator "${invalidFilterOperator.operator}" is not valid for report field "${invalidFilterOperator.fieldApiName}"` });
  const invalidFilterValue = parsed.data.filters.find((filter) => {
    const field = object.fields.find((item) => item.apiName === filter.fieldApiName);
    return field && reportFilterValueError(field, filter);
  });
  if (invalidFilterValue) {
    const field = object.fields.find((item) => item.apiName === invalidFilterValue.fieldApiName)!;
    return res.status(422).json({
      error: `Filter value is invalid for "${object.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidFilterValue)}`
    });
  }
  if (parsed.data.standardFilters.showMe === 'My' && !fieldNames.has('OwnerId')) {
    return res.status(422).json({ error: `The "${object.label}" report type does not support the My records standard filter` });
  }
  if (parsed.data.standardFilters.dateFieldApiName) {
    const dateField = object.fields.find((field) => field.apiName === parsed.data.standardFilters.dateFieldApiName);
    if (!dateField || !/^(Date|DateTime)(\(|$)/.test(dateField.dataType)) {
      return res.status(422).json({ error: 'The standard report date filter must use a Date or DateTime field' });
    }
  }
  if (parsed.data.standardFilters.statusFieldApiName) {
    const statusField = object.fields.find((field) => field.apiName === parsed.data.standardFilters.statusFieldApiName);
    if (!statusField?.picklistValues?.length || !['Status', 'StageName'].includes(statusField.apiName)) {
      return res.status(422).json({ error: 'The standard report status filter must use a Status or StageName picklist field' });
    }
    if (!['All', 'Open', 'Closed'].includes(parsed.data.standardFilters.statusSelection)
      && !statusField.picklistValues.includes(parsed.data.standardFilters.statusSelection)) {
      return res.status(422).json({ error: `Unknown status value "${parsed.data.standardFilters.statusSelection}" for "${statusField.label}"` });
    }
  }
  const invalidSummaryField = Object.keys(parsed.data.summaryOperations).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    const bucket = parsed.data.bucketFields.find((item) => `Bucket_${item.apiName}` === fieldApiName);
    const operations = parsed.data.summaryOperations[fieldApiName];
    return !parsed.data.fieldApiNames.includes(fieldApiName)
      || (bucket ? operations.some((operation) => operation !== 'Count') : !field)
      || (operations.some((operation) => operation !== 'Count') && !isNumericField(field));
  });
  if (invalidSummaryField) return res.status(422).json({ error: `Only Count can summarize a nonnumeric report column: "${invalidSummaryField}"` });
  if (Object.keys(parsed.data.summaryOperations).length
    && (parsed.data.format === 'Tabular' || !parsed.data.groupByFieldApiNames.length)) {
    return res.status(422).json({ error: 'Summary operations require a grouped Summary or Matrix report' });
  }
  const invalidDateGrouping = Object.keys(parsed.data.dateGroupings).find((fieldApiName) => {
    const field = object.fields.find((item) => item.apiName === fieldApiName);
    return !parsed.data.groupByFieldApiNames.includes(fieldApiName)
      && parsed.data.columnGroupByFieldApiName !== fieldApiName
      || !field || !/^(Date|DateTime)(\(|$)/.test(field.dataType);
  });
  if (invalidDateGrouping) return res.status(422).json({ error: `Date grouping requires a grouped Date or DateTime field: "${invalidDateGrouping}"` });
  parsed.data.dateGroupings = {
    ...Object.fromEntries([...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : [])]
      .filter((fieldApiName) => {
        const field = object.fields.find((item) => item.apiName === fieldApiName);
        return Boolean(field && /^(Date|DateTime)(\(|$)/.test(field.dataType));
      })
      .map((fieldApiName) => [fieldApiName, 'Day' as const])),
    ...parsed.data.dateGroupings
  };
  for (const crossFilter of parsed.data.crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    if (!childObject?.fields.some((field) => field.relationship?.targetObject === object.apiName)) {
      return res.status(422).json({ error: `Cross-filter object "${crossFilter.childObjectApiName}" is not related as a child of "${object.apiName}"` });
    }
    const invalidSubfilter = crossFilter.filters.find((filter) =>
      !childObject.fields.some((field) => field.apiName === filter.fieldApiName));
    if (invalidSubfilter) {
      return res.status(400).json({ error: `Unknown cross-filter field "${invalidSubfilter.fieldApiName}" on "${childObject.label}"` });
    }
    const invalidSubfilterOperator = crossFilter.filters.find((filter) => {
      const field = childObject.fields.find((item) => item.apiName === filter.fieldApiName);
      return !field || !reportFilterOperatorAllowed(field, filter.operator);
    });
    if (invalidSubfilterOperator) return res.status(422).json({ error: `Operator "${invalidSubfilterOperator.operator}" is not valid for cross-filter field "${invalidSubfilterOperator.fieldApiName}"` });
    const invalidSubfilterValue = crossFilter.filters.find((filter) => {
      const field = childObject.fields.find((item) => item.apiName === filter.fieldApiName);
      return field && reportFilterValueError(field, filter);
    });
    if (invalidSubfilterValue) {
      const field = childObject.fields.find((item) => item.apiName === invalidSubfilterValue.fieldApiName)!;
      return res.status(422).json({
        error: `Cross-filter value is invalid for "${childObject.apiName}.${field.apiName}": ${reportFilterValueError(field, invalidSubfilterValue)}`
      });
    }
  }
  const reportFields = new Set([...parsed.data.fieldApiNames, ...parsed.data.groupByFieldApiNames, ...(parsed.data.columnGroupByFieldApiName ? [parsed.data.columnGroupByFieldApiName] : [])]);
  const invalidatingComponent = tenant.dashboards
    .flatMap((dashboard) => dashboard.components.map((component) => ({ dashboard, component })))
    .find(({ component }) => component.reportApiName === parsed.data.apiName && (
      component.objectApiName !== parsed.data.objectApiName
      || [
        ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
        ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
        ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
        ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
        ...component.displayFieldApiNames
      ].some((fieldApiName) => !reportFields.has(fieldApiName))
      || (component.type === 'Chart' && component.groupByFieldApiName !== null
        && component.groupByFieldApiName !== undefined
        && !parsed.data.groupByFieldApiNames.includes(component.groupByFieldApiName))
      || (component.type === 'Chart' && component.seriesFieldApiName !== null
        && component.seriesFieldApiName !== undefined
        && !parsed.data.groupByFieldApiNames.includes(component.seriesFieldApiName))
      || (component.type === 'Chart' && component.chartType === 'Scatter'
        && !parsed.data.groupByFieldApiNames.includes(component.xAxisFieldApiName ?? ''))
    ));
  if (invalidatingComponent) {
    return res.status(409).json({ error: `This report update would invalidate dashboard component "${invalidatingComponent.component.title}" on "${invalidatingComponent.dashboard.label}"` });
  }
  const reportFolders = [...tenant.reportFolders];
  if (parsed.data.folderId && !reportFolders.some((folder) => folder.id === parsed.data.folderId)) {
    return res.status(400).json({ error: 'The selected report folder does not exist in this tenant' });
  }
  let folderId = parsed.data.folderId ?? existingReport?.folderId ?? null;
  let targetFolder = reportFolders.find((folder) => folder.id === folderId);
  if (!targetFolder) {
    const folderLabel = parsed.data.folderName === 'Public Reports' ? 'Public Reports' : 'My Reports';
    const visibility = folderLabel === 'Public Reports' ? 'All Users' : 'Private';
    targetFolder = reportFolders.find((folder) => folder.label === folderLabel
      && folder.visibility === visibility
      && (visibility === 'All Users' || folder.ownerUserId === principal.userId));
    if (!targetFolder) {
      const now = new Date().toISOString();
      targetFolder = reportFolderSchema.parse({
        id: randomUUID(),
        label: folderLabel,
        parentFolderId: null,
        ownerUserId: principal.userId,
        shares: [],
        visibility,
        createdAt: now,
        updatedAt: now
      });
      reportFolders.push(targetFolder);
    }
    folderId = targetFolder.id;
  }
  const existingFolderId = existingReport?.folderId ?? null;
  if (!canManageReportFolders(principal)) {
    const targetAccess = reportFolderAccessLevelForUser(
      { ...tenant, reportFolders },
      folderId,
      principal.userId
    );
    if (targetAccess !== 'Editor' && targetAccess !== 'Manager') {
      return res.status(403).json({ error: 'Editor access to the target report folder is required' });
    }
    if (existingFolderId && existingFolderId !== folderId
      && reportFolderAccessLevelForUser(tenant, existingFolderId, principal.userId) !== 'Manager') {
      return res.status(403).json({ error: 'Manager access to the current report folder is required to move this report' });
    }
  }
  parsed.data.folderId = folderId;
  parsed.data.folderName = targetFolder.label;
  const reports = tenant.reports.some((report) => report.apiName === apiName)
    ? tenant.reports.map((report) => report.apiName === apiName ? parsed.data : report)
    : [...tenant.reports, parsed.data];
  const updatedTenant = { ...tenant, reports, reportFolders };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({
    report: parsed.data,
    folder: reportFolderForUser(updatedTenant, targetFolder, principal.userId, canManageReportFolders(principal))
  });
});
app.delete('/api/metadata/reports/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const report = tenant.reports.find((item) => item.apiName === apiName);
  if (!report) return res.status(404).json({ error: 'Report was not found' });
  if (!canManageReportFolders(principal)
    && reportFolderAccessLevelForUser(tenant, report.folderId, principal.userId) !== 'Manager') {
    return res.status(403).json({ error: 'Manager access to the report folder is required to delete this report' });
  }
  const inUse = tenant.dashboards.some((dashboard) => dashboard.components.some((component) => component.reportApiName === apiName));
  if (inUse) return res.status(409).json({ error: 'This report is used by a dashboard. Remove all dashboard references before deleting it.' });
  const updatedTenant = { ...tenant, reports: tenant.reports.filter((report) => report.apiName !== apiName) };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.status(204).end();
});
app.get('/api/metadata/apps', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ apps: tenantData(getPrincipal(res).tenantId)?.apps ?? [] });
});
app.get('/api/apps/:appApiName/home-page', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const appApiName = routeParam(req, 'appApiName');
  if (!tenant.apps.some((item) => item.apiName === appApiName)) return res.status(404).json({ error: 'Lightning app was not found' });
  const formFactor = req.query.formFactor;
  if (formFactor !== undefined && formFactor !== 'Desktop' && formFactor !== 'Phone') {
    return res.status(400).json({ error: 'Form factor must be Desktop or Phone' });
  }
  const homePage = resolveActiveLightningHomePage(
    tenant,
    appApiName,
    profileIdForPrincipal(principal, tenant),
    formFactor === 'Phone' ? 'Phone' : 'Desktop'
  );
  return res.json({ page: homePage ?? null });
});
app.get('/api/apps/:appApiName/pages/:pageApiName', accessAuthentication, (req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  const appApiName = routeParam(req, 'appApiName');
  const pageApiName = routeParam(req, 'pageApiName');
  const app = tenant.apps.find((item) => item.apiName === appApiName);
  if (!app) return res.status(404).json({ error: 'Lightning app was not found' });
  if (!app.navigationPageApiNames.includes(pageApiName)) return res.status(404).json({ error: 'Lightning page is not in this app navigation' });
  const page = tenant.pages.find((item) => item.apiName === pageApiName && item.pageType === 'App Page' && item.status === 'Active');
  if (!page) return res.status(404).json({ error: 'Active App Page was not found' });
  const formFactor = req.query.formFactor;
  if (formFactor !== undefined && formFactor !== 'Desktop' && formFactor !== 'Phone') {
    return res.status(400).json({ error: 'Form factor must be Desktop or Phone' });
  }
  if (!page.devices.includes(formFactor === 'Phone' ? 'Phone' : 'Desktop')) {
    return res.status(404).json({ error: 'App Page is not available for this form factor' });
  }
  return res.json({ page });
});
app.post('/api/metadata/apps', requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
  const parsed = lightningAppSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Lightning app metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (tenant.apps.some((item) => item.apiName.toLowerCase() === parsed.data.apiName.toLowerCase())) {
    return res.status(409).json({ error: `Lightning app "${parsed.data.apiName}" already exists` });
  }
  const invalidObject = parsed.data.navigationItems.find((apiName) => !tenant.objects.some((object) => object.apiName === apiName));
  if (invalidObject) return res.status(400).json({ error: `Navigation item "${invalidObject}" is not a tenant object` });
  const invalidPage = parsed.data.navigationPageApiNames.find((pageApiName) =>
    !tenant.pages.some((page) => page.apiName === pageApiName && page.pageType === 'App Page' && page.status === 'Active'));
  if (invalidPage) return res.status(400).json({ error: `Navigation page "${invalidPage}" must be an active App Page` });
  const apps = [...tenant.apps, parsed.data];
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: { ...tenant, apps } } };
  persistState(nextState);
  state = nextState;
  return res.status(201).json({ app: parsed.data });
});
app.put('/api/metadata/apps/:apiName', requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const parsed = lightningAppSchema.safeParse({ ...req.body, apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Lightning app metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!tenant.apps.some((item) => item.apiName === apiName)) return res.status(404).json({ error: 'Lightning app was not found' });
  const invalidObject = parsed.data.navigationItems.find((item) => !tenant.objects.some((object) => object.apiName === item));
  if (invalidObject) return res.status(400).json({ error: `Navigation item "${invalidObject}" is not a tenant object` });
  const invalidPage = parsed.data.navigationPageApiNames.find((pageApiName) =>
    !tenant.pages.some((page) => page.apiName === pageApiName && page.pageType === 'App Page' && page.status === 'Active'));
  if (invalidPage) return res.status(400).json({ error: `Navigation page "${invalidPage}" must be an active App Page` });
  const apps = tenant.apps.map((item) => item.apiName === apiName ? parsed.data : item);
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: { ...tenant, apps } } };
  persistState(nextState);
  state = nextState;
  return res.json({ app: parsed.data });
});
app.delete('/api/metadata/apps/:apiName', requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!tenant.apps.some((item) => item.apiName === apiName)) return res.status(404).json({ error: 'Lightning app was not found' });
  if (tenant.pages.some((page) => page.activationAssignments?.some((assignment) => assignment.appId === apiName))) {
    return res.status(409).json({ error: 'This app is used by Lightning page activation assignments. Reassign those pages before deleting it.' });
  }
  const apps = tenant.apps.filter((item) => item.apiName !== apiName);
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: { ...tenant, apps } } };
  persistState(nextState);
  state = nextState;
  return res.status(204).end();
});
app.get('/api/metadata/pages', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ pages: tenantData(getPrincipal(res).tenantId)?.pages ?? [] });
});
app.put('/api/metadata/pages/:apiName', requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
  const previousApiName = routeParam(req, 'apiName');
  const requestedApiName = typeof req.body?.apiName === 'string' ? req.body.apiName : previousApiName;
  const parsed = pageSchema.safeParse({ ...req.body, apiName: requestedApiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Lightning page metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const existingPage = tenant.pages.find((page) => page.apiName === previousApiName);
  if (tenant.pages.some((page) => page.apiName.toLocaleLowerCase() === parsed.data.apiName.toLocaleLowerCase()
    && page.apiName !== previousApiName)) {
    return res.status(409).json({ error: `A Lightning page named "${parsed.data.apiName}" already exists` });
  }
  const invalidLibraryComponent = parsed.data.components.find((component) => component.type.startsWith('Custom:') && !state.libraryComponents.some((libraryComponent) =>
    libraryComponent.apiName === component.type.slice('Custom:'.length) && libraryComponent.surfaces.includes('page')));
  if (invalidLibraryComponent) return res.status(422).json({ error: `Custom page component "${invalidLibraryComponent.type.slice('Custom:'.length)}" is not available in the component library` });
  const invalidApp = parsed.data.activationAssignments?.find((assignment) => assignment.appId
    && !tenant.apps.some((app) => app.apiName === assignment.appId));
  if (invalidApp) return res.status(400).json({ error: `Activation assignment references unknown app "${invalidApp.appId}"` });
  const invalidProfile = parsed.data.activationAssignments?.find((assignment) => assignment.profileId
    && !tenant.accessControl.profiles.some((profile) => profile.id === assignment.profileId));
  if (invalidProfile) return res.status(400).json({ error: `Activation assignment references unknown profile "${invalidProfile.profileId}"` });
  if (parsed.data.pageType === 'Home Page') {
    const invalidScope = parsed.data.activationAssignments?.find((assignment) =>
      !['App Default', 'App and Profile'].includes(assignment.scope));
    if (invalidScope) return res.status(400).json({ error: 'Home Pages must use App Default or App and Profile assignments' });
    if (parsed.data.status === 'Active' && !parsed.data.activationAssignments?.length) {
      return res.status(422).json({ error: 'An active Home Page requires at least one app assignment' });
    }
    if (parsed.data.status === 'Active') {
      const unsupportedFormFactor = parsed.data.activationAssignments?.find((assignment) =>
        assignment.formFactors.some((formFactor) => !parsed.data.devices.includes(formFactor)));
      if (unsupportedFormFactor) return res.status(400).json({ error: 'Activation form factors must be supported by the page' });
      const conflictingAssignment = tenant.pages
        .filter((page) => page.apiName !== previousApiName && page.status === 'Active' && page.pageType === 'Home Page')
        .flatMap((page) => page.activationAssignments ?? [])
        .find((existing) => parsed.data.activationAssignments?.some((assignment) =>
          assignment.scope === existing.scope
          && assignment.appId === existing.appId
          && assignment.profileId === existing.profileId
          && assignment.formFactors.some((formFactor) => existing.formFactors.includes(formFactor))));
      if (conflictingAssignment) {
        return res.status(409).json({ error: `An active Home Page already has a matching ${conflictingAssignment.scope} assignment` });
      }
    }
  }
  if (parsed.data.pageType === 'Record Page') {
    const targetObject = tenant.objects.find((object) => object.apiName === parsed.data.targetObject);
    if (!targetObject) return res.status(400).json({ error: `Target object "${parsed.data.targetObject}" does not exist` });
    const invalidDynamicField = parsed.data.components.find((component) => {
      if (component.type === 'Record Field') {
        return typeof component.properties.fieldApiName !== 'string'
          || !targetObject.fields.some((field) => field.apiName === component.properties.fieldApiName);
      }
      if (component.type === 'Field Section') {
        const fieldApiNames = component.properties.fieldApiNames;
        return !Array.isArray(fieldApiNames)
          || fieldApiNames.some((fieldApiName) => typeof fieldApiName !== 'string'
            || !targetObject.fields.some((field) => field.apiName === fieldApiName))
          || new Set(fieldApiNames).size !== fieldApiNames.length;
      }
      return false;
    });
    if (invalidDynamicField) return res.status(400).json({ error: `Dynamic Forms component "${invalidDynamicField.label}" references an invalid or duplicate field` });
    const unsupportedFormFactor = parsed.data.activationAssignments?.find((assignment) =>
      assignment.formFactors.some((formFactor) => !parsed.data.devices.includes(formFactor)));
    if (unsupportedFormFactor) return res.status(400).json({ error: 'Activation form factors must be supported by the page' });
    const unsupportedComponent = parsed.data.components.find((component) =>
      (component.type === 'Activities' && !targetObject.settings?.allowActivities)
      || (component.type === 'Chatter' && !targetObject.settings?.allowInChatter)
      || (component.type === 'Report Chart' && !targetObject.settings?.allowReports));
    if (unsupportedComponent) return res.status(422).json({ error: `The "${unsupportedComponent.type}" component requires its corresponding object feature to be enabled` });
    if (parsed.data.status === 'Active' && !parsed.data.activationAssignments?.length) {
      return res.status(422).json({ error: 'An active record page requires at least one activation assignment' });
    }
    const invalidRecordType = parsed.data.activationAssignments?.find((assignment) => assignment.recordTypeId && !targetObject.recordTypes?.some((recordType) => recordType.id === assignment.recordTypeId));
    if (invalidRecordType) return res.status(400).json({ error: `Record type "${invalidRecordType.recordTypeId}" does not exist on "${targetObject.label}"` });
    if (parsed.data.status === 'Active') {
      const conflictingAssignment = tenant.pages
        .filter((page) => page.apiName !== previousApiName && page.status === 'Active'
          && page.pageType === 'Record Page' && page.targetObject === parsed.data.targetObject)
        .flatMap((page) => page.activationAssignments ?? [])
        .find((existing) => parsed.data.activationAssignments?.some((assignment) =>
          assignment.scope === existing.scope
          && assignment.appId === existing.appId
          && assignment.profileId === existing.profileId
          && assignment.recordTypeId === existing.recordTypeId
          && assignment.formFactors.some((formFactor) => existing.formFactors.includes(formFactor))));
      if (conflictingAssignment) {
        return res.status(409).json({ error: `An active page already has a matching ${conflictingAssignment.scope} assignment for "${parsed.data.targetObject}"` });
      }
    }
  }
  if (existingPage?.pageType === 'App Page'
    && (parsed.data.pageType !== 'App Page' || parsed.data.status !== 'Active')
    && tenant.apps.some((app) => app.navigationPageApiNames.includes(previousApiName))) {
    return res.status(409).json({ error: 'Remove this page from app navigation before deactivating or changing its type' });
  }
  const apps = parsed.data.apiName === previousApiName ? tenant.apps : tenant.apps.map((app) => ({
    ...app,
    navigationPageApiNames: app.navigationPageApiNames.map((apiName) => apiName === previousApiName ? parsed.data.apiName : apiName),
    navigationOrder: app.navigationOrder.map((item) =>
      item.type === 'App Page' && item.apiName === previousApiName
        ? { ...item, apiName: parsed.data.apiName }
        : item)
  }));
  const updatedTenant = {
    ...tenant,
    apps,
    pages: [...tenant.pages.filter((page) => page.apiName !== previousApiName), {
      ...parsed.data,
      updatedAt: new Date().toISOString()
    }]
  };
  const nextState = { ...state, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({ page: updatedTenant.pages[updatedTenant.pages.length - 1] });
});
app.get('/api/metadata/currencies', requirePermission('security:read'), (_req: Request, res: Response) => {
  res.json(tenantData(getPrincipal(res).tenantId)!.currencySettings);
});
app.put('/api/metadata/currencies', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const parsed = currencySettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid currency settings', details: parsed.error.flatten() });
  const activeCurrencyCodes = new Set(parsed.data.currencies.map((currency) => currency.currencyIsoCode));
  const userWithUnavailableCurrency = tenant.accessControl.users.find((user) =>
    user.currencyIsoCode && !activeCurrencyCodes.has(user.currencyIsoCode));
  if (userWithUnavailableCurrency) {
    return res.status(409).json({
      error: `Currency "${userWithUnavailableCurrency.currencyIsoCode}" is assigned to user "${userWithUnavailableCurrency.username}" and cannot be deactivated`
    });
  }
  const recordWithUnavailableCurrency = Object.entries(tenant.records).find(([objectApiName, records]) =>
    tenant.objects.some((object) => object.apiName === objectApiName
      && object.fields.some((field) => /^Currency(?:\(|$)/.test(field.dataType)))
    && records.some((record) => typeof record.CurrencyIsoCode === 'string'
      && !activeCurrencyCodes.has(record.CurrencyIsoCode)));
  if (recordWithUnavailableCurrency) {
    const record = recordWithUnavailableCurrency[1].find((item) =>
      typeof item.CurrencyIsoCode === 'string' && !activeCurrencyCodes.has(item.CurrencyIsoCode));
    return res.status(409).json({
      error: `Currency "${String(record?.CurrencyIsoCode)}" is assigned to ${recordWithUnavailableCurrency[0]} record "${String(record?.Id)}" and cannot be deactivated`
    });
  }
  const updatedTenant = { ...tenant, currencySettings: parsed.data };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.json(parsed.data);
});
app.get('/api/metadata/permissions', requirePermission('security:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId);
  res.json(tenant
    ? { ...tenant.accessControl, sharingSettings: tenant.sharingSettings }
    : { profiles: [], permissionSets: [], permissionSetGroups: [], roles: [], publicGroups: [], sharingRules: [], users: [], sharingSettings: {} });
});
app.put('/api/metadata/permissions', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? {
      ...req.body,
      roles: req.body.roles ?? tenant.accessControl.roles,
      publicGroups: req.body.publicGroups ?? tenant.accessControl.publicGroups,
      queues: req.body.queues ?? tenant.accessControl.queues,
      sharingRules: req.body.sharingRules ?? tenant.accessControl.sharingRules
    }
    : req.body;
  const parsed = accessControlSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid access-control metadata', details: parsed.error.flatten() });
  const unavailableUserCurrency = parsed.data.users.find((user) =>
    user.currencyIsoCode && !tenant.currencySettings.currencies.some((currency) => currency.currencyIsoCode === user.currencyIsoCode));
  if (unavailableUserCurrency) {
    return res.status(400).json({
      error: `User "${unavailableUserCurrency.username}" must use an active tenant currency`
    });
  }
  if (parsed.data.users.some((user) => !user.roleId)) {
    return res.status(400).json({ error: 'Every tenant user must be assigned to a role' });
  }
  const identitiesByEmail = new Map(state.users
    .filter((user) => user.tenantId === principal.tenantId)
    .map((user) => [user.email.trim().toLowerCase(), user.id]));
  if (parsed.data.users.some((user) => identitiesByEmail.get(user.username.trim().toLowerCase()) !== user.id)) {
    return res.status(400).json({ error: 'Each access-control email must match that user’s tenant identity' });
  }
  const requestedSharingSettings = z.record(sharingSettingSchema).safeParse(req.body?.sharingSettings ?? tenant.sharingSettings);
  if (!requestedSharingSettings.success) {
    return res.status(400).json({ error: 'Invalid sharing settings', details: requestedSharingSettings.error.flatten() });
  }
  const unknownSharingObject = Object.keys(requestedSharingSettings.data)
    .find((objectName) => !tenant.objects.some((object) => object.apiName === objectName));
  if (unknownSharingObject) return res.status(400).json({ error: `Sharing settings reference unknown object "${unknownSharingObject}"` });
  const sharingSettings = Object.fromEntries(tenant.objects.map((object) => [
    object.apiName,
    requestedSharingSettings.data[object.apiName] ?? tenant.sharingSettings[object.apiName] ?? {
      defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true
    }
  ]));
  const tenantUsers = state.users.filter((user) => user.tenantId === principal.tenantId);
  const usersById = new Map(tenantUsers.map((user) => [user.id, user]));
  if (parsed.data.users.some((user) => !usersById.has(user.id))) {
    return res.status(400).json({ error: 'User membership must be provisioned through the identity service' });
  }
  if (parsed.data.users.length !== tenantUsers.length) {
    return res.status(400).json({ error: 'Access-control updates must include every tenant user' });
  }
  const removedSharedGroup = tenant.dashboards.find((dashboard) =>
    dashboard.sharedPermissionSetGroupIds.some((groupId) =>
      !parsed.data.permissionSetGroups.some((group) => group.id === groupId)));
  if (removedSharedGroup) {
    return res.status(409).json({ error: `Permission set group access is still assigned to dashboard "${removedSharedGroup.label}"` });
  }
  const danglingFolderShare = tenant.dashboardFolders.flatMap((folder) =>
    folder.shares.map((share) => ({ folder, share }))).find(({ share }) =>
    share.targetType === 'User'
      ? !parsed.data.users.some((user) => user.id === share.targetId)
      : share.targetType === 'PublicGroup'
        ? !parsed.data.publicGroups.some((group) => group.id === share.targetId)
        : share.targetType === 'PermissionSetGroup'
          ? !parsed.data.permissionSetGroups.some((group) => group.id === share.targetId)
          : share.targetType === 'Territory'
            ? !(tenant.dashboardTerritories ?? []).some((territory) => territory.id === share.targetId)
            : !parsed.data.roles.some((role) => role.id === share.targetId));
  if (danglingFolderShare) {
    return res.status(409).json({
      error: `Folder "${danglingFolderShare.folder.label}" still grants access to the removed ${danglingFolderShare.share.targetType} "${danglingFolderShare.share.targetId}"`
    });
  }
  const removedPublicGroup = tenant.accessControl.publicGroups.find((group) =>
    tenant.recordShares.some((share) => share.groupId === group.id && !parsed.data.publicGroups.some((item) => item.id === group.id))
    || tenant.accessControl.publicGroups.some((item) => item.groupIds.includes(group.id)
      && !parsed.data.publicGroups.some((candidate) => candidate.id === group.id)));
  if (removedPublicGroup) {
    return res.status(409).json({ error: `Public group "${removedPublicGroup.label}" is still referenced by a share or another group` });
  }
  const profilesById = new Map(parsed.data.profiles.map((profile) => [profile.id, profile]));
  const standardProfileIds = tenant.accessControl.profiles.filter((profile) => profile.isStandard).map((profile) => profile.id);
  if (standardProfileIds.some((id) => !profilesById.has(id))) {
    return res.status(409).json({ error: 'Standard profiles cannot be deleted' });
  }
  if (tenant.accessControl.profiles.some((profile) => profile.isStandard
    && profilesById.get(profile.id)?.isStandard !== true)) {
    return res.status(409).json({ error: 'A standard profile cannot be changed into a custom profile' });
  }
  const removedAssignedProfile = tenant.objects.find((object) =>
    object.pageLayoutAssignments?.some((assignment) => assignment.profileId !== '*' && !profilesById.has(assignment.profileId))
    || object.compactLayoutAssignments?.some((assignment) => assignment.profileId !== '*' && !profilesById.has(assignment.profileId)));
  if (removedAssignedProfile) {
    return res.status(409).json({ error: `Page or compact layout assignments must be removed from "${removedAssignedProfile.label}" before deleting a profile` });
  }
  const fieldExists = (key: string) => {
    const [objectName, fieldName, ...extra] = key.split('.');
    return extra.length === 0 && Boolean(tenant.objects.find((object) => object.apiName === objectName)
      ?.fields.some((field) => field.apiName === fieldName));
  };
  const invalidFieldPermission = [
    ...parsed.data.profiles.flatMap((profile) => Object.keys(profile.fieldPermissions)),
    ...parsed.data.permissionSets.flatMap((set) => Object.keys(set.fieldPermissions)),
    ...parsed.data.permissionSetGroups.flatMap((group) => Object.keys(group.mutedFieldPermissions))
  ].find((key) => !fieldExists(key));
  if (invalidFieldPermission) return res.status(400).json({ error: `Field permission references unknown field "${invalidFieldPermission}"` });
  const invalidObjectPermission = [
    ...parsed.data.profiles.flatMap((profile) => Object.keys(profile.objectPermissions)),
    ...parsed.data.permissionSets.flatMap((set) => Object.keys(set.objectPermissions)),
    ...parsed.data.permissionSetGroups.flatMap((group) => Object.keys(group.mutedObjectPermissions))
  ].find((name) => !tenant.objects.some((object) => object.apiName === name));
  if (invalidObjectPermission) return res.status(400).json({ error: `Permission references unknown object "${invalidObjectPermission}"` });
  const invalidRecordTypePermission = [
    ...parsed.data.profiles.flatMap((profile) => Object.keys(profile.recordTypePermissions)),
    ...parsed.data.permissionSets.flatMap((set) => Object.keys(set.recordTypePermissions)),
    ...parsed.data.permissionSetGroups.flatMap((group) => Object.keys(group.mutedRecordTypePermissions))
  ].find((key) => {
    const separator = key.indexOf('.');
    if (separator < 1) return true;
    const objectName = key.slice(0, separator);
    const recordTypeId = key.slice(separator + 1);
    return !tenant.objects.find((object) => object.apiName === objectName)
      ?.recordTypes?.some((recordType) => recordType.id === recordTypeId && recordType.active);
  });
  if (invalidRecordTypePermission) {
    return res.status(400).json({ error: `Permission references unknown or inactive record type "${invalidRecordTypePermission}"` });
  }
  const tenantUserIds = new Set(tenantUsers.filter((user) => !user.disabled).map((user) => user.id));
  const invalidPublicGroupUser = parsed.data.publicGroups.find((group) =>
    group.userIds.some((userId) => !tenantUserIds.has(userId)));
  if (invalidPublicGroupUser) {
    return res.status(400).json({ error: `Public group "${invalidPublicGroupUser.label}" can only contain active users in this tenant` });
  }
  const invalidQueue = parsed.data.queues.find((queue) =>
    queue.userIds.some((userId) => !tenantUserIds.has(userId))
    || queue.supportedObjectApiNames.some((objectApiName) => {
      const object = tenant.objects.find((item) => item.apiName === objectApiName);
      return !object || !object.fields.some((field) => field.apiName === 'OwnerId'
        && field.relationship?.targetObject === 'User');
    }));
  if (invalidQueue) {
    return res.status(400).json({ error: `Queue "${invalidQueue.label}" must reference active tenant users and owner-enabled objects` });
  }
  const removedAssignedQueue = tenant.accessControl.queues.find((queue) =>
    !parsed.data.queues.some((item) => item.id === queue.id)
    && Object.entries(tenant.records).some(([objectName, records]) =>
      queue.supportedObjectApiNames.includes(objectName)
      && records.some((record) => record.OwnerId === queue.id)));
  if (removedAssignedQueue) {
    return res.status(409).json({ error: `Queue "${removedAssignedQueue.label}" still owns records` });
  }
  const invalidRule = parsed.data.sharingRules.find((rule) => {
    const object = tenant.objects.find((item) => item.apiName === rule.objectApiName);
    if (!object) return true;
    if (rule.type === 'CriteriaBased') {
      for (const criterion of rule.criteria) {
        const field = object.fields.find((item) => item.apiName === criterion.fieldApiName);
        if (!field) return true;
        const numericField = /^(Number|Currency|Percent)(\(|$)/.test(field.dataType);
        const textField = /^(Text|Email|Phone|URL|Picklist)(\(|$)/.test(field.dataType);
        if (['Greater Than', 'Less Than'].includes(criterion.operator) && !numericField) return true;
        if (['Contains', 'Starts With'].includes(criterion.operator) && !textField) return true;
      }
    }
    if (rule.targetType === 'User' && !tenantUserIds.has(rule.targetId)) return true;
    return false;
  });
  if (invalidRule) {
    return res.status(400).json({ error: `Sharing rule "${invalidRule.label}" references an unknown object, field, target user, or incompatible field operator` });
  }
  for (const user of parsed.data.users) {
    const profile = user.profileId ? profilesById.get(user.profileId) : undefined;
    const effectiveProfile = profile ?? profilesById.get(profileIdForRole(user.role, parsed.data.profiles));
    if (!effectiveProfile) return res.status(400).json({ error: `User "${user.username}" must be assigned a profile` });
    const assignedSets = parsed.data.permissionSets.filter((set) => user.permissionSetIds.includes(set.id));
    const assignedGroups = parsed.data.permissionSetGroups.filter((group) => user.permissionSetGroupIds.includes(group.id));
    const incompatibleSet = assignedSets.find((set) => set.license !== effectiveProfile.license)
      ?? assignedGroups.flatMap((group) => group.permissionSetIds
        .map((setId) => parsed.data.permissionSets.find((set) => set.id === setId))
        .filter((set): set is typeof parsed.data.permissionSets[number] => Boolean(set)))
        .find((set) => set.license !== effectiveProfile.license);
    if (incompatibleSet) {
      return res.status(400).json({ error: `Permission set "${incompatibleSet.label}" is not compatible with ${effectiveProfile.license} profile "${effectiveProfile.label}"` });
    }
  }
  const normalizedAccessControl: AccessControl = {
    ...parsed.data,
    permissionSetGroups: parsed.data.permissionSetGroups.map((group) => ({
      ...group,
      calculationStatus: 'Updated',
      lastCalculatedAt: new Date().toISOString()
    })),
    users: parsed.data.users.map((user) => ({
      ...user,
      role: parsed.data.roles.find((role) => role.id === user.roleId)!.name
    }))
  };
  const userAssignments = new Map(normalizedAccessControl.users.map((user) => [user.id, user]));
  const updatedUsers = state.users.map((user) => {
    if (user.tenantId !== principal.tenantId) return user;
    const assignment = userAssignments.get(user.id);
    const assignedRole = assignment?.roleId
      ? parsed.data.roles.find((role) => role.id === assignment.roleId)
      : undefined;
    return assignment ? {
      ...user,
      ...(assignedRole ? { role: assignedRole.name } : {}),
      permissionSetIds: assignment.permissionSetIds,
      permissionSetGroupIds: assignment.permissionSetGroupIds
    } : user;
  });
  const updatedTenant = { ...tenant, accessControl: normalizedAccessControl, sharingSettings };
  const hasActiveSecurityAdministrator = updatedUsers.some((user) =>
    user.tenantId === principal.tenantId && !user.disabled
    && effectivePermissions(user, updatedTenant).includes('security:manage'));
  if (!hasActiveSecurityAdministrator) {
    return res.status(409).json({ error: 'At least one active tenant user must retain the security:manage permission' });
  }
  const nextState = { ...state, users: updatedUsers, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({ ...normalizedAccessControl, sharingSettings });
});
app.get('/api/metadata/roles', requirePermission('security:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  return res.json({ roles: tenant.accessControl.roles });
});
app.post('/api/metadata/roles', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const input = roleSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid role metadata', details: input.error.flatten() });
  const role = {
    ...input.data,
    apiName: input.data.apiName ?? roleApiNameForName(input.data.name)
  };
  const roles = [...tenant.accessControl.roles, role];
  const validation = accessControlSchema.safeParse({ ...tenant.accessControl, roles });
  if (!validation.success) return res.status(400).json({ error: 'Invalid role hierarchy', details: validation.error.flatten() });
  persistTenantRecords(principal.tenantId, {
    ...tenant, accessControl: { ...tenant.accessControl, roles }
  });
  return res.status(201).json({ role });
});
app.put('/api/metadata/roles/:roleId', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const roleId = routeParam(req, 'roleId');
  const existing = tenant.accessControl.roles.find((role) => role.id === roleId);
  if (!existing) return res.status(404).json({ error: 'Role was not found' });
  const parsed = roleSchema.safeParse({ ...req.body, id: roleId });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role metadata', details: parsed.error.flatten() });
  const nextRole = {
    ...parsed.data,
    apiName: parsed.data.apiName ?? existing.apiName ?? roleApiNameForName(parsed.data.name)
  };
  const roles = tenant.accessControl.roles.map((role) => role.id === roleId ? nextRole : role);
  const validation = accessControlSchema.safeParse({ ...tenant.accessControl, roles });
  if (!validation.success) return res.status(400).json({ error: 'Invalid role hierarchy', details: validation.error.flatten() });
  const updatedTenant = { ...tenant, accessControl: { ...tenant.accessControl, roles } };
  const updatedUsers = state.users.map((user) => user.tenantId === principal.tenantId
    && tenant.accessControl.users.some((assignment) => assignment.id === user.id && assignment.roleId === roleId)
    ? { ...user, role: nextRole.name }
    : user);
  const nextState = { ...state, users: updatedUsers, tenants: { ...state.tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  state = nextState;
  return res.json({ role: nextRole });
});
app.delete('/api/metadata/roles/:roleId', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const roleId = routeParam(req, 'roleId');
  if (!tenant.accessControl.roles.some((role) => role.id === roleId)) return res.status(404).json({ error: 'Role was not found' });
  if (tenant.accessControl.roles.length <= 1) return res.status(409).json({ error: 'At least one role must remain in the tenant' });
  if (tenant.accessControl.roles.some((role) => role.parentRoleId === roleId)) {
    return res.status(409).json({ error: 'A role with child roles cannot be deleted' });
  }
  if (tenant.accessControl.users.some((user) => user.roleId === roleId)) {
    return res.status(409).json({ error: 'A role assigned to a user cannot be deleted' });
  }
  if (tenant.accessControl.publicGroups.some((group) =>
    group.roleIds.includes(roleId) || group.roleAndSubordinateIds.includes(roleId))
    || tenant.accessControl.sharingRules.some((rule) =>
      rule.ownerRoleIds.includes(roleId)
      || (['Role', 'RoleAndSubordinates'].includes(rule.targetType) && rule.targetId === roleId))
    || tenant.dashboardFolders.some((folder) => folder.shares.some((share) =>
      ['Role', 'RoleAndSubordinates'].includes(share.targetType) && share.targetId === roleId))) {
    return res.status(409).json({ error: 'A role referenced by a public group or sharing rule cannot be deleted' });
  }
  const roles = tenant.accessControl.roles.filter((role) => role.id !== roleId);
  const updatedTenant = { ...tenant, accessControl: { ...tenant.accessControl, roles } };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.status(204).end();
});
app.get('/api/metadata/flow-elements', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  res.json({ elements: [
    { type: 'Screen', group: 'Interaction', allowedFlowTypes: ['Screen Flow'] },
    { type: 'Decision', group: 'Logic' }, { type: 'Assignment', group: 'Logic' },
    { type: 'Loop', group: 'Logic' }, { type: 'Wait', group: 'Logic' }, { type: 'Get Records', group: 'Data' },
    { type: 'Create Records', group: 'Data' }, { type: 'Update Records', group: 'Data' },
    { type: 'Delete Records', group: 'Data' }, { type: 'Action', group: 'Interaction' },
    { type: 'HTTP Callout', group: 'Interaction' }, { type: 'Subflow', group: 'Interaction' }
  ] });
});

type FlowRuntimeContext = {
  record?: RuntimeRecord;
  prior?: RuntimeRecord;
  recordEvent?: RecordEvent;
  triggerObjectName?: string;
  flow?: { FaultMessage: string; FaultCode: string };
  resourceDefinitions?: FlowMetadata['resources'];
  formulaStack: Set<string>;
  variables: Record<string, unknown>;
  currentUserId: string;
  currentUser?: Record<string, unknown>;
  flowVariables?: Record<string, unknown>;
  isClone?: boolean;
  debug?: boolean;
  debugTrace?: FlowDebugTraceEntry[];
  rollbackSnapshot?: TenantData;
  timeZone?: string;
  locale?: string;
  corporateCurrency?: string;
  currencyRates?: Record<string, number>;
  userCurrencyIsoCode?: string;
  currencyIsoCode?: string;
};
type FlowDebugTraceEntry = { flowApiName: string; elementId: number; type: string; label: string };
type RecordEvent = 'created' | 'updated' | 'deleted';
const namedCredentialPayloadSchema = z.object({
  username: z.string().optional(),
  secret: z.string().optional()
});

function asConfigRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function isValidFlowDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.test(value)) return false;
  const date = value.slice(0, 10);
  const midnight = new Date(`${date}T00:00:00.000Z`);
  const [year, month, day] = date.split('-').map(Number);
  return Number.isFinite(Date.parse(value))
    && Number.isFinite(midnight.getTime())
    && midnight.toISOString().slice(0, 10) === date
    && midnight.getUTCFullYear() === year
    && midnight.getUTCMonth() === month - 1
    && midnight.getUTCDate() === day;
}

function isValidFlowTime(value: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match !== null;
}

function flowVariablesForUser(
  tenant: TenantData,
  userId: string,
  interviewGuid: string = randomUUID(),
  interviewStartTime?: string
): Record<string, unknown> {
  const now = new Date();
  return {
    CurrentDate: formulaLocalDate(now, formulaContextForUser(tenant, userId).timeZone),
    CurrentDateTime: now.toISOString(),
    TriggeringUserId: userId,
    InterviewGuid: interviewGuid,
    InterviewStartTime: interviewStartTime ?? now.toISOString()
  };
}

function flowInterviewIdentity(context: FlowRuntimeContext): { interviewGuid: string; interviewStartTime: string } {
  const interviewGuid = context.flowVariables?.InterviewGuid;
  const interviewStartTime = context.flowVariables?.InterviewStartTime;
  if (typeof interviewGuid !== 'string' || typeof interviewStartTime !== 'string') {
    throw new Error('Flow interview identity is unavailable.');
  }
  return { interviewGuid, interviewStartTime };
}

function resolveFlowResource(name: string, context: FlowRuntimeContext): unknown {
  const resource = context.resourceDefinitions?.find((item) => item.name === name);
  if (!resource) return context.variables[name];
  if (resource.type === 'Text Template') {
    return String(resource.value ?? '').replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
      const resolved = resolveFlowValue(`{${reference}}`, context);
      return resolved === undefined || resolved === null ? '' : String(resolved);
    });
  }
  if (resource.type !== 'Formula') return context.variables[name];
  if (context.formulaStack.has(name)) throw new Error(`Flow formula dependency cycle detected at "${name}".`);
  if (typeof resource.value !== 'string' || !resource.value.trim()) throw new Error(`Flow formula "${resource.label}" has no expression.`);
  context.formulaStack.add(name);
  try {
    const resolveReference = (reference: string) => {
      if (context.record && Object.hasOwn(context.record, reference)) return context.record[reference];
      if (context.prior && Object.hasOwn(context.prior, reference)) return context.prior[reference];
      return resolveFlowValue(`{${reference}}`, context);
    };
    const value = evaluateFormula(resource.value, resolveReference, {
      ...(context.recordEvent ? { isNew: context.recordEvent === 'created' } : {}),
        isClone: context.isClone,
      hasPrior: context.prior !== undefined,
      timeZone: context.timeZone,
      locale: context.locale,
      currentUser: context.currentUser,
      flowVariables: { ...context.flowVariables, ...context.flow },
      corporateCurrency: context.corporateCurrency,
      currencyRates: context.currencyRates,
      userCurrencyIsoCode: context.userCurrencyIsoCode,
      currencyIsoCode: typeof context.record?.CurrencyIsoCode === 'string'
        ? context.record.CurrencyIsoCode
        : context.corporateCurrency,
      resolvePriorField: (reference) => {
        if (context.prior && Object.hasOwn(context.prior, reference)) return context.prior[reference];
        return resolveFlowValue(`{${reference}}`, context);
      }
    });
    switch (resource.dataType) {
      case 'Number':
      case 'Currency':
      case 'Percent': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Flow formula "${resource.label}" did not produce a finite number.`);
        return numeric;
      }
      case 'Boolean':
      case 'Checkbox':
        if (typeof value !== 'boolean') throw new Error(`Flow formula "${resource.label}" must produce a Boolean value.`);
        return value;
      case 'Date': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Flow formula "${resource.label}" did not produce a valid date.`);
        return date.toISOString().slice(0, 10);
      }
      case 'Date/Time': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Flow formula "${resource.label}" did not produce a valid date and time.`);
        return date.toISOString();
      }
      case 'Time':
        if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(value)) {
          throw new Error(`Flow formula "${resource.label}" did not produce a valid time.`);
        }
        return value;
      case 'Text':
        if (value !== null && typeof value !== 'string') {
          throw new Error(`Flow formula "${resource.label}" must produce text.`);
        }
        return value ?? '';
      default:
        return value;
    }
  } finally {
    context.formulaStack.delete(name);
  }
}

function resolveFlowValue(value: unknown, context: FlowRuntimeContext): unknown {
  if (typeof value !== 'string') return value;
  const reference = /^\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}?$/.exec(value.trim());
  const path = reference?.[1];
  if (!path) return value;
  const [root, ...segments] = path.split('.');
  let result: unknown = root === '$Record' ? context.record
    : root === '$Prior' || root === '$Record__Prior' ? context.prior
      : root === '$User' ? context.currentUser ?? { Id: context.currentUserId }
        : root === '$Flow' ? { ...context.flowVariables, ...context.flow }
          : resolveFlowResource(root, context);
  for (const segment of segments) {
    if (!result || typeof result !== 'object') return undefined;
    result = (result as Record<string, unknown>)[segment];
  }
  return result;
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    return !(first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19 || second === 51))
      || (first === 203 && second === 0)
      || (first === 255 && second === 255));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return (firstHextet & 0xe000) === 0x2000
      && !normalized.startsWith('2001:db8:')
      && !normalized.startsWith('2001:0000:')
      && !normalized.startsWith('2001:0:');
  }
  return false;
}

function isReservedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ['localhost', 'local', 'internal', 'test', 'invalid', 'example'].includes(host)
    || ['.localhost', '.local', '.internal', '.test', '.invalid', '.example', '.example.com', '.example.net', '.example.org'].some((suffix) => host.endsWith(suffix));
}

function resolveCalloutUrl(credential: Pick<StoredNamedCredential, 'baseUrl'>, path: string, context: FlowRuntimeContext): URL {
  if (!path || path.startsWith('/') || path.startsWith('\\') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new Error('HTTP Callout path must be relative to its Named Credential base URL.');
  }
  const expandedPath = path.replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
    const value = resolveFlowValue(`{${reference}}`, context);
    if (value === undefined || value === null) throw new Error(`HTTP Callout path references an unavailable flow value "${reference}".`);
    return encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  if (expandedPath.split(/[/?#]/).some((segment) => segment === '..')) throw new Error('HTTP Callout path cannot traverse outside the Named Credential base path.');
  const base = new URL(credential.baseUrl);
  const target = new URL(expandedPath, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new Error('HTTP Callout target must remain within its Named Credential base URL.');
  }
  if (target.protocol !== 'https:' || target.username || target.password || target.hash) {
    throw new Error('HTTP Callout target must be a safe HTTPS URL.');
  }
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (isReservedHostname(host)) {
    throw new Error('HTTP Callout targets on local or reserved hostnames are not allowed.');
  }
  if (isIP(host) && !isPublicAddress(host)) throw new Error('HTTP Callout targets on private or reserved IP addresses are not allowed.');
  return target;
}

function resolveFlowTemplate(value: string, context: FlowRuntimeContext): string {
  return value.replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
    const resolved = resolveFlowValue(`{${reference}}`, context);
    if (resolved === undefined) throw new Error(`Flow template references an unavailable value "${reference}".`);
    return resolved === null ? '' : typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
  });
}

async function performHttpCallout(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): Promise<{ body: unknown; status: number }> {
  const connectionSource = typeof config.integrationConnectionResource === 'string' && config.integrationConnectionResource.trim()
    ? resolveFlowValue(config.integrationConnectionResource, context)
    : config.integrationConnectionId;
  const connectionId = typeof connectionSource === 'string' ? connectionSource.trim() : '';
  const connection = connectionId
    ? tenant.integrationConnections.find((item) => item.id === connectionId && item.status === 'ACTIVE')
    : undefined;
  const definition = connection
    ? tenant.connectorDefinitions.find((item) => item.connectorKey === connection.connectorKey && item.status === 'ACTIVE')
    : undefined;
  const credentialSource = typeof config.namedCredentialResource === 'string' && config.namedCredentialResource.trim()
    ? resolveFlowValue(config.namedCredentialResource, context)
    : config.namedCredentialId;
  const credentialId = typeof credentialSource === 'string' ? credentialSource.trim() : '';
  const namedCredential = !connectionId
    ? tenant.namedCredentials.find((item) => item.id === credentialId && item.protocol === 'HTTPS')
    : undefined;
  if (!connectionId && !namedCredential) throw new Error(`HTTP Callout "${elementLabel}" references an unavailable Named Credential or Integration Connection.`);
  if (connectionId && (!connection || !definition)) throw new Error(`HTTP Callout "${elementLabel}" references an unavailable Integration Connection or provider.`);
  const ring = credentialKeyRing();
  let credential: Pick<StoredNamedCredential, 'baseUrl' | 'authType' | 'headerName' | 'name'>;
  let secretPayload: NamedCredentialPayload;
  let defaultTimeoutMs = 15000;
  let maxAttempts = 1;
  let operationPath: string | undefined;
  let operationMethod: string | undefined;
  let apiId = elementLabel;
  if (connection && definition) {
    const encryptedCredentials = openIntegrationCredentials(tenantId, connection, ring);
    const operationName = typeof config.operation === 'string' ? config.operation : '';
    const operation = operationName ? definition.operations[operationName] : undefined;
    if (operationName && !operation) throw new Error(`HTTP Callout "${elementLabel}" selects unknown operation "${operationName}".`);
    apiId = operationName ? `${definition.connectorKey}.${operationName}` : definition.connectorKey;
    operationPath = operation?.path;
    operationMethod = operation?.method;
    defaultTimeoutMs = definition.timeoutMs;
    maxAttempts = definition.retryPolicy.maxAttempts;
    const passwordField = definition.authCredential ?? definition.credentialsSchema.find((field) => field.secret)?.name;
    const token = (passwordField ? encryptedCredentials[passwordField] : undefined)
      ?? encryptedCredentials.access_token ?? encryptedCredentials.api_key ?? encryptedCredentials.token;
    credential = {
      baseUrl: definition.baseUrl.endsWith('/') ? definition.baseUrl : `${definition.baseUrl}/`,
      authType: definition.authType === 'BEARER' ? 'Bearer'
        : definition.authType === 'BASIC' ? 'Basic'
          : definition.authType === 'API_KEY' ? 'API Key' : 'None',
      headerName: definition.authHeader,
      name: connection.name
    };
    secretPayload = {
      ...(definition.authType === 'BASIC' ? { username: encryptedCredentials.username } : {}),
      ...(token ? { secret: token } : definition.authType === 'BASIC' && encryptedCredentials.password ? { secret: encryptedCredentials.password } : {})
    };
  } else {
    credential = namedCredential!;
    apiId = namedCredential!.name;
    secretPayload = namedCredentialPayloadSchema.parse(openCredentialPayload(tenantId, namedCredential!, ring));
  }
  const pathValue = typeof config.path === 'string' && config.path.trim() ? config.path : operationPath ?? '';
  const relativePath = operationPath && pathValue === operationPath ? operationPath.replace(/^\/+/, '') : pathValue;
  const path = connection
    ? relativePath.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, key: string) =>
      Object.hasOwn(connection.configuration, key) ? encodeURIComponent(connection.configuration[key]) : match)
    : relativePath;
  const target = resolveCalloutUrl(credential, path, context);
  const method = typeof config.method === 'string' ? config.method : operationMethod ?? 'GET';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`HTTP Callout "${elementLabel}" uses an unsupported method.`);
  const queryParametersValue = config.queryParameters;
  let queryParameters: Record<string, unknown> = {};
  if (typeof queryParametersValue === 'string' && queryParametersValue.trim()) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(queryParametersValue);
    } catch {
      throw new Error(`HTTP Callout "${elementLabel}" query parameters must be valid JSON.`);
    }
    const parsedParameters = z.record(z.unknown()).safeParse(decoded);
    if (!parsedParameters.success) throw new Error(`HTTP Callout "${elementLabel}" query parameters must be a JSON object.`);
    queryParameters = parsedParameters.data;
  } else if (queryParametersValue && typeof queryParametersValue === 'object' && !Array.isArray(queryParametersValue)) {
    queryParameters = queryParametersValue as Record<string, unknown>;
  } else if (queryParametersValue !== undefined && queryParametersValue !== '') {
    throw new Error(`HTTP Callout "${elementLabel}" query parameters must be a JSON object.`);
  }
  for (const [key, value] of Object.entries(queryParameters)) {
    if (!key) throw new Error(`HTTP Callout "${elementLabel}" query parameter names cannot be empty.`);
    target.searchParams.set(key, resolveFlowTemplate(typeof value === 'string' ? value : JSON.stringify(value), context));
  }
  const timeoutOverride = config.timeoutMs === undefined || config.timeoutMs === null || config.timeoutMs === ''
    ? defaultTimeoutMs
    : Number(config.timeoutMs);
  if (!Number.isInteger(timeoutOverride) || timeoutOverride < 1000 || timeoutOverride > 120000) {
    throw new Error(`HTTP Callout "${elementLabel}" timeout must be between 1,000 and 120,000 milliseconds.`);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (typeof config.headers === 'string') {
    for (const line of config.headers.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const separator = line.indexOf(':');
      if (separator <= 0) throw new Error(`HTTP Callout "${elementLabel}" has an invalid header line.`);
      const name = line.slice(0, separator).trim();
      const value = resolveFlowTemplate(line.slice(separator + 1).trim(), context);
      if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)
        || ['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
        throw new Error(`HTTP Callout "${elementLabel}" contains a restricted request header.`);
      }
      if (/[\r\n]/.test(value)) throw new Error(`HTTP Callout "${elementLabel}" header values cannot contain line breaks.`);
      headers[name] = value;
    }
  } else if (Array.isArray(config.headers)) {
    throw new Error(`HTTP Callout "${elementLabel}" headers must be configured as header-name: value lines.`);
  }
  if (credential.authType === 'Bearer') {
    if (!secretPayload.secret) throw new Error(`Named Credential "${credential.name}" has no configured secret.`);
    headers.Authorization = `Bearer ${secretPayload.secret}`;
  } else if (credential.authType === 'Basic') {
    if (!secretPayload.username || !secretPayload.secret) throw new Error(`Named Credential "${credential.name}" has incomplete Basic authentication data.`);
    headers.Authorization = `Basic ${Buffer.from(`${secretPayload.username}:${secretPayload.secret}`).toString('base64')}`;
  } else if (credential.authType === 'API Key') {
    if (!credential.headerName || !secretPayload.secret) throw new Error(`Named Credential "${credential.name}" has incomplete API Key authentication data.`);
    headers[credential.headerName] = secretPayload.secret;
  }
  const body = config.body === undefined || config.body === null ? '' : resolveFlowTemplate(String(config.body), context);
  if (Buffer.byteLength(body, 'utf8') > 256 * 1024) throw new Error(`HTTP Callout "${elementLabel}" request body exceeded the 256 KB limit.`);
  if (body && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  if (context.debug) return { body: { debugExecution: true, requestBody: communicationPayload(body) }, status: 200 };
  let attempt = 0;
  let response: { body: unknown; status: number };
  do {
    attempt += 1;
    const attemptStartedAt = Date.now();
    response = await new Promise<{ body: unknown; status: number }>((resolve, reject) => {
    let responseSize = 0;
    let timer: ReturnType<typeof setTimeout>;
    const request = httpsRequest(target, {
      method,
      headers,
      timeout: timeoutOverride,
      maxHeaderSize: 16 * 1024,
      lookup: (hostname, options, callback) => {
        void lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
          if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
            callback(new Error('HTTP Callout DNS resolved to a private or reserved address'), '', 0);
            return;
          }
          const selected = addresses[0];
          if (options && typeof options === 'object' && 'all' in options && options.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        }).catch(() => callback(new Error('HTTP Callout host could not be resolved safely'), '', 0));
      }
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        responseSize += data.length;
        if (responseSize > 1024 * 1024) {
          request.destroy(new Error('HTTP Callout response exceeded the 1 MB limit.'));
          return;
        }
        chunks.push(data);
      });
      incoming.on('end', () => {
        clearTimeout(timer);
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown = text;
        if (text) {
          try { parsed = JSON.parse(text) as unknown; } catch { /* Non-JSON response bodies remain text. */ }
        }
        resolve({ body: parsed, status: incoming.statusCode ?? 0 });
      });
      incoming.on('error', (error) => { clearTimeout(timer); reject(error); });
    });
    timer = setTimeout(() => request.destroy(new Error(`HTTP Callout timed out after ${timeoutOverride} milliseconds.`)), timeoutOverride);
    request.on('error', (error) => { clearTimeout(timer); reject(error); });
    if (body && method !== 'GET') request.write(body);
    else if (body) {
      request.destroy(new Error('GET HTTP Callouts cannot include a request body.'));
      return;
    }
    request.end();
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const calloutError = message.includes('private or reserved') || message.includes('local or reserved') || message.includes('safely') || message.includes('timed out') || message.includes('1 MB limit') || message.includes('cannot include')
          ? new Error(`HTTP Callout "${elementLabel}" failed: ${message}`)
          : new Error(`HTTP Callout "${elementLabel}" failed to reach its HTTPS endpoint.`);
        appendCommunicationRecord(tenantId, context.currentUserId, {
          apiId,
          url: communicationSafeUrl(target.toString()),
          authType: credential.authType,
          method: supportedCommunicationMethod(method),
          direction: 'Outgoing',
          requestBody: communicationPayload(body),
          responseBody: communicationPayload({ error: calloutError.message }),
          status: 0,
          error: calloutError.message,
          durationMs: Date.now() - attemptStartedAt
        });
        throw calloutError;
      });
    appendCommunicationRecord(tenantId, context.currentUserId, {
      apiId,
      url: communicationSafeUrl(target.toString()),
      authType: credential.authType,
      method: supportedCommunicationMethod(method),
      direction: 'Outgoing',
      requestBody: communicationPayload(body),
      responseBody: communicationPayload(response.body),
      status: response.status,
      error: response.status >= 400 ? communicationError(response.body) : '',
      durationMs: Date.now() - attemptStartedAt
    });
    if (attempt < maxAttempts && ['GET', 'PUT', 'DELETE'].includes(method)
      && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (2 ** (attempt - 1)), 2000)));
    }
  } while (attempt < maxAttempts && ['GET', 'PUT', 'DELETE'].includes(method)
    && [429, 500, 502, 503, 504].includes(response.status));
  if (connection && response.status >= 400) {
    throw new Error(`HTTP Callout "${elementLabel}" received HTTP status ${response.status} from provider "${definition?.name}".`);
  }
  return response;
}

function mapHttpCalloutResponse(body: unknown, mappingValue: unknown, elementLabel: string): unknown {
  if (mappingValue === undefined || mappingValue === '') return body;
  let mapping: unknown = mappingValue;
  if (typeof mappingValue === 'string') {
    try {
      mapping = JSON.parse(mappingValue);
    } catch {
      throw new Error(`HTTP Callout "${elementLabel}" response mapping must be valid JSON.`);
    }
  }
  const parsed = z.record(z.string()).safeParse(mapping);
  if (!parsed.success) throw new Error(`HTTP Callout "${elementLabel}" response mapping must be a JSON object of output names to response paths.`);
  return Object.fromEntries(Object.entries(parsed.data).map(([outputName, responsePath]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(outputName)) throw new Error(`HTTP Callout "${elementLabel}" response mapping contains an invalid output name.`);
    const pathParts = responsePath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    const mappedValue = pathParts.reduce<unknown>((value, part) => {
      if (!value || typeof value !== 'object') return undefined;
      return Array.isArray(value) && /^\d+$/.test(part)
        ? value[Number(part)]
        : (value as Record<string, unknown>)[part];
    }, body);
    return [outputName, mappedValue ?? null];
  }));
}

function compareFlowValue(left: unknown, operator: string, right: unknown): boolean {
  const normalizedLeft = typeof left === 'string' ? left.toLowerCase() : left;
  const normalizedRight = typeof right === 'string' ? right.toLowerCase() : right;
  switch (operator) {
    case 'Equals': return normalizedLeft === normalizedRight || String(left ?? '') === String(right ?? '');
    case 'Not Equals':
    case 'Not Equal To': return !(normalizedLeft === normalizedRight || String(left ?? '') === String(right ?? ''));
    case 'Is Null': return left === null || left === undefined || left === '';
    case 'Is Not Null': return left !== null && left !== undefined && left !== '';
    case 'Greater Than': return Number(left) > Number(right);
    case 'Less Than': return Number(left) < Number(right);
    case 'Contains': return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
    case 'Starts With': return String(left ?? '').toLocaleLowerCase().startsWith(String(right ?? '').toLocaleLowerCase());
    default: throw new Error(`Unsupported flow condition operator "${operator}".`);
  }
}

function evaluateCustomConditionLogic(expression: string, checks: boolean[]): boolean {
  if (expression.length > 2000) throw new Error('Custom condition logic cannot exceed 2000 characters.');
  const tokens: Array<string | number> = [];
  let offset = 0;
  while (offset < expression.length) {
    const match = /^\s*(\d+|AND\b|OR\b|\(|\))/i.exec(expression.slice(offset));
    if (!match) {
      if (/^\s*$/.test(expression.slice(offset))) break;
      throw new Error(`Custom condition logic has invalid syntax near "${expression.slice(offset, offset + 12)}".`);
    }
    const token = match[1];
    tokens.push(/^\d+$/.test(token) ? Number(token) : token.toUpperCase());
    if (tokens.length > 512) throw new Error('Custom condition logic cannot contain more than 512 tokens.');
    offset += match[0].length;
  }
  let cursor = 0;
  let nesting = 0;
  const peek = () => tokens[cursor];
  const parsePrimary = (): boolean => {
    const token = tokens[cursor++];
    if (token === '(') {
      nesting += 1;
      if (nesting > 100) throw new Error('Custom condition logic cannot nest parentheses more than 100 levels.');
      const value = parseOr();
      if (tokens[cursor++] !== ')') throw new Error('Custom condition logic has an unmatched opening parenthesis.');
      nesting -= 1;
      return value;
    }
    if (typeof token !== 'number') throw new Error('Custom condition logic must reference numbered conditions.');
    if (!Number.isInteger(token) || token < 1 || token > checks.length) {
      throw new Error(`Custom condition logic references condition ${token}, but only ${checks.length} condition(s) exist.`);
    }
    return checks[token - 1];
  };
  const parseAnd = (): boolean => {
    let value = parsePrimary();
    while (peek() === 'AND') {
      cursor += 1;
      const right = parsePrimary();
      value = value && right;
    }
    return value;
  };
  const parseOr = (): boolean => {
    let value = parseAnd();
    while (peek() === 'OR') {
      cursor += 1;
      const right = parseAnd();
      value = value || right;
    }
    return value;
  };
  if (!tokens.length) throw new Error('Custom condition logic cannot be blank.');
  const result = parseOr();
  if (cursor !== tokens.length) {
    throw new Error(tokens[cursor] === ')' ? 'Custom condition logic has an unmatched closing parenthesis.' : 'Custom condition logic is missing an operator.');
  }
  return result;
}

function flowConditionsMatch(conditions: Array<Record<string, unknown>>, source: Record<string, unknown>, context: FlowRuntimeContext, logicOverride?: unknown): boolean {
  if (!conditions.length) return true;
  const checks = conditions.map((condition) => {
    const field = typeof condition.field === 'string' ? condition.field : '';
    if (!field) throw new Error('A flow condition is missing its field.');
    const left = /^\{!?[A-Za-z_$][A-Za-z0-9_.$]*\}$/.test(field) ? resolveFlowValue(field, context) : source[field];
    return compareFlowValue(left, String(condition.operator ?? 'Equals'), resolveFlowValue(condition.value, context));
  });
  const rawLogic = String(logicOverride ?? conditions[0].logic ?? 'All');
  const logic = rawLogic.toLowerCase();
  if (logic === 'any') return checks.some(Boolean);
  if (logic === 'all') return checks.every(Boolean);
  return evaluateCustomConditionLogic(rawLogic, checks);
}

function flowFieldValues(config: Record<string, unknown>, context: FlowRuntimeContext): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of asConfigRows(config.fieldValues)) {
    if (typeof entry.field !== 'string' || !entry.field) throw new Error('A flow field assignment is missing its field.');
    values[entry.field] = resolveFlowValue(entry.value, context);
  }
  if (!Object.keys(values).length && typeof config.field === 'string' && config.field) {
    values[config.field] = resolveFlowValue(config.value, context);
  }
  return values;
}

function parseFormulaDate(value: unknown, functionName: string): Date {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/.test(text)) {
    throw new Error(`${functionName} requires an ISO date or date/time value.`);
  }
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(text);
  if (offset && (Number(offset[2]) > 14 || (Number(offset[2]) === 14 && Number(offset[3]) !== 0))) {
    throw new Error(`${functionName} requires an ISO time-zone offset no greater than 14:00.`);
  }
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  if (year < 1) throw new Error(`${functionName} requires a year from 0001 through 9999.`);
  const civilDate = formulaUtcDate(year, month - 1, day);
  if (civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1 || civilDate.getUTCDate() !== day) {
    throw new Error(`${functionName} requires a valid date.`);
  }
  const dateTime = text.length === 10 ? `${text}T00:00:00.000Z`
    : /(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? text : `${text}Z`;
  const date = new Date(dateTime);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error(`${functionName} requires a valid date.`);
  }
  return date;
}

function formulaUtcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function formulaDateParts(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function formulaLocalDate(date: Date, timeZone: string): string {
  const parts = formulaDateParts(date, timeZone);
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

function formulaLocalTime(date: Date, timeZone: string): string {
  const parts = formulaDateParts(date, timeZone);
  return `${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
}

function formulaTimezoneOffset(date: Date, timeZone: string): number {
  const parts = formulaDateParts(date, timeZone);
  const localAsUtc = formulaUtcDate(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  localAsUtc.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
  return localAsUtc.getTime() - Math.floor(date.getTime() / 1000) * 1000;
}

function parseFormulaDateTime(value: unknown, timeZone: string, functionName: string): Date {
  const text = String(value ?? '').trim();
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text);
  if (!localMatch || /(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return parseFormulaDate(value, functionName);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fractionText = '0'] = localMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fractionText.padEnd(3, '0'));
  const civilDate = formulaUtcDate(year, month - 1, day);
  if (year < 1 || civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1
    || civilDate.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`${functionName} requires a valid local date and time.`);
  }
  const instant = flowLocalDateTimeToInstant(civilDate, hour, minute, timeZone);
  if (!instant) throw new Error(`${functionName} local time does not exist in time zone "${timeZone}" because of a daylight-saving transition.`);
  instant.setUTCSeconds(second, millisecond);
  return instant;
}

function isFormulaDateTimeText(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]/.test(String(value ?? '').trim());
}

function parseFormulaDateInContext(value: unknown, timeZone: string, functionName: string): Date {
  return isFormulaDateTimeText(value)
    ? parseFormulaDateTime(value, timeZone, functionName)
    : parseFormulaDate(value, functionName);
}

function parseFormulaNumberText(value: unknown, locale: string): number {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('VALUE requires text that can be converted to a number.');
  const formatter = new Intl.NumberFormat(locale);
  const sampleParts = formatter.formatToParts(-1234567890123.5);
  const group = sampleParts.find((part) => part.type === 'group')?.value;
  const decimal = sampleParts.find((part) => part.type === 'decimal')?.value ?? '.';
  const minus = sampleParts.find((part) => part.type === 'minusSign')?.value ?? '-';
  const groupSizes = sampleParts.filter((part) => part.type === 'integer')
    .map((part) => part.value.length).slice(1).reverse();
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  let normalized = text;
  for (let digit = 0; digit <= 9; digit += 1) {
    const localizedDigit = digitFormatter.format(digit);
    if (localizedDigit !== String(digit)) normalized = normalized.replaceAll(localizedDigit, String(digit));
  }
  if (minus !== '-') normalized = normalized.replaceAll(minus, '-');
  const exponentParts = normalized.split(/[eE]/);
  if (exponentParts.length > 2) throw new Error('VALUE requires text that can be converted to a number.');
  let mantissa = exponentParts[0];
  const exponent = exponentParts[1];
  if (exponent !== undefined && !/^[+-]?\d+$/.test(exponent)) {
    throw new Error('VALUE requires text that can be converted to a number.');
  }
  const decimalIndex = mantissa.indexOf(decimal);
  const groupIndex = group ? mantissa.indexOf(group) : -1;
  if (groupIndex >= 0 && decimalIndex >= 0 && groupIndex > decimalIndex) {
    throw new Error('VALUE requires text that can be converted to a number.');
  }
  if (group && mantissa.includes(group)) {
    const integerText = mantissa.split(decimal)[0];
    const integerSign = /^[+-]/.test(integerText) ? integerText[0] : '';
    const groups = integerText.slice(integerSign.length).split(group);
    const rightGroups = groups.slice(1).reverse();
    const validGrouping = groups[0].length >= 1
      && groups[0].length <= (groupSizes.at(-1) ?? 3)
      && rightGroups.every((part, index) => part.length === (groupSizes[index] ?? groupSizes.at(-1) ?? 3));
    if (!validGrouping) {
      const standardNumber = Number(text);
      if (Number.isFinite(standardNumber)) return standardNumber;
      throw new Error('VALUE requires text that can be converted to a number.');
    }
    mantissa = mantissa.replaceAll(group, '');
  }
  if (decimal !== '.') {
    if (mantissa.split(decimal).length > 2) throw new Error('VALUE requires text that can be converted to a number.');
    mantissa = mantissa.replace(decimal, '.');
  }
  const normalizedText = exponent === undefined ? mantissa : `${mantissa}e${exponent}`;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalizedText)) {
    const standardNumber = Number(text);
    if (Number.isFinite(standardNumber)) return standardNumber;
    throw new Error('VALUE requires text that can be converted to a number.');
  }
  const number = Number(normalizedText);
  if (!Number.isFinite(number)) throw new Error('VALUE requires text that can be converted to a finite number.');
  return number;
}

function roundFormulaNumber(value: number, precision: number, mode: 'round' | 'up' | 'down'): number {
  const negative = value < 0;
  const [mantissa, exponentPart] = Math.abs(value).toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const coefficient = BigInt(`${whole}${fraction}`);
  const shift = Number(exponentPart ?? 0) - fraction.length + precision;
  let rounded: bigint;
  if (shift >= 0) {
    rounded = coefficient * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    const increment = mode === 'up' ? remainder !== 0n
      : mode === 'round' ? remainder * 2n >= divisor
        : false;
    rounded = quotient + (increment ? 1n : 0n);
  }
  const result = Number(`${negative ? '-' : ''}${rounded}e${-precision}`);
  if (!Number.isFinite(result)) throw new Error('Formula arithmetic must produce a finite number.');
  return result;
}

function isSafeFlowRegex(pattern: string): boolean {
  const quantifiers = pattern.match(/[*+?]|\{\d+(?:,\d*)?\}/g) ?? [];
  return pattern.length <= 128
    && !/[()|]/.test(pattern)
    && !/\\[1-9]/.test(pattern)
    && !/\.\*|\.\+/.test(pattern)
    && quantifiers.length <= 2
    && !/\{\d{4,}(?:,\d*)?\}/.test(pattern);
}

function encodeFormulaHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]!);
}

function encodeFormulaUrl(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeFormulaUrl(value: unknown, functionName: string): string {
  const url = String(value ?? '').trim();
  if (!url) throw new Error(`${functionName} requires a non-blank URL.`);
  if (url.startsWith('//') || /[\u0000-\u0020\\]/.test(url)) {
    throw new Error(`${functionName} requires an HTTP(S) or relative URL.`);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url) && !/^https?:\/\//i.test(url)) {
    throw new Error(`${functionName} supports only HTTP(S) URLs.`);
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch {
      throw new Error(`${functionName} requires a valid HTTP(S) URL.`);
    }
  }
  return url;
}

function evaluateFormula(
  expression: string,
  resolveField: (name: string) => unknown,
  formulaContext: {
    isNew?: boolean;
    isClone?: boolean;
    hasPrior?: boolean;
    resolvePriorField?: (name: string) => unknown;
    timeZone?: string;
    locale?: string;
    currentUser?: Record<string, unknown>;
    flowVariables?: Record<string, unknown>;
    corporateCurrency?: string;
    currencyRates?: Record<string, number>;
    userCurrencyIsoCode?: string;
    currencyIsoCode?: string;
  } = {}
): unknown {
  const timeZone = formulaContext.timeZone ?? 'UTC';
  const locale = formulaContext.locale ?? 'en-US';
  if (expression.length > 10_000) throw new Error('Formula exceeds the 10,000-character limit.');
  const tokens: string[] = [];
  const tokenPattern = /\s*(<=|>=|<>|!=|==|&&|\|\||[()+\-*/%^&=<>!,]|(?:\d+(?:\.\d+)?|\.\d+)|(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|[A-Za-z_$][A-Za-z0-9_.$]*)/y;
  let offset = 0;
  while (offset < expression.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) {
      if (/^\s*$/.test(expression.slice(offset))) break;
      throw new Error(`Formula contains an unsupported token near "${expression.slice(offset, offset + 16)}".`);
    }
    tokens.push(match[1]);
    if (tokens.length > 2_000) throw new Error('Formula exceeds the 2,000-token limit.');
    offset = tokenPattern.lastIndex;
  }
  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = (token?: string) => {
    const current = tokens[cursor];
    if (token !== undefined && current?.toUpperCase() !== token.toUpperCase()) throw new Error(`Expected "${token}" in formula.`);
    cursor += 1;
    return current;
  };
  const truthy = (value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Logical formula conditions must evaluate to Boolean values.');
    return value;
  };
  const finiteNumber = (value: unknown, functionName: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`${functionName} requires finite numeric arguments.`);
    return numeric;
  };
  const formulaValuesEqual = (left: unknown, right: unknown) => {
    if (typeof left === 'string' && typeof right === 'string') {
      return left.toLocaleLowerCase(locale) === right.toLocaleLowerCase(locale);
    }
    return left === right
      || ((left === null || left === undefined) && (right === null || right === undefined));
  };
  const checkedFormulaText = (value: string, functionName = 'Formula') => {
    if (value.length > 100_000) throw new Error(`${functionName} result exceeds the 100,000-character limit.`);
    return value;
  };
  const skipLogicalOperand = (operators: string[]) => {
    let nesting = 0;
    while (cursor < tokens.length) {
      const current = tokens[cursor];
      const normalized = current.toUpperCase();
      if (nesting === 0 && (operators.includes(normalized) || current === ',' || current === ')')) break;
      if ((normalized === 'AND' || normalized === 'OR') && tokens[cursor + 1] === '(') {
        cursor += 1;
        continue;
      }
      if (current === '(') nesting += 1;
      else if (current === ')') nesting -= 1;
      cursor += 1;
    }
  };
  const parseOr = (): unknown => {
    let value = parseAnd();
    while (peek()?.toUpperCase() === 'OR' || peek() === '||') {
      consume();
      if (truthy(value)) {
        skipLogicalOperand(['OR', '||']);
      } else {
        value = truthy(parseAnd());
      }
    }
    return value;
  };
  const parseAnd = (): unknown => {
    let value = parseComparison();
    while (peek()?.toUpperCase() === 'AND' || peek() === '&&') {
      consume();
      if (!truthy(value)) {
        skipLogicalOperand(['OR', '||']);
        return false;
      }
      value = truthy(parseComparison());
    }
    return value;
  };
  const parseComparison = (): unknown => {
    const left = parseConcat();
    const operator = peek();
    if (!operator || !['=', '==', '!=', '<>', '>', '<', '>=', '<='].includes(operator)) return left;
    consume();
    const right = parseConcat();
    if (operator === '=' || operator === '==' || operator === '!=' || operator === '<>') {
      const equal = formulaValuesEqual(left, right);
      return operator === '=' || operator === '==' ? equal : !equal;
    }
    const isDate = (value: unknown): value is string =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
    let comparison: number;
    if (isDate(left) && isDate(right)) {
      comparison = Math.sign(parseFormulaDate(left, 'Date comparison').getTime()
        - parseFormulaDate(right, 'Date comparison').getTime());
    } else if (typeof left === 'string' && typeof right === 'string') {
      const leftText = left.toLocaleLowerCase(locale);
      const rightText = right.toLocaleLowerCase(locale);
      comparison = leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    } else if (typeof left === 'number' && Number.isFinite(left)
      && typeof right === 'number' && Number.isFinite(right)) {
      const leftNumber = left;
      const rightNumber = right;
      comparison = leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
    } else {
      throw new Error('Ordered formula comparisons require compatible numbers, text, or dates.');
    }
    if (operator === '>') return comparison > 0;
    if (operator === '<') return comparison < 0;
    if (operator === '>=') return comparison >= 0;
    return comparison <= 0;
  };
  const parseConcat = (): unknown => {
    let value = parseAdditive();
    while (peek() === '&') {
      consume('&');
      const left = String(value ?? '');
      const right = String(parseAdditive() ?? '');
      if (left.length + right.length > 100_000) throw new Error('Formula text result exceeds the 100,000-character limit.');
      value = left + right;
    }
    return value;
  };
  const parseAdditive = (): unknown => {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseMultiplicative();
      const leftDateText = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
      const rightDateText = typeof right === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(right);
      if (leftDateText && rightDateText && operator === '-') {
        value = (parseFormulaDate(value, 'Date subtraction').getTime()
          - parseFormulaDate(right, 'Date subtraction').getTime()) / 86_400_000;
      } else if (leftDateText && typeof right === 'number') {
        if (!Number.isInteger(right)) throw new Error('Date arithmetic requires a whole number of days.');
        const date = parseFormulaDate(value, 'Date arithmetic');
        date.setTime(date.getTime() + (operator === '+' ? right : -right) * 86_400_000);
        if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
          throw new Error('Date arithmetic produced a date outside the supported range.');
        }
        value = String(value).length === 10 ? date.toISOString().slice(0, 10) : date.toISOString();
      } else {
        const result = operator === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
        if (!Number.isFinite(result)) throw new Error('Formula arithmetic must produce a finite number.');
        value = result;
      }
    }
    return value;
  };
  const parseMultiplicative = (): unknown => {
    let value = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = consume();
      const right = Number(parseUnary());
      if (operator === '/' && right === 0) throw new Error('Formula cannot divide by zero.');
      if (operator === '%' && right === 0) throw new Error('Formula cannot use modulo by zero.');
      const result = operator === '*' ? Number(value) * right : operator === '/' ? Number(value) / right : Number(value) % right;
      if (!Number.isFinite(result)) throw new Error('Formula arithmetic must produce a finite number.');
      value = result;
    }
    return value;
  };
  const parseUnary = (): unknown => {
    if (peek() === '-') {
      consume('-');
      return -Number(parseUnary());
    }
    if (peek() === '!') {
      consume('!');
      return !truthy(parseUnary());
    }
    if (peek() === '+') {
      consume('+');
      return Number(parseUnary());
    }
    return parsePower();
  };
  const parsePower = (): unknown => {
    const value = parsePrimary();
    if (peek() !== '^') return value;
    consume('^');
    return Number(value) ** Number(parseUnary());
  };
  const parsePrimary = (): unknown => {
    const token = peek();
    if (token === undefined) throw new Error('Formula ended unexpectedly.');
    if (token === '(') {
      consume('(');
      const value = parseOr();
      consume(')');
      return value;
    }
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) {
      consume();
      return Number(token);
    }
    if (token.startsWith("'") || token.startsWith('"')) {
      consume();
      return token.slice(1, -1).replace(/\\(['"\\])/g, '$1');
    }
    if (/^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(token)) {
      consume();
      const name = token.toUpperCase();
      if (name === 'TRUE' && peek() !== '(') return true;
      if (name === 'FALSE' && peek() !== '(') return false;
      if (name === 'NULL') return null;
      if (token.startsWith('$User.')) {
        let value: unknown = formulaContext.currentUser;
        for (const segment of token.slice('$User.'.length).split('.')) {
          if (!value || typeof value !== 'object') return undefined;
          value = (value as Record<string, unknown>)[segment];
        }
        return value;
      }
      if (token.startsWith('$Flow.')) {
        let value: unknown = formulaContext.flowVariables;
        for (const segment of token.slice('$Flow.'.length).split('.')) {
          if (!value || typeof value !== 'object') return undefined;
          value = (value as Record<string, unknown>)[segment];
        }
        return value;
      }
      if (peek() !== '(') return resolveField(token.replace(/^\$Record\./, ''));
      consume('(');
      if (name === 'IF' || name === 'CASE' || name === 'AND' || name === 'OR' || name === 'ISNEW' || name === 'ISCLONE'
        || name === 'ISCHANGED' || name === 'PRIORVALUE') {
        const argumentRanges: string[][] = [];
        let argumentStart = cursor;
        let nesting = 0;
        let closed = false;
        for (let index = cursor; index < tokens.length; index += 1) {
          const current = tokens[index];
          if (current === '(') nesting += 1;
          else if (current === ')') {
            if (nesting === 0) {
              if (index > argumentStart) argumentRanges.push(tokens.slice(argumentStart, index));
              else if (argumentRanges.length) throw new Error(`${token} cannot contain an empty argument.`);
              cursor = index + 1;
              closed = true;
              break;
            }
            nesting -= 1;
          } else if (current === ',' && nesting === 0) {
            if (index === argumentStart) throw new Error(`${token} cannot contain an empty argument.`);
            argumentRanges.push(tokens.slice(argumentStart, index));
            argumentStart = index + 1;
          }
        }
        if (!closed) throw new Error(`Formula function "${token}" is missing a closing parenthesis.`);
        if (name === 'ISNEW') {
          if (argumentRanges.length) throw new Error('ISNEW does not accept arguments.');
          if (formulaContext.isNew === undefined) throw new Error('ISNEW requires a record-triggered Flow context.');
          return formulaContext.isNew;
        }
        if (name === 'ISCLONE') {
          if (argumentRanges.length) throw new Error('ISCLONE does not accept arguments.');
          return formulaContext.isClone ?? false;
        }
        if (name === 'ISCHANGED' || name === 'PRIORVALUE') {
          if (argumentRanges.length !== 1 || !argumentRanges[0].length) {
            throw new Error(`${token} requires exactly one expression.`);
          }
          if (!formulaContext.hasPrior) return name === 'ISCHANGED' ? false : null;
          if (!formulaContext.resolvePriorField) {
            throw new Error(`${token} requires prior record values.`);
          }
          const expressionText = argumentRanges[0].join(' ');
          const priorValue = evaluateFormula(expressionText, formulaContext.resolvePriorField, formulaContext);
          if (name === 'PRIORVALUE') return priorValue;
          const currentValue = evaluateFormula(expressionText, resolveField, formulaContext);
          if (typeof currentValue === 'string' && typeof priorValue === 'string') {
            return currentValue.toLocaleLowerCase(locale) !== priorValue.toLocaleLowerCase(locale);
          }
          return currentValue !== priorValue;
        }
        if (name === 'IF') {
          if (argumentRanges.length !== 3) throw new Error('IF requires exactly 3 arguments.');
          const condition = evaluateFormula(argumentRanges[0].join(' '), resolveField, formulaContext);
          return evaluateFormula(argumentRanges[truthy(condition) ? 1 : 2].join(' '), resolveField, formulaContext);
        }
        if (name === 'CASE') {
          if (argumentRanges.length < 4 || argumentRanges.length > 255 || argumentRanges.length % 2 !== 0) {
            throw new Error('CASE requires an expression, one or more value/result pairs, and a default result.');
          }
          const expressionValue = evaluateFormula(argumentRanges[0].join(' '), resolveField, formulaContext);
          for (let index = 1; index < argumentRanges.length - 1; index += 2) {
            const candidate = evaluateFormula(argumentRanges[index].join(' '), resolveField, formulaContext);
            const matches = formulaValuesEqual(expressionValue, candidate);
            if (matches) return evaluateFormula(argumentRanges[index + 1].join(' '), resolveField, formulaContext);
          }
          return evaluateFormula(argumentRanges[argumentRanges.length - 1].join(' '), resolveField, formulaContext);
        }
        if (argumentRanges.length < 2 || argumentRanges.length > 255) {
          throw new Error(`${token} requires between 2 and 255 arguments.`);
        }
        if (name === 'AND') {
          for (const range of argumentRanges) {
            if (!truthy(evaluateFormula(range.join(' '), resolveField, formulaContext))) return false;
          }
          return true;
        }
        for (const range of argumentRanges) {
          if (truthy(evaluateFormula(range.join(' '), resolveField, formulaContext))) return true;
        }
        return false;
      }
      const args: unknown[] = [];
      if (peek() !== ')') {
        do {
          args.push(parseOr());
          if (peek() !== ',') break;
          consume(',');
        } while (true);
      }
      consume(')');
      const requireCount = (minimum: number, maximum = minimum) => {
        if (args.length < minimum || args.length > maximum) {
          const expected = minimum === maximum ? `exactly ${minimum}` : `between ${minimum} and ${maximum}`;
          throw new Error(`${token} requires ${expected} argument${maximum === 1 ? '' : 's'}.`);
        }
      };
      switch (name) {
        case 'TRUE':
        case 'FALSE':
          requireCount(0);
          return name === 'TRUE';
        case 'CASE': {
          if (args.length < 4 || args.length > 255 || args.length % 2 !== 0) {
            throw new Error('CASE requires an expression, one or more value/result pairs, and a default result.');
          }
          for (let index = 1; index < args.length - 1; index += 2) {
            const left = args[0];
            const right = args[index];
            const matches = formulaValuesEqual(left, right);
            if (matches) return args[index + 1];
          }
          return args[args.length - 1];
        }
        case 'XOR': {
          if (args.length < 2 || args.length > 255) throw new Error(`${token} requires between 2 and 255 arguments.`);
          const matches = args.map(truthy);
          return matches.filter(Boolean).length % 2 === 1;
        }
        case 'NOT':
          requireCount(1);
          return !truthy(args[0]);
        case 'ISBLANK':
        {
          if (args.length !== 1) throw new Error(`${token} requires exactly one argument.`);
          return args[0] === null || args[0] === undefined || args[0] === '';
        }
        case 'ISNULL':
          requireCount(1);
          return args[0] === null || args[0] === undefined;
        case 'EXACT':
          requireCount(2);
          return String(args[0] ?? '') === String(args[1] ?? '');
        case 'ISNUMBER': {
          if (args.length !== 1) throw new Error('ISNUMBER requires exactly one argument.');
          if (typeof args[0] === 'number') return Number.isFinite(args[0]);
          try {
            parseFormulaNumberText(args[0], locale);
            return true;
          } catch {
            return false;
          }
        }
        case 'BLANKVALUE':
        {
          if (args.length !== 2) throw new Error(`${token} requires exactly two arguments.`);
          return args[0] === null || args[0] === undefined || args[0] === '' ? args[1] : args[0];
        }
        case 'NULLVALUE':
          requireCount(2);
          return args[0] === null || args[0] === undefined ? args[1] : args[0];
        case 'CONTAINS':
        case 'BEGINS': {
          if (args.length !== 2) throw new Error(`${token} requires exactly two arguments.`);
          const text = String(args[0] ?? '');
          const search = String(args[1] ?? '');
          return name === 'CONTAINS' ? text.includes(search) : text.startsWith(search);
        }
        case 'CONCATENATE': {
          if (args.length < 2 || args.length > 255) throw new Error('CONCATENATE requires between 2 and 255 arguments.');
          const parts = args.map((value) => value === null || value === undefined ? '' : String(value));
          if (parts.reduce((length, part) => length + part.length, 0) > 100_000) {
            throw new Error('CONCATENATE result exceeds the 100,000-character limit.');
          }
          return parts.join('');
        }
        case 'REPT': {
          requireCount(2);
          const count = Number(args[1]);
          if (!Number.isInteger(count) || count < 0 || count > 100_000) throw new Error('REPT requires an integer repeat count from 0 through 100000.');
          const text = String(args[0] ?? '');
          if (text.length * count > 100_000) throw new Error('REPT result exceeds the 100,000-character limit.');
          return text.repeat(count);
        }
        case 'REVERSE':
          requireCount(1);
          return Array.from(String(args[0] ?? '')).reverse().join('');
        case 'LPAD':
        case 'RPAD': {
          requireCount(2, 3);
          const text = String(args[0] ?? '');
          const length = Number(args[1]);
          const pad = args[2] === undefined ? ' ' : String(args[2]);
          if (!Number.isInteger(length) || length < 0 || length > 100_000 || !pad) throw new Error(`${token} requires a valid target length and non-empty padding text.`);
          if (length <= text.length) return text.slice(name === 'LPAD' ? text.length - length : 0, name === 'LPAD' ? undefined : length);
          const padding = pad.repeat(Math.ceil((length - text.length) / pad.length)).slice(0, length - text.length);
          return name === 'LPAD' ? padding + text : text + padding;
        }
        case 'BR':
          requireCount(0);
          return '\n';
        case 'URLENCODE':
          requireCount(1);
          return encodeFormulaUrl(String(args[0] ?? ''));
        case 'ENCODEURL':
          requireCount(1);
          return encodeFormulaUrl(String(args[0] ?? ''));
        case 'URLDECODE': {
          requireCount(1);
          try {
            return decodeURIComponent(String(args[0] ?? ''));
          } catch {
            throw new Error('URLDECODE requires valid URL-encoded text.');
          }
        }
        case 'HTMLENCODE':
          requireCount(1);
          return encodeFormulaHtml(String(args[0] ?? ''));
        case 'JSENCODE':
          requireCount(1);
          return String(args[0] ?? '').replace(/[\\'"<>&\u0000-\u001f\u2028\u2029]/g, (character) => {
            const escapes: Record<string, string> = {
              '\\': '\\\\', "'": "\\'", '"': '\\"', '<': '\\x3C', '>': '\\x3E', '&': '\\x26',
              '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f',
              '\u2028': '\\u2028', '\u2029': '\\u2029'
            };
            return escapes[character] ?? `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`;
          });
        case 'HYPERLINK': {
          requireCount(2, 3);
          const url = safeFormulaUrl(args[0], token);
          const target = args[2] === undefined || args[2] === null || args[2] === '' ? '_blank' : String(args[2]);
          if (!['_blank', '_self', '_parent', '_top'].includes(target)) {
            throw new Error('HYPERLINK target must be _blank, _self, _parent, or _top.');
          }
          return checkedFormulaText(
            `<a href="${encodeFormulaHtml(url)}" target="${target}"${target === '_blank' ? ' rel="noopener noreferrer"' : ''}>${encodeFormulaHtml(String(args[1] ?? ''))}</a>`,
            token
          );
        }
        case 'IMAGE': {
          requireCount(2, 4);
          const url = safeFormulaUrl(args[0], token);
          const dimensions = args.slice(2).map((value) => {
            const size = Number(value);
            if (!Number.isInteger(size) || size < 1 || size > 10_000) {
              throw new Error('IMAGE dimensions must be integers from 1 through 10000.');
            }
            return size;
          });
          const height = dimensions[0];
          const width = dimensions[1];
          return checkedFormulaText(
            `<img src="${encodeFormulaHtml(url)}" alt="${encodeFormulaHtml(String(args[1] ?? ''))}"${height === undefined ? '' : ` height="${height}"`}${width === undefined ? '' : ` width="${width}"`}>`,
            token
          );
        }
        case 'ISPICKVAL':
          requireCount(2);
          return String(args[0] ?? '').toLocaleLowerCase(locale) === String(args[1] ?? '').toLocaleLowerCase(locale);
        case 'INCLUDES': {
          requireCount(2);
          const values = Array.isArray(args[0]) ? args[0].map(String) : String(args[0] ?? '').split(';');
          return values.some((value) => value.toLocaleLowerCase(locale) === String(args[1] ?? '').toLocaleLowerCase(locale));
        }
        case 'CASESAFEID': {
          requireCount(1);
          const id = String(args[0] ?? '');
          if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)) {
            throw new Error('CASESAFEID requires a 15- or 18-character Salesforce ID.');
          }
          const baseId = id.slice(0, 15);
          const suffix = Array.from({ length: 3 }, (_, group) => {
            let bits = 0;
            for (let offset = 0; offset < 5; offset += 1) {
              const character = baseId[group * 5 + offset];
              if (character >= 'A' && character <= 'Z') bits |= 1 << offset;
            }
            return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'.charAt(bits);
          }).join('');
          if (id.length === 18 && id.slice(15) !== suffix) {
            throw new Error('CASESAFEID received an invalid 18-character Salesforce ID checksum.');
          }
          return baseId + suffix;
        }
        case 'LEN':
          requireCount(1);
          return String(args[0] ?? '').length;
        case 'ASCII':
          requireCount(1);
          return String(args[0] ?? '').codePointAt(0) ?? 0;
        case 'LOWER':
        case 'UPPER':
        case 'TRIM':
          requireCount(1);
          return name === 'LOWER' ? String(args[0] ?? '').toLocaleLowerCase(locale)
            : name === 'UPPER' ? String(args[0] ?? '').toLocaleUpperCase(locale)
              : String(args[0] ?? '').trim();
        case 'PROPER':
          requireCount(1);
          return String(args[0] ?? '').toLocaleLowerCase(locale)
            .replace(/(^|[\s\p{P}])(\p{L})/gu, (_match, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase(locale)}`);
        case 'LEFT':
        case 'RIGHT': {
          requireCount(2);
          const text = String(args[0] ?? '');
          const count = Number(args[1]);
          if (!Number.isInteger(count) || count < 0) throw new Error(`${token} requires a non-negative integer character count.`);
          return name === 'LEFT' ? text.slice(0, count) : count === 0 ? '' : text.slice(-count);
        }
        case 'MID': {
          requireCount(3);
          const text = String(args[0] ?? '');
          const start = Number(args[1]);
          const count = Number(args[2]);
          if (!Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 0) {
            throw new Error('MID requires a positive 1-based start position and a non-negative integer character count.');
          }
          return text.slice(start - 1, start - 1 + count);
        }
        case 'FIND': {
          requireCount(2, 3);
          const start = args[2] === undefined ? 1 : Number(args[2]);
          if (!Number.isInteger(start) || start < 1) throw new Error('FIND start position must be a positive integer.');
          const found = String(args[1] ?? '').indexOf(String(args[0] ?? ''), start - 1);
          return found < 0 ? 0 : found + 1;
        }
        case 'SUBSTITUTE': {
          requireCount(3, 4);
          const text = String(args[0] ?? '');
          const search = String(args[1] ?? '');
          if (!search) throw new Error('SUBSTITUTE search text cannot be blank.');
          const replacement = String(args[2] ?? '');
          const instance = args[3] === undefined ? undefined : Number(args[3]);
          if (instance !== undefined && (!Number.isInteger(instance) || instance < 1)) {
            throw new Error('SUBSTITUTE instance number must be a positive integer.');
          }
          const matches = text.split(search);
          const occurrences = matches.length - 1;
          if (instance !== undefined) {
            let found = -1;
            let searchFrom = 0;
            for (let occurrence = 0; occurrence < instance; occurrence += 1) {
              found = text.indexOf(search, searchFrom);
              if (found < 0) return text;
              searchFrom = found + search.length;
            }
            const resultLength = text.length + replacement.length - search.length;
            if (resultLength > 100_000) throw new Error('SUBSTITUTE result exceeds the 100,000-character limit.');
            return checkedFormulaText(`${text.slice(0, found)}${replacement}${text.slice(found + search.length)}`, token);
          }
          const resultLength = text.length + occurrences * (replacement.length - search.length);
          if (resultLength > 100_000) throw new Error('SUBSTITUTE result exceeds the 100,000-character limit.');
          return checkedFormulaText(matches.join(replacement), token);
        }
        case 'VALUE': {
          requireCount(1);
          return parseFormulaNumberText(args[0], locale);
        }
        case 'DATEVALUE': {
          requireCount(1);
          const date = parseFormulaDateInContext(args[0], timeZone, 'DATEVALUE');
          return isFormulaDateTimeText(args[0])
            ? formulaLocalDate(date, timeZone)
            : date.toISOString().slice(0, 10);
        }
        case 'DATETIMEVALUE': {
          requireCount(1);
          return parseFormulaDateTime(args[0], timeZone, 'DATETIMEVALUE').toISOString();
        }
        case 'TIMEVALUE': {
          requireCount(1);
          const text = String(args[0] ?? '').trim();
          if (isFormulaDateTimeText(text)) return formulaLocalTime(parseFormulaDateInContext(text, timeZone, 'TIMEVALUE'), timeZone);
          const timeMatch = /^((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(text);
          if (!timeMatch) {
            throw new Error('TIMEVALUE requires a valid ISO date/time or 24-hour time.');
          }
          const seconds = timeMatch[2] ?? '00';
          const milliseconds = (timeMatch[3] ?? '').padEnd(3, '0') || '000';
          return `${timeMatch[1]}:${seconds}.${milliseconds}`;
        }
        case 'TIME': {
          requireCount(3);
          const [hour, minute, second] = args.map(Number);
          if (![hour, minute, second].every(Number.isInteger)
            || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
            throw new Error('TIME requires valid hour, minute, and second values.');
          }
          return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000`;
        }
        case 'ADDDAYS': {
          requireCount(2);
          const date = parseFormulaDate(args[0], 'ADDDAYS');
          const days = Number(args[1]);
          if (!Number.isInteger(days)) throw new Error('ADDDAYS requires an integer day count.');
          date.setTime(date.getTime() + days * 86_400_000);
          if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
            throw new Error('ADDDAYS produced a date outside the supported range.');
          }
          return String(args[0]).length === 10 ? date.toISOString().slice(0, 10) : date.toISOString();
        }
        case 'DAYS': {
          requireCount(2);
          const end = parseFormulaDate(args[0], 'DAYS');
          const start = parseFormulaDate(args[1], 'DAYS');
          return Math.trunc((end.getTime() - start.getTime()) / 86_400_000);
        }
        case 'YEAR':
        case 'MONTH':
        case 'DAY': {
          if (args.length !== 1) throw new Error(`${token} requires exactly one argument.`);
          const date = parseFormulaDateInContext(args[0], timeZone, token);
          const parts = isFormulaDateTimeText(args[0]) ? formulaDateParts(date, timeZone) : {
            year: String(date.getUTCFullYear()),
            month: String(date.getUTCMonth() + 1),
            day: String(date.getUTCDate())
          };
          return name === 'YEAR' ? Number(parts.year)
            : name === 'MONTH' ? Number(parts.month)
              : Number(parts.day);
        }
        case 'WEEKDAY': {
          if (args.length !== 1) throw new Error('WEEKDAY requires exactly one argument.');
          const date = parseFormulaDateInContext(args[0], timeZone, 'WEEKDAY');
          const dateText = isFormulaDateTimeText(args[0]) ? formulaLocalDate(date, timeZone) : date.toISOString().slice(0, 10);
          const [year, month, day] = dateText.split('-').map(Number);
          return formulaUtcDate(year, month - 1, day).getUTCDay() + 1;
        }
        case 'WEEKNUM': {
          if (args.length < 1 || args.length > 2) throw new Error('WEEKNUM requires a date and an optional week-start type.');
          const instant = parseFormulaDateInContext(args[0], timeZone, 'WEEKNUM');
          const dateText = isFormulaDateTimeText(args[0]) ? formulaLocalDate(instant, timeZone) : instant.toISOString().slice(0, 10);
          const [dateYear, dateMonth, dateDay] = dateText.split('-').map(Number);
          const weekStart = args[1] === undefined ? 1 : Number(args[1]);
          if (weekStart !== 1 && weekStart !== 2) throw new Error('WEEKNUM week-start type must be 1 (Sunday) or 2 (Monday).');
          const yearStart = formulaUtcDate(dateYear, 0, 1);
          const dateStart = formulaUtcDate(dateYear, dateMonth - 1, dateDay);
          const dayOfYear = Math.floor((dateStart.getTime() - yearStart.getTime()) / 86_400_000) + 1;
          const startOffset = weekStart === 1 ? yearStart.getUTCDay() : (yearStart.getUTCDay() + 6) % 7;
          return Math.floor((dayOfYear + startOffset - 1) / 7) + 1;
        }
        case 'HOUR':
        case 'MINUTE':
        case 'SECOND':
        case 'MILLISECOND': {
          if (args.length !== 1) throw new Error(`${token} requires exactly one argument.`);
          const text = String(args[0] ?? '').trim();
          if (isFormulaDateTimeText(text)) {
            const instant = parseFormulaDateInContext(text, timeZone, token);
            if (name === 'MILLISECOND') return instant.getUTCMilliseconds();
            const parts = formulaDateParts(instant, timeZone);
            return name === 'HOUR' ? Number(parts.hour)
              : name === 'MINUTE' ? Number(parts.minute)
                : Number(parts.second);
          }
          if (name === 'MILLISECOND') {
            const match = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,3}))?$/.exec(text);
            if (!match) throw new Error('MILLISECOND requires a valid time or date/time value.');
            return Number((match[1] ?? '').padEnd(3, '0') || 0);
          }
          const date = parseFormulaDate(`2000-01-01T${text.length === 5 ? `${text}:00` : text}Z`, token);
          return name === 'HOUR' ? date.getUTCHours()
            : name === 'MINUTE' ? date.getUTCMinutes()
              : date.getUTCSeconds();
        }
        case 'TZOFFSET': {
          requireCount(1);
          const instant = parseFormulaDateTime(args[0], timeZone, token);
          return formulaTimezoneOffset(instant, timeZone);
        }
        case 'ADDMONTHS': {
          requireCount(2);
          const date = parseFormulaDate(args[0], 'ADDMONTHS');
          const months = Number(args[1]);
          if (!Number.isInteger(months)) throw new Error('ADDMONTHS requires an integer month count.');
          const sourceDay = date.getUTCDate();
          const sourceLastDay = formulaUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).getUTCDate();
          const targetFirst = formulaUtcDate(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
          const targetLastDay = formulaUtcDate(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0).getUTCDate();
          const day = sourceDay === sourceLastDay ? targetLastDay : Math.min(sourceDay, targetLastDay);
          targetFirst.setUTCDate(day);
          if (!Number.isFinite(targetFirst.getTime())
            || targetFirst.getUTCFullYear() < 1 || targetFirst.getUTCFullYear() > 9999) {
            throw new Error('ADDMONTHS produced a date outside the supported range.');
          }
          return targetFirst.toISOString().slice(0, 10);
        }
        case 'MOD': {
          requireCount(2);
          const dividend = finiteNumber(args[0], token);
          const divisor = finiteNumber(args[1], token);
          if (divisor === 0) {
            throw new Error('MOD requires finite numbers and a non-zero divisor.');
          }
          return dividend % divisor;
        }
        case 'ABS':
          requireCount(1);
          return Math.abs(finiteNumber(args[0], token));
        case 'SQRT': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          if (numeric < 0) throw new Error('SQRT requires a non-negative number.');
          return Math.sqrt(numeric);
        }
        case 'POWER': {
          requireCount(2);
          const result = finiteNumber(args[0], token) ** finiteNumber(args[1], token);
          if (!Number.isFinite(result)) throw new Error('POWER must produce a finite number.');
          return result;
        }
        case 'EXP':
          requireCount(1);
          {
            const result = Math.exp(finiteNumber(args[0], token));
            if (!Number.isFinite(result)) throw new Error('EXP must produce a finite number.');
            return result;
          }
        case 'LN': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          if (numeric <= 0) throw new Error('LN requires a positive number.');
          return Math.log(numeric);
        }
        case 'LOG': {
          requireCount(1, 2);
          const numeric = finiteNumber(args[0], token);
          const base = args[1] === undefined ? 10 : finiteNumber(args[1], token);
          if (numeric <= 0 || base <= 0 || base === 1) throw new Error('LOG requires a positive number and a positive base other than 1.');
          const result = Math.log(numeric) / Math.log(base);
          if (!Number.isFinite(result)) throw new Error('LOG must produce a finite number.');
          return result;
        }
        case 'PI':
          requireCount(0);
          return Math.PI;
        case 'DEGREES':
          requireCount(1);
          return finiteNumber(args[0], token) * 180 / Math.PI;
        case 'RADIANS':
          requireCount(1);
          return finiteNumber(args[0], token) * Math.PI / 180;
        case 'GEOLOCATION': {
          requireCount(2);
          const latitude = finiteNumber(args[0], token);
          const longitude = finiteNumber(args[1], token);
          if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new Error('GEOLOCATION latitude must be between -90 and 90 and longitude between -180 and 180.');
          }
          return { latitude, longitude };
        }
        case 'DISTANCE': {
          requireCount(3);
          const location = (value: unknown, argument: number) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)
              || typeof (value as Record<string, unknown>).latitude !== 'number'
              || typeof (value as Record<string, unknown>).longitude !== 'number') {
              throw new Error(`DISTANCE argument ${argument} must be a GEOLOCATION value.`);
            }
            const point = value as { latitude: number; longitude: number };
            if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
              || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
              throw new Error(`DISTANCE argument ${argument} contains invalid coordinates.`);
            }
            return point;
          };
          const first = location(args[0], 1);
          const second = location(args[1], 2);
          const unit = String(args[2]).toLowerCase();
          const radius = unit === 'mi' ? 3958.761316 : unit === 'km' ? 6371.0088 : undefined;
          if (radius === undefined) throw new Error('DISTANCE unit must be "mi" or "km".');
          const radians = (degrees: number) => degrees * Math.PI / 180;
          const latitudeDelta = radians(second.latitude - first.latitude);
          const longitudeDelta = radians(second.longitude - first.longitude);
          const haversine = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
            * Math.sin(longitudeDelta / 2) ** 2;
          const result = radius * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
          if (!Number.isFinite(result)) throw new Error('DISTANCE could not calculate a finite distance.');
          return result;
        }
        case 'CURRENCYRATE': {
          requireCount(1);
          const currencyIsoCode = String(args[0] ?? '').trim().toUpperCase();
          if (!/^[A-Z]{3}$/.test(currencyIsoCode)) {
            throw new Error('CURRENCYRATE requires a valid three-letter ISO 4217 currency code.');
          }
          const corporateCurrency = formulaContext.corporateCurrency ?? 'USD';
          if (currencyIsoCode === corporateCurrency) return 1;
          const conversionRate = formulaContext.currencyRates?.[currencyIsoCode];
          if (conversionRate === undefined || !Number.isFinite(conversionRate) || conversionRate <= 0) {
            throw new Error(`CURRENCYRATE currency "${currencyIsoCode}" is not active or has no configured exchange rate.`);
          }
          return conversionRate;
        }
        case 'CONVERTCURRENCY': {
          requireCount(1);
          if (args[0] === null || args[0] === undefined || args[0] === '') return null;
          const amount = finiteNumber(args[0], token);
          const corporateCurrency = formulaContext.corporateCurrency ?? 'USD';
          const sourceCurrency = (formulaContext.currencyIsoCode ?? corporateCurrency).toUpperCase();
          const targetCurrency = (formulaContext.userCurrencyIsoCode ?? corporateCurrency).toUpperCase();
          const rateFor = (currency: string) => {
            if (!/^[A-Z]{3}$/.test(currency)) {
              throw new Error(`CONVERTCURRENCY currency "${currency}" must be a valid three-letter ISO 4217 code.`);
            }
            const rate = currency === corporateCurrency ? 1 : formulaContext.currencyRates?.[currency];
            if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
              throw new Error(`CONVERTCURRENCY currency "${currency}" is not active or has no configured exchange rate.`);
            }
            return rate;
          };
          const converted = amount * rateFor(sourceCurrency) / rateFor(targetCurrency);
          if (!Number.isFinite(converted)) throw new Error('CONVERTCURRENCY must produce a finite number.');
          return converted;
        }
        case 'SIN':
        case 'COS':
        case 'TAN':
        case 'ASIN':
        case 'ACOS':
        case 'ATAN':
        case 'SINH':
        case 'COSH':
        case 'TANH': {
          requireCount(1);
          const numeric = Number(args[0]);
          if (!Number.isFinite(numeric)) throw new Error(`${token} requires a finite number.`);
          if ((name === 'ASIN' || name === 'ACOS') && Math.abs(numeric) > 1) {
            throw new Error(`${token} requires a value between -1 and 1.`);
          }
          const functions: Record<string, (value: number) => number> = {
            SIN: Math.sin, COS: Math.cos, TAN: Math.tan, ASIN: Math.asin, ACOS: Math.acos,
            ATAN: Math.atan, SINH: Math.sinh, COSH: Math.cosh, TANH: Math.tanh
          };
          const result = functions[name](numeric);
          if (!Number.isFinite(result)) throw new Error(`${token} did not produce a finite result.`);
          return result;
        }
        case 'ATAN2': {
          requireCount(2);
          const [x, y] = args.map((value) => finiteNumber(value, token));
          if (x === 0 && y === 0) {
            throw new Error('ATAN2 requires finite coordinates that are not both zero.');
          }
          return Math.atan2(x, y);
        }
        case 'COT': {
          requireCount(1);
          const tangent = Math.tan(finiteNumber(args[0], token));
          if (!Number.isFinite(tangent) || Math.abs(tangent) < Number.EPSILON) {
            throw new Error('COT is undefined for this value.');
          }
          return 1 / tangent;
        }
        case 'SIGN':
          requireCount(1);
          return Math.sign(finiteNumber(args[0], token));
        case 'CEILING':
          requireCount(1);
          return Math.ceil(finiteNumber(args[0], token));
        case 'MCEILING': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          return Math.sign(numeric) * Math.ceil(Math.abs(numeric));
        }
        case 'FLOOR':
          requireCount(1);
          return Math.floor(finiteNumber(args[0], token));
        case 'MFLOOR': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          return Math.sign(numeric) * Math.floor(Math.abs(numeric));
        }
        case 'MIN':
        case 'MAX': {
          if (!args.length || args.length > 255) throw new Error(`${token} requires between 1 and 255 numbers.`);
          const numbers = args.map((value) => finiteNumber(value, token));
          return name === 'MIN' ? Math.min(...numbers) : Math.max(...numbers);
        }
        case 'ROUND': {
          requireCount(1, 2);
          const precision = Number(args[1] ?? 0);
          if (!Number.isInteger(precision) || precision < -15 || precision > 15) throw new Error('ROUND precision must be an integer from -15 through 15.');
          const numeric = finiteNumber(args[0], token);
          return roundFormulaNumber(numeric, precision, 'round');
        }
        case 'ROUNDUP':
        case 'ROUNDDOWN': {
          requireCount(1, 2);
          const precision = Number(args[1] ?? 0);
          if (!Number.isInteger(precision) || precision < -15 || precision > 15) throw new Error(`${token} precision must be an integer from -15 through 15.`);
          const numeric = finiteNumber(args[0], token);
          return roundFormulaNumber(numeric, precision, name === 'ROUNDUP' ? 'up' : 'down');
        }
        case 'TRUNC': {
          requireCount(1, 2);
          const precision = Number(args[1] ?? 0);
          if (!Number.isInteger(precision) || precision < -15 || precision > 15) throw new Error('TRUNC precision must be an integer from -15 through 15.');
          const numeric = finiteNumber(args[0], token);
          return roundFormulaNumber(numeric, precision, 'down');
        }
        case 'REGEX': {
          requireCount(2);
          const text = String(args[0] ?? '');
          const pattern = String(args[1] ?? '');
          if (!isSafeFlowRegex(pattern) || text.length > 512) throw new Error('REGEX inputs use unsupported syntax or exceed the supported size.');
          try {
            return new RegExp(pattern).test(text);
          } catch {
            throw new Error('REGEX requires a valid regular expression.');
          }
        }
        case 'TEXT': {
          requireCount(1);
          if (args[0] === null || args[0] === undefined) return '';
          if (typeof args[0] === 'boolean') return args[0] ? 'TRUE' : 'FALSE';
          if (typeof args[0] === 'number') return new Intl.NumberFormat(locale, {
            useGrouping: false,
            maximumFractionDigits: 15
          }).format(args[0]);
          return String(args[0]);
        }
        case 'TODAY': {
          if (args.length !== 0) throw new Error('TODAY does not accept arguments.');
          return formulaLocalDate(new Date(), timeZone);
        }
        case 'NOW': {
          if (args.length !== 0) throw new Error('NOW does not accept arguments.');
          return new Date().toISOString();
        }
        case 'TIMENOW': {
          requireCount(0);
          return formulaLocalTime(new Date(), timeZone);
        }
        case 'DATE': {
          if (args.length !== 3) throw new Error('DATE requires exactly three arguments.');
          const [year, month, day] = args.map(Number);
          if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999
            || month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error('DATE formula contains an invalid date.');
          }
          const date = formulaUtcDate(year, month - 1, day);
          if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year
            || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            throw new Error('DATE formula contains an invalid date.');
          }
          return date.toISOString().slice(0, 10);
        }
        default: throw new Error(`Formula function "${token}" is not supported.`);
      }
    }
    throw new Error(`Unexpected token "${token}" in formula.`);
  };
  const result = parseOr();
  if (cursor !== tokens.length) throw new Error(`Unexpected token "${tokens[cursor]}" at the end of formula.`);
  if (typeof result === 'number' && !Number.isFinite(result)) {
    throw new Error('Formula arithmetic must produce a finite number.');
  }
  if (typeof result === 'string') checkedFormulaText(result);
  return result;
}

function calculateFormulaFields(
  object: ObjectMetadata,
  record: RuntimeRecord,
  formulaContext: {
    timeZone?: string;
    locale?: string;
    currentUser?: Record<string, unknown>;
    corporateCurrency?: string;
    currencyRates?: Record<string, number>;
    userCurrencyIsoCode?: string;
    isClone?: boolean;
  } = {}
): RuntimeRecord {
  const fields = new Map(object.fields.map((field) => [field.apiName, field]));
  const result = { ...record };
  const calculating = new Set<string>();
  const calculateField = (fieldName: string): unknown => {
    const field = fields.get(fieldName);
    if (!field?.formula) return result[fieldName];
    if (calculating.has(fieldName)) throw new Error(`Formula dependency cycle detected at "${fieldName}".`);
    calculating.add(fieldName);
    const value = evaluateFormula(field.formula.expression, (reference) => {
      const referencedField = fields.get(reference);
      return referencedField?.formula ? calculateField(reference) : result[reference];
    }, {
      ...formulaContext,
      currencyIsoCode: typeof result.CurrencyIsoCode === 'string'
        ? result.CurrencyIsoCode
        : formulaContext.corporateCurrency
    });
    calculating.delete(fieldName);
    switch (field.formula.returnType) {
      case 'Number':
      case 'Currency':
      case 'Percent': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Formula field "${fieldName}" did not produce a valid number.`);
        result[fieldName] = numeric;
        break;
      }
      case 'Checkbox': result[fieldName] = Boolean(value); break;
      case 'Date': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Formula field "${fieldName}" did not produce a valid date.`);
        result[fieldName] = date.toISOString().slice(0, 10);
        break;
      }
      default: result[fieldName] = String(value ?? '');
    }
    return result[fieldName];
  };
  for (const field of object.fields) if (field.formula) calculateField(field.apiName);
  return result;
}

function formulaContextForUser(tenant: TenantData, userId: string): {
  timeZone: string;
  locale: string;
  currentUser: Record<string, unknown>;
  corporateCurrency: string;
  currencyRates: Record<string, number>;
  userCurrencyIsoCode: string;
} {
  const user = tenant.accessControl.users.find((candidate) => candidate.id === userId);
  return {
    timeZone: user?.timeZone ?? 'UTC',
    locale: user?.locale ?? 'en-US',
    currentUser: user ? {
      Id: user.id,
      Name: user.name,
      Username: user.username,
      Email: user.username,
      UserRoleId: user.roleId ?? tenant.accessControl.roles.find((role) => role.name === user.role)?.id,
      ProfileId: user.profileId,
      LocaleSidKey: user.locale,
      TimeZoneSidKey: user.timeZone,
      CurrencyIsoCode: user.currencyIsoCode ?? tenant.currencySettings.corporateCurrency
    } : { Id: userId },
    corporateCurrency: tenant.currencySettings.corporateCurrency,
    userCurrencyIsoCode: user?.currencyIsoCode ?? tenant.currencySettings.corporateCurrency,
    currencyRates: Object.fromEntries(tenant.currencySettings.currencies.map((currency) => [
      currency.currencyIsoCode, currency.conversionRate
    ]))
  };
}

function normalizeRuntimeValues(object: ObjectMetadata, values: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...values };
  for (const [fieldName, value] of Object.entries(normalized)) {
    if (value === undefined || value === null) continue;
    const field = object.fields.find((candidate) => candidate.apiName === fieldName);
    if (!field) continue;
    if (/^(Number|Currency|Percent)(\(|$)/.test(field.dataType)) {
      const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
      if (!Number.isFinite(numeric)) throw new Error(`Field "${fieldName}" must contain a valid number.`);
      const numericError = numericFieldValueError(field.dataType, numeric);
      if (numericError) throw new Error(`Field "${fieldName}" ${numericError.toLocaleLowerCase()}`);
      normalized[fieldName] = numeric;
    } else if (field.dataType === 'Checkbox') {
      if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) normalized[fieldName] = value.toLowerCase() === 'true';
      else if (typeof value !== 'boolean') throw new Error(`Field "${fieldName}" must be true or false.`);
    } else if (field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist' || field.dataType === 'Long Text Area' || /^(Text|Email|Phone|URL)(\(|$)/.test(field.dataType)) {
      if (typeof value !== 'string') throw new Error(`Field "${fieldName}" must contain text.`);
      const textLimit = field.dataType.match(/^Text(?:\((\d+)\))?$/);
      const maximumTextLength = textLimit ? Number(textLimit[1] ?? 255) : undefined;
      if (maximumTextLength !== undefined && value.length > maximumTextLength) {
        throw new Error(`Field "${fieldName}" exceeds its ${maximumTextLength} character limit.`);
      }
      if (field.dataType === 'Long Text Area' && value.length > 131072) throw new Error(`Field "${fieldName}" exceeds its 131072 character limit.`);
      if (field.dataType === 'Email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`Field "${fieldName}" must contain a valid email address.`);
      if (field.dataType === 'URL' && value) {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        } catch {
          throw new Error(`Field "${fieldName}" must contain a valid HTTP or HTTPS URL.`);
        }
      }
    } else if (field.dataType === 'Date' || field.dataType === 'Date/Time') {
      if (typeof value !== 'string' || (field.dataType === 'Date'
        ? !/^\d{4}-\d{2}-\d{2}$/.test(value)
          || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
          || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
        : !isValidFlowDateTime(value))) {
        throw new Error(`Field "${fieldName}" must contain a valid ${field.dataType.toLowerCase()}.`);
      }
    } else if (field.dataType === 'DateTime') {
      if (typeof value !== 'string' || !isValidFlowDateTime(value)) throw new Error(`Field "${fieldName}" must contain a valid date/time.`);
    }
  }
  return normalized;
}

function normalizeFlowRecordAssignments(object: ObjectMetadata, record: RuntimeRecord, previous: Record<string, unknown>): Record<string, unknown> {
  const changes = Object.fromEntries(object.fields
    .filter((field) => !field.formula && record[field.apiName] !== previous[field.apiName])
    .map((field) => [field.apiName, record[field.apiName]]));
  const normalized = normalizeRuntimeValues(object, changes);
  Object.assign(record, normalized);
  return normalized;
}

function validateRelationshipReparenting(
  object: ObjectMetadata,
  previous: RuntimeRecord,
  next: RuntimeRecord
): void {
  for (const field of object.fields) {
    if (field.relationship?.type !== 'Master-Detail' || field.relationship.allowReparenting === true) continue;
    const previousParentId = previous[field.apiName];
    const nextParentId = next[field.apiName];
    if (previousParentId !== undefined && previousParentId !== nextParentId) {
      throw new Error(`Master-detail relationship "${field.label}" does not allow reparenting.`);
    }
  }
}

function validateRuntimeRecord(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, current?: RuntimeRecord): void {
  const fields = new Map(object.fields.map((field) => [field.apiName, field]));
  const recordTypeId = values.RecordTypeId ?? current?.RecordTypeId
    ?? object.recordTypes?.find((recordType) => recordType.isDefault && recordType.active)?.id;
  if (object.recordTypes?.length) {
    if (typeof recordTypeId !== 'string' || !object.recordTypes.some((recordType) => recordType.id === recordTypeId && recordType.active)) {
      throw new Error(`Record type "${String(recordTypeId ?? '')}" is not active on "${object.apiName}".`);
    }
  }
  for (const [fieldName, value] of Object.entries(values)) {
    if (fieldName === 'RecordTypeId') continue;
    const field = fields.get(fieldName);
    if (!field) throw new Error(`Field "${fieldName}" does not exist on "${object.apiName}".`);
    if (fieldName === 'CurrencyIsoCode' && value !== undefined && value !== null
      && !tenant.currencySettings.currencies.some((currency) => currency.currencyIsoCode === value)) {
      throw new Error(`Currency "${String(value)}" is not active for this tenant.`);
    }
    if (field.formula) throw new Error(`Formula field "${fieldName}" is read-only.`);
    if (field.dataType === 'Geolocation' && value !== undefined && value !== null) {
      const coordinates = typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
      const latitude = coordinates?.latitude;
      const longitude = coordinates?.longitude;
      if (!coordinates || Object.keys(coordinates).length !== 2
        || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error(`Field "${field.label}" requires numeric latitude (-90 to 90) and longitude (-180 to 180).`);
      }
    }
    if ((field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist')
      && value !== undefined && value !== null) {
      const recordType = object.recordTypes?.find((item) => item.id === recordTypeId);
      const recordTypeValues = recordType?.picklistValues?.[fieldName];
      const allowedValues = recordTypeValues ?? field.picklistValues;
      const submittedValues = field.dataType === 'Multi-Select Picklist' ? String(value).split(';').filter(Boolean) : [String(value)];
      if (field.dataType === 'Multi-Select Picklist'
        && String(value) !== ''
        && (String(value).split(';').some((item) => item.length === 0) || new Set(submittedValues).size !== submittedValues.length)) {
        throw new Error(`Field "${field.label}" contains an empty or repeated selection.`);
      }
      if (field.picklistRestricted && (recordTypeValues !== undefined || field.picklistValues !== undefined)
        && submittedValues.some((item) => !allowedValues?.includes(item))) {
        throw new Error(`Value "${String(value)}" contains an inactive picklist option for record type "${recordType?.label ?? recordTypeId ?? 'default'}" on "${field.label}".`);
      }
    }
    if (field.unique && value !== undefined && value !== null
      && uniqueFieldValueKey(field, current?.[fieldName]) !== uniqueFieldValueKey(field, value)) {
      if (tenant.records[object.apiName]?.some((record) =>
        record.Id !== current?.Id && uniqueFieldValueKey(field, record[fieldName]) === uniqueFieldValueKey(field, value))) {
        throw new Error(`Value for unique field "${fieldName}" already exists.`);
      }
    }
    if (field.relationship && value !== undefined && value !== null) {
      const queueOwner = field.apiName === 'OwnerId' && field.relationship.targetObject === 'User'
        ? tenant.accessControl.queues.some((queue) =>
          queue.id === value && queue.supportedObjectApiNames.includes(object.apiName))
        : false;
      const targetExists = queueOwner || (field.relationship.targetObject === 'User'
        ? state.users.some((user) => user.id === value && user.tenantId === tenantId && !user.disabled)
        : tenant.records[field.relationship.targetObject]?.some((record) => record.Id === value) ?? false);
      if (!targetExists) throw new Error(`Related record "${String(value)}" does not exist in "${field.relationship.targetObject}".`);
    }
  }
  for (const field of object.fields) {
    if (!field.controllerFieldApiName) continue;
    const dependentValue = values[field.apiName] ?? current?.[field.apiName];
    if (dependentValue === undefined || dependentValue === null || dependentValue === '') continue;
    const controllerValue = values[field.controllerFieldApiName] ?? current?.[field.controllerFieldApiName];
    const allowedValues = controllerValue === undefined || controllerValue === null || controllerValue === ''
      ? []
      : field.valueSettings?.[String(controllerValue)] ?? [];
    const selectedDependentValues = field.dataType === 'Multi-Select Picklist'
      ? String(dependentValue).split(';').filter(Boolean)
      : [String(dependentValue)];
    if (selectedDependentValues.some((value) => !allowedValues.includes(value))) {
      throw new Error(`Value "${String(dependentValue)}" is not allowed for "${field.label}" when "${field.controllerFieldApiName}" is "${String(controllerValue ?? '')}".`);
    }
  }
  const requiredFiltersByField = new Map<string, RelatedLookupFilterMetadata[]>();
  for (const filter of object.relatedLookupFilters ?? []) {
    if (!filter.required) continue;
    requiredFiltersByField.set(filter.fieldApiName, [...(requiredFiltersByField.get(filter.fieldApiName) ?? []), filter]);
  }
  for (const [fieldApiName, filters] of requiredFiltersByField) {
    const relatedId = values[fieldApiName] ?? current?.[fieldApiName];
    if (relatedId === undefined || relatedId === null || relatedId === '') continue;
    const relatedRecord = tenant.records[filters[0].relatedObject]?.find((record) => record.Id === relatedId);
    if (!relatedRecord) continue;
    const filterMatches = filters.map((filter) => {
      const actual = relatedRecord[filter.relatedFieldApiName];
      const expected = filter.valueFieldApiName
        ? Object.hasOwn(values, filter.valueFieldApiName)
          ? values[filter.valueFieldApiName]
          : current?.[filter.valueFieldApiName]
        : filter.value;
      return matchesRelatedLookupFilter(actual, expected, filter.operator);
    });
    const matches = object.relatedLookupFilterLogic?.[fieldApiName] === 'Any'
      ? filterMatches.some(Boolean)
      : filterMatches.every(Boolean);
    if (!matches) throw new Error(`Related record does not satisfy required lookup filters for "${fieldApiName}".`);
  }
  for (const field of object.fields) {
    const value = values[field.apiName] ?? current?.[field.apiName];
    if (field.required && !field.formula && (value === undefined || value === null || value === '')) {
      throw new Error(`Required field "${field.apiName}" is missing.`);
    }
  }
}

type FlowExecutionResult =
  | { status: 'completed'; outputs: Record<string, unknown>; variables: Record<string, unknown>; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'screen'; screen: FlowMetadata['elements'][number]; nextElementId: number | null; outcomes: Array<{ name: string; label: string }>; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; debugTrace: FlowDebugTraceEntry[] }
  | { status: 'waiting'; kind: 'wait' | 'scheduled'; waitUntil: string; nextElementId: number | null; variables: Record<string, unknown>; interviewGuid: string; interviewStartTime: string; record?: RuntimeRecord; prior?: RuntimeRecord; debugTrace: FlowDebugTraceEntry[] };

function scheduledPathTimestamp(
  field: ObjectMetadata['fields'][number] | undefined,
  value: unknown,
  timeZone: string,
  offsetAmount: number,
  offsetUnit: 'Minutes' | 'Hours' | 'Days'
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value);
  let baseTime: Date | undefined;
  if (field?.dataType === 'Date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (date.toISOString().slice(0, 10) === raw) {
        baseTime = flowLocalDateTimeToInstant(date, 0, 0, timeZone);
      }
    }
  } else if (field?.dataType === 'DateTime') {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
      const parsed = new Date(raw);
      if (Number.isFinite(parsed.getTime())) baseTime = parsed;
    } else {
      const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);
      if (match) {
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        if (date.toISOString().slice(0, 10) === raw.slice(0, 10)) {
          baseTime = flowLocalDateTimeToInstant(date, Number(match[4]), Number(match[5]), timeZone);
        }
      }
    }
  }
  if (!baseTime) throw new Error(`Scheduled path time source contains an invalid ${field?.dataType ?? 'date/time'} value.`);
  const unitMilliseconds = { Minutes: 60_000, Hours: 3_600_000, Days: 86_400_000 }[offsetUnit];
  const timestamp = baseTime.getTime() + offsetAmount * unitMilliseconds;
  if (!Number.isFinite(timestamp)) throw new Error('Scheduled path offset is outside the supported date range.');
  return new Date(Math.max(timestamp, Date.now()));
}

function createFlowInterview(flow: FlowMetadata, userId: string, result: Extract<FlowExecutionResult, { status: 'waiting' }>): FlowInterview {
  const createdAt = result.interviewStartTime;
  const expiresAt = result.kind === 'screen'
    ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    : result.kind === 'scheduled'
      ? '9999-12-31T23:59:59.999Z'
      : new Date(Date.parse(result.waitUntil) + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: result.interviewGuid,
    flowApiName: flow.apiName,
    versionNumber: flow.status === 'Active' ? flow.activeVersion ?? flow.versionNumber : flow.versionNumber,
    userId,
    allowDraft: flow.status === 'Draft',
    kind: result.kind,
    screenElementId: result.kind === 'screen' ? result.screen.id : null,
    waitUntil: result.kind === 'screen' ? null : result.waitUntil,
    nextElementId: result.nextElementId,
    variables: result.variables,
    record: result.record ?? null,
    prior: result.prior ?? null,
    createdAt,
    expiresAt,
    history: [],
    retryAt: null,
    attempts: 0
  };
}

function flowRetryDelayMs(attempt: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempt - 1, 6));
}

async function sendTenantEmail(
  tenantId: string,
  tenant: TenantData,
  credentialId: string,
  from: string,
  recipients: string[],
  subject: string,
  text: string,
  html?: string
): Promise<void> {
  const credential = tenant.namedCredentials.find((item) => item.id === credentialId && item.protocol === 'SMTP');
  if (!credential) throw new Error('The selected SMTP Named Credential is unavailable.');
  const target = new URL(credential.baseUrl);
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  const isLoopback = host === 'localhost' || host === '::1'
    || (isIP(host) === 4 && host.startsWith('127.'));
  const allowLocalTestSmtp = process.env.METADRIVE_SMTP_TEST_MODE === 'true' && isLoopback;
  if (!allowLocalTestSmtp && (isReservedHostname(host) || (isIP(host) && !isPublicAddress(host)))) {
    throw new Error(`SMTP host "${host}" is local or reserved and cannot be used.`);
  }
  const addresses = allowLocalTestSmtp
    ? [{ address: host, family: isIP(host) }]
    : isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || (!allowLocalTestSmtp && addresses.some((address) => !isPublicAddress(address.address)))) {
    throw new Error(`SMTP host "${host}" did not resolve exclusively to public IP addresses.`);
  }
  const secretPayload = namedCredentialPayloadSchema.parse(openCredentialPayload(tenantId, credential));
  const address = addresses[0];
  const port = Number(target.port || 25);
  const transporter = nodemailer.createTransport({
    host: address.address,
    port,
    secure: port === 465,
    requireTLS: !allowLocalTestSmtp && port !== 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: host, minVersion: 'TLSv1.2' },
    ...(credential.authType === 'Basic' ? {
      auth: { user: secretPayload.username ?? '', pass: secretPayload.secret ?? '' }
    } : {})
  });
  await transporter.sendMail({ from, to: recipients, subject, text, ...(html ? { html } : {}) });
}

async function performSendEmail(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): Promise<void> {
  const runningUser = state.users.find((user) => user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser || !effectivePermissions(runningUser, tenant).includes('email:send')) {
    throw new Error('The running user does not have permission to send email.');
  }
  const credentialId = typeof config.namedCredentialId === 'string' ? config.namedCredentialId : '';
  const recipientText = resolveFlowTemplate(String(config.recipients ?? ''), context);
  const recipients = recipientText.split(/[;,]/).map((recipient) => recipient.trim()).filter(Boolean);
  if (!recipients.length || recipients.some((recipient) => !z.string().email().safeParse(recipient).success)) {
    throw new Error(`Send Email "${elementLabel}" requires one or more valid recipient email addresses.`);
  }
  const from = resolveFlowTemplate(String(config.fromEmail ?? ''), context).trim();
  if (!z.string().email().safeParse(from).success) throw new Error(`Send Email "${elementLabel}" requires a valid From email address.`);
  const subject = resolveFlowTemplate(String(config.subject ?? ''), context);
  const text = resolveFlowTemplate(String(config.body ?? ''), context);
  if (!subject.trim()) throw new Error(`Send Email "${elementLabel}" requires a subject.`);
  if (!text.trim()) throw new Error(`Send Email "${elementLabel}" requires a message body.`);
  if (subject.length > 998 || text.length > 1024 * 1024) throw new Error(`Send Email "${elementLabel}" exceeded the supported message size.`);
  if (context.debug) return;
  await sendTenantEmail(tenantId, tenant, credentialId, from, recipients, subject, text);
}

async function performEmailAlert(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): Promise<void> {
  const emailAlertId = typeof config.emailAlertId === 'string' ? config.emailAlertId : '';
  const emailAlert = tenant.emailAlerts.find((candidate) => candidate.id === emailAlertId);
  if (!emailAlert) throw new Error(`Email Alert action "${elementLabel}" references an unavailable Email Alert.`);
  if (context.triggerObjectName !== emailAlert.objectApiName) {
    throw new Error(`Email Alert "${emailAlert.label}" requires a record-triggered flow for "${emailAlert.objectApiName}".`);
  }
  if (!context.record?.Id) {
    throw new Error(`Email Alert "${emailAlert.label}" requires the triggering record.`);
  }
  await performSendEmail(tenantId, tenant, {
    namedCredentialId: emailAlert.namedCredentialId,
    fromEmail: emailAlert.fromEmail,
    recipients: emailAlert.recipients,
    subject: emailAlert.subject,
    body: emailAlert.body
  }, context, emailAlert.label);
}

function performPostToChatter(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const runningUser = state.users.find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser) throw new Error('The running user is no longer active.');
  const principal = principalForUser(runningUser, tenant);
  const objectApiName = typeof config.objectApiName === 'string' ? config.objectApiName : '';
  const object = tenant.objects.find((candidate) => candidate.apiName === objectApiName);
  if (!object) throw new Error(`Post to Chatter "${elementLabel}" references an unavailable object.`);
  if (!object.settings?.allowInChatter) {
    throw new Error(`Chatter is disabled for object "${object.label}".`);
  }
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) {
    throw new Error(`The running user does not have edit permission for object "${objectApiName}".`);
  }
  const recordId = resolveFlowTemplate(String(config.recordId ?? ''), context).trim();
  const record = (tenant.records[objectApiName] ?? []).find((candidate) => candidate.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) {
    throw new Error(`Post to Chatter "${elementLabel}" requires edit access to its target record.`);
  }
  const body = resolveFlowTemplate(String(config.message ?? ''), context);
  const post = chatterPostSchema.parse({
    id: randomUUID(),
    objectApiName,
    recordId,
    body,
    createdBy: runningUser.id,
    createdByName: runningUser.name,
    createdAt: new Date().toISOString(),
    comments: []
  });
  tenant.chatterPosts.push(post);
}

function performCustomNotification(
  tenantId: string,
  tenant: TenantData,
  flow: FlowMetadata,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const runningUser = state.users.find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser || !effectivePermissions(runningUser, tenant).includes('notifications:send')) {
    throw new Error('The running user does not have permission to send custom notifications.');
  }
  const recipientText = resolveFlowTemplate(String(config.recipientIds ?? ''), context);
  const recipientIds = [...new Set(recipientText.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean))];
  if (!recipientIds.length) throw new Error(`Custom Notification "${elementLabel}" requires at least one recipient user ID.`);
  const recipients = recipientIds.map((recipientId) => state.users.find((user) =>
    user.id === recipientId && user.tenantId === tenantId && !user.disabled));
  const missingRecipientIndex = recipients.findIndex((recipient) => !recipient);
  if (missingRecipientIndex >= 0) {
    throw new Error(`Custom Notification "${elementLabel}" recipient "${recipientIds[missingRecipientIndex]}" is not an active user in this tenant.`);
  }
  const title = resolveFlowTemplate(String(config.title ?? ''), context);
  const body = resolveFlowTemplate(String(config.messageBody ?? ''), context);
  const createdAt = new Date().toISOString();
  const notifications = recipients.map((recipient) => {
    if (!recipient) throw new Error(`Custom Notification "${elementLabel}" contains an invalid recipient.`);
    return customNotificationSchema.parse({
      id: randomUUID(),
      recipientId: recipient.id,
      title,
      body,
      flowApiName: flow.apiName,
      sentBy: runningUser.id,
      createdAt,
      readAt: null
    });
  });
  tenant.notifications.push(...notifications);
}

function performSubmitForApproval(
  tenantId: string,
  tenant: TenantData,
  flow: FlowMetadata,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const submitter = state.users.find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!submitter) throw new Error('The running user is no longer active.');
  const principal = principalForUser(submitter, tenant);
  const objectApiName = typeof config.objectApiName === 'string' ? config.objectApiName.trim() : '';
  const object = tenant.objects.find((candidate) => candidate.apiName === objectApiName);
  if (!object) throw new Error(`Submit for Approval "${elementLabel}" references an unavailable object.`);
  const processApiName = typeof config.approvalProcessApiName === 'string' ? config.approvalProcessApiName : '';
  const approvalProcess = processApiName
    ? tenant.approvalProcesses.find((item) => item.apiName === processApiName && item.active)
    : undefined;
  if (processApiName && !approvalProcess) {
    throw new Error(`Submit for Approval "${elementLabel}" references an unavailable or inactive approval process.`);
  }
  if (approvalProcess && approvalProcess.objectApiName !== objectApiName) {
    throw new Error(`Approval process "${approvalProcess.label}" is for "${approvalProcess.objectApiName}", not "${objectApiName}".`);
  }
  const recordId = resolveFlowTemplate(String(config.recordId ?? ''), context).trim();
  const record = (tenant.records[objectApiName] ?? []).find((candidate) => candidate.Id === recordId);
  if (!record || !hasObjectPermission(principal, tenant, objectApiName, 'edit')
    || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) {
    throw new Error(`Submit for Approval "${elementLabel}" requires edit access to its target record.`);
  }
  const approverText = approvalProcess
    ? approvalProcess.approverUserIds.join(',')
    : resolveFlowTemplate(String(config.approverIds ?? ''), context);
  const approverIds = [...new Set(approverText.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean))];
  if (!approverIds.length) throw new Error(`Submit for Approval "${elementLabel}" requires at least one approver.`);
  const approvers = approverIds.map((approverId) => state.users.find((user) =>
    user.id === approverId && user.tenantId === tenantId && !user.disabled));
  const missingApproverIndex = approvers.findIndex((approver) => !approver);
  if (missingApproverIndex >= 0) {
    throw new Error(`Submit for Approval "${elementLabel}" approver "${approverIds[missingApproverIndex]}" is not an active user in this tenant.`);
  }
  for (const approver of approvers) {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    const approverPrincipal = principalForUser(approver, tenant);
    if (!hasObjectPermission(approverPrincipal, tenant, objectApiName, 'read')
      || !hasRecordAccess(approverPrincipal, tenant, objectApiName, record, 'Read')) {
      throw new Error(`Submit for Approval "${elementLabel}" approver "${approver.name}" cannot access the target record.`);
    }
  }
  const comments = resolveFlowTemplate(String(config.comments ?? ''), context);
  if (comments.length > 2000) throw new Error(`Submit for Approval "${elementLabel}" comments cannot exceed 2000 characters.`);
  const groupId = randomUUID();
  const createdAt = new Date().toISOString();
  const requests = approvers.map((approver) => {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    return approvalRequestSchema.parse({
      id: randomUUID(),
      groupId,
      objectApiName,
      recordId,
      flowApiName: flow.apiName,
      processApiName: typeof config.approvalProcessApiName === 'string' ? config.approvalProcessApiName : null,
      submittedBy: submitter.id,
      submittedByName: submitter.name,
      approverId: approver.id,
      status: 'Pending',
      comments,
      decisionComments: '',
      createdAt,
      decidedAt: null,
      decidedBy: null
    });
  });
  const notifications = approvers.map((approver) => {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    return customNotificationSchema.parse({
      id: randomUUID(),
      recipientId: approver.id,
      title: `Approval requested: ${object.label}`,
      body: `${submitter.name} submitted ${String(record.Name ?? recordId)} for your approval.`,
      flowApiName: flow.apiName,
      sentBy: submitter.id,
      createdAt,
      readAt: null
    });
  });
  tenant.approvalRequests.push(...requests);
  tenant.notifications.push(...notifications);
}

async function executeFlow(
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
  rollbackSnapshot: TenantData = structuredClone(tenant)
): Promise<FlowExecutionResult> {
  if (depth > 10) throw new Error('Flow subflow nesting exceeded the 10-level limit.');
  if (flow.status !== 'Active' && !allowDraftExecution) throw new Error(`Flow "${flow.label}" is not active.`);
  const runningUser = state.users.find((user) => user.id === currentUserId
    && user.tenantId === tenantId && !user.disabled);
  if (!runningUser) throw new Error('The Flow running user is not available in this tenant.');
  const runningPrincipal = principalForUser(runningUser, tenant);
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
          for (const connector of flow.connectors.filter((item) => item.from === element.id && item.kind === 'scheduled')) {
            const schedule = connector.scheduledPath;
            if (!schedule) throw new Error(`Scheduled path "${connector.id}" is missing its configuration.`);
            const field = tenant.objects.find((object) => object.apiName === flow.triggerObject)
              ?.fields.find((item) => item.apiName === schedule.timeSourceFieldApiName);
            const waitUntil = scheduledPathTimestamp(
              field, context.record[schedule.timeSourceFieldApiName], context.timeZone ?? 'UTC',
              schedule.offsetAmount, schedule.offsetUnit
            );
            if (!waitUntil) continue;
            tenant.interviews.push(createFlowInterview(flow, currentUserId, {
              status: 'waiting',
              kind: 'scheduled',
              waitUntil: waitUntil.toISOString(),
              nextElementId: connector.to,
              variables: { ...context.variables },
              ...flowInterviewIdentity(context),
              record: context.record,
              prior: context.prior,
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
          const result = config.recordLimit === 'all'
            ? sorted.map(project)
            : sorted[0] ? project(sorted[0]) : null;
          const variableName = typeof config.outputVariable === 'string' && config.outputVariable ? config.outputVariable : `element${element.id}`;
          context.variables[variableName] = result;
        } else if (element.type === 'Create Records') {
          const configuredValues = normalizeRuntimeValues(object, flowFieldValues(config, context));
          assertFieldEditPermissions(runningPrincipal, tenant, object, configuredValues);
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
          tenant.records[objectName] = [...records, created];
          await runRecordTriggeredFlows(
            tenantId, tenant, currentUserId, objectName, 'created', created, undefined,
            triggerDepth + 1, context.isClone, context.debug, context.debugTrace, context.rollbackSnapshot
          );
          context.variables[`record${element.id}`] = created;
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
            let updated = calculateFormulaFields(object, stampRecordAuditFields({ ...previous, ...values, LastModifiedDate: now }, currentUserId, now, previous), context);
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
      case 'Subflow': {
        const apiName = typeof config.flowApiName === 'string' ? config.flowApiName : '';
        const childFlow = tenant.flows.find((candidate) => candidate.apiName === apiName);
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
            record: context.record, prior: context.prior, debugTrace: context.debugTrace ?? []
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
          record: context.record, prior: context.prior, debugTrace: context.debugTrace ?? []
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
          const runningUser = state.users.find((user) =>
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
        const runningUser = state.users.find((user) =>
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

async function runRecordTriggeredFlows(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  event: RecordEvent,
  record: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  isClone = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Record-triggered flow recursion exceeded the 10-level limit.');
  for (const flow of orderedRecordTriggeredFlows(tenant, objectName, 'after-save')) {
    const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
    if (event === 'deleted') {
      tenant.interviews = tenant.interviews.filter((interview) =>
        interview.kind !== 'scheduled'
        || interview.flowApiName !== flow.apiName
        || interview.record?.Id !== (prior ?? record).Id);
    }
    if (trigger !== event && trigger !== 'created-or-updated') continue;
    const conditions = asConfigRows(flow.startConfig.entryConditions);
    const source = event === 'deleted' ? prior ?? record : record;
    const context: FlowRuntimeContext = {
      record: source, prior, recordEvent: event, isClone, resourceDefinitions: flow.resources,
      formulaStack: new Set(), variables: {}, currentUserId: userId, debug: debugExecution, debugTrace,
      ...formulaContextForUser(tenant, userId), flowVariables: flowVariablesForUser(tenant, userId)
    };
    const matchesCurrentRecord = flowConditionsMatch(conditions, source, context, flow.startConfig.conditionLogic);
    const transitionAlreadyMatched = event === 'updated'
      && flow.startConfig.updatedRecordBehavior === 'transition'
      && prior
      && flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic);
    if (!transitionAlreadyMatched && !matchesCurrentRecord) {
      tenant.interviews = tenant.interviews.filter((interview) =>
        interview.kind !== 'scheduled'
        || interview.flowApiName !== flow.apiName
        || interview.record?.Id !== source.Id);
    }
    if (!matchesCurrentRecord || transitionAlreadyMatched) continue;
    try {
      const result = await executeFlow(
        flow, tenant, tenantId, userId, {}, source, prior, 0, undefined, depth, event, isClone,
        flowInterviewIdentity(context), false, debugExecution, debugTrace, rollbackSnapshot
      );
      if (result.status === 'waiting') {
        if (result.kind !== 'wait') throw new Error(`Record-triggered flow "${flow.label}" cannot pause for screen input.`);
        tenant.interviews.push(createFlowInterview(flow, userId, result));
      }
    } catch (error) {
      if (!debugExecution) persistFlowFailure(tenantId, flow, 'Record-Triggered', error, userId);
      throw error;
    }
  }
}

async function runBeforeSaveRecordTriggeredFlows(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  event: 'created' | 'updated',
  record: RuntimeRecord,
  prior?: RuntimeRecord,
  depth = 0,
  isClone = false,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Before-save flow recursion exceeded the 10-level limit.');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) throw new Error(`Before-save flow trigger object "${objectName}" does not exist.`);
  for (const flow of orderedRecordTriggeredFlows(tenant, objectName, 'before-save')) {
    const trigger = String(flow.startConfig.trigger ?? 'created-or-updated');
    if (trigger !== event && trigger !== 'created-or-updated') continue;
    const conditions = asConfigRows(flow.startConfig.entryConditions);
    const context: FlowRuntimeContext = {
      record, prior, recordEvent: event, isClone, resourceDefinitions: flow.resources, formulaStack: new Set(),
      debug: debugExecution, debugTrace,
      variables: {}, currentUserId: userId, ...formulaContextForUser(tenant, userId),
      flowVariables: flowVariablesForUser(tenant, userId)
    };
    if (!flowConditionsMatch(conditions, record, context, flow.startConfig.conditionLogic)) continue;
    if (event === 'updated' && flow.startConfig.updatedRecordBehavior === 'transition' && prior
      && flowConditionsMatch(conditions, prior, { ...context, record: prior, prior: undefined }, flow.startConfig.conditionLogic)) continue;
    try {
      const result = await executeFlow(
        flow, tenant, tenantId, userId, {}, record, prior, 0, undefined, depth, event, isClone,
        flowInterviewIdentity(context), false, debugExecution, debugTrace, rollbackSnapshot
      );
      if (result.status !== 'completed') {
        throw new Error(`Before-save flow "${flow.label}" cannot pause for user or scheduled input.`);
      }
      Object.assign(record, calculateFormulaFields(object, record, { ...formulaContextForUser(tenant, userId), isClone }));
    } catch (error) {
      if (!debugExecution) persistFlowFailure(tenantId, flow, 'Record-Triggered', error, userId);
      throw error;
    }
  }
}

function orderedRecordTriggeredFlows(
  tenant: TenantData,
  objectName: string,
  runWhen: 'before-save' | 'after-save'
): FlowMetadata[] {
  return tenant.flows
    .filter((flow) => flow.status === 'Active'
      && flow.flowType === 'Record-Triggered Flow'
      && flow.triggerObject === objectName
      && String(flow.startConfig.runWhen ?? 'after-save') === runWhen)
    .sort((left, right) => {
      const leftOrder = typeof left.startConfig.triggerOrder === 'number' ? left.startConfig.triggerOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.startConfig.triggerOrder === 'number' ? right.startConfig.triggerOrder : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.apiName.localeCompare(right.apiName);
    });
}

function scheduledOccurrence(flow: FlowMetadata, now: Date): Date | undefined {
  const startDate = String(flow.startConfig.startDate ?? '');
  const startTime = String(flow.startConfig.startTime ?? '');
  const timeZone = String(flow.startConfig.timeZone ?? 'UTC');
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!dateMatch || !timeMatch) return undefined;
  const startParts = dateMatch.slice(1).map(Number);
  const startCivil = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const startDay = new Date(startCivil);
  if (startDay.getUTCFullYear() !== startParts[0] || startDay.getUTCMonth() !== startParts[1] - 1
    || startDay.getUTCDate() !== startParts[2]) return undefined;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const start = flowLocalDateTimeToInstant(startDay, hour, minute, timeZone);
  if (!start || now.getTime() < start.getTime()) return undefined;
  const frequency = String(flow.startConfig.frequency);
  if (frequency === 'Once') return start;
  const intervalDays = frequency === 'Daily' ? 1 : frequency === 'Weekly' ? 7 : 0;
  if (!intervalDays) return undefined;
  const nowParts = dashboardLocalParts(now, timeZone);
  const nowCivil = Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day));
  const elapsedDays = Math.floor((nowCivil - startCivil) / 86_400_000);
  if (elapsedDays < 0) return undefined;
  let offsetDays = Math.floor(elapsedDays / intervalDays) * intervalDays;
  if (offsetDays === elapsedDays && `${nowParts.hour}:${nowParts.minute}` < startTime) offsetDays -= intervalDays;
  for (let attempt = 0; offsetDays >= 0 && attempt < 8; attempt += 1, offsetDays -= intervalDays) {
    const civilDate = new Date(startCivil + offsetDays * 86_400_000);
    const occurrence = flowLocalDateTimeToInstant(civilDate, hour, minute, timeZone);
    if (occurrence && occurrence.getTime() >= start.getTime() && occurrence.getTime() <= now.getTime()) return occurrence;
  }
  return undefined;
}

function nextScheduledOccurrence(flow: FlowMetadata, previous: Date, now: Date): Date | undefined {
  const frequency = String(flow.startConfig.frequency);
  const intervalDays = frequency === 'Daily' ? 1 : frequency === 'Weekly' ? 7 : 0;
  if (!intervalDays) return undefined;
  const timeZone = String(flow.startConfig.timeZone ?? 'UTC');
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(flow.startConfig.startTime ?? ''));
  if (!timeMatch) return undefined;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const previousParts = dashboardLocalParts(previous, timeZone);
  const previousCivil = Date.UTC(
    Number(previousParts.year), Number(previousParts.month) - 1, Number(previousParts.day)
  );
  for (let offset = intervalDays; offset <= 366 * intervalDays; offset += intervalDays) {
    const civilDate = new Date(previousCivil + offset * 86_400_000);
    const occurrence = flowLocalDateTimeToInstant(civilDate, hour, minute, timeZone);
    if (occurrence && occurrence.getTime() > previous.getTime()) {
      return occurrence.getTime() <= now.getTime() ? occurrence : undefined;
    }
  }
  return undefined;
}

async function resumeDueFlowInterviews(now: Date): Promise<void> {
  for (const [tenantId, tenant] of Object.entries(state.tenants)) {
    for (const interview of [...tenant.interviews]) {
      if (!['wait', 'scheduled'].includes(interview.kind) || !interview.waitUntil
        || Date.parse(interview.waitUntil) > now.getTime()
        || (interview.retryAt && Date.parse(interview.retryAt) > now.getTime())) continue;
      const currentTenant = tenantData(tenantId);
      if (!currentTenant) continue;
      const flow = currentTenant.flows.find((item) => item.apiName === interview.flowApiName
        && ((item.status === 'Active' && item.activeVersion === interview.versionNumber)
          || (interview.allowDraft && item.status === 'Draft' && item.versionNumber === interview.versionNumber)));
      const working = structuredClone(currentTenant);
      try {
        if (interview.kind === 'wait' && Date.parse(interview.expiresAt) <= now.getTime()) {
          throw new Error('Wait interview expired before it could resume.');
        }
        if (!flow) throw new Error('Wait interview flow version is no longer active.');
        if (interview.nextElementId === null) {
          working.interviews = working.interviews.filter((item) => item.id !== interview.id);
          persistTenantRecords(tenantId, working);
          continue;
        }
        const result = await executeFlow(flow, working, tenantId, interview.userId, {}, interview.record ?? undefined, interview.prior ?? undefined, 0, {
          startAt: interview.nextElementId,
          variables: interview.variables,
          interviewGuid: interview.id,
          interviewStartTime: interview.createdAt
        }, 0, undefined, false, undefined, interview.allowDraft);
        if (result.status === 'waiting') {
          const updated = createFlowInterview(flow, interview.userId, result);
          working.interviews = working.interviews.map((item) => item.id === interview.id ? updated : item);
        } else {
          working.interviews = working.interviews.filter((item) => item.id !== interview.id);
        }
        persistTenantRecords(tenantId, working);
      } catch (error) {
        console.error(`Wait interview "${interview.id}" failed: ${error instanceof Error ? error.message : String(error)}`);
        const failedTenant = structuredClone(tenantData(tenantId) ?? currentTenant);
        const failedInterview = failedTenant.interviews.find((item) => item.id === interview.id);
        const expired = Date.parse(interview.expiresAt) <= now.getTime();
        if (expired) {
          failedTenant.interviews = failedTenant.interviews.filter((item) => item.id !== interview.id);
        } else if (failedInterview) {
          failedInterview.attempts += 1;
          failedInterview.retryAt = new Date(now.getTime() + flowRetryDelayMs(failedInterview.attempts)).toISOString();
        }
        failedTenant.flowLogs.push(createFlowFailureLog(
          flow ?? { apiName: interview.flowApiName, label: interview.flowApiName },
          interview.kind === 'scheduled' ? 'Scheduled Path' : 'Wait Interview',
          error,
          interview.userId
        ));
        persistTenantRecords(tenantId, failedTenant);
      }
    }
  }
}

async function executeDueScheduledFlows(now = new Date()): Promise<void> {
  await resumeDueFlowInterviews(now);
  for (const [tenantId, tenant] of Object.entries(state.tenants)) {
    for (const flow of [...tenant.flows]) {
      const currentTenant = tenantData(tenantId);
      if (!currentTenant) continue;
      if (flow.status !== 'Active' || flow.flowType !== 'Schedule-Triggered Flow' || !flow.triggerObject) continue;
      const runKey = `${flow.apiName}@${flow.activeVersion ?? flow.versionNumber}`;
      const latestOccurrence = scheduledOccurrence(flow, now);
      const pendingRetry = currentTenant.scheduleRetries[runKey];
      const lastRun = currentTenant.scheduleRuns[runKey];
      const pendingOccurrence = pendingRetry && (!lastRun || Date.parse(pendingRetry.occurrenceAt) > Date.parse(lastRun))
        ? new Date(pendingRetry.occurrenceAt)
        : undefined;
      const occurrence = pendingOccurrence ?? (lastRun
        ? nextScheduledOccurrence(flow, new Date(lastRun), now)
        : latestOccurrence);
      if (pendingRetry && occurrence?.toISOString() === pendingRetry.occurrenceAt
        && Date.parse(pendingRetry.retryAt) > now.getTime()) continue;
      if (!occurrence || (currentTenant.scheduleRuns[runKey] && Date.parse(currentTenant.scheduleRuns[runKey]) >= occurrence.getTime())) continue;
      const working = structuredClone(currentTenant);
      try {
        const objectName = flow.triggerObject;
        const conditions = asConfigRows(flow.startConfig.entryConditions);
        const candidates = working.records[objectName] ?? [];
        if (candidates.length > 2000) throw new Error(`Scheduled flow "${flow.label}" exceeded the 2,000-record execution limit.`);
        for (const record of candidates) {
          const scheduledUserId = state.users.find((user) => user.tenantId === tenantId && !user.disabled)?.id ?? 'scheduled-system';
          const context: FlowRuntimeContext = {
            record,
            resourceDefinitions: flow.resources,
            formulaStack: new Set(),
            variables: {},
            currentUserId: scheduledUserId,
            ...formulaContextForUser(working, scheduledUserId),
            flowVariables: flowVariablesForUser(working, scheduledUserId)
          };
          if (flowConditionsMatch(conditions, record, context, flow.startConfig.conditionLogic)) {
            const result = await executeFlow(flow, working, tenantId, context.currentUserId, {}, record, undefined, 0, undefined, 0, undefined, false, flowInterviewIdentity(context));
            if (result.status === 'waiting') {
              if (result.kind !== 'wait') throw new Error('Scheduled flows cannot pause for screen input.');
              working.interviews.push(createFlowInterview(flow, context.currentUserId, result));
            }
          }
        }
        working.scheduleRuns[runKey] = occurrence.toISOString();
        delete working.scheduleRetries[runKey];
        persistTenantRecords(tenantId, working);
      } catch (error) {
        console.error(`Scheduled flow "${flow.apiName}" failed for tenant "${tenantId}": ${error instanceof Error ? error.message : String(error)}`);
        const failedTenant = structuredClone(tenantData(tenantId) ?? currentTenant);
        const attempts = (pendingRetry?.occurrenceAt === occurrence.toISOString() ? pendingRetry.attempts : 0) + 1;
        failedTenant.scheduleRetries[runKey] = {
          occurrenceAt: occurrence.toISOString(),
          attempts,
          retryAt: new Date(now.getTime() + flowRetryDelayMs(attempts)).toISOString()
        };
        failedTenant.flowLogs.push(createFlowFailureLog(flow, 'Scheduled', error, null));
        persistTenantRecords(tenantId, failedTenant);
      }
    }
  }
}

function platformEventFlowMatches(
  flow: FlowMetadata,
  tenant: TenantData,
  userId: string,
  payload: RuntimeRecord
): boolean {
  const context: FlowRuntimeContext = {
    record: payload,
    triggerObjectName: flow.triggerObject ?? undefined,
    currentUserId: userId,
    resourceDefinitions: flow.resources,
    formulaStack: new Set(),
    variables: Object.fromEntries(flow.resources.map((resource) => [resource.name, resource.value])),
    flowVariables: flowVariablesForUser(tenant, userId),
    ...formulaContextForUser(tenant, userId)
  };
  return flowConditionsMatch(
    asConfigRows(flow.startConfig.entryConditions),
    payload,
    context,
    flow.startConfig.conditionLogic
  );
}

async function deliverPendingPlatformEvents(now = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  for (const tenantId of Object.keys(state.tenants)) {
    const snapshot = tenantData(tenantId);
    if (!snapshot) continue;
    const dueMessages = snapshot.platformEventMessages.filter((message) =>
      !message.processedAt && !message.deadLettered
      && (!message.retryAt || Date.parse(message.retryAt) <= now.getTime()));
    for (const queuedMessage of dueMessages) {
      let currentTenant = tenantData(tenantId);
      let message = currentTenant?.platformEventMessages.find((item) => item.id === queuedMessage.id);
      if (!currentTenant || !message || message.processedAt || message.deadLettered) continue;
      const subscriberTenant = currentTenant;
      const eventMessage = message;
      const subscribers = subscriberTenant.flows.filter((flow) =>
        flow.status === 'Active' && flow.flowType === 'Platform Event-Triggered Flow'
        && flow.triggerObject === eventMessage.eventApiName
        && platformEventFlowMatches(flow, subscriberTenant, eventMessage.publishedBy, eventMessage.payload as RuntimeRecord));
      if (!subscribers.length) {
        persistTenantRecords(tenantId, {
          ...currentTenant,
          platformEventMessages: currentTenant.platformEventMessages.map((item) => item.id === message?.id
            ? { ...item, processedAt: nowIso, retryAt: null, lastError: '' }
            : item)
        });
        continue;
      }
      for (const subscriber of subscribers) {
        currentTenant = tenantData(tenantId);
        message = currentTenant?.platformEventMessages.find((item) => item.id === queuedMessage.id);
        if (!currentTenant || !message || message.deliveredFlowApiNames.includes(subscriber.apiName)) continue;
        try {
          const working = structuredClone(currentTenant);
          const activeFlow = working.flows.find((flow) => flow.apiName === subscriber.apiName
            && flow.status === 'Active' && flow.flowType === 'Platform Event-Triggered Flow');
          if (!activeFlow) continue;
          const result = await executeFlow(
            activeFlow, working, tenantId, message.publishedBy, {},
            message.payload as RuntimeRecord
          );
          if (result.status === 'waiting') {
            if (result.kind === 'screen') throw new Error('Platform Event-Triggered Flows cannot pause for screen input.');
            working.interviews.push(createFlowInterview(activeFlow, message.publishedBy, result));
          }
          working.platformEventMessages = working.platformEventMessages.map((item) => item.id === message?.id
            ? {
              ...item,
              deliveredFlowApiNames: [...item.deliveredFlowApiNames, activeFlow.apiName],
              attempts: 0,
              retryAt: null,
              lastError: ''
            }
            : item);
          const updatedMessage = working.platformEventMessages.find((item) => item.id === message?.id);
          const allDelivered = subscribers.every((flow) =>
            updatedMessage?.deliveredFlowApiNames.includes(flow.apiName));
          if (allDelivered && updatedMessage) {
            working.platformEventMessages = working.platformEventMessages.map((item) => item.id === updatedMessage.id
              ? { ...item, processedAt: nowIso }
              : item);
          }
          persistTenantRecords(tenantId, working);
        } catch (error) {
          const failedTenant = tenantData(tenantId);
          if (!failedTenant) continue;
          const failedMessage = failedTenant.platformEventMessages.find((item) => item.id === queuedMessage.id);
          if (!failedMessage) continue;
          const attempts = failedMessage.attempts + 1;
          const deadLettered = attempts >= 10;
          const retryAt = deadLettered ? null : new Date(now.getTime() + flowRetryDelayMs(attempts)).toISOString();
          const failure = error instanceof Error ? error.message : String(error);
          persistTenantRecords(tenantId, {
            ...failedTenant,
            platformEventMessages: failedTenant.platformEventMessages.map((item) => item.id === failedMessage.id
              ? { ...item, attempts, retryAt, lastError: failure.slice(0, 1000), deadLettered }
              : item),
            flowLogs: [...failedTenant.flowLogs, createFlowFailureLog(subscriber, 'Platform Event', failure, failedMessage.publishedBy)]
          });
          break;
        }
      }
    }
  }
}

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
  platformEvents: z.infer<typeof platformEventSchema>[] = []
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const starts = flow.elements.filter((element) => element.type === 'Start');
  if (starts.length !== 1) errors.push('A flow must have exactly one Start element.');
  else if (flow.elements[0]?.id !== starts[0].id) errors.push('Move the Start element to the beginning of the flow.');
  const requiresObject = ['Record-Triggered Flow', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow'].includes(flow.flowType);
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
      else if (!resourceReference && object && !object.fields.some((field) => field.apiName === fieldName)) errors.push(`Field "${fieldName}" on "${elementLabel}" does not exist on "${object.apiName}".`);
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
    if (connector.kind === 'scheduled') {
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
      evaluateFormula(resource.value, () => null, {
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
    if (!['Start', 'End', 'Assignment', 'Decision', 'Loop', 'Collection Filter', 'Collection Sort', 'Transform', 'Get Records', 'Create Records', 'Update Records', 'Delete Records', 'Roll Back Records', 'Publish Platform Event', 'Subflow', 'Screen', 'Wait', 'Action', 'HTTP Callout'].includes(element.type)) {
      errors.push(`Flow element type "${element.type}" is not supported.`);
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
      if (element.config.layout !== undefined && !['One Column', 'Two Columns'].includes(String(element.config.layout))) {
        errors.push(`Screen "${element.label}" layout must be One Column or Two Columns.`);
      }
      const outcomes = asConfigRows(element.config.outcomes);
      const labels = outcomes.map((outcome) => typeof outcome.label === 'string' ? outcome.label.trim() : '');
      const names = outcomes.map((outcome) => typeof outcome.name === 'string' ? outcome.name.trim() : '');
      const connectors = flow.connectors.filter((connector) => connector.from === element.id && connector.kind !== 'fault');
      if (outcomes.some((outcome) => typeof outcome.label !== 'string' || !outcome.label.trim())) {
        errors.push(`Screen "${element.label}" outcomes must have labels.`);
      }
      if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length
        || new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
        errors.push(`Screen "${element.label}" outcome labels and API names must be unique.`);
      }
      const routeKeys = new Set<string>();
      for (const connector of connectors) {
        if (!outcomes.length) {
          if (connectors.length > 1) errors.push(`Screen "${element.label}" has multiple paths but no configured outcomes.`);
          continue;
        }
        if (!connector.label) {
          if (connectors.length > 1) errors.push(`Screen "${element.label}" has multiple paths but a connector is missing its outcome label.`);
          continue;
        }
        const key = connector.label.toLowerCase();
        if (!outcomes.some((outcome) =>
          String(outcome.label ?? '').toLowerCase() === key || String(outcome.name ?? '').toLowerCase() === key)) {
          errors.push(`Screen connector "${connector.id}" does not match an outcome on "${element.label}".`);
        }
        if (routeKeys.has(key)) errors.push(`Screen "${element.label}" has more than one connector for outcome "${connector.label}".`);
        routeKeys.add(key);
      }
      for (const outcome of outcomes) {
        const label = String(outcome.label ?? '').trim().toLowerCase();
        const name = String(outcome.name ?? '').trim().toLowerCase();
        const matchingConnectors = connectors.filter((connector) => {
          const connectorLabel = connector.label.trim().toLowerCase();
          return connectorLabel && (connectorLabel === label || connectorLabel === name);
        });
        const implicitDefaultPath = outcomes.length === 1 && connectors.length === 1
          && !connectors[0].label && String(outcome.name ?? '').toLowerCase() === 'default';
        if (!implicitDefaultPath && matchingConnectors.length !== 1) {
          errors.push(`Screen "${element.label}" outcome "${String(outcome.label ?? outcome.name ?? '')}" must have exactly one connector.`);
        }
      }
      const fields = asConfigRows(element.config.fields);
      const displayFields = fields.filter((field) => ['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
      for (const field of displayFields) {
        if (field.type === 'Display Text' && (typeof field.text !== 'string' || !field.text.trim())) {
          errors.push(`Display Text component "${String(field.label ?? '')}" on "${element.label}" requires text content.`);
        }
        if (field.type === 'Display Image') {
          const imageUrl = typeof field.imageUrl === 'string' ? field.imageUrl.trim() : '';
          let validHttpsImage = false;
          try {
            const imageAddress = new URL(imageUrl);
            validHttpsImage = imageAddress.protocol === 'https:'
              && Boolean(imageAddress.hostname)
              && !imageAddress.username
              && !imageAddress.password;
          } catch {
            validHttpsImage = false;
          }
          if (!validHttpsImage) errors.push(`Display Image component "${String(field.label ?? '')}" on "${element.label}" requires an HTTPS image URL.`);
          if (typeof field.imageAltText !== 'string' || !field.imageAltText.trim()) {
            errors.push(`Display Image component "${String(field.label ?? '')}" on "${element.label}" requires alternative text.`);
          }
        }
        if (field.type === 'Section') {
          if (typeof field.label !== 'string' || !field.label.trim()) {
            errors.push(`Section component on "${element.label}" requires a label.`);
          }
          if (field.description !== undefined
            && (typeof field.description !== 'string' || field.description.length > 255)) {
            errors.push(`Description on Section component "${String(field.label ?? '')}" must be no longer than 255 characters.`);
          }
          if (field.columns !== undefined && ![1, 2].includes(Number(field.columns))) {
            errors.push(`Section component "${String(field.label ?? '')}" must contain one or two columns.`);
          }
        }
      }
      const inputFields = fields.filter((field) => !['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
      const fieldNames = inputFields.map((field) => typeof field.apiName === 'string'
        ? field.apiName.trim()
        : String(field.label ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''));
      if (new Set(fieldNames.map((name) => name.toLowerCase())).size !== fieldNames.length
        || fieldNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
        errors.push(`Screen "${element.label}" fields must have unique, valid API names.`);
      }
      for (const field of inputFields) {
        if (typeof field.helpText === 'string' && field.helpText.length > 255) {
          errors.push(`Help text on screen field "${String(field.label ?? '')}" exceeds 255 characters.`);
        }
        const type = String(field.type ?? 'Text');
        const supportedTypes = ['Text', 'Password', 'Number', 'Currency', 'Date', 'Time', 'Date/Time', 'Email', 'URL', 'Phone', 'Checkbox', 'Toggle', 'Slider', 'Picklist', 'Multi-Select Picklist', 'Long Text Area', 'Address', 'Name', 'Lookup', 'Choice Lookup', 'Data Table', 'File Upload', 'Repeater'];
        if (!supportedTypes.includes(type)) {
          errors.push(`Screen field "${String(field.label ?? '')}" on "${element.label}" uses unsupported data type "${type}".`);
        }
        if (['Lookup', 'Choice Lookup'].includes(type) && !objects.some((object) => object.apiName === field.objectApiName)) {
          errors.push(`${type} screen field "${String(field.label ?? '')}" on "${element.label}" requires a valid target object.`);
        }
        if (type === 'Choice Lookup' && field.displayField !== undefined
          && !objects.find((object) => object.apiName === field.objectApiName)?.fields.some((item) => item.apiName === field.displayField)) {
          errors.push(`Choice Lookup screen field "${String(field.label ?? '')}" on "${element.label}" requires a valid choice label field.`);
        }
        if (type === 'Choice Lookup' && field.multipleSelections !== undefined
          && typeof field.multipleSelections !== 'boolean') {
          errors.push(`Choice Lookup screen field "${String(field.label ?? '')}" on "${element.label}" must configure multiple selections as true or false.`);
        }
        if (type === 'Data Table') {
          const collectionName = typeof field.collection === 'string' ? field.collection : '';
          const collection = flow.resources.find((resource) => resource.name === collectionName && resource.type === 'Record Collection');
          if (!collection) errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" requires a Record Collection resource.`);
          const columnNames = Array.isArray(field.columns) ? field.columns.filter((column): column is string => typeof column === 'string') : [];
          if (!columnNames.length || new Set(columnNames).size !== columnNames.length) {
            errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" requires unique columns.`);
          } else if (collection && !objects.find((object) => object.apiName === collection.dataType)?.fields.some((item) => columnNames.includes(item.apiName))) {
            errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" has columns that are not fields on its collection object.`);
          }
        }
        if (type === 'File Upload') {
          const maxFiles = field.maxFiles === undefined ? 1 : field.maxFiles;
          const maxFileSize = field.maxFileSize === undefined ? 512 : field.maxFileSize;
          const allowedTypes = Array.isArray(field.allowedTypes) ? field.allowedTypes : [];
          if (!Number.isInteger(maxFiles) || Number(maxFiles) < 1 || Number(maxFiles) > 10) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" must allow between 1 and 10 files.`);
          }
          if (!Number.isInteger(maxFileSize) || Number(maxFileSize) < 1 || Number(maxFileSize) > 512) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" must limit each file to 1 through 512 KB.`);
          }
          if (allowedTypes.some((mime) => typeof mime !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(mime))) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" has an invalid allowed MIME type.`);
          }
        }
        if (type === 'Repeater') {
          const subfields = asConfigRows(field.subfields);
          if (!subfields.length || subfields.length > 20) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" must define between 1 and 20 subfields.`);
          }
          const subfieldNames = subfields.map((subfield) => typeof subfield.apiName === 'string' ? subfield.apiName.trim() : '');
          if (subfieldNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
            || new Set(subfieldNames.map((name) => name.toLowerCase())).size !== subfieldNames.length) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" subfields must have unique, valid API names.`);
          }
          const allowedSubfieldTypes = ['Text', 'Number', 'Date', 'Email', 'Checkbox'];
          if (subfields.some((subfield) => !allowedSubfieldTypes.includes(String(subfield.type ?? 'Text')))) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" uses an unsupported subfield type.`);
          }
          const minimumRows = field.minimumRows === undefined ? 0 : field.minimumRows;
          const maximumRows = field.maximumRows === undefined ? 10 : field.maximumRows;
          if (!Number.isInteger(minimumRows) || Number(minimumRows) < 0 || Number(minimumRows) > 50
            || !Number.isInteger(maximumRows) || Number(maximumRows) < 1 || Number(maximumRows) > 50
            || Number(minimumRows) > Number(maximumRows)) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" requires valid row limits from 0 to 50.`);
          }
        }
        const displayAs = field.displayAs;
        if (displayAs !== undefined) {
          const supportedDisplays: Record<string, string[]> = {
            Picklist: ['Dropdown', 'Radio Buttons'],
            'Multi-Select Picklist': ['Multi-Select Dropdown', 'Checkbox Group']
          };
          if (!supportedDisplays[type]?.includes(String(displayAs))) {
            errors.push(`Display mode "${String(displayAs)}" is not supported for ${type} screen field "${String(field.label ?? '')}".`);
          }
        }
        const minLength = field.minLength;
        const maxLength = field.maxLength;
        const min = field.min;
        const max = field.max;
        const step = field.step;
        if (minLength !== undefined && (!Number.isInteger(minLength) || Number(minLength) < 0)) {
          errors.push(`Minimum length on screen field "${String(field.label ?? '')}" must be a non-negative integer.`);
        }
        if (maxLength !== undefined && (!Number.isInteger(maxLength) || Number(maxLength) < 0)) {
          errors.push(`Maximum length on screen field "${String(field.label ?? '')}" must be a non-negative integer.`);
        }
        if (typeof minLength === 'number' && typeof maxLength === 'number' && minLength > maxLength) {
          errors.push(`Minimum length exceeds maximum length on screen field "${String(field.label ?? '')}".`);
        }
        if (minLength !== undefined || maxLength !== undefined) {
          if (!['Text', 'Password', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(type)) {
            errors.push(`Length limits are only supported on text screen fields ("${String(field.label ?? '')}").`);
          }
        }
        if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) {
          errors.push(`Minimum value on screen field "${String(field.label ?? '')}" must be a finite number.`);
        }
        if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) {
          errors.push(`Maximum value on screen field "${String(field.label ?? '')}" must be a finite number.`);
        }
        if (typeof min === 'number' && typeof max === 'number' && min > max) {
          errors.push(`Minimum value exceeds maximum value on screen field "${String(field.label ?? '')}".`);
        }
        if (min !== undefined || max !== undefined) {
          if (!['Number', 'Currency', 'Slider'].includes(type)) {
            errors.push(`Numeric limits are only supported on Number, Currency, and Slider screen fields ("${String(field.label ?? '')}").`);
          }
          if (step !== undefined && (typeof step !== 'number' || !Number.isFinite(step) || step <= 0)) {
            errors.push(`Step on screen field "${String(field.label ?? '')}" must be a positive finite number.`);
          }
          if (step !== undefined && !['Number', 'Currency', 'Slider'].includes(type)) {
            errors.push(`Step is only supported on numeric and Slider screen fields ("${String(field.label ?? '')}").`);
          }
        }
        if (field.pattern !== undefined) {
          if (typeof field.pattern !== 'string' || !isSafeFlowRegex(field.pattern) || !['Text', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(type)) {
            errors.push(`Validation pattern on screen field "${String(field.label ?? '')}" uses unsupported syntax or is not on a text field.`);
          } else {
            try {
              new RegExp(`^(?:${field.pattern})$`);
            } catch {
              errors.push(`Validation pattern on screen field "${String(field.label ?? '')}" is invalid.`);
            }
          }
        }
        if (field.validationMessage !== undefined
          && (typeof field.validationMessage !== 'string' || field.validationMessage.length > 255)) {
          errors.push(`Validation message on screen field "${String(field.label ?? '')}" must be at most 255 characters.`);
        }
        const visibilityConditions = asConfigRows(field.visibilityConditions);
        if (visibilityConditions.length) {
          validateConditions(field.visibilityConditions, undefined, `visibility rule for "${String(field.label ?? '')}" on "${element.label}"`);
          validateConditionLogic(field.visibilityLogic, `visibility rule for "${String(field.label ?? '')}" on "${element.label}"`, visibilityConditions.length);
          for (const condition of visibilityConditions) {
            if (typeof condition.field === 'string' && !fieldNames.includes(condition.field)) {
              errors.push(`Visibility condition on "${String(field.label ?? '')}" references unknown screen field "${condition.field}".`);
            }
          }
        }
        const defaultValue = field.defaultValue;
        const choices = field.choices;
        if (defaultValue !== undefined && defaultValue !== null && defaultValue !== '') {
          const validType = type === 'Multi-Select Picklist'
            ? Array.isArray(defaultValue) && defaultValue.every((value) => typeof value === 'string')
            : ['Checkbox', 'Toggle'].includes(type)
              ? typeof defaultValue === 'boolean'
              : ['Number', 'Currency', 'Slider'].includes(type)
                ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
                : typeof defaultValue === 'string';
          if (!validType) errors.push(`Default value on ${type} screen field "${String(field.label ?? '')}" has an incompatible value type.`);
          if (type === 'Picklist' && (!Array.isArray(choices) || !choices.includes(defaultValue))) {
            errors.push(`Default value on picklist screen field "${String(field.label ?? '')}" must be one of its configured choices.`);
          }
          if (type === 'Multi-Select Picklist' && Array.isArray(choices)
            && Array.isArray(defaultValue) && defaultValue.some((value) => !choices.includes(value))) {
            errors.push(`Default value on multi-select screen field "${String(field.label ?? '')}" must contain only configured choices.`);
          }
          if (type === 'Date' && typeof defaultValue === 'string'
            && (!/^\d{4}-\d{2}-\d{2}$/.test(defaultValue)
              || !Number.isFinite(Date.parse(`${defaultValue}T00:00:00.000Z`))
              || new Date(`${defaultValue}T00:00:00.000Z`).toISOString().slice(0, 10) !== defaultValue)) {
            errors.push(`Default value on date screen field "${String(field.label ?? '')}" must be a valid date.`);
          }
          if (type === 'Date/Time' && typeof defaultValue === 'string' && !isValidFlowDateTime(defaultValue)) {
            errors.push(`Default value on date/time screen field "${String(field.label ?? '')}" must be a valid date and time.`);
          }
          if (type === 'Time' && typeof defaultValue === 'string' && !isValidFlowTime(defaultValue)) {
            errors.push(`Default value on time screen field "${String(field.label ?? '')}" must be a valid time.`);
          }
          if (type === 'Email' && typeof defaultValue === 'string' && !z.string().email().safeParse(defaultValue).success) {
            errors.push(`Default value on email screen field "${String(field.label ?? '')}" must be a valid email address.`);
          }
          if (type === 'URL' && typeof defaultValue === 'string' && !z.string().url().safeParse(defaultValue).success) {
            errors.push(`Default value on URL screen field "${String(field.label ?? '')}" must be a valid URL.`);
          }
        }
      }
      const choices = inputFields.filter((field) => ['Picklist', 'Multi-Select Picklist'].includes(String(field.type)));
      for (const field of choices) {
        if (!Array.isArray(field.choices) || !field.choices.length || field.choices.some((choice) => typeof choice !== 'string' || !choice.trim())) {
          errors.push(`${String(field.type)} screen field "${String(field.label ?? '')}" on "${element.label}" requires one or more choices.`);
        } else if (new Set(field.choices).size !== field.choices.length) {
          errors.push(`${String(field.type)} screen field "${String(field.label ?? '')}" on "${element.label}" has duplicate choices.`);
        }
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
      if (!['Assign', 'Add', 'Subtract', 'Multiply', 'Divide', 'Add At Beginning', 'Add At End', 'Remove All'].includes(operator)) {
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
      const expectedType = element.config.recordLimit === 'all' ? 'Record Collection' : 'Record';
      if (!resource || resource.type !== expectedType || resource.dataType !== elementObjectName) {
        errors.push(`Output variable "${element.config.outputVariable}" on "${element.label}" must be a ${expectedType} resource.`);
      }
    }
    if (element.type === 'Subflow') {
      const childApiName = typeof element.config.flowApiName === 'string' ? element.config.flowApiName : '';
      const childFlow = allFlows.find((candidate) => candidate.apiName === childApiName);
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

function dashboardLocalParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function flowLocalDateTimeToInstant(civilDate: Date, hour: number, minute: number, timeZone: string): Date | undefined {
  const targetCivil = Date.UTC(civilDate.getUTCFullYear(), civilDate.getUTCMonth(), civilDate.getUTCDate(), hour, minute);
  let candidate = targetCivil;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dashboardLocalParts(new Date(candidate), timeZone);
    const representedCivil = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const difference = targetCivil - representedCivil;
    if (!difference) break;
    candidate += difference;
  }
  const result = new Date(candidate);
  const parts = dashboardLocalParts(result, timeZone);
  if (Number(parts.year) !== civilDate.getUTCFullYear()
    || Number(parts.month) !== civilDate.getUTCMonth() + 1
    || Number(parts.day) !== civilDate.getUTCDate()
    || Number(parts.hour) !== hour || Number(parts.minute) !== minute) return undefined;
  return result;
}

function nextDashboardSubscriptionRunAt(
  schedule: Pick<DashboardSubscription, 'frequency' | 'localTime' | 'timeZone' | 'dayOfWeek'>,
  after: Date
): string {
  const nowParts = dashboardLocalParts(after, schedule.timeZone);
  const localToday = new Date(Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day)));
  const [hour, minute] = schedule.localTime.split(':').map(Number);
  let dayOffset = 0;
  if (schedule.frequency === 'Daily') {
    if (`${nowParts.hour}:${nowParts.minute}` >= schedule.localTime) dayOffset = 1;
  } else {
    const currentDay = localToday.getUTCDay();
    dayOffset = ((schedule.dayOfWeek ?? 0) - currentDay + 7) % 7;
    if (dayOffset === 0 && `${nowParts.hour}:${nowParts.minute}` >= schedule.localTime) dayOffset = 7;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scheduledDay = new Date(localToday.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const targetCivil = Date.UTC(scheduledDay.getUTCFullYear(), scheduledDay.getUTCMonth(), scheduledDay.getUTCDate(), hour, minute);
    let candidate = targetCivil;
    for (let adjustment = 0; adjustment < 4; adjustment += 1) {
      const parts = dashboardLocalParts(new Date(candidate), schedule.timeZone);
      const representedCivil = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
      const difference = targetCivil - representedCivil;
      if (!difference) break;
      candidate += difference;
    }
    const actual = dashboardLocalParts(new Date(candidate), schedule.timeZone);
    if (Number(actual.year) === scheduledDay.getUTCFullYear()
      && Number(actual.month) === scheduledDay.getUTCMonth() + 1
      && Number(actual.day) === scheduledDay.getUTCDate()
      && Number(actual.hour) === hour && Number(actual.minute) === minute
      && candidate > after.getTime()) {
      return new Date(candidate).toISOString();
    }
    dayOffset += schedule.frequency === 'Daily' ? 1 : 7;
  }
  throw new Error(`Could not calculate the next dashboard run for time zone "${schedule.timeZone}".`);
}

function dashboardEmailFilterMatches(record: RuntimeRecord, filter: DashboardFilterMetadata): boolean {
  return reportFilterMatches(record, filter);
}

type DashboardCrossFilterResolution =
  | { recordIds: Set<string> }
  | { error: string; status: 400 | 403 };
type ReportCrossFilterResolution =
  | { matchesRecord: (record: RuntimeRecord) => boolean }
  | { error: string; status: 400 | 403 };

function resolveReportCrossFilters(
  principal: Principal,
  tenant: TenantData,
  parentObject: ObjectMetadata,
  crossFilters: z.infer<typeof reportCrossFilterSchema>[],
  matchesFilter: (record: RuntimeRecord, filter: z.infer<typeof reportFilterSchema>) => boolean
): ReportCrossFilterResolution {
  const configured: Array<{
    mode: 'With' | 'Without';
    childRecords: RuntimeRecord[];
    relationshipFieldApiName: string;
    filters: z.infer<typeof reportFilterSchema>[];
  }> = [];
  for (const crossFilter of crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    const relationshipField = childObject?.fields.find((field) =>
      field.relationship?.targetObject === parentObject.apiName);
    if (!childObject || !relationshipField) {
      return { error: `Cross-filter object "${crossFilter.childObjectApiName}" is not a child of "${parentObject.apiName}"`, status: 400 };
    }
    if (!hasObjectPermission(principal, tenant, childObject.apiName, 'read')) {
      return { error: `Missing read permission for cross-filter object "${childObject.apiName}"`, status: 403 };
    }
    if (!hasFieldPermission(principal, tenant, childObject.apiName, relationshipField.apiName, 'read')) {
      return { error: `Missing read permission for relationship field "${childObject.apiName}.${relationshipField.apiName}"`, status: 403 };
    }
    for (const filter of crossFilter.filters) {
      if (!childObject.fields.some((field) => field.apiName === filter.fieldApiName)) {
        return { error: `Cross-filter field "${filter.fieldApiName}" is unavailable on "${childObject.apiName}"`, status: 400 };
      }
      if (!hasFieldPermission(principal, tenant, childObject.apiName, filter.fieldApiName, 'read')) {
        return { error: `Missing read permission for cross-filter field "${childObject.apiName}.${filter.fieldApiName}"`, status: 403 };
      }
    }
    configured.push({
      mode: crossFilter.mode,
      relationshipFieldApiName: relationshipField.apiName,
      filters: crossFilter.filters,
      childRecords: (tenant.records[childObject.apiName] ?? []).filter((record) =>
        hasRecordAccess(principal, tenant, childObject.apiName, record, 'Read'))
        .map((record) => calculateFormulaFields(childObject, record, formulaContextForUser(tenant, principal.userId)))
    });
  }
  return {
    matchesRecord: (record) => configured.every((crossFilter) => {
      const hasMatchingChild = crossFilter.childRecords.some((childRecord) =>
        String(childRecord[crossFilter.relationshipFieldApiName] ?? '') === record.Id
        && crossFilter.filters.every((filter) => matchesFilter(childRecord, filter)));
      return crossFilter.mode === 'With' ? hasMatchingChild : !hasMatchingChild;
    })
  };
}

type DashboardRelationshipStep = {
  sourceObjectApiName: string;
  targetObjectApiName: string;
  fieldApiName: string;
  direction: 'forward' | 'reverse';
};

function dashboardRelationshipPaths(
  tenant: TenantData,
  sourceObjectApiName: string,
  targetObjectApiName: string,
  maxDepth = 3
): DashboardRelationshipStep[][] {
  if (sourceObjectApiName === targetObjectApiName) return [[]];
  const paths: DashboardRelationshipStep[][] = [];
  const queue: Array<{ objectApiName: string; path: DashboardRelationshipStep[]; visited: Set<string> }> = [
    { objectApiName: sourceObjectApiName, path: [], visited: new Set([sourceObjectApiName]) }
  ];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= maxDepth) continue;
    const object = tenant.objects.find((item) => item.apiName === current.objectApiName);
    if (!object) continue;
    const edges: DashboardRelationshipStep[] = [
      ...object.fields.filter((field) => field.relationship).map((field) => ({
        sourceObjectApiName: object.apiName,
        targetObjectApiName: field.relationship!.targetObject,
        fieldApiName: field.apiName,
        direction: 'forward' as const
      })),
      ...tenant.objects.flatMap((relatedObject) => relatedObject.fields
        .filter((field) => field.relationship?.targetObject === object.apiName)
        .map((field) => ({
          sourceObjectApiName: object.apiName,
          targetObjectApiName: relatedObject.apiName,
          fieldApiName: field.apiName,
          direction: 'reverse' as const
        })))
    ];
    for (const edge of edges) {
      if (current.visited.has(edge.targetObjectApiName)) continue;
      const path = [...current.path, edge];
      if (edge.targetObjectApiName === targetObjectApiName) paths.push(path);
      else queue.push({ objectApiName: edge.targetObjectApiName, path, visited: new Set([...current.visited, edge.targetObjectApiName]) });
    }
  }
  return paths;
}

function resolveDashboardCrossFilters(
  principal: Principal,
  tenant: TenantData,
  sourceObjectApiName: string,
  crossFilters: DashboardFilterMetadata[],
  matchesFilter: (record: RuntimeRecord, filter: DashboardFilterMetadata) => boolean
): DashboardCrossFilterResolution {
  const sourceObject = tenant.objects.find((item) => item.apiName === sourceObjectApiName);
  if (!sourceObject) return { error: `Dashboard object "${sourceObjectApiName}" is unavailable`, status: 400 };
  const groups = new Map<string, DashboardFilterMetadata[]>();
  for (const filter of crossFilters) {
    const targetObject = tenant.objects.find((item) => item.apiName === filter.objectApiName);
    if (!targetObject || !targetObject.fields.some((field) => field.apiName === filter.fieldApiName)) {
      return { error: `Dashboard cross-filter field "${filter.objectApiName}.${filter.fieldApiName}" is unavailable`, status: 400 };
    }
    if (!hasObjectPermission(principal, tenant, filter.objectApiName, 'read')
      || !hasFieldPermission(principal, tenant, filter.objectApiName, filter.fieldApiName, 'read')) {
      return { error: `Missing read permission for dashboard cross-filter "${filter.objectApiName}.${filter.fieldApiName}"`, status: 403 };
    }
    const key = `${filter.objectApiName}\0${filter.fieldApiName}\0${filter.operator}`;
    groups.set(key, [...(groups.get(key) ?? []), filter]);
  }
  const visibleRecordsByObject = new Map<string, RuntimeRecord[]>();
  const visibleRecords = (objectApiName: string) => {
    let records = visibleRecordsByObject.get(objectApiName);
    if (!records) {
      const object = tenant.objects.find((item) => item.apiName === objectApiName);
      records = (tenant.records[objectApiName] ?? []).filter((record) =>
        hasRecordAccess(principal, tenant, objectApiName, record, 'Read'))
        .map((record) => object
          ? calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId))
          : record);
      visibleRecordsByObject.set(objectApiName, records);
    }
    return records;
  };
  for (const objectApiName of new Set([sourceObjectApiName, ...[...groups.values()].map((filters) => filters[0].objectApiName)])) {
    if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) {
      return { error: `Missing read permission for dashboard cross-filter object "${objectApiName}"`, status: 403 };
    }
  }
  const compiledGroups = [...groups.values()].map((filters) => {
    const targetObjectApiName = filters[0].objectApiName;
    const paths = dashboardRelationshipPaths(tenant, sourceObjectApiName, targetObjectApiName);
    const accessiblePaths: DashboardRelationshipStep[][] = [];
    for (const path of paths) {
      let inaccessible: DashboardRelationshipStep | undefined;
      for (const step of path) {
        const fieldObjectApiName = step.direction === 'forward' ? step.sourceObjectApiName : step.targetObjectApiName;
        const field = tenant.objects.find((item) => item.apiName === fieldObjectApiName)?.fields
          .find((item) => item.apiName === step.fieldApiName);
        if (!field || !hasFieldPermission(principal, tenant, fieldObjectApiName, step.fieldApiName, 'read')) {
          inaccessible = step;
          break;
        }
      }
      if (inaccessible) {
        const fieldObjectApiName = inaccessible.direction === 'forward'
          ? inaccessible.sourceObjectApiName : inaccessible.targetObjectApiName;
        return { error: `Missing read permission for relationship field "${fieldObjectApiName}.${inaccessible.fieldApiName}"`, status: 403 as const };
      }
      for (const objectApiName of path.flatMap((step) => [step.sourceObjectApiName, step.targetObjectApiName])) {
        if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) {
          return { error: `Missing read permission for dashboard cross-filter object "${objectApiName}"`, status: 403 as const };
        }
      }
      accessiblePaths.push(path);
    }
    return { filters, targetObjectApiName, paths: accessiblePaths };
  });
  const sourceRecords = visibleRecords(sourceObjectApiName);
  const matchesPath = (record: RuntimeRecord, path: DashboardRelationshipStep[], targetFilters: DashboardFilterMetadata[]) => {
    let currentRecords = [record];
    for (const step of path) {
      if (step.direction === 'forward') {
        const targetIds = new Set(currentRecords.map((item) => String(item[step.fieldApiName] ?? '')).filter(Boolean));
        currentRecords = visibleRecords(step.targetObjectApiName).filter((item) => targetIds.has(item.Id));
      } else {
        const sourceIds = new Set(currentRecords.map((item) => item.Id));
        currentRecords = visibleRecords(step.targetObjectApiName).filter((item) => sourceIds.has(String(item[step.fieldApiName] ?? '')));
      }
      if (!currentRecords.length) return false;
    }
    return currentRecords.some((item) => targetFilters.some((filter) => matchesFilter(item, filter)));
  };
  const recordIds = new Set<string>();
  for (const record of sourceRecords) {
    const matchesAllGroups = compiledGroups.every((group) => {
      if ('error' in group) return false;
      if (group.targetObjectApiName === sourceObjectApiName) {
        return group.filters.some((filter) => matchesFilter(record, filter));
      }
      if (!group.paths.length) return true;
      return group.paths.some((path) => matchesPath(record, path, group.filters));
    });
    if (matchesAllGroups) recordIds.add(record.Id);
  }
  const compiledError = compiledGroups.find((group) => 'error' in group);
  if (compiledError && 'error' in compiledError && typeof compiledError.error === 'string'
    && compiledError.status === 403) {
    return { error: compiledError.error, status: 403 };
  }
  return { recordIds };
}

function scheduledDashboardEmailBody(
  dashboard: DashboardMetadata,
  tenant: TenantData,
  recipient: LocalUser,
  subscription: DashboardSubscription,
  runAt: Date
): { text: string; html: string; snapshot: DashboardSnapshot } {
  const recipientAccess = tenant.accessControl.users.find((user) => user.id === recipient.id);
  if (!recipientAccess || !canAccessDashboard(dashboardForUser(tenant, dashboard, recipient.id), recipient.id, recipientAccess.permissionSetGroupIds, false)) {
    throw new Error(`Recipient "${recipient.email}" no longer has dashboard access.`);
  }
  const principal: Principal = {
    userId: recipient.id,
    tenantId: recipient.tenantId,
    email: recipient.email,
    roles: [recipient.role],
    permissions: effectivePermissions(recipient, tenant)
  };
  const lines = [
    `${dashboard.label} — scheduled dashboard snapshot`,
    `Run time: ${runAt.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}`,
    `Data is evaluated using ${recipient.name}'s current access permissions.`,
    ''
  ];
  const htmlSections: string[] = [];
  const snapshotComponents: DashboardSnapshot['components'] = [];
  const sourceRecordAccess = new Map<string, { objectApiName: string; recordId: string }>();
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!);
  const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const baseSnapshotComponent = (component: DashboardMetadata['components'][number], unavailableReason: string | null = null) => ({
    componentId: component.id,
    title: component.title,
    subtitle: component.subtitle,
    footer: component.footer,
    type: component.type,
    width: component.width,
    height: component.height,
    customHtml: null,
    richTextContent: component.type === 'Rich Text' ? sanitizeDashboardRichText(component.richTextContent) : '',
    imageUrl: component.type === 'Image' ? component.imageUrl : '',
    imageAltText: component.type === 'Image' ? component.imageAltText : '',
    unavailableReason,
    chartType: component.type === 'Chart' ? component.chartType : null,
    chartSortOrder: component.chartSortOrder,
    chartColorPalette: component.chartColorPalette,
    chartLimit: component.chartLimit,
    chartXAxisMinimum: component.chartXAxisMinimum,
    chartXAxisMaximum: component.chartXAxisMaximum,
    chartYAxisMinimum: component.chartYAxisMinimum,
    chartYAxisMaximum: component.chartYAxisMaximum,
    chartValueFormat: component.chartValueFormat,
    chartCurrencyCode: component.chartCurrencyCode,
    chartDecimalPlaces: component.chartDecimalPlaces,
    xAxisFieldApiName: component.xAxisFieldApiName,
    xAxisTitle: component.xAxisTitle,
    yAxisTitle: component.yAxisTitle,
    showGridlines: component.showGridlines,
    legendPosition: component.legendPosition,
    aggregation: component.aggregation,
    gaugeMin: component.gaugeMin,
    gaugeMax: component.gaugeMax,
    gaugeRange1EndPercent: component.gaugeRange1EndPercent,
    gaugeRange2EndPercent: component.gaugeRange2EndPercent,
    showLegend: component.showLegend,
    showValues: component.showValues,
    chartDataLabelPosition: component.chartDataLabelPosition,
    objectApiName: component.objectApiName,
    groupByLabel: null,
    totalRows: 0,
    metricValue: null,
    columns: [],
    buckets: [],
    rows: []
  });
  for (const component of dashboard.components) {
    lines.push(`${component.title} (${component.type})`);
    if (component.type === 'Rich Text') {
      const richTextContent = sanitizeDashboardRichText(component.richTextContent);
      const plainText = sanitizeHtml(richTextContent, { allowedTags: [], allowedAttributes: {} });
      lines.push(plainText, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><div>${richTextContent}</div></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        type: 'Rich Text',
        richTextContent
      });
      continue;
    }
    if (component.type === 'Image') {
      const imageUrl = component.imageUrl;
      lines.push(`${component.imageAltText || 'Image'}${imageUrl ? `: ${imageUrl}` : ''}`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(component.imageAltText)}" style="display:block;max-width:100%;height:auto">` : '<p>Image URL is not configured.</p>'}</section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        type: 'Image',
        imageUrl,
        imageAltText: component.imageAltText
      });
      continue;
    }
    if (component.type === 'Custom') {
      lines.push('Open the dashboard to view this custom component.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Open the dashboard to view this registered custom component.</p></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component, 'Registered custom components are not executed during scheduled runs.'),
        type: 'Custom'
      });
      continue;
    }
    const object = tenant.objects.find((item) => item.apiName === component.objectApiName);
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (!object || (component.reportApiName && !report)
      || (report && (report.objectApiName !== component.objectApiName
        || reportFolderAccessLevelForUser(tenant, report.folderId, recipient.id) === null))
      || !hasObjectPermission(principal, tenant, component.objectApiName, 'read')) {
      lines.push('This component is unavailable under your current access permissions.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Unavailable under your current access permissions.</p></section>`);
      snapshotComponents.push(baseSnapshotComponent(component, 'Unavailable under the recipient current access permissions.'));
      continue;
    }
    const activeDashboardFilters = dashboard.filters.filter((filter) =>
      filter.objectApiName === object.apiName
      && (filter.value.trim() || filter.operator === 'Is Null' || filter.operator === 'Is Not Null'));
    const neededFields = [
      ...(component.aggregation !== 'Count' && component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType !== 'Gauge' && component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
      ...(component.type === 'Chart' && component.chartType === 'Scatter' && component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
      ...(component.type === 'Chart' && component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.type === 'Table' ? component.displayFieldApiNames : []),
      ...(report?.fieldApiNames ?? []),
      ...(report?.groupByFieldApiNames ?? []),
      ...(report?.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : []),
      ...(report?.filters.map((filter) => filter.fieldApiName) ?? []),
      ...activeDashboardFilters.map((filter) => filter.fieldApiName)
    ];
    const unreadableField = neededFields.find((fieldApiName) =>
      !object.fields.some((field) => field.apiName === fieldApiName)
      || !hasFieldPermission(principal, tenant, object.apiName, fieldApiName, 'read'));
    if (unreadableField) {
      lines.push('This component is unavailable under your current field permissions.', '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0;color:#5c5c5c">Unavailable under your current field permissions.</p></section>`);
      snapshotComponents.push(baseSnapshotComponent(component, 'Unavailable under the recipient current field permissions.'));
      continue;
    }
    const records = (tenant.records[object.apiName] ?? []).filter((record) =>
      hasRecordAccess(principal, tenant, object.apiName, record, 'Read'))
      .map((record) => calculateFormulaFields(object, record, formulaContextForUser(tenant, principal.userId)))
      .filter((record) =>
        (report?.filters ?? []).every((filter) => reportFilterMatches(record, filter))
        && matchesDashboardFilters(activeDashboardFilters, dashboard.filterLogic, (filter) => dashboardEmailFilterMatches(record, filter)));
    for (const record of records) {
      sourceRecordAccess.set(`${object.apiName}:${record.Id}`, { objectApiName: object.apiName, recordId: record.Id });
    }
    const aggregateValue = (items: RuntimeRecord[]) => {
      if (component.aggregation === 'Count') return items.length;
      const values = items.map((record) => Number(record[component.measureFieldApiName ?? '']))
        .filter(Number.isFinite);
      if (!values.length) return 0;
      if (component.aggregation === 'Sum') return values.reduce((sum, value) => sum + value, 0);
      if (component.aggregation === 'Average') return values.reduce((sum, value) => sum + value, 0) / values.length;
      return component.aggregation === 'Minimum' ? Math.min(...values) : Math.max(...values);
    };
    if (component.type === 'Metric') {
      const aggregate = aggregateValue(records);
      const value = formatNumber(aggregate);
      lines.push(`Value: ${value}`, `${records.length.toLocaleString()} matching records`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><strong style="display:block;color:#0176d3;font-size:30px">${escapeHtml(value)}</strong><p style="margin:6px 0 0;color:#5c5c5c">${records.length.toLocaleString()} matching records</p></section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        totalRows: records.length,
        metricValue: aggregate
      });
    } else if (component.type === 'Chart') {
      if (component.chartType === 'Gauge') {
        const value = aggregateValue(records);
        lines.push(`Value: ${formatNumber(value)} / ${formatNumber(component.gaugeMin)}-${formatNumber(component.gaugeMax)}`,
          `${records.length.toLocaleString()} matching records`, '');
        const percent = Math.max(0, Math.min(100, (value - component.gaugeMin) / (component.gaugeMax - component.gaugeMin) * 100));
        htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><strong style="font-size:24px">${escapeHtml(formatNumber(value))} / ${escapeHtml(formatNumber(component.gaugeMin))}-${escapeHtml(formatNumber(component.gaugeMax))}</strong><div style="position:relative;height:10px;margin:10px 0;background:linear-gradient(to right,#c23934 0 ${component.gaugeRange1EndPercent}%,#fe9339 ${component.gaugeRange1EndPercent}% ${component.gaugeRange2EndPercent}%,#2e844a ${component.gaugeRange2EndPercent}% 100%);border-radius:6px"><div style="position:absolute;left:calc(${percent}% - 1px);top:-4px;width:2px;height:18px;background:#181818;border:1px solid #fff"></div></div><p style="margin:0;color:#5c5c5c">${records.length.toLocaleString()} matching records</p></section>`);
        snapshotComponents.push({
          ...baseSnapshotComponent(component),
          totalRows: records.length,
          groupByLabel: null,
          buckets: [{ label: component.title, value }]
        });
      } else {
        const groupFieldApiName = component.chartType === 'Scatter'
          ? component.xAxisFieldApiName
          : component.groupByFieldApiName;
        const groups = new Map<string, RuntimeRecord[]>();
        for (const record of records) {
          const label = String(record[groupFieldApiName ?? ''] ?? '—');
          groups.set(label, [...(groups.get(label) ?? []), record]);
        }
        const buckets = [...groups].map(([label, items]) => ({
          label,
          value: aggregateValue(items),
          ...(component.seriesFieldApiName ? {
            series: Object.fromEntries([...new Set(items.map((record) => String(record[component.seriesFieldApiName!] ?? '—')))]
              .map((seriesName) => [seriesName, aggregateValue(items.filter((record) =>
                String(record[component.seriesFieldApiName!] ?? '—') === seriesName))]))
          } : {})
        }))
          .sort((left, right) => component.chartSortOrder === 'Ascending' ? left.value - right.value : right.value - left.value)
          .slice(0, component.chartLimit);
        const maxValue = Math.max(1, ...buckets.map((bucket) => Math.abs(bucket.value)));
        const bucketRows = buckets.map((bucket) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(bucket.label)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatNumber(bucket.value))}</td><td style="width:40% ;padding:6px 8px;border-bottom:1px solid #eee"><div style="height:10px;width:${Math.min(100, Math.abs(bucket.value) / maxValue * 100)}%;background:#0176d3;border-radius:5px"></div></td></tr>`).join('');
        const bucketLines = buckets.map(({ label, value }) => `${label}: ${formatNumber(value)}`);
        lines.push(...(bucketLines.length ? bucketLines : ['No matching records.']), '');
        htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0 0 10px;color:#5c5c5c">${escapeHtml(component.chartType)}${component.groupByFieldApiName ? ` · ${escapeHtml(object.fields.find((field) => field.apiName === component.groupByFieldApiName)?.label ?? component.groupByFieldApiName)}` : ''}</p>${bucketRows ? `<table role="presentation" style="width:100%;border-collapse:collapse">${bucketRows}</table>` : '<p>No matching records.</p>'}</section>`);
        snapshotComponents.push({
          ...baseSnapshotComponent(component),
          totalRows: records.length,
          groupByLabel: groupFieldApiName
            ? object.fields.find((field) => field.apiName === groupFieldApiName)?.label ?? groupFieldApiName
            : null,
          buckets
        });
      }
    } else {
      const columns = component.displayFieldApiNames.flatMap((fieldApiName) => {
        const field = object.fields.find((candidate) => candidate.apiName === fieldApiName);
        return field ? [field] : [];
      });
      const tableRows = records.slice(0, 10).map((record) => `<tr>${columns.map((field) => `<td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(record[field.apiName])}</td>`).join('')}</tr>`).join('');
      lines.push(`${records.length.toLocaleString()} matching records. First ${Math.min(10, records.length)} shown.`, '');
      htmlSections.push(`<section style="background:#fff;border:1px solid #d8dde6;border-radius:8px;padding:16px;margin:12px 0"><h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2><p style="margin:0 0 10px;color:#5c5c5c">${records.length.toLocaleString()} matching records; first ${Math.min(10, records.length)} shown.</p>${tableRows ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>${columns.map((field) => `<th scope="col" style="padding:6px 8px;border-bottom:1px solid #d8dde6;text-align:left">${escapeHtml(field.label)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></div>` : '<p>No matching records.</p>'}</section>`);
      snapshotComponents.push({
        ...baseSnapshotComponent(component),
        totalRows: records.length,
        columns: columns.map((field) => ({ apiName: field.apiName, label: field.label })),
        rows: records.slice(0, 10).map((record) => {
          const readable = sanitizeRecordForRead(principal, tenant, object, record);
          return Object.fromEntries(columns.map((field) => [field.apiName, readable[field.apiName] ?? null]));
        })
      });
    }
  }
  const dashboardUrl = new URL(`/une/setup/dashboard-builder/${encodeURIComponent(dashboard.apiName)}`,
    process.env.WEB_APP_URL ?? 'http://localhost:5174').toString();
  lines.push('Open dashboard:', dashboardUrl);
  const text = lines.join('\n').slice(0, 100_000);
  dashboard.components.forEach((component, index) => {
    const section = htmlSections[index];
    if (!section) return;
    const heading = `<h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(component.title)}</h2>`;
    const subtitle = component.subtitle
      ? `<p style="margin:0 0 10px;color:#5c5c5c">${escapeHtml(component.subtitle)}</p>`
      : '';
    const footer = component.footer
      ? `<p style="margin:10px 0 0;color:#5c5c5c">${escapeHtml(component.footer)}</p>`
      : '';
    htmlSections[index] = section
      .replace(heading, `${heading}${subtitle}`)
      .replace('</section>', `${footer}</section>`);
    if (component.subtitle) lines.push(`Subtitle: ${component.subtitle}`);
    if (component.footer) lines.push(`Footer: ${component.footer}`);
  });
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f3f3;font-family:Arial,sans-serif;color:#181818"><main style="max-width:760px;margin:0 auto"><header style="padding:20px;background:#0176d3;color:#fff;border-radius:8px"><h1 style="margin:0;font-size:22px">${escapeHtml(dashboard.label)}</h1><p style="margin:8px 0 0">Scheduled dashboard snapshot · ${escapeHtml(runAt.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' }))}</p><p style="margin:8px 0 0">Data evaluated with ${escapeHtml(recipient.name)}'s current permissions.</p></header>${htmlSections.join('')}<p style="margin:20px 0;text-align:center"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#0176d3;color:#fff;text-decoration:none;border-radius:5px">Open dashboard</a></p></main></body></html>`;
  const snapshot = dashboardSnapshotSchema.parse({
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    label: `${subscription.label.slice(0, 45)} · ${runAt.toISOString()}`,
    createdAt: runAt.toISOString(),
    createdBy: recipient.id,
    runningUserId: recipient.id,
    subscriptionId: subscription.id,
    filters: dashboard.filters,
    sourceRecordAccess: [...sourceRecordAccess.values()],
    components: snapshotComponents
  });
  return { text, html: html.slice(0, 100_000), snapshot };
}

const dashboardSubscriptionDispatches = new Set<string>();
async function dispatchDashboardSubscription(tenantId: string, subscriptionId: string, manual = false): Promise<void> {
  const key = `${tenantId}:${subscriptionId}`;
  if (dashboardSubscriptionDispatches.has(key)) throw new Error('This dashboard subscription is already being delivered.');
  dashboardSubscriptionDispatches.add(key);
  try {
    const tenant = tenantData(tenantId);
    const subscription = tenant?.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (!tenant || !subscription || (!manual && !subscription.active)) return;
    const runAt = new Date();
    if (!manual && Date.parse(subscription.nextRunAt) > runAt.getTime()) return;
    const dashboard = tenant.dashboards.find((item) => item.apiName === subscription.dashboardApiName && item.status === 'Deployed');
    const creator = state.users.find((item) => item.id === subscription.createdBy && item.tenantId === tenantId && !item.disabled);
    if (!dashboard) throw new Error('The subscribed dashboard is no longer deployed.');
    if (!creator || !effectivePermissions(creator, tenant).includes('email:send')) {
      throw new Error('The subscription owner is no longer active or lacks email:send permission.');
    }
    const failures: string[] = [];
    for (const userId of subscription.recipientUserIds) {
      const recipient = state.users.find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
      if (!recipient) {
        failures.push('A scheduled recipient is no longer active.');
        continue;
      }
      try {
        const body = scheduledDashboardEmailBody(dashboard, tenant, recipient, subscription, runAt);
        if (subscription.saveSnapshots) {
          const snapshotTenant = tenantData(tenantId);
          if (!snapshotTenant) throw new Error('The tenant is no longer available for scheduled snapshot storage.');
          const recipientSnapshots = [
            ...snapshotTenant.dashboardSnapshots.filter((snapshot) =>
              snapshot.subscriptionId === subscription.id && snapshot.createdBy === recipient.id),
            body.snapshot
          ].slice(-30);
          const retainedIds = new Set(recipientSnapshots.map((snapshot) => snapshot.id));
          persistTenantRecords(tenantId, {
            ...snapshotTenant,
            dashboardSnapshots: [
              ...snapshotTenant.dashboardSnapshots.filter((snapshot) =>
                snapshot.subscriptionId !== subscription.id || snapshot.createdBy !== recipient.id),
              ...recipientSnapshots.filter((snapshot) => retainedIds.has(snapshot.id))
            ]
          });
        }
        await sendTenantEmail(
          tenantId,
          tenant,
          subscription.namedCredentialId,
          subscription.fromEmail,
          [recipient.email],
          `${dashboard.label} — scheduled dashboard`,
          body.text,
          body.html
        );
      } catch (error) {
        failures.push(`${recipient.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const currentTenant = tenantData(tenantId);
    if (!currentTenant) return;
    const latest = currentTenant.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (!latest) return;
    const lastRunAt = runAt.toISOString();
    const failed = failures.length > 0;
    const updated: DashboardSubscription = {
      ...latest,
      ...(manual ? {} : { nextRunAt: nextDashboardSubscriptionRunAt(latest, runAt) }),
      lastRunAt,
      lastRunStatus: failed ? 'Failed' : 'Success',
      lastRunError: failed ? failures.join('; ').slice(0, 500) : null,
      updatedAt: lastRunAt
    };
    persistTenantRecords(tenantId, {
      ...currentTenant,
      dashboardSubscriptions: currentTenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? updated : item)
    });
  } catch (error) {
    const tenant = tenantData(tenantId);
    const subscription = tenant?.dashboardSubscriptions.find((item) => item.id === subscriptionId);
    if (tenant && subscription) {
      const now = new Date().toISOString();
      persistTenantRecords(tenantId, {
        ...tenant,
        dashboardSubscriptions: tenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? {
          ...item,
          ...(manual ? {} : { nextRunAt: nextDashboardSubscriptionRunAt(item, new Date(now)) }),
          lastRunAt: now,
          lastRunStatus: 'Failed',
          lastRunError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          updatedAt: now
        } : item)
      });
    }
    if (manual) throw error;
    console.error(`Dashboard subscription "${subscriptionId}" failed for tenant "${tenantId}": ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dashboardSubscriptionDispatches.delete(key);
  }
}

let scheduledDispatchRunning = false;
async function dispatchScheduledFlows(): Promise<void> {
  if (scheduledDispatchRunning) return;
  scheduledDispatchRunning = true;
  try {
    await deliverPendingPlatformEvents();
    await executeDueScheduledFlows();
    const now = Date.now();
    const dueSubscriptions = Object.entries(state.tenants).flatMap(([tenantId, tenant]) =>
      tenant.dashboardSubscriptions.filter((subscription) =>
        subscription.active && Date.parse(subscription.nextRunAt) <= now)
        .map((subscription) => ({ tenantId, subscriptionId: subscription.id })));
    for (const due of dueSubscriptions) {
      await dispatchDashboardSubscription(due.tenantId, due.subscriptionId);
    }
  } finally {
    scheduledDispatchRunning = false;
  }
}

// Serve the production React SPA from the same origin as the API.
const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(resolve(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    if (!req.accepts('html')) return next();
    return res.sendFile(resolve(frontendDist, 'index.html'));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Platform API request failed', error);
  return res.status(500).json({ error: 'Platform API request failed' });
});

app.listen(port, () => {
  console.log(`MetaDrive API listening on http://localhost:${port} (JWT issuer: ${jwtService.config.issuer})`);
  void dispatchScheduledFlows().catch((error: unknown) => console.error('Scheduled flow dispatcher failed', error));
  setInterval(() => {
    void dispatchScheduledFlows().catch((error: unknown) => console.error('Scheduled flow dispatcher failed', error));
  }, schedulePollInterval);
});
