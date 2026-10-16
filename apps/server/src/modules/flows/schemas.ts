import { z } from 'zod';

/** Flow Builder + execution metadata schema registry, strongly typed to Core records. */
export function createFlowSchemas<R extends z.ZodTypeAny>(runtimeRecordSchema: R) {
const flowElementSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.unknown()).default({})
});
const flowConnectorSchema = z.object({
  id: z.string().min(1),
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  label: z.string().default(''),
  kind: z.enum(['normal', 'fault', 'scheduled', 'async']).default('normal'),
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
// Declarative, version-safe Flow Test cases. Tests never run during normal
// record processing; authoring and explicit debug/run-tests actions are isolated.
const flowTestCaseSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  input: z.record(z.unknown()).default({}),
  event: z.enum(['created', 'updated', 'deleted']).optional(),
  record: z.record(z.unknown()).optional(),
  prior: z.record(z.unknown()).nullable().optional(),
  isClone: z.boolean().default(false),
  expectedStatus: z.enum(['completed', 'waiting', 'skipped']).default('completed'),
  expectedOutputs: z.record(z.unknown()).default({})
}).strict();
const flowVersionSchema = z.object({
  versionNumber: z.number().int().positive(),
  status: z.enum(['Draft', 'Active', 'Obsolete']),
  savedAt: z.string().datetime(),
  label: z.string().optional(),
  description: z.string().optional(),
  flowType: z.enum(['Screen Flow', 'Record-Triggered Flow', 'Autolaunched Flow', 'Flow Orchestration', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow']).optional(),
  triggerObject: z.string().nullable().optional(),
  startConfig: z.record(z.unknown()).optional(),
  elements: z.array(flowElementSchema),
  connectors: z.array(flowConnectorSchema),
  resources: z.array(flowResourceSchema),
  tests: z.array(flowTestCaseSchema).max(100).optional()
});
const flowSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
  lastModifiedAt: z.string().optional(),
  lastModifiedBy: z.string().optional(),
  flowType: z.enum(['Screen Flow', 'Record-Triggered Flow', 'Autolaunched Flow', 'Flow Orchestration', 'Schedule-Triggered Flow', 'Platform Event-Triggered Flow']),
  status: z.enum(['Draft', 'Active']),
  versionNumber: z.number().int().positive(),
  activeVersion: z.number().int().positive().nullable(),
  triggerObject: z.string().nullable(),
  startConfig: z.record(z.unknown()),
  elements: z.array(flowElementSchema).min(1),
  connectors: z.array(flowConnectorSchema),
  resources: z.array(flowResourceSchema),
  versions: z.array(flowVersionSchema),
  tests: z.array(flowTestCaseSchema).max(100).optional()
}).superRefine((flow, context) => {
  if (flow.tests && new Set(flow.tests.map((item) => item.id)).size !== flow.tests.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests'], message: 'Flow Test IDs must be unique' });
  }
  if (flow.tests) {
    flow.tests.forEach((item, index) => {
      if (flow.flowType === 'Record-Triggered Flow') {
        if (!item.event || !item.record) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests', index], message: 'Record-triggered tests require an event and record sample' });
        }
      } else if (item.event || item.record || item.prior) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests', index], message: 'Only record-triggered Flow tests can contain record/trigger fixtures' });
      }
    });
  }
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
  kind: z.enum(['screen', 'wait', 'scheduled', 'async', 'orchestration']),
  // Persist record-trigger formula context across process restarts and version changes.
  recordEvent: z.enum(['created', 'updated', 'deleted']).nullable().default(null),
  isClone: z.boolean().default(false),
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
const automationSettingsSchema = z.object({
  autoRetryFailedFlows: z.boolean().default(false),
  maxRetryAttempts: z.number().int().min(1).max(20).default(10),
  conversationIdleMinutes: z.number().int().min(1).max(1440).default(15)
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
  trigger: z.enum(['Manual', 'Scheduled', 'Record-Triggered', 'Platform Event', 'Scheduled Path', 'Async Path', 'Wait Interview']),
  failedAt: z.string().datetime(),
  error: z.string(),
  userId: z.string().nullable()
});

 return { flowElementSchema, flowConnectorSchema, flowResourceSchema, flowTestCaseSchema, flowVersionSchema, flowSchema, flowInterviewSchema, automationSettingsSchema, scheduleRetrySchema, flowExecutionLogSchema };
}
