import { z } from 'zod';

/** Shared Core records, sharing, audit, approvals, and currency SQL metadata schemas. */
export const fieldHistoryEntrySchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  fieldApiName: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  changedBy: z.string().min(1),
  changedAt: z.string().datetime()
});
export type FieldHistoryEntry = z.infer<typeof fieldHistoryEntrySchema>;
export const advancedRestrictionConditionSchema = z.object({
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  operator: z.enum(['eq', 'ne', 'in', 'notIn', 'isNull', 'notNull']),
  value: z.unknown().optional()
});
export const advancedRestrictionRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  tenantId: z.string().min(1),
  objectApiName: z.string().min(1),
  enabled: z.boolean(),
  subjectType: z.enum(['all', 'user', 'role', 'external']),
  subjectId: z.string().optional(),
  conditionLogic: z.enum(['all', 'any']),
  conditions: z.array(advancedRestrictionConditionSchema).min(1).max(16)
});
export const sharingSettingSchema = z.object({
  defaultAccess: z.enum(['Private', 'Public Read Only', 'Public Read/Write']),
  grantAccessUsingHierarchies: z.boolean().default(true),
  restrictionRules: z.array(advancedRestrictionRuleSchema).max(100).optional(),
  portalEnabled: z.boolean().optional(),
  portalAccountField: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional()
});
export const currencySettingsSchema = z.object({
  corporateCurrency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  standardVatRate: z.number().finite().min(0).max(100).default(20),
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
export type CurrencySettings = z.infer<typeof currencySettingsSchema>;
export const recordShareSchema = z.object({
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
export type SharingSetting = z.infer<typeof sharingSettingSchema>;
export type RecordShare = z.infer<typeof recordShareSchema>;
export const campaignMemberSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  status: z.enum(['Sent', 'Responded']),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
});
export type CampaignMember = z.infer<typeof campaignMemberSchema>;
export const recordActivitySchema = z.object({
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
export type RecordActivity = z.infer<typeof recordActivitySchema>;
export const chatterCommentSchema = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime()
});
export const chatterPostSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  createdBy: z.string().min(1),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime(),
  comments: z.array(chatterCommentSchema).default([])
});
export type ChatterPost = z.infer<typeof chatterPostSchema>;
export const customNotificationSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  flowApiName: z.string().min(1),
  sentBy: z.string().min(1),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable().default(null)
});
export type CustomNotification = z.infer<typeof customNotificationSchema>;
export const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  objectApiName: z.string().min(1),
  recordId: z.string().min(1),
  flowApiName: z.string().min(1),
  processApiName: z.string().nullable().default(null),
  orchestrationInterviewId: z.string().uuid().nullable().default(null),
  approvalMode: z.enum(['ANY', 'ALL']).default('ANY'),
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
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export const approvalProcessShapeSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  objectApiName: z.string().min(1),
  approverUserIds: z.array(z.string().min(1)).min(1),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export const approvalProcessSchema = approvalProcessShapeSchema.superRefine((process, context) => {
  if (new Set(process.approverUserIds).size !== process.approverUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approverUserIds'], message: 'Approvers must be unique' });
  }
});
export const approvalProcessRequestSchema = approvalProcessShapeSchema.omit({
  createdAt: true,
  updatedAt: true
}).strict().superRefine((process, context) => {
  if (new Set(process.approverUserIds).size !== process.approverUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approverUserIds'], message: 'Approvers must be unique' });
  }
});
export type ApprovalProcess = z.infer<typeof approvalProcessSchema>;
export const approvalDecisionSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  comments: z.string().max(2000).default('')
}).strict();
