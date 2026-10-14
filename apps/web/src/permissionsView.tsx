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


export function createPermissions(apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>, PageHeading: (props: {eyebrow?:string;title:string;description?:string;actions?:React.ReactNode}) => React.ReactNode) {
function Permissions({
  accessControl,
  accessControlError,
  objects,
  routeResourceApiName,
  routeResourceId,
  onRouteResourceChange,
  onOpenUserRecords,
  onSave,
  onNotify
}: {
  accessControl: AccessControlMetadata;
  accessControlError: string;
  objects: ObjectMetadata[];
  routeResourceApiName?: string;
  routeResourceId?: string;
  onRouteResourceChange: (resourceApiName: string, resourceId?: string) => void;
  onOpenUserRecords: () => void;
  onSave: (accessControl: AccessControlMetadata) => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(accessControl);
  const [tab, setTab] = useState<'profiles' | 'sets' | 'groups' | 'users' | 'sharing' | 'roles' | 'publicGroups' | 'queues' | 'sharingRules'>(() =>
    routeResourceApiName === 'Users' ? 'users'
      : routeResourceApiName === 'Roles' ? 'roles'
      : routeResourceApiName === 'PublicGroups' ? 'publicGroups'
      : routeResourceApiName === 'Queues' ? 'queues'
      : routeResourceApiName === 'SharingRules' ? 'sharingRules'
      : routeResourceApiName === 'PermissionSetGroups' ? 'groups'
        : routeResourceApiName === 'Profiles' ? 'profiles'
          : routeResourceApiName === 'SharingSettings' ? 'sharing' : 'sets'
  );
  const [selectedId, setSelectedId] = useState(accessControl.permissionSets[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [navigationApps, setNavigationApps] = useState<Array<{ apiName: string; label: string }>>([]);
  useEffect(() => {
    let active = true;
    void apiRequest<{ apps: Array<{ apiName: string; label: string }> }>('/metadata/apps')
      .then((result) => { if (active) setNavigationApps(result.apps); })
      .catch(() => { if (active) setNavigationApps([]); });
    return () => { active = false; };
  }, []);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(accessControl);
    if (!accessControl.permissionSets.some((item) => item.id === selectedId)
      && !accessControl.permissionSetGroups.some((item) => item.id === selectedId)
      && !accessControl.profiles.some((item) => item.id === selectedId)
      && !accessControl.users.some((item) => item.id === selectedId)
      && !accessControl.roles.some((item) => item.id === selectedId)
      && !accessControl.publicGroups.some((item) => item.id === selectedId)
      && !accessControl.queues.some((item) => item.id === selectedId)
      && !accessControl.sharingRules.some((item) => item.id === selectedId)
      && !Object.hasOwn(accessControl.sharingSettings, selectedId)) {
      setSelectedId(accessControl.profiles[0]?.id ?? accessControl.permissionSets[0]?.id ?? accessControl.permissionSetGroups[0]?.id ?? '');
    }
  }, [accessControl]);

  useEffect(() => {
    const resourceTab = routeResourceApiName === 'Users'
      ? 'users'
      : routeResourceApiName === 'PermissionSetGroups' ? 'groups'
        : routeResourceApiName === 'Profiles' ? 'profiles'
          : routeResourceApiName === 'SharingSettings' ? 'sharing'
              : routeResourceApiName === 'Roles' ? 'roles'
                : routeResourceApiName === 'PublicGroups' ? 'publicGroups'
                  : routeResourceApiName === 'Queues' ? 'queues'
                  : routeResourceApiName === 'SharingRules' ? 'sharingRules' : 'sets';
    setTab(resourceTab);
    if (!routeResourceId) return;
    if (resourceTab === 'sharing') {
      if (selectedId !== routeResourceId) setSelectedId(routeResourceId);
      return;
    }
    if (resourceTab === 'roles') {
      const selectedRole = draft.roles.find((item) => item.id === routeResourceId
        || item.apiName.toLowerCase() === routeResourceId.toLowerCase()
        || item.name.toLowerCase() === routeResourceId.toLowerCase());
      if (selectedRole && selectedId !== selectedRole.id) setSelectedId(selectedRole.id);
      return;
    }
    if (resourceTab === 'publicGroups' || resourceTab === 'queues' || resourceTab === 'sharingRules') {
      const items = resourceTab === 'publicGroups' ? draft.publicGroups
        : resourceTab === 'queues' ? draft.queues : draft.sharingRules;
      const selected = items.find((item) => item.id === routeResourceId || item.apiName === routeResourceId);
      if (selected && selectedId !== selected.id) setSelectedId(selected.id);
      return;
    }
    const selectedProfile = draft.profiles.find((item) => item.apiName === routeResourceId || item.id === routeResourceId);
    const selectedSet = draft.permissionSets.find((item) => item.apiName === routeResourceId || item.id === routeResourceId);
    const selectedGroup = draft.permissionSetGroups.find((item) => item.apiName === routeResourceId || item.id === routeResourceId);
    const selectedUser = draft.users.find((item) => item.id === routeResourceId);
    const selectedItem = resourceTab === 'profiles' ? selectedProfile : resourceTab === 'groups' ? selectedGroup : resourceTab === 'users' ? selectedUser : selectedSet;
    if (selectedItem && selectedId !== selectedItem.id) setSelectedId(selectedItem.id);
  }, [routeResourceApiName, routeResourceId, draft, selectedId]);

  const changeTab = (nextTab: 'profiles' | 'sets' | 'groups' | 'users' | 'sharing' | 'roles' | 'publicGroups' | 'queues' | 'sharingRules') => {
    setTab(nextTab);
    const resourceApiName = nextTab === 'profiles' ? 'Profiles' : nextTab === 'sets' ? 'PermissionSets'
      : nextTab === 'groups' ? 'PermissionSetGroups' : nextTab === 'sharing' ? 'SharingSettings'
        : nextTab === 'roles' ? 'Roles' : nextTab === 'publicGroups' ? 'PublicGroups' : nextTab === 'queues' ? 'Queues'
          : nextTab === 'sharingRules' ? 'SharingRules' : 'Users';
    const initialId = nextTab === 'profiles' ? draft.profiles[0]?.id
      : nextTab === 'sets'
      ? draft.permissionSets[0]?.apiName
      : nextTab === 'groups' ? draft.permissionSetGroups[0]?.apiName
        : nextTab === 'sharing' ? objects[0]?.apiName
          : nextTab === 'roles' ? draft.roles[0]?.id
            : nextTab === 'publicGroups' ? draft.publicGroups[0]?.id
              : nextTab === 'queues' ? draft.queues[0]?.id
              : nextTab === 'sharingRules' ? draft.sharingRules[0]?.id : draft.users[0]?.id;
    onRouteResourceChange(resourceApiName, initialId);
    if (nextTab === 'profiles') setSelectedId(draft.profiles[0]?.id ?? '');
    else if (nextTab === 'sets') setSelectedId(draft.permissionSets[0]?.id ?? '');
    else if (nextTab === 'groups') setSelectedId(draft.permissionSetGroups[0]?.id ?? '');
    else if (nextTab === 'sharing') setSelectedId(objects[0]?.apiName ?? '');
    else if (nextTab === 'roles') setSelectedId(draft.roles[0]?.id ?? '');
    else if (nextTab === 'publicGroups') setSelectedId(draft.publicGroups[0]?.id ?? '');
    else if (nextTab === 'queues') setSelectedId(draft.queues[0]?.id ?? '');
    else if (nextTab === 'sharingRules') setSelectedId(draft.sharingRules[0]?.id ?? '');
    else setSelectedId(draft.users[0]?.id ?? '');
  };
  const selectedProfile = draft.profiles.find((item) => item.id === selectedId);
  const selectedSet = draft.permissionSets.find((item) => item.id === selectedId);
  const selectedGroup = draft.permissionSetGroups.find((item) => item.id === selectedId);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProfiles = draft.profiles.filter((item) => `${item.label} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visibleSets = draft.permissionSets.filter((item) => `${item.label} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visibleGroups = draft.permissionSetGroups.filter((item) => `${item.label} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visibleSharingObjects = objects.filter((item) => `${item.label} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visibleRoles = draft.roles.filter((item) => `${item.name} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visiblePublicGroups = draft.publicGroups.filter((item) => `${item.label} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visibleQueues = draft.queues.filter((item) => `${item.label} ${item.apiName}`.toLowerCase().includes(normalizedQuery));
  const visibleSharingRules = draft.sharingRules.filter((item) => `${item.label} ${item.apiName} ${item.objectApiName}`.toLowerCase().includes(normalizedQuery));
  const createProfile = () => {
    const id = crypto.randomUUID();
    const profile = {
      id,
      label: 'New Profile',
      apiName: `New_Profile_${id.slice(0, 8).replace(/-/g, '')}`,
      license: 'MetaDrive',
      description: '',
      isStandard: false,
      systemPermissions: [],
      objectPermissions: Object.fromEntries(objects.map((object) => [object.apiName, {
        read: false, create: false, edit: false, delete: false, viewAll: false, modifyAll: false
      }])),
      recordTypePermissions: Object.fromEntries(objects.flatMap((object) =>
        (object.recordTypes ?? []).filter((recordType) => recordType.active)
          .map((recordType) => [`${object.apiName}.${recordType.id}`, false]))),
      fieldPermissions: Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: false, edit: false } as const])))
    };
    setDraft((current) => ({ ...current, profiles: [...current.profiles, profile] }));
    setSelectedId(id);
    onRouteResourceChange('Profiles', profile.apiName);
  };
  const createRole = () => {
    const id = crypto.randomUUID();
    const role = {
      id,
      name: 'New Role',
      apiName: `New_Role_${id.slice(0, 8).replace(/-/g, '')}`,
      parentRoleId: null
    };
    setDraft((current) => ({ ...current, roles: [...current.roles, role] }));
    setSelectedId(id);
    onRouteResourceChange('Roles', id);
  };
  const createPublicGroup = () => {
    const id = crypto.randomUUID();
    const group: PublicGroupMetadata = {
      id,
      label: 'New Public Group',
      apiName: `New_Public_Group_${id.slice(0, 8).replace(/-/g, '')}`,
      description: '',
      userIds: [],
      roleIds: [],
      roleAndSubordinateIds: [],
      groupIds: []
    };
    setDraft((current) => ({ ...current, publicGroups: [...current.publicGroups, group] }));
    setSelectedId(id);
    onRouteResourceChange('PublicGroups', id);
  };
  const createQueue = () => {
    const id = crypto.randomUUID();
    const queue: QueueMetadata = {
      id,
      label: 'New Queue',
      apiName: `New_Queue_${id.slice(0, 8).replace(/-/g, '')}`,
      description: '',
      supportedObjectApiNames: objects.filter((object) => object.fields.some((field) => field.apiName === 'OwnerId')).slice(0, 1).map((object) => object.apiName),
      userIds: [],
      roleIds: [],
      roleAndSubordinateIds: [],
      publicGroupIds: []
    };
    setDraft((current) => ({ ...current, queues: [...current.queues, queue] }));
    setSelectedId(id);
    onRouteResourceChange('Queues', id);
  };
  const createSharingRule = () => {
    const id = crypto.randomUUID();
    const object = objects.find((item) => item.apiName !== 'User') ?? objects[0];
    if (!object) return;
    const rule: SharingRuleMetadata = {
      id,
      label: 'New Sharing Rule',
      apiName: `New_Sharing_Rule_${id.slice(0, 8).replace(/-/g, '')}`,
      objectApiName: object.apiName,
      active: false,
      type: 'OwnerBased',
      ownerRoleIds: draft.roles[0] ? [draft.roles[0].id] : [],
      criteria: [],
      filterLogic: 'All',
      targetType: 'PublicGroup',
      targetId: draft.publicGroups[0]?.id ?? '',
      accessLevel: 'Read'
    };
    setDraft((current) => ({ ...current, sharingRules: [...current.sharingRules, rule] }));
    setSelectedId(id);
    onRouteResourceChange('SharingRules', id);
  };
  const createSet = () => {
    const id = crypto.randomUUID();
    const permissionSet: PermissionSetMetadata = {
      id,
      label: 'New Permission Set',
      apiName: `New_Permission_Set_${id.slice(0, 8).replace(/-/g, '')}`,
      license: 'MetaDrive',
      description: '',
      systemPermissions: [],
      objectPermissions: Object.fromEntries(objects.map((object) => [object.apiName, {
        read: false, create: false, edit: false, delete: false, viewAll: false, modifyAll: false
      }])),
      recordTypePermissions: Object.fromEntries(objects.flatMap((object) =>
        (object.recordTypes ?? []).filter((recordType) => recordType.active)
          .map((recordType) => [`${object.apiName}.${recordType.id}`, false]))),
      fieldPermissions: Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: false, edit: false } as const])))
    };
    setDraft((current) => ({ ...current, permissionSets: [...current.permissionSets, permissionSet] }));
    setSelectedId(id);
    onRouteResourceChange('PermissionSets', permissionSet.apiName);
  };
  const createGroup = () => {
    const id = crypto.randomUUID();
    const group: PermissionSetGroupMetadata = {
      id,
      label: 'New Permission Set Group',
      apiName: `New_Permission_Set_Group_${id.slice(0, 8).replace(/-/g, '')}`,
      description: '',
      permissionSetIds: [],
      calculationStatus: 'Updated',
      lastCalculatedAt: null,
      mutedSystemPermissions: [],
      mutedObjectPermissions: {},
      mutedRecordTypePermissions: {},
      mutedFieldPermissions: {}
    };
    setDraft((current) => ({ ...current, permissionSetGroups: [...current.permissionSetGroups, group] }));
    setSelectedId(id);
    onRouteResourceChange('PermissionSetGroups', group.apiName);
  };
  const saveDraft = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onNotify(`Unable to save access control: ${message}`);
    } finally {
      setSaving(false);
    }
  };
  const patchSet = (id: string, update: Partial<PermissionSetMetadata>) => {
    setDraft((current) => ({ ...current, permissionSets: current.permissionSets.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const patchGroup = (id: string, update: Partial<PermissionSetGroupMetadata>) => {
    setDraft((current) => ({ ...current, permissionSetGroups: current.permissionSetGroups.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const patchProfile = (id: string, update: Partial<AccessControlMetadata['profiles'][number]>) => {
    setDraft((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const patchUser = (id: string, update: Partial<AccessControlMetadata['users'][number]>) => {
    setDraft((current) => ({ ...current, users: current.users.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const patchPublicGroup = (id: string, update: Partial<PublicGroupMetadata>) => {
    setDraft((current) => ({ ...current, publicGroups: current.publicGroups.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const patchQueue = (id: string, update: Partial<QueueMetadata>) => {
    setDraft((current) => ({ ...current, queues: current.queues.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const patchSharingRule = (id: string, update: Partial<SharingRuleMetadata>) => {
    setDraft((current) => ({ ...current, sharingRules: current.sharingRules.map((item) => item.id === id ? { ...item, ...update } : item) }));
  };
  const toggleString = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const toggleObjectPermission = (set: PermissionSetMetadata, objectName: string, permission: keyof PermissionSetMetadata['objectPermissions'][string]) => {
    const current = set.objectPermissions[objectName] ?? { read: false, create: false, edit: false, delete: false, viewAll: false, modifyAll: false };
    patchSet(set.id, { objectPermissions: { ...set.objectPermissions, [objectName]: { ...current, [permission]: !current[permission] } } });
  };
  const toggleFieldPermission = (set: PermissionSetMetadata, fieldName: string, permission: 'read' | 'edit') => {
    const current = set.fieldPermissions[fieldName] ?? { read: false, edit: false };
    patchSet(set.id, { fieldPermissions: { ...set.fieldPermissions, [fieldName]: { ...current, [permission]: !current[permission] } } });
  };
  const allSystemPermissions = [
    ['metadata:read', 'View metadata'],
    ['metadata:write', 'Manage all application metadata'],
    ['security:read', 'View users and permissions'],
    ['security:manage', 'Manage users and permissions'],
    ['objects:manage', 'Manage objects and fields'],
    ['flows:manage', 'Manage flows'],
    ['flows:run', 'Run flows'],
    ['namedCredentials:manage', 'Manage named credentials'],
    ['email:send', 'Send flow emails'],
    ['callouts:execute', 'Execute Flow HTTP callouts'],
    ['notifications:send', 'Send custom notifications'],
    ['approvals:manage', 'Manage all approval requests'],
    ['reports:manage', 'Manage reports'],
    ['pages:manage', 'Manage Lightning pages'],
    ['components:manage', 'Manage global custom components'],
    ['dashboards:manage', 'Manage all dashboards'],
    ['dashboards:viewTeam', "View My Team's Dashboards"],
    ['data:viewAll', 'View All Data']
  ];
  const tabLabel = tab === 'profiles' ? 'Profiles' : tab === 'sets' ? 'Permission Sets'
    : tab === 'groups' ? 'Permission Set Groups' : tab === 'sharing' ? 'Sharing Settings'
      : tab === 'roles' ? 'Roles' : tab === 'publicGroups' ? 'Public Groups'
        : tab === 'sharingRules' ? 'Sharing Rules' : 'Users';

  return <div className="permissions-page">
    <PageHeading eyebrow="Setup / Users" title={tabLabel} description="Build reusable access grants, combine them into permission set groups, mute group permissions, and assign access to tenant users." actions={<>
      {tab === 'sets' && <button className="btn btn-brand" onClick={createSet} disabled={Boolean(accessControlError)}><Plus size={14} />New Permission Set</button>}
      {tab === 'groups' && <button className="btn btn-brand" onClick={createGroup} disabled={Boolean(accessControlError)}><Plus size={14} />New Permission Set Group</button>}
      {tab === 'profiles' && <button className="btn btn-brand" onClick={createProfile} disabled={Boolean(accessControlError)}><Plus size={14} />New Profile</button>}
      {tab === 'roles' && <button className="btn btn-brand" onClick={createRole} disabled={Boolean(accessControlError)}><Plus size={14} />New Role</button>}
      {tab === 'publicGroups' && <button className="btn btn-brand" onClick={createPublicGroup} disabled={Boolean(accessControlError)}><Plus size={14} />New Public Group</button>}
      {tab === 'queues' && <button className="btn btn-brand" onClick={createQueue} disabled={Boolean(accessControlError) || !objects.some((object) => object.fields.some((field) => field.apiName === 'OwnerId'))}><Plus size={14} />New Queue</button>}
      {tab === 'sharingRules' && <button className="btn btn-brand" onClick={createSharingRule} disabled={Boolean(accessControlError) || !draft.publicGroups.length}><Plus size={14} />New Sharing Rule</button>}
      <button className="btn" onClick={() => void saveDraft()} disabled={saving || Boolean(accessControlError)}><Save size={14} />{saving ? 'Saving…' : 'Save Changes'}</button>
    </>} />
    {accessControlError && <div className="auth-error" role="alert">Unable to load access-control metadata: {accessControlError}</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className="permission-tabs">
      <button className={tab === 'profiles' ? 'active' : ''} onClick={() => changeTab('profiles')}>Profiles</button>
      <button className={tab === 'sets' ? 'active' : ''} onClick={() => changeTab('sets')}>Permission Sets</button>
      <button className={tab === 'groups' ? 'active' : ''} onClick={() => changeTab('groups')}>Permission Set Groups</button>
      <button className={tab === 'users' ? 'active' : ''} onClick={() => changeTab('users')}>Users & Assignments</button>
      <button className={tab === 'roles' ? 'active' : ''} onClick={() => changeTab('roles')}>Roles</button>
      <button className={tab === 'sharing' ? 'active' : ''} onClick={() => changeTab('sharing')}>Sharing Settings</button>
      <button className={tab === 'publicGroups' ? 'active' : ''} onClick={() => changeTab('publicGroups')}>Public Groups</button>
      <button className={tab === 'queues' ? 'active' : ''} onClick={() => changeTab('queues')}>Queues</button>
      <button className={tab === 'sharingRules' ? 'active' : ''} onClick={() => changeTab('sharingRules')}>Sharing Rules</button>
    </div>
    <section className="surface permission-workspace">
      <aside className="permission-list">
        <div className="mini-search"><Search size={13} /><input placeholder={`Search ${tabLabel.toLowerCase()}…`} aria-label={`Search ${tabLabel}`} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {tab === 'profiles' && visibleProfiles.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('Profiles', item.apiName); }}><strong>{item.label}</strong><small>{item.apiName} · {item.license}</small></button>)}
        {tab === 'sets' && visibleSets.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('PermissionSets', item.apiName); }}><strong>{item.label}</strong><small>{item.apiName}</small></button>)}
        {tab === 'groups' && visibleGroups.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('PermissionSetGroups', item.apiName); }}><strong>{item.label}</strong><small>{item.apiName} · {item.permissionSetIds.length} sets</small></button>)}
        {tab === 'users' && draft.users.filter((item) => `${item.name} ${item.username} ${item.role}`.toLowerCase().includes(normalizedQuery)).map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('Users', item.id); }}><strong>{item.name}</strong><small>{item.username} · {item.role}</small></button>)}
        {tab === 'sharing' && visibleSharingObjects.map((item) => <button key={item.apiName} className={`permission-list-item ${item.apiName === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.apiName); onRouteResourceChange('SharingSettings', item.apiName); }}><strong>{item.label}</strong><small>{item.apiName} · {draft.sharingSettings[item.apiName]?.defaultAccess ?? 'Private'}</small></button>)}
        {tab === 'roles' && visibleRoles.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('Roles', item.id); }}><strong>{item.name}</strong><small>{item.apiName} · {item.parentRoleId ? draft.roles.find((role) => role.id === item.parentRoleId)?.name ?? 'Unknown parent' : 'Top level'}</small></button>)}
        {tab === 'publicGroups' && visiblePublicGroups.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('PublicGroups', item.id); }}><strong>{item.label}</strong><small>{item.apiName} · {item.userIds.length + item.roleIds.length + item.roleAndSubordinateIds.length + item.groupIds.length} members</small></button>)}
        {tab === 'queues' && visibleQueues.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('Queues', item.id); }}><strong>{item.label}</strong><small>{item.apiName} · {item.supportedObjectApiNames.length} object types</small></button>)}
        {tab === 'sharingRules' && visibleSharingRules.map((item) => <button key={item.id} className={`permission-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); onRouteResourceChange('SharingRules', item.id); }}><strong>{item.label}</strong><small>{item.objectApiName} · {item.type === 'OwnerBased' ? 'Owner-based' : 'Criteria-based'}</small></button>)}
        {tab === 'profiles' && visibleProfiles.length === 0 && <div className="empty-state">No profiles found.</div>}
        {tab === 'sets' && visibleSets.length === 0 && <div className="empty-state">No permission sets found.</div>}
        {tab === 'groups' && visibleGroups.length === 0 && <div className="empty-state">No permission set groups found.</div>}
        {tab === 'users' && draft.users.length === 0 && <div className="empty-state">No users are available for assignment.</div>}
        {tab === 'sharing' && visibleSharingObjects.length === 0 && <div className="empty-state">No objects found.</div>}
        {tab === 'roles' && visibleRoles.length === 0 && <div className="empty-state">No roles found.</div>}
        {tab === 'publicGroups' && visiblePublicGroups.length === 0 && <div className="empty-state">No public groups found.</div>}
        {tab === 'queues' && visibleQueues.length === 0 && <div className="empty-state">No queues found.</div>}
        {tab === 'sharingRules' && visibleSharingRules.length === 0 && <div className="empty-state">No sharing rules found.</div>}
      </aside>
      <div className="permission-editor">
        {tab === 'sharing' && <>
          <div className="section-toolbar"><div><h2>Organization-Wide Defaults</h2><p>Set the baseline record visibility for each object. Ownership and explicit record shares can grant additional access.</p></div></div>
          <div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Object</th><th>Default Internal Access</th><th>Grant Access Using Hierarchies</th></tr></thead><tbody>{visibleSharingObjects.map((object) => {
            const setting = draft.sharingSettings[object.apiName] ?? { defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true };
            return <tr key={object.apiName}><td><strong>{object.label}</strong><small>{object.apiName}</small></td><td><select className="form-control" aria-label={`${object.label} default internal access`} value={setting.defaultAccess} onChange={(event) => {
              const defaultAccess = event.target.value as typeof setting.defaultAccess;
              setDraft((current) => ({ ...current, sharingSettings: {
                ...current.sharingSettings,
                [object.apiName]: { ...setting, defaultAccess }
              } }));
            }}><option value="Private">Private</option><option value="Public Read Only">Public Read Only</option><option value="Public Read/Write">Public Read/Write</option></select></td><td><input type="checkbox" aria-label={`${object.label} grant access using hierarchies`} checked={setting.grantAccessUsingHierarchies} onChange={(event) => setDraft((current) => ({
              ...current,
              sharingSettings: { ...current.sharingSettings, [object.apiName]: { ...setting, grantAccessUsingHierarchies: event.target.checked } }
            }))} /></td></tr>;
          })}</tbody></table></div>
          <p className="permission-help">Private records are visible to their owner and users with explicit sharing or View All/Modify All access. Object and field permissions still apply.</p>
          {visibleSharingObjects.length > 0 && (() => {
            const object = visibleSharingObjects.find((item) => item.apiName === selectedId) ?? visibleSharingObjects[0];
            const setting = draft.sharingSettings[object.apiName] ?? {
              defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true
            };
            return <AdvancedSharingSettings tenantId={draft.tenantId ?? ''} object={object}
              setting={setting} users={draft.users} roles={draft.roles}
              onChange={(next) => setDraft((current) => ({
                ...current, sharingSettings: { ...current.sharingSettings, [object.apiName]: next }
              }))} />;
          })()}
        </>}
        {tab === 'publicGroups' && (() => {
          const selected = draft.publicGroups.find((item) => item.id === selectedId);
          if (!selected) return <div className="empty-state">Select a public group or create one to get started.</div>;
          const patchMembers = (key: 'userIds' | 'roleIds' | 'roleAndSubordinateIds' | 'groupIds', id: string) =>
            patchPublicGroup(selected.id, { [key]: toggleString(selected[key], id) });
          return <>
            <div className="section-toolbar"><div><h2>{selected.label}</h2><p>Public groups can contain users, roles, role hierarchies, and other public groups.</p></div><button className="btn" onClick={() => {
              if (draft.sharingRules.some((rule) => rule.targetType === 'PublicGroup' && rule.targetId === selected.id)
                || draft.publicGroups.some((group) => group.groupIds.includes(selected.id))) return;
              setDraft((current) => ({ ...current, publicGroups: current.publicGroups.filter((item) => item.id !== selected.id) }));
              setSelectedId('');
            }} disabled={draft.sharingRules.some((rule) => rule.targetType === 'PublicGroup' && rule.targetId === selected.id)
              || draft.publicGroups.some((group) => group.groupIds.includes(selected.id))}><Trash2 size={14} />Delete</button></div>
            <div className="permission-form-grid">
              <label className="form-label">Label<input className="form-control" value={selected.label} onChange={(event) => patchPublicGroup(selected.id, { label: event.target.value })} /></label>
              <label className="form-label">API Name<input className="form-control" value={selected.apiName} onChange={(event) => patchPublicGroup(selected.id, { apiName: event.target.value })} /></label>
              <label className="form-label">Description<input className="form-control" value={selected.description} onChange={(event) => patchPublicGroup(selected.id, { description: event.target.value })} /></label>
            </div>
            <h3 className="permission-section-heading">Users</h3>
            <div className="permission-check-grid">{draft.users.map((user) => <label className="checkbox-row" key={user.id}><input type="checkbox" checked={selected.userIds.includes(user.id)} onChange={() => patchMembers('userIds', user.id)} />{user.name} · {user.username}</label>)}</div>
            <h3 className="permission-section-heading">Roles</h3>
            <div className="permission-check-grid">{draft.roles.map((role) => <label className="checkbox-row" key={role.id}><input type="checkbox" checked={selected.roleIds.includes(role.id)} onChange={() => patchMembers('roleIds', role.id)} />{role.name}</label>)}</div>
            <h3 className="permission-section-heading">Roles and Subordinates</h3>
            <div className="permission-check-grid">{draft.roles.map((role) => <label className="checkbox-row" key={role.id}><input type="checkbox" checked={selected.roleAndSubordinateIds.includes(role.id)} onChange={() => patchMembers('roleAndSubordinateIds', role.id)} />{role.name} and subordinate roles</label>)}</div>
            <h3 className="permission-section-heading">Nested Public Groups</h3>
            <div className="permission-check-grid">{draft.publicGroups.filter((group) => group.id !== selected.id).map((group) => <label className="checkbox-row" key={group.id}><input type="checkbox" checked={selected.groupIds.includes(group.id)} onChange={() => patchMembers('groupIds', group.id)} />{group.label}</label>)}</div>
          </>;
        })()}
        {tab === 'sharingRules' && (() => {
          const selected = draft.sharingRules.find((item) => item.id === selectedId);
          if (!selected) return <div className="empty-state">Select a sharing rule or create one to get started.</div>;
          const object = objects.find((item) => item.apiName === selected.objectApiName);
          const targetOptions = selected.targetType === 'User' ? draft.users.map((item) => [item.id, item.name] as const)
            : selected.targetType === 'PublicGroup' ? draft.publicGroups.map((item) => [item.id, item.label] as const)
              : draft.roles.map((item) => [item.id, item.name] as const);
          const toggleOwnerRole = (roleId: string) => patchSharingRule(selected.id, {
            ownerRoleIds: toggleString(selected.ownerRoleIds, roleId)
          });
          return <>
            <div className="section-toolbar"><div><h2>{selected.label}</h2><p>Automated record access is evaluated dynamically and never bypasses object or field permissions.</p></div><button className="btn" onClick={() => {
              setDraft((current) => ({ ...current, sharingRules: current.sharingRules.filter((item) => item.id !== selected.id) }));
              setSelectedId('');
            }}><Trash2 size={14} />Delete</button></div>
            <div className="permission-form-grid">
              <label className="form-label">Label<input className="form-control" value={selected.label} onChange={(event) => patchSharingRule(selected.id, { label: event.target.value })} /></label>
              <label className="form-label">API Name<input className="form-control" value={selected.apiName} onChange={(event) => patchSharingRule(selected.id, { apiName: event.target.value })} /></label>
              <label className="form-label">Object<select className="form-control" value={selected.objectApiName} onChange={(event) => patchSharingRule(selected.id, { objectApiName: event.target.value, criteria: [] })}>{objects.filter((item) => item.apiName !== 'User').map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}</select></label>
              <label className="form-label">Rule Type<select className="form-control" value={selected.type} onChange={(event) => patchSharingRule(selected.id, { type: event.target.value as SharingRuleMetadata['type'] })}><option value="OwnerBased">Owner-based</option><option value="CriteriaBased">Criteria-based</option></select></label>
              <label className="form-label">Share With<select className="form-control" value={selected.targetType} onChange={(event) => {
                const targetType = event.target.value as SharingRuleMetadata['targetType'];
                const initialTarget = targetType === 'User' ? draft.users[0]?.id
                  : targetType === 'PublicGroup' ? draft.publicGroups[0]?.id : draft.roles[0]?.id;
                patchSharingRule(selected.id, { targetType, targetId: initialTarget ?? '' });
              }}><option value="PublicGroup">Public Group</option><option value="Role">Role</option><option value="RoleAndSubordinates">Role and Subordinates</option><option value="User">User</option></select></label>
              <label className="form-label">Target<select className="form-control" value={selected.targetId} onChange={(event) => patchSharingRule(selected.id, { targetId: event.target.value })}>{targetOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label className="form-label">Access Level<select className="form-control" value={selected.accessLevel} onChange={(event) => patchSharingRule(selected.id, { accessLevel: event.target.value as SharingRuleMetadata['accessLevel'] })}><option value="Read">Read Only</option><option value="Edit">Read/Write</option></select></label>
              <label className="checkbox-row"><input type="checkbox" checked={selected.active} onChange={(event) => patchSharingRule(selected.id, { active: event.target.checked })} />Active</label>
            </div>
            {selected.type === 'OwnerBased' ? <>
              <h3 className="permission-section-heading">Records Owned By Roles</h3>
              <div className="permission-check-grid">{draft.roles.map((role) => <label className="checkbox-row" key={role.id}><input type="checkbox" checked={selected.ownerRoleIds.includes(role.id)} onChange={() => toggleOwnerRole(role.id)} />{role.name} and subordinate roles</label>)}</div>
            </> : <>
              <h3 className="permission-section-heading">Criteria</h3>
              <label className="form-label">Condition Logic<select className="form-control" value={selected.filterLogic} onChange={(event) => patchSharingRule(selected.id, { filterLogic: event.target.value as 'All' | 'Any' })}><option value="All">All conditions are met</option><option value="Any">Any condition is met</option></select></label>
              {selected.criteria.map((criterion, index) => <div className="permission-form-grid" key={`${selected.id}-criterion-${index}`}>
                <label className="form-label">Field<select className="form-control" value={criterion.fieldApiName} onChange={(event) => {
                  const criteria = selected.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, fieldApiName: event.target.value } : item);
                  patchSharingRule(selected.id, { criteria });
                }}>{(object?.fields ?? []).map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select></label>
                <label className="form-label">Operator<select className="form-control" value={criterion.operator} onChange={(event) => {
                  const operator = event.target.value as SharingRuleMetadata['criteria'][number]['operator'];
                  const criteria = selected.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, operator, value: operator === 'Is Null' ? '' : item.value } : item);
                  patchSharingRule(selected.id, { criteria });
                }}>{['Equals', 'Not Equals', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null'].map((operator) => <option key={operator}>{operator}</option>)}</select></label>
                {criterion.operator !== 'Is Null' && <label className="form-label">Value<input className="form-control" value={criterion.value} onChange={(event) => {
                  const criteria = selected.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item);
                  patchSharingRule(selected.id, { criteria });
                }} /></label>}
                <button className="btn" onClick={() => patchSharingRule(selected.id, { criteria: selected.criteria.filter((_item, itemIndex) => itemIndex !== index) })}><Trash2 size={14} />Remove condition</button>
              </div>)}
              <button className="btn" onClick={() => {
                const fieldApiName = object?.fields[0]?.apiName;
                if (fieldApiName) patchSharingRule(selected.id, { criteria: [...selected.criteria, { fieldApiName, operator: 'Equals', value: '' }] });
              }} disabled={!object?.fields.length}><Plus size={14} />Add Condition</button>
            </>}
          </>;
        })()}
        {tab === 'roles' && (() => {
          const selectedRole = draft.roles.find((role) => role.id === selectedId);
          if (!selectedRole) return <div className="empty-state">Select a role or create one to get started.</div>;
          const assignedUsers = draft.users.filter((user) => user.roleId === selectedRole.id);
          const childRoles = draft.roles.filter((role) => role.parentRoleId === selectedRole.id);
          return <>
            <div className="section-toolbar"><div><h2>{selectedRole.name}</h2><p>Role hierarchy · {assignedUsers.length} assigned users · {childRoles.length} child roles</p></div><button className="btn" onClick={() => {
              if (assignedUsers.length || childRoles.length) return;
              setDraft((current) => ({ ...current, roles: current.roles.filter((role) => role.id !== selectedRole.id) }));
              setSelectedId('');
            }} disabled={Boolean(assignedUsers.length || childRoles.length)}><Trash2 size={14} />Delete</button></div>
            <div className="permission-form-grid">
              <label className="form-label">Role Name<input className="form-control" value={selectedRole.name} onChange={(event) => setDraft((current) => ({ ...current, roles: current.roles.map((role) => role.id === selectedRole.id ? { ...role, name: event.target.value } : role) }))} /></label>
              <label className="form-label">Role API Name<input className="form-control" value={selectedRole.apiName} onChange={(event) => setDraft((current) => ({ ...current, roles: current.roles.map((role) => role.id === selectedRole.id ? { ...role, apiName: event.target.value } : role) }))} /></label>
              <label className="form-label">Reports To<select className="form-control" value={selectedRole.parentRoleId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, roles: current.roles.map((role) => role.id === selectedRole.id ? { ...role, parentRoleId: event.target.value || null } : role) }))}><option value="">No parent role</option>{draft.roles.filter((role) => role.id !== selectedRole.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            </div>
            <h3 className="permission-section-heading">Assigned Users</h3>
            {assignedUsers.length ? <ul>{assignedUsers.map((user) => <li key={user.id}>{user.name} · {user.username}</li>)}</ul> : <p className="permission-help">Assign users to this role in Users & Assignments.</p>}
          </>;
        })()}
        {tab === 'profiles' && selectedProfile && <>
          <div className="section-toolbar"><div><h2>{selectedProfile.label}</h2><p>Profile · {selectedProfile.apiName}{selectedProfile.isStandard ? ' · Standard' : ''}</p></div><button className="btn" onClick={() => {
            if (selectedProfile.isStandard || draft.users.some((user) => user.profileId === selectedProfile.id)) return;
            setDraft((current) => ({ ...current, profiles: current.profiles.filter((item) => item.id !== selectedProfile.id) }));
            setSelectedId('');
          }} disabled={selectedProfile.isStandard || draft.users.some((user) => user.profileId === selectedProfile.id)}><Trash2 size={14} />Delete</button></div>
          <div className="permission-form-grid">
            <label className="form-label">Label<input className="form-control" value={selectedProfile.label} onChange={(event) => patchProfile(selectedProfile.id, { label: event.target.value })} /></label>
            <label className="form-label">API Name<input className="form-control" value={selectedProfile.apiName} onChange={(event) => patchProfile(selectedProfile.id, { apiName: event.target.value })} /></label>
            <label className="form-label">License<input className="form-control" value={selectedProfile.license} onChange={(event) => patchProfile(selectedProfile.id, { license: event.target.value })} /></label>
            <label className="form-label">Description<input className="form-control" value={selectedProfile.description} onChange={(event) => patchProfile(selectedProfile.id, { description: event.target.value })} /></label>
          </div>
          <h3 className="permission-section-heading">System Permissions</h3>
          <div className="permission-check-grid">{allSystemPermissions.map(([key, label]) => <label className="checkbox-row" key={key}><input type="checkbox" checked={selectedProfile.systemPermissions.includes(key)} onChange={() => patchProfile(selectedProfile.id, { systemPermissions: toggleString(selectedProfile.systemPermissions, key) })} />{label}</label>)}</div>
          
          <h3 className="permission-section-heading">Application Access</h3>
          <p className="permission-help">Navigation access does not grant underlying data permissions.</p>
          <div className="permission-check-grid">{navigationApps.map((app) => <label className="checkbox-row" key={app.apiName}>
            <input type="checkbox" checked={(selectedProfile.appPermissions?.[app.apiName] !== false)}
              onChange={(event) => patchProfile(selectedProfile.id, { appPermissions: { ...selectedProfile.appPermissions, [app.apiName]: event.target.checked } })} />
            {app.label}
          </label>)}</div>
          <h3 className="permission-section-heading">Tab Visibility</h3>
          <div className="permission-check-grid">{objects.map((object) => <label className="checkbox-row" key={object.apiName}>
            <input type="checkbox" checked={(selectedProfile.tabPermissions?.[object.apiName] !== false)}
              onChange={(event) => patchProfile(selectedProfile.id, { tabPermissions: { ...selectedProfile.tabPermissions, [object.apiName]: event.target.checked } })} />
            {object.label}
          </label>)}</div>
          <h3 className="permission-section-heading">Object Permissions</h3>
          <div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Object</th>{(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((permission) => <th key={permission}>{permission === 'viewAll' ? 'View All' : permission === 'modifyAll' ? 'Modify All' : permission[0].toUpperCase() + permission.slice(1)}</th>)}</tr></thead><tbody>{objects.map((object) => <tr key={object.apiName}><td><strong>{object.label}</strong><small>{object.apiName}</small></td>{(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((permission) => <td key={permission}><input type="checkbox" aria-label={`${selectedProfile.label} ${object.label} ${permission}`} checked={Boolean(selectedProfile.objectPermissions[object.apiName]?.[permission])} onChange={() => {
            const current = selectedProfile.objectPermissions[object.apiName] ?? { read: false, create: false, edit: false, delete: false, viewAll: false, modifyAll: false };
            patchProfile(selectedProfile.id, { objectPermissions: { ...selectedProfile.objectPermissions, [object.apiName]: { ...current, [permission]: !current[permission] } } });
          }} /></td>)}</tr>)}</tbody></table></div>
          <h3 className="permission-section-heading">Record Type Access</h3>
          {objects.filter((object) => object.recordTypes?.length).map((object) => <div className="permission-table-wrap" key={object.apiName}><table className="slds-table permission-matrix"><thead><tr><th>{object.label}</th><th>Available</th></tr></thead><tbody>{object.recordTypes?.filter((recordType) => recordType.active).map((recordType) => {
            const key = `${object.apiName}.${recordType.id}`;
            return <tr key={key}><td><strong>{recordType.label}</strong><small>{recordType.developerName}</small></td><td><input type="checkbox" aria-label={`${selectedProfile.label} ${object.label} ${recordType.label} available`} checked={selectedProfile.recordTypePermissions[key] !== false} onChange={() => patchProfile(selectedProfile.id, { recordTypePermissions: { ...selectedProfile.recordTypePermissions, [key]: selectedProfile.recordTypePermissions[key] === false } })} /></td></tr>;
          })}</tbody></table></div>)}
          <h3 className="permission-section-heading">Field Permissions</h3>
          {objects.map((object) => <details className="permission-field-group" key={object.apiName}><summary>{object.label} ({object.fields.length} fields)</summary><div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Field</th><th>Read</th><th>Edit</th></tr></thead><tbody>{object.fields.map((field) => {
            const fieldName = `${object.apiName}.${field.apiName}`;
            const permissions = selectedProfile.fieldPermissions[fieldName] ?? { read: false, edit: false };
            return <tr key={fieldName}><td><strong>{field.label}</strong><small>{field.apiName}</small></td>{(['read', 'edit'] as const).map((permission) => <td key={permission}><input type="checkbox" aria-label={`${selectedProfile.label} ${object.label}.${field.label} ${permission}`} checked={permissions[permission]} onChange={() => patchProfile(selectedProfile.id, { fieldPermissions: { ...selectedProfile.fieldPermissions, [fieldName]: { ...permissions, [permission]: !permissions[permission] } } })} /></td>)}</tr>;
          })}</tbody></table></div></details>)}
        </>}
        {tab === 'sets' && selectedSet && <>
          <div className="section-toolbar"><div><h2>{selectedSet.label}</h2><p>Permission Set · {selectedSet.apiName}</p></div><button className="btn" onClick={() => {
            if (selectedSet.id === 'system-administrator'
              || draft.users.some((user) => user.permissionSetIds.includes(selectedSet.id))
              || draft.permissionSetGroups.some((group) => group.permissionSetIds.includes(selectedSet.id))) return;
            setDraft((current) => ({ ...current, permissionSets: current.permissionSets.filter((item) => item.id !== selectedSet.id) }));
            setSelectedId('');
          }} disabled={selectedSet.id === 'system-administrator' || draft.users.some((user) => user.permissionSetIds.includes(selectedSet.id)) || draft.permissionSetGroups.some((group) => group.permissionSetIds.includes(selectedSet.id))}><Trash2 size={14} />Delete</button></div>
          <div className="permission-form-grid">
            <label className="form-label">Label<input className="form-control" value={selectedSet.label} onChange={(event) => patchSet(selectedSet.id, { label: event.target.value })} /></label>
            <label className="form-label">API Name<input className="form-control" value={selectedSet.apiName} onChange={(event) => patchSet(selectedSet.id, { apiName: event.target.value })} /></label>
            <label className="form-label">License<input className="form-control" value={selectedSet.license} onChange={(event) => patchSet(selectedSet.id, { license: event.target.value })} /></label>
            <label className="form-label">Description<input className="form-control" value={selectedSet.description} onChange={(event) => patchSet(selectedSet.id, { description: event.target.value })} /></label>
          </div>
          <h3 className="permission-section-heading">System Permissions</h3>
          <div className="permission-check-grid">{allSystemPermissions.map(([key, label]) => <label className="checkbox-row" key={key}><input type="checkbox" checked={selectedSet.systemPermissions.includes(key)} onChange={() => patchSet(selectedSet.id, { systemPermissions: toggleString(selectedSet.systemPermissions, key) })} />{label}</label>)}</div>
          
          <h3 className="permission-section-heading">Application Access</h3>
          <p className="permission-help">Navigation access does not grant underlying data permissions.</p>
          <div className="permission-check-grid">{navigationApps.map((app) => <label className="checkbox-row" key={app.apiName}>
            <input type="checkbox" checked={Boolean(selectedSet.appPermissions?.[app.apiName])}
              onChange={(event) => patchSet(selectedSet.id, { appPermissions: { ...selectedSet.appPermissions, [app.apiName]: event.target.checked } })} />
            {app.label}
          </label>)}</div>
          <h3 className="permission-section-heading">Tab Visibility</h3>
          <div className="permission-check-grid">{objects.map((object) => <label className="checkbox-row" key={object.apiName}>
            <input type="checkbox" checked={Boolean(selectedSet.tabPermissions?.[object.apiName])}
              onChange={(event) => patchSet(selectedSet.id, { tabPermissions: { ...selectedSet.tabPermissions, [object.apiName]: event.target.checked } })} />
            {object.label}
          </label>)}</div>
          <h3 className="permission-section-heading">Object Permissions</h3>
          <div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Object</th>{(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((permission) => <th key={permission}>{permission === 'viewAll' ? 'View All' : permission === 'modifyAll' ? 'Modify All' : permission[0].toUpperCase() + permission.slice(1)}</th>)}</tr></thead><tbody>{objects.map((object) => <tr key={object.apiName}><td><strong>{object.label}</strong><small>{object.apiName}</small></td>{(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((permission) => <td key={permission}><input type="checkbox" aria-label={`${object.label} ${permission}`} checked={Boolean(selectedSet.objectPermissions[object.apiName]?.[permission])} onChange={() => toggleObjectPermission(selectedSet, object.apiName, permission)} /></td>)}</tr>)}</tbody></table></div>
          <h3 className="permission-section-heading">Record Type Access</h3>
          {objects.filter((object) => object.recordTypes?.length).map((object) => <div className="permission-table-wrap" key={object.apiName}><table className="slds-table permission-matrix"><thead><tr><th>{object.label}</th><th>Available</th></tr></thead><tbody>{object.recordTypes?.filter((recordType) => recordType.active).map((recordType) => {
            const key = `${object.apiName}.${recordType.id}`;
            return <tr key={key}><td><strong>{recordType.label}</strong><small>{recordType.developerName}</small></td><td><input type="checkbox" aria-label={`${selectedSet.label} ${object.label} ${recordType.label} available`} checked={selectedSet.recordTypePermissions[key] === true} onChange={() => patchSet(selectedSet.id, { recordTypePermissions: { ...selectedSet.recordTypePermissions, [key]: selectedSet.recordTypePermissions[key] !== true } })} /></td></tr>;
          })}</tbody></table></div>)}
          <h3 className="permission-section-heading">Field Permissions</h3>
          {objects.map((object) => <details className="permission-field-group" key={object.apiName}><summary>{object.label} ({object.fields.length} fields)</summary><div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Field</th><th>Read</th><th>Edit</th></tr></thead><tbody>{object.fields.map((field) => {
            const fieldName = `${object.apiName}.${field.apiName}`;
            const permissions = selectedSet.fieldPermissions[fieldName] ?? { read: false, edit: false };
            return <tr key={fieldName}><td><strong>{field.label}</strong><small>{field.apiName}</small></td>{(['read', 'edit'] as const).map((permission) => <td key={permission}><input type="checkbox" aria-label={`${object.label}.${field.label} ${permission}`} checked={permissions[permission]} onChange={() => toggleFieldPermission(selectedSet, fieldName, permission)} /></td>)}</tr>;
          })}</tbody></table></div></details>)}
        </>}
        {tab === 'groups' && selectedGroup && <>
          <div className="section-toolbar"><div><h2>{selectedGroup.label}</h2><p>Permission Set Group · {selectedGroup.apiName}</p></div><button className="btn" onClick={() => {
            if (draft.users.some((user) => user.permissionSetGroupIds.includes(selectedGroup.id))) return;
            setDraft((current) => ({ ...current, permissionSetGroups: current.permissionSetGroups.filter((item) => item.id !== selectedGroup.id) }));
            setSelectedId('');
          }} disabled={draft.users.some((user) => user.permissionSetGroupIds.includes(selectedGroup.id))}><Trash2 size={14} />Delete</button></div>
          <div className="permission-form-grid">
            <label className="form-label">Label<input className="form-control" value={selectedGroup.label} onChange={(event) => patchGroup(selectedGroup.id, { label: event.target.value })} /></label>
            <label className="form-label">API Name<input className="form-control" value={selectedGroup.apiName} onChange={(event) => patchGroup(selectedGroup.id, { apiName: event.target.value })} /></label>
            <label className="form-label">Description<input className="form-control" value={selectedGroup.description} onChange={(event) => patchGroup(selectedGroup.id, { description: event.target.value })} /></label>
          </div>
          <h3 className="permission-section-heading">Permission Sets in Group</h3>
          <div className="permission-check-grid">{draft.permissionSets.map((permissionSet) => <label className="checkbox-row" key={permissionSet.id}><input type="checkbox" checked={selectedGroup.permissionSetIds.includes(permissionSet.id)} onChange={() => patchGroup(selectedGroup.id, { permissionSetIds: toggleString(selectedGroup.permissionSetIds, permissionSet.id) })} />{permissionSet.label}</label>)}</div>
          <h3 className="permission-section-heading">Muted System Permissions</h3>
          <p className="permission-help">Muted permissions remove grants contributed by this group; direct permission-set assignments remain in effect.</p>
          <div className="permission-check-grid">{allSystemPermissions.map(([key, label]) => <label className="checkbox-row" key={key}><input type="checkbox" checked={selectedGroup.mutedSystemPermissions.includes(key)} onChange={() => patchGroup(selectedGroup.id, { mutedSystemPermissions: toggleString(selectedGroup.mutedSystemPermissions, key) })} />{label}</label>)}</div>
          
          <h3 className="permission-section-heading">Muted Application Access</h3>
          <div className="permission-check-grid">{navigationApps.map((app) => <label className="checkbox-row" key={app.apiName}>
            <input type="checkbox" checked={Boolean(selectedGroup.mutedAppPermissions?.[app.apiName])}
              onChange={(event) => patchGroup(selectedGroup.id, { mutedAppPermissions: { ...selectedGroup.mutedAppPermissions, [app.apiName]: event.target.checked } })} />
            {app.label}
          </label>)}</div>
          <h3 className="permission-section-heading">Muted Tab Visibility</h3>
          <div className="permission-check-grid">{objects.map((object) => <label className="checkbox-row" key={object.apiName}>
            <input type="checkbox" checked={Boolean(selectedGroup.mutedTabPermissions?.[object.apiName])}
              onChange={(event) => patchGroup(selectedGroup.id, { mutedTabPermissions: { ...selectedGroup.mutedTabPermissions, [object.apiName]: event.target.checked } })} />
            {object.label}
          </label>)}</div>
          <h3 className="permission-section-heading">Muted Object Permissions</h3>
          <div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Object</th>{(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((permission) => <th key={permission}>{permission === 'viewAll' ? 'View All' : permission === 'modifyAll' ? 'Modify All' : permission[0].toUpperCase() + permission.slice(1)}</th>)}</tr></thead><tbody>{objects.map((object) => <tr key={object.apiName}><td><strong>{object.label}</strong><small>{object.apiName}</small></td>{(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((permission) => <td key={permission}><input type="checkbox" aria-label={`Mute ${object.label} ${permission}`} checked={Boolean(selectedGroup.mutedObjectPermissions[object.apiName]?.[permission])} onChange={() => patchGroup(selectedGroup.id, { mutedObjectPermissions: { ...selectedGroup.mutedObjectPermissions, [object.apiName]: { ...selectedGroup.mutedObjectPermissions[object.apiName], [permission]: !selectedGroup.mutedObjectPermissions[object.apiName]?.[permission] } } })} /></td>)}</tr>)}</tbody></table></div>
          <h3 className="permission-section-heading">Muted Record Type Access</h3>
          {objects.filter((object) => object.recordTypes?.length).map((object) => <div className="permission-table-wrap" key={object.apiName}><table className="slds-table permission-matrix"><thead><tr><th>{object.label}</th><th>Mute Access</th></tr></thead><tbody>{object.recordTypes?.filter((recordType) => recordType.active).map((recordType) => {
            const key = `${object.apiName}.${recordType.id}`;
            return <tr key={key}><td><strong>{recordType.label}</strong><small>{recordType.developerName}</small></td><td><input type="checkbox" aria-label={`Mute ${object.label} ${recordType.label}`} checked={Boolean(selectedGroup.mutedRecordTypePermissions[key])} onChange={() => patchGroup(selectedGroup.id, { mutedRecordTypePermissions: { ...selectedGroup.mutedRecordTypePermissions, [key]: !selectedGroup.mutedRecordTypePermissions[key] } })} /></td></tr>;
          })}</tbody></table></div>)}
          <h3 className="permission-section-heading">Muted Field Permissions</h3>
          {objects.map((object) => <details className="permission-field-group" key={object.apiName}><summary>{object.label} ({object.fields.length} fields)</summary><div className="permission-table-wrap"><table className="slds-table permission-matrix"><thead><tr><th>Field</th><th>Mute Read</th><th>Mute Edit</th></tr></thead><tbody>{object.fields.map((field) => {
            const fieldName = `${object.apiName}.${field.apiName}`;
            const permissions = selectedGroup.mutedFieldPermissions[fieldName] ?? {};
            return <tr key={fieldName}><td><strong>{field.label}</strong><small>{field.apiName}</small></td>{(['read', 'edit'] as const).map((permission) => <td key={permission}><input type="checkbox" aria-label={`Mute ${object.label}.${field.label} ${permission}`} checked={Boolean(permissions[permission])} onChange={() => patchGroup(selectedGroup.id, { mutedFieldPermissions: { ...selectedGroup.mutedFieldPermissions, [fieldName]: { ...permissions, [permission]: !permissions[permission] } } })} /></td>)}</tr>;
          })}</tbody></table></div></details>)}
        </>}
        {tab === 'users' && <>
          <div className="section-toolbar"><div><h2>User Assignments</h2><p>Direct permission-set and permission-set-group memberships for this tenant.</p></div><button className="btn btn-brand" onClick={onOpenUserRecords}>Manage Users (CRUD)</button></div>
          {draft.users.map((user) => <details className="permission-user-card" key={user.id}><summary><strong>{user.name}</strong><span>{user.username}</span><span>{draft.roles.find((role) => role.id === user.roleId)?.name ?? user.role}</span></summary><label className="form-label">Role<select className="form-control" value={user.roleId} onChange={(event) => patchUser(user.id, { roleId: event.target.value, role: draft.roles.find((role) => role.id === event.target.value)?.name ?? user.role })}>{draft.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="form-label">Profile<select className="form-control" value={user.profileId} onChange={(event) => patchUser(user.id, { profileId: event.target.value })}>{draft.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.license}</option>)}</select></label><label className="form-label">Time Zone (IANA)<input className="form-control" value={user.timeZone} onChange={(event) => patchUser(user.id, { timeZone: event.target.value })} placeholder="America/Los_Angeles" /></label><label className="form-label">Locale (BCP 47)<input className="form-control" value={user.locale} onChange={(event) => patchUser(user.id, { locale: event.target.value })} placeholder="en-US" /></label><label className="form-label">Currency (ISO 4217)<input className="form-control" value={user.currencyIsoCode ?? ''} onChange={(event) => patchUser(user.id, { currencyIsoCode: event.target.value.toUpperCase() || undefined })} placeholder="USD" /></label><label className="form-label">User Type
          <select className="form-control" value={user.userType ?? 'internal'}
            onChange={(event) => patchUser(user.id, {
              userType: event.target.value as 'internal' | 'external',
              externalAccountId: event.target.value === 'external' ? user.externalAccountId : undefined
            })}>
            <option value="internal">Internal</option><option value="external">External portal</option>
          </select></label>
          {user.userType === 'external' && <label className="form-label">Verified tenant Account ID
            <input className="form-control" value={user.externalAccountId ?? ''}
              onChange={(event) => patchUser(user.id, { externalAccountId: event.target.value })}
              placeholder="Tenant account record ID" />
          </label>}<h3 className="permission-section-heading">Permission Sets</h3><div className="permission-check-grid">{draft.permissionSets.map((permissionSet) => <label className="checkbox-row" key={permissionSet.id}><input type="checkbox" checked={user.permissionSetIds.includes(permissionSet.id)} onChange={() => patchUser(user.id, { permissionSetIds: toggleString(user.permissionSetIds, permissionSet.id) })} />{permissionSet.label}</label>)}</div><h3 className="permission-section-heading">Permission Set Groups</h3><div className="permission-check-grid">{draft.permissionSetGroups.map((group) => <label className="checkbox-row" key={group.id}><input type="checkbox" checked={user.permissionSetGroupIds.includes(group.id)} onChange={() => patchUser(user.id, { permissionSetGroupIds: toggleString(user.permissionSetGroupIds, group.id) })} />{group.label}</label>)}</div></details>)}
        </>}
        {tab === 'profiles' && !selectedProfile && <div className="empty-state">Select a profile or create one to get started.</div>}
        {tab === 'sets' && !selectedSet && <div className="empty-state">Select a permission set or create one to get started.</div>}
        {tab === 'groups' && !selectedGroup && <div className="empty-state">Select a permission set group or create one to get started.</div>}
      </div>
    </section>
    <div className="permission-info"><ShieldCheck size={17} /><span>Tenant-scoped grants are evaluated by the API. Permission-set groups combine their member grants and can mute group-contributed system and object permissions; direct assignments are unaffected by group muting.</span></div>
  </div>;
}


return Permissions;
}
