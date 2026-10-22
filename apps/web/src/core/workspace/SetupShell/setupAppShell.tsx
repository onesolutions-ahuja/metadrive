






import { relatedLookupFilterOperators } from '../../records/RecordWorkspace/recordMetadataUtils';


import { objectSettings, parseAppRoute, appRoutePath, type AppRoute } from '../Navigation/appRouting';
import {standaloneEntryForAppId} from '../Standalone/standaloneEntries';
import { NavigationLoadTime, resolveCurrentAppNavigation } from '../Navigation/appNavigationView';
import { isStandalonePagePresentation } from '../../pages/PageRuntime/pageRuntimePresentation';
import { insertFlowElementAtPath } from '../../builders/FlowBuilder/flowInsertElement.mjs';
import {removeFlowGraphElement} from '../../builders/FlowBuilder/flowGraphOperations.mjs';

import { resolveSetupNavigation } from '../../platform/Workspace/platformSetupNavigation';
import { readVerifiedMetadata, saveVerifiedMetadata } from '../../metadata/Cache/verifiedMetadataCache';


import * as React from 'react';
import { renderSetupShell } from './setupShellPresentation';
import { useSetupAnalyticsActions } from '../../builders/ReportBuilder/useSetupAnalyticsActions';
import { createSetupObjectActions } from '../../builders/ObjectManager/setupObjectActions';
import { createSetupFlowActions } from '../../builders/FlowBuilder/setupFlowActions';
import { useSetupMetadata } from './useSetupMetadata';
const SetupObjectDialogs = React.lazy(() => import('../../builders/ObjectManager/setupObjectDialogs'));
const FieldWizardModal = React.lazy(() => import('../../builders/ObjectManager/setupFieldWizard'));

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Database, Monitor, History, Search, X } from 'lucide-react';
const FlowBuilderWorkspace = React.lazy(() => import('../../builders/FlowBuilder/FlowBuilder'));
const SetupFlowDialogs = React.lazy(() => import('../../builders/FlowBuilder/setupFlowDialogs'));
const FlowLogs = React.lazy(() => import('../../automation/FlowLogs/FlowLogs'));
const FlowInterviews = React.lazy(() => import('../../automation/FlowInterviews/FlowInterviews'));
const ScheduledFlows = React.lazy(() => import('../../automation/ScheduledFlows/ScheduledFlows'));
const DashboardBuilder = React.lazy(() => import('../../builders/DashboardBuilder/DashboardBuilder'));













const AppExchange = React.lazy(() => import('../../applications/AppExchange/AppExchange'));
const AppManager = React.lazy(() => import('../../applications/AppManager/AppManager'));
import PlatformWorkspaceSurface from '../../platform/Workspace/PlatformWorkspaceSurface'; import { PlatformPageSlot } from '../../platform/Workspace/PlatformPageSlot';
import {GlobalRecordSearch} from '../../../one/OneGlobalRecordSearch/GlobalRecordSearch';
import {RecordObjectPicker} from '../../../one/OneRecordObjectPicker/RecordObjectPicker';
import {useDismissOnOutside} from '../../accessibility/Dismiss/useDismissOnOutside';

const NamedCredentials = React.lazy(() => import('../../integrations/NamedCredentials/NamedCredentials'));
const TenantManagement = React.lazy(() => import('../../platform/TenantManagement/TenantManagement'));
const TenantDomains = React.lazy(() => import('../../platform/TenantDomains/TenantDomains'));
const TenantRecoveryPanel = React.lazy(() => import('../../platform/TenantRecoveryPanel/TenantRecoveryPanel'));
const TenantUsagePanel = React.lazy(() => import('../../platform/TenantUsagePanel/TenantUsagePanel'));
const DeveloperAccountSettings = React.lazy(() => import('../../settings/DeveloperAccountSettings/DeveloperAccountSettings'));


const EmbeddedDashboard = React.lazy(() => import('../../pages/EmbeddedDashboard/EmbeddedDashboard'));



import { defaultFlow, defaultLightningPage, defaultAccessControl, objectMetadata, workspaces, type ObjectMetadata, type RelatedLookupFilterMetadata, type ObjectSettingsMetadata, type FlowDefinitionMetadata, type FlowExecutionLogMetadata, type FlowInterviewMetadata, type FlowElementMetadata, type FlowValidationMetadata, type PlatformEventMetadata, type NamedCredentialMetadata, type EmailAlertMetadata, type CustomNotificationMetadata, type ApprovalRequestMetadata, type ApprovalProcessMetadata, type ConnectorProviderMetadata, type IntegrationConnectionMetadata, type LightningPageMetadata, type LibraryComponentMetadata, type DashboardMetadata, type DashboardFolderMetadata, type DashboardTerritoryMetadata, type ReportMetadata, type ReportFolderMetadata, type AccessControlMetadata, type LightningAppMetadata, type WorkspaceId } from '../../metadata/Definitions/metadata';
type NewFieldLookupFilterDraft = {
  id: string;
  relatedFieldApiName: string;
  operator: RelatedLookupFilterMetadata['operator'];
  valueMode: 'Value' | 'Field';
  value: string;
  valueFieldApiName: string;
  required: boolean;
};
type LandingBootstrap = {
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  apps: LightningAppMetadata[];
  user: {
    profileId: string;
    permissions: string[];
    fieldAccess: Record<string, { read: boolean; edit: boolean }>;
    recordTypeAccess: Record<string, boolean>;
  };
};
type EntryTiming = { kind: 'login' | 'restore'; startedAt: number; authenticatedAt: number; landing?: LandingBootstrap };
export function createSetupApp(deps: {
apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
ApiRequestError: new (...args: any[]) => Error & {status:number;responseBody:unknown};
fetchFlowListPage: (page:number, search:string) => Promise<any>;
isAuthErrorMessage: (message: string) => boolean;
loadAppCommunicationHistory: (objectName: string, field: string, source: string, offset: number, search: string) => Promise<any>;
loadConnectorMarketplaceApps: () => Promise<any>;
executeConnectorAppLifecycleFlow: (apiName: string, appKey: string) => Promise<void>;
loadFlowScreenRecords: (objectApiName: string) => Promise<Record<string, unknown>[]>;
customTabStyles: ReadonlyArray<{name:'Blue' | 'Green' | 'Orange' | 'Purple' | 'Red' | 'Teal' | 'Yellow';color:string;icon:React.ComponentType<any>}>;
uneSolutionsLogoUrl: string;
ProfilePasswordMenu: React.ComponentType<any>,
ConnectionHealthIndicator: React.ComponentType<any>,
LightningAppRuntime: React.ComponentType<any>,
RecordWorkspace: React.ComponentType<any>,
ObjectManager: React.ComponentType<any>,
PageBuilder: React.ComponentType<any>,
ReportBuilder: React.ComponentType<any>,
Permissions: React.ComponentType<any>,
SetupHome: React.ComponentType<any>,
AutomationSettingsWorkspace: React.ComponentType<any>,
CompanySettings: React.ComponentType<any>,
TenantMfaSettings: React.ComponentType<any>,
TenantSecurityAudit: React.ComponentType<any>,
TenantUserLockSettings: React.ComponentType<any>,
AccountSessionSecurity: React.ComponentType<any>,
TenantEmailRecoverySettings: React.ComponentType<any>
}) {
const {isAuthErrorMessage, loadAppCommunicationHistory, loadConnectorMarketplaceApps, executeConnectorAppLifecycleFlow, loadFlowScreenRecords, apiRequest, ApiRequestError, fetchFlowListPage, customTabStyles, uneSolutionsLogoUrl, ProfilePasswordMenu, ConnectionHealthIndicator, LightningAppRuntime, RecordWorkspace, ObjectManager, PageBuilder, ReportBuilder, Permissions, SetupHome, AutomationSettingsWorkspace, CompanySettings, TenantMfaSettings, TenantSecurityAudit, TenantUserLockSettings, AccountSessionSecurity, TenantEmailRecoverySettings} = deps;
function SetupApp({ onLogout, entryTiming }: { onLogout: () => void; entryTiming: EntryTiming | null }) {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.pathname, window.location.search));
  const [routeAliasError, setRouteAliasError] = useState('');
  const [routeTiming, setRouteTiming] = useState(() => ({
    routeKey: window.location.pathname + window.location.search,
    startedAt: entryTiming?.startedAt ?? performance.now(),
    kind: entryTiming?.kind ?? 'navigation' as const,
    authMs: entryTiming ? entryTiming.authenticatedAt - entryTiming.startedAt : null
  }));
  const [currentAppId, setCurrentAppId] = useState(() => new URLSearchParams(window.location.search).get('appId') || 'Records');
  const [apps, setApps] = useState<LightningAppMetadata[]>([]);
  const [runtimeFormFactor, setRuntimeFormFactor] = useState<'Desktop' | 'Phone'>(() =>
    window.matchMedia('(max-width: 600px)').matches ? 'Phone' : 'Desktop');
  const [workspace, setWorkspace] = useState<WorkspaceId>(() => route.kind === 'setup' ? route.workspace : 'home');
  const [quickFind, setQuickFind] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [setupSidebarCollapsed, setSetupSidebarCollapsed] = useState(false);
  const [objectSearch, setObjectSearch] = useState('');
  const [objects, setObjects] = useState<ObjectMetadata[]>([]);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [advancedMetadataLoaded, setAdvancedMetadataLoaded] = useState(false);
  const [metadataLoadError, setMetadataLoadError] = useState('');
  const [object, setObject] = useState<ObjectMetadata>(() =>
    (route.kind === 'setup' && route.objectApiName ? objectMetadata.find((item) => item.apiName === route.objectApiName) : undefined)
      ?? objectMetadata.find((item) => item.apiName === 'Account')
      ?? objectMetadata[0]
  );
  const [objectSetting, setObjectSetting] = useState(() => route.kind === 'setup' ? route.setting ?? 'Fields & Relationships' : 'Fields & Relationships');
  const [flow, setFlow] = useState<FlowDefinitionMetadata>(defaultFlow);
  const [flows, setFlows] = useState<FlowDefinitionMetadata[]>([]);
  const [platformEvents, setPlatformEvents] = useState<PlatformEventMetadata[]>([]);
  const [flowLogs, setFlowLogs] = useState<FlowExecutionLogMetadata[]>([]);
  const [flowLogsLoading, setFlowLogsLoading] = useState(true);
  const [flowLogCursor, setFlowLogCursor] = useState<string | null>(null);
  const [flowLogsLoadingMore, setFlowLogsLoadingMore] = useState(false);
  const [flowInterviews, setFlowInterviews] = useState<FlowInterviewMetadata[]>([]);
  const [flowInterviewsLoading, setFlowInterviewsLoading] = useState(false);
  const [canManageFlows, setCanManageFlows] = useState(false);
  const [canManageApps, setCanManageApps] = useState(false); const [canReadMetadata,setCanReadMetadata]=useState(false); const [canReadSecurity,setCanReadSecurity]=useState(false);
  const [approvalProcesses, setApprovalProcesses] = useState<ApprovalProcessMetadata[]>([]);
  const [canManageApprovalProcesses, setCanManageApprovalProcesses] = useState(false);
  const [canManageUserIdentities, setCanManageUserIdentities] = useState(false);
  const [namedCredentials, setNamedCredentials] = useState<NamedCredentialMetadata[]>([]);
  const [namedCredentialsLoaded,setNamedCredentialsLoaded]=useState(false);
  const [namedCredentialsError,setNamedCredentialsError]=useState('');
  const [namedCredentialsReadinessError,setNamedCredentialsReadinessError]=useState('');
  const [canManageNamedCredentials, setCanManageNamedCredentials] = useState(false);
  const [connectorRightsLoaded,setConnectorRightsLoaded]=useState(false);
  const [connectorRightsError,setConnectorRightsError]=useState('');
  const [connectorRights, setConnectorRights] = useState({
    view: false, edit: false, secrets: false, test: false, install: false, licence: false
  });
  const [canManagePlatformLicences, setCanManagePlatformLicences] = useState(false);
  const [canManagePlatformTenants, setCanManagePlatformTenants] = useState(false);
  const [namedCredentialsEncryptionReady, setNamedCredentialsEncryptionReady] = useState<boolean | null>(null);
  const [emailAlerts, setEmailAlerts] = useState<EmailAlertMetadata[]>([]);
  const [connectorProviders, setConnectorProviders] = useState<ConnectorProviderMetadata[]>([]);
  const [integrationConnections, setIntegrationConnections] = useState<IntegrationConnectionMetadata[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControlMetadata>(defaultAccessControl);
  const [accessControlError, setAccessControlError] = useState('');
  const [accessControlLoaded, setAccessControlLoaded] = useState(false);
  const [flowDefinitionsLoaded,setFlowDefinitionsLoaded]=useState(false);
  const [flowDefinitionsError,setFlowDefinitionsError]=useState('');
  const [reportsLoaded,setReportsLoaded]=useState(false);
  const [reportsError,setReportsError]=useState('');
  const [dashboardsLoaded,setDashboardsLoaded]=useState(false);
  const [dashboardsError,setDashboardsError]=useState('');
  const [flowValidation, setFlowValidation] = useState<FlowValidationMetadata | null>(null);
  const [flowRun, setFlowRun] = useState<{ requestId?:string;interviewId: string; flowApiName: string; screen: FlowElementMetadata; values: Record<string, unknown>; screenResources?: Record<string, unknown>; outcomes: Array<{ name: string; label: string }>; canGoBack: boolean } | null>(null);
  const [flowDebug, setFlowDebug] = useState<{
    flow: FlowDefinitionMetadata;
    mode: 'debug' | 'run';
    inputs: Record<string, string>;
    result?: Record<string, unknown>;
    error: string;
    running: boolean;
  } | null>(null);
  const [flowRunnerSubmitting, setFlowRunnerSubmitting] = useState(false);
  const [flowRunnerError, setFlowRunnerError] = useState('');
  const [standalonePageMode, setStandalonePageMode] = useState(false);
  const flowHistory = useRef<{ undo: FlowDefinitionMetadata[]; redo: FlowDefinitionMetadata[] }>({ undo: [], redo: [] });
  const flowSnapshots = useRef(new Map<string, string>());
  const [page, setPage] = useState<LightningPageMetadata>(defaultLightningPage);
  // UI-only wizard handoff; app membership is persisted through metadata navigation on activation.
  const [pageCreationAppContext, setPageCreationAppContext] = useState<Record<string, string>>({});
  const pageRouteApiName = useRef('');
  const [pages, setPages] = useState<LightningPageMetadata[]>([]);
  const [dashboards, setDashboards] = useState<DashboardMetadata[]>([]);
  const [dashboardFolders, setDashboardFolders] = useState<DashboardFolderMetadata[]>([]);
  const [dashboardTerritories, setDashboardTerritories] = useState<DashboardTerritoryMetadata[]>([]);
  const [canManageDashboardTerritories, setCanManageDashboardTerritories] = useState(false);
  const [reports, setReports] = useState<ReportMetadata[]>([]);
  const [reportFolders, setReportFolders] = useState<ReportFolderMetadata[]>([]);
  const [canManageReportFolders, setCanManageReportFolders] = useState(false);
  const [dashboardUserId, setDashboardUserId] = useState('');
  const [dashboardRunningUserIds, setDashboardRunningUserIds] = useState<string[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState('');
  const [canRunFlows, setCanRunFlows] = useState(false);
  const [currentFieldAccess, setCurrentFieldAccess] = useState<Record<string, { read: boolean; edit: boolean }>>({});
  const [currentRecordTypeAccess, setCurrentRecordTypeAccess] = useState<Record<string, boolean>>({});
  const [canCreateDashboards, setCanCreateDashboards] = useState(false);
  const [canManageDashboards, setCanManageDashboards] = useState(false);
  const [canScheduleDashboards, setCanScheduleDashboards] = useState(false);
  const [libraryComponents, setLibraryComponents] = useState<LibraryComponentMetadata[]>([]);
  const [canManageLibrary, setCanManageLibrary] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState(2);
  const [showNewField, setShowNewField] = useState(false);
  const [newFieldStage, setNewFieldStage] = useState<0 | 1 | 2 | 3>(0);
  const [newFieldLayoutIds, setNewFieldLayoutIds] = useState<string[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('Text');
  const [newFieldTextLength, setNewFieldTextLength] = useState(255);
  const [newFieldAutoNumberFormat, setNewFieldAutoNumberFormat] = useState('REC-{0000}');
  const [newFieldPrecision, setNewFieldPrecision] = useState(18);
  const [newFieldScale, setNewFieldScale] = useState(0);
  const [newFieldDescription, setNewFieldDescription] = useState('');
  const [newFieldHelpText, setNewFieldHelpText] = useState('');
  const [newFieldDefaultValue, setNewFieldDefaultValue] = useState('');
  const [newFieldHasDefault, setNewFieldHasDefault] = useState(false);
  const [newFieldFormula, setNewFieldFormula] = useState('');
  const [newFieldFormulaValidation, setNewFieldFormulaValidation] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid'; message: string }>({ status: 'idle', message: '' });
  const formulaEditorRef = useRef<HTMLTextAreaElement>(null);
  const [newFieldPicklistValues, setNewFieldPicklistValues] = useState('');
  const [newFieldPicklistRestricted, setNewFieldPicklistRestricted] = useState(true);
  const [newFieldControllerApiName, setNewFieldControllerApiName] = useState('');
  const [newFieldValueSettings, setNewFieldValueSettings] = useState<Record<string, string[]>>({});
  const [newFieldReturnType, setNewFieldReturnType] = useState('Number');
  const [newFieldRelationshipTarget, setNewFieldRelationshipTarget] = useState('');
  const [newFieldRelationshipName, setNewFieldRelationshipName] = useState('');
  const [newFieldChildRelationshipName, setNewFieldChildRelationshipName] = useState('');
  const [newFieldRollupChildObject, setNewFieldRollupChildObject] = useState('');
  const [newFieldRollupRelationshipField, setNewFieldRollupRelationshipField] = useState('');
  const [newFieldRollupOperation, setNewFieldRollupOperation] = useState<'COUNT' | 'SUM' | 'MIN' | 'MAX'>('COUNT');
  const [newFieldRollupSourceField, setNewFieldRollupSourceField] = useState('');
  const [newFieldDeleteBehavior, setNewFieldDeleteBehavior] = useState<'Clear' | 'Restrict'>('Clear');
  const [newFieldAllowReparenting, setNewFieldAllowReparenting] = useState(false);
  const [newFieldLookupFilters, setNewFieldLookupFilters] = useState<NewFieldLookupFilterDraft[]>([]);
  const [newFieldLookupFilterLogic, setNewFieldLookupFilterLogic] = useState<'All' | 'Any'>('All');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldUnique, setNewFieldUnique] = useState(false);
  const [newFieldExternalId, setNewFieldExternalId] = useState(false);
  const [newFieldCaseSensitive, setNewFieldCaseSensitive] = useState(false);
  const [showNewObject, setShowNewObject] = useState(false);
  const [newObjectLabel, setNewObjectLabel] = useState('');
  const [newObjectPluralLabel, setNewObjectPluralLabel] = useState('');
  const [newObjectDescription, setNewObjectDescription] = useState('');
  const [newObjectRecordNameLabel, setNewObjectRecordNameLabel] = useState('');
  const [launchCustomTabWizard, setLaunchCustomTabWizard] = useState(false);
  const [customTabObject, setCustomTabObject] = useState<ObjectMetadata | null>(null);
  const [customTabStyle, setCustomTabStyle] = useState<(typeof customTabStyles)[number]['name']>('Blue');
  const [showCustomTabWizard, setShowCustomTabWizard] = useState(false);
  const [newObjectSettings, setNewObjectSettings] = useState<ObjectSettingsMetadata>({
    allowReports: true,
    allowActivities: false,
    trackFieldHistory: false,
    allowInChatter: false,
    deploymentStatus: 'In Development',
    recordNameType: 'Text',
    recordNameFormat: ''
  });
  const [toast, setToast] = useState('');
  const [activeUtility, setActiveUtility] = useState<'History' | null>(null);
  const [recentRoutes, setRecentRoutes] = useState<Array<{ key: string; label: string; route: AppRoute }>>([]);
  const [flowToolTab, setFlowToolTab] = useState<'Elements' | 'Manager'>('Elements');
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const updateFormFactor = () => setRuntimeFormFactor(media.matches ? 'Phone' : 'Desktop');
    updateFormFactor();
    media.addEventListener('change', updateFormFactor);
    return () => media.removeEventListener('change', updateFormFactor);
  }, []);

  useEffect(() => {
    const key = JSON.stringify(route);
    const label = route.kind === 'setup'
      ? workspaces.find((item) => item.id === route.workspace)?.label ?? 'Setup'
      : route.kind === 'app-home' ? `${apps.find((app) => app.apiName === route.appId)?.label ?? route.appId} Home`
        : route.kind === 'app-page' ? pages.find((page) => page.apiName === route.pageApiName)?.label ?? route.pageApiName
          : route.kind === 'route-alias' ? route.slug
          : `${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? route.objectApiName}${route.kind === 'record-detail' ? ' Record' : ''}`;
    setRecentRoutes((current) => current[0]?.key === key
      ? current
      : [{ key, label, route }, ...current.filter((item) => item.key !== key)].slice(0, 8));
  }, [route, objects, apps, pages]);

  // Resolve credential permissions independently of unrelated metadata requests.
  // A failed report/connector/dashboard request must not disable credential management.
  useEffect(() => {
    // Connector administration is optional; never request secrets on unrelated tenant routes.
    if (route.kind !== 'setup' || !['named-credentials', 'app-exchange', 'flow-builder'].includes(workspace)) return;
    let active = true;
    const credentialsRequest = new AbortController();
    setNamedCredentialsLoaded(false);
    setNamedCredentialsError('');
    setNamedCredentialsReadinessError('');
    setConnectorRightsLoaded(false);
    setConnectorRightsError('');
    // Readiness is independent from list access. A transient readiness failure must
    // never silently turn an authorised manager into a read-only user.
    let readinessSequence=0;
    const checkCredentialReadiness = async () => {
      const requestNumber=++readinessSequence;
      try {
        const {canManage,encryptionReady}=await apiRequest<{canManage:boolean;encryptionReady:boolean}>(
          '/named-credentials/readiness',{cache:'no-store',signal:credentialsRequest.signal});
        if(active&&requestNumber===readinessSequence){setCanManageNamedCredentials(canManage===true);setNamedCredentialsEncryptionReady(encryptionReady===true);setNamedCredentialsReadinessError('');}
      }catch(error){
        if(active&&!credentialsRequest.signal.aborted&&requestNumber===readinessSequence){
          setCanManageNamedCredentials(false);
          setNamedCredentialsEncryptionReady(null);
          setNamedCredentialsReadinessError('Could not verify Named Credential permissions: '+(error instanceof Error?error.message:String(error)));
        }
      }
    };
    if(workspace!=='named-credentials')void checkCredentialReadiness();
    void apiRequest<{ view: boolean; edit: boolean; secrets: boolean; test: boolean; install: boolean; licence: boolean }>('/connector-apps/capabilities')
      .then((rights) => { if (active) {setConnectorRights(rights);setConnectorRightsLoaded(true);} })
      .catch((error:unknown) => { if (active) {setConnectorRightsError(error instanceof Error?error.message:String(error));setConnectorRightsLoaded(true);} });
    void apiRequest<{ credentials: NamedCredentialMetadata[];canManage:boolean;encryptionReady:boolean }>('/named-credentials',{
      cache:'no-store',signal:credentialsRequest.signal
    })
      .then(({ credentials,canManage,encryptionReady }) => {
        if(!active)return;
        if(!Array.isArray(credentials)||typeof canManage!=='boolean'||typeof encryptionReady!=='boolean')
          throw new Error('Invalid Named Credentials API snapshot');
        setNamedCredentials(credentials);
        setCanManageNamedCredentials(canManage);
        setNamedCredentialsEncryptionReady(encryptionReady);
        setNamedCredentialsError('');
        setNamedCredentialsReadinessError('');
        setNamedCredentialsLoaded(true);
      })
      .catch((error:unknown) => {
        if(!active || credentialsRequest.signal.aborted)return;
        setNamedCredentialsError(error instanceof Error?error.message:String(error));
        setNamedCredentialsLoaded(true);
      });
    return () => { active = false; credentialsRequest.abort(); };
  }, [route.kind, workspace]);

  useSetupMetadata({ advancedMetadataLoaded, apiRequest, approvalProcesses, apps, currentAppId, dashboards, emailAlerts, entryTiming, flowSnapshots, flows, isAuthErrorMessage, object, objects, page, pages, platformEvents, readVerifiedMetadata, reports, route, saveVerifiedMetadata, setAccessControl, setAccessControlError, setAccessControlLoaded, setAdvancedMetadataLoaded, setApprovalProcesses, setApps, setCanCreateDashboards, setCanManageApprovalProcesses, setCanManageApps, setCanReadMetadata, setCanReadSecurity, setCanManageDashboardTerritories, setCanManageDashboards, setCanManageFlows, setCanManageLibrary, setCanManagePlatformLicences, setCanManagePlatformTenants, setCanManageReportFolders, setCanManageUserIdentities, setCanRunFlows, setCanScheduleDashboards, setConnectorProviders, setCurrentAppId, setCurrentFieldAccess, setCurrentProfileId, setCurrentRecordTypeAccess, setDashboardFolders, setDashboardRunningUserIds, setDashboardTerritories, setDashboardUserId, setDashboards, setEmailAlerts, setFlow, setFlows, setFlowDefinitionsLoaded, setFlowDefinitionsError, setReportsLoaded, setReportsError, setDashboardsLoaded, setDashboardsError, setIntegrationConnections, setLibraryComponents, setMetadataLoadError, setMetadataLoaded, setNamedCredentials, setObject, setObjects, setPage, setPages, setPlatformEvents, setReportFolders, setReports, setSelectedFlowId, setToast, toast, workspace });

  useEffect(() => {
    if (workspace !== 'flow-logs') return;
    let active = true;
    setFlowLogsLoading(true);
    setFlowLogs([]);
    setFlowLogCursor(null);
    void apiRequest<{ runs: FlowExecutionLogMetadata[]; nextCursor: string | null }>('/metadata/flow-history')
      .then((payload) => {
        if (active) { setFlowLogs(payload.runs); setFlowLogCursor(payload.nextCursor); }
      })
      .catch((error) => {
        if (active) setToast('Unable to load Flow history: ' + String(error));
      })
      .finally(() => {
        if (active) setFlowLogsLoading(false);
      });
    return () => { active = false; };
  }, [workspace]);

  const loadMoreFlowHistory = async () => {
    if (!flowLogCursor || flowLogsLoadingMore) return;
    setFlowLogsLoadingMore(true);
    try {
      const payload=await apiRequest<{runs:FlowExecutionLogMetadata[];nextCursor:string|null}>(
        '/metadata/flow-history?cursor='+encodeURIComponent(flowLogCursor));
      setFlowLogs(current=>[...current,...payload.runs.filter(run=>!current.some(row=>row.id===run.id))]);
      setFlowLogCursor(payload.nextCursor);
    } catch (error) {
      setToast('Unable to load more Flow history: '+String(error));
    } finally { setFlowLogsLoadingMore(false); }
  };

  useEffect(() => {
    if (workspace !== 'flow-interviews') return;
    let active = true;
    setFlowInterviewsLoading(true);
    void apiRequest<{ interviews: FlowInterviewMetadata[] }>('/metadata/flow-interviews')
      .then((payload) => {
        if (active) setFlowInterviews(payload.interviews);
      })
      .catch((error) => {
        if (active) setToast(`Unable to load Flow interviews: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (active) setFlowInterviewsLoading(false);
      });
    return () => { active = false; };
  }, [workspace]);

  const refreshFlowInterviews = async () => {
    setFlowInterviewsLoading(true);
    try {
      const payload = await apiRequest<{ interviews: FlowInterviewMetadata[] }>('/metadata/flow-interviews');
      setFlowInterviews(payload.interviews);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to load Flow interviews');
    } finally {
      setFlowInterviewsLoading(false);
    }
  };

  const cancelFlowInterview = async (interview: FlowInterviewMetadata) => {
    if (!window.confirm(`Cancel the ${interview.kind} interview for "${interview.flowLabel}"? It cannot be resumed afterward.`)) return;
    try {
      await apiRequest<void>(`/metadata/flow-interviews/${encodeURIComponent(interview.id)}`, { method: 'DELETE' });
      setFlowInterviews((current) => current.filter((item) => item.id !== interview.id));
      notify(`Interview for "${interview.flowLabel}" canceled`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to cancel Flow interview');
    }
  };

  const flowHasUnsavedChanges = () => {
    // The Flow landing page is a catalogue, not an edited draft. Guard only an open Flow.
    if (route.kind !== 'setup' || route.workspace !== 'flow-builder' || !route.resourceApiName) return false;
    const savedSnapshot = flowSnapshots.current.get(flow.apiName);
    return savedSnapshot === undefined || savedSnapshot !== JSON.stringify(flow);
  };
  const confirmDiscardFlowChanges = () => !flowHasUnsavedChanges()
    || window.confirm('This flow has unsaved changes. Leave without saving them?');
  const confirmFlowNavigation = (nextRoute: AppRoute) => {
    const remainsOnCurrentFlow = nextRoute.kind === 'setup'
      && nextRoute.workspace === 'flow-builder'
      && nextRoute.resourceApiName === flow.apiName;
    return remainsOnCurrentFlow || confirmDiscardFlowChanges();
  };

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = parseAppRoute(window.location.pathname, window.location.search);
      if (!confirmFlowNavigation(nextRoute)) {
        window.history.pushState({}, '', appRoutePath(route));
        return;
      }
      setRouteTiming({ routeKey: window.location.pathname + window.location.search, startedAt: performance.now(), kind: 'navigation', authMs: null });
      setRoute(nextRoute);
      setCurrentAppId(new URLSearchParams(window.location.search).get('appId') || 'Records');
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [route, flow, flows]);

  useEffect(() => {
    if (!flowHasUnsavedChanges()) return;
    const protectUnsavedFlow = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsavedFlow);
    return () => window.removeEventListener('beforeunload', protectUnsavedFlow);
  }, [flow, route]);

  useEffect(() => {
    if (route.kind !== 'setup') return;
    setWorkspace(route.workspace);
    if (route.workspace === 'object-manager') {
      const selectedObject = route.objectApiName ? objects.find((item) => item.apiName === route.objectApiName) : undefined;
      if (selectedObject && selectedObject.apiName !== object.apiName) setObject(selectedObject);
      setObjectSetting(route.setting ?? 'Fields & Relationships');
    }
    if (route.workspace === 'flow-builder' && route.resourceApiName && flow.apiName !== route.resourceApiName) {
      const selectedFlow = flows.find((item) => item.apiName === route.resourceApiName);
      if (selectedFlow) {
        setFlow(selectedFlow);
        setSelectedFlowId(selectedFlow.elements[0]?.id ?? 1);
        flowHistory.current = { undo: [], redo: [] };
      }
    }
    if (route.workspace === 'page-builder' && route.resourceApiName) {
      const selectedPage = pages.find((item) => item.apiName === route.resourceApiName);
      if (selectedPage && (pageRouteApiName.current !== route.resourceApiName || page.apiName !== selectedPage.apiName)) {
        pageRouteApiName.current = route.resourceApiName;
        setPage(selectedPage);
      }
    }
  }, [route, objects, object.apiName, flows, flow.apiName, pages, page.apiName]);

  useEffect(() => {
    const canonicalPath = appRoutePath(route);
    if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
      window.history.replaceState({}, '', canonicalPath);
    }
  }, []);

  const navigateRoute = (nextRoute: AppRoute, skipFlowConfirmation = false) => {
    if (!skipFlowConfirmation && !confirmFlowNavigation(nextRoute)) return false;
    const routeWithApp = nextRoute.kind === 'setup' ? nextRoute : { ...nextRoute, appId: nextRoute.appId ?? currentAppId };
    // Standalone frontends must replace the workspace document; pushState alone
    // leaves SetupApp mounted and renders the wrong (admin) application shell.
    if (routeWithApp.kind === 'app-home' || routeWithApp.kind === 'app-page' || routeWithApp.kind === 'route-alias') {
      const standalone=standaloneEntryForAppId(routeWithApp.appId);
      if (standalone) {
        const path=routeWithApp.kind==='route-alias' ? `/${standalone.slug}` : appRoutePath(routeWithApp);
        // Canonical directory URL loads the standalone HTML document directly.
        const target=new URL(path,window.location.origin);
        if(target.pathname.endsWith('/'+standalone.slug))target.pathname+='/';
        window.location.assign(target.pathname+target.search);
        return true;
      }
    }
    const path = appRoutePath(routeWithApp);
    if (`${window.location.pathname}${window.location.search}` !== path) {
      setRouteTiming({ routeKey: path, startedAt: performance.now(), kind: 'navigation', authMs: null });
      window.history.pushState({}, '', path);
    }
    setRoute(routeWithApp);
    if (routeWithApp.kind !== 'setup') setCurrentAppId(routeWithApp.appId ?? 'Records');
    return true;
  };

  // Resolve friendly metadata aliases via an authenticated tenant-scoped API.
  // The server checks the destination again, so an old alias never grants access.
  useEffect(() => {
    if (route.kind !== 'route-alias') { setRouteAliasError(''); return; }
    const pending = route;
    let cancelled = false;
    setRouteAliasError('');
    void apiRequest<{ path: string }>('/routes/resolve/' + encodeURIComponent(pending.appId) +
      '/' + encodeURIComponent(pending.slug)).then(({ path }) => {
      if (cancelled || typeof path !== 'string' || !path.startsWith('/une/')) return;
      const targetUrl = new URL(path, window.location.origin);
      if (targetUrl.origin !== window.location.origin || !targetUrl.pathname.startsWith('/une/'))
        throw Error('Invalid route alias destination');
      const destination = parseAppRoute(targetUrl.pathname, targetUrl.search);
      if (destination.kind === 'setup' || destination.kind === 'route-alias'
          || (destination.appId && destination.appId !== pending.appId))
        throw Error('Route alias target is unavailable');
      window.history.replaceState({}, '', appRoutePath(destination));
      setRoute(destination);
    }).catch(error => {
      if (!cancelled) setRouteAliasError(error instanceof Error ? error.message : 'Unable to resolve route alias');
    });
    return () => { cancelled = true; };
  }, [route]);
 
  const openSetupWorkspace = (nextWorkspace: WorkspaceId) => {
    const nextRoute: AppRoute = nextWorkspace === 'object-manager'
      ? { kind: 'setup', workspace: nextWorkspace, objectApiName: object.apiName, setting: objectSetting }
      : nextWorkspace === 'flow-builder'
        ? { kind: 'setup', workspace: nextWorkspace }
        : nextWorkspace === 'page-builder'
          ? { kind: 'setup', workspace: nextWorkspace }
          : nextWorkspace === 'report-builder'
            ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: 'Opportunities_by_Stage' }
            : nextWorkspace === 'dashboard-builder'
              ? { kind: 'setup', workspace: nextWorkspace, ...(dashboards[0] ? { resourceApiName: dashboards[0].apiName } : {}) }
                : nextWorkspace === 'rbac'
                ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: 'PermissionSets' }
                : { kind: 'setup', workspace: nextWorkspace };
    navigateRoute(nextRoute);
  };
  const changePage = (nextPage: LightningPageMetadata) => {
    setPage(nextPage);
  };

  const filteredObjects = useMemo(() => {
    const query = objectSearch.trim().toLowerCase();
    if (!query) return objects;
    return objects.filter((item) =>
      `${item.label} ${item.pluralLabel} ${item.apiName}`.toLowerCase().includes(query)
    );
  }, [objectSearch, objects]);
  const activationAppIds = [...new Set([
    ...apps.map((app) => app.apiName)
  ])].sort((left, right) => left.localeCompare(right));
  const currentApp = apps.find((app) => app.apiName === currentAppId) ?? apps[0];
  const currentAppNavigation = resolveCurrentAppNavigation(currentApp);
  const protectedPageRuntime={apiRequest,objects,apps,pages,reports,currentAppId,
   availableFlows:flows.map(({id,apiName,label,flowType,status})=>({id,apiName,label,flowType,status})),
   formFactor:runtimeFormFactor,onNavigate:navigateRoute,
   onLaunchFlow:(apiName:string,inputs?:Record<string,unknown>,context?:{requestId?:string})=>{void runFlow(apiName,inputs,context);}};
  // Build the complete navigable object catalogue from tenant metadata, not app tabs.
  // The field map reflects effective RBAC; record APIs check object permissions again.
  const readableRecordObjects = useMemo(() => objects.filter((item) =>
    item.fields.some((field) => currentFieldAccess[`${item.apiName}.${field.apiName}`]?.read)
  ), [objects, currentFieldAccess]);
  useEffect(() => { setRecordSearch(''); }, [route.kind, route.kind === 'record-list' || route.kind === 'record-detail' ? route.objectApiName : '']);
  const appUtilityRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(appUtilityRef, Boolean(activeUtility), () => setActiveUtility(null));
  const filteredSetupGroups = useMemo(() => {
    return resolveSetupNavigation(quickFind,canManagePlatformTenants,
      connectorProviders.map(provider=>provider.name+' '+provider.connectorKey));
  }, [quickFind, connectorProviders, canManagePlatformTenants]);
  const filteredConnectorProviders = useMemo(() => {
    const query = quickFind.trim().toLowerCase();
    return query
      ? connectorProviders.filter((provider) => `${provider.name} ${provider.connectorKey}`.toLowerCase().includes(query))
      : connectorProviders;
  }, [quickFind, connectorProviders]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };
  const saveAccessControl = async (nextAccessControl: AccessControlMetadata) => {
    const saved=await apiRequest<AccessControlMetadata>('/metadata/permissions',{
      method:'PUT',body:JSON.stringify(nextAccessControl)
    });
    setAccessControl(saved);
    setAccessControlError('');
    notify('Permissions and assignments saved');
  };
  const saveConnectorProvider = async (provider: ConnectorProviderMetadata) => {
    const result = await apiRequest<{ provider: ConnectorProviderMetadata }>(
      `/connector-providers/${encodeURIComponent(provider.connectorKey)}`,
      { method: 'PUT', body: JSON.stringify(provider) }
    );
    setConnectorProviders((current) => current.map((item) =>
      item.connectorKey === result.provider.connectorKey ? result.provider : item
    ));
    return result.provider;
  };
  const saveIntegrationConnection = async (
    connection: Omit<Pick<IntegrationConnectionMetadata, 'id' | 'connectorKey' | 'name' | 'configuration' | 'status'>, 'id'> & { id?: string; credentials: Record<string, string> }
  ) => {
    const path = connection.id
      ? `/integration-connections/${encodeURIComponent(connection.id)}`
      : '/integration-connections';
    const result = await apiRequest<{ connection: IntegrationConnectionMetadata }>(path, {
      method: connection.id ? 'PUT' : 'POST',
      body: JSON.stringify(connection)
    });
    setIntegrationConnections((current) => connection.id
      ? current.map((item) => item.id === result.connection.id ? result.connection : item)
      : [...current, result.connection]);
    return result.connection;
  };
  const commitFlow = (nextFlow: FlowDefinitionMetadata) => {
    if (JSON.stringify(flow) === JSON.stringify(nextFlow)) return;
    const editedFlow = flow.status === 'Active' && nextFlow.status === 'Active'
      ? { ...nextFlow, status: 'Draft' as const }
      : nextFlow;
    flowHistory.current.undo.push(flow);
    if (flowHistory.current.undo.length > 50) flowHistory.current.undo.shift();
    flowHistory.current.redo = [];
    setFlow(editedFlow);
    setFlows((current) => current.map((item) => item.apiName === editedFlow.apiName ? editedFlow : item));
    setFlowValidation(null);
  };
  const undoFlow = () => {
    const previous = flowHistory.current.undo.pop();
    if (!previous) return;
    flowHistory.current.redo.push(flow);
    setFlow(previous);
    setFlows((current) => current.map((item) => item.apiName === previous.apiName ? previous : item));
    setSelectedFlowId(previous.elements[0]?.id ?? 1);
    setFlowValidation(null);
  };
  const redoFlow = () => {
    const next = flowHistory.current.redo.pop();
    if (!next) return;
    flowHistory.current.undo.push(flow);
    setFlow(next);
    setFlows((current) => current.map((item) => item.apiName === next.apiName ? next : item));
    setSelectedFlowId(next.elements[0]?.id ?? 1);
    setFlowValidation(null);
  };
  const logout = async () => {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to sign out cleanly');
    } finally {
      onLogout();
    }
  };

  const navigateSetupItem = (item: string) => {
    const provider = connectorProviders.find((definition) => definition.name === item || definition.connectorKey === item);
    if (provider) {
      openSetupWorkspace('named-credentials');
      return;
    }
    if (item === 'Une Connectors') {
      // Existing navigation aliases use the credential store actually consumed by flows.
      openSetupWorkspace('named-credentials');
      return;
    }
    if (item === 'Company Settings' || item === 'Company Information' || item === 'Currencies') {
      openSetupWorkspace('company-settings');
      return;
    }
    if (item === 'Named Devices') {
      if (!readableRecordObjects.some((object) => object.apiName === 'NamedDevice__c')) {
        notify('Named Devices requires Read access in your Profile or Permission Set.');
        return;
      }
      navigateRoute({ kind: 'record-list', objectApiName: 'NamedDevice__c' });
      return;
    }
    if (item === 'Tenant Management') {
      openSetupWorkspace('tenant-management'); return;
    }
    if (item === 'Named Credentials' || item === 'Webhook Endpoints') {
      openSetupWorkspace('named-credentials');
      return;
    }
    if (item === 'Object Manager' || item === 'Objects' || objectSettings.includes(item)) {
      navigateRoute({
        kind: 'setup',
        workspace: 'object-manager',
        objectApiName: object.apiName,
        setting: item === 'Object Manager' || item === 'Objects' ? 'Details' : item
      });
      return;
    }
    if (item === 'Page Builder' || item === 'Lightning App Builder') openSetupWorkspace('page-builder');
    else if (item === 'Connector Settings') openSetupWorkspace('named-credentials');
    else if (item === 'Setup Home') openSetupWorkspace('home');
    else if (item === 'App Manager') openSetupWorkspace('app-manager');
    else if (item === 'AppExchange') openSetupWorkspace('app-exchange');
    else if (item === 'Flows') openSetupWorkspace('flow-builder');
    else if (item === 'Paused and Waiting Interviews') openSetupWorkspace('flow-interviews');
    else if (item === 'Scheduled Flows') openSetupWorkspace('scheduled-flows');
    else if (item === 'Flow History') openSetupWorkspace('flow-logs');
    else if (item === 'Process Automation Settings') openSetupWorkspace('automation-settings');
    else if (item === 'Reports') openSetupWorkspace('report-builder');
    else if (item === 'Dashboards') openSetupWorkspace('dashboard-builder');
    else if (['Users', 'Roles', 'Public Groups', 'Queues', 'Permission Sets', 'Permission Set Groups', 'Profiles', 'Sharing Settings', 'Sharing Rules'].includes(item)) {
      const resourceApiName = item === 'Users' ? 'Users' : item === 'Permission Set Groups' ? 'PermissionSetGroups' : item.replace(/[^A-Za-z0-9]/g, '');
      navigateRoute({ kind: 'setup', workspace: 'rbac', resourceApiName });
    } else notify(`Unknown Setup destination: ${item}. Navigation was not changed.`);
  };

  const addFlowElement = (type: string, afterId = selectedFlowId, connectorId?: string) => {
    if (type === 'Start') {
      notify('A flow can only have one Start element');
      return;
    }
    if (type === 'Screen' && flow.flowType !== 'Screen Flow') {
      notify('Screen elements are only available in Screen Flows');
      return;
    }
    if (type === 'Roll Back Records' && !['Screen Flow', 'Autolaunched Flow'].includes(flow.flowType)) {
      notify('Roll Back Records is only available in Screen and Autolaunched Flows');
      return;
    }
    const nextId = Math.max(...flow.elements.map((item) => item.id), 0) + 1;
    const label = type === 'Decision' ? 'New Decision' : `New ${type}`;
    const object = flow.triggerObject ?? 'Account';
    const defaults: Record<string, Record<string, unknown>> = {
      'Decision': { object, outcomes: [{ name: 'Outcome_1', label: 'Outcome 1', conditions: [] }, { name: 'Default', label: 'Default Outcome', conditions: [] }] },
      'Assignment': { variable: '', operator: 'Assign', value: '' },
      'Loop': { collection: '', direction: 'First to last', loopVariable: '' },
      'Wait': { waitType: 'Duration', amount: 1, unit: 'Hours' },
      'Get Records': { object, conditions: [], fields: 'all', sortField: '', sortOrder: 'Ascending', recordLimit: 1 },
      'Create Records': { object, fieldValues: [] },
      'Update Records': { object, conditions: [], fieldValues: [] },
      'Delete Records': { object, conditions: [] },
      'Roll Back Records': {},
      'Custom Error': { errorMessage: '', errorLocation: 'Page', fieldName: '' },
      'Screen': { fields: [] },
      'Action': { actionType: '', inputValues: [] },
      'Orchestration Stage': { objectApiName: flow.triggerObject ?? '', recordId: '',
        approvalProcessApiName: '', approverIds: '', approvalMode: 'ANY', statusVariable: '',
        comments: '' },
      'HTTP Callout': { method: 'GET', namedCredentialId: '', path: '', headers: '', body: '', responseVariable: '', statusVariable: '' },
      'Subflow': { flowApiName: '', inputValues: '', outputValues: '' },
      'Publish Platform Event': { eventApiName: '', fieldValues: [] }
    };
    const next = { id: nextId, type, label, config: defaults[type] ?? {} };
    try {
      // Flow connectors, not element-array order, define execution paths.
      const inserted = insertFlowElementAtPath(flow, afterId, next, connectorId,
        `connector-${crypto.randomUUID()}`);
      commitFlow(inserted);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to insert Flow element');
      return;
    }
    setSelectedFlowId(next.id);
  };

  const updateFlowLabel = (id: number, label: string) => {
    commitFlow({ ...flow, elements: flow.elements.map((item) => item.id === id ? { ...item, label } : item) });
  };

  const updateFlowConfig = (id: number, key: string, value: unknown) => {
    commitFlow({
      ...flow,
      triggerObject: flow.elements.find((item) => item.id === id)?.type === 'Start' && key === 'object'
        ? String(value) || null
        : flow.triggerObject,
      startConfig: flow.elements.find((item) => item.id === id)?.type === 'Start'
        ? { ...flow.startConfig, [key]: value }
        : flow.startConfig,
      elements: flow.elements.map((item) => item.id === id ? { ...item, config: { ...item.config, [key]: value } } : item)
    });
  };

  const removeFlowElement = (id: number) => {
    try {
      const edited=removeFlowGraphElement(flow,id);
      commitFlow(edited);
      const next=edited.connectors.find(edge=>edge.from===selectedFlowId)
        ??flow.connectors.find(edge=>edge.to===id);
      setSelectedFlowId(next?.from??edited.elements[0]?.id??1);
    }catch(error){
      notify(error instanceof Error?error.message:'Unable to remove Flow element');
    }
  };

  const { validateNewFieldFormula, insertFormulaText, resetNewFieldDraft, newFieldApiName, newFieldPicklistOptions, newFieldController, newFieldControllerValues, newFieldDefaultError, newFieldConfigurationError, addField, saveObject, refreshObject, deleteObject, saveField, deleteField, createObject, saveCustomTab } = createSetupObjectActions({ apiRequest, customTabObject, customTabStyle, formulaEditorRef, launchCustomTabWizard, navigateRoute, newFieldAllowReparenting, newFieldAutoNumberFormat, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldControllerApiName, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldRollupChildObject, newFieldRollupOperation, newFieldRollupRelationshipField, newFieldRollupSourceField, newFieldScale, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, newObjectDescription, newObjectLabel, newObjectPluralLabel, newObjectRecordNameLabel, newObjectSettings, notify, object, objects, route, setCustomTabObject, setCustomTabStyle, setLaunchCustomTabWizard, setNewFieldAllowReparenting, setNewFieldAutoNumberFormat, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldRollupChildObject, setNewFieldRollupOperation, setNewFieldRollupRelationshipField, setNewFieldRollupSourceField, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setNewObjectDescription, setNewObjectLabel, setNewObjectPluralLabel, setNewObjectRecordNameLabel, setNewObjectSettings, setObject, setObjectSetting, setObjects, setShowCustomTabWizard, setShowNewField, setShowNewObject, workspace });

  const { saveFlow, saveNamedCredential, toggleNamedCredentialEnabled, deleteNamedCredential, saveEmailAlert, deleteEmailAlert, savePlatformEvent, deletePlatformEvent, saveApprovalProcess, deleteApprovalProcess, validateFlow, openFlowDebug, parseFlowInputs, runFlowDebug, runSavedFlowTests, runFlow, submitFlowScreen, goBackFlowScreen, createFlow, cloneFlow, deactivateFlow, deleteFlow, selectFlow, restoreFlowVersion, exportFlow, importFlow } = createSetupFlowActions({ apiRequest, apps, confirmDiscardFlowChanges, confirmFlowNavigation, flow, flowDebug, flowHistory, flowRun, flowSnapshots, flows, navigateRoute, notify, object, objects, platformEvents, setApprovalProcesses, setEmailAlerts, setFlow, setFlowDebug, setFlowRun, setFlowRunnerError, setFlowRunnerSubmitting, setFlowValidation, setFlows, setNamedCredentials, setPlatformEvents, setSelectedFlowId, workspace });

  const savePage = async (nextPage: LightningPageMetadata) => {
    try {
      const payload = await apiRequest<{ page: LightningPageMetadata }>(`/metadata/pages/${encodeURIComponent(nextPage.apiName)}`, {
        method: 'PUT', body: JSON.stringify(nextPage)
      });
      setPage(payload.page);
      setPages((current) => [...current.filter((item) => item.apiName !== payload.page.apiName), payload.page]);
      notify(payload.page.status === 'Active' ? 'Lightning page activated' : 'Lightning page saved');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save Lightning page');
    }
  };
  const savePageFromBuilder = async (
    nextPage: LightningPageMetadata,
    previousApiName: string,
    successMessage?: string
  ): Promise<boolean> => {
    try {
      const payload = await apiRequest<{ page: LightningPageMetadata }>(`/metadata/pages/${encodeURIComponent(previousApiName)}`, {
        method: 'PUT', body: JSON.stringify(nextPage)
      });
      setPage(payload.page);
      setPages((current) => [...current.filter((item) => item.apiName !== previousApiName && item.apiName !== payload.page.apiName), payload.page]);
      if (previousApiName !== payload.page.apiName) {
        setApps((current) => current.map((app) => ({
          ...app,
          navigationPageApiNames: app.navigationPageApiNames.map((apiName) => apiName === previousApiName ? payload.page.apiName : apiName),
          navigationOrder: app.navigationOrder.map((item) =>
            item.type === 'App Page' && item.apiName === previousApiName
              ? { ...item, apiName: payload.page.apiName }
              : item)
        })));
      }
      if (route.kind === 'setup' && route.workspace === 'page-builder' && route.resourceApiName !== payload.page.apiName) {
        navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: payload.page.apiName });
      }
      notify(successMessage ?? (payload.page.status === 'Active' ? 'Lightning page activated' : 'Lightning page saved'));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save Lightning page');
      return false;
    }
  };
  const saveApp = async (nextApp: LightningAppMetadata, updating: boolean) => {
    const path = updating ? `/metadata/apps/${encodeURIComponent(nextApp.apiName)}` : '/metadata/apps';
    const payload = await apiRequest<{ app: LightningAppMetadata }>(path, {
      method: updating ? 'PUT' : 'POST',
      body: JSON.stringify(nextApp)
    });
    setApps((current) => current.some((item) => item.apiName === payload.app.apiName)
      ? current.map((item) => item.apiName === payload.app.apiName ? payload.app : item)
      : [...current, payload.app]);
    if (!updating) setCurrentAppId(payload.app.apiName);
  };
  const deletePage = async (apiName: string) => {
    await apiRequest<void>(`/metadata/pages/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setPages(current => current.filter(item => item.apiName !== apiName));
    notify('Page archived; its SQL metadata and record data are preserved');
  };
  const deleteApp = async (apiName: string) => {
    await apiRequest<void>(`/metadata/apps/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    const remaining = apps.filter((app) => app.apiName !== apiName);
    setApps(remaining);
    const nextApp = remaining[0];
    if (currentAppId === apiName) {
      setCurrentAppId(nextApp?.apiName ?? '');
      if (route.kind !== 'setup') {
        navigateRoute(nextApp
          ? { ...route, appId: nextApp.apiName }
          : { kind: 'setup', workspace: 'home' });
      }
    }
  };
  const { loadDashboardRecords, saveReport, saveReportFolder, deleteReport, runReport, previewReport, saveDashboard, saveDashboardFolder, deleteDashboardFolder, saveDashboardTerritories, deleteDashboard, selectDashboard, openDashboardViewer, exitDashboardViewer, selectPageForObject, openPageForObject } = useSetupAnalyticsActions({ apiRequest, dashboards, navigateRoute, notify, objects, page, pages, reports, setDashboardFolders, setDashboardTerritories, setDashboards, setPage, setReportFolders, setReports, workspace });

  // Standalone presentation is a page metadata capability, not an app identity.
  // Only an active, route-matched page can opt into the edge-to-edge shell.
  const isStandaloneMetadataPage = (route.kind === 'app-page' || route.kind === 'app-home') && pages.some((candidate) =>
    candidate.status === 'Active' &&
    (route.kind === 'app-page' ? candidate.apiName === route.pageApiName && candidate.pageType === 'App Page'
      : candidate.pageType === 'Home Page' && (candidate.activationAssignments ?? []).some((assignment) =>
          assignment.appId === route.appId && (assignment.scope === 'App Default' || assignment.scope === 'App and Profile'))) &&
    isStandalonePagePresentation(candidate)
  );

  // Use the existing tenant-scoped credential test endpoint. The UI expects
  // connected/message, whereas the backend returns success/status.
  const testNamedCredential = async (id: string): Promise<{connected:boolean;status?:number;message:string}> => {
    const result=await apiRequest<{success:boolean;status:number}>(
      '/named-credentials/'+encodeURIComponent(id)+'/test',{method:'POST'});
    const status=Number(result.status);
    return {connected:result.success===true&&status>=200&&status<300,
      status,message:result.success===true&&status>=200&&status<300
        ? 'HTTP '+status+' — endpoint responded'
        : 'HTTP '+(Number.isFinite(status)?status:'unknown')+' — provider rejected the request'};
  };
  return renderSetupShell({AppExchange, AppManager, FieldWizardModal, FlowInterviews, FlowLogs, NamedCredentials, ScheduledFlows, SetupFlowDialogs, SetupObjectDialogs, AccountSessionSecurity, AutomationSettingsWorkspace, Check, ChevronLeft, ChevronRight, CircleHelp, CompanySettings, ConnectionHealthIndicator, DashboardBuilder, Database, DeveloperAccountSettings, FlowBuilderWorkspace, GlobalRecordSearch, History, LightningAppRuntime, Monitor, NavigationLoadTime, ObjectManager, PageBuilder, Permissions, PlatformPageSlot, PlatformWorkspaceSurface, ProfilePasswordMenu, RecordObjectPicker, RecordWorkspace, ReportBuilder, Search, SetupHome, TenantDomains, TenantEmailRecoverySettings, TenantManagement, TenantMfaSettings, TenantRecoveryPanel, TenantSecurityAudit, TenantUsagePanel, TenantUserLockSettings, X, accessControl, accessControlError, accessControlLoaded, activationAppIds, activeUtility, addField, addFlowElement, advancedMetadataLoaded, apiRequest, appUtilityRef, approvalProcesses, apps, setApps, setPages, canCreateDashboards, canManageApprovalProcesses, canManageApps, canReadMetadata, canReadSecurity, canManageDashboardTerritories, canManageDashboards, canManageFlows, canManageLibrary, canManageNamedCredentials, canManagePlatformTenants, canManageReportFolders, canManageUserIdentities, canRunFlows, canScheduleDashboards, cancelFlowInterview, changePage, cloneFlow, commitFlow, connectorProviders, connectorRights, connectorRightsLoaded, connectorRightsError, createFlow, createObject, currentApp, currentAppNavigation, currentFieldAccess, currentProfileId, currentRecordTypeAccess, customTabObject, customTabStyle, customTabStyles, dashboardFolders, dashboardRunningUserIds, dashboardTerritories, dashboardUserId, dashboards, deactivateFlow, defaultLightningPage, deleteApp, deleteApprovalProcess, deleteDashboard, deleteDashboardFolder, deleteEmailAlert, deleteField, deleteFlow, deleteNamedCredential, deleteObject, deletePlatformEvent, deleteReport, emailAlerts, executeConnectorAppLifecycleFlow, exitDashboardViewer, exportFlow, fetchFlowListPage, filteredSetupGroups, flow, flowDefinitionsLoaded, flowDefinitionsError, reportsLoaded, reportsError, dashboardsLoaded, dashboardsError, flowDebug, flowHasUnsavedChanges, flowHistory, flowInterviews, flowInterviewsLoading, flowLogs, flowLogsLoading, flowLogCursor, flowLogsLoadingMore, loadMoreFlowHistory, flowRun, flowRunnerError, flowRunnerSubmitting, flowToolTab, flowValidation, flows, formulaEditorRef, goBackFlowScreen, importFlow, insertFormulaText, integrationConnections, isStandaloneMetadataPage, launchCustomTabWizard, libraryComponents, loadAppCommunicationHistory, loadConnectorMarketplaceApps, loadDashboardRecords, loadFlowScreenRecords, logout, metadataLoadError, metadataLoaded, namedCredentials, namedCredentialsLoaded, namedCredentialsError, namedCredentialsReadinessError, namedCredentialsEncryptionReady, navigateRoute, navigateSetupItem, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, newObjectDescription, newObjectLabel, newObjectPluralLabel, newObjectRecordNameLabel, newObjectSettings, notify, object, objectSearch, objectSetting, objects, onLogout, openDashboardViewer, openFlowDebug, openPageForObject, openSetupWorkspace, page, pageCreationAppContext, pageRouteApiName, pages, platformEvents, previewReport, protectedPageRuntime, quickFind, readableRecordObjects, recentRoutes, recordSearch, redoFlow, refreshFlowInterviews, refreshObject, relatedLookupFilterOperators, removeFlowElement, reportFolders, reports, resetNewFieldDraft, restoreFlowVersion, route, routeAliasError, routeTiming, runFlow, runFlowDebug, runReport, runSavedFlowTests, runtimeFormFactor, saveAccessControl, saveApp, saveApprovalProcess, saveConnectorProvider, saveCustomTab, saveDashboard, saveDashboardFolder, saveDashboardTerritories, saveEmailAlert, saveField, saveFlow, saveIntegrationConnection, saveNamedCredential, saveObject, savePage, savePageFromBuilder, savePlatformEvent, saveReport, saveReportFolder, selectDashboard, selectFlow, selectedFlowId, setActiveUtility, setCustomTabObject, setCustomTabStyle, setFlowDebug, setFlowRun, setFlowRunnerError, setFlowToolTab, setLaunchCustomTabWizard, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setNewObjectDescription, setNewObjectLabel, setNewObjectPluralLabel, setNewObjectRecordNameLabel, setNewObjectSettings, setObjectSearch, setPage, setPageCreationAppContext, setQuickFind, setRecordSearch, setSelectedFlowId, setSetupSidebarCollapsed, setShowNewField, setShowNewObject, setShowCustomTabWizard, setStandalonePageMode, setupSidebarCollapsed, showCustomTabWizard, showNewField, showNewObject, standalonePageMode, submitFlowScreen, toast, setToast, toggleNamedCredentialEnabled, testNamedCredential, undoFlow, uneSolutionsLogoUrl, updateFlowConfig, updateFlowLabel, validateFlow, validateNewFieldFormula, workspace});
}
return SetupApp;
}
