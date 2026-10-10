import {
  BarChart3,
  Building2,
  Database,
  FileText,
  LayoutTemplate,
  Puzzle,
  Store,
  ShieldCheck,
  Workflow,
  type LucideIcon
} from 'lucide-react';

export type WorkspaceId =
  | 'home'
  | 'object-manager'
  | 'page-builder'
  | 'dashboard-builder'
  | 'report-builder'
  | 'flow-builder'
  | 'flow-interviews'
  | 'scheduled-flows'
  | 'flow-logs'
  | 'approval-processes'
  | 'component-library'
  | 'app-manager'
  | 'app-exchange'
  | 'connector-settings'
  | 'named-credentials'
  | 'company-settings'
  | 'rbac';

export type FieldMetadata = {
  apiName: string;
  label: string;
  dataType: string;
  required: boolean;
  unique: boolean;
  externalId?: boolean;
  caseSensitive?: boolean;
  description?: string;
  helpText?: string;
  picklistValues?: string[];
  picklistRestricted?: boolean;
  controllerFieldApiName?: string;
  valueSettings?: Record<string, string[]>;
  trackHistory?: boolean;
  defaultValue?: string | number | boolean;
  formula?: { expression: string; returnType: string };
  relationship?: {
    type: 'Lookup' | 'Master-Detail' | 'Hierarchical';
    targetObject: string;
    relationshipName: string;
    childRelationshipName: string;
    deleteBehavior?: 'Clear' | 'Restrict';
    allowReparenting?: boolean;
  };
};

export type PageLayoutSectionMetadata = {
  id: string;
  label: string;
  columns: 1 | 2;
  fieldApiNames: string[];
};

export type PageLayoutCustomLinkMetadata = {
  id: string;
  label: string;
  url: string;
  openInNewWindow: boolean;
};

export type PageLayoutMetadata = {
  id: string;
  label: string;
  sections: PageLayoutSectionMetadata[];
  relatedLists: string[];
  actions: string[];
  customLinks?: PageLayoutCustomLinkMetadata[];
};

export type PageLayoutAssignmentMetadata = {
  profileId: string;
  recordTypeId: string;
  pageLayoutId: string;
};

export type CompactLayoutMetadata = {
  id: string;
  label: string;
  fieldApiNames: string[];
};

export type CompactLayoutAssignmentMetadata = {
  profileId: string;
  recordTypeId: string;
  compactLayoutId: string;
};

export type RecordTypeMetadata = {
  id: string;
  label: string;
  developerName: string;
  description?: string;
  active: boolean;
  isDefault: boolean;
  picklistValues?: Record<string, string[]>;
};

export type FieldSetMetadata = {
  apiName: string;
  label: string;
  fieldApiNames: string[];
};

export type RelatedLookupFilterMetadata = {
  id: string;
  fieldApiName: string;
  relatedObject: string;
  relatedFieldApiName: string;
  operator: 'Equals' | 'Not Equal To' | 'Contains' | 'Starts With' | 'Greater Than' | 'Less Than' | 'Is Null' | 'Is Not Null';
  value: string;
  valueFieldApiName?: string;
  required: boolean;
};

export type ObjectActionMetadata = {
  id: string;
  label: string;
  type: 'Standard' | 'Custom';
  enabled: boolean;
  behavior?: 'Set Field Value';
  fieldApiName?: string;
  value?: string;
};

export type ObjectSettingsMetadata = {
  allowReports: boolean;
  allowActivities: boolean;
  trackFieldHistory: boolean;
  allowInChatter: boolean;
  deploymentStatus: 'In Development' | 'Deployed';
  recordNameType: 'Text' | 'Auto Number';
  recordNameFormat: string;
};

export type ObjectMetadata = {
  apiName: string;
  label: string;
  pluralLabel: string;
  kind: 'Standard Object' | 'Custom Object';
  description: string;
  fields: FieldMetadata[];
  pageLayouts?: PageLayoutMetadata[];
  pageLayoutAssignments?: PageLayoutAssignmentMetadata[];
  recordTypes?: RecordTypeMetadata[];
  compactLayouts?: CompactLayoutMetadata[];
  compactLayoutAssignments?: CompactLayoutAssignmentMetadata[];
  compactLayout?: { label: string; fieldApiNames: string[] };
  fieldSets?: FieldSetMetadata[];
  searchLayouts?: {
    searchResults?: string[];
    lookupDialog?: string[];
    lookupPhoneDialog?: string[];
  };
  relatedLookupFilters?: RelatedLookupFilterMetadata[];
  relatedLookupFilterLogic?: Record<string, 'All' | 'Any'>;
  listViewButtons?: string[];
  actions?: ObjectActionMetadata[];
  customTab?: { style: 'Blue' | 'Green' | 'Orange' | 'Purple' | 'Red' | 'Teal' | 'Yellow' };
  settings?: ObjectSettingsMetadata;
};

export type FlowElementMetadata = {
  id: number;
  type: string;
  label: string;
  config: Record<string, unknown>;
};

export type NamedCredentialMetadata = {
  id: string;
  name: string;
  label: string;
  protocol: 'HTTPS' | 'SMTP';
  baseUrl: string;
  authType: 'None' | 'Bearer' | 'Basic' | 'API Key';
  headerName: string;
  hasSecret: boolean;
  keyId: string;
  updatedAt: string;
};

export type EmailAlertMetadata = {
  id: string;
  name: string;
  label: string;
  objectApiName: string;
  namedCredentialId: string;
  fromEmail: string;
  recipients: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomNotificationMetadata = {
  id: string;
  recipientId: string;
  title: string;
  body: string;
  flowApiName: string;
  sentBy: string;
  createdAt: string;
  readAt: string | null;
};

export type ApprovalRequestMetadata = {
  id: string;
  groupId: string;
  objectApiName: string;
  objectLabel: string;
  recordId: string;
  recordName: string;
  flowApiName: string;
  submittedBy: string;
  submittedByName: string;
  approverId: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Canceled';
  comments: string;
  decisionComments: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

export type ApprovalProcessMetadata = {
  apiName: string;
  label: string;
  objectApiName: string;
  approverUserIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalProcessInput = Omit<ApprovalProcessMetadata, 'createdAt' | 'updatedAt'>;

export type FlowConnectorMetadata = {
  id: string;
  from: number;
  to: number;
  label: string;
  kind: 'normal' | 'fault' | 'scheduled';
  scheduledPath?: {
    timeSourceFieldApiName: string;
    offsetAmount: number;
    offsetUnit: 'Minutes' | 'Hours' | 'Days';
  };
};

export type FlowResourceMetadata = {
  name: string;
  label: string;
  type: 'Variable' | 'Record' | 'Record Collection' | 'Formula' | 'Constant' | 'Choice' | 'Text Template';
  dataType: string;
  isCollection: boolean;
  availableForInput: boolean;
  availableForOutput: boolean;
  value?: unknown;
};

export type FlowVersionMetadata = {
  versionNumber: number;
  status: 'Draft' | 'Active' | 'Obsolete';
  savedAt: string;
  label?: string;
  description?: string;
  flowType?: 'Record-Triggered Flow' | 'Screen Flow' | 'Autolaunched Flow' | 'Schedule-Triggered Flow' | 'Platform Event-Triggered Flow';
  triggerObject?: string | null;
  startConfig?: Record<string, unknown>;
  elements: FlowElementMetadata[];
  connectors: FlowConnectorMetadata[];
  resources: FlowResourceMetadata[];
};

export type FlowValidationMetadata = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type FlowExecutionLogMetadata = {
  id: string;
  flowApiName: string;
  flowLabel: string;
  trigger: 'Manual' | 'Scheduled' | 'Record-Triggered' | 'Scheduled Path' | 'Wait Interview';
  failedAt: string;
  error: string;
  userId: string | null;
};

export type FlowInterviewMetadata = {
  id: string;
  flowApiName: string;
  flowLabel: string;
  versionNumber: number;
  kind: 'screen' | 'wait' | 'scheduled';
  userId: string;
  userName: string;
  screenLabel: string | null;
  recordId: string | null;
  createdAt: string;
  expiresAt: string;
  waitUntil: string | null;
  retryAt: string | null;
  attempts: number;
};

export type FlowDefinitionMetadata = {
  apiName: string;
  label: string;
  description?: string;
  flowType: 'Record-Triggered Flow' | 'Screen Flow' | 'Autolaunched Flow' | 'Schedule-Triggered Flow' | 'Platform Event-Triggered Flow';
  status: 'Draft' | 'Active';
  versionNumber: number;
  activeVersion: number | null;
  triggerObject: string | null;
  startConfig: Record<string, unknown>;
  elements: FlowElementMetadata[];
  connectors: FlowConnectorMetadata[];
  resources: FlowResourceMetadata[];
  versions: FlowVersionMetadata[];
};

export type PlatformEventMetadata = {
  apiName: string;
  label: string;
  description: string;
  fields: FieldMetadata[];
};

export type PageComponentMetadata = {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  visible: boolean;
  region?: 'header' | 'main' | 'sidebar';
  position?: { x: number; y: number; width: number; height: number };
};

export type LightningPageTemplate =
  | 'one-region'
  | 'header-main'
  | 'main-sidebar'
  | 'header-main-sidebar';

export type LightningPageMetadata = {
  apiName: string;
  label: string;
  updatedAt?: string;
  targetObject: string;
  pageType: 'Record Page' | 'App Page' | 'Home Page';
  layoutMode: 'template' | 'free-canvas';
  template?: LightningPageTemplate;
  canvasWidth: number;
  canvasHeight: number;
  status: 'Draft' | 'Active';
  devices: Array<'Desktop' | 'Phone'>;
  components: PageComponentMetadata[];
  activationAssignments?: PageActivationAssignmentMetadata[];
};

export type DashboardComponentMetadata = {
  id: string;
  title: string;
  subtitle?: string;
  footer?: string;
  type: 'Metric' | 'Chart' | 'Table' | 'Rich Text' | 'Image' | 'Custom';
  customComponentApiName?: string;
  reportApiName?: string;
  properties?: Record<string, unknown>;
  richTextContent?: string;
  imageUrl?: string;
  imageAltText?: string;
  objectApiName: string;
  width?: 'Quarter' | 'Half' | 'ThreeQuarter' | 'Full';
  height?: 'Short' | 'Medium' | 'Tall';
  aggregation: 'Count' | 'Sum' | 'Average' | 'Minimum' | 'Maximum';
  measureFieldApiName: string | null;
  groupByFieldApiName: string | null;
  seriesFieldApiName?: string | null;
  gaugeMin?: number;
  gaugeMax?: number;
  gaugeRange1EndPercent?: number;
  gaugeRange2EndPercent?: number;
  showLegend?: boolean;
  showValues?: boolean;
  chartDataLabelPosition?: 'Auto' | 'Inside' | 'Outside';
  chartSortOrder?: 'Ascending' | 'Descending';
  chartColorPalette?: 'Salesforce' | 'Colorblind Safe' | 'Monochrome';
  chartLimit?: number;
  chartXAxisMinimum?: number | null;
  chartXAxisMaximum?: number | null;
  chartYAxisMinimum?: number | null;
  chartYAxisMaximum?: number | null;
  chartValueFormat?: 'Number' | 'Currency' | 'Percent';
  chartCurrencyCode?: string;
  chartDecimalPlaces?: number;
  xAxisFieldApiName?: string | null;
  xAxisTitle?: string;
  yAxisTitle?: string;
  showGridlines?: boolean;
  legendPosition?: 'Bottom' | 'Right' | 'Top';
  chartType: 'Bar' | 'Column' | 'Horizontal Bar' | 'Stacked Bar' | 'Stacked Column' | '100% Stacked Bar' | '100% Stacked Column' | 'Line' | 'Area' | 'Scatter' | 'Donut' | 'Pie' | 'Funnel' | 'Gauge';
  displayFieldApiNames: string[];
};

export type DashboardFilterMetadata = {
  id: string;
  objectApiName: string;
  fieldApiName: string;
  operator: 'Equals' | 'Not Equal To' | 'Contains' | 'Starts With' | 'Greater Than' | 'Less Than' | 'Includes' | 'Excludes' | 'Is Null' | 'Is Not Null';
  value: string;
};

export type DashboardMetadata = {
  apiName: string;
  label: string;
  description: string;
  folderName: string;
  folderId?: string | null;
  folderAccessLevel?: 'Viewer' | 'Editor' | 'Manager' | null;
  ownerUserId: string;
  runningUserId?: string | null;
  allowViewerToSelectRunningUser?: boolean;
  visibility: 'Private' | 'All Users';
  sharedUserIds: string[];
  sharedPermissionSetGroupIds: string[];
  filterLogic: 'All' | 'Any';
  status: 'Draft' | 'Deployed';
  components: DashboardComponentMetadata[];
  filters: DashboardFilterMetadata[];
  refreshIntervalMinutes?: 0 | 1 | 5 | 15 | 60;
};

export type DashboardFolderShareMetadata = {
  targetType: 'User' | 'PublicGroup' | 'PermissionSetGroup' | 'Role' | 'RoleAndSubordinates' | 'Territory';
  targetId: string;
  accessLevel: 'Viewer' | 'Editor' | 'Manager';
};

export type DashboardTerritoryMetadata = {
  id: string;
  label: string;
  parentTerritoryId: string | null;
  userIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type DashboardFolderMetadata = {
  id: string;
  label: string;
  parentFolderId: string | null;
  ownerUserId: string;
  shares: DashboardFolderShareMetadata[];
  createdAt: string;
  updatedAt: string;
  accessLevel?: 'Viewer' | 'Editor' | 'Manager' | null;
};

export type DashboardFolderInput = Pick<DashboardFolderMetadata, 'label' | 'parentFolderId' | 'shares'>;

export type DashboardSnapshot = {
  id: string;
  dashboardApiName: string;
  label: string;
  createdAt: string;
  createdBy: string;
  runningUserId?: string;
  subscriptionId?: string;
  filters: DashboardFilterMetadata[];
  crossFilter?: DashboardFilterMetadata;
  crossFilters?: DashboardFilterMetadata[];
  components: Array<{
    componentId: string;
    title: string;
    subtitle?: string;
    footer?: string;
    type: 'Metric' | 'Chart' | 'Table' | 'Rich Text' | 'Image' | 'Custom';
    width?: DashboardComponentMetadata['width'];
    height?: DashboardComponentMetadata['height'];
    customHtml?: string | null;
    richTextContent?: string;
    imageUrl?: string;
    imageAltText?: string;
    unavailableReason?: string | null;
    chartType: DashboardComponentMetadata['chartType'] | null;
    chartSortOrder: 'Ascending' | 'Descending';
    chartColorPalette?: 'Salesforce' | 'Colorblind Safe' | 'Monochrome';
    chartLimit: number;
    chartXAxisMinimum?: number | null;
    chartXAxisMaximum?: number | null;
    chartYAxisMinimum?: number | null;
    chartYAxisMaximum?: number | null;
    chartValueFormat?: 'Number' | 'Currency' | 'Percent';
    chartCurrencyCode?: string;
    chartDecimalPlaces?: number;
    xAxisFieldApiName?: string | null;
    xAxisTitle?: string;
    yAxisTitle?: string;
    showGridlines?: boolean;
    legendPosition?: 'Bottom' | 'Right' | 'Top';
    aggregation: DashboardComponentMetadata['aggregation'];
    gaugeMin: number;
    gaugeMax: number;
    gaugeRange1EndPercent: number;
    gaugeRange2EndPercent: number;
    showLegend: boolean;
    showValues: boolean;
    chartDataLabelPosition?: 'Auto' | 'Inside' | 'Outside';
    objectApiName: string;
    groupByLabel: string | null;
    totalRows: number;
    metricValue: number | null;
    columns: Array<{ apiName: string; label: string }>;
    buckets: Array<{ label: string; value: number; series?: Record<string, number> }>;
    rows: Array<Record<string, unknown>>;
  }>;
};

export type DashboardSubscriptionInput = {
  label: string;
  frequency: 'Daily' | 'Weekly';
  localTime: string;
  timeZone: string;
  dayOfWeek: number | null;
  recipientUserIds: string[];
  namedCredentialId: string;
  fromEmail: string;
  active: boolean;
  saveSnapshots: boolean;
};

export type DashboardSubscription = DashboardSubscriptionInput & {
  id: string;
  dashboardApiName: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunStatus: 'Never' | 'Success' | 'Failed';
  lastRunError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportFilterMetadata = {
  id: string;
  fieldApiName: string;
  operator: DashboardFilterMetadata['operator'] | 'Does Not Contain' | 'Greater Than or Equal To' | 'Less Than or Equal To' | 'Includes' | 'Excludes';
  value: string;
  values: string[];
  locked: boolean;
};

export type ReportCrossFilterMetadata = {
  id: string;
  childObjectApiName: string;
  mode: 'With' | 'Without';
  filters: ReportFilterMetadata[];
};

export type ReportDateRange =
  | 'All Time'
  | 'Today'
  | 'Yesterday'
  | 'Last 7 Days'
  | 'Next 7 Days'
  | 'Next 30 Days'
  | 'This Week'
  | 'Last Week'
  | 'This Month'
  | 'Last Month'
  | 'This Quarter'
  | 'Last Quarter'
  | 'This Year'
  | 'Last Year';

export type ReportStandardFiltersMetadata = {
  showMe: 'All' | 'My';
  dateFieldApiName: string | null;
  dateRange: ReportDateRange;
  statusFieldApiName: string | null;
  statusSelection: string;
};

export type ReportRowLimitMetadata = {
  limit: number | null;
  sortFieldApiName: string | null;
  sortDirection: 'Ascending' | 'Descending';
};

export type ReportSummaryOperation = 'Count' | 'Sum' | 'Average' | 'Minimum' | 'Maximum';
export type ReportDateGrouping = 'Day' | 'Month' | 'Quarter' | 'Year';
export type ReportBucketRangeMetadata = {
  label: string;
  lowerBound: number | null;
  upperBound: number | null;
};
export type ReportBucketMetadata = {
  apiName: string;
  label: string;
  fieldApiName: string;
  ranges: ReportBucketRangeMetadata[];
  treatBlanksAsZero: boolean;
};

export type ReportMetadata = {
  reportType: 'Standard';
  apiName: string;
  label: string;
  description: string;
  objectApiName: string;
  fieldApiNames: string[];
  groupByFieldApiNames: string[];
  filterLogic: string;
  format: 'Tabular' | 'Summary' | 'Matrix';
  columnGroupByFieldApiName?: string | null;
  sortFieldApiName?: string | null;
  sortDirection?: 'Ascending' | 'Descending';
  filters: ReportFilterMetadata[];
  standardFilters: ReportStandardFiltersMetadata;
  crossFilters: ReportCrossFilterMetadata[];
  rowLimit: ReportRowLimitMetadata;
  summaryOperations: Record<string, ReportSummaryOperation[]>;
  dateGroupings: Record<string, ReportDateGrouping>;
  bucketFields?: ReportBucketMetadata[];
  showDetails: boolean;
  showChart: boolean;
  folderName: string;
  folderId: string | null;
};

export type ReportFolderMetadata = DashboardFolderMetadata & {
  visibility: 'Private' | 'All Users';
  accessLevel: 'Viewer' | 'Editor' | 'Manager' | null;
};
export type ReportFolderInput = Pick<ReportFolderMetadata, 'label' | 'parentFolderId' | 'shares' | 'visibility'>;

export type ReportRunMetadata = {
  report: ReportMetadata;
  rows: Array<Record<string, unknown>>;
  summaryRows: Array<{
    groupValues: Record<string, unknown>;
    rowCount: number;
    sums: Record<string, number>;
    counts: Record<string, number>;
    minimums: Record<string, number>;
    maximums: Record<string, number>;
  }>;
  subtotalRows: Array<{
    groupValues: Record<string, unknown>;
    groupLevel: number;
    rowCount: number;
    sums: Record<string, number>;
    counts: Record<string, number>;
    minimums: Record<string, number>;
    maximums: Record<string, number>;
  }>;
  summaryTotals: {
    rowCount: number;
    sums: Record<string, number>;
    counts: Record<string, number>;
    minimums: Record<string, number>;
    maximums: Record<string, number>;
  };
  totalRows: number;
  offset: number;
  pageSize: number;
  truncated: boolean;
  generatedAt: string;
};

export type LibraryComponentMetadata = {
  apiName: string;
  label: string;
  description: string;
  surfaces: Array<'page' | 'dashboard' | 'flow'>;
  resize?: {
    defaultWidth: number;
    defaultHeight: number;
    minWidth: number;
    minHeight: number;
  };
  jsxSource: string;
  cssSource: string;
  compiledJs: string;
  scopedCss: string;
  version: number;
  updatedAt: string;
};

export type ConnectorSettingFieldMetadata = {
  apiName: string;
  label: string;
  value: string;
};

export type ConnectorSettingsMetadata = {
  apiName: string;
  label: string;
  fields: ConnectorSettingFieldMetadata[];
};

export type ConnectorProviderMetadata = {
  connectorKey: string;
  name: string;
  authType: 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY';
  baseUrl: string;
  authHeader?: string;
  authCredential?: string;
  credentialsSchema: Array<{ name: string; label: string; secret: boolean; required: boolean }>;
  operations: Record<string, { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string }>;
  test?: {
    method: 'GET' | 'HEAD';
    path: string;
    expectedStatus: number;
    responseValidation?: { jsonPath: string; equals: string };
  };
  timeoutMs: number;
  retryPolicy: { maxAttempts: number };
  status: 'ACTIVE' | 'INACTIVE';
};

export type IntegrationConnectionMetadata = {
  id: string;
  connectorKey: string;
  name: string;
  configuration: Record<string, string>;
  status: 'ACTIVE' | 'INACTIVE';
  hasCredentials: boolean;
  credentialFields: Array<{ name: string; label: string; secret: boolean; required: boolean; configured: boolean }>;
  testStatus: 'Connected' | 'Failed' | 'Not configured' | 'Test unavailable' | null;
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardWidgetMetadata = PageComponentMetadata;

export type PageActivationAssignmentMetadata = {
  id: string;
  scope: 'Org Default' | 'App Default' | 'App and Profile' | 'App, Record Type, and Profile';
  appId: string | null;
  profileId: string | null;
  recordTypeId: string | null;
  formFactors: Array<'Desktop' | 'Phone'>;
};

export type PermissionSetMetadata = {
  id: string;
  label: string;
  apiName: string;
  license: string;
  description: string;
  systemPermissions: string[];
  objectPermissions: Record<string, { read: boolean; create: boolean; edit: boolean; delete: boolean; viewAll: boolean; modifyAll: boolean }>;
  recordTypePermissions: Record<string, boolean>;
  fieldPermissions: Record<string, { read: boolean; edit: boolean }>;
};

export type PermissionSetGroupMetadata = {
  id: string;
  label: string;
  apiName: string;
  description: string;
  permissionSetIds: string[];
  calculationStatus: 'Updated' | 'Updating' | 'Failed';
  lastCalculatedAt: string | null;
  mutedSystemPermissions: string[];
  mutedObjectPermissions: Record<string, { read: boolean; create: boolean; edit: boolean; delete: boolean; viewAll: boolean; modifyAll: boolean }>;
  mutedRecordTypePermissions: Record<string, boolean>;
  mutedFieldPermissions: Record<string, { read: boolean; edit: boolean }>;
};

export type ProfileMetadata = {
  id: string;
  label: string;
  apiName: string;
  license: string;
  description: string;
  isStandard: boolean;
  systemPermissions: string[];
  objectPermissions: Record<string, { read: boolean; create: boolean; edit: boolean; delete: boolean; viewAll: boolean; modifyAll: boolean }>;
  recordTypePermissions: Record<string, boolean>;
  fieldPermissions: Record<string, { read: boolean; edit: boolean }>;
};

export type UserMetadata = {
  id: string;
  name: string;
  username: string;
  role: string;
  roleId: string;
  profileId: string;
  permissionSetIds: string[];
  permissionSetGroupIds: string[];
  timeZone: string;
  locale: string;
  currencyIsoCode?: string;
};

export type RoleMetadata = {
  id: string;
  name: string;
  apiName: string;
  parentRoleId: string | null;
};

export type PublicGroupMetadata = {
  id: string;
  label: string;
  apiName: string;
  description: string;
  userIds: string[];
  roleIds: string[];
  roleAndSubordinateIds: string[];
  groupIds: string[];
};

export type QueueMetadata = {
  id: string;
  label: string;
  apiName: string;
  description: string;
  supportedObjectApiNames: string[];
  userIds: string[];
  roleIds: string[];
  roleAndSubordinateIds: string[];
  publicGroupIds: string[];
};

export type SharingRuleMetadata = {
  id: string;
  label: string;
  apiName: string;
  objectApiName: string;
  active: boolean;
  type: 'OwnerBased' | 'CriteriaBased';
  ownerRoleIds: string[];
  criteria: Array<{
    fieldApiName: string;
    operator: 'Equals' | 'Not Equals' | 'Contains' | 'Starts With' | 'Greater Than' | 'Less Than' | 'Is Null';
    value: string;
  }>;
  filterLogic: 'All' | 'Any';
  targetType: 'User' | 'PublicGroup' | 'Role' | 'RoleAndSubordinates';
  targetId: string;
  accessLevel: 'Read' | 'Edit';
};

export type AccessControlMetadata = {
  profiles: ProfileMetadata[];
  permissionSets: PermissionSetMetadata[];
  permissionSetGroups: PermissionSetGroupMetadata[];
  roles: RoleMetadata[];
  publicGroups: PublicGroupMetadata[];
  queues: QueueMetadata[];
  sharingRules: SharingRuleMetadata[];
  users: UserMetadata[];
  sharingSettings: Record<string, { defaultAccess: 'Private' | 'Public Read Only' | 'Public Read/Write'; grantAccessUsingHierarchies: boolean }>;
};

export type CurrencySettingsMetadata = {
  corporateCurrency: string;
  currencies: Array<{ currencyIsoCode: string; conversionRate: number }>;
};

export type WorkspaceMetadata = {
  id: WorkspaceId;
  label: string;
  icon: LucideIcon;
};

export const workspaces: WorkspaceMetadata[] = [
  { id: 'home', label: 'Setup Home', icon: LayoutTemplate },
  { id: 'object-manager', label: 'Object Manager', icon: Database },
  { id: 'page-builder', label: 'Lightning App Builder', icon: LayoutTemplate },
  { id: 'dashboard-builder', label: 'Dashboards', icon: BarChart3 },
  { id: 'report-builder', label: 'Reports', icon: FileText },
  { id: 'flow-builder', label: 'Flows', icon: Workflow },
  { id: 'component-library', label: 'Component Library', icon: Puzzle },
  { id: 'approval-processes', label: 'Approval Processes', icon: Workflow },
  { id: 'app-manager', label: 'App Manager', icon: LayoutTemplate },
  { id: 'app-exchange', label: 'AppExchange', icon: Store },
  { id: 'company-settings', label: 'Company Information', icon: Building2 },
  { id: 'rbac', label: 'Users & Permissions', icon: ShieldCheck }
];

export const setupNavigation = [
  { group: 'Company Settings', items: ['Company Information', 'Currencies'] },
  { group: 'Platform Tools', items: ['Setup Home', 'Object Manager', 'Lightning App Builder', 'App Manager', 'Component Library', 'AppExchange'] },
  { group: 'Integrations', items: ['Named Credentials'] },
  { group: 'Data', items: ['Objects', 'Fields & Relationships', 'Page Layouts', 'Record Types'] },
  { group: 'Automation', items: ['Flows', 'Paused and Waiting Interviews', 'Scheduled Flows', 'Failed Flow Logs', 'Approval Processes', 'Process Automation Settings'] },
  { group: 'Analytics', items: ['Reports', 'Dashboards'] },
  { group: 'Security', items: ['Users', 'Roles', 'Public Groups', 'Profiles', 'Permission Sets', 'Permission Set Groups', 'Sharing Settings', 'Sharing Rules'] }
];

export type LightningAppMetadata = {
  apiName: string;
  label: string;
  description: string;
  navigationItems: string[];
  navigationPageApiNames: string[];
  navigationOrder: Array<{ type: 'Object' | 'App Page'; apiName: string }>;
  brandColor: string;
  utilityItems: Array<'Notes' | 'History'>;
};

export const objectMetadata: ObjectMetadata[] = [
  {
    apiName: 'User',
    label: 'User',
    pluralLabel: 'Users',
    kind: 'Standard Object',
    description: 'Platform users who belong to this tenant.',
    fields: [
      { apiName: 'Name', label: 'Full Name', dataType: 'Text(121)', required: true, unique: false },
      { apiName: 'Email', label: 'Email', dataType: 'Email', required: true, unique: true },
      { apiName: 'Username', label: 'Username', dataType: 'Text(80)', required: true, unique: true },
      { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false },
      { apiName: 'UserRoleId', label: 'User Role', dataType: 'Text(18)', required: false, unique: false }
    ]
  },
  {
    apiName: 'Account',
    label: 'Account',
    pluralLabel: 'Accounts',
    kind: 'Standard Object',
    description: 'Companies and organizations that you do business with.',
    fields: [
      { apiName: 'Name', label: 'Account Name', dataType: 'Text(255)', required: true, unique: false },
      { apiName: 'Type', label: 'Account Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Channel Partner / Reseller', 'Technology Partner', 'Other'], picklistRestricted: true },
      { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
      { apiName: 'AnnualRevenue', label: 'Annual Revenue', dataType: 'Currency(18, 0)', required: false, unique: false },
      { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
      { apiName: 'Website', label: 'Website', dataType: 'URL', required: false, unique: false },
      { apiName: 'OwnerId', label: 'Account Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Accounts' } },
      { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false }
    ]
  },
  {
    apiName: 'Contact',
    label: 'Contact',
    pluralLabel: 'Contacts',
    kind: 'Standard Object',
    description: 'People associated with your accounts.',
    fields: [
      { apiName: 'Name', label: 'Contact Name', dataType: 'Name', required: true, unique: false },
      { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Contacts' } },
      { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
      { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
      { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
      { apiName: 'OwnerId', label: 'Contact Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedContacts' } }
    ],
    listViewButtons: ['New', 'Change Owner', 'Import', 'Add to Campaign']
  },
  {
    apiName: 'Lead',
    label: 'Lead',
    pluralLabel: 'Leads',
    kind: 'Standard Object',
    description: 'Prospective customers and the sources that introduced them.',
    fields: [
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
    ]
  },
  {
    apiName: 'Opportunity',
    label: 'Opportunity',
    pluralLabel: 'Opportunities',
    kind: 'Standard Object',
    description: 'Potential revenue and deals in progress.',
    fields: [
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
    ]
  },
  {
    apiName: 'Case',
    label: 'Case',
    pluralLabel: 'Cases',
    kind: 'Standard Object',
    description: 'Customer questions, feedback, and product issues.',
    fields: [
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
    ]
  },
  {
    apiName: 'Campaign',
    label: 'Campaign',
    pluralLabel: 'Campaigns',
    kind: 'Standard Object',
    description: 'Marketing initiatives and their associated contacts.',
    fields: [
      { apiName: 'Name', label: 'Campaign Name', dataType: 'Text(80)', required: true, unique: false },
      { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Conference', 'Webinar', 'Email', 'Advertisement', 'Direct Mail', 'Other'], picklistRestricted: true },
      { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Planned', 'In Progress', 'Completed', 'Aborted'], picklistRestricted: true, defaultValue: 'Planned' },
      { apiName: 'StartDate', label: 'Start Date', dataType: 'Date', required: false, unique: false },
      { apiName: 'EndDate', label: 'End Date', dataType: 'Date', required: false, unique: false },
      { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false, defaultValue: true },
      { apiName: 'OwnerId', label: 'Campaign Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Campaigns' } }
    ]
  },
  {
    apiName: 'Renewal__c',
    label: 'Renewal',
    pluralLabel: 'Renewals',
    kind: 'Custom Object',
    description: 'Tracks upcoming customer contract renewals.',
    fields: [
      { apiName: 'Name', label: 'Renewal Name', dataType: 'Text(80)', required: true, unique: false },
      { apiName: 'Account__c', label: 'Account', dataType: 'Lookup(Account)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Renewals' } },
      { apiName: 'Renewal_Date__c', label: 'Renewal Date', dataType: 'Date', required: true, unique: false },
      { apiName: 'ARR__c', label: 'Annual Recurring Revenue', dataType: 'Currency(16, 2)', required: false, unique: false }
    ]
  }
];

export const setupShortcuts = [
  { title: 'Object Manager', description: 'Manage objects, fields, and relationships', workspace: 'object-manager' as const, icon: Database },
  { title: 'Lightning App Builder', description: 'Create and edit Lightning pages', workspace: 'page-builder' as const, icon: LayoutTemplate },
  { title: 'Flows', description: 'Build automated business processes', workspace: 'flow-builder' as const, icon: Workflow },
  { title: 'Reports', description: 'Create, customize, and run reports', workspace: 'report-builder' as const, icon: FileText },
  { title: 'Dashboards', description: 'Visualize key business metrics', workspace: 'dashboard-builder' as const, icon: BarChart3 },
  { title: 'AppExchange', description: 'Discover and manage organization apps', workspace: 'app-exchange' as const, icon: Store },
  { title: 'Company Information', description: 'Manage corporate currency and exchange rates', workspace: 'company-settings' as const, icon: Building2 },
  { title: 'Permission Sets', description: 'Manage access to apps and data', workspace: 'rbac' as const, icon: ShieldCheck }
];

export const flowElementMetadata = [
  { type: 'Screen', group: 'Interaction', icon: '▣' },
  { type: 'Decision', group: 'Logic', icon: '◇' },
  { type: 'Assignment', group: 'Logic', icon: '⇄' },
  { type: 'Loop', group: 'Logic', icon: '↻' },
  { type: 'Collection Filter', group: 'Logic', icon: '⌕' },
  { type: 'Collection Sort', group: 'Logic', icon: '↕' },
  { type: 'Wait', group: 'Logic', icon: '◷' },
  { type: 'Transform', group: 'Data', icon: '⇥' },
  { type: 'Get Records', group: 'Data', icon: '⌕' },
  { type: 'Create Records', group: 'Data', icon: '+' },
  { type: 'Update Records', group: 'Data', icon: '↻' },
  { type: 'Delete Records', group: 'Data', icon: '−' },
  { type: 'Roll Back Records', group: 'Data', icon: '↶' },
  { type: 'Publish Platform Event', group: 'Interaction', icon: '⇧' },
  { type: 'Action', group: 'Interaction', icon: '⚡' },
  { type: 'HTTP Callout', group: 'Interaction', icon: '⇧' },
  { type: 'Subflow', group: 'Interaction', icon: '↪' }
];

export const recordMetadata = [
  { name: 'Edge Communications', owner: 'Alexandra Curtis', type: 'Customer - Direct', industry: 'Electronics', employees: '1,000', status: 'Active' },
  { name: 'Express Logistics and Transport', owner: 'David Kim', type: 'Customer - Channel', industry: 'Transportation', employees: '4,800', status: 'Active' },
  { name: 'University of Arizona', owner: 'Jamie Taylor', type: 'Customer - Direct', industry: 'Education', employees: '8,200', status: 'Active' },
  { name: 'GenePoint', owner: 'Alexandra Curtis', type: 'Prospect', industry: 'Biotechnology', employees: '265', status: 'New' },
  { name: 'Grand Hotels & Resorts Ltd', owner: 'Chris Johnson', type: 'Customer - Direct', industry: 'Hospitality', employees: '3,200', status: 'Active' }
];

export const defaultFlow: FlowDefinitionMetadata = {
  apiName: 'Renewal_Risk_Evaluation',
  label: 'Renewal Risk Evaluation',
  flowType: 'Record-Triggered Flow',
  status: 'Draft',
  versionNumber: 1,
  activeVersion: null,
  triggerObject: 'Renewal__c',
  startConfig: { trigger: 'created-or-updated', runWhen: 'after-save', entryConditions: [] },
  elements: [
    { id: 1, type: 'Start', label: 'Record-Triggered Flow', config: { trigger: 'created-or-updated', runWhen: 'after-save' } },
    { id: 2, type: 'Decision', label: 'Renewal at risk?', config: { outcomes: [{ name: 'At_Risk', label: 'At Risk' }, { name: 'Default', label: 'Default Outcome' }] } },
    { id: 3, type: 'Update Records', label: 'Update Renewal Status', config: { object: 'Renewal__c', field: 'Status__c', value: 'At Risk' } }
  ],
  connectors: [
    { id: 'connector-1', from: 1, to: 2, label: '', kind: 'normal' },
    { id: 'connector-2', from: 2, to: 3, label: 'At Risk', kind: 'normal' }
  ],
  resources: [
    { name: 'recordId', label: 'Record ID', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false }
  ],
  versions: []
};

export const defaultLightningPage: LightningPageMetadata = {
  apiName: 'Account_Record_Page',
  label: 'Account Record Page',
  targetObject: 'Account',
  pageType: 'Record Page',
  layoutMode: 'template',
  template: 'header-main-sidebar',
  canvasWidth: 1920,
  canvasHeight: 1080,
  status: 'Draft',
  devices: ['Desktop', 'Phone'],
  components: [
    { id: 'highlights-panel', type: 'Highlights Panel', label: 'Highlights Panel', properties: { variant: 'compact' }, visible: true, region: 'header' },
    { id: 'record-tabs', type: 'Tabs', label: 'Tabs', properties: { tabs: ['Related', 'Details', 'News'] }, visible: true, region: 'main' },
    { id: 'related-list', type: 'Related List', label: 'Related List', properties: { relatedLists: ['Contacts', 'Opportunities', 'Cases'] }, visible: true, region: 'sidebar' }
  ],
  activationAssignments: [
    { id: 'account-default-desktop', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Desktop'] },
    { id: 'account-default-phone', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Phone'] }
  ]
};

const fullObjectAccess = { read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true };

export const defaultAccessControl: AccessControlMetadata = {
  profiles: [
    {
      id: 'system-administrator',
      label: 'System Administrator',
      apiName: 'System_Administrator',
      license: 'MetaDrive',
      description: 'Full administrative access to platform setup and tenant data.',
      isStandard: true,
      systemPermissions: ['metadata:read', 'metadata:write', 'security:read', 'security:manage', 'objects:manage', 'flows:manage', 'flows:run', 'namedCredentials:manage', 'reports:manage', 'pages:manage', 'components:manage', 'dashboards:manage', 'dashboards:viewTeam', 'data:viewAll', 'email:send', 'callouts:execute', 'notifications:send', 'approvals:manage'],
      objectPermissions: Object.fromEntries(objectMetadata.map((object) => [object.apiName, { ...fullObjectAccess }])),
      recordTypePermissions: {},
      fieldPermissions: Object.fromEntries(objectMetadata.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])))
    },
    {
      id: 'standard-user',
      label: 'Standard User',
      apiName: 'Standard_User',
      license: 'MetaDrive',
      description: 'Everyday tenant user with access granted through permission sets.',
      isStandard: true,
      systemPermissions: [],
      objectPermissions: {},
      recordTypePermissions: {},
      fieldPermissions: {}
    },
    {
      id: 'sales-manager',
      label: 'Sales Manager',
      apiName: 'Sales_Manager',
      license: 'MetaDrive',
      description: 'Sales team baseline access.',
      isStandard: false,
      systemPermissions: ['metadata:read'],
      objectPermissions: {
        Account: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
        Contact: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
        Opportunity: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
      },
      recordTypePermissions: {},
      fieldPermissions: { 'Opportunity.Amount': { read: true, edit: true }, 'Opportunity.StageName': { read: true, edit: true } }
    },
    {
      id: 'support-agent',
      label: 'Support Agent',
      apiName: 'Support_Agent',
      license: 'MetaDrive',
      description: 'Customer support baseline access.',
      isStandard: false,
      systemPermissions: ['metadata:read', 'namedCredentials:manage'],
      objectPermissions: {
        Account: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        Contact: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        Case: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
      },
      recordTypePermissions: {},
      fieldPermissions: { 'Case.Priority': { read: true, edit: true }, 'Case.Status': { read: true, edit: true } }
    }
  ],
  permissionSets: [
    {
      id: 'system-administrator',
      label: 'System Administrator',
      apiName: 'System_Administrator',
      license: 'Salesforce',
      description: 'Full administrative access to platform setup and data.',
      systemPermissions: ['metadata:read', 'metadata:write', 'security:read', 'security:manage', 'objects:manage', 'flows:manage', 'flows:run', 'namedCredentials:manage', 'reports:manage', 'pages:manage', 'components:manage', 'dashboards:manage', 'dashboards:viewTeam', 'data:viewAll', 'email:send', 'callouts:execute', 'notifications:send', 'approvals:manage'],
      objectPermissions: Object.fromEntries(objectMetadata.map((object) => [object.apiName, { ...fullObjectAccess }])),
      recordTypePermissions: {},
      fieldPermissions: {}
    },
    {
      id: 'sales-user',
      label: 'Sales User',
      apiName: 'Sales_User',
      license: 'Salesforce',
      description: 'Manage accounts and opportunities for the sales team.',
      systemPermissions: ['metadata:read'],
      objectPermissions: {
        Account: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
        Contact: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
        Opportunity: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
      },
      recordTypePermissions: {},
      fieldPermissions: { 'Opportunity.Amount': { read: true, edit: true }, 'Opportunity.StageName': { read: true, edit: true } }
    },
    {
      id: 'support-agent',
      label: 'Support Agent',
      apiName: 'Support_Agent',
      license: 'Salesforce',
      description: 'Work on customer cases and view account context.',
      systemPermissions: ['metadata:read', 'namedCredentials:manage'],
      objectPermissions: {
        Account: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        Contact: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        Case: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
      },
      recordTypePermissions: {},
      fieldPermissions: { 'Case.Priority': { read: true, edit: true }, 'Case.Status': { read: true, edit: true } }
    }
  ],
  permissionSetGroups: [],
  publicGroups: [],
  queues: [],
  sharingRules: [],
  roles: [
    { id: 'role-executive', name: 'Executive', apiName: 'Executive', parentRoleId: null },
    { id: 'role-sales-manager', name: 'Sales Manager', apiName: 'Sales_Manager', parentRoleId: 'role-executive' },
    { id: 'role-sales-representative', name: 'Sales Representative', apiName: 'Sales_Representative', parentRoleId: 'role-sales-manager' },
    { id: 'role-support-manager', name: 'Support Manager', apiName: 'Support_Manager', parentRoleId: 'role-executive' },
    { id: 'role-support-agent', name: 'Support Agent', apiName: 'Support_Agent', parentRoleId: 'role-support-manager' },
    { id: 'role-standard-user', name: 'Standard User', apiName: 'Standard_User', parentRoleId: 'role-executive' }
  ],
  users: [
    { id: 'alexandra-curtis', name: 'Alexandra Curtis', username: 'acurtis@metadrive.example', role: 'System Administrator', roleId: 'role-executive', profileId: 'system-administrator', permissionSetIds: ['system-administrator'], permissionSetGroupIds: [], timeZone: 'UTC', locale: 'en-US' },
    { id: 'david-kim', name: 'David Kim', username: 'dkim@metadrive.example', role: 'Sales Manager', roleId: 'role-sales-manager', profileId: 'sales-manager', permissionSetIds: ['sales-user'], permissionSetGroupIds: [], timeZone: 'UTC', locale: 'en-US' },
    { id: 'jamie-taylor', name: 'Jamie Taylor', username: 'jtaylor@metadrive.example', role: 'Support Agent', roleId: 'role-support-agent', profileId: 'support-agent', permissionSetIds: ['support-agent'], permissionSetGroupIds: [], timeZone: 'UTC', locale: 'en-US' }
  ],
  sharingSettings: Object.fromEntries(objectMetadata.map((object) => [object.apiName, {
    defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true
  }]))
};
