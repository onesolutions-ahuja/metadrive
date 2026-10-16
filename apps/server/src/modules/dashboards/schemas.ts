import { sharedTimeZoneSchema as dashboardTimeZoneSchema } from '../../core/time-zone-schema.js';
import { z } from 'zod';

export const dashboardComponentSchema = z.object({
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
export const dashboardFilterSchema = z.object({
  id: z.string().min(1),
  objectApiName: z.string().min(1),
  fieldApiName: z.string().min(1),
  operator: z.enum(['Equals', 'Not Equal To', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Includes', 'Excludes', 'Is Null', 'Is Not Null']),
  value: z.string().max(500)
});

export const dashboardFolderShareSchema = z.object({
  targetType: z.enum(['User', 'PublicGroup', 'PermissionSetGroup', 'Role', 'RoleAndSubordinates', 'Territory']),
  targetId: z.string().min(1),
  accessLevel: z.enum(['Viewer', 'Editor', 'Manager'])
});
export const dashboardFolderSchema = z.object({
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
export type DashboardFolder = z.infer<typeof dashboardFolderSchema>;

export const dashboardTerritorySchema = z.object({
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
export type DashboardTerritory = z.infer<typeof dashboardTerritorySchema>;
export const dashboardSchema = z.object({
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
export const dashboardSnapshotComponentSchema = z.object({
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
export const dashboardSnapshotSchema = z.object({
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
export { dashboardTimeZoneSchema };
export const dashboardSubscriptionSchema = z.object({
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

export type DashboardMetadata = z.infer<typeof dashboardSchema>;
export type DashboardFilterMetadata = z.infer<typeof dashboardFilterSchema>;
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type DashboardSubscription = z.infer<typeof dashboardSubscriptionSchema>;
