import { RecordFormDialog } from './recordFormDialogView';
import { createPageBuilder } from './pageBuilderView';
import { ReportBuilder } from './reportBuilderView';
import { createPermissions } from './permissionsView';
import { createObjectManager } from './objectManagerView';
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

type RecordActivity = {
  id: string;
  objectApiName: string;
  recordId: string;
  kind: 'Task' | 'Call' | 'Event';
  subject: string;
  description: string;
  status: 'Open' | 'Completed';
  dueAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
};
type ChatterComment = { id: string; body: string; createdBy: string; createdByName: string; createdAt: string };
type ChatterPost = {
  id: string;
  objectApiName: string;
  recordId: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  comments: ChatterComment[];
};

export function createRecordWorkspaceViews(apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>, usePageLayoutDevice: () => LayoutDevice, ApiRequestError: new (...args: any[]) => Error & { status: number }, getAccessToken: () => string | undefined, RuntimeReportChart: React.ComponentType<any>, MetadataBoundPageComponent: React.ComponentType<any>) {
function RecordWorkspace({
  route,
  objects,
  apps,
  pages,
  availableFlows,
  onLaunchFlow,
  reports,
  metadataLoaded,
  profileId,
  canManageUserIdentities,
  userRoles,
  fieldAccess,
  recordTypeAccess,
  libraryComponents,
  headerSearch,
  onNavigate
}: {
  route: Extract<AppRoute, { kind: 'record-list' | 'record-detail' }>;
  objects: ObjectMetadata[];
  apps: LightningAppMetadata[];
  pages: LightningPageMetadata[];
  availableFlows: Array<Pick<FlowDefinitionMetadata, 'apiName' | 'label' | 'flowType' | 'status'>>;
  onLaunchFlow: (flowApiName: string, inputs?: Record<string, unknown>) => void;
  reports: ReportMetadata[];
  metadataLoaded: boolean;
  profileId: string;
  canManageUserIdentities: boolean;
  userRoles: Array<{id:string;name:string}>;
  fieldAccess: Record<string, { read: boolean; edit: boolean }>;
  recordTypeAccess: Record<string, boolean>;
  libraryComponents: LibraryComponentMetadata[];
  headerSearch: string;
  onNavigate: (route: AppRoute) => void;
}) {
  const object = objects.find((item) => item.apiName === route.objectApiName);
  const layoutDevice = usePageLayoutDevice();
  const [records, setRecords] = useState<RecordData[]>([]);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [activeLightningPage, setActiveLightningPage] = useState<LightningPageMetadata | null>(null);
  const [activeRuntimeTab, setActiveRuntimeTab] = useState('Related');
  const [recordActivities, setRecordActivities] = useState<RecordActivity[]>([]);
  const [activityError, setActivityError] = useState('');
  const [activityKind, setActivityKind] = useState<RecordActivity['kind']>('Task');
  const [activitySubject, setActivitySubject] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityDueAt, setActivityDueAt] = useState('');
  const [activitySaving, setActivitySaving] = useState(false);
  const [chatterPosts, setChatterPosts] = useState<ChatterPost[]>([]);
  const [chatterError, setChatterError] = useState('');
  const [chatterDraft, setChatterDraft] = useState('');
  const [chatterSaving, setChatterSaving] = useState(false);
  const [chatterCommentDrafts, setChatterCommentDrafts] = useState<Record<string, string>>({});
  const [formFactor, setFormFactor] = useState<'Desktop' | 'Phone'>(() =>
    window.matchMedia('(max-width: 600px)').matches ? 'Phone' : 'Desktop');
  const [selectedFieldSetApiName, setSelectedFieldSetApiName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const search = headerSearch;
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listOffset, setListOffset] = useState(0);
  const [listTotal, setListTotal] = useState(0);
  const [listSort, setListSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);
  const listPageSize = 50;
  const [refreshKey, setRefreshKey] = useState(0);
  const [fieldHistory, setFieldHistory] = useState<Array<Record<string, unknown>>>([]);
  const [relatedRecords, setRelatedRecords] = useState<Record<string, { objectApiName: string; fieldApiName: string; records: RecordData[]; total: number }>>({});
  const [relatedError, setRelatedError] = useState('');
  const [relatedOffsets, setRelatedOffsets] = useState<Record<string, number>>({});
  const changeRelatedPage = (name: string, offset: number) =>
    setRelatedOffsets((current) => ({ ...current, [name]: Math.max(0, offset) }));
  const renderRelatedPagination = (name: string, total: number, loaded: number) => {
    const offset = relatedOffsets[name] ?? 0;
    if (total === 0) return null;
    return <nav aria-label={`${name} pagination`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: 12 }}>
      <span>{offset + 1}–{Math.min(offset + loaded, total)} of {total}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="btn" disabled={offset === 0} onClick={() => changeRelatedPage(name, 0)}>First</button>
        <button className="btn" disabled={offset === 0} onClick={() => changeRelatedPage(name, offset - 50)}>Previous</button>
        <span>Page {Math.floor(offset / 50) + 1} of {Math.ceil(total / 50)}</span>
        <button className="btn" disabled={offset + 50 >= total} onClick={() => changeRelatedPage(name, offset + 50)}>Next</button>
        <button className="btn" disabled={offset + 50 >= total} onClick={() => changeRelatedPage(name, Math.floor((total - 1) / 50) * 50)}>Last</button>
      </div>
    </nav>;
  };
  const [customActionPendingId, setCustomActionPendingId] = useState('');
  const [customActionMessage, setCustomActionMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTimestamp, setEditingTimestamp] = useState('');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [lookupRecords, setLookupRecords] = useState<Record<string, RecordData[]>>({});
  const [lookupError, setLookupError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [massDeleting, setMassDeleting] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkFieldApiName, setBulkFieldApiName] = useState('');
  const [bulkFieldValue, setBulkFieldValue] = useState('');
  const [bulkFieldBoolean, setBulkFieldBoolean] = useState(false);
  const [bulkUpdateError, setBulkUpdateError] = useState('');
  const [ownerDialogRecord, setOwnerDialogRecord] = useState<RecordData | null>(null);
  const [ownerRecords, setOwnerRecords] = useState<RecordData[]>([]);
  const [ownerValue, setOwnerValue] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [bulkOwnerDialogOpen, setBulkOwnerDialogOpen] = useState(false);
  const [bulkOwnerValue, setBulkOwnerValue] = useState('');
  const [bulkOwnerError, setBulkOwnerError] = useState('');
  const [bulkOwnerSaving, setBulkOwnerSaving] = useState(false);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [importSaving, setImportSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [campaignOptions, setCampaignOptions] = useState<RecordData[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [campaignError, setCampaignError] = useState('');
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [listNotice, setListNotice] = useState('');

  const [offlineOwner, setOfflineOwner] = useState<OfflineQueueOwner | null>(null);
  const [offlineItems, setOfflineItems] = useState<OfflineRecordItem[]>([]);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState('');
  const offlineSyncGuard = useRef(false);
  const reloadOfflineItems = useCallback(async (owner: OfflineQueueOwner) => {
    setOfflineItems(await listOfflineRecords(owner));
  }, []);
  // Require a freshly authenticated identity before displaying or synchronising
  // local data. Never take tenant/user IDs from the queued payload.
  useEffect(() => {
    let mounted = true;
    void apiRequest<{user:{id:string;tenantId:string}}>('/auth/me')
      .then(({user}) => {
        if (mounted && user.id && user.tenantId) setOfflineOwner({userId:user.id,tenantId:user.tenantId});
      }).catch(() => { /* Offline mode is available after this session was verified online. */ });
    return () => { mounted = false; };
  }, []);
  const syncPendingOfflineItems = useCallback(async (owner: OfflineQueueOwner) => {
    if (offlineSyncGuard.current || !navigator.onLine || !getAccessToken()) return;
    offlineSyncGuard.current = true;
    setOfflineSyncing(true);
    setOfflineMessage('');
    try {
      const counts = await synchronizeOfflineRecords(owner, async write => {
        try {
          await apiRequest<{record:RecordData}>(
            '/records/' + encodeURIComponent(write.objectApiName)
              + (write.recordId ? '/' + encodeURIComponent(write.recordId) : ''),
            {
              method: write.method,
              headers: {
                ...(write.originalModifiedAt ? {'If-Unmodified-Since':write.originalModifiedAt} : {}),
                'X-MetaDrive-Offline-Sync': '1'
              },
              body: JSON.stringify(write.values)
            }
          );
          return {outcome:'saved' as const};
        } catch (error) {
          // 401 means this client has no usable identity: stop, keep queued data.
          if (error instanceof ApiRequestError && error.status===401)
            return {outcome:'unavailable' as const};
          // Never automatically replay an ambiguous write after transport/5xx
          // failure: the first request may have committed on the server.
          const reason = error instanceof Error ? error.message : 'Synchronisation failed';
          if (error instanceof ApiRequestError && [400,403,404,409,412,422].includes(error.status))
            return {outcome:'rejected' as const,reason};
          return {outcome:'needs-review' as const,
            reason:'Save result could not be confirmed. Check the server before retrying. ' + reason};
        }
      });
      await reloadOfflineItems(owner);
      if (counts.saved) setRefreshKey(value=>value+1);
      if (counts.saved || counts.rejected || counts.review)
        setOfflineMessage(`${counts.saved} synced; ${counts.rejected} rejected; ${counts.review} need review.`);
    } catch (error) {
      setOfflineMessage(error instanceof Error ? error.message : 'Unable to read local offline data');
    } finally {
      offlineSyncGuard.current = false;
      setOfflineSyncing(false);
    }
  }, [reloadOfflineItems]);
  useEffect(() => {
    if (!offlineOwner) return;
    void reloadOfflineItems(offlineOwner).catch(error => {
      setOfflineMessage(error instanceof Error ? error.message : 'Offline queue unavailable');
    });
    const sync = () => { void syncPendingOfflineItems(offlineOwner); };
    window.addEventListener('online', sync);
    if (navigator.onLine) sync();
    return () => window.removeEventListener('online', sync);
  }, [offlineOwner, reloadOfflineItems, syncPendingOfflineItems]);
  const queueRecordLocally = async (
    values: Record<string, unknown>, status: OfflineRecordItem['status'], reason?: string
  ) => {
    if (!offlineOwner) throw Error('Offline identity has not been verified. Reconnect and sign in once before saving offline.');
    if (object?.apiName==='User') throw Error('User records cannot be saved offline.');
    await queueOfflineRecord(offlineOwner, {
      id:crypto.randomUUID(), objectApiName:object!.apiName, method:editingId?'PUT':'POST',
      ...(editingId ? {recordId:editingId} : {}),
      ...(editingTimestamp ? {originalModifiedAt:editingTimestamp} : {}),
      values, createdAt:new Date().toISOString()
    },status,reason);
    await reloadOfflineItems(offlineOwner);
    setFormOpen(false);
    setFormValues({});
    setEditingTimestamp('');
    setListNotice(status==='pending'
      ? 'Saved securely on this device. This is provisional until permissions are checked during sync.'
      : 'Outcome uncertain. Your local change was retained for review, not automatically retried.');
  };
  const renderOfflineQueue = () => (
    <section className="surface" aria-label="Offline record changes" style={{marginBlock:12,padding:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
        <strong>Offline changes ({offlineItems.length})</strong>
        <button type="button" className="btn" disabled={!offlineOwner || offlineSyncing || !navigator.onLine}
          onClick={() => { if(offlineOwner) void syncPendingOfflineItems(offlineOwner); }}>
          {offlineSyncing?'Syncing…':'Sync pending'}
        </button>
      </div>
      <small>Local changes are provisional; the server checks your current permissions before saving.</small>
      {offlineMessage && <p role="status">{offlineMessage}</p>}
      {offlineItems.map(item => <div key={item.id} style={{paddingBlock:8,borderTop:'1px solid var(--border-color, #ddd)'}}>
        <strong>{item.objectApiName} · {item.method==='POST'?'Create':'Edit'}</strong>
        <span> — {item.status==='pending'?'Pending sync':item.status==='rejected'?'Sync rejected':'Needs review'}</span>
        {item.reason && <p role="alert">{item.reason}</p>}
        {item.status!=='pending' && <button className="btn" type="button"
          onClick={() => { if(!offlineOwner) return;
            if(item.status==='needs-review' && !window.confirm('Confirm that this change was NOT saved on the server. Retrying an uncertain create can make a duplicate.'))return;
            void markOfflineRecord(offlineOwner,item.id,'pending').then(()=>syncPendingOfflineItems(offlineOwner))
              .catch(error=>setOfflineMessage(error instanceof Error?error.message:'Unable to retry'));
          }}>Retry after review</button>}
        <button className="btn" type="button" onClick={() => {
          if(!offlineOwner || !window.confirm('Discard this local change? It cannot be recovered.'))return;
          void removeOfflineRecord(offlineOwner,item.id).then(()=>reloadOfflineItems(offlineOwner))
            .catch(error=>setOfflineMessage(error instanceof Error?error.message:'Unable to discard'));
        }}>Discard locally</button>
      </div>)}
    </section>
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setListOffset(0);
    setSelectedRecordIds([]);
  }, [route.objectApiName, debouncedSearch]);
  useEffect(() => { setListSort(null); }, [route.objectApiName]);
  // Selection belongs to the visible authorised page, never an earlier
  // offset or sort order after a list navigation.
  useEffect(() => { setSelectedRecordIds([]); }, [listOffset, listSort?.field, listSort?.direction]);
  useEffect(() => {
    setSelectedFieldSetApiName(object?.fieldSets?.[0]?.apiName ?? '');
  }, [object?.apiName]);
  useEffect(() => {
    setSelectedRecordIds([]);
    setListNotice('');
  }, [object?.apiName]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const updateFormFactor = () => setFormFactor(media.matches ? 'Phone' : 'Desktop');
    updateFormFactor();
    media.addEventListener('change', updateFormFactor);
    return () => media.removeEventListener('change', updateFormFactor);
  }, []);
  useEffect(() => {
    let active = true;
    const loadRecords = async () => {
      setLoading(true);
      setError('');
      if (route.kind === 'record-list') setRecords([]);
      else {
        setRecord(null);
        setActiveLightningPage(null);
        setFieldHistory([]);
      }
      try {
        if (route.kind === 'record-list') {
          const params = new URLSearchParams({
            limit: String(listPageSize),
            offset: String(listOffset),
            ...(listSort ? { sortField: listSort.field, sortDirection: listSort.direction } : {}),
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
            ...(object?.listViewFilter ? {
              filterField: object.listViewFilter.fieldApiName,
              filterValue: object.listViewFilter.value
            } : {})
          });
          const payload = await apiRequest<{ records: RecordData[]; total: number }>(
            `/records/${encodeURIComponent(route.objectApiName)}?${params.toString()}`);
          if (active) {
            setRecords(payload.records);
            setListTotal(payload.total);
          }
        } else {
          const recordQuery = new URLSearchParams({
            appId: route.appId ?? 'Records',
            formFactor
          });
          const payload = await apiRequest<{ record: RecordData; lightningPage?: LightningPageMetadata }>(
            `/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}?${recordQuery.toString()}`);
          const history = route.objectApiName === 'User'
            ? { history: [] as Array<Record<string, unknown>> }
            : await apiRequest<{ history: Array<Record<string, unknown>> }>(`/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/history`);
          if (active) {
            setRecord(payload.record);
            setActiveLightningPage(payload.lightningPage ?? null);
            setFieldHistory(history.history);
          }
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load records');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadRecords();
    return () => { active = false; };
  }, [route.kind, route.objectApiName, route.kind === 'record-detail' ? route.recordId : '', route.kind === 'record-detail' ? route.appId : '', formFactor, refreshKey, listOffset, debouncedSearch, listSort?.field, listSort?.direction]);
  useEffect(() => {
    if (route.kind !== 'record-detail' || !object || !record || record.Id !== route.recordId) {
      setRelatedRecords({});
      setRelatedError('');
      return;
    }
    let active = true;
    const recordTypeId = String(record.RecordTypeId ?? defaultRecordTypeId);
    const layout = pageLayoutForRecord(object, recordTypeId, profileId);
    const pageRelatedLists = (activeLightningPage?.components ?? []).flatMap((component) =>
      component.type === 'Related List' && Array.isArray(component.properties.relatedLists)
        ? component.properties.relatedLists.filter((name): name is string => typeof name === 'string')
        : []);
    const configuredLists = new Set([...(layout?.relatedLists ?? []), ...pageRelatedLists].map((name) => name.toLocaleLowerCase()));
    const relations = objects.flatMap((childObject) => childObject.fields.flatMap((field) => {
      if (field.relationship?.targetObject !== object.apiName) return [];
      const relationshipName = field.relationship.childRelationshipName;
      if (!configuredLists.has(relationshipName.toLocaleLowerCase()) && !configuredLists.has(childObject.pluralLabel.toLocaleLowerCase())) return [];
      return [{ childObject, fieldApiName: field.apiName, relationshipName }];
    }));
    setRelatedError('');
    setRelatedRecords({});
    const loadRelatedRecords = async () => {
      const results = await Promise.allSettled(relations.map(async ({ childObject, fieldApiName, relationshipName }) => {
          const params = new URLSearchParams({
            limit: '50', offset: String(relatedOffsets[relationshipName] ?? 0),
            relatedField: fieldApiName, relatedId: record.Id
          });
          const payload = await apiRequest<{ records: RecordData[]; total: number }>(
            `/records/${encodeURIComponent(childObject.apiName)}?${params.toString()}`);
          return [relationshipName, {
            objectApiName: childObject.apiName, fieldApiName, records: payload.records, total: payload.total
          }] as const;
      }));
      if (!active) return;
      const values = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failures = results.flatMap((result) => result.status === 'rejected'
        ? [result.reason instanceof Error ? result.reason.message : 'Unable to load a related list']
        : []);
      setRelatedRecords(Object.fromEntries(values));
      setRelatedError(failures.length ? `Some related lists could not be loaded: ${failures.join('; ')}` : '');
    };
    void loadRelatedRecords();
    return () => { active = false; };
  }, [route.kind, route.objectApiName, route.kind === 'record-detail' ? route.recordId : '', object?.apiName, objects, record?.Id, record?.RecordTypeId, activeLightningPage, refreshKey, relatedOffsets]);
  useEffect(() => {
    const pageComponents = activeLightningPage?.components ?? [];
    const needsActivities = pageComponents.some((component) => component.visible && component.type === 'Activities');
    const needsChatter = pageComponents.some((component) => component.visible && component.type === 'Chatter');
    if (route.kind !== 'record-detail' || !record || record.Id !== route.recordId || (!needsActivities && !needsChatter)) {
      setRecordActivities([]);
      setChatterPosts([]);
      setActivityError('');
      setChatterError('');
      return;
    }
    let active = true;
    const loadInteractions = async () => {
      const [activitiesResult, chatterResult] = await Promise.allSettled([
        needsActivities
          ? apiRequest<{ activities: RecordActivity[] }>(`/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/activities`)
          : Promise.resolve({ activities: [] }),
        needsChatter
          ? apiRequest<{ posts: ChatterPost[] }>(`/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/chatter`)
          : Promise.resolve({ posts: [] })
      ]);
      if (!active) return;
      if (activitiesResult.status === 'fulfilled') {
        setRecordActivities(activitiesResult.value.activities);
        setActivityError('');
      } else {
        setRecordActivities([]);
        setActivityError(activitiesResult.reason instanceof Error ? activitiesResult.reason.message : 'Unable to load activities');
      }
      if (chatterResult.status === 'fulfilled') {
        setChatterPosts(chatterResult.value.posts);
        setChatterError('');
      } else {
        setChatterPosts([]);
        setChatterError(chatterResult.reason instanceof Error ? chatterResult.reason.message : 'Unable to load Chatter');
      }
    };
    void loadInteractions();
    return () => { active = false; };
  }, [route.kind, route.objectApiName, route.kind === 'record-detail' ? route.recordId : '', record?.Id, activeLightningPage, refreshKey]);
  useEffect(() => {
    if (!object) return;
    let active = true;
    const loadLookups = async () => {
      setLookupError('');
      try {
        const relationships = [...new Set(object.fields.flatMap((field) => field.relationship ? [field.relationship.targetObject] : []))];
        const results = await Promise.allSettled(relationships.map(async (targetObject) => {
          const payload = await apiRequest<{ records: RecordData[] }>(`/records/${encodeURIComponent(targetObject)}`);
          return [targetObject, payload.records] as const;
        }));
        const pairs = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        const failures = results.flatMap((result) => result.status === 'rejected'
          ? [result.reason instanceof Error ? result.reason.message : 'Unable to load a lookup target']
          : []);
        if (active) {
          setLookupRecords(Object.fromEntries(pairs));
          const message = failures.join('; ');
          setLookupError(message);
          if (formOpen) setFormError(message);
        }
      } catch (failure) {
        if (active) {
          const message = failure instanceof Error ? failure.message : 'Unable to load lookup records';
          setLookupError(message);
          if (formOpen) setFormError(message);
        }
      }
    };
    void loadLookups();
    return () => { active = false; };
  }, [formOpen, object?.apiName]);
  useEffect(() => {
    if (!ownerDialogRecord && !bulkOwnerDialogOpen) return;
    let active = true;
    const loadOwners = async () => {
      setOwnerError('');
      try {
        const payload = await apiRequest<{ records: RecordData[] }>('/records/User');
        if (active) setOwnerRecords(payload.records);
      } catch (failure) {
        if (active) setOwnerError(failure instanceof Error ? failure.message : 'Unable to load users');
      }
    };
    void loadOwners();
    return () => { active = false; };
  }, [ownerDialogRecord?.Id, bulkOwnerDialogOpen]);
  const navigateLink = (event: React.MouseEvent<HTMLAnchorElement>, nextRoute: AppRoute) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(nextRoute);
  };
  const openList = () => onNavigate({ kind: 'record-list', objectApiName: route.objectApiName });
  const formatFieldValue = (field: FieldMetadata, value: unknown) => {
    if (field.relationship && typeof value === 'string') {
      const related = lookupRecords[field.relationship.targetObject]?.find((item) => item.Id === value);
      if (related) return String(related.Name ?? related.Email ?? value);
    }
    if (field.dataType === 'Date/Time' && typeof value === 'string' && value) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        // Persist timestamps in UTC; display using the viewer's actual local clock,
        // including daylight-saving transitions.
        return new Intl.DateTimeFormat(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }).format(date);
      }
    }
    return formatRecordValue(value);
  };
  const activeRecordTypes = object?.recordTypes?.filter((item) =>
    item.active && recordTypeAccess[`${object.apiName}.${item.id}`] !== false
  ) ?? [];
  const defaultRecordTypeId = activeRecordTypes.find((item) => item.isDefault)?.id ?? activeRecordTypes[0]?.id ?? '';
  const selectedRecordTypeId = String(formValues.RecordTypeId ?? defaultRecordTypeId);
  const selectedLayout = object ? pageLayoutForRecord(object, selectedRecordTypeId, profileId) : undefined;
  const canCreate = (object?.apiName !== 'User' || canManageUserIdentities) && object?.listViewButtons?.includes('New') !== false
    && object?.actions?.some((action) => action.label === 'New' && action.enabled) !== false
    && (!selectedLayout || selectedLayout.actions.includes('New'));
  const canEdit = (object?.apiName !== 'User' || canManageUserIdentities) && object?.actions?.some((action) => action.label === 'Edit' && action.enabled) !== false;
  const canDelete = (object?.apiName !== 'User' || canManageUserIdentities) && object?.actions?.some((action) => action.label === 'Delete' && action.enabled) !== false;
  const canMassDelete = canDelete && object?.listViewButtons?.includes('Mass Delete') === true;
  const bulkEditableFields = (object?.fields ?? []).filter((field) =>
    fieldAccess[`${object?.apiName}.${field.apiName}`]?.edit === true
    && !field.relationship && !field.formula
    && !['Id', 'RecordTypeId', 'OwnerId', 'CreatedById', 'LastModifiedById', 'CreatedDate',
      'LastModifiedDate', 'SystemModstamp', 'IsDeleted'].includes(field.apiName)
    && /^(?:Text(?:\(|$)|Text Area|Long Text Area|Email|Phone|URL|Picklist|Number(?:\(|$)|Currency(?:\(|$)|Percent(?:\(|$)|Checkbox|Boolean|Date(?:\/Time)?$|DateTime$)/i.test(field.dataType)
  );
  const canBulkUpdate = canEdit && object?.listViewButtons?.includes('Bulk Update') === true && bulkEditableFields.length > 0;
  const bulkSelectedField = bulkEditableFields.find((field) => field.apiName === bulkFieldApiName);
  const ownerField = object?.fields.find((field) => field.apiName === 'OwnerId' && field.relationship?.targetObject === 'User');
  const canChangeOwner = Boolean(ownerField && canEdit && fieldAccess[`${object?.apiName}.OwnerId`]?.edit && object?.listViewButtons?.includes('Change Owner'));
  const canImport = object?.apiName !== 'User' && object?.listViewButtons?.includes('Import') === true
    && object?.actions?.some((action) => action.label === 'New' && action.enabled) !== false;
  const canAddToCampaign = object?.apiName === 'Contact' && objects.some((item) => item.apiName === 'Campaign')
    && object.listViewButtons?.includes('Add to Campaign') === true;
  const openCreateForm = () => {
    setEditingId(null);
    setEditingTimestamp('');
    setFormValues(object?.apiName === 'User' ? { RecordTypeId: defaultRecordTypeId, IsActive: true, UserRoleId: '' } : { RecordTypeId: defaultRecordTypeId });
    setFormError('');
    setFormOpen(true);
  };
  const openEditForm = (item: RecordData) => {
    if (!object) return;
    const editableFieldNames = new Set(object.fields.map((field) => field.apiName));
    const editableValues = Object.fromEntries(Object.entries(item).filter(([apiName]) => editableFieldNames.has(apiName) || apiName === 'RecordTypeId'));
    setEditingId(item.Id);
    setEditingTimestamp(typeof item.LastModifiedDate === 'string' ? item.LastModifiedDate : '');
    setFormValues(editableValues);
    setFormError('');
    setFormOpen(true);
  };
  const openChangeOwner = (item: RecordData) => {
    setOwnerDialogRecord(item);
    setOwnerValue(String(item.OwnerId ?? ''));
    setOwnerError('');
  };
  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!object) return;
    setSaving(true);
    setFormError('');
    try {
      const path = `/records/${encodeURIComponent(object.apiName)}${editingId ? `/${encodeURIComponent(editingId)}` : ''}`;
      const writableValues = Object.fromEntries(Object.entries(formValues).filter(([apiName]) =>
        apiName !== 'OwnerId' && (apiName === 'RecordTypeId' || fieldAccess[`${object.apiName}.${apiName}`]?.edit)
      ));
      // A record without an assigned type must not submit an empty type ID:
      // the generic API treats an explicitly supplied ID as an assignment request.
      if (writableValues.RecordTypeId === '') delete writableValues.RecordTypeId;
      if (object.apiName === 'User') {
        if (!editingId) {
          if (typeof formValues.Password !== 'string' || formValues.Password.length < 12) throw new Error('Set an initial password of at least 12 characters.');
          writableValues.Password = formValues.Password;
        }
        // The identity API accepts only these explicit fields. No arbitrary metadata fields or password edits.
        const allowed = new Set(['Name', 'Email', 'Username', 'IsActive', 'UserRoleId', 'Password']);
        Object.keys(writableValues).forEach((name) => { if (!allowed.has(name)) delete writableValues[name]; });
      }
      if (!navigator.onLine) {
        await queueRecordLocally(writableValues, 'pending');
        return;
      }
      let response: {record: RecordData};
      try {
        response = await apiRequest<{ record: RecordData }>(path, {
        method: editingId ? 'PUT' : 'POST',
        ...(editingId && editingTimestamp ? { headers: { 'If-Unmodified-Since': editingTimestamp } } : {}),
        body: JSON.stringify(writableValues)
        });
      } catch (failure) {
        if (failure instanceof TypeError) {
          await queueRecordLocally(writableValues,'needs-review',
            'No server response was received. Confirm whether the change saved before retrying.');
          return;
        }
        throw failure;
      }
      setFormOpen(false);
      setFormValues({});
      setEditingTimestamp('');
      if (editingId) setRefreshKey((current) => current + 1);
      else onNavigate({ kind: 'record-detail', objectApiName: object.apiName, recordId: response.record.Id });
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : 'Unable to save record');
    } finally {
      setSaving(false);
    }
  };
  const runCustomObjectAction = async (action: ObjectActionMetadata) => {
    if (!object || !record || action.behavior !== 'Set Field Value' || !action.fieldApiName || action.value === undefined) return;
    setCustomActionPendingId(action.id);
    setCustomActionMessage('');
    try {
      await apiRequest<{ record: RecordData }>(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(record.Id)}`, {
        method: 'PUT',
        body: JSON.stringify({ [action.fieldApiName]: action.value })
      });
      setCustomActionMessage(`${action.label} completed.`);
      setRefreshKey((current) => current + 1);
    } catch (failure) {
      setCustomActionMessage(failure instanceof Error ? failure.message : `Unable to run ${action.label}`);
    } finally {
      setCustomActionPendingId('');
    }
  };
  const deleteCurrentRecord = async () => {
    if (!object) return;
    if (route.kind !== 'record-detail' || !record || !window.confirm(object.apiName === 'User' ? `Deactivate ${String(record.Name ?? record.Id)} and revoke their sessions? Identity and audit records are retained.` : `Delete ${String(record.Name ?? record.Id)}? This cannot be undone.`)) return;
    setError('');
    try {
      await apiRequest<void>(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(record.Id)}`, {
        method: 'DELETE',
        ...(typeof record.LastModifiedDate === 'string' ? { headers: { 'If-Unmodified-Since': record.LastModifiedDate } } : {})
      });
      openList();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete record');
    }
  };
  const deleteSelectedRecords = async () => {
    if (!object) return;
    const ids = selectedRecordIds.filter((id) => {
      const item = records.find((candidate) => candidate.Id === id);
      if (!item) return false;
      const recordTypeId = String(item.RecordTypeId ?? defaultRecordTypeId);
      const recordLayout = pageLayoutForRecord(object, recordTypeId, profileId);
      return canMassDelete && (!recordLayout || recordLayout.actions.includes('Delete'));
    });
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected record${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setMassDeleting(true);
    setError('');
    try {
      const results = await Promise.allSettled(ids.map((id) =>
        apiRequest<void>(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      ));
      const failedIds = results.flatMap((result, index) => result.status === 'rejected' ? [ids[index]] : []);
      const deletedCount = results.length - failedIds.length;
      setSelectedRecordIds(failedIds);
      if (failedIds.length) setError(`${deletedCount} record${deletedCount === 1 ? '' : 's'} deleted; ${failedIds.length} could not be deleted: ${results.filter((result) => result.status === 'rejected').map((result) => result.reason instanceof Error ? result.reason.message : 'Unknown error').join('; ')}`);
      setRefreshKey((current) => current + 1);
    } finally {
      setMassDeleting(false);
    }
  };
  const updateSelectedRecords = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!object || !canBulkUpdate || !bulkSelectedField) return;
    const items = selectedRecordIds.flatMap((id) => {
      const item = records.find((candidate) => candidate.Id === id);
      if (!item) return [];
      const layout = pageLayoutForRecord(object, String(item.RecordTypeId ?? defaultRecordTypeId), profileId);
      return !layout || layout.actions.includes('Edit') ? [item] : [];
    });
    if (!items.length) return;
    let value: string | number | boolean = bulkFieldValue;
    const kind = bulkSelectedField.dataType;
    if (/^(?:Number|Currency|Percent)(?:\(|$)/i.test(kind)) {
      if (!bulkFieldValue.trim() || !Number.isFinite(Number(bulkFieldValue))) {
        setBulkUpdateError('Enter a valid numeric value.');
        return;
      }
      value = Number(bulkFieldValue);
    } else if (/^(?:Checkbox|Boolean)$/i.test(kind)) value = bulkFieldBoolean;
    else if (/^(?:Date\/Time|DateTime)$/i.test(kind)) {
      const timestamp = new Date(bulkFieldValue);
      if (!Number.isFinite(timestamp.getTime())) {
        setBulkUpdateError('Enter a valid date and time.');
        return;
      }
      value = timestamp.toISOString();
    }
    setBulkUpdating(true);
    setBulkUpdateError('');
    const failed: string[] = [];
    const failures: string[] = [];
    // Preserve the platform's durable SQL revision ordering. A bounded,
    // sequential update avoids concurrent writes against one tenant snapshot.
    for (const item of items) {
      try {
        await apiRequest(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(item.Id)}`, {
          method: 'PUT',
          ...(typeof item.LastModifiedDate === 'string' ? {
            headers: { 'If-Unmodified-Since': item.LastModifiedDate }
          } : {}),
          body: JSON.stringify({ [bulkSelectedField.apiName]: value })
        });
      } catch (error) {
        failed.push(item.Id);
        failures.push(error instanceof Error ? error.message : 'Record update rejected');
      }
    }
    setBulkUpdating(false);
    setSelectedRecordIds(failed);
    setRefreshKey((current) => current + 1);
    const updated = items.length - failed.length;
    setListNotice(`${updated} of ${items.length} selected record${items.length === 1 ? '' : 's'} updated.`);
    if (failed.length) setBulkUpdateError(`${failed.length} update(s) rejected: ${failures.join('; ')}`);
    else { setBulkUpdateOpen(false); setBulkFieldValue(''); setBulkFieldApiName(''); }
  };
  const saveBulkRecordOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!object || !canChangeOwner || !bulkOwnerValue) return;
    const items = selectedRecordIds.flatMap((id) => {
      const item = records.find((candidate) => candidate.Id === id);
      if (!item) return [];
      const layout = pageLayoutForRecord(object, String(item.RecordTypeId ?? defaultRecordTypeId), profileId);
      return !layout || layout.actions.includes('Edit') ? [item] : [];
    });
    setBulkOwnerSaving(true); setBulkOwnerError('');
    const failed: string[] = [], messages: string[] = [];
    for (const item of items) {
      try {
        await apiRequest(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(item.Id)}/owner`, {
          method: 'PUT',
          ...(typeof item.LastModifiedDate === 'string' ? {
            headers: { 'If-Unmodified-Since': item.LastModifiedDate }
          } : {}),
          body: JSON.stringify({ ownerId: bulkOwnerValue })
        });
      } catch (reason) {
        failed.push(item.Id);
        messages.push(reason instanceof Error ? reason.message : 'Owner change was rejected');
      }
    }
    setBulkOwnerSaving(false);
    setSelectedRecordIds(failed);
    setRefreshKey((current) => current + 1);
    setListNotice(`${items.length - failed.length} of ${items.length} record owner(s) changed.`);
    if (failed.length) setBulkOwnerError(messages.join('; '));
    else { setBulkOwnerDialogOpen(false); setBulkOwnerValue(''); }
  };
  const saveRecordOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!object || !ownerDialogRecord || !ownerField || !ownerValue) return;
    setOwnerSaving(true);
    setOwnerError('');
    try {
      await apiRequest<{ record: RecordData }>(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(ownerDialogRecord.Id)}/owner`, {
        method: 'PUT',
        ...(typeof ownerDialogRecord.LastModifiedDate === 'string' ? { headers: { 'If-Unmodified-Since': ownerDialogRecord.LastModifiedDate } } : {}),
        body: JSON.stringify({ ownerId: ownerValue })
      });
      setOwnerDialogRecord(null);
      setRefreshKey((current) => current + 1);
    } catch (failure) {
      setOwnerError(failure instanceof Error ? failure.message : 'Unable to change record owner');
    } finally {
      setOwnerSaving(false);
    }
  };
  const saveActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (route.kind !== 'record-detail' || !activitySubject.trim()) return;
    setActivitySaving(true);
    setActivityError('');
    try {
      await apiRequest<{ activity: RecordActivity }>(`/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          kind: activityKind,
          subject: activitySubject,
          description: activityDescription,
          status: 'Open',
          dueAt: activityDueAt ? new Date(activityDueAt).toISOString() : null
        })
      });
      setActivitySubject('');
      setActivityDescription('');
      setActivityDueAt('');
      setRefreshKey((current) => current + 1);
    } catch (failure) {
      setActivityError(failure instanceof Error ? failure.message : 'Unable to save activity');
    } finally {
      setActivitySaving(false);
    }
  };
  const updateActivityStatus = async (activity: RecordActivity, status: RecordActivity['status']) => {
    if (route.kind !== 'record-detail') return;
    setActivityError('');
    try {
      const result = await apiRequest<{ activity: RecordActivity }>(
        `/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/activities/${encodeURIComponent(activity.id)}`,
        { method: 'PATCH', body: JSON.stringify({ status }) }
      );
      setRecordActivities((current) => current.map((item) => item.id === result.activity.id ? result.activity : item));
    } catch (failure) {
      setActivityError(failure instanceof Error ? failure.message : 'Unable to update activity');
    }
  };
  const saveChatterPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (route.kind !== 'record-detail' || !chatterDraft.trim()) return;
    setChatterSaving(true);
    setChatterError('');
    try {
      const result = await apiRequest<{ post: ChatterPost }>(
        `/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/chatter`,
        { method: 'POST', body: JSON.stringify({ body: chatterDraft }) }
      );
      setChatterPosts((current) => [result.post, ...current]);
      setChatterDraft('');
    } catch (failure) {
      setChatterError(failure instanceof Error ? failure.message : 'Unable to publish Chatter post');
    } finally {
      setChatterSaving(false);
    }
  };
  const saveChatterComment = async (post: ChatterPost, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (route.kind !== 'record-detail') return;
    const body = chatterCommentDrafts[post.id]?.trim();
    if (!body) return;
    setChatterError('');
    try {
      const result = await apiRequest<{ post: ChatterPost }>(
        `/records/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/chatter/${encodeURIComponent(post.id)}/comments`,
        { method: 'POST', body: JSON.stringify({ body }) }
      );
      setChatterPosts((current) => current.map((item) => item.id === post.id ? result.post : item));
      setChatterCommentDrafts((current) => ({ ...current, [post.id]: '' }));
    } catch (failure) {
      setChatterError(failure instanceof Error ? failure.message : 'Unable to comment on Chatter post');
    }
  };
  const readImportFile = async (file: File) => {
    if (!object) return;
    setImportFileName(file.name);
    setImportError('');
    try {
      const rows = parseCsvImport(await file.text(), object);
      setImportRows(rows);
      setImportFileName(file.name);
    } catch (failure) {
      setImportRows([]);
      setImportError(failure instanceof Error ? failure.message : 'Unable to read this CSV file');
    }
  };
  const runImport = async () => {
    if (!object || !importRows.length) return;
    setImportSaving(true);
    setImportError('');
    try {
      const result = await apiRequest<{ count: number }>(`/records/${encodeURIComponent(object.apiName)}/import`, {
        method: 'POST',
        body: JSON.stringify({ records: importRows })
      });
      setImportRows([]);
      setImportFileName('');
      setListNotice(`${result.count} ${object.label.toLocaleLowerCase()} record${result.count === 1 ? '' : 's'} imported.`);
      setRefreshKey((current) => current + 1);
    } catch (failure) {
      setImportError(failure instanceof Error ? failure.message : 'Import failed; no records were saved');
    } finally {
      setImportSaving(false);
    }
  };
  const exportFilteredRecords = async () => {
    if (!object || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      // Use the same authorised, metadata-filtered Records API as the list.
      // Fetch in bounded pages; never bypass field/record RBAC or hydrate the
      // entire table into the live list view.
      const fields = object.fields.filter((field) => fieldAccess[object.apiName+'.'+field.apiName]?.read);
      const columns = ['Id', ...fields.map((field) => field.apiName).filter((name) => name !== 'Id')];
      const csvCell = (value: unknown): string => {
        let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        // Neutralise spreadsheet formulas without changing stored source data.
        if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(value)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      };
      const rows: string[] = [columns.map(csvCell).join(',')];
      let offset = 0;
      let total: number | null = null;
      do {
        const params = new URLSearchParams({
          limit: '200', offset: String(offset),
          ...(listSort ? { sortField: listSort.field, sortDirection: listSort.direction } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(object.listViewFilter ? { filterField: object.listViewFilter.fieldApiName,
            filterValue: object.listViewFilter.value } : {})
        });
        const page = await apiRequest<{ records: RecordData[]; total: number }>(
          '/records/' + encodeURIComponent(object.apiName) + '?' + params.toString());
        if (!Array.isArray(page.records) || !Number.isSafeInteger(page.total) || page.total < 0)
          throw new Error('Unexpected record export response');
        if (total !== null && total !== page.total)
          throw new Error('Records changed during export. Please retry for a consistent result.');
        total = page.total;
        if (page.records.length === 0 && offset < total)
          throw new Error('Export stopped before all records were returned');
        for (const item of page.records) rows.push(columns.map((name) => csvCell(item[name])).join(','));
        offset += page.records.length;
      } while (total !== null && offset < total);
      const blob = new Blob(['\uFEFF', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = object.apiName + '-records.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setListNotice('Exported ' + offset + ' records to CSV.');
    } catch (failure) {
      setExportError(failure instanceof Error ? failure.message : 'Unable to export records');
    } finally {
      setExporting(false);
    }
  };
  const openAddToCampaign = async () => {
    setCampaignDialogOpen(true);
    setCampaignOptions([]);
    setCampaignId('');
    setCampaignError('');
    setCampaignLoading(true);
    try {
      const result = await apiRequest<{ records: RecordData[] }>('/records/Campaign');
      setCampaignOptions(result.records.filter((campaign) => campaign.IsActive !== false));
    } catch (failure) {
      setCampaignError(failure instanceof Error ? failure.message : 'Unable to load campaigns');
    } finally {
      setCampaignLoading(false);
    }
  };
  const addSelectedContactsToCampaign = async () => {
    if (!campaignId || !selectedRecordIds.length) return;
    setCampaignSaving(true);
    setCampaignError('');
    try {
      const result = await apiRequest<{ addedCount: number; alreadyMemberCount: number }>(`/campaigns/${encodeURIComponent(campaignId)}/members`, {
        method: 'POST',
        body: JSON.stringify({ contactIds: selectedRecordIds })
      });
      const campaignName = String(campaignOptions.find((campaign) => campaign.Id === campaignId)?.Name ?? 'campaign');
      setListNotice(`${result.addedCount} contact${result.addedCount === 1 ? '' : 's'} added to ${campaignName}${result.alreadyMemberCount ? `; ${result.alreadyMemberCount} were already members` : ''}.`);
      setSelectedRecordIds([]);
      setCampaignDialogOpen(false);
    } catch (failure) {
      setCampaignError(failure instanceof Error ? failure.message : 'Unable to add contacts to campaign');
    } finally {
      setCampaignSaving(false);
    }
  };
  if (!object && !metadataLoaded) return <div className="records-loading">Loading object metadata…</div>;
  if (!object) return <div className="records-page"><div className="records-message" role="alert">Object “{route.objectApiName}” was not found.</div></div>;
  if (route.kind === 'record-detail') {
    if (!record) return <div className="records-page">
      {(offlineItems.length>0 || !navigator.onLine) && renderOfflineQueue()}
      <div className="record-detail-top">
        <button className="text-action" onClick={openList}><ArrowLeft size={14} />Back to {object.pluralLabel}</button>
        <div className="record-breadcrumb">{object.label} <ChevronRight size={13} /> {route.recordId}</div>
      </div>
      {loading && <div className="records-loading">Loading record…</div>}
      {!loading && error && <div className="records-message" role="alert">{error}</div>}
    </div>;
    const recordName = String(record?.Name ?? record?.Id ?? route.recordId);
    const recordTypeId = String(record?.RecordTypeId ?? defaultRecordTypeId);
    const recordLayout = pageLayoutForRecord(object, recordTypeId, profileId);
    const detailFieldNames = recordLayout?.sections.flatMap((section) => section.fieldApiNames);
    const readableRecordFields = object.fields.filter((field) => fieldAccess[`${object.apiName}.${field.apiName}`]?.read
      && field.apiName in (record ?? {}));
    const fields = readableRecordFields.filter((field) => !detailFieldNames || detailFieldNames.includes(field.apiName));
    const activeFieldSet = object.fieldSets?.find((fieldSet) => fieldSet.apiName === selectedFieldSetApiName)
      ?? object.fieldSets?.[0];
    const fieldSetFields = activeFieldSet?.fieldApiNames
      .map((name) => object.fields.find((field) => field.apiName === name))
      .filter((field): field is FieldMetadata => Boolean(field
        && fieldAccess[`${object.apiName}.${field.apiName}`]?.read
        && record && field.apiName in record)) ?? [];
    const historyEnabled = object.settings?.trackFieldHistory === true && object.fields.some((field) => field.trackHistory);
    const activeCompactLayout = compactLayoutForRecord(object, recordTypeId, profileId);
    const compactFields = (activeCompactLayout?.fieldApiNames ?? []).map((name) => object.fields.find((field) => field.apiName === name))
      .filter((field): field is FieldMetadata => Boolean(field && fieldAccess[`${object.apiName}.${field.apiName}`]?.read && record && field.apiName in record));
    const assignedPage = activeLightningPage?.targetObject === object.apiName ? activeLightningPage : null;
    const renderRelatedList = (relationshipName: string) => {
      const related = Object.entries(relatedRecords).find(([name, value]) => {
        const childObject = objects.find((item) => item.apiName === value.objectApiName);
        return name.toLocaleLowerCase() === relationshipName.toLocaleLowerCase()
          || childObject?.pluralLabel.toLocaleLowerCase() === relationshipName.toLocaleLowerCase();
      })?.[1];
      if (!related) return <section className="record-fields-card surface" key={relationshipName}><div className="record-fields-heading"><h2>{relationshipName}</h2></div><div className="records-empty">This related list is unavailable for this record.</div></section>;
      const childObject = objects.find((item) => item.apiName === related.objectApiName);
      const displayFields = childObject?.fields.filter((field) => field.apiName !== related.fieldApiName
        && fieldAccess[`${childObject.apiName}.${field.apiName}`]?.read
        && related.records.some((item) => field.apiName in item)).slice(0, 4) ?? [];
      return <section className="record-fields-card surface related-records-card" key={relationshipName}>
        <div className="record-fields-heading"><h2>{relationshipName}</h2><span>{related.total} record{related.total === 1 ? '' : 's'}</span></div>
        {related.records.length === 0 ? <div className="records-empty">No related {childObject?.pluralLabel.toLocaleLowerCase() ?? 'records'}.</div>
          : <div className="records-table-wrap" style={{ maxHeight: "65vh", overflow: "auto" }}><table className="slds-table records-table"><thead><tr>{displayFields.map((field) => <th key={field.apiName}>{field.label}</th>)}</tr></thead>
            <tbody>{related.records.map((child) => <tr key={child.Id}>{displayFields.map((field, index) => <td key={field.apiName}>
              {index === 0 && childObject
                ? <a href={appRoutePath({ kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })} onClick={(event) => navigateLink(event, { kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })}>{formatRecordValue(child[field.apiName] ?? child.Id)}</a>
                : formatRecordValue(child[field.apiName])}
            </td>)}</tr>)}</tbody></table></div>}
        {renderRelatedPagination(relationshipName, related.total, related.records.length)}
      </section>;
    };
    const renderRuntimeComponent = (component: PageComponentMetadata) => {
      if (!isComponentVisible(component, {
        formFactor, record, fields: object.fields,
        readableFieldApiNames: new Set(readableRecordFields.map(field => field.apiName))
      }, true)) return null;
      if (component.type.startsWith('Custom:')) {
        const definition = libraryComponents.find((item) => item.apiName === component.type.slice('Custom:'.length) && item.surfaces.includes('page'));
        const children = isLayoutContainer(component)
          ? childrenOf(assignedPage?.components ?? [], component.id).map(renderRuntimeComponent)
          : undefined;
        return definition
          ? <div key={component.id} data-layout-component-id={component.id}
              style={resolvePageComponentStyle(component.properties, component.type, layoutDevice)}>
              {!isLayoutContainer(component) && needsMetadataComponentRuntime(component.properties)
                ? <MetadataBoundPageComponent definition={definition} component={component}
                    objects={objects} apps={apps} pages={pages} currentAppId="Records"
                    pageSessionKey={'record:' + object.apiName + ':' + String(record.Id)}
                    reports={reports} availableFlows={availableFlows} formFactor={formFactor}
                    onNavigate={onNavigate} onLaunchFlow={onLaunchFlow} />
                : <RegisteredComponent definition={definition} props={{
                    ...component.properties, ...componentLayoutProps(component.properties, layoutDevice),
                    label: component.label, properties: component.properties,
                    record, recordId: record.Id, object, formFactor, children
                  }} />
            </div>
          : <div className="records-message" role="status" key={component.id}>Component “{component.type.slice('Custom:'.length)}” is not available in the component library.</div>;
      }
      if (component.type === 'Highlights Panel') return <section className="record-highlights surface" key={component.id} aria-label="Record highlights">
        {compactFields.map((field) => <div key={field.apiName}><span>{field.label}</span><strong>{formatFieldValue(field, record[field.apiName])}</strong></div>)}
      </section>;
      if (component.type === 'Record Detail') {
        const componentFields = Array.isArray(component.properties.fields)
          ? component.properties.fields.filter((name): name is string => typeof name === 'string')
          : readableRecordFields.map((field) => field.apiName);
        const visibleFields = componentFields.map((name) => readableRecordFields.find((field) => field.apiName === name))
          .filter((field): field is FieldMetadata => Boolean(field));
        return <section className="record-fields-card surface" key={component.id}>
          <div className="record-fields-heading"><h2>{component.label}</h2></div>
          <dl className="record-fields-grid">{visibleFields.map((field) =>
            <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}</dl>
        </section>;
      }
      if (component.type === 'Field Section') {
        const sectionFieldNames = Array.isArray(component.properties.fieldApiNames)
          ? component.properties.fieldApiNames.filter((name): name is string => typeof name === 'string')
          : [];
        const visibleFields = sectionFieldNames.map((name) => readableRecordFields.find((field) => field.apiName === name))
          .filter((field): field is FieldMetadata => Boolean(field));
        return <section className="record-fields-card surface" key={component.id}>
          <div className="record-fields-heading"><h2>{component.label}</h2></div>
          {visibleFields.length
            ? <dl className={`record-fields-grid columns-${component.properties.columns === 1 ? 1 : 2}`}>{visibleFields.map((field) =>
              <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}</dl>
            : <div className="records-empty">No readable fields are configured in this section.</div>}
        </section>;
      }
      if (component.type === 'Record Field') {
        const fieldApiName = typeof component.properties.fieldApiName === 'string' ? component.properties.fieldApiName : '';
        const field = readableRecordFields.find((item) => item.apiName === fieldApiName);
        return field
          ? <section className="record-fields-card surface record-single-field" key={component.id}>
            <div className="record-fields-heading"><h2>{component.label}</h2></div>
            <dl className="record-fields-grid columns-1"><div className="record-field"><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div></dl>
          </section>
          : <div className="records-empty" role="status" key={component.id}>This field is unavailable or not readable.</div>;
      }
      if (component.type === 'Related List') {
        const names = Array.isArray(component.properties.relatedLists)
          ? component.properties.relatedLists.filter((name): name is string => typeof name === 'string')
          : [];
        return <div key={component.id}>{names.map(renderRelatedList)}</div>;
      }
      if (component.type === 'Tabs') {
        const tabs = Array.isArray(component.properties.tabs)
          ? component.properties.tabs.filter((tab): tab is string => typeof tab === 'string')
          : ['Related', 'Details'];
        const selectedTab = tabs.includes(activeRuntimeTab) ? activeRuntimeTab : tabs[0];
        return <div className="record-runtime-tabs" key={component.id}>
          <div className="record-tabs" role="tablist" aria-label={component.label}>
            {tabs.map((tab) => <button type="button" role="tab" aria-selected={selectedTab === tab} className={selectedTab === tab ? 'active' : ''}
              key={tab} onClick={() => setActiveRuntimeTab(tab)}>{tab}</button>)}
          </div>
          <div role="tabpanel" className="record-runtime-tab-panel">
            {selectedTab?.toLocaleLowerCase() === 'details'
              ? assignedPage?.components.some((item) => item.visible && ['Field Section', 'Record Field'].includes(item.type))
                ? assignedPage.components.filter((item) => item.visible && ['Field Section', 'Record Field'].includes(item.type)).map(renderRuntimeComponent)
                : <section className="record-fields-card surface"><div className="record-fields-heading"><h2>Details</h2></div>
                  <dl className="record-fields-grid">{readableRecordFields.map((field) => <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}</dl>
                </section>
              : selectedTab?.toLocaleLowerCase() === 'related'
                ? assignedPage?.components.some((item) => item.visible && item.type === 'Related List')
                  ? <div className="records-empty">Related records are shown in the page’s Related List components.</div>
                  : <div>{Object.keys(relatedRecords).map(renderRelatedList)}</div>
                : ['activity', 'activities'].includes(selectedTab?.toLocaleLowerCase() ?? '')
                  ? assignedPage?.components.filter((item) => item.visible && item.type === 'Activities').map(renderRuntimeComponent)
                    ?? <div className="records-empty">Add an Activities component to this page to show the activity timeline.</div>
                  : selectedTab?.toLocaleLowerCase() === 'chatter'
                    ? assignedPage?.components.filter((item) => item.visible && item.type === 'Chatter').map(renderRuntimeComponent)
                      ?? <div className="records-empty">Add a Chatter component to this page to show the record feed.</div>
                    : (() => {
                      const tabComponent = assignedPage?.components.find((item) => item.visible
                        && item.type !== 'Tabs'
                        && item.label.toLocaleLowerCase() === selectedTab?.toLocaleLowerCase());
                      return tabComponent
                        ? renderRuntimeComponent(tabComponent)
                        : <div className="records-empty">{selectedTab} content is not configured for this record.</div>;
                    })()}
          </div>
        </div>;
      }
      if (component.type === 'Accordion') return <section className="record-fields-card surface" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2></div>
        {(recordLayout?.sections ?? [{ id: 'record-details', label: 'Record Details', columns: 2, fieldApiNames: readableRecordFields.map((field) => field.apiName) }]).map((section) => (
          <details className="record-layout-section" key={section.id} open>
            <summary>{section.label}</summary>
            <dl className={`record-fields-grid columns-${section.columns}`}>{section.fieldApiNames
              .map((name) => readableRecordFields.find((field) => field.apiName === name))
              .filter((field): field is FieldMetadata => Boolean(field))
              .map((field) => <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}</dl>
          </details>
        ))}
      </section>;
      if (component.type === 'Activities') return <section className="record-fields-card surface record-activities" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2><span>{recordActivities.length} item{recordActivities.length === 1 ? '' : 's'}</span></div>
        <form className="record-interaction-form" onSubmit={(event) => void saveActivity(event)}>
          <div className="record-interaction-form-row">
            <label className="form-label">Type<select className="form-control" value={activityKind} onChange={(event) => setActivityKind(event.target.value as RecordActivity['kind'])}>
              <option>Task</option><option>Call</option><option>Event</option>
            </select></label>
            <label className="form-label">Subject<input className="form-control" maxLength={160} required value={activitySubject} onChange={(event) => setActivitySubject(event.target.value)} /></label>
            <label className="form-label">{activityKind === 'Event' ? 'Start date and time' : 'Due date and time'}<input className="form-control" type="datetime-local" value={activityDueAt} onChange={(event) => setActivityDueAt(event.target.value)} /></label>
          </div>
          <label className="form-label">Comments<textarea className="form-control" rows={2} maxLength={4000} value={activityDescription} onChange={(event) => setActivityDescription(event.target.value)} /></label>
          <button className="btn btn-brand" type="submit" disabled={activitySaving || !activitySubject.trim()}>{activitySaving ? 'Saving…' : `Add ${activityKind}`}</button>
        </form>
        {activityError && <div className="records-message" role="alert">{activityError}</div>}
        {recordActivities.length === 0 ? <div className="records-empty">No activities yet.</div>
          : <ol className="record-activity-list">{recordActivities.map((activity) => <li key={activity.id}>
            <div className="record-activity-heading"><strong>{activity.subject}</strong><span>{activity.kind} · {activity.status}</span></div>
            <p>{activity.description || 'No comments'}</p>
            <small>{activity.dueAt ? `${activity.kind === 'Event' ? 'Starts' : 'Due'} ${formatRecordValue(activity.dueAt)} · ` : ''}{activity.createdByName} · {formatRecordValue(activity.createdAt)}</small>
            {activity.status === 'Open' && <button className="text-action" type="button" onClick={() => void updateActivityStatus(activity, 'Completed')}>Mark complete</button>}
          </li>)}</ol>}
      </section>;
      if (component.type === 'Chatter') return <section className="record-fields-card surface record-chatter" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2><span>{chatterPosts.length} post{chatterPosts.length === 1 ? '' : 's'}</span></div>
        <form className="record-interaction-form" onSubmit={(event) => void saveChatterPost(event)}>
          <label className="form-label" htmlFor={`chatter-post-${component.id}`}>Share an update<textarea id={`chatter-post-${component.id}`} className="form-control" rows={3} maxLength={4000} value={chatterDraft} onChange={(event) => setChatterDraft(event.target.value)} required /></label>
          <button className="btn btn-brand" type="submit" disabled={chatterSaving || !chatterDraft.trim()}>{chatterSaving ? 'Posting…' : 'Share'}</button>
        </form>
        {chatterError && <div className="records-message" role="alert">{chatterError}</div>}
        {chatterPosts.length === 0 ? <div className="records-empty">No posts yet. Start the conversation.</div>
          : <ol className="record-chatter-posts">{chatterPosts.map((post) => <li key={post.id}>
            <div className="record-chatter-author"><strong>{post.createdByName}</strong><small>{formatRecordValue(post.createdAt)}</small></div>
            <p>{post.body}</p>
            {post.comments.map((comment) => <div className="record-chatter-comment" key={comment.id}>
              <strong>{comment.createdByName}</strong><small>{formatRecordValue(comment.createdAt)}</small><p>{comment.body}</p>
            </div>)}
            <form className="record-interaction-form-row" onSubmit={(event) => void saveChatterComment(post, event)}>
              <label className="form-label"><span className="visually-hidden">Comment on post by {post.createdByName}</span>
                <input className="form-control" maxLength={4000} placeholder="Write a comment…" value={chatterCommentDrafts[post.id] ?? ''}
                  onChange={(event) => setChatterCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} /></label>
              <button className="btn" type="submit" disabled={!chatterCommentDrafts[post.id]?.trim()}>Comment</button>
            </form>
          </li>)}</ol>}
      </section>;
      if (component.type === 'Dashboard') return <section className="record-fields-card surface" key={component.id}>
        <EmbeddedDashboard dashboardApiName={String(component.properties.dashboardApiName ?? '')}
          request={apiRequest} libraryComponents={libraryComponents}/>
      </section>;
      if (component.type === 'Report Chart') return <section className="record-fields-card surface" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2></div>
        <RuntimeReportChart report={reports.find((report) => report.apiName === component.properties.reportApiName)} objects={objects} />
      </section>;
      return <div className="records-message" role="status" key={component.id}>{component.label} is not supported in record runtime.</div>;
    };
    const renderRuntimeRegion = (region: 'header' | 'main' | 'sidebar') =>
      childrenOf(assignedPage?.components ?? [], null).filter((component) => (component.region ?? 'main') === region).map(component => {
        const content = renderRuntimeComponent(component);
        return content && !component.type.startsWith('Custom:') && hasPageComponentAppearance(component.properties)
          ? <div key={component.id} style={resolvePageComponentStyle(component.properties, component.type, layoutDevice)}>{content}</div>
          : content;
      });
    return <div className="records-page">
      {(offlineItems.length>0 || !navigator.onLine) && renderOfflineQueue()}
      <div className="record-detail-top">
        <button className="text-action" onClick={openList}><ArrowLeft size={14} />Back to {object.pluralLabel}</button>
        <div className="record-breadcrumb">{object.label} <ChevronRight size={13} /> {recordName}</div>
      </div>
      {loading && <div className="records-loading">Loading record…</div>}
      {!loading && error && <div className="records-message" role="alert">{error}</div>}
      {!loading && !error && record && <>
        <section className="record-detail-heading surface">
          <div className="record-object-icon"><Database size={18} /></div>
          <div><div className="eyebrow">{object.label}</div><h1>{recordName}</h1><p>Record ID: <code>{record.Id}</code></p></div>
          <div className="record-detail-actions">
            {canEdit && (!recordLayout || recordLayout.actions.includes('Edit')) && <button className="btn btn-brand" onClick={() => openEditForm(record)}><Pencil size={14} />Edit</button>}
            {canDelete && (!recordLayout || recordLayout.actions.includes('Delete')) && <button className="btn btn-danger" onClick={() => void deleteCurrentRecord()}><Trash2 size={14} />{object.apiName === 'User' ? 'Deactivate' : 'Delete'}</button>}
            {(recordLayout?.customLinks ?? []).map((link) => <a key={link.id} className="btn" href={link.url.replace(/\{!Record\.([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, fieldName: string) => encodeURIComponent(String(record[fieldName] ?? '')))}
              target={link.openInNewWindow ? '_blank' : undefined} rel={link.openInNewWindow ? 'noopener noreferrer' : undefined}>{link.label}</a>)}
            {canEdit && (!recordLayout || recordLayout.actions.includes('Edit')) && (object.actions ?? []).filter((action) =>
              action.type === 'Custom' && action.enabled && action.behavior === 'Set Field Value'
              && Boolean(action.fieldApiName && fieldAccess[`${object.apiName}.${action.fieldApiName}`]?.edit)
            ).map((action) => <button className="btn" key={action.id} disabled={Boolean(customActionPendingId)} onClick={() => void runCustomObjectAction(action)}>{customActionPendingId === action.id ? 'Running…' : action.label}</button>)}
          </div>
        </section>
        {customActionMessage && <div className="records-message surface" role="status">{customActionMessage}</div>}
        {assignedPage && <div className="record-runtime-page" data-lightning-page={assignedPage.apiName}>
          {renderRuntimeRegion('header')}
          <div className={assignedPage.template === 'main-sidebar' || assignedPage.template === 'header-main-sidebar' ? 'record-runtime-layout has-sidebar' : 'record-runtime-layout'}>
            <main className="record-runtime-main">{renderRuntimeRegion('main')}</main>
            {assignedPage.template === 'main-sidebar' || assignedPage.template === 'header-main-sidebar'
              ? <aside className="record-runtime-sidebar">{renderRuntimeRegion('sidebar')}</aside>
              : null}
          </div>
        </div>}
        {!assignedPage && compactFields.length > 0 && <section className="record-highlights surface" aria-label="Record highlights">
          {compactFields.map((field) => <div key={field.apiName}><span>{field.label}</span><strong>{formatFieldValue(field, record[field.apiName])}</strong></div>)}
        </section>}
        {!assignedPage && <section className="record-fields-card surface">
          <div className="record-fields-heading"><h2>{recordLayout?.label ?? 'Details'}</h2><button className="icon-button" aria-label="Refresh record" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={15} /></button></div>
          {recordLayout?.sections.length ? recordLayout.sections.map((section) => {
            const sectionFields = section.fieldApiNames.map((name) => fields.find((field) => field.apiName === name)).filter((field): field is FieldMetadata => Boolean(field));
            return <div className="record-layout-section" key={section.id}>
              <h3>{section.label}</h3>
              <dl className={`record-fields-grid columns-${section.columns}`}>
                {sectionFields.map((field) => <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}
              </dl>
            </div>;
          }) : <dl className="record-fields-grid">
            {fields.map((field) => <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}
          </dl>}
          <dl className="record-fields-grid"><div className="record-field"><dt>Record ID</dt><dd><code>{record.Id}</code></dd></div></dl>
        </section>}
        {!assignedPage && object.fieldSets?.length ? <section className="record-fields-card surface">
          <div className="record-fields-heading">
            <h2>Field Set</h2>
            <select className="form-control compact-select" aria-label="Choose field set" value={activeFieldSet?.apiName ?? ''}
              onChange={(event) => setSelectedFieldSetApiName(event.target.value)}>
              {object.fieldSets.map((fieldSet) => <option key={fieldSet.apiName} value={fieldSet.apiName}>{fieldSet.label}</option>)}
            </select>
          </div>
          {fieldSetFields.length
            ? <dl className="record-fields-grid">{fieldSetFields.map((field) =>
              <div className="record-field" key={field.apiName}><dt>{field.label}</dt><dd>{formatFieldValue(field, record[field.apiName])}</dd></div>)}</dl>
            : <div className="records-empty">This field set has no readable fields on this record.</div>}
        </section> : null}
        {!assignedPage && historyEnabled && <section className="record-fields-card surface">
          <div className="record-fields-heading"><h2>Field History</h2><span>{fieldHistory.length} change{fieldHistory.length === 1 ? '' : 's'}</span></div>
          {fieldHistory.length ? <div className="records-table-wrap"><table className="slds-table records-table"><thead><tr><th>Field</th><th>Changed</th><th>Changed By</th><th>Original Value</th><th>New Value</th></tr></thead>
            <tbody>{fieldHistory.map((entry, index) => <tr key={`${String(entry.id ?? entry.changedAt)}-${index}`}>
              <td>{String(entry.fieldLabel ?? entry.fieldApiName ?? '')}</td><td>{formatRecordValue(entry.changedAt)}</td><td>{String(entry.changedByName ?? '')}</td>
              <td>{formatRecordValue(entry.oldValue)}</td><td>{formatRecordValue(entry.newValue)}</td>
            </tr>)}</tbody></table></div> : <div className="records-empty">No tracked field changes yet.</div>}
        </section>}
        {!assignedPage && Object.entries(relatedRecords).map(([relationshipName, related]) => {
            const childObject = objects.find((item) => item.apiName === related.objectApiName);
            const displayFields = childObject?.fields.filter((field) => field.apiName !== related.fieldApiName
              && fieldAccess[`${childObject.apiName}.${field.apiName}`]?.read
              && related.records.some((item) => field.apiName in item)).slice(0, 4) ?? [];
            return <section className="record-fields-card surface related-records-card" key={relationshipName}>
              <div className="record-fields-heading"><h2>{relationshipName}</h2><span>{related.total} record{related.total === 1 ? '' : 's'}</span></div>
              {related.records.length === 0 ? <div className="records-empty">No related {childObject?.pluralLabel.toLocaleLowerCase() ?? 'records'}.</div>
                : <div className="records-table-wrap" style={{ maxHeight: "65vh", overflow: "auto" }}><table className="slds-table records-table"><thead><tr>{displayFields.map((field) => <th key={field.apiName}>{field.label}</th>)}</tr></thead>
                  <tbody>{related.records.map((child) => <tr key={child.Id}>{displayFields.map((field, index) => <td key={field.apiName}>
                    {index === 0 && childObject
                      ? <a href={appRoutePath({ kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })} onClick={(event) => navigateLink(event, { kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })}>{formatRecordValue(child[field.apiName] ?? child.Id)}</a>
                      : formatRecordValue(child[field.apiName])}
                  </td>)}</tr>)}</tbody>
                </table></div>}
              {renderRelatedPagination(relationshipName, related.total, related.records.length)}
            </section>;
        })}
        {relatedError && <div className="records-message surface" role="alert">{relatedError}</div>}
        {lookupError && <div className="records-message surface" role="alert">Some related record names could not be resolved: {lookupError}</div>}
      </>}
      {formOpen && <RecordFormDialog object={object} objects={objects} activeRecordTypes={activeRecordTypes} selectedRecordTypeId={selectedRecordTypeId} profileId={profileId} selectedLayout={selectedLayout}
        fieldAccess={fieldAccess} userRoles={userRoles}
        formValues={formValues} lookupRecords={lookupRecords} formError={formError} saving={saving} editing={Boolean(editingId)}
        actionAllowed={!selectedLayout || selectedLayout.actions.includes(editingId ? 'Edit' : 'New')}
        onChange={(apiName, value) => setFormValues((current) => ({ ...current, [apiName]: value, ...(object.apiName === 'User' && apiName === 'Email' ? { Username: value } : {}) }))}
        onClose={() => setFormOpen(false)} onSubmit={(event) => void saveRecord(event)} />}
    </div>;
  }
  const readableFields = object.fields.filter((field) => fieldAccess[`${object.apiName}.${field.apiName}`]?.read);
  const hasConfiguredSearchResults = object.searchLayouts?.searchResults !== undefined;
  const visibleRecords = records; // Search and pagination are applied by the API.
  const configuredListFields = object.searchLayouts?.searchResults?.map((name) => object.fields.find((field) => field.apiName === name))
    .filter((field): field is FieldMetadata => Boolean(field && fieldAccess[`${object.apiName}.${field.apiName}`]?.read));
  const listFields = hasConfiguredSearchResults
    ? configuredListFields ?? []
    : [...readableFields].sort((left, right) => Number(right.apiName === 'Name') - Number(left.apiName === 'Name'))
      .filter((field) => records.length === 0 || records.some((item) => field.apiName in item));
  const selectableRecordIds = (canMassDelete || canAddToCampaign || canBulkUpdate || canChangeOwner) ? visibleRecords.flatMap((item) => {
    const recordTypeId = String(item.RecordTypeId ?? defaultRecordTypeId);
    const recordLayout = pageLayoutForRecord(object, recordTypeId, profileId);
    return canAddToCampaign
      || canMassDelete && (!recordLayout || recordLayout.actions.includes('Delete'))
      || (canBulkUpdate || canChangeOwner) && (!recordLayout || recordLayout.actions.includes('Edit'))
      ? [item.Id] : [];
  }) : [];
  const selectedOwnerChangeIds = selectedRecordIds.filter((id) => {
    if (!canChangeOwner) return false;
    const item = records.find((candidate) => candidate.Id === id);
    if (!item) return false;
    const layout = pageLayoutForRecord(object, String(item.RecordTypeId ?? defaultRecordTypeId), profileId);
    return !layout || layout.actions.includes('Edit');
  });
  const selectedEditableRecordIds = selectedRecordIds.filter((id) => {
    if (!canBulkUpdate) return false;
    const item = records.find((candidate) => candidate.Id === id);
    if (!item) return false;
    const layout = pageLayoutForRecord(object, String(item.RecordTypeId ?? defaultRecordTypeId), profileId);
    return !layout || layout.actions.includes('Edit');
  });
  const selectedDeletableRecordIds = selectedRecordIds.filter((id) => selectableRecordIds.includes(id)
    && canMassDelete
    && (() => {
      const item = records.find((candidate) => candidate.Id === id);
      if (!item) return false;
      const layout = pageLayoutForRecord(object, String(item.RecordTypeId ?? defaultRecordTypeId), profileId);
      return !layout || layout.actions.includes('Delete');
    })());
  return <div className="records-page">
    {(offlineItems.length>0 || !navigator.onLine) && renderOfflineQueue()}
    <div className="records-page-heading">
      <div className="record-object-icon"><Database size={18} /></div>
      <div><div className="eyebrow">OBJECT</div><h1>{object.pluralLabel}</h1></div>
      <div className="records-heading-actions">
        <button className="btn" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Refresh</button>
      </div>
    </div>
    <section className="records-list-card surface">
      <div className="records-list-toolbar">
        <div><h2>{object.pluralLabel}</h2><span>{loading ? 'Loading records…' : `${listTotal} record${listTotal === 1 ? '' : 's'}`}</span></div>
        <div className="records-list-actions">
          {canCreate && <button className="btn btn-brand" onClick={openCreateForm}><Plus size={14} />New</button>}
          {canImport && <button className="btn" onClick={() => importInputRef.current?.click()}>Import</button>}
          {listFields.length > 0 && <button className="btn" disabled={exporting} onClick={() => void exportFilteredRecords()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>}
          {canAddToCampaign && selectedRecordIds.length > 0 && <button className="btn" onClick={() => void openAddToCampaign()}>Add to Campaign ({selectedRecordIds.length})</button>}
          {object.listViewButtons?.includes('Printable View') && <button className="btn" onClick={() => window.print()}>Printable View</button>}
          {canChangeOwner && selectedOwnerChangeIds.length > 0 && <button type="button" className="btn"
            onClick={() => { setBulkOwnerError(''); setBulkOwnerValue(''); setBulkOwnerDialogOpen(true); }}>
            Change Owner ({selectedOwnerChangeIds.length})
          </button>}
          {canBulkUpdate && selectedEditableRecordIds.length > 0 && <button type="button" className="btn"
            onClick={() => { setBulkFieldApiName(bulkEditableFields[0]?.apiName ?? ''); setBulkFieldValue(''); setBulkFieldBoolean(false); setBulkUpdateError(''); setBulkUpdateOpen(true); }}>
            Bulk Update ({selectedEditableRecordIds.length})
          </button>}
          {canMassDelete && selectedDeletableRecordIds.length > 0 && <button className="btn btn-danger" onClick={() => void deleteSelectedRecords()} disabled={massDeleting}>{massDeleting ? 'Deleting…' : `Delete (${selectedDeletableRecordIds.length})`}</button>}
          <input ref={importInputRef} type="file" accept=".csv,text/csv" hidden aria-label={`Choose ${object.label} CSV file`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void readImportFile(file);
            }} />
        </div>
      </div>
      {listNotice && <div className="records-notice" role="status">{listNotice}</div>}
      {exportError && <div className="records-message" role="alert">{exportError}</div>}
      {error && <div className="records-message" role="alert">{error}</div>}
      {!error && !loading && listTotal === 0 && !debouncedSearch && <div className="records-empty">No {object.pluralLabel.toLocaleLowerCase()} found.</div>}
      {!error && !loading && records.length === 0 && Boolean(debouncedSearch) && <div className="records-empty">No records match “{search}”.</div>}
      {!error && (loading || records.length > 0) && <div className="records-table-wrap" style={{ maxHeight: '65vh', overflowX: 'auto', overflowY: 'auto', maxWidth: '100%' }}><table className="slds-table records-table" style={{ minWidth: 'max-content' }}>
        <thead><tr>{(canMassDelete || canAddToCampaign || canBulkUpdate || canChangeOwner) && <th><input type="checkbox" aria-label="Select all selectable records" checked={selectableRecordIds.length > 0 && selectableRecordIds.every((id) => selectedRecordIds.includes(id))} onChange={(event) => setSelectedRecordIds(event.target.checked ? selectableRecordIds : [])} /></th>}{listFields.map((field) => <th key={field.apiName} aria-sort={listSort?.field === field.apiName ? (listSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
          <button type="button" className="text-action" aria-label={`Sort by ${field.label}${listSort?.field === field.apiName ? ', currently ' + listSort.direction : ''}`}
            onClick={() => { setListOffset(0); setListSort((current) => ({ field: field.apiName, direction: current?.field === field.apiName && current.direction === 'asc' ? 'desc' : 'asc' })); }}>
            {field.label} {listSort?.field === field.apiName ? (listSort.direction === 'asc' ? '▲' : '▼') : '↕'}
          </button></th>)}{(canEdit || canChangeOwner) && <th>Actions</th>}</tr></thead>
        <tbody>{visibleRecords.map((item) => {
          const recordTypeId = String(item.RecordTypeId ?? defaultRecordTypeId);
          const rowLayout = pageLayoutForRecord(object, recordTypeId, profileId);
          const rowAllowsEdit = !rowLayout || rowLayout.actions.includes('Edit');
          const rowAllowsDelete = !rowLayout || rowLayout.actions.includes('Delete');
          const selectable = canAddToCampaign || canMassDelete && rowAllowsDelete || (canBulkUpdate || canChangeOwner) && rowAllowsEdit;
          return <tr key={item.Id}>{(canMassDelete || canAddToCampaign || canBulkUpdate || canChangeOwner) && <td>{selectable && <input type="checkbox" aria-label={`Select ${String(item.Name ?? item.Id)}`} checked={selectedRecordIds.includes(item.Id)} onChange={() => setSelectedRecordIds((current) => current.includes(item.Id) ? current.filter((id) => id !== item.Id) : [...current, item.Id])} />}</td>}{listFields.map((field, index) => <td key={field.apiName}>
            {index === 0
              ? <a href={appRoutePath({ kind: 'record-detail', objectApiName: object.apiName, recordId: item.Id, appId: route.appId })} onClick={(event) => navigateLink(event, { kind: 'record-detail', objectApiName: object.apiName, recordId: item.Id, appId: route.appId })}>{formatFieldValue(field, item[field.apiName] ?? item.Id)}</a>
              : formatFieldValue(field, item[field.apiName])}
          </td>)}{(canEdit || canChangeOwner) && <td>{rowAllowsEdit && <div className="record-row-actions">
            {canEdit && <button className="text-action" onClick={() => openEditForm(item)}><Pencil size={13} />Edit</button>}
            {canChangeOwner && <button className="text-action" onClick={() => openChangeOwner(item)}>Change Owner</button>}
          </div>}</td>}</tr>;
        })}</tbody>
      </table></div>}
      {!error && listTotal > 0 && <nav aria-label="Record list pagination" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' }}>
        <span>{listOffset + 1}–{Math.min(listOffset + records.length, listTotal)} of {listTotal}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn" aria-label="First page" disabled={loading || listOffset === 0} onClick={() => setListOffset(0)}>First</button>
          <button className="btn" aria-label="Previous page" disabled={loading || listOffset === 0} onClick={() => setListOffset((v) => Math.max(0, v - listPageSize))}>Previous</button>
          <span>Page {Math.floor(listOffset / listPageSize) + 1} of {Math.max(1, Math.ceil(listTotal / listPageSize))}</span>
          <button className="btn" aria-label="Next page" disabled={loading || listOffset + listPageSize >= listTotal} onClick={() => setListOffset((v) => v + listPageSize)}>Next</button>
          <button className="btn" aria-label="Last page" disabled={loading || listOffset + listPageSize >= listTotal} onClick={() => setListOffset(Math.floor((listTotal - 1) / listPageSize) * listPageSize)}>Last</button>
        </div>
      </nav>}
    </section>
    {bulkOwnerDialogOpen && <div className="record-form-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !bulkOwnerSaving) setBulkOwnerDialogOpen(false); }}>
      <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="bulk-owner-title">
        <header><div><div className="eyebrow">{object.label}</div><h2 id="bulk-owner-title">Change Owners</h2></div>
          <button className="icon-button" aria-label="Close" disabled={bulkOwnerSaving} onClick={() => setBulkOwnerDialogOpen(false)}><X size={16} /></button>
        </header>
        <form onSubmit={(event) => void saveBulkRecordOwner(event)}>
          <p className="modal-copy">Assign {selectedOwnerChangeIds.length} selected record(s) to a tenant user. Each change checks object permissions and record concurrency.</p>
          <label className="form-label" htmlFor="bulk-owner-select">New owner
            <select id="bulk-owner-select" className="form-control" value={bulkOwnerValue}
              onChange={(event) => setBulkOwnerValue(event.target.value)} disabled={bulkOwnerSaving} required>
              <option value="">Select user…</option>
              {ownerRecords.map((owner) => <option key={owner.Id} value={owner.Id}>{String(owner.Name ?? owner.Email ?? owner.Id)}</option>)}
            </select>
          </label>
          {bulkOwnerError && <div className="records-message" role="alert">{bulkOwnerError}</div>}
          <footer><button className="btn" type="button" disabled={bulkOwnerSaving} onClick={() => setBulkOwnerDialogOpen(false)}>Cancel</button>
            <button className="btn btn-brand" type="submit" disabled={bulkOwnerSaving || !bulkOwnerValue || !selectedOwnerChangeIds.length}>
              {bulkOwnerSaving ? 'Updating…' : 'Assign Selected'}
            </button></footer>
        </form>
      </section>
    </div>}
    {bulkUpdateOpen && <div className="record-form-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !bulkUpdating) setBulkUpdateOpen(false); }}>
      <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="bulk-update-title">
        <header><div><div className="eyebrow">{object.label}</div><h2 id="bulk-update-title">Bulk Update</h2></div>
          <button className="icon-button" aria-label="Close" disabled={bulkUpdating} onClick={() => setBulkUpdateOpen(false)}><X size={16} /></button>
        </header>
        <form onSubmit={(event) => void updateSelectedRecords(event)}>
          <p className="modal-copy">Update one metadata field on {selectedEditableRecordIds.length} selected record(s) from this page. Each record is validated independently and existing values on other fields are preserved.</p>
          <label className="form-label" htmlFor="bulk-field">Field
            <select id="bulk-field" className="form-control" value={bulkFieldApiName} disabled={bulkUpdating} required
              onChange={(event) => { setBulkFieldApiName(event.target.value); setBulkFieldValue(''); setBulkFieldBoolean(false); }}>
              {bulkEditableFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
            </select>
          </label>
          {bulkSelectedField && <label className="form-label" htmlFor="bulk-value">New value
            {/^(?:Checkbox|Boolean)$/i.test(bulkSelectedField.dataType)
              ? <select id="bulk-value" className="form-control" value={String(bulkFieldBoolean)} disabled={bulkUpdating}
                  onChange={(event) => setBulkFieldBoolean(event.target.value === 'true')}>
                  <option value="false">False</option><option value="true">True</option>
                </select>
              : bulkSelectedField.picklistValues?.length && /Picklist/i.test(bulkSelectedField.dataType)
              ? <select id="bulk-value" className="form-control" value={bulkFieldValue} disabled={bulkUpdating}
                  onChange={(event) => setBulkFieldValue(event.target.value)} required>
                  <option value="">Select value…</option>
                  {bulkSelectedField.picklistValues.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              : <input id="bulk-value" className="form-control" disabled={bulkUpdating} value={bulkFieldValue}
                  type={/^(?:Number|Currency|Percent)(?:\(|$)/i.test(bulkSelectedField.dataType) ? 'number'
                    : /^(?:Date\/Time|DateTime)$/i.test(bulkSelectedField.dataType) ? 'datetime-local'
                    : /^Date$/i.test(bulkSelectedField.dataType) ? 'date' : 'text'}
                  step={/^(?:Number|Currency|Percent)(?:\(|$)/i.test(bulkSelectedField.dataType) ? 'any' : undefined}
                  onChange={(event) => setBulkFieldValue(event.target.value)} required />}
          </label>}
          {bulkUpdateError && <div className="records-message" role="alert">{bulkUpdateError}</div>}
          <footer><button type="button" className="btn" disabled={bulkUpdating} onClick={() => setBulkUpdateOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-brand" disabled={bulkUpdating || !selectedEditableRecordIds.length || !bulkSelectedField ||
              (!/^(?:Checkbox|Boolean)$/i.test(bulkSelectedField.dataType) && !bulkFieldValue)}>
              {bulkUpdating ? 'Updating…' : 'Update Selected'}
            </button>
          </footer>
        </form>
      </section>
    </div>}
    {importFileName && <div className="record-form-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importSaving) { setImportFileName(''); setImportRows([]); setImportError(''); } }}>
      <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="import-records-title">
        <header><div><div className="eyebrow">{object.label}</div><h2 id="import-records-title">Import Records</h2></div><button className="icon-button" aria-label="Close" disabled={importSaving} onClick={() => { setImportFileName(''); setImportRows([]); setImportError(''); }}><X size={16} /></button></header>
        <form onSubmit={(event) => { event.preventDefault(); void runImport(); }}>
          <p className="modal-copy">{importFileName}: ready to import {importRows.length} record{importRows.length === 1 ? '' : 's'}. CSV headers may use field API names or labels.</p>
          {importRows.length > 0 && <div className="records-table-wrap"><table className="slds-table records-table">
            <thead><tr>{Object.keys(importRows[0]).map((name) => <th key={name}>{object.fields.find((field) => field.apiName === name)?.label ?? name}</th>)}</tr></thead>
            <tbody>{importRows.slice(0, 3).map((row, index) => <tr key={index}>{Object.values(row).map((value, column) => <td key={`${index}-${column}`}>{String(value)}</td>)}</tr>)}</tbody>
          </table></div>}
          {importError && <div className="records-message" role="alert">{importError}</div>}
          <footer><button type="button" className="btn" disabled={importSaving} onClick={() => { setImportFileName(''); setImportRows([]); setImportError(''); }}>Cancel</button><button type="submit" className="btn btn-brand" disabled={importSaving || !importRows.length}>{importSaving ? 'Importing…' : `Import ${importRows.length} Records`}</button></footer>
        </form>
      </section>
    </div>}
    {campaignDialogOpen && <div className="record-form-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !campaignSaving) setCampaignDialogOpen(false); }}>
      <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="add-to-campaign-title">
        <header><div><div className="eyebrow">CONTACTS</div><h2 id="add-to-campaign-title">Add to Campaign</h2></div><button className="icon-button" aria-label="Close" disabled={campaignSaving} onClick={() => setCampaignDialogOpen(false)}><X size={16} /></button></header>
        <form onSubmit={(event) => { event.preventDefault(); void addSelectedContactsToCampaign(); }}>
          <p className="modal-copy">Add {selectedRecordIds.length} selected contact{selectedRecordIds.length === 1 ? '' : 's'} to an active campaign.</p>
          <label className="form-label" htmlFor="record-campaign">Campaign<select className="form-control" id="record-campaign" value={campaignId} required disabled={campaignLoading || campaignSaving} onChange={(event) => setCampaignId(event.target.value)}>
            <option value="">{campaignLoading ? 'Loading campaigns…' : 'Select a campaign…'}</option>
            {campaignOptions.map((campaign) => <option key={campaign.Id} value={campaign.Id}>{String(campaign.Name ?? campaign.Id)}</option>)}
          </select></label>
          {!campaignLoading && !campaignOptions.length && <p className="permission-help">No active campaigns are available. Create a campaign in the Campaigns object first.</p>}
          {campaignError && <div className="records-message" role="alert">{campaignError}</div>}
          <footer><button type="button" className="btn" disabled={campaignSaving} onClick={() => setCampaignDialogOpen(false)}>Cancel</button><button type="submit" className="btn btn-brand" disabled={campaignSaving || campaignLoading || !campaignId}>{campaignSaving ? 'Adding…' : 'Add Contacts'}</button></footer>
        </form>
      </section>
    </div>}
    {ownerDialogRecord && ownerField && <div className="record-form-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !ownerSaving) setOwnerDialogRecord(null); }}>
      <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="change-owner-title">
        <header><div><div className="eyebrow">{object.label}</div><h2 id="change-owner-title">Change Owner</h2></div><button className="icon-button" aria-label="Close" onClick={() => setOwnerDialogRecord(null)} disabled={ownerSaving}><X size={16} /></button></header>
        <form onSubmit={(event) => void saveRecordOwner(event)}>
          <p className="modal-copy">Select a new owner for {String(ownerDialogRecord.Name ?? ownerDialogRecord.Id)}.</p>
          <label className="form-label" htmlFor="change-record-owner">Owner<select className="form-control" id="change-record-owner" value={ownerValue} required disabled={ownerSaving} onChange={(event) => setOwnerValue(event.target.value)}>
            <option value="">Select a user…</option>
            {ownerValue && !ownerRecords.some((user) => user.Id === ownerValue) && <option value={ownerValue}>{ownerValue}</option>}
            {ownerRecords.map((user) => <option key={user.Id} value={user.Id}>{String(user.Name ?? user.Email ?? user.Id)}</option>)}
          </select></label>
          {ownerError && <div className="records-message" role="alert">{ownerError}</div>}
          <footer><button type="button" className="btn" onClick={() => setOwnerDialogRecord(null)} disabled={ownerSaving}>Cancel</button><button type="submit" className="btn btn-brand" disabled={ownerSaving || !ownerValue}>{ownerSaving ? 'Saving…' : 'Change Owner'}</button></footer>
        </form>
      </section>
    </div>}
    {formOpen && <RecordFormDialog object={object} objects={objects} activeRecordTypes={activeRecordTypes} selectedRecordTypeId={selectedRecordTypeId} profileId={profileId} selectedLayout={selectedLayout}
      fieldAccess={fieldAccess} userRoles={userRoles}
      formValues={formValues} lookupRecords={lookupRecords} formError={formError} saving={saving} editing={Boolean(editingId)}
      actionAllowed={!selectedLayout || selectedLayout.actions.includes(editingId ? 'Edit' : 'New')}
      onChange={(apiName, value) => setFormValues((current) => ({ ...current, [apiName]: value, ...(object.apiName === 'User' && apiName === 'Email' ? { Username: value } : {}) }))}
      onClose={() => setFormOpen(false)} onSubmit={(event) => void saveRecord(event)} />}
  </div>;
}
return { RecordWorkspace, RecordFormDialog };
}
