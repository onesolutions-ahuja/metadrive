import { createSetupHome } from './setupHomeView';
import { createSettingsViews } from './settingsWorkspaceViews';
import { pageLayoutForRecord, compactLayoutForRecord, matchesLookupFilterGroup, relatedLookupFilterOperators, type RecordData } from './recordMetadataUtils';
import { formatRecordValue, parseCsvImport } from './recordCsvUtils';
import { initialScreenValues, screenFieldIsVisible } from './flowScreenRuntimeUtils';
import { objectSettings, parseAppRoute, appRoutePath, type AppRoute } from './appRouting';
import { NavigationLoadTime, resolveCurrentAppNavigation } from './appNavigationView';
import { isStandalonePagePresentation, pageCanvasPresentationStyle } from './pageRuntimePresentation';
import { insertFlowElementAtPath } from './flowInsertElement.mjs';
import AdvancedSharingSettings from './AdvancedSharingSettings';
import {resolveSetupNavigation} from './platformSetupNavigation';
import {readVerifiedMetadata,saveVerifiedMetadata,type MetadataPublicationResponse} from './verifiedMetadataCache';
import { queueOfflineRecord, listOfflineRecords, markOfflineRecord, removeOfflineRecord,
  synchronizeOfflineRecords, type OfflineQueueOwner, type OfflineRecordItem, type OfflineRecordWrite } from './offlineRecordQueue';
import SchemaBuilder from './SchemaBuilder';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  ClipboardPaste,
  Command,
  Copy,
  Database,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  FileText,
  Filter,
  GripVertical,
  Grid2X2,
  ListFilter,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Puzzle,
  Smartphone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Star,
  Undo2,
  Redo2,
  Trash2,
  Tablet,
  UsersRound,
  X,
  Workflow,
  Wifi,
  WifiOff,
  PanelLeft,
  PanelRight
} from 'lucide-react';
import FlowBuilderWorkspace from './FlowBuilder';
import FlowScreenContent from './FlowScreenContent';
import FlowLogs from './FlowLogs';
import FlowInterviews from './FlowInterviews';
import ScheduledFlows from './ScheduledFlows';
import DashboardBuilder from './DashboardBuilder';
import ComponentLibrary from './ComponentLibrary';
import RegisteredComponent from './RegisteredComponent';
import CustomComponentPropertyEditor from './CustomComponentPropertyEditor';
import FlowInputBindingEditor from './FlowInputBindingEditor';
import RecordFilterEditor from './RecordFilterEditor';
import ComponentVisibilityEditor from './ComponentVisibilityEditor';
import PageRouteDirectory from './PageRouteDirectory';
import { isComponentVisible } from './componentVisibility';
import PageComponentVisualEditor from './PageComponentVisualEditor';
import { canNestComponent, componentVisualStyle, directChildren, isLayoutType, isDescendantOf, layoutTypes } from './pageComponentLayout';
import PageComponentStyleEditor from './PageComponentStyleEditor';
import { isCanvasLocked, wrapCanvasComponent, ungroupCanvasComponent } from './canvasInteractions';
import { filterPageComponentRecords, needsMetadataComponentRuntime } from './pageComponentBindings';
import { childrenOf, canNest, componentLayoutProps, hasPageComponentAppearance, isLayoutContainer, rawLayoutParentId, reparentComponent, resolvePageComponentStyle, type LayoutDevice } from './pageComponentLayout';
import AppExchange from './AppExchange';
import AppManager from './AppManager';
import PlatformWorkspaceSurface from './PlatformWorkspaceSurface';
import { GlobalRecordSearch, RecordObjectPicker, useDismissOnOutside } from './TopbarRecords';
import { pageIsAvailableInApp, resolvePageActionRoute } from './pageActionRouting';
import NamedCredentials from './NamedCredentials';
import TenantManagement from './TenantManagement';
import TenantDomains from './TenantDomains';
import TenantRecoveryPanel from './TenantRecoveryPanel';
import TenantUsagePanel from './TenantUsagePanel';
import DeveloperAccountSettings from './DeveloperAccountSettings';
import SettingsViewRow from './SettingsViewRow';
import ApprovalProcessManager from './ApprovalProcessManager';
import { standardPageComponents } from './componentCatalog';
import EmbeddedDashboard from './EmbeddedDashboard';
import { inspectPageDependencies } from './pageDependencies';
import {
  canvasDimensionsForOrientation,
  canvasBoundPosition,
  canvasOrientation,
  canvasScaleToFitWidth,
  canvasUnitsFromScreenDelta
} from './pageCanvas';
import {
  createComponentPreviewProps,
  getPageBuilderComponentCategories,
  pageBuilderPaletteCategories
} from './pageBuilderPalette';
import {
  defaultFlow,
  defaultLightningPage,
  defaultAccessControl,
  objectMetadata,
  setupShortcuts,
  workspaces,
  type ObjectMetadata,
  type FieldMetadata,
  type FieldSetMetadata,
  type PageLayoutMetadata,
  type PageLayoutCustomLinkMetadata,
  type CompactLayoutMetadata,
  type RecordTypeMetadata,
  type RelatedLookupFilterMetadata,
  type ObjectActionMetadata,
  type ObjectSettingsMetadata,
  type ProfileMetadata,
  type PageActivationAssignmentMetadata,
  type FlowDefinitionMetadata,
  type FlowExecutionLogMetadata,
  type FlowInterviewMetadata,
  type FlowElementMetadata,
  type FlowResourceMetadata,
  type FlowValidationMetadata,
  type PlatformEventMetadata,
  type LightningPageTemplate,
  type NamedCredentialMetadata,
  type EmailAlertMetadata,
  type CustomNotificationMetadata,
  type ApprovalRequestMetadata,
  type ApprovalProcessMetadata,
  type ApprovalProcessInput,
  type ConnectorProviderMetadata,
  type IntegrationConnectionMetadata,
  type LightningPageMetadata,
  type PageComponentMetadata,
  type LibraryComponentMetadata,
  type DashboardFilterMetadata,
  type DashboardMetadata,
  type DashboardFolderMetadata,
  type DashboardFolderInput,
  type DashboardTerritoryMetadata,
  type DashboardSubscription,
  type DashboardSubscriptionInput,
  type DashboardSnapshot,
  type ReportMetadata,
  type ReportBucketMetadata,
  type ReportFolderMetadata,
  type ReportFolderInput,
  type ReportRunMetadata,
  type ReportStandardFiltersMetadata,
  type ReportFilterMetadata,
  type ReportDateRange,
  type ReportDateGrouping,
  type ReportSummaryOperation,
  type ReportCrossFilterMetadata,
  type AccessControlMetadata,
  type CurrencySettingsMetadata,
  type LightningAppMetadata,
  type PermissionSetMetadata,
  type PermissionSetGroupMetadata,
  type PublicGroupMetadata,
  type QueueMetadata,
  type SharingRuleMetadata,
  type UserMetadata,
  type WorkspaceId
} from './metadata';


export function createObjectManager(apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>) {
function ObjectManager({
  object, objects, flows, pages, reports, dashboards, profiles, activationAppIds, selectedSetting, search, onSearch, onObjectSelect, onSettingSelect, onOpenDependency, onNewField, onCreateObject, onSaveObject, onRefreshObject, onDeleteObject, onSaveField, onDeleteField, onSavePage, onOpenPageBuilder, onOpenRecords, page, onNotify
}: {
  object: ObjectMetadata;
  objects: ObjectMetadata[];
  flows: FlowDefinitionMetadata[];
  pages: LightningPageMetadata[];
  reports: ReportMetadata[];
  dashboards: DashboardMetadata[];
  onOpenDependency: (target: {
    setting?: string;
    objectApiName?: string;
    workspace?: 'flow-builder' | 'page-builder' | 'report-builder' | 'dashboard-builder';
    resourceApiName?: string;
  }) => void;
  profiles: ProfileMetadata[];
  activationAppIds: string[];
  selectedSetting: string;
  search: string;
  onSearch: (value: string) => void;
  onObjectSelect: (object: ObjectMetadata) => void;
  onSettingSelect: (setting: string) => void;
  onNewField: () => void;
  onCreateObject: () => void;
  onSaveObject: (object: ObjectMetadata) => Promise<void>;
  onRefreshObject: (apiName: string) => Promise<ObjectMetadata>;
  onDeleteObject: (apiName: string) => Promise<void>;
  onSaveField: (field: FieldMetadata) => Promise<ObjectMetadata>;
  onDeleteField: (apiName: string) => Promise<ObjectMetadata>;
  onSavePage: (page: LightningPageMetadata) => Promise<void>;
  onOpenPageBuilder: () => void;
  onOpenRecords: () => void;
  page: LightningPageMetadata;
  onNotify: (message: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'All Objects' | 'Standard Objects' | 'Custom Objects'>('All Objects');
  const [showObjectFilterMenu, setShowObjectFilterMenu] = useState(false);
  const [showObjectActionsMenu, setShowObjectActionsMenu] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [draft, setDraft] = useState(object);
  const [selectedLayoutId, setSelectedLayoutId] = useState('');
  const [selectedCompactLayoutId, setSelectedCompactLayoutId] = useState('');
  const [selectedRecordTypeId, setSelectedRecordTypeId] = useState('');
  const [layoutProfileId, setLayoutProfileId] = useState('*');
  const [assignedLayoutId, setAssignedLayoutId] = useState('');
  const [fieldSetLabel, setFieldSetLabel] = useState('');
  const [fieldSetApiName, setFieldSetApiName] = useState('');
  const [recordTypeLabel, setRecordTypeLabel] = useState('');
  const [persistedFieldDependencies, setPersistedFieldDependencies] = useState<Array<{ fieldApiName: string; dependencies: string[] }>>([]);
  const [persistedObjectDependencies, setPersistedObjectDependencies] = useState<string[]>([]);
  const [fieldDependenciesLoading, setFieldDependenciesLoading] = useState(false);
  const [customLinkLabel, setCustomLinkLabel] = useState('');
  const [customLinkUrl, setCustomLinkUrl] = useState('');
  const [customLinkNewWindow, setCustomLinkNewWindow] = useState(false);
  const [customActionLabel, setCustomActionLabel] = useState('');
  const [customActionFieldApiName, setCustomActionFieldApiName] = useState('');
  const [customActionValue, setCustomActionValue] = useState('');
  const [recordTypePicklistDrafts, setRecordTypePicklistDrafts] = useState<Record<string, string>>({});
  const [filterField, setFilterField] = useState('');
  const [filterRelatedField, setFilterRelatedField] = useState('');
  const [filterOperator, setFilterOperator] = useState<RelatedLookupFilterMetadata['operator']>('Equals');
  const [filterValue, setFilterValue] = useState('');
  const [filterValueMode, setFilterValueMode] = useState<'Value' | 'Field'>('Value');
  const [filterValueFieldApiName, setFilterValueFieldApiName] = useState('');
  const [filterRelatedObject, setFilterRelatedObject] = useState('');
  const [editingField, setEditingField] = useState<FieldMetadata | null>(null);
  const [showDependencies, setShowDependencies] = useState(false);
  const [activationScope, setActivationScope] = useState<PageActivationAssignmentMetadata['scope']>('Org Default');
  const [activationAppId, setActivationAppId] = useState('');
  const [activationProfileId, setActivationProfileId] = useState('');
  const [activationFormFactors, setActivationFormFactors] = useState<Array<'Desktop' | 'Phone'>>(['Desktop']);
  const [showDeleteObjectConfirmation, setShowDeleteObjectConfirmation] = useState(false);
  const [showDeleteFieldConfirmation, setShowDeleteFieldConfirmation] = useState(false);
  const [metadataChanges, setMetadataChanges] = useState<Array<{
    objectApiName: string; revision: number; action: string; actorUserId: string; at: string;
    beforeRevision: number | null; afterRevision: number | null;
  }>>([]);
  const [metadataHistoryError, setMetadataHistoryError] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ revision: number; before?: ObjectMetadata; after?: ObjectMetadata } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    if (selectedSetting !== 'Change History') return;
    let active = true;
    setHistoryLoading(true);
    setSelectedSnapshot(null);
    setMetadataHistoryError('');
    void apiRequest<{ history: typeof metadataChanges }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/history?limit=100`)
      .then((response) => { if (active) setMetadataChanges(response.history); })
      .catch((error: unknown) => { if (active) setMetadataHistoryError(error instanceof Error ? error.message : 'History unavailable'); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selectedSetting, object.apiName, object.revision]);
  const openMetadataSnapshot = async (revision: number) => {
    try {
      const response = await apiRequest<{ change: { revision: number; before?: ObjectMetadata; after?: ObjectMetadata } }>(
        `/metadata/objects/${encodeURIComponent(object.apiName)}/history/${revision}`
      );
      setSelectedSnapshot(response.change);
    } catch (error) {
      setMetadataHistoryError(error instanceof Error ? error.message : 'Unable to read revision');
    }
  };
  const validateDraft = async () => {
    try {
      const result = await apiRequest<{ valid: boolean; errors: string[] }>(
        `/metadata/objects/${encodeURIComponent(object.apiName)}/validate`,
        { method: 'POST', headers: { 'If-Match': `"${draft.revision ?? 0}"` }, body: JSON.stringify(draft) }
      );
      onNotify(result.valid ? 'Draft metadata validation passed' : result.errors.join('; '));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Draft metadata validation failed');
    }
  };
  useEffect(() => {
    setDraft(object);
    setRecordTypePicklistDrafts(Object.fromEntries((object.recordTypes ?? []).flatMap((recordType) =>
      object.fields.filter((field) => field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist').map((field) => [
        `${recordType.id}.${field.apiName}`,
        (recordType.picklistValues?.[field.apiName] ?? field.picklistValues ?? []).join('\n')
      ])
    )));
    setSelectedLayoutId(object.pageLayouts?.[0]?.id ?? '');
    setSelectedCompactLayoutId(object.compactLayouts?.[0]?.id ?? `${object.apiName}-compact-default`);
    setSelectedRecordTypeId(object.recordTypes?.find((item) => item.isDefault)?.id ?? object.recordTypes?.[0]?.id ?? '');
    setLayoutProfileId(object.pageLayoutAssignments?.[0]?.profileId ?? '*');
    setAssignedLayoutId(object.pageLayoutAssignments?.[0]?.pageLayoutId ?? object.pageLayouts?.[0]?.id ?? '');
    setFilterField('');
    setFilterRelatedField('');
    setFilterRelatedObject('');
    setFilterOperator('Equals');
    setFilterValue('');
    setFilterValueMode('Value');
    setFilterValueFieldApiName('');
  }, [object]);
  useEffect(() => {
    if (layoutProfileId !== '*' && !profiles.some((profile) => profile.id === layoutProfileId)) setLayoutProfileId('*');
  }, [layoutProfileId, profiles]);
  const visibleObjects = objects.filter((item) => (viewMode === 'All Objects'
    || (viewMode === 'Custom Objects' ? item.kind === 'Custom Object' : item.kind === 'Standard Object'))
    && `${item.label} ${item.apiName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const fields = draft.fields
    .filter((field) => `${field.label} ${field.apiName} ${field.dataType}`.toLowerCase().includes(fieldSearch.toLowerCase()))
    .sort((left, right) => left.label.localeCompare(right.label));
  const editingNumericFormat = editingField?.dataType.match(/^(?:Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
  const editingNumericMaximum = editingNumericFormat
    ? 10 ** (Number(editingNumericFormat[1]) - Number(editingNumericFormat[2])) - 10 ** -Number(editingNumericFormat[2])
    : undefined;
  const editingTextMaximum = editingField?.dataType.match(/^Text\((\d+)\)$/)?.[1];
  const hasFieldReference = (value: unknown, apiName: string): boolean => {
    if (typeof value === 'string') return new RegExp(`(^|[^A-Za-z0-9_])${apiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_])`).test(value);
    if (Array.isArray(value)) return value.some((item) => hasFieldReference(item, apiName));
    if (value && typeof value === 'object') return Object.values(value).some((item) => hasFieldReference(item, apiName));
    return false;
  };
  type DependencyTarget = {
    setting?: string;
    objectApiName?: string;
    workspace?: 'flow-builder' | 'page-builder' | 'report-builder' | 'dashboard-builder';
    resourceApiName?: string;
  };
  type FieldDependency = {
    dependent: string;
    dependency: string;
    kind: string;
    target?: DependencyTarget;
  };
  const dependencies: FieldDependency[] = [];
  const addDependency = (dependent: string, dependency: string, kind: string, target?: DependencyTarget) => {
    if (dependencies.some((item) => item.dependent === dependent
      && item.dependency === dependency && item.kind === kind)) return;
    dependencies.push({ dependent, dependency, kind, target });
  };
  for (const field of draft.fields) {
    if (field.formula) {
      for (const candidate of draft.fields.filter((candidate) =>
        candidate.apiName !== field.apiName && hasFieldReference(field.formula?.expression, candidate.apiName))) {
        addDependency(field.label, candidate.apiName, 'Formula', { setting: 'Fields & Relationships' });
      }
    }
    if (field.controllerFieldApiName) {
      addDependency(field.label, field.controllerFieldApiName, 'Picklist Dependency', { setting: 'Fields & Relationships' });
    }
    if (field.relationship) {
      addDependency(field.label, field.relationship.targetObject, field.relationship.type, {
        setting: 'Fields & Relationships',
        objectApiName: field.relationship.targetObject
      });
    }
  }
  for (const layout of draft.pageLayouts ?? []) {
    for (const section of layout.sections) {
      for (const fieldApiName of section.fieldApiNames) {
        if (draft.fields.some((field) => field.apiName === fieldApiName)) {
          addDependency(layout.label, fieldApiName, 'Page Layout', { setting: 'Page Layouts' });
        }
      }
    }
  }
  for (const parentObject of objects) {
    for (const layout of parentObject.pageLayouts ?? []) {
      for (const relatedList of layout.relatedLists) {
        const relationshipField = draft.fields.find((field) =>
          field.relationship?.targetObject === parentObject.apiName
          && field.relationship.childRelationshipName === relatedList);
        if (relationshipField) {
          addDependency(`${parentObject.label}: ${layout.label}`, relationshipField.apiName, 'Related List', {
            setting: 'Page Layouts',
            objectApiName: parentObject.apiName
          });
        }
      }
    }
  }
  for (const fieldApiName of draft.compactLayout?.fieldApiNames ?? []) {
    addDependency('System Default Compact Layout', fieldApiName, 'Compact Layout', { setting: 'Compact Layouts' });
  }
  for (const compactLayout of draft.compactLayouts ?? []) {
    for (const fieldApiName of compactLayout.fieldApiNames) {
      addDependency(compactLayout.label, fieldApiName, 'Compact Layout', { setting: 'Compact Layouts' });
    }
  }
  for (const fieldSet of draft.fieldSets ?? []) {
    for (const fieldApiName of fieldSet.fieldApiNames) {
      addDependency(fieldSet.label, fieldApiName, 'Field Set', { setting: 'Field Sets' });
    }
  }
  for (const recordType of draft.recordTypes ?? []) {
    for (const fieldApiName of Object.keys(recordType.picklistValues ?? {})) {
      addDependency(recordType.label, fieldApiName, 'Record Type Picklist Values', { setting: 'Record Types' });
    }
  }
  for (const [layoutKey, fieldApiNames] of Object.entries(draft.searchLayouts ?? {})) {
    for (const fieldApiName of fieldApiNames) {
      addDependency(layoutKey, fieldApiName, 'Search Layout', { setting: 'Search Layouts' });
    }
  }
  for (const action of draft.actions ?? []) {
    if (action.type === 'Custom' && action.fieldApiName) {
      addDependency(action.label, action.fieldApiName, 'Custom Object Action', { setting: 'Buttons, Links, and Actions' });
    }
  }
  for (const candidate of objects) {
    for (const filter of candidate.relatedLookupFilters ?? []) {
      if (candidate.apiName === draft.apiName && filter.fieldApiName
        && draft.fields.some((field) => field.apiName === filter.fieldApiName)) {
        addDependency(`Lookup filter on ${candidate.label}`, filter.fieldApiName, 'Related Lookup Filter', {
          setting: 'Related Lookup Filters',
          objectApiName: candidate.apiName
        });
      }
      if (candidate.apiName === draft.apiName && filter.valueFieldApiName
        && draft.fields.some((field) => field.apiName === filter.valueFieldApiName)) {
        addDependency(`Lookup filter on ${candidate.label}`, filter.valueFieldApiName, 'Related Lookup Filter', {
          setting: 'Related Lookup Filters',
          objectApiName: candidate.apiName
        });
      }
      if (filter.relatedObject === draft.apiName
        && draft.fields.some((field) => field.apiName === filter.relatedFieldApiName)) {
        addDependency(`Lookup filter on ${candidate.label}`, filter.relatedFieldApiName, 'Related Lookup Filter', {
          setting: 'Related Lookup Filters',
          objectApiName: candidate.apiName
        });
      }
    }
  }
  for (const flow of flows) {
    const referencesObject = flow.triggerObject === draft.apiName
      || hasFieldReference([flow.startConfig, flow.elements.map((element) => element.config)], draft.apiName)
      || flow.resources.some((resource) => resource.dataType === draft.apiName);
    if (referencesObject) {
      for (const field of draft.fields.filter((candidate) =>
        hasFieldReference([flow.startConfig, flow.elements.map((element) => element.config), flow.resources], candidate.apiName))) {
        addDependency(flow.label, field.apiName, 'Flow', { workspace: 'flow-builder', resourceApiName: flow.apiName });
      }
    }
  }
  for (const candidate of pages) {
    for (const field of draft.fields) {
      if (candidate.targetObject === draft.apiName
        && candidate.components.some((component) => hasFieldReference(component.properties, field.apiName))) {
        addDependency(candidate.label, field.apiName, 'Lightning Page', {
          workspace: 'page-builder',
          resourceApiName: candidate.apiName
        });
      }
    }
  }
  for (const report of reports) {
    for (const field of draft.fields) {
      const referencesBaseField = report.objectApiName === draft.apiName && (
        report.fieldApiNames.includes(field.apiName)
        || report.groupByFieldApiNames.includes(field.apiName)
        || report.columnGroupByFieldApiName === field.apiName
        || report.sortFieldApiName === field.apiName
        || report.rowLimit.sortFieldApiName === field.apiName
        || report.filters.some((filter) => filter.fieldApiName === field.apiName)
        || report.standardFilters.dateFieldApiName === field.apiName
      );
      const referencesCrossFilter = report.crossFilters.some((crossFilter) =>
        crossFilter.childObjectApiName === draft.apiName
        && crossFilter.filters.some((filter) => filter.fieldApiName === field.apiName));
      if (referencesBaseField || referencesCrossFilter) {
        addDependency(report.label, field.apiName, 'Report', { workspace: 'report-builder', resourceApiName: report.apiName });
      }
    }
  }
  for (const dashboard of dashboards) {
    for (const filter of dashboard.filters) {
      if (filter.objectApiName === draft.apiName && draft.fields.some((field) => field.apiName === filter.fieldApiName)) {
        addDependency(dashboard.label, filter.fieldApiName, 'Dashboard Filter', {
          workspace: 'dashboard-builder',
          resourceApiName: dashboard.apiName
        });
      }
    }
    for (const component of dashboard.components) {
      for (const field of draft.fields) {
        if (component.objectApiName === draft.apiName
          && (component.measureFieldApiName === field.apiName
            || component.groupByFieldApiName === field.apiName
            || component.xAxisFieldApiName === field.apiName
            || component.displayFieldApiNames.includes(field.apiName)
            || hasFieldReference(component.properties, field.apiName))) {
          addDependency(dashboard.label, field.apiName, 'Dashboard Component', {
            workspace: 'dashboard-builder',
            resourceApiName: dashboard.apiName
          });
        }
      }
    }
  }
  const layouts = draft.pageLayouts ?? [];
  const compactLayouts = draft.compactLayouts ?? [];
  const relatedListOptions = objects.flatMap((childObject) => childObject.fields.flatMap((field) =>
    field.relationship?.targetObject === draft.apiName
      ? [{ value: field.relationship.childRelationshipName, alias: childObject.pluralLabel, label: `${childObject.pluralLabel} (${field.relationship.childRelationshipName})` }]
      : []
  )).filter((option, index, options) =>
    options.findIndex((candidate) => candidate.value.toLocaleLowerCase() === option.value.toLocaleLowerCase()) === index);
  const normalizeRelatedLists = (selected: string[]) => selected.map((name) =>
    relatedListOptions.find((option) => option.value.toLocaleLowerCase() === name.toLocaleLowerCase()
      || option.alias.toLocaleLowerCase() === name.toLocaleLowerCase())?.value ?? name
  );
  const recordTypes = draft.recordTypes ?? [];
  const selectedLayout = layouts.find((layout) => layout.id === selectedLayoutId) ?? layouts[0];
  const updateDraft = (update: Partial<ObjectMetadata>) => setDraft((current) => ({ ...current, ...update }));
  const updateObjectSettings = (update: Partial<ObjectSettingsMetadata>) => updateDraft({
    fields: update.trackFieldHistory === false
      ? draft.fields.map((field) => ({ ...field, trackHistory: false }))
      : draft.fields,
    settings: {
      allowReports: true,
      allowActivities: true,
      trackFieldHistory: false,
      allowInChatter: false,
      deploymentStatus: 'Deployed',
      recordNameType: 'Text',
      recordNameFormat: '',
      ...draft.settings,
      ...update
    }
  });
  const persistDraft = () => {
    void onSaveObject(draft).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to save object configuration'));
  };
  const refreshObject = () => {
    void onRefreshObject(draft.apiName).then(setDraft).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to refresh object metadata'));
  };
  const toggleFieldDependencies = async () => {
    if (showDependencies) {
      setShowDependencies(false);
      return;
    }
    setShowDependencies(true);
    setFieldDependenciesLoading(true);
    try {
      const [fieldPayload, objectPayload] = await Promise.all([
        apiRequest<{ fields: Array<{ fieldApiName: string; dependencies: string[] }> }>(
          `/metadata/objects/${encodeURIComponent(draft.apiName)}/field-dependencies`
        ),
        apiRequest<{ dependencies: string[] }>(
          `/metadata/objects/${encodeURIComponent(draft.apiName)}/dependencies`
        )
      ]);
      setPersistedFieldDependencies(fieldPayload.fields);
      setPersistedObjectDependencies(objectPayload.dependencies);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to load field dependencies');
    } finally {
      setFieldDependenciesLoading(false);
    }
  };
  const confirmDeleteObject = async () => {
    try {
      await onDeleteObject(draft.apiName);
      setShowDeleteObjectConfirmation(false);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to delete object');
    }
  };
  const updateLayout = (id: string, update: Partial<PageLayoutMetadata>) => updateDraft({
    pageLayouts: layouts.map((layout) => layout.id === id ? { ...layout, ...update } : layout)
  });
  const updateCompactLayout = (id: string, update: Partial<CompactLayoutMetadata>) => updateDraft({
    compactLayouts: compactLayouts.map((layout) => layout.id === id ? { ...layout, ...update } : layout)
  });
  const addCompactLayout = () => {
    const id = crypto.randomUUID();
    const compactLayout = { id, label: 'New Compact Layout', fieldApiNames: [] };
    updateDraft({ compactLayouts: [...compactLayouts, compactLayout] });
    setSelectedCompactLayoutId(id);
  };
  const removeCompactLayout = (id: string) => {
    if (compactLayouts.length <= 1) {
      onNotify('Each object must keep at least one compact layout');
      return;
    }
    const remaining = compactLayouts.filter((layout) => layout.id !== id);
    updateDraft({
      compactLayouts: remaining,
      compactLayoutAssignments: (draft.compactLayoutAssignments ?? []).filter((assignment) => assignment.compactLayoutId !== id)
    });
    if (selectedCompactLayoutId === id) setSelectedCompactLayoutId(remaining[0]?.id ?? '');
  };
  const saveCompactLayoutAssignment = () => {
    if (!selectedRecordTypeId || !selectedCompactLayoutId) return;
    const profileId = layoutProfileId.trim() || '*';
    const assignment = { profileId, recordTypeId: selectedRecordTypeId, compactLayoutId: selectedCompactLayoutId };
    updateDraft({
      compactLayoutAssignments: [
        ...(draft.compactLayoutAssignments ?? []).filter((item) => item.recordTypeId !== selectedRecordTypeId || item.profileId !== profileId),
        assignment
      ]
    });
  };
  const toggleRelatedList = (layout: PageLayoutMetadata, value: string) => {
    const selected = normalizeRelatedLists(layout.relatedLists);
    updateLayout(layout.id, {
      relatedLists: selected.includes(value) ? selected.filter((name) => name !== value) : [...selected, value]
    });
  };
  const updateCustomLink = (layout: PageLayoutMetadata, linkId: string, update: Partial<PageLayoutCustomLinkMetadata>) => {
    updateLayout(layout.id, {
      customLinks: (layout.customLinks ?? []).map((link) => link.id === linkId ? { ...link, ...update } : link)
    });
  };
  const addCustomLink = (layout: PageLayoutMetadata) => {
    if (!customLinkLabel.trim() || !customLinkUrl.trim()) {
      onNotify('Enter a label and URL for the custom link');
      return;
    }
    const link: PageLayoutCustomLinkMetadata = {
      id: crypto.randomUUID(),
      label: customLinkLabel.trim(),
      url: customLinkUrl.trim(),
      openInNewWindow: customLinkNewWindow
    };
    updateLayout(layout.id, { customLinks: [...(layout.customLinks ?? []), link] });
    setCustomLinkLabel('');
    setCustomLinkUrl('');
    setCustomLinkNewWindow(false);
  };
  const saveLayoutAssignment = () => {
    if (!selectedRecordTypeId || !assignedLayoutId) return;
    const profileId = layoutProfileId.trim() || '*';
    const assignments = draft.pageLayoutAssignments ?? [];
    const assignment = { profileId, recordTypeId: selectedRecordTypeId, pageLayoutId: assignedLayoutId };
    updateDraft({
      pageLayoutAssignments: [...assignments.filter((item) => item.recordTypeId !== selectedRecordTypeId || item.profileId !== profileId), assignment]
    });
  };
  const addLayout = () => {
    const id = `${draft.apiName}-layout-${Date.now()}`;
    const nameField = draft.fields.find((field) => field.apiName === 'Name')?.apiName ?? draft.fields[0]?.apiName;
    const layout: PageLayoutMetadata = {
      id, label: 'New Page Layout', sections: [{ id: `${id}-section`, label: 'Record Information', columns: 2, fieldApiNames: nameField ? [nameField] : [] }],
      relatedLists: [], actions: ['New', 'Edit', 'Delete'], customLinks: []
    };
    updateDraft({ pageLayouts: [...layouts, layout] });
    setSelectedLayoutId(id);
  };
  const removeLayout = (id: string) => {
    if (layouts.length <= 1) {
      onNotify('Each object must keep at least one page layout');
      return;
    }
    const remaining = layouts.filter((layout) => layout.id !== id);
    updateDraft({
      pageLayouts: remaining,
      pageLayoutAssignments: (draft.pageLayoutAssignments ?? []).filter((assignment) => assignment.pageLayoutId !== id)
    });
    if (selectedLayoutId === id) setSelectedLayoutId(remaining[0]?.id ?? '');
  };
  const removeRecordType = (id: string) => {
    if (recordTypes.length <= 1) {
      onNotify('Each object must keep at least one record type');
      return;
    }
    const assignedPageLayout = draft.pageLayoutAssignments?.find((assignment) => assignment.recordTypeId === id);
    if (assignedPageLayout) {
      onNotify('Remove this record type’s page layout assignment before deleting it');
      return;
    }
    const assignedCompactLayout = draft.compactLayoutAssignments?.find((assignment) => assignment.recordTypeId === id);
    if (assignedCompactLayout) {
      onNotify('Remove this record type’s compact layout assignment before deleting it');
      return;
    }
    const remaining = recordTypes.filter((recordType) => recordType.id !== id);
    const removedDefault = recordTypes.find((recordType) => recordType.id === id)?.isDefault;
    updateDraft({
      recordTypes: removedDefault ? remaining.map((recordType, index) => ({ ...recordType, isDefault: index === 0 })) : remaining
    });
    if (selectedRecordTypeId === id) setSelectedRecordTypeId(remaining[0]?.id ?? '');
  };
  const addRecordType = () => {
    const label = recordTypeLabel.trim();
    if (!label) return;
    const id = `${draft.apiName}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (recordTypes.some((recordType) => recordType.id === id)) {
      onNotify('A record type with this name already exists');
      return;
    }
    const developerNameBase = label.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    const developerName = /^[A-Za-z]/.test(developerNameBase) ? developerNameBase : `RecordType_${developerNameBase}`;
    if (recordTypes.some((item) => item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase()
      || item.developerName.toLocaleLowerCase() === developerName.toLocaleLowerCase())) {
      onNotify('A record type with this label or developer name already exists');
      return;
    }
    const recordType: RecordTypeMetadata = { id, label, developerName, description: '', active: true, isDefault: recordTypes.length === 0 };
    updateDraft({ recordTypes: [...recordTypes, recordType] });
    setSelectedRecordTypeId(id);
    setRecordTypeLabel('');
  };
  const toggleField = (selected: string[], apiName: string) => selected.includes(apiName)
    ? selected.filter((name) => name !== apiName)
    : [...selected, apiName];
  const renderDetails = () => (
    <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Details</h2><p>Manage the object’s labels and description.</p></div><div className="toolbar-actions">{draft.kind === 'Custom Object' && <button className="btn" onClick={() => setShowDeleteObjectConfirmation(true)}><Trash2 size={14} />Delete</button>}<button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div></div>
      <div className="object-edit-form">
        <label className="form-label">Label<input className="form-control" value={draft.label} onChange={(event) => updateDraft({ label: event.target.value })} /></label>
        <label className="form-label">Plural Label<input className="form-control" value={draft.pluralLabel} onChange={(event) => updateDraft({ pluralLabel: event.target.value })} /></label>
        <label className="form-label">Object Name<div className="form-display">{draft.apiName}</div></label>
        <label className="form-label">Description<textarea className="form-control" rows={4} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} /></label>
        <div className="form-display">Object Type: {draft.kind}</div>
        <div className="metadata-card"><h3>Object Features</h3>{([
          ['allowReports', 'Allow Reports'],
          ['allowActivities', 'Allow Activities'],
          ['trackFieldHistory', 'Track Field History'],
          ['allowInChatter', 'Allow in Chatter']
        ] as const).map(([key, label]) => <label className="metadata-row" key={key}><span>{label}</span><input type="checkbox" checked={draft.settings?.[key] ?? false} onChange={(event) => updateObjectSettings({ [key]: event.target.checked })} /></label>)}
          <label className="form-label">Deployment Status<select className="form-control" value={draft.settings?.deploymentStatus ?? 'Deployed'} onChange={(event) => updateObjectSettings({ deploymentStatus: event.target.value as ObjectSettingsMetadata['deploymentStatus'] })}><option>In Development</option><option>Deployed</option></select></label>
          <div className="info-callout">Record name: {draft.fields.find((field) => field.apiName === 'Name')?.label ?? 'Name'} · {draft.settings?.recordNameType ?? 'Text'}{draft.settings?.recordNameFormat ? ` · ${draft.settings.recordNameFormat}` : ''}</div>
        </div>
      </div>
      {showDeleteObjectConfirmation && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDeleteObjectConfirmation(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-object-title">
          <div className="modal-header"><h2 id="delete-object-title">Delete {draft.label}?</h2><button className="icon-button dark" onClick={() => setShowDeleteObjectConfirmation(false)} aria-label="Close"><X size={18} /></button></div>
          <p className="modal-copy">This permanently deletes the custom object metadata. Objects with records or dependencies cannot be deleted.</p>
          <div className="modal-actions"><button className="btn" onClick={() => setShowDeleteObjectConfirmation(false)}>Cancel</button><button className="btn btn-brand" onClick={() => void confirmDeleteObject()}>Delete Object</button></div>
        </section>
      </div>}
    </section>
  );
  const renderFields = () => (
    <>
      <div className="section-toolbar"><div><h2>Fields & Relationships</h2><p>Typed fields, formulas, and object relationships for {draft.label} records.</p></div><div className="toolbar-actions"><button className="btn" onClick={() => void toggleFieldDependencies()}><SlidersHorizontal size={14} />Metadata Dependencies</button><button className="btn btn-brand" onClick={onNewField}><Plus size={15} />New</button></div></div>
      {showDependencies && <section className="surface metadata-card"><div className="metadata-card-header"><h3>Metadata Dependencies</h3><button className="row-menu" aria-label="Close metadata dependencies" onClick={() => setShowDependencies(false)}><X size={14} /></button></div>
        {fieldDependenciesLoading ? <div className="empty-state">Checking saved metadata dependencies…</div>
          : <>{persistedObjectDependencies.length > 0 && <div className="table-scroll"><table className="slds-table"><thead><tr><th>Object</th><th>Deletion Blocker</th></tr></thead><tbody>{persistedObjectDependencies.map((dependency) => <tr key={dependency}><td className="api-name">{draft.apiName}</td><td>{dependency}</td></tr>)}</tbody></table></div>}
            {persistedFieldDependencies.length ? <div className="table-scroll"><table className="slds-table"><thead><tr><th>Field</th><th>Persisted Consumer / Deletion Blocker</th></tr></thead><tbody>{persistedFieldDependencies.flatMap((field) => field.dependencies.map((dependency) => <tr key={`${field.fieldApiName}-${dependency}`}><td className="api-name">{field.fieldApiName}</td><td>{dependency}</td></tr>))}</tbody></table></div>
              : persistedObjectDependencies.length === 0 && <div className="empty-state">No persisted consumers currently reference this object or its fields.</div>}</>}
        {dependencies.length > 0 && <div className="table-scroll"><h4>Open supported configuration</h4><table className="slds-table"><thead><tr><th>Used By</th><th>Depends On</th><th>Dependency Type</th></tr></thead><tbody>{dependencies.map((dependency, index) => <tr key={`${dependency.dependent}-${dependency.dependency}-${dependency.kind}-${index}`}><td>{dependency.target ? <button className="field-link" type="button" onClick={() => { if (dependency.target) onOpenDependency(dependency.target); }}>{dependency.dependent}</button> : dependency.dependent}</td><td className="api-name">{dependency.dependency}</td><td>{dependency.kind}</td></tr>)}</tbody></table></div>}
      </section>}
      <div className="surface field-surface">
        <div className="field-list-toolbar"><div className="results-count">{fields.length} of {draft.fields.length} fields · Sorted by Field Label</div><div className="field-list-actions"><div className="mini-search"><Search size={13} /><input aria-label="Search fields" placeholder="Search this list..." value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} /></div><button className="icon-button subtle" aria-label="Refresh fields" onClick={refreshObject}><RefreshCw size={15} /></button></div></div>
        <div className="table-scroll"><table className="slds-table"><thead><tr><th>Field Label</th><th>Field Name</th><th>Data Type</th><th>Relationship / Formula</th><th>Required</th><th>Unique</th><th>Track History</th></tr></thead>
          <tbody>{fields.map((field) => <tr key={field.apiName}><td><button className="field-link" onClick={() => setEditingField(field)}>{field.label}</button>{field.required && <span className="required-dot" title="Required">*</span>}</td><td className="api-name">{field.apiName}</td><td>{field.dataType}</td><td>{field.relationship ? `${field.relationship.type} → ${field.relationship.targetObject}` : field.formula?.expression ?? '—'}</td><td>{field.required ? 'Yes' : 'No'}</td><td>{field.unique ? 'Yes' : '—'}</td><td>{field.trackHistory ? 'Yes' : '—'}</td></tr>)}</tbody>
        </table></div>
        {fields.length === 0 && <div className="empty-state">No fields match your search.</div>}
        <div className="table-pagination"><span>1–{fields.length} of {fields.length}</span></div>
      </div>
    </>
  );
  const renderPageLayouts = () => (
    <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Page Layouts</h2><p>Arrange fields, related lists, and actions. Layout assignment is separate from Lightning page device activation.</p></div><div className="toolbar-actions"><button className="btn" onClick={addLayout}><Plus size={14} />New Layout</button><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div></div>
      <div className="object-editor-grid">
        <div className="object-editor-main">
          <label className="form-label">Page Layout<select className="form-control" value={selectedLayout?.id ?? ''} onChange={(event) => setSelectedLayoutId(event.target.value)}>{layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}</select></label>
          {selectedLayout && <>
            <div className="metadata-card-header"><label className="form-label">Layout Label<input className="form-control" value={selectedLayout.label} onChange={(event) => updateLayout(selectedLayout.id, { label: event.target.value })} /></label><button className="btn" onClick={() => removeLayout(selectedLayout.id)}><X size={14} />Delete Layout</button></div>
            {selectedLayout.sections.map((section) => <div className="metadata-card" key={section.id}>
              <div className="metadata-card-header"><input className="form-control" aria-label="Section name" value={section.label} onChange={(event) => updateLayout(selectedLayout.id, { sections: selectedLayout.sections.map((item) => item.id === section.id ? { ...item, label: event.target.value } : item) })} /><select className="form-control compact-select" aria-label="Section columns" value={section.columns} onChange={(event) => updateLayout(selectedLayout.id, { sections: selectedLayout.sections.map((item) => item.id === section.id ? { ...item, columns: Number(event.target.value) as 1 | 2 } : item) })}><option value={1}>1 column</option><option value={2}>2 columns</option></select><button className="row-menu" aria-label={`Remove ${section.label} section`} disabled={selectedLayout.sections.length <= 1} onClick={() => updateLayout(selectedLayout.id, { sections: selectedLayout.sections.filter((item) => item.id !== section.id) })}><X size={14} /></button></div>
              <FieldSelectorList fields={draft.fields} selected={section.fieldApiNames} onToggle={(apiName) => updateLayout(selectedLayout.id, { sections: selectedLayout.sections.map((item) => item.id === section.id ? { ...item, fieldApiNames: toggleField(item.fieldApiNames, apiName) } : item) })} />
            </div>)}
            <button className="text-action" onClick={() => updateLayout(selectedLayout.id, { sections: [...selectedLayout.sections, { id: `${selectedLayout.id}-section-${Date.now()}`, label: 'New Section', columns: 2, fieldApiNames: [] }] })}><Plus size={14} />Add Section</button>
            <div className="metadata-card"><h3>Related Lists</h3>
              {relatedListOptions.map((option) => <label className="metadata-row" key={option.value}><span>{option.label}</span><input type="checkbox" checked={normalizeRelatedLists(selectedLayout.relatedLists).includes(option.value)} onChange={() => toggleRelatedList(selectedLayout, option.value)} /></label>)}
              {selectedLayout.relatedLists.filter((name) => !relatedListOptions.some((option) =>
                option.value.toLocaleLowerCase() === name.toLocaleLowerCase() || option.alias.toLocaleLowerCase() === name.toLocaleLowerCase()
              )).map((name) => <label className="metadata-row" key={`unknown-${name}`}><span>Unavailable related list: {name}</span><input type="checkbox" checked onChange={() => updateLayout(selectedLayout.id, { relatedLists: selectedLayout.relatedLists.filter((item) => item !== name) })} /></label>)}
              {relatedListOptions.length === 0 && <p className="permission-help">No objects currently have a relationship to this object.</p>}
            </div>
            <div className="metadata-card"><h3>Page Actions</h3>{(['New', 'Edit', 'Delete'] as const).map((action) => <label className="metadata-row" key={action}><span>{action}</span><input type="checkbox" checked={selectedLayout.actions.includes(action)} onChange={() => updateLayout(selectedLayout.id, { actions: toggleField(selectedLayout.actions, action) })} /></label>)}</div>
            <div className="metadata-card">
              <h3>Custom Links</h3>
              {(selectedLayout.customLinks ?? []).map((link) => <div className="metadata-card" key={link.id}>
                <div className="metadata-card-header">
                  <label className="form-label">Link Label<input className="form-control" value={link.label} onChange={(event) => updateCustomLink(selectedLayout, link.id, { label: event.target.value })} /></label>
                  <button type="button" className="row-menu" aria-label={`Remove ${link.label} custom link`} onClick={() => updateLayout(selectedLayout.id, { customLinks: (selectedLayout.customLinks ?? []).filter((item) => item.id !== link.id) })}><X size={14} /></button>
                </div>
                <label className="form-label">URL<input className="form-control" value={link.url} onChange={(event) => updateCustomLink(selectedLayout, link.id, { url: event.target.value })} placeholder="https://example.com/{!Record.Id}" /></label>
                <label className="checkbox-row"><input type="checkbox" checked={link.openInNewWindow} onChange={(event) => updateCustomLink(selectedLayout, link.id, { openInNewWindow: event.target.checked })} />Open in new window</label>
              </div>)}
              <label className="form-label">New Link Label<input className="form-control" value={customLinkLabel} onChange={(event) => setCustomLinkLabel(event.target.value)} /></label>
              <label className="form-label">URL<input className="form-control" value={customLinkUrl} onChange={(event) => setCustomLinkUrl(event.target.value)} placeholder="https://example.com/{!Record.Id}" /></label>
              <label className="checkbox-row"><input type="checkbox" checked={customLinkNewWindow} onChange={(event) => setCustomLinkNewWindow(event.target.checked)} />Open in new window</label>
              <button type="button" className="btn" onClick={() => addCustomLink(selectedLayout)} disabled={!customLinkLabel.trim() || !customLinkUrl.trim()}><Plus size={14} />Add Custom Link</button>
              <p className="permission-help">Use <code>{'{!Record.Id}'}</code> or <code>{'{!Record.FieldApiName}'}</code> to include record values in a link.</p>
            </div>
          </>}
        </div>
        <div className="object-editor-side">
          <h3>Page Layout Assignment</h3><p>Assignments resolve by profile and record type.</p>
          <label className="form-label">Record Type<select className="form-control" value={selectedRecordTypeId} onChange={(event) => setSelectedRecordTypeId(event.target.value)}>{recordTypes.map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}</select></label>
          <label className="form-label">Profile<select className="form-control" aria-label="Profile for page layout assignment" value={layoutProfileId} onChange={(event) => setLayoutProfileId(event.target.value)}>
            <option value="*">All Profiles</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
          </select></label>
          <label className="form-label">Assigned Layout<select className="form-control" value={assignedLayoutId} onChange={(event) => setAssignedLayoutId(event.target.value)}>{layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}</select></label>
          <button className="btn" onClick={saveLayoutAssignment} disabled={!selectedRecordTypeId || !assignedLayoutId}><Plus size={14} />Add / Update Assignment</button>
          <div className="assignment-list">{(draft.pageLayoutAssignments ?? []).map((assignment) => <div className="metadata-row" key={`${assignment.profileId}-${assignment.recordTypeId}`}><span><strong>{assignment.profileId === '*' ? 'All Profiles' : profiles.find((profile) => profile.id === assignment.profileId)?.label ?? assignment.profileId}</strong><small>{recordTypes.find((recordType) => recordType.id === assignment.recordTypeId)?.label ?? assignment.recordTypeId} · {layouts.find((layout) => layout.id === assignment.pageLayoutId)?.label ?? assignment.pageLayoutId}</small></span><button className="row-menu" aria-label="Remove page layout assignment" onClick={() => updateDraft({ pageLayoutAssignments: (draft.pageLayoutAssignments ?? []).filter((item) => item !== assignment) })}><X size={14} /></button></div>)}</div>
          <div className="info-callout">Phone and desktop Lightning Record Page activation is managed separately in Lightning App Builder. Tablet uses responsive page rendering.</div>
        </div>
      </div>
    </section>
  );
  const renderRecordTypes = () => (
    <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Record Types</h2><p>Define record variations and choose their default page layout.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div>
      <div className="record-type-create"><input className="form-control" aria-label="New record type label" placeholder="New record type label" value={recordTypeLabel} onChange={(event) => setRecordTypeLabel(event.target.value)} /><button className="btn" onClick={addRecordType} disabled={!recordTypeLabel.trim()}><Plus size={14} />Add Record Type</button></div>
      <table className="slds-table"><thead><tr><th>Label</th><th>Developer Name</th><th>Active</th><th>Default</th><th /></tr></thead><tbody>{recordTypes.map((recordType) => <tr key={recordType.id}><td><input className="form-control" maxLength={80} value={recordType.label} onChange={(event) => updateDraft({ recordTypes: recordTypes.map((item) => item.id === recordType.id ? { ...item, label: event.target.value } : item) })} /></td><td><input className="form-control api-name" maxLength={80} value={recordType.developerName} onChange={(event) => updateDraft({ recordTypes: recordTypes.map((item) => item.id === recordType.id ? { ...item, developerName: event.target.value.replace(/[^A-Za-z0-9_]/g, '_') } : item) })} /></td><td><input aria-label={`Active ${recordType.label}`} type="checkbox" disabled={recordType.isDefault} checked={recordType.active} onChange={(event) => updateDraft({ recordTypes: recordTypes.map((item) => item.id === recordType.id ? { ...item, active: event.target.checked } : item) })} /></td><td><input aria-label={`Default ${recordType.label}`} type="radio" name="default-record-type" checked={recordType.isDefault} disabled={!recordType.active} onChange={() => updateDraft({ recordTypes: recordTypes.map((item) => ({ ...item, isDefault: item.id === recordType.id })) })} /></td><td><button className="row-menu" aria-label={`Delete ${recordType.label}`} disabled={recordTypes.length <= 1} onClick={() => {
        if (!window.confirm(`Delete record type "${recordType.label}"? Existing records, permission assignments, and page assignments must be removed first.`)) return;
        removeRecordType(recordType.id);
      }}><X size={14} /></button></td></tr>)}</tbody></table>
      {recordTypes.map((recordType) => <label className="form-label" key={`${recordType.id}-description`}>{recordType.label} Description
        <textarea className="form-control" rows={2} maxLength={1000} value={recordType.description ?? ''}
          onChange={(event) => updateDraft({ recordTypes: recordTypes.map((item) => item.id === recordType.id ? { ...item, description: event.target.value } : item) })} />
      </label>)}
      <p className="permission-help">Picklist values below act as the available process options for each record type. Defaults must be included in every applicable record type.</p>
      {recordTypes.map((recordType) => <details className="permission-field-group" key={`${recordType.id}-picklists`}>
        <summary>{recordType.label} picklist values</summary>
        {draft.fields.filter((field) => field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist').map((field) => {
          const key = `${recordType.id}.${field.apiName}`;
          return <label className="form-label" key={key}>{field.label}
            <textarea className="form-control" rows={3} aria-label={`${recordType.label} ${field.label} values`}
              value={recordTypePicklistDrafts[key] ?? ''}
              placeholder={(field.picklistValues ?? []).join('\n')}
              onChange={(event) => setRecordTypePicklistDrafts((current) => ({ ...current, [key]: event.target.value }))}
              onBlur={() => {
                const values = (recordTypePicklistDrafts[key] ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                updateDraft({ recordTypes: recordTypes.map((item) => item.id === recordType.id ? {
                  ...item,
                  picklistValues: { ...item.picklistValues, [field.apiName]: [...new Set(values)] }
                } : item) });
              }} />
            <small>Enter one allowed value per line. Leave blank to allow no values for this record type.</small>
          </label>;
        })}
        {!draft.fields.some((field) => field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist') && <p className="permission-help">Add a picklist field to configure record-type-specific values.</p>}
      </details>)}
    </section>
  );
  const renderCompactLayout = () => (
    <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Compact Layouts</h2><p>Choose highlights fields and assign a compact layout by profile and record type.</p></div><div className="toolbar-actions"><button className="btn" onClick={addCompactLayout}><Plus size={14} />New Compact Layout</button><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div></div>
      <div className="object-editor-grid">
        <div className="object-editor-main">
          <label className="form-label">Compact Layout<select className="form-control" value={selectedCompactLayoutId} onChange={(event) => setSelectedCompactLayoutId(event.target.value)}>
            {compactLayouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
          </select></label>
          {compactLayouts.map((layout) => layout.id === selectedCompactLayoutId && <div key={layout.id}>
            <div className="metadata-card-header">
              <label className="form-label">Compact Layout Label<input className="form-control" value={layout.label} onChange={(event) => updateCompactLayout(layout.id, { label: event.target.value })} /></label>
              <button type="button" className="btn" disabled={compactLayouts.length <= 1} onClick={() => removeCompactLayout(layout.id)}><X size={14} />Delete</button>
            </div>
            <FieldSelectorList fields={draft.fields} selected={layout.fieldApiNames} onToggle={(apiName) => updateCompactLayout(layout.id, { fieldApiNames: toggleField(layout.fieldApiNames, apiName) })} />
          </div>)}
        </div>
        <div className="object-editor-side">
          <h3>Compact Layout Assignment</h3>
          <label className="form-label">Record Type<select className="form-control" value={selectedRecordTypeId} onChange={(event) => setSelectedRecordTypeId(event.target.value)}>
            {recordTypes.filter((recordType) => recordType.active).map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}
          </select></label>
          <label className="form-label">Profile<select className="form-control" aria-label="Profile for compact layout assignment" value={layoutProfileId} onChange={(event) => setLayoutProfileId(event.target.value)}>
            <option value="*">All Profiles</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
          </select></label>
          <button className="btn" onClick={saveCompactLayoutAssignment} disabled={!selectedRecordTypeId || !selectedCompactLayoutId}><Plus size={14} />Add / Update Assignment</button>
          <div className="assignment-list">{(draft.compactLayoutAssignments ?? []).map((assignment) => <div className="metadata-row" key={`${assignment.profileId}-${assignment.recordTypeId}`}>
            <span><strong>{assignment.profileId === '*' ? 'All Profiles' : profiles.find((profile) => profile.id === assignment.profileId)?.label ?? assignment.profileId}</strong>
              <small>{recordTypes.find((recordType) => recordType.id === assignment.recordTypeId)?.label ?? assignment.recordTypeId} · {compactLayouts.find((layout) => layout.id === assignment.compactLayoutId)?.label ?? assignment.compactLayoutId}</small></span>
            <button className="row-menu" aria-label="Remove compact layout assignment" onClick={() => updateDraft({ compactLayoutAssignments: (draft.compactLayoutAssignments ?? []).filter((item) => item !== assignment) })}><X size={14} /></button>
          </div>)}</div>
        </div>
      </div>
    </section>
  );
  const renderFieldSets = () => {
    const fieldSets = draft.fieldSets ?? [];
    const moveField = (fieldSetApiName: string, fieldApiName: string, offset: -1 | 1) => {
      const fieldSet = fieldSets.find((item) => item.apiName === fieldSetApiName);
      if (!fieldSet) return;
      const currentIndex = fieldSet.fieldApiNames.indexOf(fieldApiName);
      const nextIndex = currentIndex + offset;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= fieldSet.fieldApiNames.length) return;
      const fieldApiNames = [...fieldSet.fieldApiNames];
      fieldApiNames.splice(currentIndex, 1);
      fieldApiNames.splice(nextIndex, 0, fieldApiName);
      updateDraft({ fieldSets: fieldSets.map((item) => item.apiName === fieldSetApiName ? { ...item, fieldApiNames } : item) });
    };
    return <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Field Sets</h2><p>Reusable field groups for configurable views and integrations.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div>
      <div className="record-type-create"><input className="form-control" aria-label="New field set label" placeholder="New field set label" maxLength={80} value={fieldSetLabel} onChange={(event) => {
        const label = event.target.value;
        const baseName = label.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        setFieldSetLabel(label);
        setFieldSetApiName(/^[a-zA-Z]/.test(baseName) ? baseName : baseName ? `FieldSet_${baseName}` : '');
      }} /><input className="form-control api-name" aria-label="New field set API name" placeholder="API name" maxLength={255} value={fieldSetApiName} onChange={(event) => setFieldSetApiName(event.target.value)} /><button className="btn" onClick={() => {
        const label = fieldSetLabel.trim();
        const apiName = fieldSetApiName.trim();
        if (!label || !/^[A-Za-z][A-Za-z0-9_]{0,254}$/.test(apiName)) { onNotify('Enter a valid field set label and API name'); return; }
        if (fieldSets.some((item) => item.apiName.toLocaleLowerCase() === apiName.toLocaleLowerCase()
          || item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) { onNotify('A field set with this label or API name already exists'); return; }
        updateDraft({ fieldSets: [...fieldSets, { apiName, label, fieldApiNames: [] }] });
        setFieldSetLabel('');
        setFieldSetApiName('');
      }} disabled={!fieldSetLabel.trim() || !/^[A-Za-z][A-Za-z0-9_]{0,254}$/.test(fieldSetApiName.trim())}><Plus size={14} />New Field Set</button></div>
      {fieldSets.map((fieldSet, fieldSetIndex) => <div className="metadata-card" key={`field-set-${fieldSetIndex}`}>
        <div className="metadata-card-header"><label className="form-label">Field Set Label<input className="form-control" maxLength={80} value={fieldSet.label} onChange={(event) => updateDraft({ fieldSets: fieldSets.map((item) => item.apiName === fieldSet.apiName ? { ...item, label: event.target.value } : item) })} /></label>
          <label className="form-label">API Name<input className="form-control api-name" maxLength={255} value={fieldSet.apiName} onChange={(event) => updateDraft({ fieldSets: fieldSets.map((item) => item.apiName === fieldSet.apiName ? { ...item, apiName: event.target.value } : item) })} /></label>
          <button className="row-menu" aria-label={`Delete field set ${fieldSet.label}`} onClick={() => {
            if (!window.confirm(`Delete field set "${fieldSet.label}"? Record-detail field-set views will no longer offer it.`)) return;
            updateDraft({ fieldSets: fieldSets.filter((item) => item.apiName !== fieldSet.apiName) });
          }}><X size={14} /></button></div>
        <FieldSelectorList fields={draft.fields} selected={fieldSet.fieldApiNames} onToggle={(apiName) => updateDraft({ fieldSets: fieldSets.map((item) => item.apiName === fieldSet.apiName ? { ...item, fieldApiNames: toggleField(item.fieldApiNames, apiName) } : item) })} />
        <div className="assignment-list" aria-label={`${fieldSet.label} field order`}>{fieldSet.fieldApiNames.map((apiName, index) => <div className="metadata-row" key={apiName}>
          <span><strong>{index + 1}. {draft.fields.find((field) => field.apiName === apiName)?.label ?? apiName}</strong><small>{apiName}</small></span>
          <div className="toolbar-actions"><button type="button" className="icon-button subtle" aria-label={`Move ${apiName} up in ${fieldSet.label}`} disabled={index === 0} onClick={() => moveField(fieldSet.apiName, apiName, -1)}><ArrowUp size={13} /></button>
            <button type="button" className="icon-button subtle" aria-label={`Move ${apiName} down in ${fieldSet.label}`} disabled={index === fieldSet.fieldApiNames.length - 1} onClick={() => moveField(fieldSet.apiName, apiName, 1)}><ArrowDown size={13} /></button></div>
        </div>)}</div>
        {!fieldSet.fieldApiNames.length && <div className="empty-state">This field set is empty; its runtime consumer will show an empty-state message.</div>}
      </div>)}
      {fieldSets.length === 0 && <div className="empty-state">No field sets are defined.</div>}
    </section>;
  };
  const renderSearchLayouts = () => {
    const searchLayouts = draft.searchLayouts ?? {};
    const options = ['searchResults', 'lookupDialog', 'lookupPhoneDialog'] as const;
    return <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Search Layouts</h2><p>Configure fields shown in object search and lookup dialogs.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div>
      {options.map((name) => <div className="metadata-card" key={name}><h3>{name === 'searchResults' ? 'Search Results' : name === 'lookupDialog' ? 'Lookup Dialog' : 'Lookup Phone Dialog'}</h3><FieldSelectorList fields={draft.fields} selected={searchLayouts[name] ?? []} onToggle={(apiName) => updateDraft({ searchLayouts: { ...searchLayouts, [name]: toggleField(searchLayouts[name] ?? [], apiName) } })} /></div>)}
    </section>;
  };
  const renderActions = () => {
    const actions = draft.actions ?? [];
    const writableFields = draft.fields.filter((field) => !field.formula && !field.relationship
      && field.dataType !== 'AutoNumber' && field.dataType !== 'Auto Number');
    const addCustomAction = () => {
      const label = customActionLabel.trim();
      if (!label || !customActionFieldApiName) return;
      if (actions.some((action) => action.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
        onNotify('An action with this label already exists');
        return;
      }
      if (['new', 'edit', 'delete'].includes(label.toLocaleLowerCase())) {
        onNotify('Custom actions cannot reuse standard action labels');
        return;
      }
      const action: ObjectActionMetadata = {
        id: `custom-${Date.now()}`, label, type: 'Custom', enabled: true,
        behavior: 'Set Field Value', fieldApiName: customActionFieldApiName, value: customActionValue
      };
      updateDraft({ actions: [...actions, action] });
      setCustomActionLabel('');
      setCustomActionFieldApiName('');
      setCustomActionValue('');
    };
    return <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Buttons, Links, and Actions</h2><p>Configure supported record actions. Custom actions currently update one field when run.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div>
      <div className="metadata-card"><h3>Object Actions</h3>{actions.map((action) => <div className="metadata-card" key={action.id}>
        <div className="metadata-row"><span><strong>{action.label}</strong><small>{action.type === 'Standard' ? 'Standard record action' : action.behavior === 'Set Field Value' ? `Sets ${draft.fields.find((field) => field.apiName === action.fieldApiName)?.label ?? action.fieldApiName} to the configured value` : 'Needs a supported behavior configured'}</small></span><input aria-label={`Enable ${action.label} action`} type="checkbox" checked={action.enabled} onChange={(event) => updateDraft({ actions: actions.map((item) => item.id === action.id ? { ...item, enabled: event.target.checked } : item) })} />{action.type === 'Custom' && <button className="row-menu" aria-label={`Delete ${action.label} action`} onClick={() => updateDraft({ actions: actions.filter((item) => item.id !== action.id) })}><X size={14} /></button>}</div>
        {action.type === 'Custom' && <div className="record-type-create">
          <select className="form-control" aria-label={`Target field for ${action.label}`} value={action.fieldApiName ?? ''} onChange={(event) => updateDraft({ actions: actions.map((item) => item.id === action.id ? { ...item, behavior: 'Set Field Value', fieldApiName: event.target.value } : item) })}>
            <option value="">Choose field</option>{writableFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
          </select>
          <input className="form-control" aria-label={`Value for ${action.label}`} placeholder="Value to set" value={action.value ?? ''} onChange={(event) => updateDraft({ actions: actions.map((item) => item.id === action.id ? { ...item, behavior: 'Set Field Value', value: event.target.value } : item) })} />
        </div>}
      </div>)}
      <div className="record-type-create">
        <input className="form-control" aria-label="New custom action" placeholder="Custom action label" value={customActionLabel} onChange={(event) => setCustomActionLabel(event.target.value)} />
        <select className="form-control" aria-label="Custom action target field" value={customActionFieldApiName} onChange={(event) => setCustomActionFieldApiName(event.target.value)}>
          <option value="">Choose field</option>{writableFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
        </select>
        <input className="form-control" aria-label="Custom action field value" placeholder="Value to set" value={customActionValue} onChange={(event) => setCustomActionValue(event.target.value)} />
        <button className="btn" onClick={addCustomAction} disabled={!customActionLabel.trim() || !customActionFieldApiName}><Plus size={14} />Add Action</button>
      </div></div>
    </section>;
  };
  const renderLightningRecordPages = () => {
    const pageMatches = page.targetObject === draft.apiName && page.pageType === 'Record Page';
    const assignments = pageMatches ? page.activationAssignments ?? [] : [];
    const addActivation = () => {
      if (!pageMatches) {
        onNotify('Create and save a record page for this object in Lightning App Builder first');
        return;
      }
      if (!activationFormFactors.length) {
        onNotify('Select at least one form factor');
        return;
      }
      const assignment: PageActivationAssignmentMetadata = {
        id: `activation-${crypto.randomUUID()}`,
        scope: activationScope,
        appId: activationScope === 'Org Default' ? null : activationAppId.trim() || null,
        profileId: activationScope === 'App and Profile' || activationScope === 'App, Record Type, and Profile' ? activationProfileId.trim() || null : null,
        recordTypeId: activationScope === 'App, Record Type, and Profile' ? selectedRecordTypeId || null : null,
        formFactors: activationFormFactors
      };
      if (assignment.scope !== 'Org Default' && !assignment.appId) {
        onNotify('An app name is required for this activation scope');
        return;
      }
      if (assignment.appId && !/^[A-Za-z][A-Za-z0-9_]*$/.test(assignment.appId)) {
        onNotify('App API Name must start with a letter and contain only letters, numbers, and underscores');
        return;
      }
      if (assignment.scope === 'App and Profile' && !assignment.profileId) {
        onNotify('Select a profile for this activation scope');
        return;
      }
      if (assignment.scope === 'App, Record Type, and Profile' && (!assignment.profileId || !assignment.recordTypeId)) {
        onNotify('Select a record type and profile for this activation scope');
        return;
      }
      void onSavePage({ ...page, activationAssignments: [...assignments, assignment] }).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to save page activation'));
    };
    return <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Lightning Record Pages</h2><p>Page composition is separate from page layouts; activation resolves by app, profile, record type, and form factor.</p></div><button className="btn btn-brand" onClick={onOpenPageBuilder}><ExternalLink size={14} />Open App Builder</button></div>
      {!pageMatches ? <div className="empty-state">No saved Lightning Record Page is selected for {draft.label}.</div> : <>
        <div className="metadata-card"><h3>{page.label}</h3><p>{page.status} · {page.components.length} components</p></div>
        <div className="metadata-card">
          <h3>Activation Assignment</h3>
          <label className="form-label">Assign as<select className="form-control" value={activationScope} onChange={(event) => setActivationScope(event.target.value as PageActivationAssignmentMetadata['scope'])}><option>Org Default</option><option>App Default</option><option>App and Profile</option><option>App, Record Type, and Profile</option></select></label>
          {activationScope !== 'Org Default' && <label className="form-label">App API Name<input className="form-control" list={`lightning-page-apps-${object.apiName}`} value={activationAppId} onChange={(event) => setActivationAppId(event.target.value)} placeholder="For example, Sales" /><datalist id={`lightning-page-apps-${object.apiName}`}>{activationAppIds.map((appId) => <option key={appId} value={appId} />)}</datalist></label>}
          {activationScope === 'App and Profile' && <label className="form-label">Profile<select className="form-control" value={activationProfileId} onChange={(event) => setActivationProfileId(event.target.value)}><option value="">Select a profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>}
          {activationScope === 'App, Record Type, and Profile' && <>
            <label className="form-label">Record Type<select className="form-control" value={selectedRecordTypeId} onChange={(event) => setSelectedRecordTypeId(event.target.value)}>{recordTypes.filter((recordType) => recordType.active).map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}</select></label>
            <label className="form-label">Profile<select className="form-control" value={activationProfileId} onChange={(event) => setActivationProfileId(event.target.value)}><option value="">Select a profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
          </>}
          <div className="form-label">Form Factors</div>
          <div className="form-options">{(['Desktop', 'Phone'] as const).map((formFactor) => <label className="checkbox-row" key={formFactor}><input type="checkbox" disabled={!page.devices.includes(formFactor)} checked={activationFormFactors.includes(formFactor) && page.devices.includes(formFactor)} onChange={() => setActivationFormFactors((current) => current.includes(formFactor) ? current.filter((item) => item !== formFactor) : [...current, formFactor])} />{formFactor}</label>)}</div>
          <div className="info-callout">Tablet is available as a responsive preview in App Builder; it is not a separate Salesforce form-factor activation target.</div>
          <button className="btn btn-brand" onClick={addActivation}><Plus size={14} />Add Assignment</button>
        </div>
        {assignments.map((assignment) => <div className="metadata-row" key={assignment.id}><span><strong>{assignment.scope}</strong><small>{assignment.appId ?? 'All apps'} · {recordTypes.find((item) => item.id === assignment.recordTypeId)?.label ?? 'All record types'} · {profiles.find((item) => item.id === assignment.profileId)?.label ?? 'All profiles'} · {assignment.formFactors.join(', ')}</small></span><button className="row-menu" aria-label="Remove page assignment" onClick={() => {
          const activationAssignments = assignments.filter((item) => item.id !== assignment.id);
          void onSavePage({ ...page, status: activationAssignments.length ? page.status : 'Draft', activationAssignments })
            .catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to remove activation assignment'));
        }}><X size={14} /></button></div>)}
        {assignments.length === 0 && <div className="empty-state">This page has no activation assignments yet.</div>}
      </>}
    </section>;
  };
  const renderLookupFilters = () => {
    const filters = draft.relatedLookupFilters ?? [];
    const relationshipFields = draft.fields.filter((field) => field.relationship);
    const valueNotRequired = filterOperator === 'Is Null' || filterOperator === 'Is Not Null';
    const addFilter = () => {
      if (!filterField || !filterRelatedObject || !filterRelatedField || (filterValueMode === 'Field' && !valueNotRequired && !filterValueFieldApiName)) return;
      const filter: RelatedLookupFilterMetadata = {
        id: `lookup-filter-${crypto.randomUUID()}`,
        fieldApiName: filterField,
        relatedObject: filterRelatedObject,
        relatedFieldApiName: filterRelatedField,
        operator: filterOperator,
        value: valueNotRequired || filterValueMode === 'Field' ? '' : filterValue,
        ...(filterValueMode === 'Field' && !valueNotRequired ? { valueFieldApiName: filterValueFieldApiName } : {}),
        required: false
      };
      updateDraft({ relatedLookupFilters: [...filters, filter] });
      setFilterValue('');
      setFilterValueFieldApiName('');
    };
    return <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>Related Lookup Filters</h2><p>Restrict the records users can select in relationship fields.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div>
      <div className="record-type-create">
        <select className="form-control" aria-label="Relationship field" value={filterField} onChange={(event) => {
          const field = relationshipFields.find((item) => item.apiName === event.target.value);
          setFilterField(event.target.value);
          setFilterRelatedObject(field?.relationship?.targetObject ?? '');
          setFilterRelatedField('');
        }}><option value="">Relationship field</option>{relationshipFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select>
        <select className="form-control" aria-label="Related field" value={filterRelatedField} onChange={(event) => setFilterRelatedField(event.target.value)}><option value="">Related field</option>{(objects.find((item) => item.apiName === filterRelatedObject)?.fields ?? []).map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}</select>
        <select className="form-control" aria-label="Filter operator" value={filterOperator} onChange={(event) => {
          const operator = event.target.value as RelatedLookupFilterMetadata['operator'];
          setFilterOperator(operator);
          if (operator === 'Is Null' || operator === 'Is Not Null') setFilterValue('');
        }}>{relatedLookupFilterOperators.map((operator) => <option key={operator}>{operator}</option>)}</select>
        {!valueNotRequired && <>
          <select className="form-control" aria-label="Compare against" value={filterValueMode} onChange={(event) => setFilterValueMode(event.target.value as 'Value' | 'Field')}><option value="Value">A value</option><option value="Field">A field on this object</option></select>
          {filterValueMode === 'Field'
            ? <select className="form-control" aria-label="Source field" value={filterValueFieldApiName} onChange={(event) => setFilterValueFieldApiName(event.target.value)}><option value="">Source field</option>{draft.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}</select>
            : <input className="form-control" aria-label="Filter value" placeholder="Value" value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />}
        </>}
        <button className="btn" onClick={addFilter} disabled={!filterField || !filterRelatedObject || !filterRelatedField || (filterValueMode === 'Field' && !valueNotRequired && !filterValueFieldApiName)}><Plus size={14} />Add Filter</button>
      </div>
      {filters.map((filter) => <div className="metadata-row" key={filter.id}><span><strong>{filter.fieldApiName}</strong><small>{filter.relatedObject}.{filter.relatedFieldApiName} {filter.operator}{filter.valueFieldApiName ? ` ${filter.valueFieldApiName}` : filter.operator === 'Is Null' || filter.operator === 'Is Not Null' ? '' : ` ${filter.value}`}</small><select className="form-control compact-select" aria-label={`Operator for ${filter.fieldApiName}`} value={filter.operator} onChange={(event) => {
        const operator = event.target.value as RelatedLookupFilterMetadata['operator'];
        const valueNotRequired = operator === 'Is Null' || operator === 'Is Not Null';
        updateDraft({ relatedLookupFilters: filters.map((item) => item.id === filter.id ? { ...item, operator, value: valueNotRequired ? '' : item.value, ...(valueNotRequired ? { valueFieldApiName: undefined } : {}) } : item) });
      }}>{relatedLookupFilterOperators.map((operator) => <option key={operator}>{operator}</option>)}</select>
      <select className="form-control compact-select" aria-label={`Comparison source for ${filter.fieldApiName}`} value={filter.valueFieldApiName ? 'Field' : 'Value'} disabled={filter.operator === 'Is Null' || filter.operator === 'Is Not Null'} onChange={(event) => updateDraft({ relatedLookupFilters: filters.map((item) => item.id === filter.id ? { ...item, value: '', valueFieldApiName: event.target.value === 'Field' ? draft.fields[0]?.apiName : undefined } : item) })}><option value="Value">Value</option><option value="Field">Field</option></select>
      {filter.valueFieldApiName
        ? <select className="form-control compact-select" aria-label={`Source field for ${filter.fieldApiName}`} value={filter.valueFieldApiName} onChange={(event) => updateDraft({ relatedLookupFilters: filters.map((item) => item.id === filter.id ? { ...item, valueFieldApiName: event.target.value } : item) })}>{draft.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select>
        : <input className="form-control compact-select" aria-label={`Value for ${filter.fieldApiName}`} value={filter.value} disabled={filter.operator === 'Is Null' || filter.operator === 'Is Not Null'} onChange={(event) => updateDraft({ relatedLookupFilters: filters.map((item) => item.id === filter.id ? { ...item, value: event.target.value } : item) })} />}
      </span><label className="checkbox-row"><input type="checkbox" checked={filter.required} onChange={(event) => updateDraft({ relatedLookupFilters: filters.map((item) => item.id === filter.id ? { ...item, required: event.target.checked } : item) })} />Required</label><button className="row-menu" aria-label="Remove lookup filter" onClick={() => {
        const remainingFilters = filters.filter((item) => item.id !== filter.id);
        const remainingLogic = { ...draft.relatedLookupFilterLogic };
        if (!remainingFilters.some((item) => item.fieldApiName === filter.fieldApiName)) delete remainingLogic[filter.fieldApiName];
        updateDraft({ relatedLookupFilters: remainingFilters, relatedLookupFilterLogic: remainingLogic });
      }}><X size={14} /></button></div>)}
      {relationshipFields.map((field) => {
        const fieldFilters = filters.filter((filter) => filter.fieldApiName === field.apiName);
        if (fieldFilters.length < 2) return null;
        return <label className="form-label" key={`logic-${field.apiName}`}>Required criteria match for {field.label}
          <select className="form-control" aria-label={`Lookup filter logic for ${field.label}`} value={draft.relatedLookupFilterLogic?.[field.apiName] ?? 'All'} onChange={(event) => {
            const relatedLookupFilterLogic = { ...draft.relatedLookupFilterLogic };
            if (event.target.value === 'All') delete relatedLookupFilterLogic[field.apiName];
            else relatedLookupFilterLogic[field.apiName] = event.target.value as 'Any';
            updateDraft({ relatedLookupFilterLogic });
          }}>
            <option value="All">All criteria</option><option value="Any">Any criterion</option>
          </select>
        </label>;
      })}
      {relationshipFields.length === 0 && <div className="empty-state">Create a lookup or master-detail field to configure a related lookup filter.</div>}
    </section>;
  };
  const renderListViewButtons = () => {
    const supportsOwnership = draft.fields.some((field) =>
      field.apiName === 'OwnerId' && field.relationship?.targetObject === 'User');
    const standard = [
      ...(draft.apiName === 'User' ? [] : ['New', 'Import', 'Bulk Update', 'Mass Delete']),
      ...(supportsOwnership ? ['Change Owner'] : []),
      'Printable View',
      ...(draft.apiName === 'Contact' && objects.some((item) => item.apiName === 'Campaign') ? ['Add to Campaign'] : [])
    ];
    const selected = draft.listViewButtons ?? [];
    return <section className="surface object-setting-surface">
      <div className="section-toolbar"><div><h2>List View Button Layout</h2><p>Select buttons available in this object’s list views.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div>
      {standard.map((label) => <label className="metadata-row" key={label}><span>{label}</span><input type="checkbox" checked={selected.includes(label)} onChange={() => updateDraft({ listViewButtons: toggleField(selected, label) })} /></label>)}
    </section>;
  };
  const renderHistory = () => <section className="surface object-setting-surface">
    <div className="section-toolbar"><div><h2>Metadata Change History</h2>
      <p>Last 300 tenant metadata changes are retained; revisions are read-only snapshots.</p>
    </div><span>Current revision {object.revision ?? 0}</span></div>
    {historyLoading && <p role="status">Loading history...</p>}
    {metadataHistoryError && <p role="alert" className="form-error">{metadataHistoryError}</p>}
    {!historyLoading && metadataChanges.length === 0 && <p>No saved metadata changes.</p>}
    <div className="metadata-history-list">
      {metadataChanges.map((change) => <div className="metadata-row" key={change.revision}>
        <span><strong>Revision {change.revision}: {change.action.replaceAll('_', ' ')}</strong>
        <small>{new Date(change.at).toLocaleString()} · User {change.actorUserId}</small></span>
        <button className="btn" type="button" onClick={() => void openMetadataSnapshot(change.revision)}>
          View snapshot
        </button>
      </div>)}
    </div>
    {selectedSnapshot && <div className="metadata-card">
      <h3>Revision {selectedSnapshot.revision} snapshot</h3>
      <p>Read-only. Use normal Object Manager saves for validated changes.</p>
      <pre style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(selectedSnapshot.after ?? selectedSnapshot.before ?? {}, null, 2)}
      </pre>
    </div>}
  </section>;
  const renderSetting = () => {
    if (selectedSetting === 'Schema Builder') return <SchemaBuilder objects={objects} selectedObjectApiName={object.apiName} onOpenObject={onObjectSelect} onCreateObject={onCreateObject} onNewField={onNewField} />;
    if (selectedSetting === 'Change History') return renderHistory();
    if (selectedSetting === 'Details') return renderDetails();
    if (selectedSetting === 'Fields & Relationships') return renderFields();
    if (selectedSetting === 'Page Layouts') return renderPageLayouts();
    if (selectedSetting === 'Record Types') return renderRecordTypes();
    if (selectedSetting === 'Compact Layouts') return renderCompactLayout();
    if (selectedSetting === 'Field Sets') return renderFieldSets();
    if (selectedSetting === 'Search Layouts') return renderSearchLayouts();
    if (selectedSetting === 'Buttons, Links, and Actions') return renderActions();
    if (selectedSetting === 'Related Lookup Filters') return renderLookupFilters();
    if (selectedSetting === 'List View Button Layout') return renderListViewButtons();
    if (selectedSetting === 'Lightning Record Pages') return renderLightningRecordPages();
    if (selectedSetting === 'Object Limits') return <section className="surface object-setting-surface"><div className="section-toolbar"><div><h2>Object Limits</h2><p>Metadata usage counts only; this view does not define or enforce platform caps.</p></div></div><div className="limit-grid"><div><strong>{draft.fields.length}</strong><span>Fields</span></div><div><strong>{draft.pageLayouts?.length ?? 0}</strong><span>Page Layouts</span></div><div><strong>{draft.recordTypes?.length ?? 0}</strong><span>Record Types</span></div><div><strong>{draft.fieldSets?.length ?? 0}</strong><span>Field Sets</span></div></div></section>;
    return <section className="surface object-setting-surface"><div className="section-toolbar"><div><h2>{selectedSetting}</h2><p>Configure {selectedSetting.toLowerCase()} for the {draft.label} object.</p></div><button className="btn btn-brand" onClick={persistDraft}><Save size={14} />Save</button></div><div className="empty-state">No {selectedSetting.toLowerCase()} metadata is defined yet.</div></section>;
  };

  return (
    <div className="object-manager">
      <div className="object-topline"><div className="object-breadcrumb"><button onClick={() => onSettingSelect('Objects')}>Object Manager</button><ChevronRight size={14} /><span>{object.label}</span></div><button className="icon-button subtle" aria-label="Object actions" aria-expanded={showObjectActionsMenu} onClick={() => setShowObjectActionsMenu((current) => !current)}><MoreHorizontal size={18} /></button>
        {showObjectActionsMenu && <div className="object-manager-menu">
          <button type="button" onClick={() => { setShowObjectActionsMenu(false); refreshObject(); }}>Refresh Metadata</button>
          <button type="button" onClick={() => { setShowObjectActionsMenu(false); onNewField(); }}>New Field</button>
          {draft.kind === 'Custom Object' && <button type="button" className="danger-action" onClick={() => { setShowObjectActionsMenu(false); setShowDeleteObjectConfirmation(true); }}>Delete Object</button>}
        </div>}
      </div>
      <div className="object-manager-layout">
        <aside className="object-list-panel">
          <div className="object-list-header"><h2>Object Manager</h2><button className="icon-button subtle" aria-label="Filter objects" aria-expanded={showObjectFilterMenu} onClick={() => setShowObjectFilterMenu((current) => !current)}><ListFilter size={15} /></button>
            {showObjectFilterMenu && <div className="object-manager-menu">
              {(['All Objects', 'Standard Objects', 'Custom Objects'] as const).map((mode) => <button type="button" key={mode} className={viewMode === mode ? 'selected' : ''} onClick={() => { setViewMode(mode); setShowObjectFilterMenu(false); }}>{mode}</button>)}
            </div>}
          </div>
          <div className="object-search"><Search size={14} /><input aria-label="Search objects" placeholder="Search..." value={search} onChange={(event) => onSearch(event.target.value)} /></div>
          <div className="object-toggle"><button className={viewMode === 'All Objects' ? 'selected' : ''} onClick={() => setViewMode('All Objects')}>All</button><button className={viewMode === 'Standard Objects' ? 'selected' : ''} onClick={() => setViewMode('Standard Objects')}>Standard</button><button className={viewMode === 'Custom Objects' ? 'selected' : ''} onClick={() => setViewMode('Custom Objects')}>Custom</button></div>
          <div className="object-list">
            {visibleObjects.map((item) => (
              <button key={item.apiName} className={object.apiName === item.apiName ? 'object-list-item active' : 'object-list-item'} onClick={() => onObjectSelect(item)}>
                <span className={`object-initial ${item.kind === 'Custom Object' ? 'custom' : ''}`}>{item.label.charAt(0)}</span><span><strong>{item.label}</strong><small>{item.kind}</small></span><ChevronRight size={14} />
              </button>
            ))}
            {visibleObjects.length === 0 && <p className="empty-list">No objects found.</p>}
          </div>
          <button className="create-object" onClick={onCreateObject}><Plus size={15} />Create</button>
        </aside>

        <div className="object-details">
          <div className="object-titlebar"><div className="object-title-icon">{object.label.charAt(0)}</div><div><div className="eyebrow">{object.kind}</div><h1>{object.label}</h1></div><div className="object-title-actions"><button type="button" className="btn" onClick={() => void validateDraft()}>Validate Draft</button><button type="button" className="btn" onClick={onOpenRecords}><Database size={14} />View Records</button></div></div>
          <div className="object-subnav">
            {objectSettings.map((setting) => <button key={setting} className={selectedSetting === setting ? 'active' : ''} onClick={() => onSettingSelect(setting)}>{setting}</button>)}
          </div>

          {renderSetting()}
        </div>
      </div>
      {editingField && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingField(null); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="field-details-title">
          <div className="modal-header"><h2 id="field-details-title">Field Details</h2><button className="icon-button dark" onClick={() => setEditingField(null)} aria-label="Close"><X size={18} /></button></div>
          <p className="modal-copy">Edit the field label and help metadata. The API name remains stable for existing references.</p>
          <label className="form-label">Field Label<input className="form-control" value={editingField.label} onChange={(event) => setEditingField({ ...editingField, label: event.target.value })} /></label>
          <label className="form-label">Field Name<div className="form-display">{editingField.apiName}</div></label>
          <label className="form-label">Data Type<div className="form-display">{editingField.dataType}</div></label>
          {editingField.dataType.startsWith('Text(') && <label className="form-label">Length<input className="form-control" type="number" min={1} max={255} step={1} value={editingField.dataType.match(/^Text\((\d+)\)$/)?.[1] ?? ''} onChange={(event) => setEditingField({ ...editingField, dataType: `Text(${event.target.value})` })} /></label>}
          {/^(Number|Currency|Percent)\(/.test(editingField.dataType) && (() => {
            const [, type = 'Number', precisionText = '18', scaleText = '0'] = editingField.dataType.match(/^(Number|Currency|Percent)\((\d+),\s*(\d+)\)$/) ?? [];
            const precision = Number(precisionText);
            const scale = Number(scaleText);
            return <div className="form-options">
              <label className="form-label">Length (Precision)<input className="form-control" type="number" min={1} max={18} step={1} value={precision} onChange={(event) => {
                const nextPrecision = Number(event.target.value);
                setEditingField({ ...editingField, dataType: `${type}(${event.target.value}, ${Math.min(scale, nextPrecision)})` });
              }} /></label>
              <label className="form-label">Decimal Places (Scale)<input className="form-control" type="number" min={0} max={precision} step={1} value={scale} onChange={(event) => setEditingField({ ...editingField, dataType: `${type}(${precision}, ${event.target.value})` })} /></label>
            </div>;
          })()}
          <label className="form-label">Description<input className="form-control" value={editingField.description ?? ''} onChange={(event) => setEditingField({ ...editingField, description: event.target.value })} /></label>
          <label className="form-label">Help Text<textarea className="form-control" value={editingField.helpText ?? ''} onChange={(event) => setEditingField({ ...editingField, helpText: event.target.value })} maxLength={255} rows={2} /></label>
          <div className="form-options">
            <label className="checkbox-row"><input type="checkbox" checked={editingField.required} onChange={(event) => setEditingField({ ...editingField, required: event.target.checked })} />Required</label>
            <label className="checkbox-row"><input type="checkbox" checked={editingField.unique} disabled={['Long Text Area', 'Multi-Select Picklist'].includes(editingField.dataType) || Boolean(editingField.relationship) || Boolean(editingField.formula)}
              onChange={(event) => {
                const next = { ...editingField, unique: event.target.checked };
                if (!event.target.checked) delete next.caseSensitive;
                setEditingField(next);
              }} />Unique</label>
            {/^(Text(?:\(\d+\))?|Number(?:\(\d+,\s*\d+\))?|Email|Phone|AutoNumber|Auto Number)$/.test(editingField.dataType)
              && <label className="checkbox-row"><input type="checkbox" checked={editingField.externalId ?? false} onChange={(event) => setEditingField({ ...editingField, externalId: event.target.checked })} />External ID</label>}
            {editingField.unique && /^(Text(?:\(\d+\))?|Email|Phone)$/.test(editingField.dataType)
              && <label className="checkbox-row"><input type="checkbox" checked={editingField.caseSensitive ?? false} onChange={(event) => setEditingField({ ...editingField, caseSensitive: event.target.checked })} />Treat uppercase and lowercase values as different</label>}
          </div>
          {!editingField.formula && !editingField.relationship && !['AutoNumber', 'Auto Number'].includes(editingField.dataType) && (editingField.dataType === 'Checkbox'
            ? <div className="form-options"><label className="checkbox-row"><input type="checkbox" checked={editingField.defaultValue !== undefined} onChange={(event) => { if (event.target.checked) setEditingField({ ...editingField, defaultValue: false }); else { const next = { ...editingField }; delete next.defaultValue; setEditingField(next); } }} />Set a default value</label><label className="checkbox-row"><input type="checkbox" disabled={editingField.defaultValue === undefined} checked={editingField.defaultValue === true} onChange={(event) => setEditingField({ ...editingField, defaultValue: event.target.checked })} />Default to checked</label></div>
            : (editingField.dataType === 'Picklist' || editingField.dataType === 'Multi-Select Picklist')
              ? <label className="form-label">Default Value<select className="form-control" multiple={editingField.dataType === 'Multi-Select Picklist'} value={editingField.dataType === 'Multi-Select Picklist' ? String(editingField.defaultValue ?? '').split(';').filter(Boolean) : String(editingField.defaultValue ?? '')} onChange={(event) => {
                const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                const value = editingField.dataType === 'Multi-Select Picklist' ? values.join(';') : values[0] ?? '';
                if (!value) {
                  const next = { ...editingField };
                  delete next.defaultValue;
                  setEditingField(next);
                } else setEditingField({ ...editingField, defaultValue: value });
              }}><option value="">— None —</option>{(editingField.picklistValues ?? []).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              : <label className="form-label">Default Value<input className="form-control" type={/^(Number|Currency|Percent)(\(|$)/.test(editingField.dataType) ? 'number' : editingField.dataType === 'Date' ? 'date' : ['Date/Time', 'DateTime'].includes(editingField.dataType) ? 'datetime-local' : editingField.dataType === 'Email' ? 'email' : editingField.dataType === 'URL' ? 'url' : 'text'}
                min={editingNumericMaximum === undefined ? undefined : -editingNumericMaximum}
                max={editingNumericMaximum}
                step={editingNumericFormat ? (Number(editingNumericFormat[2]) ? 10 ** -Number(editingNumericFormat[2]) : 1) : undefined}
                maxLength={editingTextMaximum ? Number(editingTextMaximum) : editingField.dataType === 'Text' ? 255 : undefined}
                value={editingField.defaultValue === undefined ? '' : String(editingField.defaultValue)} onChange={(event) => { const value = event.target.value; if (!value) { const next = { ...editingField }; delete next.defaultValue; setEditingField(next); } else setEditingField({ ...editingField, defaultValue: /^(Number|Currency|Percent)(\(|$)/.test(editingField.dataType) ? Number(value) : value }); }} /></label>)}
          {(editingField.dataType === 'Picklist' || editingField.dataType === 'Multi-Select Picklist') && <>
            <label className="form-label">Picklist Values<textarea className="form-control" rows={4} value={(editingField.picklistValues ?? []).join('\n')} onChange={(event) => {
              const picklistValues = event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
              const valueSettings = editingField.valueSettings
                ? Object.fromEntries(Object.entries(editingField.valueSettings).map(([key, values]) => [key, values.filter((value) => picklistValues.includes(value))]))
                : undefined;
              const nextField: FieldMetadata = { ...editingField, picklistValues, valueSettings };
              if (typeof editingField.defaultValue === 'string'
                && editingField.defaultValue.split(';').some((value) => !picklistValues.includes(value))) {
                delete nextField.defaultValue;
              }
              setEditingField(nextField);
            }} placeholder={'New\nIn Progress\nCompleted'} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={editingField.picklistRestricted ?? false} onChange={(event) => setEditingField({ ...editingField, picklistRestricted: event.target.checked })} />Restrict to the values defined in the value set</label>
            <><label className="form-label">Controlling Field<select className="form-control" value={editingField.controllerFieldApiName ?? ''} onChange={(event) => {
              const controllerField = draft.fields.find((field) => field.apiName === event.target.value);
              const controllerValues = controllerField?.dataType === 'Checkbox' ? ['true', 'false'] : controllerField?.picklistValues ?? [];
              const nextField: FieldMetadata = { ...editingField };
              if (controllerField) {
                nextField.controllerFieldApiName = controllerField.apiName;
                nextField.valueSettings = Object.fromEntries(controllerValues.map((value) => [value, editingField.valueSettings?.[value] ?? []]));
              } else {
                delete nextField.controllerFieldApiName;
                delete nextField.valueSettings;
              }
              setEditingField(nextField);
            }}>
              <option value="">None</option>{draft.fields.filter((field) => field.apiName !== editingField.apiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')).map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.dataType})</option>)}
            </select></label>
            {editingField.controllerFieldApiName && (() => {
              const controllerField = draft.fields.find((field) => field.apiName === editingField.controllerFieldApiName);
              const controllerValues = controllerField?.dataType === 'Checkbox' ? ['true', 'false'] : controllerField?.picklistValues ?? [];
              return <div className="metadata-card"><h3>Dependent Values</h3><p className="permission-help">Choose the values available for each controlling value.</p>{controllerValues.map((controllerValue) => <div className="metadata-card" key={controllerValue}><strong>{controllerValue}</strong><div className="field-selector-list">{(editingField.picklistValues ?? []).map((value) => <label className="checkbox-row" key={value}><input type="checkbox" checked={(editingField.valueSettings?.[controllerValue] ?? []).includes(value)} onChange={() => {
                const selectedValues = editingField.valueSettings?.[controllerValue] ?? [];
                const nextValues = selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value];
                setEditingField({ ...editingField, valueSettings: { ...editingField.valueSettings, [controllerValue]: nextValues } });
              }} />{value}</label>)}</div></div>)}</div>;
            })()}</>
          </>}
          <label className="checkbox-row"><input type="checkbox" checked={editingField.trackHistory ?? false} disabled={!draft.settings?.trackFieldHistory || Boolean(editingField.formula)} onChange={(event) => setEditingField({ ...editingField, trackHistory: event.target.checked })} />Track field history</label>
          {!draft.settings?.trackFieldHistory && <div className="info-callout">Enable Track Field History in object Details before selecting fields.</div>}
          {editingField.formula && <>
            <label className="form-label">Formula Return Type<div className="form-display">{editingField.formula.returnType}</div></label>
            <label className="form-label">Formula<textarea className="form-control" rows={4} value={editingField.formula.expression} onChange={(event) => setEditingField({ ...editingField, formula: { ...editingField.formula!, expression: event.target.value } })} /></label>
          </>}
          {editingField.relationship && <div className="info-callout">{editingField.relationship.type} relationship to {editingField.relationship.targetObject}; relationship target and API name are immutable here.</div>}
          {!editingField.formula && <div className="form-options"><label className="checkbox-row"><input type="checkbox" checked={editingField.required} disabled={editingField.relationship?.type === 'Master-Detail'} onChange={(event) => setEditingField({ ...editingField, required: event.target.checked })} />Required</label><label className="checkbox-row"><input type="checkbox" checked={editingField.unique} disabled={Boolean(editingField.relationship) || editingField.dataType === 'Long Text Area' || editingField.dataType === 'Multi-Select Picklist'} onChange={(event) => setEditingField({ ...editingField, unique: event.target.checked })} />Unique</label></div>}
          <div className="modal-actions">{editingField.apiName.endsWith('__c') && <button className="btn" onClick={() => setShowDeleteFieldConfirmation(true)}><Trash2 size={14} />Delete</button>}<button className="btn" onClick={() => setEditingField(null)}>Cancel</button><button className="btn btn-brand" onClick={() => {
            void onSaveField(editingField).then((updatedObject) => { setDraft(updatedObject); setEditingField(null); }).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to save field'));
          }} disabled={!editingField.label.trim() || (editingField.formula !== undefined && !editingField.formula.expression.trim())}>Save</button></div>
        </section>
      </div>}
      {showDeleteFieldConfirmation && editingField && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDeleteFieldConfirmation(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-field-title">
          <div className="modal-header"><h2 id="delete-field-title">Delete {editingField.label}?</h2><button className="icon-button dark" onClick={() => setShowDeleteFieldConfirmation(false)} aria-label="Close"><X size={18} /></button></div>
          <p className="modal-copy">This permanently deletes the custom field and its values from records. Fields referenced by formulas, dependent picklists, layouts, flows, or pages cannot be deleted.</p>
          <div className="modal-actions"><button className="btn" onClick={() => setShowDeleteFieldConfirmation(false)}>Cancel</button><button className="btn btn-brand" onClick={() => {
            void onDeleteField(editingField.apiName).then((updatedObject) => {
              setDraft(updatedObject);
              setEditingField(null);
              setShowDeleteFieldConfirmation(false);
            }).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to delete field'));
          }}>Delete Field</button></div>
        </section>
      </div>}
    </div>
  );
}

function FieldSelectorList({ fields, selected, onToggle }: { fields: FieldMetadata[]; selected: string[]; onToggle: (apiName: string) => void }) {
  return <div className="field-selector-list">{fields.map((field) => <label className="checkbox-row" key={field.apiName}><input type="checkbox" checked={selected.includes(field.apiName)} onChange={() => onToggle(field.apiName)} />{field.label}<small className="api-name">{field.apiName}</small></label>)}</div>;
}


return ObjectManager;
}
