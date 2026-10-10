import * as React from 'react';
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
  Workflow
} from 'lucide-react';
import FlowBuilderWorkspace from './FlowBuilder';
import FlowScreenContent from './FlowScreenContent';
import FlowLogs from './FlowLogs';
import FlowInterviews from './FlowInterviews';
import ScheduledFlows from './ScheduledFlows';
import DashboardBuilder from './DashboardBuilder';
import ComponentLibrary from './ComponentLibrary';
import RegisteredComponent from './RegisteredComponent';
import AppExchange from './AppExchange';
import AppManager from './AppManager';
import NamedCredentials from './NamedCredentials';
import ApprovalProcessManager from './ApprovalProcessManager';
import { standardPageComponents } from './componentCatalog';
import {
  canvasDimensionsForOrientation,
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
  setupNavigation,
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

type NewFieldLookupFilterDraft = {
  id: string;
  relatedFieldApiName: string;
  operator: RelatedLookupFilterMetadata['operator'];
  valueMode: 'Value' | 'Field';
  value: string;
  valueFieldApiName: string;
  required: boolean;
};

const customTabStyles = [
  { name: 'Blue', color: '#1589ee', icon: Database },
  { name: 'Green', color: '#2e844a', icon: UsersRound },
  { name: 'Orange', color: '#fe9339', icon: CalendarDays },
  { name: 'Purple', color: '#9050e9', icon: BriefcaseBusiness },
  { name: 'Red', color: '#ea001e', icon: FileText },
  { name: 'Teal', color: '#0b827c', icon: Building2 },
  { name: 'Yellow', color: '#dd7a01', icon: ClipboardList }
] as const;

const defaultApiUrl = new URL(window.location.origin);
defaultApiUrl.port = '3001';
defaultApiUrl.pathname = '/api';
const apiBase = import.meta.env.VITE_API_BASE_URL ?? defaultApiUrl.toString().replace(/\/$/, '');
let accessToken: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;

function isAuthErrorMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('401')
    || text.includes('bearer access token required')
    || text.includes('access token is invalid or expired')
    || text.includes('access token has been revoked')
    || text.includes('refresh token')
    || text.includes('session-expired')
    || text.includes('unable to refresh the login session');
}

function withAuthRefreshLock(refresh: () => Promise<Response>): Promise<Response> {
  if (typeof navigator === 'undefined' || !navigator.locks) return refresh();
  return navigator.locks.request('metadrive-auth-refresh', refresh).then((response) => response);
}

function refreshAccessToken() {
  if (!refreshInFlight) {
    const startedToken = accessToken;
    refreshInFlight = withAuthRefreshLock(() =>
      fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' })
    )
      .then(async (response) => {
        if (!response.ok) {
          // Only expire the session if our token didn't change while refreshing.
          // Otherwise another tab already refreshed and we hold a stale in-memory token.
          if (accessToken === startedToken) {
            accessToken = undefined;
            window.dispatchEvent(new Event('metadrive:session-expired'));
          }
          return undefined;
        }
        const session = await response.json() as { access_token: string };
        accessToken = session.access_token;
        return accessToken;
      })
      .catch((error: unknown) => {
        if (accessToken === startedToken) {
          accessToken = undefined;
          window.dispatchEvent(new Event('metadrive:session-expired'));
        }
        throw new Error(`Unable to refresh the login session: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
  }
  return refreshInFlight;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | undefined) => fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
      'X-MetaDrive-Request-Source': 'web-app'
    }
  });
  const sentToken = accessToken;
  let response = await send(sentToken);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    // If another request already refreshed while we were in flight, reuse that token.
    // Otherwise join the single shared refresh instead of firing N parallel refreshes
    // (parallel refreshes reuse the same rotation cookie -> family revoked -> logout).
    const token = accessToken !== undefined && accessToken !== sentToken
      ? accessToken
      : await refreshAccessToken();
    // Only retry once with a *different* token; retrying with the same/empty token
    // just repeats the 401 and can trigger another refresh loop.
    if (token && token !== sentToken) response = await send(token);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as T & { error?: string; details?: unknown };
  if (!response.ok) {
    const details = Array.isArray(payload.details)
      ? payload.details.map(String).join('; ')
      : typeof payload.details === 'string'
        ? payload.details
        : payload.details
          ? JSON.stringify(payload.details)
          : '';
    throw new ApiRequestError(
      `${payload.error ?? `Request failed (${response.status})`}${details ? `: ${details}` : ''}`,
      payload
    );
  }
  return payload;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly responseBody: unknown) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function loadFlowScreenRecords(objectApiName: string): Promise<Record<string, unknown>[]> {
  const result = await apiRequest<{ records: Record<string, unknown>[] }>(`/records/${encodeURIComponent(objectApiName)}`);
  return result.records;
}

const objectSettings = [
  'Details',
  'Fields & Relationships',
  'Page Layouts',
  'Lightning Record Pages',
  'Buttons, Links, and Actions',
  'Compact Layouts',
  'Field Sets',
  'Object Limits',
  'Record Types',
  'Related Lookup Filters',
  'Search Layouts',
  'List View Button Layout'
];

const settingRouteNames: Record<string, string> = {
  'Fields & Relationships': 'FieldsAndRelationships',
  'Page Layouts': 'PageLayouts',
  'Lightning Record Pages': 'LightningRecordPages',
  'Buttons, Links, and Actions': 'ButtonsLinksAndActions',
  'Compact Layouts': 'CompactLayouts',
  'Field Sets': 'FieldSets',
  'Object Limits': 'ObjectLimits',
  'Record Types': 'RecordTypes',
  'Related Lookup Filters': 'RelatedLookupFilters',
  'Search Layouts': 'SearchLayouts',
  'List View Button Layout': 'ListViewButtonLayout'
};

function settingFromRoute(value: string): string {
  return Object.entries(settingRouteNames).find(([, routeName]) => routeName === value)?.[0]
    ?? (objectSettings.includes(value) ? value : 'Details');
}

function settingToRoute(value: string): string {
  return settingRouteNames[value] ?? value.replace(/[^A-Za-z0-9]/g, '');
}

type AuthState = 'loading' | 'anonymous' | 'authenticated' | 'error';

type AppRoute =
  | { kind: 'setup'; workspace: WorkspaceId; objectApiName?: string; setting?: string; resourceApiName?: string; resourceId?: string; dashboardView?: boolean }
  | { kind: 'app-home'; appId: string }
  | { kind: 'app-page'; appId: string; pageApiName: string }
  | { kind: 'record-list'; objectApiName: string; appId?: string }
  | { kind: 'record-detail'; objectApiName: string; recordId: string; appId?: string };

type RecordData = { Id: string; [fieldApiName: string]: unknown };
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

function pageLayoutForRecord(object: ObjectMetadata, recordTypeId: string, profileId: string): PageLayoutMetadata | undefined {
  const assignments = object.pageLayoutAssignments ?? [];
  const assignment = assignments.find((item) => item.profileId === profileId && item.recordTypeId === recordTypeId)
    ?? assignments.find((item) => item.profileId === '*' && item.recordTypeId === recordTypeId);
  return object.pageLayouts?.find((layout) => layout.id === assignment?.pageLayoutId) ?? object.pageLayouts?.[0];
}

function compactLayoutForRecord(object: ObjectMetadata, recordTypeId: string, profileId: string) {
  const layouts = object.compactLayouts ?? [];
  const assignments = object.compactLayoutAssignments ?? [];
  const assignment = assignments.find((item) => item.profileId === profileId && item.recordTypeId === recordTypeId)
    ?? assignments.find((item) => item.profileId === '*' && item.recordTypeId === recordTypeId);
  return layouts.find((layout) => layout.id === assignment?.compactLayoutId)
    ?? layouts[0]
    ?? (object.compactLayout ? { id: `${object.apiName}-legacy-compact`, ...object.compactLayout } : undefined);
}

const relatedLookupFilterOperators: RelatedLookupFilterMetadata['operator'][] = [
  'Equals', 'Not Equal To', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null', 'Is Not Null'
];

function matchesLookupFilter(record: RecordData, filter: RelatedLookupFilterMetadata, sourceRecord: Record<string, unknown>): boolean {
  const rawValue = record[filter.relatedFieldApiName];
  const actual = rawValue === undefined || rawValue === null ? '' : String(rawValue);
  const expectedValue = filter.valueFieldApiName ? sourceRecord[filter.valueFieldApiName] : filter.value;
  const expected = expectedValue === undefined || expectedValue === null ? '' : String(expectedValue);
  if (filter.operator === 'Is Null') return rawValue === undefined || rawValue === null || rawValue === '';
  if (filter.operator === 'Is Not Null') return rawValue !== undefined && rawValue !== null && rawValue !== '';
  if (filter.operator === 'Equals') return actual === expected;
  if (filter.operator === 'Not Equal To') return actual !== expected;
  if (filter.operator === 'Contains') return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if (filter.operator === 'Starts With') return actual.toLocaleLowerCase().startsWith(expected.toLocaleLowerCase());
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return filter.operator === 'Greater Than' ? actualNumber > expectedNumber : actualNumber < expectedNumber;
  }
  return filter.operator === 'Greater Than'
    ? actual.localeCompare(expected) > 0
    : actual.localeCompare(expected) < 0;
}

function matchesLookupFilterGroup(
  record: RecordData,
  filters: RelatedLookupFilterMetadata[],
  sourceRecord: Record<string, unknown>,
  logic: 'All' | 'Any'
): boolean {
  if (filters.length === 0) return true;
  const results = filters.map((filter) => matchesLookupFilter(record, filter, sourceRecord));
  return logic === 'Any' ? results.some(Boolean) : results.every(Boolean);
}

function parseAppRoute(pathname: string, search = ''): AppRoute {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (basePath && pathname.startsWith(basePath + '/')) pathname = pathname.slice(basePath.length);
  const pathSegments = pathname.split('/').filter(Boolean);
  const segments = pathSegments[0] === 'une' ? pathSegments.slice(1) : [];
  const appId = new URLSearchParams(search).get('appId') || 'Records';
  try {
    if (segments.length === 3 && segments[0] === 'apps' && segments[2] === 'home') {
      return { kind: 'app-home', appId: decodeURIComponent(segments[1]) };
    }
    if (segments.length === 4 && segments[0] === 'apps' && segments[2] === 'pages') {
      return { kind: 'app-page', appId: decodeURIComponent(segments[1]), pageApiName: decodeURIComponent(segments[3]) };
    }
    if (segments.length === 2 && segments[0] === 'dashboards') {
      return { kind: 'setup', workspace: 'dashboard-builder', resourceApiName: decodeURIComponent(segments[1]), dashboardView: true };
    }
    if (segments[0] === 'setup') {
      const workspace = decodeURIComponent(segments[1] ?? 'home') as WorkspaceId;
      const validWorkspaces: WorkspaceId[] = ['home', 'object-manager', 'page-builder', 'dashboard-builder', 'report-builder', 'flow-builder', 'flow-interviews', 'scheduled-flows', 'flow-logs', 'approval-processes', 'component-library', 'app-manager', 'app-exchange', 'connector-settings', 'named-credentials', 'company-settings', 'rbac'];
      if (!validWorkspaces.includes(workspace)) return { kind: 'setup', workspace: 'home' };
      if (workspace === 'object-manager') {
        return {
          kind: 'setup',
          workspace,
          ...(segments[2] ? { objectApiName: decodeURIComponent(segments[2]) } : {}),
          ...(segments[3] ? { setting: settingFromRoute(decodeURIComponent(segments[3])) } : {})
        };
      }
      if (segments[2]) {
        return {
          kind: 'setup',
          workspace,
          resourceApiName: decodeURIComponent(segments[2]),
          ...(segments[3] ? { resourceId: decodeURIComponent(segments[3]) } : {})
        };
      }
      return { kind: 'setup', workspace };
    }
    if (segments.length === 3 && segments[0] === 'o' && segments[2] === 'list') {
      return { kind: 'record-list', objectApiName: decodeURIComponent(segments[1]), appId };
    }
    if (segments.length === 4 && segments[0] === 'r' && segments[3] === 'view') {
      return {
        kind: 'record-detail',
        objectApiName: decodeURIComponent(segments[1]),
        recordId: decodeURIComponent(segments[2]),
        appId
      };
    }
  } catch {
    return { kind: 'setup', workspace: 'home' };
  }
  return { kind: 'setup', workspace: 'home' };
}

function appRoutePath(route: AppRoute): string {
  const path = appRoutePathWithoutBase(route);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return basePath + path;
}

function appRoutePathWithoutBase(route: AppRoute): string {
  if (route.kind === 'setup') {
    if (route.dashboardView && route.resourceApiName) {
      return `/une/dashboards/${encodeURIComponent(route.resourceApiName)}`;
    }
    const segments = ['/une/setup', encodeURIComponent(route.workspace)];
    if (route.workspace === 'object-manager') {
      if (route.objectApiName) segments.push(encodeURIComponent(route.objectApiName));
      if (route.setting) segments.push(encodeURIComponent(settingToRoute(route.setting)));
    } else if (route.resourceApiName) {
      segments.push(encodeURIComponent(route.resourceApiName));
      if (route.resourceId) segments.push(encodeURIComponent(route.resourceId));
    }
    return segments.join('/');
  }
  if (route.kind === 'app-home') return `/une/apps/${encodeURIComponent(route.appId)}/home`;
  if (route.kind === 'app-page') return `/une/apps/${encodeURIComponent(route.appId)}/pages/${encodeURIComponent(route.pageApiName)}`;
  if (route.kind === 'record-list') {
    const query = new URLSearchParams({ filterName: `All${route.objectApiName}s` });
    if (route.appId) query.set('appId', route.appId);
    return `/une/o/${encodeURIComponent(route.objectApiName)}/list?${query.toString()}`;
  }
  if (route.kind === 'record-detail') {
    const path = `/une/r/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/view`;
    return route.appId ? `${path}?${new URLSearchParams({ appId: route.appId }).toString()}` : path;
  }
  return '/une/setup/home';
}

function ConnectorSettingsWorkspace({
  provider,
  providers,
  integrationConnections,
  onSelect,
  onSaveProvider,
  onSaveIntegrationConnection,
  onTestIntegrationConnection,
  onNotify
}: {
  provider: ConnectorProviderMetadata;
  providers: ConnectorProviderMetadata[];
  integrationConnections: IntegrationConnectionMetadata[];
  onSelect: (connectorKey: string) => void;
  onSaveProvider: (provider: ConnectorProviderMetadata) => Promise<ConnectorProviderMetadata>;
  onSaveIntegrationConnection: (connection: Omit<Pick<IntegrationConnectionMetadata, 'id' | 'connectorKey' | 'name' | 'configuration' | 'status'>, 'id'> & { id?: string; credentials: Record<string, string> }) => Promise<IntegrationConnectionMetadata>;
  onTestIntegrationConnection: (id: string) => Promise<IntegrationConnectionMetadata>;
  onNotify: (message: string) => void;
}) {
  const providerConnections = integrationConnections.filter((item) => item.connectorKey === provider.connectorKey);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<IntegrationConnectionMetadata['status']>('ACTIVE');
  const [connectionConfiguration, setConnectionConfiguration] = useState<Record<string, string>>({});
  const [connectionCredentials, setConnectionCredentials] = useState<Record<string, string>>({});
  const [savingConnection, setSavingConnection] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestError, setConnectionTestError] = useState('');
  const [editingProvider, setEditingProvider] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [providerAuthType, setProviderAuthType] = useState<ConnectorProviderMetadata['authType']>('NONE');
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [providerAuthHeader, setProviderAuthHeader] = useState('');
  const [providerAuthCredential, setProviderAuthCredential] = useState('');
  const [providerCredentialsSchema, setProviderCredentialsSchema] = useState('[]');
  const [providerOperations, setProviderOperations] = useState('{}');
  const [providerTest, setProviderTest] = useState('');
  const [providerTimeout, setProviderTimeout] = useState('30000');
  const [providerRetries, setProviderRetries] = useState('1');
  const [providerStatus, setProviderStatus] = useState<ConnectorProviderMetadata['status']>('ACTIVE');

  useEffect(() => {
    const existing = providerConnections[0];
    setSelectedConnectionId(existing?.id ?? '');
    setConnectionName(existing?.name ?? `${provider.name} connection`);
    setConnectionStatus(existing?.status ?? 'ACTIVE');
    setConnectionConfiguration(existing?.configuration ?? {});
    setConnectionCredentials({});
  }, [provider.connectorKey]);

  useEffect(() => {
    setProviderName(provider.name);
    setProviderAuthType(provider.authType);
    setProviderBaseUrl(provider.baseUrl);
    setProviderAuthHeader(provider.authHeader ?? '');
    setProviderAuthCredential(provider.authCredential ?? '');
    setProviderCredentialsSchema(JSON.stringify(provider.credentialsSchema, null, 2));
    setProviderOperations(JSON.stringify(provider.operations, null, 2));
    setProviderTest(provider.test ? JSON.stringify(provider.test, null, 2) : '');
    setProviderTimeout(String(provider.timeoutMs));
    setProviderRetries(String(provider.retryPolicy.maxAttempts));
    setProviderStatus(provider.status);
    setEditingProvider(false);
  }, [provider]);

  const saveProvider = async () => {
    setSavingProvider(true);
    try {
      const saved = await onSaveProvider({
        connectorKey: provider.connectorKey,
        name: providerName,
        authType: providerAuthType,
        baseUrl: providerBaseUrl,
        ...(providerAuthHeader ? { authHeader: providerAuthHeader } : {}),
        ...(providerAuthCredential ? { authCredential: providerAuthCredential } : {}),
        credentialsSchema: JSON.parse(providerCredentialsSchema) as ConnectorProviderMetadata['credentialsSchema'],
        operations: JSON.parse(providerOperations) as ConnectorProviderMetadata['operations'],
        ...(providerTest.trim() ? { test: JSON.parse(providerTest) as NonNullable<ConnectorProviderMetadata['test']> } : {}),
        timeoutMs: Number(providerTimeout),
        retryPolicy: { maxAttempts: Number(providerRetries) },
        status: providerStatus
      });
      setEditingProvider(false);
      onNotify(`${saved.name} provider definition saved`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save connector provider definition');
    } finally {
      setSavingProvider(false);
    }
  };

  const selectConnection = (id: string) => {
    const selected = providerConnections.find((item) => item.id === id);
    setSelectedConnectionId(id);
    setConnectionName(selected?.name ?? `${provider.name} connection`);
    setConnectionStatus(selected?.status ?? 'ACTIVE');
    setConnectionConfiguration(selected?.configuration ?? {});
    setConnectionCredentials({});
    setConnectionTestError('');
  };
  const saveConnection = async () => {
    setSavingConnection(true);
    try {
      const saved = await onSaveIntegrationConnection({
        ...(selectedConnectionId ? { id: selectedConnectionId } : {}),
        connectorKey: provider.connectorKey,
        name: connectionName,
        configuration: connectionConfiguration,
        credentials: connectionCredentials,
        status: connectionStatus
      });
      setSelectedConnectionId(saved.id);
      setConnectionName(saved.name);
      setConnectionConfiguration(saved.configuration);
      setConnectionStatus(saved.status);
      setConnectionCredentials({});
      setConnectionTestError('');
      onNotify(`${saved.name} connection saved`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save Integration Connection');
    } finally {
      setSavingConnection(false);
    }
  };
  const selectedConnection = providerConnections.find((item) => item.id === selectedConnectionId);
  const connectionIsDirty = !selectedConnection
    || selectedConnection.name !== connectionName
    || selectedConnection.status !== connectionStatus
    || JSON.stringify(selectedConnection.configuration) !== JSON.stringify(connectionConfiguration)
    || Object.values(connectionCredentials).some((value) => value.trim().length > 0);
  const testStatusLabel = connectionTestError
    ? 'Failed'
    : !provider.test ? 'Test unavailable' : selectedConnection?.testStatus ?? 'Not tested';
  const testStatusClass = testStatusLabel === 'Connected' ? 'connected'
    : testStatusLabel === 'Failed' || testStatusLabel === 'Not configured' ? 'failed' : '';
  const testConnection = async () => {
    if (!selectedConnectionId || connectionIsDirty || editingProvider) return;
    setTestingConnection(true);
    setConnectionTestError('');
    try {
      await onTestIntegrationConnection(selectedConnectionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      setConnectionTestError(message);
      onNotify(message);
    } finally {
      setTestingConnection(false);
    }
  };

  return <div className="connector-settings-page">
    <div className="page-heading">
      <div><div className="eyebrow">SETUP / UNE CONNECTORS / CONNECTOR PROVIDERS</div><h1>Une Connectors</h1><p>Provider definitions and tenant connections from connector metadata.</p></div>
    </div>
    <div className="connector-settings-layout">
      <nav className="connector-record-nav surface" aria-label="Connectors">
        <div className="connector-record-nav-title">Connectors</div>
        {providers.map((item) => <button
          key={item.connectorKey}
          className={item.connectorKey === provider.connectorKey ? 'connector-record-nav-item selected' : 'connector-record-nav-item'}
          onClick={() => onSelect(item.connectorKey)}
        ><Puzzle size={15} /><span>{item.name}</span><ChevronRight size={14} /></button>)}
      </nav>
      <section className="connector-record-content">
        <header className="connector-record-heading surface">
          <div className="connector-record-icon"><Puzzle size={21} /></div>
          <div><div className="eyebrow">CONNECTOR PROVIDER · {provider.connectorKey}</div><h2>{provider.name}</h2><p>Provider definition metadata and configured tenant connections.</p></div>
        </header>
        <>
          <div className="connector-record-card surface">
            <div className="connector-card-heading"><div><h3>Provider Definition</h3><p>Metadata used by flows to build requests for this provider.</p></div>
              {editingProvider
                ? <div className="connector-connection-actions"><button className="btn btn-small" onClick={() => setEditingProvider(false)}>Cancel</button><button className="btn btn-brand btn-small" onClick={() => void saveProvider()} disabled={savingProvider}><Save size={13} />{savingProvider ? 'Saving…' : 'Save Provider'}</button></div>
                : <button className="btn btn-small" onClick={() => setEditingProvider(true)}><Pencil size={13} />Edit Definition</button>}
            </div>
            {editingProvider ? <div className="connector-definition-form">
              <label className="form-label">Connector Key<input className="form-control" value={provider.connectorKey} readOnly /></label>
              <label className="form-label">Name<input className="form-control" value={providerName} onChange={(event) => setProviderName(event.target.value)} /></label>
              <label className="form-label">Authentication Type<select className="form-control" value={providerAuthType} onChange={(event) => setProviderAuthType(event.target.value as ConnectorProviderMetadata['authType'])}>{['NONE', 'BEARER', 'BASIC', 'API_KEY'].map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="form-label">Base URL<input className="form-control" type="url" value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} /></label>
              {providerAuthType === 'API_KEY' && <label className="form-label">API Key Header<input className="form-control" value={providerAuthHeader} onChange={(event) => setProviderAuthHeader(event.target.value)} /></label>}
              {['BEARER', 'API_KEY'].includes(providerAuthType) && <label className="form-label">Authentication Credential Field (optional when only one required secret)<input className="form-control" value={providerAuthCredential} onChange={(event) => setProviderAuthCredential(event.target.value)} /></label>}
              <label className="form-label">Credentials Schema (JSON)<textarea className="form-control" rows={6} value={providerCredentialsSchema} onChange={(event) => setProviderCredentialsSchema(event.target.value)} /></label>
              <label className="form-label">Operations (JSON)<textarea className="form-control" rows={6} value={providerOperations} onChange={(event) => setProviderOperations(event.target.value)} /></label>
              <label className="form-label">Safe Test Configuration (JSON, GET/HEAD only)<textarea className="form-control" rows={4} placeholder={'{"method":"GET","path":"/status","expectedStatus":200}'} value={providerTest} onChange={(event) => setProviderTest(event.target.value)} /></label>
              <div className="connector-definition-row">
                <label className="form-label">Timeout (ms)<input className="form-control" type="number" min={1000} max={120000} value={providerTimeout} onChange={(event) => setProviderTimeout(event.target.value)} /></label>
                <label className="form-label">Max Attempts<input className="form-control" type="number" min={1} max={5} value={providerRetries} onChange={(event) => setProviderRetries(event.target.value)} /></label>
                <label className="form-label">Status<select className="form-control" value={providerStatus} onChange={(event) => setProviderStatus(event.target.value as ConnectorProviderMetadata['status'])}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              </div>
            </div> : <div className="connector-field-list">
              <div className="connector-config-field"><div className="connector-config-label"><span>Connector Key</span></div><code>{provider.connectorKey}</code></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Authentication</span></div><div className="connector-config-value">{provider.authType}</div></div>
              {provider.authCredential && <div className="connector-config-field"><div className="connector-config-label"><span>Authentication Credential</span></div><div className="connector-config-value">{provider.authCredential}</div></div>}
              <div className="connector-config-field"><div className="connector-config-label"><span>Base URL</span></div><div className="connector-config-value">{provider.baseUrl}</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Timeout</span></div><div className="connector-config-value">{provider.timeoutMs} ms</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Retry Policy</span></div><div className="connector-config-value">{provider.retryPolicy.maxAttempts} attempts</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Operations</span></div><div className="connector-config-value">{Object.entries(provider.operations).map(([name, operation]) => `${name} (${operation.method} ${operation.path})`).join(', ') || 'No operations defined'}</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Connection Test</span></div><div className="connector-config-value">{provider.test ? `${provider.test.method} ${provider.test.path} → HTTP ${provider.test.expectedStatus}` : 'Test unavailable (no safe endpoint configured)'}</div></div>
              <p className="connector-security-note">Provider definitions are also listed as records under Connector Providers; API secrets belong to Integration Connections.</p>
            </div>}
          </div>
          <div className="connector-record-card surface">
            <div className="connector-card-heading"><div><h3>Integration Connection</h3><p>Tenant-owned connection values and encrypted credentials used by flows.</p></div>
              <div className="connector-connection-actions">
                <select className="form-control" aria-label="Select Integration Connection" value={selectedConnectionId} onChange={(event) => selectConnection(event.target.value)}>
                  <option value="">New connection</option>
                  {providerConnections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <button className="btn btn-small" onClick={() => selectConnection('')}><Plus size={13} />New</button>
              </div>
            </div>
            <div className="connector-field-list">
              <label className="form-label">Connection Name<input className="form-control" value={connectionName} onChange={(event) => setConnectionName(event.target.value)} /></label>
              <label className="form-label">Status<select className="form-control" value={connectionStatus} onChange={(event) => setConnectionStatus(event.target.value as IntegrationConnectionMetadata['status'])}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              {provider.credentialsSchema.map((field) => <label className="form-label" key={field.name}>
                {field.label}{field.required ? ' *' : ''}
                <input
                  className="form-control"
                  type={field.secret ? 'password' : 'text'}
                  autoComplete="new-password"
                  value={field.secret ? (connectionCredentials[field.name] ?? '') : (connectionConfiguration[field.name] ?? '')}
                  placeholder={field.secret && providerConnections.find((item) => item.id === selectedConnectionId)?.credentialFields.some((entry) => entry.name === field.name && entry.configured) ? 'Saved encrypted value; leave blank to keep' : ''}
                  onChange={(event) => field.secret
                    ? setConnectionCredentials((current) => ({ ...current, [field.name]: event.target.value }))
                    : setConnectionConfiguration((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              </label>)}
            </div>
            <div className="connector-save-footer">
              <div className="connector-test-state" aria-live="polite">
                <span className={`connector-test-result ${testStatusClass}`}>{testStatusLabel}</span>
                {connectionTestError
                  ? <span>{connectionTestError}</span>
                  : (provider.test || selectedConnection?.testStatus === 'Test unavailable')
                    && selectedConnection?.lastTestMessage && <span>{selectedConnection.lastTestMessage}</span>}
                {selectedConnection?.lastTestedAt && <time dateTime={selectedConnection.lastTestedAt}>Last tested {new Date(selectedConnection.lastTestedAt).toLocaleString()}</time>}
                {connectionIsDirty && <span>Save connection changes before testing.</span>}
                <p className="connector-security-note">Credentials are encrypted at rest and are never returned to the browser. Leave a saved secret blank to keep it unchanged.</p>
              </div>
              <div className="connector-connection-actions">
                <button className="btn" onClick={() => void testConnection()} disabled={!selectedConnectionId || connectionIsDirty || savingConnection || testingConnection || editingProvider}>
                  {testingConnection ? 'Testing…' : 'Test Connection'}
                </button>
                <button className="btn btn-brand" onClick={() => void saveConnection()} disabled={savingConnection || !connectionName.trim()}><Save size={14} />{savingConnection ? 'Saving…' : 'Save Connection'}</button>
              </div>
            </div>
          </div>
        </>
      </section>
    </div>
  </div>;
}

function initialScreenValues(screen: FlowElementMetadata): Record<string, unknown> {
  const fields = Array.isArray(screen.config.fields)
    ? screen.config.fields.filter((field): field is Record<string, unknown> =>
      typeof field === 'object' && field !== null && !Array.isArray(field)
      && !['Display Text', 'Display Image', 'Section'].includes(String(field.type)))
    : [];
  return Object.fromEntries(fields.flatMap((field, index) => {
    const name = typeof field.apiName === 'string'
      ? field.apiName
      : String(field.label ?? `Field_${index + 1}`).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (Object.hasOwn(field, 'defaultValue')) return [[name, field.defaultValue]];
    if (field.type === 'Checkbox' || field.type === 'Toggle') return [[name, false]];
    if (field.type === 'Slider') return [[name, typeof field.min === 'number' ? field.min : 0]];
    return [];
  }));
}

function screenFieldIsVisible(field: Record<string, unknown>, values: Record<string, unknown>): boolean {
  const conditions = Array.isArray(field.visibilityConditions)
    ? field.visibilityConditions.filter((condition): condition is Record<string, unknown> =>
      typeof condition === 'object' && condition !== null && !Array.isArray(condition))
    : [];
  if (!conditions.length) return true;
  const checks = conditions.map((condition) => {
    const actual = values[String(condition.field ?? '')];
    const expected = condition.value;
    switch (String(condition.operator ?? 'Equals')) {
      case 'Not Equals':
      case 'Not Equal To': return String(actual ?? '') !== String(expected ?? '');
      case 'Is Null': return actual === undefined || actual === null || actual === '';
      case 'Is Not Null': return actual !== undefined && actual !== null && actual !== '';
      case 'Contains': return String(actual ?? '').includes(String(expected ?? ''));
      case 'Starts With': return String(actual ?? '').toLocaleLowerCase().startsWith(String(expected ?? '').toLocaleLowerCase());
      case 'Equals':
      default: return String(actual ?? '') === String(expected ?? '');
    }
  });
  return String(field.visibilityLogic ?? 'All').toLowerCase() === 'any'
    ? checks.some(Boolean)
    : checks.every(Boolean);
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState('');
  const sessionRestoreStarted = useRef(false);
  useEffect(() => {
    const expireSession = () => {
      accessToken = undefined;
      setAuthState('anonymous');
    };
    window.addEventListener('metadrive:session-expired', expireSession);
    return () => window.removeEventListener('metadrive:session-expired', expireSession);
  }, []);

  const restoreSession = async () => {
    const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
    const retryDelaysMs = [1500, 3000, 5000, 7000];

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await withAuthRefreshLock(() =>
          fetch(`${apiBase}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal
          })
        );

        if (response.status === 401) {
          accessToken = undefined;
          setAuthError('');
          setAuthState('anonymous');
          return;
        }

        if (response.ok) {
          const session = await response.json() as { access_token: string };
          accessToken = session.access_token;
          setAuthError('');
          setAuthState('authenticated');
          return;
        }

        if (!retryableStatuses.has(response.status) || attempt === retryDelaysMs.length) {
          throw new Error(`Session restore failed (${response.status})`);
        }
      } catch (error) {
        const retryableNetworkFailure =
          error instanceof DOMException && error.name === 'AbortError'
          || error instanceof TypeError;

        if (!retryableNetworkFailure || attempt === retryDelaysMs.length) {
          setAuthError(error instanceof DOMException && error.name === 'AbortError'
            ? 'The workspace API took too long to start. Please retry.'
            : error instanceof Error ? error.message : String(error));
          setAuthState('error');
          return;
        }
      } finally {
        window.clearTimeout(timeout);
      }

      await new Promise((resolve) => window.setTimeout(resolve, retryDelaysMs[attempt]));
    }
  };

  useEffect(() => {
    if (sessionRestoreStarted.current) return;
    sessionRestoreStarted.current = true;
    void restoreSession();
  }, []);

  if (authState === 'loading') return <div className="auth-loading">Loading your workspace…</div>;
  if (authState === 'anonymous') return <Login onSuccess={() => setAuthState('authenticated')} />;
  if (authState === 'error') return <Login error={authError} onSuccess={() => setAuthState('authenticated')} onRetry={() => { setAuthState('loading'); void restoreSession(); }} />;
  return <SetupApp onLogout={() => { accessToken = undefined; setAuthState('anonymous'); }} />;
}

function Login({ error, onSuccess, onRetry }: { error?: string; onSuccess?: () => void; onRetry?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [message, setMessage] = useState(error ?? '');
  const [submitting, setSubmitting] = useState(false);
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const session = await apiRequest<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      accessToken = session.access_token;
      onSuccess?.();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };
  if (showPasswordReset) return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="password-reset-heading">
      <span className="auth-brand-mark">M</span>
      <div className="eyebrow">UNEENGINE WORKSPACE</div>
      <h1 id="password-reset-heading">Reset your password</h1>
      <p>Enter your account email to request a password reset.</p>
      <label className="form-label" htmlFor="reset-email">Email</label>
      <input className="form-control" id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      <div className="auth-notice" role="status">Password reset isn’t available yet. Contact your workspace administrator for help.</div>
      <button className="btn btn-brand auth-submit" type="button" disabled title="Password reset is not configured yet">Send reset link</button>
      <button className="text-action auth-back" type="button" onClick={() => setShowPasswordReset(false)}>Back to sign in</button>
    </section>
  </main>;
  return <main className="auth-screen">
    <form className="auth-card" onSubmit={(event) => void signIn(event)}>
      <span className="auth-brand-mark">M</span>
      <div className="eyebrow">UNEENGINE WORKSPACE</div>
      <h1>Welcome back</h1>
      <p>Sign in to manage your organization’s metadata and workflows.</p>
      {message && <div className="auth-error" role="alert">{message}{onRetry && <button type="button" className="text-action" onClick={onRetry}>Retry connection</button>}</div>}
      <label className="form-label" htmlFor="login-email">Email</label>
      <input className="form-control" id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
      <label className="form-label" htmlFor="login-password">Password</label>
      <input className="form-control" id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
      <button className="text-action auth-forgot" type="button" onClick={() => { setMessage(''); setShowPasswordReset(true); }}>Forgot password?</button>
      <button className="btn btn-brand auth-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}

function SetupApp({ onLogout }: { onLogout: () => void }) {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.pathname, window.location.search));
  const [currentAppId, setCurrentAppId] = useState(() => new URLSearchParams(window.location.search).get('appId') || 'Records');
  const [apps, setApps] = useState<LightningAppMetadata[]>([]);
  const [runtimeFormFactor, setRuntimeFormFactor] = useState<'Desktop' | 'Phone'>(() =>
    window.matchMedia('(max-width: 600px)').matches ? 'Phone' : 'Desktop');
  const [workspace, setWorkspace] = useState<WorkspaceId>(() => route.kind === 'setup' ? route.workspace : 'home');
  const [quickFind, setQuickFind] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [objectSearch, setObjectSearch] = useState('');
  const [objects, setObjects] = useState(objectMetadata);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [object, setObject] = useState<ObjectMetadata>(() =>
    (route.kind === 'setup' && route.objectApiName ? objectMetadata.find((item) => item.apiName === route.objectApiName) : undefined)
      ?? objectMetadata.find((item) => item.apiName === 'Account')
      ?? objectMetadata[0]
  );
  const [objectSetting, setObjectSetting] = useState(() => route.kind === 'setup' ? route.setting ?? 'Fields & Relationships' : 'Fields & Relationships');
  const [flow, setFlow] = useState<FlowDefinitionMetadata>(defaultFlow);
  const [flows, setFlows] = useState<FlowDefinitionMetadata[]>([defaultFlow]);
  const [platformEvents, setPlatformEvents] = useState<PlatformEventMetadata[]>([]);
  const [flowLogs, setFlowLogs] = useState<FlowExecutionLogMetadata[]>([]);
  const [flowLogsLoading, setFlowLogsLoading] = useState(true);
  const [flowInterviews, setFlowInterviews] = useState<FlowInterviewMetadata[]>([]);
  const [flowInterviewsLoading, setFlowInterviewsLoading] = useState(false);
  const [canManageFlows, setCanManageFlows] = useState(false);
  const [notifications, setNotifications] = useState<CustomNotificationMetadata[]>([]);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequestMetadata[]>([]);
  const [approvalBusyId, setApprovalBusyId] = useState('');
  const [approvalProcesses, setApprovalProcesses] = useState<ApprovalProcessMetadata[]>([]);
  const [canManageApprovalProcesses, setCanManageApprovalProcesses] = useState(false);
  const [namedCredentials, setNamedCredentials] = useState<NamedCredentialMetadata[]>([]);
  const [canManageNamedCredentials, setCanManageNamedCredentials] = useState(false);
  const [namedCredentialsEncryptionReady, setNamedCredentialsEncryptionReady] = useState<boolean | null>(null);
  const [emailAlerts, setEmailAlerts] = useState<EmailAlertMetadata[]>([]);
  const [connectorProviders, setConnectorProviders] = useState<ConnectorProviderMetadata[]>([]);
  const [integrationConnections, setIntegrationConnections] = useState<IntegrationConnectionMetadata[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControlMetadata>(defaultAccessControl);
  const [accessControlError, setAccessControlError] = useState('');
  const [flowValidation, setFlowValidation] = useState<FlowValidationMetadata | null>(null);
  const [flowRun, setFlowRun] = useState<{ interviewId: string; screen: FlowElementMetadata; values: Record<string, unknown>; outcomes: Array<{ name: string; label: string }>; canGoBack: boolean } | null>(null);
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
  const [kioskMode, setKioskMode] = useState(false);
  const flowHistory = useRef<{ undo: FlowDefinitionMetadata[]; redo: FlowDefinitionMetadata[] }>({ undo: [], redo: [] });
  const flowSnapshots = useRef(new Map<string, string>());
  const [page, setPage] = useState<LightningPageMetadata>(defaultLightningPage);
  const pageRouteApiName = useRef('');
  const [pages, setPages] = useState<LightningPageMetadata[]>([defaultLightningPage]);
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
  const [activeUtility, setActiveUtility] = useState<'Notes' | 'History' | null>(null);
  const [utilityNotes, setUtilityNotes] = useState<Record<string, string>>({});
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
          : `${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? route.objectApiName}${route.kind === 'record-detail' ? ' Record' : ''}`;
    setRecentRoutes((current) => current[0]?.key === key
      ? current
      : [{ key, label, route }, ...current.filter((item) => item.key !== key)].slice(0, 8));
  }, [route, objects, apps, pages]);

  // Resolve credential permissions independently of unrelated metadata requests.
  // A failed report/connector/dashboard request must not disable credential management.
  useEffect(() => {
    let active = true;
    void apiRequest<{ canManage: boolean; encryptionReady: boolean }>('/named-credentials/readiness')
      .then(({ canManage, encryptionReady }) => {
        if (active) {
          setCanManageNamedCredentials(canManage);
          setNamedCredentialsEncryptionReady(encryptionReady);
        }
      })
      .catch(() => {
        if (active) setNamedCredentialsEncryptionReady(null);
      });
    void apiRequest<{ credentials: NamedCredentialMetadata[] }>('/named-credentials')
      .then(({ credentials }) => {
        if (active) setNamedCredentials(credentials);
      })
      .catch(() => {
        // The main metadata loader reports errors; keep this permission check independent.
      });
    return () => { active = false; };
  }, [workspace]);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [objectPayload, flowPayload, platformEventPayload, pagePayload, appPayload, credentialPayload, emailAlertPayload, approvalProcessPayload, providerPayload, integrationPayload, libraryPayload, dashboardPayload, folderPayload, territoryPayload, reportFolderPayload, reportPayload, sessionPayload] = await Promise.all([
          apiRequest<{ objects: ObjectMetadata[] }>('/metadata/objects'),
          apiRequest<{ flows: FlowDefinitionMetadata[] }>('/metadata/flows'),
          apiRequest<{ platformEvents: PlatformEventMetadata[] }>('/metadata/platform-events'),
          apiRequest<{ pages: LightningPageMetadata[] }>('/metadata/pages'),
          apiRequest<{ apps: LightningAppMetadata[] }>('/metadata/apps'),
          apiRequest<{ credentials: NamedCredentialMetadata[] }>('/named-credentials'),
          apiRequest<{ emailAlerts: EmailAlertMetadata[] }>('/metadata/email-alerts'),
          apiRequest<{ approvalProcesses: ApprovalProcessMetadata[] }>('/metadata/approval-processes'),
          apiRequest<{ providers: ConnectorProviderMetadata[] }>('/connector-providers'),
          apiRequest<{ connections: IntegrationConnectionMetadata[] }>('/integration-connections'),
          apiRequest<{ components: LibraryComponentMetadata[]; canManage: boolean }>('/component-library'),
          apiRequest<{ dashboards: DashboardMetadata[]; userId: string; runningUserIds: string[]; canCreate: boolean; canManageAll: boolean; canSchedule: boolean }>('/metadata/dashboards'),
          apiRequest<{ folders: DashboardFolderMetadata[] }>('/metadata/dashboard-folders'),
          apiRequest<{ territories: DashboardTerritoryMetadata[]; canManage: boolean }>('/metadata/dashboard-territories'),
          apiRequest<{ folders: ReportFolderMetadata[]; canManageAll: boolean }>('/metadata/report-folders'),
          apiRequest<{ reports: ReportMetadata[] }>('/metadata/reports'),
          apiRequest<{ user: { profileId: string; permissions: string[]; fieldAccess: Record<string, { read: boolean; edit: boolean }>; recordTypeAccess: Record<string, boolean> } }>('/auth/me')
        ]);
        try {
          setAccessControl(await apiRequest<AccessControlMetadata>('/metadata/permissions'));
          setAccessControlError('');
        } catch (error) {
          setAccessControlError(error instanceof Error ? error.message : String(error));
        }
        if (objectPayload.objects.length) {
          setObjects(objectPayload.objects);
          setObject(objectPayload.objects.find((item) => item.apiName === object.apiName) ?? objectPayload.objects[0]);
        }
        if (flowPayload.flows.length) {
          flowSnapshots.current = new Map(flowPayload.flows.map((item) =>
            [item.apiName, JSON.stringify(item)]));
          setFlows(flowPayload.flows);
          setFlow(flowPayload.flows[0]);
          setSelectedFlowId(flowPayload.flows[0].elements[0]?.id ?? 1);
        }
        setPlatformEvents(platformEventPayload.platformEvents);
        if (pagePayload.pages.length) {
          setPages(pagePayload.pages);
          setPage(pagePayload.pages.find((item) => item.targetObject === 'Account' && item.pageType === 'Record Page') ?? pagePayload.pages[0]);
        }
        setApps(appPayload.apps);
        if (!appPayload.apps.some((app) => app.apiName === currentAppId)) {
          setCurrentAppId(appPayload.apps[0]?.apiName ?? '');
        }
        setNamedCredentials(credentialPayload.credentials);
        setEmailAlerts(emailAlertPayload.emailAlerts);
        setApprovalProcesses(approvalProcessPayload.approvalProcesses);
        setConnectorProviders(providerPayload.providers);
        setIntegrationConnections(integrationPayload.connections);
        setLibraryComponents(libraryPayload.components);
        setCanManageLibrary(libraryPayload.canManage);
        setDashboards(dashboardPayload.dashboards);
        setDashboardFolders(folderPayload.folders);
        setDashboardTerritories(territoryPayload.territories);
        setCanManageDashboardTerritories(territoryPayload.canManage);
        setReportFolders(reportFolderPayload.folders);
        setCanManageReportFolders(reportFolderPayload.canManageAll);
        setDashboardUserId(dashboardPayload.userId);
        setDashboardRunningUserIds(dashboardPayload.runningUserIds);
        setCurrentProfileId(sessionPayload.user.profileId);
        setCanManageNamedCredentials(sessionPayload.user.permissions.includes('namedCredentials:manage'));
        setCanManageApprovalProcesses(sessionPayload.user.permissions.includes('security:manage')
          || sessionPayload.user.permissions.includes('metadata:write'));
        setCanRunFlows(sessionPayload.user.permissions.includes('flows:run'));
        setCanManageFlows(sessionPayload.user.permissions.includes('flows:manage')
          || sessionPayload.user.permissions.includes('metadata:write'));
        setCurrentFieldAccess(sessionPayload.user.fieldAccess);
        setCurrentRecordTypeAccess(sessionPayload.user.recordTypeAccess);
        setCanCreateDashboards(dashboardPayload.canCreate);
        setCanManageDashboards(dashboardPayload.canManageAll);
        setCanScheduleDashboards(dashboardPayload.canSchedule);
        setReports(reportPayload.reports);
      } catch (error) {
        // 401 / session expiry just returns to Login via metadrive:session-expired —
        // don't spam a "Metadata API unavailable" toast for a normal logged-out state.
        const message = error instanceof Error ? error.message : String(error);
        if (!isAuthErrorMessage(message)) {
          setToast(`Metadata API unavailable: ${message}`);
        }
      } finally {
        setMetadataLoaded(true);
      }
    };
    void loadMetadata();
  }, []);

  useEffect(() => {
    if (workspace !== 'flow-logs') return;
    let active = true;
    setFlowLogsLoading(true);
    void apiRequest<{ logs: FlowExecutionLogMetadata[] }>('/metadata/flow-logs')
      .then((payload) => {
        if (active) setFlowLogs(payload.logs);
      })
      .catch((error) => {
        if (active) setToast(`Unable to load failed flow logs: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (active) setFlowLogsLoading(false);
      });
    return () => { active = false; };
  }, [workspace]);

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
    if (route.kind !== 'setup' || route.workspace !== 'flow-builder') return false;
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
    if (route.workspace === 'page-builder' && route.resourceApiName && pageRouteApiName.current !== route.resourceApiName) {
      pageRouteApiName.current = route.resourceApiName;
      const selectedPage = pages.find((item) => item.apiName === route.resourceApiName);
      if (selectedPage) setPage(selectedPage);
    }
  }, [route, objects, object.apiName, flows, flow.apiName, pages]);

  useEffect(() => {
    const canonicalPath = appRoutePath(route);
    if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
      window.history.replaceState({}, '', canonicalPath);
    }
  }, []);

  const navigateRoute = (nextRoute: AppRoute, skipFlowConfirmation = false) => {
    if (!skipFlowConfirmation && !confirmFlowNavigation(nextRoute)) return false;
    const routeWithApp = nextRoute.kind === 'setup' ? nextRoute : { ...nextRoute, appId: nextRoute.appId ?? currentAppId };
    const path = appRoutePath(routeWithApp);
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({}, '', path);
    setRoute(routeWithApp);
    if (routeWithApp.kind !== 'setup') setCurrentAppId(routeWithApp.appId ?? 'Records');
    return true;
  };
  useEffect(() => {
    if (route.kind !== 'setup' || route.workspace !== 'connector-settings' || connectorProviders.length === 0) return;
    const selectedProvider = connectorProviders.find((provider) => provider.connectorKey === route.resourceApiName);
    if (!selectedProvider) {
      navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: connectorProviders[0].connectorKey });
    }
  }, [route, connectorProviders]);

  const openSetupWorkspace = (nextWorkspace: WorkspaceId) => {
    const nextRoute: AppRoute = nextWorkspace === 'object-manager'
      ? { kind: 'setup', workspace: nextWorkspace, objectApiName: object.apiName, setting: objectSetting }
      : nextWorkspace === 'flow-builder'
        ? { kind: 'setup', workspace: nextWorkspace }
        : nextWorkspace === 'page-builder'
          ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: page.apiName }
          : nextWorkspace === 'report-builder'
            ? { kind: 'setup', workspace: nextWorkspace, resourceApiName: 'Opportunities_by_Stage' }
            : nextWorkspace === 'dashboard-builder'
              ? { kind: 'setup', workspace: nextWorkspace, ...(dashboards[0] ? { resourceApiName: dashboards[0].apiName } : {}) }
              : nextWorkspace === 'connector-settings'
                ? { kind: 'setup', workspace: nextWorkspace, ...(connectorProviders[0] ? { resourceApiName: connectorProviders[0].connectorKey } : {}) }
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
  const filteredSetupGroups = useMemo(() => {
    const query = quickFind.trim().toLowerCase();
    if (!query) return setupNavigation;
    return setupNavigation
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLowerCase().includes(query)
          || (item === 'Une Connectors' && connectorProviders.some((provider) =>
            `${provider.name} ${provider.connectorKey}`.toLowerCase().includes(query))))
      }))
      .filter((group) => group.items.length);
  }, [quickFind, connectorProviders]);
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
    const saved = await apiRequest<AccessControlMetadata>('/metadata/permissions', {
      method: 'PUT',
      body: JSON.stringify(nextAccessControl)
    });
    setAccessControl(saved);
    setAccessControlError('');
    notify('Access-control metadata saved');
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
  const testIntegrationConnection = async (id: string) => {
    const result = await apiRequest<{ connection: IntegrationConnectionMetadata }>(
      `/integration-connections/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    );
    setIntegrationConnections((current) => current.map((item) =>
      item.id === result.connection.id ? result.connection : item
    ));
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
      navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: provider.connectorKey });
      return;
    }
    if (item === 'Une Connectors') {
      const firstProvider = connectorProviders[0];
      if (firstProvider) navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: firstProvider.connectorKey });
      else openSetupWorkspace('connector-settings');
      return;
    }
    if (item === 'Company Information' || item === 'Currencies') {
      openSetupWorkspace('company-settings');
      return;
    }
    if (item === 'Named Credentials') {
      openSetupWorkspace('named-credentials');
      return;
    }
    if (item === 'Approval Processes') {
      openSetupWorkspace('approval-processes');
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
    if (item === 'Lightning App Builder') openSetupWorkspace('page-builder');
    else if (item === 'App Manager') openSetupWorkspace('app-manager');
    else if (item === 'Component Library') openSetupWorkspace('component-library');
    else if (item === 'Flows') openSetupWorkspace('flow-builder');
    else if (item === 'Paused and Waiting Interviews') openSetupWorkspace('flow-interviews');
    else if (item === 'Scheduled Flows') openSetupWorkspace('scheduled-flows');
    else if (item === 'Failed Flow Logs') openSetupWorkspace('flow-logs');
    else if (item === 'Reports') openSetupWorkspace('report-builder');
    else if (item === 'Dashboards') openSetupWorkspace('dashboard-builder');
    else if (['Users', 'Roles', 'Public Groups', 'Queues', 'Permission Sets', 'Permission Set Groups', 'Profiles', 'Sharing Settings', 'Sharing Rules'].includes(item)) {
      const resourceApiName = item === 'Users' ? 'Users' : item === 'Permission Set Groups' ? 'PermissionSetGroups' : item.replace(/[^A-Za-z0-9]/g, '');
      navigateRoute({ kind: 'setup', workspace: 'rbac', resourceApiName });
    } else openSetupWorkspace('home');
  };

  const addFlowElement = (type: string, afterId = selectedFlowId) => {
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
      'Screen': { fields: [] },
      'Action': { actionType: '', inputValues: [] },
      'HTTP Callout': { method: 'GET', namedCredentialId: '', path: '', headers: '', body: '', responseVariable: '', statusVariable: '' },
      'Subflow': { flowApiName: '', inputValues: [] }
    };
    const next = { id: nextId, type, label, config: defaults[type] ?? {} };
    const insertAfter = Math.max(flow.elements.findIndex((item) => item.id === afterId), 0);
    const previous = flow.elements[insertAfter];
    const following = flow.elements[insertAfter + 1];
    const retainedConnectors = flow.connectors.filter((connector) => !(connector.from === previous?.id && connector.to === following?.id));
    commitFlow({
      ...flow,
      elements: [...flow.elements.slice(0, insertAfter + 1), next, ...flow.elements.slice(insertAfter + 1)],
      connectors: [
        ...retainedConnectors,
        { id: `connector-${crypto.randomUUID()}`, from: previous?.id ?? 1, to: nextId, label: '', kind: 'normal' as const },
        ...(following ? [{ id: `connector-${crypto.randomUUID()}`, from: nextId, to: following.id, label: '', kind: 'normal' as const }] : [])
      ]
    });
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
    if (flow.elements.find((item) => item.id === id)?.type === 'Start') {
      notify('The Start element cannot be removed');
      return;
    }
    const incoming = flow.connectors.filter((connector) => connector.to === id);
    const outgoing = flow.connectors.filter((connector) => connector.from === id);
    const remaining = flow.elements.filter((item) => item.id !== id);
    const connectors = flow.connectors.filter((connector) => connector.from !== id && connector.to !== id);
    for (const source of incoming) {
      for (const target of outgoing) {
        if (source.from !== target.to && !connectors.some((connector) => connector.from === source.from && connector.to === target.to)) {
          connectors.push({ id: `connector-${crypto.randomUUID()}`, from: source.from, to: target.to, label: source.label || target.label, kind: target.kind });
        }
      }
    }
    commitFlow({ ...flow, elements: remaining, connectors });
    setSelectedFlowId(incoming[0]?.from ?? remaining[0]?.id ?? 1);
  };

  const validateNewFieldFormula = async (): Promise<boolean> => {
    if (!object || !newFieldFormula.trim()) {
      setNewFieldFormulaValidation({ status: 'invalid', message: 'Enter a formula expression first.' });
      return false;
    }
    setNewFieldFormulaValidation({ status: 'checking', message: 'Checking formula…' });
    try {
      await apiRequest<{ valid: true }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/formulas/validate`, {
        method: 'POST',
        body: JSON.stringify({ expression: newFieldFormula.trim(), returnType: newFieldReturnType })
      });
      setNewFieldFormulaValidation({ status: 'valid', message: 'Formula syntax and field references are valid.' });
      return true;
    } catch (error) {
      setNewFieldFormulaValidation({
        status: 'invalid',
        message: error instanceof Error ? error.message : 'Unable to validate formula'
      });
      return false;
    }
  };

  const insertFormulaText = (snippet: string) => {
    const editor = formulaEditorRef.current;
    const start = editor?.selectionStart ?? newFieldFormula.length;
    const end = editor?.selectionEnd ?? start;
    const nextFormula = `${newFieldFormula.slice(0, start)}${snippet}${newFieldFormula.slice(end)}`;
    setNewFieldFormula(nextFormula);
    setNewFieldFormulaValidation({ status: 'idle', message: '' });
    window.requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const resetNewFieldDraft = () => {
    setNewFieldType('Text');
    setNewFieldStage(0);
    setNewFieldLabel('');
    setNewFieldTextLength(255);
    setNewFieldPrecision(18);
    setNewFieldScale(0);
    setNewFieldDescription('');
    setNewFieldHelpText('');
    setNewFieldDefaultValue('');
    setNewFieldHasDefault(false);
    setNewFieldFormula('');
    setNewFieldFormulaValidation({ status: 'idle', message: '' });
    setNewFieldPicklistValues('');
    setNewFieldPicklistRestricted(true);
    setNewFieldControllerApiName('');
    setNewFieldValueSettings({});
    setNewFieldRelationshipTarget('');
    setNewFieldRelationshipName('');
    setNewFieldChildRelationshipName('');
    setNewFieldDeleteBehavior('Clear');
    setNewFieldAllowReparenting(false);
    setNewFieldLookupFilters([]);
    setNewFieldLookupFilterLogic('All');
    setNewFieldRequired(false);
    setNewFieldUnique(false);
    setNewFieldExternalId(false);
    setNewFieldCaseSensitive(false);
    setNewFieldLayoutIds([]);
  };

  const newFieldApiName = `${newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}__c`;
  const newFieldPicklistOptions = newFieldPicklistValues.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const newFieldController = object.fields.find((field) => field.apiName === newFieldControllerApiName);
  const newFieldControllerValues = newFieldController?.dataType === 'Checkbox'
    ? ['true', 'false']
    : newFieldController?.picklistValues ?? [];
  const newFieldDefaultError = (() => {
    if (!newFieldHasDefault) return '';
    if (['Number', 'Currency', 'Percent'].includes(newFieldType)) {
      const value = Number(newFieldDefaultValue);
      const fraction = newFieldDefaultValue.split('.')[1] ?? '';
      if (!Number.isFinite(value) || fraction.length > newFieldScale || Math.abs(value) >= 10 ** (newFieldPrecision - newFieldScale)) {
        return 'The default value exceeds this field’s precision or scale.';
      }
    }
    if (newFieldType === 'Text' && newFieldDefaultValue.length > newFieldTextLength) return 'The default value exceeds the configured text length.';
    if (['Picklist', 'Multi-Select Picklist'].includes(newFieldType)) {
      const values = newFieldType === 'Multi-Select Picklist' ? newFieldDefaultValue.split(';') : [newFieldDefaultValue];
      if (values.some((value) => !newFieldPicklistOptions.includes(value))
        || (newFieldType === 'Multi-Select Picklist' && new Set(values).size !== values.length)) {
        return 'Choose distinct configured values for the default.';
      }
    }
    if (newFieldType === 'Email' && newFieldDefaultValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newFieldDefaultValue)) return 'Enter a valid email default.';
    if (newFieldType === 'URL' && newFieldDefaultValue) {
      try {
        if (!['http:', 'https:'].includes(new URL(newFieldDefaultValue).protocol)) return 'Enter a valid HTTP or HTTPS URL default.';
      } catch {
        return 'Enter a valid HTTP or HTTPS URL default.';
      }
    }
    if (newFieldType === 'Date' && newFieldDefaultValue) {
      const date = new Date(`${newFieldDefaultValue}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newFieldDefaultValue) || !Number.isFinite(date.getTime())
        || date.toISOString().slice(0, 10) !== newFieldDefaultValue) return 'Enter a valid date default.';
    }
    if (newFieldType === 'Date/Time' && newFieldDefaultValue
      && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.test(newFieldDefaultValue)
        || !Number.isFinite(Date.parse(newFieldDefaultValue)))) return 'Enter a valid date and time default.';
    return '';
  })();
  const newFieldConfigurationError = !newFieldLabel.trim()
    ? 'Enter a field label.'
    : !/^[A-Za-z][A-Za-z0-9_]*__c$/.test(newFieldApiName)
      ? 'The field label must produce a valid custom field name.'
      : object.fields.some((field) => field.apiName.toLocaleLowerCase() === newFieldApiName.toLocaleLowerCase())
        ? 'A field with this name already exists.'
        : newFieldType === 'Text' && (!Number.isInteger(newFieldTextLength) || newFieldTextLength < 1 || newFieldTextLength > 255)
          ? 'Text length must be between 1 and 255.'
          : ['Number', 'Currency', 'Percent'].includes(newFieldType)
            && (!Number.isInteger(newFieldPrecision) || newFieldPrecision < 1 || newFieldPrecision > 18
              || !Number.isInteger(newFieldScale) || newFieldScale < 0 || newFieldScale > newFieldPrecision)
              ? 'Precision must be 1–18 and scale must be between 0 and precision.'
              : newFieldType === 'Formula' && !newFieldFormula.trim()
                ? 'Enter a formula expression.'
                : ['Picklist', 'Multi-Select Picklist'].includes(newFieldType)
                  && (newFieldPicklistOptions.length === 0
                    || new Set(newFieldPicklistOptions.map((value) => value.toLocaleLowerCase())).size !== newFieldPicklistOptions.length)
                    ? 'Enter at least one unique picklist value.'
                    : newFieldType === 'Multi-Select Picklist' && newFieldPicklistOptions.some((value) => value.includes(';'))
                      ? 'Multi-select picklist values cannot contain semicolons.'
                      : Boolean(newFieldControllerApiName)
                        && (!newFieldController || !newFieldControllerValues.length)
                          ? 'Choose a controlling field with configured values.'
                          : ['Lookup Relationship', 'Master-Detail Relationship'].includes(newFieldType) && !newFieldRelationshipTarget
                            ? 'Select a related object.'
                            : ['Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType)
                              && !/^[A-Za-z][A-Za-z0-9_]*$/.test(newFieldRelationshipName.trim()
                                || newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, ''))
                              ? 'Enter a valid relationship name using letters, numbers, and underscores.'
                              : ['Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType)
                                && !/^[A-Za-z][A-Za-z0-9_]*$/.test(newFieldChildRelationshipName.trim()
                                  || `${object.apiName.replace(/__c$/, '')}Records`)
                                ? 'Enter a valid child relationship name using letters, numbers, and underscores.'
                            : newFieldLookupFilters.some((filter) =>
                              !filter.relatedFieldApiName
                              || (filter.operator !== 'Is Null' && filter.operator !== 'Is Not Null'
                                && filter.valueMode === 'Field' && !filter.valueFieldApiName))
                              ? 'Complete each lookup filter or remove it before continuing.'
                              : newFieldDefaultError;

  const addField = async () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    const apiName = newFieldApiName;
    const relationshipType = newFieldType === 'Lookup Relationship' ? 'Lookup'
      : newFieldType === 'Master-Detail Relationship' ? 'Master-Detail'
        : newFieldType === 'Hierarchical Relationship' ? 'Hierarchical' : undefined;
    const relationshipTarget = relationshipType === 'Hierarchical' ? 'User' : newFieldRelationshipTarget;
    const relationshipName = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const dataType = newFieldType === 'Formula'
      ? `Formula(${newFieldReturnType})`
      : relationshipType
        ? `${relationshipType === 'Hierarchical' ? 'Lookup' : relationshipType}(${relationshipTarget})`
        : newFieldType === 'Text' ? `Text(${newFieldTextLength})`
          : ['Number', 'Currency', 'Percent'].includes(newFieldType) ? `${newFieldType}(${newFieldPrecision}, ${newFieldScale})`
            : newFieldType;
    const field = {
      apiName,
      label,
      dataType,
      required: newFieldType === 'Master-Detail Relationship' || (newFieldType !== 'Formula' && newFieldRequired),
      unique: newFieldType !== 'Formula' && newFieldType !== 'Long Text Area' && newFieldType !== 'Geolocation' && !relationshipType && newFieldUnique,
      ...(newFieldExternalId ? { externalId: true } : {}),
      ...(newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType)
        ? { caseSensitive: newFieldCaseSensitive }
        : {}),
      ...(newFieldDescription.trim() ? { description: newFieldDescription.trim() } : {}),
      ...(newFieldHelpText.trim() ? { helpText: newFieldHelpText.trim() } : {}),
      ...(newFieldType === 'Formula' ? { formula: { expression: newFieldFormula.trim(), returnType: newFieldReturnType } } : {}),
      ...(['Picklist', 'Multi-Select Picklist'].includes(newFieldType) ? {
        picklistValues: newFieldPicklistOptions,
        picklistRestricted: newFieldPicklistRestricted,
        ...(newFieldControllerApiName ? {
          controllerFieldApiName: newFieldControllerApiName,
          valueSettings: newFieldValueSettings
        } : {})
      } : {}),
      ...(newFieldHasDefault ? {
        defaultValue: newFieldType === 'Checkbox'
          ? newFieldDefaultValue === 'true'
          : ['Number', 'Currency', 'Percent'].includes(newFieldType)
            ? Number(newFieldDefaultValue)
            : newFieldDefaultValue
      } : {}),
      ...(relationshipType ? { relationship: {
        type: relationshipType,
        targetObject: relationshipTarget,
        relationshipName: newFieldRelationshipName.trim() || relationshipName,
        childRelationshipName: newFieldChildRelationshipName.trim() || `${object.apiName.replace(/__c$/, '')}Records`,
        ...(relationshipType === 'Lookup' ? {
          deleteBehavior: newFieldRequired ? 'Restrict' : newFieldDeleteBehavior
        } : {}),
        ...(relationshipType === 'Master-Detail' ? { allowReparenting: newFieldAllowReparenting } : {})
      } } : {})
    };
    try {
      if (newFieldType === 'Formula' && !await validateNewFieldFormula()) return;
      const lookupFilters: RelatedLookupFilterMetadata[] = relationshipType
        ? newFieldLookupFilters.map((filter) => {
          const isNullOperator = filter.operator === 'Is Null' || filter.operator === 'Is Not Null';
          return {
            id: `lookup-filter-${crypto.randomUUID()}`,
            fieldApiName: apiName,
            relatedObject: relationshipTarget,
            relatedFieldApiName: filter.relatedFieldApiName,
            operator: filter.operator,
            value: filter.valueMode === 'Value' && !isNullOperator ? filter.value : '',
            ...(filter.valueMode === 'Field' && !isNullOperator && filter.valueFieldApiName
              ? { valueFieldApiName: filter.valueFieldApiName }
              : {}),
            required: filter.required
          };
        })
        : [];
      const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/fields`, {
        method: 'POST',
        body: JSON.stringify({
          field,
          pageLayoutIds: newFieldLayoutIds,
          ...(lookupFilters.length ? { relatedLookupFilters: lookupFilters } : {}),
          ...(lookupFilters.length && newFieldLookupFilterLogic === 'Any'
            ? { relatedLookupFilterLogic: { [apiName]: newFieldLookupFilterLogic } }
            : {})
        })
      });
      setObject(payload.object);
      setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
      setShowNewField(false);
      resetNewFieldDraft();
      notify(`${label} field saved to ${object.label}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save field');
    }
  };

  const saveObject = async (nextObject: ObjectMetadata) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(nextObject.apiName)}`, {
      method: 'PUT',
      body: JSON.stringify(nextObject)
    });
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    notify(`${payload.object.label} configuration saved`);
  };

  const refreshObject = async (apiName: string) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(apiName)}`);
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    return payload.object;
  };

  const deleteObject = async (apiName: string) => {
    await apiRequest<void>(`/metadata/objects/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    const remaining = objects.filter((item) => item.apiName !== apiName);
    setObjects(remaining);
    if (remaining[0]) setObject(remaining[0]);
    setObjectSetting('Details');
    if (route.kind === 'setup' && route.workspace === 'object-manager' && route.objectApiName === apiName && remaining[0]) {
      navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: remaining[0].apiName, setting: 'Details' });
    }
    notify('Custom object deleted');
  };

  const saveField = async (field: FieldMetadata) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/fields/${encodeURIComponent(field.apiName)}`, {
      method: 'PUT',
      body: JSON.stringify(field)
    });
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    notify(`${field.label} field saved`);
    return payload.object;
  };

  const deleteField = async (apiName: string) => {
    const payload = await apiRequest<{ object: ObjectMetadata }>(`/metadata/objects/${encodeURIComponent(object.apiName)}/fields/${encodeURIComponent(apiName)}`, {
      method: 'DELETE'
    });
    setObject(payload.object);
    setObjects((current) => current.map((item) => item.apiName === payload.object.apiName ? payload.object : item));
    notify('Custom field deleted');
    return payload.object;
  };

  const createObject = async () => {
    const label = newObjectLabel.trim();
    const pluralLabel = newObjectPluralLabel.trim();
    if (!label || !pluralLabel) return;
    const objectName = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!objectName) {
      notify('Object label must contain at least one letter or number');
      return;
    }
    if (newObjectSettings.recordNameType === 'Auto Number' && !newObjectSettings.recordNameFormat.trim()) {
      notify('Enter a display format for the auto-number record name');
      return;
    }
    const apiName = `${objectName}__c`;
    const shouldLaunchTabWizard = launchCustomTabWizard;
    try {
      const payload = await apiRequest<{ object: ObjectMetadata }>('/metadata/objects', {
        method: 'POST',
        body: JSON.stringify({
          apiName, label, pluralLabel, kind: 'Custom Object',
          description: newObjectDescription.trim(),
          settings: newObjectSettings,
          fields: [{ apiName: 'Name', label: newObjectRecordNameLabel.trim() || `${label} Name`, dataType: newObjectSettings.recordNameType === 'Auto Number' ? 'AutoNumber' : 'Text(80)', required: true, unique: false }]
        })
      });
      setObjects((current) => [...current, payload.object]);
      setObject(payload.object);
      setObjectSetting('Details');
      navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: payload.object.apiName, setting: 'Details' });
      setShowNewObject(false);
      setNewObjectLabel('');
      setNewObjectPluralLabel('');
      setNewObjectDescription('');
      setNewObjectRecordNameLabel('');
      setLaunchCustomTabWizard(false);
      setNewObjectSettings({
        allowReports: true,
        allowActivities: false,
        trackFieldHistory: false,
        allowInChatter: false,
        deploymentStatus: 'In Development',
        recordNameType: 'Text',
        recordNameFormat: ''
      });
      if (shouldLaunchTabWizard) {
        setCustomTabObject(payload.object);
        setCustomTabStyle('Blue');
        setShowCustomTabWizard(true);
      }
      notify(`${label} object created`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to create object');
    }
  };

  const saveCustomTab = async () => {
    if (!customTabObject) return;
    try {
      await saveObject({ ...customTabObject, customTab: { style: customTabStyle } });
      setShowCustomTabWizard(false);
      setCustomTabObject(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save custom tab');
    }
  };

  const saveFlow = async (nextFlow: FlowDefinitionMetadata) => {
    try {
      const payload = await apiRequest<{ flow: FlowDefinitionMetadata }>(`/metadata/flows/${encodeURIComponent(nextFlow.apiName)}`, {
        method: 'PUT', body: JSON.stringify(nextFlow)
      });
      flowSnapshots.current.set(payload.flow.apiName, JSON.stringify(payload.flow));
      setFlow(payload.flow);
      flowHistory.current = { undo: [], redo: [] };
      setFlows((current) => current.some((item) => item.apiName === payload.flow.apiName)
        ? current.map((item) => item.apiName === payload.flow.apiName ? payload.flow : item)
        : [...current, payload.flow]);
      setFlowValidation(null);
      notify('Flow saved');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save flow');
    }
  };

  const saveNamedCredential = async (credential: {
    id?: string; name: string; label: string; protocol: NamedCredentialMetadata['protocol']; baseUrl: string;
    authType: NamedCredentialMetadata['authType']; headerName?: string; username?: string; secret?: string;
  }) => {
    const { id, ...body } = credential;
    const result = await apiRequest<{ credential: NamedCredentialMetadata }>(
      id ? `/named-credentials/${encodeURIComponent(id)}` : '/named-credentials',
      { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );
    setNamedCredentials((current) => current.some((item) => item.id === result.credential.id)
      ? current.map((item) => item.id === result.credential.id ? result.credential : item)
      : [...current, result.credential]);
    notify(`Named Credential ${id ? 'updated' : 'created'}`);
  };

  const deleteNamedCredential = async (id: string) => {
    await apiRequest<void>(`/named-credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setNamedCredentials((current) => current.filter((item) => item.id !== id));
    notify('Named Credential deleted');
  };

  const testNamedCredential = async (id: string): Promise<{ connected: boolean; status?: number; message: string }> => {
    return apiRequest<{ connected: boolean; status?: number; message: string }>(
      `/named-credentials/${encodeURIComponent(id)}/test`, { method: 'POST' }
    );
  };

  const rotateNamedCredential = async (id: string) => {
    const result = await apiRequest<{ credential: NamedCredentialMetadata }>(`/named-credentials/${encodeURIComponent(id)}/rotate`, { method: 'POST' });
    setNamedCredentials((current) => current.map((item) => item.id === id ? result.credential : item));
    notify('Named Credential encryption key rotated');
  };

  const saveEmailAlert = async (alert: {
    id?: string; name: string; label: string; objectApiName: string; namedCredentialId: string;
    fromEmail: string; recipients: string; subject: string; body: string;
  }) => {
    const { id, ...body } = alert;
    const result = await apiRequest<{ emailAlert: EmailAlertMetadata }>(
      id ? `/metadata/email-alerts/${encodeURIComponent(id)}` : '/metadata/email-alerts',
      { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );
    setEmailAlerts((current) => current.some((item) => item.id === result.emailAlert.id)
      ? current.map((item) => item.id === result.emailAlert.id ? result.emailAlert : item)
      : [...current, result.emailAlert]);
    notify(`Email Alert ${id ? 'updated' : 'created'}`);
  };

  const deleteEmailAlert = async (id: string) => {
    await apiRequest<void>(`/metadata/email-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setEmailAlerts((current) => current.filter((item) => item.id !== id));
    notify('Email Alert deleted');
  };

  const savePlatformEvent = async (platformEvent: PlatformEventMetadata) => {
    const result = await apiRequest<{ platformEvent: PlatformEventMetadata }>(
      `/metadata/platform-events/${encodeURIComponent(platformEvent.apiName)}`,
      { method: 'PUT', body: JSON.stringify(platformEvent) }
    );
    setPlatformEvents((current) => current.some((item) => item.apiName === result.platformEvent.apiName)
      ? current.map((item) => item.apiName === result.platformEvent.apiName ? result.platformEvent : item)
      : [...current, result.platformEvent]);
    notify(`Platform Event ${platformEvent.apiName} saved`);
  };

  const deletePlatformEvent = async (apiName: string) => {
    await apiRequest<void>(`/metadata/platform-events/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setPlatformEvents((current) => current.filter((item) => item.apiName !== apiName));
    notify('Platform Event deleted');
  };

  const saveApprovalProcess = async (process: ApprovalProcessInput) => {
    const result = await apiRequest<{ approvalProcess: ApprovalProcessMetadata }>(
      `/metadata/approval-processes/${encodeURIComponent(process.apiName)}`,
      { method: 'PUT', body: JSON.stringify(process) }
    );
    setApprovalProcesses((current) => current.some((item) => item.apiName === result.approvalProcess.apiName)
      ? current.map((item) => item.apiName === result.approvalProcess.apiName ? result.approvalProcess : item)
      : [...current, result.approvalProcess]);
    notify('Approval process saved');
  };

  const deleteApprovalProcess = async (apiName: string) => {
    await apiRequest<void>(`/metadata/approval-processes/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setApprovalProcesses((current) => current.filter((item) => item.apiName !== apiName));
    notify('Approval process deleted');
  };

  const validateFlow = async (nextFlow: FlowDefinitionMetadata) => {
    try {
      const result = await apiRequest<FlowValidationMetadata>(`/metadata/flows/${encodeURIComponent(nextFlow.apiName)}/validate`, {
        method: 'POST',
        body: JSON.stringify(nextFlow)
      });
      setFlowValidation(result);
      if (result.valid) notify(result.warnings.length ? 'Flow is valid with warnings' : 'Flow validation passed');
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to validate flow');
      return null;
    }
  };

  const openFlowDebug = () => {
    const savedSnapshot = flowSnapshots.current.get(flow.apiName);
    if (!savedSnapshot) {
      notify('Save the flow before debugging it');
      return;
    }
    let savedFlow: FlowDefinitionMetadata;
    try {
      savedFlow = JSON.parse(savedSnapshot) as FlowDefinitionMetadata;
    } catch {
      notify('The saved Flow version could not be read for debugging');
      return;
    }
    if (savedSnapshot !== JSON.stringify(flow)) {
      notify('Debug uses the most recently saved version; unsaved changes are not included.');
    }
    const inputs = Object.fromEntries(savedFlow.resources
      .filter((resource) => resource.availableForInput)
      .map((resource) => [resource.name, resource.value === undefined
        ? ''
        : typeof resource.value === 'string' ? resource.value : JSON.stringify(resource.value)]));
    setFlowDebug({ flow: savedFlow, mode: 'debug', inputs, error: '', running: false });
  };

  const parseFlowInputs = (flowDefinition: FlowDefinitionMetadata, rawInputs: Record<string, string>) => {
    const inputs: Record<string, unknown> = {};
    for (const resource of flowDefinition.resources.filter((item) => item.availableForInput)) {
      const rawValue = rawInputs[resource.name] ?? '';
      if (!rawValue.trim()) {
        if (['Text', 'String', 'Email', 'Phone', 'URL'].includes(resource.dataType)) inputs[resource.name] = '';
        continue;
      }
      const normalizedType = resource.dataType.toLocaleLowerCase();
      if (['number', 'currency', 'percent'].some((type) => normalizedType.startsWith(type))) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) throw new Error(`Enter a valid number for ${resource.label}.`);
        inputs[resource.name] = value;
      } else if (['boolean', 'checkbox'].includes(normalizedType)) {
        if (!['true', 'false'].includes(rawValue.toLocaleLowerCase())) {
          throw new Error(`Enter true or false for ${resource.label}.`);
        }
        inputs[resource.name] = rawValue.toLocaleLowerCase() === 'true';
      } else if (['Record', 'Record Collection'].includes(resource.type) || normalizedType === 'json') {
        try {
          inputs[resource.name] = JSON.parse(rawValue) as unknown;
        } catch {
          throw new Error(`Enter valid JSON for ${resource.label}.`);
        }
      } else if (normalizedType === 'multi-select picklist') {
        let values: unknown;
        try {
          values = JSON.parse(rawValue) as unknown;
        } catch {
          throw new Error(`Enter a JSON array of selected values for ${resource.label}.`);
        }
        if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
          throw new Error(`Enter a JSON array of text values for ${resource.label}.`);
        }
        inputs[resource.name] = values;
      } else if (normalizedType === 'date/time' || normalizedType === 'datetime') {
        const parsedDate = new Date(rawValue);
        if (!Number.isFinite(parsedDate.getTime())) throw new Error(`Enter a valid date and time for ${resource.label}.`);
        inputs[resource.name] = parsedDate.toISOString();
      } else {
        inputs[resource.name] = rawValue;
      }
    }
    return inputs;
  };

  const runFlowDebug = async () => {
    if (!flowDebug) return;
    try {
      const inputs = parseFlowInputs(flowDebug.flow, flowDebug.inputs);
      setFlowDebug((current) => current ? { ...current, error: '', running: true, result: undefined } : current);
      const result = await apiRequest<Record<string, unknown>>(
        `/flows/${encodeURIComponent(flowDebug.flow.apiName)}/${flowDebug.mode === 'debug' ? 'debug' : 'execute'}`,
        { method: 'POST', body: JSON.stringify(inputs) }
      );
      if (flowDebug.mode === 'run') {
        const interviewId = typeof result.interviewId === 'string' ? result.interviewId : '';
        const screen = result.screen as FlowElementMetadata | undefined;
        if (interviewId && screen) {
          setFlowRun({
            interviewId, screen,
            values: { ...initialScreenValues(screen), ...(result.values as Record<string, unknown> | undefined) },
            outcomes: (result.outcomes as Array<{ name: string; label: string }> | undefined)
              ?? [{ name: 'Default', label: 'Next' }],
            canGoBack: false
          });
        } else {
          notify(`Flow completed${result.outputs && typeof result.outputs === 'object' && Object.keys(result.outputs).length
            ? ` · ${JSON.stringify(result.outputs)}` : ''}`);
        }
        setFlowDebug(null);
        return;
      }
      setFlowDebug((current) => current ? { ...current, result, running: false } : current);
    } catch (error) {
      const responseBody = error instanceof ApiRequestError
        && typeof error.responseBody === 'object' && error.responseBody !== null
        ? error.responseBody as Record<string, unknown>
        : undefined;
      setFlowDebug((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : 'Flow debug failed',
        result: responseBody && Array.isArray(responseBody.debugTrace) ? responseBody : undefined,
        running: false
      } : current);
    }
  };

  const runFlow = async (apiName = flow.apiName) => {
    const selectedFlow = flows.find((item) => item.apiName === apiName);
    if (!selectedFlow) {
      notify(`Flow "${apiName}" was not found`);
      return;
    }
    const savedSnapshot = flowSnapshots.current.get(apiName);
    if (!savedSnapshot) {
      notify('Save the flow before running it');
      return;
    }
    const hasUnsavedChanges = savedSnapshot !== JSON.stringify(selectedFlow);
    if (hasUnsavedChanges) notify('Running the most recently saved version; unsaved changes are not included.');
    const inputResources = selectedFlow.resources.filter((resource) => resource.availableForInput);
    if (inputResources.length) {
      const inputs = Object.fromEntries(inputResources.map((resource) => [resource.name, resource.value === undefined
        ? ''
        : typeof resource.value === 'string' ? resource.value : JSON.stringify(resource.value)]));
      setFlowDebug({ flow: selectedFlow, mode: 'run', inputs, error: '', running: false });
      return;
    }
    try {
      const result = await apiRequest<{ outputs?: Record<string, unknown>; interviewId?: string; screen?: FlowElementMetadata; outcomes?: Array<{ name: string; label: string }>; values?: Record<string, unknown> }>(`/flows/${encodeURIComponent(selectedFlow.apiName)}/execute`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (result.interviewId && result.screen) {
        setFlowRunnerError('');
        setFlowRun({ interviewId: result.interviewId, screen: result.screen, values: { ...initialScreenValues(result.screen), ...(result.values ?? {}) }, outcomes: result.outcomes ?? [{ name: 'Default', label: 'Next' }], canGoBack: false });
        return;
      }
      notify(`Flow completed${result.outputs && Object.keys(result.outputs).length ? ` · ${JSON.stringify(result.outputs)}` : ''}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to run flow');
    }
  };

  const submitFlowScreen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flowRun) return;
    setFlowRunnerSubmitting(true);
    try {
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const selectedOutcome = submitter instanceof HTMLButtonElement ? submitter.value : '';
      const result = await apiRequest<{ completed?: boolean; outputs?: Record<string, unknown>; interviewId?: string; screen?: FlowElementMetadata; outcomes?: Array<{ name: string; label: string }>; canGoBack?: boolean; values?: Record<string, unknown> }>(`/flow-interviews/${encodeURIComponent(flowRun.interviewId)}/next`, {
        method: 'POST',
        body: JSON.stringify({ values: flowRun.values, ...(selectedOutcome ? { outcome: selectedOutcome } : {}) })
      });
      if (result.interviewId && result.screen) {
        setFlowRunnerError('');
        setFlowRun({
          interviewId: result.interviewId,
          screen: result.screen,
          values: { ...initialScreenValues(result.screen), ...(result.values ?? {}) },
          outcomes: result.outcomes ?? [{ name: 'Default', label: 'Next' }],
          canGoBack: result.canGoBack === true
        });
        return;
      }
      setFlowRun(null);
      setFlowRunnerError('');
      notify(`Flow completed${result.outputs && Object.keys(result.outputs).length ? ` · ${JSON.stringify(result.outputs)}` : ''}`);
    } catch (error) {
      setFlowRunnerError(error instanceof Error ? error.message : 'Unable to continue flow');
      notify(error instanceof Error ? error.message : 'Unable to continue flow');
    } finally {
      setFlowRunnerSubmitting(false);
    }
  };

  const goBackFlowScreen = async () => {
    if (!flowRun || !flowRun.canGoBack) return;
    setFlowRunnerSubmitting(true);
    try {
      const result = await apiRequest<{ interviewId: string; screen: FlowElementMetadata; outcomes?: Array<{ name: string; label: string }>; canGoBack?: boolean; values?: Record<string, unknown> }>(
        `/flow-interviews/${encodeURIComponent(flowRun.interviewId)}/next`,
        { method: 'POST', body: JSON.stringify({ action: 'back' }) }
      );
      setFlowRun({
        interviewId: result.interviewId,
        screen: result.screen,
        values: { ...initialScreenValues(result.screen), ...(result.values ?? {}) },
        outcomes: result.outcomes ?? [{ name: 'Default', label: 'Next' }],
        canGoBack: result.canGoBack === true
      });
      setFlowRunnerError('');
    } catch (error) {
      setFlowRunnerError(error instanceof Error ? error.message : 'Unable to return to the previous screen');
      notify(error instanceof Error ? error.message : 'Unable to return to the previous screen');
    } finally {
      setFlowRunnerSubmitting(false);
    }
  };

  const createFlow = (label: string, flowType: FlowDefinitionMetadata['flowType']) => {
    const cleanLabel = label.trim();
    const apiName = cleanLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'New_Flow';
    if (flows.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      notify('A flow with this API name already exists');
      return;
    }
    const destination: AppRoute = { kind: 'setup', workspace: 'flow-builder', resourceApiName: apiName };
    if (!confirmFlowNavigation(destination)) return;
    const triggerObject = flowType === 'Platform Event-Triggered Flow'
      ? platformEvents[0]?.apiName ?? null
      : flowType === 'Record-Triggered Flow' || flowType === 'Schedule-Triggered Flow'
        ? objects.find((item) => item.apiName !== 'User')?.apiName ?? null
        : null;
    const startConfig: Record<string, unknown> = flowType === 'Schedule-Triggered Flow'
      ? { startDate: '', startTime: '', frequency: '', entryConditions: [] }
      : flowType === 'Platform Event-Triggered Flow'
        ? { entryConditions: [] }
        : flowType === 'Record-Triggered Flow'
          ? { trigger: 'created-or-updated', runWhen: 'after-save', entryConditions: [] }
          : {};
    const created: FlowDefinitionMetadata = {
      apiName,
      label: cleanLabel,
      flowType,
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      triggerObject,
      startConfig,
      elements: [{ id: 1, type: 'Start', label: `${flowType} Start`, config: { ...startConfig, ...(triggerObject ? { object: triggerObject } : {}) } }],
      connectors: [],
      resources: [],
      versions: []
    };
    setFlow(created);
    flowHistory.current = { undo: [], redo: [] };
    setFlows((current) => [...current, created]);
    setSelectedFlowId(1);
    setFlowValidation(null);
    navigateRoute(destination, true);
  };

  const cloneFlow = async (source: FlowDefinitionMetadata) => {
    if (!confirmDiscardFlowChanges()) return;
    const baseApiName = `${source.apiName}_Copy`;
    let apiName = baseApiName;
    let suffix = 2;
    while (flows.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      apiName = `${baseApiName}_${suffix}`;
      suffix += 1;
    }
    const cloned: FlowDefinitionMetadata = {
      ...structuredClone(source),
      apiName,
      label: `${source.label} Copy`,
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      versions: []
    };
    try {
      const result = await apiRequest<{ flow: FlowDefinitionMetadata }>(
        `/metadata/flows/${encodeURIComponent(apiName)}`,
        { method: 'PUT', body: JSON.stringify(cloned) }
      );
      flowSnapshots.current.set(result.flow.apiName, JSON.stringify(result.flow));
      setFlow(result.flow);
      setFlows((current) => [...current, result.flow]);
      flowHistory.current = { undo: [], redo: [] };
      setSelectedFlowId(result.flow.elements[0]?.id ?? 1);
      setFlowValidation(null);
      navigateRoute({ kind: 'setup', workspace: 'flow-builder', resourceApiName: result.flow.apiName }, true);
      notify('Flow cloned as a new draft');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to clone flow');
    }
  };

  const deactivateFlow = async (apiName: string) => {
    if (flow.apiName === apiName && !confirmDiscardFlowChanges()) return;
    try {
      const result = await apiRequest<{ flow: FlowDefinitionMetadata }>(
        `/metadata/flows/${encodeURIComponent(apiName)}/deactivate`,
        { method: 'POST' }
      );
      flowSnapshots.current.set(result.flow.apiName, JSON.stringify(result.flow));
      setFlows((current) => current.map((item) => item.apiName === apiName ? result.flow : item));
      if (flow.apiName === apiName) setFlow(result.flow);
      setFlowValidation(null);
      notify('Flow deactivated');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to deactivate flow');
    }
  };

  const deleteFlow = async (apiName: string) => {
    const candidate = flows.find((item) => item.apiName === apiName);
    if (!candidate || !window.confirm(`Delete flow "${candidate.label}"? This cannot be undone.`)) return;
    try {
      await apiRequest<void>(`/metadata/flows/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
      flowSnapshots.current.delete(apiName);
      const remaining = flows.filter((item) => item.apiName !== apiName);
      setFlows(remaining);
      if (flow.apiName === apiName) {
        const nextFlow = remaining[0] ?? defaultFlow;
        setFlow(nextFlow);
        flowHistory.current = { undo: [], redo: [] };
        setSelectedFlowId(nextFlow.elements[0]?.id ?? 1);
        setFlowValidation(null);
        navigateRoute(remaining.length
          ? { kind: 'setup', workspace: 'flow-builder', resourceApiName: nextFlow.apiName }
          : { kind: 'setup', workspace: 'flow-builder' }, true);
      }
      notify('Flow deleted');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to delete flow');
    }
  };

  const selectFlow = (apiName: string) => {
    const selectedFlow = flows.find((item) => item.apiName === apiName);
    if (!selectedFlow) return;
    const destination: AppRoute = { kind: 'setup', workspace: 'flow-builder', resourceApiName: selectedFlow.apiName };
    if (!confirmFlowNavigation(destination)) return;
    setFlow(selectedFlow);
    flowHistory.current = { undo: [], redo: [] };
    setSelectedFlowId(selectedFlow.elements[0]?.id ?? 1);
    setFlowValidation(null);
    navigateRoute(destination, true);
  };

  const restoreFlowVersion = (version: FlowDefinitionMetadata['versions'][number]) => {
    if (!confirmDiscardFlowChanges()) return;
    void saveFlow({
      ...flow,
      label: version.label ?? flow.label,
      description: version.description ?? flow.description,
      flowType: version.flowType ?? flow.flowType,
      triggerObject: version.triggerObject === undefined ? flow.triggerObject : version.triggerObject,
      startConfig: version.startConfig ?? flow.startConfig,
      elements: structuredClone(version.elements),
      connectors: structuredClone(version.connectors),
      resources: structuredClone(version.resources),
      status: 'Draft',
      activeVersion: null
    });
  };

  const exportFlow = () => {
    const exportBlob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(exportBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${flow.apiName}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  };

  const importFlow = async (file: File) => {
    if (!confirmDiscardFlowChanges()) return;
    try {
      const importedValue: unknown = JSON.parse(await file.text());
      if (typeof importedValue !== 'object' || importedValue === null || Array.isArray(importedValue)) {
        throw new Error('The selected file must contain a Flow JSON object.');
      }
      const imported = importedValue as Record<string, unknown>;
      const apiName = imported.apiName;
      if (typeof apiName !== 'string' || typeof imported.label !== 'string'
        || !Array.isArray(imported.elements) || !Array.isArray(imported.connectors)
        || !Array.isArray(imported.resources)) {
        throw new Error('The selected JSON does not contain a complete Flow definition.');
      }
      if (flows.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
        throw new Error(`A Flow named "${apiName}" already exists. Rename the API name in the JSON before importing.`);
      }
      const destination: AppRoute = {
        kind: 'setup',
        workspace: 'flow-builder',
        resourceApiName: apiName
      };
      if (!confirmFlowNavigation(destination)) return;
      const result = await apiRequest<{ flow: FlowDefinitionMetadata }>(
        `/metadata/flows/${encodeURIComponent(apiName)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...imported,
            status: 'Draft',
            versionNumber: 1,
            activeVersion: null,
            versions: []
          })
        }
      );
      flowSnapshots.current.set(result.flow.apiName, JSON.stringify(result.flow));
      setFlows((current) => [...current, result.flow]);
      setFlow(result.flow);
      flowHistory.current = { undo: [], redo: [] };
      setSelectedFlowId(result.flow.elements[0]?.id ?? 1);
      setFlowValidation(null);
      navigateRoute(destination, true);
      notify('Flow imported as a new draft');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to import Flow');
    }
  };

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
  const saveLibraryComponent = async (
    component: Pick<LibraryComponentMetadata, 'apiName' | 'label' | 'description' | 'surfaces' | 'resize' | 'jsxSource' | 'cssSource'>,
    updating: boolean
  ) => {
    const path = updating ? `/component-library/${encodeURIComponent(component.apiName)}` : '/component-library';
    const payload = await apiRequest<{ component: LibraryComponentMetadata }>(path, {
      method: updating ? 'PUT' : 'POST',
      body: JSON.stringify(component)
    });
    setLibraryComponents((current) => current.some((item) => item.apiName === payload.component.apiName)
      ? current.map((item) => item.apiName === payload.component.apiName ? payload.component : item)
      : [...current, payload.component]);
    notify(updating ? 'Global component updated' : 'Global component registered');
  };
  const deleteLibraryComponent = async (apiName: string) => {
    await apiRequest<void>(`/component-library/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setLibraryComponents((current) => current.filter((item) => item.apiName !== apiName));
    notify('Global component deleted');
  };
  const loadDashboardRecords = useCallback(async (dashboardApiName: string, objectApiName: string, runningUserId?: string) => {
    const payload = await apiRequest<{ records: Record<string, unknown>[] }>(
      `/metadata/dashboards/${encodeURIComponent(dashboardApiName)}/data/${encodeURIComponent(objectApiName)}${runningUserId ? `?runningUserId=${encodeURIComponent(runningUserId)}` : ''}`
    );
    return payload.records;
  }, []);
  const saveReport = async (report: ReportMetadata) => {
    const payload = await apiRequest<{ report: ReportMetadata; folder?: ReportFolderMetadata }>(`/metadata/reports/${encodeURIComponent(report.apiName)}`, {
      method: 'PUT',
      body: JSON.stringify(report)
    });
    setReports((current) => current.some((item) => item.apiName === payload.report.apiName)
      ? current.map((item) => item.apiName === payload.report.apiName ? payload.report : item)
      : [...current, payload.report]);
    if (payload.folder) setReportFolders((current) => current.some((folder) => folder.id === payload.folder!.id)
      ? current.map((folder) => folder.id === payload.folder!.id ? payload.folder! : folder)
      : [...current, payload.folder!]);
    notify('Report saved');
    return payload.report;
  };
  const saveReportFolder = async (input: ReportFolderInput) => {
    const payload = await apiRequest<{ folder: ReportFolderMetadata }>('/metadata/report-folders', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    setReportFolders((current) => [...current, payload.folder]);
    notify('Report folder created');
    return payload.folder;
  };
  const deleteReport = async (apiName: string) => {
    await apiRequest<void>(`/metadata/reports/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setReports((current) => current.filter((item) => item.apiName !== apiName));
    notify('Report deleted');
  };
  const runReport = useCallback(
    (apiName: string, filters: DashboardFilterMetadata[] = [], offset = 0, limit = 100, filterLogic: DashboardMetadata['filterLogic'] = 'All', crossFilters: DashboardFilterMetadata[] = [], dashboardApiName?: string, reportFilterOverrides: Array<{ id: string; value: string; values: string[] }> = [], dashboardRunningUserId?: string) => apiRequest<ReportRunMetadata>(
      `/reports/${encodeURIComponent(apiName)}/run`,
      { method: 'POST', body: JSON.stringify({ dashboardFilters: filters, dashboardFilterLogic: filterLogic, dashboardCrossFilters: crossFilters, reportFilterOverrides, offset, limit, ...(dashboardApiName ? { dashboardApiName } : {}), ...(dashboardRunningUserId ? { dashboardRunningUserId } : {}) }) }
    ),
    []
  );
  const previewReport = useCallback(
    (report: ReportMetadata, reportFilterOverrides: Array<{ id: string; value: string; values: string[] }>, offset = 0, limit = 100) => apiRequest<ReportRunMetadata>(
      '/reports/preview',
      { method: 'POST', body: JSON.stringify({ report, reportFilterOverrides, offset, limit }) }
    ),
    []
  );
  const loadDashboardSnapshots = useCallback(async (apiName: string) => {
    const payload = await apiRequest<{ snapshots: DashboardSnapshot[] }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/snapshots`
    );
    return payload.snapshots;
  }, []);
  const createDashboardSnapshot = useCallback(async (
    apiName: string,
    label: string,
    filters: DashboardFilterMetadata[],
    crossFilters: DashboardFilterMetadata[] = [],
    customComponents: Array<{ componentId: string; html: string }> = [],
    runningUserId?: string
  ) => {
    const payload = await apiRequest<{ snapshot: DashboardSnapshot }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/snapshots`,
      { method: 'POST', body: JSON.stringify({ label, filters, crossFilters, customComponents, ...(runningUserId ? { runningUserId } : {}) }) }
    );
    return payload.snapshot;
  }, []);
  const deleteDashboardSnapshot = useCallback(async (apiName: string, snapshotId: string) => {
    await apiRequest<void>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/snapshots/${encodeURIComponent(snapshotId)}`,
      { method: 'DELETE' }
    );
  }, []);
  const loadDashboardSubscriptions = useCallback(async (apiName: string) => {
    const payload = await apiRequest<{ subscriptions: DashboardSubscription[] }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions`
    );
    return payload.subscriptions;
  }, []);
  const saveDashboardSubscription = useCallback(async (
    apiName: string,
    input: DashboardSubscriptionInput,
    subscriptionId?: string
  ) => {
    const path = `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions${subscriptionId ? `/${encodeURIComponent(subscriptionId)}` : ''}`;
    const payload = await apiRequest<{ subscription: DashboardSubscription }>(path, {
      method: subscriptionId ? 'PUT' : 'POST',
      body: JSON.stringify(input)
    });
    return payload.subscription;
  }, []);
  const deleteDashboardSubscription = useCallback(async (apiName: string, subscriptionId: string) => {
    await apiRequest<void>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: 'DELETE' }
    );
  }, []);
  const runDashboardSubscription = useCallback(async (apiName: string, subscriptionId: string) => {
    const payload = await apiRequest<{ subscription: DashboardSubscription }>(
      `/metadata/dashboards/${encodeURIComponent(apiName)}/subscriptions/${encodeURIComponent(subscriptionId)}/run`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    return payload.subscription;
  }, []);
  const saveDashboard = async (dashboard: DashboardMetadata) => {
    const payload = await apiRequest<{ dashboard: DashboardMetadata }>(`/metadata/dashboards/${encodeURIComponent(dashboard.apiName)}`, {
      method: 'PUT',
      body: JSON.stringify(dashboard)
    });
    setDashboards((current) => current.some((item) => item.apiName === payload.dashboard.apiName)
      ? current.map((item) => item.apiName === payload.dashboard.apiName ? payload.dashboard : item)
      : [...current, payload.dashboard]);
    return payload.dashboard;
  };
  const saveDashboardFolder = async (input: DashboardFolderInput, folderId?: string) => {
    const path = `/metadata/dashboard-folders${folderId ? `/${encodeURIComponent(folderId)}` : ''}`;
    const payload = await apiRequest<{ folder: DashboardFolderMetadata }>(path, {
      method: folderId ? 'PUT' : 'POST',
      body: JSON.stringify(input)
    });
    setDashboardFolders((current) => current.some((folder) => folder.id === payload.folder.id)
      ? current.map((folder) => folder.id === payload.folder.id ? payload.folder : folder)
      : [...current, payload.folder]);
    const dashboardAccess = await apiRequest<{ dashboards: DashboardMetadata[] }>(
      '/metadata/dashboards'
    );
    setDashboards(dashboardAccess.dashboards);
    return payload.folder;
  };
  const deleteDashboardFolder = async (folderId: string) => {
    await apiRequest<void>(`/metadata/dashboard-folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
    setDashboardFolders((current) => current.filter((folder) => folder.id !== folderId));
    const dashboardAccess = await apiRequest<{ dashboards: DashboardMetadata[] }>('/metadata/dashboards');
    setDashboards(dashboardAccess.dashboards);
  };
  const saveDashboardTerritories = async (
    territories: Array<Pick<DashboardTerritoryMetadata, 'id' | 'label' | 'parentTerritoryId' | 'userIds'>>
  ) => {
    const payload = await apiRequest<{ territories: DashboardTerritoryMetadata[] }>('/metadata/dashboard-territories', {
      method: 'PUT',
      body: JSON.stringify(territories)
    });
    setDashboardTerritories(payload.territories);
    return payload.territories;
  };
  const deleteDashboard = async (apiName: string) => {
    await apiRequest<void>(`/metadata/dashboards/${encodeURIComponent(apiName)}`, { method: 'DELETE' });
    setDashboards((current) => current.filter((item) => item.apiName !== apiName));
  };
  const selectDashboard = (apiName: string) => {
    navigateRoute({
      kind: 'setup',
      workspace: 'dashboard-builder',
      ...(apiName ? { resourceApiName: apiName } : {})
    });
  };
  const openDashboardViewer = (apiName: string) => navigateRoute({
    kind: 'setup',
    workspace: 'dashboard-builder',
    resourceApiName: apiName,
    dashboardView: true
  });
  const exitDashboardViewer = (apiName: string) => navigateRoute({
    kind: 'setup',
    workspace: 'dashboard-builder',
    resourceApiName: apiName
  });
  const selectPageForObject = (targetObject: string) => {
    const existing = pages.find((item) => item.targetObject === targetObject && item.pageType === 'Record Page');
    if (existing) {
      setPage(existing);
      return;
    }
    const objectLabel = objects.find((item) => item.apiName === targetObject)?.label ?? targetObject;
    const apiName = `${targetObject.replace(/__c$/, '')}_Record_Page`;
    setPage({
      ...defaultLightningPage,
      apiName,
      label: `${objectLabel} Record Page`,
      targetObject,
      status: 'Draft',
      components: defaultLightningPage.components.map((component) => ({ ...component, properties: { ...component.properties } })),
      activationAssignments: []
    });
  };

  const openPageForObject = (targetObject: string) => {
    const existing = pages.find((item) => item.targetObject === targetObject && item.pageType === 'Record Page');
    const apiName = existing?.apiName ?? `${targetObject.replace(/__c$/, '')}_Record_Page`;
    selectPageForObject(targetObject);
    navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: apiName });
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const [result, approvalResult] = await Promise.all([
        apiRequest<{ notifications: CustomNotificationMetadata[]; unreadCount: number }>('/notifications'),
        apiRequest<{ requests: ApprovalRequestMetadata[] }>('/approvals/inbox')
      ]);
      setNotifications(result.notifications);
      setNotificationsUnreadCount(result.unreadCount);
      setApprovalRequests(approvalResult.requests);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to load notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const toggleNotifications = () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening) void loadNotifications();
  };

  const markNotificationRead = async (notification: CustomNotificationMetadata) => {
    if (notification.readAt) return;
    try {
      const result = await apiRequest<{ notification: CustomNotificationMetadata }>(
        `/notifications/${encodeURIComponent(notification.id)}/read`,
        { method: 'POST' }
      );
      setNotifications((current) => current.map((item) => item.id === notification.id ? result.notification : item));
      setNotificationsUnreadCount((current) => Math.max(0, current - 1));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to mark notification as read');
    }
  };

  const decideApproval = async (request: ApprovalRequestMetadata, decision: 'Approved' | 'Rejected') => {
    setApprovalBusyId(request.id);
    try {
      await apiRequest<{ request: ApprovalRequestMetadata }>(
        `/approvals/${encodeURIComponent(request.id)}/decision`,
        { method: 'POST', body: JSON.stringify({ decision }) }
      );
      setApprovalRequests((current) => current.filter((item) => item.groupId !== request.groupId));
      notify(`Approval request ${decision.toLowerCase()}`);
      void loadNotifications();
    } catch (error) {
      notify(error instanceof Error ? error.message : `Unable to ${decision.toLowerCase()} approval request`);
    } finally {
      setApprovalBusyId('');
    }
  };

  return (
    <div className={kioskMode ? 'lightning kiosk-mode' : 'lightning'}>
      <header className="salesforce-header">
        <button className="icon-button app-launcher" aria-label="App Launcher"><Grid2X2 size={18} /></button>
        <div className="brand"><span className="brand-cloud">M</span><span>UNEEngine</span></div>
        <div className="global-search">
          <Search size={15} />
          <input
            aria-label="Search this list..."
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="Search this list..."
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="header-tools">
          <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
          <button className="icon-button" aria-label="Setup"><Settings2 size={17} /></button>
          <div className="notification-center">
            <button className="icon-button notification-button" aria-label={`Notifications${notificationsUnreadCount ? `, ${notificationsUnreadCount} unread` : ''}`} aria-expanded={notificationsOpen} aria-controls="notification-panel" onClick={toggleNotifications}>
              <Bell size={17} />{notificationsUnreadCount > 0 && <span className="notification-count">{notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}</span>}
            </button>
            {notificationsOpen && <section className="notification-panel" id="notification-panel" aria-label="Notifications">
              <div className="notification-panel-heading"><strong>Notifications</strong><button type="button" className="text-action" onClick={() => void loadNotifications()}>Refresh</button></div>
              {notificationsLoading ? <p className="empty-list">Loading notifications…</p> : <>
                {approvalRequests.length > 0 && <section className="notification-approvals" aria-label="Approval requests">
                  <h3>Approval Requests</h3>
                  <ul className="notification-list">{approvalRequests.map((request) => <li key={request.id}>
                    <strong>{request.objectLabel}: {request.recordName}</strong>
                    <p>Submitted by {request.submittedByName}{request.comments ? ` · ${request.comments}` : ''}</p>
                    <small>{new Date(request.createdAt).toLocaleString()}</small>
                    <div className="toolbar-actions">
                      <button type="button" className="btn btn-brand" disabled={approvalBusyId === request.id} onClick={() => void decideApproval(request, 'Approved')}>Approve</button>
                      <button type="button" className="btn" disabled={approvalBusyId === request.id} onClick={() => void decideApproval(request, 'Rejected')}>Reject</button>
                    </div>
                  </li>)}</ul>
                </section>}
                {notifications.length
                ? <ul className="notification-list">{notifications.map((notification) => <li key={notification.id} className={notification.readAt ? '' : 'unread'}>
                  <strong>{notification.title}</strong><p>{notification.body}</p>
                  <small>{new Date(notification.createdAt).toLocaleString()} · {notification.flowApiName}</small>
                  {!notification.readAt && <button type="button" className="text-action" onClick={() => void markNotificationRead(notification)}>Mark as read</button>}
                </li>)}</ul>
                : approvalRequests.length ? null : <p className="empty-list">You’re all caught up.</p>}
              </>}
            </section>}
          </div>
          <button className="user-menu" aria-label="Sign out" onClick={() => void logout()}>Sign out<ChevronDown size={12} /></button>
        </div>
      </header>

      <div className="app-strip" style={{ '--brand': currentApp?.brandColor ?? '#0176d3' } as React.CSSProperties}>
        <div className="app-title">
          <span className="app-icon">{route.kind === 'setup' ? <Settings2 size={18} /> : <Database size={18} />}</span>
          {route.kind === 'setup'
            ? <><strong>{route.dashboardView ? 'Dashboard' : 'Setup'}</strong><ChevronDown size={14} /></>
            : <select aria-label="Current app" value={currentApp?.apiName ?? ''} onChange={(event) => {
              const nextAppId = event.target.value;
              setCurrentAppId(nextAppId);
              navigateRoute(route.kind === 'app-home' || route.kind === 'app-page'
                ? { kind: 'app-home', appId: nextAppId }
                : { ...route, appId: nextAppId });
            }}>{apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}</select>}
        </div>
        <nav className="primary-tabs" aria-label="Workspace navigation">
          {(currentApp?.navigationItems ?? []).map((apiName) => {
            const item = objects.find((candidate) => candidate.apiName === apiName);
            if (!item) return null;
            const style = customTabStyles.find((candidate) => candidate.name === item.customTab?.style);
            const Icon = style?.icon ?? Database;
            return (
              <button
                className={route.kind === 'record-list' && route.objectApiName === item.apiName ? 'primary-tab active custom-object-tab' : 'primary-tab custom-object-tab'}
                key={item.apiName}
                onClick={() => navigateRoute({ kind: 'record-list', objectApiName: item.apiName, appId: currentApp?.apiName })}
              >
                {item.customTab && <span className="custom-tab-icon" style={{ backgroundColor: style?.color }}><Icon size={12} /></span>}
                {!item.customTab && <Database className="rail-icon" size={17} />}
                {item.pluralLabel}
              </button>
            );
          })}
          {(currentApp?.navigationPageApiNames ?? []).map((apiName) => {
            const appPage = pages.find((item) => item.apiName === apiName && item.pageType === 'App Page');
            if (!appPage) return null;
            return <button className={route.kind === 'app-page' && route.pageApiName === apiName ? 'primary-tab active' : 'primary-tab'}
              key={apiName} onClick={() => navigateRoute({ kind: 'app-page', appId: currentApp?.apiName ?? '', pageApiName: apiName })}><Monitor className="rail-icon" size={17} />{appPage.label}</button>;
          })}
          <button className={route.kind === 'app-home' || (route.kind === 'setup' && workspace === 'home') ? 'primary-tab active' : 'primary-tab'}
            onClick={() => route.kind === 'setup' ? openSetupWorkspace('home') : navigateRoute({ kind: 'app-home', appId: currentApp?.apiName ?? 'Records' })}>
            <Monitor className="rail-icon" size={17} />Home
          </button>
          <button className={route.kind === 'setup' && workspace === 'object-manager' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('object-manager')}><Database className="rail-icon" size={17} />Object Manager</button>
          <button className={route.kind === 'setup' && workspace === 'flow-builder' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('flow-builder')}><Workflow className="rail-icon" size={17} />Flows</button>
          <button className={route.kind === 'setup' && workspace === 'report-builder' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('report-builder')}><FileText className="rail-icon" size={17} />Reports</button>
          <button className={route.kind === 'setup' && workspace === 'dashboard-builder' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('dashboard-builder')}><Activity className="rail-icon" size={17} />Dashboards</button>
          <button className={route.kind === 'setup' && workspace === 'page-builder' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('page-builder')}><Grid2X2 className="rail-icon" size={17} />App Builder</button>
          <button className={route.kind === 'setup' && workspace === 'app-manager' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('app-manager')}><Puzzle className="rail-icon" size={17} />App Manager</button>
          <button className={route.kind === 'setup' && workspace === 'component-library' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('component-library')}><ClipboardList className="rail-icon" size={17} />Component Library</button>
          <button className={route.kind === 'setup' && workspace === 'app-exchange' ? 'primary-tab active' : 'primary-tab'} onClick={() => openSetupWorkspace('app-exchange')}><ExternalLink className="rail-icon" size={17} />AppExchange</button>
        </nav>
        {currentApp?.utilityItems.map((utility) => <button className="app-utility-button" key={utility}
          aria-expanded={activeUtility === utility} onClick={() => setActiveUtility((current) => current === utility ? null : utility)}>{utility}</button>)}
        <button className="app-strip-menu" aria-label="More app actions"><MoreHorizontal size={19} /></button>
        {activeUtility && <section className="app-utility-popover" aria-label={`${activeUtility} utility`}>
          <div className="app-utility-heading"><strong>{activeUtility}</strong><button className="icon-button" aria-label={`Close ${activeUtility}`} onClick={() => setActiveUtility(null)}><X size={14} /></button></div>
          {activeUtility === 'Notes'
            ? <textarea aria-label="App notes" placeholder="Write a note for this app session…" value={utilityNotes[currentApp?.apiName ?? ''] ?? ''}
              onChange={(event) => setUtilityNotes((current) => ({ ...current, [currentApp?.apiName ?? '']: event.target.value }))} />
            : <div className="app-utility-history">{recentRoutes.length
              ? recentRoutes.map((item) => <button key={item.key} onClick={() => { navigateRoute(item.route); setActiveUtility(null); }}>{item.label}</button>)
              : <p>No recent items.</p>}</div>}
        </section>}
      </div>

      <main className="setup-layout">
        {route.kind === 'setup' && !route.dashboardView && workspace !== 'flow-builder' && (
          <aside className="setup-sidebar">
            <div className="quick-find">
              <div className="quick-find-title">Quick Find</div>
              <div className="quick-find-input">
                <Search size={14} />
                <input value={quickFind} onChange={(event) => setQuickFind(event.target.value)} placeholder="Quick Find" aria-label="Quick Find" />
                {quickFind && <button onClick={() => setQuickFind('')} aria-label="Clear search"><X size={13} /></button>}
              </div>
            </div>
            <div className="setup-tree">
              {filteredSetupGroups.map((group) => (
                <div className="setup-tree-group" key={group.group}>
                  <div className="tree-group-label">{group.group}</div>
                  {group.items.map((item) => (
                    <React.Fragment key={item}>
                      <button
                        className={((workspace === 'object-manager' && item === 'Object Manager')
                          || (workspace === 'page-builder' && item === 'Lightning App Builder')
                          || (workspace === 'app-manager' && item === 'App Manager')
                          || (workspace === 'component-library' && item === 'Component Library')
                          || (workspace === 'app-exchange' && item === 'AppExchange')
                          || (workspace === 'connector-settings' && item === 'Une Connectors')
                          || (workspace === 'flow-interviews' && item === 'Paused and Waiting Interviews')
                          || (workspace === 'scheduled-flows' && item === 'Scheduled Flows')
                          || (workspace === 'flow-logs' && item === 'Failed Flow Logs')) ? 'tree-item selected' : 'tree-item'}
                        onClick={() => navigateSetupItem(item)}
                      >
                        <span>{item}</span>
                        <ChevronRight size={13} />
                      </button>
                      {item === 'Une Connectors' && filteredConnectorProviders.map((provider) => (
                        <button
                          key={provider.connectorKey}
                          className={`tree-item connector-subitem${workspace === 'connector-settings' && route.kind === 'setup' && route.resourceApiName === provider.connectorKey ? ' selected' : ''}`}
                          onClick={() => navigateSetupItem(provider.connectorKey)}
                        >
                          <span>{provider.name}</span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              ))}
              {filteredSetupGroups.length === 0 && <div className="empty-tree">No setup items found</div>}
            </div>
            <div className="sidebar-footer"><span className="online-dot" /> Setup menu</div>
          </aside>
        )}

        <section className={`workspace ${route.kind !== 'setup' ? 'workspace-records' : ''} ${workspace === 'flow-builder' ? 'workspace-flow' : ''}`}>
          {(route.kind === 'record-list' || route.kind === 'record-detail') && <RecordWorkspace route={route} objects={objects} reports={reports} metadataLoaded={metadataLoaded} profileId={currentProfileId}
            fieldAccess={currentFieldAccess} recordTypeAccess={currentRecordTypeAccess} libraryComponents={libraryComponents} onNavigate={navigateRoute} />}
          {route.kind === 'app-home' && <LightningAppRuntime appId={route.appId} objects={objects} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => item.flowType === 'Screen Flow')
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName) => void runFlow(apiName)} onKioskModeChange={setKioskMode} />}
          {route.kind === 'app-page' && <LightningAppRuntime appId={route.appId} pageApiName={route.pageApiName} objects={objects} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => item.flowType === 'Screen Flow')
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName) => void runFlow(apiName)} onKioskModeChange={setKioskMode} />}
          {route.kind === 'setup' && workspace === 'home' && (
            <SetupHome onNavigate={openSetupWorkspace} />
          )}
          {route.kind === 'setup' && workspace === 'object-manager' && (
            <ObjectManager
              object={object}
              objects={objects}
              flows={flows}
              pages={pages}
              reports={reports}
              dashboards={dashboards}
              profiles={accessControlError ? [] : accessControl.profiles}
              activationAppIds={activationAppIds}
              selectedSetting={objectSetting}
              search={objectSearch}
              onSearch={setObjectSearch}
              onObjectSelect={(nextObject) => navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: nextObject.apiName, setting: 'Fields & Relationships' })}
              onSettingSelect={(setting) => navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: object.apiName, setting: setting === 'Objects' ? 'Details' : setting })}
              onOpenDependency={(target) => {
                if (target.workspace === 'page-builder' && target.resourceApiName) {
                  const selectedPage = pages.find((candidate) => candidate.apiName === target.resourceApiName);
                  if (selectedPage) setPage(selectedPage);
                }
                navigateRoute(target.workspace
                  ? { kind: 'setup', workspace: target.workspace, resourceApiName: target.resourceApiName }
                  : { kind: 'setup', workspace: 'object-manager', objectApiName: target.objectApiName ?? object.apiName, setting: target.setting ?? 'Fields & Relationships' });
              }}
              onNewField={() => { resetNewFieldDraft(); setNewFieldLayoutIds(object.pageLayouts?.map((layout) => layout.id) ?? []); setShowNewField(true); }}
              onCreateObject={() => setShowNewObject(true)}
              onSaveObject={saveObject}
              onRefreshObject={refreshObject}
              onDeleteObject={deleteObject}
              onSaveField={saveField}
              onDeleteField={deleteField}
              onSavePage={savePage}
              onOpenPageBuilder={() => openPageForObject(object.apiName)}
              onOpenRecords={() => navigateRoute({ kind: 'record-list', objectApiName: object.apiName })}
              page={pages.find((item) => item.targetObject === object.apiName && item.pageType === 'Record Page') ?? page}
              onNotify={notify}
            />
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && <PageBuilder key={route.resourceApiName ?? page.apiName} page={page} pages={pages} objects={objects} apps={apps} profiles={accessControl.profiles} reports={reports} libraryComponents={libraryComponents} onChange={changePage} onSelectPage={(apiName) => { const selected = pages.find((item) => item.apiName === apiName); if (selected) { setPage(selected); navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: selected.apiName }); } }} onTargetObjectChange={openPageForObject} onSave={savePageFromBuilder} onSaveApp={saveApp} onDeleteApp={deleteApp} onExit={() => { setPage(pages.find((item) => item.apiName === route.resourceApiName) ?? pages[0] ?? defaultLightningPage); pageRouteApiName.current = ''; navigateRoute({ kind: 'setup', workspace: 'home' }); }} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'app-manager' && <AppManager apps={apps} objects={objects} pages={pages} onSave={saveApp} onDelete={deleteApp} />}
          {route.kind === 'setup' && workspace === 'dashboard-builder' && <DashboardBuilder
            dashboards={dashboards}
            dashboardFolders={dashboardFolders}
            objects={objects}
            libraryComponents={libraryComponents}
            reports={reports}
            smtpCredentials={namedCredentials.filter((credential) => credential.protocol === 'SMTP')}
            canSchedule={canScheduleDashboards}
            shareUsers={accessControlError ? [] : accessControl.users.filter((user) => user.id !== dashboardUserId)}
            shareGroups={accessControlError ? [] : accessControl.permissionSetGroups}
            folderPublicGroups={accessControlError ? [] : accessControl.publicGroups}
            folderRoles={accessControlError ? [] : accessControl.roles}
            folderPermissionSetGroups={accessControlError ? [] : accessControl.permissionSetGroups}
            dashboardTerritories={dashboardTerritories}
            canManageTerritories={canManageDashboardTerritories}
            subscriptionUsers={accessControlError ? [] : accessControl.users}
            runningUserIds={dashboardRunningUserIds}
            userId={dashboardUserId}
            canCreate={canCreateDashboards}
            canManageAll={canManageDashboards}
            viewerMode={route.kind === 'setup' && route.dashboardView === true}
            selectedApiName={route.kind === 'setup' ? route.resourceApiName : undefined}
            onSelect={selectDashboard}
            onOpenViewer={openDashboardViewer}
            onExitViewer={exitDashboardViewer}
            onLoadRecords={loadDashboardRecords}
            onRunReport={runReport}
            onLoadSnapshots={loadDashboardSnapshots}
            onCreateSnapshot={createDashboardSnapshot}
            onDeleteSnapshot={deleteDashboardSnapshot}
            onLoadSubscriptions={loadDashboardSubscriptions}
            onSaveSubscription={saveDashboardSubscription}
            onDeleteSubscription={deleteDashboardSubscription}
            onRunSubscription={runDashboardSubscription}
            onSave={saveDashboard}
            onDelete={deleteDashboard}
            onSaveFolder={saveDashboardFolder}
            onDeleteFolder={deleteDashboardFolder}
            onSaveTerritories={saveDashboardTerritories}
            onNotify={notify}
          />}
          {route.kind === 'setup' && workspace === 'component-library' && <ComponentLibrary components={libraryComponents} canManage={canManageLibrary} onSave={saveLibraryComponent} onDelete={deleteLibraryComponent} />}
          {route.kind === 'setup' && workspace === 'approval-processes' && <ApprovalProcessManager
            processes={approvalProcesses}
            objects={objects}
            users={accessControlError ? [] : accessControl.users}
            canManage={canManageApprovalProcesses}
            onSave={saveApprovalProcess}
            onDelete={deleteApprovalProcess}
            onNotify={notify}
          />}
          {route.kind === 'setup' && workspace === 'named-credentials' && <NamedCredentials
            credentials={namedCredentials}
            canManage={canManageNamedCredentials}
            encryptionReady={namedCredentialsEncryptionReady}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
          />}
          {route.kind === 'setup' && workspace === 'app-exchange' && <AppExchange />}
          {route.kind === 'setup' && workspace === 'connector-settings' && (() => {
            const provider = connectorProviders.find((item) => item.connectorKey === route.resourceApiName) ?? connectorProviders[0];
            return provider ? <ConnectorSettingsWorkspace
              key={provider.connectorKey}
              provider={provider}
              providers={connectorProviders}
              integrationConnections={integrationConnections}
              onSelect={(connectorKey) => navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: connectorKey })}
              onSaveProvider={saveConnectorProvider}
              onSaveIntegrationConnection={saveIntegrationConnection}
              onTestIntegrationConnection={testIntegrationConnection}
              onNotify={notify}
            /> : <div className="connector-settings-page"><div className="surface connector-empty">Connector metadata is loading…</div></div>;
          })()}
          {route.kind === 'setup' && workspace === 'report-builder' && <ReportBuilder reports={reports} reportFolders={reportFolders} canManageReportFolders={canManageReportFolders} accessControl={accessControl} objects={objects} onSave={saveReport} onSaveFolder={saveReportFolder} onDelete={deleteReport} onRun={runReport} onPreview={previewReport} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'scheduled-flows' && (
            <ScheduledFlows flows={flows} objects={objects} loading={!metadataLoaded} onEdit={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'flow-interviews' && (
            <FlowInterviews
              interviews={flowInterviews}
              loading={flowInterviewsLoading}
              canManage={canManageFlows}
              onRefresh={() => void refreshFlowInterviews()}
              onCancel={(interview) => void cancelFlowInterview(interview)}
              onOpenFlow={selectFlow}
            />
          )}
          {route.kind === 'setup' && workspace === 'flow-logs' && (
            <FlowLogs logs={flowLogs} loading={flowLogsLoading} onOpenFlow={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'flow-builder' && (
            <FlowBuilderWorkspace
              landing={!route.resourceApiName}
              flow={flow}
              flows={flows}
              libraryComponents={libraryComponents}
              platformEvents={platformEvents}
              objects={objects}
              users={accessControl.users}
              approvalProcesses={approvalProcesses}
              namedCredentials={namedCredentials}
              emailAlerts={emailAlerts}
              connectorProviders={connectorProviders}
              integrationConnections={integrationConnections}
              validation={flowValidation}
              isDirty={flowHasUnsavedChanges()}
              canRunFlows={canRunFlows}
              selectedId={selectedFlowId}
              toolTab={flowToolTab}
              canUndo={flowHistory.current.undo.length > 0}
              canRedo={flowHistory.current.redo.length > 0}
              onExit={() => openSetupWorkspace('home')}
              onFlowChange={commitFlow}
              onSelectFlow={selectFlow}
              onRestoreFlowVersion={restoreFlowVersion}
              onExportFlow={exportFlow}
              onImportFlow={(file) => void importFlow(file)}
              onCloneFlow={(candidate) => void cloneFlow(candidate)}
              onDeactivateFlow={(apiName) => void deactivateFlow(apiName)}
              onDeleteFlow={(apiName) => void deleteFlow(apiName)}
              onCreateFlow={createFlow}
              onUndo={undoFlow}
              onRedo={redoFlow}
              onSelect={setSelectedFlowId}
              onToolTab={setFlowToolTab}
              onAdd={addFlowElement}
              onUpdateLabel={updateFlowLabel}
              onUpdateConfig={updateFlowConfig}
              onRemove={removeFlowElement}
              onValidate={() => void validateFlow(flow)}
              onSave={() => void saveFlow(flow)}
              onActivate={() => void saveFlow({ ...flow, status: 'Active' })}
              onRun={() => void runFlow()}
              onDebug={openFlowDebug}
              onSaveNamedCredential={saveNamedCredential}
              onDeleteNamedCredential={deleteNamedCredential}
              onRotateNamedCredential={rotateNamedCredential}
              onSaveEmailAlert={saveEmailAlert}
              onDeleteEmailAlert={deleteEmailAlert}
              onSavePlatformEvent={savePlatformEvent}
              onDeletePlatformEvent={deletePlatformEvent}
              onNotify={notify}
            />
          )}
          {route.kind === 'setup' && workspace === 'company-settings' && <CompanySettings />}
          {route.kind === 'setup' && workspace === 'rbac' && <Permissions
            accessControl={accessControl}
            accessControlError={accessControlError}
            objects={objects}
            routeResourceApiName={route.resourceApiName}
            routeResourceId={route.resourceId}
            onRouteResourceChange={(resourceApiName, resourceId) => navigateRoute({
              kind: 'setup', workspace: 'rbac', resourceApiName, ...(resourceId ? { resourceId } : {})
            })}
            onSave={saveAccessControl}
            onNotify={notify}
          />}
        </section>
      </main>

      {showNewField && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { resetNewFieldDraft(); setShowNewField(false); } }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-field-title">
            <div className="modal-header"><h2 id="new-field-title">New Field</h2><button className="icon-button dark" onClick={() => { resetNewFieldDraft(); setShowNewField(false); }} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Create a field on {object.label}. Formula and relationship definitions are stored as object metadata.</p>
            <div className="wizard-progress" aria-label="New field steps">
              {(['Select Type', 'Configure', 'Page Layouts', 'Review'] as const).map((step, index) => <span key={step} className={newFieldStage === index ? 'active' : newFieldStage > index ? 'complete' : ''}>{index + 1}. {step}</span>)}
            </div>
            {newFieldStage === 0 && <div>
              <label className="form-label" htmlFor="new-field-type">Data Type</label>
              <select className="form-control" id="new-field-type" value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)}>
              {['Text', 'Long Text Area', 'Number', 'Currency', 'Percent', 'Date', 'Date/Time', 'Checkbox', 'Email', 'Phone', 'URL', 'Geolocation', 'Picklist', 'Multi-Select Picklist', 'Formula', 'Lookup Relationship', 'Master-Detail Relationship', ...(object.apiName === 'User' ? ['Hierarchical Relationship'] : [])].map((type) => <option key={type}>{type}</option>)}
              </select>
              <p className="permission-help">External Lookup and Indirect Lookup require external objects, which are not supported for this object. Hierarchical Relationship is available for User.</p>
            </div>}
            {newFieldStage === 1 && <div>
            <label className="form-label" htmlFor="new-field-label">Field Label</label>
            <input className="form-control" id="new-field-label" value={newFieldLabel} onChange={(event) => setNewFieldLabel(event.target.value)} placeholder="Enter a field label" autoFocus />
            <label className="form-label">Field Name<div className="form-display">{newFieldApiName || 'Enter a field label to generate the API name'}</div></label>
            {newFieldType === 'Text' && <label className="form-label" htmlFor="new-field-text-length">Length<input className="form-control" id="new-field-text-length" type="number" min={1} max={255} step={1} value={newFieldTextLength} onChange={(event) => setNewFieldTextLength(Number(event.target.value))} /></label>}
            {['Number', 'Currency', 'Percent'].includes(newFieldType) && <div className="form-options">
              <label className="form-label">Length (Precision)<input className="form-control" type="number" min={1} max={18} step={1} value={newFieldPrecision} onChange={(event) => {
                const precision = Number(event.target.value);
                setNewFieldPrecision(precision);
                setNewFieldScale((scale) => Math.min(scale, precision));
              }} /></label>
              <label className="form-label">Decimal Places (Scale)<input className="form-control" type="number" min={0} max={newFieldPrecision} step={1} value={newFieldScale} onChange={(event) => setNewFieldScale(Number(event.target.value))} /></label>
            </div>}
            {['Picklist', 'Multi-Select Picklist'].includes(newFieldType) && <>
              <label className="form-label" htmlFor="new-field-picklist-values">Picklist Values</label>
              <textarea className="form-control" id="new-field-picklist-values" value={newFieldPicklistValues} onChange={(event) => {
                const values = event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                setNewFieldPicklistValues(event.target.value);
                setNewFieldValueSettings((current) => Object.fromEntries(Object.entries(current)
                  .map(([controllerValue, selectedValues]) => [controllerValue, selectedValues.filter((value) => values.includes(value))])));
              }} placeholder={'New\\nIn Progress\\nCompleted'} rows={4} />
              <label className="checkbox-row"><input type="checkbox" checked={newFieldPicklistRestricted} onChange={(event) => setNewFieldPicklistRestricted(event.target.checked)} />Restrict to the values defined in the value set</label>
              {object.fields.some((field) => field.apiName !== newFieldApiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')) && <div className="metadata-card">
                <label className="form-label">Controlling Field
                  <select className="form-control" value={newFieldControllerApiName} onChange={(event) => {
                    const controllerApiName = event.target.value;
                    const controller = object.fields.find((field) => field.apiName === controllerApiName);
                    const values = controller?.dataType === 'Checkbox' ? ['true', 'false'] : controller?.picklistValues ?? [];
                    setNewFieldControllerApiName(controllerApiName);
                    setNewFieldValueSettings(Object.fromEntries(values.map((value) => [value, newFieldValueSettings[value] ?? []])));
                  }}>
                    <option value="">None</option>{object.fields.filter((field) => field.apiName !== newFieldApiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')).map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.dataType})</option>)}
                  </select>
                </label>
                {newFieldControllerApiName && <><p className="permission-help">Choose which values are available for each controlling value.</p>{newFieldControllerValues.map((controllerValue) => <div className="metadata-card" key={controllerValue}>
                  <strong>{controllerValue}</strong>
                  <div className="field-selector-list">{newFieldPicklistOptions.map((value) => <label className="checkbox-row" key={value}><input type="checkbox" checked={(newFieldValueSettings[controllerValue] ?? []).includes(value)} onChange={() => {
                    const selectedValues = newFieldValueSettings[controllerValue] ?? [];
                    setNewFieldValueSettings({ ...newFieldValueSettings, [controllerValue]: selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value] });
                  }} />{value}</label>)}</div>
                </div>)}</>}
              </div>}
            </>}
            {(newFieldType === 'Lookup Relationship' || newFieldType === 'Master-Detail Relationship' || newFieldType === 'Hierarchical Relationship') && <>
              {newFieldType === 'Hierarchical Relationship'
                ? <div className="form-display">Related Object: User</div>
                : <label className="form-label" htmlFor="new-field-target">Related Object
                  <select className="form-control" id="new-field-target" value={newFieldRelationshipTarget} onChange={(event) => {
                    setNewFieldRelationshipTarget(event.target.value);
                    setNewFieldLookupFilters([]);
                    setNewFieldLookupFilterLogic('All');
                  }}>
                    <option value="">Select an object</option>{objects.filter((item) => item.apiName !== object.apiName).map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}
                  </select>
                </label>}
              <label className="form-label">Relationship Name
                  <input className="form-control" value={newFieldRelationshipName || newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}
                  onChange={(event) => setNewFieldRelationshipName(event.target.value)} />
              </label>
              <label className="form-label">Child Relationship Name
                <input className="form-control" value={newFieldChildRelationshipName || `${object.apiName.replace(/__c$/, '')}Records`}
                  onChange={(event) => setNewFieldChildRelationshipName(event.target.value)} />
              </label>
              {newFieldType === 'Lookup Relationship' && <label className="form-label">When a referenced record is deleted
                <select className="form-control" value={newFieldRequired ? 'Restrict' : newFieldDeleteBehavior}
                  disabled={newFieldRequired}
                  onChange={(event) => setNewFieldDeleteBehavior(event.target.value as 'Clear' | 'Restrict')}>
                  <option value="Clear">Clear the lookup field</option>
                  <option value="Restrict">Prevent deletion</option>
                </select>
              </label>}
              {newFieldType === 'Master-Detail Relationship' && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldAllowReparenting} onChange={(event) => setNewFieldAllowReparenting(event.target.checked)} />
                Allow reparenting
              </label>}
              {newFieldType !== 'Hierarchical Relationship' && newFieldRelationshipTarget && <>
                <div className="section-toolbar">
                  <div><h3>Related Lookup Filters</h3><p>Add one or more criteria that determine which records are eligible.</p></div>
                  <button type="button" className="btn" onClick={() => setNewFieldLookupFilters((filters) => [...filters, {
                    id: crypto.randomUUID(),
                    relatedFieldApiName: '',
                    operator: 'Equals',
                    valueMode: 'Value',
                    value: '',
                    valueFieldApiName: '',
                    required: true
                  }])}><Plus size={14} />Add Filter</button>
                </div>
                {newFieldLookupFilters.length > 1 && <label className="form-label">Required criteria match
                  <select className="form-control" aria-label="Lookup filter logic" value={newFieldLookupFilterLogic} onChange={(event) => setNewFieldLookupFilterLogic(event.target.value as 'All' | 'Any')}>
                    <option value="All">All criteria</option><option value="Any">Any criterion</option>
                  </select>
                </label>}
                {newFieldLookupFilters.map((filter, index) => {
                  const relatedFields = objects.find((item) => item.apiName === newFieldRelationshipTarget)?.fields ?? [];
                  const noOperand = filter.operator === 'Is Null' || filter.operator === 'Is Not Null';
                  const updateFilter = (update: Partial<NewFieldLookupFilterDraft>) => setNewFieldLookupFilters((filters) =>
                    filters.map((candidate) => candidate.id === filter.id ? { ...candidate, ...update } : candidate));
                  return <div className="metadata-card" key={filter.id}>
                    <div className="metadata-card-header"><h4>Filter {index + 1}</h4><button type="button" className="row-menu" aria-label={`Remove lookup filter ${index + 1}`} onClick={() => setNewFieldLookupFilters((filters) => filters.filter((candidate) => candidate.id !== filter.id))}><X size={14} /></button></div>
                    <label className="form-label">Related Field
                      <select className="form-control" value={filter.relatedFieldApiName} onChange={(event) => updateFilter({ relatedFieldApiName: event.target.value })}>
                        <option value="">Select a field…</option>{relatedFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                      </select>
                    </label>
                    <label className="form-label">Operator
                      <select className="form-control" value={filter.operator} onChange={(event) => updateFilter({
                        operator: event.target.value as RelatedLookupFilterMetadata['operator'],
                        ...(event.target.value === 'Is Null' || event.target.value === 'Is Not Null' ? { value: '', valueFieldApiName: '' } : {})
                      })}>
                        {relatedLookupFilterOperators.map((operator) => <option key={operator}>{operator}</option>)}
                      </select>
                    </label>
                    {!noOperand && <>
                      <label className="form-label">Compare Against
                        <select className="form-control" value={filter.valueMode} onChange={(event) => updateFilter({ valueMode: event.target.value as 'Value' | 'Field', value: '', valueFieldApiName: '' })}>
                          <option value="Value">A value</option>
                          <option value="Field">A field on this object</option>
                        </select>
                      </label>
                      {filter.valueMode === 'Field'
                        ? <label className="form-label">Source Field
                          <select className="form-control" value={filter.valueFieldApiName} onChange={(event) => updateFilter({ valueFieldApiName: event.target.value })}>
                            <option value="">Select a field…</option>{object.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                          </select>
                        </label>
                        : <label className="form-label">Value
                          <input className="form-control" value={filter.value} onChange={(event) => updateFilter({ value: event.target.value })} />
                        </label>}
                    </>}
                    <label className="checkbox-row"><input type="checkbox" checked={filter.required} onChange={(event) => updateFilter({ required: event.target.checked })} />Required</label>
                  </div>;
                })}
              </>}
            </>}
            {newFieldType === 'Formula' && <>
              <label className="form-label" htmlFor="new-field-return-type">Formula Return Type</label>
              <select className="form-control" id="new-field-return-type" value={newFieldReturnType} onChange={(event) => { setNewFieldReturnType(event.target.value); setNewFieldFormulaValidation({ status: 'idle', message: '' }); }}>{['Number', 'Currency', 'Percent', 'Text', 'Date', 'Checkbox'].map((type) => <option key={type}>{type}</option>)}</select>
              <label className="form-label" htmlFor="new-field-formula">Formula</label>
              <textarea ref={formulaEditorRef} className="form-control" id="new-field-formula" value={newFieldFormula} onChange={(event) => { setNewFieldFormula(event.target.value); setNewFieldFormulaValidation({ status: 'idle', message: '' }); }} placeholder="For example: Amount__c * Probability__c" rows={4} />
              <div className="formula-builder-tools">
                <label className="form-label">Insert Field
                  <select className="form-control" value="" onChange={(event) => { if (event.target.value) insertFormulaText(event.target.value); }}>
                    <option value="">Select a field…</option>
                    {object.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                  </select>
                </label>
                <label className="form-label">Insert Function
                  <select className="form-control" value="" onChange={(event) => {
                    const templates: Record<string, string> = {
                      IF: 'IF(condition, value_if_true, value_if_false)',
                      AND: 'AND(condition1, condition2)',
                      OR: 'OR(condition1, condition2)',
                      CASE: 'CASE(expression, value1, result1, default_result)',
                      ISBLANK: 'ISBLANK(value)',
                      BLANKVALUE: 'BLANKVALUE(value, replacement)',
                      TEXT: 'TEXT(value)',
                      DATE: 'DATE(year, month, day)',
                      ROUND: 'ROUND(number, num_digits)'
                    };
                    if (event.target.value) insertFormulaText(templates[event.target.value] ?? `${event.target.value}()`);
                    event.target.value = '';
                  }}>
                    <option value="">Select a function…</option>
                    {['IF', 'AND', 'OR', 'CASE', 'ISBLANK', 'BLANKVALUE', 'TEXT', 'DATE', 'ROUND'].map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>
              <div className="formula-operator-tools" aria-label="Insert operator">
                {[' + ', ' - ', ' * ', ' / ', ' = ', ' <> ', ' > ', ' < ', ' & ', ' AND ', ' OR '].map((operator) =>
                  <button key={operator} type="button" className="btn" onClick={() => insertFormulaText(operator)}>{operator.trim()}</button>
                )}
              </div>
              <div className="formula-validation-row">
                <button type="button" className="btn" onClick={() => { void validateNewFieldFormula(); }} disabled={!newFieldFormula.trim() || newFieldFormulaValidation.status === 'checking'}>
                  {newFieldFormulaValidation.status === 'checking' ? 'Checking…' : 'Check Syntax'}
                </button>
                {newFieldFormulaValidation.message && <span className={newFieldFormulaValidation.status === 'valid' ? 'formula-validation-success' : 'formula-validation-error'} role="status">{newFieldFormulaValidation.message}</span>}
              </div>
            </>}
            <label className="form-label" htmlFor="new-field-description">Description</label>
            <input className="form-control" id="new-field-description" value={newFieldDescription} onChange={(event) => setNewFieldDescription(event.target.value)} placeholder="Optional field description" />
            <label className="form-label" htmlFor="new-field-help-text">Help Text</label>
            <textarea className="form-control" id="new-field-help-text" value={newFieldHelpText} onChange={(event) => setNewFieldHelpText(event.target.value)} placeholder="Optional guidance shown to users" maxLength={255} rows={2} />
            {!['Formula', 'Geolocation', 'Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType) && (newFieldType === 'Checkbox'
              ? <div className="form-options"><label className="checkbox-row"><input type="checkbox" checked={newFieldHasDefault} onChange={(event) => setNewFieldHasDefault(event.target.checked)} />Set a default value</label><label className="checkbox-row"><input type="checkbox" disabled={!newFieldHasDefault} checked={newFieldDefaultValue === 'true'} onChange={(event) => setNewFieldDefaultValue(String(event.target.checked))} />Default to checked</label></div>
              : ['Picklist', 'Multi-Select Picklist'].includes(newFieldType)
                ? <label className="form-label">Default Value<select className="form-control" multiple={newFieldType === 'Multi-Select Picklist'} value={newFieldType === 'Multi-Select Picklist' ? newFieldDefaultValue.split(';').filter(Boolean) : newFieldDefaultValue} onChange={(event) => {
                  const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                  const value = newFieldType === 'Multi-Select Picklist' ? values.join(';') : values[0] ?? '';
                  setNewFieldDefaultValue(value);
                  setNewFieldHasDefault(value !== '');
                }}><option value="">— None —</option>{newFieldPicklistValues.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                : <label className="form-label" htmlFor="new-field-default">Default Value<input className="form-control" id="new-field-default" type={['Number', 'Currency', 'Percent'].includes(newFieldType) ? 'number' : newFieldType === 'Date' ? 'date' : newFieldType === 'Date/Time' ? 'datetime-local' : newFieldType === 'Email' ? 'email' : newFieldType === 'URL' ? 'url' : 'text'} step={['Number', 'Currency', 'Percent'].includes(newFieldType) ? (newFieldScale ? 10 ** -newFieldScale : 1) : undefined} maxLength={newFieldType === 'Text' ? newFieldTextLength : undefined} value={newFieldDefaultValue} onChange={(event) => { setNewFieldDefaultValue(event.target.value); setNewFieldHasDefault(event.target.value !== ''); }} /></label>)}
            {newFieldType !== 'Formula' && <div className="form-options">
              <label className="checkbox-row"><input type="checkbox" checked={newFieldType === 'Master-Detail Relationship' || newFieldRequired} disabled={newFieldType === 'Master-Detail Relationship'} onChange={(event) => setNewFieldRequired(event.target.checked)} /> Required</label>
              <label className="checkbox-row"><input type="checkbox" checked={newFieldUnique} disabled={newFieldType === 'Long Text Area' || newFieldType === 'Geolocation' || newFieldType === 'Multi-Select Picklist' || newFieldType === 'Lookup Relationship' || newFieldType === 'Master-Detail Relationship' || newFieldType === 'Hierarchical Relationship'} onChange={(event) => setNewFieldUnique(event.target.checked)} /> Unique</label>
              {['Text', 'Number', 'Email', 'Phone'].includes(newFieldType) && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldExternalId} onChange={(event) => setNewFieldExternalId(event.target.checked)} /> External ID
              </label>}
              {newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType) && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldCaseSensitive} onChange={(event) => setNewFieldCaseSensitive(event.target.checked)} /> Treat uppercase and lowercase values as different
              </label>}
            </div>}
            </div>}
            {newFieldStage === 2 && <div className="metadata-card" aria-label="Add field to page layouts">
              <h3>Add to Page Layouts</h3>
              <p className="permission-help">Choose which record layouts should display this field. You can change placements later in Page Layouts.</p>
              {(object.pageLayouts ?? []).map((layout) => <label className="checkbox-row" key={layout.id}>
                <input type="checkbox" checked={newFieldLayoutIds.includes(layout.id)} onChange={() => setNewFieldLayoutIds((current) =>
                  current.includes(layout.id) ? current.filter((id) => id !== layout.id) : [...current, layout.id])} />
                {layout.label}
              </label>)}
              {(object.pageLayouts ?? []).length === 0 && <p className="permission-help">No page layouts are available for this object.</p>}
            </div>}
            {newFieldStage === 3 && <div className="metadata-card" aria-label="Field review">
              <h3>Review Field</h3>
              <dl className="metadata-summary">
                <dt>Data Type</dt><dd>{newFieldType}{newFieldType === 'Text' ? ` (${newFieldTextLength})` : ''}{['Number', 'Currency', 'Percent'].includes(newFieldType) ? ` (${newFieldPrecision}, ${newFieldScale})` : ''}</dd>
                <dt>Field Label</dt><dd>{newFieldLabel.trim()}</dd>
                <dt>Field Name</dt><dd>{newFieldApiName}</dd>
                <dt>Required / Unique</dt><dd>{newFieldType === 'Master-Detail Relationship' || newFieldRequired ? 'Required' : 'Optional'} / {newFieldUnique ? 'Unique' : 'Not unique'}</dd>
                {['Text', 'Number', 'Email', 'Phone'].includes(newFieldType) && <><dt>External ID</dt><dd>{newFieldExternalId ? 'Yes' : 'No'}</dd></>}
                {newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType) && <><dt>Case sensitivity</dt><dd>{newFieldCaseSensitive ? 'Case sensitive' : 'Case insensitive'}</dd></>}
                {newFieldDescription.trim() && <><dt>Description</dt><dd>{newFieldDescription.trim()}</dd></>}
                {newFieldHelpText.trim() && <><dt>Help Text</dt><dd>{newFieldHelpText.trim()}</dd></>}
                {newFieldPicklistOptions.length > 0 && <><dt>Values</dt><dd>{newFieldPicklistOptions.join(', ')}</dd></>}
                {newFieldController && <><dt>Controlling Field</dt><dd>{newFieldController.label}</dd></>}
                {newFieldRelationshipTarget && <><dt>Related Object</dt><dd>{newFieldRelationshipTarget}</dd></>}
                {newFieldHasDefault && <><dt>Default Value</dt><dd>{newFieldDefaultValue || '(blank)'}</dd></>}
                <dt>Page Layouts</dt><dd>{(object.pageLayouts ?? []).filter((layout) => newFieldLayoutIds.includes(layout.id)).map((layout) => layout.label).join(', ') || 'None'}</dd>
              </dl>
            </div>}
            {newFieldStage === 1 && newFieldConfigurationError && <p className="form-error" role="alert">{newFieldConfigurationError}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => { resetNewFieldDraft(); setShowNewField(false); }}>Cancel</button>
              {newFieldStage > 0 && <button className="btn" onClick={() => setNewFieldStage((stage) => (stage - 1) as 0 | 1 | 2 | 3)}>Back</button>}
              {newFieldStage < 3
                ? <button className="btn btn-brand" onClick={() => setNewFieldStage((stage) => (stage + 1) as 0 | 1 | 2 | 3)} disabled={newFieldStage === 1 && Boolean(newFieldConfigurationError)}>Next</button>
                : <button className="btn btn-brand" onClick={() => { void addField(); }} disabled={Boolean(newFieldConfigurationError)}>Save Field</button>}
            </div>
          </section>
        </div>
      )}
      {showNewObject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewObject(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-object-title">
            <div className="modal-header"><h2 id="new-object-title">New Custom Object</h2><button className="icon-button dark" onClick={() => setShowNewObject(false)} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Define the object labels and description. A required record-name field and default layouts are created with it.</p>
            <label className="form-label" htmlFor="new-object-label">Label</label>
            <input className="form-control" id="new-object-label" value={newObjectLabel} onChange={(event) => setNewObjectLabel(event.target.value)} placeholder="For example, Project" autoFocus />
            <label className="form-label" htmlFor="new-object-plural">Plural Label</label>
            <input className="form-control" id="new-object-plural" value={newObjectPluralLabel} onChange={(event) => setNewObjectPluralLabel(event.target.value)} placeholder="For example, Projects" />
            <label className="form-label" htmlFor="new-object-record-name">Record Name Label</label>
            <input className="form-control" id="new-object-record-name" value={newObjectRecordNameLabel} onChange={(event) => setNewObjectRecordNameLabel(event.target.value)} placeholder={`${newObjectLabel || 'Object'} Name`} />
            <label className="form-label" htmlFor="new-object-record-name-type">Record Name Data Type</label>
            <select className="form-control" id="new-object-record-name-type" value={newObjectSettings.recordNameType} onChange={(event) => setNewObjectSettings((current) => ({ ...current, recordNameType: event.target.value as ObjectSettingsMetadata['recordNameType'], recordNameFormat: event.target.value === 'Auto Number' ? current.recordNameFormat || 'REC-{0000}' : '' }))}><option>Text</option><option>Auto Number</option></select>
            {newObjectSettings.recordNameType === 'Auto Number' && <label className="form-label">Display Format<input className="form-control" value={newObjectSettings.recordNameFormat} onChange={(event) => setNewObjectSettings((current) => ({ ...current, recordNameFormat: event.target.value }))} placeholder="REC-{0000}" /></label>}
            <label className="form-label" htmlFor="new-object-description">Description</label>
            <textarea className="form-control" id="new-object-description" value={newObjectDescription} onChange={(event) => setNewObjectDescription(event.target.value)} rows={3} />
            <div className="metadata-card"><h3>Optional Features</h3>{([
              ['allowReports', 'Allow Reports'],
              ['allowActivities', 'Allow Activities'],
              ['trackFieldHistory', 'Track Field History'],
              ['allowInChatter', 'Allow in Chatter']
            ] as const).map(([key, label]) => <label className="metadata-row" key={key}><span>{label}</span><input type="checkbox" checked={newObjectSettings[key]} onChange={(event) => setNewObjectSettings((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}<label className="form-label">Deployment Status<select className="form-control" value={newObjectSettings.deploymentStatus} onChange={(event) => setNewObjectSettings((current) => ({ ...current, deploymentStatus: event.target.value as ObjectSettingsMetadata['deploymentStatus'] }))}><option>In Development</option><option>Deployed</option></select></label></div>
            <label className="checkbox-row"><input type="checkbox" checked={launchCustomTabWizard} onChange={(event) => setLaunchCustomTabWizard(event.target.checked)} />Launch New Custom Tab Wizard after saving this custom object</label>
            <div className="modal-actions"><button className="btn" onClick={() => setShowNewObject(false)}>Cancel</button><button className="btn btn-brand" onClick={createObject} disabled={!newObjectLabel.trim() || !newObjectPluralLabel.trim() || (newObjectSettings.recordNameType === 'Auto Number' && !newObjectSettings.recordNameFormat.trim())}>Save</button></div>
          </section>
        </div>
      )}
      {showCustomTabWizard && customTabObject && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal custom-tab-wizard" role="dialog" aria-modal="true" aria-labelledby="custom-tab-wizard-title">
            <div className="modal-header"><h2 id="custom-tab-wizard-title">New Custom Object Tab</h2><button className="icon-button dark" onClick={() => { setShowCustomTabWizard(false); setCustomTabObject(null); }} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Choose a tab style for {customTabObject.label}. The tab will be added to workspace navigation.</p>
            <h3 className="custom-tab-section-title">Select a Tab Style</h3>
            <div className="custom-tab-style-grid" role="group" aria-label="Tab style">
              {customTabStyles.map((style) => (
                <button
                  className={customTabStyle === style.name ? 'custom-tab-style selected' : 'custom-tab-style'}
                  key={style.name}
                  type="button"
                  aria-pressed={customTabStyle === style.name}
                  onClick={() => setCustomTabStyle(style.name)}
                >
                  <span className="custom-tab-style-icon" style={{ backgroundColor: style.color }}><style.icon size={18} /></span>
                  <span>{style.name}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions"><button className="btn" onClick={() => { setShowCustomTabWizard(false); setCustomTabObject(null); }}>Cancel</button><button className="btn btn-brand" onClick={() => void saveCustomTab()}>Save</button></div>
          </section>
        </div>
      )}
      {flowRun && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="flow-screen-title" onSubmit={submitFlowScreen}>
            <div className="modal-header"><h2 id="flow-screen-title">{flowRun.screen.label}</h2><button className="icon-button dark" type="button" onClick={() => setFlowRun(null)} aria-label="Close"><X size={18} /></button></div>
            {flowRunnerError && <div className="flow-screen-error" role="alert" aria-live="assertive">{flowRunnerError}</div>}
            <div className={`flow-screen-grid${flowRun.screen.config.layout === 'Two Columns' ? ' flow-screen-grid-two' : ''}`}>
              <FlowScreenContent
                fields={(Array.isArray(flowRun.screen.config.fields) ? flowRun.screen.config.fields : []) as Array<Record<string, unknown>>}
                libraryComponents={libraryComponents}
                interviewId={flowRun.interviewId}
                values={flowRun.values}
                onValueChange={(name, value) => {
                  setFlowRunnerError('');
                  setFlowRun((current) => current ? { ...current, values: { ...current.values, [name]: value } } : current);
                }}
                loadRecords={loadFlowScreenRecords}
                onError={setFlowRunnerError}
                isFieldVisible={screenFieldIsVisible}
              />
            </div>
            <div className="modal-actions"><button className="btn" type="button" onClick={() => setFlowRun(null)}>Cancel</button>{flowRun.canGoBack && <button className="btn" type="button" onClick={() => void goBackFlowScreen()} disabled={flowRunnerSubmitting}>Previous</button>}{flowRun.outcomes.map((outcome) => <button className="btn btn-brand" type="submit" name="outcome" value={outcome.label} key={outcome.name} disabled={flowRunnerSubmitting}>{flowRunnerSubmitting ? 'Continuing…' : outcome.label}</button>)}</div>
          </form>
        </div>
      )}
      {flowDebug && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="flow-debug-title">
            <div className="modal-header">
              <div>
                <h2 id="flow-debug-title">{flowDebug.mode === 'debug' ? 'Debug' : 'Run'} {flowDebug.flow.label}</h2>
                <p>{flowDebug.mode === 'debug'
                  ? 'Debug runs the saved version in an isolated tenant copy. Email and HTTP side effects are simulated.'
                  : 'Provide inputs for the saved version. Side effects occur as configured by the flow.'}</p>
              </div>
              <button className="btn btn-icon" type="button" aria-label="Close debug" onClick={() => setFlowDebug(null)}><X size={16} /></button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void runFlowDebug(); }}>
              <div className="modal-body">
                {flowDebug.flow.resources.filter((resource) => resource.availableForInput).map((resource) => {
                  const normalizedType = resource.dataType.toLocaleLowerCase();
                  const isJsonInput = ['Record', 'Record Collection'].includes(resource.type) || normalizedType === 'json';
                  const updateValue = (value: string) => setFlowDebug((current) => current ? {
                    ...current, inputs: { ...current.inputs, [resource.name]: value }
                  } : current);
                  return (
                    <label className="form-label" key={resource.name}>
                      {resource.label} <span className="muted">({resource.dataType})</span>
                      {isJsonInput || normalizedType === 'multi-select picklist'
                        ? <textarea
                            className="form-control"
                            rows={4}
                            value={flowDebug.inputs[resource.name] ?? ''}
                            placeholder={normalizedType === 'multi-select picklist' ? '["Sales", "Service"]' : 'Enter JSON'}
                            onChange={(event) => updateValue(event.target.value)}
                          />
                        : normalizedType === 'boolean' || normalizedType === 'checkbox'
                          ? <select className="form-control" value={flowDebug.inputs[resource.name] ?? ''} onChange={(event) => updateValue(event.target.value)}>
                              <option value="">Use default</option><option value="true">True</option><option value="false">False</option>
                            </select>
                          : <input
                              className="form-control"
                              type={normalizedType.startsWith('number') || normalizedType.startsWith('currency') || normalizedType.startsWith('percent') ? 'number'
                                : normalizedType === 'date' ? 'date'
                                  : normalizedType === 'time' ? 'time'
                                    : normalizedType === 'date/time' || normalizedType === 'datetime' ? 'datetime-local'
                                      : normalizedType === 'email' ? 'email'
                                        : normalizedType === 'url' ? 'url'
                                          : normalizedType === 'phone' ? 'tel' : 'text'}
                              step={normalizedType.startsWith('number') || normalizedType.startsWith('currency') || normalizedType.startsWith('percent') ? 'any' : undefined}
                              value={flowDebug.inputs[resource.name] ?? ''}
                              onChange={(event) => updateValue(event.target.value)}
                            />}
                    </label>
                  );
                })}
                {flowDebug.error && <div className="records-message" role="alert">{flowDebug.error}</div>}
                {flowDebug.result && (
                  <div className="flow-debug-results" aria-live="polite">
                    <h3>Debug results</h3>
                    <p>{flowDebug.error
                      ? 'Execution failed; the trace shows the path reached before the error.'
                      : flowDebug.result.status === 'waiting'
                        ? `Paused at ${flowDebug.result.kind === 'screen' ? 'a Screen' : 'a Wait element'}.`
                        : 'Execution completed.'}</p>
                    {typeof flowDebug.result.screen === 'object' && flowDebug.result.screen !== null && (
                      <section>
                        <h4>Current screen</h4>
                        <p>{String((flowDebug.result.screen as Record<string, unknown>).label ?? 'Screen')}</p>
                        <pre>{JSON.stringify((flowDebug.result.screen as Record<string, unknown>).config ?? {}, null, 2)}</pre>
                      </section>
                    )}
                    {typeof flowDebug.result.waitUntil === 'string' && (
                      <p>Wait scheduled until {new Date(flowDebug.result.waitUntil).toLocaleString()}.</p>
                    )}
                    {flowDebug.result.sideEffectsSimulated === true && (
                      <p>External side effects were simulated; no email or HTTP request was sent.</p>
                    )}
                    {flowDebug.result.outputs !== undefined && (
                      <section><h4>Outputs</h4><pre>{JSON.stringify(flowDebug.result.outputs, null, 2)}</pre></section>
                    )}
                    {flowDebug.result.variables !== undefined && (
                      <section><h4>Variables</h4><pre>{JSON.stringify(flowDebug.result.variables, null, 2)}</pre></section>
                    )}
                    {Array.isArray(flowDebug.result.debugTrace) && (
                      <section>
                        <h4>Element trace</h4>
                        <ol>{flowDebug.result.debugTrace.map((entry, index) => (
                          <li key={index}><pre>{JSON.stringify(entry, null, 2)}</pre></li>
                        ))}</ol>
                      </section>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" type="button" onClick={() => setFlowDebug(null)}>Close</button>
                <button className="btn btn-brand" type="submit" disabled={flowDebug.running}>
                  {flowDebug.running ? (flowDebug.mode === 'debug' ? 'Debugging…' : 'Running…')
                    : flowDebug.mode === 'debug' ? 'Run Debug' : 'Run Flow'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

function RuntimeReportChart({ report, objects }: { report: ReportMetadata | undefined; objects: ObjectMetadata[] }) {
  const [run, setRun] = useState<ReportRunMetadata | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!report) {
      setRun(null);
      setError('');
      return;
    }
    let active = true;
    setRun(null);
    setError('');
    void apiRequest<ReportRunMetadata>(`/reports/${encodeURIComponent(report.apiName)}/run`, {
      method: 'POST',
      body: JSON.stringify({ offset: 0, limit: 500 })
    }).then((result) => {
      if (active) setRun(result);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to run the selected report');
    });
    return () => { active = false; };
  }, [report?.apiName]);
  if (!report) return <div className="records-empty">Choose a saved report in the page component properties.</div>;
  if (error) return <div className="records-message" role="alert">{error}</div>;
  if (!run) return <div className="records-loading">Running {report.label}…</div>;
  const object = objects.find((item) => item.apiName === report.objectApiName);
  const groupedApiName = report.groupByFieldApiNames[0]
    ?? report.fieldApiNames.find((name) => !/^(Number|Currency|Percent)(\(|$)/.test(object?.fields.find((field) => field.apiName === name)?.dataType ?? ''));
  const measureApiName = report.fieldApiNames.find((name) =>
    /^(Number|Currency|Percent)(\(|$)/.test(object?.fields.find((field) => field.apiName === name)?.dataType ?? ''));
  const grouped = new Map<string, number>();
  for (const row of run.rows) {
    const label = groupedApiName ? String(row[groupedApiName] ?? 'No value') : `Row ${grouped.size + 1}`;
    const value = measureApiName ? Number(row[measureApiName]) : 1;
    grouped.set(label, (grouped.get(label) ?? 0) + (Number.isFinite(value) ? value : 0));
  }
  const bars = [...grouped.entries()].slice(0, 12);
  const maximum = Math.max(1, ...bars.map(([, value]) => Math.abs(value)));
  return <div className="runtime-report-chart">
    <div className="runtime-report-chart-heading"><strong>{report.label}</strong><span>{run.totalRows} report row{run.totalRows === 1 ? '' : 's'}</span></div>
    {bars.length === 0 ? <div className="records-empty">The selected report returned no rows.</div>
      : <div className="runtime-report-chart-bars" role="img" aria-label={`${report.label} report chart`}>
        {bars.map(([label, value]) => <div className="runtime-report-chart-bar" key={label} title={`${label}: ${value}`}>
          <span className="runtime-report-chart-value">{new Intl.NumberFormat().format(value)}</span>
          <span className="runtime-report-chart-track"><i style={{ height: `${Math.max(3, Math.abs(value) / maximum * 100)}%` }} /></span>
          <span className="runtime-report-chart-label">{label}</span>
        </div>)}
      </div>}
    {run.truncated && <small className="runtime-report-chart-note">Chart uses the first {run.pageSize} report rows.</small>}
  </div>;
}

function LightningAppRuntime({
  appId,
  pageApiName,
  objects,
  reports,
  libraryComponents,
  availableFlows,
  formFactor,
  onNavigate,
  onLaunchFlow,
  onKioskModeChange
}: {
  appId: string;
  pageApiName?: string;
  objects: ObjectMetadata[];
  reports: ReportMetadata[];
  libraryComponents: LibraryComponentMetadata[];
  availableFlows: Array<Pick<FlowDefinitionMetadata, 'apiName' | 'label' | 'flowType' | 'status'>>;
  formFactor: 'Desktop' | 'Phone';
  onNavigate: (route: AppRoute) => void;
  onLaunchFlow: (flowApiName: string) => void;
  onKioskModeChange: (enabled: boolean) => void;
}) {
  const [page, setPage] = useState<LightningPageMetadata | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('');
  useEffect(() => {
    let active = true;
    setPage(null);
    setError('');
    setLoading(true);
    const endpoint = pageApiName
      ? `/apps/${encodeURIComponent(appId)}/pages/${encodeURIComponent(pageApiName)}?formFactor=${formFactor}`
      : `/apps/${encodeURIComponent(appId)}/home-page?formFactor=${formFactor}`;
    void apiRequest<{ page: LightningPageMetadata | null }>(endpoint).then((payload) => {
      if (active) setPage(payload.page);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load Lightning page');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [appId, pageApiName, formFactor]);
  useEffect(() => {
    setActiveTab('');
  }, [page?.apiName]);
  useEffect(() => {
    onKioskModeChange(page?.layoutMode === 'free-canvas');
    return () => onKioskModeChange(false);
  }, [page?.layoutMode, onKioskModeChange]);
  if (error) return <div className="records-page"><div className="records-message" role="alert">{error}</div></div>;
  if (loading) return <div className="records-page"><div className="records-loading">Loading Lightning page…</div></div>;
  if (!page) return <div className="records-page"><div className="records-empty">No active Home Page is assigned to this app and profile. Assign one from Lightning App Builder.</div></div>;
  const regions: Array<'header' | 'main' | 'sidebar'> = ['header', 'main', 'sidebar'];
  const renderComponent = (component: PageComponentMetadata) => {
    if (!component.visible) return null;
    if (component.type.startsWith('Custom:')) {
      const definition = libraryComponents.find((item) =>
        item.apiName === component.type.slice('Custom:'.length) && item.surfaces.includes('page'));
      return definition
        ? <RegisteredComponent key={component.id} definition={definition}
          props={{ ...component.properties, label: component.label, properties: component.properties, objects, reports, flows: availableFlows, device: formFactor, onNavigate, onLaunchFlow }} />
        : <div className="records-message" role="status" key={component.id}>Component is no longer registered: {component.label}</div>;
    }
    if (component.type === 'Report Chart') {
      const reportApiName = typeof component.properties.reportApiName === 'string' ? component.properties.reportApiName : '';
      return <section className="record-fields-card surface" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2></div>
        <RuntimeReportChart report={reports.find((report) => report.apiName === reportApiName)} objects={objects} />
      </section>;
    }
    if (component.type === 'Tabs') {
      const tabs = Array.isArray(component.properties.tabs)
        ? component.properties.tabs.filter((tab): tab is string => typeof tab === 'string')
        : [];
      const selected = tabs.includes(activeTab) ? activeTab : tabs[0];
      const content = page.components.find((item) =>
        item.id !== component.id && item.visible && item.label.toLocaleLowerCase() === selected?.toLocaleLowerCase());
      return <section className="record-fields-card surface" key={component.id}>
        <div className="record-tabs" role="tablist" aria-label={component.label}>
          {tabs.map((tab) => <button type="button" role="tab" aria-selected={selected === tab}
            className={selected === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </div>
        <div className="record-runtime-tab-panel" role="tabpanel">
          {content ? renderComponent(content) : <div className="records-empty">{selected ? `No page component is assigned to “${selected}”.` : 'Configure tabs in the page properties.'}</div>}
        </div>
      </section>;
    }
    if (component.type === 'Accordion') return <details className="record-fields-card surface app-page-accordion" key={component.id} open>
      <summary>{component.label}</summary>
      <p>{typeof component.properties.content === 'string' ? component.properties.content : 'Add content in the component properties.'}</p>
    </details>;
    return <div className="records-message" role="status" key={component.id}>{component.label} is not supported on app pages.</div>;
  };
  if (page.layoutMode === 'free-canvas') return <div className="free-canvas-runtime"
    data-lightning-page={page.apiName}
    data-layout-mode="free-canvas"
    style={{ width: page.canvasWidth, height: page.canvasHeight }}>
    {page.components.filter((component) => component.visible).map((component) => <div key={component.id}
      className="free-canvas-runtime-component"
      style={{
        left: component.position?.x ?? 0,
        top: component.position?.y ?? 0,
        width: component.position?.width ?? 320,
        height: component.position?.height ?? 180
      }}>
      {renderComponent(component)}
    </div>)}
  </div>;
  const renderRegion = (region: 'header' | 'main' | 'sidebar') =>
    page.components.filter((component) => (component.region ?? 'main') === region).map(renderComponent);
  return <div className="records-page lightning-app-page" data-lightning-page={page.apiName}>
    <div className="record-detail-heading surface">
      <div className="record-object-icon"><Grid2X2 size={18} /></div>
      <div><div className="eyebrow">{page.pageType}</div><h1>{page.label}</h1></div>
    </div>
    {renderRegion('header')}
    <div className={page.template === 'main-sidebar' || page.template === 'header-main-sidebar' ? 'record-runtime-layout has-sidebar' : 'record-runtime-layout'}>
      <main className="record-runtime-main">{renderRegion('main')}</main>
      {(page.template === 'main-sidebar' || page.template === 'header-main-sidebar')
        && <aside className="record-runtime-sidebar">{renderRegion('sidebar')}</aside>}
    </div>
  </div>;
}

function RecordWorkspace({
  route,
  objects,
  reports,
  metadataLoaded,
  profileId,
  fieldAccess,
  recordTypeAccess,
  libraryComponents,
  onNavigate
}: {
  route: Extract<AppRoute, { kind: 'record-list' | 'record-detail' }>;
  objects: ObjectMetadata[];
  reports: ReportMetadata[];
  metadataLoaded: boolean;
  profileId: string;
  fieldAccess: Record<string, { read: boolean; edit: boolean }>;
  recordTypeAccess: Record<string, boolean>;
  libraryComponents: LibraryComponentMetadata[];
  onNavigate: (route: AppRoute) => void;
}) {
  const object = objects.find((item) => item.apiName === route.objectApiName);
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
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [fieldHistory, setFieldHistory] = useState<Array<Record<string, unknown>>>([]);
  const [relatedRecords, setRelatedRecords] = useState<Record<string, { objectApiName: string; fieldApiName: string; records: RecordData[] }>>({});
  const [relatedError, setRelatedError] = useState('');
  const [customActionPendingId, setCustomActionPendingId] = useState('');
  const [customActionMessage, setCustomActionMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [lookupRecords, setLookupRecords] = useState<Record<string, RecordData[]>>({});
  const [lookupError, setLookupError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [massDeleting, setMassDeleting] = useState(false);
  const [ownerDialogRecord, setOwnerDialogRecord] = useState<RecordData | null>(null);
  const [ownerRecords, setOwnerRecords] = useState<RecordData[]>([]);
  const [ownerValue, setOwnerValue] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [importSaving, setImportSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [campaignOptions, setCampaignOptions] = useState<RecordData[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [campaignError, setCampaignError] = useState('');
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [listNotice, setListNotice] = useState('');

  useEffect(() => {
    setSelectedFieldSetApiName(object?.fieldSets?.[0]?.apiName ?? '');
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
          const payload = await apiRequest<{ records: RecordData[] }>(`/records/${encodeURIComponent(route.objectApiName)}`);
          if (active) setRecords(payload.records);
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
  }, [route.kind, route.objectApiName, route.kind === 'record-detail' ? route.recordId : '', route.kind === 'record-detail' ? route.appId : '', formFactor, refreshKey]);

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
          const payload = await apiRequest<{ records: RecordData[] }>(`/records/${encodeURIComponent(childObject.apiName)}`);
          return [relationshipName, {
            objectApiName: childObject.apiName,
            fieldApiName,
            records: payload.records.filter((child) => child[fieldApiName] === record.Id)
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
  }, [route.kind, route.objectApiName, route.kind === 'record-detail' ? route.recordId : '', object?.apiName, objects, record?.Id, record?.RecordTypeId, activeLightningPage, refreshKey]);

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
    if (!ownerDialogRecord) return;
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
  }, [ownerDialogRecord?.Id]);

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
    return formatRecordValue(value);
  };
  const activeRecordTypes = object?.recordTypes?.filter((item) =>
    item.active && recordTypeAccess[`${object.apiName}.${item.id}`] !== false
  ) ?? [];
  const defaultRecordTypeId = activeRecordTypes.find((item) => item.isDefault)?.id ?? activeRecordTypes[0]?.id ?? '';
  const selectedRecordTypeId = String(formValues.RecordTypeId ?? defaultRecordTypeId);
  const selectedLayout = object ? pageLayoutForRecord(object, selectedRecordTypeId, profileId) : undefined;
  const canCreate = object?.apiName !== 'User' && object?.listViewButtons?.includes('New') !== false
    && object?.actions?.some((action) => action.label === 'New' && action.enabled) !== false
    && (!selectedLayout || selectedLayout.actions.includes('New'));
  const canEdit = object?.apiName !== 'User' && object?.actions?.some((action) => action.label === 'Edit' && action.enabled) !== false;
  const canDelete = object?.apiName !== 'User' && object?.actions?.some((action) => action.label === 'Delete' && action.enabled) !== false;
  const canMassDelete = canDelete && object?.listViewButtons?.includes('Mass Delete') === true;
  const ownerField = object?.fields.find((field) => field.apiName === 'OwnerId' && field.relationship?.targetObject === 'User');
  const canChangeOwner = Boolean(ownerField && canEdit && fieldAccess[`${object?.apiName}.OwnerId`]?.edit && object?.listViewButtons?.includes('Change Owner'));
  const canImport = object?.apiName !== 'User' && object?.listViewButtons?.includes('Import') === true
    && object?.actions?.some((action) => action.label === 'New' && action.enabled) !== false;
  const canAddToCampaign = object?.apiName === 'Contact' && objects.some((item) => item.apiName === 'Campaign')
    && object.listViewButtons?.includes('Add to Campaign') === true;
  const openCreateForm = () => {
    setEditingId(null);
    setFormValues({ RecordTypeId: defaultRecordTypeId });
    setFormError('');
    setFormOpen(true);
  };
  const openEditForm = (item: RecordData) => {
    if (!object) return;
    const editableFieldNames = new Set(object.fields.map((field) => field.apiName));
    const editableValues = Object.fromEntries(Object.entries(item).filter(([apiName]) => editableFieldNames.has(apiName) || apiName === 'RecordTypeId'));
    setEditingId(item.Id);
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
        apiName === 'RecordTypeId' || fieldAccess[`${object.apiName}.${apiName}`]?.edit
      ));
      const response = await apiRequest<{ record: RecordData }>(path, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(writableValues)
      });
      setFormOpen(false);
      setFormValues({});
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
    if (route.kind !== 'record-detail' || !record || !window.confirm(`Delete ${String(record.Name ?? record.Id)}? This cannot be undone.`)) return;
    setError('');
    try {
      await apiRequest<void>(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(record.Id)}`, { method: 'DELETE' });
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
  const saveRecordOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!object || !ownerDialogRecord || !ownerField || !ownerValue) return;
    setOwnerSaving(true);
    setOwnerError('');
    try {
      await apiRequest<{ record: RecordData }>(`/records/${encodeURIComponent(object.apiName)}/${encodeURIComponent(ownerDialogRecord.Id)}/owner`, {
        method: 'PUT',
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
        <div className="record-fields-heading"><h2>{relationshipName}</h2><span>{related.records.length} record{related.records.length === 1 ? '' : 's'}</span></div>
        {related.records.length === 0 ? <div className="records-empty">No related {childObject?.pluralLabel.toLocaleLowerCase() ?? 'records'}.</div>
          : <div className="records-table-wrap"><table className="slds-table records-table"><thead><tr>{displayFields.map((field) => <th key={field.apiName}>{field.label}</th>)}</tr></thead>
            <tbody>{related.records.map((child) => <tr key={child.Id}>{displayFields.map((field, index) => <td key={field.apiName}>
              {index === 0 && childObject
                ? <a href={appRoutePath({ kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })} onClick={(event) => navigateLink(event, { kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })}>{formatRecordValue(child[field.apiName] ?? child.Id)}</a>
                : formatRecordValue(child[field.apiName])}
            </td>)}</tr>)}</tbody></table></div>}
      </section>;
    };
    const renderRuntimeComponent = (component: PageComponentMetadata) => {
      if (!component.visible) return null;
      if (component.type.startsWith('Custom:')) {
        const definition = libraryComponents.find((item) => item.apiName === component.type.slice('Custom:'.length) && item.surfaces.includes('page'));
        return definition
          ? <RegisteredComponent key={component.id} definition={definition} props={{
            label: component.label, properties: component.properties, record, recordId: record.Id, object, formFactor
          }} />
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
      if (component.type === 'Report Chart') return <section className="record-fields-card surface" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2></div>
        <RuntimeReportChart report={reports.find((report) => report.apiName === component.properties.reportApiName)} objects={objects} />
      </section>;
      return <div className="records-message" role="status" key={component.id}>{component.label} is not supported in record runtime.</div>;
    };
    const renderRuntimeRegion = (region: 'header' | 'main' | 'sidebar') =>
      assignedPage?.components.filter((component) => (component.region ?? 'main') === region).map(renderRuntimeComponent);
    return <div className="records-page">
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
            {canDelete && (!recordLayout || recordLayout.actions.includes('Delete')) && <button className="btn btn-danger" onClick={() => void deleteCurrentRecord()}><Trash2 size={14} />Delete</button>}
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
              <div className="record-fields-heading"><h2>{relationshipName}</h2><span>{related.records.length} record{related.records.length === 1 ? '' : 's'}</span></div>
              {related.records.length === 0 ? <div className="records-empty">No related {childObject?.pluralLabel.toLocaleLowerCase() ?? 'records'}.</div>
                : <div className="records-table-wrap"><table className="slds-table records-table"><thead><tr>{displayFields.map((field) => <th key={field.apiName}>{field.label}</th>)}</tr></thead>
                  <tbody>{related.records.map((child) => <tr key={child.Id}>{displayFields.map((field, index) => <td key={field.apiName}>
                    {index === 0 && childObject
                      ? <a href={appRoutePath({ kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })} onClick={(event) => navigateLink(event, { kind: 'record-detail', objectApiName: childObject.apiName, recordId: child.Id, appId: route.appId })}>{formatRecordValue(child[field.apiName] ?? child.Id)}</a>
                      : formatRecordValue(child[field.apiName])}
                  </td>)}</tr>)}</tbody>
                </table></div>}
            </section>;
        })}
        {relatedError && <div className="records-message surface" role="alert">{relatedError}</div>}
        {lookupError && <div className="records-message surface" role="alert">Some related record names could not be resolved: {lookupError}</div>}
      </>}
      {formOpen && <RecordFormDialog object={object} objects={objects} activeRecordTypes={activeRecordTypes} selectedRecordTypeId={selectedRecordTypeId} profileId={profileId} selectedLayout={selectedLayout}
        fieldAccess={fieldAccess}
        formValues={formValues} lookupRecords={lookupRecords} formError={formError} saving={saving} editing={Boolean(editingId)}
        actionAllowed={!selectedLayout || selectedLayout.actions.includes(editingId ? 'Edit' : 'New')}
        onChange={(apiName, value) => setFormValues((current) => ({ ...current, [apiName]: value }))}
        onClose={() => setFormOpen(false)} onSubmit={(event) => void saveRecord(event)} />}
    </div>;
  }

  const query = search.trim().toLocaleLowerCase();
  const readableFields = object.fields.filter((field) => fieldAccess[`${object.apiName}.${field.apiName}`]?.read);
  const configuredSearchableFields = object.searchLayouts?.searchResults?.map((name) => object.fields.find((field) => field.apiName === name))
    .filter((field): field is FieldMetadata => Boolean(field && fieldAccess[`${object.apiName}.${field.apiName}`]?.read)) ?? [];
  const hasConfiguredSearchResults = object.searchLayouts?.searchResults !== undefined;
  const searchableFields = hasConfiguredSearchResults ? configuredSearchableFields : readableFields;
  const visibleRecords = records.filter((item) => !query || searchableFields.some((field) =>
    String(item[field.apiName] ?? '').toLocaleLowerCase().includes(query)
  ));
  const configuredListFields = object.searchLayouts?.searchResults?.map((name) => object.fields.find((field) => field.apiName === name))
    .filter((field): field is FieldMetadata => Boolean(field && fieldAccess[`${object.apiName}.${field.apiName}`]?.read));
  const listFields = hasConfiguredSearchResults
    ? configuredListFields ?? []
    : [...readableFields].sort((left, right) => Number(right.apiName === 'Name') - Number(left.apiName === 'Name'))
      .filter((field) => records.length === 0 || records.some((item) => field.apiName in item)).slice(0, 5);
  const selectableRecordIds = (canMassDelete || canAddToCampaign) ? visibleRecords.flatMap((item) => {
    const recordTypeId = String(item.RecordTypeId ?? defaultRecordTypeId);
    const recordLayout = pageLayoutForRecord(object, recordTypeId, profileId);
    return canAddToCampaign || canMassDelete && (!recordLayout || recordLayout.actions.includes('Delete')) ? [item.Id] : [];
  }) : [];
  const selectedDeletableRecordIds = selectedRecordIds.filter((id) => selectableRecordIds.includes(id)
    && canMassDelete
    && (() => {
      const item = records.find((candidate) => candidate.Id === id);
      if (!item) return false;
      const layout = pageLayoutForRecord(object, String(item.RecordTypeId ?? defaultRecordTypeId), profileId);
      return !layout || layout.actions.includes('Delete');
    })());
  useEffect(() => {
    setSelectedRecordIds([]);
    setListNotice('');
  }, [object.apiName]);
  return <div className="records-page">
    <div className="records-page-heading">
      <div className="record-object-icon"><Database size={18} /></div>
      <div><div className="eyebrow">OBJECT</div><h1>{object.pluralLabel}</h1></div>
      <div className="records-heading-actions">
        <select className="form-control records-object-select" aria-label="Choose object" value={object.apiName} onChange={(event) => onNavigate({ kind: 'record-list', objectApiName: event.target.value })}>
          {objects.map((item) => <option key={item.apiName} value={item.apiName}>{item.pluralLabel}</option>)}
        </select>
        <button className="btn" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Refresh</button>
      </div>
    </div>
    <section className="records-list-card surface">
      <div className="records-list-toolbar">
        <div><h2>{object.pluralLabel}</h2><span>{loading ? 'Loading records…' : `${visibleRecords.length} record${visibleRecords.length === 1 ? '' : 's'}`}</span></div>
        <div className="records-list-actions">
          <label className="records-search"><Search size={14} /><input aria-label={`Search ${object.pluralLabel}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this list…" /></label>
          {canCreate && <button className="btn btn-brand" onClick={openCreateForm}><Plus size={14} />New</button>}
          {canImport && <button className="btn" onClick={() => importInputRef.current?.click()}>Import</button>}
          {canAddToCampaign && selectedRecordIds.length > 0 && <button className="btn" onClick={() => void openAddToCampaign()}>Add to Campaign ({selectedRecordIds.length})</button>}
          {object.listViewButtons?.includes('Printable View') && <button className="btn" onClick={() => window.print()}>Printable View</button>}
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
      {error && <div className="records-message" role="alert">{error}</div>}
      {!error && !loading && records.length === 0 && <div className="records-empty">No {object.pluralLabel.toLocaleLowerCase()} found.</div>}
      {!error && !loading && records.length > 0 && visibleRecords.length === 0 && <div className="records-empty">No records match “{search}”.</div>}
      {!error && (loading || records.length > 0) && <div className="records-table-wrap"><table className="slds-table records-table">
        <thead><tr>{(canMassDelete || canAddToCampaign) && <th><input type="checkbox" aria-label="Select all selectable records" checked={selectableRecordIds.length > 0 && selectableRecordIds.every((id) => selectedRecordIds.includes(id))} onChange={(event) => setSelectedRecordIds(event.target.checked ? selectableRecordIds : [])} /></th>}{listFields.map((field) => <th key={field.apiName}>{field.label}</th>)}{(canEdit || canChangeOwner) && <th>Actions</th>}</tr></thead>
        <tbody>{visibleRecords.map((item) => {
          const recordTypeId = String(item.RecordTypeId ?? defaultRecordTypeId);
          const rowLayout = pageLayoutForRecord(object, recordTypeId, profileId);
          const rowAllowsEdit = !rowLayout || rowLayout.actions.includes('Edit');
          const rowAllowsDelete = !rowLayout || rowLayout.actions.includes('Delete');
          const selectable = canAddToCampaign || canMassDelete && rowAllowsDelete;
          return <tr key={item.Id}>{(canMassDelete || canAddToCampaign) && <td>{selectable && <input type="checkbox" aria-label={`Select ${String(item.Name ?? item.Id)}`} checked={selectedRecordIds.includes(item.Id)} onChange={() => setSelectedRecordIds((current) => current.includes(item.Id) ? current.filter((id) => id !== item.Id) : [...current, item.Id])} />}</td>}{listFields.map((field, index) => <td key={field.apiName}>
            {index === 0
              ? <a href={appRoutePath({ kind: 'record-detail', objectApiName: object.apiName, recordId: item.Id, appId: route.appId })} onClick={(event) => navigateLink(event, { kind: 'record-detail', objectApiName: object.apiName, recordId: item.Id, appId: route.appId })}>{formatFieldValue(field, item[field.apiName] ?? item.Id)}</a>
              : formatFieldValue(field, item[field.apiName])}
          </td>)}{(canEdit || canChangeOwner) && <td>{rowAllowsEdit && <div className="record-row-actions">
            {canEdit && <button className="text-action" onClick={() => openEditForm(item)}><Pencil size={13} />Edit</button>}
            {canChangeOwner && <button className="text-action" onClick={() => openChangeOwner(item)}>Change Owner</button>}
          </div>}</td>}</tr>;
        })}</tbody>
      </table></div>}
    </section>
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
      fieldAccess={fieldAccess}
      formValues={formValues} lookupRecords={lookupRecords} formError={formError} saving={saving} editing={Boolean(editingId)}
      actionAllowed={!selectedLayout || selectedLayout.actions.includes(editingId ? 'Edit' : 'New')}
      onChange={(apiName, value) => setFormValues((current) => ({ ...current, [apiName]: value }))}
      onClose={() => setFormOpen(false)} onSubmit={(event) => void saveRecord(event)} />}
  </div>;
}

function RecordFormDialog({
  object,
  objects,
  activeRecordTypes,
  selectedRecordTypeId,
  profileId,
  selectedLayout,
  fieldAccess,
  formValues,
  lookupRecords,
  formError,
  saving,
  editing,
  actionAllowed,
  onChange,
  onClose,
  onSubmit
}: {
  object: ObjectMetadata;
  objects: ObjectMetadata[];
  activeRecordTypes: RecordTypeMetadata[];
  selectedRecordTypeId: string;
  profileId: string;
  selectedLayout: PageLayoutMetadata | undefined;
  fieldAccess: Record<string, { read: boolean; edit: boolean }>;
  formValues: Record<string, unknown>;
  lookupRecords: Record<string, RecordData[]>;
  formError: string;
  saving: boolean;
  editing: boolean;
  actionAllowed: boolean;
  onChange: (apiName: string, value: unknown) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [isPhoneViewport, setIsPhoneViewport] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const [lookupDialogField, setLookupDialogField] = useState<FieldMetadata | null>(null);
  const [lookupQuery, setLookupQuery] = useState('');
  const [includeNonmatchingOptionalLookupResults, setIncludeNonmatchingOptionalLookupResults] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const updateViewport = () => setIsPhoneViewport(media.matches);
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);
  const layoutFieldNames = selectedLayout?.sections.flatMap((section) => section.fieldApiNames) ?? [];
  const visibleFields = object.fields.filter((field) => !field.formula
    && !field.dataType.toLocaleLowerCase().startsWith('auto number')
    && fieldAccess[`${object.apiName}.${field.apiName}`]?.read
    && (!selectedLayout || layoutFieldNames.includes(field.apiName) || field.required));
  const unplacedRequiredFields = visibleFields.filter((field) => field.required && !layoutFieldNames.includes(field.apiName));
  const allowedPicklistValues = (field: FieldMetadata, recordTypeId = selectedRecordTypeId, values = formValues) => {
    const recordTypeValues = object.recordTypes?.find((recordType) => recordType.id === recordTypeId)?.picklistValues?.[field.apiName];
    const valueSet = recordTypeValues ?? field.picklistValues ?? [];
    if (!field.controllerFieldApiName) return valueSet;
    const controller = object.fields.find((item) => item.apiName === field.controllerFieldApiName);
    const controllerValue = values[field.controllerFieldApiName]
      ?? (editing ? '' : controller?.defaultValue ?? (controller?.dataType === 'Checkbox' ? false : ''));
    if (controllerValue === undefined || controllerValue === null || controllerValue === '') return [];
    return (field.valueSettings?.[String(controllerValue)] ?? []).filter((value) => valueSet.includes(value));
  };
  const changeFieldValue = (apiName: string, value: unknown) => {
    onChange(apiName, value);
    const nextValues = { ...formValues, [apiName]: value };
    object.fields.filter((field) => field.controllerFieldApiName === apiName).forEach((field) => {
      const currentValue = formValues[field.apiName];
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        const allowedValues = allowedPicklistValues(field, selectedRecordTypeId, nextValues);
        if (field.dataType === 'Multi-Select Picklist') {
          const currentValues = String(currentValue).split(';').filter(Boolean);
          const retainedValues = currentValues.filter((item) => allowedValues.includes(item));
          if (retainedValues.length !== currentValues.length) onChange(field.apiName, retainedValues.join(';'));
        } else if (!allowedValues.includes(String(currentValue))) {
          onChange(field.apiName, '');
        }
      }
    });
  };
  const lookupDisplayFields = (field: FieldMetadata) => {
    const targetObject = objects.find((item) => item.apiName === field.relationship?.targetObject);
    if (!targetObject) return [];
    const configuredFields = isPhoneViewport
      ? targetObject.searchLayouts?.lookupPhoneDialog ?? targetObject.searchLayouts?.lookupDialog
      : targetObject.searchLayouts?.lookupDialog;
    const fieldNames = configuredFields ?? [];
    const selectedFields = fieldNames.map((name) => targetObject.fields.find((item) => item.apiName === name))
      .filter((item): item is FieldMetadata => Boolean(item && fieldAccess[`${targetObject.apiName}.${item.apiName}`]?.read));
    return configuredFields !== undefined ? selectedFields : targetObject.fields
      .filter((item) => (item.apiName === 'Name' || item.apiName === 'Email')
        && fieldAccess[`${targetObject.apiName}.${item.apiName}`]?.read)
      .slice(0, 2);
  };
  const lookupCompactFields = (field: FieldMetadata) => {
    const targetObject = objects.find((item) => item.apiName === field.relationship?.targetObject);
    const selectedRecord = (lookupRecords[targetObject?.apiName ?? ''] ?? []).find((record) =>
      record.Id === formValues[field.apiName]);
    const relatedRecordTypeId = String(selectedRecord?.RecordTypeId
      ?? targetObject?.recordTypes?.find((item) => item.active && item.isDefault)?.id
      ?? targetObject?.recordTypes?.find((item) => item.active)?.id
      ?? 'master');
    const compactLayout = targetObject ? compactLayoutForRecord(targetObject, relatedRecordTypeId, profileId) : undefined;
    return (compactLayout?.fieldApiNames ?? [])
      .map((name) => targetObject?.fields.find((item) => item.apiName === name))
      .filter((item): item is FieldMetadata => Boolean(item && fieldAccess[`${targetObject?.apiName}.${item.apiName}`]?.read));
  };
  const lookupRecordLabel = (field: FieldMetadata, item: RecordData) => {
    const displayFields = lookupDisplayFields(field);
    return displayFields.map((displayField) => item[displayField.apiName])
      .filter((itemValue) => itemValue !== undefined && itemValue !== null && itemValue !== '')
      .map(String).join(' · ') || String(item.Name ?? item.Email ?? item.Id);
  };
  const openLookupDialog = (field: FieldMetadata) => {
    setLookupDialogField(field);
    setLookupQuery('');
    setIncludeNonmatchingOptionalLookupResults(false);
  };
  const renderField = (field: FieldMetadata) => {
    const rawValue = formValues[field.apiName] ?? (editing ? '' : field.defaultValue);
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    const dataType = field.dataType.toLocaleLowerCase();
    const helpTextId = `record-field-help-${field.apiName}`;
    const common = { id: `record-field-${field.apiName}`, name: field.apiName, required: field.required, disabled: saving || !fieldAccess[`${object.apiName}.${field.apiName}`]?.edit, 'aria-describedby': field.helpText ? helpTextId : undefined };
    const helpText = field.helpText ? <small className="field-help-text" id={helpTextId}>{field.helpText}</small> : null;
    if (dataType === 'checkbox') return <div key={field.apiName}>
      <label className="record-checkbox">
        <input {...common} type="checkbox" checked={Boolean(rawValue ?? false)} onChange={(event) => changeFieldValue(field.apiName, event.target.checked)} />
        <span>{field.label}{field.required && <b aria-hidden="true"> *</b>}</span>
      </label>
      {helpText}
    </div>;
    if (field.dataType === 'Geolocation') {
      const coordinates = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? Object.fromEntries(Object.entries(rawValue))
        : {};
      const updateCoordinate = (coordinate: 'latitude' | 'longitude', input: string) => {
        const next = {
          ...coordinates,
          [coordinate]: input === '' ? null : Number(input)
        };
        onChange(field.apiName, next.latitude == null && next.longitude == null ? null : next);
      };
      return <fieldset className="form-label" key={field.apiName}>
        <legend>{field.label}{field.required && <b aria-hidden="true"> *</b>}</legend>
        <div className="form-options">
          <label className="form-label">Latitude
            <input className="form-control" type="number" min="-90" max="90" step="any"
              aria-label={`${field.label} latitude`} required={field.required}
              disabled={saving || !fieldAccess[`${object.apiName}.${field.apiName}`]?.edit}
              value={coordinates.latitude == null ? '' : String(coordinates.latitude)}
              onChange={(event) => updateCoordinate('latitude', event.target.value)} />
          </label>
          <label className="form-label">Longitude
            <input className="form-control" type="number" min="-180" max="180" step="any"
              aria-label={`${field.label} longitude`} required={field.required}
              disabled={saving || !fieldAccess[`${object.apiName}.${field.apiName}`]?.edit}
              value={coordinates.longitude == null ? '' : String(coordinates.longitude)}
              onChange={(event) => updateCoordinate('longitude', event.target.value)} />
          </label>
        </div>
        {helpText}
      </fieldset>;
    }
    if (field.relationship) {
      const options = lookupRecords[field.relationship.targetObject] ?? [];
      const targetObject = objects.find((item) => item.apiName === field.relationship?.targetObject);
      const requiredFilters = object.relatedLookupFilters?.filter((filter) => filter.fieldApiName === field.apiName && filter.required) ?? [];
      const lookupFilterLogic = object.relatedLookupFilterLogic?.[field.apiName] ?? 'All';
      const filteredOptions = options.filter((item) => matchesLookupFilterGroup(item, requiredFilters, formValues, lookupFilterLogic));
      const selectedRecord = options.find((item) => item.Id === value);
      const selectedMatchesFilters = filteredOptions.some((item) => item.Id === value);
      const selectedCompactFields = lookupCompactFields(field);
      return <div className="form-label" key={field.apiName}><span>{field.label}{field.required && <b aria-hidden="true"> *</b>}</span>
        <div className="lookup-picker-control">
          <input className="form-control" id={common.id} name={common.name} aria-label={field.label}
            value={selectedRecord ? lookupRecordLabel(field, selectedRecord) : ''}
            placeholder={targetObject ? `Search ${targetObject.label}…` : 'Related object unavailable'}
            readOnly aria-readonly="true" required={field.required && !value} disabled={common.disabled}
            onClick={() => { if (!common.disabled && targetObject) openLookupDialog(field); }} />
          <button type="button" className="btn lookup-picker-button" disabled={common.disabled || !targetObject}
            aria-label={`Search ${targetObject?.label ?? 'related records'} for ${field.label}`}
            onClick={() => { if (targetObject) openLookupDialog(field); }}>
            <Search size={14} />Search
          </button>
          {value && !common.disabled && <button type="button" className="btn lookup-picker-clear" aria-label={`Clear ${field.label}`}
            disabled={field.required} onClick={() => onChange(field.apiName, null)}><X size={14} /></button>}
        </div>
        {selectedRecord && selectedCompactFields.length > 0 && <div className="lookup-selected-card" aria-label={`${targetObject?.label ?? 'Related record'} compact details`}>
          {selectedCompactFields.map((compactField) => <div key={compactField.apiName}><small>{compactField.label}</small><strong>{formatRecordValue(selectedRecord[compactField.apiName])}</strong></div>)}
        </div>}
        {selectedRecord && !selectedMatchesFilters && <small className="lookup-filter-warning">The selected record does not match the required lookup filter. Choose a matching record to continue.</small>}
        {helpText}
      </div>;
    }
    if (dataType === 'picklist') return <label className="form-label" htmlFor={common.id} key={field.apiName}>{field.label}{field.required && <b aria-hidden="true"> *</b>}
      <select className="form-control" {...common} value={value} onChange={(event) => changeFieldValue(field.apiName, event.target.value)}>
        <option value="" disabled={field.required}>{field.required ? 'Select a value…' : '— None —'}</option>
        {(() => {
          const picklistValues = allowedPicklistValues(field);
          return <>
            {value && !picklistValues.includes(value) && <option value={value}>{value}</option>}
            {picklistValues.map((item) => <option key={item} value={item}>{item}</option>)}
          </>;
        })()}
      </select>
      {helpText}
    </label>;
    if (dataType === 'multi-select picklist') return <label className="form-label" htmlFor={common.id} key={field.apiName}>{field.label}{field.required && <b aria-hidden="true"> *</b>}
      <select className="form-control" {...common} multiple value={value.split(';').filter(Boolean)} onChange={(event) => changeFieldValue(field.apiName, Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(';'))}>
        {allowedPicklistValues(field).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <small>Select multiple values with Ctrl or Command.</small>
      {helpText}
    </label>;
    if (dataType.includes('text area') || dataType.includes('long text')) return <label className="form-label record-form-wide" htmlFor={common.id} key={field.apiName}>{field.label}{field.required && <b aria-hidden="true"> *</b>}
      <textarea className="form-control" {...common} maxLength={dataType === 'long text area' ? 131072 : undefined} value={value} onChange={(event) => onChange(field.apiName, event.target.value)} />
      {helpText}
    </label>;
    const type = dataType === 'date' ? 'date'
      : dataType.includes('datetime') ? 'datetime-local'
        : dataType === 'email' ? 'email'
          : dataType === 'url' ? 'url'
            : dataType === 'phone' ? 'tel'
              : dataType.startsWith('number') || dataType.startsWith('currency') || dataType.startsWith('percent') ? 'number'
                : 'text';
    const numericFormat = field.dataType.match(/^(?:Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
    const numericMaximum = numericFormat
      ? 10 ** (Number(numericFormat[1]) - Number(numericFormat[2])) - 10 ** -Number(numericFormat[2])
      : undefined;
    const textMaximum = field.dataType.match(/^Text\((\d+)\)$/)?.[1];
    return <label className="form-label" htmlFor={common.id} key={field.apiName}>{field.label}{field.required && <b aria-hidden="true"> *</b>}
      <input className="form-control" {...common} type={type}
        min={numericMaximum === undefined ? undefined : -numericMaximum}
        max={numericMaximum}
        step={numericFormat ? (Number(numericFormat[2]) ? 10 ** -Number(numericFormat[2]) : 1) : type === 'number' ? 'any' : undefined}
        maxLength={textMaximum ? Number(textMaximum) : field.dataType === 'Text' ? 255 : undefined}
        value={value}
        onChange={(event) => onChange(field.apiName, type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} />
      {helpText}
    </label>;
  };
  return <div className="record-form-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="record-form-title" onKeyDown={(event) => { if (event.key === 'Escape' && !saving && !lookupDialogField) onClose(); }}>
      <header><div><div className="eyebrow">{object.label}</div><h2 id="record-form-title">{editing ? 'Edit Record' : `New ${object.label}`}</h2></div>
        <button className="icon-button" aria-label="Close" onClick={onClose} disabled={saving}><X size={16} /></button></header>
      <form onSubmit={onSubmit}>
        {activeRecordTypes.length > 1 && <label className="form-label">Record Type
          <select className="form-control" value={selectedRecordTypeId} disabled={saving} onChange={(event) => {
            const nextRecordTypeId = event.target.value;
            onChange('RecordTypeId', nextRecordTypeId);
            const nextRecordValues = { ...formValues };
            object.fields.filter((field) => field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist').forEach((field) => {
              const allowed = allowedPicklistValues(field, nextRecordTypeId, nextRecordValues);
              const current = nextRecordValues[field.apiName];
              if (current !== undefined && current !== null && current !== '') {
                if (field.dataType === 'Multi-Select Picklist') {
                  const selectedValues = String(current).split(';').filter(Boolean);
                  const retainedValues = selectedValues.filter((value) => allowed.includes(value));
                  if (retainedValues.length !== selectedValues.length) {
                    nextRecordValues[field.apiName] = retainedValues.join(';');
                    onChange(field.apiName, retainedValues.join(';'));
                  }
                } else if (!allowed.includes(String(current))) {
                  nextRecordValues[field.apiName] = '';
                  onChange(field.apiName, null);
                }
              }
            });
          }}>
            {activeRecordTypes.map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}
          </select>
        </label>}
        {selectedLayout?.sections.length ? <>
          {selectedLayout.sections.map((section) => {
          const sectionFields = section.fieldApiNames.map((name) => visibleFields.find((field) => field.apiName === name)).filter((field): field is FieldMetadata => Boolean(field));
          return <section className="record-form-section" key={section.id}><h3>{section.label}</h3><div className={`record-form-grid columns-${section.columns}`}>{sectionFields.map(renderField)}</div></section>;
          })}
          {unplacedRequiredFields.length > 0 && <section className="record-form-section"><h3>Required Fields</h3><div className="record-form-grid">{unplacedRequiredFields.map(renderField)}</div></section>}
        </> : <div className="record-form-grid">{visibleFields.map(renderField)}</div>}
        {formError && <div className="records-message" role="alert">{formError}</div>}
        {!actionAllowed && <div className="records-message" role="alert">This action is not enabled for the selected page layout.</div>}
        <footer><button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn btn-brand" disabled={saving || !actionAllowed}>{saving ? 'Saving…' : 'Save'}</button></footer>
      </form>
    </section>
    {lookupDialogField && (() => {
      const targetObject = objects.find((item) => item.apiName === lookupDialogField.relationship?.targetObject);
      const options = lookupRecords[lookupDialogField.relationship?.targetObject ?? ''] ?? [];
      const requiredFilters = object.relatedLookupFilters?.filter((filter) =>
        filter.fieldApiName === lookupDialogField.apiName && filter.required) ?? [];
      const optionalFilters = object.relatedLookupFilters?.filter((filter) =>
        filter.fieldApiName === lookupDialogField.apiName && !filter.required) ?? [];
      const lookupFilterLogic = object.relatedLookupFilterLogic?.[lookupDialogField.apiName] ?? 'All';
      const filteredOptions = options.filter((item) =>
        matchesLookupFilterGroup(item, requiredFilters, formValues, lookupFilterLogic)
        && (includeNonmatchingOptionalLookupResults
          || matchesLookupFilterGroup(item, optionalFilters, formValues, lookupFilterLogic)));
      const displayFields = lookupDisplayFields(lookupDialogField);
      const configuredFields = isPhoneViewport
        ? targetObject?.searchLayouts?.lookupPhoneDialog ?? targetObject?.searchLayouts?.lookupDialog
        : targetObject?.searchLayouts?.lookupDialog;
      const searchableFields = configuredFields !== undefined ? displayFields : targetObject?.fields.filter((field) =>
        (field.apiName === 'Name' || field.apiName === 'Email')
        && fieldAccess[`${targetObject.apiName}.${field.apiName}`]?.read) ?? [];
      const query = lookupQuery.trim().toLocaleLowerCase();
      const matchingOptions = filteredOptions.filter((item) => !query || searchableFields.some((field) =>
        String(item[field.apiName] ?? '').toLocaleLowerCase().includes(query)));
      return <div className="lookup-dialog-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setLookupDialogField(null);
      }}>
        <section className="lookup-dialog surface" role="dialog" aria-modal="true" aria-labelledby="lookup-dialog-title"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') setLookupDialogField(null);
          }}>
          <header><div><div className="eyebrow">{targetObject?.label ?? 'Related Records'}</div>
            <h2 id="lookup-dialog-title">Select {targetObject?.label ?? 'a record'}</h2></div>
            <button type="button" className="icon-button" aria-label="Close lookup dialog" onClick={() => setLookupDialogField(null)}><X size={16} /></button>
          </header>
          <label className="lookup-dialog-search"><Search size={15} /><input autoFocus aria-label={`Search ${targetObject?.label ?? 'records'}`}
            value={lookupQuery} onChange={(event) => setLookupQuery(event.target.value)} placeholder={`Search this ${targetObject?.label.toLocaleLowerCase() ?? 'list'}…`} /></label>
          {optionalFilters.length > 0 && <label className="checkbox-row">
            <input type="checkbox" checked={includeNonmatchingOptionalLookupResults}
              onChange={(event) => setIncludeNonmatchingOptionalLookupResults(event.target.checked)} />
            <span>Include records outside optional lookup filters</span>
          </label>}
          {matchingOptions.length ? <div className="lookup-dialog-results" role="listbox" aria-label={`${targetObject?.label ?? 'Record'} results`}>
            {matchingOptions.map((item) => <button type="button" role="option" aria-selected={String(formValues[lookupDialogField.apiName] ?? '') === item.Id}
              key={item.Id} className="lookup-dialog-result" onClick={() => {
                onChange(lookupDialogField.apiName, item.Id);
                setLookupDialogField(null);
              }}>
              {searchableFields.map((field) => <span key={field.apiName}><small>{field.label}</small>{formatRecordValue(item[field.apiName])}</span>)}
              {!searchableFields.length && <span>{String(item.Name ?? item.Email ?? item.Id)}</span>}
            </button>)}
          </div> : <div className="records-empty">{options.length ? 'No matching records satisfy the search and required lookup filters.' : 'No records are available for this lookup.'}</div>}
          <footer><button type="button" className="btn" onClick={() => setLookupDialogField(null)}>Cancel</button></footer>
        </section>
      </div>;
    })()}
  </div>;
}

function formatRecordValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    if (!Array.isArray(value) && value !== null && 'latitude' in value && 'longitude' in value) {
      return `${String(value.latitude)}, ${String(value.longitude)}`;
    }
    return JSON.stringify(value) ?? String(value);
  }
  return String(value);
}

function parseCsvImport(text: string, object: ObjectMetadata): Array<Record<string, unknown>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV must include a header row and at least one record.');
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  if (headers.some((header) => !header)) throw new Error('CSV column headers cannot be blank.');
  if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
    throw new Error('CSV column headers must be unique.');
  }
  const fieldByHeader = new Map(object.fields.flatMap((field) => [
    [field.apiName.toLocaleLowerCase(), field.apiName],
    [field.label.toLocaleLowerCase(), field.apiName]
  ]));
  const fieldNames = headers.map((header) => fieldByHeader.get(header.toLocaleLowerCase()));
  const unknownHeader = headers.find((header) => !fieldByHeader.has(header.toLocaleLowerCase()) && header.toLocaleLowerCase() !== 'recordtypeid');
  if (unknownHeader) throw new Error(`CSV column "${unknownHeader}" does not match a field API name or label on ${object.label}.`);
  const mappedNames = headers.map((header, index) => header.toLocaleLowerCase() === 'recordtypeid' ? 'RecordTypeId' : fieldNames[index]!);
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} values; expected ${headers.length}.`);
    return Object.fromEntries(values.map((value, columnIndex) => [mappedNames[columnIndex], value]));
  });
}

function SetupHome({ onNavigate }: { onNavigate: (workspace: WorkspaceId) => void }) {
  return (
    <div className="home-content">
      <PageHeading eyebrow="Setup" title="Setup Home" description="Configure and manage your organization." actions={<button className="btn"><RefreshCw size={14} />Refresh</button>} />
      <div className="welcome-banner">
        <div className="welcome-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sphere"><Settings2 size={27} /></div></div>
        <div className="welcome-copy"><div className="eyebrow">YOUR ORGANIZATION</div><h2>Welcome to Setup</h2><p>Find the tools you need to customize your org and support your users.</p><button className="text-action">Explore Setup <ArrowRight size={15} /></button></div>
        <div className="welcome-quick"><div className="quick-label">Recently viewed</div><button onClick={() => onNavigate('object-manager')}><Database size={15} />Object Manager<ChevronRight size={14} /></button><button onClick={() => onNavigate('flow-builder')}><Workflow size={15} />Flows<ChevronRight size={14} /></button><button onClick={() => onNavigate('rbac')}><ShieldCheck size={15} />Permission Sets<ChevronRight size={14} /></button></div>
      </div>
      <div className="home-section-title"><div><h2>Quick access</h2><p>Jump back into your most-used setup tools.</p></div><button className="text-action">View all <ArrowRight size={14} /></button></div>
      <div className="shortcut-grid">
        {setupShortcuts.map(({ title, description, workspace, icon: Icon }) => (
          <button key={title} className="shortcut-card" onClick={() => onNavigate(workspace)}>
            <span className="shortcut-icon"><Icon size={19} /></span><span className="shortcut-title">{title}</span><span className="shortcut-description">{description}</span><ArrowRight className="shortcut-arrow" size={15} />
          </button>
        ))}
      </div>
      <div className="home-lower-grid">
        <section className="surface recent-surface"><div className="section-heading"><h2>Recent setup changes</h2><button className="text-action">View audit trail</button></div><div className="recent-row"><span className="recent-icon purple"><Workflow size={16} /></span><div><strong>Renewal Risk Evaluation</strong><small>Flow · Activated by Alexandra Curtis</small></div><time>Today, 10:42 AM</time></div><div className="recent-row"><span className="recent-icon blue"><Database size={16} /></span><div><strong>Renewal custom object</strong><small>Object · Modified by David Kim</small></div><time>Yesterday</time></div><div className="recent-row"><span className="recent-icon green"><ShieldCheck size={16} /></span><div><strong>Sales Manager permissions</strong><small>Permission set · Modified by Alexandra Curtis</small></div><time>Oct 6</time></div></section>
        <section className="surface help-surface"><div className="section-heading"><h2>Resources</h2><ExternalLink size={15} /></div><button className="resource-row"><span><CircleHelp size={16} /></span><div><strong>Setup help</strong><small>Learn how to configure your org</small></div><ChevronRight size={15} /></button><button className="resource-row"><span><Command size={16} /></span><div><strong>Keyboard shortcuts</strong><small>Work faster in Setup</small></div><ChevronRight size={15} /></button></section>
      </div>
    </div>
  );
}

function CompanySettings() {
  const [draft, setDraft] = useState<CurrencySettingsMetadata>({
    corporateCurrency: 'USD',
    currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }]
  });
  const [corporateCode, setCorporateCode] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<CurrencySettingsMetadata>('/metadata/currencies')
      .then((settings) => {
        if (active) {
          setDraft(settings);
          setCorporateCode(settings.corporateCurrency);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const setCorporateCurrency = () => {
    const normalized = corporateCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      setError('Corporate currency must be a three-letter ISO 4217 code.');
      return;
    }
    setDraft((current) => {
      const hasCorporate = current.currencies.some((currency) => currency.currencyIsoCode === normalized);
      return {
        ...current,
        corporateCurrency: normalized,
        currencies: hasCorporate
          ? current.currencies.map((currency) => currency.currencyIsoCode === normalized
            ? { ...currency, conversionRate: 1 }
            : currency)
          : [...current.currencies, { currencyIsoCode: normalized, conversionRate: 1 }]
      };
    });
    setError('');
    setNotice('');
  };

  const save = async () => {
    const normalizedCorporateCode = corporateCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCorporateCode)) {
      setError('Corporate currency must be a three-letter ISO 4217 code.');
      return;
    }
    const hasCorporateCurrency = draft.currencies.some((currency) => currency.currencyIsoCode === normalizedCorporateCode);
    const settings: CurrencySettingsMetadata = {
      corporateCurrency: normalizedCorporateCode,
      currencies: hasCorporateCurrency
        ? draft.currencies.map((currency) => currency.currencyIsoCode === normalizedCorporateCode
          ? { ...currency, conversionRate: 1 }
          : currency)
        : [...draft.currencies, { currencyIsoCode: normalizedCorporateCode, conversionRate: 1 }]
    };
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await apiRequest<CurrencySettingsMetadata>('/metadata/currencies', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setDraft(saved);
      setCorporateCode(saved.corporateCurrency);
      setNotice('Company currency settings saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="home-content">
      <PageHeading eyebrow="Company Settings" title="Company Information" description="Configure the corporate currency and active conversion rates used by currency formulas." />
      <section className="surface permission-section">
        <div className="section-toolbar">
          <div><h2>Currency Settings</h2><p>Rates express units of corporate currency per one unit of the active currency.</p></div>
          <button className="btn btn-brand" type="button" onClick={() => void save()} disabled={loading || saving}>
            <Save size={14} />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {loading ? <p className="permission-help">Loading currency settings…</p> : <>
          <label className="form-label">Corporate Currency (ISO 4217)
            <input className="form-control" value={corporateCode} maxLength={3}
              onChange={(event) => {
                setCorporateCode(event.target.value.toUpperCase());
                setError('');
              }}
              onBlur={setCorporateCurrency} />
          </label>
          <h3 className="permission-section-heading">Active Currencies</h3>
          <div className="currency-settings-list">
            {draft.currencies.map((currency, index) => (
              <div className="currency-setting-row" key={`${currency.currencyIsoCode}-${index}`}>
                <label className="form-label">Currency Code
                  <input className="form-control" value={currency.currencyIsoCode} maxLength={3}
                    disabled={currency.currencyIsoCode === draft.corporateCurrency}
                    onChange={(event) => {
                      const currencyIsoCode = event.target.value.toUpperCase();
                      setDraft((current) => ({
                        ...current,
                        currencies: current.currencies.map((item, itemIndex) => itemIndex === index
                          ? { ...item, currencyIsoCode }
                          : item)
                      }));
                      setNotice('');
                    }} />
                </label>
                <label className="form-label">Conversion Rate
                  <input className="form-control" type="number" min="0" step="any"
                    value={currency.currencyIsoCode === draft.corporateCurrency ? 1 : currency.conversionRate}
                    disabled={currency.currencyIsoCode === draft.corporateCurrency}
                    onChange={(event) => {
                      const conversionRate = Number(event.target.value);
                      setDraft((current) => ({
                        ...current,
                        currencies: current.currencies.map((item, itemIndex) => itemIndex === index
                          ? { ...item, conversionRate }
                          : item)
                      }));
                      setNotice('');
                    }} />
                </label>
                <button className="btn" type="button" aria-label={`Remove ${currency.currencyIsoCode || 'currency'}`}
                  disabled={currency.currencyIsoCode === draft.corporateCurrency}
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      currencies: current.currencies.filter((_item, itemIndex) => itemIndex !== index)
                    }));
                    setNotice('');
                  }}><Trash2 size={14} />Remove</button>
              </div>
            ))}
          </div>
          <button className="btn" type="button" onClick={() => {
            setDraft((current) => ({
              ...current,
              currencies: [...current.currencies, { currencyIsoCode: '', conversionRate: 1 }]
            }));
            setNotice('');
          }}><Plus size={14} />Add Currency</button>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
      </section>
    </div>
  );
}

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
      ...(draft.apiName === 'User' ? [] : ['New', 'Import', 'Mass Delete']),
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
  const renderSetting = () => {
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
          <div className="object-titlebar"><div className="object-title-icon">{object.label.charAt(0)}</div><div><div className="eyebrow">{object.kind}</div><h1>{object.label}</h1></div><button type="button" className="btn" onClick={onOpenRecords}><Database size={14} />View Records</button></div>
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

function PageBuilder({
  page, pages, objects, apps, profiles, reports, libraryComponents, onChange, onSelectPage, onTargetObjectChange, onSave, onSaveApp, onDeleteApp, onExit, onNotify
}: {
  page: LightningPageMetadata;
  pages: LightningPageMetadata[];
  objects: ObjectMetadata[];
  apps: LightningAppMetadata[];
  profiles: ProfileMetadata[];
  reports: ReportMetadata[];
  libraryComponents: LibraryComponentMetadata[];
  onChange: (page: LightningPageMetadata) => void;
  onSelectPage: (apiName: string) => void;
  onTargetObjectChange: (targetObject: string) => void;
  onSave: (page: LightningPageMetadata, previousApiName: string, successMessage?: string) => Promise<boolean>;
  onSaveApp: (app: LightningAppMetadata, updating: boolean) => Promise<void>;
  onDeleteApp: (apiName: string) => Promise<void>;
  onExit: () => void;
  onNotify: (message: string) => void;
}) {
  const [builderAppApiName, setBuilderAppApiName] = useState('');
  const pageTemplates: Array<{ id: LightningPageTemplate; label: string; regions: Array<'header' | 'main' | 'sidebar'> }> = [
    { id: 'one-region', label: 'One Region', regions: ['main'] },
    { id: 'header-main', label: 'Header and Main', regions: ['header', 'main'] },
    { id: 'main-sidebar', label: 'Main with Sidebar', regions: ['main', 'sidebar'] },
    { id: 'header-main-sidebar', label: 'Header, Main, and Sidebar', regions: ['header', 'main', 'sidebar'] }
  ];
  const template = pageTemplates.find((item) => item.id === page.template) ?? pageTemplates[0];
  const builderApp = apps.find((app) => app.apiName === builderAppApiName);
  const appPageApiNames = new Set(builderApp?.navigationPageApiNames ?? []);
  const appPages = builderApp
    ? pages.filter((item) => item.status === 'Active' && (
      appPageApiNames.has(item.apiName)
      || (item.activationAssignments ?? []).some((assignment) => assignment.appId === builderApp.apiName)
    ))
    : [];
  const pagePickerPages = builderApp
    ? [...appPages.filter((item) => item.apiName !== page.apiName), page]
    : [
      ...pages
        .filter((item) => item.apiName !== page.apiName)
        .sort((left, right) => (Date.parse(right.updatedAt ?? '') || 0) - (Date.parse(left.updatedAt ?? '') || 0))
        .slice(0, 10),
      page
    ];
  const currentPageIsAssignedToBuilderApp = appPages.some((item) => item.apiName === page.apiName);
  const targetObject = objects.find((object) => object.apiName === page.targetObject);
  const pageTypeComponents = page.pageType === 'Record Page'
    ? standardPageComponents.map((component) => component.apiName)
    : standardPageComponents
      .filter((component) => ['Accordion', 'Tabs', 'Report Chart'].includes(component.apiName))
      .map((component) => component.apiName);
  const relatedListOptions = [...new Map(objects.flatMap((childObject) => childObject.fields.flatMap((field) => {
    const relationship = field.relationship;
    if (relationship?.targetObject !== page.targetObject || !relationship.childRelationshipName) return [];
    return [[relationship.childRelationshipName, childObject.pluralLabel] as const];
  })))].map(([apiName, label]) => ({ apiName, label }));
  const defaultRelatedLists = relatedListOptions.slice(0, 3).map((item) => item.apiName);
  const availableComponents = pageTypeComponents.filter((component) =>
    (component !== 'Activities' || targetObject?.settings?.allowActivities)
    && (component !== 'Chatter' || targetObject?.settings?.allowInChatter)
    && (component !== 'Report Chart' || targetObject?.settings?.allowReports));
  const stringList = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
  const [selectedId, setSelectedId] = useState(page.components[0]?.id ?? '');
  const savedPageApiName = useRef(page.apiName);
  const [device, setDevice] = useState<'Desktop' | 'Tablet' | 'Phone'>('Desktop');
  const orientation = canvasOrientation(page.canvasWidth, page.canvasHeight);
  const [paletteTab, setPaletteTab] = useState<'Components' | 'Fields'>('Components');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [paletteCategory, setPaletteCategory] = useState<(typeof pageBuilderPaletteCategories)[number]>('All Components');
  const [favouriteComponents, setFavouriteComponents] = useState<string[]>([]);
  const [favouritesLoaded, setFavouritesLoaded] = useState(false);
  const [componentPanelWidth, setComponentPanelWidth] = useState(280);
  const paletteResizeStart = useRef<{ pointerId: number; pointerX: number; width: number } | null>(null);
  const [customPropertiesDraft, setCustomPropertiesDraft] = useState('');
  const [customPropertiesError, setCustomPropertiesError] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [dynamicFormsUpgradeOpen, setDynamicFormsUpgradeOpen] = useState(false);
  const [migrationLayoutId, setMigrationLayoutId] = useState('');
  const [fitCanvas, setFitCanvas] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const pagePreviewAreaRef = useRef<HTMLDivElement | null>(null);
  const [canvasRefreshKey, setCanvasRefreshKey] = useState(0);
  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [newPageLabel, setNewPageLabel] = useState('');
  const [newPageType, setNewPageType] = useState<LightningPageMetadata['pageType']>('Record Page');
  const [newPageTemplate, setNewPageTemplate] = useState<LightningPageTemplate>('header-main-sidebar');
  const [newPageLayoutMode, setNewPageLayoutMode] = useState<LightningPageMetadata['layoutMode']>('template');
  const [dragOverId, setDragOverId] = useState('');
  const [undoStack, setUndoStack] = useState<LightningPageMetadata[]>([]);
  const [redoStack, setRedoStack] = useState<LightningPageMetadata[]>([]);
  const canvasResizeStart = useRef<{ id: string; pointerId: number; pointerX: number; pointerY: number; width: number; height: number } | null>(null);
  const [canvasResizePreview, setCanvasResizePreview] = useState<{ id: string; width: number; height: number } | null>(null);
  const [componentClipboard, setComponentClipboard] = useState<PageComponentMetadata | null>(null);
  const [recordScope, setRecordScope] = useState<PageActivationAssignmentMetadata['scope']>('Org Default');
  const [recordAppId, setRecordAppId] = useState(builderAppApiName || apps[0]?.apiName || '');
  const [recordProfileId, setRecordProfileId] = useState('');
  const [recordTypeId, setRecordTypeId] = useState('');
  const [recordFormFactors, setRecordFormFactors] = useState<Array<'Desktop' | 'Phone'>>(['Desktop']);
  const [homeAppId, setHomeAppId] = useState(apps[0]?.apiName ?? '');
  const [homeScope, setHomeScope] = useState<'App Default' | 'App and Profile'>('App Default');
  const [homeProfileId, setHomeProfileId] = useState('');
  const [homeFormFactors, setHomeFormFactors] = useState<Array<'Desktop' | 'Phone'>>(['Desktop']);
  const [saving, setSaving] = useState(false);
  const fields = targetObject?.fields ?? [];
  const pageLayouts = targetObject?.pageLayouts ?? [];
  const selected = page.components.find((component) => component.id === selectedId);
  const selectedCustomDefinition = selected?.type.startsWith('Custom:')
    ? libraryComponents.find((item) => item.apiName === selected.type.slice('Custom:'.length))
    : undefined;
  const selectedComponentDescription = selectedCustomDefinition?.description
    ?? standardPageComponents.find((component) => component.apiName === selected?.type)?.description
    ?? (selected?.type === 'Field Section' ? 'Group record fields into a configurable section.' : '');
  const assignedMigrationLayout = pageLayouts.find((layout) =>
    layout.id === targetObject?.pageLayoutAssignments?.[0]?.pageLayoutId) ?? pageLayouts[0];
  const selectedMigrationLayout = pageLayouts.find((layout) => layout.id === migrationLayoutId) ?? assignedMigrationLayout;
  const dynamicFormsEnabled = page.components.some((component) => component.type === 'Field Section' || component.type === 'Record Field');
  const paletteComponents = [
    ...(page.layoutMode === 'template' ? standardPageComponents
      .filter((component) => availableComponents.includes(component.apiName))
      .map((component) => ({
        id: component.apiName,
        type: component.apiName,
        label: component.label,
        description: component.description,
        categories: getPageBuilderComponentCategories(component.apiName, component.label, component.description, true)
      })) : []),
    ...(page.layoutMode === 'template' && dynamicFormsEnabled ? [{
      id: 'Field Section',
      type: 'Field Section',
      label: 'Field Section',
      description: 'Group selected record fields into a one- or two-column section.',
      categories: ['Layout'] as (typeof pageBuilderPaletteCategories)[number][]
    }] : []),
    ...libraryComponents.filter((component) => component.surfaces.includes('page')).map((component) => ({
      id: `Custom:${component.apiName}`,
      type: `Custom:${component.apiName}`,
      label: component.label,
      description: component.description,
      categories: getPageBuilderComponentCategories(component.apiName, component.label, component.description)
    }))
  ];
  const filteredPaletteComponents = paletteComponents.filter((component) => {
    const inCategory = paletteCategory === 'All Components'
      || (paletteCategory === 'Favourites'
        ? favouriteComponents.includes(component.id)
        : component.categories.includes(paletteCategory));
    const searchContent = `${component.label} ${component.id} ${component.description} ${component.categories.join(' ')}`.toLowerCase();
    return inCategory && searchContent.includes(paletteSearch.trim().toLowerCase());
  });
  const toggleFavourite = (componentId: string) => setFavouriteComponents((current) =>
    current.includes(componentId) ? current.filter((item) => item !== componentId) : [...current, componentId]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('metadrive:page-builder:favourites');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
          throw new Error('Saved favourites are not a list of component IDs.');
        }
        setFavouriteComponents(parsed);
      }
    } catch (failure) {
      onNotify(`Unable to load component favourites: ${failure instanceof Error ? failure.message : 'Browser storage is unavailable.'}`);
    } finally {
      setFavouritesLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!favouritesLoaded) return;
    try {
      window.localStorage.setItem('metadrive:page-builder:favourites', JSON.stringify(favouriteComponents));
    } catch (failure) {
      onNotify(`Unable to save component favourites: ${failure instanceof Error ? failure.message : 'Browser storage is unavailable.'}`);
    }
  }, [favouriteComponents, favouritesLoaded]);
  useEffect(() => {
    const savedIdentityExists = pages.some((item) => item.apiName === savedPageApiName.current);
    const currentIdentityExists = pages.some((item) => item.apiName === page.apiName);
    if (!savedIdentityExists && currentIdentityExists) savedPageApiName.current = page.apiName;
  }, [page.apiName, pages]);
  useEffect(() => {
    setCustomPropertiesDraft(selected?.type.startsWith('Custom:') ? JSON.stringify(selected.properties, null, 2) : '');
    setCustomPropertiesError('');
  }, [selected?.id, selected?.type]);
  useEffect(() => {
    setSelectedId(page.components[0]?.id ?? '');
    setPaletteTab('Components');
    setDevice('Desktop');
    setFitCanvas(true);
    setUndoStack([]);
    setRedoStack([]);
    setPreviewMode(false);
    setPageSettingsOpen(false);
    setDynamicFormsUpgradeOpen(false);
    setMigrationLayoutId('');
  }, []);
  useEffect(() => {
    setFitCanvas(true);
  }, [page.apiName]);
  useEffect(() => {
    const previewArea = pagePreviewAreaRef.current;
    if (!fitCanvas || page.layoutMode !== 'free-canvas' || !previewArea) {
      setFitScale(1);
      return;
    }
    const updateScale = () => {
      const availableWidth = Math.max(1, previewArea.clientWidth - 72);
      setFitScale(canvasScaleToFitWidth(page.canvasWidth, availableWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(previewArea);
    return () => observer.disconnect();
  }, [fitCanvas, page.layoutMode, page.canvasWidth, page.canvasHeight]);
  useEffect(() => {
    if (page.pageType !== 'Record Page') setPaletteTab('Components');
  }, [page.pageType]);
  useEffect(() => {
    if (builderAppApiName) setRecordAppId(builderAppApiName);
  }, [builderAppApiName]);
  const selectSavedPage = (apiName: string) => {
    savedPageApiName.current = apiName;
    onSelectPage(apiName);
  };
  const changeTargetObject = (apiName: string) => {
    const existingPage = pages.find((item) => item.pageType === 'Record Page' && item.targetObject === apiName);
    const nextApiName = existingPage?.apiName ?? `${apiName.replace(/__c$/, '')}_Record_Page`;
    const nextObject = objects.find((item) => item.apiName === apiName);
    savedPageApiName.current = nextApiName;
    setMigrationLayoutId(nextObject?.pageLayoutAssignments?.[0]?.pageLayoutId ?? nextObject?.pageLayouts?.[0]?.id ?? '');
    onTargetObjectChange(apiName);
  };
  const applyPage = (nextPage: LightningPageMetadata) => {
    if (JSON.stringify(page) === JSON.stringify(nextPage)) return;
    setUndoStack((current) => [...current.slice(-49), page]);
    setRedoStack([]);
    onChange(nextPage);
  };
  const updateComponent = (id: string, update: Partial<LightningPageMetadata['components'][number]>) => {
    applyPage({ ...page, components: page.components.map((component) => component.id === id ? { ...component, ...update } : component) });
  };
  const startComponentPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    paletteResizeStart.current = { pointerId: event.pointerId, pointerX: event.clientX, width: componentPanelWidth };
  };
  const moveComponentPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = paletteResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setComponentPanelWidth(Math.min(440, Math.max(220, start.width + event.clientX - start.pointerX)));
  };
  const endComponentPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (paletteResizeStart.current?.pointerId === event.pointerId) paletteResizeStart.current = null;
  };
  const updateCustomProperties = (value: string) => {
    setCustomPropertiesDraft(value);
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Properties must be a JSON object.');
      }
      if (selected) updateComponent(selected.id, { properties: parsed as Record<string, unknown> });
      setCustomPropertiesError('');
    } catch (failure) {
      setCustomPropertiesError(failure instanceof Error ? failure.message : 'Enter valid JSON properties.');
    }
  };
  const startCanvasResize = (event: React.PointerEvent<HTMLButtonElement>, component: PageComponentMetadata) => {
    if (!component.position) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasResizeStart.current = {
      id: component.id,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: component.position.width,
      height: component.position.height
    };
    setSelectedId(component.id);
    setCanvasResizePreview({ id: component.id, width: component.position.width, height: component.position.height });
  };
  const moveCanvasResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = canvasResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const component = page.components.find((item) => item.id === start.id);
    if (!component) return;
    const definition = component.type.startsWith('Custom:')
      ? libraryComponents.find((item) => item.apiName === component.type.slice('Custom:'.length))
      : undefined;
    const minWidth = definition?.resize?.minWidth ?? 1;
    const minHeight = definition?.resize?.minHeight ?? 1;
    const x = component.position?.x ?? 0;
    const y = component.position?.y ?? 0;
    const maxWidth = Math.max(0, page.canvasWidth - x);
    const maxHeight = Math.max(0, page.canvasHeight - y);
    setCanvasResizePreview({
      id: component.id,
      width: Math.min(maxWidth, Math.max(Math.min(minWidth, maxWidth), start.width + canvasUnitsFromScreenDelta(event.clientX - start.pointerX, fitScale))),
      height: Math.min(maxHeight, Math.max(Math.min(minHeight, maxHeight), start.height + canvasUnitsFromScreenDelta(event.clientY - start.pointerY, fitScale)))
    });
  };
  const endCanvasResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = canvasResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const size = canvasResizePreview?.id === start.id ? canvasResizePreview : { id: start.id, width: start.width, height: start.height };
    const component = page.components.find((item) => item.id === start.id);
    if (component?.position) updateComponent(start.id, { position: { ...component.position, width: size.width, height: size.height } });
    canvasResizeStart.current = null;
    setCanvasResizePreview(null);
  };
  const hasOverlappingPageAssignment = (assignment: PageActivationAssignmentMetadata) =>
    (page.activationAssignments ?? []).some((existing) =>
      existing.scope === assignment.scope
      && existing.appId === assignment.appId
      && existing.profileId === assignment.profileId
      && existing.recordTypeId === assignment.recordTypeId
      && existing.formFactors.some((factor) => assignment.formFactors.includes(factor)));
  const addComponent = (type: string, position = page.components.length, region: 'header' | 'main' | 'sidebar' = 'main', canvasPosition?: PageComponentMetadata['position']) => {
    const customApiName = type.startsWith('Custom:') ? type.slice('Custom:'.length) : '';
    const custom = libraryComponents.find((item) => item.apiName === customApiName && item.surfaces.includes('page'));
    const dynamicFormComponent = type === 'Field Section' && page.pageType === 'Record Page' && dynamicFormsEnabled;
    if (!availableComponents.includes(type) && !custom && !dynamicFormComponent) {
      onNotify(`Enable the matching object feature before adding the ${type} component`);
      return;
    }
    const id = `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}`;
    const components = [...page.components];
    const defaultWidth = Math.min(page.canvasWidth, custom?.resize?.defaultWidth ?? 320);
    const defaultHeight = Math.min(page.canvasHeight, custom?.resize?.defaultHeight ?? 180);
    const freeCanvasPosition = page.layoutMode === 'free-canvas'
      ? {
        x: Math.min(canvasPosition?.x ?? 24 + (page.components.length * 24) % Math.max(1, page.canvasWidth - defaultWidth), page.canvasWidth - defaultWidth),
        y: Math.min(canvasPosition?.y ?? 24 + (page.components.length * 24) % Math.max(1, page.canvasHeight - defaultHeight), page.canvasHeight - defaultHeight),
        width: defaultWidth,
        height: defaultHeight
      }
      : undefined;
    components.splice(Math.max(0, Math.min(position, components.length)), 0, {
      id, type, label: custom?.label ?? type,
      properties: custom
        ? { libraryComponentId: custom.apiName }
        : type === 'Report Chart'
          ? { reportApiName: '' }
          : type === 'Related List'
            ? { relatedLists: defaultRelatedLists }
            : type === 'Field Section'
              ? { fieldApiNames: [], columns: 2 }
            : {},
      visible: true, region,
      ...(freeCanvasPosition ? { position: freeCanvasPosition } : {})
    });
    applyPage({ ...page, components });
    setSelectedId(id);
  };
  const addField = (fieldApiName: string) => {
    if (dynamicFormsEnabled) {
      const field = fields.find((item) => item.apiName === fieldApiName);
      if (!field) return;
      const id = `record-field-${crypto.randomUUID()}`;
      const component: PageComponentMetadata = {
        id,
        type: 'Record Field',
        label: field.label,
        properties: { fieldApiName },
        visible: true,
        region: 'main'
      };
      applyPage({ ...page, components: [...page.components, component] });
      setSelectedId(id);
      setPageSettingsOpen(false);
      return;
    }
    const detail = page.components.find((component) => component.type === 'Record Detail');
    if (!detail) {
      const id = `record-detail-${crypto.randomUUID()}`;
      applyPage({ ...page, components: [...page.components, { id, type: 'Record Detail', label: 'Record Detail', properties: { fields: [fieldApiName] }, visible: true }] });
      setSelectedId(id);
      return;
    }
    const currentFields = Array.isArray(detail.properties.fields) ? detail.properties.fields.filter((value): value is string => typeof value === 'string') : [];
    const nextFields = currentFields.includes(fieldApiName) ? currentFields.filter((value) => value !== fieldApiName) : [...currentFields, fieldApiName];
    updateComponent(detail.id, { properties: { ...detail.properties, fields: nextFields } });
    setSelectedId(detail.id);
  };
  const addFieldToSection = (sectionId: string, fieldApiName: string) => {
    const section = page.components.find((component) => component.id === sectionId && component.type === 'Field Section');
    if (!section) {
      addField(fieldApiName);
      return;
    }
    const fieldApiNames = stringList(section.properties.fieldApiNames, []);
    if (fieldApiNames.includes(fieldApiName)) return;
    updateComponent(sectionId, { properties: { ...section.properties, fieldApiNames: [...fieldApiNames, fieldApiName] } });
    setSelectedId(sectionId);
    setPageSettingsOpen(false);
  };
  const moveSectionField = (sectionId: string, fieldIndex: number, offset: -1 | 1) => {
    const section = page.components.find((component) => component.id === sectionId && component.type === 'Field Section');
    if (!section) return;
    const fieldApiNames = stringList(section.properties.fieldApiNames, []);
    const nextIndex = fieldIndex + offset;
    if (nextIndex < 0 || nextIndex >= fieldApiNames.length) return;
    [fieldApiNames[fieldIndex], fieldApiNames[nextIndex]] = [fieldApiNames[nextIndex]!, fieldApiNames[fieldIndex]!];
    updateComponent(sectionId, { properties: { ...section.properties, fieldApiNames } });
  };
  const upgradeRecordDetail = (recordDetail: PageComponentMetadata) => {
    if (!selectedMigrationLayout) {
      onNotify('Select a page layout before upgrading Record Detail to Dynamic Forms');
      return;
    }
    const sections = selectedMigrationLayout.sections.map((section) => ({
      id: `field-section-${crypto.randomUUID()}`,
      type: 'Field Section',
      label: section.label,
      properties: {
        fieldApiNames: [...new Set(section.fieldApiNames.filter((fieldApiName) => fields.some((field) => field.apiName === fieldApiName)))],
        columns: section.columns
      },
      visible: true,
      region: recordDetail.region ?? 'main' as const
    }));
    const migratedSections = sections.length ? sections : [{
      id: `field-section-${crypto.randomUUID()}`,
      type: 'Field Section',
      label: 'Record Details',
      properties: { fieldApiNames: stringList(recordDetail.properties.fields, fields.slice(0, 6).map((field) => field.apiName)), columns: 2 },
      visible: true,
      region: recordDetail.region ?? 'main' as const
    }];
    const componentIndex = page.components.findIndex((component) => component.id === recordDetail.id);
    const components = [...page.components];
    components.splice(componentIndex, 1, ...migratedSections);
    applyPage({ ...page, components });
    setSelectedId(migratedSections[0].id);
    setDynamicFormsUpgradeOpen(false);
    onNotify(`Record Detail upgraded from ${selectedMigrationLayout.label}`);
  };
  const removeSelected = () => {
    if (!selected) return;
    const remaining = page.components.filter((component) => component.id !== selected.id);
    applyPage({ ...page, components: remaining });
    setSelectedId(remaining[0]?.id ?? '');
  };
  const addRecordAssignment = () => {
    const needsApp = recordScope !== 'Org Default';
    const needsProfile = recordScope === 'App and Profile' || recordScope === 'App, Record Type, and Profile';
    const needsRecordType = recordScope === 'App, Record Type, and Profile';
    const availableRecordTypes = (targetObject?.recordTypes ?? []).filter((recordType) => recordType.active);
    const formFactors = recordFormFactors.filter((factor) => page.devices.includes(factor));
    if (!formFactors.length
      || (needsApp && !recordAppId)
      || (needsProfile && !recordProfileId)
      || (needsRecordType && !availableRecordTypes.some((recordType) => recordType.id === recordTypeId))) {
      onNotify('Choose all required assignment values and at least one supported form factor');
      return;
    }
    const assignment: PageActivationAssignmentMetadata = {
      id: `record-activation-${crypto.randomUUID()}`,
      scope: recordScope,
      appId: needsApp ? recordAppId : null,
      profileId: needsProfile ? recordProfileId : null,
      recordTypeId: needsRecordType ? recordTypeId : null,
      formFactors
    };
    if (hasOverlappingPageAssignment(assignment)) {
      onNotify('An activation assignment already exists for this target and form factor');
      return;
    }
    applyPage({ ...page, activationAssignments: [...(page.activationAssignments ?? []), assignment] });
  };
  const addHomeAssignment = () => {
    const formFactors = homeFormFactors.filter((factor) => page.devices.includes(factor));
    if (!homeAppId || !formFactors.length || (homeScope === 'App and Profile' && !homeProfileId)) {
      onNotify('Choose an app, form factor, and profile when required');
      return;
    }
    const assignment: PageActivationAssignmentMetadata = {
      id: `home-activation-${crypto.randomUUID()}`,
      scope: homeScope,
      appId: homeAppId,
      profileId: homeScope === 'App and Profile' ? homeProfileId : null,
      recordTypeId: null,
      formFactors
    };
    if (hasOverlappingPageAssignment(assignment)) {
      onNotify('An activation assignment already exists for this app, profile, and form factor');
      return;
    }
    applyPage({ ...page, activationAssignments: [...(page.activationAssignments ?? []), assignment] });
  };
  const removePageAssignment = (id: string) => {
    const activationAssignments = (page.activationAssignments ?? []).filter((assignment) => assignment.id !== id);
    applyPage({
      ...page,
      activationAssignments,
      status: page.status === 'Active' && !activationAssignments.length ? 'Draft' : page.status
    });
  };
  const copySelected = () => {
    if (selected) setComponentClipboard(structuredClone(selected));
  };
  const cutSelected = () => {
    if (!selected) return;
    setComponentClipboard(structuredClone(selected));
    removeSelected();
  };
  const pasteComponent = () => {
    if (!componentClipboard) return;
    const pasted: PageComponentMetadata = {
      ...structuredClone(componentClipboard),
      id: `${componentClipboard.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}`,
      label: `${componentClipboard.label} Copy`,
      region: selected?.region ?? componentClipboard.region ?? 'main'
    };
    const components = [...page.components];
    const selectedIndex = selected ? components.findIndex((component) => component.id === selected.id) : -1;
    components.splice(selectedIndex < 0 ? components.length : selectedIndex + 1, 0, pasted);
    applyPage({ ...page, components });
    setSelectedId(pasted.id);
  };
  const moveSelected = (offset: number) => {
    if (!selected) return;
    const index = page.components.findIndex((component) => component.id === selected.id);
    const target = index + offset;
    if (target < 0 || target >= page.components.length) return;
    const components = [...page.components];
    [components[index], components[target]] = [components[target], components[index]];
    applyPage({ ...page, components });
  };
  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((current) => [...current, page]);
    setUndoStack((current) => current.slice(0, -1));
    onChange(previous);
    setSelectedId(previous.components[0]?.id ?? '');
  };
  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((current) => [...current, page]);
    setRedoStack((current) => current.slice(0, -1));
    onChange(next);
    setSelectedId(next.components[0]?.id ?? '');
  };
  const savePage = async (status?: 'Active' | 'Draft') => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(page.apiName)) {
      onNotify('API Name must start with a letter and contain only letters, numbers, and underscores');
      return;
    }
    if (pages.some((item) => item.apiName.toLowerCase() === page.apiName.toLowerCase()
      && item.apiName !== savedPageApiName.current)) {
      onNotify('A Lightning page with this API name already exists');
      return;
    }
    if (status === 'Active' && page.pageType === 'Record Page' && !page.activationAssignments?.length) {
      onNotify('Add at least one activation assignment before activating this record page');
      return;
    }
    if (status === 'Active' && page.pageType === 'Home Page' && !page.activationAssignments?.length) {
      onNotify('Assign this Home Page to an app or app and profile before activating it');
      return;
    }
    if (status === 'Active' && page.pageType === 'App Page' && apps.length === 0) {
      onNotify('Create a Lightning app before activating an App Page');
      return;
    }
    const nextPage = status ? { ...page, status } : page;
    setSaving(true);
    try {
      const saved = await onSave(nextPage, savedPageApiName.current);
      if (saved) {
        savedPageApiName.current = nextPage.apiName;
        setUndoStack([]);
        setRedoStack([]);
      }
    } finally {
      setSaving(false);
    }
  };
  const clonePage = async () => {
    const baseApiName = `${page.apiName}_Copy`;
    let apiName = baseApiName;
    let suffix = 2;
    while (pages.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      apiName = `${baseApiName}_${suffix}`;
      suffix += 1;
    }
    const cloned: LightningPageMetadata = {
      ...structuredClone(page),
      apiName,
      label: `${page.label} Copy`,
      updatedAt: undefined,
      status: 'Draft',
      activationAssignments: [],
      components: page.components.map((component) => ({
        ...component,
        id: `${component.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}`
      }))
    };
    setSaving(true);
    try {
      const saved = await onSave(cloned, apiName, 'Lightning page cloned as a new draft');
      if (saved) {
        savedPageApiName.current = apiName;
        setSelectedId(cloned.components[0]?.id ?? '');
        setPageSettingsOpen(cloned.components.length === 0);
        setPreviewMode(false);
        setUndoStack([]);
        setRedoStack([]);
      }
    } finally {
      setSaving(false);
    }
  };
  const createPage = () => {
    const label = newPageLabel.trim();
    if (!label) return;
    const baseApiName = label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'New_Page';
    const apiName = /^[A-Za-z]/.test(baseApiName) ? baseApiName : `Page_${baseApiName}`;
    if (page.apiName.toLowerCase() === apiName.toLowerCase() || pages.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      onNotify('A Lightning page with this API name already exists');
      return;
    }
    onChange({
      apiName, label, targetObject: targetObject?.apiName ?? objects[0]?.apiName ?? 'Account',
      pageType: newPageLayoutMode === 'free-canvas' ? 'Home Page' : newPageType,
      layoutMode: newPageLayoutMode,
      template: newPageTemplate,
      canvasWidth: newPageLayoutMode === 'free-canvas' ? 1080 : 1920,
      canvasHeight: newPageLayoutMode === 'free-canvas' ? 1920 : 1080,
      status: 'Draft', devices: ['Desktop', 'Phone'], components: [], activationAssignments: []
    });
    savedPageApiName.current = apiName;
    setSelectedId('');
    setPageSettingsOpen(true);
    setCreatePageOpen(false);
    setNewPageLabel('');
    setUndoStack([]);
    setRedoStack([]);
    setPreviewMode(false);
  };
  const setPageTemplate = (nextTemplate: LightningPageTemplate) => {
    const definition = pageTemplates.find((item) => item.id === nextTemplate);
    if (!definition) return;
    const availableRegions = new Set(definition.regions);
    applyPage({
      ...page,
      template: nextTemplate,
      components: page.components.map((component) => ({
        ...component,
        region: availableRegions.has(component.region ?? 'main') ? component.region ?? 'main' : 'main'
      }))
    });
  };
  const setPageLayoutMode = (layoutMode: LightningPageMetadata['layoutMode']) => {
    if (layoutMode === 'free-canvas') {
      if (page.pageType !== 'Home Page') {
        onNotify('Free Canvas is available on Home Pages. Create a Home Page to use it.');
        return;
      }
      if (page.components.some((component) => !component.type.startsWith('Custom:'))) {
        onNotify('Remove standard components before switching this page to Free Canvas');
        return;
      }
      applyPage({
        ...page,
        layoutMode,
        components: page.components.map((component, index) => ({
          ...component,
          position: component.position ?? {
            x: Math.min(24 + index * 24, page.canvasWidth - 320),
            y: Math.min(24 + index * 24, page.canvasHeight - 180),
            width: 320,
            height: 180
          }
        }))
      });
    } else {
      applyPage({ ...page, layoutMode });
    }
  };
  const canvasPositionFromEvent = (event: React.DragEvent<HTMLElement>) => {
    const canvas = event.currentTarget.closest('.page-stage')?.querySelector<HTMLElement>('.free-canvas-stage');
    if (!canvas) return undefined;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = page.canvasWidth / bounds.width;
    const scaleY = page.canvasHeight / bounds.height;
    return {
      x: Math.min(Math.max(0, Math.round((event.clientX - bounds.left) * scaleX)), page.canvasWidth - 320),
      y: Math.min(Math.max(0, Math.round((event.clientY - bounds.top) * scaleY)), page.canvasHeight - 180),
      width: 320,
      height: 180
    };
  };
  const moveCanvasComponent = (event: React.DragEvent<HTMLElement>, component: PageComponentMetadata) => {
    if (page.layoutMode !== 'free-canvas' || previewMode) return;
    const nextPosition = canvasPositionFromEvent(event);
    if (!nextPosition || !component.position) return;
    updateComponent(component.id, {
      position: {
        ...component.position,
        x: Math.min(nextPosition.x, page.canvasWidth - component.position.width),
        y: Math.min(nextPosition.y, page.canvasHeight - component.position.height)
      }
    });
  };
  const handleDrop = (event: React.DragEvent<HTMLElement>, targetIndex = page.components.length, region: 'header' | 'main' | 'sidebar' = 'main') => {
    event.preventDefault();
    event.stopPropagation();
    const data = event.dataTransfer.getData('text/plain');
    setDragOverId('');
    if (data.startsWith('component:')) {
      const draggedId = event.dataTransfer.getData('application/x-metadrive-component-id');
      if (!draggedId) {
        addComponent(data.slice('component:'.length), targetIndex, region,
          page.layoutMode === 'free-canvas' ? canvasPositionFromEvent(event) : undefined);
        return;
      }
      if (page.layoutMode === 'free-canvas') {
        const draggedComponent = page.components.find((component) => component.id === draggedId);
        if (draggedComponent) moveCanvasComponent(event, draggedComponent);
        return;
      }
      const sourceIndex = page.components.findIndex((component) => component.id === draggedId);
      if (sourceIndex < 0) return;
      const components = [...page.components];
      const [draggedComponent] = components.splice(sourceIndex, 1);
      if (!draggedComponent) return;
      const targetElement = event.currentTarget;
      const isComponentTarget = targetElement.classList.contains('record-component');
      const insertAfterTarget = isComponentTarget
        && event.clientY > targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2;
      const dropIndex = targetIndex + (insertAfterTarget ? 1 : 0);
      const insertionIndex = sourceIndex < dropIndex ? dropIndex - 1 : dropIndex;
      components.splice(Math.max(0, Math.min(insertionIndex, components.length)), 0, { ...draggedComponent, region });
      applyPage({ ...page, components });
      setSelectedId(draggedId);
    } else if (data.startsWith('field:')) {
      const sectionId = event.currentTarget.getAttribute('data-component-id');
      if (sectionId && page.components.some((component) => component.id === sectionId && component.type === 'Field Section')) {
        addFieldToSection(sectionId, data.slice('field:'.length));
      } else {
        addField(data.slice('field:'.length));
      }
    }
  };
  const renderPageComponent = (component: LightningPageMetadata['components'][number], index: number, libraryPreview = false) => {
    if (!component.visible) return null;
    const customDefinition = component.type.startsWith('Custom:')
      ? libraryComponents.find((item) => item.apiName === component.type.slice('Custom:'.length))
      : undefined;
    const previewProperties = createComponentPreviewProps(
      customDefinition?.apiName ?? component.type,
      component.label,
      customDefinition?.description ?? selectedComponentDescription
    );
    const customPreviewProps = {
      ...previewProperties,
      ...component.properties,
      label: component.label,
      properties: component.properties,
      object: page.pageType === 'Record Page' ? targetObject : undefined,
      device,
      preview: true,
      disabled: true,
      onAction: previewProperties.onAction,
      onChange: previewProperties.onChange,
      onNavigate: previewProperties.onNavigate
    };
    const accordionContent = typeof component.properties.content === 'string' && component.properties.content.trim()
      ? component.properties.content
      : 'Review account details to confirm renewal dates and billing preferences.';
    return <div
      key={component.id}
      ref={libraryPreview ? (element) => { if (element) element.inert = true; } : undefined}
      className={`record-component ${!libraryPreview && page.layoutMode === 'free-canvas' ? 'free-canvas-component' : ''} ${libraryPreview ? 'component-rendered-preview' : ''} ${selectedId === component.id && !previewMode && !libraryPreview ? 'selected' : ''} ${dragOverId === component.id && !libraryPreview ? 'drop-target' : ''}`}
      style={!libraryPreview && page.layoutMode === 'free-canvas' ? {
        left: component.position?.x ?? 0,
        top: component.position?.y ?? 0,
        width: canvasResizePreview?.id === component.id ? canvasResizePreview.width : component.position?.width ?? customDefinition?.resize?.defaultWidth ?? 320,
        height: canvasResizePreview?.id === component.id ? canvasResizePreview.height : component.position?.height ?? customDefinition?.resize?.defaultHeight ?? 180
      } : undefined}
      onClick={!libraryPreview ? () => { if (!previewMode) { setSelectedId(component.id); setPageSettingsOpen(false); } } : undefined}
      onClickCapture={libraryPreview ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
      onKeyDown={!libraryPreview ? (event) => { if (!previewMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedId(component.id); setPageSettingsOpen(false); } } : undefined}
      onDragOver={!libraryPreview ? (event) => { event.preventDefault(); setDragOverId(component.id); } : undefined}
      onDragLeave={!libraryPreview ? () => setDragOverId('') : undefined}
      onDrop={!libraryPreview ? (event) => handleDrop(event, index, component.region ?? 'main') : undefined}
      draggable={!previewMode && !libraryPreview}
      data-component-id={libraryPreview ? undefined : component.id}
      onDragStart={!libraryPreview ? (event) => { event.dataTransfer.setData('text/plain', `component:${component.type}`); event.dataTransfer.setData('application/x-metadrive-component-id', component.id); } : undefined}
      onDragEnd={!libraryPreview ? (event) => moveCanvasComponent(event, component) : undefined}
      role={libraryPreview ? undefined : 'button'} tabIndex={previewMode || libraryPreview ? -1 : 0} aria-label={libraryPreview ? undefined : `${component.label} component`}
      aria-hidden={libraryPreview || undefined}
    >
      {!previewMode && !libraryPreview && <div className="record-component-head"><GripVertical size={15} /><strong>{component.label}</strong><span>{component.type}</span><MoreHorizontal size={16} /></div>}
      {component.type === 'Record Detail'
        ? <div className="record-detail-grid">{(Array.isArray(component.properties.fields) ? component.properties.fields : fields.slice(0, 6).map((field) => field.apiName)).map((apiName) => { const field = fields.find((item) => item.apiName === apiName); return field ? <div className="record-detail-field" key={apiName}><small>{field.label}</small><span>{field.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</span></div> : null; })}</div>
        : component.type === 'Field Section'
          ? <div className={`record-detail-grid columns-${component.properties.columns === 1 ? 1 : 2}`}>{stringList(component.properties.fieldApiNames, []).map((apiName) => fields.find((field) => field.apiName === apiName)).filter((field): field is FieldMetadata => Boolean(field)).map((field) => <div className="record-detail-field" key={field.apiName}><small>{field.label}</small><span>{field.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</span></div>)}</div>
          : component.type === 'Record Field'
            ? (() => {
              const field = fields.find((item) => item.apiName === component.properties.fieldApiName);
              return <div className="record-detail-field"><small>{field?.label ?? component.label}</small><span>{field?.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</span></div>;
            })()
          : component.type === 'Related List'
          ? <div className="fake-related">{stringList(component.properties.relatedLists, defaultRelatedLists).map((list) => <span key={list}>{relatedListOptions.find((option) => option.apiName === list)?.label ?? list} <small>View all</small></span>)}</div>
          : component.type === 'Tabs'
            ? <div className="fake-tabs">{stringList(component.properties.tabs, ['Related', 'Details', 'News']).map((tab, tabIndex) => <span className={tabIndex === 0 ? 'selected-tab' : ''} key={`${tab}-${tabIndex}`}>{tab}</span>)}</div>
            : component.type === 'Highlights Panel'
              ? libraryPreview
                ? <div className="component-demo-highlights"><strong>Northwind Traders</strong><div><span>Account owner <b>Alex Morgan</b></span><span>Industry <b>Technology</b></span><span>Annual revenue <b>$2.4M</b></span></div></div>
                : <div className="component-content-hint">Record actions and key fields appear in the highlights panel.</div>
              : component.type === 'Report Chart'
                ? <div className="report-chart-preview">
                  <strong>{reports.find((report) => report.apiName === component.properties.reportApiName)?.label ?? 'Opportunities by stage'}</strong>
                  <div className="report-chart-bars"><span /><span /><span /><span /><span /></div>
                </div>
                : component.type === 'Accordion'
                  ? libraryPreview
                      ? <div className="component-demo-accordion"><strong>Account overview <ChevronDown size={12} /></strong><p>{accordionContent}</p><span>Billing and service details</span></div>
                      : <div className="component-demo-accordion"><strong>{component.label} <ChevronDown size={12} /></strong><p>{accordionContent}</p></div>
                  : component.type === 'Activities' && libraryPreview
                    ? <div className="component-demo-activity"><strong>Recent activity</strong><span>Call with Jordan Lee <small>Today · 10:30 AM</small></span><span>Follow-up email sent <small>Yesterday</small></span></div>
                    : component.type === 'Chatter' && libraryPreview
                      ? <div className="component-demo-activity"><strong>Latest update</strong><span>Alex Morgan shared a project update.</span><small>2 comments · 4 likes</small></div>
                  : customDefinition
                    ? <RegisteredComponent definition={customDefinition} props={libraryPreview ? customPreviewProps : {
                      ...component.properties,
                      label: component.label,
                      properties: component.properties,
                      object: page.pageType === 'Record Page' ? targetObject : undefined,
                      device
                    }} />
                    : libraryPreview
                      ? <div className="component-demo-fallback"><strong>{component.label}</strong><span>{selectedComponentDescription || 'Preview of a reusable page component.'}</span><div><i /><i /><i /></div></div>
                      : <div className="component-demo-fallback"><strong>{component.label}</strong><span>This component is no longer registered. Re-register it to restore its live preview.</span><div><i /><i /><i /></div></div>}
      {!libraryPreview && page.layoutMode === 'free-canvas' && customDefinition && selectedId === component.id && !previewMode
        && <button type="button" className="free-canvas-resize-handle" aria-label={`Resize ${component.label}`}
          title="Drag to resize" onPointerDown={(event) => startCanvasResize(event, component)}
          onPointerMove={moveCanvasResize} onPointerUp={endCanvasResize} onPointerCancel={endCanvasResize}
          onClick={(event) => event.stopPropagation()} />}
    </div>;
  };
  const renderRegion = (region: 'header' | 'main' | 'sidebar') => {
    const regionComponents = page.components
      .map((component, index) => ({ component, index }))
      .filter(({ component }) => (component.region ?? 'main') === region);
    return <section
      className={`page-region page-region-${region}`}
      aria-label={`${region[0].toUpperCase()}${region.slice(1)} region`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => handleDrop(event, page.components.length, region)}
    >
      <div className="page-region-label">{region}</div>
      {regionComponents.map(({ component, index }) => renderPageComponent(component, index))}
      {!regionComponents.length && <div className="canvas-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, page.components.length, region)}><Plus size={15} /><span>{previewMode ? 'Empty region' : 'Drag components here or choose one from the left'}</span></div>}
      {regionComponents.length > 0 && !previewMode && <div className="canvas-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, page.components.length, region)}><Plus size={15} /><span>Drop here to add to {region}</span></div>}
    </section>;
  };
  const selectedRelatedLists = selected
    ? stringList(selected.properties.relatedLists, defaultRelatedLists)
    : defaultRelatedLists;
  const componentRelatedListOptions = [
    ...relatedListOptions,
    ...selectedRelatedLists
      .filter((name) => !relatedListOptions.some((option) => option.apiName === name))
      .map((apiName) => ({ apiName, label: apiName }))
  ];
  const addPaletteComponent = (type: string) => {
    const selectedIndex = page.components.findIndex((component) => component.id === selectedId);
    const selectedRegion = page.components[selectedIndex]?.region ?? 'main';
    addComponent(type, selectedIndex >= 0 ? selectedIndex + 1 : page.components.length, selectedRegion);
  };
  const renderPaletteComponentPreview = (component: typeof paletteComponents[number]) => renderPageComponent({
    id: `palette-preview-${component.id}`,
    type: component.type,
    label: component.label,
    properties: {},
    visible: true,
    region: 'main'
  }, -1, true);
  return (
    <div className="builder-page">
      <div className="builder-titlebar">
        <div className="builder-page-select">
          <div className="eyebrow">Lightning App Builder</div>
          <div className="builder-title-controls">
            <button className="btn btn-small" title="Return to Setup without saving" aria-label="Return to Setup without saving" onClick={onExit}><ArrowLeft size={13} />Setup</button>
            <select className="builder-app-select" aria-label="Select Lightning app context" value={builderAppApiName} onChange={(event) => setBuilderAppApiName(event.target.value)}>
              <option value="">All recent pages</option>
              {apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
            </select>
            <select aria-label="Select Lightning page" value={page.apiName} onChange={(event) => selectSavedPage(event.target.value)}>
              {pagePickerPages.map((item) => <option key={item.apiName} value={item.apiName}>
                {item.label} · {item.pageType}{builderApp && item.apiName === page.apiName && !currentPageIsAssignedToBuilderApp ? ' · Current page' : ''}
              </option>)}
            </select>
            <button className="btn btn-small" onClick={() => {
              setNewPageLayoutMode('template');
              setNewPageType('Record Page');
              setNewPageTemplate('header-main-sidebar');
              setCreatePageOpen(true);
            }}><Plus size={13} />New Page</button>
          </div>
        </div>
        <div className="toolbar-actions">
          <span className={page.status === 'Active' ? 'page-status-badge active' : 'page-status-badge'}>{page.status}</span>
          <button className={appSettingsOpen ? 'btn active' : 'btn'} onClick={() => setAppSettingsOpen(true)}><Settings2 size={14} />App Settings</button>
          <button className="btn" disabled={saving} onClick={() => void clonePage()}><Copy size={14} />Clone</button>
          <button className={previewMode ? 'btn active' : 'btn'} onClick={() => setPreviewMode((current) => !current)}><Eye size={14} />{previewMode ? 'Exit preview' : 'Preview'}</button>
          <button className="btn" disabled={saving} onClick={() => void savePage()}><Save size={14} />{saving ? 'Saving…' : 'Save'}</button>
          {page.status === 'Active'
            ? <button className="btn" disabled={saving} onClick={() => void savePage('Draft')}><Check size={14} />Deactivate</button>
            : <button className="btn btn-brand" disabled={saving} onClick={() => void savePage('Active')}><Check size={14} />Activate</button>}
        </div>
      </div>
      <div className="builder-meta-bar">
        <span>{page.pageType}</span><span className="meta-separator">·</span>
        {page.pageType === 'Record Page' && <select aria-label="Page object" value={page.targetObject} onChange={(event) => onTargetObjectChange(event.target.value)}>{objects.map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}</select>}
        <span className="meta-separator">·</span>
        <div className="device-picker" role="group" aria-label="Preview device">
          <button aria-label="Desktop preview" className={device === 'Desktop' ? 'device-choice active' : 'device-choice'} onClick={() => setDevice('Desktop')}><Monitor size={14} /><span>Desktop</span></button>
          <button aria-label="Tablet preview" className={device === 'Tablet' ? 'device-choice active' : 'device-choice'} onClick={() => setDevice('Tablet')}><Tablet size={14} /><span>Tablet</span></button>
          <button aria-label="Phone preview" className={device === 'Phone' ? 'device-choice active' : 'device-choice'} onClick={() => setDevice('Phone')}><Smartphone size={14} /><span>Phone</span></button>
        </div>
        <div className="device-picker orientation-picker" role="group" aria-label="Canvas orientation">
          <button aria-label="Portrait orientation" aria-pressed={orientation === 'Portrait'} className={orientation === 'Portrait' ? 'device-choice active' : 'device-choice'}
            onClick={() => { const dimensions = canvasDimensionsForOrientation(page.canvasWidth, page.canvasHeight, 'Portrait'); applyPage({ ...page, canvasWidth: dimensions.width, canvasHeight: dimensions.height }); }}>
            <span>Portrait</span>
          </button>
          <button aria-label="Landscape orientation" aria-pressed={orientation === 'Landscape'} className={orientation === 'Landscape' ? 'device-choice active' : 'device-choice'}
            onClick={() => { const dimensions = canvasDimensionsForOrientation(page.canvasWidth, page.canvasHeight, 'Landscape'); applyPage({ ...page, canvasWidth: dimensions.width, canvasHeight: dimensions.height }); }}>
            <span>Landscape</span>
          </button>
        </div>
        <button
          className={pageSettingsOpen ? 'text-action settings-active' : 'text-action'}
          aria-expanded={pageSettingsOpen || Boolean(selected)}
          aria-controls="lightning-page-properties"
          onClick={() => { setSelectedId(''); setPageSettingsOpen((current) => !current); }}
        >Page properties</button>
      </div>
      {appSettingsOpen && <div className="app-builder-settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAppSettingsOpen(false); }}>
        <section className="app-builder-settings-modal" role="dialog" aria-modal="true" aria-label="Lightning app settings" onMouseDown={(event) => event.stopPropagation()}>
          <AppManager
            apps={apps}
            objects={objects}
            pages={pages}
            onSave={onSaveApp}
            onDelete={onDeleteApp}
            embedded
            onClose={() => setAppSettingsOpen(false)}
            initialSelectedApiName={builderAppApiName}
            onSelectedAppChange={setBuilderAppApiName}
            onOpenPage={(apiName) => {
              setAppSettingsOpen(false);
              selectSavedPage(apiName);
            }}
          />
        </section>
      </div>}
      <div className="page-builder-layout" style={{ '--component-panel-width': `${componentPanelWidth}px` } as React.CSSProperties}>
        <aside className="component-panel">
          <div className="builder-tabs">
            <button className={paletteTab === 'Components' ? 'active' : ''} onClick={() => setPaletteTab('Components')}>Components</button>
            {page.pageType === 'Record Page' && <button className={paletteTab === 'Fields' ? 'active' : ''} onClick={() => setPaletteTab('Fields')}>Fields</button>}
          </div>
          <div className="component-search"><Search size={14} /><input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder={`Search ${paletteTab.toLowerCase()}…`} aria-label={`Search ${paletteTab.toLowerCase()}`} /></div>
          {paletteTab === 'Components' ? <>
            {page.layoutMode === 'free-canvas' && <div className="palette-note">Free Canvas uses registered components from the shared library.</div>}
            <nav className="component-category-list" aria-label="Component categories">
              {pageBuilderPaletteCategories.map((category) => {
                const count = category === 'All Components' ? paletteComponents.length
                  : category === 'Favourites' ? paletteComponents.filter((component) => favouriteComponents.includes(component.id)).length
                    : paletteComponents.filter((component) => component.categories.includes(category)).length;
                return <button type="button" key={category}
                  className={paletteCategory === category ? 'component-category active' : 'component-category'}
                  aria-pressed={paletteCategory === category} onClick={() => setPaletteCategory(category)}
                  title={`Show ${category.toLowerCase()} components`}>
                  <span>{category}</span><small>{count}</small>
                </button>;
              })}
            </nav>
            <div className="component-grid" aria-live="polite">
              {filteredPaletteComponents.map((component) => {
                const isFavourite = favouriteComponents.includes(component.id);
                return <article className="component-library-card" key={component.id}
                  draggable={!previewMode}
                  title={`${component.label}: ${component.description}`}
                  aria-label={`${component.label}: ${component.description}. Click to add or drag to the canvas.`}
                  onClick={() => addPaletteComponent(component.type)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      addPaletteComponent(component.type);
                    }
                  }}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', `component:${component.type}`)}
                  role="button" tabIndex={previewMode ? -1 : 0}>
                  <div className="component-card-preview">{renderPaletteComponentPreview(component)}</div>
                  <div className="component-card-copy">
                    <strong>{component.label}</strong>
                    <span>{component.description}</span>
                  </div>
                  <button type="button" className={isFavourite ? 'component-favourite active' : 'component-favourite'}
                    aria-label={`${isFavourite ? 'Remove' : 'Add'} ${component.label} ${isFavourite ? 'from' : 'to'} favourites`}
                    title={`${isFavourite ? 'Remove from' : 'Add to'} favourites`}
                    onClick={(event) => { event.stopPropagation(); toggleFavourite(component.id); }}
                    onKeyDown={(event) => event.stopPropagation()}>
                    <Star size={14} fill={isFavourite ? 'currentColor' : 'none'} />
                  </button>
                </article>;
              })}
              {filteredPaletteComponents.length === 0 && <div className="palette-empty component-grid-empty">
                <strong>No matching components</strong>
                <span>Try another category or search by component name, description, or category.</span>
              </div>}
            </div>
            {availableComponents.length !== pageTypeComponents.length && <div className="palette-note">Some components require object features to be enabled.</div>}
          </> : <>
            <div className="component-group-label">{targetObject?.label ?? 'Object'} Fields</div>
            {fields.filter((field) => `${field.label} ${field.apiName} ${field.dataType}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())).map((field) => <button className="component-option field-option" draggable={!previewMode} key={field.apiName} title={`${field.label} · ${field.dataType}`} onClick={() => addField(field.apiName)} onDragStart={(event) => event.dataTransfer.setData('text/plain', `field:${field.apiName}`)}><span className="component-option-icon"><Database size={13} /></span><span><strong>{field.label}</strong><small>{field.dataType}</small></span><Plus size={14} /></button>)}
            {fields.filter((field) => `${field.label} ${field.apiName} ${field.dataType}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())).length === 0 && <div className="palette-empty">No matching fields</div>}
          </>}
          <button type="button" className="component-panel-resize" aria-label="Resize component library panel"
            title="Drag to resize this panel"
            onPointerDown={startComponentPanelResize} onPointerMove={moveComponentPanelResize}
            onPointerUp={endComponentPanelResize} onPointerCancel={endComponentPanelResize} />
        </aside>
        <div className="page-preview-area" ref={pagePreviewAreaRef}>
          <div className="preview-toolbar">
            <span><strong>{page.label}</strong><small>{page.pageType} · {page.status}{page.layoutMode === 'free-canvas' ? ` · ${page.canvasWidth} × ${page.canvasHeight}px` : ''}</small></span>
            <div>
              {page.layoutMode === 'free-canvas' && <button
                className={fitCanvas ? 'icon-button subtle active' : 'icon-button subtle'}
                aria-label={fitCanvas ? 'Restore canvas size' : 'Fit canvas to view'}
                title={fitCanvas ? 'Restore canvas size' : 'Fit canvas to view'}
                onClick={() => setFitCanvas((current) => !current)}
              ><Maximize2 size={14} /></button>}
              <button className="icon-button subtle" aria-label="Refresh canvas" title="Refresh canvas" onClick={() => setCanvasRefreshKey((current) => current + 1)}><RefreshCw size={14} /></button>
              <button className="icon-button subtle" aria-label="Undo" title="Undo" disabled={!undoStack.length || previewMode} onClick={undo}><Undo2 size={15} /></button>
              <button className="icon-button subtle" aria-label="Redo" title="Redo" disabled={!redoStack.length || previewMode} onClick={redo}><Redo2 size={15} /></button>
              <button className="icon-button subtle" aria-label="Cut component" title="Cut" disabled={!selected || previewMode} onClick={cutSelected}><Scissors size={14} /></button>
              <button className="icon-button subtle" aria-label="Copy component" title="Copy" disabled={!selected || previewMode} onClick={copySelected}><Copy size={14} /></button>
              <button className="icon-button subtle" aria-label="Paste component" title="Paste" disabled={!componentClipboard || previewMode} onClick={pasteComponent}><ClipboardPaste size={14} /></button>
              <button className={previewMode ? 'icon-button subtle active' : 'icon-button subtle'} aria-label="Preview" title="Preview" onClick={() => setPreviewMode((current) => !current)}><Eye size={15} /></button>
              <a className="icon-button subtle" aria-label="Lightning App Builder help" title="Lightning App Builder help" href="https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_intro" target="_blank" rel="noreferrer"><CircleHelp size={14} /></a>
            </div>
          </div>
          <div className="page-stage" key={canvasRefreshKey} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event)}>
            <div
              className={`record-preview ${page.layoutMode === 'free-canvas' ? 'free-canvas-preview' : page.pageType === 'Record Page' ? 'record-page-preview' : page.pageType === 'App Page' ? 'app-page-preview' : 'home-page-preview'} ${device === 'Phone' ? 'phone-preview' : device === 'Tablet' ? 'tablet-preview' : ''}`}
              style={page.layoutMode === 'free-canvas' && fitCanvas ? {
                width: page.canvasWidth * fitScale,
                height: page.canvasHeight * fitScale,
                minHeight: 0,
                overflow: 'hidden'
              } : undefined}
            >
              {page.layoutMode === 'free-canvas' ? <div
                className="free-canvas-stage"
                style={{
                  width: page.canvasWidth,
                  height: page.canvasHeight,
                  transform: fitCanvas ? `scale(${fitScale})` : undefined,
                  transformOrigin: 'top left'
                }}
              >
                {page.components.map((component, index) => renderPageComponent(component, index))}
                {!page.components.length && <div className="free-canvas-empty">Add custom components from the left panel.</div>}
              </div> : <>
              {page.pageType === 'Record Page' ? <>
                <div className="record-preview-nav">
                  <div className="record-object-icon">{(targetObject?.label ?? page.targetObject).charAt(0)}</div>
                  <div><strong>{targetObject?.label ?? page.targetObject} preview</strong><small>{page.targetObject} · Recently Viewed</small></div>
                  <button className="btn">Follow</button><button className="btn">Edit</button><button className="icon-button subtle" aria-label="More record actions"><ChevronDown size={14} /></button>
                </div>
                {page.components.some((component) => component.type === 'Highlights Panel' && component.visible) && <div className="record-highlight">{fields.slice(0, 5).map((field) => <div key={field.apiName}><small>{field.label}</small><strong>{field.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</strong></div>)}</div>}
                {page.components.some((component) => component.type === 'Tabs' && component.visible) && <div className="record-tabs">{stringList(page.components.find((component) => component.type === 'Tabs')?.properties.tabs, ['Related', 'Details', 'News']).map((tab, index) => <button className={index === 0 ? 'active' : ''} key={`${tab}-${index}`}>{tab}</button>)}</div>}
              </> : page.pageType === 'App Page' ? <div className="app-page-shell-header"><div className="record-object-icon"><Grid2X2 size={17} /></div><div><small>Lightning App</small><strong>{page.label}</strong></div></div> : <div className="home-page-shell-header"><small>HOME</small><strong>{page.label}</strong><span>Your workspace overview</span></div>}
              <div className={`page-template-regions template-${template.id}`}>
                {template.regions.includes('header') && renderRegion('header')}
                <div className="page-template-content">
                  {renderRegion('main')}
                  {template.regions.includes('sidebar') && renderRegion('sidebar')}
                </div>
              </div>
              </>}
            </div>
          </div>
        </div>
        <aside id="lightning-page-properties" className={`properties-panel ${pageSettingsOpen || selected ? 'responsive-open' : ''}`}>
          <div className="properties-header"><h2>{pageSettingsOpen || !selected ? 'Page properties' : 'Properties'}</h2>{selected && !pageSettingsOpen && <button className="icon-button subtle" onClick={removeSelected} aria-label="Remove component"><Trash2 size={15} /></button>}</div>
          {selected && !pageSettingsOpen ? <>
            <div className="properties-section-title">Component</div>
            <label className="form-label" htmlFor="page-component-type">Component type</label><div className="form-display" id="page-component-type">{selected.type}</div>
            <div className="selected-component-preview">
              <div className="selected-component-preview-frame">{renderPageComponent(selected, -1, true)}</div>
              <strong>{selected.label}</strong>
              {selectedComponentDescription && <p>{selectedComponentDescription}</p>}
            </div>
            <label className="form-label" htmlFor="page-component-label">Label</label><input id="page-component-label" className="form-control" value={selected.label} onChange={(event) => updateComponent(selected.id, { label: event.target.value })} />
            {selectedCustomDefinition && <>
              <div className="properties-section-title">Component properties</div>
              <label className="form-label" htmlFor="page-custom-component-properties">Properties (JSON)</label>
              <textarea id="page-custom-component-properties" className="form-control component-properties-json"
                aria-describedby="page-custom-component-properties-help"
                aria-invalid={Boolean(customPropertiesError)} value={customPropertiesDraft}
                onChange={(event) => updateCustomProperties(event.target.value)} />
              <p className="properties-help" id="page-custom-component-properties-help">Edit component settings as JSON. Valid changes update the canvas immediately; existing metadata bindings are retained unless you change them.</p>
              {customPropertiesError && <div className="auth-error component-properties-error" role="alert">{customPropertiesError}</div>}
            </>}
            {selected.type === 'Related List' && <>
              <div className="properties-section-title">Related Lists</div>
              {componentRelatedListOptions.map((option) => <label className="checkbox-row property-check" key={option.apiName}><input type="checkbox" checked={selectedRelatedLists.includes(option.apiName)} onChange={(event) => {
                updateComponent(selected.id, { properties: { ...selected.properties, relatedLists: event.target.checked ? [...selectedRelatedLists, option.apiName] : selectedRelatedLists.filter((item) => item !== option.apiName) } });
              }} />{option.label}</label>)}
              {!componentRelatedListOptions.length && <div className="palette-note">No related objects have a relationship to this record object.</div>}
            </>}
            {selected.type === 'Tabs' && <>
              <div className="properties-section-title">Tabs</div><label className="form-label" htmlFor="page-component-tabs">Tab labels</label>
              <textarea id="page-component-tabs" className="form-control" rows={3} value={stringList(selected.properties.tabs, ['Related', 'Details', 'News']).join('\n')} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, tabs: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })} />
            </>}
            {selected.type === 'Accordion' && <>
              <div className="properties-section-title">Accordion Content</div>
              <label className="form-label" htmlFor="page-component-accordion-content">Content</label>
              <textarea id="page-component-accordion-content" className="form-control" rows={4}
                value={typeof selected.properties.content === 'string' ? selected.properties.content : ''}
                onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, content: event.target.value } })} />
            </>}
            {selected.type === 'Report Chart' && <>
              <div className="properties-section-title">Report</div>
              <label className="form-label" htmlFor="page-component-report">Source report</label>
              <select id="page-component-report" className="form-control" value={typeof selected.properties.reportApiName === 'string' ? selected.properties.reportApiName : ''}
                onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, reportApiName: event.target.value } })}>
                <option value="">Select a report…</option>{reports.filter((report) =>
                  page.pageType !== 'Record Page' || report.objectApiName === page.targetObject)
                  .map((report) => <option key={report.apiName} value={report.apiName}>{report.label}</option>)}
              </select>
            </>}
            {selected.type === 'Record Detail' && <>
              <div className="properties-section-title">Displayed Fields</div>
              {fields.map((field) => {
                const displayedFields = (Array.isArray(selected.properties.fields) ? selected.properties.fields : fields.slice(0, 6).map((item) => item.apiName)) as string[];
                return <label className="checkbox-row property-check" key={field.apiName}><input type="checkbox" checked={displayedFields.includes(field.apiName)} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, fields: event.target.checked ? [...displayedFields, field.apiName] : displayedFields.filter((item) => item !== field.apiName) } })} />{field.label}</label>;
              })}
              {!dynamicFormsEnabled && <div className="dynamic-forms-upgrade">
                <button className="btn" type="button" onClick={() => setDynamicFormsUpgradeOpen((current) => !current)}>Upgrade Now</button>
                {dynamicFormsUpgradeOpen && <>
                  <p className="properties-help">Choose the page layout whose sections and fields should become Dynamic Forms components.</p>
                  <label className="form-label" htmlFor="dynamic-forms-layout">Page Layout
                    <select id="dynamic-forms-layout" className="form-control" value={migrationLayoutId || assignedMigrationLayout?.id || ''} onChange={(event) => setMigrationLayoutId(event.target.value)}>
                      {pageLayouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
                    </select>
                  </label>
                  {!pageLayouts.length && <div className="palette-note">No page layouts are available for this object.</div>}
                  <button className="btn btn-brand" type="button" disabled={!selectedMigrationLayout} onClick={() => upgradeRecordDetail(selected)}>Upgrade</button>
                </>}
              </div>}
            </>}
            {selected.type === 'Field Section' && <>
              <div className="properties-section-title">Section Fields</div>
              <label className="form-label" htmlFor="field-section-columns">Columns
                <select id="field-section-columns" className="form-control" value={selected.properties.columns === 1 ? 1 : 2} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, columns: Number(event.target.value) } })}>
                  <option value={1}>1</option><option value={2}>2</option>
                </select>
              </label>
              {fields.map((field) => {
                const fieldApiNames = stringList(selected.properties.fieldApiNames, []);
                const fieldIndex = fieldApiNames.indexOf(field.apiName);
                return <div className="dynamic-field-property-row" key={field.apiName}>
                  <label className="checkbox-row property-check">
                    <input type="checkbox" checked={fieldIndex >= 0} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, fieldApiNames: event.target.checked ? [...fieldApiNames, field.apiName] : fieldApiNames.filter((item) => item !== field.apiName) } })} />
                    {field.label}
                  </label>
                  {fieldIndex >= 0 && <div className="property-position-actions">
                    <button className="icon-button subtle" type="button" aria-label={`Move ${field.label} up`} title="Move up" disabled={fieldIndex === 0} onClick={() => moveSectionField(selected.id, fieldIndex, -1)}><ArrowUp size={13} /></button>
                    <button className="icon-button subtle" type="button" aria-label={`Move ${field.label} down`} title="Move down" disabled={fieldIndex === fieldApiNames.length - 1} onClick={() => moveSectionField(selected.id, fieldIndex, 1)}><ArrowDown size={13} /></button>
                  </div>}
                </div>;
              })}
            </>}
            {selected.type === 'Record Field' && <>
              <div className="properties-section-title">Field</div>
              <label className="form-label" htmlFor="record-field-selection">Record Field
                <select id="record-field-selection" className="form-control" value={typeof selected.properties.fieldApiName === 'string' ? selected.properties.fieldApiName : ''} onChange={(event) => {
                  const field = fields.find((item) => item.apiName === event.target.value);
                  updateComponent(selected.id, { label: field?.label ?? selected.label, properties: { ...selected.properties, fieldApiName: event.target.value } });
                }}>
                  {fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
                </select>
              </label>
            </>}
            {page.layoutMode === 'free-canvas' && selected.position && <div className="free-canvas-component-properties">
              <div className="properties-section-title">Position and Size (pixels)</div>
              {([
                ['x', 'Left'], ['y', 'Top'], ['width', 'Width'], ['height', 'Height']
              ] as const).map(([key, label]) => {
                const max = key === 'x' ? page.canvasWidth - selected.position!.width
                  : key === 'y' ? page.canvasHeight - selected.position!.height
                    : key === 'width' ? page.canvasWidth - selected.position!.x
                      : page.canvasHeight - selected.position!.y;
                const min = key === 'width' ? selectedCustomDefinition?.resize?.minWidth ?? 1
                  : key === 'height' ? selectedCustomDefinition?.resize?.minHeight ?? 1
                    : 0;
                return <label className="form-label" key={key}>{label}
                  <input className="form-control" type="number" min={min}
                    max={max}
                    value={selected.position![key]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isInteger(value)) return;
                      updateComponent(selected.id, { position: { ...selected.position!, [key]: Math.min(max, Math.max(min, value)) } });
                    }} />
                </label>;
              })}
            </div>}
            <div className="properties-section-title">Position</div>
            <div className="property-position-actions"><button className="btn" disabled={page.components[0]?.id === selected.id} onClick={() => moveSelected(-1)}><ArrowDown className="move-up-icon" size={13} />Move up</button><button className="btn" disabled={page.components[page.components.length - 1]?.id === selected.id} onClick={() => moveSelected(1)}><ArrowDown size={13} />Move down</button></div>
            <div className="properties-section-title">Visibility</div><label className="checkbox-row"><input type="checkbox" checked={selected.visible} onChange={(event) => updateComponent(selected.id, { visible: event.target.checked })} />Show component</label>
            <button className="btn btn-full" onClick={() => { setSelectedId(''); setPageSettingsOpen(true); }}>Done</button>
          </> : <>
            <p className="properties-help">Configure the page definition and supported form factors.</p>
            <label className="form-label" htmlFor="lightning-page-label">Label</label><input id="lightning-page-label" className="form-control" value={page.label} onChange={(event) => applyPage({ ...page, label: event.target.value })} />
            <label className="form-label" htmlFor="lightning-page-api">API Name</label><input id="lightning-page-api" className="form-control" value={page.apiName} onChange={(event) => applyPage({ ...page, apiName: event.target.value })} />
            {page.pageType === 'Record Page' && <><label className="form-label" htmlFor="lightning-page-object">Object</label><select id="lightning-page-object" className="form-control" value={page.targetObject} onChange={(event) => { setRecordTypeId(''); changeTargetObject(event.target.value); }}>{objects.map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}</select></>}
            {page.pageType === 'Record Page' && <div className="home-page-assignments">
              <div className="properties-section-title">Activation Assignments</div>
              <p className="properties-help">Set the apps, profiles, record types, and form factors that use this Record Page. More specific assignments take precedence over broader defaults.</p>
              {(page.activationAssignments ?? []).map((assignment) => <div className="home-page-assignment" key={assignment.id}>
                <span><strong>{assignment.scope === 'Org Default' ? 'Organization default' : apps.find((app) => app.apiName === assignment.appId)?.label ?? assignment.appId}</strong>
                  <small>{assignment.scope}
                    {assignment.profileId ? ` · ${profiles.find((profile) => profile.id === assignment.profileId)?.label ?? assignment.profileId}` : ''}
                    {assignment.recordTypeId ? ` · ${(targetObject?.recordTypes ?? []).find((recordType) => recordType.id === assignment.recordTypeId)?.label ?? assignment.recordTypeId}` : ''}
                    {` · ${assignment.formFactors.join(', ')}`}
                  </small></span>
                <button className="icon-button subtle" aria-label={`Remove ${assignment.scope} activation assignment`} onClick={() => removePageAssignment(assignment.id)}><Trash2 size={14} /></button>
              </div>)}
              <label className="form-label">Assign as<select className="form-control" value={recordScope} onChange={(event) => setRecordScope(event.target.value as PageActivationAssignmentMetadata['scope'])}>
                <option>Org Default</option><option>App Default</option><option>App and Profile</option>
                {(targetObject?.recordTypes ?? []).some((recordType) => recordType.active) && <option>App, Record Type, and Profile</option>}
              </select></label>
              {recordScope !== 'Org Default' && <label className="form-label">App<select className="form-control" value={recordAppId} onChange={(event) => setRecordAppId(event.target.value)}>
                <option value="">Select an app…</option>{apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
              </select></label>}
              {(recordScope === 'App and Profile' || recordScope === 'App, Record Type, and Profile') && <label className="form-label">Profile<select className="form-control" value={recordProfileId} onChange={(event) => setRecordProfileId(event.target.value)}>
                <option value="">Select a profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
              </select></label>}
              {recordScope === 'App, Record Type, and Profile' && <label className="form-label">Record Type<select className="form-control" value={recordTypeId} onChange={(event) => setRecordTypeId(event.target.value)}>
                <option value="">Select a record type…</option>{(targetObject?.recordTypes ?? []).filter((recordType) => recordType.active).map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}
              </select></label>}
              <div className="form-label">Form Factors</div>
              <div className="form-options">{(['Desktop', 'Phone'] as const).map((factor) => <label className="checkbox-row" key={factor}>
                <input type="checkbox" disabled={!page.devices.includes(factor)} checked={recordFormFactors.includes(factor) && page.devices.includes(factor)}
                  onChange={() => setRecordFormFactors((current) => current.includes(factor) ? current.filter((item) => item !== factor) : [...current, factor])} />
                {factor}
              </label>)}</div>
              <button className="btn btn-full" type="button" onClick={addRecordAssignment}>Add Record Page Assignment</button>
            </div>}
            {page.pageType === 'Home Page' && <div className="home-page-assignments">
              <div className="properties-section-title">Activation Assignments</div>
              <p className="properties-help">Assign this Home Page to an app, or to an app and profile.</p>
              {(page.activationAssignments ?? []).map((assignment) => <div className="home-page-assignment" key={assignment.id}>
                <span><strong>{apps.find((app) => app.apiName === assignment.appId)?.label ?? assignment.appId}</strong>
                  <small>{assignment.scope}{assignment.profileId ? ` · ${profiles.find((profile) => profile.id === assignment.profileId)?.label ?? assignment.profileId}` : ''} · {assignment.formFactors.join(', ')}</small></span>
                <button className="icon-button subtle" aria-label="Remove Home Page assignment" onClick={() => removePageAssignment(assignment.id)}><Trash2 size={14} /></button>
              </div>)}
              <label className="form-label">App<select className="form-control" value={homeAppId} onChange={(event) => setHomeAppId(event.target.value)}>
                <option value="">Select an app…</option>{apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
              </select></label>
              <label className="form-label">Assign as<select className="form-control" value={homeScope} onChange={(event) => setHomeScope(event.target.value as typeof homeScope)}>
                <option>App Default</option><option>App and Profile</option>
              </select></label>
              {homeScope === 'App and Profile' && <label className="form-label">Profile<select className="form-control" value={homeProfileId} onChange={(event) => setHomeProfileId(event.target.value)}>
                <option value="">Select a profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
              </select></label>}
              <div className="form-label">Form Factors</div>
              <div className="form-options">{(['Desktop', 'Phone'] as const).map((factor) => <label className="checkbox-row" key={factor}>
                <input type="checkbox" disabled={!page.devices.includes(factor)} checked={homeFormFactors.includes(factor) && page.devices.includes(factor)}
                  onChange={() => setHomeFormFactors((current) => current.includes(factor) ? current.filter((item) => item !== factor) : [...current, factor])} />
                {factor}
              </label>)}</div>
              <button className="btn btn-full" type="button" onClick={addHomeAssignment}>Add Home Page Assignment</button>
            </div>}
            <label className="form-label" htmlFor="lightning-page-layout-mode">Canvas mode</label>
            <select id="lightning-page-layout-mode" className="form-control" value={page.layoutMode}
              onChange={(event) => setPageLayoutMode(event.target.value as LightningPageMetadata['layoutMode'])}>
              <option value="template">Template</option>
              <option value="free-canvas" disabled={page.pageType !== 'Home Page'}>Free Canvas (Home Pages)</option>
            </select>
            {page.layoutMode === 'free-canvas' ? <>
              <p className="properties-help">A header-free canvas for custom library components, assigned using this Home Page's app/profile activation rules.</p>
              <div className="permission-form-grid">
                <label className="form-label" htmlFor="lightning-canvas-width">Width (px)<input id="lightning-canvas-width" className="form-control" type="number" min={320} max={7680} value={page.canvasWidth} onChange={(event) => {
                  const canvasWidth = Number(event.target.value);
                  if (!Number.isInteger(canvasWidth) || canvasWidth < 320 || canvasWidth > 7680) return;
                  applyPage({ ...page, canvasWidth, components: page.components.map((component) => {
                    if (!component.position) return component;
                    const width = Math.min(component.position.width, canvasWidth);
                    return { ...component, position: { ...component.position, width, x: Math.min(component.position.x, canvasWidth - width) } };
                  }) });
                }} /></label>
                <label className="form-label" htmlFor="lightning-canvas-height">Height (px)<input id="lightning-canvas-height" className="form-control" type="number" min={320} max={7680} value={page.canvasHeight} onChange={(event) => {
                  const canvasHeight = Number(event.target.value);
                  if (!Number.isInteger(canvasHeight) || canvasHeight < 320 || canvasHeight > 7680) return;
                  applyPage({ ...page, canvasHeight, components: page.components.map((component) => {
                    if (!component.position) return component;
                    const height = Math.min(component.position.height, canvasHeight);
                    return { ...component, position: { ...component.position, height, y: Math.min(component.position.y, canvasHeight - height) } };
                  }) });
                }} /></label>
              </div>
            </> : <label className="form-label" htmlFor="lightning-page-template">Page template</label>}
            {page.layoutMode === 'template' && <select id="lightning-page-template" className="form-control" value={template.id} onChange={(event) => setPageTemplate(event.target.value as LightningPageTemplate)}>{pageTemplates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
            <div className="properties-section-title">Supported Form Factors</div>
            {(['Desktop', 'Phone'] as const).map((formFactor) => <label className="checkbox-row property-check" key={formFactor}><input type="checkbox" checked={page.devices.includes(formFactor)} onChange={(event) => {
              const devices = event.target.checked ? [...page.devices, formFactor] : page.devices.filter((item) => item !== formFactor);
              if (!devices.length) { onNotify('At least one form factor must be selected'); return; }
              const activationAssignments = (page.activationAssignments ?? [])
                .map((assignment) => ({ ...assignment, formFactors: assignment.formFactors.filter((factor) => devices.includes(factor)) }))
                .filter((assignment) => assignment.formFactors.length > 0);
              applyPage({
                ...page,
                devices,
                activationAssignments,
                status: page.status === 'Active' && !activationAssignments.length ? 'Draft' : page.status
              });
            }} />{formFactor}</label>)}
            <div className="page-property-summary"><strong>{page.components.length}</strong> components <span>·</span> <strong>{page.status}</strong></div>
            <button className="btn btn-full" disabled={saving} onClick={() => void savePage()}>Save page properties</button>
          </>}
        </aside>
      </div>
      {createPageOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatePageOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-lightning-page-title"><div className="modal-header"><h2 id="create-lightning-page-title">Create a Lightning page</h2><button className="icon-button dark" onClick={() => setCreatePageOpen(false)} aria-label="Close"><X size={18} /></button></div><p className="modal-copy">Choose a page type and canvas mode.</p><label className="form-label" htmlFor="new-lightning-page-layout-mode">Canvas mode</label><select id="new-lightning-page-layout-mode" className="form-control" value={newPageLayoutMode} onChange={(event) => { const mode = event.target.value as LightningPageMetadata['layoutMode']; setNewPageLayoutMode(mode); if (mode === 'free-canvas') setNewPageType('Home Page'); }}><option value="template">Template</option><option value="free-canvas">Free Canvas</option></select><label className="form-label" htmlFor="new-lightning-page-type">Page type</label><select id="new-lightning-page-type" className="form-control" value={newPageType} disabled={newPageLayoutMode === 'free-canvas'} onChange={(event) => { const type = event.target.value as LightningPageMetadata['pageType']; setNewPageType(type); setNewPageTemplate(type === 'Record Page' ? 'header-main-sidebar' : 'main-sidebar'); }}>{['Record Page', 'App Page', 'Home Page'].map((type) => <option key={type}>{type}</option>)}</select>{newPageLayoutMode === 'template' && <><label className="form-label" htmlFor="new-lightning-page-template">Page template</label><select id="new-lightning-page-template" className="form-control" value={newPageTemplate} onChange={(event) => setNewPageTemplate(event.target.value as LightningPageTemplate)}>{pageTemplates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></>}<label className="form-label" htmlFor="new-lightning-page-label">Label</label><input id="new-lightning-page-label" className="form-control" autoFocus value={newPageLabel} onChange={(event) => setNewPageLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createPage(); }} placeholder="For example, Kiosk Ordering" /><div className="modal-actions"><button className="btn" onClick={() => setCreatePageOpen(false)}>Cancel</button><button className="btn btn-brand" disabled={!newPageLabel.trim()} onClick={createPage}><Plus size={14} />Create page</button></div></section></div>}
    </div>
  );
}

function ReportBuilder({
  reports, reportFolders, canManageReportFolders, accessControl, objects, onSave, onSaveFolder, onDelete, onRun, onPreview, onNotify
}: {
  reports: ReportMetadata[];
  reportFolders: ReportFolderMetadata[];
  canManageReportFolders: boolean;
  accessControl: AccessControlMetadata;
  objects: ObjectMetadata[];
  onSave: (report: ReportMetadata) => Promise<ReportMetadata>;
  onSaveFolder: (input: ReportFolderInput) => Promise<ReportFolderMetadata>;
  onDelete: (apiName: string) => Promise<void>;
  onRun: (
    apiName: string,
    filters?: DashboardFilterMetadata[],
    offset?: number,
    limit?: number,
    filterLogic?: DashboardMetadata['filterLogic'],
    crossFilters?: DashboardFilterMetadata[],
    dashboardApiName?: string,
    reportFilterOverrides?: Array<{ id: string; value: string; values: string[] }>
  ) => Promise<ReportRunMetadata>;
  onPreview: (
    report: ReportMetadata,
    reportFilterOverrides: Array<{ id: string; value: string; values: string[] }>,
    offset?: number,
    limit?: number
  ) => Promise<ReportRunMetadata>;
  onNotify: (message: string) => void;
}) {
  const availableObjects = objects.filter((item) => item.apiName !== 'User' && item.settings?.allowReports);
  const reportTypeCategoryForObject = (object: ObjectMetadata) => {
    if (object.kind === 'Custom Object') return 'Other Reports';
    const categories: Record<string, string> = {
      Account: 'Accounts & Contacts',
      Contact: 'Accounts & Contacts',
      Campaign: 'Campaigns',
      Case: 'Customer Support Reports',
      Lead: 'Leads',
      Opportunity: 'Opportunities',
      Asset: 'Products & Assets',
      Product2: 'Products & Assets'
    };
    return categories[object.apiName] ?? 'Other Reports';
  };
  const reportTypeCategories = [...new Set(availableObjects.map(reportTypeCategoryForObject))];
  const [selectedApiName, setSelectedApiName] = useState('');
  const [draft, setDraft] = useState<ReportMetadata | null>(null);
  const [result, setResult] = useState<ReportRunMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [fieldQuery, setFieldQuery] = useState('');
  const [reportTypeQuery, setReportTypeQuery] = useState('');
  const [outlineFieldQuery, setOutlineFieldQuery] = useState('');
  const [filterFieldQuery, setFilterFieldQuery] = useState('');
  const [reportTypeCategory, setReportTypeCategory] = useState<string>('All');
  const [selectedReportObjectApiName, setSelectedReportObjectApiName] = useState('');
  const [reportTypeSelectorOpen, setReportTypeSelectorOpen] = useState(false);
  const [builderTab, setBuilderTab] = useState<'Outline' | 'Filters'>('Outline');
  const [fieldsPanelOpen, setFieldsPanelOpen] = useState(false);
  const [runPage, setRunPage] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [runFilterValues, setRunFilterValues] = useState<Record<string, string>>({});
  const [runFilterSelections, setRunFilterSelections] = useState<Record<string, string[]>>({});
  const [autoPreview, setAutoPreview] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [newReportFolderLabel, setNewReportFolderLabel] = useState('');
  const [newBucketApiName, setNewBucketApiName] = useState('');
  const [newBucketLabel, setNewBucketLabel] = useState('');
  const [newBucketSourceField, setNewBucketSourceField] = useState('');
  const [newBucketRanges, setNewBucketRanges] = useState([
    { label: 'Small', upperBound: '' },
    { label: 'Medium', upperBound: '' },
    { label: 'Large', upperBound: '' }
  ]);
  const [newBucketBlanksAsZero, setNewBucketBlanksAsZero] = useState(false);
  const [newReportFolderVisibility, setNewReportFolderVisibility] = useState<ReportFolderInput['visibility']>('Private');
  const [reportFolderShareType, setReportFolderShareType] = useState<ReportFolderInput['shares'][number]['targetType']>('User');
  const [reportFolderShareTarget, setReportFolderShareTarget] = useState('');
  const [reportFolderShareLevel, setReportFolderShareLevel] = useState<ReportFolderInput['shares'][number]['accessLevel']>('Viewer');
  const previewRequestId = useRef(0);
  const current = draft ?? reports.find((item) => item.apiName === selectedApiName) ?? reports[0] ?? null;
  const reportObject = availableObjects.find((item) => item.apiName === current?.objectApiName);
  const relatedChildObjects = objects.filter((item) => item.apiName !== 'User'
    && item.fields.some((field) => field.relationship?.targetObject === current?.objectApiName));
  const reportDateFields = reportObject?.fields.filter((field) => /^(Date|DateTime)(\(|$)/.test(field.dataType)) ?? [];
  const reportStatusFields = reportObject?.fields.filter((field) =>
    ['Status', 'StageName'].includes(field.apiName) && Boolean(field.picklistValues?.length)) ?? [];
  const outlineFields = reportObject?.fields.filter((field) =>
    `${field.label} ${field.apiName}`.toLocaleLowerCase().includes(outlineFieldQuery.trim().toLocaleLowerCase())) ?? [];
  const orderedOutlineFields = current
    ? [
      ...current.fieldApiNames
        .map((apiName) => outlineFields.find((field) => field.apiName === apiName))
        .filter((field): field is FieldMetadata => Boolean(field)),
      ...outlineFields.filter((field) => !current.fieldApiNames.includes(field.apiName))
    ]
    : outlineFields;
  const filterFields = reportObject?.fields.filter((field) =>
    `${field.label} ${field.apiName}`.toLocaleLowerCase().includes(filterFieldQuery.trim().toLocaleLowerCase())) ?? [];
  const searchableFields = reportObject?.fields.filter((field) =>
    `${field.label} ${field.apiName} ${field.dataType}`.toLocaleLowerCase().includes(fieldQuery.trim().toLocaleLowerCase())) ?? [];
  const searchableReportObjects = availableObjects.filter((object) =>
    (reportTypeCategory === 'All' || reportTypeCategoryForObject(object) === reportTypeCategory)
    && (`${object.label} ${object.apiName} ${object.kind} ${object.fields.map((field) => `${field.label} ${field.apiName}`).join(' ')}`
      .toLocaleLowerCase().includes(reportTypeQuery.trim().toLocaleLowerCase())));
  const reportFilterRestrictionCount = current
    ? current.filters.length
      + current.crossFilters.length
      + current.crossFilters.reduce((total, filter) => total + filter.filters.length, 0)
      + Number(current.standardFilters.showMe === 'My')
      + Number(Boolean(current.standardFilters.dateFieldApiName && current.standardFilters.dateRange !== 'All Time'))
      + Number(current.standardFilters.statusSelection !== 'All')
      + Number(current.rowLimit.limit !== null)
    : 0;
  const operators: ReportFilterMetadata['operator'][] = [
    'Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With',
    'Greater Than', 'Greater Than or Equal To', 'Less Than', 'Less Than or Equal To',
    'Includes', 'Excludes', 'Is Null', 'Is Not Null'
  ];

  useEffect(() => {
    if (draft) return;
    const report = reports.find((item) => item.apiName === selectedApiName) ?? reports[0];
    if (report) {
      setDraft({
        ...report,
        fieldApiNames: [...report.fieldApiNames],
        groupByFieldApiNames: [...report.groupByFieldApiNames],
        filters: report.filters.map((filter) => ({ ...filter, values: [...filter.values] })),
        standardFilters: { ...report.standardFilters },
        crossFilters: report.crossFilters.map((filter) => ({ ...filter, filters: filter.filters.map((subfilter) => ({ ...subfilter, values: [...subfilter.values] })) })),
        rowLimit: { ...report.rowLimit },
        bucketFields: (report.bucketFields ?? []).map((bucket) => ({
          ...bucket,
          ranges: bucket.ranges.map((range) => ({ ...range }))
        }))
      });
      setSelectedApiName(report.apiName);
    }
  }, [selectedApiName, reports, draft]);

  const updateReport = (update: Partial<ReportMetadata>) => {
    setDraft((value) => value ? { ...value, ...update } : value);
  };
  const updateNewBucketRange = (index: number, update: Partial<(typeof newBucketRanges)[number]>) => {
    setNewBucketRanges((ranges) => ranges.map((range, rangeIndex) =>
      rangeIndex === index ? { ...range, ...update } : range));
  };
  const addNewBucketRange = () => {
    setNewBucketRanges((ranges) => [...ranges, { label: `Bucket ${ranges.length + 1}`, upperBound: '' }]);
  };
  const removeNewBucketRange = (index: number) => {
    setNewBucketRanges((ranges) => {
      if (ranges.length <= 2) return ranges;
      const next = ranges.filter((_, rangeIndex) => rangeIndex !== index);
      if (index > 0 && index < ranges.length - 1) {
        next[index - 1] = { ...next[index - 1], upperBound: ranges[index].upperBound };
      } else if (index === ranges.length - 1) {
        next[next.length - 1] = { ...next[next.length - 1], upperBound: '' };
      }
      return next;
    });
  };
  const addBucketField = () => {
    if (!current) return;
    const apiName = newBucketApiName.trim();
    const label = newBucketLabel.trim();
    const labels = newBucketRanges.map((range) => range.label.trim());
    const boundaries = newBucketRanges.slice(0, -1).map((range) =>
      range.upperBound.trim() === '' ? Number.NaN : Number(range.upperBound));
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(apiName) || !label || !newBucketSourceField
      || newBucketRanges.length < 2 || labels.some((rangeLabel) => !rangeLabel)
      || new Set(labels.map((rangeLabel) => rangeLabel.toLocaleLowerCase())).size !== labels.length
      || boundaries.some((boundary) => !Number.isFinite(boundary))
      || boundaries.some((boundary, index) => index > 0 && boundaries[index - 1] >= boundary)) {
      onNotify('Enter a valid bucket name, unique category labels, and increasing range boundaries');
      return;
    }
    if ((current.bucketFields ?? []).some((bucket) => bucket.apiName.toLocaleLowerCase() === apiName.toLocaleLowerCase())) {
      onNotify('A bucket with this API name already exists');
      return;
    }
    const bucket: ReportBucketMetadata = {
      apiName,
      label,
      fieldApiName: newBucketSourceField,
      ranges: newBucketRanges.map((range, index) => ({
        label: range.label.trim(),
        lowerBound: index === 0 ? null : boundaries[index - 1],
        upperBound: index === newBucketRanges.length - 1 ? null : boundaries[index]
      })),
      treatBlanksAsZero: newBucketBlanksAsZero
    };
    updateReport({ bucketFields: [...(current.bucketFields ?? []), bucket] });
    setNewBucketApiName('');
    setNewBucketLabel('');
    setNewBucketRanges([
      { label: 'Small', upperBound: '' },
      { label: 'Medium', upperBound: '' },
      { label: 'Large', upperBound: '' }
    ]);
    setResult(null);
  };
  const refreshPreview = useCallback(async (offset = 0) => {
    if (!current) return;
    const requestId = ++previewRequestId.current;
    setPreviewBusy(true);
    setError('');
    setPageOffset(offset);
    try {
      const preview = await onPreview(current, current.filters.map((filter) => ({
        id: filter.id,
        value: filter.locked ? filter.value : runFilterValues[filter.id] ?? filter.value,
        values: filter.locked ? filter.values : runFilterSelections[filter.id] ?? filter.values
      })), offset, 100);
      if (requestId === previewRequestId.current) setResult(preview);
    } catch (failure) {
      if (requestId === previewRequestId.current) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    } finally {
      if (requestId === previewRequestId.current) setPreviewBusy(false);
    }
  }, [current, onPreview, runFilterSelections, runFilterValues]);
  useEffect(() => {
    if (!autoPreview || runPage || busy || !current) {
      return () => {
        previewRequestId.current += 1;
        setPreviewBusy(false);
      };
    }
    const timeout = window.setTimeout(() => { void refreshPreview(0); }, 400);
    return () => {
      window.clearTimeout(timeout);
      previewRequestId.current += 1;
      setPreviewBusy(false);
    };
  }, [autoPreview, busy, current, refreshPreview, runPage]);
  const createReport = (objectApiName = selectedReportObjectApiName || availableObjects[0]?.apiName) => {
    const object = availableObjects.find((item) => item.apiName === objectApiName);
    if (!object) {
      onNotify('Enable reporting on an object before creating a report');
      return;
    }
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const firstField = object.fields[0]?.apiName;
    const opportunityDefaultFields = [
      'Name', 'Type', 'LeadSource', 'Amount', 'CloseDate', 'NextStep', 'StageName',
      'Probability', 'Fiscal', 'Age', 'CreatedDate', 'OwnerId', 'OwnerRole', 'AccountId'
    ];
    const caseDefaultFields = ['OwnerId', 'Subject', 'CreatedDate', 'Age', 'IsOpen', 'IsClosed', 'AccountId'];
    const starterFields = object.apiName === 'Opportunity'
      ? opportunityDefaultFields
      : object.apiName === 'Case'
        ? caseDefaultFields
        : null;
    const defaultFields = starterFields
      ? starterFields.filter((fieldApiName) => object.fields.some((field) => field.apiName === fieldApiName))
      : firstField ? [firstField] : [];
    const report: ReportMetadata = {
      reportType: 'Standard',
      apiName: `New_Report_${id}`,
      label: 'New Report',
      description: '',
      objectApiName: object.apiName,
      fieldApiNames: defaultFields,
      groupByFieldApiNames: [],
      filterLogic: 'All',
      format: 'Tabular',
      columnGroupByFieldApiName: null,
      sortFieldApiName: null,
      sortDirection: 'Ascending',
      filters: [],
      standardFilters: {
        showMe: 'All',
        dateFieldApiName: object.fields.some((field) => field.apiName === 'CreatedDate') ? 'CreatedDate' : null,
        dateRange: 'All Time',
        statusFieldApiName: object.fields.find((field) => ['Status', 'StageName'].includes(field.apiName) && field.picklistValues?.length)?.apiName ?? null,
        statusSelection: 'All'
      },
      crossFilters: [],
      rowLimit: { limit: null, sortFieldApiName: null, sortDirection: 'Ascending' },
      summaryOperations: {},
      dateGroupings: {},
      bucketFields: [],
      showDetails: true,
      showChart: false,
      folderName: 'My Reports',
      folderId: null
    };
    setDraft(report);
    setSelectedApiName(report.apiName);
    setResult(null);
    setError('');
    setRunPage(false);
    setReportTypeSelectorOpen(false);
  };
  const save = async () => {
    if (!current) return null;
    setBusy(true);
    setError('');
    try {
      const saved = await onSave(current);
      setDraft(saved);
      setSelectedApiName(saved.apiName);
      return saved;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onNotify(`Unable to save report: ${message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const run = async (offset = 0) => {
    const saved = await save();
    if (!saved) return;
    setPageOffset(offset);
    setBusy(true);
    setError('');
    try {
      const reportResult = await onRun(saved.apiName, [], offset, 100, 'All', [], undefined, saved.filters.map((filter) => ({
        id: filter.id,
        value: runFilterValues[filter.id] ?? filter.value,
        values: runFilterSelections[filter.id] ?? filter.values
      })));
      setResult(reportResult);
      setRunPage(true);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onNotify(`Unable to run report: ${message}`);
    } finally {
      setBusy(false);
    }
  };
  const cloneCurrent = () => {
    if (!current || !reports.some((item) => item.apiName === current.apiName)) return;
    const cloneId = crypto.randomUUID().replace(/-/g, '');
    const currentFolder = reportFolders.find((folder) => folder.id === current.folderId);
    const canSaveToCurrentFolder = !current.folderId
      || canManageReportFolders
      || currentFolder?.accessLevel === 'Editor'
      || currentFolder?.accessLevel === 'Manager';
    const folderId = canSaveToCurrentFolder ? current.folderId : null;
    const cloned: ReportMetadata = {
      ...current,
      apiName: `New_Report_${cloneId}`,
      label: `Copy of ${current.label}`.slice(0, 80),
      folderId,
      folderName: folderId ? current.folderName : 'My Reports',
      fieldApiNames: [...current.fieldApiNames],
      groupByFieldApiNames: [...current.groupByFieldApiNames],
      filters: current.filters.map((filter) => ({ ...filter, id: crypto.randomUUID(), values: [...filter.values] })),
      standardFilters: { ...current.standardFilters },
      crossFilters: current.crossFilters.map((filter) => ({
        ...filter,
        id: crypto.randomUUID(),
        filters: filter.filters.map((subfilter) => ({ ...subfilter, id: crypto.randomUUID(), values: [...subfilter.values] }))
      })),
      rowLimit: { ...current.rowLimit },
      summaryOperations: Object.fromEntries(Object.entries(current.summaryOperations).map(([fieldApiName, operations]) =>
        [fieldApiName, [...operations]])),
      dateGroupings: { ...current.dateGroupings },
      bucketFields: (current.bucketFields ?? []).map((bucket) => ({
        ...bucket,
        ranges: bucket.ranges.map((range) => ({ ...range }))
      }))
    };
    setDraft(cloned);
    setSelectedApiName(cloned.apiName);
    setRunFilterValues({});
    setRunFilterSelections({});
    setResult(null);
    setError('');
    setRunPage(false);
  };
  const deleteCurrent = async () => {
    if (!current || !reports.some((item) => item.apiName === current.apiName)) return;
    if (!window.confirm(`Delete the "${current.label}" report?`)) return;
    setBusy(true);
    setError('');
    try {
      await onDelete(current.apiName);
      setDraft(null);
      setResult(null);
      setSelectedApiName('');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onNotify(`Unable to delete report: ${message}`);
    } finally {
      setBusy(false);
    }
  };
  const changeObject = (objectApiName: string) => {
    const object = availableObjects.find((item) => item.apiName === objectApiName);
    const firstField = object?.fields[0]?.apiName;
    updateReport({
      objectApiName,
      fieldApiNames: firstField ? [firstField] : [],
      groupByFieldApiNames: [],
      filterLogic: 'All',
      format: 'Tabular',
      columnGroupByFieldApiName: null,
      sortFieldApiName: null,
      filters: [],
      standardFilters: {
        showMe: 'All',
        dateFieldApiName: object?.fields.some((field) => field.apiName === 'CreatedDate') ? 'CreatedDate' : null,
        dateRange: 'All Time',
        statusFieldApiName: object?.fields.find((field) => ['Status', 'StageName'].includes(field.apiName) && field.picklistValues?.length)?.apiName ?? null,
        statusSelection: 'All'
      },
      crossFilters: [],
      rowLimit: { limit: null, sortFieldApiName: null, sortDirection: 'Ascending' },
      summaryOperations: {},
      dateGroupings: {},
      bucketFields: [],
      showDetails: true,
      showChart: false,
      folderName: 'My Reports',
      folderId: null
    });
    setResult(null);
  };
  const toggleField = (fieldApiName: string, enabled: boolean) => {
    if (!current) return;
    const summaryOperations = { ...current.summaryOperations };
    if (!enabled) delete summaryOperations[fieldApiName];
    updateReport({ fieldApiNames: enabled
      ? [...current.fieldApiNames, fieldApiName]
      : current.fieldApiNames.filter((item) => item !== fieldApiName),
    summaryOperations,
    sortFieldApiName: enabled
      || current.groupByFieldApiNames.includes(fieldApiName)
      || current.sortFieldApiName !== fieldApiName
      ? current.sortFieldApiName
      : null });
    setResult(null);
  };
  const moveField = (fieldApiName: string, offset: -1 | 1) => {
    if (!current) return;
    const sourceIndex = current.fieldApiNames.indexOf(fieldApiName);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.fieldApiNames.length) return;
    const fieldApiNames = [...current.fieldApiNames];
    [fieldApiNames[sourceIndex], fieldApiNames[targetIndex]] = [fieldApiNames[targetIndex], fieldApiNames[sourceIndex]];
    updateReport({ fieldApiNames });
    setResult(null);
  };
  const updateFilter = (id: string, update: Partial<ReportFilterMetadata>) => {
    if (!current) return;
    updateReport({ filters: current.filters.map((filter) => filter.id === id ? { ...filter, ...update } : filter) });
    if (update.value !== undefined) setRunFilterValues((values) => ({ ...values, [id]: update.value! }));
    if (update.values !== undefined) {
      setRunFilterSelections((selections) => ({ ...selections, [id]: [...update.values!] }));
      setRunFilterValues((values) => ({ ...values, [id]: update.value ?? '' }));
    }
    setResult(null);
  };
  const operatorsForField = (fieldApiName: string, fields: FieldMetadata[] = reportObject?.fields ?? []) => {
    const field = fields.find((item) => item.apiName === fieldApiName);
    const fieldType = field?.formula?.returnType ?? field?.dataType.replace(/\(.*/, '');
    const allowedOperators = fieldType === 'Multi-Select Picklist'
      ? ['Includes', 'Excludes', 'Is Null', 'Is Not Null']
      : fieldType === 'Picklist' || fieldType === 'Checkbox' || fieldType === 'Reference' || fieldType === 'Id'
        ? ['Equals', 'Not Equal To', 'Is Null', 'Is Not Null']
        : /^(Number|Currency|Percent|Date|DateTime)$/.test(fieldType ?? '')
          ? ['Equals', 'Not Equal To', 'Greater Than', 'Greater Than or Equal To', 'Less Than', 'Less Than or Equal To', 'Is Null', 'Is Not Null']
          : ['Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With', 'Is Null', 'Is Not Null'];
    return operators.filter((operator) => allowedOperators.includes(operator));
  };
  const addFilter = (fieldApiName = reportObject?.fields[0]?.apiName) => {
    if (!current || !fieldApiName || !reportObject?.fields.some((field) => field.apiName === fieldApiName)) return;
    updateReport({
      filters: [...current.filters, { id: crypto.randomUUID(), fieldApiName, operator: 'Equals', value: '', values: [], locked: false }],
      filterLogic: 'All'
    });
    setBuilderTab('Filters');
    setResult(null);
  };
  const handleFieldDrop = (event: React.DragEvent, target: 'column' | 'filter') => {
    event.preventDefault();
    const fieldApiName = event.dataTransfer.getData('text/report-field');
    if (!reportObject?.fields.some((field) => field.apiName === fieldApiName)) return;
    if (target === 'filter') addFilter(fieldApiName);
    else if (current && !current.fieldApiNames.includes(fieldApiName)) toggleField(fieldApiName, true);
  };
  const openReportTypeSelector = () => {
    setSelectedReportObjectApiName(availableObjects[0]?.apiName ?? '');
    setReportTypeQuery('');
    setReportTypeCategory('All');
    setReportTypeSelectorOpen(true);
  };
  const updateCrossFilter = (id: string, update: Partial<ReportCrossFilterMetadata>) => {
    if (!current) return;
    updateReport({ crossFilters: current.crossFilters.map((filter) => filter.id === id ? { ...filter, ...update } : filter) });
    setResult(null);
  };
  const addCrossFilter = () => {
    if (!current || !relatedChildObjects[0]) return;
    updateReport({
      crossFilters: [...current.crossFilters, {
        id: crypto.randomUUID(),
        childObjectApiName: relatedChildObjects[0].apiName,
        mode: 'With',
        filters: []
      }]
    });
    setResult(null);
  };
  const addCrossSubfilter = (crossFilter: ReportCrossFilterMetadata) => {
    const childObject = objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    const firstField = childObject?.fields[0]?.apiName;
    if (!firstField) return;
    updateCrossFilter(crossFilter.id, {
      filters: [...crossFilter.filters, {
        id: crypto.randomUUID(),
        fieldApiName: firstField,
        operator: 'Equals',
        value: '',
        values: [],
        locked: false
      }]
    });
  };
  const filteredReports = reports.filter((report) => `${report.label} ${report.apiName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const reportFilterValueControl = (
    fieldApiName: string,
    value: string,
    onChange: (nextValue: string) => void,
    ariaLabel: string,
    disabled = false,
    fields: FieldMetadata[] = reportObject?.fields ?? [],
    selectedValues: string[] = [],
    onValuesChange?: (nextValues: string[]) => void
  ) => {
    const field = fields.find((item) => item.apiName === fieldApiName);
    if (field?.picklistValues?.length) {
      return <select aria-label={ariaLabel} disabled={disabled} multiple={Boolean(onValuesChange)}
        value={onValuesChange ? selectedValues : value}
        onChange={(event) => onValuesChange
          ? onValuesChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
          : onChange(event.target.value)}>
        {!onValuesChange && <option value="">Select a value</option>}
        {field.picklistValues.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>;
    }
    if (field?.dataType === 'Checkbox') {
      return <select aria-label={ariaLabel} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a value</option><option value="true">True</option><option value="false">False</option>
      </select>;
    }
    const inputType = field?.dataType === 'Date' ? 'date'
      : field?.dataType === 'DateTime' ? 'datetime-local'
        : /^(Number|Currency|Percent)(\(|$)/.test(field?.dataType ?? '') ? 'number' : 'text';
    return <input aria-label={ariaLabel} type={inputType} step={inputType === 'number' ? 'any' : undefined}
      disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Value" />;
  };
  type NumericSummary = {
    sums: Record<string, number>;
    counts: Record<string, number>;
    minimums: Record<string, number>;
    maximums: Record<string, number>;
  };
  const summaryFields = result
    ? result.report.fieldApiNames.filter((fieldApiName) =>
      (result.report.summaryOperations[fieldApiName]?.length ?? 0) > 0)
    : [];
  const summarySpecs = summaryFields.flatMap((fieldApiName) =>
    (result?.report.summaryOperations[fieldApiName] ?? []).map((operation) => ({ fieldApiName, operation })));
  const numericFields = reportObject?.fields.filter((field) =>
    current?.fieldApiNames.includes(field.apiName)
    && (field.formula
      ? /^(Number|Currency|Percent)$/.test(field.formula.returnType)
      : /^(Number|Currency|Percent)(\(|$)/.test(field.dataType))) ?? [];
  const summarizableFields = reportObject?.fields.filter((field) =>
    current?.fieldApiNames.includes(field.apiName)) ?? [];
  const dateGroupFields = reportObject?.fields.filter((field) =>
    (current?.groupByFieldApiNames.includes(field.apiName)
      || current?.columnGroupByFieldApiName === field.apiName)
    && /^(Date|DateTime)(\(|$)/.test(field.dataType)) ?? [];
  const reportFieldLabel = (fieldApiName: string) =>
    reportObject?.fields.find((field) => field.apiName === fieldApiName)?.label
    ?? current?.bucketFields?.find((bucket) => `Bucket_${bucket.apiName}` === fieldApiName)?.label
    ?? fieldApiName;
  const matrixColumnField = result?.report.columnGroupByFieldApiName;
  const matrixColumns = result && matrixColumnField
    ? [...new Set(result.summaryRows.map((group) => group.groupValues[matrixColumnField]))]
      .sort((left, right) => String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' }))
    : [];
  const matrixRowKey = (values: Record<string, unknown>) =>
    JSON.stringify(result?.report.groupByFieldApiNames.map((fieldApiName) => values[fieldApiName]) ?? []);
  const matrixGroupFor = (rowValues: Record<string, unknown>, columnValue: unknown) =>
    result?.summaryRows.find((group) => matrixRowKey(group.groupValues) === matrixRowKey(rowValues)
      && group.groupValues[matrixColumnField ?? ''] === columnValue);
  const summaryNumericValue = (summary: NumericSummary, fieldApiName: string, operation: ReportSummaryOperation) => operation === 'Count'
      ? summary.counts[fieldApiName]
      : operation === 'Sum'
      ? summary.sums[fieldApiName]
      : operation === 'Average'
        ? summary.counts[fieldApiName] ? summary.sums[fieldApiName] / summary.counts[fieldApiName] : undefined
        : operation === 'Minimum'
          ? summary.minimums[fieldApiName]
          : summary.maximums[fieldApiName];
  const formatSummaryValue = (summary: NumericSummary, fieldApiName: string, operation: ReportSummaryOperation) => {
    const value = summaryNumericValue(summary, fieldApiName, operation);
    return value === undefined
      ? '—'
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  };
  const combineNumericSummaries = (summaries: NumericSummary[], fieldApiNames: string[]): NumericSummary => ({
    sums: Object.fromEntries(fieldApiNames.map((fieldApiName) => [
      fieldApiName, summaries.reduce((total, summary) => total + (summary.sums[fieldApiName] ?? 0), 0)
    ])),
    counts: Object.fromEntries(fieldApiNames.map((fieldApiName) => [
      fieldApiName, summaries.reduce((total, summary) => total + (summary.counts[fieldApiName] ?? 0), 0)
    ])),
    minimums: Object.fromEntries(fieldApiNames.flatMap((fieldApiName) => {
      const values = summaries.flatMap((summary) => summary.minimums[fieldApiName] === undefined ? [] : [summary.minimums[fieldApiName]]);
      return values.length ? [[fieldApiName, Math.min(...values)]] : [];
    })),
    maximums: Object.fromEntries(fieldApiNames.flatMap((fieldApiName) => {
      const values = summaries.flatMap((summary) => summary.maximums[fieldApiName] === undefined ? [] : [summary.maximums[fieldApiName]]);
      return values.length ? [[fieldApiName, Math.max(...values)]] : [];
    }))
  });
  const chartOperation = summarySpecs[0];
  const groupedValueLabel = (fieldApiName: string, value: unknown) => {
    if (value === null || value === undefined) return '—';
    const grouping = result?.report.dateGroupings[fieldApiName];
    if (!grouping) return String(value);
    const text = String(value);
    if (grouping === 'Quarter') {
      const match = /^(\d{4})-Q([1-4])$/.exec(text);
      return match ? `Q${match[2]} ${match[1]}` : text;
    }
    if (grouping === 'Year') return text;
    const date = new Date(grouping === 'Month' ? `${text}-01T00:00:00Z`
      : /^\d{4}-\d{2}-\d{2}/.test(text) ? `${text.slice(0, 10)}T00:00:00Z` : text);
    if (!Number.isFinite(date.getTime())) return text;
    return new Intl.DateTimeFormat(undefined, grouping === 'Month'
      ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
  };
  const chartGroups = result && matrixColumnField
    ? [...new Map(result.summaryRows.map((group) => [matrixRowKey(group.groupValues), group])).values()]
      .map((group) => {
        const cells = result.summaryRows.filter((item) => matrixRowKey(item.groupValues) === matrixRowKey(group.groupValues));
        return {
          groupValues: group.groupValues,
          rowCount: cells.reduce((total, cell) => total + cell.rowCount, 0),
          summary: combineNumericSummaries(cells, summaryFields)
        };
      })
    : result?.summaryRows.map((group) => ({ groupValues: group.groupValues, rowCount: group.rowCount, summary: group })) ?? [];
  const chartBars = result && result.report.showChart
    ? chartGroups.map((group) => ({
      label: groupedValueLabel(result.report.groupByFieldApiNames[0] ?? '', group.groupValues[result.report.groupByFieldApiNames[0] ?? '']),
      value: chartOperation
        ? summaryNumericValue(group.summary, chartOperation.fieldApiName, chartOperation.operation) ?? 0
        : group.rowCount
    }))
    : [];
  const chartMaximum = Math.max(1, ...chartBars.map((bar) => Math.abs(bar.value)));
  const updateSummaryOperation = (fieldApiName: string, operation: ReportSummaryOperation, enabled: boolean) => {
    if (!current) return;
    const operations = current.summaryOperations[fieldApiName] ?? [];
    const nextOperations = enabled
      ? [...operations, operation]
      : operations.filter((item) => item !== operation);
    const summaryOperations = { ...current.summaryOperations };
    if (nextOperations.length) summaryOperations[fieldApiName] = nextOperations;
    else delete summaryOperations[fieldApiName];
    updateReport({ summaryOperations });
    setResult(null);
  };

  return <div className="report-page">
    <div className="report-titlebar">
      <div className="back-title"><div><div className="eyebrow">Analytics / Reports</div><h1>{current?.label ?? 'Reports'}</h1></div></div>
      <div className="toolbar-actions">
        {runPage
          ? <><button className="btn" disabled={busy} onClick={() => setRunPage(false)}>Edit</button><button className="btn btn-brand" disabled={!current || busy} onClick={() => void run(pageOffset)}><Activity size={14} />{busy ? 'Running…' : 'Run'}</button></>
          : <><button className="btn" disabled={!current || busy || !current.label.trim() || !current.fieldApiNames.length} onClick={() => void save()}><Save size={14} />Save</button>
            <button className="btn btn-brand" disabled={!current || busy || !current.label.trim() || !current.fieldApiNames.length} onClick={() => void run()}><Activity size={14} />{busy ? 'Working…' : 'Save & Run'}</button></>}
        {current && reports.some((item) => item.apiName === current.apiName) && <button className="btn" disabled={busy} onClick={cloneCurrent}>Clone</button>}
        {current && reports.some((item) => item.apiName === current.apiName) && <button className="btn" disabled={busy} onClick={() => void deleteCurrent()}><Trash2 size={14} />Delete</button>}
      </div>
    </div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className={`report-builder-layout${runPage ? ' report-run-page' : ''}${fieldsPanelOpen && current && !runPage ? ' report-fields-open' : ''}`}>
      <aside className="report-outline">
        <div className="mini-search"><Search size={13} /><input aria-label="Search reports" placeholder="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {!runPage && <button className="btn btn-brand btn-full" onClick={openReportTypeSelector}><Plus size={14} />New Report</button>}
        {reportFolders.map((folder) => {
          const folderReports = filteredReports.filter((report) => report.folderId === folder.id);
          return <div className="report-panel-block" key={folder.id}><h3>{folder.label.toLocaleUpperCase()} <span>{folderReports.length}</span></h3>
            {folderReports.map((report) => <button className={`outline-field ${current?.apiName === report.apiName ? 'selected' : ''}`} key={report.apiName} onClick={() => {
              setDraft({
                ...report,
                fieldApiNames: [...report.fieldApiNames],
                groupByFieldApiNames: [...report.groupByFieldApiNames],
                filters: report.filters.map((filter) => ({ ...filter, values: [...filter.values] })),
                standardFilters: { ...report.standardFilters },
                crossFilters: report.crossFilters.map((filter) => ({ ...filter, filters: filter.filters.map((subfilter) => ({ ...subfilter, values: [...subfilter.values] })) })),
                rowLimit: { ...report.rowLimit }
              });
              setSelectedApiName(report.apiName);
              setResult(null);
              setError('');
              setRunPage(false);
            }}><FileText size={14} />{report.label}</button>)}
            {!folderReports.length && <p className="dashboard-sidebar-empty">No reports in this folder.</p>}
          </div>;
        })}
        {current && !runPage && <div className="report-outline-tabs" role="tablist" aria-label="Report builder sections">
          <button role="tab" aria-selected={builderTab === 'Outline'} className={builderTab === 'Outline' ? 'active' : ''} onClick={() => setBuilderTab('Outline')}>Outline</button>
          <button role="tab" aria-selected={builderTab === 'Filters'} className={builderTab === 'Filters' ? 'active' : ''} onClick={() => setBuilderTab('Filters')}>Filters{reportFilterRestrictionCount ? ` (${reportFilterRestrictionCount})` : ''}</button>
        </div>}
        {current && !runPage && builderTab === 'Outline' && <div className="report-panel-block" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleFieldDrop(event, 'column')}>
          <h3>COLUMNS <span>{current.fieldApiNames.length}</span></h3>
          <div className="mini-search"><Search size={13} /><input aria-label="Search fields to add to outline" placeholder="Search fields" value={outlineFieldQuery} onChange={(event) => setOutlineFieldQuery(event.target.value)} /></div>
          {orderedOutlineFields.map((field) => {
            const columnIndex = current.fieldApiNames.indexOf(field.apiName);
            return <div className="dynamic-field-property-row" key={field.apiName}>
              <label className="checkbox-row property-check">
                <input type="checkbox" checked={columnIndex >= 0} onChange={(event) => toggleField(field.apiName, event.target.checked)} />{field.label}
              </label>
              {columnIndex >= 0 && <div className="property-position-actions">
                <button type="button" className="icon-button" aria-label={`Move ${field.label} column earlier`} title="Move column earlier"
                  disabled={columnIndex === 0} onClick={() => moveField(field.apiName, -1)}><ArrowUp size={13} /></button>
                <button type="button" className="icon-button" aria-label={`Move ${field.label} column later`} title="Move column later"
                  disabled={columnIndex === current.fieldApiNames.length - 1} onClick={() => moveField(field.apiName, 1)}><ArrowDown size={13} /></button>
              </div>}
            </div>;
          })}
        </div>}
        {current && !runPage && builderTab === 'Outline' && <div className="report-panel-block">
          <h3>BUCKET FIELDS</h3>
          {(current.bucketFields ?? []).map((bucket) => {
            const bucketFieldApiName = `Bucket_${bucket.apiName}`;
            return <div className="report-cross-filter" key={bucket.apiName}>
              <div className="report-cross-filter-heading"><strong>{bucket.label}</strong>
                <button className="icon-button" aria-label={`Remove bucket ${bucket.label}`} onClick={() => {
                  const bucketFields = (current.bucketFields ?? []).filter((item) => item.apiName !== bucket.apiName);
                  updateReport({
                    bucketFields,
                    fieldApiNames: current.fieldApiNames.filter((item) => item !== bucketFieldApiName),
                    groupByFieldApiNames: current.groupByFieldApiNames.filter((item) => item !== bucketFieldApiName),
                    columnGroupByFieldApiName: current.columnGroupByFieldApiName === bucketFieldApiName ? null : current.columnGroupByFieldApiName
                  });
                  setResult(null);
                }}><X size={13} /></button>
              </div>
              <small>{reportObject?.fields.find((field) => field.apiName === bucket.fieldApiName)?.label}: {bucket.ranges.map((range) => range.label).join(', ')}</small>
              <label className="checkbox-row property-check"><input type="checkbox" checked={current.fieldApiNames.includes(bucketFieldApiName)}
                onChange={(event) => toggleField(bucketFieldApiName, event.target.checked)} />Add bucket as a report column</label>
            </div>;
          })}
          <label className="form-label" htmlFor="report-bucket-label">Bucket label</label>
          <input id="report-bucket-label" className="form-control" value={newBucketLabel} onChange={(event) => setNewBucketLabel(event.target.value)} />
          <label className="form-label" htmlFor="report-bucket-api-name">Bucket API name</label>
          <input id="report-bucket-api-name" className="form-control" value={newBucketApiName} onChange={(event) => setNewBucketApiName(event.target.value)} />
          <label className="form-label" htmlFor="report-bucket-source">Numeric source field</label>
          <select id="report-bucket-source" className="form-control" value={newBucketSourceField}
            onChange={(event) => setNewBucketSourceField(event.target.value)}>
            <option value="">Select source field</option>
            {reportObject?.fields.filter((field) => field.formula
              ? /^(Number|Currency|Percent)$/.test(field.formula.returnType)
              : /^(Number|Currency|Percent)(\(|$)/.test(field.dataType))
              .map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
          </select>
          {newBucketRanges.map((range, index) => <div className="report-cross-filter" key={`new-bucket-range-${index}`}>
            <label className="form-label" htmlFor={`report-bucket-range-label-${index}`}>Category {index + 1} label</label>
            <input id={`report-bucket-range-label-${index}`} className="form-control" value={range.label}
              onChange={(event) => updateNewBucketRange(index, { label: event.target.value })} />
            {index < newBucketRanges.length - 1 && <>
              <label className="form-label" htmlFor={`report-bucket-range-upper-${index}`}>
                Values below {newBucketRanges[index + 1].label || `Category ${index + 2}`}
              </label>
              <input id={`report-bucket-range-upper-${index}`} className="form-control" type="number" value={range.upperBound}
                onChange={(event) => updateNewBucketRange(index, { upperBound: event.target.value })} />
            </>}
            {newBucketRanges.length > 2 && <button type="button" className="icon-button"
              aria-label={`Remove bucket category ${index + 1}`} onClick={() => removeNewBucketRange(index)}><X size={13} /></button>}
          </div>)}
          <button type="button" className="outline-add" onClick={addNewBucketRange}><Plus size={12} />Add Category</button>
          <label className="checkbox-row property-check"><input type="checkbox" checked={newBucketBlanksAsZero} onChange={(event) => setNewBucketBlanksAsZero(event.target.checked)} />Treat blank values as zero</label>
          <button className="outline-add" onClick={addBucketField}><Plus size={12} />Add Bucket Field</button>
          {(current.bucketFields ?? []).map((bucket) => {
            const apiName = `Bucket_${bucket.apiName}`;
            return <label className="checkbox-row property-check" key={`group-${bucket.apiName}`}>
              <input type="checkbox" disabled={current.format === 'Tabular' || current.format === 'Matrix' && current.groupByFieldApiNames.length === 1 && current.groupByFieldApiNames.includes(apiName)}
                checked={current.groupByFieldApiNames.includes(apiName)} onChange={(event) => {
                  const groupByFieldApiNames = event.target.checked
                    ? [...current.groupByFieldApiNames, apiName].slice(0, 3)
                    : current.groupByFieldApiNames.filter((item) => item !== apiName);
                  updateReport({
                    groupByFieldApiNames,
                    format: groupByFieldApiNames.length && current.format === 'Tabular' ? 'Summary'
                      : !groupByFieldApiNames.length && current.format === 'Summary' ? 'Tabular' : current.format,
                    showDetails: groupByFieldApiNames.length ? current.showDetails : true
                  });
                  setResult(null);
                }} />Group rows by {bucket.label}
            </label>;
          })}
        </div>}
        {current && !runPage && builderTab === 'Outline' && <div className="report-panel-block"><h3>FORMAT</h3>
          <label className="form-label" htmlFor="report-format">Report format</label>
          <select id="report-format" className="form-control" value={current.format} onChange={(event) => {
            const format = event.target.value as ReportMetadata['format'];
            const rowGroups = format !== 'Tabular' && current.groupByFieldApiNames.length === 0
              ? [reportObject?.fields[0]?.apiName].filter((apiName): apiName is string => Boolean(apiName))
              : format === 'Tabular' ? [] : current.groupByFieldApiNames;
            const columnGroup = format === 'Matrix'
              ? current.columnGroupByFieldApiName ?? reportObject?.fields.find((field) => !rowGroups.includes(field.apiName))?.apiName ?? null
              : null;
            updateReport({
              format,
              groupByFieldApiNames: rowGroups,
              columnGroupByFieldApiName: columnGroup,
              summaryOperations: format === 'Tabular' ? {} : current.summaryOperations,
              dateGroupings: format === 'Tabular' ? {} : current.dateGroupings,
              showDetails: format === 'Tabular' ? true : current.showDetails,
              showChart: format === 'Tabular' ? false : current.showChart,
              rowLimit: format === 'Tabular'
                ? current.rowLimit
                : { ...current.rowLimit, limit: null }
            });
            setResult(null);
          }}>
            <option value="Tabular">Tabular</option><option value="Summary">Summary</option><option value="Matrix">Matrix</option>
          </select>
          {current.format === 'Matrix' && <>
            <label className="form-label" htmlFor="report-column-group">Group columns by</label>
            <select id="report-column-group" className="form-control" value={current.columnGroupByFieldApiName ?? ''}
              onChange={(event) => {
                const columnGroupByFieldApiName = event.target.value || null;
                const validDateFields = new Set([...current.groupByFieldApiNames, ...(columnGroupByFieldApiName ? [columnGroupByFieldApiName] : [])]);
                updateReport({
                  columnGroupByFieldApiName,
                  dateGroupings: Object.fromEntries(Object.entries(current.dateGroupings).filter(([apiName]) => validDateFields.has(apiName)))
                });
                setResult(null);
              }}>
              <option value="">Select a column grouping</option>
              {reportObject?.fields.filter((field) => !current.groupByFieldApiNames.includes(field.apiName)).map((field) =>
                <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
              {(current.bucketFields ?? []).filter((bucket) => !current.groupByFieldApiNames.includes(`Bucket_${bucket.apiName}`))
              .map((bucket) => <option key={bucket.apiName} value={`Bucket_${bucket.apiName}`}>{bucket.label}</option>)}
            </select>
          </>}
        </div>}
        {current && !runPage && builderTab === 'Outline' && <div className="report-panel-block"><h3>GROUP ROWS</h3>
          {reportObject?.fields.map((field) => <label className="checkbox-row property-check" key={field.apiName}>
            <input type="checkbox" disabled={current.format === 'Matrix' && current.groupByFieldApiNames.length === 1 && current.groupByFieldApiNames.includes(field.apiName)}
              checked={current.groupByFieldApiNames.includes(field.apiName)} onChange={(event) => {
              const groupByFieldApiNames = event.target.checked
                ? [...current.groupByFieldApiNames, field.apiName].slice(0, 3)
                : current.groupByFieldApiNames.filter((item) => item !== field.apiName);
              const validDateFields = new Set([...groupByFieldApiNames, ...(current.columnGroupByFieldApiName ? [current.columnGroupByFieldApiName] : [])]);
              const clearsSummaryGrouping = current.format === 'Summary' && !groupByFieldApiNames.length;
              updateReport({
                groupByFieldApiNames,
                dateGroupings: Object.fromEntries(Object.entries(current.dateGroupings).filter(([apiName]) => validDateFields.has(apiName))),
                ...(clearsSummaryGrouping ? { format: 'Tabular', summaryOperations: {}, showDetails: true, showChart: false } : {}),
                columnGroupByFieldApiName: groupByFieldApiNames.includes(current.columnGroupByFieldApiName ?? '')
                  ? current.columnGroupByFieldApiName
                  : null,
                sortFieldApiName: current.fieldApiNames.includes(field.apiName)
                  || current.sortFieldApiName !== field.apiName
                  || event.target.checked
                  ? current.sortFieldApiName
                  : null
              });
              setResult(null);
            }} />{field.label}
          </label>)}
        </div>}
        {current && !runPage && builderTab === 'Outline' && current.format !== 'Tabular' && current.groupByFieldApiNames.length > 0 && dateGroupFields.length > 0 && <div className="report-panel-block">
          <h3>DATE GROUPING</h3>
          {dateGroupFields.map((field) => <label className="form-label" key={field.apiName}>
            {field.label}
            <select className="form-control" aria-label={`Date grouping for ${field.label}`}
              value={current.dateGroupings[field.apiName] ?? 'Day'}
              onChange={(event) => {
                updateReport({ dateGroupings: { ...current.dateGroupings, [field.apiName]: event.target.value as ReportDateGrouping } });
                setResult(null);
              }}>
              {(['Day', 'Month', 'Quarter', 'Year'] as const).map((grouping) => <option key={grouping} value={grouping}>{grouping}</option>)}
            </select>
          </label>)}
        </div>}
        {current && !runPage && builderTab === 'Outline' && current.format !== 'Tabular' && current.groupByFieldApiNames.length > 0 && summarizableFields.length > 0 && <div className="report-panel-block">
          <h3>SUMMARIZE COLUMNS</h3>
          {summarizableFields.map((field) => <div key={field.apiName}>
            <strong className="report-summary-field-label">{field.label}</strong>
            {(numericFields.some((numericField) => numericField.apiName === field.apiName)
              ? ['Count', 'Sum', 'Average', 'Minimum', 'Maximum'] as const
              : ['Count'] as const).map((operation) => <label className="checkbox-row property-check" key={operation}>
              <input type="checkbox" checked={current.summaryOperations[field.apiName]?.includes(operation) ?? false}
                onChange={(event) => updateSummaryOperation(field.apiName, operation, event.target.checked)} />{operation}
            </label>)}
          </div>)}
        </div>}
        {current && !runPage && builderTab === 'Outline' && current.format !== 'Tabular' && current.groupByFieldApiNames.length > 0 && <div className="report-panel-block">
          <h3>REPORT DISPLAY</h3>
          <label className="checkbox-row property-check">
            <input type="checkbox" checked={current.showDetails}
              onChange={(event) => { updateReport({ showDetails: event.target.checked }); setResult(null); }} />
            Show Details
          </label>
          <label className="checkbox-row property-check">
            <input type="checkbox" checked={current.showChart}
              onChange={(event) => { updateReport({ showChart: event.target.checked }); setResult(null); }} />
            Show Chart
          </label>
        </div>}
        {current && !runPage && builderTab === 'Outline' && <div className="report-panel-block">
          <h3>FOLDER</h3>
          <label className="form-label" htmlFor="report-folder">Save report in</label>
          <select id="report-folder" className="form-control" value={current.folderId ?? ''}
            onChange={(event) => {
              const folder = reportFolders.find((item) => item.id === event.target.value);
              updateReport({ folderId: folder?.id ?? null, folderName: folder?.label ?? 'My Reports' });
              setResult(null);
            }}>
            <option value="">My Reports (create on save)</option>
            {reportFolders.filter((folder) => folder.accessLevel === 'Editor' || folder.accessLevel === 'Manager')
              .map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
          </select>
          {canManageReportFolders && <div className="report-folder-create">
            <label className="form-label" htmlFor="new-report-folder">New report folder</label>
            <input id="new-report-folder" className="form-control" maxLength={80} value={newReportFolderLabel}
              onChange={(event) => setNewReportFolderLabel(event.target.value)} placeholder="Folder name" />
            <select className="form-control" aria-label="New report folder audience" value={newReportFolderVisibility}
              onChange={(event) => setNewReportFolderVisibility(event.target.value as ReportFolderInput['visibility'])}>
              <option value="Private">Private</option><option value="All Users">All Users</option>
            </select>
            <label className="form-label" htmlFor="report-folder-share-type">Share with</label>
            <select id="report-folder-share-type" className="form-control" value={reportFolderShareType}
              onChange={(event) => {
                setReportFolderShareType(event.target.value as ReportFolderInput['shares'][number]['targetType']);
                setReportFolderShareTarget('');
              }}>
              <option value="User">User</option><option value="PublicGroup">Public group</option>
              <option value="PermissionSetGroup">Permission set group</option><option value="Role">Role</option>
              <option value="RoleAndSubordinates">Role and subordinates</option>
            </select>
            <select className="form-control" aria-label="Report folder share target" value={reportFolderShareTarget}
              onChange={(event) => setReportFolderShareTarget(event.target.value)}>
              <option value="">No additional share</option>
              {(reportFolderShareType === 'User' ? accessControl.users.map((item) => ({ id: item.id, label: item.name }))
                : reportFolderShareType === 'PublicGroup' ? accessControl.publicGroups.map((item) => ({ id: item.id, label: item.label }))
                  : reportFolderShareType === 'PermissionSetGroup' ? accessControl.permissionSetGroups.map((item) => ({ id: item.id, label: item.label }))
                    : accessControl.roles.map((item) => ({ id: item.id, label: item.name })))
                .map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select className="form-control" aria-label="Report folder share access level" value={reportFolderShareLevel}
              onChange={(event) => setReportFolderShareLevel(event.target.value as ReportFolderInput['shares'][number]['accessLevel'])}>
              <option value="Viewer">Viewer</option><option value="Editor">Editor</option><option value="Manager">Manager</option>
            </select>
            <button className="btn btn-full" disabled={!newReportFolderLabel.trim()} onClick={() => {
              void onSaveFolder({
                label: newReportFolderLabel.trim(),
                parentFolderId: null,
                shares: reportFolderShareTarget ? [{
                  targetType: reportFolderShareType,
                  targetId: reportFolderShareTarget,
                  accessLevel: reportFolderShareLevel
                }] : [],
                visibility: newReportFolderVisibility
              }).then((folder) => {
                updateReport({ folderId: folder.id, folderName: folder.label });
                setNewReportFolderLabel('');
                setReportFolderShareTarget('');
                setResult(null);
              }).catch((error) => {
                setError(error instanceof Error ? error.message : String(error));
              });
            }}><Plus size={14} />Create folder</button>
          </div>}
        </div>}
        {current && !runPage && builderTab === 'Outline' && <div className="report-panel-block">
          <h3>SORT ROWS</h3>
          <label className="form-label" htmlFor="report-sort-field">Sort field</label>
          <select id="report-sort-field" className="form-control" value={current.sortFieldApiName ?? ''}
            onChange={(event) => { updateReport({ sortFieldApiName: event.target.value || null }); setResult(null); }}>
            <option value="">Default order</option>
            {[...new Set([...current.fieldApiNames, ...current.groupByFieldApiNames, ...(current.columnGroupByFieldApiName ? [current.columnGroupByFieldApiName] : [])])].map((fieldApiName) => (
              <option key={fieldApiName} value={fieldApiName}>{reportFieldLabel(fieldApiName)}</option>
            ))}
          </select>
          <label className="form-label" htmlFor="report-sort-direction">Direction</label>
          <select id="report-sort-direction" className="form-control" disabled={!current.sortFieldApiName}
            value={current.sortDirection ?? 'Ascending'}
            onChange={(event) => { updateReport({ sortDirection: event.target.value as ReportMetadata['sortDirection'] }); setResult(null); }}>
            <option value="Ascending">Ascending</option><option value="Descending">Descending</option>
          </select>
        </div>}
        {current && !runPage && builderTab === 'Filters' && <div className="report-panel-block" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleFieldDrop(event, 'filter')}>
          <h3>FILTERS <button className="icon-button" aria-label="Add report filter" onClick={() => addFilter()}><Plus size={14} /></button></h3>
          <div className="mini-search"><Search size={13} /><input aria-label="Search fields to add as filters" placeholder="Search fields to add a filter" value={filterFieldQuery} onChange={(event) => setFilterFieldQuery(event.target.value)} /></div>
          {filterFieldQuery.trim() && filterFields.map((field) => <button className="outline-field" key={field.apiName} onClick={() => {
            addFilter(field.apiName);
            setFilterFieldQuery('');
          }}><Plus size={13} />{field.label}</button>)}
          <label className="form-label" htmlFor="report-show-me">Show Me</label>
          <select id="report-show-me" className="form-control" value={current.standardFilters.showMe}
            onChange={(event) => { updateReport({ standardFilters: { ...current.standardFilters, showMe: event.target.value as 'All' | 'My' } }); setResult(null); }}>
            <option value="All">All {reportObject?.pluralLabel ?? 'records'}</option>
            <option value="My" disabled={!reportObject?.fields.some((field) => field.apiName === 'OwnerId')}>My {reportObject?.pluralLabel ?? 'records'}</option>
          </select>
          {reportStatusFields.length > 0 && <>
            <label className="form-label" htmlFor="report-status-field">Status field</label>
            <select id="report-status-field" className="form-control" value={current.standardFilters.statusFieldApiName ?? ''}
              onChange={(event) => { updateReport({ standardFilters: { ...current.standardFilters, statusFieldApiName: event.target.value || null, statusSelection: event.target.value ? current.standardFilters.statusSelection : 'All' } }); setResult(null); }}>
              <option value="">No status filter</option>
              {reportStatusFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
            </select>
            {current.standardFilters.statusFieldApiName && <select aria-label={`${reportObject?.fields.find((field) => field.apiName === current.standardFilters.statusFieldApiName)?.label ?? 'Status'} filter`}
              className="form-control" value={current.standardFilters.statusSelection}
              onChange={(event) => { updateReport({ standardFilters: { ...current.standardFilters, statusSelection: event.target.value as ReportStandardFiltersMetadata['statusSelection'] } }); setResult(null); }}>
              <option value="All">All statuses</option><option value="Open">Open</option><option value="Closed">Closed</option>
              {reportObject?.fields.find((field) => field.apiName === current.standardFilters.statusFieldApiName)?.picklistValues
                ?.filter((value) => !['All', 'Open', 'Closed'].includes(value))
                .map((value) => <option key={value} value={value}>{value}</option>)}
            </select>}
          </>}
          <label className="form-label" htmlFor="report-date-field">Date field</label>
          <select id="report-date-field" className="form-control" value={current.standardFilters.dateFieldApiName ?? ''}
            onChange={(event) => { updateReport({ standardFilters: { ...current.standardFilters, dateFieldApiName: event.target.value || null, dateRange: event.target.value ? current.standardFilters.dateRange : 'All Time' } }); setResult(null); }}>
            <option value="">No date filter</option>
            {reportDateFields.map((field) => <option key={field.apiName} value={field.apiName}>
              {reportObject?.apiName === 'Case' && field.apiName === 'CreatedDate' ? 'Opened Date' : field.label}
            </option>)}
          </select>
          <label className="form-label" htmlFor="report-date-range">Date range</label>
          <select id="report-date-range" className="form-control"
            value={current.standardFilters.dateFieldApiName ? current.standardFilters.dateRange : 'All Time'}
            onChange={(event) => {
              const dateRange = event.target.value as ReportDateRange;
              updateReport({ standardFilters: {
                ...current.standardFilters,
                dateFieldApiName: current.standardFilters.dateFieldApiName ?? reportDateFields[0]?.apiName ?? null,
                dateRange
              } });
              setResult(null);
            }}>
            {(['All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Next 7 Days', 'Next 30 Days', 'This Week', 'Last Week', 'This Month', 'Last Month', 'This Quarter', 'Last Quarter', 'This Year', 'Last Year'] as ReportDateRange[]).map((range) =>
              <option key={range} value={range}>{range}</option>)}
          </select>
          {current.filters.length > 0 && <>
            <label className="form-label" htmlFor="report-filter-logic">Filter logic</label>
            <input id="report-filter-logic" className="form-control" aria-describedby="report-filter-logic-help"
              value={current.filterLogic} onChange={(event) => { updateReport({ filterLogic: event.target.value }); setResult(null); }} />
            <p className="dashboard-sidebar-empty" id="report-filter-logic-help">Use filter numbers with AND, OR, NOT, and parentheses; for example: (1 OR 2) AND NOT 3.</p>
          </>}
          {current.filters.map((filter, index) => <div className="report-filter-editor" key={filter.id}>
            <span className="report-filter-number">{index + 1}.</span>
            <select aria-label="Report filter field" value={filter.fieldApiName} onChange={(event) => {
              const fieldApiName = event.target.value;
              updateFilter(filter.id, {
                fieldApiName,
                operator: reportObject?.fields.find((field) => field.apiName === fieldApiName)?.dataType === 'Multi-Select Picklist' ? 'Includes' : 'Equals',
                value: '',
                values: []
              });
            }}>
              {reportObject?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
            </select>
            <select aria-label="Report filter operator" value={filter.operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value as ReportFilterMetadata['operator'] })}>
              {operatorsForField(filter.fieldApiName).map((operator) => <option key={operator}>{operator}</option>)}
            </select>
            {reportFilterValueControl(filter.fieldApiName, filter.value,
              (value) => updateFilter(filter.id, { value }), 'Report filter value',
              filter.operator === 'Is Null' || filter.operator === 'Is Not Null',
              undefined,
              filter.values.length ? filter.values : filter.value ? [filter.value] : [],
              (values) => updateFilter(filter.id, { value: '', values }))}
            <label className="checkbox-row report-filter-lock"><input type="checkbox" checked={filter.locked} onChange={(event) => updateFilter(filter.id, { locked: event.target.checked })} />Locked</label>
            <button className="icon-button" aria-label="Remove report filter" onClick={() => updateReport({ filters: current.filters.filter((item) => item.id !== filter.id), filterLogic: 'All' })}><X size={13} /></button>
          </div>)}
          {!current.filters.length && <p className="dashboard-sidebar-empty">No filters applied.</p>}
          {current.crossFilters.map((crossFilter) => {
            const childObject = objects.find((item) => item.apiName === crossFilter.childObjectApiName);
            return <div className="report-cross-filter" key={crossFilter.id}>
              <div className="report-cross-filter-heading">
                <strong>Cross filter</strong>
                <button className="icon-button" aria-label="Remove cross filter" onClick={() => updateReport({ crossFilters: current.crossFilters.filter((item) => item.id !== crossFilter.id) })}><X size={13} /></button>
              </div>
              <div className="report-filter-editor">
                <select aria-label="Cross-filter mode" value={crossFilter.mode} onChange={(event) => updateCrossFilter(crossFilter.id, { mode: event.target.value as 'With' | 'Without' })}>
                  <option value="With">with</option><option value="Without">without</option>
                </select>
                <select aria-label="Cross-filter child object" value={crossFilter.childObjectApiName} onChange={(event) => updateCrossFilter(crossFilter.id, { childObjectApiName: event.target.value, filters: [] })}>
                  {relatedChildObjects.map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}
                </select>
              </div>
              {crossFilter.filters.map((filter) => <div className="report-filter-editor report-cross-subfilter" key={filter.id}>
                <select aria-label="Cross-filter field" value={filter.fieldApiName} onChange={(event) => {
                  const fieldApiName = event.target.value;
                  const multiSelect = childObject?.fields.find((field) => field.apiName === fieldApiName)?.dataType === 'Multi-Select Picklist';
                  updateCrossFilter(crossFilter.id, { filters: crossFilter.filters.map((item) => item.id === filter.id
                    ? { ...item, fieldApiName, operator: multiSelect ? 'Includes' : 'Equals', value: '', values: [] }
                    : item) });
                }}>
                  {childObject?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
                </select>
                <select aria-label="Cross-filter operator" value={filter.operator} onChange={(event) => updateCrossFilter(crossFilter.id, { filters: crossFilter.filters.map((item) => item.id === filter.id ? { ...item, operator: event.target.value as ReportFilterMetadata['operator'] } : item) })}>
                  {operatorsForField(filter.fieldApiName, childObject?.fields ?? []).map((operator) => <option key={operator}>{operator}</option>)}
                </select>
                {reportFilterValueControl(filter.fieldApiName, filter.value,
                  (value) => updateCrossFilter(crossFilter.id, { filters: crossFilter.filters.map((item) => item.id === filter.id ? { ...item, value } : item) }),
                  'Cross-filter value', filter.operator === 'Is Null' || filter.operator === 'Is Not Null', childObject?.fields ?? [],
                  filter.values.length ? filter.values : filter.value ? [filter.value] : [],
                  (values) => updateCrossFilter(crossFilter.id, { filters: crossFilter.filters.map((item) => item.id === filter.id ? { ...item, value: '', values } : item) }))}
                <button className="icon-button" aria-label="Remove cross-filter condition" onClick={() => updateCrossFilter(crossFilter.id, { filters: crossFilter.filters.filter((item) => item.id !== filter.id) })}><X size={13} /></button>
              </div>)}
              <button className="outline-add" disabled={!childObject} onClick={() => addCrossSubfilter(crossFilter)}><Plus size={12} />Add {childObject?.label ?? 'child'} filter</button>
            </div>;
          })}
          <button className="outline-add" disabled={!relatedChildObjects.length} onClick={addCrossFilter}><Plus size={12} />Add Cross Filter</button>
          <hr />
          <h3>ROW LIMIT</h3>
          <label className="form-label" htmlFor="report-row-limit">Maximum rows (tabular)</label>
          <input id="report-row-limit" className="form-control" type="number" min="1"
            disabled={current.format !== 'Tabular'}
            value={current.rowLimit.limit ?? ''}
            onChange={(event) => {
              const limit = event.target.value ? Number(event.target.value) : null;
              updateReport({ rowLimit: { ...current.rowLimit, limit, sortFieldApiName: limit === null ? null : current.rowLimit.sortFieldApiName ?? current.fieldApiNames[0] ?? null } });
              setResult(null);
            }} />
          {current.rowLimit.limit !== null && <>
            <label className="form-label" htmlFor="report-row-limit-sort">Sort by</label>
            <select id="report-row-limit-sort" className="form-control" value={current.rowLimit.sortFieldApiName ?? ''}
              onChange={(event) => { updateReport({ rowLimit: { ...current.rowLimit, sortFieldApiName: event.target.value || null } }); setResult(null); }}>
              {current.fieldApiNames.map((fieldApiName) => <option key={fieldApiName} value={fieldApiName}>{reportFieldLabel(fieldApiName)}</option>)}
            </select>
            <select className="form-control" aria-label="Row limit sort direction" value={current.rowLimit.sortDirection}
              onChange={(event) => { updateReport({ rowLimit: { ...current.rowLimit, sortDirection: event.target.value as 'Ascending' | 'Descending' } }); setResult(null); }}>
              <option value="Ascending">Ascending</option><option value="Descending">Descending</option>
            </select>
          </>}
        </div>}
      </aside>
      {current && fieldsPanelOpen && !runPage && <aside className="report-fields-panel">
        <div className="report-panel-block">
          <h3>FIELDS <button className="icon-button" aria-label="Close fields panel" onClick={() => setFieldsPanelOpen(false)}><X size={13} /></button></h3>
          <div className="mini-search"><Search size={13} /><input aria-label="Search fields" placeholder="Search fields" value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} /></div>
          {searchableFields.map((field) => <button className="outline-field" key={field.apiName} draggable
            onDragStart={(event) => event.dataTransfer.setData('text/report-field', field.apiName)}
            onClick={() => toggleField(field.apiName, !current.fieldApiNames.includes(field.apiName))}>
            <span>{current.fieldApiNames.includes(field.apiName) ? '✓' : '+'}</span>{field.label}
          </button>)}
          {!searchableFields.length && <p className="dashboard-sidebar-empty">No matching fields.</p>}
        </div>
      </aside>}
      <div className="report-preview" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleFieldDrop(event, 'column')}>
        {!current ? <div className="dashboard-empty-state"><h2>Create a report to get started</h2><p>Choose an object, select columns, and run it against records you can access.</p><button className="btn btn-brand" onClick={openReportTypeSelector}><Plus size={14} />New Report</button></div> : <>
          <div className="report-toolbar">{!runPage && <div className="report-type-select"><span>Report source</span><select aria-label="Report object" value={current.objectApiName} onChange={(event) => changeObject(event.target.value)}>
            {availableObjects.map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}
          </select><button className="btn" onClick={() => { setFieldsPanelOpen((open) => !open); setFieldQuery(''); }}>{fieldsPanelOpen ? 'Hide Fields' : 'Show Fields'}</button>
            <button className="btn" disabled={busy || previewBusy} onClick={() => void refreshPreview(0)}><RefreshCw size={14} />{previewBusy ? 'Refreshing…' : 'Refresh Preview'}</button>
            <label className="checkbox-row"><input type="checkbox" checked={autoPreview} onChange={(event) => setAutoPreview(event.target.checked)} />Automatic Preview</label>
          </div>}<span>{result ? `${runPage ? 'Last run' : 'Preview updated'} ${new Date(result.generatedAt).toLocaleString()}` : 'Preview not refreshed'}</span></div>
          {!runPage && <>
            <div className="report-results-header"><label className="form-label" htmlFor="report-name">Report name</label><input id="report-name" className="form-control" maxLength={80} value={current.label} onChange={(event) => updateReport({ label: event.target.value })} /></div>
            <label className="form-label" htmlFor="report-description">Description</label>
            <textarea id="report-description" className="form-control" rows={2} maxLength={500} value={current.description} onChange={(event) => updateReport({ description: event.target.value })} />
          </>}
          {current.filters.length > 0 && <section className="report-run-filters" aria-label="Report run filters">
            <h2>Filter values for this run</h2>
            {current.filters.map((filter) => <label className="report-run-filter" key={filter.id}>
              <span>{reportObject?.fields.find((field) => field.apiName === filter.fieldApiName)?.label ?? filter.fieldApiName} · {filter.operator}{filter.locked ? ' · Locked' : ''}</span>
              {reportFilterValueControl(filter.fieldApiName, runFilterValues[filter.id] ?? filter.value,
                (value) => setRunFilterValues((values) => ({ ...values, [filter.id]: value })),
                `Run value for ${filter.fieldApiName}`, filter.locked || filter.operator === 'Is Null' || filter.operator === 'Is Not Null',
                undefined,
                runFilterSelections[filter.id] ?? (filter.values.length ? filter.values : filter.value ? [filter.value] : []),
                (values) => {
                  setRunFilterSelections((selections) => ({ ...selections, [filter.id]: values }));
                  setRunFilterValues((runValues) => ({ ...runValues, [filter.id]: '' }));
                })}
            </label>)}
          </section>}
          {result && <div className="report-results-header"><strong>{reportObject?.label ?? current.objectApiName} Records · {result.totalRows.toLocaleString()} rows</strong></div>}
          {result && (result.report.format === 'Matrix' || result.report.groupByFieldApiNames.length > 0 || summaryFields.length > 0) && <section className="report-summary">
            <h2>Summary</h2>
            {result.report.showChart && <div className="report-format-chart" role="img" aria-label={`${result.report.label} summary chart`}>
              {chartBars.length
                ? chartBars.map((bar, index) => <div className="report-format-chart-bar" key={`${bar.label}-${index}`}>
                  <span>{bar.label}</span><i style={{ width: `${Math.max(1, Math.abs(bar.value) / chartMaximum * 100)}%` }} />
                  <strong>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(bar.value)}</strong>
                </div>)
                : <p className="dashboard-no-data">No grouped results to chart.</p>}
            </div>}
            {result.subtotalRows.length > 0 && <section className="report-subtotals">
              <h3>Group Subtotals</h3>
              <div className="permission-table-wrap"><table className="slds-table report-results">
                <thead><tr>
                  {result.report.groupByFieldApiNames.map((fieldApiName) => (
                    <th key={fieldApiName}>{reportFieldLabel(fieldApiName)}</th>
                  ))}
                  {result.report.format === 'Matrix' && result.report.columnGroupByFieldApiName && (
                    <th>{reportObject?.fields.find((field) => field.apiName === result.report.columnGroupByFieldApiName)?.label ?? result.report.columnGroupByFieldApiName}</th>
                  )}
                  <th>Record Count</th>
                  {summarySpecs.map(({ fieldApiName, operation }) => (
                    <th key={`${fieldApiName}-${operation}`}>{operation} of {reportFieldLabel(fieldApiName)}</th>
                  ))}
                </tr></thead>
                <tbody>{result.subtotalRows.map((subtotal) => <tr key={`${subtotal.groupLevel}-${JSON.stringify(subtotal.groupValues)}`}>
                  {result.report.groupByFieldApiNames.map((fieldApiName, index) => (
                    <td key={fieldApiName}>{index === subtotal.groupLevel - 1
                      ? `${reportFieldLabel(fieldApiName)} subtotal`
                      : index < subtotal.groupLevel
                        ? groupedValueLabel(fieldApiName, subtotal.groupValues[fieldApiName])
                        : ''}</td>
                  ))}
                  {result.report.format === 'Matrix' && result.report.columnGroupByFieldApiName && (
                    <td>{groupedValueLabel(result.report.columnGroupByFieldApiName, subtotal.groupValues[result.report.columnGroupByFieldApiName])}</td>
                  )}
                  <td>{subtotal.rowCount.toLocaleString()}</td>
                  {summarySpecs.map(({ fieldApiName, operation }) => (
                    <td key={`${fieldApiName}-${operation}`}>{formatSummaryValue(subtotal, fieldApiName, operation)}</td>
                  ))}
                </tr>)}</tbody>
              </table></div>
            </section>}
            {result.report.format === 'Matrix' && matrixColumnField
              ? <div className="permission-table-wrap"><table className="slds-table report-results">
                <thead><tr>
                  {result.report.groupByFieldApiNames.map((fieldApiName) => <th key={fieldApiName}>{reportFieldLabel(fieldApiName)}</th>)}
                  {matrixColumns.flatMap((columnValue) => [
                    <th key={`${String(columnValue)}-count`}>{groupedValueLabel(matrixColumnField, columnValue)} · Count</th>,
                    ...summarySpecs.map(({ fieldApiName, operation }) => <th key={`${String(columnValue)}-${fieldApiName}-${operation}`}>
                      {groupedValueLabel(matrixColumnField, columnValue)} · {operation} {reportFieldLabel(fieldApiName)}
                    </th>)
                  ])}
                </tr></thead>
                <tbody>{[...new Map(result.summaryRows.map((group) => [matrixRowKey(group.groupValues), group])).values()].map((group) =>
                  <tr key={matrixRowKey(group.groupValues)}>
                    {result.report.groupByFieldApiNames.map((fieldApiName) => <td key={fieldApiName}>{groupedValueLabel(fieldApiName, group.groupValues[fieldApiName])}</td>)}
                    {matrixColumns.flatMap((columnValue) => {
                      const cell = matrixGroupFor(group.groupValues, columnValue);
                      return [
                        <td key={`${String(columnValue)}-count`}>{cell?.rowCount.toLocaleString() ?? '0'}</td>,
                        ...summarySpecs.map(({ fieldApiName, operation }) => <td key={`${String(columnValue)}-${fieldApiName}-${operation}`}>
                          {cell ? formatSummaryValue(cell, fieldApiName, operation) : '—'}
                        </td>)
                      ];
                    })}
                  </tr>)}</tbody>
                <tfoot><tr><td colSpan={result.report.groupByFieldApiNames.length}>Grand Total</td>
                  {matrixColumns.flatMap((columnValue) => {
                    const cells = result.summaryRows.filter((group) => group.groupValues[matrixColumnField] === columnValue);
                    return [
                      <td key={`${String(columnValue)}-count`}>{cells.reduce((total, cell) => total + cell.rowCount, 0).toLocaleString()}</td>,
                      ...summarySpecs.map(({ fieldApiName, operation }) => <td key={`${String(columnValue)}-${fieldApiName}-${operation}`}>
                        {formatSummaryValue(combineNumericSummaries(cells, summaryFields), fieldApiName, operation)}
                      </td>)
                    ];
                  })}
                </tr></tfoot>
              </table></div>
              : <div className="permission-table-wrap"><table className="slds-table report-results">
              <thead><tr>
                {result.report.groupByFieldApiNames.map((fieldApiName) => <th key={fieldApiName}>{reportFieldLabel(fieldApiName)}</th>)}
                <th>Record Count</th>
                {summarySpecs.map(({ fieldApiName, operation }) => (
                  <th key={`${fieldApiName}-${operation}`}>{operation} of {reportFieldLabel(fieldApiName)}</th>
                ))}
              </tr></thead>
              <tbody>{result.summaryRows.map((group) => <tr key={JSON.stringify(group.groupValues)}>
                {result.report.groupByFieldApiNames.map((fieldApiName) => <td key={fieldApiName}>{groupedValueLabel(fieldApiName, group.groupValues[fieldApiName])}</td>)}
                <td>{group.rowCount.toLocaleString()}</td>
                {summarySpecs.map(({ fieldApiName, operation }) => (
                  <td key={`${fieldApiName}-${operation}`}>{formatSummaryValue(group, fieldApiName, operation)}</td>
                ))}
              </tr>)}</tbody>
              <tfoot><tr>
                {result.report.groupByFieldApiNames.length > 0 && <td colSpan={result.report.groupByFieldApiNames.length}>Grand Total</td>}
                <td>{result.summaryTotals.rowCount.toLocaleString()}</td>
                {summarySpecs.map(({ fieldApiName, operation }) => (
                  <td key={`${fieldApiName}-${operation}`}>{formatSummaryValue(result.summaryTotals, fieldApiName, operation)}</td>
                ))}
              </tr></tfoot>
            </table></div>}
          </section>}
          {result && result.report.showDetails && <div className="permission-table-wrap"><table className="slds-table report-results"><thead><tr>{result.report.fieldApiNames.map((fieldApiName) => <th key={fieldApiName}>{reportFieldLabel(fieldApiName)}</th>)}</tr></thead>
            <tbody>{result.rows.map((row, index) => <tr key={String(row.Id ?? index)}>{result.report.fieldApiNames.map((fieldApiName) => <td key={fieldApiName}>{row[fieldApiName] === null || row[fieldApiName] === undefined ? '—' : String(row[fieldApiName])}</td>)}</tr>)}</tbody>
          </table>{!result.rows.length && <p className="dashboard-no-data">No records match this report.</p>}
            <div className="report-footer"><span>Showing {result.totalRows ? result.offset + 1 : 0}–{result.offset + result.rows.length} of {result.totalRows.toLocaleString()} records</span><span><button className="icon-button subtle" aria-label="Previous report page" disabled={busy || previewBusy || result.offset === 0} onClick={() => void (runPage ? run(Math.max(0, pageOffset - result.pageSize)) : refreshPreview(Math.max(0, pageOffset - result.pageSize)))}><ChevronLeft size={14} /></button><button className="icon-button subtle" aria-label="Next report page" disabled={busy || previewBusy || !result.truncated} onClick={() => void (runPage ? run(pageOffset + result.pageSize) : refreshPreview(pageOffset + result.pageSize))}><ChevronRight size={14} /></button></span></div>
          </div>}
          {current.groupByFieldApiNames.length > 0 && <div className="report-footer">Grouped by {current.groupByFieldApiNames.map(reportFieldLabel).join(', ')}</div>}
        </>}
      </div>
    </div>
    {reportTypeSelectorOpen && <div className="report-type-modal-backdrop" role="presentation">
      <section className="report-type-modal" role="dialog" aria-modal="true" aria-labelledby="report-type-title">
        <div className="report-type-modal-heading"><h2 id="report-type-title">New Report</h2><button className="icon-button" aria-label="Close report type chooser" onClick={() => setReportTypeSelectorOpen(false)}><X size={15} /></button></div>
        <p>Select a report type to start building your report.</p>
        <label className="form-label" htmlFor="report-type-search">Search report types</label>
        <div className="mini-search"><Search size={13} /><input id="report-type-search" placeholder="Search report types, objects, or fields" value={reportTypeQuery} onChange={(event) => setReportTypeQuery(event.target.value)} /></div>
        <div className="report-type-categories" role="group" aria-label="Report type category">
          {(['All', ...reportTypeCategories]).map((category) => <button key={category}
            className={reportTypeCategory === category ? 'active' : ''}
            onClick={() => setReportTypeCategory(category)}>{category === 'All' ? 'All Categories' : category}</button>)}
        </div>
        <div className="report-type-options">
          {searchableReportObjects.map((object) => <label className="report-type-option" key={object.apiName}>
            <input type="radio" name="report-type" value={object.apiName} checked={selectedReportObjectApiName === object.apiName} onChange={() => setSelectedReportObjectApiName(object.apiName)} />
            <span><strong>{object.label}</strong><small>{reportTypeCategoryForObject(object)} · {object.fields.length} fields</small></span>
          </label>)}
          {!searchableReportObjects.length && <p className="dashboard-sidebar-empty">No report types match your search.</p>}
        </div>
        <div className="report-type-modal-actions">
          <button className="btn" onClick={() => setReportTypeSelectorOpen(false)}>Cancel</button>
          <button className="btn btn-brand" disabled={!selectedReportObjectApiName || !searchableReportObjects.some((object) => object.apiName === selectedReportObjectApiName)}
            onClick={() => createReport(selectedReportObjectApiName)}>Start Report</button>
        </div>
      </section>
    </div>}
  </div>;
}

function Permissions({
  accessControl,
  accessControlError,
  objects,
  routeResourceApiName,
  routeResourceId,
  onRouteResourceChange,
  onSave,
  onNotify
}: {
  accessControl: AccessControlMetadata;
  accessControlError: string;
  objects: ObjectMetadata[];
  routeResourceApiName?: string;
  routeResourceId?: string;
  onRouteResourceChange: (resourceApiName: string, resourceId?: string) => void;
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
          <div className="section-toolbar"><div><h2>User Assignments</h2><p>Direct permission-set and permission-set-group memberships for this tenant.</p></div></div>
          {draft.users.map((user) => <details className="permission-user-card" key={user.id}><summary><strong>{user.name}</strong><span>{user.username}</span><span>{draft.roles.find((role) => role.id === user.roleId)?.name ?? user.role}</span></summary><label className="form-label">Role<select className="form-control" value={user.roleId} onChange={(event) => patchUser(user.id, { roleId: event.target.value, role: draft.roles.find((role) => role.id === event.target.value)?.name ?? user.role })}>{draft.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="form-label">Profile<select className="form-control" value={user.profileId} onChange={(event) => patchUser(user.id, { profileId: event.target.value })}>{draft.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.license}</option>)}</select></label><label className="form-label">Time Zone (IANA)<input className="form-control" value={user.timeZone} onChange={(event) => patchUser(user.id, { timeZone: event.target.value })} placeholder="America/Los_Angeles" /></label><label className="form-label">Locale (BCP 47)<input className="form-control" value={user.locale} onChange={(event) => patchUser(user.id, { locale: event.target.value })} placeholder="en-US" /></label><label className="form-label">Currency (ISO 4217)<input className="form-control" value={user.currencyIsoCode ?? ''} onChange={(event) => patchUser(user.id, { currencyIsoCode: event.target.value.toUpperCase() || undefined })} placeholder="USD" /></label><h3 className="permission-section-heading">Permission Sets</h3><div className="permission-check-grid">{draft.permissionSets.map((permissionSet) => <label className="checkbox-row" key={permissionSet.id}><input type="checkbox" checked={user.permissionSetIds.includes(permissionSet.id)} onChange={() => patchUser(user.id, { permissionSetIds: toggleString(user.permissionSetIds, permissionSet.id) })} />{permissionSet.label}</label>)}</div><h3 className="permission-section-heading">Permission Set Groups</h3><div className="permission-check-grid">{draft.permissionSetGroups.map((group) => <label className="checkbox-row" key={group.id}><input type="checkbox" checked={user.permissionSetGroupIds.includes(group.id)} onChange={() => patchUser(user.id, { permissionSetGroupIds: toggleString(user.permissionSetGroupIds, group.id) })} />{group.label}</label>)}</div></details>)}
        </>}
        {tab === 'profiles' && !selectedProfile && <div className="empty-state">Select a profile or create one to get started.</div>}
        {tab === 'sets' && !selectedSet && <div className="empty-state">Select a permission set or create one to get started.</div>}
        {tab === 'groups' && !selectedGroup && <div className="empty-state">Select a permission set group or create one to get started.</div>}
      </div>
    </section>
    <div className="permission-info"><ShieldCheck size={17} /><span>Tenant-scoped grants are evaluated by the API. Permission-set groups combine their member grants and can mute group-contributed system and object permissions; direct assignments are unaffected by group muting.</span></div>
  </div>;
}

export default App;
